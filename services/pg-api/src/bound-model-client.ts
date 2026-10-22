// One-shot private Worker -> Broker mTLS client. No retry, redirect or fallback.
// Construct only after explicit runtime approval and credential/role preflight.
import {request as httpsRequest} from "node:https"
import {checkServerIdentity} from "node:tls"
import {timingSafeEqual} from "node:crypto"
import {boundCertificateFingerprint} from "./bound-worker-mtls.ts"
import {boundModelRoute,boundModelMaxRequestBytes,safeBoundModelRequest,
  safeBoundModelResult} from "./bound-model-contract.ts"
import type {BoundModelClaim,BoundModelDispatchResult} from "./owner-model-dispatch.ts"
import type {ModelInput} from "./model-provider.ts"

export type BoundModelClientConfig={
  approvedForIsolatedUat:boolean
  origin:string;reviewedServerFingerprint256:string
  ca:Buffer;cert:Buffer;key:Buffer
}
function disabled():never{throw Error("bound_dispatch_client_disabled")}
const maxResponseBytes=65536
export function createBoundModelMutualTlsClient(
  config:BoundModelClientConfig,request:typeof httpsRequest=httpsRequest,
):(claim:BoundModelClaim,input:ModelInput)=>Promise<BoundModelDispatchResult>{
  if(config?.approvedForIsolatedUat!==true)disabled()
  let origin:URL,pin:Buffer
  try{
    origin=new URL(config.origin)
    pin=boundCertificateFingerprint(config.reviewedServerFingerprint256)
  }catch{disabled()}
  if(origin.origin!==config.origin||origin.protocol!=="https:"||
     origin.hostname!=="127.0.0.1"||origin.username||origin.password||
     !origin.port||Number(origin.port)<1024||Number(origin.port)>65535||
     [config.ca,config.cert,config.key].some(x=>!Buffer.isBuffer(x)||
       x.length===0||x.length>65536))disabled()
  // Own copies keep later config-object mutation from changing trust material.
  const credentials={ca:Buffer.from(config.ca),cert:Buffer.from(config.cert),
    key:Buffer.from(config.key)}
  return async(claim,input)=>{
    const body=Buffer.from(JSON.stringify(safeBoundModelRequest({claim,input})),"utf8")
    if(body.length>boundModelMaxRequestBytes)
      throw Error("bound_dispatch_request_too_large")
    return await new Promise<BoundModelDispatchResult>((resolve,reject)=>{
      let settled=false
      const fail=()=>{
        if(settled)return
        settled=true
        reject(Error("bound_dispatch_transport_failed"))
      }
      try{
        const req=request({
          protocol:"https:",hostname:"127.0.0.1",port:Number(origin.port),
          servername:"localhost",path:boundModelRoute,method:"POST",
          ...credentials,rejectUnauthorized:true,minVersion:"TLSv1.2",
          agent:false,signal:AbortSignal.timeout(55000),
          checkServerIdentity(host,cert){
            const error=checkServerIdentity(host,cert)
            if(error)return error
            try{
              if(timingSafeEqual(pin,boundCertificateFingerprint(cert.fingerprint256)))
                return undefined
            }catch{ /* Reject without exposing certificate or trust metadata. */ }
            return Error("bound_dispatch_server_certificate_refused")
          },
          headers:{"Content-Type":"application/json",Accept:"application/json",
            "Content-Length":String(body.length)},
        },res=>{
          const type=res.headers["content-type"]||""
          const encoding=res.headers["content-encoding"]
          if(res.statusCode!==200||!/^application\/json(?:\s*;|$)/i.test(type)||
             (encoding!==undefined&&encoding!=="identity")){
            fail();res.destroy();return
          }
          let used=0
          const parts:Buffer[]=[]
          res.on("data",piece=>{
            if(settled)return
            const bytes=Buffer.isBuffer(piece)?piece:Buffer.from(piece)
            used+=bytes.length
            if(used>maxResponseBytes){fail();res.destroy();return}
            parts.push(bytes)
          })
          res.once("aborted",fail)
          res.once("error",fail)
          res.once("end",()=>{
            if(settled)return
            try{
              const decoded=new TextDecoder("utf-8",{fatal:true})
                .decode(Buffer.concat(parts))
              const result=safeBoundModelResult(JSON.parse(decoded))
              settled=true;resolve(result)
            }catch{fail()}
          })
        })
        req.once("error",fail)
        req.end(body)
      }catch{fail()}
    })
  }
}
