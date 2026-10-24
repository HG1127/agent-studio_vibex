// Bounded credential-bearing MCP POSTs: public DNS pinning, TLS, no redirect,
// proxy, cookie persistence, reconnect or automatic request replay.
import {request as httpsRequest,type RequestOptions} from "node:https"
import type {ClientRequest,IncomingMessage} from "node:http"
import {resolve4,resolve6} from "node:dns/promises"
import {resolveSafeProviderAddress,type ProviderResolver} from "./model-connection-probe.ts"
import {safeToolDestination} from "./workflow-v2-tool-plan.ts"
import type {McpTransport,McpWireResponse,McpMaterial} from "./mcp-discovery.ts"
type Requester=(options:RequestOptions,callback:(response:IncomingMessage)=>void)=>ClientRequest
export function createMcpNetwork(resolver:ProviderResolver={resolve4,resolve6},request:Requester=httpsRequest):McpTransport{
  return async(material,wire,signal)=>{
    signal.throwIfAborted()
    const {url,headers}=prepareMcpEgress(material)
    if(Object.entries(wire.headers).some(([name,value])=>!/^mcp-(?:protocol-version|method|name|session-id|param-[-!#$%&'*+.^_`|~0-9a-z]+)$/i.test(name)||
      typeof value!=="string"||value.length>2048||/[\u0000-\u001f\u007f]/.test(value)))throw Error("invalid_mcp_headers")
    const body=Buffer.from(JSON.stringify(wire.body))
    if(body.length>65536)throw Error("mcp_request_too_large")
    const pinned=await resolveSafeProviderAddress(resolver,url.hostname)
    signal.throwIfAborted()
    return new Promise<McpWireResponse>((resolve,reject)=>{
      let settled=false
      const fail=()=>{if(!settled){settled=true;reject(Error("mcp_transport_failed"))}}
      const req=request({protocol:"https:",hostname:url.hostname,servername:url.hostname,port:443,path:url.pathname+url.search,
        method:"POST",headers:{...headers,accept:"application/json, text/event-stream","content-type":"application/json",
          "content-length":String(body.length),...wire.headers},agent:false,rejectUnauthorized:true,minVersion:"TLSv1.2",
        family:pinned.family,lookup:(_host,_options,callback)=>callback(null,pinned.address,pinned.family),
        signal:AbortSignal.any([signal,AbortSignal.timeout(20000)]),timeout:20000},res=>{
        const status=res.statusCode??0,content_type=String(res.headers["content-type"]??""),session=res.headers["mcp-session-id"]
        if(status<200||status>=500||[301,302,303,307,308].includes(status)||
          res.headers["content-encoding"]&&res.headers["content-encoding"]!=="identity"||
          session!==undefined&&typeof session!=="string") {res.destroy();fail();return}
        let used=0;const chunks:Buffer[]=[]
        res.on("data",piece=>{if(settled)return;const data=Buffer.isBuffer(piece)?piece:Buffer.from(piece);used+=data.length
          if(used>262144){res.destroy();fail();return};chunks.push(data)})
        res.once("aborted",fail);res.once("error",fail)
        res.once("end",()=>{
          if(settled)return
          try{const text=new TextDecoder("utf-8",{fatal:true}).decode(Buffer.concat(chunks));settled=true;resolve({status,text,content_type,session:session??""})}
          catch{fail()}
        })
      })
      req.once("error",fail);req.setTimeout(20000,()=>req.destroy(Error("mcp_timeout")));req.end(body)
    })
  }
}
export function prepareMcpEgress(material:McpMaterial){
    const url=safeToolDestination(material.url),headers:Record<string,string>={"user-agent":"agentstudio-pg18-mcp/1","accept-encoding":"identity"}
    if(!Array.isArray(material.headers)||material.headers.length>20)throw Error("invalid_mcp_headers")
    for(const header of material.headers){
      if(!header||typeof header.key!=="string"||!/^[-!#$%&'*+.^_`|~0-9A-Za-z]{1,80}$/.test(header.key)||
        /^(?:host|connection|content-length|transfer-encoding|trailer|te|upgrade|expect|accept-encoding|proxy-.*|x-forwarded-.*|forwarded|x-rh-user-id|mcp-.*|accept|content-type|user-agent)$/i.test(header.key)||
        typeof header.value!=="string"||header.value.length>2048||/[\u0000-\u001f\u007f]/.test(header.value)||Object.hasOwn(headers,header.key.toLowerCase()))throw Error("invalid_mcp_headers")
      headers[header.key.toLowerCase()]=header.value
    }
    return {url,headers}
}
