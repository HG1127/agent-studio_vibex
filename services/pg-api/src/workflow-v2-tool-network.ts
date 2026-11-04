// Private tool egress. Trusted DB configuration + sealed arguments only.
// Public DNS is validated and pinned on every dial. No proxy or POST replay.
import {request as httpsRequest,type RequestOptions} from "node:https"
import {request as httpRequest,type ClientRequest,type IncomingMessage} from "node:http"
import {resolve4,resolve6} from "node:dns/promises"
import {resolveSafeProviderAddress,type ProviderResolver} from "./model-connection-probe.ts"
import {safeToolDestination,applyWorkflowToolTemplate,type ToolArguments} from "./workflow-v2-tool-plan.ts"
import {WorkflowKnownEffectFailure} from "./workflow-v2-effect-failure.ts"
import {parseLocalTransportJson} from '../../../shared/native-local-device-contract.mjs'
export type WorkflowToolHttpMaterial={url:string;method:"GET"|"POST";body_template:string;timeout_s:number;headers:{key:string;value:string}[]}
export type WorkflowToolHttpRequest={url:string;method:"GET"|"POST";body:Buffer;headers:Record<string,string>;timeout:number;secrets:string[]}
// Request-local authority recheck: never stored on the shared network factory.
export type WorkflowToolBeforeDial=()=>Promise<void>
type Requester=(options:RequestOptions,callback:(response:IncomingMessage)=>void)=>ClientRequest
const forbidden=/^(?:host|connection|content-length|transfer-encoding|trailer|te|upgrade|expect|accept-encoding|proxy-.*|x-forwarded-.*|forwarded|x-rh-user-id)$/i
export function prepareWorkflowToolHttp(material:WorkflowToolHttpMaterial,args:ToolArguments):WorkflowToolHttpRequest{
  const original=safeToolDestination(material.url)
  if((material.method!=="GET"&&material.method!=="POST")||!Number.isSafeInteger(material.timeout_s)||
     material.timeout_s<1||material.timeout_s>60||typeof material.body_template!=="string"||material.body_template.length>20000||
     !Array.isArray(material.headers)||material.headers.length>20)throw new WorkflowKnownEffectFailure("workflow_tool_input_invalid")
  // URL() percent-encodes path braces on storage. Decode only the bounded
  // placeholder grammar, never arbitrary escapes or an origin component.
  const path=(original.pathname+original.search).replace(/%7B%7B([a-zA-Z0-9_一-龥]+)%7D%7D/gi,"{{$1}}")
  const expanded=applyWorkflowToolTemplate(path,args)
  const destination=safeToolDestination(original.origin+expanded)
  if(destination.origin!==original.origin)throw new WorkflowKnownEffectFailure("workflow_tool_input_invalid")
  const headers:Record<string,string>={"user-agent":"agentstudio-pg18-private-tool/1",accept:"application/json, text/plain, text/html","accept-encoding":"identity"}
  const secrets:string[]=[]
  for(const header of material.headers){
    if(!header||typeof header.key!=="string"||!/^[-!#$%&'*+.^_`|~0-9A-Za-z]{1,80}$/.test(header.key)||
       typeof header.value!=="string"||header.value.length>2048||/[\u0000-\u001f\u007f]/.test(header.value)||forbidden.test(header.key))
      throw new WorkflowKnownEffectFailure("workflow_tool_input_invalid")
    const name=header.key.toLowerCase()
    if(Object.hasOwn(headers,name)&&!["accept","content-type","user-agent"].includes(name))throw new WorkflowKnownEffectFailure("workflow_tool_input_invalid")
    headers[name]=header.value
    if(header.value){secrets.push(header.value);const token=/^(?:Bearer|Basic)\s+(.+)$/i.exec(header.value)?.[1];if(token)secrets.push(token)}
  }
  const body=Buffer.from(material.method==="GET"?"":material.body_template?applyWorkflowToolTemplate(material.body_template,args):JSON.stringify(args),"utf8")
  if(body.length>65536)throw new WorkflowKnownEffectFailure("workflow_tool_input_invalid")
  if(material.method==="POST"){headers["content-type"]??="application/json";headers["content-length"]=String(body.length)}
  return {url:destination.toString(),method:material.method,body,headers,timeout:Math.min(material.timeout_s*1000,24000),secrets}
}
export function redactWorkflowToolResponse(text:string,secrets:readonly string[]):string{
  let output=text
  const variants=new Set<string>()
  for(const secret of secrets)if(secret){variants.add(secret);variants.add(encodeURIComponent(secret));variants.add(JSON.stringify(secret).slice(1,-1))}
  // One pass: replacement markers must not be repeatedly expanded when short
  // secret values happen to contain characters from "[redacted]".
  const patterns=[...variants].sort((a,b)=>b.length-a.length).map(value=>value.replace(/[.*+?^${}()|[\]\\]/g,"\\$&"))
  if(patterns.length)output=output.replace(new RegExp(patterns.join("|"),"g"),"[redacted]")
  return output.replace(/([?&](?:api[_-]?key|key|token|secret|password|access[_-]?key)=)[^&\s"']+/gi,"$1[redacted]").replace(/\0/g,"")
}
export function htmlToolText(input:string):string{
  return input.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi," ").replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi," ")
    .replace(/<!--[\s\S]*?-->/g," ").replace(/<(?:br|\/p|\/div|\/li|\/h[1-6]|\/tr)\b[^>]*>/gi,"\n").replace(/<[^>]+>/g," ")
    .replace(/&(?:nbsp|amp|lt|gt|quot|#x27|#39);/gi,value=>({"&nbsp;":" ","&amp;":"&","&lt;":"<","&gt;":">","&quot;":'"',"&#x27;":"'","&#39;":"'"}[value.toLowerCase()]??" "))
    .replace(/[ \t\r]+/g," ").replace(/\n\s*\n+/g,"\n").replace(/\0/g,"").trim()
}
export function parseWorkflowSearchHtml(html:string,limit:number):string{
  // This is bounded provider data after a POST. Refusals remain uncertain
  // outcomes, never known-before-dispatch failures or automatic retry signals.
  if(typeof html!=="string"||html.length>131072||Buffer.byteLength(html,"utf8")>131072||!Number.isSafeInteger(limit)||limit<1||limit>10)throw Error("workflow_tool_search_response_unrecognized")
  const document=html.replace(/<!--[\s\S]*?-->/g," ").replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi," ").replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi," ")
  function attribute(source:string,name:string):string|undefined{
    let found:string|undefined,consumed=0
    // Tokenize every attribute, so quoted values of unrelated attributes do
    // not create a false href. Undefined means absent; "" means present-empty.
    for(const match of source.matchAll(/(?:^|\s)([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'<>`]+)))?/g)){
      // The outer bounded tag matcher stops at >, including inside quotes.
      // Require complete attribute tokens; an unparsed fragment is not absence.
      if(source.slice(consumed,match.index!).trim())throw Error("workflow_tool_search_response_inconsistent")
      consumed=match.index!+match[0].length
      if(match[1]!.toLowerCase()===name){
        if(found!==undefined)throw Error("workflow_tool_search_response_inconsistent")
        found=match[2]??match[3]??match[4]??""
      }
    }
    if(!/^\s*\/?\s*$/.test(source.slice(consumed)))throw Error("workflow_tool_search_response_inconsistent")
    return found
  }
  function destination(href:string):URL{
    if(!href||href.length>6000||href!==href.trim()||/[\u0000-\u0020\u007f\\]/.test(href))throw Error("workflow_tool_search_citation_invalid")
    const parsed=safeToolDestination(new URL(href.replace(/&amp;/gi,"&"),"https://html.duckduckgo.com").toString(),["http:","https:"])
    const wrapper=(value:URL)=>["duckduckgo.com","www.duckduckgo.com","html.duckduckgo.com"].includes(value.hostname)&&value.pathname==="/l/"
    if(!wrapper(parsed))return parsed
    const targets=parsed.searchParams.getAll("uddg")
    if(targets.length!==1||!targets[0]||!/^https?:\/\//i.test(targets[0]))throw Error("workflow_tool_search_citation_invalid")
    const target=safeToolDestination(targets[0],["http:","https:"])
    if(wrapper(target))throw Error("workflow_tool_search_citation_invalid")
    return target
  }
  const classes=(source:string)=>(attribute(source,"class")??"").split(/\s+/)
  const blocks:{start:number;end:number}[]=[],boundaries:number[]=[],stack:{start:number;result:boolean}[]=[]
  let noResults=false,challenge=false
  for(const tag of document.matchAll(/<\/?([a-z][a-z0-9:-]*)\b([^>]*)>/gi)){
    const closing=tag[0].startsWith("</"),name=tag[1]!.toLowerCase(),attributes=tag[2]??"",tokens=classes(attributes),id=attribute(attributes,"id")??""
    if(!closing){
      if(tokens.some(value=>["no-results","no-results__message"].includes(value))||id==="no-results")noResults=true
      if(tokens.some(value=>["anomaly-modal","anomaly-modal__modal","g-recaptcha","h-captcha","cf-challenge"].includes(value))||/^(?:challenge-form|anomaly-form|cf-challenge(?:-.*)?)$/i.test(id)||name==="form"&&/(?:^|\/)anomaly\.js(?:[?#]|$)/i.test(attribute(attributes,"action")??""))challenge=true
    }
    if(name!=="div")continue
    if(closing){const block=stack.pop();if(block?.result)blocks.push({start:block.start,end:tag.index!+tag[0].length})}
    else{const result=tokens.includes("result");if(result)boundaries.push(tag.index!);if(!/\/\s*>$/.test(tag[0]))stack.push({start:tag.index!,result})}
  }
  if(challenge||/<title\b[^>]*>\s*(?:Just a moment\b|Attention Required\b)/i.test(document))throw Error("workflow_tool_search_challenge")
  const snippets=[...document.matchAll(/<(a|div)\b([^>]*class\s*=\s*["'][^"']*result__snippet[^"']*["'][^>]*)>([\s\S]*?)<\/\1\s*>/gi)]
    .filter(match=>classes(match[2]??"").includes("result__snippet"))
    .map(match=>({start:match.index!,end:match.index!+match[0].length,text:htmlToolText(match[3]??"").slice(0,320),href:attribute(match[2]??"","href")}))
  const candidates=[...document.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi)].filter(match=>classes(match[1]??"").includes("result__a"))
  // An explicit empty-result marker mixed with result anchors is ambiguous.
  if(noResults&&candidates.length)throw Error("workflow_tool_search_response_inconsistent")
  const hits:{title:string;url:string;snippet:string}[]=[]
  for(let index=0;index<candidates.length;index++){
    const match=candidates[index]!,start=match.index!+match[0].length,href=attribute(match[1]??"","href")
    if(!href)continue
    let end=candidates[index+1]?.index??document.length
    const enclosing=blocks.filter(block=>block.start<=match.index!&&block.end>=start).sort((a,b)=>(a.end-a.start)-(b.end-b.start))[0]
    if(enclosing)end=Math.min(end,enclosing.end)
    for(const boundary of boundaries)if(boundary>=start){end=Math.min(end,boundary);break}
    const associated=snippets.find(value=>value.start>=start&&value.end<=end)
    try{
      const url=destination(href)
      let snippet=associated?.text??""
      if(associated&&associated.href!==undefined)try{if(destination(associated.href).toString()!==url.toString())snippet=""}catch{snippet=""}
      const title=htmlToolText(match[2]??"").slice(0,200)
      if(!title)continue
      const hit={title,url:url.toString(),snippet}
      if(JSON.stringify([...hits,hit]).length>4000)break
      hits.push(hit)
    }catch{continue}
    if(hits.length>=limit)break
  }
  // Untrusted citations are never automatically visited. A challenge, changed
  // document, or rejected candidates must not become a successful "no results".
  if(hits.length)return JSON.stringify(hits)
  if(noResults)return "（搜索服务明确未找到匹配结果）"
  throw Error(candidates.length?"workflow_tool_search_results_unavailable":"workflow_tool_search_response_unrecognized")
}
export function createWorkflowToolNetwork(
  resolver:ProviderResolver={resolve4,resolve6},
  request:Requester=(options,callback)=>(options.protocol==="http:"?httpRequest:httpsRequest)(options,callback),
){
  async function send(spec:WorkflowToolHttpRequest,signal:AbortSignal,redirects=0,follow=false,beforeDial?:WorkflowToolBeforeDial):Promise<{text:string;status:number;media_type:string;received_bytes:number;content_length:string|null}>{
    signal.throwIfAborted()
    const url=safeToolDestination(spec.url,["http:","https:"])
    const pinned=await resolveSafeProviderAddress(resolver,url.hostname)
    signal.throwIfAborted()
    // DNS/URL refusal retains precedence. Recheck the actual current Broker
    // scope after DNS, on every initial/redirect dial, before any request.
    if(beforeDial)await beforeDial()
    signal.throwIfAborted()
    const answer=await new Promise<{text:string;status:number;media_type:string;received_bytes:number;content_length:string|null;location?:string}>((resolve,reject)=>{
      let settled=false
      const fail=()=>{if(!settled){settled=true;reject(Error("workflow_tool_transport_unknown"))}}
      const req=request({protocol:url.protocol,hostname:url.hostname,servername:url.hostname,port:url.protocol==="https:"?443:80,
        path:url.pathname+url.search,method:spec.method,headers:spec.headers,agent:false,rejectUnauthorized:true,minVersion:"TLSv1.2",
        family:pinned.family,lookup:(_host,_options,callback)=>callback(null,pinned.address,pinned.family),
        timeout:spec.timeout,signal:AbortSignal.any([signal,AbortSignal.timeout(spec.timeout)])},res=>{
        const status=res.statusCode??0
        if(follow&&spec.method==="GET"&&[301,302,303,307,308].includes(status)){
          const location=res.headers.location
          if(typeof location!=="string"||!location||location.length>6000||location!==location.trim()||/[\u0000-\u0020\u007f\\]/.test(location)){res.destroy();fail();return}
          settled=true;res.destroy();resolve({text:"",status,media_type:"",received_bytes:0,content_length:null,location});return
        }
        if(status<200||status>=300||res.headers["content-encoding"]&&res.headers["content-encoding"]!=="identity"||
           status!==204&&!/^(?:application\/(?:[a-z0-9.+-]*\+)?json|text\/[-a-z0-9.+]+)(?:;|$)/i.test(String(res.headers["content-type"]??""))){
          res.destroy();fail();return
        }
        let used=0;const chunks:Buffer[]=[]
        res.on("data",piece=>{if(settled)return;const data=Buffer.isBuffer(piece)?piece:Buffer.from(piece);used+=data.length
          if(used>131072){res.destroy();fail();return};chunks.push(data)})
        res.once("aborted",fail);res.once("error",fail)
        res.once("end",()=>{if(settled)return;try{
          const text=new TextDecoder("utf-8",{fatal:true}).decode(Buffer.concat(chunks));settled=true;resolve({text,status,media_type:String(res.headers["content-type"]??""),received_bytes:used,content_length:res.headers['content-length']===undefined?null:String(res.headers['content-length'])})
        }catch{fail()}})
      })
      req.once("error",fail);req.setTimeout(spec.timeout,()=>req.destroy(Error("workflow_tool_timeout")));req.end(spec.body)
    })
    if(answer.location!==undefined){
      if(redirects>=3)throw Error("workflow_tool_redirect_refused")
      let next:URL
      try{next=safeToolDestination(new URL(answer.location,url).toString(),["http:","https:"])}catch{throw Error("workflow_tool_redirect_refused")}
      if(url.protocol==="https:"&&next.protocol!=="https:")throw Error("workflow_tool_redirect_refused")
      return send({...spec,url:next.toString()},signal,redirects+1,true,beforeDial)
    }
    return answer
  }
  const plain=(url:string,method:"GET"|"POST",body="",contentType="text/plain"):WorkflowToolHttpRequest=>({url,method,
    body:Buffer.from(body),headers:{"user-agent":"agentstudio-pg18-private-tool/1",accept:"text/html, text/plain, application/json","accept-encoding":"identity",
      ...(method==="POST"?{"content-type":contentType,"content-length":String(Buffer.byteLength(body))}:{})},timeout:24000,secrets:[]})
  const captured=(answer:{text:string;status:number;media_type:string;received_bytes:number;content_length:string|null},secrets:readonly string[],web:boolean)=>{
    if(answer.content_length!==null&&(!/^(0|[1-9][0-9]*)$/.test(answer.content_length)||Number(answer.content_length)!==answer.received_bytes))throw Error('monitor_source_coverage_incomplete')
    const safe=redactWorkflowToolResponse(answer.text,secrets),redacted=safe!==answer.text
    let structuredContent:unknown=null
    if(!redacted&&/^application\/(?:[a-z0-9.+-]*\+)?json(?:;|$)/i.test(answer.media_type)){
      try{structuredContent=parseLocalTransportJson(answer.text,131072)}catch{}
    }
    // These extra methods are used only by the source-bound monitor collector.
    // Existing public http/webFetch methods below keep their original4000-char
    // output. A received-complete declared response never claims full-web scope.
    return{text:web?htmlToolText(safe):safe,structuredContent,coverage:{stored_complete:true as const},redacted,
      usable_as_evidence:!redacted,http_response:{status:answer.status,complete:true as const,empty:answer.text.length===0,media_type:answer.media_type}}
  }
  return {
    async monitorHttp(material:WorkflowToolHttpMaterial,args:ToolArguments,signal:AbortSignal){
      const spec=prepareWorkflowToolHttp(material,args)
      if(spec.method!=="GET")throw Error("monitor_requires_read_only_source")
      return captured(await send(spec,signal),spec.secrets,false)
    },
    async monitorWebFetch(url:string,signal:AbortSignal,beforeDial?:WorkflowToolBeforeDial){return captured(await send(plain(url,"GET"),signal,0,true,beforeDial),[],true)},
    async http(material:WorkflowToolHttpMaterial,args:ToolArguments,signal:AbortSignal){
      const spec=prepareWorkflowToolHttp(material,args),answer=await send(spec,signal)
      return redactWorkflowToolResponse(answer.text,spec.secrets).slice(0,4000)||"（工具返回空响应，HTTP "+answer.status+"）"
    },
    async webFetch(url:string,signal:AbortSignal,beforeDial?:WorkflowToolBeforeDial){const answer=await send(plain(url,"GET"),signal,0,true,beforeDial)
      return htmlToolText(answer.text).slice(0,4000)||"（该页面没有可提取的正文文本）"},
    async webSearch(query:string,limit:number,signal:AbortSignal,beforeDial?:WorkflowToolBeforeDial){const encoded="q="+encodeURIComponent(query)
      const answer=await send(plain("https://html.duckduckgo.com/html/?"+encoded,"POST",encoded,"application/x-www-form-urlencoded"),signal,0,false,beforeDial)
      return parseWorkflowSearchHtml(answer.text,limit)},
  }
}
