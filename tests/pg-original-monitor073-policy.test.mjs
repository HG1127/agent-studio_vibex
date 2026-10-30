import test from 'node:test'
import assert from 'node:assert/strict'
import {originalMonitor073HostPolicy as policy} from './helpers/pg-original-monitor073-host-policy.mjs'
import {requireOriginalMonitor073BrowserCi} from './helpers/pg-original-monitor073-browser-guard.mjs'
const event='00000000-0000-4000-8000-000000000001',path='/__pg_native/api/v2/original-ui/monitor-events/'+event+'/read'
test('073 host extends only exact owned read acknowledgement and preserves legacy/model-write denials',()=>{
 assert.deepEqual(policy('POST',path),{kind:'native',pathname:path})
 for(const [method,raw]of [['POST',path+'?owner_id=x'],['POST',path.replace('/read','/%72ead')],['POST',path.replace('00000000-','ABCDEF00-')],['POST','/__pg_native/api/v2/agent-design/submit'],['POST','/__pg_native/api/v2/agent-runs'],['DELETE',path],['POST','/__pb/api/agent-runs']])assert.notEqual(policy(method,raw).kind,'native')
 assert.equal(policy('GET','/__pg_native/api/v2/original-ui/monitor-inbox?limit=10').kind,'native')
})
test('073 browser never grants an ordinary process or old profile alone a runtime permit',()=>{
 for(const [env,platform,uid]of [[{},'win32',0],[{},'linux',0],[{AGENT_STUDIO_ORIGINAL_PG_LOGIN_CI:'YES_DISPOSABLE_ORIGINAL_LOGIN_ONLY'},'linux',1001],[{AGENT_STUDIO_ORIGINAL_MONITOR073_CI:'YES_DISPOSABLE_ORIGINAL_MONITOR073_METADATA_ONLY'},'linux',1001]])assert.throws(()=>requireOriginalMonitor073BrowserCi(env,platform,uid))
})

