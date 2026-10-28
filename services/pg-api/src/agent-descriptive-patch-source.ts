// Internal S1 fresh-preview preparation only. Reuses the caller's verified
// Native admission client; opens no transaction, client, provider or write.
// This is not protected SQL acceptance, schema activation or persistence.
import {HttpError,safeAgentSpec,type Identity,type SqlClient,type SqlPool,type AgentSpecInput} from "./contracts.ts"
import {assertOwnedAdmissionContext} from "./repository.ts"
import {AgentReviewSourceRepository} from "./agent-review-source.ts"
import {agentGeneratedNative,agentGeneratedEpoch,agentGeneratedSourceRuns} from "./agent-generated-source.ts"
import {parseAgentOpinionAnchor,parseAgentOpinionBody,type AgentOpinionAnchor} from "./agent-opinion-contract.ts"
import {canonicalMcpJson} from "./mcp-catalog.ts"
import {parseAgentDescriptivePatchPreviewInput,parseAgentDescriptivePatchPreview,createAgentDescriptivePatchPreview,
  deriveAgentDescriptivePatchCandidate,type DescriptivePatchFeedback,type DescriptivePatchPreview} from "./agent-descriptive-patch-contract.ts"

type Role={id:string;name:string;spec:AgentSpecInput;revision:number;source_sha256:string;requires_approval:true}
export type AgentDescriptivePatchPrepared={preview:DescriptivePatchPreview;role:Role;candidate:AgentSpecInput;optimization_candidate_sha256:string}
const unavailable=():never=>{throw new HttpError(409,"agent_descriptive_patch_source_unavailable")}
function selection(raw:unknown){
  const keys=["review_id","spec_id","target_run_id"]
  if(!raw||typeof raw!=="object"||![Object.prototype,null].includes(Object.getPrototypeOf(raw))||Reflect.ownKeys(raw).length!==keys.length||keys.some(k=>{
    const d=Object.getOwnPropertyDescriptor(raw,k);return !d?.enumerable||!Object.hasOwn(d,"value")
  }))throw new HttpError(400,"invalid_agent_descriptive_patch_request")
  return parseAgentDescriptivePatchPreviewInput({action:"preview",...raw})
}
export class AgentDescriptivePatchSourceRepository{
  readonly pool:SqlPool
  constructor(pool:SqlPool){this.pool=pool}
  async prepareOnClient(identity:Identity,db:SqlClient,owner:string,raw:unknown):Promise<AgentDescriptivePatchPrepared>{
    agentGeneratedNative(identity)
    const selected=selection(raw)
    await assertOwnedAdmissionContext(db,owner)
    try{
      const epoch=agentGeneratedEpoch((await db.query<{epoch:unknown}>("SELECT agentstudio.agent_memory_outcome_epoch() AS epoch")).rows[0]?.epoch)
      return await this.prepare(identity,db,owner,epoch,selected)
    }catch(error){
      if(error&&typeof error==="object"&&"code" in error&&error.code==="P0001"&&"message" in error&&error.message==="agent_opinion_not_found")throw new HttpError(404,"agent_descriptive_patch_review_not_found")
      if(error instanceof HttpError&&["native_employee_identity_required","owned_admission_context_required","agent_descriptive_patch_review_not_found","agent_descriptive_patch_role_changed","agent_descriptive_patch_feedback_changed","agent_descriptive_patch_change_required"].includes(error.code))throw error
      return unavailable()
    }
  }
  private async prepare(identity:Identity,db:SqlClient,owner:string,epoch:number,selected:ReturnType<typeof parseAgentDescriptivePatchPreviewInput>):Promise<AgentDescriptivePatchPrepared>{
    //058 discovery does not lock/read the private body. Take the COMPLETE540
    // set before any role/source/body locks, including lower feedback run IDs.
    const rawAnchor=(await db.query<{value:unknown}>("SELECT agentstudio.agent_opinion_anchor($1::uuid) AS value",[selected.review_id])).rows[0]?.value
    if(rawAnchor===null)throw new HttpError(404,"agent_descriptive_patch_review_not_found")
    const anchor=parseAgentOpinionAnchor(rawAnchor)
    if(anchor.request_id!==selected.review_id||anchor.spec_id!==selected.spec_id||anchor.run_id!==selected.target_run_id||anchor.purpose!=="optimize"||anchor.source_protocol!=="employee_statement_anchor_v1"||anchor.owner_epoch!==epoch||anchor.job_state!=="pending"||anchor.body_erased||anchor.lease_state!=="succeeded"||anchor.outcome?.status!=="succeeded"||!anchor.choice)return unavailable()
    const choice=anchor.choice
    for(const run of agentGeneratedSourceRuns(choice))await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1::text,540))",[owner+":"+run])
    const task=(await db.query<{id:string}>("SELECT id FROM agentstudio.runs WHERE id=$1::uuid AND owner_user_id=$2::uuid AND agent_spec_id=$3::uuid AND kind='agent' AND status IN('succeeded','failed','cancelled') AND finished_at IS NOT NULL FOR SHARE",[selected.target_run_id,owner,selected.spec_id])).rows[0]
    if(task?.id!==selected.target_run_id)return unavailable()
    // Never upgrade Source's role SHARE to UPDATE in reverse order.
    const row=(await db.query<Omit<Role,"revision">&{revision:number|string}>("SELECT id,name,spec,revision,requires_approval,agentstudio.agent_optimization_role_sha(id,owner_user_id,name,revision,spec) AS source_sha256 FROM agentstudio.agent_specs WHERE id=$1::uuid AND owner_user_id=$2::uuid FOR UPDATE",[selected.spec_id,owner])).rows[0]
    if(!row||row.id!==selected.spec_id||row.requires_approval!==true||row.spec?.require_approval!==true)return unavailable()
    const {require_approval:_,...input}=row.spec,spec=safeAgentSpec(input)
    if(canonicalMcpJson(spec)!==canonicalMcpJson(row.spec))return unavailable()
    const role:Role={id:row.id,name:row.name,spec,revision:agentGeneratedEpoch(row.revision),source_sha256:row.source_sha256,requires_approval:true}
    if(role.revision!==choice.expected_spec_revision||role.source_sha256!==choice.expected_spec_sha256)throw new HttpError(409,"agent_descriptive_patch_role_changed")
    // Real production Source, no injectable evaluationReader/alternate pool.
    // It rechecks the mapped Native owner, full predecessor audit, epoch,
    // terminal task, current resources/model and every actual feedback body on
    // this SAME client. Reentrant540/role SHARE follow our complete lock set.
    const prepared=await new AgentReviewSourceRepository(this.pool).prepareOnClient(identity,db,owner,choice)
    this.matchPrepared(anchor,prepared,epoch)
    const body=parseAgentOpinionBody((await db.query<{value:unknown}>("SELECT agentstudio.agent_opinion_body($1::uuid,$2::text,$3::text) AS value",[anchor.request_id,anchor.input_sha256,anchor.outcome.result_sha256])).rows[0]?.value)
    if(body.request_id!==anchor.request_id||body.purpose!=="optimize"||body.input_sha256!==anchor.input_sha256||body.result_sha256!==anchor.outcome.result_sha256)return unavailable()
    const refs:DescriptivePatchFeedback[]=[]
    for(const ref of choice.feedback_sources){
      const item=(await db.query<Omit<DescriptivePatchFeedback,"feedback_revision">&{feedback_revision:number|string}>(
        "SELECT r.run_id,r.request_id AS feedback_id,r.feedback_sha256,r.revision AS feedback_revision,r.source_sha256 AS feedback_source_sha256,r.statement_sha256 FROM agentstudio.agent_feedback_receipts r JOIN agentstudio.agent_feedback_bodies b ON b.owner_user_id=r.owner_user_id AND b.feedback_id=r.request_id JOIN agentstudio.runs t ON t.id=r.run_id AND t.owner_user_id=r.owner_user_id AND t.agent_spec_id=r.spec_id "+
        "WHERE r.owner_user_id=$1::uuid AND r.spec_id=$2::uuid AND r.run_id=$3::uuid AND r.request_id=$4::uuid AND r.action='submit' AND r.feedback_sha256=$5 AND t.kind='agent' AND t.status IN('succeeded','failed','cancelled') AND t.finished_at IS NOT NULL AND agentstudio.agent_feedback_statement_sha256(r.spec_id,r.run_id,r.source_sha256,b.rating,b.tags,b.comment)=r.statement_sha256 AND NOT EXISTS(SELECT 1 FROM agentstudio.agent_feedback_receipts later WHERE later.owner_user_id=r.owner_user_id AND later.run_id=r.run_id AND later.action<>'forget_lesson' AND later.revision>r.revision)",
        [owner,selected.spec_id,ref.run_id,ref.feedback_id,ref.feedback_sha256])).rows[0]
      if(!item)throw new HttpError(409,"agent_descriptive_patch_feedback_changed")
      refs.push({...item,feedback_revision:agentGeneratedEpoch(item.feedback_revision)})
    }
    refs.sort((a,b)=>a.run_id<b.run_id?-1:a.run_id>b.run_id?1:0)
    // Only actual protected058 body supplies generated keys. The complete role
    // comes only from the UPDATE-locked record; nothing pads the model output.
    const candidate=deriveAgentDescriptivePatchCandidate(role.name,role.spec,body.result)
    const actual=(await db.query<{sha:string}>("SELECT agentstudio.agent_optimization_candidate_sha($1::text,$2::jsonb) AS sha",[role.name,JSON.stringify(candidate.spec)])).rows[0]?.sha
    if(actual!==candidate.optimization_candidate_sha256)return unavailable()
    const preview=createAgentDescriptivePatchPreview({anchor,body,role,feedback_sources:refs,current:{owner_epoch:prepared.owner_epoch,source_protocol:prepared.source_protocol,input_sha256:prepared.input_sha256,content_sha256:prepared.content_sha256,choice:prepared.choice}})
    // Deliberate public projection: raw private body/prepared messages/current
    // choice/full protected candidate never appear inside the public preview.
    return {preview:parseAgentDescriptivePatchPreview(preview,selected),role,candidate:candidate.spec,optimization_candidate_sha256:candidate.optimization_candidate_sha256}
  }
  private matchPrepared(anchor:AgentOpinionAnchor,prepared:Awaited<ReturnType<AgentReviewSourceRepository["prepareOnClient"]>>,epoch:number):void{
    if(prepared.owner_epoch!==epoch||prepared.owner_epoch!==anchor.owner_epoch||prepared.source_protocol!==anchor.source_protocol||prepared.input_sha256!==anchor.input_sha256||prepared.content_sha256!==anchor.content_sha256||canonicalMcpJson(prepared.choice)!==canonicalMcpJson(anchor.choice))return unavailable()
  }
}
