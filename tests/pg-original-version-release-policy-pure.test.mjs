import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import {requireOriginalVersionReleaseCi,originalVersionReleaseServiceContractGaps,assertOriginalVersionReleaseServiceContracts} from './helpers/pg-original-version-release-browser-guard.mjs'
import {originalVersionReleasePolicy as policy} from './helpers/pg-original-version-release-browser-policy.mjs'
import {startOriginalVersionReleaseBrowserFixture} from './helpers/pg-original-version-release-browser-fixture.mjs'
import {originalVersionReleaseBackendFixture} from './helpers/pg-original-version-release-backend-fixture.mjs'
test('original release worker resolves pg from locked API dependencies without evaluating a database client',async()=>{const {originalReleaseApiRequire}=await import('./helpers/pg-original-version-release-backend-fixture.mjs');assert.equal(typeof originalReleaseApiRequire,'function');const requireApi=originalReleaseApiRequire(),expected=createRequire(new URL('../services/pg-api/package.json',import.meta.url));assert.equal(requireApi.resolve('pg'),expected.resolve('pg'));const source=readFileSync(new URL('./helpers/pg-original-version-release-backend-fixture.mjs',import.meta.url),'utf8');assert(!source.includes("import('pg')"));assert(source.includes("const Pg=originalReleaseApiRequire()('pg')"));assert(source.includes('workerPg=new Pg.Pool('))})
const baseline={
 "CI": "true",
 "GITHUB_ACTIONS": "true",
 "GITHUB_RUN_ID": "123",
 "RUNNER_OS": "Linux",
 "RUNNER_ENVIRONMENT": "github-hosted",
 "GITHUB_REPOSITORY": "HG1127/agent-studio_vibex",
 "GITHUB_WORKFLOW": "Agent Studio F01 Agent Design genuine PG18 isolated verification",
 "GITHUB_JOB": "pg18-agent-design-browser",
 "AGENT_STUDIO_F01_GENUINE_CI": "YES_DISPOSABLE_F01_ONLY",
 "GITHUB_SHA": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
 "GITHUB_REF": "refs/heads/codex/pg18-worker-heartbeat-release-story",
 "AGENT_STUDIO_PG18_CI_EPHEMERAL": "true",
 "AGENT_STUDIO_PG18_CI_WRITE_APPROVED": "YES_DISPOSABLE_GITHUB_ONLY",
 "AGENT_STUDIO_PG18_CI_HOST": "127.0.0.1",
 "AGENT_STUDIO_PG18_CI_PORT": "5432",
 "AGENT_STUDIO_PG18_CI_DATABASE": "agentstudio_pg18_ci",
 "AGENT_STUDIO_PG18_CI_ADMIN_USER": "agentstudio_admin",
 "AGENT_STUDIO_PG18_CI_ADMIN_PASSWORD": "synthetic-agentstudio-pg18-ci-123",
 "AGENT_STUDIO_ORIGINAL_VERSION_RELEASE_CI": "YES_DISPOSABLE_ORIGINAL_VERSION_RELEASE_ONLY",
 "AGENT_STUDIO_ORIGINAL_VERSION_RELEASE_STORY": "original-version-release",
 "AGENT_STUDIO_ORIGINAL_VERSION_RELEASE_EXPECTED_HEAD": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
 "AGENT_STUDIO_PG18_CONFIG_WRITE_UAT_ENABLED": "true",
 "AGENT_STUDIO_PG18_UAT_APPROVAL": "APPROVE_ISOLATED_PG18_CONFIG_UAT_ONLY",
 "AGENT_STUDIO_PG18_RUN_APPROVAL_UAT_ENABLED": "true",
 "AGENT_STUDIO_PG18_RUN_APPROVAL_UAT_APPROVED": "APPROVE_DISPOSABLE_PG18_RUN_APPROVAL_UAT_ONLY",
 "AGENT_STUDIO_PG18_WORKFLOW_EXECUTION_UAT_ENABLED": "true",
 "AGENT_STUDIO_PG18_WORKFLOW_EXECUTION_UAT_APPROVED": "APPROVE_DISPOSABLE_PG18_WORKFLOW_EXECUTION_ONLY",
 "AGENT_STUDIO_PG18_WORKFLOW_V2_UAT_ENABLED": "true",
 "AGENT_STUDIO_PG18_WORKFLOW_V2_UAT_APPROVED": "APPROVE_DISPOSABLE_PG18_WORKFLOW_V2_EXECUTION_ONLY",
 "AGENT_STUDIO_PG_AUTONOMOUS_AGENT_ENABLED": "true",
 "AGENT_STUDIO_PG_AUTONOMOUS_AGENT_APPROVED": "APPROVE_DISPOSABLE_PG18_AUTONOMOUS_AGENT_ONLY",
 "AGENT_STUDIO_PG_AGENT_MEMORY_ENABLED": "true",
 "AGENT_STUDIO_PG_AGENT_MEMORY_APPROVED": "APPROVE_DISPOSABLE_PG18_OWNER_MEMORY_ONLY",
 "AGENT_STUDIO_PG_AGENT_FEEDBACK_ENABLED": "true",
 "AGENT_STUDIO_PG_AGENT_FEEDBACK_APPROVED": "APPROVE_DISPOSABLE_PG18_OWNER_FEEDBACK_ONLY",
 "AGENT_STUDIO_PG18_KNOWLEDGE_SHARING_UAT_ENABLED": "true",
 "AGENT_STUDIO_PG18_KNOWLEDGE_SHARING_UAT_APPROVED": "APPROVE_DISPOSABLE_PG18_KNOWLEDGE_SHARING_ONLY"
},id='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222',r='/__pg_native/api/v2/original-ui/agent-releases/'+id
// Positive admission is terminal DATA only: it starts no hosted or local runtime.
test('hosted purpose and real selector produce only a bounded unaccepted test permit',()=>{const p=requireOriginalVersionReleaseCi({...baseline},'linux',1001);assert.equal(p.origin,'https://localhost:17443');assert.equal(p.head,baseline.GITHUB_SHA);assert.equal(p.policy.configurationWrites,true);assert.equal(p.policy.autonomousAgentUat,true);assert.equal(p.actual_worker_completion_contract,false);assert.equal(p.production_GO,false)})
for(const change of [{GITHUB_JOB:'pg18-agent-design-genuine'},{GITHUB_REF:'refs/heads/main'},{GITHUB_SHA:'b'.repeat(40)},{GITHUB_REPOSITORY:'other/repo'},{GITHUB_WORKFLOW:'other'},{RUNNER_ENVIRONMENT:'self-hosted'},{AGENT_STUDIO_ORIGINAL_VERSION_RELEASE_STORY:'design'},{AGENT_STUDIO_PG18_CI_HOST:'db.example.com'},{DATABASE_URL:'unreviewed'},{NODE_OPTIONS:'--inspect'},{HTTPS_PROXY:'http://proxy.invalid'},{AGENT_STUDIO_PG_AUTONOMOUS_AGENT_ENABLED:'false'}])test('purpose refuses '+Object.keys(change)[0],()=>assert.throws(()=>requireOriginalVersionReleaseCi({...baseline,...change},'linux',1001)))
for(const key of ['AGENT_STUDIO_ORIGINAL_PG_LOGIN_CI','AGENT_STUDIO_ORIGINAL_AGENT_RUN_QUEUED_CI','AGENT_STUDIO_ORIGINAL_MODEL_RECEIPTS075_CI','AGENT_STUDIO_ORIGINAL_INTERNAL_SHARE_CI','AGENT_STUDIO_PG18_MODEL_PROBE_UAT_ENABLED','AGENT_STUDIO_PG18_BOUND_GENERATION_UAT_ENABLED','AGENT_STUDIO_PG18_KNOWLEDGE_TOOL_UAT_ENABLED','AGENT_STUDIO_PG18_ORDINARY_CASE_RUNS_ENABLED'])test('mixed or external purpose refuses even empty '+key,()=>assert.throws(()=>requireOriginalVersionReleaseCi({...baseline,[key]:''},'linux',1001)))
test('ordinary platform/root and actual factories refuse before setup',async()=>{assert.throws(()=>requireOriginalVersionReleaseCi(baseline,'win32',1001));assert.throws(()=>requireOriginalVersionReleaseCi(baseline,'linux',0));await assert.rejects(startOriginalVersionReleaseBrowserFixture({}),/refuse_non_ephemeral/);await assert.rejects(originalVersionReleaseBackendFixture({}),/refuse_non_ephemeral/)})
for(const suffix of ['', '/versions/'+other,'/acceptance/'+other,'/receipts/'+other])test('real exact GET '+suffix,()=>assert.equal(policy('GET',r+suffix).kind,'native'))
for(const action of ['change','acceptance'])test('only real original POST '+action,()=>assert.equal(policy('POST',r+'/'+action).kind,'native'))
for(const [method,path] of [['POST',r+'/receipts/'+other],['POST',r+'/receipts/'+other+'/confirm'],['POST',r+'/confirm'],['GET',r+'/change'],['POST',r],['PATCH',r+'/change'],['POST','/__pg_native/api/v2/agent-releases/'+id+'/change'],['POST','/__pg_native/api/v2/agent-specs/'+id+'/autonomous-runs'],['POST','/__pg_native/api/v2/model-connections/'+id+'/test'],['GET',r+'/receipts/'+other+'?owner='+other],['GET',r+'/receipts/'+other+'?'],['GET',r.replace('/agent-releases','/%61gent-releases')]])test('unmapped/alias refuses '+method+' '+path,()=>assert.notEqual(policy(method,path).kind,'native'))
test('original SPA routes and bounded owner catalog/model/steps metadata only',()=>{for(const p of ['/version-release','/run-detail','/login'])assert.equal(policy('GET',p,'text/html').kind,'spa');for(const p of ['/pg18-app','/pg-native-pilot','/agent-run'])assert.equal(policy('GET',p,'text/html').kind,'denied');assert.equal(policy('GET','/__pb/api/collections').kind,'legacy_denied');assert.equal(policy('GET','/__pg_native/api/v2/original-ui/agent-catalog?page=1&perPage=50&sort=updated_desc').kind,'native');assert.equal(policy('GET','/__pg_native/api/v2/model-connections?paging=owner_cursor_v1&limit=50').kind,'native');for(const q of ['?owner='+other,'?paging=owner_cursor_v1&limit=51','?paging=owner_cursor_v1&limit=50&limit=50'])assert.equal(policy('GET','/__pg_native/api/v2/model-connections'+q).kind,'api_denied')})
test('current Root product sources remain baseline and actual helpers prohibit fake Worker completion',()=>{const read=p=>readFileSync(new URL(p,import.meta.url),'utf8'),backend=read('./helpers/pg-original-version-release-backend-fixture.mjs'),host=read('./helpers/pg-original-version-release-browser-fixture.mjs'),story=read('./pg-original-version-release-genuine.spec.mjs'),review=read('./helpers/pg-original-version-release-reviewed-check.mjs');assert(backend.includes('new releaseModule.AgentReleaseRepository'));assert(backend.includes('new workerModule.WorkflowV2Worker'));assert(backend.includes('await worker.tick()'));assert(!/UPDATE\s+agentstudio\.runs|INSERT INTO agentstudio\.run_steps|status\s*=\s*'succeeded'/.test(backend));assert(backend.includes("assert.equal(status.body.item.test_current,false)"));assert(host.includes('fixture.assertCommittedAck'));assert(host.includes('req.complete!==true'));assert(host.includes('req.pipe(proxy)'));assert(!/route\.fulfill|response\.fulfill/.test(story));assert(story.includes("waitForEvent")===false,'requestfailed lives in the actual imported action helper');assert(review.includes('Root must seal final CURRENT release source DAG'));for(const p of ['src/lib/originalVersionRelease.ts','src/pages/VersionRelease/usePgVersionRelease.ts','tests/original-version-release-model-refresh.test.mjs'])assert(review.includes(p));assert(!review.includes('A-original-version-release'))})

