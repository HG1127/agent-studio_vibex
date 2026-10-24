import {HttpError,isUuid,type Identity,type SqlClient,type SqlPool} from "./contracts.ts"
import {withActor} from "./repository.ts"
import {WorkflowV2RunRepository} from "./workflow-v2-run-repository.ts"
import {AutonomousAgentRunRepository} from "./autonomous-agent-run-repository.ts"
import {assertNativeScheduleConfiguration,parseScheduleActivation,type ExecutionSchedule} from "./schedule-runtime-contract.ts"
import {safeScheduleDraftInput} from "./schedule-draft-repository.ts"
const publicErrors=new Set(["schedule_owner_unavailable","schedule_not_found","invalid_schedule_execution","schedule_activation_conflict","schedule_activation_changed_or_invalid",
  "invalid_schedule_authority_limits","schedule_authority_unavailable","schedule_disabled_or_changed","schedule_already_queued","schedule_failed_start_not_retryable","invalid_schedule_control","schedule_requires_native_draft","schedule_model_unavailable","invalid_schedule_model_binding"])
async function withScheduleActor<T>(pool:SqlPool,identity:Identity,body:(db:SqlClient,owner:string)=>Promise<T>):Promise<T>{
  try{return await withActor(pool,identity,body)}catch(error){
    if(error&&typeof error==="object"&&"code" in error&&error.code==="P0001"&&"message" in error&&publicErrors.has(String(error.message))){
      const code=String(error.message);throw new HttpError(code==="schedule_not_found"?404:code.startsWith("invalid_")?400:409,code)
    }
    throw error
  }
}
export const scheduleRuntimeColumns="id,owner_user_id,name,kind,agent_spec_id,workflow_id,time_zone,recurrence,next_at,enabled,revision,created_at,updated_at,execution,deleted_at"
export function normalizeExecutionSchedule(row:ExecutionSchedule):ExecutionSchedule{
  const revision=Number(row.revision);if(!Number.isSafeInteger(revision)||revision<1)throw new HttpError(500,"invalid_schedule_revision")
  return {...row,revision}
}
export async function requireScheduleRuntime(db:SqlClient){
  if((await db.query<{ok:boolean}>("SELECT to_regprocedure('agentstudio.schedule_activate(uuid,bigint,jsonb,timestamp with time zone,text,uuid)') IS NOT NULL AND "+
    "EXISTS(SELECT 1 FROM agentstudio.schema_migrations WHERE version='pg_v9_044') AS ok")).rows[0]?.ok!==true)throw new HttpError(503,"schedule_runtime_not_installed")
}
export class ScheduleRuntimeRepository{
  readonly pool:SqlPool;readonly enabled:boolean;readonly flows:WorkflowV2RunRepository;readonly agents:AutonomousAgentRunRepository
  constructor(pool:SqlPool,options:{enabled?:boolean;allowMcpExecution?:boolean;allowKnowledgeExecution?:boolean}={}){
    this.pool=pool;this.enabled=options.enabled===true;this.flows=new WorkflowV2RunRepository(pool,"workflow_native_v2",options);this.agents=new AutonomousAgentRunRepository(pool,options)
  }
  private allowed(){if(!this.enabled)throw new HttpError(403,"schedule_execution_disabled")}
  async describe(identity:Identity,id:string){
    if(!isUuid(id))throw new HttpError(400,"invalid_schedule_id")
    return withScheduleActor(this.pool,identity,async db=>{await requireScheduleRuntime(db)
      return (await db.query<{state:Record<string,unknown>|null}>("SELECT agentstudio.schedule_execution_status($1::uuid) AS state",[id])).rows[0]?.state??null})
  }
  async activate(identity:Identity,id:string,raw:unknown){
    this.allowed();if(!isUuid(id))throw new HttpError(400,"invalid_schedule_id")
    return withScheduleActor(this.pool,identity,async(db,owner)=>{
      await requireScheduleRuntime(db)
      const row=(await db.query<ExecutionSchedule>("SELECT "+scheduleRuntimeColumns+" FROM agentstudio.schedules WHERE id=$1::uuid AND owner_user_id=$2::uuid AND deleted_at IS NULL FOR UPDATE",[id,owner])).rows[0]
      if(!row)throw new HttpError(404,"schedule_not_found")
      const possibleReplay=raw!==null&&typeof raw==="object"&&Number((raw as Record<string,unknown>).expected_revision)+1===Number(row.revision)
      const item=parseScheduleActivation(raw,normalizeExecutionSchedule(row),Date.now(),possibleReplay)
      const fingerprint=(await db.query<{sha:string|null}>("SELECT agentstudio.schedule_resource_fingerprint($1::uuid,$2::jsonb) AS sha",[id,JSON.stringify(item.execution.model_binding)])).rows[0]?.sha
      if(!fingerprint)throw new HttpError(409,"schedule_target_unavailable")
      const request={expected_revision:item.execution.target_revision,idempotency_key:"schedule_preview_"+item.request_id,instruction:item.execution.instruction}
      if(!possibleReplay){
        if(row.kind==="agent")await this.agents.prepareOwned(db,owner,row.agent_spec_id!,{...request,max_steps:item.execution.max_steps},item.execution.model_binding??undefined)
        else await this.flows.prepareOwned(db,owner,row.workflow_id!,request)
      }
      const result=(await db.query<{state:Record<string,unknown>}>("SELECT agentstudio.schedule_activate($1::uuid,$2::bigint,$3::jsonb,$4::timestamptz,$5::text,$6::uuid) AS state",
        [id,item.revision,JSON.stringify(item.execution),item.next,fingerprint,item.request_id])).rows[0]?.state
      if(!result)throw new HttpError(409,"schedule_activation_changed")
      return result
    })
  }
  async control(identity:Identity,id:string,revision:number,action:"pause"|"delete"){
    if(!isUuid(id)||!Number.isSafeInteger(revision)||revision<1||!["pause","delete"].includes(action))throw new HttpError(400,"invalid_schedule_control")
    return withScheduleActor(this.pool,identity,async db=>{await requireScheduleRuntime(db)
      return (await db.query<{ok:boolean}>("SELECT agentstudio.schedule_control($1::uuid,$2::bigint,$3::text) AS ok",[id,revision,action])).rows[0]?.ok===true})
  }
  async runNow(identity:Identity,id:string,revision:number){return this.occurrenceAction(identity,id,revision)}
  async retryFailedStart(identity:Identity,id:string,revision:number,occurrence:string){
    if(!isUuid(occurrence))throw new HttpError(400,"invalid_schedule_occurrence")
    return this.occurrenceAction(identity,id,revision,occurrence)
  }
  private async occurrenceAction(identity:Identity,id:string,revision:number,occurrence?:string){
    this.allowed();if(!isUuid(id)||!Number.isSafeInteger(revision)||revision<1)throw new HttpError(400,"invalid_schedule_control")
    return withScheduleActor(this.pool,identity,async db=>{await requireScheduleRuntime(db)
      return (await db.query<{state:Record<string,unknown>}>(occurrence?"SELECT agentstudio.schedule_retry_start($1::uuid,$2::bigint,$3::uuid) AS state":"SELECT agentstudio.schedule_run_now($1::uuid,$2::bigint) AS state",occurrence?[id,revision,occurrence]:[id,revision])).rows[0]?.state})
  }
  async edit(identity:Identity,id:string,revision:number,raw:unknown){
    this.allowed();if(!isUuid(id)||!Number.isSafeInteger(revision)||revision<1)throw new HttpError(400,"invalid_schedule_control")
    const input=safeScheduleDraftInput(raw)
    return withScheduleActor(this.pool,identity,async(db,owner)=>{
      await requireScheduleRuntime(db)
      const schedule=(await db.query<ExecutionSchedule>("SELECT "+scheduleRuntimeColumns+" FROM agentstudio.schedules WHERE id=$1::uuid AND owner_user_id=$2::uuid AND deleted_at IS NULL FOR UPDATE",[id,owner])).rows[0]
      if(!schedule||Number(schedule.revision)!==revision)return null
      assertNativeScheduleConfiguration(schedule)
      const target=(await db.query("SELECT id FROM agentstudio."+(input.kind==="agent"?"agent_specs":"workflows")+" WHERE id=$1::uuid AND owner_user_id=$2::uuid FOR SHARE",[input.target_id,owner])).rows[0]
      if(!target)throw new HttpError(404,"schedule_target_not_found")
      const paused=(await db.query<{ok:boolean}>("SELECT agentstudio.schedule_control($1::uuid,$2::bigint,'pause') AS ok",[id,revision])).rows[0]?.ok
      if(!paused)return null
      const row=(await db.query<ExecutionSchedule>("UPDATE agentstudio.schedules SET name=$3::text,kind=$4::text,agent_spec_id=$5::uuid,workflow_id=$6::uuid,time_zone=$7::text,"+
        "recurrence=$8::jsonb,next_at=NULL,execution='{}'::jsonb,updated_at=clock_timestamp() WHERE id=$1::uuid AND owner_user_id=$2::uuid AND revision=$9::bigint RETURNING "+scheduleRuntimeColumns,
        [id,owner,input.name,input.kind,input.kind==="agent"?input.target_id:null,input.kind==="workflow"?input.target_id:null,input.time_zone,
          JSON.stringify({config_format:"pg_schedule_draft_v1",execution_supported:false,rule:input.rule}),revision+1])).rows[0]
      return row?normalizeExecutionSchedule(row):null
    })
  }
  async list(identity:Identity){this.allowed();return withScheduleActor(this.pool,identity,async(db,owner)=>{await requireScheduleRuntime(db)
    return (await db.query<ExecutionSchedule>("SELECT "+scheduleRuntimeColumns+" FROM agentstudio.schedules WHERE owner_user_id=$1::uuid AND deleted_at IS NULL ORDER BY updated_at DESC,id LIMIT 100",[owner])).rows.map(normalizeExecutionSchedule)})}
}
