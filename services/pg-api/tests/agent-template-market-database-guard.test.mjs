// Pure descriptor/refusal only. No driver, SQL engine or genuine positive.
import test from 'node:test'
import assert from 'node:assert/strict'
import {validateAgentTemplateMarketDatabaseCiContext as validate,requireAgentTemplateMarketDatabaseCi as requireDatabase,createAgentTemplateMarketDatabaseFixture as createFixture} from './helpers/agent-template-market-database-ci.mjs'
const sample=()=>({GITHUB_ACTIONS:'true',CI:'true',RUNNER_OS:'Linux',RUNNER_ENVIRONMENT:'github-hosted',GITHUB_REPOSITORY:'HG1127/agent-studio_vibex',GITHUB_WORKFLOW:'Agent Studio F07 Template Market genuine PG18 isolated verification',GITHUB_JOB:'pg18-template-market-genuine',GITHUB_RUN_ID:'123456',AGENT_STUDIO_F07_GENUINE_CI:'YES_DISPOSABLE_F07_ONLY',AGENT_STUDIO_F07_GENUINE_SUITE:'database',AGENT_STUDIO_PG18_CI_EPHEMERAL:'true',AGENT_STUDIO_PG18_CI_WRITE_APPROVED:'YES_DISPOSABLE_GITHUB_ONLY',AGENT_STUDIO_PG18_CI_HOST:'127.0.0.1',AGENT_STUDIO_PG18_CI_PORT:'5432',AGENT_STUDIO_PG18_CI_DATABASE:'agentstudio_pg18_ci',AGENT_STUDIO_PG18_CI_ADMIN_USER:'agentstudio_admin',AGENT_STUDIO_PG18_CI_ADMIN_PASSWORD:'synthetic-agentstudio-pg18-ci-123456'})

test('database entry rejects ordinary hosts before loading fixture or driver',async()=>{
  assert.throws(()=>requireDatabase({}),/refuse_non_ephemeral/)
  await assert.rejects(()=>createFixture({}),/refuse_non_ephemeral/)
  for(const [platform,uid] of [['win32',1001],['darwin',1001],['linux',0],['linux',-1],['linux',NaN]])assert.throws(()=>validate(sample(),platform,uid),/refuse_non_ephemeral/)
})
test('database descriptor accepts only the genuine F07 database matrix target',()=>{
  const target=validate(sample(),'linux',1001)
  assert.equal(target.host,'127.0.0.1');assert.equal(target.port,5432);assert.equal(target.database,'agentstudio_pg18_ci');assert.equal(Object.isFrozen(target),true)
  for(const patch of [{AGENT_STUDIO_F07_GENUINE_SUITE:'flow'},{AGENT_STUDIO_F07_GENUINE_SUITE:'browser'},{GITHUB_JOB:'pg18-template-market-browser'},{GITHUB_WORKFLOW:'Agent Studio F01 Agent Design genuine PG18 isolated verification'},{GITHUB_JOB:'pg18-agent-design-genuine'},{AGENT_STUDIO_F07_GENUINE_CI:'true'},{RUNNER_ENVIRONMENT:'self-hosted'},{AGENT_STUDIO_PG18_CI_HOST:'localhost'},{AGENT_STUDIO_PG18_CI_PORT:'5333'},{AGENT_STUDIO_PG18_CI_DATABASE:'agent_studio'},{DATABASE_URL:'postgres://forbidden/db'},{PGHOST:'foreign'}])assert.throws(()=>validate({...sample(),...patch},'linux',1001),/refuse_non_ephemeral/)
})
test('ambient Node, TLS and proxy injection never opens the database matrix entry',()=>{
  for(const key of ['NODE_OPTIONS','NODE_PATH','NODE_EXTRA_CA_CERTS','NODE_TLS_REJECT_UNAUTHORIZED','HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','http_proxy','https_proxy','all_proxy'])assert.throws(()=>validate({...sample(),[key]:'forbidden'},'linux',1001),/refuse_non_ephemeral/)
})
