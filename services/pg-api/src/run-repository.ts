// V8 PostgreSQL: authenticated, owner-scoped Agent prepare RUN queue.
// Creating a run does NOT execute a model, tool, Workflow or external POST.
import {HttpError,isUuid,type Identity,type SqlPool}
  from "./contracts.ts"
import {withActor} from "./repository.ts"

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
}
export interface RunSubmission {
  run:RunRow
  replayed:boolean
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
  if(typeof instruction!=="string"||instruction.length>1200 ||
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
export class RunRepository {
  readonly pool:SqlPool
  constructor(pool:SqlPool){this.pool=pool}

  list(identity:Identity,limit=30):Promise<RunRow[]> {
    const bounded=Math.max(1,Math.min(50,Math.trunc(limit)))
    return withActor(this.pool,identity,async(db,actor)=>{
      const result=await db.query<RunRow>(
        "SELECT "+cols+" FROM agentstudio.runs "+
        "WHERE kind='agent' AND owner_user_id=$1::uuid "+
        "ORDER BY created_at DESC,id LIMIT $2::int",[actor,bounded])
      return result.rows.map(normalized)
    })
  }
  get(identity:Identity,id:string):Promise<RunRow|null> {
    if(!isUuid(id))throw new HttpError(400,"invalid_run_id")
    return withActor(this.pool,identity,async(db,actor)=>{
      const result=await db.query<RunRow>(
        "SELECT "+cols+" FROM agentstudio.runs "+
        "WHERE id=$1::uuid AND owner_user_id=$2::uuid AND kind='agent'",
        [id,actor])
      return result.rows[0]?normalized(result.rows[0]):null
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
        "AND a.step_key='model'",[runId,actor])
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
        "AND owner_user_id=$2::uuid AND kind='agent' FOR UPDATE",
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
        return {run:normalized(run),approval:approved.status,replayed:true}
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
      return {run:normalized(updated.rows[0]!),approval:decision,replayed:false}
    })
  }
  submit(identity:Identity,specId:string,raw:unknown):Promise<RunSubmission> {
    if(!isUuid(specId))throw new HttpError(400,"invalid_spec_id")
    const request=safeRunRequest(raw)
    return withActor(this.pool,identity,async(db,actor)=>{
      const prev=await db.query<RunRow>(
        "SELECT r."+cols.replaceAll(",",
          ",r.")+" FROM agentstudio.jobs AS j "+
        "JOIN agentstudio.runs AS r ON r.id=j.run_id "+
        "AND r.owner_user_id=j.owner_user_id "+
        "WHERE j.owner_user_id=$1::uuid AND j.kind='run_tick' "+
        "AND j.dedupe_key=$2::text LIMIT 1",
        [actor,request.idempotency_key])
      const existing=prev.rows[0]
      if(existing){
        if(existing.agent_spec_id!==specId||
          existing.instruction!==request.instruction)
          throw new HttpError(409,"idempotency_key_conflict")
        return {run:normalized(existing),replayed:true}
      }
      const specs=await db.query<{id:string;revision:string|number}>(
        "SELECT id,revision FROM agentstudio.agent_specs "+
        "WHERE id=$1::uuid AND owner_user_id=$2::uuid",
        [specId,actor])
      const spec=specs.rows[0]
      if(!spec)throw new HttpError(404,"spec_not_found")
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
      return {run:normalized(run),replayed:false}
    })
  }
}
