import test from 'node:test'
import assert from 'node:assert/strict'
import {prepareAgentPlanWorkflowNative,createAgentPlanWorkflowWorkerRuntime,createAgentPlanWorkflowBrokerRuntime,inspectAgentPlanWorkflowServicePool} from '../src/agent-plan-workflow-composition.ts'
import {agentPlanWorkflowExecutionApproval as approval,agentPlanWorkflowNativeApproval} from '../src/agent-plan-workflow-runtime-policy.ts'
import {agentPlanWorkflowServiceConfig,agentPlanWorkflowCredentialDirectory,agentPlanWorkflowReviewedOrigin,agentPlanWorkflowServiceOfflinePlan,parseAgentPlanWorkflowServiceArgs} from '../src/agent-plan-workflow-service-config.ts'
const noPool={async connect(){assert.fail('default off must not connect')}}
const env=kind=>({AGENT_STUDIO_PG18_AGENT_PLAN_WORKFLOW_EXECUTION_ENABLED:'true',AGENT_STUDIO_PG18_AGENT_PLAN_WORKFLOW_EXECUTION_APPROVED:approval,AGENT_STUDIO_PG_PLAN_WORKFLOW_SERVICE_REVIEWED:'true',CREDENTIALS_DIRECTORY:agentPlanWorkflowCredentialDirectory(kind),AGENT_STUDIO_PG_PLAN_WORKFLOW_ORIGIN:'https://127.0.0.1:7469',AGENT_STUDIO_PG_PLAN_WORKFLOW_SERVER_FINGERPRINT:'11'.repeat(32),AGENT_STUDIO_PG_PLAN_WORKFLOW_CLIENT_FINGERPRINT:'22'.repeat(32),AGENT_STUDIO_PG_BAOTA18_ENABLED:'true',AGENT_STUDIO_PG_BAOTA18_TARGET_CONFIRMED:'true',AGENT_STUDIO_PG_PILOT_ENABLED:'true',AGENT_STUDIO_PG_USER:'agentstudio_stage_login',AGENT_STUDIO_PG_HOST:'127.0.0.1',AGENT_STUDIO_PG_PORT:'5333',AGENT_STUDIO_PG_DATABASE:'agent_studio'})
test('default-off Native has no DB, repository or mounted handler',async()=>{
 const part=await prepareAgentPlanWorkflowNative({pool:noPool,env:{},listen:true,allowedOrigin:'https://localhost:17443',configurationWrites:true})
 assert.deepEqual(part.capabilities,{available:false,submissions:false,saves:false});assert.equal(part.createHandler(async()=>assert.fail()),null)
 assert.equal(part.metadataOptions.allowAgentPlanWorkflow,false)
})
test('Native exact approval and writes are checked before any pool access',async()=>{
 for(const patch of [{AGENT_STUDIO_PG18_AGENT_PLAN_WORKFLOW_AVAILABLE:'true'},{AGENT_STUDIO_PG18_AGENT_PLAN_WORKFLOW_AVAILABLE:'true',AGENT_STUDIO_PG18_AGENT_PLAN_WORKFLOW_APPROVED:agentPlanWorkflowNativeApproval,AGENT_STUDIO_PG18_AGENT_PLAN_WORKFLOW_SUBMISSIONS_ENABLED:'true'}])await assert.rejects(prepareAgentPlanWorkflowNative({pool:noPool,env:patch,listen:true,allowedOrigin:'https://localhost:17443',configurationWrites:false}),/opt_in_refused/)
})
test('Worker and Broker cannot start with missing or foreign activation',async()=>{
 await assert.rejects(createAgentPlanWorkflowWorkerRuntime({workerPool:noPool}),/service_disabled/)
 await assert.rejects(createAgentPlanWorkflowBrokerRuntime({businessPool:noPool,dispatchPool:noPool,secretPool:noPool}),/service_disabled/)
 await assert.rejects(createAgentPlanWorkflowWorkerRuntime({workerPool:noPool,executionEnabled:true,executionApproval:'APPROVE_OTHER_PURPOSE'}),/execution_disabled/)
})
test('Broker refuses aliased pool wrappers before original login access',async()=>{
 await assert.rejects(createAgentPlanWorkflowBrokerRuntime({businessPool:noPool,dispatchPool:noPool,secretPool:noPool,executionEnabled:true,executionApproval:approval}),/startup_refused/)
})
test('unsafe original API and secret LOGIN never reach SET ROLE or auditor',async()=>{
 for(const role of ['agentstudio_api','agentstudio_model_broker']){
  const calls=[];let released=0
  const db={async query(sql){calls.push(sql);return {rows:sql.includes('WHERE rolname=session_user')?[{login:true,initial_role:false,inherit:false,superuser:false,bypassrls:false,createdb:false,createrole:false,replication:false}]:[]}},release(){released++}}
  await assert.rejects(inspectAgentPlanWorkflowServicePool({async connect(){return db}},role),/startup_refused/)
  assert.equal(calls.some(sql=>sql.startsWith('SET LOCAL ROLE')),false);assert.equal(calls.at(-1),'ROLLBACK');assert.equal(released,1)
 }
})
test('extra/transitive API membership refuses before SET ROLE',async()=>{
 const calls=[],safe={inherit:false,superuser:false,bypassrls:false,createdb:false,createrole:false,replication:false}
 const db={async query(sql){calls.push(sql);if(sql.includes('WHERE rolname=session_user'))return {rows:[{...safe,login:true,initial_role:true}]};if(sql.includes('WHERE rolname=$1'))return {rows:[{...safe,login:false}]};if(sql.includes("'MEMBER'"))return {rows:[{name:'agentstudio_api'},{name:'pg_read_server_files'}]};return {rows:[]}},release(){}}
 await assert.rejects(inspectAgentPlanWorkflowServicePool({async connect(){return db}},'agentstudio_api'),/startup_refused/);assert.equal(calls.some(sql=>sql.startsWith('SET LOCAL ROLE')),false)
})
test('endpoint has no fallback and cannot reuse generic/model/Native ports',()=>{
 assert.deepEqual(agentPlanWorkflowReviewedOrigin('https://127.0.0.1:7469'),{origin:'https://127.0.0.1:7469',port:7469})
 for(const bad of [undefined,'https://127.0.0.1','http://127.0.0.1:7469','https://localhost:7469','https://127.0.0.1:7469/','https://127.0.0.1:7459','https://127.0.0.1:5432','https://example.com:7469','https://user@127.0.0.1:7469'])assert.throws(()=>agentPlanWorkflowReviewedOrigin(bad))
})
test('offline plan and explicit mode expose no default service activation',()=>{
 const plan=agentPlanWorkflowServiceOfflinePlan();assert.equal(plan.credentials_read,false);assert.equal(plan.network_used,false);assert.equal(plan.default_enabled,false);assert.equal(plan.port,undefined)
 assert.deepEqual(parseAgentPlanWorkflowServiceArgs(['--serve','worker']),{mode:'serve',kind:'worker'});assert.throws(()=>parseAgentPlanWorkflowServiceArgs([]));assert.throws(()=>parseAgentPlanWorkflowServiceArgs(['--serve']))
})
test('service configuration accepts dedicated reviewed profiles and refuses cross-purpose configuration',()=>{
 for(const kind of ['worker','broker']){
  const valid=env(kind),cfg=agentPlanWorkflowServiceConfig(valid,kind,'preflight','linux',1001)
  assert.equal(cfg.port,7469);assert.equal(cfg.target.port,5333);assert.equal(cfg.kind,kind)
  for(const patch of [{AGENT_STUDIO_PG18_AGENT_PLAN_WORKFLOW_EXECUTION_APPROVED:'OTHER'},{AGENT_STUDIO_PG_PLAN_WORKFLOW_ORIGIN:undefined},{CREDENTIALS_DIRECTORY:'/root/.agentstudio-pg18-secrets'},{HTTP_PROXY:''},{NODE_TLS_REJECT_UNAUTHORIZED:'0'},{AGENT_STUDIO_PG_PLAN_WORKFLOW_CLIENT_FINGERPRINT:'11'.repeat(32)}])assert.throws(()=>agentPlanWorkflowServiceConfig({...valid,...patch},kind,'preflight','linux',1001))
  assert.throws(()=>agentPlanWorkflowServiceConfig(valid,kind,'serve','linux',0));assert.throws(()=>agentPlanWorkflowServiceConfig(valid,kind,'serve','win32',1001))
 }
})
