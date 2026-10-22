// REVIEW-ONLY internal mTLS Worker→Broker request handler. Importing this
// module starts NO listener, connects to NO database, and never calls a model.
// A separate non-root HTTPS service must explicitly approve and construct it,
// set requestCert+rejectUnauthorized, enforce isolation, provision independent
// login roles/credentials, and use a fixed client certificate fingerprint.
// NEVER mount in public createHandler(), native-server.ts or V7/8090.
import type {IncomingMessage,ServerResponse} from "node:http"
import type {BoundModelDispatchResult} from "./owner-model-dispatch.ts"
import type {WorkflowV2ModelRequest} from "./workflow-v2-model-contract.ts"
import {verifyBoundWorkerMutualTlsPeer} from "./bound-worker-mtls.ts"
import {safeBoundModelResult} from "./bound-model-contract.ts"
import {workflowV2ModelRoute as exactRoute,workflowV2ModelMaxRequestBytes as maxBodyBytes,
  safeWorkflowV2ModelRequest} from "./workflow-v2-model-contract.ts"

type VerifiedBoundDispatch=(request:WorkflowV2ModelRequest)=>
  Promise<BoundModelDispatchResult>

function refuse():never{throw Error("invalid_internal_bound_dispatch_request")}
function reply(res:ServerResponse,status:number,value:Record<string,unknown>){
  res.writeHead(status,{
    "Content-Type":"application/json; charset=utf-8",
    "Cache-Control":"no-store",
    "X-Content-Type-Options":"nosniff",
    "Content-Security-Policy":"default-src 'none'",
  })
  res.end(JSON.stringify(value))
}
export function createWorkflowV2ModelInternalHandler(config:{
  approvedForIsolatedUat:boolean
  reviewedClientFingerprint256:string
  dispatch:VerifiedBoundDispatch
}):(req:IncomingMessage,res:ServerResponse)=>Promise<void>{
  if(!config?.approvedForIsolatedUat||
     typeof config.dispatch!=="function"||
     typeof config.reviewedClientFingerprint256!=="string")
    throw Error("bound_model_internal_handler_disabled")
  return async(req,res)=>{
    // First check the ACTUAL TLS transport object, not forwarded headers,
    // then the exact path and bounded body. No API-visible route exists.
    try{verifyBoundWorkerMutualTlsPeer(req.socket,
      config.reviewedClientFingerprint256)}
    catch{reply(res,403,{error:"bound_dispatch_denied"});return}
    if(req.method!=="POST"||req.url!==exactRoute||
       req.headers.cookie!==undefined||
       req.headers.authorization!==undefined||
       req.headers["x-rh-user-id"]!==undefined||
       req.headers["x-forwarded-client-cert"]!==undefined){
      reply(res,404,{error:"bound_dispatch_route_not_found"})
      return
    }
    if(!/^application\/json(?:;\s*charset=utf-8)?$/i.test(
      String(req.headers["content-type"]??""))||
      req.headers["content-encoding"]!==undefined){
      reply(res,415,{error:"bound_dispatch_unsupported_media"});return
    }
    const length=Number(req.headers["content-length"])
    if(!Number.isSafeInteger(length)||length<=0||length>maxBodyBytes){
      reply(res,413,{error:"bound_dispatch_invalid_size"});return
    }
    let request:WorkflowV2ModelRequest
    try{
      const parts:Buffer[]=[]
      let used=0
      for await(const piece of req){
        const data=Buffer.isBuffer(piece)?piece:Buffer.from(piece)
        used+=data.length
        if(used>maxBodyBytes||used>length)refuse()
        parts.push(data)
      }
      if(used!==length)refuse()
      const decoded=new TextDecoder("utf-8",{fatal:true})
        .decode(Buffer.concat(parts))
      request=safeWorkflowV2ModelRequest(JSON.parse(decoded))
    }catch{
      reply(res,400,{error:"bound_dispatch_invalid_payload"});return
    }
    try{
      const result=safeBoundModelResult(await config.dispatch(request))
      reply(res,200,{status:result.status,text:result.text})
    }catch{
      // Provider outcomes may be UNKNOWN after a paid request. Do not
      // retry or echo SQL/provider exceptions, credentials or prompts.
      reply(res,503,{error:"bound_dispatch_outcome_unavailable"})
    }
  }
}
