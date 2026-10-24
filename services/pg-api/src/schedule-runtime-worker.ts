import {HttpError,isUuid,type Identity,type SqlPool,type SqlClient} from "./contracts.ts"
import {withActorClient} from "./repository.ts"
import {applyKnowledgeScope} from "./knowledge-scope-policy.ts"
import {WorkflowV2RunRepository} from "./workflow-v2-run-repository.ts"
import {AutonomousAgentRunRepository} from "./autonomous-agent-run-repository.ts"
import {recurrenceNext,type ScheduleExecution} from "./schedule-runtime-contract.ts"
import {safeScheduleDraftInput} from "./schedule-draft-repository.ts"
type Claim={occurrence_id:string;lease_token:string;lease_version:number|string;worker_id:string}
type Launch={occurrence_id:string;owner_user_id:string;identity:Identity;kind:"agent"|"workflow";target_id:string;execution:ScheduleExecution;planned_run_id:string;authority_id:string}
async function transaction<T>(pool:SqlPool,body:(db:SqlClient)=>Promise<T>){const db=await pool.connect();let active=false
  try{await db.query("BEGIN");active=true;await applyKnowledgeScope(db,pool);await db.query("SET LOCAL ROLE agentstudio_worker")
    const result=await body(db);await db.query("COMMIT");active=false;return result
  }catch(error){if(active)await db.query("ROLLBACK").catch(()=>{});throw error}finally{db.release()}}
export class ScheduleRuntimeWorker{
  readonly pool:SqlPool;readonly workerId:string;readonly flows:WorkflowV2RunRepository;readonly agents:AutonomousAgentRunRepository
  constructor(pool:SqlPool,workerId:string,options:{allowMcpExecution?:boolean;allowKnowledgeExecution?:boolean}={}){
    if(!/^[A-Za-z0-9_-]{1,120}$/.test(workerId))throw Error("invalid_schedule_worker_id")
    this.pool=pool;this.workerId=workerId;this.flows=new WorkflowV2RunRepository(pool,"workflow_native_v2",options);this.agents=new AutonomousAgentRunRepository(pool,options)
  }
  async tick(){
    const peek=await transaction(this.pool,async db=>(await db.query<{item:Record<string,unknown>|null}>("SELECT agentstudio.schedule_peek() AS item")).rows[0]?.item)
    if(!peek)return {status:"idle"}
    const id=String(peek.id),revision=Number(peek.revision),due=new Date(String(peek.due)).getTime(),now=Math.max(Date.now(),new Date(String(peek.now)).getTime(),due)
    if(!isUuid(id)||!Number.isSafeInteger(revision)||!Number.isFinite(due)||!Number.isFinite(now))throw Error("invalid_schedule_peek")
    let next:number|null
    try{
      const rule=safeScheduleDraftInput({name:"Scheduled task",kind:"workflow",target_id:id,time_zone:peek.time_zone,rule:peek.rule}).rule
      next=rule.kind==="once"?null:recurrenceNext(rule,String(peek.time_zone),String(peek.anchor_at),now,due)
    }catch(error){const reason=error instanceof Error&&/^[a-z0-9_]{1,80}$/.test(error.message)?error.message:"invalid_schedule_rule"
      await transaction(this.pool,db=>db.query("SELECT agentstudio.schedule_quarantine($1::uuid,$2::bigint,$3::timestamptz,$4::text)",[id,revision,new Date(due).toISOString(),reason]));return {status:"invalid_schedule",schedule_id:id}}
    const claim=await transaction(this.pool,async db=>(await db.query<{claim:Claim|null}>("SELECT agentstudio.schedule_reserve($1::uuid,$2::bigint,$3::timestamptz,$4::timestamptz,$5::text) AS claim",[id,revision,new Date(due).toISOString(),next===null?null:new Date(next).toISOString(),this.workerId])).rows[0]?.claim)
    if(!claim)return {status:"stale",schedule_id:id}
    try{return await this.launch(claim)}catch(error){
      const reason=error instanceof HttpError?error.code:error instanceof Error&&/^[a-z0-9_]{1,80}$/.test(error.message)?error.message:"schedule_launch_unavailable"
      const result=await transaction(this.pool,async db=>(await db.query<{status:string}>("SELECT agentstudio.schedule_launch_failed($1::uuid,$2::uuid,$3::bigint,$4::text,$5::text) AS status",[claim.occurrence_id,claim.lease_token,claim.lease_version,this.workerId,reason])).rows[0]?.status)
      return {status:result??"stale",schedule_id:id,occurrence_id:claim.occurrence_id}
    }
  }
  async launch(claim:Claim){
    if(!isUuid(claim.occurrence_id)||!isUuid(claim.lease_token)||!Number.isSafeInteger(Number(claim.lease_version))||Number(claim.lease_version)<1||claim.worker_id!==this.workerId)throw Error("invalid_schedule_claim")
    return transaction(this.pool,async db=>{
      const ctx=(await db.query<{context:Launch|null}>("SELECT agentstudio.schedule_launch_context($1::uuid,$2::uuid,$3::bigint,$4::text) AS context",[claim.occurrence_id,claim.lease_token,claim.lease_version,this.workerId])).rows[0]?.context
      if(!ctx)return {status:"stale",occurrence_id:claim.occurrence_id}
      if(!isUuid(ctx.owner_user_id)||!isUuid(ctx.planned_run_id)||!isUuid(ctx.target_id)||ctx.kind!=="agent"&&ctx.kind!=="workflow")throw Error("invalid_schedule_launch_context")
      const result=await withActorClient(db,this.pool,ctx.identity,async(client,owner)=>{
        if(owner!==ctx.owner_user_id)throw Error("schedule_owner_changed")
        const raw={expected_revision:ctx.execution.target_revision,idempotency_key:"schedule_"+ctx.occurrence_id,instruction:ctx.execution.instruction}
        return ctx.kind==="agent"?this.agents.admitOwned(client,owner,ctx.target_id,{...raw,max_steps:ctx.execution.max_steps},ctx.planned_run_id):this.flows.admitOwned(client,owner,ctx.target_id,raw,ctx.planned_run_id)
      })
      await db.query("SET LOCAL ROLE agentstudio_worker")
      const registered=(await db.query<{ok:boolean}>("SELECT agentstudio.schedule_register_origin($1::uuid,$2::uuid,$3::bigint,$4::text,$5::uuid) AS ok",[claim.occurrence_id,claim.lease_token,claim.lease_version,this.workerId,result.run.id])).rows[0]?.ok
      if(!registered)throw Error("schedule_origin_changed")
      return {status:"started",run_id:result.run.id,occurrence_id:claim.occurrence_id}
    })
  }
}
