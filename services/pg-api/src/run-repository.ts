// V8 PostgreSQL: authenticated, owner-scoped Agent prepare RUN queue.
// Creating a run does NOT execute a model, tool, Workflow or external POST.
import {HttpError,isUuid,type Identity,type SqlPool,type SqlClient}
  from "./contracts.ts"
import {withActor} from "./repository.ts"
import {requireKnowledgeScope,storedKnowledgeIds} from "./knowledge-runtime-scope.ts"
import {sharedKnowledgeScopeEnabled} from "./knowledge-scope-policy.ts"
import {exactProviderEndpoint} from "./model-connection-probe.ts"
import type {ModelProvider} from "./model-connection-repository.ts"
import {safeRunStepMetadata} from "./run-step-metadata.ts"
import {currentSingleAgentOutputs} from "./knowledge-agent-execution.ts"

export type RunStatus =
  "queued"|"running"|"awaiting_approval"|"paused"|
  "succeeded"|"failed"|"cancelled"
export interface RunRow {
  id:string
  owner_user_id:string
  agent_spec_id:string
  kind:"agent"
  status:RunStatus
  instruction:string
  result_text:string
  checkpoint:Record<string,unknown>
  step_count:number
  last_error_code:string
  created_at:string
  updated_at:string
  finished_at:string|null
  knowledge_outputs_available?:boolean
}
export interface RunSubmission {
  run:RunRow
  replayed:boolean
}
export interface RunStepRow {
  step_key:string;status:string;metadata:Record<string,unknown>
  created_at:string;updated_at:string
}
export function safeRunRequest(raw:unknown):{
  instruction:string;idempotency_key:string
} {
  if(!raw||typeof raw!=="object"||Array.isArray(raw))
    throw new HttpError(400,"invalid_run_request")
  const data=raw as Record<string,unknown>
  if(Object.keys(data).some(k=>!["instruction","idempotency_key"].includes(k)))
    throw new HttpError(400,"unsafe_run_field")
  const instruction=data.instruction===undefined?"":data.instruction
  if(typeof instruction!=="string"||instruction.length>2000 ||
    instruction.includes("\u0000"))
    throw new HttpError(400,"invalid_run_instruction")
  const key=data.idempotency_key
  if(typeof key!=="string"||!/^[a-zA-Z0-9_-]{8,80}$/.test(key))
    throw new HttpError(400,"invalid_idempotency_key")
  return {instruction:instruction.trim(),idempotency_key:key}
}
const cols=
  "id,owner_user_id,agent_spec_id,kind,status,instruction,result_text,checkpoint,"+
  "step_count,last_error_code,created_at,updated_at,finished_at"
function normalized(row:RunRow):RunRow {
  return {...row,step_count:Number(row.step_count)}
}
async function projected(db:SqlClient,row:RunRow):Promise<RunRow>{
  const available=await currentSingleAgentOutputs(db,row.id)
  return {...normalized(row),...(available===undefined?{}:{knowledge_outputs_available:available}),
    ...(available===false?{result_text:""}:{})}
}
// Identical SQL is used both for the initial idempotency check and for
// recovering a concurrent unique-key race only AFTER transaction rollback.
const runByIdempotencyKeySql=
  "SELECT r."+cols.replaceAll(",",",r.")+" FROM agentstudio.jobs AS j "+
  "JOIN agentstudio.runs AS r ON r.id=j.run_id "+
  "AND r.owner_user_id=j.owner_user_id "+
  "WHERE j.owner_user_id=$1::uuid AND j.kind='run_tick' "+
  "AND j.dedupe_key=$2::text LIMIT 1"
export class RunRepository {
  readonly pool:SqlPool
  readonly allowBoundModelRuns:boolean
  // Owner-bound admission is an explicit, independent capability. Native
  // composition requires config + Run/approval + generation UAT approval.
  constructor(pool:SqlPool,options:{allowBoundModelRuns?:boolean}={}){
    this.pool=pool
    this.allowBoundModelRuns=options.allowBoundModelRuns===true
  }

