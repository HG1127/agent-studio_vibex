import test from 'node:test'
import assert from 'node:assert/strict'
import {performance} from 'node:perf_hooks'
import {readFileSync} from 'node:fs'
import {createWorkerHeartbeatBoundedReporter,WorkerHeartbeatBoundedReporterError} from '../services/pg-api/src/worker-heartbeat-bounded-reporter.ts'
import {WorkerHeartbeatReportSequenceError} from '../services/pg-api/src/worker-heartbeat-report-sequence.ts'

const generation='12345678-1234-4234-8234-123456789abc'
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms))
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no});return {promise,resolve,reject}}
const flush=async()=>{for(let i=0;i<4;i++)await Promise.resolve()}
const until=async predicate=>{const start=performance.now();while(!predicate()&&performance.now()-start<1500)await delay(1);assert.equal(predicate(),true)}
const create=(send,extra={})=>createWorkerHeartbeatBoundedReporter({generation,intervalMs:3,sendDeadlineMs:500,send,...extra})
const ready=()=>({type:'startup_checks_complete',completed:true})
const closed=work=>assert.throws(work,error=>error instanceof WorkerHeartbeatBoundedReporterError&&error.code==='worker_heartbeat_bounded_reporter_closed')
const invalid=work=>assert.throws(work,error=>error instanceof WorkerHeartbeatBoundedReporterError&&error.code==='invalid_worker_heartbeat_bounded_reporter_input')

test('construction and transitions never start I/O or timers; close before start is local and terminal',async()=>{
 let calls=0
 const r=create(()=>{calls++;return Promise.resolve()})
 assert.deepEqual(r.snapshot(),{lifecycle:'stopped',closeReason:null,io:'settled',attempts:0,inFlight:null,lastSettled:null,nextTimerScheduled:false,deadlineTimerScheduled:false})
 r.transition(ready());await delay(12);assert.equal(calls,0)
 const end=r.close();assert.equal(end.lifecycle,'closed');assert.equal(end.io,'settled');assert.equal(end.attempts,0)
 closed(()=>r.start());closed(()=>r.transition(ready()));assert.deepEqual(r.close(),end)
})

test('first send reserves a unique frozen report before caller reentry and carries a finite monotonic deadline',async()=>{
 const work=deferred();let sent,io
 const input={generation,intervalMs:5,sendDeadlineMs:500,send:(report,options)=>{sent=report;io=options;return work.promise}}
 const r=createWorkerHeartbeatBoundedReporter(input)
 input.generation='87654321-4321-4321-b321-cba987654321';input.intervalMs=1;input.send=()=>{throw Error('must_not_replace_copied_adapter')}
 try{
  r.start();for(let i=0;i<4;i++)r.start()
  assert.equal(sent.generation,generation);assert.equal(sent.sequence,1);assert.equal(sent.state,'unknown');assert.equal(sent.reason,'startup_checks_pending')
  assert.equal(Object.isFrozen(sent),true);assert.equal(Object.isFrozen(io),true);assert.ok(io.signal instanceof AbortSignal)
  assert.equal(io.timeoutMs,500);assert.ok(Number.isFinite(io.deadlineMonotonicMs)&&io.deadlineMonotonicMs>performance.now())
  assert.throws(()=>{sent.sequence=999},TypeError);assert.throws(()=>{io.timeoutMs=Infinity},TypeError)
  assert.equal(r.snapshot().attempts,1);assert.equal(r.snapshot().io,'inflight');assert.equal(r.snapshot().nextTimerScheduled,false)
 }finally{r.close();work.resolve();await flush()}
})

test('nonsettling send ignores abort: deadline never frees its I/O slot or starts accumulated retries',async()=>{
 let calls=0,signal
 const r=create((report,io)=>{calls++;signal=io.signal;return new Promise(()=>{})},{intervalMs:2,sendDeadlineMs:7})
 r.start()
 try{
  await until(()=>signal.aborted);await delay(35)
  const state=r.snapshot();assert.equal(calls,1);assert.equal(state.io,'inflight');assert.equal(state.inFlight.deadlineExpired,true);assert.equal(state.inFlight.abortRequested,true)
  assert.equal(state.lastSettled,null);assert.equal(state.nextTimerScheduled,false);assert.equal(state.deadlineTimerScheduled,false)
  const end=r.close();assert.equal(end.io,'inflight');assert.equal(end.lifecycle,'closed');assert.equal(end.nextTimerScheduled,false);assert.equal(end.deadlineTimerScheduled,false)
  await delay(15);assert.equal(calls,1);assert.equal(r.snapshot().io,'inflight')
 }finally{r.close()}
})

