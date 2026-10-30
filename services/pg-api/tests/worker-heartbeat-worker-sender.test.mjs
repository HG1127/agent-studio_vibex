// Exact private function policies in an explicit in-memory IPC model only.
// No production WeakMap/factory is registered, no real socket/UID/DB authority
// is created, and these models are NOT genuine boot or permission positives.
import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {EventEmitter} from 'node:events'
import {performance} from 'node:perf_hooks'
import * as ts from 'typescript'
import {randomUUID} from 'node:crypto'
import * as p from '../src/worker-heartbeat-writer-protocol.ts'
const gen='12345678-1234-4234-8234-123456789abc',first='a'.repeat(64),next='b'.repeat(64),last='c'.repeat(64)
const report=sequence=>({protocol:'native_worker_heartbeat_report_v1',generation:gen,sequence,state:'ready',reason:'startup_checks_complete'})
function model(){
 const source=readFileSync(new URL('../src/worker-heartbeat-worker-binding.ts',import.meta.url),'utf8'),tree=ts.createSourceFile('binding.ts',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS)
 const bodies=['quarantine','options','exchange','sendWorkerHeartbeatBoundReport'].map(name=>tree.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name).getText().replace(/^export /,'')).join('\n')
 class ModelSocket extends EventEmitter{
  frames=[];destroyed=false;onWrite
  write(frame,callback){this.frames.push(Buffer.from(frame));this.onWrite?.(this.frames.at(-1));queueMicrotask(()=>callback());return true}
  destroy(){this.destroyed=true;queueMicrotask(()=>this.emit('close'))}
 }
 const socket=new ModelSocket(),handle=Object.freeze({model_only:true}),state={socket,hello:{binding_id:first,instance_id:gen,generation:gen,next_permit:first},permit:first,sequence:0,pending:false,closed:false,uncertain:false,outcome:'none'}
 const compiled=ts.transpileModule(bodies,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText
 const make=Function('state','now','writerEncode','writerDecode','parseWriterResponse','parseWriterReport','writerObject','writerFail','WorkerHeartbeatWriterError','writerLimits','writerProtocol','randomUUID',compiled+'\nreturn {send:sendWorkerHeartbeatBoundReport,options,exchange}')
 const policy=make(token=>{assert.equal(token,handle);return state},performance.now.bind(performance),p.writerEncode,p.writerDecode,p.parseWriterResponse,p.parseWriterReport,p.writerObject,p.writerFail,p.WorkerHeartbeatWriterError,p.writerLimits,p.writerProtocol,randomUUID)
 const options=(signal=new AbortController().signal,ms=250)=>Object.freeze({signal,timeoutMs:ms,deadlineMonotonicMs:performance.now()+ms})
 const respond=(frame,value,ok=true)=>{const request=p.writerDecode(frame.subarray(4));socket.emit('data',p.writerEncode({protocol:p.writerProtocol,request_id:request.request_id,ok,value}));return request}
 return {policy,state,socket,handle,options,respond}
}
test('known clean ACK advances only the private next permit and rejects local sequence replay without another write',async()=>{
 const m=model();m.socket.onWrite=frame=>m.respond(frame,{accepted:true,sequence:1,observed_at:'2026-10-29T00:00:00.000Z',next_permit:next})
 await m.policy.send(m.handle,report(1),m.options());assert.equal(m.state.permit,next);assert.equal(m.state.outcome,'acknowledged');assert.equal(m.state.pending,false)
 await assert.rejects(m.policy.send(m.handle,report(1),m.options()),/writer_closed/);assert.equal(m.socket.frames.length,1)
 m.socket.onWrite=frame=>{const request=m.respond(frame,{accepted:true,sequence:2,observed_at:'2026-10-29T00:00:01.000Z',next_permit:last});assert.equal(request.permit,next)}
 await m.policy.send(m.handle,report(2),m.options());assert.equal(m.state.permit,last);assert.equal(m.socket.frames.length,2)
})
test('known no-dispatch busy completion is not accepted heartbeat and consumes a sequence/permit without a replay',async()=>{
 const m=model();m.socket.onWrite=frame=>m.respond(frame,{code:'writer_busy',not_dispatched:true,settled:true,next_permit:next},false)
 await m.policy.send(m.handle,report(1),m.options());assert.equal(m.state.outcome,'not_dispatched');assert.equal(m.state.sequence,1);assert.equal(m.state.permit,next)
 const firstRequest=p.writerDecode(m.socket.frames[0].subarray(4));assert.equal(firstRequest.permit,first)
 await assert.rejects(m.policy.send(m.handle,report(1),m.options()),/writer_closed/);assert.equal(m.socket.frames.length,1)
})
test('possible submission with missing ACK and abort retains one uncertain Promise and never writes again',async()=>{
 const m=model(),abort=new AbortController();let settled=false
 const promise=m.policy.send(m.handle,report(1),m.options(abort.signal));void promise.then(()=>{settled=true},()=>{settled=true})
 assert.equal(m.state.pending,true);abort.abort();await Promise.resolve();await Promise.resolve()
 assert.equal(settled,false);assert.equal(m.state.closed,true);assert.equal(m.state.uncertain,true);assert.equal(m.state.permit,null)
 await assert.rejects(m.policy.send(m.handle,report(2),m.options()),/writer_closed/);assert.equal(m.socket.frames.length,1)
})
test('malformed or mismatched ACK cannot release uncertain submission or grant a next permit',async()=>{
 for(const value of [{accepted:true,sequence:2,observed_at:'2026-10-29T00:00:00.000Z',next_permit:next},{accepted:true,sequence:1,observed_at:'bad',next_permit:next},{accepted:true,sequence:1,observed_at:'2026-10-29T00:00:00.000Z',next_permit:next,extra:true}]){
  const m=model();m.socket.onWrite=frame=>m.respond(frame,value);let settled=false
  void m.policy.send(m.handle,report(1),m.options()).then(()=>{settled=true},()=>{settled=true});await Promise.resolve();await Promise.resolve()
  assert.equal(settled,false);assert.equal(m.state.uncertain,true);assert.equal(m.state.closed,true);assert.equal(m.socket.frames.length,1)
 }
})
test('known settled terminal Root rejection closes the binding with no new permit or reconnect',async()=>{
 const m=model();m.socket.onWrite=frame=>m.respond(frame,{code:'writer_uncertain',not_dispatched:false,settled:true},false)
 await assert.rejects(m.policy.send(m.handle,report(1),m.options()),/writer_uncertain/)
 assert.equal(m.state.closed,true);assert.equal(m.state.permit,null);assert.equal(m.socket.destroyed,true)
 await assert.rejects(m.policy.send(m.handle,report(2),m.options()),/writer_closed/);assert.equal(m.socket.frames.length,1)
})
test('pre-submission abort, expired budget and encoding failure close locally without fabricating remote uncertainty or retaining a slot',async()=>{
 const aborted=model(),abort=new AbortController();abort.abort()
 await assert.rejects(aborted.policy.send(aborted.handle,report(1),aborted.options(abort.signal)),/writer_deadline/)
 assert.equal(aborted.socket.frames.length,0);assert.equal(aborted.state.pending,false);assert.equal(aborted.state.closed,true);assert.equal(aborted.state.uncertain,false)
 const expired=model();await assert.rejects(expired.policy.exchange(expired.state,{},gen,'report',performance.now()-1),/writer_deadline/)
 assert.equal(expired.socket.frames.length,0);assert.equal(expired.state.pending,false);assert.equal(expired.state.closed,true);assert.equal(expired.state.uncertain,false)
 const encoded=model(),cycle={};cycle.self=cycle
 await assert.rejects(encoded.policy.exchange(encoded.state,cycle,gen,'report',performance.now()+100),/writer_protocol_refused/)
 assert.equal(encoded.socket.frames.length,0);assert.equal(encoded.state.pending,false);assert.equal(encoded.state.closed,true);assert.equal(encoded.state.uncertain,false)
})

test('a caller deadline cannot extend the internally captured 5s ceiling and production sender has no transport factory argument',()=>{
 const m=model(),start=performance.now(),selected=m.policy.options({signal:new AbortController().signal,timeoutMs:5000,deadlineMonotonicMs:Number.MAX_VALUE})
 assert.ok(selected.deadline<=start+5005)
 const source=readFileSync(new URL('../src/worker-heartbeat-worker-sender.ts',import.meta.url),'utf8')
 assert.match(source,/openWorkerHeartbeatWorkerSender\(kind:WorkerHeartbeatKind\)/);assert.match(source,/await openWorkerHeartbeatWorkerBinding\(kind\)/)
 assert.doesNotMatch(source,/send\s*:\s*raw|pool\s*:|clock\s*:|target\s*:|fromRaw|registerBinding/)
})
