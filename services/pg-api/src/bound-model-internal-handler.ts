// REVIEW-ONLY internal mTLS Worker→Broker request handler. Importing this
// module starts NO listener, connects to NO database, and never calls a model.
// A separate non-root HTTPS service must explicitly approve and construct it,
// set requestCert+rejectUnauthorized, enforce isolation, provision independent
// login roles/credentials, and use a fixed client certificate fingerprint.
// NEVER mount in public createHandler(), native-server.ts or V7/8090.
import type {IncomingMessage,ServerResponse} from "node:http"
import type {BoundModelClaim,BoundModelDispatchResult} from "./owner-model-dispatch.ts"
import {safeBoundModelClaim} from "./owner-model-dispatch.ts"
import type {ModelInput} from "./model-provider.ts"
import {verifyBoundWorkerMutualTlsPeer} from "./bound-worker-mtls.ts"

const exactRoute="/__internal/v1/bound-model/dispatch"
const maxBodyBytes=16384
type VerifiedBoundDispatch=(claim:BoundModelClaim,input:ModelInput)=>
  Promise<BoundModelDispatchResult>

function refuse():never{throw Error("invalid_internal_bound_dispatch_request")}
function validText(v:unknown,max:number,min=0):v is string{
  return typeof v==="string"&&v.length>=min&&v.length<=max&&
    !/[\u0000\u007f]/u.test(v)
}
function boundedStrings(input:unknown,maxCount:number,maxItem:number):input is string[]{
  return Array.isArray(input)&&input.length<=maxCount&&input.every(item=>
    validText(item,maxItem)&&!/\x00/u.test(item))
}
function safeModelInput(raw:unknown):ModelInput{
  if(!raw||typeof raw!=="object"||Array.isArray(raw))refuse()
  const input=raw as Record<string,unknown>
  const expected=["goal","instruction","taskScope","deliverables","doneCriteria"]
  const allowed=[...expected,"knowledgeEvidence"]
  if(expected.some(k=>!Object.hasOwn(input,k))||
     Object.keys(input).some(k=>!allowed.includes(k))||
     !validText(input.goal,2000,1)||!validText(input.instruction,1200)||
     !validText(input.taskScope,2000)||
     !boundedStrings(input.deliverables,20,300)||
     !boundedStrings(input.doneCriteria,20,300))refuse()
  const evidence=input.knowledgeEvidence
  if(evidence!==undefined&&(
    !Array.isArray(evidence)||evidence.length>6||
    evidence.some(x=>!x||typeof x!=="object"||Array.isArray(x)||
      Object.keys(x).length!==2||!Object.hasOwn(x,"citation")||
      !Object.hasOwn(x,"snippet")||
      !validText(x.citation,160,1)||!validText(x.snippet,320,1))||
    JSON.stringify(evidence).length>3300))refuse()
  return input as unknown as ModelInput
}
function parseRequest(value:unknown):{claim:BoundModelClaim;input:ModelInput}{
  if(!value||typeof value!=="object"||Array.isArray(value))refuse()
  const object=value as Record<string,unknown>
  if(Object.keys(object).length!==2||!Object.hasOwn(object,"claim")||
     !Object.hasOwn(object,"input"))refuse()
  // No issuer, subject, user ID, API key or provider URL are accepted from
  // the network. They are resolved from the fenced PostgreSQL lease and
  // independently owner-scoped Broker credentials only.
  let claim:BoundModelClaim
  try{claim=safeBoundModelClaim(object.claim)}catch{refuse()}
  const input=safeModelInput(object.input)
  return {claim,input}
}
function reply(res:ServerResponse,status:number,value:Record<string,unknown>){
  res.writeHead(status,{
    "Content-Type":"application/json; charset=utf-8",
    "Cache-Control":"no-store",
    "X-Content-Type-Options":"nosniff",
    "Content-Security-Policy":"default-src 'none'",
  })
  res.end(JSON.stringify(value))
}
export function createIsolatedBoundModelInternalHandler(config:{
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
    let request:{claim:BoundModelClaim;input:ModelInput}
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
      request=parseRequest(JSON.parse(decoded))
    }catch{
      reply(res,400,{error:"bound_dispatch_invalid_payload"});return
    }
    try{
      const result=await config.dispatch(request.claim,request.input)
      if(result?.status!=="succeeded"||!validText(result.text,12000,1))
        throw Error("bound_model_invalid_internal_result")
      reply(res,200,{status:"succeeded",text:result.text})
    }catch{
      // Provider outcomes may be UNKNOWN after a paid request. Do not
      // retry or echo SQL/provider exceptions, credentials or prompts.
      reply(res,503,{error:"bound_dispatch_outcome_unavailable"})
    }
  }
}
