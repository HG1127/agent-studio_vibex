// Composable S1 transport only, NOT mounted by Native server/global policy.
// Supply the actual Native-auth authenticateRequest closure, never OIDC or a
// caller identity. Repository owns every fresh/config gate and original replay.
import type {IncomingMessage,ServerResponse} from "node:http"
import {HttpError,type Identity} from "./contracts.ts"
import {nativeSessionToken,verifyNativeOrigin} from "./native-auth-http.mjs"
import {agentDescriptivePatchAcknowledgement,parseAgentDescriptivePatchPreviewInput,parseAgentDescriptivePatchAcceptance,freezeAgentDescriptivePatchOriginal,
  parseAgentDescriptivePatchPreview,parseAgentDescriptivePatchReceipt,type DescriptivePatchAcceptance,type DescriptivePatchReceipt} from "./agent-descriptive-patch-contract.ts"
import type {AgentDescriptivePatchAcceptanceRepository} from "./agent-descriptive-patch-acceptance-repository.ts"

export type AgentDescriptivePatchHttpDependencies={
  repository:Pick<AgentDescriptivePatchAcceptanceRepository,"preview"|"accept"|"confirm"|"receipt">
  authenticateRequest:(req:IncomingMessage)=>Promise<Identity>
  allowedOrigin:string
}
export const agentDescriptivePatchHttpBase="/api/v2/agent-descriptive-patches" as const
const maxRequest=8192,maxResponse=1048576
const headers={"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","Pragma":"no-cache","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer","Cross-Origin-Resource-Policy":"same-origin","X-Frame-Options":"DENY"}
const invalid=():never=>{throw new HttpError(400,"invalid_agent_descriptive_patch_request")}
const publicErrors:Record<number,readonly string[]>={
  400:["invalid_agent_descriptive_patch_request"],401:["session_required"],
  403:["native_employee_identity_required","native_request_origin_denied","owned_admission_context_required","employee_not_provisioned","agent_descriptive_patch_acceptance_disabled"],
  404:["agent_descriptive_patch_review_not_found","agent_descriptive_patch_receipt_not_found"],405:["method_not_allowed"],
  409:["agent_descriptive_patch_source_unavailable","agent_descriptive_patch_change_required","agent_descriptive_patch_role_changed","agent_descriptive_patch_feedback_changed","agent_descriptive_patch_request_conflict","agent_descriptive_patch_review_already_accepted","agent_descriptive_patch_unavailable"],
  413:["request_too_large"],415:["json_content_type_required"]
}
function reply(res:ServerResponse,status:number,body:unknown,allow?:string){res.writeHead(status,{...headers,...(status===405&&allow?{Allow:allow}:{})});res.end(JSON.stringify(body))}
function claimed(raw:string):boolean{const base=agentDescriptivePatchHttpBase;return raw===base||raw.startsWith(base+"/")}
function route(raw:string):{owned:boolean;path:string}{
  const first=raw.split(/[?#]/,1)[0]??""
  let path:string
  try{path=new URL(raw,"http://127.0.0.1").pathname}catch{return {owned:claimed(first),path:""}}
  // Decode only to CLAIM AND REJECT aliases, never to dispatch an alias.
  let decoded=path
  try{decoded=decodeURIComponent(path)}catch{}
  return {owned:claimed(first)||claimed(path)||claimed(decoded),path}
}
async function readBody(req:IncomingMessage):Promise<unknown>{
  const type=req.headers["content-type"],length=req.headers["content-length"],transfer=req.headers["transfer-encoding"]
  if(typeof type!=="string"||!/^application\/json(?:;\s*charset=utf-8)?$/i.test(type))throw new HttpError(415,"json_content_type_required")
  if(length!==undefined&&(typeof length!=="string"||!/^(0|[1-9][0-9]*)$/.test(length)))return invalid()
  if(length!==undefined&&!Number.isSafeInteger(Number(length))||length!==undefined&&Number(length)>maxRequest)throw new HttpError(413,"request_too_large")
  if(transfer!==undefined&&(transfer!=="chunked"||length!==undefined))return invalid()
  let count=0;const chunks:Buffer[]=[]
  for await(const chunk of req){const bytes=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);count+=bytes.length;if(count>maxRequest)throw new HttpError(413,"request_too_large");chunks.push(bytes)}
  if(length!==undefined&&Number(length)!==count)return invalid()
  const bytes=Buffer.concat(chunks)
  if(bytes[0]===0xef&&bytes[1]===0xbb&&bytes[2]===0xbf)return invalid()
  try{const value:unknown=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(bytes));if(!value||typeof value!=="object"||Array.isArray(value))return invalid();return value}catch{return invalid()}
}
async function emptyBody(req:IncomingMessage):Promise<void>{
  if(req.headers["transfer-encoding"]!==undefined||req.headers["content-length"]!==undefined&&req.headers["content-length"]!=="0")return invalid()
  for await(const chunk of req)if(Buffer.byteLength(chunk)>0)return invalid()
}
function projection<T>(decode:()=>T):T{
  // Fulfilled repository output may follow COMMIT. Invalid output is an
  // uncertain500, never a definitive400/409 fresh-write rejection.
  try{const value=decode();if(Buffer.byteLength(JSON.stringify(value),"utf8")>maxResponse)throw Error();return value}catch{throw Error("unsafe_agent_descriptive_patch_response")}
}
function receipt(raw:unknown,original?:DescriptivePatchAcceptance,review?:string,readonly=false):DescriptivePatchReceipt{
  const value=parseAgentDescriptivePatchReceipt(raw,original)
  const expected=original??parseAgentDescriptivePatchAcceptance({action:"accept",request_id:value.request_id,review_id:value.source.review_id,spec_id:value.source.spec_id,target_run_id:value.source.target_run_id,
    anchor_run_id:value.anchor.run_id,anchor_feedback_id:value.anchor.feedback_id,expected_preview_sha256:value.preview_sha256,expected_result_sha256:value.source.result_sha256,expected_patch_sha256:value.patch_sha256,
    expected_spec_revision:value.before.revision,expected_spec_sha256:value.before.source_sha256,expected_candidate_sha256:value.candidate_sha256,confirm:true,acceptance_acknowledgement:agentDescriptivePatchAcknowledgement})
  // Visible metadata consistency only; derived consent is never sent/retried.
  parseAgentDescriptivePatchReceipt(value,expected)
  if(readonly&&value.replayed!==true||review!==undefined&&value.source.review_id!==review)throw Error("invalid_agent_descriptive_patch_receipt_scope")
  return value
}
/** Returns false without IO for other route families; true when consumed. */
export function createAgentDescriptivePatchHttpHandler({repository,authenticateRequest,allowedOrigin}:AgentDescriptivePatchHttpDependencies){
  if(!repository||["preview","accept","confirm","receipt"].some(k=>typeof repository[k as keyof typeof repository]!=="function")||typeof authenticateRequest!=="function")throw Error("invalid_agent_descriptive_patch_http_dependencies")
  try{verifyNativeOrigin({headers:{}} as IncomingMessage,allowedOrigin,false)}catch{throw Error("invalid_agent_descriptive_patch_http_dependencies")}
  return async(req:IncomingMessage,res:ServerResponse):Promise<boolean>=>{
    const raw=req.url??"",selected=route(raw)
    if(!selected.owned)return false
    let allow:string|undefined
    try{
      try{verifyNativeOrigin(req,allowedOrigin,!["GET","HEAD"].includes(req.method??""))}catch(error){if(error&&typeof error==="object"&&"status"in error&&error.status===403)throw new HttpError(403,"native_request_origin_denied");throw error}
      if(req.headers.authorization!==undefined||!nativeSessionToken(req))throw new HttpError(401,"session_required")
      if(req.headers["x-rh-user-id"]!==undefined)throw new HttpError(403,"native_employee_identity_required")
      if(raw!==selected.path)return invalid()
      const action=/^\/api\/v2\/agent-descriptive-patches\/(preview|accept|confirm)$/.exec(selected.path)
      const item=/^\/api\/v2\/agent-descriptive-patches\/reviews\/([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$/.exec(selected.path)
      if(!action&&!item)return invalid()
      allow=action?"POST":"GET"
      if(req.method!==allow)throw new HttpError(405,"method_not_allowed")
      let identity:Identity
      try{identity=await authenticateRequest(req)}catch(error){if(error&&typeof error==="object"&&"status"in error){if(error.status===401)throw new HttpError(401,"session_required");if(error.status===403)throw new HttpError(403,"native_request_origin_denied")};throw error}
      if(identity?.issuer!=="urn:agentstudio:local:v1"||typeof identity.subject!=="string"||!identity.subject)throw new HttpError(403,"native_employee_identity_required")
      if(action){
        const rawBody=await readBody(req)
        if(action[1]==="preview"){
          const input=parseAgentDescriptivePatchPreviewInput(rawBody),value=await repository.preview(identity,input)
          reply(res,200,projection(()=>parseAgentDescriptivePatchPreview(value,input)))
        }else{
          const original=freezeAgentDescriptivePatchOriginal(rawBody)
          // No transport fresh/config gate: exact original recovery is inside
          // repository.accept. Forward all15 fields without reconstruction.
          const value=action[1]==="accept"?await repository.accept(identity,original):await repository.confirm(identity,original)
          reply(res,200,projection(()=>receipt(value,original,undefined,action[1]==="confirm")))
        }
      }else{
        const review=item![1]!
        if(review!==review.toLowerCase())return invalid()
        await emptyBody(req)
        const value=await repository.receipt(identity,review)
        reply(res,200,projection(()=>receipt(value,undefined,review,true)))
      }
    }catch(error){
      const known=error instanceof HttpError&&publicErrors[error.status]?.includes(error.code)
      reply(res,known?error.status:500,{error:known?error.code:"internal_error"},allow)
    }
    return true
  }
}
