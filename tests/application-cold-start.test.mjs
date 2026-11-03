import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import {EventEmitter} from 'node:events'
import {inspectApplication,registerApplications,validateApplicationControl} from '../local-executor/applications.mjs'
import {resolveWindowTarget} from '../local-executor/application-target.mjs'
async function fixture(t,options={}){
 const base=await fs.mkdtemp(path.join(os.tmpdir(),'studio-cold-')),exe=path.join(base,'Example.exe');await fs.writeFile(exe,'MZ-fixture')
 if(options.electron)await fs.writeFile(path.join(base,'LICENSE.electron.txt'),'fixture')
 let target
 if(options.wrapper){target=path.join(base,'.qoder-versions','1.2.3','Example.exe');await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,'MZ-versioned');await fs.writeFile(path.join(base,'.qoder-versions','1.2.3.qoder-update-ready.json'),'')}
 const grant=await inspectApplication(exe,{control:true}),tools=new Map();let launches=0,probes=0,argv
 const native=async input=>{if(input.action==='windows'){assert.equal(input.path,target||exe);probes++;await options.onProbe?.({exe,probes});return launches&&probes>=4&&(!options.fail||options.delegate)?[{id:'7',path:target||exe,title:'Fixture'}]:[]}return []}
 const launch=(file,args,opts)=>{launches++;assert.equal(file,exe);assert.equal(opts.shell,false);argv=args;const child=new EventEmitter();child.unref=()=>{};queueMicrotask(()=>{if(options.spawnError){child.emit('error',Object.assign(Error('private executable path'),{code:options.spawnError}));return}child.emit('spawn');if(options.fail)child.emit('exit',1)});return child}
 const config={roots:[{name:'work',path:base}],applications:{format:'agent-studio-applications-v1',enabled:true,images:false,grants:[grant]}}
 const runtime=registerApplications({config,add:(name,description,schema,fn)=>tools.set(name,fn),native,launch,launchWaitMs:options.timeout??300,pollMs:1})
 t.after(async()=>{await runtime.close();await fs.rm(base,{recursive:true,force:true})})
 return {exe,target,grant,config,tools,get launches(){return launches},get argv(){return argv},call:async(signal)=>JSON.parse(await tools.get('apps.launch')({app:grant.id},signal))}
}
test('cold launch waits across missing-window probes and launches exactly once',async t=>{const f=await fixture(t);const result=await f.call();assert.equal(result.status,'ready');assert.equal(result.windows.length,1);assert.equal(f.launches,1);assert.deepEqual(f.argv,[]);assert.ok(!JSON.stringify(result).includes(f.exe))})
test('launch receipt without a window is explicitly pending, never claimed completed',async t=>{const f=await fixture(t,{timeout:0});const r=await f.call();assert.equal(r.status,'waiting_window');assert.deepEqual(r.windows,[]);assert.equal(r.retryLaunch,false);assert.equal(f.launches,1)})
test('nonzero launcher exit reports failure and cancellation stops polling without relaunch',async t=>{const f=await fixture(t,{fail:true});await assert.rejects(f.call(),/application_launch_failed/);assert.equal(f.launches,1);const g=await fixture(t);const stop=new AbortController();stop.abort();await assert.rejects(g.call(stop.signal));assert.equal(g.launches,0)})
test('versioned launcher and actual window binary are separately pinned; changes fail closed',async t=>{
 const f=await fixture(t,{wrapper:true});assert.equal(await resolveWindowTarget(f.exe),f.target);assert.equal(f.grant.windowPath,f.target);assert.equal(f.grant.windowSha256.length,64);assert.equal((await f.call()).status,'ready')
 await fs.appendFile(f.target,'updated');await assert.rejects(f.call(),/application_binary_changed/)
 const escaped={...f.grant,windowPath:'C:\\outside\\Example.exe'};assert.throws(()=>validateApplicationControl({...f.config.applications,grants:[escaped]}),/invalid_application_grants/)
})
test('old launcher-only grants ask for review instead of silently following another executable',async t=>{const f=await fixture(t,{wrapper:true});delete f.grant.windowPath;delete f.grant.windowSha256;const tools=new Map(),r=registerApplications({config:f.config,add:(n,d,s,fn)=>tools.set(n,fn)});try{await assert.rejects(tools.get('apps.windows')({app:f.grant.id}),/application_launcher_needs_review/)}finally{await r.close()}})
test('Electron control support uses one fixed argument without accepting arbitrary renderer argv',async t=>{const f=await fixture(t,{electron:true});assert.equal(f.grant.accessibility,'electron');await f.call();assert.deepEqual(f.argv,['--force-renderer-accessibility'])})

test('an exited single-instance launcher can still become ready through its pinned window',async t=>{
 const f=await fixture(t,{fail:true,delegate:true});assert.equal((await f.call()).status,'ready');assert.equal(f.launches,1)
 assert.equal((await f.call()).alreadyRunning,true);assert.equal(f.launches,1)
})

test('cancellation during the initial native window probe prevents launch',async t=>{
 const stop=new AbortController(),f=await fixture(t,{onProbe:()=>stop.abort()})
 await assert.rejects(f.call(stop.signal));assert.equal(f.launches,0)
})

test('a binary update during window lookup cannot launch an unreviewed executable',async t=>{
 const f=await fixture(t,{onProbe:async({exe,probes})=>{if(probes===1)await fs.appendFile(exe,'unreviewed update')}})
 await assert.rejects(f.call(),/application_binary_changed/);assert.equal(f.launches,0)
})

test('missing binaries and OS launch rejection produce stable actionable reason codes',async t=>{
 const missing=await fixture(t);await fs.unlink(missing.exe);await assert.rejects(missing.call(),/application_binary_missing/);assert.equal(missing.launches,0)
 const denied=await fixture(t,{spawnError:'EACCES'});await assert.rejects(denied.call(),/application_launch_denied/);assert.equal(denied.launches,1)
})

test('a changed window binary after launch cannot be reported ready',async t=>{
 const f=await fixture(t,{onProbe:async({exe,probes})=>{if(probes===4)await fs.appendFile(exe,'updated while starting')}})
 await assert.rejects(f.call(),/application_binary_changed/);assert.equal(f.launches,1)
})
