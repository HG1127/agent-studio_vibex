import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import {EventEmitter} from 'node:events'
import {setTimeout as sleep} from 'node:timers/promises'
import {pickNative,nativePickerScript} from '../local-executor/native-picker.mjs'
import {createConnectorManager} from '../local-executor/desktop.mjs'
import {createSetupReporter} from '../local-executor/setup-progress.mjs'
import {connectionSetupProgress} from '../src/lib/localConnectionProgress.ts'
import {parseLocalDeviceInventory} from '../src/lib/localDeviceInventory.ts'

const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve}}
async function until(fn){for(let n=0;n<100;n++){if(await fn())return;await sleep(10)}throw Error('condition_timeout')}
const ticket=expiresAt=>({format:'agent-studio-connect-v1',server:'http://127.0.0.1:8180/__pb',name:'isolated picker',mode:'files',origins:[],pairing:{id:'a'.repeat(24),code:'b'.repeat(48),expiresAt}})
const emptyProgress=()=>({start(){},stage(){},finish(){},stop(){},close(){}})

test('native abort waits for actual child close and discards a late selected path',async()=>{
 const child=new EventEmitter(),abort=new AbortController();let callback,settled=false,started=0
 const result=pickNative('folder',{platform:'win32',signal:abort.signal,onStarted:()=>started++,execute:(_exe,_args,opts,cb)=>{assert.equal(opts.signal,abort.signal);callback=cb;return child}})
 const checked=assert.rejects(result,/picker_cancelled/).then(()=>settled=true)
 child.emit('spawn');assert.equal(started,1);abort.abort();callback(Object.assign(Error('aborted'),{name:'AbortError'}),'C:/late-private-path')
 await sleep(5);assert.equal(settled,false);child.emit('close');await checked
})
test('native timeout remains pending until close; UTF-8 and synchronous adapters return only path',async()=>{
 const c=new EventEmitter();let callback,finished=false
 const result=pickNative('file',{platform:'win32',execute:(_e,_a,_o,cb)=>{callback=cb;return c}})
 const checked=assert.rejects(result,/picker_timeout/).then(()=>finished=true)
 callback({killed:true},'');await sleep(5);assert.equal(finished,false);c.emit('close');await checked
 assert.equal(await pickNative('folder',{platform:'win32',execute:(_e,args,opts,cb)=>{assert.equal(opts.encoding,'utf8');assert.ok(args.includes('-STA'));cb(null,'C:/资料/报告')}}),'C:/资料/报告')
 await assert.rejects(pickNative('folder',{platform:'win32',execute:()=>{throw Error('sensitive OS error')}}),/^Error: folder_picker_unavailable$/)
 for(const kind of ['folder','file','connection'])assert.match(nativePickerScript(kind),/ShowDialog\(\$owner\)/)
})

