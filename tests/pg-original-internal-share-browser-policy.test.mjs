// Pure admission, routing and actual proxy callback control flow. No positive
// fixture, SQL, TLS server, browser, Worker or provider is started locally.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {createRequire,registerHooks,stripTypeScriptTypes} from 'node:module'
import {EventEmitter} from 'node:events'
import {PassThrough} from 'node:stream'
import {dropActualCommittedModelReplyPrefix} from './helpers/pg-original-model-committed-prefix-loss.mjs'
import {requireOriginalInternalShareBrowserCi,originalInternalSharePurpose} from './helpers/pg-original-internal-share-browser-guard.mjs'
import {originalInternalSharePolicy,originalInternalSharePath} from './helpers/pg-original-internal-share-browser-policy.mjs'
import {startOriginalInternalShareBrowserFixture,originalShareProxyErrorCode,originalShareProxyBoundary,originalShareProxyTiming} from './helpers/pg-original-internal-share-browser-fixture.mjs'
import {requireAgentInternalShareGenuineCi} from '../services/pg-api/tests/helpers/agent-internal-share-genuine-guard.mjs'
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
test('original host passes explicit browser mode through the unchanged actual F08 admission prefix',async()=>{
 const calls=[];function findCall(n){if(ts.isCallExpression(n)&&n.expression.getText(tree)==='agentInternalShareGenuineFixture')calls.push(n.getText(tree));ts.forEachChild(n,findCall)}findCall(tree);assert.equal(calls.length,1)
 const backendSource=read('services/pg-api/tests/helpers/agent-internal-share-genuine-fixture.mjs'),backendTree=ts.createSourceFile('backend.mjs',backendSource,ts.ScriptTarget.Latest,true),declaration=backendTree.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='agentInternalShareGenuineFixture');assert(declaration?.body)
 // Execute only the actual pure admission prefix, stopping before any imports.
 const prefix=declaration.body.statements.slice(0,2).map(n=>n.getText(backendTree)).join('\n');assert(!prefix.includes('import('))
 const backend=Function('requireAgentInternalShareGenuineCi','return async function('+declaration.parameters.map(n=>n.getText(backendTree)).join(',')+'){'+prefix+';return {browserMode,job:env.GITHUB_JOB,target,observed_data_only:true,qualifies_run:false}}')(env=>requireAgentInternalShareGenuineCi(env,'linux',1001))
 const env=Object.freeze({...purpose}),invoke=Function('agentInternalShareGenuineFixture','env','return '+calls[0]),result=await invoke(backend,env)
 assert.equal(result.browserMode,true);assert.equal(result.job,env.GITHUB_JOB);assert.equal(result.target.database,'agentstudio_pg18_ci');assert.equal(result.qualifies_run,false)
 await assert.rejects(backend(env),/agent_internal_share_genuine_job_mode_required/)
 await assert.rejects(invoke(backend,Object.freeze({...env,GITHUB_JOB:'pg18-internal-share-genuine'})),/refuse_non_ephemeral/)
 assert.equal(env.GITHUB_JOB,'pg18-internal-share-browser')
})
function proxyModel({method='POST',path='/__pg_native/api/v2/internal-templates',hold=null,loss=null,mutable={dropNext:null,actualReplyDrops:0,completedAfterBusinessCreates:0},throwDiagnostic=false}={}){
 const options=[],budgets=[],observations={legacy_backend_requests:[],unexpected_api_failures:[],blocked_requests:[],write_boundaries:[],write_timings:[],forbidden_auth_headers:0,controlled_after_record_disconnects:0,controlled_held_cancellations:0,held_actual_responses:0,committed_response_prefixes:[]},req=new EventEmitter(),res=new EventEmitter(),proxy=new EventEmitter(),chunks=[]
 req.method=method;req.url=path;req.headers={origin:'https://localhost:17443',cookie:'PRIVATE_COOKIE','x-agentstudio-request':'1','x-agentstudio-expected-employee':'00000000-0000-4000-8000-000000000001'};req.socket={destroy(){req.socket.destroyed=true}};proxy.destroy=()=>{proxy.destroyed=true};req.pipe=p=>{assert.equal(p,proxy);return p}
 res.writeHead=(status,headers)=>{res.status=status;res.headers=headers;res.headersSent=true;return res};res.write=chunk=>{chunks.push(Buffer.from(chunk));return true};res.end=chunk=>{if(chunk)chunks.push(Buffer.from(chunk));res.writableEnded=true};res.destroy=()=>{res.destroyed=true;res.emit('close')}
 let upstreamCallback
 const https={request(option,callback){options.push(option);upstreamCallback=callback;return proxy}},remember=(key,value)=>{if(throwDiagnostic&&key==='write_boundaries')throw Error('synthetic diagnostic failure');observations[key].push(value)},reply=(res,status,code)=>{res.writeHead(status,{});res.end(JSON.stringify({error:code}))}
 const hop=source.match(/const hop=new Set\(\[[^\n]+\]\)/)[0]
 const construct=Function('https','originalInternalSharePolicy','observations','remember','reply','upstream','agent','tls','Buffer','AbortSignal','fixture','hold','loss','originalShareProxyErrorCode','originalShareProxyBoundary','originalShareProxyTiming','dropActualCommittedModelReplyPrefix','assert',`let nextHold=hold,nextLoss=loss;const holds=new Set();${hop};return ${nodes[0]}`)
 const handler=construct(https,originalInternalSharePolicy,observations,remember,reply,new URL('https://localhost:18443'),'STRICT_CA_AGENT',{ca:'CA'},Buffer,{timeout(ms){budgets.push(ms);return AbortSignal.timeout(ms)}},{mutable},hold,loss,originalShareProxyErrorCode,originalShareProxyBoundary,originalShareProxyTiming,dropActualCommittedModelReplyPrefix,assert)
 handler(req,res)
 return{req,res,proxy,options,budgets,observations,mutable,bytes:()=>Buffer.concat(chunks),response(status=200,bytes=Buffer.from('{"actual":"upstream"}')){const stream=new PassThrough();stream.statusCode=status;stream.headers={'content-type':'application/json'};upstreamCallback(stream);stream.end(bytes);return stream}}
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
test('an armed post-record flag never promotes an upstream ECONNRESET to a verified prefix loss',()=>{
 for(const loss of [null,{recorded:true,after_business_before:0,drops_before:0}]){const p=proxyModel({loss,mutable:{dropNext:null,actualReplyDrops:1,completedAfterBusinessCreates:1}});p.proxy.emit('error',Object.assign(Error('actual transport disconnect'),{code:'ECONNRESET'}));assert.equal(p.observations.controlled_after_record_disconnects,0);assert.equal(p.observations.unexpected_api_failures.length,1);assert.equal(p.req.socket.destroyed,undefined)}
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
 assert(source.indexOf('requireOriginalInternalShareBrowserCi(env)')<source.indexOf("import('node:fs')"));assert(source.includes('fixture=await agentInternalShareGenuineFixture(env,{browserMode:true})'));assert(source.includes("['rev-parse','HEAD']"));assert(source.includes('Object.entries(originalInternalShareReviewedSources)'))
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
 const story=read('tests/pg-original-internal-share-genuine.spec.mjs'),start=story.indexOf('copyAudit=await f.assertRecipientOwnsUnboundCopy()'),shot=story.indexOf('const redeemedImage=await page.screenshot({fullPage:true})'),end=story.indexOf("await logout(page,'bob')",start)
 assert(start>=0&&shot>start&&end>shot);const block=story.slice(start,shot)
 for(const exact of ["await settled(page)","code_absent:(await page.locator('p.font-mono').count())===0","redeem_input_empty:(await page.getByLabel('一次性分享码',{exact:true}).inputValue())===''","password_absent:(await page.getByLabel('密码',{exact:true}).count())===0","await expect(page.getByRole('alert')).toHaveCount(0)","await expect(page.getByText('领取成功',{exact:true})).toBeVisible()"])assert(block.includes(exact),exact)
 assert(!story.includes('.toHaveValue('));assert(!story.includes("expect(page.locator('p.font-mono')).toHaveCount("))
 const begin=block.indexOf('await expect.poll(async()=>({')+'await expect.poll(async()=>({'.length,finish=block.indexOf("}),{message:'synthetic screenshot",begin);assert(begin>0&&finish>begin)
 const inspect=Function('page','return async()=>({'+block.slice(begin,finish)+'})')({locator:()=>({count:async()=>1}),getByLabel:()=>({inputValue:async()=>'PRIVATE_CODE_NOT_LOGGED',count:async()=>0})})
 return inspect().then(observed=>{assert.deepEqual(observed,{code_absent:false,redeem_input_empty:false,password_absent:true});assert.equal(story.split('await page.screenshot(').length,2);assert(!story.includes('screenshot({path:'));const closed=story.indexOf("await clean('owned_fixture'"),zero=story.indexOf("await clean('final_zero_after_cleanup'"),write=story.indexOf('if(completed&&!primary&&!testInfo.errors.length&&!cleanup.length)for(const image of images)');assert(closed>shot&&zero>closed&&write>zero);assert(story.includes('image.bytes.fill(0)'));assert(story.includes("bytes.length>1048576"));assert(story.includes('await observer.flush(switcher)'));const workflow=read('.github/workflows/pg18-internal-share-genuine-ci.yml');assert(workflow.includes('original-internal-share-browser-results/**/original-internal-share-bob-redeemed.png'));assert(workflow.includes("if: always() && matrix.story == 'original-internal-share'"))})
})
test('workflow keeps reference story and creates independent original story service with step-only purpose',()=>{
 const text=read('.github/workflows/pg18-internal-share-genuine-ci.yml');assert(text.includes('story: [reference, original-internal-share]'));assert(text.includes("if: matrix.story == 'reference'"));assert(text.includes('tests/pg-native-internal-share-genuine.config.mjs'));assert(text.includes('tests/pg-original-internal-share-genuine.config.mjs'))
 assert.equal(text.split('AGENT_STUDIO_ORIGINAL_INTERNAL_SHARE_CI:').length,2);assert(text.includes("AGENT_STUDIO_ORIGINAL_INTERNAL_SHARE_EXPECTED_HEAD: '${{ github.sha }}'"));assert(!/GITHUB_JOB\s*[:=]/.test(text))
})

// v65 source-only: actual parsed callbacks, closed metadata and memory sinks.
const armed=()=>({recorded:true,after_business_before:0,drops_before:0}),completed=()=>({dropNext:null,actualReplyDrops:1,completedAfterBusinessCreates:1}),transport=code=>Object.assign(Error('synthetic private text must never enter metadata'),{code}),turn=()=>new Promise(resolve=>setImmediate(resolve))
test('proxy codes use only own data descriptors and a closed Node whitelist',()=>{
 for(const code of ['ABORT_ERR','ECONNRESET','ECONNREFUSED','ETIMEDOUT','EPIPE','EHOSTUNREACH','ENETUNREACH','ENOTFOUND','EAI_AGAIN','ERR_SOCKET_CLOSED','ERR_STREAM_PREMATURE_CLOSE'])assert.equal(originalShareProxyErrorCode(transport(code)),code)
 for(const value of [null,undefined,'ABORT_ERR',{},transport('42501'),transport('PRIVATE_DSN'),Object.create({code:'ECONNRESET'}),{code:Symbol('private')}])assert.equal(originalShareProxyErrorCode(value),null)
 let touched=0;const value={get code(){touched++;throw Error('private getter')}};assert.equal(originalShareProxyErrorCode(value),null);assert.equal(touched,0)
 assert.equal(originalShareProxyErrorCode(new Proxy({},{getOwnPropertyDescriptor(){throw Error('private trap')}})),null)
})
test('boundary records are frozen closed data without message stack cause SQL or body',()=>{
 let touched=0;const error={code:'ABORT_ERR',get message(){touched++;throw Error()},get stack(){touched++;throw Error()},get cause(){touched++;throw Error()},sql:'PRIVATE_SQL',body:'PRIVATE_BODY',dsn:'PRIVATE_DSN'},state={upstream_status:503,after_business_completed:true,drop_selected:true,actual_drop_completed:false,controlled_drop_consumed:false}
 const data=originalShareProxyBoundary('proxy_transport_error',error,state);assert.deepEqual(data,{source:'proxy_transport_error',node_error_code:'ABORT_ERR',upstream_status:503,after_business_completed:true,drop_selected:true,actual_drop_completed:false,controlled_drop_consumed:false});assert.ok(Object.isFrozen(data));assert.equal(touched,0);assert.doesNotMatch(JSON.stringify(data),/PRIVATE|message|stack|cause|sql|body|dsn/)
 assert.equal(originalShareProxyBoundary('foreign',error,state),null);assert.equal(originalShareProxyBoundary('native_http_response',error,state).node_error_code,null)
 const hostile={get upstream_status(){touched++;return 503},get after_business_completed(){touched++;return true}};assert.equal(originalShareProxyBoundary('proxy_transport_error',{},hostile).upstream_status,null);assert.equal(originalShareProxyBoundary('proxy_transport_error',{},hostile).after_business_completed,false);assert.equal(touched,0)
 for(const status of [null,NaN,99,600,'503',Infinity])assert.equal(originalShareProxyBoundary('native_http_response',null,{upstream_status:status}).upstream_status,null)
})
test('actual upstream503 retains its exact status bytes and unexpected failure with native source',async()=>{
 const p=proxyModel({loss:armed()}),bytes=Buffer.from('{"error":"actual_upstream_failure"}');p.response(503,bytes);await turn()
 assert.equal(p.res.status,503);assert.deepEqual(p.bytes(),bytes);assert.equal(p.observations.unexpected_api_failures.length,1);assert.equal(p.observations.controlled_after_record_disconnects,0)
 assert.deepEqual(p.observations.write_boundaries,[{source:'native_http_response',node_error_code:null,upstream_status:503,after_business_completed:false,drop_selected:true,actual_drop_completed:false,controlled_drop_consumed:false}])
})
test('proxy timeout reports transport provenance and never consumes the armed drop',()=>{
 const p=proxyModel({loss:armed()}),error=Object.freeze(transport('ABORT_ERR')),descriptor=Object.getOwnPropertyDescriptor(error,'code');p.proxy.emit('error',error)
 assert.equal(p.res.status,503);assert.equal(p.observations.unexpected_api_failures.length,1);assert.equal(p.observations.controlled_after_record_disconnects,0);assert.equal(p.req.socket.destroyed,undefined);assert.deepEqual(Object.getOwnPropertyDescriptor(error,'code'),descriptor)
 assert.deepEqual(p.observations.write_boundaries,[{source:'proxy_transport_error',node_error_code:'ABORT_ERR',upstream_status:null,after_business_completed:false,drop_selected:true,actual_drop_completed:false,controlled_drop_consumed:false}])
})
test('even completed business and a real drop cannot turn timeout or another transport code into controlled ACK loss',()=>{
 for(const code of ['ABORT_ERR','ETIMEDOUT','EPIPE','ECONNREFUSED','PRIVATE_UNKNOWN',undefined]){
  const p=proxyModel({loss:armed(),mutable:completed()});p.proxy.emit('error',transport(code));assert.equal(p.res.status,503);assert.equal(p.observations.unexpected_api_failures.length,1);assert.equal(p.observations.controlled_after_record_disconnects,0);assert.equal(p.observations.write_boundaries[0].controlled_drop_consumed,false)
 }
})
test('selected null drop and early callback flag alone never prove afterBusiness completion or real destruction',()=>{
 for(const mutable of [{...completed(),completedAfterBusinessCreates:0},{...completed(),actualReplyDrops:0},{...completed(),dropNext:{}},{...completed(),completedAfterBusinessCreates:2},{...completed(),actualReplyDrops:2}]){
  const p=proxyModel({loss:armed(),mutable});p.proxy.emit('error',transport('ECONNRESET'));assert.equal(p.res.status,503);assert.equal(p.observations.unexpected_api_failures.length,1);assert.equal(p.observations.controlled_after_record_disconnects,0);assert.equal(p.observations.write_boundaries[0].controlled_drop_consumed,false)
 }
})
test('completed business plus an upstream reset still lacks a complete verified HTTP200 and actual prefix write callback',()=>{
 const p=proxyModel({loss:armed(),mutable:completed()});p.proxy.emit('error',transport('ECONNRESET'));assert.equal(p.observations.controlled_after_record_disconnects,0);assert.equal(p.req.socket.destroyed,undefined);assert.equal(p.res.status,503);assert.equal(p.observations.unexpected_api_failures.length,1);assert.equal(p.observations.write_boundaries[0].controlled_drop_consumed,false)
})

test('observed non200 upstream and late200 transport errors remain unexpected',async()=>{
 const failed=proxyModel({loss:armed(),mutable:completed()});failed.response(503);await turn();failed.proxy.emit('error',transport('ECONNRESET'));assert.equal(failed.observations.controlled_after_record_disconnects,0);assert.equal(failed.observations.unexpected_api_failures.length,1);assert.equal(failed.observations.write_boundaries.at(-1).upstream_status,503)
 const late=proxyModel({loss:armed(),mutable:completed()});late.response(200);await turn();late.proxy.emit('error',transport('EPIPE'));assert.equal(late.observations.controlled_after_record_disconnects,0);assert.equal(late.observations.unexpected_api_failures.length,1);assert.equal(late.observations.unexpected_api_failures[0].status,503)
})
test('optional diagnostic failure cannot replace upstream status or suppress the original unexpected proxy failure',async()=>{
 const upstream=proxyModel({loss:armed(),throwDiagnostic:true}),bytes=Buffer.from('synthetic actual upstream bytes');upstream.response(503,bytes);await turn();assert.equal(upstream.res.status,503);assert.deepEqual(upstream.bytes(),bytes);assert.equal(upstream.observations.unexpected_api_failures.length,1)
 const failed=proxyModel({loss:armed(),throwDiagnostic:true}),error=transport('ABORT_ERR');assert.doesNotThrow(()=>failed.proxy.emit('error',error));assert.equal(failed.res.status,503);assert.equal(failed.observations.unexpected_api_failures.length,1)
})
const backendSource=read('services/pg-api/tests/helpers/agent-internal-share-genuine-fixture.mjs'),backendTree=ts.createSourceFile('backend.mjs',backendSource,ts.ScriptTarget.Latest,true)
function actualAssignment(left){let body;const visit=node=>{if(ts.isBinaryExpression(node)&&node.left.getText(backendTree)===left){assert.equal(body,undefined);body=node.right.getText(backendTree)}ts.forEachChild(node,visit)};visit(backendTree);assert.ok(body);return body}
const observedOperation=(product,mutable,operation='record',browserMode=true)=>Function('product','events','mutable','browserMode','operation','let completedAction=null;return ('+actualAssignment('observed[operation]')+')')(product,[],mutable,browserMode,operation)
test('actual fixture completion counter changes only after the awaited afterBusiness callback resolves',async()=>{
 let release,entered=false;const waited=new Promise(resolve=>{release=resolve}),mutable={completedAfterBusinessCreates:0,afterBusiness:async()=>{entered=true;await waited}},value=Object.freeze({synthetic_result:true}),record=observedOperation({record:async()=>value},mutable)
 const pending=record({synthetic_identity:true},{action:'create'});await turn();assert.equal(entered,true);assert.equal(mutable.completedAfterBusinessCreates,0);release();assert.equal(await pending,value);assert.equal(mutable.completedAfterBusinessCreates,1)
})
test('actual fixture wrapper preserves original rejection objects and does not invent completion',async()=>{
 const primary=Object.freeze(Error('synthetic primary object')),mutable={completedAfterBusinessCreates:0,afterBusiness:async()=>{throw primary}},record=observedOperation({record:async()=>({})},mutable);await assert.rejects(record({}, {action:'create'}),error=>error===primary);assert.equal(mutable.completedAfterBusinessCreates,0)
 let invoked=false;mutable.afterBusiness=async()=>{invoked=true};const productError=Object.freeze(Error('synthetic product error'));await assert.rejects(observedOperation({record:async()=>{throw productError}},mutable)({}, {action:'create'}),error=>error===productError);assert.equal(invoked,false);assert.equal(mutable.completedAfterBusinessCreates,0)
 await observedOperation({record:async()=>({})},mutable)({}, {action:'revoke'});await observedOperation({record:async()=>({})},mutable,'record',false)({}, {action:'create'});assert.equal(mutable.completedAfterBusinessCreates,0)
})
test('actual drop counter requires200 successful destroy and destroyed true while non200 forwarding stays exact',()=>{
 const body=actualAssignment('res.end'),make=(mutable,original,browserMode=true)=>{const drop={action:'create'};mutable.dropNext=drop;return Function('mutable','original','browserMode','completedAction','drop','elapsed','return ('+body+')')(mutable,original,browserMode,'create',drop,()=>0)},mutable={actualReplyDrops:0};let sent
 const original=function(...args){sent={self:this,args};return 'original-result'},fn=make(mutable,original),success={statusCode:200,destroy(){this.destroyed=true}};assert.equal(fn.call(success,'private bytes'),success);assert.equal(mutable.actualReplyDrops,1);assert.equal(sent,undefined)
 const failed={statusCode:503},bytes=Buffer.from('unchanged');assert.equal(fn.call(failed,bytes),'original-result');assert.equal(sent.self,failed);assert.equal(sent.args[0],bytes);assert.equal(mutable.actualReplyDrops,1)
 make(mutable,original).call({statusCode:200,destroy(){}},'');assert.equal(mutable.actualReplyDrops,1);const error=Object.freeze(Error('synthetic destroy failure'));assert.throws(()=>make(mutable,original).call({statusCode:200,destroy(){throw error}}),value=>value===error);assert.equal(mutable.actualReplyDrops,1)
 make(mutable,original,false).call({statusCode:200,destroy(){this.destroyed=true}},'');assert.equal(mutable.actualReplyDrops,1)
 const story=read('tests/pg-original-internal-share-genuine.spec.mjs');for(const exact of ['expect(ledger.receipts-before.receipts).toBe(5)','expect(after.receipts-before.receipts).toBe(7)','expect.soft(f.observations.unexpected_api_failures).toEqual([])','expect(f.observations.controlled_after_record_disconnects).toBe(1)','if(primary)throw primary'])assert.ok(story.includes(exact),exact);assert.ok(source.includes('proxySignal=AbortSignal.timeout(8000)')&&source.includes('signal:proxySignal'));assert.ok(source.includes('dropActualCommittedModelReplyPrefix({req,res,status:response.statusCode,expectedStatus:200'));assert.ok(!source.includes("ErrorCode(error)==='ECONNRESET'"))
})
test('a late real preview on the shared POST route cannot consume the browser post-create reply loss',async()=>{
 const drop={action:'create'},mutable={dropNext:drop,actualReplyDrops:0,completedAfterBusinessCreates:0,afterBusiness:async()=>{}},sent=[],original=function(...args){sent.push(args);return 'actual-forwarded'}
 const bind=(product,operation)=>Function('product','operation','mutable','events','browserMode','drop','original','elapsed','let completedAction=null;return{work:('+actualAssignment('observed[operation]')+'),end:('+actualAssignment('res.end')+')}')(product,operation,mutable,[],true,drop,original,()=>0)
 const preview=bind({preview:async()=>({data_only:true})},'preview');await preview.work({},'owned-spec');const previewResponse={statusCode:200,destroy(){assert.fail('a preview is not a committed create')}};assert.equal(preview.end.call(previewResponse,'actual preview bytes'),'actual-forwarded');assert.equal(mutable.dropNext,drop);assert.equal(mutable.completedAfterBusinessCreates,0);assert.equal(mutable.actualReplyDrops,0);assert.deepEqual(sent,[['actual preview bytes']])
 const create=bind({record:async()=>({data_only:true})},'record');await create.work({}, {action:'create'});assert.equal(mutable.completedAfterBusinessCreates,1);const response={statusCode:200,destroy(){this.destroyed=true}};assert.equal(create.end.call(response,'actual once-visible reply'),response);assert.equal(mutable.dropNext,null);assert.equal(mutable.actualReplyDrops,1);assert.deepEqual(sent,[['actual preview bytes']])
 const oldCount=mutable.actualReplyDrops;assert.equal(create.end.call(response,'duplicate end forwards'),'actual-forwarded');assert.equal(mutable.actualReplyDrops,oldCount)
})

test('original proxy timing distinguishes client abort/close from own deadline without classifying it as a committed drop',()=>{
 const p=proxyModel({loss:armed()});p.req.emit('aborted');p.res.emit('close');p.proxy.emit('error',transport('ECONNRESET'))
 assert.equal(p.observations.controlled_after_record_disconnects,0);assert.equal(p.observations.unexpected_api_failures.length,1)
 const t=p.observations.write_timings[0];assert.equal(t.source,'proxy_transport_error');assert(Number.isSafeInteger(t.elapsed_ms)&&t.elapsed_ms>=0&&t.elapsed_ms<=60000);assert.equal(t.proxy_deadline_expired,false);assert.equal(t.client_request_aborted,true);assert.equal(t.client_response_closed,true);assert.equal(t.qualifies_run,false)
})
test('lost ACK story waits for the actual exact POST failure before asserting a committed receipt',()=>{
 const text=read('tests/pg-original-internal-share-genuine.spec.mjs'),ast=ts.createSourceFile('story.mjs',text,ts.ScriptTarget.Latest,true),found=[]
 function scan(n){if(ts.isCallExpression(n)&&n.expression.getText(ast)==='page.waitForEvent'&&n.arguments[0]?.text==='requestfailed')found.push(n);ts.forEachChild(n,scan)}scan(ast);assert.equal(found.length,1)
 const call=found[0].getText(ast);for(const s of ["url.origin===f.origin","url.pathname==='/__pg_native/api/v2/internal-templates'","request.method()==='POST'",'timeout:8000'])assert(call.includes(s))
 const armed=text.indexOf('const failedCreate='),trigger=text.indexOf('f.dropNextActualCreateReply()',armed),wait=text.indexOf('await failedCreate',trigger),actualDrop=text.indexOf('f.observations.controlled_after_record_disconnects',wait),ledger=text.indexOf('const ledger=await f.counts()',actualDrop)
 assert(armed>=0&&armed<trigger&&trigger<wait&&wait<actualDrop&&actualDrop<ledger);assert(text.slice(ledger,ledger+110).includes('toBe(5)'))
})
test('transport timing is closed bounded getter-free observation and cannot authorize or inspect request/secret contents',()=>{
 let touched=0;const state={elapsed_ms:8001,proxy_deadline_expired:true,client_request_aborted:false,client_response_closed:true,get secret(){touched++;throw Error('PRIVATE')}};const t=originalShareProxyTiming('proxy_transport_error',state);assert.deepEqual(t,{source:'proxy_transport_error',elapsed_ms:8001,proxy_deadline_expired:true,client_request_aborted:false,client_response_closed:true,observed_data_only:true,runtime_authorization:false,qualifies_run:false,production_GO:false});assert(Object.isFrozen(t));assert.equal(touched,0);for(const value of [-1,60001,NaN,Infinity,'8000',null])assert.equal(originalShareProxyTiming('proxy_transport_error',{elapsed_ms:value}),null);assert.equal(originalShareProxyTiming('foreign',{elapsed_ms:1}),null);assert.equal(originalShareProxyTiming('proxy_transport_error',{get elapsed_ms(){touched++;return 1}}),null);assert.equal(touched,0)
})
