// V8 PostgreSQL deterministic Agent preparation Worker.
// DOES NOT call language models, web, plugins, Workflow or external POST.
// Leased jobs use PostgreSQL transaction fencing and leave runs PAUSED
// awaiting a separately approved model execution engine.
import {readFileSync} from "node:fs"
import {fileURLToPath} from "node:url"
import {isUuid,type SqlPool,type SqlClient} from "./contracts.ts"
import {applyKnowledgeScope} from "./knowledge-scope-policy.ts"

const sql=(name:string)=>readFileSync(
  fileURLToPath(new URL("../../../db/postgres/"+name,import.meta.url)),"utf8")
const claimSql=sql("005_claim_agent_prepare.sql")
const finishSql=sql("003_finish_job.sql")
const retrySql=sql("004_retry_job.sql")
export interface LeasedPrepareJob {
  id:string
  run_id:string
  owner_user_id:string
  kind:string
  payload:{phase?:unknown;spec_revision?:unknown}
  lease_owner:string
  lease_token:string
  lease_version:string|number
  lease_until:string|Date
  attempts:number
  max_attempts:number
}
export type PrepareTick = {
  status:"idle"|"prepared"|"stale"|"retry_scheduled"|"failed"
  run_id?:string
}
function safeWorkerName(name:string) {
  if(!/^[a-zA-Z0-9_-]{1,120}$/.test(name))
    throw new Error("invalid_worker_id")
}
function validLease(raw:LeasedPrepareJob,workerName:string):boolean {
  return isUuid(raw.id) && isUuid(raw.run_id) &&
    isUuid(raw.owner_user_id) && isUuid(raw.lease_token) &&
    raw.lease_owner===workerName &&
    Number.isSafeInteger(Number(raw.lease_version)) &&
    Number(raw.lease_version)>0
}
async function inTransaction<T>(
  pool:SqlPool,body:(db:SqlClient)=>Promise<T>,
):Promise<T>{
  const db=await pool.connect()
  let started=false
  try{
    await db.query("BEGIN")
    started=true
    await applyKnowledgeScope(db,pool)
    const value=await body(db)
    await db.query("COMMIT")
    started=false
    return value
  }catch(error){
    if(started)await db.query("ROLLBACK").catch(()=>undefined)
    throw error
  }finally{db.release()}
}
async function guardedLease(
  db:SqlClient,job:LeasedPrepareJob,workerName:string,
):Promise<LeasedPrepareJob|null>{
  const res=await db.query<LeasedPrepareJob>(
    "SELECT id,run_id,owner_user_id,kind,payload,lease_owner,"+
    "lease_token,lease_version,lease_until,attempts,max_attempts "+
    "FROM agentstudio.jobs "+
    "WHERE id=$1::uuid AND run_id=$2::uuid "+
    "AND owner_user_id=$3::uuid AND status='leased' "+
    "AND lease_token=$4::uuid AND lease_version=$5::bigint "+
    "AND lease_owner=$6::text AND lease_until>clock_timestamp() "+
    "FOR UPDATE",
    [job.id,job.run_id,job.owner_user_id,job.lease_token,
      job.lease_version,workerName])
  return res.rows[0]??null
}
export class AgentPrepareWorker {
  readonly pool:SqlPool
  readonly workerId:string
  constructor(pool:SqlPool,workerId:string){
    safeWorkerName(workerId)
    this.pool=pool
    this.workerId=workerId
  }
  async claim(seconds=90):Promise<LeasedPrepareJob|null>{
    if(!Number.isInteger(seconds)||seconds<15||seconds>300)
      throw new Error("invalid_lease_duration")
    return inTransaction(this.pool,async(db)=>{
      await db.query("SET LOCAL ROLE agentstudio_worker")
      const result=await db.query<LeasedPrepareJob>(claimSql,
        [this.workerId,seconds])
      const row=result.rows[0]
      if(!row)return null
      if(!validLease(row,this.workerId))
        throw Error("invalid_claim_payload")
      return row
    })
  }
  async prepare(job:LeasedPrepareJob):Promise<PrepareTick>{
    if(!validLease(job,this.workerId))
      throw new Error("invalid_lease")
    return inTransaction(this.pool,async db=>{
      await db.query("SET LOCAL ROLE agentstudio_worker")
      const leased=await guardedLease(db,job,this.workerId)
      if(!leased)return {status:"stale",run_id:job.run_id}
      if(leased.kind!=="run_tick" || leased.payload?.phase!=="prepare")
        throw new Error("unexpected_job_kind")
      const version=Number(leased.payload.spec_revision)
      if(!Number.isSafeInteger(version)||version<1)
        throw new Error("invalid_spec_revision")
      // Switch to an owner-specific DB role only AFTER the worker has
      // atomically verified its fenced lease and copied the owner UUID.
      await db.query("SET LOCAL ROLE agentstudio_api")
      await db.query("SELECT set_config('agentstudio.actor_id',$1,true)",
        [leased.owner_user_id])
      const runs=await db.query<{id:string;agent_spec_id:string;status:string}>(
        "SELECT id,agent_spec_id,status FROM agentstudio.runs "+
        "WHERE id=$1::uuid AND owner_user_id=$2::uuid AND kind='agent'",
        [leased.run_id,leased.owner_user_id])
      const run=runs.rows[0]
      if(!run || run.status!=="queued" || !isUuid(run.agent_spec_id))
        throw new Error("invalid_run_state")
      const specs=await db.query<{revision:number|string}>(
        "SELECT revision FROM agentstudio.agent_specs "+
        "WHERE id=$1::uuid AND owner_user_id=$2::uuid",
        [run.agent_spec_id,leased.owner_user_id])
      const current=Number(specs.rows[0]?.revision)
      const match=Number.isSafeInteger(current)&&current===version
      const stage=match?"awaiting_model_approval":"spec_revision_changed"
      const checkpoint={stage,spec_revision:version,
        requires_model_connection:match,external_effects_executed:false}
      const step=await db.query<{id:string}>(
        "INSERT INTO agentstudio.run_steps "+
        "(owner_user_id,run_id,step_key,status,metadata) "+
        "VALUES($1::uuid,$2::uuid,'prepare','succeeded',$3::jsonb) "+
        "ON CONFLICT (run_id,step_key) DO NOTHING RETURNING id",
        [leased.owner_user_id,leased.run_id,JSON.stringify({stage})])
      if(step.rows.length!==1)throw new Error("duplicate_prepare_step")
      if(match){
        const approval=await db.query<{id:string}>(
          "INSERT INTO agentstudio.approvals "+
          "(owner_user_id,run_id,step_key,requested_by) "+
          "VALUES($1::uuid,$2::uuid,'model',$1::uuid) RETURNING id",
          [leased.owner_user_id,leased.run_id])
        if(approval.rows.length!==1)throw Error("duplicate_model_approval")
      }
      const changed=await db.query<{id:string}>(
        "UPDATE agentstudio.runs "+
        "SET status=$4::text,checkpoint=$3::jsonb,step_count=1,"+
        "updated_at=clock_timestamp() "+
        "WHERE id=$1::uuid AND owner_user_id=$2::uuid "+
        "AND status='queued' RETURNING id",
        [leased.run_id,leased.owner_user_id,JSON.stringify(checkpoint),
          match?"awaiting_approval":"paused"])
      if(changed.rows.length!==1)throw new Error("run_state_race")
      await db.query(
        "INSERT INTO agentstudio.audit_events "+
        "(owner_user_id,actor_user_id,run_id,action,target_kind,"+
        "target_id,result,metadata) "+
        "VALUES($1::uuid,$1::uuid,$2::uuid,'agent.prepare',"+
        "'run',$3::text,'succeeded',$4::jsonb)",
        [leased.owner_user_id,leased.run_id,leased.run_id,
          JSON.stringify({stage})])
      await db.query("SET LOCAL ROLE agentstudio_worker")
      const done=await db.query<{id:string}>(finishSql,[
        leased.id,leased.lease_token,leased.lease_version,
        this.workerId,"succeeded"])
      if(done.rows.length!==1)throw new Error("lost_lease_during_commit")
      return {status:"prepared",run_id:leased.run_id}
    })
  }
  async resolveFailure(job:LeasedPrepareJob):Promise<PrepareTick>{
    if(!validLease(job,this.workerId))
      return {status:"stale",run_id:job.run_id}
    return inTransaction(this.pool,async db=>{
      await db.query("SET LOCAL ROLE agentstudio_worker")
      const leased=await guardedLease(db,job,this.workerId)
      if(!leased)return {status:"stale",run_id:job.run_id}
      if(Number(leased.attempts)<Number(leased.max_attempts)){
        const later=await db.query<{id:string}>(retrySql,[
          leased.id,leased.lease_token,leased.lease_version,
          this.workerId,1,"prepare_failed"])
        if(later.rows.length!==1)throw Error("retry_fencing_failed")
        return {status:"retry_scheduled",run_id:leased.run_id}
      }
      await db.query("SET LOCAL ROLE agentstudio_api")
      await db.query("SELECT set_config('agentstudio.actor_id',$1,true)",
        [leased.owner_user_id])
      const failed=await db.query<{id:string}>(
        "UPDATE agentstudio.runs SET status='failed',"+
        "last_error_code='prepare_failed',finished_at=clock_timestamp(),"+
        "updated_at=clock_timestamp() "+
        "WHERE id=$1::uuid AND owner_user_id=$2::uuid AND status='queued' "+
        "RETURNING id",
        [leased.run_id,leased.owner_user_id])
      if(failed.rows.length!==1)throw Error("failed_run_state_race")
      await db.query("SET LOCAL ROLE agentstudio_worker")
      const ended=await db.query<{id:string}>(finishSql,[
        leased.id,leased.lease_token,leased.lease_version,
        this.workerId,"failed"])
      if(ended.rows.length!==1)throw Error("failed_job_fencing_failed")
      return {status:"failed",run_id:leased.run_id}
    })
  }
  // Recover a worker crash on the FINAL allowed attempt. Without this sweep,
  // the expired lease would stay 'leased' forever (claim filters max attempts).
  // Do NOT auto-reconcile jobs with uncertain external writes.
  async sweepExhausted():Promise<string|null> {
    return inTransaction(this.pool,async db=>{
      await db.query("SET LOCAL ROLE agentstudio_worker")
      const abandoned=await db.query<{
        id:string;run_id:string;owner_user_id:string
      }>(
        "SELECT j.id,j.run_id,j.owner_user_id "+
        "FROM agentstudio.jobs AS j "+
        "JOIN agentstudio.runs AS r ON r.id=j.run_id "+
        "AND r.owner_user_id=j.owner_user_id "+
        "WHERE j.kind='run_tick' AND j.payload->>'phase'='prepare' "+
        "AND j.status='leased' AND j.attempts>=j.max_attempts "+
        "AND j.lease_until<=clock_timestamp() AND r.status='queued' "+
        "AND NOT EXISTS (SELECT 1 FROM agentstudio.external_effects AS effect "+
        "WHERE effect.run_id=j.run_id AND effect.owner_user_id=j.owner_user_id "+
        "AND effect.status IN ('started','unknown')) "+
        "ORDER BY j.lease_until,j.id FOR UPDATE OF j SKIP LOCKED LIMIT 1")
      const row=abandoned.rows[0]
      if(!row)return null
      await db.query("SET LOCAL ROLE agentstudio_api")
      await db.query("SELECT set_config('agentstudio.actor_id',$1,true)",
        [row.owner_user_id])
      const failed=await db.query<{id:string}>(
        "UPDATE agentstudio.runs SET status='failed',"+
        "last_error_code='prepare_lease_exhausted',"+
        "finished_at=clock_timestamp(),updated_at=clock_timestamp() "+
        "WHERE id=$1::uuid AND owner_user_id=$2::uuid "+
        "AND status='queued' RETURNING id",
        [row.run_id,row.owner_user_id])
      if(failed.rows.length!==1)throw Error("sweep_run_state_race")
      await db.query("SET LOCAL ROLE agentstudio_worker")
      const closed=await db.query<{id:string}>(
        "UPDATE agentstudio.jobs SET status='failed',"+
        "lease_owner=NULL,lease_token=NULL,lease_until=NULL,"+
        "last_error_code='prepare_lease_exhausted',"+
        "updated_at=clock_timestamp() "+
        "WHERE id=$1::uuid AND status='leased' "+
        "AND attempts>=max_attempts AND lease_until<=clock_timestamp() "+
        "RETURNING id",[row.id])
      if(closed.rows.length!==1)throw Error("sweep_job_state_race")
      return row.run_id
    })
  }
  async tick():Promise<PrepareTick>{
    const job=await this.claim()
    if(!job){
      const stale=await this.sweepExhausted()
      return stale?{status:"failed",run_id:stale}:{status:"idle"}
    }
    try{
      return await this.prepare(job)
    }catch{
      // Never print employee prompts, database secrets or tool payloads.
      return await this.resolveFailure(job)
    }
  }
}
