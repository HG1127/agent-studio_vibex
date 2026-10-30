// PURE COMPOSITION ONLY: actual frozen H Native class + synthetic SQL pool,
// test-only controller doubles and virtual monotonic time in an isolated child.
// No database, UDS, authority/currentness, five-second server lease or Worker
// liveness is verified. Stubs/loaders exist only in a uniquely owned temp dir.
import test,{before,after} from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {fileURLToPath,pathToFileURL} from 'node:url'
import {createHash} from 'node:crypto'
import {spawnSync} from 'node:child_process'

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
const source=path.join(root,'services/pg-api/src/native-company-worker-heartbeats.ts')
const local=path.join(root,'services/pg-api/src/native-current-company-admin.mjs')
const guard=fs.existsSync(local)?local:'C:/Users/Administrator/.codex/worktrees/pg18-worker-heartbeat/agent_studio_vibex版本/services/pg-api/src/native-current-company-admin.mjs'
const sha=b=>createHash('sha256').update(b).digest('hex')
const cases=[
 ['idle','construction has no auth/IPC or Worker-ready side effect'],
 ['inert_budget','one private no-I/O budget starts before Native auth and is never renewed'],
 ['success','actual Native context pre/post surrounds prepare; finish/consume returns only original8 values'],
 ['invalid_cookie','malformed cookie401 precedes every controller connection'],
 ['nonadmin','actual Native class403 branch prevents telemetry connection'],
 ['post_revoked','synthetic post-session disappearance denies and cancels only its pending read'],
 ['post_revision','actual Native class revision comparison rejects without finish or replacement context'],
 ['controller_error','Native-shaped controller exceptions still map only to fixed503'],
 ['late_connect','late connected client is closed without preparing or publishing'],
 ['late_prepare','late pending handle is discarded, cancelled and closed without Native post'],
 ['post_still_running','timeout cancels known pending IPC but retains unfinished actual Native post reservation'],
 ['late_finish','late completed handle is not consumed and its own client is closed'],
 ['late_close','valid DTO publishes before deferred close; late ACK releases only its retained slot'],
 ['publish_before_cleanup_effect','publication precedes synchronous cleanup effects that advance time or change policy'],
 ['published_cleanup_reject','late cleanup failure cannot revoke or republish success and keeps its slot unknown'],
 ['unknown_cleanup','published responses never free capacity after cleanup rejection or invent stopped/drained'],
 ['nonsettling_auth','two timed-out Native acquires still occupy both slots until they really settle'],
 ['cancel_pending','unsettled cancel keeps reservation; no duplicate cleanup or close-ACK fiction'],
 ['total_budget','initial auth queue elapsed time is included; no context or lease renewal'],
 ['invalid_dto','malformed consumed values fail the original8-row parser instead of using fallback'],
 ['opaque_client','ordinary completed JSON cannot bypass the controlled client consume boundary'],
 ['reentry','reentrant requests cannot exceed two reservations or reuse another request client'],
]
let temporary,report,realReport
const url=file=>pathToFileURL(file).href

