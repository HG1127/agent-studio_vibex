// Pure refusal/shape checks only. A matching synthetic env is not SQL authority.
import test from 'node:test'
import assert from 'node:assert/strict'
import {requireAgentDesignGenuineCi,agentDesignGenuineFixture} from './helpers/agent-design-genuine-fixture.mjs'
const env=()=>({GITHUB_ACTIONS:'true',CI:'true',RUNNER_OS:'Linux',RUNNER_ENVIRONMENT:'github-hosted',GITHUB_REPOSITORY:'HG1127/agent-studio_vibex',GITHUB_WORKFLOW:'Agent Studio F01 Agent Design genuine PG18 isolated verification',GITHUB_JOB:'pg18-agent-design-genuine',GITHUB_RUN_ID:'123456',AGENT_STUDIO_F01_GENUINE_CI:'YES_DISPOSABLE_F01_ONLY',AGENT_STUDIO_PG18_CI_EPHEMERAL:'true',AGENT_STUDIO_PG18_CI_WRITE_APPROVED:'YES_DISPOSABLE_GITHUB_ONLY',AGENT_STUDIO_PG18_CI_ADMIN_PASSWORD:'synthetic-agentstudio-pg18-ci-123456',AGENT_STUDIO_PG18_CI_HOST:'127.0.0.1',AGENT_STUDIO_PG18_CI_PORT:'5432',AGENT_STUDIO_PG18_CI_DATABASE:'agentstudio_pg18_ci',AGENT_STUDIO_PG18_CI_ADMIN_USER:'agentstudio_admin'})
test('ordinary hosts, root, incomplete env and spoofed purpose fail before fixture effects',async()=>{
 for(const [platform,uid] of [['win32',1001],['darwin',1001],['linux',0],['linux',-1],['linux',NaN]])assert.throws(()=>requireAgentDesignGenuineCi(env(),platform,uid))
 assert.throws(()=>requireAgentDesignGenuineCi({},'linux',1001));await assert.rejects(()=>agentDesignGenuineFixture({}),/refuse_non_ephemeral/)
})
test('only the existing fixed disposable5432 target survives pure shape validation; no URL or5333 escape',()=>{
 const selected=requireAgentDesignGenuineCi(env(),'linux',1001);assert.equal(selected.host,'127.0.0.1');assert.equal(selected.port,5432);assert.equal(selected.database,'agentstudio_pg18_ci');assert.equal(Object.isFrozen(selected),true)
 for(const patch of [{DATABASE_URL:'postgres://forbidden-company/db'},{PGHOST:'elsewhere'},{AGENT_STUDIO_PG18_CI_PORT:'5333'},{AGENT_STUDIO_PG18_CI_DATABASE:'agent_studio'},{AGENT_STUDIO_PG18_CI_ADMIN_PASSWORD:'wrong'},{AGENT_STUDIO_PG18_CI_HOST:'localhost'}])assert.throws(()=>requireAgentDesignGenuineCi({...env(),...patch},'linux',1001))
})
test('purpose/job/repository and proxy/Node injection cannot activate genuine design work',()=>{
 for(const patch of [{GITHUB_WORKFLOW:'Agent Studio Worker heartbeat controller'},{GITHUB_JOB:'worker-heartbeat-control'},{GITHUB_REPOSITORY:'elsewhere/repo'},{RUNNER_ENVIRONMENT:'self-hosted'},{AGENT_STUDIO_F01_GENUINE_CI:'true'},{NODE_OPTIONS:'--import=elsewhere'},{NODE_PATH:'/tmp/foreign'},{HTTPS_PROXY:'https://foreign.example'},{NODE_TLS_REJECT_UNAUTHORIZED:'0'},{NODE_EXTRA_CA_CERTS:'/tmp/foreign.pem'}])assert.throws(()=>requireAgentDesignGenuineCi({...env(),...patch},'linux',1001))
 assert.equal(requireAgentDesignGenuineCi({...env(),GITHUB_JOB:'pg18-agent-design-browser'},'linux',1001).port,5432)
})
