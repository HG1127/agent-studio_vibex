import {reportWorkerStartupFailure} from './pg18-full069-worker-startup-observation.mjs'
import {selectNativeLocalDeviceExecution} from './native-local-device-runtime-policy.ts'
import {verifyNativeLocalDeviceSchema} from './native-local-device-audit.ts'
import {selectAgentCallerExecution} from './agent-caller-execution-opt-in.ts'
import type {WorkerHeartbeatWorkerLifecycle} from './worker-heartbeat-worker-lifecycle.ts'
import {selectKnowledgeSharing} from "./knowledge-sharing-policy.ts"
import {verifyKnowledgeRuntimeSchema,verifyWorkflowSampleLineageSchema} from "./knowledge-content-privileges.ts"
import {inspectAgentHumanInputSchema} from "./agent-human-input-audit.ts"
import {inspectAgentMemorySchema} from "./agent-memory-audit.ts"
import {inspectAgentMemoryContextSchema} from "./agent-memory-context-audit.ts"
import {selectAgentMemoryRuntime,selectAgentOutcomeMemoryWrites} from "./agent-memory-runtime-policy.ts"
import {inspectAgentMemoryFailureSourceSchema} from "./agent-memory-failure-source-audit.ts"
import {inspectAgentMemoryOutcomeSchema} from "./agent-memory-outcome-audit.ts"
import {scopedEmbeddingSettingsPool,scopedEmbeddingConsentPool} from "./knowledge-scope-policy.ts"
import {scopedKnowledgeQueryPool} from "./knowledge-query-policy.ts"
import {selectKnowledgeToolRuntime,scopedKnowledgeToolPool,verifyKnowledgeToolSchema} from "./knowledge-tool-policy.ts"
import {fileURLToPath} from "node:url"
import path from "node:path"
import {selectAutonomousAgentExecution} from "./durable-v2-root.ts"
// Explicit PG18 V2 Worker. Independent Model/Tool private mTLS adapters are
// disabled by default. Agent nodes pause before creating an external effect.
import {readFileSync,lstatSync,accessSync,constants} from "node:fs"
import {randomUUID} from "node:crypto"
import {setTimeout as sleep} from "node:timers/promises"
import {selectPgRuntimeTarget,verifyPgRuntimeTarget} from "./pg-runtime-target.ts"
import {verifyPgWorkerRoleBoundary} from "./worker-role-preflight.ts"
import {assertPg18CredentialMetadata} from "./worker-credential-policy.ts"
import {assertPgWorkerActivation,assertPg18WorkerCredentialBinding,pgWorkerOfflinePlan} from "./worker-activation-guard.ts"
import type {WorkflowV2EffectExecutor} from "./workflow-v2-worker.ts"
import {selectWorkflowV2ModelExecution} from "./workflow-v2-model-contract.ts"
import {readBoundRuntimeCredential} from "./bound-runtime-credentials.ts"
import {workflowV2ModelEffectExecutor} from "./workflow-v2-model-client.ts"
import {selectWorkflowV2ToolExecution} from "./workflow-v2-tool-contract.ts"
import {workflowV2ToolEffectExecutor} from "./workflow-v2-tool-client.ts"
import {selectWorkflowAgentExecution} from "./workflow-v2-agent-machine.ts"
import {selectScheduleRuntime} from "./schedule-runtime-policy.ts"
import {selectMcpExecution} from "./mcp-call.ts"
import {verifyScheduleRuntimeSchema} from "./schedule-runtime-audit.ts"
import type {SqlPool} from "./contracts.ts"
export function runV2WorkerCli(autonomous=false){
  let startupStage='entry'
  const kind=autonomous?"agent":"workflow"
  const marker="APPROVE_ISOLATED_PG_WORKFLOW_V2_RUNTIME_ONLY"
  function required(name:string){const value=process.env[name]?.trim();if(!value)throw Error("missing_"+name);return value}
  async function main(mode:"serve"|"preflight"){
    startupStage='activation';const localDeviceExecutionApproved=selectNativeLocalDeviceExecution(process.env)
    if(localDeviceExecutionApproved&&!autonomous)throw Error("native_local_autonomous_worker_required")
    const modelEnabled=selectWorkflowV2ModelExecution(process.env)
    const toolsEnabled=selectWorkflowV2ToolExecution(process.env)
    const knowledgeToolsEnabled=selectKnowledgeToolRuntime(process.env)
    const scheduleApproved=selectScheduleRuntime(process.env),scheduleEnabled=!autonomous&&scheduleApproved
    if(scheduleEnabled&&!selectAutonomousAgentExecution(process.env))throw Error("schedule_autonomous_worker_not_approved")
    if(knowledgeToolsEnabled&&!toolsEnabled)throw Error("workflow_knowledge_tool_adapter_disabled")
    const callerApproved=selectAgentCallerExecution(process.env)
    if(callerApproved&&!autonomous)throw Error("agent_caller_autonomous_worker_required")
    const agentsEnabled=autonomous?selectAutonomousAgentExecution(process.env):selectWorkflowAgentExecution(process.env)
    const memoryApproved=selectAgentMemoryRuntime(process.env)
    const outcomeApproved=selectAgentOutcomeMemoryWrites(process.env)
    if(outcomeApproved&&(!autonomous||!agentsEnabled))throw Error("unsafe_agent_outcome_memory_worker_scope")
    if(memoryApproved&&!selectAutonomousAgentExecution(process.env))throw Error("autonomous_agent_not_approved")
    if(agentsEnabled&&(!modelEnabled||!toolsEnabled))throw Error("workflow_v2_agents_not_approved")
    if(autonomous&&!agentsEnabled)throw Error("autonomous_agent_not_approved")
    if(mode==="serve"){
      assertPgWorkerActivation(process.env,["--serve"])
      if(process.env.AGENT_STUDIO_PG_PILOT_ENABLED!=="true"||
         (!autonomous&&(process.env.AGENT_STUDIO_PG_WORKFLOW_V2_WORKER_ENABLED!=="true"||
         process.env.AGENT_STUDIO_PG_WORKFLOW_V2_WORKER_APPROVED!==marker)))throw Error("workflow_v2_worker_not_approved")
    }
    startupStage='credential_binding';assertPg18WorkerCredentialBinding(process.env,kind)
    startupStage='credential_read';const target=selectPgRuntimeTarget(process.env,"worker")
    if(target.mode!=="baota_pg18")throw Error("workflow_v2_pg18_target_required")
    const file=required("AGENT_STUDIO_PG_WORKER_PASSWORD_FILE"),stat=lstatSync(file)
    let canRead=false;try{accessSync(file,constants.R_OK);canRead=true}catch{}
    assertPg18CredentialMetadata({kind,env:process.env,file,stat,uid:process.getuid?.(),canRead})
    const password=readFileSync(file,"utf8").replace(/[\r\n]+$/g,"")
    if(password.length<32||password.length>4096||/^(.)\1+$/.test(password))throw Error("unsafe_worker_secret")
    let stop=false
    let heartbeat:WorkerHeartbeatWorkerLifecycle|null=null
    let claimsClosed:(()=>boolean)|undefined
    let closeWorkerClaims:(()=>void)|undefined,closeScheduleClaims:(()=>void)|undefined
    const requestStop=()=>{stop=true;closeWorkerClaims?.();closeScheduleClaims?.();if(claimsClosed?.())heartbeat?.newClaimsClosed()}
    process.once("SIGTERM",requestStop);process.once("SIGINT",requestStop)
    startupStage='pg_import';const {Pool}=await import("pg")
    startupStage='pool_create';const pool=new Pool({host:target.host,port:target.port,user:target.user,database:target.database,password,max:2,
      connectionTimeoutMillis:4000,statement_timeout:8000,idleTimeoutMillis:10000})
    const rawAdapter:SqlPool={knowledgeSharing:selectKnowledgeSharing(process.env),async connect(){const db=await pool.connect();return {
      async query<Row>(sql:string,values:unknown[]=[]){return {rows:(await db.query(sql,values)).rows as Row[]}},release(){db.release()}}}}
    const adapter=scopedKnowledgeToolPool(scopedKnowledgeQueryPool(scopedEmbeddingConsentPool(scopedEmbeddingSettingsPool(rawAdapter,knowledgeToolsEnabled),knowledgeToolsEnabled),knowledgeToolsEnabled),knowledgeToolsEnabled)
    try{
      startupStage='target_audit';await verifyPgRuntimeTarget(adapter,target);startupStage='worker_role_audit';await verifyPgWorkerRoleBoundary(adapter,target)
      if(localDeviceExecutionApproved){const db=await adapter.connect();try{await db.query("BEGIN READ ONLY");await db.query("SET LOCAL ROLE agentstudio_api");await verifyNativeLocalDeviceSchema(db)}finally{try{await db.query("ROLLBACK")}finally{db.release()}}}
      startupStage='workflow_lineage_audit';await verifyWorkflowSampleLineageSchema(adapter)
      startupStage='schedule_audit';if(scheduleApproved)await verifyScheduleRuntimeSchema(adapter)
      startupStage='knowledge_runtime_audit';if(adapter.knowledgeSharing||modelEnabled||toolsEnabled)await verifyKnowledgeRuntimeSchema(adapter,true)
      startupStage='knowledge_tool_audit';if(knowledgeToolsEnabled)await verifyKnowledgeToolSchema(adapter)
      startupStage='human_input_audit';const humanInputAvailable=await inspectAgentHumanInputSchema(adapter)
      startupStage='memory_schema_audit';const memoryAvailable=await inspectAgentMemorySchema(adapter),memoryContextAvailable=await inspectAgentMemoryContextSchema(adapter)
      if(memoryApproved&&(!memoryAvailable||!memoryContextAvailable||!humanInputAvailable))throw Error("agent_memory_runtime_required")
      startupStage='outcome_schema_audit';const outcomeAvailable=await inspectAgentMemoryOutcomeSchema(adapter)
      startupStage='failure_source_audit';await inspectAgentMemoryFailureSourceSchema(adapter)
      if(outcomeApproved&&(!outcomeAvailable||!humanInputAvailable))throw Error("agent_memory_outcome_schema_required")
      startupStage='dispatch_credentials';const config=modelEnabled||toolsEnabled?{approvedForIsolatedUat:true,localDeviceExecutionApproved,
        origin:"https://127.0.0.1:7453",reviewedServerFingerprint256:required("AGENT_STUDIO_PG_BOUND_DISPATCH_SERVER_FINGERPRINT"),
        ca:readBoundRuntimeCredential(kind,"dispatch-ca.pem",process.env),
        cert:readBoundRuntimeCredential(kind,autonomous?"dispatch-agent.pem":"dispatch-workflow.pem",process.env),
        key:readBoundRuntimeCredential(kind,autonomous?"dispatch-agent.key":"dispatch-workflow.key",process.env)}:undefined
      const adapters=[...(modelEnabled?[workflowV2ModelEffectExecutor(config!)]:[]),...(toolsEnabled?[workflowV2ToolEffectExecutor(config!)]:[])]
      const executor:WorkflowV2EffectExecutor|undefined=adapters.length?{supports:request=>adapters.some(adapter=>adapter.supports!(request)),
        execute:(request,lease)=>{
          const adapter=adapters.find(candidate=>candidate.supports!(request));if(!adapter)throw Error("workflow_effect_adapter_unavailable")
          return adapter.execute(request,lease)
        }}:undefined
      if(mode==="preflight"){
        process.stdout.write(JSON.stringify({mode,worker:autonomous?"autonomous_agent":"workflow_v2",verified_roles:true,db_writes_performed:false,
          worker_started:false,effect_executor_installed:false,model_adapter_config_verified:modelEnabled,tool_adapter_config_verified:toolsEnabled,
          agent_adapter_config_verified:agentsEnabled,schedule_schema_verified:scheduleApproved,scheduler_started:false,
          ...(memoryApproved?{memory_schema_verified:true,memory_execution_enabled:autonomous}:{}),
          ...(outcomeApproved?{outcome_memory_schema_verified:true,outcome_memory_execution_enabled:autonomous}:{}),production_cutover_allowed:false})+"\n");return
      }
      startupStage='heartbeat_open';if(process.env.AGENT_STUDIO_PG_WORKER_HEARTBEAT_ENABLED==='true')heartbeat=await (await import('./worker-heartbeat-worker-lifecycle.ts')).openWorkerHeartbeatWorkerLifecycle(autonomous?'agent_autonomous':'workflow_v2')
      // Preflight never loads either execution Worker or its claim SQL.
      startupStage='worker_import';const {WorkflowV2Worker}=await import("./workflow-v2-worker.ts")
      const scheduleRuntime=scheduleEnabled?await import("./schedule-runtime-worker.ts"):undefined
      startupStage='worker_construct';const worker=new WorkflowV2Worker(adapter,(autonomous?"pg-agent-v2-":"pg-workflow-v2-")+randomUUID().slice(0,8),{executor,localDeviceExecutionApproved,agentExecutionApproved:agentsEnabled,agentCallerExecutionApproved:callerApproved,scheduleExecutionApproved:scheduleApproved,humanInputApproved:humanInputAvailable,memoryExecutionApproved:autonomous&&memoryApproved,outcomeMemoryApproved:autonomous&&outcomeApproved,executionMode:autonomous?"agent_native_v2":"workflow_native_v2"})
      closeWorkerClaims=()=>worker.closeNewClaims()
      claimsClosed=()=>worker.claimAdmissionSnapshot().closed
      if(stop){closeWorkerClaims();if(claimsClosed())heartbeat?.newClaimsClosed();return}
      const scheduler=scheduleRuntime?new scheduleRuntime.ScheduleRuntimeWorker(adapter,"pg-schedule-"+randomUUID().slice(0,8),{allowMcpExecution:selectMcpExecution(process.env),allowKnowledgeExecution:knowledgeToolsEnabled,allowHumanInput:humanInputAvailable}):undefined
      closeScheduleClaims=()=>scheduler?.closeNewClaims()
      claimsClosed=()=>worker.claimAdmissionSnapshot().closed&&(!scheduler||scheduler.claimAdmissionSnapshot().closed)
      if(stop){closeWorkerClaims();closeScheduleClaims();if(claimsClosed())heartbeat?.newClaimsClosed();return}
      heartbeat?.startupChecksComplete()
      process.stdout.write(JSON.stringify({service:autonomous?"pg-autonomous-agent":"pg-workflow-v2",state:"ready",effect_executor_installed:adapters.length>0,
        scheduler_started:Boolean(scheduler),production_cutover_allowed:false})+"\n")
      startupStage='loop_run';while(!stop){
        try{if(scheduler){const dispatched=await scheduler.tick();if(dispatched.status!=="idle")process.stdout.write(JSON.stringify({service:"pg-scheduler",state:dispatched.status})+"\n")}
          if(stop)break
          const result=await worker.tick()
          if(result.status!=="idle")process.stdout.write(JSON.stringify({service:autonomous?"pg-autonomous-agent":"pg-workflow-v2",state:result.status,run_id:result.run_id})+"\n")
          if(!stop)await sleep(result.status==="idle"?900:100)
        }catch{heartbeat?.loopUnavailable();process.stderr.write(JSON.stringify({service:autonomous?"pg-autonomous-agent":"pg-workflow-v2",error:"durable_v2_tick_failed"})+"\n");if(!stop)await sleep(1500)}
      }
    }finally{const priorStartupStage=startupStage;startupStage='pool_cleanup';heartbeat?.close();await pool.end();startupStage=priorStartupStage}
  }
  const args=process.argv.slice(2)
  if(args.length===1&&args[0]==="--plan"){
    process.stdout.write(JSON.stringify({...pgWorkerOfflinePlan(kind),mode:"plan",workflow_execution:autonomous?"agent_native_v2":"workflow_native_v2",
      effect_executor_installed:false,separate_approval_required:true,production_cutover_allowed:false})+"\n")
  }else if(args.length===1&&(args[0]==="--preflight"||args[0]==="--serve")){
    void main(args[0]==="--serve"?"serve":"preflight").catch(error=>{
      try{reportWorkerStartupFailure(startupStage,error)}catch{}
      const message=error instanceof Error?error.message:""
      const safe=/^(missing_[A-Z0-9_]+|unsafe_[a-z_]+|pg18_worker_not_approved|workflow_v2_worker_not_approved|workflow_v2_pg18_target_required|pg18_worker_credential_binding_required)$/
      process.stderr.write(JSON.stringify({service:autonomous?"pg-autonomous-agent":"pg-workflow-v2",error:safe.test(message)?message:"workflow_v2_start_failed"})+"\n")
      process.exitCode=1
    })
  }else{process.stderr.write("PG_WORKFLOW_V2_EXPLICIT_MODE_REQUIRED\n");process.exitCode=1}

}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))runV2WorkerCli()
