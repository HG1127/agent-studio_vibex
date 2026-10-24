// Private tool egress. Trusted DB configuration + sealed arguments only.
// Public DNS is validated and pinned on every dial. No proxy or POST replay.
import {request as httpsRequest,type RequestOptions} from "node:https"
import {request as httpRequest,type ClientRequest,type IncomingMessage} from "node:http"
import {resolve4,resolve6} from "node:dns/promises"
import {resolveSafeProviderAddress,type ProviderResolver} from "./model-connection-probe.ts"
import {safeToolDestination,applyWorkflowToolTemplate,type ToolArguments} from "./workflow-v2-tool-plan.ts"
import {WorkflowKnownEffectFailure} from "./workflow-v2-effect-failure.ts"
export type WorkflowToolHttpMaterial={url:string;method:"GET"|"POST";body_template:string;timeout_s:number;headers:{key:string;value:string}[]}
export type WorkflowToolHttpRequest={url:string;method:"GET"|"POST";body:Buffer;headers:Record<string,string>;timeout:number;secrets:string[]}
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
  const snippets=[...html.matchAll(/<(?:a|div)[^>]*class=["'][^"']*result__snippet[^"']*["'][^>]*>([\s\S]*?)<\/(?:a|div)>/gi)]
    .map(hit=>htmlToolText(hit[1]??"").slice(0,320))
  const hits:{title:string;url:string;snippet:string}[]=[]
  for(const match of html.matchAll(/<a\b([^>]+)>([\s\S]*?)<\/a>/gi)){
    const attributes=match[1]??""
    if(!/class=["'][^"']*\bresult__a\b[^"']*["']/i.test(attributes))continue
    const href=/href=["']([^"']+)["']/i.exec(attributes)?.[1]
    if(!href)continue
    try{
      const decoded=href.replace(/&amp;/gi,"&"),redirect=new URL(decoded,"https://html.duckduckgo.com")
      const target=redirect.hostname==="duckduckgo.com"&&redirect.pathname==="/l/"?redirect.searchParams.get("uddg")??decoded:decoded
      const url=safeToolDestination(new URL(target,"https://html.duckduckgo.com").toString(),["http:","https:"])
      const hit={title:htmlToolText(match[2]??"").slice(0,200),url:url.toString(),snippet:snippets[hits.length]??""}
      if(JSON.stringify([...hits,hit]).length>4000)break
      hits.push(hit)
    }catch{continue}
    if(hits.length>=limit)break
  }
  // Search result URLs are untrusted citations, never automatically visited.
  return hits.length?JSON.stringify(hits):"（搜索未返回可用结果）"
}
export function createWorkflowToolNetwork(
  resolver:ProviderResolver={resolve4,resolve6},
  request:Requester=(options,callback)=>(options.protocol==="http:"?httpRequest:httpsRequest)(options,callback),
){
  async function send(spec:WorkflowToolHttpRequest,signal:AbortSignal,redirects=0,follow=false):Promise<{text:string;status:number}>{
    signal.throwIfAborted()
    const url=safeToolDestination(spec.url,["http:","https:"])
    const pinned=await resolveSafeProviderAddress(resolver,url.hostname)
    signal.throwIfAborted()
    const answer=await new Promise<{text:string;status:number;location?:string}>((resolve,reject)=>{
      let settled=false
      const fail=()=>{if(!settled){settled=true;reject(Error("workflow_tool_transport_unknown"))}}
      const req=request({protocol:url.protocol,hostname:url.hostname,servername:url.hostname,port:url.protocol==="https:"?443:80,
        path:url.pathname+url.search,method:spec.method,headers:spec.headers,agent:false,rejectUnauthorized:true,minVersion:"TLSv1.2",
        family:pinned.family,lookup:(_host,_options,callback)=>callback(null,pinned.address,pinned.family),
        timeout:spec.timeout,signal:AbortSignal.any([signal,AbortSignal.timeout(spec.timeout)])},res=>{
        const status=res.statusCode??0
        if(follow&&spec.method==="GET"&&[301,302,303,307,308].includes(status)&&typeof res.headers.location==="string"){
          settled=true;res.destroy();resolve({text:"",status,location:res.headers.location});return
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
          const text=new TextDecoder("utf-8",{fatal:true}).decode(Buffer.concat(chunks));settled=true;resolve({text,status})
        }catch{fail()}})
      })
      req.once("error",fail);req.setTimeout(spec.timeout,()=>req.destroy(Error("workflow_tool_timeout")));req.end(spec.body)
    })
    if(answer.location){
      if(redirects>=3)throw Error("workflow_tool_redirect_refused")
      const next=safeToolDestination(new URL(answer.location,url).toString(),["http:","https:"])
      if(url.protocol==="https:"&&next.protocol!=="https:")throw Error("workflow_tool_redirect_refused")
      return send({...spec,url:next.toString()},signal,redirects+1,true)
    }
    return answer
  }
  const plain=(url:string,method:"GET"|"POST",body="",contentType="text/plain"):WorkflowToolHttpRequest=>({url,method,
    body:Buffer.from(body),headers:{"user-agent":"agentstudio-pg18-private-tool/1",accept:"text/html, text/plain, application/json","accept-encoding":"identity",
      ...(method==="POST"?{"content-type":contentType,"content-length":String(Buffer.byteLength(body))}:{})},timeout:24000,secrets:[]})
  return {
    async http(material:WorkflowToolHttpMaterial,args:ToolArguments,signal:AbortSignal){
      const spec=prepareWorkflowToolHttp(material,args),answer=await send(spec,signal)
      return redactWorkflowToolResponse(answer.text,spec.secrets).slice(0,4000)||"（工具返回空响应，HTTP "+answer.status+"）"
    },
    async webFetch(url:string,signal:AbortSignal){const answer=await send(plain(url,"GET"),signal,0,true)
      return htmlToolText(answer.text).slice(0,4000)||"（该页面没有可提取的正文文本）"},
    async webSearch(query:string,limit:number,signal:AbortSignal){const encoded="q="+encodeURIComponent(query)
      const answer=await send(plain("https://html.duckduckgo.com/html/?"+encoded,"POST",encoded,"application/x-www-form-urlencoded"),signal)
      return parseWorkflowSearchHtml(answer.text,limit)},
  }
}
