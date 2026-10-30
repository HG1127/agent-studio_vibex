// Synthetic metadata checks only. These never authorize/create a real target.
import test from 'node:test'
import assert from 'node:assert/strict'
import {requireAgentTemplateMarketGenuineCi,agentTemplateMarketGenuineWorkflow} from './helpers/agent-template-market-genuine-guard.mjs'
import {agentTemplateMarketGenuineFixture} from './helpers/agent-template-market-genuine-fixture.mjs'

test('actual fixture factory refuses ordinary context before fixture dependency loading',async()=>{
 await assert.rejects(()=>agentTemplateMarketGenuineFixture({}),/refuse_non_ephemeral_agent_template_market_genuine_ci/)
})
const env=()=>({GITHUB_ACTIONS:'true',CI:'true',RUNNER_OS:'Linux',RUNNER_ENVIRONMENT:'github-hosted',GITHUB_REPOSITORY:'HG1127/agent-studio_vibex',GITHUB_WORKFLOW:agentTemplateMarketGenuineWorkflow,GITHUB_JOB:'pg18-template-market-genuine',GITHUB_RUN_ID:'1234',AGENT_STUDIO_F07_GENUINE_CI:'YES_DISPOSABLE_F07_ONLY',AGENT_STUDIO_F07_GENUINE_SUITE:'flow',AGENT_STUDIO_PG18_CI_EPHEMERAL:'true',AGENT_STUDIO_PG18_CI_WRITE_APPROVED:'YES_DISPOSABLE_GITHUB_ONLY',AGENT_STUDIO_PG18_CI_HOST:'127.0.0.1',AGENT_STUDIO_PG18_CI_PORT:'5432',AGENT_STUDIO_PG18_CI_DATABASE:'agentstudio_pg18_ci',AGENT_STUDIO_PG18_CI_ADMIN_USER:'agentstudio_admin',AGENT_STUDIO_PG18_CI_ADMIN_PASSWORD:'synthetic-agentstudio-pg18-ci-1234'})
test('pure wrapper retains exact fixed5432 synthetic target for three explicitly named suites',()=>{
 for(const [job,suite]of[['pg18-template-market-genuine','flow'],['pg18-template-market-genuine','database'],['pg18-template-market-browser','browser']]){
  const target=requireAgentTemplateMarketGenuineCi({...env(),GITHUB_JOB:job,AGENT_STUDIO_F07_GENUINE_SUITE:suite},'linux',1001)
  assert.equal(target.host,'127.0.0.1');assert.equal(target.port,5432);assert.equal(target.database,'agentstudio_pg18_ci');assert.ok(Object.isFrozen(target))
 }
})
test('F01 names, missing F07 approval and mismatched matrix/browser purpose do not become F07 authority',()=>{
 for(const patch of[{GITHUB_WORKFLOW:'Agent Studio F01 Agent Design genuine PG18 isolated verification'},{GITHUB_JOB:'pg18-agent-design-genuine'},
  {AGENT_STUDIO_F07_GENUINE_CI:undefined},{AGENT_STUDIO_F07_GENUINE_CI:'YES_DISPOSABLE_F01_ONLY'},
  {GITHUB_JOB:'pg18-template-market-browser',AGENT_STUDIO_F07_GENUINE_SUITE:'flow'},
  {GITHUB_JOB:'pg18-template-market-genuine',AGENT_STUDIO_F07_GENUINE_SUITE:'browser'},{AGENT_STUDIO_F07_GENUINE_SUITE:'unknown'}])assert.throws(()=>requireAgentTemplateMarketGenuineCi({...env(),...patch},'linux',1001))
})
test('all original Node/proxy/TLS and ambient database injections fail before any effect',()=>{
 for(const key of['NODE_OPTIONS','NODE_PATH','NODE_EXTRA_CA_CERTS','NODE_TLS_REJECT_UNAUTHORIZED','HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','http_proxy','https_proxy','all_proxy','DATABASE_URL','PGHOST','PGPORT','PGPASSWORD'])assert.throws(()=>requireAgentTemplateMarketGenuineCi({...env(),[key]:''},'linux',1001))
})
test('local/root/nonLinux/other-repo and every changed database boundary are refused',()=>{
 for(const [platform,uid]of[['win32',1001],['linux',0],['linux',-1],['linux',NaN]])assert.throws(()=>requireAgentTemplateMarketGenuineCi(env(),platform,uid))
 for(const patch of[{RUNNER_ENVIRONMENT:'self-hosted'},{GITHUB_REPOSITORY:'another/repo'},{AGENT_STUDIO_PG18_CI_HOST:'localhost'},{AGENT_STUDIO_PG18_CI_PORT:'5333'},
  {AGENT_STUDIO_PG18_CI_DATABASE:'company'},{AGENT_STUDIO_PG18_CI_ADMIN_USER:'postgres'},{AGENT_STUDIO_PG18_CI_ADMIN_PASSWORD:'other'}])assert.throws(()=>requireAgentTemplateMarketGenuineCi({...env(),...patch},'linux',1001))
})