test('late deadline ACK releases only the actually settled slot; retry is newer and stays unavailable',async()=>{
 const first=deferred(),second=deferred(),sent=[],signals=[]
 const r=create((report,io)=>{sent.push(report);signals.push(io.signal);return sent.length===1?first.promise:second.promise},{sendDeadlineMs:8})
 r.transition(ready());r.start()
 try{
  assert.equal(sent[0].state,'ready');await until(()=>signals[0].aborted);await delay(12);assert.equal(sent.length,1)
  first.resolve({state:'ready',ack:true});await until(()=>sent.length===2)
  assert.deepEqual(sent.map(row=>row.sequence),[1,2]);assert.equal(sent[0].state,'ready')
  assert.equal(sent[1].state,'unknown');assert.equal(sent[1].reason,'loop_unavailable')
  assert.equal(r.snapshot().lastSettled.result,'resolved');assert.equal(r.snapshot().lastSettled.deadlineExpired,true)
 }finally{r.close();first.resolve();second.resolve();await flush()}
})

test('close requests abort without claiming settlement; late resolution or rejection never reopens or sends draining',async()=>{
 for(const outcome of ['resolve','reject']){
  const work=deferred(),sent=[];let signal
  const r=create((report,io)=>{sent.push(report);signal=io.signal;return work.promise})
  r.transition(ready());r.start()
  const end=r.close();assert.equal(signal.aborted,true);assert.equal(signal.reason,'worker_heartbeat_reporter_closed')
  assert.equal(end.lifecycle,'closed');assert.equal(end.io,'inflight');assert.equal(end.attempts,1)
  assert.equal(end.nextTimerScheduled,false);assert.equal(end.deadlineTimerScheduled,false)
  closed(()=>r.start());closed(()=>r.transition(ready()))
  if(outcome==='resolve')work.resolve({ready:true});else work.reject(Error('PRIVATE_IO_DETAIL'))
  await flush();assert.equal(r.snapshot().lifecycle,'closed');assert.equal(r.snapshot().io,'settled')
  await delay(10);assert.equal(sent.length,1);assert.equal(sent[0].state,'ready');assert.equal(r.close().io,'settled')
 }
})

test('close removes the next timer after completed I/O instead of emitting a final report',async()=>{
 let calls=0
 const r=create(()=>{calls++;return Promise.resolve()},{intervalMs:30})
 r.start();await flush();assert.equal(r.snapshot().nextTimerScheduled,true)
 const end=r.close();assert.equal(end.io,'settled');assert.equal(end.nextTimerScheduled,false)
 await delay(45);assert.equal(calls,1);assert.equal(r.snapshot().attempts,1)
})

test('synchronous throw and promise rejection consume distinct sequences and never expose private errors',async()=>{
 const work=deferred(),sent=[]
 const r=create(report=>{sent.push(report);if(sent.length===1)throw Error('PRIVATE_SYNC');if(sent.length===2)return Promise.reject(Error('PRIVATE_REJECTION'));return work.promise})
 r.transition(ready());r.start()
 try{
  assert.equal(r.snapshot().lastSettled.result,'threw');await until(()=>sent.length===3)
  assert.deepEqual(sent.map(row=>row.sequence),[1,2,3]);assert.equal(sent[1].state,'unknown');assert.equal(sent[2].state,'unknown')
  assert.equal(r.snapshot().lastSettled.sequence,2);assert.equal(r.snapshot().lastSettled.result,'rejected')
  assert.equal(JSON.stringify(r.snapshot()).includes('PRIVATE'),false)
 }finally{r.close();work.resolve();await flush()}
})

test('reentrant start and close inside send see the reserved slot and cannot create another send or timer',async()=>{
 const work=deferred();let r,calls=0,reentrant,closing,receiver
 r=create(function(){receiver=this;calls++;reentrant=r.start();closing=r.close();closed(()=>r.start());return work.promise})
 r.start();assert.equal(receiver,undefined);assert.equal(calls,1);assert.equal(reentrant.io,'inflight');assert.equal(reentrant.attempts,1)
 assert.equal(closing.lifecycle,'closed');assert.equal(closing.io,'inflight');assert.equal(closing.deadlineTimerScheduled,false)
 work.resolve();await flush();await delay(10);assert.equal(calls,1);assert.equal(r.snapshot().io,'settled');assert.equal(r.snapshot().lifecycle,'closed')
})

