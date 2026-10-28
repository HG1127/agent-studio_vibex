// Negative real factory checks and isolated private policy models only. Models
// below do not register a genuine Control, pg Client, UID proof or boot binding.
import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import * as ts from 'typescript'
import {randomBytes,timingSafeEqual} from 'node:crypto'
import {EventEmitter} from 'node:events'
import {openWorkerHeartbeatWriterBroker} from '../src/worker-heartbeat-writer-broker.ts'
import * as p from '../src/worker-heartbeat-writer-protocol.ts'
const genA='12345678-1234-4234-8234-123456789abc',genB='22345678-1234-4234-8234-123456789abc',id='32345678-1234-4234-8234-123456789abc',hex='a'.repeat(64)
const slot=(kind,generation=genA,slot_no=1,action_id=id)=>({kind,generation,slot_no,action_id,role_oid:30000+slot_no,reference:Object.freeze({model_only:true}),publication_epoch:'1'})
function privatePolicy(){
 const source=readFileSync(new URL('../src/worker-heartbeat-writer-broker.ts',import.meta.url),'utf8'),tree=ts.createSourceFile('broker.ts',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS)
 const names=['parseHistory','writerBootBatches','peerCurrent','reply','report'],functions=names.map(name=>tree.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name).getText()).join('\n')
 const compiled=ts.transpileModule("const slotKey=(slot)=>slot.kind+':'+slot.slot_no+':'+slot.generation;\n"+functions,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText
 return Function('writerKind','writerUid','writerUuid','writerHex','writerObject','writerFail','writerLaunchGroup','writerEncode','writerProtocol','WorkerHeartbeatWriterError','timingSafeEqual','secret',compiled+'\nreturn {parseHistory,writerBootBatches,report}')(
  p.writerKind,p.writerUid,p.writerUuid,p.writerHex,p.writerObject,p.writerFail,p.writerLaunchGroup,p.writerEncode,p.writerProtocol,p.WorkerHeartbeatWriterError,timingSafeEqual,()=>randomBytes(32).toString('hex'))
}
test('only a genuine Controller may create a Root broker; cloned/data/getter capabilities refuse before OS or pg work',async()=>{
 let gets=0
 for(const control of [{},Object.freeze({}),structuredClone({}),new Proxy({},{get(){gets++;throw Error('must_not_read')}})])await assert.rejects(openWorkerHeartbeatWriterBroker(control),/untrusted_reference/)
 assert.equal(gets,0)
})
test('isolated boot-batch policy refuses partial knowledge rotations and never rebinds an issued sibling generation',()=>{
 const policy=privatePolicy(),index=slot('knowledge_index',genA),query=slot('knowledge_query',genB)
 assert.equal(policy.writerBootBatches([index,query],new Set()).batches.length,1)
 const old=new Set(['knowledge_query:1:'+genB]),partial=policy.writerBootBatches([index,query],old)
 assert.equal(partial.batches.length,0);assert.equal(partial.blockedKnowledge,true)
 const otherAction={...query,action_id:genA};assert.equal(policy.writerBootBatches([index,otherAction],new Set()).batches.length,0)
 assert.equal(policy.writerBootBatches([index],new Set()).batches.length,1)
 assert.equal(policy.writerBootBatches([slot('prepare')],new Set(['prepare:1:'+genA])).batches.length,0)
})
test('isolated durable allocation projection retains issued generation even with no reports and rejects reused UID',()=>{
 const policy=privatePolicy(),issued=uid=>({phase:'writer_boot_issued',data:{boot_id:id,uid,bindings:[{kind:'prepare',slot_no:1,generation:genA,role_oid:30001,secret_sha256:hex}]}})
 const s={bridge:{history:()=>[issued(19000)]},usedUids:new Set(),issued:new Set()};policy.parseHistory(s)
 assert.equal(s.usedUids.has(19000),true);assert.equal(s.issued.has('prepare:1:'+genA),true)
 assert.equal(policy.writerBootBatches([slot('prepare')],s.issued).batches.length,0)
 assert.throws(()=>policy.parseHistory({bridge:{history:()=>[issued(19000),issued(19000)]},usedUids:new Set(),issued:new Set()}),/writer_not_enrolled/)
 for(const uid of [0,NaN,undefined])assert.throws(()=>policy.parseHistory({bridge:{history:()=>[issued(uid)]},usedUids:new Set(),issued:new Set()}),/writer_not_enrolled/)
})
function reportModel(record,close=async()=>{}){
 const frames=[],current=slot('prepare'),peer={open:true,busy:false,kind:'prepare',lastSequence:0,binding:hex,permit:hex,backend:Object.freeze({model_only:true}),boot:{slot:current,revoked:false},socket:{writable:true,write:bytes=>frames.push(p.writerDecode(bytes.subarray(4))),end(){}}}
 const state={closed:false,paused:false,bridge:{check(){},current:()=>[current],busy:()=>false,record,close},active:undefined}
 const report={protocol:'native_worker_heartbeat_report_v1',generation:genA,sequence:1,state:'ready',reason:'startup_checks_complete'}
 return {state,peer,report,frames,policy:privatePolicy()}
}
test('isolated permit policy consumes before awaiting and lost ACK cannot be bypassed by a higher sequence',async()=>{
 let release,calls=0;const pending=new Promise(resolve=>{release=resolve})
 const m=reportModel(()=>{calls++;return pending}),work=m.policy.report(m.state,m.peer,id,hex,hex,m.report)
 assert.equal(m.peer.permit,undefined);assert.equal(calls,1)
 await assert.rejects(m.policy.report(m.state,m.peer,id,hex,hex,{...m.report,sequence:2}),/writer_protocol_refused/)
 release({accepted:true,sequence:1,observed_at:'2026-10-29T00:00:00.000Z'});await work
 const next=m.frames[0].value.next_permit;assert.notEqual(next,hex)
 await assert.rejects(m.policy.report(m.state,m.peer,id,hex,hex,{...m.report,sequence:2}),/writer_protocol_refused/);assert.equal(calls,1)
 // Receiving the next random permit is necessary; a higher counter alone is not.
 m.state.bridge.record=async()=>{calls++;return {accepted:true,sequence:2,observed_at:'2026-10-29T00:00:01.000Z'}}
 await m.policy.report(m.state,m.peer,id,hex,next,{...m.report,sequence:2});assert.equal(calls,2)
})
test('isolated unknown-record path waits for its cleanup promise and emits no continuation permit',async()=>{
 let finishCleanup,cleanups=0;const cleanup=new Promise(resolve=>{finishCleanup=resolve}),m=reportModel(async()=>{throw Error('unknown')},()=>{cleanups++;return cleanup})
 const work=m.policy.report(m.state,m.peer,id,hex,hex,m.report);await Promise.resolve();await Promise.resolve()
 assert.equal(cleanups,1);assert.equal(m.frames.length,0);assert.equal(m.peer.boot.revoked,true)
 finishCleanup();await work;assert.equal(m.frames.length,1);assert.equal(m.frames[0].ok,false);assert.equal(m.frames[0].value.settled,true);assert.equal(Object.hasOwn(m.frames[0].value,'next_permit'),false)
 await assert.rejects(m.policy.report(m.state,m.peer,id,hex,hex,{...m.report,sequence:2}),/writer_protocol_refused/)
})
test('source stages complete knowledge batches before making either secret bindable and limits per-boot rather than per-heartbeat journaling',()=>{
 const source=readFileSync(new URL('../src/worker-heartbeat-writer-broker.ts',import.meta.url),'utf8')
 assert.ok(source.indexOf("persist('writer_boot_issued'")<source.indexOf('stageWriterBootCredential(id'))
 assert.ok(source.indexOf("persist('writer_boot_staged'")<source.indexOf('s.boots.set(slotKey(item.slot)'))
 assert.match(source,/if\(s\.paused\|\|s\.active\|\|s\.bridge\.busy\(\)\)/)
 const tree=ts.createSourceFile('broker.ts',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS),body=tree.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='report').getText()
 assert.doesNotMatch(body,/\.persist\(/);assert.ok(body.indexOf('p.permit=undefined')<body.indexOf('await s.bridge.record'))
})

