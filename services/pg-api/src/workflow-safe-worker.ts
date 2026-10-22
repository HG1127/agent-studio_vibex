// Isolated PostgreSQL Workflow Worker. Supports deterministic Start/End only.
// One transaction commits all node steps, run completion and lease acknowledgement;
// a crash rolls everything back, and the expired lease can safely retry because
// this runner has no model/tool/HTTP/scheduler side effects.
import {readFileSync} from "node:fs"
import {fileURLToPath} from "node:url"
import {HttpError,isUuid,type SqlClient,type SqlPool}
  from "./contracts.ts"
import {safeWorkflowPlan,type SafeWorkflowPlan} from "./workflow-safe-plan.ts"
const sql=(name:string)=>readFileSync(
  fileURLToPath(new URL("../../../db/postgres/"+name,import.meta.url)),"utf8")
const claimSql=sql("007_claim_workflow_safe.sql")
const finishSql=sql("003_finish_job.sql")
type Job={
  id:string;run_id:string;owner_user_id:string;kind:string
  payload:{phase?:unknown;workflow_id?:unknown;workflow_revision?:unknown;graph_sha256?:unknown;
    execution_mode?:unknown;external_effects_executed?:unknown}
  lease_owner:string;lease_token:string;lease_version:string|number
  lease_until:string|Date;attempts:number;max_attempts:number
}
type Run={id:string;owner_user_id:string;workflow_id:string;status:string;
  checkpoint:Record<string,unknown>;step_count:number}