import fs from 'node:fs'
const purpose=Object.freeze({
 GITHUB_ACTIONS:'true',CI:'true',GITHUB_RUN_ID:'123',RUNNER_OS:'Linux',RUNNER_ENVIRONMENT:'github-hosted',
 GITHUB_REPOSITORY:'HG1127/agent-studio_vibex',
 GITHUB_WORKFLOW:'Agent Studio F01 Agent Design genuine PG18 isolated verification',GITHUB_JOB:'pg18-agent-design-browser',
 GITHUB_SHA:'a'.repeat(40),GITHUB_REF:'refs/heads/codex/pg18-worker-heartbeat-test',
 AGENT_STUDIO_F01_GENUINE_CI:'YES_DISPOSABLE_F01_ONLY',
 AGENT_STUDIO_ORIGINAL_PG_LOGIN_CI:'YES_DISPOSABLE_ORIGINAL_LOGIN_ONLY',
 AGENT_STUDIO_ORIGINAL_LOGIN_HOME071_CI:'YES_DISPOSABLE_ORIGINAL_LOGIN_HOME071_ONLY',
 AGENT_STUDIO_ORIGINAL_LOGIN_HOME071_PROFILE:'original-login-home071',AGENT_STUDIO_ORIGINAL_LOGIN_HOME071_STORY:'original-login',
 AGENT_STUDIO_ORIGINAL_LOGIN_HOME071_EXPECTED_HEAD:'a'.repeat(40),
 AGENT_STUDIO_PG18_CI_EPHEMERAL:'true',AGENT_STUDIO_PG18_CI_WRITE_APPROVED:'YES_DISPOSABLE_GITHUB_ONLY',
 AGENT_STUDIO_PG18_CI_HOST:'127.0.0.1',AGENT_STUDIO_PG18_CI_PORT:'5432',
 AGENT_STUDIO_PG18_CI_DATABASE:'agentstudio_pg18_ci',AGENT_STUDIO_PG18_CI_ADMIN_USER:'agentstudio_admin',
 AGENT_STUDIO_PG18_CI_ADMIN_PASSWORD:'synthetic-agentstudio-pg18-ci-123',
})
const read=relative=>fs.readFileSync(new URL('../'+relative,import.meta.url),'utf8')
const markers={AGENT_STUDIO_ORIGINAL_MONITOR073_CI:'YES_DISPOSABLE_ORIGINAL_MONITOR073_METADATA_ONLY',AGENT_STUDIO_ORIGINAL_MONITOR073_PROFILE:'original-home-monitor073-metadata',AGENT_STUDIO_ORIGINAL_MONITOR073_STORY:'original-login',AGENT_STUDIO_ORIGINAL_MONITOR073_EXPECTED_HEAD:'a'.repeat(40)}
test('actual old071 purpose alone and every missing or wrong073 marker are refused for both stories',()=>{
 assert.throws(()=>requireOriginalMonitor073BrowserCi(purpose,'linux',1001),/original_monitor073_browser_admission_refused/)
 for(const story of ['original-login','monitor073'])for(const key of Object.keys(markers)){
  const input={...purpose,...markers,AGENT_STUDIO_ORIGINAL_MONITOR073_STORY:story};delete input[key]
  assert.throws(()=>requireOriginalMonitor073BrowserCi(input,'linux',1001),/original_monitor073_browser_admission_refused/,story+' missing '+key)
  assert.throws(()=>requireOriginalMonitor073BrowserCi({...input,[key]:'wrong'},'linux',1001),/original_monitor073_browser_admission_refused/,story+' wrong '+key)
 }
})
test('073 markers cannot forge host/job/head, relax identity or skip the genuine071 predecessor',()=>{
 for(const [key,value]of [['GITHUB_JOB','pg18-agent-design-genuine'],['GITHUB_SHA','b'.repeat(40)],['RUNNER_ENVIRONMENT','self-hosted'],['AGENT_STUDIO_ORIGINAL_LOGIN_HOME071_CI',undefined],['AGENT_STUDIO_ORIGINAL_PG_LOGIN_CI',undefined],['AGENT_STUDIO_F01_GENUINE_CI',undefined],['AGENT_STUDIO_PG18_CI_DATABASE','company'],['NODE_OPTIONS',''],['DATABASE_URL','postgres://example.invalid/company']])assert.throws(()=>requireOriginalMonitor073BrowserCi({...purpose,...markers,[key]:value},'linux',1001),/refus/)
 for(const [platform,uid]of [['win32',1001],['linux',0]])assert.throws(()=>requireOriginalMonitor073BrowserCi({...purpose,...markers},platform,uid),/refus/)
})
test('073 composition actually installs and audits immutable SQL and nonempty owner rows before top receipt',()=>{
 const body=read('tests/helpers/pg-original-monitor073-backend-fixture.mjs'),guard=read('tests/helpers/pg-original-monitor073-browser-guard.mjs')
 assert(body.indexOf('requireOriginalMonitor073BrowserCi(env)')<body.indexOf("import('node:fs')"))
 for(const text of ["await baseModule.originalLoginHome071GenuineFixture(env)","await f.db.exec(sql073.toString('utf8'))","await audit.inspectOptionalNativeMonitorInbox(f.pool)!=='installed'","monitor073_nonempty_owner_seed_required","AbortSignal.timeout(8000)","format:'agentstudio.original-home-monitor073.metadata.fixture.v1'","predecessor:f.browserHomeProfile","monitor073_source_sha256:sha(sql073)","full_monitor_pipeline_complete:false"])assert(body.includes(text),text)
 assert(body.indexOf('monitor073_nonempty_owner_seed_required')<body.indexOf('browserHomeProfile:Object.freeze('))
 assert.doesNotMatch(guard,/\.\.\.base|GITHUB_JOB\s*[:=]/)
 assert(guard.includes('predecessor:base'));assert(guard.includes("profile:'original-home-monitor073-metadata'"))
 assert.doesNotMatch(body,/rejectUnauthorized:\s*false/)
})
test('both stories use independent073 receipt and original Login keeps all existing error zero gates',()=>{
 for(const file of ['tests/helpers/pg-original-login-genuine-browser-fixture.mjs','tests/helpers/pg-original-monitor073-genuine-browser-fixture.mjs']){
  const body=read(file);assert(body.indexOf('requireOriginalMonitor073BrowserCi(env)')<body.indexOf("import('node:fs')"))
  for(const text of ['actualProfile?.format',"agentstudio.original-home-monitor073.metadata.fixture.v1",'actualProfile.monitor073_catalog_verified!==true','actualProfile.monitor073_seeded_nonempty!==true','actualProfile.predecessor.head','homeBackend.originalMonitor073BackendFixture(env)','if(!(isMe&&status===401))'])assert(body.includes(text),file+' '+text)
 }
 const story=read('tests/pg-original-login-genuine.spec.mjs')
 assert(story.indexOf('requireOriginalMonitor073BrowserCi()')<story.indexOf("await import('node:fs/promises')"))
 assert(story.includes('expect(f.backendProfile.predecessor).toMatchObject('))
 for(const text of ['auth_steps_completed:authStepsCompleted','actual_backend:f.backendProfile',"f.observations.unexpected_api_failures","f.observations.legacy_backend_requests","f.observations.blocked_requests",'home_business_complete:false','production_GO:false'])assert(story.includes(text),text)
 const workflow=read('.github/workflows/pg18-agent-design-genuine-ci.yml')
 for(const marker of ['CI','PROFILE','STORY','EXPECTED_HEAD'])assert.equal(workflow.split('AGENT_STUDIO_ORIGINAL_MONITOR073_'+marker+':').length,3)
 assert(workflow.includes('AGENT_STUDIO_ORIGINAL_MONITOR073_STORY: original-login'));assert(workflow.includes('AGENT_STUDIO_ORIGINAL_MONITOR073_STORY: monitor073'))
 assert.doesNotMatch(workflow,/GITHUB_JOB\s*[:=]/)
})
