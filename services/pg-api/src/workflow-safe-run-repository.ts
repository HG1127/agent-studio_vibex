// Durable PG Workflow run submission for the strictly safe Start/End subset.
// The API only enqueues; the separate, explicitly gated Workflow Worker runs it.
import {HttpError,isUuid,type Identity,type SqlPool,type SqlClient}
  from "./contracts.ts"
import {withActor} from "./repository.ts"
import {safeWorkflowPlan} from "./workflow-safe-plan.ts"
import {safeRunStepMetadata} from "./run-step-metadata.ts"

export type WorkflowSafeRunRequest={expected_revision:number;idempotency_key:string}
export type WorkflowSafeRun={
  id:string;owner_user_id:string;kind:"workflow";workflow_id:string
  status:string;instruction:string;result_text:string
  checkpoint:Record<string,unknown>;step_count:number
  last_error_code:string;created_at:string;updated_at:string;finished_at:string|null
}
export type WorkflowSafeRunStep={
  step_key:string;status:string;metadata:Record<string,unknown>
  created_at:string;updated_at:string
}
export type WorkflowSafeRunResult={
  run:WorkflowSafeRun;steps:WorkflowSafeRunStep[]
  job_status:string;replayed:boolean
  execution_mode:"start_end_only";external_effects_executed:false
}
function invalid():never{throw new HttpError(400,"invalid_workflow_run_request")}
export function safeWorkflowSafeRunRequest(raw:unknown):WorkflowSafeRunRequest{
  if(!raw||typeof raw!=="object"||Array.isArray(raw))invalid()
  const v=raw as Record<string,unknown>
  if(Object.keys(v).length!==2||!Object.hasOwn(v,"expected_revision")||
     !Object.hasOwn(v,"idempotency_key")||
     !Number.isSafeInteger(v.expected_revision)||(v.expected_revision as number)<1||
     typeof v.idempotency_key!=="string"||
     !/^[A-Za-z0-9_-]{8,80}$/.test(v.idempotency_key))invalid()
  return {expected_revision:v.expected_revision as number,
    idempotency_key:v.idempotency_key as string}
}
const cols="id,owner_user_id,kind,workflow_id,status,instruction,result_text,"+
  "checkpoint,step_count,last_error_code,created_at,updated_at,finished_at"
