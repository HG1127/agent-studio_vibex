import {durableV2Root,type DurableV2Mode} from "./durable-v2-root.ts"
// Durable V2 transitions. No provider/tool implementation is imported here.
// External execution requires an explicitly installed trusted adapter; a missing
// adapter pauses the run. Started/unknown effects are never sent again.
import {readFileSync} from "node:fs"
import {HttpError,isUuid,type SqlClient,type SqlPool} from "./contracts.ts"
import {applyKnowledgeScope} from "./knowledge-scope-policy.ts"
import {advanceWorkflowV2Checkpoint,inspectWorkflowV2Checkpoint,recordWorkflowV2EffectResult,
  type WorkflowEffectRequest,type WorkflowNodeTransition} from "./workflow-v2-machine.ts"
import {auditWorkflowV2,checkedWorkflowV2StoredState,verifyWorkflowV2Snapshot,
  workflowV2RunColumns,workflowV2ExecutionRequest,type WorkflowV2RunRow,type WorkflowV2StoredState} from "./workflow-v2-run-repository.ts"
import {WorkflowKnownEffectFailure} from "./workflow-v2-effect-failure.ts"
import {scheduleAutomaticEffect,scheduleOwnedRunCandidate} from "./schedule-effect-policy.ts"
import {inspectWorkflowAgentState,recordWorkflowAgentResult} from "./workflow-v2-agent-machine.ts"
import {initializeWorkflowAgent} from "./workflow-v2-agent-resources.ts"
import {recordAgentMemoryFailureSource} from "./agent-memory-failure-source.ts"
import {AgentMemoryOutcomeRepository} from "./agent-memory-outcome-repository.ts"
const claimSql=readFileSync(new URL("../../../db/postgres/008_claim_workflow_v2.sql",import.meta.url),"utf8")
const agentClaimSql=readFileSync(new URL("../../../db/postgres/009_claim_autonomous_agent.sql",import.meta.url),"utf8")
type Job={id:string;run_id:string;owner_user_id:string;kind:string;payload:{phase:DurableV2Mode;workflow_id?:string;agent_spec_id?:string;workflow_revision?:number;spec_revision?:number;graph_sha256:string};
  lease_owner:string;lease_token:string;lease_version:string|number;lease_until:Date|string;attempts:number;max_attempts:number}
export type WorkflowV2Tick={status:"idle"|"progressed"|"awaiting_approval"|"awaiting_input"|"succeeded"|"failed"|"paused"|"stale";run_id?:string}
export interface WorkflowV2EffectExecutor{
  supports?(request:WorkflowEffectRequest):boolean
  execute(request:WorkflowEffectRequest,lease:{job_id:string;run_id:string;lease_token:string;lease_version:number;worker_id:string;signal:AbortSignal;execution_mode?:DurableV2Mode}):Promise<string>
}
async function tx<T>(pool:SqlPool,fn:(db:SqlClient)=>Promise<T>):Promise<T>{
  const db=await pool.connect();let begun=false
  try{await db.query("BEGIN");begun=true;await applyKnowledgeScope(db,pool);const value=await fn(db);await db.query("COMMIT");begun=false;return value}
  catch(error){if(begun)await db.query("ROLLBACK").catch(()=>undefined);throw error}finally{db.release()}
}
async function actor(db:SqlClient,owner:string){
  await db.query("SET LOCAL ROLE agentstudio_api");await db.query("SELECT set_config('agentstudio.actor_id',$1::text,true)",[owner])
}
function valid(job:Job,worker:string,mode:DurableV2Mode){const root=durableV2Root(mode);return isUuid(job.id)&&isUuid(job.run_id)&&isUuid(job.owner_user_id)&&isUuid(job.lease_token)&&
  job.lease_owner===worker&&job.kind===root.job&&job.payload?.phase===mode&&
  isUuid(job.payload[root.id])&&Number.isSafeInteger(Number(job.lease_version))&&Number(job.lease_version)>0&&
  Number.isSafeInteger(Number(job.payload[root.revision]))&&Number(job.payload[root.revision])>0&&
  /^[a-f0-9]{64}$/.test(job.payload.graph_sha256)}
