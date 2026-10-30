import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {registerHooks} from 'node:module'
import {runInNewContext} from 'node:vm'
import {requireOriginalLoginHome071Ci,originalLoginHome071Purpose} from '../services/pg-api/tests/helpers/original-login-home071-ci-guard.mjs'
import {requireOriginalHome070Ci} from '../services/pg-api/tests/helpers/original-home070-ci-guard.mjs'
import {requireOriginalHome071Ci} from '../services/pg-api/tests/helpers/original-home071-ci-guard.mjs'
import {originalLoginHome071GenuineFixture} from '../services/pg-api/tests/helpers/original-login-home071-genuine-fixture.mjs'
import {startOriginalLoginGenuineBrowserFixture} from './helpers/pg-original-login-genuine-browser-fixture.mjs'

// Pure admission inputs only. Never pass these to an effectful fixture.
const purpose=Object.freeze({
 GITHUB_ACTIONS:'true',CI:'true',GITHUB_RUN_ID:'123',RUNNER_OS:'Linux',RUNNER_ENVIRONMENT:'github-hosted',
 GITHUB_REPOSITORY:'HG1127/agent-studio_vibex',
 GITHUB_WORKFLOW:'Agent Studio F01 Agent Design genuine PG18 isolated verification',GITHUB_JOB:'pg18-agent-design-browser',
 GITHUB_SHA:'a'.repeat(40),GITHUB_REF:'refs/heads/codex/pg18-worker-heartbeat-test',
 AGENT_STUDIO_F01_GENUINE_CI:'YES_DISPOSABLE_F01_ONLY',
 AGENT_STUDIO_ORIGINAL_PG_LOGIN_CI:'YES_DISPOSABLE_ORIGINAL_LOGIN_ONLY',
 AGENT_STUDIO_ORIGINAL_LOGIN_HOME071_CI:originalLoginHome071Purpose,
 AGENT_STUDIO_ORIGINAL_LOGIN_HOME071_PROFILE:'original-login-home071',AGENT_STUDIO_ORIGINAL_LOGIN_HOME071_STORY:'original-login',
 AGENT_STUDIO_ORIGINAL_LOGIN_HOME071_EXPECTED_HEAD:'a'.repeat(40),
 AGENT_STUDIO_PG18_CI_EPHEMERAL:'true',AGENT_STUDIO_PG18_CI_WRITE_APPROVED:'YES_DISPOSABLE_GITHUB_ONLY',
 AGENT_STUDIO_PG18_CI_HOST:'127.0.0.1',AGENT_STUDIO_PG18_CI_PORT:'5432',
 AGENT_STUDIO_PG18_CI_DATABASE:'agentstudio_pg18_ci',AGENT_STUDIO_PG18_CI_ADMIN_USER:'agentstudio_admin',
 AGENT_STUDIO_PG18_CI_ADMIN_PASSWORD:'synthetic-agentstudio-pg18-ci-123',
})
const read=relative=>fs.readFileSync(new URL('../'+relative,import.meta.url),'utf8')
const common=()=>read('services/pg-api/tests/helpers/original-home070-genuine-fixture.mjs')
const host=()=>read('tests/helpers/pg-original-login-genuine-browser-fixture.mjs')
const spec=()=>read('tests/pg-original-login-genuine.spec.mjs')

test('successor browser admission is explicit, immutable and keeps the actual job',()=>{
 const result=requireOriginalLoginHome071Ci(purpose,'linux',1001)
 assert.equal(result.profile,'original-login-home071');assert.equal(result.catalog_profile,'original-agent-catalog071')
 assert.equal(result.head,purpose.GITHUB_SHA);assert.equal(result.origin,'https://localhost:17443')
 assert.equal(result.target.port,5432);assert.equal(result.target.database,'agentstudio_pg18_ci')
 assert.equal(result.synthetic_only,true);assert.equal(result.production_GO,false);assert(Object.isFrozen(result))
 assert.equal(purpose.GITHUB_JOB,'pg18-agent-design-browser')
})

