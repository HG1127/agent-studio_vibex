// Internal same-client kernel. No transaction/client/provider is opened here.
// Only the caller's verified Native transaction may publish the projection.
import {HttpError,isUuid,safeAgentSpec,type Identity,type SqlClient,type SqlPool,type AgentSpecInput} from "./contracts.ts"
import {assertOwnedAdmissionContext} from "./repository.ts"
import {AgentReviewSourceRepository} from "./agent-review-source.ts"
import {parseAgentOpinionAnchor,parseAgentOpinionBody,type AgentOpinionAnchor} from "./agent-opinion-contract.ts"
import {agentReviewRoleCandidate,type AgentReviewPreview} from "./agent-review-contract.ts"
import {canonicalMcpJson} from "./mcp-catalog.ts"
import {agentGeneratedCandidateHash,agentGeneratedChangedKeys,agentGeneratedDescriptiveKeys,agentGeneratedFeedbackHash,agentGeneratedPreviewHash,
  parseAgentGeneratedPreview,parseAgentGeneratedPreviewInput,parseAgentGeneratedFeedback,type AgentGeneratedDescriptive,type AgentGeneratedPreview,
  type AgentGeneratedSource,type AgentGeneratedFeedback} from "./agent-generated-acceptance-contract.ts"

const unavailable=():never=>{throw new HttpError(409,"agent_generated_source_unavailable")}
export function agentGeneratedNative(identity:Identity):void{
  if(identity?.issuer!=="urn:agentstudio:local:v1"||typeof identity.subject!=="string"||!identity.subject)throw new HttpError(403,"native_employee_identity_required")
}
export function agentGeneratedEpoch(raw:unknown):number{
  if(raw===null||raw===undefined)throw new HttpError(403,"native_employee_identity_required")
  if(typeof raw!=="number"&&(typeof raw!=="string"||!/^[1-9][0-9]*$/.test(raw)))return unavailable()
  const n=Number(raw);if(!Number.isSafeInteger(n)||n<1||n>Number.MAX_SAFE_INTEGER-2)return unavailable();return n
}
export function agentGeneratedSourceRuns(choice:AgentReviewPreview):string[]{
  if(choice.purpose!=="optimize"||choice.evaluation_sources.length||choice.feedback_sources.length<1||choice.feedback_sources.length>8)return unavailable()
  const ids=[choice.run_id,...choice.feedback_sources.map(ref=>ref.run_id)]
  if(ids.some(id=>!isUuid(id)))return unavailable()
  return [...new Set(ids.map(id=>id.toLowerCase()))].sort()
}
export function agentGeneratedDescriptions(spec:AgentSpecInput):AgentGeneratedDescriptive{
  return {goal:spec.goal,task_scope:spec.task_scope,deliverables:[...spec.deliverables],task_plan:[...spec.task_plan],done_criteria:[...spec.done_criteria]}
}
export function agentGeneratedCandidate(before:AgentSpecInput,result:unknown):{spec:AgentSpecInput;changed_keys:string[]}{
  if(!result||typeof result!=="object"||Array.isArray(result))return unavailable()
  const descriptor=Object.getOwnPropertyDescriptor(result,"descriptive")
  if(!descriptor||!Object.hasOwn(descriptor,"value"))return unavailable()
  const d=descriptor.value
  if(!d||typeof d!=="object"||Array.isArray(d)||![Object.prototype,null].includes(Object.getPrototypeOf(d))||
    Reflect.ownKeys(d).length!==5||agentGeneratedDescriptiveKeys.some(k=>!Object.hasOwn(Object.getOwnPropertyDescriptor(d,k)??{},"value")))
    throw new HttpError(409,"agent_generated_complete_output_required")
  let candidate:AgentSpecInput
  try{candidate=agentReviewRoleCandidate(before,result)}catch{return unavailable()}
  const keep=(spec:AgentSpecInput)=>Object.fromEntries(Object.entries(spec).filter(([key])=>!agentGeneratedDescriptiveKeys.includes(key as typeof agentGeneratedDescriptiveKeys[number])))
  if(canonicalMcpJson(keep(before))!==canonicalMcpJson(keep(candidate))||canonicalMcpJson(agentGeneratedDescriptions(candidate))!==canonicalMcpJson(d))return unavailable()
  return {spec:candidate,changed_keys:agentGeneratedChangedKeys(agentGeneratedDescriptions(before),agentGeneratedDescriptions(candidate))}
}
type Role={id:string;name:string;spec:AgentSpecInput;revision:number;source_sha256:string;requires_approval:true}
export type AgentGeneratedPrepared={preview:AgentGeneratedPreview;role:Role;candidate:AgentSpecInput}
export class AgentGeneratedSourceRepository{
  readonly pool:SqlPool
  constructor(pool:SqlPool){this.pool=pool}
  async prepareOnClient(identity:Identity,db:SqlClient,owner:string,raw:unknown):Promise<AgentGeneratedPrepared>{
    agentGeneratedNative(identity)
    if(!raw||typeof raw!=="object"||Array.isArray(raw)||![Object.prototype,null].includes(Object.getPrototypeOf(raw))||
      Reflect.ownKeys(raw).length!==3||["review_id","spec_id","target_run_id"].some(k=>!Object.hasOwn(Object.getOwnPropertyDescriptor(raw,k)??{},"value")))
      throw new HttpError(400,"invalid_agent_generated_request")
    const selected=parseAgentGeneratedPreviewInput({action:"preview",...raw})
    await assertOwnedAdmissionContext(db,owner)
    const currentEpoch=agentGeneratedEpoch((await db.query<{epoch:unknown}>("SELECT agentstudio.agent_memory_outcome_epoch() AS epoch")).rows[0]?.epoch)
    try{return await this.prepare(identity,db,owner,currentEpoch,selected)}catch(error){
      if(error instanceof HttpError&&!["agent_generated_complete_output_required","agent_generated_change_required","agent_generated_role_changed","agent_generated_feedback_changed","agent_generated_review_not_found"].includes(error.code))return unavailable()
      throw error
    }
  }
  private async prepare(identity:Identity,db:SqlClient,owner:string,currentEpoch:number,selected:ReturnType<typeof parseAgentGeneratedPreviewInput>):Promise<AgentGeneratedPrepared>{
    // This no-lock058 anchor discovers the COMPLETE lock set before body locks.
    const anchorRaw=(await db.query<{value:unknown}>("SELECT agentstudio.agent_opinion_anchor($1::uuid) AS value",[selected.review_id])).rows[0]?.value
    if(anchorRaw===null)throw new HttpError(404,"agent_generated_review_not_found")
    const anchor=parseAgentOpinionAnchor(anchorRaw)
    if(anchor.request_id!==selected.review_id||anchor.spec_id!==selected.spec_id||anchor.run_id!==selected.target_run_id||anchor.purpose!=="optimize"||
      anchor.source_protocol!=="employee_statement_anchor_v1"||anchor.owner_epoch!==currentEpoch||anchor.job_state!=="pending"||anchor.body_erased||
      anchor.lease_state!=="succeeded"||anchor.outcome?.status!=="succeeded"||!anchor.choice)return unavailable()
    const choice=anchor.choice
    for(const run of agentGeneratedSourceRuns(choice))await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1::text,540))",[owner+":"+run])
    const task=(await db.query("SELECT id FROM agentstudio.runs WHERE id=$1::uuid AND owner_user_id=$2::uuid AND agent_spec_id=$3::uuid AND kind='agent' AND status IN('succeeded','failed','cancelled') AND finished_at IS NOT NULL FOR SHARE",[selected.target_run_id,owner,selected.spec_id])).rows[0]
    if(!task)return unavailable()
    // UPDATE precedes Source's role SHARE, including preview; never upgrade.
    const row=(await db.query<Omit<Role,"revision">&{revision:number|string}>("SELECT id,name,spec,revision,requires_approval,agentstudio.agent_optimization_role_sha(id,owner_user_id,name,revision,spec) AS source_sha256 FROM agentstudio.agent_specs WHERE id=$1::uuid AND owner_user_id=$2::uuid FOR UPDATE",[selected.spec_id,owner])).rows[0]
    if(!row||row.id!==selected.spec_id||row.requires_approval!==true||row.spec?.require_approval!==true)return unavailable()
    const {require_approval:_,...input}=row.spec,spec=safeAgentSpec(input)
    if(canonicalMcpJson(spec)!==canonicalMcpJson(row.spec))return unavailable()
    const role:Role={...row,spec,revision:agentGeneratedEpoch(row.revision)}
    if(role.revision!==choice.expected_spec_revision||role.source_sha256!==choice.expected_spec_sha256)throw new HttpError(409,"agent_generated_role_changed")
    // The real implementation validates all actual resources, selected model
    // and feedback on this exact client; no evaluationReader is installed.
    const prepared=await new AgentReviewSourceRepository(this.pool).prepareOnClient(identity,db,owner,choice)
    this.matchPrepared(anchor,prepared,currentEpoch)
    const body=parseAgentOpinionBody((await db.query<{value:unknown}>("SELECT agentstudio.agent_opinion_body($1::uuid,$2::text,$3::text) AS value",[anchor.request_id,anchor.input_sha256,anchor.outcome.result_sha256])).rows[0]?.value)
    if(body.request_id!==anchor.request_id||body.purpose!=="optimize"||body.input_sha256!==anchor.input_sha256||body.result_sha256!==anchor.outcome.result_sha256)return unavailable()
    const refs:AgentGeneratedFeedback[]=[]
    for(const ref of choice.feedback_sources){
      const item=(await db.query<{run_id:string;feedback_id:string;feedback_sha256:string;feedback_revision:number|string;feedback_source_sha256:string;statement_sha256:string}>(
        "SELECT r.run_id,r.request_id AS feedback_id,r.feedback_sha256,r.revision AS feedback_revision,r.source_sha256 AS feedback_source_sha256,r.statement_sha256 FROM agentstudio.agent_feedback_receipts r JOIN agentstudio.agent_feedback_bodies b ON b.owner_user_id=r.owner_user_id AND b.feedback_id=r.request_id JOIN agentstudio.runs t ON t.id=r.run_id AND t.owner_user_id=r.owner_user_id AND t.agent_spec_id=r.spec_id "+
        "WHERE r.owner_user_id=$1::uuid AND r.spec_id=$2::uuid AND r.run_id=$3::uuid AND r.request_id=$4::uuid AND r.action='submit' AND r.feedback_sha256=$5 AND t.kind='agent' AND t.status IN('succeeded','failed','cancelled') AND t.finished_at IS NOT NULL AND agentstudio.agent_feedback_statement_sha256(r.spec_id,r.run_id,r.source_sha256,b.rating,b.tags,b.comment)=r.statement_sha256 AND NOT EXISTS(SELECT 1 FROM agentstudio.agent_feedback_receipts later WHERE later.owner_user_id=r.owner_user_id AND later.run_id=r.run_id AND later.action<>'forget_lesson' AND later.revision>r.revision)",
        [owner,selected.spec_id,ref.run_id,ref.feedback_id,ref.feedback_sha256])).rows[0]
      if(!item)throw new HttpError(409,"agent_generated_feedback_changed")
      refs.push(parseAgentGeneratedFeedback({...item,feedback_revision:agentGeneratedEpoch(item.feedback_revision)}))
    }
    refs.sort((a,b)=>a.run_id<b.run_id?-1:a.run_id>b.run_id?1:a.feedback_id<b.feedback_id?-1:a.feedback_id>b.feedback_id?1:0)
    const candidate=agentGeneratedCandidate(role.spec,body.result),candidate_sha256=agentGeneratedCandidateHash(role.name,candidate.spec)
    const actual=(await db.query<{sha:string}>("SELECT agentstudio.agent_optimization_candidate_sha($1::text,$2::jsonb) AS sha",[role.name,JSON.stringify(candidate.spec)])).rows[0]?.sha
    if(actual!==candidate_sha256)return unavailable()
    const source:AgentGeneratedSource={review_id:anchor.request_id,spec_id:anchor.spec_id,target_run_id:anchor.run_id,review_request_sha256:anchor.request_sha256,
      input_sha256:anchor.input_sha256,content_sha256:anchor.content_sha256,result_sha256:anchor.outcome.result_sha256,completion_sha256:anchor.outcome.completion_sha256,
      source_owner_epoch:anchor.owner_epoch,source_protocol:"employee_statement_anchor_v1"}
    const binding={source,feedback_sources:refs,feedback_sources_sha256:agentGeneratedFeedbackHash(refs),anchor:{run_id:refs[0]!.run_id,feedback_id:refs[0]!.feedback_id},
      before:{revision:role.revision,source_sha256:role.source_sha256,descriptive:agentGeneratedDescriptions(role.spec)},candidate:{descriptive:agentGeneratedDescriptions(candidate.spec),candidate_sha256},changed_keys:candidate.changed_keys}
    const preview=parseAgentGeneratedPreview({protocol:"agent_generated_preview_v1",...binding,preview_sha256:agentGeneratedPreviewHash(binding),recorded:false},selected)
    return {preview,role,candidate:candidate.spec}
  }
  private matchPrepared(anchor:AgentOpinionAnchor,prepared:Awaited<ReturnType<AgentReviewSourceRepository["prepareOnClient"]>>,epoch:number):void{
    if(prepared.owner_epoch!==epoch||prepared.owner_epoch!==anchor.owner_epoch||prepared.source_protocol!==anchor.source_protocol||prepared.input_sha256!==anchor.input_sha256||
      prepared.content_sha256!==anchor.content_sha256||canonicalMcpJson(prepared.choice)!==canonicalMcpJson(anchor.choice))return unavailable()
  }
}