test('actual global Native contract is checked before any hosted setup, with current missing routes reported',()=>{const permit=requireOriginalVersionReleaseCi({...baseline},'linux',1001),gaps=originalVersionReleaseServiceContractGaps(permit.policy);if(gaps.length){assert(gaps.every(g=>g.path.startsWith('/api/v2/original-ui/agent-releases/')));assert.throws(()=>assertOriginalVersionReleaseServiceContracts(permit.policy),/original_version_release_global_native_contract_missing/)}else assert.equal(assertOriginalVersionReleaseServiceContracts(permit.policy),true);for(const file of ['browser-fixture','backend-fixture']){const src=readFileSync(new URL('./helpers/pg-original-version-release-'+file+'.mjs',import.meta.url),'utf8');assert(src.indexOf('assertOriginalVersionReleaseServiceContracts(permit.policy)')<src.indexOf('await verifyOriginalVersionReleaseReviewedSources(env)'));assert(src.indexOf('assertOriginalVersionReleaseServiceContracts(permit.policy)')<src.indexOf('await Promise.all('))}})

test('actual current Root Native global route contract must admit exact owner Release paths and refuse closed gates, aliases and receipt writes',()=>{const permit=requireOriginalVersionReleaseCi({...baseline},'linux',1001);assert.deepEqual(originalVersionReleaseServiceContractGaps(permit.policy),[]);assert.equal(assertOriginalVersionReleaseServiceContracts(permit.policy),true)})