function stateSource(guardURL,authURL,contractURL){return `
import assert from 'node:assert/strict';
import {NativeCurrentCompanyAdmin,NativeCompanyAdminError} from ${JSON.stringify(guardURL)};
import {generateOpaqueSession,hashOpaqueSession,NATIVE_LOCAL_ISSUER} from ${JSON.stringify(authURL)};
import {createUnknownWorkerHeartbeatSnapshot} from ${JSON.stringify(contractURL)};
export const clock={now:0,timers:new Map()};
export function advance(ms){assert.ok(Number.isFinite(ms)&&ms>=0);clock.now+=ms;for(;;){const found=[...clock.timers].filter(([,v])=>v.at<=clock.now).sort((a,b)=>a[1].at-b[1].at)[0];if(!found)break;clock.timers.delete(found[0]);found[1].fn()}}
export function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no});return {promise,resolve,reject}}
export async function spin(check){for(let i=0;i<1500&&!check();i++)await Promise.resolve();assert.equal(check(),true)}
export async function flush(){for(let i=0;i<100;i++)await Promise.resolve()}
let current;const contexts=new WeakMap();
export function reset(config={}){clock.now=0;clock.timers.clear();current={config,trace:[],revision:1,revoked:false,admin:true,cookie:generateOpaqueSession().token,snapshot:createUnknownWorkerHeartbeatSnapshot('2026-10-28T00:00:00.000Z'),clientOrdinal:0};return current}
export function scene(){return current}
const mark=(s,op,data)=>s.trace.push({op,data});
export const count=(s,op)=>s.trace.filter(row=>row.op===op).length;
for(const name of ['authorize','assertBeforeRead','confirmAfterRead']){
 const original=NativeCurrentCompanyAdmin.prototype[name];
 if(name==='authorize')NativeCurrentCompanyAdmin.prototype[name]=async function(cookie){const s=current;mark(s,'auth.authorize');const context=await original.call(this,cookie);contexts.set(context,{s,cookie});mark(s,'auth.context');return context};
 else NativeCurrentCompanyAdmin.prototype[name]=function(cookie,context){const item=contexts.get(context);assert.ok(item);assert.equal(item.cookie,cookie);mark(item.s,name==='assertBeforeRead'?'auth.before':'auth.post',context);return original.call(this,cookie,context)};
}
export function pool(){
 const s=current;let ordinal=0;
 return {async connect(){const n=++ordinal;mark(s,'auth.connect',n);if(s.config.authGate&&(s.config.authAt==='all'||s.config.authAt===n))await s.config.authGate.promise;
  return {async query(sql,values=[]){
   if(sql.startsWith('BEGIN ')||sql.startsWith('SET LOCAL ')||sql==='COMMIT'||sql==='ROLLBACK'){mark(s,'auth.'+sql.split(' ')[0]);return {rows:[]}}
   if(sql.startsWith('SELECT current_user::text AS role,'))return {rows:[{role:'agentstudio_native_auth',login:'agentstudio_native_login',database:'agent_studio',read_only:'on',search_path:'pg_catalog',safe_login:true}]};
   if(sql.startsWith('SELECT c.oid AS id,c.relname AS name'))return {rows:[{id:10,name:'accounts'},{id:11,name:'employee_governance_events'}]};
   if(sql.startsWith('SELECT attname AS name,format_type'))return {rows:[{name:'share_enabled',type:'boolean',required:true,default_value:'true'},{name:'governance_revision',type:'bigint',required:true,default_value:'1'}]};
   if(sql.startsWith('SELECT NOT rolcanlogin')||sql.startsWith("SELECT c.relkind='r'")||sql.startsWith('SELECT count(*)=2')||sql.startsWith('SELECT NOT has_column_privilege'))return {rows:[{ok:true}]};
   if(sql.startsWith('SELECT a.attname AS name,has_column_privilege')){const reads=['id','external_issuer','external_subject','status','display_name','created_at'],inserts=['id','external_issuer','external_subject','display_name','status'];return {rows:reads.map(name=>({name,read:true,insert:inserts.includes(name),update:name==='status'}))}};
   if(sql.startsWith('SELECT a.user_id::text AS user_id,')){
    assert.deepEqual(values,[hashOpaqueSession(s.cookie),NATIVE_LOCAL_ISSUER]);mark(s,'auth.session');
    if(s.config.authEffect)s.config.authEffect(n,s);
    if(s.revoked)return {rows:[]};
    return {rows:[{user_id:'b52c29a2-c099-42c1-a8c0-f950d720784a',external_subject:'synthetic-local-subject',enabled:true,is_admin:s.admin,status:'active',revision:String(s.revision),expires_at:'2099-01-01 00:00:00+00',checked_at:'2026-10-28 00:00:00+00'}]};
   }
   throw Error('unexpected_synthetic_auth_protocol');
  },release(){mark(s,'auth.release')}};
 }};
}
const budgets=new WeakMap(),clients=new WeakMap(),pending=new WeakMap(),completed=new WeakMap();
const opaque=()=>Object.freeze(Object.create(null));
function own(client){const c=clients.get(client);assert.ok(c&&!c.closed);return c}
export function beginBudget(){assert.equal(arguments.length,0);const s=current,token=opaque();budgets.set(token,{s,deadline:clock.now+8000,used:false});mark(s,'client.budget');return token}
export async function connect(budget){assert.equal(arguments.length,1);const b=budgets.get(budget);assert.ok(b&&!b.used&&clock.now<b.deadline);b.used=true;const s=b.s;assert.equal(s,current);mark(s,'client.connect');if(s.config.connectHook){const hook=s.config.connectHook;s.config.connectHook=null;hook()};if(s.config.connectGate)await s.config.connectGate.promise;const client=opaque();clients.set(client,{s,id:++s.clientOrdinal,closed:false,owned:new Set()});mark(s,'client.connected');return client}
export async function prepare(client){assert.equal(arguments.length,1);const c=own(client),s=c.s;mark(s,'client.prepare');if(s.config.prepareError)throw s.config.prepareError;const p=opaque();pending.set(p,{client});c.owned.add(p);if(s.config.prepareEffect)s.config.prepareEffect(s);if(s.config.prepareGate)await s.config.prepareGate.promise;mark(s,'client.prepared');return p}
export async function finish(client,p){assert.equal(arguments.length,2);const c=own(client),s=c.s;assert.equal(pending.get(p)?.client,client);pending.delete(p);c.owned.delete(p);mark(s,'client.finish');if(s.config.finishError)throw s.config.finishError;if(s.config.finishGate)await s.config.finishGate.promise;const done=opaque();completed.set(done,{client,snapshot:s.snapshot});c.owned.add(done);mark(s,'client.finished');return s.config.plainCompleted?{finished:true}:done}
export function consume(client,done){assert.equal(arguments.length,2);const c=own(client),s=c.s;assert.equal(completed.get(done)?.client,client);const snapshot=completed.get(done).snapshot;completed.delete(done);c.owned.delete(done);mark(s,'client.consume');return snapshot}
export async function cancel(client,p){assert.equal(arguments.length,2);const c=own(client),s=c.s;assert.equal(pending.get(p)?.client,client);mark(s,'client.cancel');if(s.config.cancelGate)await s.config.cancelGate.promise;if(s.config.cancelError)throw Error('PRIVATE_CANCEL');pending.delete(p);c.owned.delete(p);mark(s,'client.cancelled')}
export async function close(client){assert.equal(arguments.length,1);const c=clients.get(client);assert.ok(c);const s=c.s;mark(s,'client.close');if(s.config.closeEffect)s.config.closeEffect(s);if(s.config.closeGate)await s.config.closeGate.promise;if(s.config.closeError)throw Error('PRIVATE_CLOSE');for(const value of c.owned){pending.delete(value);completed.delete(value)}c.owned.clear();c.closed=true;mark(s,'client.closed')}
export const nativeError=(status,code)=>new NativeCompanyAdminError(status,code);
export function watch(promise){const observation={state:'pending',settlements:0};promise.then(value=>{observation.settlements++;observation.state='resolved';observation.value=value},error=>{observation.settlements++;observation.state='rejected';observation.error=error});return observation}
export function rejected(observation,status=503){assert.equal(observation.state,'rejected');assert.equal(observation.error.status,status);assert.equal(observation.error.code,status===401?'session_required':status===403?'admin_required':'company_worker_heartbeats_unavailable');assert.equal(String(observation.error).includes('PRIVATE'),false)}
`}

