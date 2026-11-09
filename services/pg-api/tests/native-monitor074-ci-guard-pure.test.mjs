import test from 'node:test'
import assert from 'node:assert/strict'
import {requireNativeMonitor074Ci} from './helpers/native-monitor074-ci-guard.mjs'
import {requireOriginalMonitor074BrowserCi} from '../../../tests/helpers/pg-original-monitor074-browser-guard.mjs'
import {originalMonitor074HostPolicy} from '../../../tests/helpers/pg-original-monitor074-host-policy.mjs'
// Pure policy inputs only: no environment mutation or qualifying runtime claim.
const head='a'.repeat(40),base=()=>({GITHUB_ACTIONS:'true',CI:'true',RUNNER_OS:'Linux',RUNNER_ENVIRONMENT:'github-hosted',GITHUB_REPOSITORY:'HG1127/agent-studio_vibex',GITHUB_WORKFLOW:'Agent Studio F01 Agent Design genuine PG18 isolated verification',GITHUB_JOB:'pg18-agent-design-genuine',AGENT_STUDIO_F01_GENUINE_CI:'YES_DISPOSABLE_F01_ONLY',GITHUB_RUN_ID:'12345',GITHUB_SHA:head,GITHUB_REF:'refs/heads/codex/pg18-worker-heartbeat-monitor074-ci',AGENT_STUDIO_PG18_CI_EPHEMERAL:'true',AGENT_STUDIO_PG18_CI_WRITE_APPROVED:'YES_DISPOSABLE_GITHUB_ONLY',AGENT_STUDIO_PG18_CI_HOST:'127.0.0.1',AGENT_STUDIO_PG18_CI_PORT:'5432',AGENT_STUDIO_PG18_CI_DATABASE:'agentstudio_pg18_ci',AGENT_STUDIO_PG18_CI_ADMIN_USER:'agentstudio_admin',AGENT_STUDIO_PG18_CI_ADMIN_PASSWORD:'synthetic-agentstudio-pg18-ci-12345',AGENT_STUDIO_NATIVE_MONITOR074_CI:'YES_DISPOSABLE_MONITOR074_LIVE_CHAIN_ONLY',AGENT_STUDIO_NATIVE_MONITOR074_SUITE:'monitor074',AGENT_STUDIO_NATIVE_MONITOR074_EXPECTED_HEAD:head,AGENT_STUDIO_NATIVE_MONITOR074_SOURCE_EGRESS:'APPROVE_ONE_DECLARED_SYNTHETIC_HTTPBIN_SOURCE_ONLY'})
test('074 purpose requires exact independent Hosted/TCP/head admission and never grants runtime or production authority',()=>{
 assert.throws(()=>requireNativeMonitor074Ci())
 const permit=requireNativeMonitor074Ci(base(),'linux',1001)
 assert.equal(permit.profile,'monitor074-live-chain');assert.equal(permit.runtime_authorization,false);assert.equal(permit.production_GO,false)
 for(const patch of [{GITHUB_JOB:'pg18-agent-design-browser'},{AGENT_STUDIO_NATIVE_MONITOR074_CI:undefined},{AGENT_STUDIO_NATIVE_MONITOR074_SUITE:'monitor073'},{AGENT_STUDIO_NATIVE_MONITOR074_SOURCE_EGRESS:undefined},{AGENT_STUDIO_NATIVE_MONITOR074_EXPECTED_HEAD:'b'.repeat(40)},{AGENT_STUDIO_NATIVE_MONITOR073_CI:'YES_DISPOSABLE_MONITOR073_METADATA_ONLY'},{AGENT_STUDIO_ORIGINAL_PG_LOGIN_CI:'YES_DISPOSABLE_ORIGINAL_LOGIN_ONLY'},{DATABASE_URL:'postgres://company.invalid/company'},{NODE_OPTIONS:'--require injected'},{AGENT_STUDIO_PG18_CI_PORT:'5333'}])assert.throws(()=>requireNativeMonitor074Ci({...base(),...patch},'linux',1001))
 for(const [platform,uid]of [['win32',1001],['linux',0]])assert.throws(()=>requireNativeMonitor074Ci(base(),platform,uid))
})
test('original074 page purpose cannot borrow the TCP, original login or073 metadata profile',()=>{
 assert.throws(()=>requireOriginalMonitor074BrowserCi(base(),'linux',1001))
 const raw=base();for(const key of Object.keys(raw))if(key.startsWith('AGENT_STUDIO_NATIVE_MONITOR074'))delete raw[key]
 const env={...raw,GITHUB_JOB:'pg18-agent-design-browser',AGENT_STUDIO_ORIGINAL_MONITOR074_CI:'YES_DISPOSABLE_ORIGINAL_MONITOR074_LIVE_CHAIN_ONLY',AGENT_STUDIO_ORIGINAL_MONITOR074_STORY:'original-agent-run-monitor074',AGENT_STUDIO_ORIGINAL_MONITOR074_EXPECTED_HEAD:head}
 assert.equal(requireOriginalMonitor074BrowserCi(env,'linux',1001).profile,'original-agent-run-monitor074')
 for(const patch of [{AGENT_STUDIO_ORIGINAL_MONITOR073_CI:'YES_DISPOSABLE_ORIGINAL_MONITOR073_METADATA_ONLY'},{AGENT_STUDIO_ORIGINAL_PG_LOGIN_CI:'YES_DISPOSABLE_ORIGINAL_LOGIN_ONLY'},{AGENT_STUDIO_ORIGINAL_MONITOR074_STORY:'monitor073'},{AGENT_STUDIO_ORIGINAL_MONITOR074_EXPECTED_HEAD:'b'.repeat(40)}])assert.throws(()=>requireOriginalMonitor074BrowserCi({...env,...patch},'linux',1001))
})
test('original page host grants only exact business endpoints, paired UUID cursors and bounded readers',()=>{
 const id='00000000-0000-4000-8000-000000000001',base='/__pg_native/api/v2/original-ui/business'
 for(const [method,path]of [['GET',base+'/cases/'+id],['POST',base+'/cases/'+id+'/monitors/preview'],['POST',base+'/monitor-checks/'+id+'/review'],['GET',base+'/monitors/'+id+'/checks?limit=20&after_ms=1793310000000&after_id='+id],['GET',base+'/runs/'+id+'/results/'+id+'?field=text&offset=5000&limit=4000']])assert.equal(originalMonitor074HostPolicy(method,path).kind,'native',path)
 for(const [method,path]of [['GET',base+'/cases/'+id+'?owner_user_id='+id],['POST',base+'/cases/'+id+'/reviews?owner=x'],['GET',base+'/monitors/'+id+'/checks?after_ms=1'],['GET',base+'/monitors/'+id+'/checks?limit=20&limit=20'],['GET',base+'/runs/'+id+'/results/'+id+'?field=password'],['POST','/__pg_native/api/v2/agent-design/submit'],['POST','/__pb/api/agent-runs'],['GET',base+'/materials/'+id]])assert.notEqual(originalMonitor074HostPolicy(method,path).kind,'native',path)
})