function normalize(row:WorkflowSafeRun):WorkflowSafeRun{
  const step_count=Number(row.step_count)
  if(!Number.isSafeInteger(step_count)||step_count<0||step_count>40)
    throw new HttpError(500,"invalid_workflow_run_record")
  return {...row,step_count}
}
export class WorkflowSafeRunRepository{
  readonly pool:SqlPool
  constructor(pool:SqlPool){this.pool=pool}
  private async assemble(db:SqlClient,owner:string,run:WorkflowSafeRun,
    replayed:boolean):Promise<WorkflowSafeRunResult>{
    const steps=await db.query<WorkflowSafeRunStep>(
      "SELECT step_key,status,metadata,created_at,updated_at "+
      "FROM agentstudio.run_steps WHERE run_id=$1::uuid "+
      "AND owner_user_id=$2::uuid ORDER BY metadata->>'index',step_key",
      [run.id,owner])
    const jobs=await db.query<{status:string}>(
      "SELECT status FROM agentstudio.jobs WHERE run_id=$1::uuid "+
      "AND owner_user_id=$2::uuid AND kind='workflow_tick' "+
      "AND payload->>'phase'='workflow_safe_v1'",
      [run.id,owner])
    if(jobs.rows.length!==1)throw new HttpError(409,"workflow_run_job_missing")
    return {run:normalize(run),steps:steps.rows.map(step=>({...step,
      metadata:safeRunStepMetadata(step.metadata)})),job_status:jobs.rows[0]!.status,
      replayed,execution_mode:"start_end_only",external_effects_executed:false}
  }
  async submit(identity:Identity,workflowId:string,raw:unknown):
    Promise<WorkflowSafeRunResult>{
    if(!isUuid(workflowId))throw new HttpError(400,"invalid_workflow_id")
    const request=safeWorkflowSafeRunRequest(raw)
    const dedupe="workflow_safe:"+request.idempotency_key
    const attempt=()=>withActor(this.pool,identity,async(db,owner)=>{
      // Serialize same-owner idempotency keys before lookup/insert so concurrent
      // submissions replay the committed run instead of surfacing a unique race.
      await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1::text,0))",
        [owner+":"+dedupe])
      const prior=await db.query<WorkflowSafeRun>(
        "SELECT r."+cols.replaceAll(",",",r.")+" FROM agentstudio.jobs j "+
        "JOIN agentstudio.runs r ON r.id=j.run_id AND r.owner_user_id=j.owner_user_id "+
        "WHERE j.owner_user_id=$1::uuid AND j.kind='workflow_tick' "+
        "AND j.dedupe_key=$2::text AND j.payload->>'phase'='workflow_safe_v1' "+
        "LIMIT 1",[owner,dedupe])
      if(prior.rows[0]){
        const old=prior.rows[0]
        if(old.workflow_id!==workflowId||
           Number(old.checkpoint?.workflow_revision)!==request.expected_revision)
          throw new HttpError(409,"idempotency_key_conflict")
        return this.assemble(db,owner,old,true)
      }
      const stored=await db.query<{
        id:string;revision:string|number;graph:unknown
      }>("SELECT id,revision,graph FROM agentstudio.workflows "+
        "WHERE id=$1::uuid AND owner_user_id=$2::uuid FOR SHARE",
        [workflowId,owner])
      const workflow=stored.rows[0]
      if(!workflow)throw new HttpError(404,"workflow_not_found")
      if(Number(workflow.revision)!==request.expected_revision)
        throw new HttpError(409,"workflow_revision_changed")
      const plan=safeWorkflowPlan(workflow.graph)
      const checkpoint={
        stage:"workflow_safe_queued",workflow_revision:request.expected_revision,
        graph_sha256:plan.graphSha256,execution_mode:"start_end_only",
        completed_node_ids:[],external_effects_executed:false,
        validation_only:false
      }
      const inserted=await db.query<WorkflowSafeRun>(
        "INSERT INTO agentstudio.runs "+
        "(owner_user_id,kind,workflow_id,status,instruction,result_text,"+
        "checkpoint,step_count) VALUES ($1::uuid,'workflow',$2::uuid,'queued','',"+
        "''::text,$3::jsonb,0) RETURNING "+cols,
        [owner,workflowId,JSON.stringify(checkpoint)])
      const run=inserted.rows[0]
      if(!run)throw Error("workflow_safe_run_insert_missing")
      await db.query(
        "INSERT INTO agentstudio.jobs "+
        "(owner_user_id,run_id,kind,dedupe_key,status,payload,max_attempts) "+
        "VALUES($1::uuid,$2::uuid,'workflow_tick',$3::text,'queued',$4::jsonb,30)",
        [owner,run.id,dedupe,JSON.stringify({
          phase:"workflow_safe_v1",workflow_revision:request.expected_revision,
          workflow_id:workflowId,
          graph_sha256:plan.graphSha256,execution_mode:"start_end_only",
          external_effects_executed:false
        })])
      await db.query(
        "INSERT INTO agentstudio.audit_events "+
        "(owner_user_id,actor_user_id,run_id,action,target_kind,target_id,result,metadata) "+
        "VALUES($1::uuid,$1::uuid,$2::uuid,'workflow.run_submit','workflow',"+
        "$3::text,'succeeded',$4::jsonb)",
        [owner,run.id,workflowId,JSON.stringify({
          workflow_revision:request.expected_revision,
          execution_mode:"start_end_only",queued:true,
          external_effects_executed:false
        })])
      return this.assemble(db,owner,run,false)
    })
    try{return await attempt()}
    catch(error){
      const pg=error as {code?:unknown;constraint?:unknown}
      // The unique index is the final concurrency guard if an adapter does
      // not serialize advisory locks exactly like the real PostgreSQL server.
      // withActor rolls the losing transaction back before this lookup.
      if(pg.code!=="23505"||
         pg.constraint!=="jobs_owner_user_id_kind_dedupe_key_key")throw error
      return withActor(this.pool,identity,async(db,owner)=>{
        const prior=await db.query<WorkflowSafeRun>(
          "SELECT r."+cols.replaceAll(",",",r.")+" FROM agentstudio.jobs j "+
          "JOIN agentstudio.runs r ON r.id=j.run_id AND r.owner_user_id=j.owner_user_id "+
          "WHERE j.owner_user_id=$1::uuid AND j.kind='workflow_tick' "+
          "AND j.dedupe_key=$2::text AND j.payload->>'phase'='workflow_safe_v1' "+
          "LIMIT 1",[owner,dedupe])
        const old=prior.rows[0]
        if(!old)throw error
        if(old.workflow_id!==workflowId||
           Number(old.checkpoint?.workflow_revision)!==request.expected_revision)
          throw new HttpError(409,"idempotency_key_conflict")
        return this.assemble(db,owner,old,true)
      })
    }
  }
  async list(identity:Identity,limit=30):Promise<WorkflowSafeRunResult[]>{
    if(!Number.isSafeInteger(limit)||limit<1||limit>50)
      throw new HttpError(400,"invalid_workflow_run_limit")
    return withActor(this.pool,identity,async(db,owner)=>{
      const result=await db.query<WorkflowSafeRun>(
        "SELECT r."+cols.replaceAll(",",",r.")+" FROM agentstudio.runs AS r "+
        "JOIN agentstudio.jobs AS j ON j.run_id=r.id "+
        "AND j.owner_user_id=r.owner_user_id "+
        "WHERE r.owner_user_id=$1::uuid AND r.kind='workflow' "+
        "AND r.checkpoint->>'execution_mode'='start_end_only' "+
        "AND j.kind='workflow_tick' AND j.payload->>'phase'='workflow_safe_v1' "+
        "ORDER BY r.created_at DESC,r.id LIMIT $2::int",[owner,limit])
      const items:WorkflowSafeRunResult[]=[]
      for(const run of result.rows)items.push(await this.assemble(db,owner,run,true))
      return items
    })
  }
  async get(identity:Identity,runId:string):Promise<WorkflowSafeRunResult|null>{
    if(!isUuid(runId))throw new HttpError(400,"invalid_run_id")
    return withActor(this.pool,identity,async(db,owner)=>{
      const result=await db.query<WorkflowSafeRun>(
        "SELECT "+cols+" FROM agentstudio.runs WHERE id=$1::uuid "+
        "AND owner_user_id=$2::uuid AND kind='workflow' "+
        "AND checkpoint->>'execution_mode'='start_end_only'",
        [runId,owner])
      return result.rows[0]?this.assemble(db,owner,result.rows[0],true):null
    })
  }
}
