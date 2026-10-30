// Pure admission, routing and actual proxy callback control flow. No positive
// fixture, SQL, TLS server, browser, Worker or provider is started locally.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {createRequire,registerHooks,stripTypeScriptTypes} from 'node:module'
import {EventEmitter} from 'node:events'
import {PassThrough} from 'node:stream'
import {requireOriginalInternalShareBrowserCi,originalInternalSharePurpose} from './helpers/pg-original-internal-share-browser-guard.mjs'
import {originalInternalSharePolicy,originalInternalSharePath} from './helpers/pg-original-internal-share-browser-policy.mjs'
import {startOriginalInternalShareBrowserFixture} from './helpers/pg-original-internal-share-browser-fixture.mjs'
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8'),source=read('tests/helpers/pg-original-internal-share-browser-fixture.mjs')
const purpose={GITHUB_ACTIONS:'true',CI:'true',GITHUB_RUN_ID:'123',RUNNER_OS:'Linux',RUNNER_ENVIRONMENT:'github-hosted',GITHUB_REPOSITORY:'HG1127/agent-studio_vibex',GITHUB_WORKFLOW:'Agent Studio F08 Internal Template Share genuine PG18 isolated verification',GITHUB_JOB:'pg18-internal-share-browser',AGENT_STUDIO_F08_GENUINE_SUITE:'browser',AGENT_STUDIO_F08_GENUINE_CI:'YES_DISPOSABLE_F08_ONLY',GITHUB_SHA:'a'.repeat(40),GITHUB_REF:'refs/heads/codex/pg18-worker-heartbeat-original-share',AGENT_STUDIO_ORIGINAL_INTERNAL_SHARE_CI:originalInternalSharePurpose,AGENT_STUDIO_ORIGINAL_INTERNAL_SHARE_STORY:'original-internal-share',AGENT_STUDIO_ORIGINAL_INTERNAL_SHARE_EXPECTED_HEAD:'a'.repeat(40),AGENT_STUDIO_PG18_CI_EPHEMERAL:'true',AGENT_STUDIO_PG18_CI_WRITE_APPROVED:'YES_DISPOSABLE_GITHUB_ONLY',AGENT_STUDIO_PG18_CI_HOST:'127.0.0.1',AGENT_STUDIO_PG18_CI_PORT:'5432',AGENT_STUDIO_PG18_CI_DATABASE:'agentstudio_pg18_ci',AGENT_STUDIO_PG18_CI_ADMIN_USER:'agentstudio_admin',AGENT_STUDIO_PG18_CI_ADMIN_PASSWORD:'synthetic-agentstudio-pg18-ci-123'}
test('distinct original-page purpose composes original F08 only and never mints a runtime permit in these tests',()=>{
 const p=requireOriginalInternalShareBrowserCi(Object.freeze({...purpose}),'linux',1001);assert.equal(p.profile,'original-internal-share-page');assert.equal(p.target.port,5432);assert.equal(p.production_GO,false)
 for(const key of ['AGENT_STUDIO_ORIGINAL_INTERNAL_SHARE_CI','AGENT_STUDIO_ORIGINAL_INTERNAL_SHARE_STORY','AGENT_STUDIO_ORIGINAL_INTERNAL_SHARE_EXPECTED_HEAD','GITHUB_SHA','GITHUB_REF']){const missing={...purpose};delete missing[key];assert.throws(()=>requireOriginalInternalShareBrowserCi(missing,'linux',1001));assert.throws(()=>requireOriginalInternalShareBrowserCi({...purpose,[key]:'wrong'},'linux',1001))}
 for(const[key,value]of [['GITHUB_JOB','pg18-internal-share-genuine'],['GITHUB_WORKFLOW','other'],['RUNNER_ENVIRONMENT','self-hosted'],['AGENT_STUDIO_PG18_CI_PORT','5333'],['AGENT_STUDIO_PG18_CI_DATABASE','company'],['DATABASE_URL','postgres://example.invalid/company'],['NODE_OPTIONS',''],['HTTPS_PROXY',''],['AGENT_STUDIO_ORIGINAL_PG_LOGIN_CI',''],['AGENT_STUDIO_ORIGINAL_HOME070_CI','']])assert.throws(()=>requireOriginalInternalShareBrowserCi({...purpose,[key]:value},'linux',1001))
 assert.throws(()=>requireOriginalInternalShareBrowserCi(purpose,'win32',1001));assert.throws(()=>requireOriginalInternalShareBrowserCi(purpose,'linux',0))
})
test('ordinary public host invocation refuses before dynamic filesystem, driver or socket imports',async()=>{
 const attempted=[],hook=registerHooks({resolve(name){attempted.push(name);throw Error('runtime import forbidden in negative test')}})
 try{await assert.rejects(startOriginalInternalShareBrowserFixture({}),/refuse/)}finally{hook.deregister()}
 assert.deepEqual(attempted,[])
})
test('fixed routes admit exactly required original page APIs, including real capabilities, and refuse PB/unmapped writes',()=>{
 const client=read('src/lib/pgNativePilotApi.ts');assert(client.includes('capabilities:"/api/native-auth/capabilities"'))
 for(const[method,path]of [['GET','/__pg_native/api/native-auth/me'],['GET','/__pg_native/api/native-auth/capabilities'],['POST','/__pg_native/api/native-auth/login'],['POST','/__pg_native/api/native-auth/logout'],['GET','/__pg_native/api/v2/internal-templates'],['POST','/__pg_native/api/v2/internal-templates'],['POST','/__pg_native/api/v2/internal-templates/confirm']])assert.equal(originalInternalSharePolicy(method,path).kind,'native')
 for(const path of ['/__pb/api/studio/me','/__pg/api/v2/runs'])assert.equal(originalInternalSharePolicy('GET',path,'text/html').kind,'legacy_denied')
 for(const path of ['/api/studio/me','/__pg_native/api/v2/runs','/__pg_native/api/native-auth/employees','/__pg_native/api/v2/internal-templates?owner=x','/__pg_native/api/v2/internal-templates/%63onfirm'])assert.notEqual(originalInternalSharePolicy('POST',path).kind,'native')
 for(const path of ['/assets/../x','/assets/%2fsecret','/assets/%252e%252e/x','//foreign/x','/assets/a\\b','/.env\n'])assert.equal(originalInternalSharePath(path),null)
 assert.equal(originalInternalSharePolicy('GET','/internal-templates','text/html').kind,'spa');assert.notEqual(originalInternalSharePolicy('GET','/pg-native-pilot','text/html').kind,'spa')
})
const ts=createRequire(import.meta.url)('typescript'),tree=ts.createSourceFile('host.mjs',source,ts.ScriptTarget.Latest,true),nodes=[]
function visit(n){if(ts.isCallExpression(n)&&n.expression.getText(tree)==='https.createServer')nodes.push(n.arguments[1].getText(tree));ts.forEachChild(n,visit)}visit(tree);assert.equal(nodes.length,1)
function proxyModel({method='POST',path='/__pg_native/api/v2/internal-templates',hold=null,loss=null}={}){
 const options=[],budgets=[],observations={legacy_backend_requests:[],unexpected_api_failures:[],blocked_requests:[],forbidden_auth_headers:0,controlled_after_record_disconnects:0,controlled_held_cancellations:0,held_actual_responses:0},req=new EventEmitter(),res=new EventEmitter(),proxy=new EventEmitter(),chunks=[]
 req.method=method;req.url=path;req.headers={origin:'https://localhost:17443',cookie:'PRIVATE_COOKIE','x-agentstudio-request':'1','x-agentstudio-expected-employee':'00000000-0000-4000-8000-000000000001'};req.socket={destroy(){req.socket.destroyed=true}};req.pipe=p=>{assert.equal(p,proxy);return p}
 res.writeHead=(status,headers)=>{res.status=status;res.headers=headers;res.headersSent=true;return res};res.write=chunk=>{chunks.push(Buffer.from(chunk));return true};res.end=chunk=>{if(chunk)chunks.push(Buffer.from(chunk));res.writableEnded=true};res.destroy=()=>{res.destroyed=true;res.emit('close')}
 let upstreamCallback
 const https={request(option,callback){options.push(option);upstreamCallback=callback;return proxy}},remember=(key,value)=>observations[key].push(value),reply=(res,status,code)=>{res.writeHead(status,{});res.end(JSON.stringify({error:code}))}
 const hop=source.match(/const hop=new Set\(\[[^\n]+\]\)/)[0]
 const construct=Function('https','originalInternalSharePolicy','observations','remember','reply','upstream','agent','tls','Buffer','AbortSignal','fixture','hold','loss',`let nextHold=hold,nextLoss=loss;const holds=new Set();${hop};return ${nodes[0]}`)
 const handler=construct(https,originalInternalSharePolicy,observations,remember,reply,new URL('https://localhost:18443'),'STRICT_CA_AGENT',{ca:'CA'},Buffer,{timeout(ms){budgets.push(ms);return AbortSignal.timeout(ms)}},{mutable:{dropNext:null}},hold,loss)
 handler(req,res)
 return{req,res,proxy,options,budgets,observations,bytes:()=>Buffer.concat(chunks),response(status=200,bytes=Buffer.from('{"actual":"upstream"}')){const stream=new PassThrough();stream.statusCode=status;stream.headers={'content-type':'application/json'};upstreamCallback(stream);stream.end(bytes);return stream}}
}
test('actual proxy callback preserves Cookie Origin CSRF and expected-employee without DTO or TLS replacement',async()=>{
 const p=proxyModel();assert.equal(p.options.length,1);assert.deepEqual(p.budgets,[8000],'actual Native request must retain its fixed8s network budget');assert.deepEqual(p.options[0].headers,p.req.headers);assert.equal(p.options[0].rejectUnauthorized,true);assert.equal(p.options[0].minVersion,'TLSv1.2');assert.equal(p.options[0].servername,'localhost');assert.equal(p.options[0].ca,'CA')
 const bytes=Buffer.from('{"receipt":"terminal transport data"}');p.response(200,bytes);await new Promise(r=>setImmediate(r));assert.deepEqual(p.bytes(),bytes);assert.equal(p.observations.unexpected_api_failures.length,0)
})
test('actual proxy records unmapped routes/PB and real API errors instead of HTML or fake success',async()=>{
 const pb=proxyModel({method:'GET',path:'/__pb/api/agent_specs'});assert.equal(pb.res.status,501);assert.equal(pb.observations.legacy_backend_requests.length,1)
 const unknown=proxyModel({method:'GET',path:'/api/studio/users'});assert.equal(unknown.res.status,405);assert.equal(unknown.observations.unexpected_api_failures.length,1)
 const failed=proxyModel();failed.response(409,Buffer.from('{"error":"agent_internal_share_employee_changed"}'));await new Promise(r=>setImmediate(r));assert.equal(failed.res.status,409);assert.equal(failed.observations.unexpected_api_failures.length,1)
})
test('only explicitly armed original post-record loss is separated; unarmed transport loss remains failure',()=>{
 const p=proxyModel({loss:{recorded:true}});p.proxy.emit('error',Error('actual armed disconnect'));assert.equal(p.observations.controlled_after_record_disconnects,1);assert.equal(p.req.socket.destroyed,true);assert.equal(p.bytes().length,0)
 const q=proxyModel();q.proxy.emit('error',Error('unexpected'));assert.equal(q.res.status,503);assert.equal(q.observations.unexpected_api_failures.length,1)
})
test('actual proxy holds exact real200 bytes until release and counts controlled cancellation',async()=>{
 let release,enter;const wait=new Promise(r=>{release=r}),entered=new Promise(r=>{enter=r}),gate={method:'GET',path:'/__pg_native/api/v2/internal-templates',wait,release,enter,reject:error=>{throw error},entered:false}
 const p=proxyModel({method:'GET',hold:gate});p.response();await entered;assert.equal(p.bytes().length,0);assert.equal(p.observations.held_actual_responses,1);release();await new Promise(r=>setImmediate(r));assert.equal(p.bytes().toString(),'{"actual":"upstream"}')
 let release2,enter2;const wait2=new Promise(r=>{release2=r}),entered2=new Promise(r=>{enter2=r}),gate2={...gate,wait:wait2,release:release2,enter:enter2,entered:false}
 const cancelled=proxyModel({method:'GET',hold:gate2});cancelled.response();await entered2;cancelled.res.destroy();assert.equal(cancelled.observations.controlled_held_cancellations,1);release2();await new Promise(r=>setImmediate(r));assert.equal(cancelled.bytes().length,0)
})
test('busy original hook focus check verifies Cookie before reconcile instead of waiting for held business response',async()=>{
 const hook=read('src/pages/InternalTemplates/useInternalTemplates.ts'),begin=hook.indexOf('function usePgInternalTemplates()'),end=hook.indexOf('// Build-time selection',begin),actual=stripTypeScriptTypes(hook.slice(begin,end)),effects=[],order=[];let cached='Alice'
 const window=new EventTarget(),document=new EventTarget();document.visibilityState='visible'
 const controller={getView:()=>({}),start(){order.push('start')},reconcile(){order.push('reconcile:'+cached)},dispose(){}}
 const load=Function('useState','useRef','useLayoutEffect','useEffect','createPgNativePilotApi','createPgNativeInternalShareApi','createOriginalInternalTemplatesController','emptyOriginalInternalTemplatesView','verifyStudioSession','getStudioAccountInfo','PgNativeInternalShareError','navigator','window','document',actual+';return usePgInternalTemplates')
 const useHook=load(()=>[{},()=>{}],()=>({current:null}),()=>{},fn=>effects.push(fn),()=>({getConfigCapabilities:async()=>({})}),()=>({}),()=>controller,()=>({}),async()=>{order.push('verify');cached='Bob';return 'authenticated'},()=>({id:cached,active:true}),Error,{clipboard:{}},window,document)
 useHook();const cleanup=effects[0]();order.length=0;window.dispatchEvent(new Event('focus'));await new Promise(r=>setImmediate(r));assert.deepEqual(order,['verify','reconcile:Bob','start']);cleanup()
})
test('host/E2E use fresh actual F08, exact checkout/fixed pins, bounded actual build and all original zero gates',()=>{
 assert(source.indexOf('requireOriginalInternalShareBrowserCi(env)')<source.indexOf("import('node:fs')"));assert(source.includes('fixture=await agentInternalShareGenuineFixture(env)'));assert(source.includes("['rev-parse','HEAD']"));assert(source.includes('Object.entries(originalInternalShareReviewedSources)'))
 assert(source.includes("'.mjs':'text/javascript; charset=utf-8'"));assert(source.includes('>64*1024*1024'));assert(source.includes('fresh original F08 service required'));assert(source.includes('fixture.close()')||source.includes('fixture?.close()'))
 const story=read('tests/pg-original-internal-share-genuine.spec.mjs');for(const key of ['legacy_backend_requests','unexpected_api_failures','blocked_requests'])assert(story.includes('f.observations.'+key+').toEqual([])'))
 assert(story.includes('event_count_capped_129:0,codes:[],overflow:false'));assert(story.includes('expectedEmployeeAudit=await f.assertExpectedEmployeeRefused(code)'));assert(!story.includes('route.fulfill'));assert(!story.includes('/pg-native-pilot'))
 const negative=read('services/pg-api/tests/helpers/original-internal-share-expected-employee-case.mjs');assert(negative.includes("fixture.request('bob'"));assert(negative.includes('fixture.users.alice'));assert(negative.includes('assert.deepEqual(await fixture.counts(),before)'))
})
test('every attempted WebSocket is counted before closing and bounded by the original zero gate',()=>{
 const story=read('tests/pg-original-internal-share-genuine.spec.mjs'),body=story.match(/await context\.routeWebSocket\('\*\*\/\*',socket=>(\{[^\n]+\})\)/)?.[1];assert(body)
 const f={observations:{overflow:false}},actual=Function('f','let webSockets=0;return{callback:socket=>'+body+',count:()=>webSockets}')(f);let closed=0
 actual.callback({close(){closed++}});assert.equal(actual.count(),1);assert.equal(closed,1);assert.equal(f.observations.overflow,false)
 for(let i=0;i<130;i++)actual.callback({close(){closed++}});assert.equal(actual.count(),129);assert.equal(closed,131);assert.equal(f.observations.overflow,true)
 assert(story.includes('expect(webSockets).toBe(0)'));assert(story.includes('websocket_requests_capped_129:webSockets'))
})
test('explicit original-page screenshot follows actual Bob redemption and secret-free settled DOM gates',()=>{
 const story=read('tests/pg-original-internal-share-genuine.spec.mjs'),start=story.indexOf('copyAudit=await f.assertRecipientOwnsUnboundCopy()'),shot=story.indexOf("await page.screenshot({path:testInfo.outputPath('original-internal-share-bob-redeemed.png'),fullPage:true})"),end=story.indexOf("await logout(page,'bob')",start)
 assert(start>=0&&shot>start&&end>shot);const block=story.slice(start,shot)
 for(const exact of ["await settled(page)","code_absent:(await page.locator('p.font-mono').count())===0","redeem_input_empty:(await page.getByLabel('一次性分享码',{exact:true}).inputValue())===''","password_absent:(await page.getByLabel('密码',{exact:true}).count())===0","await expect(page.getByRole('alert')).toHaveCount(0)","await expect(page.getByText('领取成功',{exact:true})).toBeVisible()"])assert(block.includes(exact),exact)
 assert(!story.includes('.toHaveValue('));assert(!story.includes("expect(page.locator('p.font-mono')).toHaveCount("))
 const begin=block.indexOf('await expect.poll(async()=>({')+'await expect.poll(async()=>({'.length,finish=block.indexOf("}),{message:'synthetic screenshot",begin);assert(begin>0&&finish>begin)
 const inspect=Function('page','return async()=>({'+block.slice(begin,finish)+'})')({locator:()=>({count:async()=>1}),getByLabel:()=>({inputValue:async()=>'PRIVATE_CODE_NOT_LOGGED',count:async()=>0})})
 return inspect().then(observed=>{assert.deepEqual(observed,{code_absent:false,redeem_input_empty:false,password_absent:true});assert.equal(story.split('await page.screenshot(').length,2);const workflow=read('.github/workflows/pg18-internal-share-genuine-ci.yml');assert(workflow.includes('original-internal-share-browser-results/**/original-internal-share-bob-redeemed.png'));assert(workflow.includes("if: always() && matrix.story == 'original-internal-share'"))})
})
test('workflow keeps reference story and creates independent original story service with step-only purpose',()=>{
 const text=read('.github/workflows/pg18-internal-share-genuine-ci.yml');assert(text.includes('story: [reference, original-internal-share]'));assert(text.includes("if: matrix.story == 'reference'"));assert(text.includes('tests/pg-native-internal-share-genuine.config.mjs'));assert(text.includes('tests/pg-original-internal-share-genuine.config.mjs'))
 assert.equal(text.split('AGENT_STUDIO_ORIGINAL_INTERNAL_SHARE_CI:').length,2);assert(text.includes("AGENT_STUDIO_ORIGINAL_INTERNAL_SHARE_EXPECTED_HEAD: '${{ github.sha }}'"));assert(!/GITHUB_JOB\s*[:=]/.test(text))
})
