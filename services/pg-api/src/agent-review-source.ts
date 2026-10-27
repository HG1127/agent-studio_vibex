// Internal preparation, reusable on the verified admission transaction. No
// HTTP route, Worker lease, provider effect or result publication is mounted.
import {HttpError,isUuid,safeAgentSpec,type Identity,type SqlPool,type SqlClient,type AgentSpecInput} from "./contracts.ts"
import {withActor,assertOwnedAdmissionContext,verifyAgentSpecResources} from "./repository.ts"
import {verifyAgentOptimizationCredentials} from "./agent-optimization-audit.ts"
import {loadAgentFeedbackTask,verifyAgentFeedbackLessonSource,type AgentFeedbackTask} from "./agent-feedback-source.ts"
import {parseAgentReviewPreview,type AgentReviewPreview} from "./agent-review-contract.ts"
import {prepareAgentReviewInput} from "./agent-review-input.ts"
import {agentMemoryHash} from "./agent-memory-contract.ts"
import {canonicalMcpJson} from "./mcp-catalog.ts"
import {exactProviderEndpoint} from "./model-connection-probe.ts"

type Target={purpose:"evaluate"|"optimize";spec_id:string;run_id:string}
type Role={name:string;spec:AgentSpecInput;revision:number|string;source_sha256:string}
type Feedback={run_id:string;feedback_id:string;feedback_sha256:string;rating:"up"|"down";tags:string[];comment:string}
// Supplied only by a future server-side ledger repository after checking its
// protected result and current transitive sources. Browser/Worker data cannot
// provide this dependency. With no installed ledger reader, selected prior
// opinions fail closed rather than becoming unaudited model material.
export type AgentReviewEvaluationReader=(db:SqlClient,owner:string,spec:string,source:AgentReviewPreview["evaluation_sources"][number])=>Promise<{run_id:string;review_id:string;result_sha256:string;evaluation:unknown}>
const unavailable=():never=>{throw new HttpError(409,"agent_review_source_unavailable")}
function target(raw:unknown):Target{
  if(!raw||typeof raw!=="object"||Array.isArray(raw)||![Object.prototype,null].includes(Object.getPrototypeOf(raw)))throw new HttpError(400,"invalid_agent_review_target")
  const v=raw as Record<string,unknown>,keys=["purpose","spec_id","run_id"]
  if(Reflect.ownKeys(v).length!==keys.length||keys.some(k=>!Object.hasOwn(Object.getOwnPropertyDescriptor(v,k)??{},"value"))||v.purpose!=="evaluate"&&v.purpose!=="optimize"||!isUuid(v.spec_id)||!isUuid(v.run_id))throw new HttpError(400,"invalid_agent_review_target")
  return {purpose:v.purpose,spec_id:v.spec_id.toLowerCase(),run_id:v.run_id.toLowerCase()}
}
function number(raw:unknown):number{const n=Number(raw);if(!Number.isSafeInteger(n)||n<1||n>Number.MAX_SAFE_INTEGER-2)return unavailable();return n}
function sha(raw:unknown):string{if(typeof raw!=="string"||!/^[a-f0-9]{64}$/.test(raw))return unavailable();return raw}
function models(raw:unknown):string[]{if(typeof raw==="string")try{raw=JSON.parse(raw)}catch{return unavailable()};if(!Array.isArray(raw)||raw.some(v=>typeof v!=="string"))return unavailable();return raw as string[]}
const date=(raw:unknown)=>{const value=raw instanceof Date?raw.toISOString():String(raw);if(!Number.isFinite(Date.parse(value)))return unavailable();return new Date(value).toISOString()}
export class AgentReviewSourceRepository{
  readonly pool:SqlPool;readonly evaluationReader?:AgentReviewEvaluationReader
  constructor(pool:SqlPool,{evaluationReader}:{evaluationReader?:AgentReviewEvaluationReader}={}){this.pool=pool;this.evaluationReader=evaluationReader}
  private async verifiedContext(identity:Identity,db:SqlClient,owner:string):Promise<number>{
    if(identity?.issuer!=="urn:agentstudio:local:v1")throw new HttpError(403,"native_employee_identity_required")
    await assertOwnedAdmissionContext(db,owner)
    const mapped=(await db.query<{id:string|null}>("SELECT agentstudio.identity_user_id($1::text,$2::text) AS id",[identity.issuer,identity.subject])).rows[0]?.id
    if(mapped!==owner)throw new HttpError(403,"owned_admission_context_required")
    if(!await verifyAgentOptimizationCredentials(db))throw new HttpError(409,"agent_review_source_schema_required")
    const epoch=(await db.query<{epoch:unknown}>("SELECT agentstudio.agent_memory_outcome_epoch() AS epoch")).rows[0]?.epoch
    if(epoch===null||epoch===undefined)throw new HttpError(403,"native_employee_identity_required")
    return number(epoch)
  }
  private async actor<T>(identity:Identity,body:(db:SqlClient,owner:string,epoch:number)=>Promise<T>):Promise<T>{
    if(identity?.issuer!=="urn:agentstudio:local:v1")throw new HttpError(403,"native_employee_identity_required")
    return withActor(this.pool,identity,async(db,owner)=>{
      return body(db,owner,await this.verifiedContext(identity,db,owner))
    })
  }
  private async locks(db:SqlClient,owner:string,ids:string[]){for(const id of [...new Set(ids)].sort())await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1::text,540))",[owner+":"+id])}
  private async context(db:SqlClient,owner:string,value:Target):Promise<{role:Role;task:AgentFeedbackTask;source_sha256:string;source_protocol:"current_task_delivery_v1"|"employee_statement_anchor_v1"}>{
    const task=await loadAgentFeedbackTask(db,owner,value.run_id,value.spec_id)
    if(task.row.kind!=="agent"||!["succeeded","failed","cancelled"].includes(task.row.status)||!task.row.finished_at)throw new HttpError(409,"agent_review_terminal_task_required")
    const row=(await db.query<Role>("SELECT name,spec,revision,agentstudio.agent_optimization_role_sha(id,owner_user_id,name,revision,spec) AS source_sha256 FROM agentstudio.agent_specs WHERE id=$1::uuid AND owner_user_id=$2::uuid FOR SHARE",[value.spec_id,owner])).rows[0]
    if(!row)throw new HttpError(404,"agent_spec_not_found")
    const {require_approval,...input}=row.spec??{}
    if(require_approval!==true)return unavailable()
    const spec=safeAgentSpec(input)
    if(canonicalMcpJson(spec)!==canonicalMcpJson(row.spec))return unavailable()
    await verifyAgentSpecResources(db,owner,spec)
    const role={...row,spec,revision:number(row.revision),source_sha256:sha(row.source_sha256)}
    if(value.purpose==="evaluate"){
      const source=sha(task.source_sha256)
      // This verifies original task role/resources, human/manual-memory sources
      // and current observations, and refuses started/unknown effects. It does
      // not relabel cancellation/failure as successful engine delivery.
      await verifyAgentFeedbackLessonSource(db,owner,task,source)
      return {role,task,source_sha256:source,source_protocol:"current_task_delivery_v1"}
    }
    // Optimization transmits no old task instruction/result/checkpoint. Its
    // anchor is explicitly terminal metadata, not a VM/KB proof. This remains
    // usable after checkpoint pruning only with currently owned statements,
    // a valid current role and a separately selected active review model.
    const anchor={protocol:"agent_review_statement_anchor_v1",owner,spec_id:value.spec_id,run_id:value.run_id,status:task.row.status,finished_at:date(task.row.finished_at)}
    return {role,task,source_sha256:agentMemoryHash(canonicalMcpJson(anchor)),source_protocol:"employee_statement_anchor_v1"}
  }
  async source(identity:Identity,raw:unknown){
    const selected=target(raw)
    return this.actor(identity,async(db,owner)=>{await this.locks(db,owner,[selected.run_id]);const c=await this.context(db,owner,selected);return {protocol:"agent_review_source_v1" as const,...selected,expected_source_sha256:c.source_sha256,expected_spec_revision:number(c.role.revision),expected_spec_sha256:c.role.source_sha256,source_protocol:c.source_protocol,recorded:false as const}})
  }
  async preview(identity:Identity,raw:unknown){
    const choice=parseAgentReviewPreview(raw)
    return this.actor(identity,(db,owner,epoch)=>this.prepare(db,owner,epoch,choice))
  }
  // Caller owns BEGIN/COMMIT. All source locks and Native epoch validation
  // remain held until the associated receipt/input/queue/audit commits.
  async prepareOnClient(identity:Identity,db:SqlClient,owner:string,raw:unknown){
    const choice=parseAgentReviewPreview(raw),epoch=await this.verifiedContext(identity,db,owner)
    return this.prepare(db,owner,epoch,choice)
  }
  private async prepare(db:SqlClient,owner:string,owner_epoch:number,choice:AgentReviewPreview){
      await this.locks(db,owner,[choice.run_id,...choice.feedback_sources.map(s=>s.run_id),...choice.evaluation_sources.map(s=>s.run_id)])
      const c=await this.context(db,owner,choice)
      if(c.source_sha256!==choice.expected_source_sha256||number(c.role.revision)!==choice.expected_spec_revision||c.role.source_sha256!==choice.expected_spec_sha256)return unavailable()
      const selected=choice.model_binding,model=(await db.query<{revision:unknown;enabled:boolean;status:string;models:unknown;provider:"openai"|"anthropic"|"gemini";base_url:string}>("SELECT revision,enabled,status,models,provider,base_url FROM agentstudio.model_connections WHERE id=$1::uuid AND owner_user_id=$2::uuid FOR SHARE",[selected.connection_id,owner])).rows[0]
      if(!model||number(model.revision)!==selected.connection_revision||!model.enabled||model.status!=="ok"||!models(model.models).includes(selected.model_id))throw new HttpError(409,"agent_review_model_unavailable")
      try{exactProviderEndpoint(model)}catch{throw new HttpError(409,"agent_review_model_unavailable")}
      const feedback:Feedback[]=[]
      for(const source of choice.feedback_sources){
        const row=(await db.query<Feedback>("SELECT r.run_id,r.request_id AS feedback_id,r.feedback_sha256,b.rating,b.tags,b.comment FROM agentstudio.agent_feedback_receipts r JOIN agentstudio.agent_feedback_bodies b ON b.owner_user_id=r.owner_user_id AND b.feedback_id=r.request_id JOIN agentstudio.runs t ON t.id=r.run_id AND t.owner_user_id=r.owner_user_id AND t.agent_spec_id=r.spec_id "+
          "WHERE r.owner_user_id=$1::uuid AND r.spec_id=$2::uuid AND r.run_id=$3::uuid AND r.request_id=$4::uuid AND r.action='submit' AND r.feedback_sha256=$5 AND t.kind='agent' AND t.status IN('succeeded','failed','cancelled') AND t.finished_at IS NOT NULL AND "+
          "agentstudio.agent_feedback_statement_sha256(r.spec_id,r.run_id,r.source_sha256,b.rating,b.tags,b.comment)=r.statement_sha256 AND NOT EXISTS(SELECT 1 FROM agentstudio.agent_feedback_receipts later WHERE later.owner_user_id=r.owner_user_id AND later.run_id=r.run_id AND later.action<>'forget_lesson' AND later.revision>r.revision)",[owner,choice.spec_id,source.run_id,source.feedback_id,source.feedback_sha256])).rows[0]
        if(!row)throw new HttpError(409,"agent_review_feedback_changed")
        feedback.push(row)
      }
      const evaluations=[]
      for(const source of choice.evaluation_sources){
        if(!this.evaluationReader)throw new HttpError(409,"agent_review_evaluation_source_unavailable")
        evaluations.push(await this.evaluationReader(db,owner,choice.spec_id,source))
      }
      const task=choice.purpose==="evaluate"?c.task.row:{...c.task.row,instruction:"",result_text:""}
      const input=prepareAgentReviewInput(choice,{role:c.role,run:{id:task.id,spec_id:choice.spec_id,status:task.status,instruction:task.instruction,result_text:task.result_text,source_sha256:c.source_sha256},feedback,evaluations})
      const input_sha256=agentMemoryHash(canonicalMcpJson({protocol:"agent_paid_review_prepared_input_v1",owner,owner_epoch,source_protocol:c.source_protocol,content_sha256:input.input_sha256}))
      return {...input,protocol:"agent_paid_review_prepared_input_v1" as const,content_sha256:input.input_sha256,input_sha256,choice,source_protocol:c.source_protocol,owner_epoch,recorded:false as const}
  }
}
