// Pure transport/auth Cookie/Origin code; facade import is an isolated branded
// scalar model. No H3/SQL/IPC/runtime authority or listener is exercised.
import test,{after} from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath,pathToFileURL} from 'node:url'
import {createHash} from 'node:crypto'
import {registerHooks,createRequire} from 'node:module'
import {IncomingMessage} from 'node:http'
import {Socket} from 'node:net'
import {NATIVE_SESSION_COOKIE,generateOpaqueSession} from '../src/native-employee-auth.mjs'
import {createUnknownWorkerHeartbeatSnapshot} from '../src/worker-heartbeat-contract.ts'
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..'),directory=path.join(root,'.tmp','pg-migration-completion')
fs.mkdirSync(directory,{recursive:true})
const temporary=fs.mkdtempSync(path.join(directory,'native-heartbeats-http-pure-'))
const source=path.join(root,'services/pg-api/src/native-company-worker-heartbeats-http.ts')
const localGuard=path.join(root,'services/pg-api/src/native-current-company-admin.mjs')
const guard=fs.existsSync(localGuard)?localGuard:process.env.NATIVE_HEARTBEATS_HTTP_TEST_CANONICAL_GUARD
assert.ok(typeof guard==='string'&&path.isAbsolute(guard),'canonical Native guard required; no production stub')
assert.equal(createHash('sha256').update(fs.readFileSync(guard)).digest('hex'),'83fc4c1d49f3805fd0439e3e4d6a1f093bfed8556940179220e1deeafc2ea889')
const origin='https://studio.example.test',token=generateOpaqueSession().token
const snapshot=createUnknownWorkerHeartbeatSnapshot('2026-10-29T00:00:00.000Z'),model=path.join(temporary,'facade-model.mjs')
fs.writeFileSync(model,[
 'export let constructed=0;',
 'export class NativeCompanyWorkerHeartbeats {',
 ' #brand=true;calls=[];queue=[];constructor(){constructed++}',
 ' localStatus(){if(!this.#brand)throw Error("brand");return Object.freeze({inFlight:0,timedOut:0,cleanupUnknown:0})}',
 ' async read(cookie){if(!this.#brand)throw Error("brand");this.calls.push(cookie);const next=this.queue.shift();if(!next)throw Error("PRIVATE_EMPTY");if(next.error)throw next.error;if(next.gate)await next.gate;return next.value}',
 '}'
].join('\n'))
const sourceURL=pathToFileURL(source).href,modelURL=pathToFileURL(model).href,guardURL=pathToFileURL(guard).href
const authURL=new URL('../src/native-auth-http.mjs',import.meta.url).href
const authCandidate=process.env.NATIVE_HEARTBEATS_HTTP_TEST_AUTH_CANDIDATE
const hooks=registerHooks({resolve(specifier,context,next){
 if(context.parentURL===sourceURL){
  if(specifier==='./native-company-worker-heartbeats.ts')return {url:modelURL,shortCircuit:true}
  if(specifier==='./native-current-company-admin.mjs')return {url:guardURL,shortCircuit:true}
 }
 return next(specifier,context)
},load(url,context,next){
 if(url===authURL&&authCandidate)return {format:'module',source:fs.readFileSync(authCandidate,'utf8'),shortCircuit:true}
 return next(url,context)
}})
const {createNativeAuthHttpHandler}=await import(authURL)
const {NativeCompanyWorkerHeartbeats}=await import(modelURL)
const {NativeCompanyAdminError}=await import(guardURL)
const {createNativeCompanyWorkerHeartbeatsHttpHandler:create,selectNativeCompanyWorkerHeartbeatsHttp:select,nativeCompanyWorkerHeartbeatsRoute:route}=await import(sourceURL)
after(()=>{
 hooks.deregister()
 const resolved=path.resolve(temporary);assert.equal(path.dirname(resolved),fs.realpathSync(directory));assert.match(path.basename(resolved),/^native-heartbeats-http-pure-/)
 assert.equal(fs.lstatSync(resolved).isSymbolicLink(),false);assert.equal(fs.realpathSync(resolved),resolved)
 fs.rmSync(resolved,{recursive:true,force:true})
})
function fixture({enabled=true,admin=true}={}){
 const component=new NativeCompanyWorkerHeartbeats(),reads=create({component,allowedOrigin:origin,enabled});let fallback=0
 const auth={async login(){throw Error('unused')},async provisionEmployee(){throw Error('unused')},async revokeSession(){},
  async verifySession(){throw Error('no external fresh identity context')},
  async getSessionProfile(raw){return raw===token?{id:'00000000-0000-4000-8000-000000000001',email:'synthetic@example.test',display_name:'Synthetic',is_admin:admin}:null}}
 const native=createNativeAuthHttpHandler({auth,allowedOrigin:origin,allowCompanyWorkerHeartbeats:enabled,businessHandler:async(req,res)=>{
  if(await reads(req,res))return;fallback++;res.writeHead(404,{});res.end(JSON.stringify({error:'fallback'}))
 }})
 async function call(url=route,options={}){
  const socket=new Socket(),req=new IncomingMessage(socket);socket.on('error',()=>{});req.on('error',()=>{})
  Object.assign(req,{url,method:options.method??'GET',complete:true,headers:{origin,cookie:NATIVE_SESSION_COOKIE+'='+token,...options.headers}})
  for(const chunk of options.body??[])req.push(Buffer.from(chunk));req.push(null)
  const res={status:0,headers:{},body:null,destroyed:false,writableEnded:false,headersSent:false,
   writeHead(status,headers){this.status=status;this.headers=headers;this.headersSent=true},end(body){this.body=JSON.parse(body);this.writableEnded=true}}
  try{await native.handler(req,res);return res}finally{req.destroy();socket.destroy()}
 }
 return {component,call,fallback:()=>fallback}
}
test('pure boundary: exact GET uses original Cookie, captured method and one shared facade',async()=>{
 const f=fixture(),before=(await import(modelURL)).constructed
 f.component.queue.push({value:snapshot},{value:snapshot});f.component.read=()=>{throw Error('own replacement')}
 assert.deepEqual((await f.call()).body,snapshot);assert.equal((await f.call()).status,200)
 assert.deepEqual(f.component.calls,[token,token]);assert.equal((await import(modelURL)).constructed,before);assert.equal(f.fallback(),0)
})
test('pure boundary: Cookie failures and alternative identity headers start no reads',async()=>{
 for(const headers of [{cookie:undefined},{cookie:NATIVE_SESSION_COOKIE+'=bad'},{cookie:NATIVE_SESSION_COOKIE+'='+token+'; '+NATIVE_SESSION_COOKIE+'='+token},
  {authorization:'Bearer PRIVATE'},{'x-rh-user-id':'admin'},{'x-agentstudio-user-id':'admin'},{'x-forwarded-user':'admin'},{'x-forwarded-email':'private@example.test'}]){
  const f=fixture(),r=await f.call(undefined,{headers});assert.equal(r.status,401);assert.deepEqual(r.body,{error:'session_required'});assert.equal(f.component.calls.length,0)
 }
})
test('pure boundary: Origin/fetch-site refusal exposes only fixed 403',async()=>{
 for(const headers of [{origin:'https://foreign.example.test'},{origin:[origin]},{'sec-fetch-site':'cross-site'},{'sec-fetch-site':'same-site'}]){
  const f=fixture(),r=await f.call(undefined,{headers});assert.equal(r.status,403);assert.deepEqual(r.body,{error:'admin_required'});assert.equal(f.component.calls.length,0)
 }
})
test('pure boundary: default off, framed bodies and buffered bytes do not start reads',async()=>{
 const r=await fixture({enabled:false}).call();assert.equal(r.status,503)
 const component=new NativeCompanyWorkerHeartbeats();assert.equal(typeof create({component,allowedOrigin:origin}),'function')
 for(const options of [{headers:{'content-length':'1'}},{headers:{'content-length':['0']}},{headers:{'transfer-encoding':'chunked'}},{headers:{expect:'100-continue'}},{headers:{trailer:'x-private'}},{body:['unexpected']}]){
  const f=fixture(),response=await f.call(undefined,options);assert.equal(response.status,503);assert.equal(f.component.calls.length,0)
 }
})
test('pure boundary: unsupported methods and URI aliases never read or fall through',async()=>{
 for(const method of ['POST','PUT','PATCH','DELETE','HEAD','OPTIONS']){const f=fixture();assert.equal((await f.call(undefined,{method})).status,503);assert.equal(f.component.calls.length,0);assert.equal(f.fallback(),0)}
 for(const url of [route+'?',route+'?owner=admin',route+'?generation=1',route+'/',route+'/activate','/api/v2/%63ompany-worker-heartbeats','/api/v2/x/../company-worker-heartbeats',origin+route,route+'#fragment']){
  const f=fixture();assert.equal((await f.call(url)).status,503,url);assert.equal(f.component.calls.length,0);assert.equal(f.fallback(),0)
 }
 const f=fixture();assert.equal((await f.call('/api/v2/agent-specs')).status,404);assert.equal(f.fallback(),1)
})
test('pure boundary: only actual Native error class and exact 401/403 pairs survive',async()=>{
 let getters=0;const getter=new NativeCompanyAdminError(401,'session_required');Object.defineProperty(getter,'status',{get(){getters++;throw Error('PRIVATE')}})
 for(const [error,status,code]of [
  [new NativeCompanyAdminError(401,'session_required'),401,'session_required'],[new NativeCompanyAdminError(403,'admin_required'),403,'admin_required'],
  [new NativeCompanyAdminError(503,'PRIVATE'),503,'company_worker_heartbeats_unavailable'],[new NativeCompanyAdminError(401,'admin_required'),503,'company_worker_heartbeats_unavailable'],
  [{status:401,code:'session_required',message:'PRIVATE'},503,'company_worker_heartbeats_unavailable'],[Error('PRIVATE_SQL_PASSWORD'),503,'company_worker_heartbeats_unavailable'],[getter,503,'company_worker_heartbeats_unavailable']]){
  const f=fixture();f.component.queue.push({error});const r=await f.call();assert.equal(r.status,status);assert.deepEqual(r.body,{error:code})
 }
 assert.equal(getters,0)
})
test('pure boundary: bad projections become fixed 503 with exactly one read and no retry',async()=>{
 for(const value of [{...snapshot,workers:snapshot.workers.slice(0,7)},{...snapshot,secret:'PRIVATE'},{status:200,body:snapshot}]){
  const f=fixture();f.component.queue.push({value});const r=await f.call();assert.equal(r.status,503);assert.deepEqual(r.body,{error:'company_worker_heartbeats_unavailable'});assert.equal(f.component.calls.length,1)
 }
})
test('pure boundary: concurrent HTTP calls share the same facade',async()=>{
 let release;const gate=new Promise(yes=>{release=yes}),f=fixture(),before=(await import(modelURL)).constructed
 f.component.queue.push({value:snapshot,gate},{value:snapshot,gate})
 const a=f.call(),b=f.call();await Promise.resolve();assert.equal(f.component.calls.length,2);assert.equal((await import(modelURL)).constructed,before)
 release();assert.equal((await a).status,200);assert.equal((await b).status,200)
})
test('pure boundary: factory rejects adapters, prototype clones, proxies, getters and extra target/pool/clock options',()=>{
 const component=new NativeCompanyWorkerHeartbeats()
 for(const options of [{component:{read(){}},allowedOrigin:origin},{component:Object.create(NativeCompanyWorkerHeartbeats.prototype),allowedOrigin:origin},{component:new Proxy(component,{}),allowedOrigin:origin},
  {component,allowedOrigin:origin,clock:()=>0},{component,allowedOrigin:origin,pool:{}},{component,allowedOrigin:origin,target:'arbitrary'},{component,allowedOrigin:origin,enabled:null},{component,allowedOrigin:origin+'/path'}])
  assert.throws(()=>create(options),/invalid_native_company_worker_heartbeats_http_dependencies/)
 let reads=0;assert.throws(()=>create({component,allowedOrigin:origin,get enabled(){reads++;return true}}),/invalid_native_company_worker_heartbeats_http_dependencies/);assert.equal(reads,0)
})
test('pure boundary: success/refusals have private no-store headers without CORS, redirect or Set-Cookie',async()=>{
 const f=fixture();f.component.queue.push({value:snapshot})
 for(const r of [await f.call(),await f.call(undefined,{headers:{cookie:undefined}}),await f.call(route+'?x=1')]){
  for(const [key,value]of Object.entries({'Cache-Control':'no-store',Pragma:'no-cache','Referrer-Policy':'no-referrer','Cross-Origin-Resource-Policy':'same-origin','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY'}))assert.equal(r.headers[key],value)
  for(const key of ['Access-Control-Allow-Origin','Location','Set-Cookie'])assert.equal(r.headers[key],undefined)
 }
})
test('pure boundary: capability hint is admin-only and omitted when disabled',async()=>{
 for(const [enabled,admin,expected]of [[false,true,false],[true,false,false],[true,true,true]]){
  const f=fixture({enabled,admin}),r=await f.call('/api/native-auth/capabilities');assert.equal(r.status,200);assert.equal(Object.hasOwn(r.body,'company_worker_heartbeats_available'),expected);assert.equal(f.component.calls.length,0)
 }
})
test('pure configuration: default off and preflight/unreviewed/insecure/invalid selections refuse without host simulation',()=>{
 assert.equal(select({},false,origin),false);assert.equal(select({AGENT_STUDIO_PG_NATIVE_COMPANY_WORKER_HEARTBEATS_READ_ENABLED:'false'},true,origin),false)
 for(const flag of ['','TRUE','1','yes','true'])assert.throws(()=>select({AGENT_STUDIO_PG_NATIVE_COMPANY_WORKER_HEARTBEATS_READ_ENABLED:flag},true,origin),/configuration_refused/)
 const env={AGENT_STUDIO_PG_NATIVE_COMPANY_WORKER_HEARTBEATS_READ_ENABLED:'true',AGENT_STUDIO_PG_NATIVE_COMPANY_WORKER_HEARTBEATS_REVIEWED:'true',AGENT_STUDIO_PG_NATIVE_PILOT_ENABLED:'true',AGENT_STUDIO_PG_NATIVE_REVIEWED:'true'}
 assert.throws(()=>select(env,false,origin),/configuration_refused/);assert.throws(()=>select(env,true,'http://127.0.0.1'),/configuration_refused/)
 if(process.platform!=='linux'||process.getuid?.()===undefined||process.getuid()<=0)assert.throws(()=>select(env,true,origin),/configuration_refused/)
})
test('production wiring: one real auth-pool facade, destroy flag forwarded, original fallback policy and no HTTP driver/control adapter',()=>{
 const require=createRequire(new URL('../package.json',import.meta.url));let ts
 try{ts=require('typescript')}catch{assert.ok(process.env.NATIVE_HEARTBEATS_HTTP_TEST_TYPESCRIPT);ts=require(process.env.NATIVE_HEARTBEATS_HTTP_TEST_TYPESCRIPT)}
 const server=fs.readFileSync(process.env.NATIVE_HEARTBEATS_HTTP_TEST_SERVER_CANDIDATE??path.join(root,'services/pg-api/src/native-server.ts'),'utf8'),tree=ts.createSourceFile('native-server.ts',server,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS),constructors=[]
 function visit(n){if(ts.isNewExpression(n)&&n.expression.getText()==='NativeCompanyWorkerHeartbeats')constructors.push(n.getText());ts.forEachChild(n,visit)}visit(tree)
 assert.deepEqual(constructors,['new NativeCompanyWorkerHeartbeats(adapter(authPool))'])
 assert.match(server,/release\(destroy\?:boolean\)\{client\.release\(destroy\)\}/);assert.match(server,/await guardedBusinessHandler\(req,res\)/)
 assert.ok(server.indexOf('createNativeOwnOperationsBusinessHandler({')<server.indexOf('const guardedBusinessHandler=businessHandler'))
 const text=fs.readFileSync(source,'utf8');assert.match(text,/actualRead\.call\(component,cookie\)/)
 const http=ts.createSourceFile('transport.ts',text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS)
 const forbidden=new Set(['Promise.race','setTimeout','Date.now','fetch','connectWorkerHeartbeatReadControl','prepareWorkerHeartbeatSnapshot','finishWorkerHeartbeatSnapshot','sendWorkerHeartbeatOperatorCommand'])
 function inspect(n){
  if(ts.isCallExpression(n)){const name=n.expression.getText();assert.equal(forbidden.has(name)||name.startsWith('console.'),false,name)}
  if(ts.isNewExpression(n))assert.notEqual(n.expression.getText(),'NativeCompanyWorkerHeartbeats')
  if(ts.isImportDeclaration(n))assert.notEqual(n.moduleSpecifier.text,'pg')
  ts.forEachChild(n,inspect)
 }
 inspect(http)
})