async function lockLease(db:SqlClient,job:Job,worker:string){
  const root=durableV2Root(job.payload.phase)
  await db.query("SET LOCAL ROLE agentstudio_worker")
  const row=(await db.query<Job>("SELECT id,run_id,owner_user_id,kind,payload,lease_owner,lease_token,lease_version,lease_until,attempts,max_attempts "+
    "FROM agentstudio.jobs WHERE id=$1::uuid AND run_id=$2::uuid AND owner_user_id=$3::uuid AND status='leased' "+
    "AND kind='"+root.job+"' AND payload->>'phase'='"+root.mode+"' AND lease_token=$4::uuid "+
    "AND lease_version=$5::bigint AND lease_owner=$6::text AND lease_until>clock_timestamp() FOR UPDATE",
    [job.id,job.run_id,job.owner_user_id,job.lease_token,job.lease_version,worker])).rows[0]
  return row&&valid(row,worker,root.mode)?row:null
}
async function acknowledge(db:SqlClient,job:Job,worker:string,status:"queued"|"succeeded"|"failed"){
  await db.query("SET LOCAL ROLE agentstudio_worker")
  const rows=await db.query("UPDATE agentstudio.jobs SET status=$6::text,attempts=CASE WHEN $6::text='queued' THEN 0 ELSE attempts END,"+
    "lease_owner=NULL,lease_token=NULL,lease_until=NULL,updated_at=clock_timestamp() WHERE id=$1::uuid "+
    "AND owner_user_id=$2::uuid AND lease_token=$3::uuid AND lease_version=$4::bigint AND lease_owner=$5::text "+
    "AND lease_until>clock_timestamp() AND status='leased' RETURNING id",
    [job.id,job.owner_user_id,job.lease_token,job.lease_version,worker,status])
  if(rows.rows.length!==1)throw Error("workflow_v2_lease_lost")
}
async function stepRows(db:SqlClient,job:Job,events:WorkflowNodeTransition[]){
  for(const event of events){
    const metadata={index:event.step_key.slice(4,9),node_id:event.node_id,node_type:event.node_type,
      execution_mode:job.payload.phase,checkpointed:true,output_chars:event.output?.length??0,
      ...(event.output!==undefined?{output_text:event.output}:{}),...(event.branch?{branch:event.branch}:{}),
      ...(event.round!==undefined?{round:event.round,total:event.total}:{}),...(event.missing?.length?{missing:event.missing}:{})}
    Object.assign(metadata,event.agent_context?{parent_step_key:event.agent_context.parent_step_key,agent_round:event.agent_context.round,agent_phase:event.agent_context.phase}:{})
    await db.query("INSERT INTO agentstudio.run_steps(owner_user_id,run_id,step_key,status,metadata) "+
      "VALUES($1::uuid,$2::uuid,$3::text,$4::text,$5::jsonb) ON CONFLICT(run_id,step_key) DO UPDATE "+
      "SET status=EXCLUDED.status,metadata=EXCLUDED.metadata,updated_at=clock_timestamp() "+
      "WHERE agentstudio.run_steps.owner_user_id=EXCLUDED.owner_user_id",
      [job.owner_user_id,job.run_id,event.step_key,event.status,JSON.stringify(metadata)])
  }
}
type Prepared={tick:WorkflowV2Tick}|{request:WorkflowEffectRequest;job:Job}
export class WorkflowV2Worker{
  readonly pool:SqlPool;readonly workerId:string;readonly executor?:WorkflowV2EffectExecutor
  readonly timeoutMs:number;readonly batch:number
  readonly agentEnabled:boolean
  readonly scheduleEnabled:boolean
  readonly humanEnabled:boolean
  readonly memoryEnabled:boolean
  readonly outcomeEnabled:boolean
  readonly outcomes:AgentMemoryOutcomeRepository
  readonly root:ReturnType<typeof durableV2Root>
  constructor(pool:SqlPool,workerId:string,options:{executor?:WorkflowV2EffectExecutor;effectTimeoutMs?:number;batchSize?:number;agentExecutionApproved?:boolean;scheduleExecutionApproved?:boolean;humanInputApproved?:boolean;memoryExecutionApproved?:boolean;outcomeMemoryApproved?:boolean;executionMode?:DurableV2Mode}={}){
    if(!/^[A-Za-z0-9_-]{1,120}$/.test(workerId))throw Error("invalid_worker_id")
    this.pool=pool;this.workerId=workerId;this.executor=options.executor
    this.agentEnabled=options.agentExecutionApproved===true
    this.scheduleEnabled=options.scheduleExecutionApproved===true
    this.humanEnabled=options.humanInputApproved===true
    this.memoryEnabled=options.memoryExecutionApproved===true
    this.outcomeEnabled=options.outcomeMemoryApproved===true
    this.outcomes=new AgentMemoryOutcomeRepository(pool,{allowWriteback:this.outcomeEnabled})
    this.root=durableV2Root(options.executionMode??"workflow_native_v2")
    this.timeoutMs=options.effectTimeoutMs??30000;this.batch=options.batchSize??8
    if(!Number.isSafeInteger(this.timeoutMs)||this.timeoutMs<10||this.timeoutMs>30000||
       !Number.isSafeInteger(this.batch)||this.batch<1||this.batch>20)throw Error("invalid_workflow_v2_worker_options")
  }
  async claim():Promise<Job|null>{return tx(this.pool,async db=>{
    await db.query("SET LOCAL ROLE agentstudio_worker")
    const job=(await db.query<Job>(this.root.mode==="agent_native_v2"?agentClaimSql:claimSql,[this.workerId,60])).rows[0]
    if(job&&!valid(job,this.workerId,this.root.mode))throw Error("invalid_workflow_v2_claim")
    return job??null
  })}
  async tick():Promise<WorkflowV2Tick>{
    const ambiguous=await this.reconcileExpired()
    if(ambiguous)return ambiguous
    const job=await this.claim();return job?this.execute(job):{status:"idle"}
  }
  async execute(job:Job):Promise<WorkflowV2Tick>{
    if(!valid(job,this.workerId,this.root.mode))return {status:"stale",run_id:job.run_id}
    let prepared:Prepared
    try{prepared=await this.prepare(job)}catch(error){
      if(error instanceof HttpError)return this.fail(job,error.code)
      if(Number(job.attempts)>=Number(job.max_attempts))return this.fail(job,"workflow_v2_retry_exhausted")
      throw error
    }
    if("tick" in prepared)return prepared.tick
    job=prepared.job
    const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined
    let output:string|undefined,unknown=false
    try{
      output=await Promise.race([this.executor!.execute(prepared.request,{job_id:job.id,run_id:job.run_id,
        lease_token:job.lease_token,lease_version:Number(job.lease_version),worker_id:this.workerId,execution_mode:this.root.mode,signal:controller.signal}),
      new Promise<never>((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error("workflow_effect_timeout"))},this.timeoutMs)})])
      if(typeof output!=="string"||output.length>20000||output.includes("\0"))unknown=true
    }catch(error){
      if(error instanceof WorkflowKnownEffectFailure)return this.finishKnownFailure(job,prepared.request,error.code)
      unknown=true
    }finally{if(timer)clearTimeout(timer)}
    // A DB failure after the external call is intentionally NOT retried here.
    // The committed started ledger blocks reclaim; reconciliation pauses it.
    return this.finish(job,prepared.request,unknown?undefined:output!.slice(0,prepared.request.agent_context&&prepared.request.kind==="model"?12000:4000))
  }
  private async prepare(job:Job):Promise<Prepared>{return tx(this.pool,async db=>{
    const leased=await lockLease(db,job,this.workerId)
    if(!leased)return {tick:{status:"stale",run_id:job.run_id}}
    job=leased
    await actor(db,job.owner_user_id)
    const row=(await db.query<WorkflowV2RunRow>("SELECT "+workflowV2RunColumns+" FROM agentstudio.runs "+
      "WHERE id=$1::uuid AND owner_user_id=$2::uuid AND kind='"+this.root.kind+"' FOR UPDATE",[job.run_id,job.owner_user_id])).rows[0]
    if(!row||!["queued","running"].includes(row.status))return {tick:{status:"stale",run_id:job.run_id}}
    const state=checkedWorkflowV2StoredState(row.checkpoint,row.instruction)
    if(state.human_agent_keys?.length&&!this.humanEnabled)throw new HttpError(409,"agent_human_input_execution_disabled")
    if(state.execution_mode!==this.root.mode||row[this.root.id]!==job.payload[this.root.id]||state[this.root.revision]!==Number(job.payload[this.root.revision])||
       state.machine.graph_sha256!==job.payload.graph_sha256)throw new HttpError(409,"workflow_v2_snapshot_changed")
    await verifyWorkflowV2Snapshot(db,job.owner_user_id,row,state)
    if(this.root.kind==="agent"&&await this.outcomes.hasOwned(db,job.owner_user_id,job.run_id)&&(!this.outcomeEnabled||!this.humanEnabled)){
      await this.persist(db,job,state,"paused","agent_memory_outcome_execution_disabled");await acknowledge(db,job,this.workerId,"failed")
      return {tick:{status:"paused",run_id:job.run_id}}
    }
    if(!this.scheduleEnabled&&await scheduleOwnedRunCandidate(db,job.run_id)){
      await this.persist(db,job,state,"paused","schedule_execution_disabled");await acknowledge(db,job,this.workerId,"failed")
      return {tick:{status:"paused",run_id:job.run_id}}
    }
    const active=(await db.query<{status:string}>("SELECT status FROM agentstudio.users WHERE id=$1::uuid",[job.owner_user_id])).rows[0]
    if(active?.status!=="active")throw new HttpError(409,"workflow_owner_disabled")
    if(state.memory_context&&!this.memoryEnabled){
      await this.persist(db,job,state,"paused","agent_memory_execution_disabled");await acknowledge(db,job,this.workerId,"failed")
      return {tick:{status:"paused",run_id:job.run_id}}
    }
    let view=inspectWorkflowV2Checkpoint(state.graph,state.machine)
    for(let i=0;i<this.batch;i++){
      const resolved=view.pending&&state.machine.effects.some(effect=>effect.step_key===view.pending!.step_key)
      if(view.pending&&!resolved){
        let pending=view.pending
        if(pending.kind==="agent"&&state.agent_state){
          const parentApproval=(await db.query<{status:string;reason_code:string}>("SELECT status,reason_code FROM agentstudio.approvals "+
            "WHERE run_id=$1::uuid AND owner_user_id=$2::uuid AND step_key=$3::text FOR SHARE",[job.run_id,job.owner_user_id,pending.step_key])).rows[0]
          if(parentApproval?.status!=="approved"||parentApproval.reason_code!=="wf2:"+pending.input_sha256)throw new HttpError(409,"workflow_agent_parent_approval_changed")
          if(!this.agentEnabled){await this.persist(db,job,state,"paused","workflow_agent_execution_disabled");await acknowledge(db,job,this.workerId,"failed");return {tick:{status:"paused",run_id:job.run_id}}}
          const agent=inspectWorkflowAgentState(state.agent_state,pending)
          if(state.agent_state.human_protocol&&!this.humanEnabled)throw new HttpError(409,"agent_human_input_execution_disabled")
          if(agent.status==="awaiting_input"){
            await this.persist(db,job,state,"awaiting_input","")
            await auditWorkflowV2(db,job.owner_user_id,job.run_id,"workflow.v2_input_requested",{step_key:agent.pending_input!.step_key,input_sha256:agent.pending_input!.input_sha256,kind:agent.pending_input!.kind})
            await acknowledge(db,job,this.workerId,"queued");return {tick:{status:"awaiting_input",run_id:job.run_id}}
          }
          if(agent.status!=="waiting"){
            const failed=agent.status==="failed",rejected=agent.status==="rejected"
            await db.query("INSERT INTO agentstudio.external_effects(run_id,owner_user_id,step_key,tool_name,arguments_sha256,idempotency_key,status,result_reference) "+
              "VALUES($1::uuid,$2::uuid,$3::text,'workflow:agent',$4::text,$5::text,$6::text,$7::text)",
              [job.run_id,job.owner_user_id,pending.step_key,pending.input_sha256,"workflow-agent:"+job.run_id+":"+pending.step_key,
                failed?"failed":"succeeded",JSON.stringify({...(failed?{error_code:agent.error_code}:{output:agent.output}),
                  agent_snapshot:{spec_id:state.agent_state.spec_id,spec_revision:state.agent_state.spec_revision,spec:state.agent_state.spec,
                    snapshot_sha256:state.agent_state.snapshot_sha256,max_steps:pending.configuration.max_steps??3,
                    ...(state.agent_state.human_protocol?{human_protocol:state.agent_state.human_protocol,human_responses:state.agent_state.human_responses??[],
                      parent_input_sha256:pending.input_sha256,human_state:state.agent_state,
                      ...(state.agent_state.delivery_protocol?{delivery_protocol:state.agent_state.delivery_protocol}:{})}: {})}})])
            delete state.agent_state;delete state.agent_dispatch
            if(failed){
              await stepRows(db,job,[{step_key:pending.step_key,node_id:pending.node_id,node_type:"agent",status:"failed"}])
              await this.persist(db,job,state,"failed",agent.error_code);await acknowledge(db,job,this.workerId,"failed")
              return {tick:{status:"failed",run_id:job.run_id}}
            }
            state.machine=recordWorkflowV2EffectResult(state.graph,state.machine,{step_key:pending.step_key,input_sha256:pending.input_sha256,
              output:agent.output.slice(0,4000),...(rejected?{outcome:"rejected" as const}:{})})
            await auditWorkflowV2(db,job.owner_user_id,job.run_id,"workflow.v2_agent_completed",{step_key:pending.step_key,rounds:agent.round,rejected})
            view=inspectWorkflowV2Checkpoint(state.graph,state.machine);continue
          }
          pending=agent.pending!
        }
        let approval=(await db.query<{status:string;reason_code:string}>("SELECT status,reason_code FROM agentstudio.approvals "+
          "WHERE run_id=$1::uuid AND owner_user_id=$2::uuid AND step_key=$3::text FOR UPDATE",[job.run_id,job.owner_user_id,pending.step_key])).rows[0]
        if(!approval&&await scheduleAutomaticEffect(db,job.owner_user_id,job.run_id,pending))approval={status:"approved",reason_code:"wf2:"+pending.input_sha256}
        if(!approval){
          await db.query("INSERT INTO agentstudio.approvals(owner_user_id,run_id,step_key,requested_by,reason_code) "+
            "VALUES($1::uuid,$2::uuid,$3::text,$1::uuid,$4::text)",[job.owner_user_id,job.run_id,pending.step_key,"wf2:"+pending.input_sha256])
          if(pending.agent_context)await stepRows(db,job,[{step_key:pending.step_key,node_id:pending.node_id,node_type:pending.kind,status:"awaiting_approval",agent_context:pending.agent_context}])
          await this.persist(db,job,state,"awaiting_approval","")
          await auditWorkflowV2(db,job.owner_user_id,job.run_id,"workflow.v2_approval_requested",{step_key:pending.step_key,input_sha256:pending.input_sha256,kind:pending.kind})
          await acknowledge(db,job,this.workerId,"queued");return {tick:{status:"awaiting_approval",run_id:job.run_id}}
        }
        if(approval.reason_code!=="wf2:"+pending.input_sha256||approval.status!=="approved")throw new HttpError(409,"workflow_v2_approval_changed")
        const effect=(await db.query<{status:string;arguments_sha256:string;result_reference:string|null}>(
          "SELECT status,arguments_sha256,result_reference FROM agentstudio.external_effects WHERE run_id=$1::uuid "+
          "AND owner_user_id=$2::uuid AND step_key=$3::text FOR UPDATE",[job.run_id,job.owner_user_id,pending.step_key])).rows[0]
        if(effect){
          if(effect.arguments_sha256!==pending.input_sha256)throw new HttpError(409,"workflow_v2_effect_changed")
          if(effect.status==="failed")throw new HttpError(409,"workflow_v2_effect_failed")
          if(effect.status!=="succeeded")return {tick:{status:"stale",run_id:job.run_id}}
          if(typeof effect.result_reference!=="string")throw new HttpError(409,"workflow_v2_effect_result_missing")
          const saved=JSON.parse(effect.result_reference) as {output:string}
          if(pending.agent_context){const parent=inspectWorkflowV2Checkpoint(state.graph,state.machine).pending!
            state.agent_state=recordWorkflowAgentResult(state.agent_state,parent,{step_key:pending.step_key,input_sha256:pending.input_sha256,output:saved.output})
            delete state.agent_dispatch
          }else state.machine=recordWorkflowV2EffectResult(state.graph,state.machine,{step_key:pending.step_key,input_sha256:pending.input_sha256,output:saved.output})
          view=inspectWorkflowV2Checkpoint(state.graph,state.machine);continue
        }
        if(pending.kind==="agent"){
          if(this.agentEnabled){
            if(state.memory_context&&!this.humanEnabled)throw new HttpError(409,"agent_human_input_execution_disabled")
            state.agent_state=await initializeWorkflowAgent(db,job.owner_user_id,pending,{humanInput:this.humanEnabled,fullDelivery:this.humanEnabled,...(state.memory_context?{memoryContext:state.memory_context}:{})})
            if(state.agent_state.human_protocol)state.human_agent_keys=[...new Set([...(state.human_agent_keys??[]),pending.step_key])]
            await stepRows(db,job,[{step_key:pending.step_key,node_id:pending.node_id,node_type:"agent",status:"running"}])
            await this.persist(db,job,state,"queued","")
            await auditWorkflowV2(db,job.owner_user_id,job.run_id,"workflow.v2_agent_initialized",{step_key:pending.step_key,
              spec_revision:state.agent_state.spec_revision,snapshot_sha256:state.agent_state.snapshot_sha256})
            await acknowledge(db,job,this.workerId,"queued")
            return {tick:{status:"progressed",run_id:job.run_id}}
          }
          await this.persist(db,job,state,"paused","workflow_agent_execution_disabled");await acknowledge(db,job,this.workerId,"failed")
          return {tick:{status:"paused",run_id:job.run_id}}
        }
        if(!this.executor||(this.executor.supports&&!this.executor.supports(pending))){
          await this.persist(db,job,state,"paused","workflow_v2_effect_executor_unavailable")
          await acknowledge(db,job,this.workerId,"failed");return {tick:{status:"paused",run_id:job.run_id}}
        }
        await db.query("INSERT INTO agentstudio.external_effects(run_id,owner_user_id,step_key,tool_name,arguments_sha256,idempotency_key,status) "+
          "VALUES($1::uuid,$2::uuid,$3::text,$4::text,$5::text,$6::text,'started')",[job.run_id,job.owner_user_id,pending.step_key,
          "workflow:"+pending.kind,pending.input_sha256,"workflow_v2:"+job.run_id+":"+pending.step_key])
        state.stage=this.root.stage+"effect_started"
        if(pending.agent_context)state.agent_dispatch={step_key:pending.step_key,input_sha256:pending.input_sha256,kind:pending.kind,
          parent_step_key:pending.agent_context.parent_step_key}
        await stepRows(db,job,[{step_key:pending.step_key,node_id:pending.node_id,node_type:pending.kind,status:"running",agent_context:pending.agent_context}])
        await db.query("UPDATE agentstudio.runs SET status='running',checkpoint=$3::jsonb,updated_at=clock_timestamp() "+
          "WHERE id=$1::uuid AND owner_user_id=$2::uuid",[job.run_id,job.owner_user_id,JSON.stringify(state)])
        await auditWorkflowV2(db,job.owner_user_id,job.run_id,"workflow.v2_effect_started",{step_key:pending.step_key,input_sha256:pending.input_sha256})
        return {request:pending,job:leased}
      }
      const next=advanceWorkflowV2Checkpoint(state.graph,state.machine)
      if(!next.progressed)break
      state.machine=next.checkpoint;view=next.view;await stepRows(db,job,next.events)
      if(["failed","succeeded"].includes(view.status))break
    }
    const status=view.status==="waiting"?"queued":view.status==="running"?"queued":view.status
    await this.persist(db,job,state,status,view.error_code,view.result_text)
    await acknowledge(db,job,this.workerId,status==="succeeded"?"succeeded":status==="failed"?"failed":"queued")
    return {tick:{status:status==="succeeded"?"succeeded":status==="failed"?"failed":"progressed",run_id:job.run_id}}
  })}
  private async persist(db:SqlClient,job:Job,state:WorkflowV2StoredState,status:string,error:string,result=""){
    state.stage=this.root.stage+status
    if(status==="succeeded"&&this.root.kind==="agent"&&state.human_agent_keys?.includes("wf2_00002_agent")){
      const row=(await db.query<WorkflowV2RunRow>("SELECT "+workflowV2RunColumns+" FROM agentstudio.runs WHERE id=$1::uuid AND owner_user_id=$2::uuid FOR UPDATE",[job.run_id,job.owner_user_id])).rows[0]
      if(!row)throw new HttpError(409,"agent_human_delivery_unavailable")
      const evidence=await verifyWorkflowV2Snapshot(db,job.owner_user_id,row,state),delivery=evidence.deliveries.wf2_00002_agent
      if(!delivery)throw new HttpError(409,"agent_human_delivery_unavailable")
      result=delivery.output
    }
    await db.query("UPDATE agentstudio.runs SET status=$3::text,checkpoint=$4::jsonb,result_text=$5::text,last_error_code=$6::text,"+
      "step_count=(SELECT count(*)::int FROM agentstudio.run_steps WHERE run_id=$1::uuid AND owner_user_id=$2::uuid),"+
      "updated_at=clock_timestamp(),finished_at=CASE WHEN $3::text IN ('succeeded','failed') THEN clock_timestamp() ELSE NULL END "+
      "WHERE id=$1::uuid AND owner_user_id=$2::uuid",[job.run_id,job.owner_user_id,status,JSON.stringify(state),result,error])
    if(status==="failed"||status==="succeeded"||status==="paused")await auditWorkflowV2(db,job.owner_user_id,job.run_id,
      "workflow.v2_"+status,{cursor:state.machine.cursor,error_code:error})
    if(status==="failed")await this.writeFailureSource(db,job)
    if(status==="failed"||status==="succeeded")await this.writeOutcome(db,job)
  }
  private async writeFailureSource(db:SqlClient,job:Job){
    if(this.root.kind!=="agent")return
    await db.query("SAVEPOINT agent_memory_failure_source")
    try{
      const recorded=await recordAgentMemoryFailureSource(db,job,this.workerId)
      if(recorded===true)await auditWorkflowV2(db,job.owner_user_id,job.run_id,"workflow.v2_failure_source_recorded",{job_id:job.id,lease_version:Number(job.lease_version),protocol:"agent_memory_failure_source_v1"})
      await db.query("RELEASE SAVEPOINT agent_memory_failure_source")
    }catch{
      await db.query("ROLLBACK TO SAVEPOINT agent_memory_failure_source");await db.query("RELEASE SAVEPOINT agent_memory_failure_source")
      await db.query("SET LOCAL ROLE agentstudio_api")
      await auditWorkflowV2(db,job.owner_user_id,job.run_id,"workflow.v2_failure_source_unconfirmed",{reason_code:"attestation_unavailable"})
    }
  }
  private async writeOutcome(db:SqlClient,job:Job){
    if(this.root.kind!=="agent")return
    await db.query("SAVEPOINT agent_memory_outcome_terminal")
    try{await this.outcomes.finishOwned(db,job.owner_user_id,job.run_id);await db.query("RELEASE SAVEPOINT agent_memory_outcome_terminal")}
    catch{
      await db.query("ROLLBACK TO SAVEPOINT agent_memory_outcome_terminal");await db.query("RELEASE SAVEPOINT agent_memory_outcome_terminal")
      await auditWorkflowV2(db,job.owner_user_id,job.run_id,"workflow.v2_memory_outcome_unconfirmed",{reason_code:"storage_unavailable"})
    }
  }
  private async finish(job:Job,request:WorkflowEffectRequest,output:string|undefined):Promise<WorkflowV2Tick>{return tx(this.pool,async db=>{
    const current=await lockLease(db,job,this.workerId);if(!current)return {status:"stale",run_id:job.run_id}
    job=current
    await actor(db,job.owner_user_id)
    const row=(await db.query<WorkflowV2RunRow>("SELECT "+workflowV2RunColumns+" FROM agentstudio.runs "+
      "WHERE id=$1::uuid AND owner_user_id=$2::uuid FOR UPDATE",[job.run_id,job.owner_user_id])).rows[0]!
    const state=checkedWorkflowV2StoredState(row.checkpoint,row.instruction)
    const pending=workflowV2ExecutionRequest(state)
    if(!pending||pending.step_key!==request.step_key||pending.input_sha256!==request.input_sha256)throw new HttpError(409,"workflow_v2_effect_changed")
    const changed=await db.query("UPDATE agentstudio.external_effects SET status=$4::text,result_reference=$5::text,updated_at=clock_timestamp() "+
      "WHERE run_id=$1::uuid AND owner_user_id=$2::uuid AND step_key=$3::text AND status='started' AND arguments_sha256=$6::text RETURNING step_key",
      [job.run_id,job.owner_user_id,request.step_key,output===undefined?"unknown":"succeeded",output===undefined?null:JSON.stringify({output}),request.input_sha256])
    if(changed.rows.length!==1)throw Error("workflow_v2_effect_ledger_changed")
    if(output===undefined){
      await this.persist(db,job,state,"paused","workflow_v2_effect_outcome_unknown")
      await acknowledge(db,job,this.workerId,"failed");return {status:"paused",run_id:job.run_id}
    }
    if(request.agent_context){
      const parent=inspectWorkflowV2Checkpoint(state.graph,state.machine).pending!
      state.agent_state=recordWorkflowAgentResult(state.agent_state,parent,{step_key:request.step_key,input_sha256:request.input_sha256,output})
      delete state.agent_dispatch
      await stepRows(db,job,[{step_key:request.step_key,node_id:request.node_id,node_type:request.kind,status:"succeeded",output,agent_context:request.agent_context}])
      await this.persist(db,job,state,"queued","")
      await auditWorkflowV2(db,job.owner_user_id,job.run_id,"workflow.v2_agent_step_succeeded",{step_key:request.step_key,input_sha256:request.input_sha256})
      await acknowledge(db,job,this.workerId,"queued")
      return {status:"progressed",run_id:job.run_id}
    }
    state.machine=recordWorkflowV2EffectResult(state.graph,state.machine,{step_key:request.step_key,input_sha256:request.input_sha256,output})
    const next=advanceWorkflowV2Checkpoint(state.graph,state.machine);state.machine=next.checkpoint
    await stepRows(db,job,next.events)
    const status=next.view.status==="failed"?"failed":next.view.status==="succeeded"?"succeeded":"queued"
    await this.persist(db,job,state,status,next.view.error_code,next.view.result_text)
    await auditWorkflowV2(db,job.owner_user_id,job.run_id,"workflow.v2_effect_succeeded",{step_key:request.step_key,input_sha256:request.input_sha256})
    await acknowledge(db,job,this.workerId,status==="queued"?"queued":status)
    return {status:status==="queued"?"progressed":status,run_id:job.run_id}
  })}
  private async finishKnownFailure(job:Job,request:WorkflowEffectRequest,error:string):Promise<WorkflowV2Tick>{return tx(this.pool,async db=>{
    const current=await lockLease(db,job,this.workerId);if(!current)return {status:"stale",run_id:job.run_id}
    job=current;await actor(db,job.owner_user_id)
    const row=(await db.query<WorkflowV2RunRow>("SELECT "+workflowV2RunColumns+" FROM agentstudio.runs "+
      "WHERE id=$1::uuid AND owner_user_id=$2::uuid FOR UPDATE",[job.run_id,job.owner_user_id])).rows[0]!
    const state=checkedWorkflowV2StoredState(row.checkpoint,row.instruction)
    const pending=workflowV2ExecutionRequest(state)
    if(!pending||pending.step_key!==request.step_key||pending.input_sha256!==request.input_sha256)throw new HttpError(409,"workflow_v2_effect_changed")
    const changed=await db.query("UPDATE agentstudio.external_effects SET status='failed',updated_at=clock_timestamp() "+
      "WHERE run_id=$1::uuid AND owner_user_id=$2::uuid AND step_key=$3::text AND status='started' "+
      "AND arguments_sha256=$4::text RETURNING step_key",[job.run_id,job.owner_user_id,request.step_key,request.input_sha256])
    if(changed.rows.length!==1)throw Error("workflow_v2_effect_ledger_changed")
    await stepRows(db,job,[{step_key:request.step_key,node_id:request.node_id,node_type:request.kind,status:"failed",agent_context:request.agent_context}])
    if(request.agent_context){const parent=inspectWorkflowV2Checkpoint(state.graph,state.machine).pending!
      state.agent_state=recordWorkflowAgentResult(state.agent_state,parent,{step_key:request.step_key,input_sha256:request.input_sha256,output:"",outcome:"failed",code:error})
      delete state.agent_dispatch
    }
    await this.persist(db,job,state,request.agent_context?"queued":"failed",request.agent_context?"":error)
    await auditWorkflowV2(db,job.owner_user_id,job.run_id,"workflow.v2_effect_failed",{step_key:request.step_key,input_sha256:request.input_sha256,error_code:error})
    await acknowledge(db,job,this.workerId,request.agent_context?"queued":"failed");return {status:request.agent_context?"progressed":"failed",run_id:job.run_id}
  })}
  private async fail(job:Job,error:string):Promise<WorkflowV2Tick>{return tx(this.pool,async db=>{
    const current=await lockLease(db,job,this.workerId);if(!current)return {status:"stale",run_id:job.run_id}
    await actor(db,job.owner_user_id)
    const unresolved=(await db.query("SELECT 1 FROM agentstudio.external_effects WHERE run_id=$1::uuid AND owner_user_id=$2::uuid AND status IN('started','unknown') LIMIT 1",[job.run_id,job.owner_user_id])).rows.length>0
    if(unresolved){await this.pauseUnknown(db,current);await acknowledge(db,current,this.workerId,"failed");return {status:"paused",run_id:job.run_id}}
    await db.query("UPDATE agentstudio.runs SET status='failed',last_error_code=$3::text,finished_at=clock_timestamp(),updated_at=clock_timestamp() "+
      "WHERE id=$1::uuid AND owner_user_id=$2::uuid AND status IN ('queued','running')",[job.run_id,job.owner_user_id,error])
    await auditWorkflowV2(db,job.owner_user_id,job.run_id,"workflow.v2_failed",{error_code:error})
    await this.writeFailureSource(db,current)
    await this.writeOutcome(db,current)
    await acknowledge(db,job,this.workerId,"failed");return {status:"failed",run_id:job.run_id}
  })}
  private async pauseUnknown(db:SqlClient,job:Job){
    await db.query("UPDATE agentstudio.external_effects SET status='unknown',updated_at=clock_timestamp() "+
      "WHERE run_id=$1::uuid AND owner_user_id=$2::uuid AND status='started'",[job.run_id,job.owner_user_id])
    await db.query("UPDATE agentstudio.runs SET status='paused',checkpoint=jsonb_set(checkpoint,'{stage}','\""+this.root.stage+"paused\"'::jsonb),"+
      "last_error_code='workflow_v2_effect_outcome_unknown',updated_at=clock_timestamp() "+
      "WHERE id=$1::uuid AND owner_user_id=$2::uuid AND status IN ('queued','running')",[job.run_id,job.owner_user_id])
    await auditWorkflowV2(db,job.owner_user_id,job.run_id,"workflow.v2_ambiguous",{})
  }
  private async reconcileExpired():Promise<WorkflowV2Tick|null>{return tx(this.pool,async db=>{
    await db.query("SET LOCAL ROLE agentstudio_worker")
    const job=(await db.query<Job>("SELECT j.* FROM agentstudio.jobs j WHERE j.kind='"+this.root.job+"' "+
      "AND j.payload->>'phase'='"+this.root.mode+"' AND j.status='leased' AND j.lease_until<=clock_timestamp() "+
      "AND EXISTS(SELECT 1 FROM agentstudio.external_effects x WHERE x.run_id=j.run_id AND x.owner_user_id=j.owner_user_id "+
      "AND x.status IN ('started','unknown')) ORDER BY j.lease_until FOR UPDATE OF j SKIP LOCKED LIMIT 1")).rows[0]
    if(!job)return null
    await actor(db,job.owner_user_id)
    await this.pauseUnknown(db,job)
    await db.query("SET LOCAL ROLE agentstudio_worker")
    await db.query("UPDATE agentstudio.jobs SET status='failed',lease_owner=NULL,lease_token=NULL,lease_until=NULL,updated_at=clock_timestamp() "+
      "WHERE id=$1::uuid AND status='leased' AND lease_until<=clock_timestamp()",[job.id])
    return {status:"paused",run_id:job.run_id}
  })}
}
