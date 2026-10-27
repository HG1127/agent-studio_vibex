// Credential-bearing embeddings POST: exact allowlist, DNS pinning, no replay.
import {request as httpsRequest,type RequestOptions} from "node:https"
import {request as httpRequest,type ClientRequest,type IncomingMessage} from "node:http"
import {resolve4,resolve6} from "node:dns/promises"
import {resolveSafeProviderAddress,type ProviderResolver} from "./model-connection-probe.ts"
import {approvedEmbeddingEndpoint,type EmbeddingEndpointPolicy} from "./knowledge-embedding-policy.ts"
import {embeddingResponse} from "./knowledge-embedding-vectors.ts"
import type {KnowledgeEmbeddingMaterial} from "./knowledge-index-broker.ts"
type Requester=(options:RequestOptions,callback:(response:IncomingMessage)=>void)=>ClientRequest
export function createKnowledgeEmbeddingTransport(policy:EmbeddingEndpointPolicy,resolver:ProviderResolver={resolve4,resolve6},requesters:{https:Requester;http:Requester}={https:httpsRequest,http:httpRequest}){
  const endpoints=Object.freeze({allowedHosts:Object.freeze([...policy.allowedHosts]),loopbackPorts:Object.freeze([...policy.loopbackPorts])})
  return async(material:KnowledgeEmbeddingMaterial,signal:AbortSignal):Promise<number[][]>=>{
    const base=approvedEmbeddingEndpoint(material.base_url,endpoints),url=new URL(base+"/embeddings")
    if(typeof material.api_key!=="string"||material.api_key.length<8||material.api_key.length>4096||/[\u0000-\u0020\u007f]/.test(material.api_key)||
      typeof material.model_name!=="string"||!/^[A-Za-z0-9_.:/-]{2,128}$/.test(material.model_name)||!Array.isArray(material.input)||material.input.length<1||material.input.length>12||
      material.input.some(text=>typeof text!=="string"||!text.trim()||text.length>1600||text.includes("\0")||Array.from(text).some(c=>c.length===1&&c.charCodeAt(0)>=0xd800&&c.charCodeAt(0)<=0xdfff))||
      material.dimensions!==null&&(!Number.isSafeInteger(material.dimensions)||material.dimensions<2||material.dimensions>3072))throw Error("invalid_embedding_material")
    const body=Buffer.from(JSON.stringify({model:material.model_name,input:material.input,encoding_format:"float"}),"utf8")
    if(body.length>65536)throw Error("embedding_request_too_large")
    const bounded=AbortSignal.any([signal,AbortSignal.timeout(18000)])
    bounded.throwIfAborted()
    const pinned=url.protocol==="http:"?{address:"127.0.0.1",family:4 as const}:await new Promise<{address:string;family:4|6}>((resolve,reject)=>{
      const abort=()=>reject(Error("embedding_transport_aborted"))
      bounded.addEventListener("abort",abort,{once:true})
      resolveSafeProviderAddress(resolver,url.hostname).then(value=>{bounded.removeEventListener("abort",abort);resolve(value)},error=>{bounded.removeEventListener("abort",abort);reject(error)})
      if(bounded.aborted)abort()
    })
    bounded.throwIfAborted()
    return new Promise<number[][]>((resolve,reject)=>{
      let settled=false
      const fail=()=>{if(!settled){settled=true;reject(Error("embedding_transport_outcome_unavailable"))}}
      try{
        const req=requesters[url.protocol==="http:"?"http":"https"]({protocol:url.protocol,hostname:url.hostname,servername:url.protocol==="https:"?url.hostname:undefined,
          port:url.protocol==="http:"?Number(url.port||80):443,path:url.pathname,method:"POST",agent:false,
          rejectUnauthorized:true,minVersion:"TLSv1.2",family:pinned.family,lookup:(_host,_options,callback)=>callback(null,pinned.address,pinned.family),
          signal:bounded,timeout:18000,headers:{Authorization:"Bearer "+material.api_key,"Content-Type":"application/json",Accept:"application/json",
            "Accept-Encoding":"identity","Content-Length":String(body.length),"User-Agent":"agentstudio-pg18-embedding/1"}},res=>{
          if((res.statusCode??0)<200||(res.statusCode??0)>=300||!/^application\/(?:[-a-z0-9.]+\+)?json(?:\s*;|$)/i.test(String(res.headers["content-type"]??""))||
            res.headers["content-encoding"]!==undefined&&res.headers["content-encoding"]!=="identity"||Number(res.headers["content-length"]??0)>1572864){res.destroy();fail();return}
          const parts:Buffer[]=[];let used=0
          res.on("data",piece=>{if(settled)return;const data=Buffer.isBuffer(piece)?piece:Buffer.from(piece);used+=data.length
            if(used>1572864){res.destroy();fail();return};parts.push(data)})
          res.once("aborted",fail);res.once("error",fail)
          res.once("end",()=>{
            if(settled)return
            try{const decoded=new TextDecoder("utf-8",{fatal:true}).decode(Buffer.concat(parts)),vectors=embeddingResponse(JSON.parse(decoded),material.input.length,material.dimensions)
              settled=true;resolve(vectors)}catch{fail()}
          })
        })
        req.once("error",fail);req.setTimeout(18000,()=>req.destroy(Error("embedding_timeout")));req.end(body)
      }catch{fail()}
    })
  }
}
