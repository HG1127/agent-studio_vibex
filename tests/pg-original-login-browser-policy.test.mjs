import test from 'node:test'
import assert from 'node:assert/strict'
import {requireOriginalLoginBrowserCi,originalLoginPath,originalLoginRequestPolicy} from './helpers/pg-original-login-browser-guard.mjs'
import {installOriginalLegacyBlockObserver} from './helpers/pg-original-login-legacy-observer.mjs'
import {runInNewContext} from 'node:vm'

// Negative preflight only. These tests cannot issue a genuine runtime permit.
const purpose={
  GITHUB_ACTIONS:'true',CI:'true',GITHUB_RUN_ID:'123',RUNNER_OS:'Linux',RUNNER_ENVIRONMENT:'github-hosted',
  GITHUB_REPOSITORY:'HG1127/agent-studio_vibex',
  GITHUB_WORKFLOW:'Agent Studio F01 Agent Design genuine PG18 isolated verification',GITHUB_JOB:'pg18-agent-design-browser',
  AGENT_STUDIO_F01_GENUINE_CI:'YES_DISPOSABLE_F01_ONLY',
  AGENT_STUDIO_ORIGINAL_PG_LOGIN_CI:'YES_DISPOSABLE_ORIGINAL_LOGIN_ONLY',
  AGENT_STUDIO_PG18_CI_EPHEMERAL:'true',AGENT_STUDIO_PG18_CI_WRITE_APPROVED:'YES_DISPOSABLE_GITHUB_ONLY',
  AGENT_STUDIO_PG18_CI_HOST:'127.0.0.1',AGENT_STUDIO_PG18_CI_PORT:'5432',
  AGENT_STUDIO_PG18_CI_DATABASE:'agentstudio_pg18_ci',AGENT_STUDIO_PG18_CI_ADMIN_USER:'agentstudio_admin',
  AGENT_STUDIO_PG18_CI_ADMIN_PASSWORD:'synthetic-agentstudio-pg18-ci-123',
}

test('ordinary Windows, root and non-hosted processes cannot open the story',()=>{
  for(const [env,platform,uid] of [[{},'win32',0],[purpose,'win32',1001],[purpose,'linux',0],
    [{...purpose,RUNNER_ENVIRONMENT:'self-hosted'},'linux',1001],[{...purpose,GITHUB_REPOSITORY:'foreign/repo'},'linux',1001]])
    assert.throws(()=>requireOriginalLoginBrowserCi(env,platform,uid),/refuse/)
})

test('wrong workflow, job, purpose and ambient loader/proxy settings are refused',()=>{
  for(const key of ['GITHUB_WORKFLOW','GITHUB_JOB','AGENT_STUDIO_ORIGINAL_PG_LOGIN_CI','AGENT_STUDIO_F01_GENUINE_CI'])
    assert.throws(()=>requireOriginalLoginBrowserCi({...purpose,[key]:'wrong'},'linux',1001),/refuse/)
  for(const key of ['NODE_OPTIONS','NODE_PATH','NODE_EXTRA_CA_CERTS','NODE_TLS_REJECT_UNAUTHORIZED','HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','http_proxy','https_proxy','all_proxy'])
    assert.throws(()=>requireOriginalLoginBrowserCi({...purpose,[key]:''},'linux',1001),/refuse/)
})

test('an otherwise matching purpose never permits production or ambiguous database targets',()=>{
  for(const [key,value] of [['AGENT_STUDIO_PG18_CI_PORT','5333'],['AGENT_STUDIO_PG18_CI_DATABASE','agent_studio'],
    ['AGENT_STUDIO_PG18_CI_HOST','192.0.2.1'],['AGENT_STUDIO_PG18_CI_ADMIN_PASSWORD','wrong'],
    ['AGENT_STUDIO_PG18_CI_WRITE_APPROVED','true'],['DATABASE_URL','postgres://example.invalid/test'],['PGHOST','127.0.0.1']])
    assert.throws(()=>requireOriginalLoginBrowserCi({...purpose,[key]:value},'linux',1001),/refuse/)
})

