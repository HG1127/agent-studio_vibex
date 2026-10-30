import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {EventEmitter} from 'node:events'
import {PassThrough} from 'node:stream'
import {createConnectorManager} from '../local-executor/desktop.mjs'
import {readGuidedProfile} from '../local-executor/profiles.mjs'

const id='a'.repeat(24)
function child(){
 const c=new EventEmitter();c.stdout=new PassThrough();c.stderr=new PassThrough();c.connected=true
 c.finish=(code=0)=>{c.connected=false;c.emit('exit',code,null);c.emit('close',code,null)}
 c.send=message=>{if(message.type==='studio-local-stop')queueMicrotask(()=>c.finish())}
 c.kill=()=>c.finish()
 return c
}
async function fixture(t,{checkBrowser}={}){
 const home=await fs.mkdtemp(path.join(os.tmpdir(),'studio-restore-status-')),dir=path.join(home,'.agent-studio','connections',id),folder=path.join(home,'work')
 await fs.mkdir(dir,{recursive:true});await fs.mkdir(folder)
 const config=path.join(dir,'computer.local.json'),credentials=path.join(dir,'.local-device-credentials.json')
 await fs.writeFile(config,JSON.stringify({server:'http://127.0.0.1:8180/__pb',deviceName:'原连接',credentialsFile:'.local-device-credentials.json',roots:[{name:'work',path:folder,readOnly:true}],browser:{enabled:!!checkBrowser,channel:'chrome',allowedOrigins:[]}}))
 await fs.writeFile(credentials,'{"privateFixture":"never-show-this-secret"}')
 const before=[await fs.readFile(config),await fs.readFile(credentials)],children=[]
 const manager=await createConnectorManager({home,...(checkBrowser?{checkBrowser}:{}),startChild:async()=>{const c=child();children.push(c);return c}})
 t.after(async()=>{await manager.close();await fs.rm(home,{recursive:true,force:true,maxRetries:5,retryDelay:100})})
 const read=async()=>{const r=await fetch(manager.origin+'/api/state',{headers:{'X-Connector-Session':manager.token}});return r.json()}
 const resume=async()=>{const p=await readGuidedProfile(id,{home});await manager.resumeSaved(id,p.fingerprint);return children.at(-1)}
 const stop=async()=>{const r=await fetch(manager.origin+'/api/stop',{method:'POST',headers:{'X-Connector-Session':manager.token,Origin:manager.origin,'Content-Type':'application/json'},body:JSON.stringify({id,consent:true})});assert.equal(r.status,200)}
 const unchanged=async()=>{assert.ok(before[0].equals(await fs.readFile(config)));assert.ok(before[1].equals(await fs.readFile(credentials)))}
 return {read,resume,stop,unchanged,children}
}
test('identity rejection remains visible after zero exit and repeated refresh without changing original binding',async t=>{
 const f=await fixture(t),c=await f.resume()
 c.emit('message',{type:'studio-local-state',state:'failed',reasonCode:'device_identity_rejected'})
 c.finish(0)
 for(let i=0;i<3;i++){const s=await f.read(),p=s.profiles[0];assert.equal(p.state,'failed');assert.equal(p.reasonCode,'device_identity_rejected');assert.equal(p.running,false);assert.match(p.message,/身份|绑定/);assert.ok(!JSON.stringify(s).includes('never-show-this-secret'))}
 await f.unchanged()
})
test('stderr warnings do not cancel real online evidence; explicit stop clears failure',async t=>{
 const f=await fixture(t),c=await f.resume()
 c.stderr.write('ExperimentalWarning: harmless runtime warning\n')
 c.emit('message',{type:'studio-local-state',state:'online'})
 let p=(await f.read()).profiles[0];assert.equal(p.state,'online');assert.equal(p.running,true);assert.equal(p.reasonCode,null)
 await f.stop()
 c.emit('message',{type:'studio-local-state',state:'failed',reasonCode:'device_identity_rejected'})
 p=(await f.read()).profiles[0];assert.equal(p.state,'stopped');assert.equal(p.running,false);assert.equal(p.reasonCode,null)
})
test('late loader output is classified at close, never exposed raw, and retry ignores old child events',async t=>{
 const f=await fixture(t),first=await f.resume()
 first.emit('exit',1,null)
 first.stderr.write('Error [ERR_MODULE_NOT_FOUND]: never-show-this-secret at private/path\n')
 first.emit('close',1,null)
 let p=(await f.read()).profiles[0];assert.equal(p.state,'failed');assert.equal(p.reasonCode,'component_incomplete');assert.equal(p.running,false);assert.ok(!JSON.stringify(p).includes('private/path'))
 const second=await f.resume();assert.equal(f.children.length,2)
 first.emit('message',{type:'studio-local-state',state:'failed',reasonCode:'device_identity_rejected'});first.emit('close',1,null)
 p=(await f.read()).profiles[0];assert.equal(p.state,'starting');assert.equal(p.running,true)
 second.emit('message',{type:'studio-local-state',state:'online'})
 assert.equal((await f.read()).profiles[0].state,'online');await f.unchanged()
})
test('preflight rejection is retained and retryable instead of unstarted',async t=>{
 const f=await fixture(t,{checkBrowser:async()=>{throw Error('chrome_not_installed')}})
 await assert.rejects(f.resume(),/chrome_not_installed/)
 const p=(await f.read()).profiles[0];assert.equal(p.state,'failed');assert.equal(p.running,false);assert.equal(p.reasonCode,'chrome_not_installed');assert.equal(f.children.length,0)
})
test('unrecognized child reasons cannot inject raw diagnostics into state',async t=>{
 const f=await fixture(t),c=await f.resume()
 c.emit('message',{type:'studio-local-state',state:'failed',reasonCode:'never-show-this-secret'})
 c.finish(1)
 const s=await f.read();assert.equal(s.profiles[0].reasonCode,'connector_start_failed');assert.ok(!JSON.stringify(s).includes('never-show-this-secret'))
})
test('legacy identity stderr with exit zero is retained and never interpreted as success',async t=>{
 const f=await fixture(t),c=await f.resume()
 c.stderr.write('当前服务器未接受此设备身份。请核对工作台地址与原绑定，不要重复配对。\n')
 c.finish(0)
 const p=(await f.read()).profiles[0];assert.equal(p.state,'failed');assert.equal(p.reasonCode,'device_identity_rejected');assert.equal(p.running,false)
})
test('preflight stop and concurrent resume cannot produce an unwanted second worker',async t=>{
 let release,enter;const ready=new Promise(r=>release=r),entered=new Promise(r=>enter=r)
 const f=await fixture(t,{checkBrowser:async()=>{enter();return ready}})
 const starting=f.resume();await entered
 await assert.rejects(f.resume(),/connection_running_or_locked/)
 await f.stop();release()
 await starting
 const p=(await f.read()).profiles[0];assert.equal(p.state,'stopped');assert.equal(p.running,false);assert.equal(f.children.length,0)
})
test('explicit failure is terminal for an attempt, including delayed online IPC',async t=>{
 const f=await fixture(t),c=await f.resume()
 c.emit('message',{type:'studio-local-state',state:'failed',reasonCode:'device_identity_rejected'})
 c.emit('message',{type:'studio-local-state',state:'online'})
 c.finish(0)
 const p=(await f.read()).profiles[0];assert.equal(p.state,'failed');assert.equal(p.reasonCode,'device_identity_rejected')
})
test('spawn error without exit still closes and preserves safe failure',async t=>{
 const f=await fixture(t),c=await f.resume()
 c.emit('error',Object.assign(Error('never-show-this-secret'),{code:'ENOENT'}))
 c.emit('close',-1,null)
 const p=(await f.read()).profiles[0];assert.equal(p.state,'failed');assert.equal(p.running,false);assert.equal(p.reasonCode,'local_setup_unavailable')
})
test('stopping during a pending control restart prevents a new child',async t=>{
 const f=await fixture(t),c=await f.resume()
 c.emit('message',{type:'studio-local-state',state:'online'})
 c.emit('message',{type:'studio-control-updated'})
 c.finish(0)
 assert.equal((await f.read()).profiles[0].running,true)
 await f.stop();await new Promise(r=>setTimeout(r,350))
 const p=(await f.read()).profiles[0];assert.equal(p.state,'stopped');assert.equal(p.running,false);assert.equal(f.children.length,1)
})
test('a valid control restart retains its original profile and starts exactly once',async t=>{
 const f=await fixture(t),c=await f.resume()
 c.emit('message',{type:'studio-local-state',state:'online'})
 c.emit('message',{type:'studio-control-updated'})
 c.finish(0)
 await new Promise(r=>setTimeout(r,350))
 const p=(await f.read()).profiles[0];assert.equal(p.state,'starting');assert.equal(p.running,true);assert.equal(f.children.length,2);await f.unchanged()
})
