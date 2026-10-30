// Pure context/refusal tests. A matching descriptor is not SQL/login evidence.
import test from 'node:test'
import assert from 'node:assert/strict'
import {validateAgentDesignDatabaseCiContext,requireAgentDesignDatabaseCi,createAgentDesignDatabaseFixture} from './helpers/agent-design-database-ci.mjs'
const sample=()=>({GITHUB_ACTIONS:'true',CI:'true',RUNNER_OS:'Linux',RUNNER_ENVIRONMENT:'github-hosted',GITHUB_REPOSITORY:'HG1127/agent-studio_vibex',GITHUB_WORKFLOW:'Agent Studio F01 Agent Design genuine PG18 isolated verification',GITHUB_JOB:'pg18-agent-design-genuine',GITHUB_RUN_ID:'123456',AGENT_STUDIO_F01_GENUINE_CI:'YES_DISPOSABLE_F01_ONLY',AGENT_STUDIO_PG18_CI_EPHEMERAL:'true',AGENT_STUDIO_PG18_CI_WRITE_APPROVED:'YES_DISPOSABLE_GITHUB_ONLY',AGENT_STUDIO_PG18_CI_ADMIN_PASSWORD:'synthetic-agentstudio-pg18-ci-123456',AGENT_STUDIO_PG18_CI_HOST:'127.0.0.1',AGENT_STUDIO_PG18_CI_PORT:'5432',AGENT_STUDIO_PG18_CI_DATABASE:'agentstudio_pg18_ci',AGENT_STUDIO_PG18_CI_ADMIN_USER:'agentstudio_admin'})
test('live factory refuses ordinary/incomplete context before fixture/driver import',async()=>{
  assert.throws(()=>requireAgentDesignDatabaseCi({}),/refuse_non_ephemeral/)
  await assert.rejects(()=>createAgentDesignDatabaseFixture({}),/refuse_non_ephemeral/)
  for(const [platform,uid] of [['win32',1001],['darwin',1001],['linux',0],['linux',-1],['linux',NaN]])assert.throws(()=>validateAgentDesignDatabaseCiContext(sample(),platform,uid),/refuse_non_ephemeral/)
})
test('pure fixed descriptor allows only the existing disposable source purpose and target',()=>{
  const descriptor=validateAgentDesignDatabaseCiContext(sample(),'linux',1001)
  assert.equal(descriptor.host,'127.0.0.1');assert.equal(descriptor.port,5432);assert.equal(descriptor.database,'agentstudio_pg18_ci');assert.equal(Object.isFrozen(descriptor),true)
  for(const patch of [{GITHUB_WORKFLOW:'foreign'},{GITHUB_JOB:'pg18-agent-design-browser'},{GITHUB_REPOSITORY:'foreign/repo'},{RUNNER_ENVIRONMENT:'self-hosted'},{AGENT_STUDIO_F01_GENUINE_CI:'true'},{AGENT_STUDIO_PG18_CI_PORT:'5333'},{AGENT_STUDIO_PG18_CI_DATABASE:'agent_studio'},{AGENT_STUDIO_PG18_CI_HOST:'localhost'},{AGENT_STUDIO_PG18_CI_ADMIN_PASSWORD:'wrong'},{DATABASE_URL:'postgres://not-permitted/db'},{PGHOST:'foreign'}])assert.throws(()=>validateAgentDesignDatabaseCiContext({...sample(),...patch},'linux',1001),/refuse_non_ephemeral/)
})
test('Node/TLS/proxy injection cannot activate genuine catalog/SQL work',()=>{
  for(const key of ['NODE_OPTIONS','NODE_PATH','NODE_EXTRA_CA_CERTS','NODE_TLS_REJECT_UNAUTHORIZED','HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','http_proxy','https_proxy','all_proxy'])assert.throws(()=>validateAgentDesignDatabaseCiContext({...sample(),[key]:'forbidden'},'linux',1001),/refuse_non_ephemeral/)
})