test('successor purpose/profile/story/head/ref are individually mandatory',()=>{
 for(const key of ['AGENT_STUDIO_ORIGINAL_LOGIN_HOME071_CI','AGENT_STUDIO_ORIGINAL_LOGIN_HOME071_PROFILE',
  'AGENT_STUDIO_ORIGINAL_LOGIN_HOME071_STORY','AGENT_STUDIO_ORIGINAL_LOGIN_HOME071_EXPECTED_HEAD','GITHUB_SHA','GITHUB_REF']){
  const absent={...purpose};delete absent[key]
  assert.throws(()=>requireOriginalLoginHome071Ci(absent,'linux',1001),/admission_refused/,key)
  assert.throws(()=>requireOriginalLoginHome071Ci({...purpose,[key]:'wrong'},'linux',1001),/admission_refused/,key)
 }
 for(const ref of ['refs/heads/main','refs/tags/codex/pg18-worker-heartbeat-test','refs/pull/29/merge'])
  assert.throws(()=>requireOriginalLoginHome071Ci({...purpose,GITHUB_REF:ref},'linux',1001),/admission_refused/)
 assert.throws(()=>requireOriginalLoginHome071Ci({...purpose,GITHUB_SHA:'b'.repeat(40)},'linux',1001),/admission_refused/)
})

test('original Login and F01 hosted target restrictions remain independent prerequisites',()=>{
 for(const [env,platform,uid] of [[{},'win32',0],[purpose,'win32',1001],[purpose,'linux',0],[purpose,'linux',NaN],
  [{...purpose,RUNNER_ENVIRONMENT:'self-hosted'},'linux',1001],[{...purpose,GITHUB_REPOSITORY:'foreign/repo'},'linux',1001],
  [{...purpose,GITHUB_JOB:'pg18-agent-design-genuine'},'linux',1001],
  [{...purpose,AGENT_STUDIO_ORIGINAL_PG_LOGIN_CI:undefined},'linux',1001],
  [{...purpose,AGENT_STUDIO_F01_GENUINE_CI:undefined},'linux',1001]])
  assert.throws(()=>requireOriginalLoginHome071Ci(env,platform,uid),/refuse/)
 for(const [key,value] of [['AGENT_STUDIO_PG18_CI_HOST','192.0.2.1'],['AGENT_STUDIO_PG18_CI_PORT','5333'],
  ['AGENT_STUDIO_PG18_CI_DATABASE','company'],['AGENT_STUDIO_PG18_CI_ADMIN_USER','postgres'],
  ['AGENT_STUDIO_PG18_CI_ADMIN_PASSWORD','wrong'],['DATABASE_URL','postgres://example.invalid/company'],['PGHOST','127.0.0.1']])
  assert.throws(()=>requireOriginalLoginHome071Ci({...purpose,[key]:value},'linux',1001),/refuse/,key)
 for(const key of ['NODE_OPTIONS','NODE_PATH','NODE_EXTRA_CA_CERTS','NODE_TLS_REJECT_UNAUTHORIZED','HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','http_proxy','https_proxy','all_proxy'])
  assert.throws(()=>requireOriginalLoginHome071Ci({...purpose,[key]:''},'linux',1001),/refuse/,key)
})

test('browser successor rejects every TCP purpose field, including empty fields',()=>{
 for(const key of ['AGENT_STUDIO_ORIGINAL_HOME070_CI','AGENT_STUDIO_ORIGINAL_HOME070_SUITE','AGENT_STUDIO_ORIGINAL_HOME070_EXPECTED_HEAD',
  'AGENT_STUDIO_ORIGINAL_HOME071_CI','AGENT_STUDIO_ORIGINAL_HOME071_SUITE','AGENT_STUDIO_ORIGINAL_HOME071_EXPECTED_HEAD'])
  for(const value of ['', 'wrong'])assert.throws(()=>requireOriginalLoginHome071Ci({...purpose,[key]:value},'linux',1001),/admission_refused/,key)
})

test('existing TCP070/071 admissions cannot consume browser purpose or browser job',()=>{
 for(const guard of [requireOriginalHome070Ci,requireOriginalHome071Ci]){
  assert.throws(()=>guard(purpose,'linux',1001),/admission_refused/)
  assert.throws(()=>guard({...purpose,GITHUB_JOB:'pg18-agent-design-genuine'},'linux',1001),/admission_refused/)
 }
})

test('public browser openers reject ordinary hosts before any dynamic runtime import',async()=>{
 const attempted=[]
 const hook=registerHooks({resolve(specifier,context,next){attempted.push(specifier);throw Error('runtime_import_forbidden_in_negative_test')}})
 try{
  await assert.rejects(originalLoginHome071GenuineFixture({}),/refuse_non_ephemeral_original_login_browser_ci/)
  await assert.rejects(startOriginalLoginGenuineBrowserFixture({}),/refuse_non_ephemeral_original_login_browser_ci/)
 }finally{hook.deregister()}
 assert.deepEqual(attempted,[])
})

