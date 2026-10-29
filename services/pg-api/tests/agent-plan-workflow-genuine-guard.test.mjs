import test from 'node:test'
import assert from 'node:assert/strict'
import {requireAgentPlanWorkflowGenuineCi,agentPlanWorkflowGenuineWorkflow,agentPlanWorkflowGenuineJob,agentPlanWorkflowGenuineApproval} from './helpers/agent-plan-workflow-genuine-guard.mjs'
const env=()=>({GITHUB_ACTIONS:'true',CI:'true',RUNNER_OS:'Linux',RUNNER_ENVIRONMENT:'github-hosted',GITHUB_REPOSITORY:'HG1127/agent-studio_vibex',GITHUB_WORKFLOW:agentPlanWorkflowGenuineWorkflow,GITHUB_JOB:agentPlanWorkflowGenuineJob,GITHUB_RUN_ID:'123',AGENT_STUDIO_F05_GENUINE_CI:agentPlanWorkflowGenuineApproval,AGENT_STUDIO_PG18_CI_EPHEMERAL:'true',AGENT_STUDIO_PG18_CI_WRITE_APPROVED:'YES_DISPOSABLE_GITHUB_ONLY',AGENT_STUDIO_PG18_CI_HOST:'127.0.0.1',AGENT_STUDIO_PG18_CI_PORT:'5432',AGENT_STUDIO_PG18_CI_DATABASE:'agentstudio_pg18_ci',AGENT_STUDIO_PG18_CI_ADMIN_USER:'agentstudio_admin',AGENT_STUDIO_PG18_CI_ADMIN_PASSWORD:'synthetic-agentstudio-pg18-ci-123'})
test('F05 guard accepts only explicit ephemeral synthetic hosted tuple',()=>{const value=requireAgentPlanWorkflowGenuineCi(env(),'linux',1001);assert.equal(value.host,'127.0.0.1');assert.equal(value.port,5432);assert.equal(value.database,'agentstudio_pg18_ci');assert.ok(Object.isFrozen(value))})
test('F05 guard refuses Windows, root, local runner, other purpose and production targets',()=>{
 for(const [key,value]of Object.entries({GITHUB_ACTIONS:'false',CI:'false',RUNNER_OS:'Windows',RUNNER_ENVIRONMENT:'self-hosted',GITHUB_REPOSITORY:'company/production',GITHUB_WORKFLOW:'Agent Studio F07 Template Market genuine PG18 isolated verification',GITHUB_JOB:'pg18-template-market-genuine',AGENT_STUDIO_F05_GENUINE_CI:undefined,AGENT_STUDIO_PG18_CI_HOST:'example.com',AGENT_STUDIO_PG18_CI_PORT:'5333',AGENT_STUDIO_PG18_CI_DATABASE:'agent_studio',AGENT_STUDIO_PG18_CI_ADMIN_PASSWORD:'real-password',DATABASE_URL:'postgresql://production',PGHOST:'localhost'}))assert.throws(()=>requireAgentPlanWorkflowGenuineCi({...env(),[key]:value},'linux',1001),/refuse_non_ephemeral/)
 for(const [platform,uid]of [['win32',1001],['linux',0],['linux',-1],['linux',NaN]])assert.throws(()=>requireAgentPlanWorkflowGenuineCi(env(),platform,uid),/refuse_non_ephemeral/)
})
test('F05 guard refuses runtime/proxy/CA injections including defined empty strings',()=>{for(const key of ['NODE_OPTIONS','NODE_PATH','NODE_EXTRA_CA_CERTS','NODE_TLS_REJECT_UNAUTHORIZED','HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','http_proxy','https_proxy','all_proxy'])for(const value of ['','x'])assert.throws(()=>requireAgentPlanWorkflowGenuineCi({...env(),[key]:value},'linux',1001),/refuse_non_ephemeral/)})

test('F05 runtime and browser accept only their exact purpose suite/job pair; original RPC stays compatible',()=>{
 for(const [job,suite]of [['pg18-plan-workflow-runtime','runtime'],['pg18-plan-workflow-browser','browser']]){
  assert.equal(requireAgentPlanWorkflowGenuineCi({...env(),GITHUB_JOB:job,AGENT_STUDIO_F05_GENUINE_SUITE:suite},'linux',1001).port,5432)
  for(const wrong of [undefined,'',suite==='runtime'?'browser':'runtime','rpc'])assert.throws(()=>requireAgentPlanWorkflowGenuineCi({...env(),GITHUB_JOB:job,AGENT_STUDIO_F05_GENUINE_SUITE:wrong},'linux',1001),/refuse_non_ephemeral/)
 }
 assert.equal(requireAgentPlanWorkflowGenuineCi({...env(),AGENT_STUDIO_F05_GENUINE_SUITE:'rpc'},'linux',1001).port,5432)
 for(const suite of ['runtime','browser',''])assert.throws(()=>requireAgentPlanWorkflowGenuineCi({...env(),AGENT_STUDIO_F05_GENUINE_SUITE:suite},'linux',1001),/refuse_non_ephemeral/)
})
test('new F05 jobs cannot impersonate old F01/F07 or bypass host/credential guards',()=>{
 for(const job of ['pg18-agent-design-browser','pg18-template-market-browser','pg18-plan-workflow-other'])assert.throws(()=>requireAgentPlanWorkflowGenuineCi({...env(),GITHUB_JOB:job,AGENT_STUDIO_F05_GENUINE_SUITE:'browser'},'linux',1001),/refuse_non_ephemeral/)
 for(const suite of ['runtime','browser'])for(const patch of [{RUNNER_ENVIRONMENT:'self-hosted'},{DATABASE_URL:'synthetic-forbidden'},{NODE_PATH:''},{NODE_TLS_REJECT_UNAUTHORIZED:'0'},{AGENT_STUDIO_PG18_CI_ADMIN_PASSWORD:'real-forbidden'}])assert.throws(()=>requireAgentPlanWorkflowGenuineCi({...env(),GITHUB_JOB:'pg18-plan-workflow-'+suite,AGENT_STUDIO_F05_GENUINE_SUITE:suite,...patch},'linux',1001),/refuse_non_ephemeral/)
})