async function managerFixture(t,{expiresIn=60000,clock=Date.now}={}){
 const base=path.join(process.cwd(),'.tmp','picker-unit');await fs.mkdir(base,{recursive:true})
 const home=await fs.mkdtemp(path.join(base,'home-')),folder=path.join(home,'研究资料'),calls=[],stages=[]
 await fs.mkdir(folder)
 const progress={...emptyProgress(),stage:s=>stages.push(s)}
 let prepares=0
 const manager=await createConnectorManager({home,clock,progressReporter:progress,picker:opts=>{const d=deferred();calls.push({...d,...opts});opts.onStarted();return d.promise},prepare:async()=>{prepares++;throw Error('unexpected_pair')}})
 const api=async(route,body)=>{const response=await fetch(manager.origin+route,{method:body===undefined?'GET':'POST',headers:{'X-Connector-Session':manager.token,...(body===undefined?{}:{Origin:manager.origin,'Content-Type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body)});return {status:response.status,data:await response.json()}}
 t.after(async()=>{for(const c of calls)c.resolve('');await manager.close();await fs.rm(home,{recursive:true,force:true,maxRetries:5,retryDelay:50})})
 assert.equal((await api('/api/prepare',{ticket:ticket(clock()+expiresIn)})).status,200)
 return {api,folder,calls,stages,manager,get prepares(){return prepares}}
}
test('scoped cancel remains available during busy; late path cannot overwrite original draft or pair',async t=>{
 const f=await managerFixture(t),pending=f.api('/api/folder',{scope:'connect'})
 await until(()=>f.calls.length===1)
 let s=(await f.api('/api/state')).data;const first=s.selection.id,review=s.review.reviewId
 assert.equal(s.busy,true);assert.equal(s.selection.phase,'waiting')
 assert.equal((await f.api('/api/picker/cancel',{id:'f'.repeat(24)})).status,400)
 assert.equal(f.calls[0].signal.aborted,false)
 assert.equal((await f.api('/api/connect',{reviewId:review,consent:true})).status,409)
 const cancelled=await f.api('/api/picker/cancel',{id:first});assert.equal(cancelled.status,200);assert.equal(cancelled.data.busy,true);assert.equal(f.calls[0].signal.aborted,true)
 assert.equal((await f.api('/api/picker/cancel',{id:first})).status,200)
 assert.equal((await f.api('/api/folder',{scope:'connect'})).status,409)
 f.calls[0].resolve(f.folder);assert.equal((await pending).status,200)
 s=(await f.api('/api/state')).data
 assert.equal(s.busy,false);assert.equal(s.selectedFolder,null);assert.equal(s.review.reviewId,review);assert.equal(s.lastSelection.outcome,'cancelled');assert.equal(f.prepares,0)
 const next=f.api('/api/folder',{scope:'connect'});await until(()=>f.calls.length===2)
 assert.equal((await f.api('/api/picker/cancel',{id:first})).status,400);assert.equal(f.calls[1].signal.aborted,false)
 f.calls[1].resolve(f.folder);assert.equal((await next).status,200)
 s=(await f.api('/api/state')).data;assert.equal(s.selectedFolder,await fs.realpath(f.folder));assert.equal(s.lastSelection.outcome,'completed');assert.equal(s.profiles.length,0);assert.equal(f.prepares,0)
 assert.equal((await f.api('/api/picker/cancel',{id:s.lastSelection.id})).status,200)
 assert.equal((await f.api('/api/state')).data.selectedFolder,s.selectedFolder)
 assert.ok(f.stages.includes('selection_cancelled'));assert.ok(f.stages.includes('ready_to_confirm'))
})
test('ticket expires while chooser is open: abort only that chooser and retain unbound registration',async t=>{
 const f=await managerFixture(t,{expiresIn:200}),pending=f.api('/api/folder',{scope:'connect'})
 await until(()=>f.calls.length===1);await until(()=>f.calls[0].signal.aborted)
 assert.equal((await f.api('/api/state')).data.busy,true)
 f.calls[0].resolve(f.folder);const result=await pending
 assert.equal(result.status,400);assert.match(result.data.error,/过期/);assert.equal(result.data.state.selectedFolder,null)
 assert.equal(result.data.state.lastSelection.outcome,'expired');assert.equal(f.prepares,0)
})
test('expiry after native return is checked again before applying the directory',async t=>{
 let now=Date.now();const f=await managerFixture(t,{clock:()=>now}),pending=f.api('/api/folder',{scope:'connect'})
 await until(()=>f.calls.length===1);now+=61000;f.calls[0].resolve(f.folder)
 const result=await pending;assert.equal(result.status,400);assert.equal(result.data.state.selectedFolder,null);assert.equal(f.prepares,0)
})
test('manager close aborts and waits for its active chooser before releasing the server',async t=>{
 const f=await managerFixture(t),pending=f.api('/api/folder',{scope:'connect'});await until(()=>f.calls.length===1)
 let closed=false;const closing=f.manager.close().then(()=>closed=true);await until(()=>f.calls[0].signal.aborted)
 assert.equal(closed,false);f.calls[0].resolve(f.folder);await pending;await closing
})

test('progress reporter registers once, coalesces updates and never sends permission scope',async()=>{
 const posts=[],first=deferred()
 const reporter=createSetupReporter({heartbeatMs:100000,fetcher:async(url,options)=>{
  const body=JSON.parse(options.body);posts.push({url,body})
  if(url.endsWith('/context'))return Response.json({previousAttempt:''})
  if(posts.filter(p=>!p.url.endsWith('/context')).length===1)return first.promise
  return Response.json({ok:true,accepted:true})
 }})
 try{
  reporter.start(ticket(Date.now()+60000));await until(()=>posts.length===2)
  reporter.stage('choosing_folder');reporter.stage('ready_to_confirm');assert.equal(posts.length,2)
  first.resolve(Response.json({ok:true,accepted:true}));await until(()=>posts.length===3)
  assert.deepEqual(posts.slice(1).map(p=>p.body.stage),['imported','ready_to_confirm'])
  assert.equal(posts[1].body.attempt,posts[2].body.attempt);assert.ok(posts[2].body.sequence>posts[1].body.sequence)
  for(const p of posts)assert.ok(!JSON.stringify(p.body).includes('origins'))
  reporter.finish('cancelled');await until(()=>posts.length===4);assert.equal(posts[3].body.stage,'cancelled')
 }finally{reporter.close()}
})
test('missing old-server progress endpoint and stale CAS disable reporting without affecting local pairing',async()=>{
 for(const status of [404,409]){
  let count=0
  const reporter=createSetupReporter({heartbeatMs:10,fetcher:async()=>{count++;return Response.json({error:'unavailable'},{status})}})
  reporter.start(ticket(Date.now()+60000));await sleep(40);reporter.stage('choosing_folder');await sleep(20)
  assert.equal(count,1);reporter.close()
 }
})
test('old reporter response after a new import cannot send another old-attempt stage',async()=>{
 const delayed=deferred(),posts=[]
 const reporter=createSetupReporter({heartbeatMs:100000,fetcher:async(url,options)=>{
  const body=JSON.parse(options.body);posts.push({url,body})
  if(url.endsWith('/context'))return posts.length===1?delayed.promise:Response.json({previousAttempt:''})
  return Response.json({ok:true,accepted:true})
 }})
 try{
  reporter.start(ticket(Date.now()+60000));await until(()=>posts.length===1)
  reporter.start(ticket(Date.now()+60000));await until(()=>posts.length===3)
  delayed.resolve(Response.json({previousAttempt:''}));await sleep(20)
  assert.equal(posts.length,3)
 }finally{reporter.close()}
})
test('preparation freshness never replaces pairing, heartbeat, expiry or owner inventory validation',()=>{
 const now=Date.now(),device={id:'a'.repeat(24),name:'fixture',revoked:false,seen_ms:0,catalog:'[]',paired:false,pairing_expires_ms:now+60000,setup_stage:'choosing_folder',setup_seen_ms:now}
 assert.match(connectionSetupProgress(device,now).label,/正在选择/)
 assert.equal(connectionSetupProgress(device,now+31000).stale,true)
 for(const changed of [{paired:true},{seen_ms:now},{revoked:true},{pairing_expires_ms:now-1}])assert.equal(connectionSetupProgress({...device,...changed},now),null)
 assert.equal(parseLocalDeviceInventory({items:[device]})[0].setup_stage,'choosing_folder')
 assert.throws(()=>parseLocalDeviceInventory({items:[{...device,setup_stage:'<script>'}]}),/准备状态/)
 assert.throws(()=>parseLocalDeviceInventory({items:[{...device,setup_seen_ms:'now'}]}),/准备状态/)
})
