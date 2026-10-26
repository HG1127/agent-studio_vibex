import {HttpError,isUuid,safeAgentSpec,type AgentSpecInput,type Identity,type SqlClient,type SqlPool} from "./contracts.ts"
import {withActor,assertOwnedAdmissionContext,verifyAgentSpecResources} from "./repository.ts"
import {verifyAgentOptimizationCredentials} from "./agent-optimization-audit.ts"
import {parseFeedbackOptimizationDraft,parseFeedbackOptimizationAcceptance,feedbackOptimizationChangedFields,feedbackOptimizationTrackedFields,type AgentFeedbackOptimizationDraft,type AgentFeedbackOptimizationAcceptance} from "./agent-feedback-optimization-contract.ts"
import {canonicalMcpJson} from "./mcp-catalog.ts"
type Feedback={feedback_id:string;run_id:string;spec_id:string;feedback_sha256:string;feedback_revision:number|string;feedback_source_sha256:string;rating:"up"|"down";tags:string[];comment:string}
type Role={id:string;name:string;spec:AgentSpecInput;revision:number|string;sha:string}
type Link={request_id:string;spec_id:string;run_id:string;feedback_id:string;feedback_sha256:string;feedback_revision:number|string;feedback_source_sha256:string;before_spec_revision:number|string;after_spec_revision:number|string;before_spec_sha256:string;after_spec_sha256:string;before_revision_id:string;after_revision_id:string;changed_keys:string[];candidate_sha256:string;request_sha256:string;created_at:string|Date}
const protocol="agent_feedback_optimization_v1" as const
const columns="request_id,spec_id,run_id,feedback_id,feedback_sha256,feedback_revision,feedback_source_sha256,before_spec_revision,after_spec_revision,before_spec_sha256,after_spec_sha256,before_revision_id,after_revision_id,changed_keys,candidate_sha256,request_sha256,created_at"
function native(identity:Identity){if(identity?.issuer!=="urn:agentstudio:local:v1")throw new HttpError(403,"native_employee_identity_required")}
function number(v:number|string):number{const n=Number(v);if(!Number.isSafeInteger(n)||n<1||n>Number.MAX_SAFE_INTEGER-1)throw new HttpError(409,"agent_optimization_revision_unavailable");return n}
function hash(v:unknown):string{if(typeof v!=="string"||!/^[a-f0-9]{64}$/.test(v))throw new HttpError(409,"agent_optimization_digest_unavailable");return v}
async function required(db:SqlClient){if(!await verifyAgentOptimizationCredentials(db))throw new HttpError(409,"agent_optimization_schema_required")}
async function epoch(db:SqlClient){const n=(await db.query<{epoch:number|string|null}>("SELECT agentstudio.agent_memory_outcome_epoch() AS epoch")).rows[0]?.epoch;if(n===null||n===undefined)throw new HttpError(403,"native_employee_identity_required");return number(n)}
const errors=new Set(["agent_optimization_invalid_intent","agent_optimization_native_employee_required","agent_optimization_feedback_changed","agent_optimization_role_changed","agent_optimization_unsafe_role_transition","agent_optimization_candidate_changed","agent_optimization_change_required","agent_optimization_history_required"])
async function actor<T>(pool:SqlPool,identity:Identity,body:(db:SqlClient,owner:string)=>Promise<T>):Promise<T>{
  native(identity)
  try{return await withActor(pool,identity,async(db,owner)=>{await assertOwnedAdmissionContext(db,owner);await required(db);await epoch(db);return body(db,owner)})}
  catch(error){if(error&&typeof error==="object"&&"code" in error&&error.code==="P0001"&&"message" in error&&errors.has(String(error.message))){const code=String(error.message);throw new HttpError(code==="agent_optimization_invalid_intent"?400:code==="agent_optimization_native_employee_required"?403:409,code)}throw error}
}
export class AgentOptimizationRepository{
  readonly pool:SqlPool;readonly accepting:boolean
  constructor(pool:SqlPool,{allowAcceptance=false}:{allowAcceptance?:boolean}={}){this.pool=pool;this.accepting=allowAcceptance===true}
  private async role(db:SqlClient,owner:string,id:string,lock=false):Promise<Role>{
    const row=(await db.query<Role>("SELECT id,name,spec,revision,agentstudio.agent_optimization_role_sha(id,owner_user_id,name,revision,spec) AS sha FROM agentstudio.agent_specs WHERE id=$1::uuid AND owner_user_id=$2::uuid"+(lock?" FOR UPDATE":" FOR SHARE"),[id,owner])).rows[0]
    if(!row)throw new HttpError(404,"agent_spec_not_found")
    if(!row.spec||typeof row.spec!=="object"||Array.isArray(row.spec)||row.spec.require_approval!==true)throw new HttpError(409,"agent_optimization_role_unavailable")
    const {require_approval:_,...input}=row.spec
    const normalized=safeAgentSpec(input)
    if(canonicalMcpJson(normalized)!==canonicalMcpJson(row.spec))throw new HttpError(409,"agent_optimization_role_unavailable")
    return {...row,spec:normalized,sha:hash(row.sha),revision:number(row.revision)}
  }
  private async feedback(db:SqlClient,owner:string,v:AgentFeedbackOptimizationDraft|AgentFeedbackOptimizationAcceptance):Promise<Feedback>{
    const run=(await db.query("SELECT id FROM agentstudio.runs WHERE id=$1::uuid AND owner_user_id=$2::uuid AND agent_spec_id=$3::uuid AND kind='agent' AND status IN('succeeded','failed','cancelled') AND finished_at IS NOT NULL FOR SHARE",[v.run_id,owner,v.spec_id])).rows[0]
    if(!run)throw new HttpError(404,"agent_run_not_found")
    const row=(await db.query<Feedback>("SELECT r.request_id AS feedback_id,r.run_id,r.spec_id,r.feedback_sha256,r.revision AS feedback_revision,r.source_sha256 AS feedback_source_sha256,b.rating,b.tags,b.comment FROM agentstudio.agent_feedback_receipts r JOIN agentstudio.agent_feedback_bodies b ON b.owner_user_id=r.owner_user_id AND b.feedback_id=r.request_id "+
      "WHERE r.owner_user_id=$1::uuid AND r.request_id=$2::uuid AND r.run_id=$3::uuid AND r.spec_id=$4::uuid AND r.action='submit' AND r.feedback_sha256=$5 AND "+
      "agentstudio.agent_feedback_statement_sha256(r.spec_id,r.run_id,r.source_sha256,b.rating,b.tags,b.comment)=r.statement_sha256 AND NOT EXISTS(SELECT 1 FROM agentstudio.agent_feedback_receipts later WHERE later.owner_user_id=r.owner_user_id AND later.run_id=r.run_id AND later.action<>'forget_lesson' AND later.revision>r.revision)",[owner,v.feedback_id,v.run_id,v.spec_id,v.expected_feedback_sha256])).rows[0]
    if(!row)throw new HttpError(409,"agent_optimization_feedback_changed")
    return row
  }
  private async candidate(db:SqlClient,name:string,spec:AgentSpecInput){return hash((await db.query<{sha:string}>("SELECT agentstudio.agent_optimization_candidate_sha($1,$2::jsonb) AS sha",[name,JSON.stringify(spec)])).rows[0]?.sha)}
  private receipt(row:Link,replayed:boolean){
    const keys=["name",...feedbackOptimizationTrackedFields]
    if(!Array.isArray(row.changed_keys)||!row.changed_keys.length||row.changed_keys.some(k=>!keys.includes(k as typeof keys[number]))||new Set(row.changed_keys).size!==row.changed_keys.length||!row.changed_keys.some(k=>k!=="name"))throw new HttpError(409,"agent_optimization_receipt_unavailable")
    return {protocol,request_id:row.request_id,spec_id:row.spec_id,run_id:row.run_id,feedback_id:row.feedback_id,feedback_sha256:hash(row.feedback_sha256),feedback_revision:number(row.feedback_revision),feedback_source_sha256:hash(row.feedback_source_sha256),
      before_spec_revision:number(row.before_spec_revision),after_spec_revision:number(row.after_spec_revision),before_spec_sha256:hash(row.before_spec_sha256),after_spec_sha256:hash(row.after_spec_sha256),before_revision_id:row.before_revision_id,after_revision_id:row.after_revision_id,changed_keys:[...row.changed_keys],candidate_sha256:hash(row.candidate_sha256),request_sha256:hash(row.request_sha256),created_at:row.created_at,recorded:true as const,replayed}
  }
  private async previous(db:SqlClient,owner:string,v:AgentFeedbackOptimizationAcceptance){
    const row=(await db.query<Link>("SELECT "+columns+" FROM agentstudio.agent_optimization_links WHERE owner_user_id=$1::uuid AND request_id=$2::uuid",[owner,v.request_id])).rows[0]
    if(!row)return null
    if(row.request_sha256!==v.request_sha256||row.spec_id!==v.spec_id||row.run_id!==v.run_id||row.feedback_id!==v.feedback_id||row.feedback_sha256!==v.expected_feedback_sha256||row.before_spec_sha256!==v.expected_spec_sha256||number(row.before_spec_revision)!==v.expected_spec_revision)throw new HttpError(409,"agent_optimization_request_conflict")
    return this.receipt(row,true)
  }
  async preview(identity:Identity,raw:unknown){
    const v=parseFeedbackOptimizationDraft(raw)
    return actor(this.pool,identity,async(db,owner)=>{
      const feedback=await this.feedback(db,owner,v),role=await this.role(db,owner,v.spec_id)
      if(role.revision!==v.expected_spec_revision||role.sha!==v.expected_spec_sha256)throw new HttpError(409,"agent_optimization_role_changed")
      const changed=feedbackOptimizationChangedFields(role,v);await verifyAgentSpecResources(db,owner,v.spec)
      return {protocol,spec_id:v.spec_id,run_id:v.run_id,feedback_id:feedback.feedback_id,feedback_sha256:feedback.feedback_sha256,feedback_revision:number(feedback.feedback_revision),feedback_source_sha256:feedback.feedback_source_sha256,
        feedback:{rating:feedback.rating,tags:[...feedback.tags],comment:feedback.comment},before:{name:role.name,spec:role.spec,revision:number(role.revision),source_sha256:role.sha},candidate:{name:v.name,spec:v.spec,candidate_sha256:await this.candidate(db,v.name,v.spec)},changed_keys:changed,recorded:false as const}
    })
  }
  async confirm(identity:Identity,raw:unknown){
    const v=parseFeedbackOptimizationAcceptance(raw)
    return actor(this.pool,identity,async(db,owner)=>{const old=await this.previous(db,owner,v);if(!old)throw new HttpError(404,"agent_optimization_receipt_not_found");return old})
  }
  async accept(identity:Identity,raw:unknown){
    const v=parseFeedbackOptimizationAcceptance(raw)
    return actor(this.pool,identity,async(db,owner)=>{
      await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1::text,551))",[owner+":"+v.request_id])
      const old=await this.previous(db,owner,v);if(old)return old
      if((await db.query("SELECT request_id FROM agentstudio.agent_optimization_intents WHERE owner_user_id=$1::uuid AND request_id=$2::uuid",[owner,v.request_id])).rows.length)throw new HttpError(409,"agent_optimization_acceptance_unconfirmed")
      if(!this.accepting)throw new HttpError(403,"agent_optimization_acceptance_disabled")
      await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1::text,540))",[owner+":"+v.run_id])
      await this.feedback(db,owner,v);const role=await this.role(db,owner,v.spec_id,true)
      if(role.revision!==v.expected_spec_revision||role.sha!==v.expected_spec_sha256)throw new HttpError(409,"agent_optimization_role_changed")
      const changed=feedbackOptimizationChangedFields(role,v);await verifyAgentSpecResources(db,owner,v.spec)
      const candidate=await this.candidate(db,v.name,v.spec)
      await db.query("INSERT INTO agentstudio.agent_optimization_intents(owner_user_id,request_id,spec_id,run_id,feedback_id,feedback_sha256,before_spec_revision,before_spec_sha256,candidate_sha256,request_sha256) VALUES($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6,$7::bigint,$8,$9,$10)",[owner,v.request_id,v.spec_id,v.run_id,v.feedback_id,v.expected_feedback_sha256,v.expected_spec_revision,v.expected_spec_sha256,candidate,v.request_sha256])
      const updated=(await db.query("UPDATE agentstudio.agent_specs SET name=$3,spec=$4::jsonb,requires_approval=true,revision=revision+1,updated_at=clock_timestamp() WHERE id=$1::uuid AND owner_user_id=$2::uuid AND revision=$5::bigint RETURNING id",[v.spec_id,owner,v.name,JSON.stringify(v.spec),v.expected_spec_revision])).rows
      if(updated.length!==1)throw new HttpError(409,"agent_optimization_role_changed")
      const row=(await db.query<Link>("SELECT "+columns+" FROM agentstudio.agent_optimization_links WHERE owner_user_id=$1::uuid AND request_id=$2::uuid",[owner,v.request_id])).rows[0]
      if(!row||row.request_sha256!==v.request_sha256||row.candidate_sha256!==candidate||row.before_spec_sha256!==v.expected_spec_sha256||number(row.after_spec_revision)!==v.expected_spec_revision+1||canonicalMcpJson(row.changed_keys)!==canonicalMcpJson(changed))throw new HttpError(409,"agent_optimization_receipt_unavailable")
      return this.receipt(row,false)
    })
  }
  async list(identity:Identity,specId:string){
    if(!isUuid(specId))throw new HttpError(400,"invalid_agent_optimization_spec");specId=specId.toLowerCase()
    return actor(this.pool,identity,async(db,owner)=>{
      await this.role(db,owner,specId)
      const rows=(await db.query<Link&{feedback_unchanged:boolean;role_current:boolean}>("SELECT "+columns.split(',').map(c=>"l."+c).join(',')+", "+
        "EXISTS(SELECT 1 FROM agentstudio.agent_feedback_receipts r JOIN agentstudio.agent_feedback_bodies b ON b.owner_user_id=r.owner_user_id AND b.feedback_id=r.request_id WHERE r.owner_user_id=l.owner_user_id AND r.request_id=l.feedback_id AND r.spec_id=l.spec_id AND r.run_id=l.run_id AND r.action='submit' AND r.feedback_sha256=l.feedback_sha256 AND agentstudio.agent_feedback_statement_sha256(r.spec_id,r.run_id,r.source_sha256,b.rating,b.tags,b.comment)=r.statement_sha256 AND NOT EXISTS(SELECT 1 FROM agentstudio.agent_feedback_receipts later WHERE later.owner_user_id=r.owner_user_id AND later.run_id=r.run_id AND later.action<>'forget_lesson' AND later.revision>r.revision)) AS feedback_unchanged, "+
        "s.revision=l.after_spec_revision AND agentstudio.agent_optimization_role_sha(s.id,s.owner_user_id,s.name,s.revision,s.spec)=l.after_spec_sha256 AS role_current "+
        "FROM agentstudio.agent_optimization_links l JOIN agentstudio.agent_specs s ON s.id=l.spec_id AND s.owner_user_id=l.owner_user_id WHERE l.owner_user_id=$1::uuid AND l.spec_id=$2::uuid ORDER BY l.created_at DESC,l.request_id DESC LIMIT 80",[owner,specId])).rows
      return {protocol,spec_id:specId,items:rows.map(row=>({...this.receipt(row,true),feedback_unchanged:row.feedback_unchanged===true,role_current:row.role_current===true})),limit:80}
    })
  }
}