test('asset paths cannot normalize traversal, encoded separators or controls into a safe path',()=>{
  for(const value of ['https://foreign.example/x','//foreign.example/x','/assets/../secret','/assets/%2e%2e/secret',
    '/assets/%252e%252e/secret','/assets//secret','/assets/./secret','/assets\\secret','/assets/%5csecret','/assets/%00key',
    '/assets/%','/assets/test#fragment','/assets/test\n.js','/assets/%2f%2fsecret','/assets/a%2fb.js']){
    assert.equal(originalLoginPath(value),null,value)
  }
})

test('legacy PB/OIDC and unprefixed API requests cannot fall through to the SPA',()=>{
  for(const value of ['/__pb','/__pb/api/agent_specs?rh_user_id=test','/__pg/api/v2/runs'])
    assert.equal(originalLoginRequestPolicy('GET',value,'text/html').kind,'legacy_denied')
  for(const value of ['/api','/api/studio/bootstrap/status','/__fixture/state','/__pg_native/not-api'])
    assert.equal(originalLoginRequestPolicy('GET',value,'text/html').kind,'api_denied')
})

test('business mutations, auth enrollment and encoded native aliases never reach Native',()=>{
  for(const [method,value] of [['POST','/__pg_native/api/v2/agent-design/submit'],['POST','/__pg_native/api/native-auth/employees'],
    ['POST','/__pg_native/api/native-auth/change-password'],['DELETE','/__pg_native/api/v2/agent-specs/test'],
    ['GET','/__pg_native/api/native-auth/%6de']])
    assert.notEqual(originalLoginRequestPolicy(method,value).kind,'native')
})

test('unknown files and source maps never receive an HTML success response',()=>{
  for(const [method,value] of [['POST','/login'],['GET','/.env'],['GET','/src/main.tsx'],['GET','/private/server.key'],['GET','/index.html.map']])
    assert.equal(originalLoginRequestPolicy(method,value,'text/html').kind,'denied')
})

function observerFixture(){
 let bind,init,args;const context={async exposeBinding(name,work){bind={name,work}},async addInitScript(work,value){init=work;args=value}}
 const document=()=>{
  let listener;const window={addEventListener(name,work){assert.equal(name,'studio:legacy-backend-blocked');listener=work}}
  window[bind.name]=code=>Promise.resolve(bind.work({},code))
  runInNewContext('('+init.toString()+')(args)',{window,args})
  return{event:detail=>listener({detail}),flush:()=>window.__studioOriginalLegacyBlocksFlush(),window}
 }
 return{context,document}
}
test('local PB block ledger is installed before app scripts and survives fresh documents',async()=>{
 const f=observerFixture(),observer=await installOriginalLegacyBlockObserver(f.context)
 const first=f.document();first.event({code:'pocketbase_unavailable_in_pg_runtime',cookie:'must not be recorded'});await first.flush()
 const second=f.document();second.event({code:'private untrusted payload'});await second.flush()
 assert.deepEqual(observer.snapshot(),{event_count_capped_129:2,codes:['pocketbase_unavailable_in_pg_runtime','unrecognized_legacy_block_event'],overflow:false})
 assert.equal(JSON.stringify(observer.snapshot()).includes('private'),false)
 assert.equal(Object.getOwnPropertyDescriptor(first.window,'__studioOriginalLegacyBlocksFlush').writable,false)
})
test('local PB block ledger bounds samples and overflow cannot appear as zero',async()=>{
 const f=observerFixture(),observer=await installOriginalLegacyBlockObserver(f.context),doc=f.document()
 for(let i=0;i<150;i++)doc.event({code:'pocketbase_unavailable_in_pg_runtime'})
 const settled=await doc.flush();assert.equal(settled.ok,false)
 const snapshot=observer.snapshot();assert.equal(snapshot.event_count_capped_129,129);assert.equal(snapshot.codes.length,128);assert.equal(snapshot.overflow,true)
})