test('isolated partial-listener startup failure closes every already opened listener before rejecting and never enrolls another listener',async()=>{
 const source=readFileSync(new URL('../src/worker-heartbeat-writer-broker.ts',import.meta.url),'utf8'),tree=ts.createSourceFile('broker.ts',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS)
 const names=['serveWorkerHeartbeatWriterBroker','closeWorkerHeartbeatWriterBroker'],functions=names.map(name=>tree.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name).getText().replace(/^export /,'')).join('\n')
 const compiled=ts.transpileModule(functions,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText
 const groups=[{kind:'prepare',gid:19001},{kind:'model',gid:19002},{kind:'workflow_safe',gid:19003}],servers=[],state={closed:false,paused:false,servers:new Set(),peers:new Set(),boots:new Map(),bridge:{check(){},settings:{groups}}}
 class ModelServer extends EventEmitter{
  listening=false;closed=false
  listen(file,done){this.listening=true;queueMicrotask(done)}
  close(done){this.closed=true;this.listening=false;queueMicrotask(()=>done())}
 }
 let inspected=false
 const fileMetadata={
  lstatSync(){if(!inspected){inspected=true;throw Object.assign(Error('absent'),{code:'ENOENT'})}inspected=false;return {isSocket:()=>true,isSymbolicLink:()=>false,uid:0,gid:groups[servers.length-1].gid,mode:servers.length===2?0o600:0o660}},chownSync(){},chmodSync(){},
 }
 const factory=Function('state','writerFail','ensureDirectory','writerPaths','path','writerSocketPath','net','accept','fs','writerLimits','process','closures','closePeer',compiled+'\nreturn serveWorkerHeartbeatWriterBroker')
 const serve=factory(()=>state,p.writerFail,()=>{},p.writerPaths,{dirname:file=>file.slice(0,file.lastIndexOf('/'))},p.writerSocketPath,{createServer(){const server=new ModelServer();servers.push(server);return server}},()=>{},fileMetadata,p.writerLimits,{umask:()=>0o022},new WeakMap(),()=>Promise.resolve())
 await assert.rejects(serve(Object.freeze({model_only:true})),/writer_not_enrolled/)
 assert.equal(servers.length,2);assert.equal(servers.every(server=>server.closed),true);assert.equal(state.closed,true);assert.equal(state.paused,true);assert.equal(state.servers.size,0)
})
