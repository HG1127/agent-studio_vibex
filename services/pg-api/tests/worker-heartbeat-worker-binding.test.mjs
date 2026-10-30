import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {openWorkerHeartbeatWorkerBinding,describeWorkerHeartbeatWorkerBinding,sendWorkerHeartbeatBoundReport,snapshotWorkerHeartbeatWorkerBinding,closeWorkerHeartbeatWorkerBinding} from '../src/worker-heartbeat-worker-binding.ts'
test('raw, cloned, proxy and getter handles refuse without manufacturing an actual socket binding',async()=>{
 let gets=0
 const getter={};Object.defineProperty(getter,'generation',{get(){gets++;return'12345678-1234-4234-8234-123456789abc'}})
 for(const handle of [{},Object.freeze({}),structuredClone({}),getter,new Proxy({},{get(){gets++;throw Error('getter must not run')}})]){
  assert.throws(()=>describeWorkerHeartbeatWorkerBinding(handle),/writer_not_enrolled/)
  assert.throws(()=>snapshotWorkerHeartbeatWorkerBinding(handle),/writer_not_enrolled/)
  assert.throws(()=>closeWorkerHeartbeatWorkerBinding(handle),/writer_not_enrolled/)
  await assert.rejects(sendWorkerHeartbeatBoundReport(handle,{},{}),/writer_not_enrolled/)
 }
 assert.equal(gets,0)
})
test('factory accepts only a kind; target/Pool/clock/credential objects cannot become authority',async()=>{
 for(const raw of [{kind:'prepare',target:'anything'},{pool:{}},{clock:()=>0},'../reader','reader',null])await assert.rejects(openWorkerHeartbeatWorkerBinding(raw),/writer_protocol_refused/)
 if(process.platform!=='linux')await assert.rejects(openWorkerHeartbeatWorkerBinding('prepare'),/writer_not_enrolled/)
})
test('successful binding insertion follows real socket, Root endpoint observation and actual authenticated hello',()=>{
 const source=readFileSync(new URL('../src/worker-heartbeat-worker-binding.ts',import.meta.url),'utf8')
 const open=source.slice(source.indexOf('export async function openWorkerHeartbeatWorkerBinding'))
 assert.ok(open.indexOf('net.createConnection')<open.indexOf('bindings.set(handle,s)'))
 assert.ok(open.indexOf('hello.generation!==credential.generation')<open.indexOf('bindings.set(handle,s)'))
 assert.match(source,/new WeakMap<object,Binding>/);assert.match(source,/readWorkerHeartbeatWriterCredential\(kind\)/)
 assert.doesNotMatch(source,/fromRaw|registerBinding|new Pool|import\(['"]pg['"]\)|Date\.now\(|clock\s*:/)
 assert.match(source,/Math\.min\(now\(\)\+writerLimits.sendMs,now\(\)\+v.timeoutMs,v.deadlineMonotonicMs\)/)
})
