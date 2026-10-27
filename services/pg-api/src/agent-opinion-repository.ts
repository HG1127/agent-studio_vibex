// Internal058 current-result read. No HTTP, list authority, browser-supplied
// evaluation reader, Worker/provider call or role acceptance is mounted.
import {HttpError,type Identity,type SqlPool,type SqlClient} from "./contracts.ts"
import {withActor,assertOwnedAdmissionContext} from "./repository.ts"
import {verifyAgentOpinionCredentials} from "./agent-opinion-audit.ts"
import {AgentReviewSourceRepository} from "./agent-review-source.ts"
import {agentAssessmentOutputHash} from "./agent-assessment-contract.ts"
import {canonicalMcpJson} from "./mcp-catalog.ts"
import {parseAgentOpinionReviewId,parseAgentOpinionAnchor,parseAgentOpinionBody,parseAgentOpinionView,type AgentOpinionAnchor,type AgentOpinionResult,type AgentOpinionView} from "./agent-opinion-contract.ts"

const sourceUnavailable=():never=>{throw new HttpError(409,"agent_opinion_source_unavailable")}
const native=(identity:Identity)=>{if(identity?.issuer!=="urn:agentstudio:local:v1")throw new HttpError(403,"agent_opinion_native_employee_required")}
const sqlErrors:Record<string,number>={agent_opinion_not_found:404,agent_opinion_source_unavailable:409,agent_opinion_invalid_read:400,agent_opinion_native_employee_required:403}
function epoch(raw:unknown):number{
  if(raw===null||raw===undefined)throw new HttpError(403,"agent_opinion_native_employee_required")
  if(typeof raw!=="number"&&(typeof raw!=="string"||!/^[1-9][0-9]*$/.test(raw)))return sourceUnavailable()
  const value=Number(raw);if(!Number.isSafeInteger(value)||value<1||value>Number.MAX_SAFE_INTEGER-2)return sourceUnavailable();return value
}
function protectedDto<T>(parse:(raw:unknown)=>T,raw:unknown):T{
  try{return parse(raw)}catch(error){if(error instanceof HttpError&&error.code==="agent_opinion_invalid_read")return sourceUnavailable();throw error}
}
function view(anchor:AgentOpinionAnchor,result:AgentOpinionResult|null):AgentOpinionView{
  return parseAgentOpinionView({protocol:"agent_paid_review_view_v1",request:{request_id:anchor.request_id,spec_id:anchor.spec_id,run_id:anchor.run_id,purpose:anchor.purpose,request_sha256:anchor.request_sha256,input_sha256:anchor.input_sha256,content_sha256:anchor.content_sha256,owner_epoch:anchor.owner_epoch,source_protocol:anchor.source_protocol,created_at:anchor.created_at},execution:{job_state:anchor.job_state,lease_state:anchor.lease_state,outcome:anchor.outcome},body_erased:anchor.body_erased,available:result!==null,result})
}
export class AgentOpinionRepository{
  readonly pool:SqlPool
  constructor(pool:SqlPool){this.pool=pool}
  async getCurrent(identity:Identity,reviewId:unknown):Promise<AgentOpinionView>{
    native(identity);const id=parseAgentOpinionReviewId(reviewId)
    try{return await withActor(this.pool,identity,async(db,owner)=>{
      await assertOwnedAdmissionContext(db,owner)
      if(!await verifyAgentOpinionCredentials(db))throw new HttpError(409,"agent_opinion_schema_required")
      // Native epoch first. Anchor must not take a request/input/output lock
      // before prepareOnClient acquires its sorted owner/run540 mutexes.
      const currentEpoch=epoch((await db.query<{epoch:unknown}>("SELECT agentstudio.agent_memory_outcome_epoch() AS epoch")).rows[0]?.epoch)
      const anchor=protectedDto(parseAgentOpinionAnchor,(await db.query<{value:unknown}>("SELECT agentstudio.agent_opinion_anchor($1::uuid) AS value",[id])).rows[0]?.value)
      if(anchor.request_id!==id)return sourceUnavailable()
      if(anchor.choice===null)return view(anchor,null)
      if(anchor.owner_epoch!==currentEpoch||anchor.outcome?.status!=="succeeded"||anchor.choice.evaluation_sources.length)return sourceUnavailable()
      const prepared=await this.currentSource(identity,db,owner,anchor)
      if(prepared.owner_epoch!==currentEpoch||prepared.owner_epoch!==anchor.owner_epoch||prepared.source_protocol!==anchor.source_protocol||prepared.content_sha256!==anchor.content_sha256||prepared.input_sha256!==anchor.input_sha256||canonicalMcpJson(prepared.choice)!==canonicalMcpJson(anchor.choice))return sourceUnavailable()
      // Source540/resource/epoch locks remain held on this same API client.
      // Protected body read now pins alive input/output rows; no reverse540
      // wait is introduced into existing privacy controls/deletion paths.
      const body=protectedDto(parseAgentOpinionBody,(await db.query<{value:unknown}>("SELECT agentstudio.agent_opinion_body($1::uuid,$2::text,$3::text) AS value",[id,anchor.input_sha256,anchor.outcome.result_sha256])).rows[0]?.value)
      if(body.request_id!==id||body.purpose!==anchor.purpose||body.input_sha256!==anchor.input_sha256||body.result_sha256!==anchor.outcome.result_sha256||agentAssessmentOutputHash(id,anchor.purpose,anchor.input_sha256,body.result)!==anchor.outcome.result_sha256)return sourceUnavailable()
      // withActor commits before this value reaches the caller. No input,
      // choice, owner identity, credential or Worker proof enters the view.
      return view(anchor,body.result)
    })}catch(error){
      if(error&&typeof error==="object"&&"code" in error&&error.code==="P0001"&&"message" in error&&typeof error.message==="string"&&Object.hasOwn(sqlErrors,error.message))throw new HttpError(sqlErrors[error.message]!,error.message)
      throw error
    }
  }
  private async currentSource(identity:Identity,db:SqlClient,owner:string,anchor:AgentOpinionAnchor){
    // No evaluationReader is installed, and unsupported prior selections are
    // refused intact. Never fabricate a replacement choice with empty parents.
    try{return await new AgentReviewSourceRepository(this.pool).prepareOnClient(identity,db,owner,anchor.choice)}
    catch(error){if(error instanceof HttpError)return sourceUnavailable();throw error}
  }
}