test('deadline abort-listener reentry can close but cannot restart, clear the pending slot or resurrect timers',async()=>{
 const work=deferred();let r,calls=0,closedAtAbort
 r=create((report,io)=>{calls++;io.signal.addEventListener('abort',()=>{assert.equal(r.start().io,'inflight');closedAtAbort=r.close();closed(()=>r.transition(ready()))},{once:true});return work.promise},{sendDeadlineMs:7})
 r.start()
 try{
  await until(()=>!!closedAtAbort);assert.equal(closedAtAbort.io,'inflight');assert.equal(closedAtAbort.lifecycle,'closed')
  work.resolve();await flush();await delay(12)
  assert.equal(calls,1);assert.equal(r.snapshot().nextTimerScheduled,false);assert.equal(r.snapshot().deadlineTimerScheduled,false);assert.equal(r.snapshot().lifecycle,'closed')
 }finally{r.close();work.resolve();await flush()}
})

test('a blocked event loop cannot turn an already-late resolved send into on-time completion',async()=>{
 let signal
 const r=create((report,io)=>{signal=io.signal;const start=performance.now();while(performance.now()-start<12){}return Promise.resolve()},{sendDeadlineMs:2,intervalMs:1000})
 r.start()
 try{
  assert.equal(signal.aborted,true);await flush()
  assert.equal(r.snapshot().lastSettled.result,'resolved');assert.equal(r.snapshot().lastSettled.deadlineExpired,true);assert.equal(r.snapshot().lastSettled.abortRequested,true)
 }finally{r.close()}
})

test('void and bare thenables cannot pretend detached I/O settled and never enable retries',async()=>{
 let getterCalls=0,thenCalls=0
 const getter={};Object.defineProperty(getter,'then',{get(){getterCalls++;throw Error('PRIVATE_GETTER')}})
 for(const result of [undefined,{ack:true},{then(){thenCalls++}},getter]){
  let calls=0,signal
  const r=create((report,io)=>{calls++;signal=io.signal;return result},{sendDeadlineMs:5})
  r.start()
  try{assert.equal(r.snapshot().inFlight.completion,'unobservable');await until(()=>signal.aborted);await delay(8);assert.equal(calls,1);assert.equal(r.close().io,'inflight');assert.equal(r.snapshot().nextTimerScheduled,false)}
  finally{r.close()}
 }
 assert.equal(getterCalls,0);assert.equal(thenCalls,0)
})

test('observation reentry from a native promise constructor cannot reopen a close',async()=>{
 const work=deferred();let r,calls=0,atObservation
 Object.defineProperty(work.promise,'constructor',{get(){atObservation=r.close();return Promise}})
 r=create(()=>{calls++;return work.promise});r.start()
 assert.equal(atObservation.io,'inflight');assert.equal(atObservation.lifecycle,'closed')
 work.resolve();await flush();await delay(10)
 assert.equal(calls,1);assert.equal(r.snapshot().io,'settled');assert.equal(r.snapshot().nextTimerScheduled,false)
})

test('native promise observation failure keeps an honest unobservable inflight slot',async()=>{
 const work=deferred();Object.defineProperty(work.promise,'constructor',{get(){throw Error('PRIVATE_CONSTRUCTOR')}})
 const r=create(()=>work.promise,{sendDeadlineMs:5});r.start()
 try{
  assert.equal(r.snapshot().inFlight.completion,'unobservable');await until(()=>r.snapshot().inFlight.abortRequested)
  assert.equal(r.close().io,'inflight');work.resolve();await flush();assert.equal(r.snapshot().io,'inflight');assert.equal(JSON.stringify(r.snapshot()).includes('PRIVATE'),false)
 }finally{r.close();work.resolve()}
})

test('wall-clock rollback cannot extend the monotonic deadline',async()=>{
 const work=deferred(),original=Date.now;let signal
 const r=create((report,io)=>{signal=io.signal;return work.promise},{sendDeadlineMs:8})
 try{
  Date.now=()=>original()-1000000000;r.start();await until(()=>signal.aborted)
  assert.equal(r.snapshot().inFlight.deadlineExpired,true);assert.equal(r.snapshot().attempts,1)
 }finally{Date.now=original;r.close();work.resolve();await flush()}
})

test('the original explicit drain remains terminal through a transport failure; close itself never declares drain',async()=>{
 const first=deferred(),second=deferred(),sent=[]
 const r=create(report=>{sent.push(report);return sent.length===1?first.promise:second.promise})
 r.transition(ready());r.transition({type:'drain',new_claims_closed:true})
 assert.throws(()=>r.transition(ready()),error=>error instanceof WorkerHeartbeatReportSequenceError&&error.code==='worker_heartbeat_report_sequence_draining')
 r.start()
 try{first.reject(Error('PRIVATE'));await until(()=>sent.length===2);assert.deepEqual(sent.map(row=>[row.sequence,row.state]),[[1,'draining'],[2,'draining']])}
 finally{r.close();first.resolve();second.resolve();await flush()}
})