  list(identity:Identity,limit=30):Promise<RunRow[]> {
    const bounded=Math.max(1,Math.min(50,Math.trunc(limit)))
    return withActor(this.pool,identity,async(db,actor)=>{
      const result=await db.query<RunRow>(
        "SELECT "+cols+" FROM agentstudio.runs "+
        "WHERE kind='agent' AND coalesce(checkpoint->>'execution_mode','')<>'agent_native_v2' AND owner_user_id=$1::uuid "+
        "ORDER BY created_at DESC,id LIMIT $2::int",[actor,bounded])
      const rows:RunRow[]=[]
      for(const row of result.rows)rows.push(await projected(db,row))
      return rows
    })
  }
  get(identity:Identity,id:string):Promise<RunRow|null> {
    if(!isUuid(id))throw new HttpError(400,"invalid_run_id")
    return withActor(this.pool,identity,async(db,actor)=>{
      const result=await db.query<RunRow>(
        "SELECT "+cols+" FROM agentstudio.runs "+
        "WHERE id=$1::uuid AND owner_user_id=$2::uuid AND kind='agent' AND coalesce(checkpoint->>'execution_mode','')<>'agent_native_v2'",
        [id,actor])
      return result.rows[0]?projected(db,result.rows[0]):null
    })
  }
  steps(identity:Identity,runId:string):Promise<RunStepRow[]> {
    if(!isUuid(runId))throw new HttpError(400,"invalid_run_id")
    return withActor(this.pool,identity,async(db,actor)=>{
      const result=await db.query<RunStepRow>(
        "SELECT s.step_key,s.status,s.metadata,s.created_at,s.updated_at "+
        "FROM agentstudio.run_steps AS s JOIN agentstudio.runs AS r "+
        "ON r.id=s.run_id AND r.owner_user_id=s.owner_user_id "+
        "WHERE s.run_id=$1::uuid AND s.owner_user_id=$2::uuid "+
        "AND r.kind='agent' AND coalesce(r.checkpoint->>'execution_mode','')<>'agent_native_v2' ORDER BY s.created_at,s.step_key LIMIT 40",
        [runId,actor])
      const available=await currentSingleAgentOutputs(db,runId)
      return result.rows.map(step=>({...step,metadata:available===false?{}:safeRunStepMetadata(step.metadata)}))
    })
  }
  approval(identity:Identity,runId:string):Promise<{status:string;step_key:string}|null> {
    if(!isUuid(runId))throw new HttpError(400,"invalid_run_id")
    return withActor(this.pool,identity,async(db,actor)=>{
      const rows=await db.query<{status:string;step_key:string}>(
        "SELECT a.status,a.step_key FROM agentstudio.approvals AS a "+
        "JOIN agentstudio.runs AS r ON r.id=a.run_id "+
        "AND r.owner_user_id=a.owner_user_id "+
        "WHERE r.id=$1::uuid AND r.owner_user_id=$2::uuid "+
        "AND r.kind='agent' AND coalesce(r.checkpoint->>'execution_mode','')<>'agent_native_v2' AND a.step_key='model'",[runId,actor])
      return rows.rows[0]??null
    })
  }
  decideModel(identity:Identity,runId:string,raw:unknown):
    Promise<{run:RunRow;approval:string;replayed:boolean}> {
    if(!isUuid(runId))throw new HttpError(400,"invalid_run_id")
    if(!raw||typeof raw!=="object"||Array.isArray(raw))
      throw new HttpError(400,"invalid_approval_decision")
    const fields=raw as Record<string,unknown>
    if(Object.keys(fields).length!==1||!["approved","rejected"].includes(String(fields.decision)))
      throw new HttpError(400,"invalid_approval_decision")
    const decision=fields.decision as "approved"|"rejected"
    return withActor(this.pool,identity,async(db,actor)=>{
      // Row lock serializes competing approvals, model job creation, and replay.
      const previous=await db.query<RunRow>(
        "SELECT "+cols+" FROM agentstudio.runs WHERE id=$1::uuid "+
        "AND owner_user_id=$2::uuid AND kind='agent' AND coalesce(checkpoint->>'execution_mode','')<>'agent_native_v2' FOR UPDATE",
        [runId,actor])
      const run=previous.rows[0]
      if(!run)throw new HttpError(404,"run_not_found")
      const approvals=await db.query<{status:string}>(
        "SELECT status FROM agentstudio.approvals WHERE run_id=$1::uuid "+
        "AND owner_user_id=$2::uuid AND step_key='model' FOR UPDATE",
        [runId,actor])
      const approved=approvals.rows[0]
      if(!approved)throw new HttpError(409,"approval_not_requested")
      if(approved.status!=="pending"){
        if(approved.status!==decision)throw new HttpError(409,"approval_already_decided")
        return {run:await projected(db,run),approval:approved.status,replayed:true}
      }
      if(run.status!=="awaiting_approval" ||
         run.checkpoint?.stage!=="awaiting_model_approval")
        throw new HttpError(409,"run_not_awaiting_model_approval")
      const version=Number(run.checkpoint.spec_revision)
      const current=await db.query<{revision:string|number}>(
        "SELECT revision FROM agentstudio.agent_specs "+
        "WHERE id=$1::uuid AND owner_user_id=$2::uuid",
        [run.agent_spec_id,actor])
      if(!Number.isSafeInteger(version) || version<1 ||
         Number(current.rows[0]?.revision)!==version)
        throw new HttpError(409,"agent_spec_revision_changed")
      const decisionResult=await db.query<{id:string}>(
        "UPDATE agentstudio.approvals SET status=$3::text,"+
        "decided_by=$2::uuid,decided_at=clock_timestamp(),"+
        "reason_code=$4::text WHERE run_id=$1::uuid "+
        "AND owner_user_id=$2::uuid AND step_key='model' AND status='pending' "+
        "RETURNING id",
        [runId,actor,decision,"employee_"+decision+"_model"])
      if(decisionResult.rows.length!==1)throw Error("approval_race")
      const isApproved=decision==="approved"
      const checkpoint={...run.checkpoint,
        stage:isApproved?"model_queued":"model_rejected"}
      const updated=await db.query<RunRow>(
        "UPDATE agentstudio.runs SET status=$3::text,checkpoint=$4::jsonb,"+
        "updated_at=clock_timestamp(),finished_at="+
        (isApproved?"NULL":"clock_timestamp()")+" "+
        "WHERE id=$1::uuid AND owner_user_id=$2::uuid "+
        "AND status='awaiting_approval' RETURNING "+cols,
        [runId,actor,isApproved?"queued":"cancelled",JSON.stringify(checkpoint)])
      if(updated.rows.length!==1)throw Error("approval_run_state_race")
      if(isApproved){
        await db.query(
          "INSERT INTO agentstudio.jobs(owner_user_id,run_id,kind,"+
          "dedupe_key,payload) "+
          "VALUES($1::uuid,$2::uuid,'run_tick',$3::text,$4::jsonb)",
          [actor,runId,"model:"+runId,
            JSON.stringify({phase:"model",spec_revision:version})])
      }
      await db.query(
        "INSERT INTO agentstudio.audit_events "+
        "(owner_user_id,actor_user_id,run_id,action,target_kind,target_id,"+
        "result,metadata) VALUES($1::uuid,$1::uuid,$2::uuid,"+
        "'agent.model_approval','run',$2::text,'succeeded',$3::jsonb)",
        [actor,runId,JSON.stringify({decision})])
      return {run:await projected(db,updated.rows[0]!),approval:decision,replayed:false}
    })
  }
  async submit(identity:Identity,specId:string,raw:unknown):Promise<RunSubmission> {
    if(!isUuid(specId))throw new HttpError(400,"invalid_spec_id")
    const request=safeRunRequest(raw)
    try{
      return await withActor(this.pool,identity,async(db,actor)=>{
        const prev=await db.query<RunRow>(runByIdempotencyKeySql,
          [actor,request.idempotency_key])
        const existing=prev.rows[0]
        if(existing){
          if(existing.agent_spec_id!==specId||
            existing.instruction!==request.instruction)
            throw new HttpError(409,"idempotency_key_conflict")
          return {run:await projected(db,existing),replayed:true}
        }
        const specs=await db.query<{
          id:string;revision:string|number;spec:Record<string,unknown>
        }>(
          "SELECT id,revision,spec FROM agentstudio.agent_specs "+
          "WHERE id=$1::uuid AND owner_user_id=$2::uuid",
          [specId,actor])
        const spec=specs.rows[0]
        if(!spec)throw new HttpError(404,"spec_not_found")
        if(spec.spec.require_plan_review===true)throw new HttpError(409,"agent_plan_review_requires_autonomous_runtime")
        if(await sharedKnowledgeScopeEnabled(db)){
          const scope=await requireKnowledgeScope(db,actor,storedKnowledgeIds(spec.spec))
          if(scope.some(base=>base.owner_user_id!==actor)&&!spec.spec.model_binding)
            throw new HttpError(409,"shared_knowledge_requires_owner_model_binding")
        }
        if(Array.isArray(spec.spec?.http_tools)&&spec.spec.http_tools.length)
          throw new HttpError(409,"agent_http_tools_require_autonomous_runtime")
        if(Array.isArray(spec.spec?.mcp_tools)&&spec.spec.mcp_tools.length)
          throw new HttpError(409,"agent_mcp_tools_require_autonomous_runtime")
        if(spec.spec?.knowledge_retrieval!==undefined)
          throw new HttpError(409,"agent_semantic_tools_require_autonomous_runtime")
        // Default remains denied. The isolated integration fixture may admit
        // a bound run only when a separately reviewed broker/Worker is wired.
        // Recheck the CURRENT owner's provider metadata under a shared row
        // lock; no credential columns or external transport are accessible.
        if(spec.spec&&Object.hasOwn(spec.spec,"model_binding")){
          if(!this.allowBoundModelRuns)
            throw new HttpError(409,"model_binding_runtime_not_enabled")
          const binding=spec.spec.model_binding as Record<string,unknown>|null
          if(!binding||typeof binding!=="object"||Array.isArray(binding)||
             Object.keys(binding).length!==3||!isUuid(binding.connection_id)||
             !Number.isSafeInteger(binding.connection_revision)||
             (binding.connection_revision as number)<1||
             typeof binding.model_id!=="string"||
             !/^[A-Za-z0-9._:/-]{1,120}$/.test(binding.model_id))
            throw new HttpError(409,"invalid_saved_model_binding")
          const connections=await db.query<{
            provider:ModelProvider;base_url:string;enabled:boolean;status:string
            models:string[]|string;revision:number|string
          }>("SELECT provider,base_url,enabled,status,models,revision "+
            "FROM agentstudio.model_connections WHERE id=$1::uuid "+
            "AND owner_user_id=$2::uuid FOR SHARE",[binding.connection_id,actor])
          const model=connections.rows[0]
          if(!model)throw new HttpError(404,"model_connection_not_found")
          if(Number(model.revision)!==binding.connection_revision)
            throw new HttpError(409,"model_connection_revision_changed")
          if(model.enabled!==true||model.status!=="ok")
            throw new HttpError(409,"model_connection_not_ready")
          let models:unknown=model.models
          if(typeof models==="string"){
            try{models=JSON.parse(models)}catch{models=[]}
          }
          if(!Array.isArray(models)||models.some(v=>typeof v!=="string")||
             !models.includes(binding.model_id))
            throw new HttpError(409,"model_not_in_connection")
          try{exactProviderEndpoint(model)}
          catch{throw new HttpError(409,"model_provider_not_allowlisted")}
        }
        const version=Number(spec.revision)
        if(!Number.isSafeInteger(version)||version<1)
          throw new Error("invalid_spec_revision")
        const result=await db.query<RunRow>(
          "INSERT INTO agentstudio.runs "+
          "(owner_user_id,kind,agent_spec_id,status,instruction) "+
          "VALUES($1::uuid,'agent',$2::uuid,'queued',$3::text) "+
          "RETURNING "+cols,
          [actor,specId,request.instruction])
        const run=result.rows[0]
        if(!run)throw new Error("missing_run_record")
        try{
          await db.query(
            "INSERT INTO agentstudio.jobs "+
            "(owner_user_id,run_id,kind,dedupe_key,payload) "+
            "VALUES($1::uuid,$2::uuid,'run_tick',$3::text,$4::jsonb)",
            [actor,run.id,request.idempotency_key,
              JSON.stringify({phase:"prepare",spec_revision:version})])
        }catch(error){
          if((error as {code?:string}).code==="23505")
            throw new HttpError(409,"idempotency_key_conflict")
          throw error
        }
        return {run:await projected(db,run),replayed:false}      })
    }catch(error){
      if(!(error instanceof HttpError && error.status===409 &&
           error.code==="idempotency_key_conflict"))throw error
      // Concurrent identical requests may both see no job before insert.
      // The losing INSERT receives SQLSTATE 23505, rolling back its run.
      // Recheck in a NEW owner-scoped transaction after the winning commit;
      // return its original run only for an EXACT same spec + instruction.
      // A genuinely different payload still returns 409.
      const previous=await withActor(this.pool,identity,async(db,actor)=>{
        const rows=await db.query<RunRow>(runByIdempotencyKeySql,
          [actor,request.idempotency_key])
        return rows.rows[0]?projected(db,rows.rows[0]):null
      })
      if(previous && previous.agent_spec_id===specId &&
         previous.instruction===request.instruction)
        return {run:previous,replayed:true}
      throw error
    }
  }
}
