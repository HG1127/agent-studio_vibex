// Optional060 unmounted S1 repository. Only explicit independent configuration
// acceptance is supported; no provider, fee, Worker or old-repository effect.
import {HttpError,isUuid,type Identity,type SqlClient,type SqlPool} from "./contracts.ts"
import {withActor,assertOwnedAdmissionContext} from "./repository.ts"
import {verifyAgentDescriptivePatchCredentials} from "./agent-descriptive-patch-audit.ts"
import {AgentDescriptivePatchSourceRepository} from "./agent-descriptive-patch-source.ts"
import {agentGeneratedNative as agentDescriptivePatchNative,agentGeneratedEpoch as sourceEpoch} from "./agent-generated-source.ts"
import {parseAgentGeneratedReceipt as parseFullGeneratedReceipt} from "./agent-generated-acceptance-contract.ts"
import {parseAgentDescriptivePatchPreviewInput,parseAgentDescriptivePatchAcceptance,parseAgentDescriptivePatchPreview,parseAgentDescriptivePatchReceipt,agentDescriptivePatchRequestHash,
  type DescriptivePatchAcceptance,type DescriptivePatchPreview,type DescriptivePatchReceipt} from "./agent-descriptive-patch-contract.ts"

const unavailable=():never=>{throw new HttpError(409,"agent_descriptive_patch_unavailable")}
const conflict=():never=>{throw new HttpError(409,"agent_descriptive_patch_request_conflict")}
function agentDescriptivePatchEpoch(raw:unknown):number{try{return sourceEpoch(raw)}catch(error){if(error instanceof HttpError&&error.status===403)throw error;return unavailable()}}
const sqlErrors:Record<string,number>={
  invalid_agent_descriptive_patch_request:400,native_employee_identity_required:403,agent_descriptive_patch_acceptance_disabled:403,
  agent_descriptive_patch_review_not_found:404,agent_descriptive_patch_receipt_not_found:404,agent_descriptive_patch_source_unavailable:409,
  agent_descriptive_patch_change_required:409,agent_descriptive_patch_role_changed:409,agent_descriptive_patch_feedback_changed:409,
  agent_descriptive_patch_request_conflict:409,agent_descriptive_patch_review_already_accepted:409,agent_descriptive_patch_unavailable:409
}
export function agentDescriptivePatchOriginalReceipt(raw:unknown,original:DescriptivePatchAcceptance):DescriptivePatchReceipt{
  const receipt=parseAgentDescriptivePatchReceipt(raw),v=parseAgentDescriptivePatchAcceptance(original)
  if(receipt.request_id!==v.request_id||receipt.request_sha256!==agentDescriptivePatchRequestHash(v)||receipt.source.review_id!==v.review_id||receipt.source.spec_id!==v.spec_id||
    receipt.source.target_run_id!==v.target_run_id||receipt.anchor.run_id!==v.anchor_run_id||receipt.anchor.feedback_id!==v.anchor_feedback_id||
    receipt.preview_sha256!==v.expected_preview_sha256||receipt.source.result_sha256!==v.expected_result_sha256||receipt.patch_sha256!==v.expected_patch_sha256||receipt.before.revision!==v.expected_spec_revision||
    receipt.before.source_sha256!==v.expected_spec_sha256||receipt.candidate_sha256!==v.expected_candidate_sha256)return conflict()
  return receipt
}
export function agentDescriptivePatchExpectedPreview(raw:unknown,original:DescriptivePatchAcceptance):DescriptivePatchPreview{
  const v=parseAgentDescriptivePatchAcceptance(original),preview=parseAgentDescriptivePatchPreview(raw,{action:"preview",review_id:v.review_id,spec_id:v.spec_id,target_run_id:v.target_run_id})
  if(preview.before.revision!==v.expected_spec_revision||preview.before.source_sha256!==v.expected_spec_sha256)throw new HttpError(409,"agent_descriptive_patch_role_changed")
  if(preview.preview_sha256!==v.expected_preview_sha256||preview.source.result_sha256!==v.expected_result_sha256||preview.model_patch.patch_sha256!==v.expected_patch_sha256||preview.candidate.candidate_sha256!==v.expected_candidate_sha256||
    preview.anchor.run_id!==v.anchor_run_id||preview.anchor.feedback_id!==v.anchor_feedback_id)throw new HttpError(409,"agent_descriptive_patch_source_unavailable")
  return preview
}
export class AgentDescriptivePatchAcceptanceRepository{
  readonly pool:SqlPool;readonly accepting:boolean
  constructor(pool:SqlPool,{allowAcceptance=false}:{allowAcceptance?:boolean}={}){this.pool=pool;this.accepting=allowAcceptance===true}
  private async actor<T>(identity:Identity,body:(db:SqlClient,owner:string,epoch:number)=>Promise<T>):Promise<T>{
    agentDescriptivePatchNative(identity)
    try{return await withActor(this.pool,identity,async(db,owner)=>{
      await assertOwnedAdmissionContext(db,owner)
      if(!await verifyAgentDescriptivePatchCredentials(db))return unavailable()
      const epoch=agentDescriptivePatchEpoch((await db.query<{epoch:unknown}>("SELECT agentstudio.agent_memory_outcome_epoch() AS epoch")).rows[0]?.epoch)
      return body(db,owner,epoch)
    })}catch(error){
      if(error&&typeof error==="object"&&"code" in error&&error.code==="P0001"&&"message" in error&&typeof error.message==="string"){
        const code=error.message
        if(Object.hasOwn(sqlErrors,code))throw new HttpError(sqlErrors[code]!,code)
        if(code==="agent_opinion_not_found")throw new HttpError(404,"agent_descriptive_patch_review_not_found")
        if(code==="agent_opinion_source_unavailable"||code==="agent_optimization_feedback_changed")throw new HttpError(409,"agent_descriptive_patch_source_unavailable")
      }
      throw error
    }
  }
  private async stored(db:SqlClient,id:string,selector:"request"|"review"):Promise<DescriptivePatchReceipt|null>{
    const raw=(await db.query<{value:unknown}>("SELECT agentstudio.agent_descriptive_patch_receipt($1::uuid,$2::text) AS value",[id,selector])).rows[0]?.value
    if(raw===null)return null
    const receipt=parseAgentDescriptivePatchReceipt(raw)
    if(receipt.replayed!==true||(selector==="request"?receipt.request_id!==id:receipt.source.review_id!==id))return unavailable()
    return receipt
  }
  async preview(identity:Identity,raw:unknown):Promise<DescriptivePatchPreview>{
    agentDescriptivePatchNative(identity);const v=parseAgentDescriptivePatchPreviewInput(raw)
    return this.actor(identity,async(db,owner)=>{
      const prepared=await new AgentDescriptivePatchSourceRepository(this.pool).prepareOnClient(identity,db,owner,{review_id:v.review_id,spec_id:v.spec_id,target_run_id:v.target_run_id})
      // Deliberate public projection: no full role/candidate/choice/body escapes.
      return parseAgentDescriptivePatchPreview(prepared.preview,v)
    })
  }
  async accept(identity:Identity,raw:unknown):Promise<DescriptivePatchReceipt>{
    agentDescriptivePatchNative(identity);const v=parseAgentDescriptivePatchAcceptance(raw)
    return this.actor(identity,async(db,owner,epoch)=>{
      await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1::text,551))",[owner+":"+v.request_id])
      // Exact original recovery MUST precede independent fresh scope/source.
      const previous=await this.stored(db,v.request_id,"request")
      if(previous)return agentDescriptivePatchOriginalReceipt(previous,v)
      const collision=(await db.query("SELECT request_id FROM agentstudio.agent_optimization_intents WHERE owner_user_id=$1::uuid AND request_id=$2::uuid UNION ALL SELECT request_id FROM agentstudio.agent_optimization_links WHERE owner_user_id=$1::uuid AND request_id=$2::uuid LIMIT 1",[owner,v.request_id])).rows
      if(collision.length)return conflict()
      if(await this.stored(db,v.review_id,"review"))throw new HttpError(409,"agent_descriptive_patch_review_already_accepted")
      const priorFull=(await db.query<{value:unknown}>("SELECT agentstudio.agent_generated_receipt($1::uuid,$2::text) AS value",[v.review_id,"review"])).rows[0]?.value
      if(priorFull!==null){
        const full=parseFullGeneratedReceipt(priorFull)
        if(full.replayed!==true||full.source.review_id!==v.review_id)return unavailable()
        throw new HttpError(409,"agent_descriptive_patch_review_already_accepted")
      }
      if(!this.accepting)throw new HttpError(403,"agent_descriptive_patch_acceptance_disabled")
      const prepared=await new AgentDescriptivePatchSourceRepository(this.pool).prepareOnClient(identity,db,owner,{review_id:v.review_id,spec_id:v.spec_id,target_run_id:v.target_run_id})
      const preview=agentDescriptivePatchExpectedPreview(prepared.preview,v)
      if(preview.source.source_owner_epoch!==epoch)throw new HttpError(409,"agent_descriptive_patch_source_unavailable")
      // New protected060 repeats source checks, derives only actual provided058
      // keys and enforces both-family single acceptance after source/role locks.
      // API has no direct read or write to either private witness table.
      const receipt=agentDescriptivePatchOriginalReceipt((await db.query<{value:unknown}>("SELECT agentstudio.agent_descriptive_patch_accept($1::jsonb) AS value",[JSON.stringify(v)])).rows[0]?.value,v)
      if(receipt.acceptance_owner_epoch!==epoch||receipt.source.source_owner_epoch!==epoch||receipt.replayed!==false)return unavailable()
      return receipt
    })
  }
  async confirm(identity:Identity,raw:unknown):Promise<DescriptivePatchReceipt>{
    agentDescriptivePatchNative(identity);const v=parseAgentDescriptivePatchAcceptance(raw)
    return this.actor(identity,async db=>{
      const receipt=await this.stored(db,v.request_id,"request")
      if(!receipt)throw new HttpError(404,"agent_descriptive_patch_receipt_not_found")
      // No Source, body, current role/model/feedback or historical=current epoch.
      return agentDescriptivePatchOriginalReceipt(receipt,v)
    })
  }
  async receipt(identity:Identity,reviewId:unknown):Promise<DescriptivePatchReceipt>{
    agentDescriptivePatchNative(identity)
    if(!isUuid(reviewId)||reviewId!==reviewId.toLowerCase())throw new HttpError(400,"invalid_agent_descriptive_patch_request")
    return this.actor(identity,async db=>{
      const receipt=await this.stored(db,reviewId,"review")
      if(!receipt)throw new HttpError(404,"agent_descriptive_patch_receipt_not_found")
      return receipt
    })
  }
}