test('both original and independent admission precede browser file and runtime imports',()=>{
 const body=host(),story=spec(),guard=read('services/pg-api/tests/helpers/original-login-home071-ci-guard.mjs')
 assert(body.indexOf('requireOriginalLoginBrowserCi(env)')<body.indexOf('requireOriginalLoginHome071Ci(env)'))
 assert(body.indexOf('requireOriginalLoginHome071Ci(env)')<body.indexOf("import('node:fs')"))
 assert(story.indexOf('requireOriginalLoginHome071Ci()')<story.indexOf("await import('node:fs/promises')"))
 assert(guard.includes('requireOriginalLoginBrowserCi(env,platform,uid)'))
 assert(guard.includes('requireAgentDesignGenuineCi(env,platform,uid)'))
 for(const body of [common(),host(),guard]){
  assert.doesNotMatch(body,/(?:process\.)?env\.GITHUB_JOB\s*=(?!=)/)
  assert.doesNotMatch(body,/Object\.assign\((?:process\.)?env/)
 }
})

test('fresh lifecycle installs and actually audits070 then071 before returning observed profile',()=>{
 const body=common(),start=body.indexOf('export async function originalLoginHome071GenuineFixture'),end=body.indexOf('// No exported opener')
 const entry=body.slice(start,end)
 assert(entry.indexOf('requireOriginalLoginHome071Ci(env)')<entry.indexOf('await openOriginalHomeFixture'))
 assert(entry.indexOf('await f.install070()')<entry.indexOf('await f.install071()'))
 assert(entry.indexOf('await f.install071()')<entry.indexOf("assert.equal(await f.inspect(),'installed')"))
 assert(entry.includes("assert.equal(await f.inspectCatalog(),'absent')"))
 assert(entry.includes("assert.equal(await f.inspectCatalog(),'installed')"))
 assert(entry.includes('await f.prepare({enabled:true,writes:false})'))
 assert(entry.includes('await f.prepareCatalog({enabled:true,writes:false})'))
 assert(body.includes('await prepare({enabled:true,writes:!browserMode})'))
 assert(body.includes('await prepareCatalog({enabled:true,writes:!browserMode})'))
 assert(entry.includes("'pg_v9_070','pg_v9_071'"));assert(entry.includes('assert.equal(f.ownOperationsSchemaVerified,true)'))
 assert(body.includes('f=await agentDesignGenuineFixture(env,{browserMode})'))
 assert(body.includes('assert.equal(await audit.inspectOptionalNativeHomeAuthoringSchema(f.pool),\'installed\')'))
 assert(body.includes('assert.equal(await catalogAudit.inspectOptionalNativeAgentCatalogSchema(f.pool),\'installed\')'))
 assert(entry.includes('await f.close()'));assert(body.includes('await f.close()'))
})

test('source checks remain fixed and real profile observations do not authorize the initializer',()=>{
 const body=common(),browser=host()
 for(const text of ['source.captureCompleteProfileSources()','review.captureOriginalHome070ReviewPlan()',
  'review071.captureOriginalHome071ReviewPlan()','source.assertCompleteProfileSnapshot(snapshot,snapshot.source_sha256)',
  "child.execFileSync('git',['rev-parse','HEAD']",'permit.head','clean exact-head checkout required'])assert(body.includes(text),text)
 assert(browser.includes('Object.entries(originalLoginReviewedSources)'));assert(browser.includes('actual!==expected'))
 assert(body.includes('complete069_original_initializer_verified:false'))
 assert(body.includes('Native_server_process_entry_verified:false'))
 assert(body.includes('monitor073_installed:false'))
 assert.doesNotMatch(body,/installed_profile_verified\s*[:=]\s*true/)
 assert(browser.includes('fixture.browserHomeProfile?.profile!==homePermit.profile'))
})

test('browser uses installed backend transport and the product Native composition with real owner audit',()=>{
 const body=common(),browser=host()
 assert(browser.includes('fixture=await homeBackend.originalLoginHome071GenuineFixture(env)'))
 assert.doesNotMatch(browser,/fixture=await genuine\.agentDesignGenuineFixture/)
 assert(browser.includes('new URL(fixture.nativeOrigin)'));assert(body.includes('nativeOrigin:origin,allowedOrigin,ownOperationsSchemaVerified'))
 assert(body.includes('allowedOrigin=browserMode?permit.origin:origin'))
 assert(body.includes('outcome.inspectAgentMemoryOutcomeSchema(f.pool)'))
 assert(body.includes('own.inspectOwnOperationsSchema(f.pool,outcomeAvailable)'))
 assert(body.includes('new own.OwnOperationsRepository(f.pool),available:ownOperationsSchemaVerified'))
 assert(body.includes('policy.selectNativePg18UatCapabilities(env,true,allowedOrigin)'))
 assert(body.includes('policy:capabilities,businessHandler:generic,allowedOrigin,authenticateRequest:handler.authenticateRequest'))
 assert(body.includes('runtime.prepareNativeHomeAgentSpecs('));assert(body.includes('catalogRuntime.prepareNativeAgentCatalog('))
 assert(body.includes('if(catalogHttp&&await catalogHttp(req,res))return;if(home&&await home(req,res))return;return generic(req,res)'))
 assert.doesNotMatch(body,/available:\s*true/)
})

test('strict TLS and unmodified Cookie Origin and CSRF remain on the real proxy',()=>{
 const body=host()
 for(const text of ['fixture.allowedOrigin!==approved.origin',"upstream.protocol!=='https:'",'rejectUnauthorized:true',
  "minVersion:'TLSv1.2'",'ca:tls.ca','headers,agent','req.pipe(target)',
  "req.headers['x-rh-user-id']!==undefined",'genuine.requireAgentDesignGenuineCi(env)'])assert(body.includes(text),text)
 assert.doesNotMatch(body,/rejectUnauthorized:\s*false|NODE_TLS_REJECT_UNAUTHORIZED\s*=/)
 assert.doesNotMatch(body,/headers\[['"](?:origin|cookie|x-agentstudio-request)['"]\]\s*=/i)
 assert.doesNotMatch(body,/reply\(res,200/)
})

test('actual host MIME table accepts built mjs while preserving explicit types and64MiB budget',()=>{
 const body=host(),start=body.indexOf('const mime=')+'const mime='.length,end=body.indexOf('\n  function checkedFile',start)
 assert(start>0&&end>start)
 const mime=runInNewContext('('+body.slice(start,end).trim()+')',Object.create(null))
 assert.equal(mime['.mjs'],'text/javascript; charset=utf-8')
 assert.equal(mime['.js'],'text/javascript; charset=utf-8')
 for(const extension of ['.bcmap','.pfb','.json','.env','.map','.unknown',''])assert.equal(mime[extension],undefined)
 assert(body.includes('if(!type||(buildBytes+=bytes.length)>64*1024*1024)'))
 assert(body.includes('stat.size>max'));assert(body.includes('relative.endsWith(\'.map\')'))
})

test('v4 local PB events, legacy network and every unexpected API error keep zero gates',()=>{
 const story=spec(),browser=host()
 assert(story.indexOf('installOriginalLegacyBlockObserver(context)')<story.indexOf('context.newPage()'))
 assert(story.includes('.toEqual({event_count_capped_129:0,codes:[],overflow:false})'))
 for(const key of ['legacy_backend_requests','unexpected_api_failures','blocked_requests']){
  assert(new RegExp('expect\\.soft\\(f\\.observations\\.'+key+'[\\s\\S]*?\\)\\.toEqual\\(\\[\\]\\)').test(story),key)
  assert(browser.includes("remember('"+key+"'"),key)
 }
 assert(browser.includes('if(!(isMe&&status===401))'))
 assert.doesNotMatch(browser,/monitor073|agent-monitor|monitoring/) // No monitor-specific refusal exemption.
 assert(story.includes('home_business_complete:false'));assert(story.includes('employee_UAT:0'))
 assert(story.includes('production_GO:false'));assert(story.includes('actual_backend:f.backendProfile'))
})

test('successor purpose is confined to the original-login workflow step',()=>{
 const workflow=read('.github/workflows/pg18-agent-design-genuine-ci.yml')
 const start=workflow.indexOf('      - name: Original Login App authentication through real PG18 Native HTTPS')
 const next=workflow.indexOf('      - name:',start+1),step=workflow.slice(start,next)
 assert(start>=0);assert(step.includes("if: matrix.story == 'original-login'"))
 for(const key of ['CI','PROFILE','STORY','EXPECTED_HEAD']){
  const marker='AGENT_STUDIO_ORIGINAL_LOGIN_HOME071_'+key+':'
  assert(step.includes(marker));assert.equal(workflow.split(marker).length,2)
 }
 assert(step.includes("AGENT_STUDIO_ORIGINAL_LOGIN_HOME071_EXPECTED_HEAD: '${{ github.sha }}'"))
 assert(workflow.includes('node --test tests/pg-original-login-browser-policy.test.mjs tests/pg-original-login-home071-policy.test.mjs'))
 assert.doesNotMatch(workflow,/GITHUB_JOB\s*[:=]/)
})
