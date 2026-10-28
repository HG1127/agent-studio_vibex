import {HttpError,isUuid,type Identity,type SqlPool,type SqlClient} from "./contracts.ts"
import {withActorClient} from "./repository.ts"
import {applyKnowledgeScope} from "./knowledge-scope-policy.ts"
import {WorkflowV2RunRepository} from "./workflow-v2-run-repository.ts"
import {AutonomousAgentRunRepository} from "./autonomous-agent-run-repository.ts"
import {recurrenceNext,type ScheduleExecution} from "./schedule-runtime-contract.ts"
import {safeScheduleDraftInput} from "./schedule-draft-repository.ts"
import {createWorkerClaimAdmission,type WorkerClaimAdmissionView,type WorkerClaimPermit} from "./worker-claim-admission.ts"

type TransactionAck="not_started"|"commit_confirmed"|"rollback_confirmed"|"unknown"
type LocalIntent={permit:WorkerClaimPermit|null;uncertain:boolean;ambiguous:boolean;ack:TransactionAck}
export type ScheduleClaimAdmissionView=WorkerClaimAdmissionView&Readonly<{coverage:"local_schedule_reserve_and_launch_only"}>
type Claim={occurrence_id:string;lease_token:string;lease_version:number|string;worker_id:string}
type Skipped={skipped:true;occurrence_id:string;reason:"previous_run_incomplete"}
type Launch={occurrence_id:string;owner_user_id:string;identity:Identity;kind:"agent"|"workflow";target_id:string;execution:ScheduleExecution;planned_run_id:string;authority_id:string}
async function transaction<T>(pool:SqlPool,body:(db:SqlClient)=>Promise<T>){const db=await pool.connect();let active=false
  try{await db.query("BEGIN");active=true;await applyKnowledgeScope(db,pool);await db.query("SET LOCAL ROLE agentstudio_worker")
    const result=await body(db);await db.query("COMMIT");active=false;return result
  }catch(error){if(active)await db.query("ROLLBACK").catch(()=>{});throw error}finally{db.release()}}
