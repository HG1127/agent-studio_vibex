// A separate, pinned private mTLS surface. Never mount on the employee API.
import {request as httpsRequest} from "node:https"
import type {IncomingMessage,ServerResponse} from "node:http"
import {checkServerIdentity} from "node:tls"
import {timingSafeEqual} from "node:crypto"
import {boundCertificateFingerprint,verifyBoundWorkerMutualTlsPeer} from "./bound-worker-mtls.ts"
import {safeKnowledgeIndexClaim,type KnowledgeIndexClaim} from "./knowledge-index-contracts.ts"
import {knowledgeQueryRoute,safeKnowledgeQueryDispatchResult,type KnowledgeQueryDispatchResult} from "./knowledge-query-contracts.ts"
export interface KnowledgeQueryPrivateClientConfig {
  approvedForIsolatedUat:boolean;origin:string;reviewedServerFingerprint256:string;ca:Buffer;cert:Buffer;key:Buffer
}
export function createKnowledgeQueryPrivateClient(config:KnowledgeQueryPrivateClientConfig,request:typeof httpsRequest=httpsRequest){
  if(config?.approvedForIsolatedUat!==true)throw Error("knowledge_query_client_disabled")
  const origin=new URL(config.origin),pin=boundCertificateFingerprint(config.reviewedServerFingerprint256)
  if(origin.origin!==config.origin||origin.protocol!=="https:"||origin.hostname!=="127.0.0.1"||origin.username||origin.password||!origin.port||Number(origin.port)<1024||Number(origin.port)>65535||
    [config.ca,config.cert,config.key].some(x=>!Buffer.isBuffer(x)||x.length<1||x.length>65536))throw Error("knowledge_query_client_disabled")
  const credentials={ca:Buffer.from(config.ca),cert:Buffer.from(config.cert),key:Buffer.from(config.key)}
  return async(raw:KnowledgeIndexClaim,signal?:AbortSignal):Promise<KnowledgeQueryDispatchResult>=>{
    const body=Buffer.from(JSON.stringify(safeKnowledgeIndexClaim(raw)))
    return new Promise((resolve,reject)=>{
      let settled=false
      const fail=()=>{if(!settled){settled=true;reject(Error("knowledge_query_private_outcome_unavailable"))}}
      try{
        const req=request({protocol:"https:",hostname:"127.0.0.1",port:Number(origin.port),servername:"localhost",path:knowledgeQueryRoute,method:"POST",
          ...credentials,agent:false,rejectUnauthorized:true,minVersion:"TLSv1.2",signal:signal?AbortSignal.any([signal,AbortSignal.timeout(28000)]):AbortSignal.timeout(28000),
          checkServerIdentity(host,cert){const error=checkServerIdentity(host,cert);if(error)return error
            try{if(timingSafeEqual(pin,boundCertificateFingerprint(cert.fingerprint256)))return undefined}catch{}
            return Error("knowledge_query_server_pin_refused")},
          headers:{"Content-Type":"application/json",Accept:"application/json","Content-Length":String(body.length)}},res=>{
          if(res.statusCode!==200||!/^application\/json(?:\s*;|$)/i.test(String(res.headers["content-type"]??""))||
            res.headers["content-encoding"]!==undefined&&res.headers["content-encoding"]!=="identity"){res.destroy();fail();return}
          const parts:Buffer[]=[];let used=0
          res.on("data",piece=>{if(settled)return;const data=Buffer.isBuffer(piece)?piece:Buffer.from(piece);used+=data.length
            if(used>1024){res.destroy();fail();return};parts.push(data)})
          res.once("aborted",fail);res.once("error",fail);res.once("end",()=>{
            if(settled)return
            try{const value=safeKnowledgeQueryDispatchResult(JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(Buffer.concat(parts))));settled=true;resolve(value)}catch{fail()}
          })
        });req.once("error",fail);req.end(body)
      }catch{fail()}
    })
  }
}
export function createKnowledgeQueryPrivateHandler(config:{approvedForIsolatedUat:boolean;reviewedClientFingerprint256:string;dispatch:(claim:KnowledgeIndexClaim)=>Promise<KnowledgeQueryDispatchResult>}){
  if(config?.approvedForIsolatedUat!==true||typeof config.dispatch!=="function")throw Error("knowledge_query_handler_disabled")
  const fingerprint=config.reviewedClientFingerprint256,dispatch=config.dispatch;boundCertificateFingerprint(fingerprint)
  const reply=(res:ServerResponse,status:number,body:Record<string,unknown>)=>{if(res.destroyed)return
    res.writeHead(status,{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff","Content-Security-Policy":"default-src 'none'"});res.end(JSON.stringify(body))}
  return async(req:IncomingMessage,res:ServerResponse):Promise<void>=>{
    try{verifyBoundWorkerMutualTlsPeer(req.socket,fingerprint)}catch{reply(res,403,{error:"knowledge_query_peer_denied"});return}
    if(req.method!=="POST"||req.url!==knowledgeQueryRoute||["cookie","authorization","x-rh-user-id","x-forwarded-client-cert","transfer-encoding"].some(key=>req.headers[key]!==undefined)){
      reply(res,404,{error:"knowledge_query_route_denied"});return}
    if(!/^application\/json(?:;\s*charset=utf-8)?$/i.test(String(req.headers["content-type"]??""))||req.headers["content-encoding"]!==undefined){reply(res,415,{error:"knowledge_query_media_denied"});return}
    const length=Number(req.headers["content-length"])
    if(!Number.isSafeInteger(length)||length<1||length>1024){reply(res,413,{error:"knowledge_query_body_denied"});return}
    let claim:KnowledgeIndexClaim
    const timer=setTimeout(()=>req.destroy(),5000)
    try{
      let used=0;const parts:Buffer[]=[]
      for await(const piece of req){const data=Buffer.isBuffer(piece)?piece:Buffer.from(piece);used+=data.length;if(used>length)throw Error("body_overflow");parts.push(data)}
      if(used!==length)throw Error("body_truncated")
      claim=safeKnowledgeIndexClaim(JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(Buffer.concat(parts))))
    }catch{reply(res,400,{error:"knowledge_query_payload_denied"});return}finally{clearTimeout(timer)}
    try{reply(res,200,{...safeKnowledgeQueryDispatchResult(await dispatch(claim))})}catch{reply(res,503,{error:"knowledge_query_outcome_unavailable"})}
  }
}
