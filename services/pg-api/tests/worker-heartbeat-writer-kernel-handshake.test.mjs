// Pure control-flow regression: execute the actual launchWriter/writerCommand
// declarations with terminal process/filesystem observations replaced. This does
// not run a Worker, SQL, setpriv or a Linux kernel identity check.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {EventEmitter} from 'node:events'
import {createRequire} from 'node:module'
import {createHash} from 'node:crypto'
const ts=createRequire(import.meta.url)('typescript')
const source=fs.readFileSync(new URL('./helpers/worker-heartbeat-writer-ci-fixture.mjs',import.meta.url),'utf8').replaceAll('\r\n','\n')
const ast=ts.createSourceFile('fixture.mjs',source,ts.ScriptTarget.Latest,true)
assert.equal(ast.parseDiagnostics.length,0)
const actual=name=>{const declaration=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name);assert.ok(declaration,name);return declaration.getText(ast)}
const launch=actual('launchWriter'),command=actual('writerCommand')
const barrier=" if(mode==='component')await until(()=>{if(c.exited)fail('writer_component_exited');return c.messages.some(v=>v.event==='component_ready')},'writer_component_import',30000)\n"
const comment=" // The setpriv spawn event precedes its UID transition. Wait for the existing\n // nonroot component-ready barrier before Root samples the same actual PID.\n"
const legacy=launch.replace(comment+barrier,'').replace(' return c\n}',barrier+' return c\n}')
const sha=b=>createHash('sha256').update(b).digest('hex')
function model({original=false,mode='component',uids=[0,0,0,0],readError=null,status=null}={}){
 const events=[],reads=[],sent=[],waiters=[],timers=[],child=new EventEmitter()
 child.stdout=new EventEmitter();child.stderr=new EventEmitter();child.kill=signal=>events.push('kill:'+signal);child.send=value=>sent.push(value)
 const state={children:new Set(),writerChildren:new Set(),writerWork:'/ci/private',writerCode:'/ci/code',writerChild:'/ci/code/child.mjs',writerChildSha:'a'.repeat(64),writerSettings:{boot_uids:[61001],groups:[{kind:'prepare',gid:62001}]},stage:{nodePath:'/ci/node'},ci:{run:'1',attempt:'1',source_revision:'b'.repeat(40)}}
 let currentUids=[...uids],failure=readError,currentStatus=status
 const fail=label=>{throw Error('telemetry_control_ci_fixture_refused:'+label)}
 const until=(check,label,ms)=>new Promise((resolve,reject)=>{events.push('wait:'+label);waiters.push({check,label,ms,resolve,reject})})
 const globals={kinds:['prepare'],writerDeliveries:()=>[],writerLaunchEnv:()=>({}),writerBusinessEnvironment:async()=>({}),writerFile:()=>events.push('plan'),randomUUID:()=> '00000000-0000-4000-8000-000000000001',spawn:()=>{events.push('spawn');return child},performance:{now:()=>1},fs:{readlinkSync:()=>'/proc/ns',readFileSync(file,encoding){reads.push(file);events.push('kernel_status');assert.equal(file,'/proc/9021/status');assert.equal(encoding,'utf8');if(failure)throw Object.assign(Error('sample_refused'),{code:failure});return currentStatus??'Name:\tnode\nUid:\t'+currentUids.join('\t')+'\n'}},process:{env:{},stderr:{write:()=>{}}},until,fail,observeWriterEntryPhase:()=>events.push('entry_phase'),setTimeout:(callback,ms)=>{const timer={callback,ms};timers.push(timer);return timer},clearTimeout:timer=>{timer.cleared=true}}
 const api=Function(...Object.keys(globals),(original?legacy:launch)+'\n'+command+'\nreturn {launchWriter,writerCommand}')(...Object.values(globals))
 const pending=api.launchWriter(state,{selected:['prepare'],mode})
 let outcome={state:'pending'};pending.then(value=>{outcome={state:'resolved',value}},error=>{outcome={state:'rejected',error}})
 const flush=async()=>{for(let i=0;i<8;i++){for(const waiter of [...waiters]){try{if(!waiter.check())continue;waiter.resolve()}catch(error){waiter.reject(error)}waiters.splice(waiters.indexOf(waiter),1)}await Promise.resolve()}}
 const emit=async value=>{child.emit('message',value);await flush()}
 return {events,reads,sent,waiters,timers,state,child,pending,flush,emit,outcome:()=>outcome,setUids:value=>{currentUids=value},setError:value=>{failure=value},started:()=>emit({event:'kernel_child_started',pid:9021,uid:61001,groups:[62001],mode}),ready:()=>emit({event:'component_ready',uid:99999}),async exit(){child.emit('close',1,null);await flush()},async expire(label){const waiter=waiters.find(v=>v.label===label);assert.ok(waiter);waiters.splice(waiters.indexOf(waiter),1);waiter.reject(Error('fixture_deadline:'+label));await flush()},command:(c,value)=>api.writerCommand(state,c,value)}
}
test('exact original launch reproduces sampling transitional root UID before component readiness',async()=>{
 assert.equal(sha(legacy),'91c8edb274ba77d274cc2dfc8b0a3591d9918cd089c39cab0655400c4d019f16')
 const h=model({original:true});await h.started();await assert.rejects(h.pending,/writer_actual_kernel_uid/);assert.deepEqual(h.reads,['/proc/9021/status']);assert.equal(h.events.includes('wait:writer_component_import'),false);assert.equal(h.sent.length,0)
})
test('existing nonroot readiness precedes one actual-PID UID sample and only then allows an original command',async()=>{
 const h=model();await h.started();assert.equal(h.outcome().state,'pending');assert.deepEqual(h.reads,[]);assert.equal(h.sent.length,0)
 assert.equal(h.waiters.find(v=>v.label==='writer_component_import').ms,30000)
 h.setUids([61001,61001,61001,61001]);await h.ready();const c=await h.pending
 assert.equal(c.actualPid,9021);assert.equal(c.kernelUidVerified,true);assert.equal(c.uid,61001);assert.deepEqual(h.reads,['/proc/9021/status']);assert.equal(h.sent.length,0)
 const result=h.command(c,{op:'open_binding'});assert.equal(h.sent.length,1);assert.equal(h.sent[0].op,'open_binding');await h.emit({event:'component_result',id:h.sent[0].id,ok:false,code:'writer_busy'});assert.equal((await result).code,'writer_busy');assert.equal(h.sent.length,1);assert.equal(h.timers[0].ms,15000);assert.equal(h.timers[0].cleared,true)
})
for(let index=0;index<4;index++)test('post-ready UID field '+index+' mismatch still refuses without a second sample or bind',async()=>{
 const h=model();await h.started();const uids=[61001,61001,61001,61001];uids[index]=0;h.setUids(uids);await h.ready();await assert.rejects(h.pending,/writer_actual_kernel_uid/);assert.equal(h.reads.length,1);assert.equal(h.sent.length,0)
})
test('a ready message and claimed UID cannot replace a malformed actual /proc UID line',async()=>{
 const h=model({status:'Name:\tnode\nUid:\t61001 61001\n'});await h.started();await h.ready();await assert.rejects(h.pending,/writer_actual_kernel_uid/);assert.equal(h.reads.length,1);assert.equal(h.sent.length,0)
})
for(const code of ['ENOENT','EACCES'])test('component '+code+' after readiness remains a failure without PID or mode fallback',async()=>{
 const h=model({readError:code});await h.started();assert.equal(h.reads.length,0);await h.ready();await assert.rejects(h.pending,error=>error.code===code);assert.equal(h.reads.length,1);assert.equal(h.sent.length,0)
})
test('exit before existing component readiness refuses before a kernel sample or bind',async()=>{
 const h=model();await h.started();await h.exit();await assert.rejects(h.pending,/writer_component_exited/);assert.equal(h.reads.length,0);assert.equal(h.sent.length,0)
})
test('missing readiness retains the original 30s refusal boundary without UID polling or retries',async()=>{
 const h=model();await h.started();assert.equal(h.waiters.find(v=>v.label==='writer_component_import').ms,30000);await h.expire('writer_component_import');await assert.rejects(h.pending,/fixture_deadline:writer_component_import/);assert.equal(h.reads.length,0);assert.equal(h.sent.length,0)
})
test('component-ready alone cannot bypass the original kernel-spawn PID barrier',async()=>{
 const h=model();await h.ready();assert.equal(h.outcome().state,'pending');assert.equal(h.reads.length,0);assert.equal(h.waiters.find(v=>v.label==='writer_kernel_spawn').ms,20000);h.setUids([61001,61001,61001,61001]);await h.started();assert.equal((await h.pending).actualPid,9021);assert.equal(h.reads.length,1)
})
test('ordinary entry still refuses a wrong actual UID through the original immediate check',async()=>{
 const h=model({mode:'entry'});await h.flush();await h.started();await assert.rejects(h.pending,/writer_actual_kernel_uid/);assert.equal(h.events.includes('wait:writer_component_import'),false);assert.equal(h.reads.length,1)
})
for(const mode of ['plan','access'])test(mode+' retains its original exited-process ENOENT observation without identity verification',async()=>{
 const h=model({mode,readError:'ENOENT'});await h.started();const c=await h.pending;assert.equal(c.kernelUidVerified,false);assert.equal(h.events.includes('wait:writer_component_import'),false);assert.equal(h.reads.length,1);assert.equal(h.sent.length,0)
})