async function runCases(Component,S,A){
 const results=[]
 async function check(id,body){try{await body();results.push({id,passed:true})}catch(error){results.push({id,passed:false,code:typeof error?.code==='string'&&/^[A-Z_]{1,32}$/.test(error.code)?error.code:'pure_case_failed'})}}
 const make=config=>{const s=S.reset(config),r=new Component(S.pool());return {s,r}}
 const wait=S.spin,flush=S.flush
 await check('idle',async()=>{const {s,r}=make();A.deepEqual(r.localStatus(),{inFlight:0,timedOut:0,cleanupUnknown:0});A.equal(s.trace.length,0);A.equal(Object.isFrozen(r.localStatus()),true)})
 await check('inert_budget',async()=>{
  const gate=S.deferred(),{s,r}=make({authGate:gate,authAt:1}),out=S.watch(r.read(s.cookie))
  await wait(()=>S.count(s,'auth.connect')===1)
  A.equal(S.count(s,'client.budget'),1);A.equal(S.count(s,'client.connect'),0)
  const ops=s.trace.map(x=>x.op);A.ok(ops.indexOf('client.budget')<ops.indexOf('auth.authorize'))
  S.advance(7000);gate.resolve();await wait(()=>out.state!=='pending')
  A.equal(out.state,'resolved');A.equal(S.count(s,'client.budget'),1)
  A.equal(S.count(s,'client.connect'),1);A.equal(S.count(s,'auth.context'),1)
  await wait(()=>r.localStatus().inFlight===0)
 })
 await check('success',async()=>{const {s,r}=make(),out=S.watch(r.read(s.cookie));await wait(()=>out.state!=='pending');A.equal(out.state,'resolved');A.equal(out.value.workers.length,8);A.equal(Object.isFrozen(out.value),true);A.equal(S.count(s,'auth.context'),1);A.equal(S.count(s,'auth.post'),1);A.equal(S.count(s,'client.connect'),1);A.equal(S.count(s,'client.consume'),1);A.equal(S.count(s,'client.close'),1);A.equal(S.count(s,'client.cancel'),0);const ops=s.trace.map(x=>x.op);A.ok(ops.indexOf('auth.before')<ops.indexOf('client.connect'));A.ok(ops.indexOf('client.prepared')<ops.indexOf('auth.post'));A.ok(ops.indexOf('auth.post')<ops.indexOf('client.finish'));A.ok(ops.indexOf('client.finished')<ops.indexOf('client.consume'));await wait(()=>r.localStatus().inFlight===0)})
 await check('invalid_cookie',async()=>{const {s,r}=make(),out=S.watch(r.read('browser-JWT-or-X-Rh-User-Id'));await wait(()=>out.state!=='pending');S.rejected(out,401);await flush();A.equal(S.count(s,'auth.connect'),0);A.equal(S.count(s,'client.connect'),0);A.equal(r.localStatus().inFlight,0)})
 await check('nonadmin',async()=>{const {s,r}=make();s.admin=false;const out=S.watch(r.read(s.cookie));await wait(()=>out.state!=='pending');S.rejected(out,403);await flush();A.equal(S.count(s,'client.connect'),0);A.equal(r.localStatus().inFlight,0)})
 await check('post_revoked',async()=>{const {s,r}=make({prepareEffect:s=>{s.revoked=true}}),out=S.watch(r.read(s.cookie));await wait(()=>out.state!=='pending');S.rejected(out,401);await wait(()=>r.localStatus().inFlight===0);A.equal(S.count(s,'auth.context'),1);A.equal(S.count(s,'client.finish'),0);A.equal(S.count(s,'client.consume'),0);A.equal(S.count(s,'client.cancel'),1);A.equal(S.count(s,'client.close'),1)})
 await check('post_revision',async()=>{const {s,r}=make({prepareEffect:s=>{s.revision++}}),out=S.watch(r.read(s.cookie));await wait(()=>out.state!=='pending');S.rejected(out);await wait(()=>r.localStatus().inFlight===0);A.equal(S.count(s,'auth.context'),1);A.equal(S.count(s,'client.finish'),0);A.equal(S.count(s,'client.cancel'),1)})
 await check('controller_error',async()=>{for(const error of [S.nativeError(401,'session_required'),{status:401,code:'session_required',message:'PRIVATE'}]){const {s,r}=make({prepareError:error}),out=S.watch(r.read(s.cookie));await wait(()=>out.state!=='pending');S.rejected(out);await wait(()=>r.localStatus().inFlight===0);A.equal(S.count(s,'client.consume'),0);A.equal(S.count(s,'client.close'),1)}})
 await check('late_connect',async()=>{const gate=S.deferred(),{s,r}=make({connectGate:gate}),out=S.watch(r.read(s.cookie));await wait(()=>S.count(s,'client.connect')===1);S.advance(8001);await flush();S.rejected(out);A.equal(r.localStatus().inFlight,1);gate.resolve();await wait(()=>r.localStatus().inFlight===0);A.equal(S.count(s,'client.prepare'),0);A.equal(S.count(s,'client.close'),1)})
 await check('late_prepare',async()=>{const gate=S.deferred(),{s,r}=make({prepareGate:gate}),out=S.watch(r.read(s.cookie));await wait(()=>S.count(s,'client.prepare')===1);S.advance(8001);await flush();S.rejected(out);A.equal(r.localStatus().inFlight,1);A.equal(S.count(s,'client.close'),0);gate.resolve();await wait(()=>r.localStatus().inFlight===0);A.equal(S.count(s,'auth.post'),0);A.equal(S.count(s,'client.cancel'),1);A.equal(S.count(s,'client.close'),1);A.equal(S.count(s,'client.consume'),0)})
 await check('post_still_running',async()=>{const gate=S.deferred(),{s,r}=make({authGate:gate,authAt:2}),out=S.watch(r.read(s.cookie));await wait(()=>S.count(s,'auth.post')===1);S.advance(8001);await wait(()=>S.count(s,'client.closed')===1);S.rejected(out);A.equal(r.localStatus().inFlight,1);A.equal(S.count(s,'client.cancel'),1);gate.resolve();await wait(()=>r.localStatus().inFlight===0);A.equal(S.count(s,'client.finish'),0);A.equal(S.count(s,'auth.context'),1)})
 await check('late_finish',async()=>{const gate=S.deferred(),{s,r}=make({finishGate:gate}),out=S.watch(r.read(s.cookie));await wait(()=>S.count(s,'client.finish')===1);S.advance(8001);await flush();S.rejected(out);A.equal(r.localStatus().inFlight,1);gate.resolve();await wait(()=>r.localStatus().inFlight===0);A.equal(S.count(s,'client.consume'),0);A.equal(S.count(s,'client.cancel'),0);A.equal(S.count(s,'client.close'),1)})
 await check('late_close',async()=>{
  const gate=S.deferred(),{s,r}=make({closeGate:gate}),out=S.watch(r.read(s.cookie))
  await wait(()=>S.count(s,'client.close')===1);await flush()
  A.equal(S.count(s,'client.consume'),1);A.equal(out.state,'resolved');A.equal(out.settlements,1)
  const published=out.value;A.equal(published.workers.length,8)
  A.deepEqual(r.localStatus(),{inFlight:1,timedOut:0,cleanupUnknown:0})
  S.advance(8001);await flush();A.equal(out.state,'resolved');A.equal(out.value,published)
  A.equal(S.clock.timers.size,0);A.equal(r.localStatus().inFlight,1)
  gate.resolve();await wait(()=>r.localStatus().inFlight===0);await flush()
  A.equal(out.state,'resolved');A.equal(out.value,published);A.equal(out.settlements,1)
  A.equal(S.count(s,'client.close'),1);A.equal(S.count(s,'client.consume'),1);A.equal(S.count(s,'auth.authorize'),1)
 })
 await check('publish_before_cleanup_effect',async()=>{
  const gate=S.deferred(),{s,r}=make({closeGate:gate,closeEffect:s=>{s.revoked=true;s.revision++;S.advance(8001)}})
  const out=S.watch(r.read(s.cookie));await wait(()=>S.count(s,'client.close')===1);await flush()
  A.equal(s.revoked,true);A.equal(out.state,'resolved');A.equal(out.settlements,1)
  A.equal(out.value.workers.length,8);A.equal(Object.isFrozen(out.value),true)
  A.deepEqual(r.localStatus(),{inFlight:1,timedOut:0,cleanupUnknown:0});A.equal(S.clock.timers.size,0)
  A.equal(S.count(s,'auth.context'),1);A.equal(S.count(s,'auth.post'),1);A.equal(S.count(s,'client.budget'),1)
  gate.resolve();await wait(()=>r.localStatus().inFlight===0);A.equal(out.state,'resolved')
 })
 await check('published_cleanup_reject',async()=>{
  const gate=S.deferred(),{s,r}=make({closeGate:gate}),out=S.watch(r.read(s.cookie))
  await wait(()=>S.count(s,'client.close')===1);await flush();A.equal(out.state,'resolved')
  const published=out.value;A.equal(out.settlements,1);A.equal(r.localStatus().inFlight,1)
  gate.reject(Error('PRIVATE_LATE_CLOSE'));await wait(()=>r.localStatus().cleanupUnknown===1)
  A.deepEqual(r.localStatus(),{inFlight:1,timedOut:0,cleanupUnknown:1})
  S.advance(16000);await flush();A.equal(out.state,'resolved');A.equal(out.value,published);A.equal(out.settlements,1)
  A.equal(S.count(s,'client.consume'),1);A.equal(S.count(s,'client.close'),1);A.equal(S.count(s,'client.closed'),0)
  A.equal(S.count(s,'auth.authorize'),1);A.equal(S.count(s,'client.connect'),1);A.equal(S.clock.timers.size,0)
 })
 await check('unknown_cleanup',async()=>{const {s,r}=make({closeError:true});for(let i=0;i<2;i++){const out=S.watch(r.read(s.cookie));await wait(()=>out.state!=='pending');A.equal(out.state,'resolved');await wait(()=>r.localStatus().cleanupUnknown===i+1)}A.deepEqual(r.localStatus(),{inFlight:2,timedOut:0,cleanupUnknown:2});const before=S.count(s,'auth.authorize'),third=S.watch(r.read(s.cookie));await flush();S.rejected(third);A.equal(S.count(s,'auth.authorize'),before);A.equal(S.count(s,'client.connect'),2)})
 await check('nonsettling_auth',async()=>{const gate=S.deferred(),{s,r}=make({authGate:gate,authAt:'all'}),a=S.watch(r.read(s.cookie)),b=S.watch(r.read(s.cookie)),third=S.watch(r.read(s.cookie));await flush();S.rejected(third);A.equal(S.count(s,'auth.connect'),2);S.advance(8001);await flush();S.rejected(a);S.rejected(b);A.deepEqual(r.localStatus(),{inFlight:2,timedOut:2,cleanupUnknown:0});gate.resolve();await wait(()=>r.localStatus().inFlight===0);A.equal(S.count(s,'client.connect'),0)})
 await check('cancel_pending',async()=>{const gate=S.deferred(),{s,r}=make({cancelGate:gate,prepareEffect:s=>{s.revoked=true}}),out=S.watch(r.read(s.cookie));await wait(()=>out.state!=='pending');S.rejected(out,401);A.equal(r.localStatus().inFlight,1);A.equal(S.count(s,'client.cancel'),1);A.equal(S.count(s,'client.close'),0);S.advance(10000);await flush();A.equal(r.localStatus().inFlight,1);A.equal(S.count(s,'client.cancel'),1);gate.resolve();await wait(()=>r.localStatus().inFlight===0);A.equal(S.count(s,'client.close'),1)})
 await check('total_budget',async()=>{const {s,r}=make({authEffect:n=>{if(n===1)S.advance(7000)},prepareEffect:()=>S.advance(1001)}),out=S.watch(r.read(s.cookie));await wait(()=>out.state!=='pending');S.rejected(out);await wait(()=>r.localStatus().inFlight===0);A.equal(S.count(s,'auth.context'),1);A.equal(S.count(s,'auth.post'),0);A.equal(S.count(s,'client.cancel'),1);A.equal(S.count(s,'client.finish'),0)})
 await check('invalid_dto',async()=>{const {s,r}=make();s.snapshot={...s.snapshot,workers:s.snapshot.workers.slice(0,7)};const out=S.watch(r.read(s.cookie));await wait(()=>out.state!=='pending');S.rejected(out);await wait(()=>r.localStatus().inFlight===0);A.equal(S.count(s,'client.consume'),1);A.equal(out.value,undefined)})
 await check('opaque_client',async()=>{const {s,r}=make({plainCompleted:true}),out=S.watch(r.read(s.cookie));await wait(()=>out.state!=='pending');S.rejected(out);await wait(()=>r.localStatus().inFlight===0);A.equal(S.count(s,'client.consume'),0);A.equal(S.count(s,'client.close'),1)})
 await check('reentry',async()=>{const {s,r}=make();let second,third;s.config.connectHook=()=>{second=S.watch(r.read(s.cookie));third=S.watch(r.read(s.cookie))};const first=S.watch(r.read(s.cookie));await wait(()=>first.state!=='pending'&&second?.state!=='pending'&&third?.state!=='pending');A.equal(first.state,'resolved');A.equal(second.state,'resolved');S.rejected(third);A.equal(S.count(s,'client.connect'),2);A.equal(S.count(s,'client.consume'),2);A.equal(S.count(s,'client.close'),2);await wait(()=>r.localStatus().inFlight===0)})
 return results
}

