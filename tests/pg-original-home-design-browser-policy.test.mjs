// Pure and terminal control-flow checks only. No positive fixture, SQL, server,
// Worker, browser, provider, compiler or hosted acceptance is run by this file.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {createRequire,registerHooks} from 'node:module'
import {PassThrough} from 'node:stream'
import {requireOriginalHomeDesignBrowserCi,originalHomeDesignPurpose} from './helpers/pg-original-home-design-browser-guard.mjs'
import {originalHomeDesignPolicy,originalHomeDesignPath} from './helpers/pg-original-home-design-browser-policy.mjs'
import {originalHomeDesignDomSafety,originalHomeDesignImageBuffer,originalHomeDesignImageNames,originalHomeDesignObservationBytes,originalHomeDesignManualAuditProof} from './helpers/pg-original-home-design-artifacts.mjs'
import {startOriginalHomeDesignBrowserFixture} from './helpers/pg-original-home-design-browser-fixture.mjs'
import {originalHomeDesignBackendFixture} from './helpers/pg-original-home-design-backend-fixture.mjs'
import {verifyOriginalHomeDesignReviewedSources} from './helpers/pg-original-home-design-reviewed-check.mjs'
import {requireAgentDesignGenuineCi} from '../services/pg-api/tests/helpers/agent-design-genuine-fixture.mjs'
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8'),host=read('tests/helpers/pg-original-home-design-browser-fixture.mjs'),backend=read('tests/helpers/pg-original-home-design-backend-fixture.mjs'),story=read('tests/pg-original-home-design-genuine.spec.mjs')
const purpose={CI:'true',GITHUB_ACTIONS:'true',GITHUB_RUN_ID:'123',RUNNER_OS:'Linux',RUNNER_ENVIRONMENT:'github-hosted',GITHUB_REPOSITORY:'HG1127/agent-studio_vibex',GITHUB_WORKFLOW:'Agent Studio F01 Agent Design genuine PG18 isolated verification',GITHUB_JOB:'pg18-agent-design-browser',AGENT_STUDIO_F01_GENUINE_CI:'YES_DISPOSABLE_F01_ONLY',GITHUB_SHA:'a'.repeat(40),GITHUB_REF:'refs/heads/codex/pg18-worker-heartbeat-original-home-design',AGENT_STUDIO_ORIGINAL_HOME_DESIGN_CI:originalHomeDesignPurpose,AGENT_STUDIO_ORIGINAL_HOME_DESIGN_STORY:'original-home-design',AGENT_STUDIO_ORIGINAL_HOME_DESIGN_EXPECTED_HEAD:'a'.repeat(40),AGENT_STUDIO_PG18_CI_EPHEMERAL:'true',AGENT_STUDIO_PG18_CI_WRITE_APPROVED:'YES_DISPOSABLE_GITHUB_ONLY',AGENT_STUDIO_PG18_CI_HOST:'127.0.0.1',AGENT_STUDIO_PG18_CI_PORT:'5432',AGENT_STUDIO_PG18_CI_DATABASE:'agentstudio_pg18_ci',AGENT_STUDIO_PG18_CI_ADMIN_USER:'agentstudio_admin',AGENT_STUDIO_PG18_CI_ADMIN_PASSWORD:'synthetic-agentstudio-pg18-ci-123'}
test('own purpose composes unchanged F01 guard as pure data, without a runtime fixture permit',()=>{
 const p=requireOriginalHomeDesignBrowserCi(Object.freeze({...purpose}),'linux',1001)
 assert.equal(p.profile,'original-home-design070071072073');assert.equal(p.target.port,5432);assert.equal(p.origin,'https://localhost:17443');assert.equal(p.production_GO,false)
 for(const key of ['AGENT_STUDIO_ORIGINAL_HOME_DESIGN_CI','AGENT_STUDIO_ORIGINAL_HOME_DESIGN_STORY','AGENT_STUDIO_ORIGINAL_HOME_DESIGN_EXPECTED_HEAD','GITHUB_SHA','GITHUB_REF']){
  const missing={...purpose};delete missing[key];assert.throws(()=>requireOriginalHomeDesignBrowserCi(missing,'linux',1001));assert.throws(()=>requireOriginalHomeDesignBrowserCi({...purpose,[key]:'wrong'},'linux',1001))
 }
})
test('purpose refuses wrong job, another story, polluted transport, old permits and production-like targets',()=>{
 for(const[key,value]of [['GITHUB_JOB','pg18-agent-design-genuine'],['GITHUB_WORKFLOW','other'],['RUNNER_ENVIRONMENT','self-hosted'],['AGENT_STUDIO_PG18_CI_PORT','5333'],['AGENT_STUDIO_PG18_CI_DATABASE','company'],['DATABASE_URL','postgres://company'],['NODE_OPTIONS',''],['HTTPS_PROXY',''],['AGENT_STUDIO_ORIGINAL_PG_LOGIN_CI',''],['AGENT_STUDIO_ORIGINAL_HOME071_CI',''],['AGENT_STUDIO_ORIGINAL_OVERVIEW_CI',''],['AGENT_STUDIO_ORIGINAL_INTERNAL_SHARE_CI','']])assert.throws(()=>requireOriginalHomeDesignBrowserCi({...purpose,[key]:value},'linux',1001))
 assert.throws(()=>requireOriginalHomeDesignBrowserCi(purpose,'win32',1001));assert.throws(()=>requireOriginalHomeDesignBrowserCi(purpose,'linux',0))
})
for(const[name,fn]of [['host',startOriginalHomeDesignBrowserFixture],['backend',originalHomeDesignBackendFixture],['reviewed sources',verifyOriginalHomeDesignReviewedSources]])test('ordinary '+name+' refuses before dynamic runtime imports',async()=>{
 const attempted=[],hook=registerHooks({resolve(name){attempted.push(name);throw Error('forbidden_runtime_import_in_negative_test')}})
 try{await assert.rejects(fn({}),/refuse/)}finally{hook.deregister()}
 assert.deepEqual(attempted,[])
})
test('route policy admits only the original Home natural flow, actual metadata and explicit manual save',()=>{
 const id='11111111-1111-4111-8111-111111111111'
 for(const[method,path]of [['GET','/api/native-auth/me'],['GET','/api/native-auth/capabilities'],['POST','/api/native-auth/login'],['POST','/api/native-auth/logout'],['GET','/api/v2/model-connections'],['GET','/api/v2/original-ui/home-resources'],['GET','/api/v2/original-ui/agent-catalog?page=1'],['POST','/api/v2/agent-design/preview'],['POST','/api/v2/agent-design/submit'],['POST','/api/v2/agent-design/confirm'],['GET','/api/v2/agent-design/sources/'+id],['GET','/api/v2/agent-design/requests/'+id],['POST','/api/v2/original-ui/agent-specs'],['PATCH','/api/v2/original-ui/agent-specs/'+id]])assert.equal(originalHomeDesignPolicy(method,'/__pg_native'+path).kind,'native',method+path)
 for(const path of ['/','/login'])assert.equal(originalHomeDesignPolicy('GET',path,'text/html').kind,'spa')
})
test('unmapped writes, arbitrary execution, Pilot, PB and encoded aliases remain denied',()=>{
 for(const path of ['/__pb/api/studio/me','/__pg/api/v2/runs'])assert.equal(originalHomeDesignPolicy('GET',path).kind,'legacy_denied')
 for(const path of ['/__pg_native/api/v2/agent-design/save','/__pg_native/api/v2/agent-design/confirm-save','/__pg_native/api/v2/runs','/__pg_native/api/v2/model-connections/x/probe','/__pg_native/api/native-auth/employees','/__pg_native/api/v2/agent-design/%73ubmit','/__pg_native/api/v2/agent-design/submit?x=1'])assert.notEqual(originalHomeDesignPolicy('POST',path).kind,'native')
 assert.notEqual(originalHomeDesignPolicy('GET','/pg-native-pilot','text/html').kind,'spa')
 for(const path of ['/assets/../x','/assets/%2fsecret','/assets/%252e%252e/x','//foreign/x','/assets/a\\b','/.env\n'])assert.equal(originalHomeDesignPath(path),null)
})
const ts=createRequire(import.meta.url)('typescript')
const parse=(name,text)=>{const tree=ts.createSourceFile(name,text,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);assert.deepEqual(tree.parseDiagnostics,[]);return tree}
const hostTree=parse('host.mjs',host),callbacks=[]
function visit(node){if(ts.isCallExpression(node)&&node.expression.getText(hostTree)==='https.createServer')callbacks.push(node.arguments[1].getText(hostTree));ts.forEachChild(node,visit)}visit(hostTree);assert.equal(callbacks.length,1)
function proxyModel({method='POST',path='/__pg_native/api/v2/agent-design/submit',hold=null,loss=false,headers={}}={}){
 const observations={legacy_backend_requests:[],unexpected_api_failures:[],blocked_requests:[],forbidden_auth_headers:0,controlled_after_commit_disconnects:0,controlled_held_cancellations:0,held_actual_responses:0,overflow:false},req=new PassThrough(),res=new PassThrough(),proxy=new PassThrough(),chunks=[]
 req.method=method;req.url=path;req.headers={accept:'application/json',origin:'https://localhost:17443',cookie:'actual-cookie-data-only','x-agentstudio-request':'1',...headers};req.socket={destroyed:false,destroy(){this.destroyed=true}}
 res.writeHead=(status,h)=>{res.status=status;res.headers=h;res.headersSent=true;return res};res.on('data',chunk=>chunks.push(Buffer.from(chunk)));let options,receive
 const https={request(o,callback){options=o;receive=callback;return proxy}},remember=(key,value)=>observations[key].push(value),reply=(r,status,error)=>{r.writeHead(status,{});r.end(JSON.stringify({error}))},holds=new Set()
 const make=Function('https','originalHomeDesignPolicy','observations','remember','reply','agent','upstream','tls','hop','files','holds','let nextHold=arguments[11],nextLoss=arguments[12];return '+callbacks[0])
 const handler=make(https,originalHomeDesignPolicy,observations,remember,reply,{},new URL('https://localhost:45454'),{ca:'CA-data-only'},new Set(['host','connection','upgrade']),new Map(),holds,hold,loss)
 handler(req,res)
 return{req,res,proxy,observations,options,bytes:()=>Buffer.concat(chunks),async response(status=200,body='{"actual":"upstream-data-only"}'){
  const incoming=new PassThrough();incoming.statusCode=status;incoming.headers={'content-type':'application/json'};receive(incoming);incoming.end(Buffer.from(body));await new Promise(resolve=>setImmediate(resolve))
 }}
}
test('actual proxy callback preserves Cookie Origin CSRF expected employee and query, with exact8s TLS budget',async()=>{
 const p=proxyModel({method:'GET',path:'/__pg_native/api/v2/original-ui/agent-catalog?page=1',headers:{'x-agentstudio-expected-employee':'owner-data-only'}})
 assert.equal(p.options.path,'/api/v2/original-ui/agent-catalog?page=1');assert.equal(p.options.headers.cookie,'actual-cookie-data-only');assert.equal(p.options.headers.origin,'https://localhost:17443');assert.equal(p.options.headers['x-agentstudio-request'],'1');assert.equal(p.options.headers['x-agentstudio-expected-employee'],'owner-data-only')
 assert.equal(p.options.rejectUnauthorized,true);assert.equal(p.options.servername,'localhost');assert(p.options.signal instanceof AbortSignal);await p.response();assert.equal(p.bytes().toString(),'{"actual":"upstream-data-only"}');assert.deepEqual(p.observations.unexpected_api_failures,[])
 assert(host.includes('signal:AbortSignal.timeout(8000)'))
})
test('actual proxy drops only a complete real200 submit reply after upstream commit; no result DTO is manufactured',async()=>{
 const p=proxyModel({loss:true});assert.equal(p.req.socket.destroyed,false);await p.response();assert.equal(p.req.socket.destroyed,true);assert.equal(p.bytes().length,0);assert.equal(p.observations.controlled_after_commit_disconnects,1);assert.deepEqual(p.observations.unexpected_api_failures,[])
  const fail=proxyModel({loss:true});await fail.response(409,'{"error":"real_refusal"}');assert.equal(fail.req.socket.destroyed,false);assert.equal(fail.observations.controlled_after_commit_disconnects,0);assert.equal(fail.observations.unexpected_api_failures[0].status,409);assert.equal(fail.res.status,409);assert.equal(fail.bytes().toString(),'{"error":"real_refusal"}')
})
test('actual proxy holds immutable real result bytes until explicit release and counts aborted held responses',async()=>{
 const makeGate=()=>{let release,enter,reject;const wait=new Promise(resolve=>{release=resolve}),entered=new Promise((yes,no)=>{enter=yes;reject=no});return{gate:{path:'/__pg_native/api/v2/agent-design/requests/11111111-1111-4111-8111-111111111111',wait,release,enter,reject,entered:false},entered}}
 const first=makeGate(),p=proxyModel({method:'GET',path:first.gate.path,hold:first.gate});await p.response();await first.entered;assert.equal(p.bytes().length,0);first.gate.release();await new Promise(resolve=>setImmediate(resolve));assert.equal(p.bytes().toString(),'{"actual":"upstream-data-only"}')
 const second=makeGate(),q=proxyModel({method:'GET',path:second.gate.path,hold:second.gate});await q.response();await second.entered;q.res.destroy();await new Promise(resolve=>setImmediate(resolve));assert.equal(q.observations.controlled_held_cancellations,1);second.gate.release();await new Promise(resolve=>setImmediate(resolve));assert.equal(q.bytes().length,0)
})
test('forbidden auth headers, oversize response and real network failure stay counted or rejected',async()=>{
  for(const header of ['authorization','x-rh-user-id','x-forwarded-user','x-agentstudio-identity']){const forbidden=proxyModel({headers:{[header]:'private-data-only'}});assert.equal(forbidden.observations.forbidden_auth_headers,1);assert.equal(forbidden.options,undefined);assert.equal(forbidden.res.status,400)}
 const large=proxyModel();await large.response(200,'x'.repeat(1048577));assert(large.observations.unexpected_api_failures.length>0);assert.equal(large.bytes().length,0)
 const fail=proxyModel();fail.proxy.emit('error',Error('data-only'));assert.equal(fail.res.status,503);assert.equal(fail.observations.unexpected_api_failures[0].status,503)
})
test('new backend passes explicit actual browser mode through original F01 pure admission prefix',async()=>{
 const tree=parse('backend.mjs',backend),calls=[];function walk(n){if(ts.isCallExpression(n)&&n.expression.getText(tree)==='base.agentDesignGenuineFixture')calls.push(n.getText(tree));ts.forEachChild(n,walk)}walk(tree);assert.equal(calls.length,1)
 const original=read('services/pg-api/tests/helpers/agent-design-genuine-fixture.mjs'),originalTree=parse('original.mjs',original),fn=originalTree.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='agentDesignGenuineFixture'),prefix=fn.body.statements.slice(0,2).map(n=>n.getText(originalTree)).join('\n');assert(!prefix.includes('import('))
 const pure=Function('requireAgentDesignGenuineCi','return async function('+fn.parameters.map(n=>n.getText(originalTree)).join(',')+'){'+prefix+';return{browserMode,target,data_only:true,qualifies_run:false}}')(e=>requireAgentDesignGenuineCi(e,'linux',1001))
 const actual=await Function('base','env','return '+calls[0])({agentDesignGenuineFixture:pure},Object.freeze({...purpose}));assert.equal(actual.browserMode,true);assert.equal(actual.qualifies_run,false);assert.equal(actual.target.port,5432)
 await assert.rejects(pure(purpose),/agent_design_genuine_job_mode_required/)
})
test('screenshot gates detect secrets and passwords without returning the sensitive text',()=>{
 const good={text:'Synthetic original editor',values:['safe goal'],passwordInputs:0},safe=originalHomeDesignDomSafety(good,['PRIVATE_NOT_LOGGED'])
 assert.deepEqual(safe,{bounded:true,password_absent:true,secret_absent:true,credential_markers_absent:true})
 const bad=originalHomeDesignDomSafety({...good,values:['PRIVATE_NOT_LOGGED'],passwordInputs:1},['PRIVATE_NOT_LOGGED']);assert.equal(bad.secret_absent,false);assert.equal(bad.password_absent,false);assert(!JSON.stringify(bad).includes('PRIVATE_NOT_LOGGED'))
 assert.equal(originalHomeDesignDomSafety({...good,text:'Bearer abc'},[]).credential_markers_absent,false)
 assert.throws(()=>originalHomeDesignDomSafety({...good,text:'x'.repeat(1048577)},[]))
})
test('only fixed bounded PNG buffers with all safety booleans pass; filename paths and arbitrary formats fail',()=>{
 const png=Buffer.from([137,80,78,71,13,10,26,10]),safe={bounded:true,password_absent:true,secret_absent:true,credential_markers_absent:true}
 for(const name of originalHomeDesignImageNames)assert.equal(originalHomeDesignImageBuffer(name,png,safe).name,name)
 for(const name of ['../failure.png','arbitrary.png'])assert.throws(()=>originalHomeDesignImageBuffer(name,png,safe))
 assert.throws(()=>originalHomeDesignImageBuffer(originalHomeDesignImageNames[0],Buffer.from('not png'),safe));assert.throws(()=>originalHomeDesignImageBuffer(originalHomeDesignImageNames[0],png,{...safe,secret_absent:false}))
})
test('observation artifact refuses oversized UTF8 bytes before writing and retains incomplete status',()=>{
 const row={story_completed:false,synthetic_provider_posts:0,production_GO:false}
 assert.deepEqual(JSON.parse(originalHomeDesignObservationBytes(row).toString('utf8')),row)
 for(const text of ['x'.repeat(1048576),'测'.repeat(349526)])assert.throws(()=>originalHomeDesignObservationBytes({text}),/^Error: original_home_design_observation_oversize$/)
 assert(story.includes('originalHomeDesignObservationBytes(observation)'))
})
const auditSample=(operation,revision=1)=>{const actual={id:'owner-spec',owner_user_id:'owner',revision,spec:{goal:'employee actual saved goal'}};return{actual,events:[{owner_user_id:'owner',actor_user_id:'owner',action:'agent.original_home.'+operation,target_kind:'agent_spec',target_id:'owner-spec',result:'succeeded',metadata:{format:'agentstudio.home-authoring.v1',spec_revision:revision}}],history:operation==='create'?[]:[{spec_revision:String(revision),safe_spec:{goal:actual.spec.goal}}]}}
test('manual creation requires its actual owner070 audit and no update-only045 history',()=>{
 const actual=auditSample('create');assert.deepEqual(originalHomeDesignManualAuditProof(actual,'create'),{configuration_audit_recorded:true,edit_history_contract_valid:true})
 for(const patch of [{events:[]},{events:[{...actual.events[0],actor_user_id:'foreign'}]},{events:[{...actual.events[0],target_id:'foreign'}]},{events:[{...actual.events[0],result:'failed'}]},{events:[{...actual.events[0],metadata:{...actual.events[0].metadata,spec_revision:2}}]}])assert.equal(originalHomeDesignManualAuditProof({...actual,...patch},'create').configuration_audit_recorded,false)
 assert.equal(originalHomeDesignManualAuditProof({...actual,history:[{spec_revision:'1',safe_spec:actual.actual.spec}]},'create').edit_history_contract_valid,false)
})
test('manual revision requires a same-owner audit and exact text bigint revision/description history',()=>{
 const actual=auditSample('update',2);assert.deepEqual(originalHomeDesignManualAuditProof(actual,'update'),{configuration_audit_recorded:true,edit_history_contract_valid:true})
 for(const history of [[],[{spec_revision:2,safe_spec:actual.actual.spec}],[{spec_revision:'1',safe_spec:actual.actual.spec}],[{spec_revision:'02',safe_spec:actual.actual.spec}],[{spec_revision:'2',safe_spec:{goal:'old goal'}}]])assert.equal(originalHomeDesignManualAuditProof({...actual,history},'update').edit_history_contract_valid,false)
 assert.equal(originalHomeDesignManualAuditProof({...actual,events:auditSample('create',2).events},'update').configuration_audit_recorded,false)
 const frozen=read('db/postgres/migrations/pg_v9_045_agent_collaboration.sql');assert(frozen.includes('CREATE TRIGGER native_agent_collaboration_history AFTER UPDATE OF name,spec'));assert(backend.includes('spec_revision::text AS spec_revision'));assert(story.includes("originalHomeDesignManualAuditProof(audit,'create')"));assert(story.includes("originalHomeDesignManualAuditProof(audit,'update')"));assert(story.includes('expect(after.history).toBe(before.history+2)'))
})
test('original UI selectors and real F01 Worker output remain the source of the story, with every migration zero gate',()=>{
 for(const s of ['#hero','#spec-editor','预览模型请求','按已核对需求生成草案','查询原模型请求','可选 · 让 AI 帮我调整方案','预览修改请求','按已核对要求修改','保存到我的助手'])assert(story.includes(s),s)
 for(const text of ['await f.tick()','f.output().name','f.output().goal','f.mutable.submissions=false','assertSameConfirm(firstBody)','stale_CAS_status','old_editor_hidden_before_release'])assert(story.includes(text),text)
 for(const key of ['legacy_backend_requests','unexpected_api_failures','blocked_requests'])assert(story.includes('f.observations.'+key+').toEqual([])'))
 for(const text of ['expect(webSockets).toBe(0)','event_count_capped_129:0,codes:[],overflow:false','expect(f.observations.forbidden_auth_headers).toBe(0)','expect(after.saves).toBe(before.saves)','expect(after.runs).toBe(before.runs)','expect(after.old_effects).toBe(before.old_effects)'])assert(story.includes(text))
 for(const text of ['route.fulfill','addCookies(','page.route(','PgNativePilotPage','ignoreHTTPSErrors:true'])assert(!story.includes(text))
})
test('backend invokes actual catalog audits and Native repositories; old read-only zero-model fixtures remain unused',()=>{
 for(const name of ['inspectOptionalNativeHomeAuthoringSchema','inspectOptionalNativeAgentCatalogSchema','inspectOptionalOriginalHomeKnowledgeStatisticsSchema','inspectOptionalNativeMonitorInbox','f.audit(db)','createAgentDesignHttpHandler','AgentDesignLedgerRepository','prepareNativeHomeAgentSpecs','prepareNativeAgentCatalog','createNativeOwnOperationsBusinessHandler'])assert(backend.includes(name),name)
 assert(!backend.includes('originalLoginHome071GenuineFixture('));assert(!backend.includes('GITHUB_JOB='));assert(!backend.includes('providerMode='));assert(!backend.includes('INSERT INTO agentstudio.agent_design_outputs'))
 const check=read('tests/helpers/pg-original-home-design-reviewed-check.mjs');assert(check.includes('Object.entries(originalLoginReviewedSources)'));assert(check.includes("['rev-parse','HEAD']"));assert(check.includes("'src/lib/originalHomeDesign.ts'"));assert(check.includes("'services/pg-api/src/agent-design-ledger.ts'"));assert(check.includes('Root final reviewed source closure is required'))
})
test('success screenshots stay in memory until all story work and owned cleanup; no failed-page image or trace is written',()=>{
 const before=story.indexOf('await clean(\'genuine_fixture_close\''),write=story.indexOf('if(success)for(const image of images)');assert(before>0&&write>before);assert(story.includes('success=completed&&!primary&&!testInfo.errors.length&&!cleanup.length'))
 assert.equal(story.split('p.screenshot({fullPage:true})').length,2);assert(!story.includes('screenshot({path:'));assert(story.includes('originalHomeDesignDomSafety(sample,secrets)'))
 const config=read('tests/pg-original-home-design-genuine.config.mjs');for(const option of ["trace:'off'","video:'off'","screenshot:'off'","retries:0","workers:1"])assert(config.includes(option))
})
test('CI adds an independent matrix service with step-local purpose and exact artifact allowlist, preserving every old story',()=>{
 const text=read('.github/workflows/pg18-agent-design-genuine-ci.yml');assert(text.includes('story: [design, original-login, monitor073, internal-overview, original-home-design]'))
 for(const name of ['pg-native-agent-design-genuine.config.mjs','pg-original-login-genuine.config.mjs','pg-original-monitor073-genuine.config.mjs','pg-original-internal-overview-genuine.config.mjs','pg-original-home-design-genuine.config.mjs'])assert(text.includes(name))
 assert.equal(text.split('AGENT_STUDIO_ORIGINAL_HOME_DESIGN_CI:').length,2);assert(text.includes("AGENT_STUDIO_ORIGINAL_HOME_DESIGN_EXPECTED_HEAD: '${{ github.sha }}'"));assert(!/GITHUB_JOB\s*[:=]/.test(text))
 const start=text.indexOf('      - name: Retain fixed safe original Home'),end=text.indexOf('      - name: Retain synthetic page images only',start),block=text.slice(start,end)
 for(const name of originalHomeDesignImageNames)assert(block.includes('/**/'+name));assert(block.includes('/**/original-home-design-observation.json'));assert(!block.includes('/**/*.png'));assert(!block.includes('trace'))
})
