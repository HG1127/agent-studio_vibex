import test from 'node:test'
import assert from 'node:assert/strict'
import {requireAgentRunControlGenuineCi,agentRunControlGenuineWorkflow,agentRunControlGenuineJobs} from './helpers/agent-run-control-genuine-guard.mjs'
const env={GITHUB_ACTIONS:'true',CI:'true',RUNNER_OS:'Linux',RUNNER_ENVIRONMENT:'github-hosted',GITHUB_REPOSITORY:'HG1127/agent-studio_vibex',GITHUB_WORKFLOW:agentRunControlGenuineWorkflow,GITHUB_JOB:agentRunControlGenuineJobs.database,GITHUB_RUN_ID:'1234',GITHUB_RUN_ATTEMPT:'1',GITHUB_REF:'refs/heads/codex/f31',GITHUB_SHA:'1'.repeat(40),GITHUB_EVENT_NAME:'push',AGENT_STUDIO_F31_RUN_CONTROL_CI:'SYNTHETIC_SAME_RUN_ONLY',AGENT_STUDIO_PG18_CI_EPHEMERAL:'true',AGENT_STUDIO_PG18_CI_WRITE_APPROVED:'YES_DISPOSABLE_GITHUB_ONLY',AGENT_STUDIO_PG18_CI_HOST:'127.0.0.1',AGENT_STUDIO_PG18_CI_PORT:'5432',AGENT_STUDIO_PG18_CI_DATABASE:'agentstudio_pg18_ci',AGENT_STUDIO_PG18_CI_ADMIN_USER:'agentstudio_admin',AGENT_STUDIO_PG18_CI_ADMIN_PASSWORD:'synthetic-agentstudio-pg18-ci-1234'}
test('F31 guard adds exact independent workflow and database/browser job binding without granting a capability',()=>{
 assert.equal(requireAgentRunControlGenuineCi(env,'database','linux',1001).database,'agentstudio_pg18_ci')
 assert.throws(()=>requireAgentRunControlGenuineCi(env,'browser','linux',1001))
 assert.equal(requireAgentRunControlGenuineCi({...env,GITHUB_JOB:agentRunControlGenuineJobs.browser,AGENT_STUDIO_NATIVE_BROWSER_CI:'SYNTHETIC_GITHUB_ONLY'},'browser','linux',1001).port,5432)
 for(const patch of [{GITHUB_WORKFLOW:'another workflow'},{GITHUB_JOB:'another-job'},{GITHUB_REPOSITORY:'foreign/repository'},{GITHUB_EVENT_NAME:'pull_request'},{GITHUB_REF:'refs/pull/1/merge'},{GITHUB_SHA:'unknown'},{GITHUB_RUN_ATTEMPT:'0'},{RUNNER_ENVIRONMENT:'self-hosted'},{AGENT_STUDIO_F31_RUN_CONTROL_CI:undefined}])assert.throws(()=>requireAgentRunControlGenuineCi({...env,...patch},'database','linux',1001))
})
test('original PG/browser gates still reject production tuples, arbitrary credentials, ambient PG configuration and root/browser fallback',()=>{
 for(const patch of [{AGENT_STUDIO_PG18_CI_PORT:'5333'},{AGENT_STUDIO_PG18_CI_DATABASE:'agent_studio'},{AGENT_STUDIO_PG18_CI_ADMIN_USER:'postgres'},{AGENT_STUDIO_PG18_CI_ADMIN_PASSWORD:'external-secret'},{PGHOST:'127.0.0.1'},{DATABASE_URL:'postgres://external.invalid/private'},{AGENT_STUDIO_PG18_CI_WRITE_APPROVED:undefined}])assert.throws(()=>requireAgentRunControlGenuineCi({...env,...patch},'database','linux',1001),/refuse_non_ephemeral_pg18_ci/)
 assert.throws(()=>requireAgentRunControlGenuineCi(env,'database','win32',1001));assert.throws(()=>requireAgentRunControlGenuineCi(env,'database','linux',0))
 assert.throws(()=>requireAgentRunControlGenuineCi({...env,GITHUB_JOB:agentRunControlGenuineJobs.browser},'browser','linux',1001),/refuse_non_ephemeral_native_browser_ci/)
})
