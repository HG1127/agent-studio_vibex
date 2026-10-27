// Native autonomous Agent admission, with no synthetic Workflow database row.
import {HttpError,isUuid,type Identity,type AgentSpecInput} from "./contracts.ts"
import {withActor,assertOwnedAdmissionContext} from "./repository.ts"
import {WorkflowV2RunRepository,safeWorkflowV2Request,workflowV2RunColumns,auditWorkflowV2,
  verifyWorkflowV2Snapshot,type WorkflowV2StoredState,type WorkflowV2RunRow} from "./workflow-v2-run-repository.ts"
import {createWorkflowV2Checkpoint} from "./workflow-v2-machine.ts"
import {autonomousAgentGraph} from "./autonomous-agent-graph.ts"
import type {SqlPool,SqlClient} from "./contracts.ts"
import {randomUUID} from "node:crypto"
import {prepareOwnedAgentMemoryContext,insertAgentMemoryContextReceipt} from "./agent-memory-context-policy.ts"
import {agentMemoryContextHash} from "./agent-memory-context.ts"
import {outcomeMemoryOption} from "./agent-memory-outcome-contract.ts"
import {AgentMemoryOutcomeRepository} from "./agent-memory-outcome-repository.ts"
function autonomousRequest(raw:unknown){
  if(!raw||typeof raw!=="object"||Array.isArray(raw))throw new HttpError(400,"invalid_agent_run_request")
  const {max_steps,require_plan_review,remember_outcome,...rest}=raw as Record<string,unknown>,request=safeWorkflowV2Request(rest)
  if(!Number.isSafeInteger(max_steps)||Number(max_steps)<1||Number(max_steps)>30)throw new HttpError(400,"invalid_agent_max_steps")
  if(Object.hasOwn(raw,"require_plan_review")&&typeof require_plan_review!=="boolean")throw new HttpError(400,"invalid_agent_plan_review")
  return {request,max_steps:Number(max_steps),require_plan_review:require_plan_review as boolean|undefined,remember_outcome:outcomeMemoryOption(remember_outcome,Object.hasOwn(raw,"remember_outcome"))}
}
export class AutonomousAgentRunRepository extends WorkflowV2RunRepository{
  readonly allowMemory:boolean
  readonly allowOutcomeMemory:boolean
  constructor(pool:SqlPool,options:{allowMcpExecution?:boolean;allowKnowledgeExecution?:boolean;allowHumanInput?:boolean;allowMemory?:boolean;allowOutcomeMemory?:boolean}={}){super(pool,"agent_native_v2",options);this.allowMemory=options.allowMemory===true;this.allowOutcomeMemory=options.allowOutcomeMemory===true}
  override async submit(identity:Identity,id:string,raw:unknown){
    return withActor(this.pool,identity,(db,owner)=>this.admitOwned(db,owner,id,raw))
  }
  override async prepareOwned(db:SqlClient,owner:string,id:string,raw:unknown,modelBinding?:AgentSpecInput["model_binding"]):Promise<WorkflowV2StoredState>{
    if(!isUuid(id))throw new HttpError(400,"invalid_agent_run_request")
    const {request,max_steps,require_plan_review,remember_outcome}=autonomousRequest(raw)
    if(remember_outcome&&(!this.allowOutcomeMemory||!this.allowHumanInput))throw new HttpError(403,"agent_memory_outcome_admission_disabled")
    await assertOwnedAdmissionContext(db,owner)
    const graph=autonomousAgentGraph(id,request.expected_revision,max_steps,modelBinding,require_plan_review),machine=createWorkflowV2Checkpoint(graph,request.instruction)
    const checkpoint:WorkflowV2StoredState={stage:"agent_v2_queued",execution_mode:"agent_native_v2",spec_revision:request.expected_revision,graph,machine}
    const spec=(await db.query("SELECT id FROM agentstudio.agent_specs WHERE id=$1::uuid AND owner_user_id=$2::uuid FOR SHARE",[id,owner])).rows[0]
    if(!spec)throw new HttpError(404,"agent_spec_not_found")
    await this.checkMcpAdmission(db,owner,graph)
    // Verify before admission and repeat on every decision/tick/dispatch.
    await verifyWorkflowV2Snapshot(db,owner,{kind:"agent",agent_spec_id:id,workflow_id:null} as WorkflowV2RunRow,checkpoint)
    return checkpoint
  }
  override async admitOwned(db:SqlClient,owner:string,id:string,raw:unknown,plannedRunId?:string,modelBinding?:AgentSpecInput["model_binding"]){
    if(!isUuid(id))throw new HttpError(400,"invalid_agent_spec_id")
    const {request,max_steps,require_plan_review,remember_outcome}=autonomousRequest(raw)
    const graph=autonomousAgentGraph(id,request.expected_revision,max_steps,modelBinding,require_plan_review),machine=createWorkflowV2Checkpoint(graph,request.instruction)
    const key=this.root.dedupe+request.idempotency_key
    await assertOwnedAdmissionContext(db,owner,plannedRunId)
    await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1::text,0))",[owner+":"+key])
    const prior=(await db.query<WorkflowV2RunRow>("SELECT r."+workflowV2RunColumns.replaceAll(",",",r.")+" FROM agentstudio.runs r JOIN agentstudio.jobs j "+
      "ON j.run_id=r.id AND j.owner_user_id=r.owner_user_id WHERE j.owner_user_id=$1::uuid AND j.kind='run_tick' "+
      "AND j.dedupe_key=$2::text AND j.payload->>'phase'='agent_native_v2'",[owner,key])).rows[0]
    if(prior){
      if(plannedRunId!==undefined&&prior.id!==plannedRunId)throw new HttpError(409,"idempotency_key_conflict")
      if(prior.kind!=="agent"||prior.agent_spec_id!==id||prior.instruction!==request.instruction||
         prior.checkpoint.execution_mode!=="agent_native_v2"||prior.checkpoint.spec_revision!==request.expected_revision||
         prior.checkpoint.machine.graph_sha256!==machine.graph_sha256)throw new HttpError(409,"idempotency_key_conflict")
      const consent=await new AgentMemoryOutcomeRepository(this.pool).matchOwned(db,owner,prior.id,remember_outcome)
      return {...await this.assemble(db,owner,prior,true),...(consent?{outcome_memory:consent}:{})}
    }
    if(remember_outcome&&plannedRunId!==undefined)throw new HttpError(403,"agent_memory_outcome_schedule_scope_required")
    const checkpoint=await this.prepareOwned(db,owner,id,raw,modelBinding)
    const nextRunId=plannedRunId??randomUUID(),memoryScope={owner_user_id:owner,spec_id:id,spec_revision:request.expected_revision,instruction:request.instruction}
    if(this.allowMemory)checkpoint.memory_context=await prepareOwnedAgentMemoryContext(db,this.pool,memoryScope,nextRunId)
    const run=(await db.query<WorkflowV2RunRow>("INSERT INTO agentstudio.runs(id,owner_user_id,kind,agent_spec_id,status,instruction,checkpoint) "+
      "VALUES(coalesce($5::uuid,gen_random_uuid()),$1::uuid,'agent',$2::uuid,'queued',$3::text,$4::jsonb) RETURNING "+workflowV2RunColumns,
      [owner,id,request.instruction,JSON.stringify(checkpoint),nextRunId])).rows[0]!
    if(checkpoint.memory_context)await insertAgentMemoryContextReceipt(db,{...memoryScope,run_id:run.id,graph_sha256:machine.graph_sha256,context:checkpoint.memory_context})
    const consent=remember_outcome?await new AgentMemoryOutcomeRepository(this.pool,{allowAdmission:this.allowOutcomeMemory}).admitOwned(db,owner,{...memoryScope,run_id:run.id,graph_sha256:machine.graph_sha256}):null
    await db.query("INSERT INTO agentstudio.jobs(owner_user_id,run_id,kind,dedupe_key,payload,max_attempts) "+
      "VALUES($1::uuid,$2::uuid,'run_tick',$3::text,$4::jsonb,30)",[owner,run.id,key,
      JSON.stringify({phase:"agent_native_v2",agent_spec_id:id,spec_revision:request.expected_revision,graph_sha256:machine.graph_sha256})])
    await auditWorkflowV2(db,owner,run.id,"workflow.v2_submit",{spec_revision:request.expected_revision,graph_sha256:machine.graph_sha256,max_steps,
      ...(checkpoint.memory_context?{memory_context_sha256:agentMemoryContextHash(checkpoint.memory_context,memoryScope),memory_items:checkpoint.memory_context.memories.length}:{})})
    return {...await this.assemble(db,owner,run,false),...(consent?{outcome_memory:consent}:{})}
  }

}