export class ScheduleRuntimeWorker{
  readonly pool:SqlPool;readonly workerId:string;readonly flows:WorkflowV2RunRepository;readonly agents:AutonomousAgentRunRepository
  readonly #claimAdmission=createWorkerClaimAdmission({lanes:["schedule"]})
  readonly #intents=new Set<LocalIntent>()
  constructor(pool:SqlPool,workerId:string,options:{allowMcpExecution?:boolean;allowKnowledgeExecution?:boolean;allowHumanInput?:boolean}={}){
    if(!/^[A-Za-z0-9_-]{1,120}$/.test(workerId))throw Error("invalid_schedule_worker_id")
    this.pool=pool;this.workerId=workerId;this.flows=new WorkflowV2RunRepository(pool,"workflow_native_v2",options);this.agents=new AutonomousAgentRunRepository(pool,options)
  }
  closeNewClaims():void {this.#claimAdmission.close()}
  // Includes held/direct launch operations, including those admitted after close.
  // These local counts do not prove global occurrence convergence or system drain.
  claimAdmissionSnapshot():ScheduleClaimAdmissionView {
    const pending=this.#intents.size,uncertain=[...this.#intents].filter(x=>x.uncertain).length
    const lane=Object.freeze({lane:"schedule",pending,uncertain})
    return Object.freeze({closed:this.#claimAdmission.snapshot().closed,pending,uncertain,
      lanes:Object.freeze([lane]),coverage:"local_schedule_reserve_and_launch_only"})
  }
  #intent():LocalIntent {return {permit:null,uncertain:false,ambiguous:false,ack:"not_started"}}
  #markUncertain(intent:LocalIntent,permanent=false):void {
    if(!this.#intents.has(intent))return
    intent.uncertain=true
    if(permanent){intent.ambiguous=true;if(intent.permit)this.#claimAdmission.markUncertain(intent.permit)}
  }
  #settle(intent:LocalIntent):void {
    // Call only when the whole local operation ends: an empty/skipped reserve,
    // confirmed reservation rollback, launch, or acknowledged failure ledger.
    if(!this.#intents.has(intent)||intent.uncertain||intent.ambiguous)return
    if(intent.permit){
      if(intent.ack!=="commit_confirmed"&&intent.ack!=="rollback_confirmed")return
      this.#claimAdmission.confirm(intent.permit,{outcome:intent.ack})
    }
    this.#intents.delete(intent)
  }
  async #trackedTransaction<T>(intent:LocalIntent,body:(db:SqlClient)=>Promise<T>):Promise<T>{
    intent.ack="not_started"
    const db=await this.pool.connect()
    let active=false,commitAttempted=false
    try{
      await db.query("BEGIN");active=true
      await applyKnowledgeScope(db,this.pool)
      await db.query("SET LOCAL ROLE agentstudio_worker")
      const result=await body(db)
      commitAttempted=true
      await db.query("COMMIT");active=false;intent.ack="commit_confirmed"
      return result
    }catch(error){
      this.#markUncertain(intent)
      let rolledBack=false
      if(active)try{await db.query("ROLLBACK");rolledBack=true}catch{}
      if(commitAttempted||active&&!rolledBack){intent.ack="unknown";this.#markUncertain(intent,true)}
      // A known pre-COMMIT rollback settles this transaction's temporary doubt;
      // ambiguity from any earlier participating transaction remains sticky.
      else{intent.ack=rolledBack?"rollback_confirmed":"not_started";intent.uncertain=intent.ambiguous}
      throw error
    }finally{
      // Release can fail, but must never clear an unresolved operation.
      try{db.release()}catch(error){this.#markUncertain(intent,true);throw error}
    }
  }
  async #reserve(values:unknown[]){
    const intent=this.#intent()
    try{
      const claim=await this.#trackedTransaction(intent,async db=>{
        const permit=this.#claimAdmission.tryEnter("schedule")
        if(!permit)return null
        intent.permit=permit
        const request=this.#claimAdmission.dispatch(permit,()=>{
          this.#intents.add(intent)
          return db.query<{claim:Claim|Skipped|null}>("SELECT agentstudio.schedule_reserve($1::uuid,$2::bigint,$3::timestamptz,$4::timestamptz,$5::text) AS claim",values)
        })
        if(!request.started){intent.permit=null;return null}
        return (await request.value).rows[0]?.claim
      })
      return {claim,intent}
    }catch(error){this.#settle(intent);throw error}
  }
  async tick(){
    if(this.#claimAdmission.snapshot().closed)return {status:"idle"}
    const peek=await transaction(this.pool,async db=>(await db.query<{item:Record<string,unknown>|null}>("SELECT agentstudio.schedule_peek() AS item")).rows[0]?.item)
    if(!peek||this.#claimAdmission.snapshot().closed)return {status:"idle"}
    const id=String(peek.id),revision=Number(peek.revision),due=new Date(String(peek.due)).getTime(),now=Math.max(Date.now(),new Date(String(peek.now)).getTime(),due)
    if(!isUuid(id)||!Number.isSafeInteger(revision)||!Number.isFinite(due)||!Number.isFinite(now))throw Error("invalid_schedule_peek")
    let next:number|null
    try{
      const rule=safeScheduleDraftInput({name:"Scheduled task",kind:"workflow",target_id:id,time_zone:peek.time_zone,rule:peek.rule}).rule
      next=rule.kind==="once"?null:recurrenceNext(rule,String(peek.time_zone),String(peek.anchor_at),now,due)
    }catch(error){const reason=error instanceof Error&&/^[a-z0-9_]{1,80}$/.test(error.message)?error.message:"invalid_schedule_rule"
      await transaction(this.pool,db=>db.query("SELECT agentstudio.schedule_quarantine($1::uuid,$2::bigint,$3::timestamptz,$4::text)",[id,revision,new Date(due).toISOString(),reason]));return {status:"invalid_schedule",schedule_id:id}}
    const {claim,intent}=await this.#reserve([id,revision,new Date(due).toISOString(),next===null?null:new Date(next).toISOString(),this.workerId])
    if(!claim){this.#settle(intent);return {status:"stale",schedule_id:id}}
    if("skipped" in claim){
      if(claim.skipped!==true||!isUuid(claim.occurrence_id)||claim.reason!=="previous_run_incomplete"){this.#markUncertain(intent,true);throw Error("invalid_schedule_skip")}
      this.#settle(intent)
      return {status:"skipped_overlap",schedule_id:id,occurrence_id:claim.occurrence_id}
    }
    try{const result=await this.#launchHeld(claim,intent);this.#settle(intent);return result}catch(error){
      const reason=error instanceof HttpError?error.code:error instanceof Error&&/^[a-z0-9_]{1,80}$/.test(error.message)?error.message:"schedule_launch_unavailable"
      try{const result=await this.#trackedTransaction(intent,async db=>(await db.query<{status:string}>("SELECT agentstudio.schedule_launch_failed($1::uuid,$2::uuid,$3::bigint,$4::text,$5::text) AS status",[claim.occurrence_id,claim.lease_token,claim.lease_version,this.workerId,reason])).rows[0]?.status)
      this.#settle(intent)
      return {status:result??"stale",schedule_id:id,occurrence_id:claim.occurrence_id}
      }catch(error){this.#markUncertain(intent,true);throw error}
    }
  }
  async launch(claim:Claim){
    // The caller already holds this occurrence; close must not discard it.
    const intent=this.#intent();this.#intents.add(intent)
    try{const result=await this.#launchHeld(claim,intent);this.#settle(intent);return result}
    catch(error){this.#settle(intent);throw error}
  }
  async #launchHeld(claim:Claim,intent:LocalIntent){
    if(!isUuid(claim.occurrence_id)||!isUuid(claim.lease_token)||!Number.isSafeInteger(Number(claim.lease_version))||Number(claim.lease_version)<1||claim.worker_id!==this.workerId)throw Error("invalid_schedule_claim")
    return this.#trackedTransaction(intent,async db=>{
      const ctx=(await db.query<{context:Launch|null}>("SELECT agentstudio.schedule_launch_context($1::uuid,$2::uuid,$3::bigint,$4::text) AS context",[claim.occurrence_id,claim.lease_token,claim.lease_version,this.workerId])).rows[0]?.context
      if(!ctx)return {status:"stale",occurrence_id:claim.occurrence_id}
      if(!isUuid(ctx.owner_user_id)||!isUuid(ctx.planned_run_id)||!isUuid(ctx.target_id)||ctx.kind!=="agent"&&ctx.kind!=="workflow")throw Error("invalid_schedule_launch_context")
      const result=await withActorClient(db,this.pool,ctx.identity,async(client,owner)=>{
        if(owner!==ctx.owner_user_id)throw Error("schedule_owner_changed")
        const raw={expected_revision:ctx.execution.target_revision,idempotency_key:"schedule_"+ctx.occurrence_id,instruction:ctx.execution.instruction}
        return ctx.kind==="agent"?this.agents.admitOwned(client,owner,ctx.target_id,{...raw,max_steps:ctx.execution.max_steps},ctx.planned_run_id,ctx.execution.model_binding??undefined):this.flows.admitOwned(client,owner,ctx.target_id,raw,ctx.planned_run_id)
      })
      await db.query("SET LOCAL ROLE agentstudio_worker")
      const registered=(await db.query<{ok:boolean}>("SELECT agentstudio.schedule_register_origin($1::uuid,$2::uuid,$3::bigint,$4::text,$5::uuid) AS ok",[claim.occurrence_id,claim.lease_token,claim.lease_version,this.workerId,result.run.id])).rows[0]?.ok
      if(!registered)throw Error("schedule_origin_changed")
      return {status:"started",run_id:result.run.id,occurrence_id:claim.occurrence_id}
    })
  }
}