test('even a resolved ACK advertising ready has no readiness authority and no sensitive value is read',async()=>{
 const next=deferred(),sent=[];let reads=0
 const ack={get state(){reads++;throw Error('PRIVATE_ACK')}}
 const r=create(report=>{sent.push(report);return sent.length===1?Promise.resolve(ack):next.promise})
 r.start()
 try{await until(()=>sent.length===2);assert.deepEqual(sent.map(row=>row.state),['unknown','unknown']);assert.equal(reads,0);assert.equal(sent[1].reason,'startup_checks_pending')}
 finally{r.close();next.resolve();await flush()}
})

test('cooperative abort permits retry only after its original promise rejects and preserves newer unknown sequence',async()=>{
 const next=deferred(),sent=[];let settled=false
 const r=create((report,io)=>{sent.push(report);if(sent.length>1)return next.promise;return new Promise((resolve,reject)=>io.signal.addEventListener('abort',()=>{settled=true;reject(Error('PRIVATE_ABORT'))},{once:true}))},{sendDeadlineMs:7})
 r.transition(ready());r.start()
 try{await until(()=>sent.length===2);assert.equal(settled,true);assert.equal(r.snapshot().lastSettled.result,'rejected');assert.equal(r.snapshot().lastSettled.deadlineExpired,true);assert.equal(sent[1].sequence,2);assert.equal(sent[1].state,'unknown')}
 finally{r.close();next.resolve();await flush()}
})

test('closed input rejects runtime/state/timer injection and accessors without executing getters',()=>{
 const valid={generation,intervalMs:5,sendDeadlineMs:20,send:()=>Promise.resolve()};let calls=0
 for(const name of ['state','sequence','initialSequence','clock','now','setTimeout','clearTimeout','signal','sequenceModel','logger','payload','host','ready'])invalid(()=>createWorkerHeartbeatBoundedReporter({...valid,[name]:()=>{calls++}}))
 for(const value of [0,-0,-1,0.5,NaN,Infinity,2147483648,'5',1n,new Number(5)])for(const key of ['intervalMs','sendDeadlineMs'])invalid(()=>createWorkerHeartbeatBoundedReporter({...valid,[key]:value}))
 for(const generation of ['',null,'12345678-1234-1234-8234-123456789abc','12345678-1234-4234-8234-123456789ABC'])invalid(()=>createWorkerHeartbeatBoundedReporter({...valid,generation}))
 const accessor={...valid};Object.defineProperty(accessor,'send',{enumerable:true,get(){calls++;return valid.send}})
 const hidden={...valid};Object.defineProperty(hidden,'hidden',{value:'PRIVATE'})
 for(const raw of [accessor,hidden,{...valid,[Symbol('private')]:true},new(class{generation=generation})(),null,[],new Proxy(valid,{ownKeys(){throw Error('PRIVATE_PROXY')}})])invalid(()=>createWorkerHeartbeatBoundedReporter(raw))
 assert.equal(calls,0)
 const r=createWorkerHeartbeatBoundedReporter(Object.assign(Object.create(null),valid));assert.equal(Object.isFrozen(r),true);r.close()
})

test('frozen snapshots expose only local settlement and source has no I/O, process hooks, race-cancellation or clock provider',async()=>{
 const work=deferred(),r=create(()=>work.promise);r.start()
 const state=r.snapshot();assert.equal(Object.isFrozen(state),true);assert.equal(Object.isFrozen(state.inFlight),true)
 assert.throws(()=>{state.inFlight.abortRequested=true},TypeError);assert.throws(()=>{r.start=()=>{}},TypeError)
 assert.equal(r.snapshot().inFlight.abortRequested,false)
 r.close();work.resolve();await flush();assert.equal(Object.isFrozen(r.snapshot().lastSettled),true)
 const source=readFileSync(new URL('../services/pg-api/src/worker-heartbeat-bounded-reporter.ts',import.meta.url),'utf8')
 assert.doesNotMatch(source,/Promise\.race|setInterval\s*\(|Date\.now\s*\(|process\.(?:on|once|addListener|off|removeListener)|console\.|fetch\s*\(/)
 const imports=[...source.matchAll(/from ['"]([^'"]+)['"]/g)].map(match=>match[1])
 assert.deepEqual(imports,['node:perf_hooks','node:timers','./worker-heartbeat-report-sequence.ts'])
})
