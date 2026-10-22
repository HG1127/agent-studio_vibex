// One-shot private Worker -> Broker mTLS client. No retry, redirect or fallback.
// Construct only after explicit runtime approval and credential/role preflight.
import {request as httpsRequest} from "node:https"
import {checkServerIdentity} from "node:tls"
import {timingSafeEqual} from "node:crypto"
import {boundCertificateFingerprint} from "./bound-worker-mtls.ts"
import {safeBoundModelResult} from "./bound-model-contract.ts"
import {WorkflowKnownEffectFailure,workflowKnownEffectCodes} from "./workflow-v2-effect-failure.ts"
import {workflowV2ModelMaxRequestBytes} from "./workflow-v2-model-contract.ts"
import {workflowV2ToolRoute,safeWorkflowV2ToolRequest,type WorkflowV2ToolRequest} from "./workflow-v2-tool-contract.ts"
import type {BoundModelDispatchResult} from "./owner-model-dispatch.ts"
import type {WorkflowV2EffectExecutor} from "./workflow-v2-worker.ts"

export type BoundModelClientConfig={
  approvedForIsolatedUat:boolean
  origin:string;reviewedServerFingerprint256:string
  ca:Buffer;cert:Buffer;key:Buffer
}
function disabled():never{throw Error("bound_dispatch_client_disabled")}
const maxResponseBytes=65536
export function createWorkflowV2ToolMutualTlsClient(
  config:BoundModelClientConfig,request:typeof httpsRequest=httpsRequest,
):(request:WorkflowV2ToolRequest,signal?:AbortSignal)=>Promise<BoundModelDispatchResult>{
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
  return async(raw,signal)=>{
    const body=Buffer.from(JSON.stringify(safeWorkflowV2ToolRequest(raw)),"utf8")
    if(body.length>workflowV2ModelMaxRequestBytes)
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
          servername:"localhost",path:workflowV2ToolRoute,method:"POST",
          ...credentials,rejectUnauthorized:true,minVersion:"TLSv1.2",
          agent:false,signal:signal?AbortSignal.any([signal,AbortSignal.timeout(28000)]):AbortSignal.timeout(28000),
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
              const value:unknown=JSON.parse(decoded)
              if(value&&typeof value==="object"&&!Array.isArray(value)){
                const item=value as Record<string,unknown>
                if(item.status==="failed"&&Object.keys(item).length===2&&typeof item.code==="string"&&
                   workflowKnownEffectCodes.some(code=>code===item.code))
                  throw new WorkflowKnownEffectFailure(item.code as typeof workflowKnownEffectCodes[number])
              }
              const result=safeBoundModelResult(value)
              settled=true;resolve(result)
            }catch(error){
              if(error instanceof WorkflowKnownEffectFailure){settled=true;reject(error)}else fail()
            }
          })
        })
        req.once("error",fail)
        req.end(body)
      }catch{fail()}
    })
  }
}

export function workflowV2ToolEffectExecutor(config:BoundModelClientConfig):WorkflowV2EffectExecutor{
  const dispatch=createWorkflowV2ToolMutualTlsClient(config)
  return {supports:request=>request.kind==="tool",async execute(request,lease){
    if(request.kind!=="tool")throw Error("workflow_effect_adapter_unavailable")
    const result=await dispatch({claim:{run_id:lease.run_id,job_id:lease.job_id,lease_token:lease.lease_token,
      lease_version:lease.lease_version,lease_owner:lease.worker_id},step_key:request.step_key,
      input_sha256:request.input_sha256},lease.signal)
    return result.text
  }}
}
