import {originalRunOptionsProtocol} from '../../../shared/original-agent-run-options.ts'
import {parseOriginalRunOptions} from '../../../shared/original-agent-run-options.ts'
import {bindOriginalRunAdmission,originalRunAdmissionMatches} from './original-agent-run-options-policy.ts'
import {safeNativeMonitorBusinessSpec,monitorBusinessTools} from './native-monitor-business-contract.ts'
import {assertOriginalUiEmployee} from './native-original-ui-preconditions.ts'
import {hasNativeLocalAgentTool} from './native-local-agent-contract.ts'
import {workflowAgentSpec} from './workflow-v2-agent-machine.ts'
import {localId} from '../../../shared/native-local-device-contract.mjs'
// Native autonomous Agent admission, with no synthetic Workflow database row.
import {HttpError,isUuid,type Identity,type AgentSpecInput} from "./contracts.ts"
import {withActor,assertOwnedAdmissionContext} from "./repository.ts"
import {WorkflowV2RunRepository,safeWorkflowV2Request,workflowV2RunColumns,auditWorkflowV2,
  verifyWorkflowV2Snapshot,type WorkflowV2StoredState,type WorkflowV2RunRow} from "./workflow-v2-run-repository.ts"
import {createWorkflowV2Checkpoint} from "./workflow-v2-machine.ts"
import {autonomousAgentGraph} from "./autonomous-agent-graph.ts"
import type {SqlPool,SqlClient} from "./contracts.ts"
import {randomUUID} from "node:crypto"
import {safeAgentRunControlRequest,agentRunControlStateHash,agentRunControlFingerprint,checkedAgentRunControlReceipt,assertAgentRunResumeApproval,type AgentRunControlAction} from "./agent-run-control.ts"
import {checkedWorkflowV2StoredState,workflowV2ExecutionRequest} from "./workflow-v2-run-repository.ts"
import {inspectWorkflowV2Checkpoint} from "./workflow-v2-machine.ts"
import {currentKnowledgeObservations} from "./knowledge-observation-policy.ts"
import {agentHumanContext} from "./agent-human-input-policy.ts"
import {requireAgentRunResumeEmployee} from "./agent-run-control-admission.ts"
import {prepareOwnedAgentMemoryContext,insertAgentMemoryContextReceipt} from "./agent-memory-context-policy.ts"
import {agentMemoryContextHash} from "./agent-memory-context.ts"
import {outcomeMemoryOption} from "./agent-memory-outcome-contract.ts"
import {AgentMemoryOutcomeRepository} from "./agent-memory-outcome-repository.ts"
import {AgentOptimizationRepository} from "./agent-optimization-repository.ts"
import {optimizationRetestId,optimizationRetestProof} from "../../../shared/agent-optimization-retest-contract.ts"
import {storedOptimizationRetest} from "./agent-optimization-retest-policy.ts"
import {prepareOriginalRolePinOnClient,insertPreparedOriginalRolePinOnClient,saveOriginalRoleExtensionOnClient} from './original-role-skill-policy.ts'
import {requireOriginalRoleUi,originalRoleUiEnabled} from './original-role-ui-policy.ts'
import {originalRoleHistoryOnClient} from './original-role-history.ts'
import {originalRoleOwnerProjection} from './original-role-owner-projection.ts'
import {originalRoleProfileEnabled} from './original-role-profile.ts'
import {withOriginalRoleAdmission,verifyOriginalRoleState} from './original-role-history.ts'
function autonomousRequest(raw:unknown){
  if(!raw||typeof raw!=="object"||Array.isArray(raw))throw new HttpError(400,"invalid_agent_run_request")
  const {max_steps,require_plan_review,remember_outcome,optimization_lineage_id,local_device_id,task_planning,original_run_options,...rest}=raw as Record<string,unknown>,request=safeWorkflowV2Request(rest)
  if(Object.hasOwn(raw,'task_planning')&&task_planning!=='reviewed_v1')throw new HttpError(400,'invalid_agent_task_planning')
  if(task_planning&&require_plan_review===false)throw new HttpError(400,'invalid_agent_plan_review')
  let runOptions:ReturnType<typeof parseOriginalRunOptions>|undefined
  if(original_run_options!==undefined)try{runOptions=parseOriginalRunOptions(original_run_options)}catch{throw new HttpError(400,'invalid_original_run_options')}
  if(runOptions&&(require_plan_review!==undefined&&require_plan_review!==runOptions.require_plan_review||local_device_id!==undefined&&local_device_id!==runOptions.local_device_id||task_planning!==undefined&&task_planning!==(runOptions.structured_planning?'reviewed_v1':undefined)))throw new HttpError(400,'conflicting_original_run_options')
  const taskPlanning=runOptions?.structured_planning?'reviewed_v1':task_planning as 'reviewed_v1'|undefined
  if(!Number.isSafeInteger(max_steps)||Number(max_steps)<1||Number(max_steps)>30)throw new HttpError(400,"invalid_agent_max_steps")
  if(Object.hasOwn(raw,"require_plan_review")&&typeof require_plan_review!=="boolean")throw new HttpError(400,"invalid_agent_plan_review")
  let lineage:string|undefined
  if(Object.hasOwn(raw,"optimization_lineage_id"))try{lineage=optimizationRetestId(optimization_lineage_id)}catch{throw new HttpError(400,"invalid_optimization_retest")}
  let localDeviceId:string|undefined
  try{localDeviceId=local_device_id===undefined?undefined:localId(local_device_id)}catch{throw new HttpError(400,"invalid_agent_local_device")}
  return {runOptions,taskPlanning,localDeviceId:runOptions?runOptions.local_device_id??undefined:localDeviceId,request,max_steps:Number(max_steps),require_plan_review:runOptions?runOptions.require_plan_review:taskPlanning?true:require_plan_review as boolean|undefined,remember_outcome:outcomeMemoryOption(remember_outcome,Object.hasOwn(raw,"remember_outcome")),optimization_lineage_id:lineage}
}
export class AutonomousAgentRunRepository extends WorkflowV2RunRepository{
  readonly allowOriginalRunOptions:boolean
  readonly originalRunOptionsProtocol?:typeof originalRunOptionsProtocol
  readonly allowMonitorBusiness:boolean
  readonly allowLocalDevices:boolean
  readonly allowMemory:boolean
  readonly allowOutcomeMemory:boolean
  readonly allowOptimizationRetest:boolean
  constructor(pool:SqlPool,options:{allowOriginalRunOptions?:boolean;allowMcpExecution?:boolean;allowKnowledgeExecution?:boolean;allowHumanInput?:boolean;allowMemory?:boolean;allowOutcomeMemory?:boolean;allowOptimizationRetest?:boolean;allowLocalDevices?:boolean;allowMonitorBusiness?:boolean}={}){super(pool,"agent_native_v2",options);this.allowOriginalRunOptions=options.allowOriginalRunOptions===true;if(this.allowOriginalRunOptions)Object.defineProperty(this,'originalRunOptionsProtocol',{value:originalRunOptionsProtocol,writable:false,enumerable:true,configurable:false});this.allowMonitorBusiness=options.allowMonitorBusiness===true;this.allowLocalDevices=options.allowLocalDevices===true;this.allowMemory=options.allowMemory===true;this.allowOutcomeMemory=options.allowOutcomeMemory===true;this.allowOptimizationRetest=options.allowOptimizationRetest===true}
  override async submit(identity:Identity,id:string,raw:unknown,expectedEmployee?:string){
    if((autonomousRequest(raw).runOptions||autonomousRequest(raw).optimization_lineage_id||autonomousRequest(raw).localDeviceId||autonomousRequest(raw).taskPlanning)&&identity.issuer!=="urn:agentstudio:local:v1")throw new HttpError(403,"native_employee_identity_required")
    return withActor(this.pool,identity,(db,owner)=>{assertOriginalUiEmployee(owner,expectedEmployee);return this.admitOwned(db,owner,id,raw)})
  }
  protected override async assemble(db:SqlClient,owner:string,row:WorkflowV2RunRow,replayed:boolean){
    let result=await super.assemble(db,owner,row,replayed)
    if(row.checkpoint.role_run){const {pin}=await originalRoleHistoryOnClient(db,owner,row.id);if(pin.planning_mode)result={...result,run:{...result.run,checkpoint:{...result.run.checkpoint,task_planning:pin.planning_mode}}}}
    const proof=await storedOptimizationRetest(db,owner,row)
    const roleProjection=row.checkpoint.role_run&&result.knowledge_outputs_available!==false?await originalRoleOwnerProjection(db,owner,row.id,row.checkpoint):undefined
    if(!this.allowLocalDevices)return {...result,...(roleProjection?{original_role:roleProjection}:{}),...(proof?{optimization_retest:proof}:{})}
    const local=(await db.query<{device_id:string|null;tasks:unknown}>("SELECT agentstudio.native_local_admission_device($1::uuid) AS device_id,agentstudio.native_local_run_tasks($1::uuid) AS tasks",[row.id])).rows
    if(local.length!==1)throw Error("native_local_invalid_admission_projection")
    return {...result,...(roleProjection?{original_role:roleProjection}:{}),...(proof?{optimization_retest:proof}:{}),local_device_id:local[0]!.device_id,local_tasks:local[0]!.tasks}
  }
  protected async assertBusinessAdmission(_db:SqlClient,_owner:string,rawSpec:unknown,plannedRunId?:string){
    const spec=rawSpec as {tools?:unknown}|undefined
    if(Array.isArray(spec?.tools)&&spec.tools.some(t=>monitorBusinessTools.includes(t))&&(!this.allowMonitorBusiness||plannedRunId===undefined))throw new HttpError(403,'monitor_native_occurrence_required')
  }
  override async prepareOwned(db:SqlClient,owner:string,id:string,raw:unknown,modelBinding?:AgentSpecInput["model_binding"]):Promise<WorkflowV2StoredState>{
    if(!isUuid(id))throw new HttpError(400,"invalid_agent_run_request")
    const {request,max_steps,require_plan_review,remember_outcome,optimization_lineage_id,localDeviceId,taskPlanning,runOptions}=autonomousRequest(raw)
    if(runOptions&&!this.allowOriginalRunOptions)throw new HttpError(403,'original_run_options_disabled')
    if(taskPlanning){requireOriginalRoleUi(db);if(!this.allowHumanInput)throw new HttpError(409,'original_role_human_review_required')}
    if(optimization_lineage_id&&(!this.allowOptimizationRetest||modelBinding!==undefined))throw new HttpError(403,"agent_optimization_retest_disabled")
    if(remember_outcome&&(!this.allowOutcomeMemory||!this.allowHumanInput))throw new HttpError(403,"agent_memory_outcome_admission_disabled")
    await assertOwnedAdmissionContext(db,owner)
    if(optimization_lineage_id)await new AgentOptimizationRepository(this.pool).prepareRetestOwned(db,owner,id,request.expected_revision,optimization_lineage_id)
    const graph=autonomousAgentGraph(id,request.expected_revision,max_steps,modelBinding,require_plan_review),machine=createWorkflowV2Checkpoint(graph,request.instruction)
    const checkpoint:WorkflowV2StoredState={stage:"agent_v2_queued",execution_mode:"agent_native_v2",spec_revision:request.expected_revision,graph,machine}
    const spec=(await db.query("SELECT id,spec FROM agentstudio.agent_specs WHERE id=$1::uuid AND owner_user_id=$2::uuid FOR SHARE",[id,owner])).rows[0]
    if(!spec)throw new HttpError(404,"agent_spec_not_found")
    if(localDeviceId&&!this.allowLocalDevices)throw new HttpError(403,"native_local_device_execution_not_approved")
    if(hasNativeLocalAgentTool(spec.spec)&&(!this.allowLocalDevices||!localDeviceId))throw new HttpError(409,"native_local_device_binding_required")
    if(this.allowMonitorBusiness){if((await db.query<{epoch:string|null}>("SELECT agentstudio.agent_memory_outcome_epoch() AS epoch")).rows[0]?.epoch==null)throw new HttpError(403,"native_employee_identity_required");const raw=spec.spec as Record<string,unknown>;const {require_approval:_,...input}=raw;safeNativeMonitorBusinessSpec(input,true,this.allowLocalDevices&&!!localDeviceId)}else workflowAgentSpec(spec.spec,this.allowLocalDevices&&!!localDeviceId)
    await this.checkMcpAdmission(db,owner,graph)
    // Verify before admission and repeat on every decision/tick/dispatch.
    await verifyWorkflowV2Snapshot(db,owner,{kind:"agent",agent_spec_id:id,workflow_id:null} as WorkflowV2RunRow,checkpoint,this.allowMonitorBusiness)
    return checkpoint
  }
  override async admitOwned(db:SqlClient,owner:string,id:string,raw:unknown,plannedRunId?:string,modelBinding?:AgentSpecInput["model_binding"]){
    if(!isUuid(id))throw new HttpError(400,"invalid_agent_spec_id")
    const {request,max_steps,require_plan_review,remember_outcome,optimization_lineage_id,localDeviceId,taskPlanning,runOptions}=autonomousRequest(raw)
    if(runOptions&&!this.allowOriginalRunOptions)throw new HttpError(403,'original_run_options_disabled')
    if(taskPlanning){requireOriginalRoleUi(db);if(!this.allowHumanInput)throw new HttpError(409,'original_role_human_review_required')}
    if(optimization_lineage_id&&(plannedRunId!==undefined||modelBinding!==undefined))throw new HttpError(403,"agent_optimization_retest_disabled")
    const graph=autonomousAgentGraph(id,request.expected_revision,max_steps,modelBinding,require_plan_review),machine=createWorkflowV2Checkpoint(graph,request.instruction)
    const key=this.root.dedupe+request.idempotency_key
    await assertOwnedAdmissionContext(db,owner,plannedRunId)
    await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1::text,0))",[owner+":"+key])
    const prior=(await db.query<WorkflowV2RunRow>("SELECT r."+workflowV2RunColumns.replaceAll(",",",r.")+" FROM agentstudio.runs r JOIN agentstudio.jobs j "+
      "ON j.run_id=r.id AND j.owner_user_id=r.owner_user_id WHERE j.owner_user_id=$1::uuid AND j.kind='run_tick' "+
      "AND j.dedupe_key=$2::text AND j.payload->>'phase'='agent_native_v2'",[owner,key])).rows[0]
    if(prior){
      if(!originalRunAdmissionMatches(prior.checkpoint.original_ui,runOptions))throw new HttpError(409,'idempotency_key_conflict')
      const priorPin=await verifyOriginalRoleState(db,owner,prior.id,prior.checkpoint.role_run,prior.checkpoint.agent_state)
      const priorPlanning=priorPin?.planning_mode
      if(priorPlanning!==taskPlanning)throw new HttpError(409,'idempotency_key_conflict')
      const original=await storedOptimizationRetest(db,owner,prior)
      if(original?.acceptance_request_id!==optimization_lineage_id)throw new HttpError(409,"idempotency_key_conflict")
      if(plannedRunId!==undefined&&prior.id!==plannedRunId)throw new HttpError(409,"idempotency_key_conflict")
      if(prior.kind!=="agent"||prior.agent_spec_id!==id||prior.instruction!==request.instruction||
         prior.checkpoint.execution_mode!=="agent_native_v2"||prior.checkpoint.spec_revision!==request.expected_revision||
         prior.checkpoint.machine.graph_sha256!==machine.graph_sha256)throw new HttpError(409,"idempotency_key_conflict")
      if(this.allowLocalDevices||localDeviceId)await db.query("SELECT agentstudio.native_local_bind($1::uuid,$2::uuid,true)",[prior.id,localDeviceId??null])
      const consent=await new AgentMemoryOutcomeRepository(this.pool).matchOwned(db,owner,prior.id,remember_outcome)
      return {...await this.assemble(db,owner,prior,true),...(consent?{outcome_memory:consent}:{})}
    }
    if(remember_outcome&&plannedRunId!==undefined)throw new HttpError(403,"agent_memory_outcome_schedule_scope_required")
    const storedSpec=(await db.query<{spec:{tools?:string[]}}>("SELECT spec FROM agentstudio.agent_specs WHERE id=$1::uuid AND owner_user_id=$2::uuid FOR SHARE",[id,owner])).rows[0]
    await this.assertBusinessAdmission(db,owner,storedSpec?.spec,plannedRunId)
    const nextRunId=plannedRunId??randomUUID()
    const roleRows=originalRoleProfileEnabled(db)?(await db.query('SELECT spec_revision FROM agentstudio_roles.original_role_extensions WHERE owner_user_id=$1::uuid AND spec_id=$2::uuid ORDER BY spec_revision DESC LIMIT 1',[owner,id])).rows:[]
    if(taskPlanning&&!roleRows.length)await saveOriginalRoleExtensionOnClient(db,owner,id,request.expected_revision,{protocol:'original_roles_pinned_v1',roles:[],capability_requirements:[]})
    if((roleRows.length||taskPlanning)&&(!this.allowHumanInput||localDeviceId&&(!originalRoleUiEnabled(db)||!taskPlanning)||optimization_lineage_id||plannedRunId!==undefined||modelBinding!==undefined||remember_outcome))throw new HttpError(409,'original_role_launcher_not_supported')
    const rolePrepared=roleRows.length||taskPlanning?await prepareOriginalRolePinOnClient(db,owner,{run_id:nextRunId,spec_id:id,spec_revision:request.expected_revision},{taskPlanning,localDeviceId}):undefined
    const checkpoint=rolePrepared?await withOriginalRoleAdmission(db,owner,id,request.expected_revision,()=>this.prepareOwned(db,owner,id,raw,modelBinding)):await this.prepareOwned(db,owner,id,raw,modelBinding)
    if(rolePrepared)checkpoint.role_run={profile:'original-roles-v2',run_id:nextRunId,payload_sha256:rolePrepared.payload_sha256}
    const memoryScope={owner_user_id:owner,spec_id:id,spec_revision:request.expected_revision,instruction:request.instruction}
    const accepted=optimization_lineage_id?await new AgentOptimizationRepository(this.pool).prepareRetestOwned(db,owner,id,request.expected_revision,optimization_lineage_id):undefined
    const retest=accepted?optimizationRetestProof({protocol:'agent_optimization_retest_v1',run_id:nextRunId,acceptance_request_id:accepted.request_id,source_run_id:accepted.run_id,spec_id:id,spec_revision:accepted.after_spec_revision,source_sha256:accepted.after_spec_sha256,feedback_id:accepted.feedback_id,feedback_sha256:accepted.feedback_sha256,after_revision_id:accepted.after_revision_id},{run_id:nextRunId,spec_id:id,spec_revision:request.expected_revision,acceptance_request_id:optimization_lineage_id}):undefined
    if(this.allowMemory)checkpoint.memory_context=await prepareOwnedAgentMemoryContext(db,this.pool,memoryScope,nextRunId)
    const run=(await db.query<WorkflowV2RunRow>("INSERT INTO agentstudio.runs(id,owner_user_id,kind,agent_spec_id,status,instruction,checkpoint) "+
      "VALUES(coalesce($5::uuid,gen_random_uuid()),$1::uuid,'agent',$2::uuid,'queued',$3::text,$4::jsonb) RETURNING "+workflowV2RunColumns,
      [owner,id,request.instruction,JSON.stringify(checkpoint),nextRunId])).rows[0]
    if(!run)throw new HttpError(503,'unconfirmed_agent_admission')
    if(runOptions){checkpoint.original_ui=await bindOriginalRunAdmission(db,run,request.expected_revision,runOptions);run.checkpoint=checkpoint;const updated=await db.query('UPDATE agentstudio.runs SET checkpoint=$3::jsonb WHERE id=$1::uuid AND owner_user_id=$2::uuid RETURNING id',[run.id,owner,JSON.stringify(checkpoint)]);if(updated.rows.length!==1)throw new HttpError(503,'unconfirmed_original_run_admission')}
    if(rolePrepared)await insertPreparedOriginalRolePinOnClient(db,owner,rolePrepared)
    if(localDeviceId)await db.query("SELECT agentstudio.native_local_bind($1::uuid,$2::uuid,false)",[run.id,localDeviceId])
    if(checkpoint.memory_context)await insertAgentMemoryContextReceipt(db,{...memoryScope,run_id:run.id,graph_sha256:machine.graph_sha256,context:checkpoint.memory_context})
    const consent=remember_outcome?await new AgentMemoryOutcomeRepository(this.pool,{allowAdmission:this.allowOutcomeMemory}).admitOwned(db,owner,{...memoryScope,run_id:run.id,graph_sha256:machine.graph_sha256}):null
    await db.query("INSERT INTO agentstudio.jobs(owner_user_id,run_id,kind,dedupe_key,payload,max_attempts) "+
      "VALUES($1::uuid,$2::uuid,'run_tick',$3::text,$4::jsonb,30)",[owner,run.id,key,
      JSON.stringify({phase:"agent_native_v2",agent_spec_id:id,spec_revision:request.expected_revision,graph_sha256:machine.graph_sha256})])
    await auditWorkflowV2(db,owner,run.id,"workflow.v2_submit",{spec_revision:request.expected_revision,graph_sha256:machine.graph_sha256,max_steps,
      ...(checkpoint.memory_context?{memory_context_sha256:agentMemoryContextHash(checkpoint.memory_context,memoryScope),memory_items:checkpoint.memory_context.memories.length}:{}),...(retest?{optimization_retest:retest}:{})})
    return {...await this.assemble(db,owner,run,false),...(consent?{outcome_memory:consent}:{})}
  }

  async changeRunControl(identity:Identity,id:string,action:AgentRunControlAction,raw:unknown){return this.runControl(identity,id,action,raw,false)}
  async confirmRunControl(identity:Identity,id:string,action:AgentRunControlAction,raw:unknown){return this.runControl(identity,id,action,raw,true)}
  private async runControl(identity:Identity,id:string,action:AgentRunControlAction,raw:unknown,confirmOnly:boolean){
    if(!isUuid(id)||!['pause','resume'].includes(action))throw new HttpError(400,'invalid_agent_run_control')
    id=id.toLowerCase();const request=safeAgentRunControlRequest(raw)
    return withActor(this.pool,identity,async(db,owner)=>{
      await assertOwnedAdmissionContext(db,owner)
      await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1::text,0))',[owner+':agent_run_control:'+request.operation_id])
      const jobs=(await db.query<{id:string;status:string;lease_token:string|null;attempts:number;max_attempts:number}>(
        "SELECT id,status,lease_token,attempts,max_attempts FROM agentstudio.jobs WHERE run_id=$1::uuid AND owner_user_id=$2::uuid AND kind='run_tick' AND payload->>'phase'='agent_native_v2' FOR UPDATE",[id,owner])).rows
      const row=(await db.query<WorkflowV2RunRow>('SELECT '+workflowV2RunColumns+" FROM agentstudio.runs WHERE id=$1::uuid AND owner_user_id=$2::uuid AND kind='agent' AND checkpoint->>'execution_mode'='agent_native_v2' FOR UPDATE",[id,owner])).rows[0]
      if(jobs.length!==1||!row)throw new HttpError(404,'agent_run_not_found')
      const receipts=(await db.query<{metadata:unknown}>("SELECT metadata FROM agentstudio.audit_events WHERE owner_user_id=$1::uuid AND actor_user_id=$1::uuid AND action='agent.v2_run_control' AND metadata->>'operation_id'=$2::text ORDER BY occurred_at LIMIT 2",[owner,request.operation_id])).rows
      if(receipts.length>1)throw new HttpError(409,'agent_run_control_operation_conflict')
      if(receipts.length){const receipt=checkedAgentRunControlReceipt(receipts[0]!.metadata,id,action,request)
        return {...await this.assemble(db,owner,row,true),run_control_confirmation:receipt,control_confirmed:true}
      }
      // Confirmation never applies a missing operation, changes a lease or
      // repeats an external call, including after a lost commit acknowledgement.
      if(confirmOnly)return {...await this.assemble(db,owner,row,false),run_control_confirmation:null,control_confirmed:false}
      if(agentRunControlStateHash(row)!==request.expected_state_sha256)throw new HttpError(409,'agent_run_control_state_changed')
      const state=checkedWorkflowV2StoredState(row.checkpoint,row.instruction),job=jobs[0]!
      const effects=(await db.query<{status:string}>("SELECT status FROM agentstudio.external_effects WHERE run_id=$1::uuid AND owner_user_id=$2::uuid AND status IN ('started','unknown') FOR UPDATE",[id,owner])).rows
      const inFlight=effects.some(effect=>effect.status==='started'),unknown=effects.some(effect=>effect.status==='unknown')
      let status:string
      if(action==='pause'){
        if(!['queued','running','awaiting_approval','awaiting_input'].includes(row.status)||state.manual_pause)throw new HttpError(409,'agent_run_not_pauseable')
        state.manual_pause={operation_id:request.operation_id,return_status:row.status==='awaiting_approval'?'awaiting_approval':row.status==='awaiting_input'?'awaiting_input':'queued'}
        state.stage='agent_v2_paused';status='paused'
        // Retain an existing started call's ORIGINAL lease so only its original
        // Worker can store its result. Closing admission is not a physical undo.
        if(!inFlight)await db.query("UPDATE agentstudio.jobs SET status='queued',lease_owner=NULL,lease_token=NULL,lease_until=NULL,lease_version=lease_version+1,updated_at=clock_timestamp() WHERE id=$1::uuid AND owner_user_id=$2::uuid",[job.id,owner])
      }else{
        if(row.status!=='paused'||!state.manual_pause)throw new HttpError(409,'agent_run_not_manually_paused')
        if(inFlight||unknown)throw new HttpError(409,'agent_run_effect_unresolved')
        if(job.status!=='queued'||job.lease_token!==null||Number(job.attempts)>=Number(job.max_attempts))throw new HttpError(409,'agent_run_queue_unavailable')
        await requireAgentRunResumeEmployee(db)
        if(state.memory_context&&!this.allowMemory||state.human_agent_keys?.length&&!this.allowHumanInput||await new AgentMemoryOutcomeRepository(this.pool).hasOwned(db,owner,id)&&(!this.allowOutcomeMemory||!this.allowHumanInput))throw new HttpError(409,'agent_run_resume_features_disabled')
        await this.checkMcpAdmission(db,owner,state.graph,state.role_run)
        await verifyWorkflowV2Snapshot(db,owner,row,state)
        if(!await currentKnowledgeObservations(db,id))throw new HttpError(409,'knowledge_observations_unavailable')
        const parent=inspectWorkflowV2Checkpoint(state.graph,state.machine).pending,pending=workflowV2ExecutionRequest(state)
        if(state.manual_pause.return_status==='awaiting_approval'&&!pending||state.manual_pause.return_status==='awaiting_input'&&!agentHumanContext(row,state)?.pending_input)throw new HttpError(409,'agent_run_control_state_changed')
        for(const required of [state.agent_state?parent:null,pending]){
          if(!required)continue
          const approval=(await db.query<{status:string;reason_code:string;knowledge_charge:boolean|null}>("SELECT a.status,a.reason_code,(to_jsonb(a)->>'knowledge_query_charge_acknowledged')::boolean AS knowledge_charge FROM agentstudio.approvals a WHERE run_id=$1::uuid AND owner_user_id=$2::uuid AND step_key=$3::text FOR SHARE",[id,owner,required.step_key])).rows[0]
          assertAgentRunResumeApproval(required,approval,{parent:Boolean(state.agent_state&&required===parent),waiting:state.manual_pause.return_status==='awaiting_approval'&&required===pending})
        }
        status=state.manual_pause.return_status;delete state.manual_pause;state.stage='agent_v2_'+status
      }
      const next=(await db.query<WorkflowV2RunRow>("UPDATE agentstudio.runs SET status=$3::text,checkpoint=$4::jsonb,last_error_code=$5::text,updated_at=clock_timestamp() WHERE id=$1::uuid AND owner_user_id=$2::uuid RETURNING "+workflowV2RunColumns,[id,owner,status,JSON.stringify(state),action==='pause'?(unknown?'workflow_v2_effect_outcome_unknown':'agent_run_paused_by_owner'):''])).rows[0]!
      const receipt={operation_id:request.operation_id,action,run_id:id,request_sha256:agentRunControlFingerprint(id,action,request),outcome_status:status}
      await auditWorkflowV2(db,owner,id,'workflow.v2_run_control',receipt)
      return {...await this.assemble(db,owner,next,false),run_control_confirmation:receipt,control_confirmed:true}
    })
  }

}