type Workflow={id:string;revision:string|number;graph:unknown}
export type WorkflowSafeWorkerTick={status:"idle"|"succeeded"|"failed"|"stale";run_id?:string;steps_completed?:number}
async function tx<T>(pool:SqlPool,fn:(db:SqlClient)=>Promise<T>):Promise<T>{
  const db=await pool.connect();let begun=false
  try{await db.query("BEGIN");begun=true;const value=await fn(db)
    await db.query("COMMIT");begun=false;return value
  }catch(error){if(begun)await db.query("ROLLBACK").catch(()=>undefined);throw error}
  finally{db.release()}
}
function validJob(j:Job,id:string):boolean{
  return isUuid(j.id)&&isUuid(j.run_id)&&isUuid(j.owner_user_id)&&
    isUuid(j.lease_token)&&j.kind==="workflow_tick"&&j.lease_owner===id&&
    Number.isSafeInteger(Number(j.lease_version))&&Number(j.lease_version)>0&&
    j.payload?.phase==="workflow_safe_v1"&&isUuid(j.payload.workflow_id)&&
    j.payload.execution_mode==="start_end_only"&&
    j.payload.external_effects_executed===false&&
    Number.isSafeInteger(Number(j.payload.workflow_revision))&&Number(j.payload.workflow_revision)>0&&
    typeof j.payload.graph_sha256==="string"&&/^[a-f0-9]{64}$/.test(j.payload.graph_sha256)
}
async function lease(db:SqlClient,j:Job,id:string){
  const r=await db.query<Job>(
    "SELECT id,run_id,owner_user_id,kind,payload,lease_owner,lease_token,"+
    "lease_version,lease_until,attempts,max_attempts FROM agentstudio.jobs "+
    "WHERE id=$1::uuid AND run_id=$2::uuid AND owner_user_id=$3::uuid "+
    "AND kind='workflow_tick' AND payload->>'phase'='workflow_safe_v1' "+
    "AND status='leased' AND lease_token=$4::uuid AND lease_version=$5::bigint "+
    "AND lease_owner=$6::text AND lease_until>clock_timestamp() FOR UPDATE",
    [j.id,j.run_id,j.owner_user_id,j.lease_token,j.lease_version,id])
  return r.rows[0]&&validJob(r.rows[0],id)?r.rows[0]:null
}
async function asActor(db:SqlClient,owner:string){
  await db.query("SET LOCAL ROLE agentstudio_api")
  await db.query("SELECT set_config('agentstudio.actor_id',$1::text,true)",[owner])
}
export class WorkflowSafeWorker{
  readonly pool:SqlPool;readonly workerId:string
  constructor(pool:SqlPool,workerId:string){
    if(!/^[a-zA-Z0-9_-]{1,120}$/.test(workerId))throw Error("invalid_worker_id")
    this.pool=pool;this.workerId=workerId
  }
  async claim(seconds=60):Promise<Job|null>{
    if(!Number.isInteger(seconds)||seconds<15||seconds>300)throw Error("invalid_workflow_lease")
    return tx(this.pool,async db=>{
      await db.query("SET LOCAL ROLE agentstudio_worker")
      const r=await db.query<Job>(claimSql,[this.workerId,seconds])
      const j=r.rows[0]
      if(!j)return null
      if(!validJob(j,this.workerId))throw Error("invalid_workflow_claim")
      return j
    })
  }
  async tick():Promise<WorkflowSafeWorkerTick>{
    const job=await this.claim()
    if(!job)return {status:"idle"}
    try{return await this.execute(job)}
    catch(error){
      if(error instanceof HttpError&&
         ["workflow_execution_graph_invalid","workflow_execution_node_not_supported"].includes(error.code)){
        const failed=await this.fail(job,error.code)
        return {status:failed?"failed":"stale",run_id:job.run_id}
      }
      // Transient faults roll back the execution transaction. Let a live lease
      // expire and be reclaimed; at the configured attempt ceiling, fail the
      // run explicitly instead of leaving a permanently queued orphan.
      if(Number(job.attempts)>=Number(job.max_attempts)){
        const failed=await this.fail(job,"workflow_worker_retry_exhausted")
        return {status:failed?"failed":"stale",run_id:job.run_id}
      }
      throw error
    }
  }
  private async fail(job:Job,reason:string):Promise<boolean>{
    return tx(this.pool,async db=>{
      await db.query("SET LOCAL ROLE agentstudio_worker")
      const current=await lease(db,job,this.workerId)
      if(!current)return false
      await asActor(db,current.owner_user_id)
      const r=await db.query<{id:string}>(
        "UPDATE agentstudio.runs SET status='failed',last_error_code=$3::text,"+
        "checkpoint=jsonb_set(checkpoint,'{stage}',to_jsonb($3::text),true),"+
        "updated_at=clock_timestamp(),finished_at=clock_timestamp() "+
        "WHERE id=$1::uuid AND owner_user_id=$2::uuid AND status IN ('queued','running') "+
        "RETURNING id",[current.run_id,current.owner_user_id,reason])
      if(!r.rows[0])return false
      await db.query(
        "INSERT INTO agentstudio.audit_events "+
        "(owner_user_id,actor_user_id,run_id,action,target_kind,target_id,result,metadata) "+
        "VALUES($1::uuid,$1::uuid,$2::uuid,'workflow.safe_run_failed','workflow',"+
        "$3::text,'failed',$4::jsonb)",
        [current.owner_user_id,current.run_id,current.payload.workflow_id,JSON.stringify({
          reason,execution_mode:"start_end_only",external_effects_executed:false})])
      await db.query("SET LOCAL ROLE agentstudio_worker")
      const done=await db.query<{id:string}>(finishSql,[
        current.id,current.lease_token,current.lease_version,this.workerId,"failed"])
      if(!done.rows[0])throw Error("workflow_lease_lost")
      return true
    })
  }
  private async execute(job:Job):Promise<WorkflowSafeWorkerTick>{
    return tx(this.pool,async db=>{
      await db.query("SET LOCAL ROLE agentstudio_worker")
      const current=await lease(db,job,this.workerId)
      if(!current)return {status:"stale",run_id:job.run_id}
      await asActor(db,current.owner_user_id)
      const runResult=await db.query<Run>(
        "SELECT id,owner_user_id,workflow_id,status,checkpoint,step_count "+
        "FROM agentstudio.runs WHERE id=$1::uuid AND owner_user_id=$2::uuid "+
        "AND kind='workflow' FOR UPDATE",[current.run_id,current.owner_user_id])
      const run=runResult.rows[0]
      if(!run||!["queued","running"].includes(run.status))
        return {status:"stale",run_id:current.run_id}
      const revision=Number(current.payload.workflow_revision)
      if(Number(run.checkpoint.workflow_revision)!==revision||
         run.checkpoint.execution_mode!=="start_end_only"||
         run.checkpoint.external_effects_executed!==false||
         run.checkpoint.stage!=="workflow_safe_queued"&&
         run.checkpoint.stage!=="workflow_safe_running")
        throw new HttpError(409,"workflow_execution_graph_invalid")
      const flowResult=await db.query<Workflow>(
        "SELECT id,revision,graph FROM agentstudio.workflows "+
        "WHERE id=$1::uuid AND owner_user_id=$2::uuid FOR SHARE",
        [run.workflow_id,current.owner_user_id])
      const flow=flowResult.rows[0]
      if(!flow||Number(flow.revision)!==revision||
         current.payload.graph_sha256!==run.checkpoint.graph_sha256)
        throw new HttpError(409,"workflow_execution_graph_invalid")
      const plan:SafeWorkflowPlan=safeWorkflowPlan(flow.graph)
      if(plan.graphSha256!==current.payload.graph_sha256)
        throw new HttpError(409,"workflow_execution_graph_invalid")
      const existing=await db.query<{step_key:string;status:string}>(
        "SELECT step_key,status FROM agentstudio.run_steps "+
        "WHERE run_id=$1::uuid AND owner_user_id=$2::uuid",
        [current.run_id,current.owner_user_id])
      if(existing.rows.length){
        // The safe executor commits every step, run state and job ack atomically.
        // A queued/running run with existing steps is inconsistent and fails closed.
        throw new HttpError(409,"workflow_execution_graph_invalid")
      }
      for(const [index,node] of plan.nodes.entries()){
        await db.query(
          "INSERT INTO agentstudio.run_steps "+
          "(owner_user_id,run_id,step_key,status,metadata) "+
          "VALUES($1::uuid,$2::uuid,$3::text,'succeeded',$4::jsonb)",
          [current.owner_user_id,current.run_id,"workflow:"+node.id,
            JSON.stringify({index:String(index).padStart(3,"0"),node_id:node.id,
              node_type:node.type,execution_mode:"start_end_only",
              external_effects_executed:false,checkpointed:true})])
      }
      const checkpoint={
        ...run.checkpoint,stage:"workflow_safe_succeeded",
        completed_node_ids:plan.nodes.map(n=>n.id),
        last_completed_node_id:plan.nodes.at(-1)!.id,
        graph_sha256:plan.graphSha256,step_count:plan.nodes.length,
        external_effects_executed:false
      }
      const updated=await db.query<{id:string}>(
        "UPDATE agentstudio.runs SET status='succeeded',result_text=$3::text,"+
        "checkpoint=$4::jsonb,step_count=$5::int,last_error_code='',"+
        "updated_at=clock_timestamp(),finished_at=clock_timestamp() "+
        "WHERE id=$1::uuid AND owner_user_id=$2::uuid AND status IN ('queued','running') "+
        "RETURNING id",
        [current.run_id,current.owner_user_id,
          "Workflow safe-node execution completed; no model, tool or external calls were made.",
          JSON.stringify(checkpoint),plan.nodes.length])
      if(!updated.rows[0])throw Error("workflow_state_race")
      await db.query(
        "INSERT INTO agentstudio.audit_events "+
        "(owner_user_id,actor_user_id,run_id,action,target_kind,target_id,result,metadata) "+
        "VALUES($1::uuid,$1::uuid,$2::uuid,'workflow.safe_run_succeeded','workflow',"+
        "$3::text,'succeeded',$4::jsonb)",
        [current.owner_user_id,current.run_id,current.payload.workflow_id,JSON.stringify({
          workflow_revision:revision,step_count:plan.nodes.length,
          execution_mode:"start_end_only",external_effects_executed:false})])
      await db.query("SET LOCAL ROLE agentstudio_worker")
      const done=await db.query<{id:string}>(finishSql,[
        current.id,current.lease_token,current.lease_version,this.workerId,"succeeded"])
      if(!done.rows[0])throw Error("workflow_lease_lost")
      return {status:"succeeded",run_id:current.run_id,steps_completed:plan.nodes.length}
    })
  }
}
