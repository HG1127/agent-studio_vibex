// Fixed Smithery management origin only; no arbitrary outbound URL, tool RPC,
// redirects, cookies, proxy or automatic retries. Credentials stay in headers.
import {request as httpsRequest,type RequestOptions} from "node:https"
import type {ClientRequest,IncomingMessage} from "node:http"
import {resolve4,resolve6} from "node:dns/promises"
import {resolveSafeProviderAddress,type ProviderResolver} from "./model-connection-probe.ts"
import {smitheryApiKey,smitheryName,smitheryServer,smitheryObject,SmitheryProtocolError} from "./smithery-contracts.ts"
export type SmitheryRequest={method:"GET"|"PUT"|"DELETE";path:string;body?:Record<string,unknown>}
export type SmitheryResponse={status:number;data:unknown}
export type SmitheryTransport=(key:string,request:SmitheryRequest,signal:AbortSignal)=>Promise<SmitheryResponse>
type Requester=(options:RequestOptions,callback:(response:IncomingMessage)=>void)=>ClientRequest
export function smitheryConnectionPath(namespace:string,id:string){
  if(!smitheryName(namespace)||!smitheryName(id))throw new SmitheryProtocolError()
  return "/connect/"+namespace+"/"+id
}
export function smitheryCatalogPath(query:string,page:number){
  if(typeof query!=="string"||query.length>100||/[\u0000-\u001f\u007f]/.test(query)||!Number.isSafeInteger(page)||page<1||page>100)throw new SmitheryProtocolError()
  return "/servers?"+new URLSearchParams({page:String(page),pageSize:"24",...(query?{q:query}:{})})
}
export function prepareSmitheryRequest(key:string,wire:SmitheryRequest){
  smitheryApiKey(key)
  if(!wire||Object.keys(wire).some(name=>!["method","path","body"].includes(name))||typeof wire.path!=="string"||wire.path.length>1000||
    !["GET","PUT","DELETE"].includes(wire.method))throw new SmitheryProtocolError()
  const url=new URL(wire.path,"https://api.smithery.ai")
  if(url.origin!=="https://api.smithery.ai"||url.hash||url.username||url.password||url.pathname+url.search!==wire.path)throw new SmitheryProtocolError()
  if(wire.path.includes(key)||[...url.searchParams.values()].some(value=>value.includes(key)))throw new SmitheryProtocolError()
  const pair=/^\/connect\/([^/]+)\/([^/]+)$/.exec(url.pathname)
  const connection=pair&&smitheryName(pair[1])&&smitheryName(pair[2])&&!url.search
  const inventory=wire.method==="GET"&&(wire.path==="/namespaces"||url.pathname==="/servers"&&
    [...url.searchParams.keys()].every(name=>["page","pageSize","q"].includes(name))&&new Set(url.searchParams.keys()).size===[...url.searchParams].length&&
    wire.path===smitheryCatalogPath(url.searchParams.get("q")??"",Number(url.searchParams.get("page")))&&url.searchParams.get("pageSize")==="24")
  if(!connection&&!inventory)throw new SmitheryProtocolError()
  let body:Buffer|undefined
  if(wire.method==="PUT"){
    const data=smitheryObject(wire.body),metadata=smitheryObject(data.metadata)
    if(!connection||Object.keys(data).length!==4||data.transport!=="http"||!smitheryServer(data.server)||typeof data.name!=="string"||
      !data.name.trim()||data.name.length>100||/[\u0000-\u001f\u007f]/.test(data.name)||Object.keys(metadata).length!==1||
      typeof metadata.agent_studio_binding!=="string"||!/^[a-f0-9]{64}$/.test(metadata.agent_studio_binding))throw new SmitheryProtocolError()
    body=Buffer.from(JSON.stringify(data));if(body.length>8192)throw new SmitheryProtocolError()
  }else if(wire.body!==undefined)throw new SmitheryProtocolError()
  return {path:wire.path,method:wire.method,body,headers:{authorization:"Bearer "+key,accept:"application/json","user-agent":"AgentStudio-PG18",
    ...(body?{"content-type":"application/json","content-length":String(body.length)}:{})}}
}
export function createSmitheryNetwork(resolver:ProviderResolver={resolve4,resolve6},request:Requester=httpsRequest):SmitheryTransport{
  return async(key,wire,signal)=>{
    signal.throwIfAborted();const prepared=prepareSmitheryRequest(key,wire),pinned=await resolveSafeProviderAddress(resolver,"api.smithery.ai")
    signal.throwIfAborted()
    return new Promise<SmitheryResponse>((resolve,reject)=>{
      let settled=false;const fail=()=>{if(!settled){settled=true;reject(Error("smithery_transport_failed"))}}
      const req=request({protocol:"https:",hostname:"api.smithery.ai",servername:"api.smithery.ai",port:443,path:prepared.path,method:prepared.method,headers:prepared.headers,
        agent:false,rejectUnauthorized:true,minVersion:"TLSv1.2",family:pinned.family,lookup:(_host,_options,callback)=>callback(null,pinned.address,pinned.family),
        signal:AbortSignal.any([signal,AbortSignal.timeout(20000)]),timeout:20000},res=>{
        const status=res.statusCode??0
        if(status<200||status>=600||status>=300&&status<400||res.headers["content-encoding"]&&res.headers["content-encoding"]!=="identity"){
          res.destroy();fail();return
        }
        let bytes=0;const chunks:Buffer[]=[]
        res.on("data",piece=>{if(settled)return;const data=Buffer.isBuffer(piece)?piece:Buffer.from(piece);bytes+=data.length
          if(bytes>262144){res.destroy();fail();return};chunks.push(data)})
        res.once("aborted",fail);res.once("error",fail);res.once("end",()=>{
          if(settled)return
          try{const text=new TextDecoder("utf-8",{fatal:true}).decode(Buffer.concat(chunks))
            const data=text.trim()?JSON.parse(text):null;settled=true;resolve({status,data})
          }catch{fail()}
        })
      })
      req.once("error",fail);req.setTimeout(20000,()=>req.destroy(Error("smithery_timeout")));req.end(prepared.body)
    })
  }
}
