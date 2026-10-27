// Optional059 unmounted foundation. Only explicit independent configuration
// acceptance is supported; no provider, fee, Worker or old-repository effect.
import {HttpError,isUuid,type Identity,type SqlClient,type SqlPool} from "./contracts.ts"
import {withActor,assertOwnedAdmissionContext} from "./repository.ts"
import {verifyAgentGeneratedCredentials} from "./agent-generated-audit.ts"
import {AgentGeneratedSourceRepository,agentGeneratedNative,agentGeneratedEpoch} from "./agent-generated-source.ts"
import {parseAgentGeneratedPreviewInput,parseAgentGeneratedAcceptance,parseAgentGeneratedPreview,parseAgentGeneratedReceipt,agentGeneratedRequestHash,
  type AgentGeneratedAcceptance,type AgentGeneratedPreview,type AgentGeneratedReceipt} from "./agent-generated-acceptance-contract.ts"

const unavailable=():never=>{throw new HttpError(409,"agent_generated_unavailable")}
const conflict=():never=>{throw new HttpError(409,"agent_generated_request_conflict")}
const sqlErrors:Record<string,number>={
  invalid_agent_generated_request:400,native_employee_identity_required:403,agent_generated_acceptance_disabled:403,
  agent_generated_review_not_found:404,agent_generated_receipt_not_found:404,agent_generated_source_unavailable:409,
  agent_generated_complete_output_required:409,agent_generated_change_required:409,agent_generated_role_changed:409,agent_generated_feedback_changed:409,
  agent_generated_request_conflict:409,agent_generated_review_already_accepted:409,agent_generated_unavailable:409
}
export function agentGeneratedOriginalReceipt(raw:unknown,original:AgentGeneratedAcceptance):AgentGeneratedReceipt{
  const receipt=parseAgentGeneratedReceipt(raw),v=parseAgentGeneratedAcceptance(original)
  if(receipt.request_id!==v.request_id||receipt.request_sha256!==agentGeneratedRequestHash(v)||receipt.source.review_id!==v.review_id||receipt.source.spec_id!==v.spec_id||
    receipt.source.target_run_id!==v.target_run_id||receipt.anchor.run_id!==v.anchor_run_id||receipt.anchor.feedback_id!==v.anchor_feedback_id||
    receipt.preview_sha256!==v.expected_preview_sha256||receipt.source.result_sha256!==v.expected_result_sha256||receipt.before.revision!==v.expected_spec_revision||
    receipt.before.source_sha256!==v.expected_spec_sha256||receipt.candidate_sha256!==v.expected_candidate_sha256)return conflict()
  return receipt
}
export function agentGeneratedExpectedPreview(raw:unknown,original:AgentGeneratedAcceptance):AgentGeneratedPreview{
  const v=parseAgentGeneratedAcceptance(original),preview=parseAgentGeneratedPreview(raw,{action:"preview",review_id:v.review_id,spec_id:v.spec_id,target_run_id:v.target_run_id})
  if(preview.before.revision!==v.expected_spec_revision||preview.before.source_sha256!==v.expected_spec_sha256)throw new HttpError(409,"agent_generated_role_changed")
  if(preview.preview_sha256!==v.expected_preview_sha256||preview.source.result_sha256!==v.expected_result_sha256||preview.candidate.candidate_sha256!==v.expected_candidate_sha256||
    preview.anchor.run_id!==v.anchor_run_id||preview.anchor.feedback_id!==v.anchor_feedback_id)throw new HttpError(409,"agent_generated_source_unavailable")
  return preview
}
export class AgentGeneratedAcceptanceRepository{
  readonly pool:SqlPool;readonly accepting:boolean
  constructor(pool:SqlPool,{allowAcceptance=false}:{allowAcceptance?:boolean}={}){this.pool=pool;this.accepting=allowAcceptance===true}
  private async actor<T>(identity:Identity,body:(db:SqlClient,owner:string,epoch:number)=>Promise<T>):Promise<T>{
    agentGeneratedNative(identity)
    try{return await withActor(this.pool,identity,async(db,owner)=>{
      await assertOwnedAdmissionContext(db,owner)
      if(!await verifyAgentGeneratedCredentials(db))return unavailable()
      const epoch=agentGeneratedEpoch((await db.query<{epoch:unknown}>("SELECT agentstudio.agent_memory_outcome_epoch() AS epoch")).rows[0]?.epoch)
      return body(db,owner,epoch)
    })}catch(error){
      if(error&&typeof error==="object"&&"code" in error&&error.code==="P0001"&&"message" in error&&typeof error.message==="string"){
        const code=error.message
        if(Object.hasOwn(sqlErrors,code))throw new HttpError(sqlErrors[code]!,code)
        if(code==="agent_opinion_not_found")throw new HttpError(404,"agent_generated_review_not_found")
        if(code==="agent_opinion_source_unavailable"||code==="agent_optimization_feedback_changed")throw new HttpError(409,"agent_generated_source_unavailable")
      }
      throw error
    }
  }
  private async stored(db:SqlClient,id:string,selector:"request"|"review"):Promise<AgentGeneratedReceipt|null>{
    const raw=(await db.query<{value:unknown}>("SELECT agentstudio.agent_generated_receipt($1::uuid,$2::text) AS value",[id,selector])).rows[0]?.value
    if(raw===null)return null
    const receipt=parseAgentGeneratedReceipt(raw)
    if(receipt.replayed!==true||(selector==="request"?receipt.request_id!==id:receipt.source.review_id!==id))return unavailable()
    return receipt
  }
  async preview(identity:Identity,raw:unknown):Promise<AgentGeneratedPreview>{
    agentGeneratedNative(identity);const v=parseAgentGeneratedPreviewInput(raw)
    return this.actor(identity,async(db,owner)=>{
      const prepared=await new AgentGeneratedSourceRepository(this.pool).prepareOnClient(identity,db,owner,{review_id:v.review_id,spec_id:v.spec_id,target_run_id:v.target_run_id})
      // Deliberate public projection: no full role/candidate/choice/body escapes.
      return parseAgentGeneratedPreview(prepared.preview,v)
    })
  }
  async accept(identity:Identity,raw:unknown):Promise<AgentGeneratedReceipt>{
    agentGeneratedNative(identity);const v=parseAgentGeneratedAcceptance(raw)
    return this.actor(identity,async(db,owner,epoch)=>{
      await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1::text,551))",[owner+":"+v.request_id])
      // Exact original recovery MUST precede independent fresh scope/source.
      const previous=await this.stored(db,v.request_id,"request")
      if(previous)return agentGeneratedOriginalReceipt(previous,v)
      const collision=(await db.query("SELECT request_id FROM agentstudio.agent_optimization_intents WHERE owner_user_id=$1::uuid AND request_id=$2::uuid UNION ALL SELECT request_id FROM agentstudio.agent_optimization_links WHERE owner_user_id=$1::uuid AND request_id=$2::uuid LIMIT 1",[owner,v.request_id])).rows
      if(collision.length)return conflict()
      if(await this.stored(db,v.review_id,"review"))throw new HttpError(409,"agent_generated_review_already_accepted")
      if(!this.accepting)throw new HttpError(403,"agent_generated_acceptance_disabled")
      const prepared=await new AgentGeneratedSourceRepository(this.pool).prepareOnClient(identity,db,owner,{review_id:v.review_id,spec_id:v.spec_id,target_run_id:v.target_run_id})
      const preview=agentGeneratedExpectedPreview(prepared.preview,v)
      if(preview.source.source_owner_epoch!==epoch)throw new HttpError(409,"agent_generated_source_unavailable")
      // New protected SQL repeats expressible checks and derives its candidate
      // from real058 output. API has no direct write to059 private tables.
      const receipt=agentGeneratedOriginalReceipt((await db.query<{value:unknown}>("SELECT agentstudio.agent_generated_accept($1::jsonb) AS value",[JSON.stringify(v)])).rows[0]?.value,v)
      if(receipt.acceptance_owner_epoch!==epoch||receipt.source.source_owner_epoch!==epoch||receipt.replayed!==false)return unavailable()
      return receipt
    })
  }
  async confirm(identity:Identity,raw:unknown):Promise<AgentGeneratedReceipt>{
    agentGeneratedNative(identity);const v=parseAgentGeneratedAcceptance(raw)
    return this.actor(identity,async db=>{
      const receipt=await this.stored(db,v.request_id,"request")
      if(!receipt)throw new HttpError(404,"agent_generated_receipt_not_found")
      // No Source, body, current role/model/feedback or historical=current epoch.
      return agentGeneratedOriginalReceipt(receipt,v)
    })
  }
  async receipt(identity:Identity,reviewId:unknown):Promise<AgentGeneratedReceipt>{
    agentGeneratedNative(identity)
    if(!isUuid(reviewId)||reviewId!==reviewId.toLowerCase())throw new HttpError(400,"invalid_agent_generated_request")
    return this.actor(identity,async db=>{
      const receipt=await this.stored(db,reviewId,"review")
      if(!receipt)throw new HttpError(404,"agent_generated_receipt_not_found")
      return receipt
    })
  }
}