before(()=>{
 assert.equal(sha(fs.readFileSync(guard)),'83fc4c1d49f3805fd0439e3e4d6a1f093bfed8556940179220e1deeafc2ea889','actual canonical H Native guard required; no production stub')
 temporary=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'native-worker-heartbeats-pure-'))
 const state=path.join(temporary,'state.mjs'),clock=path.join(temporary,'clock.mjs'),client=path.join(temporary,'client.mjs'),loader=path.join(temporary,'loader.mjs')
 fs.writeFileSync(state,stateSource(url(guard),url(path.join(path.dirname(guard),'native-employee-auth.mjs')),url(path.join(root,'services/pg-api/src/worker-heartbeat-contract.ts'))))
 fs.writeFileSync(clock,`import {clock} from ${JSON.stringify(url(state))};export const performance={now:()=>clock.now};export function setTimeout(fn,ms){const key={};clock.timers.set(key,{fn,at:clock.now+ms});return key}export function clearTimeout(key){clock.timers.delete(key)}`)
 fs.writeFileSync(client,`export {beginBudget as beginWorkerHeartbeatNativeReadBudget,connect as connectWorkerHeartbeatReadControl,prepare as prepareWorkerHeartbeatSnapshot,finish as finishWorkerHeartbeatSnapshot,consume as consumeWorkerHeartbeatSnapshot,cancel as cancelWorkerHeartbeatSnapshot,close as closeWorkerHeartbeatReadControl} from ${JSON.stringify(url(state))}`)
 fs.writeFileSync(loader,`import {registerHooks} from 'node:module';registerHooks({resolve(specifier,context,next){if(context.parentURL===${JSON.stringify(url(source))}){let target;if(specifier==='./native-current-company-admin.mjs')target=${JSON.stringify(url(guard))};if(specifier==='./worker-heartbeat-activation-control-client.ts')target=${JSON.stringify(url(client))};if(process.env.NATIVE_COMPOSITION_TEST_CLOCK==='virtual'&&['node:perf_hooks','node:timers'].includes(specifier))target=${JSON.stringify(url(clock))};if(target)return {url:target,shortCircuit:true}}return next(specifier,context)}})`)
 const runner=path.join(temporary,'runner.mjs')
 fs.writeFileSync(runner,`import assert from 'node:assert/strict';import {NativeCompanyWorkerHeartbeats} from ${JSON.stringify(url(source))};import * as S from ${JSON.stringify(url(state))};const results=await (${runCases.toString()})(NativeCompanyWorkerHeartbeats,S,assert);process.stdout.write(JSON.stringify({scope:'pure_composition_actual_Native_class_synthetic_SQL_IPC_virtual_clock_NOT_authority',results}))`)
 const environment={...process.env,NATIVE_COMPOSITION_TEST_CLOCK:'virtual'};delete environment.NODE_OPTIONS;delete environment.NODE_PATH
 const child=spawnSync(process.execPath,['--experimental-strip-types','--import',url(loader),runner],{env:environment,encoding:'utf8',timeout:20000,maxBuffer:1024*1024,windowsHide:true})
 assert.equal(child.error,undefined);assert.equal(child.status,0,child.stderr);report=JSON.parse(child.stdout)
 const real=path.join(temporary,'real-budget.mjs')
 fs.writeFileSync(real,`import assert from 'node:assert/strict';import {performance} from 'node:perf_hooks';import {NativeCompanyWorkerHeartbeats} from ${JSON.stringify(url(source))};import * as S from ${JSON.stringify(url(state))};const gate=S.deferred(),s=S.reset({authGate:gate,authAt:'all'}),r=new NativeCompanyWorkerHeartbeats(S.pool());const started=performance.now();let error;try{await r.read(s.cookie)}catch(e){error=e}const elapsed=performance.now()-started;assert.equal(error?.status,503);assert.equal(error?.code,'company_worker_heartbeats_unavailable');assert.ok(elapsed>=7990);assert.deepEqual(r.localStatus(),{inFlight:1,timedOut:1,cleanupUnknown:0});assert.equal(S.count(s,'client.connect'),0);process.stdout.write(JSON.stringify({elapsed_ms:elapsed,local:r.localStatus(),scope:'real_elapsed_local_budget_only_synthetic_unsettled_auth_NOT_DB_or_authority'}))`)
 const realChild=spawnSync(process.execPath,['--experimental-strip-types','--import',url(loader),real],{env:{...environment,NATIVE_COMPOSITION_TEST_CLOCK:'real'},encoding:'utf8',timeout:30000,maxBuffer:1024*1024,windowsHide:true})
 assert.equal(realChild.error,undefined);assert.equal(realChild.status,0,realChild.stderr);realReport=JSON.parse(realChild.stdout)
})
after(()=>{
 if(!temporary)return
 const absolute=path.resolve(temporary)
 assert.equal(path.dirname(absolute),fs.realpathSync(os.tmpdir()));assert.match(path.basename(absolute),/^native-worker-heartbeats-pure-/)
 assert.equal(fs.lstatSync(absolute).isSymbolicLink(),false);assert.equal(fs.realpathSync(absolute),absolute)
 fs.rmSync(absolute,{recursive:true,force:true})
})
for(const [id,label]of cases)test('pure composition: '+label,()=>{
 assert.equal(report.scope,'pure_composition_actual_Native_class_synthetic_SQL_IPC_virtual_clock_NOT_authority')
 const result=report.results.find(row=>row.id===id);assert.ok(result);assert.equal(result.passed,true,id+': '+result.code)
})
test('real elapsed8s cutoff retains unresolved synthetic Native acquire without claiming stopped',t=>{
 assert.ok(realReport.elapsed_ms>=7990);assert.equal(realReport.local.inFlight,1);assert.equal(realReport.local.timedOut,1)
 t.diagnostic(JSON.stringify(realReport))
})
test('production source has fixed client imports, no public clock/target/adapter, and no HTTP/DB-management hooks',()=>{
 const text=fs.readFileSync(source,'utf8')
 assert.match(text,/from '\.\/worker-heartbeat-activation-control-client\.ts'/)
 assert.match(text,/new NativeCurrentCompanyAdmin\(authPool\)/)
 assert.match(text,/budgetMs=8000/)
 assert.match(text,/const budget=beginWorkerHeartbeatNativeReadBudget\(\)/)
 assert.match(text,/connectWorkerHeartbeatReadControl\(budget\)/)
 assert.doesNotMatch(text,/Promise\.race\s*\(|Date\.now\s*\(|sendWorkerHeartbeatOperatorCommand|pg\.Pool|JSON\.parse|console\.|process\.(?:on|once|addListener)|fetch\s*\(/)
 assert.match(text,/constructor\(authPool:SqlPool\)/)
 assert.doesNotMatch(text,/setInterval\s*\(|createUnknownWorkerHeartbeatSnapshot/)
 assert.equal(report.results.length,cases.length)
})
