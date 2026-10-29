// Pure actual-function comparison models. No IPC socket, PG or service launch.
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {performance} from 'node:perf_hooks'
import {createWorkerHeartbeatBoundedReporter} from '../src/worker-heartbeat-bounded-reporter.ts'
import {writerLimits,WorkerHeartbeatWriterError} from '../src/worker-heartbeat-writer-protocol.ts'
import {openKnowledgeWorkerHeartbeatLifecycles as actualOpenPair} from '../src/knowledge-worker-heartbeat-lifecycle.ts'
const require=createRequire(import.meta.url),ts=require('typescript'),root=path.resolve(import.meta.dirname,'../../..'),read=file=>fs.readFileSync(path.join(root,file),'utf8'),pair=read('services/pg-api/src/knowledge-worker-heartbeat-lifecycle.ts'),single=read('services/pg-api/src/worker-heartbeat-worker-lifecycle.ts')
function fn(text,name){const tree=ts.createSourceFile('model.ts',text,ts.ScriptTarget.Latest,true),node=tree.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text===name);assert.ok(node,name);return node.getText(tree)}
function load(source,names,globals={}){const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;return Function('exports',...Object.keys(globals),js+'\nreturn {'+names.join(',')+'}')(Object.create(null),...Object.values(globals))}
const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve()},deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done});return {promise,resolve}}
const ids=['00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002'],report=(sequence=1)=>({protocol:'native_worker_heartbeat_report_v1',generation:ids[0],sequence,state:'unknown',reason:'startup_checks_pending'}),options=(ms=5000)=>({signal:new AbortController().signal,timeoutMs:ms,deadlineMonotonicMs:performance.now()+ms})
function model({failSecond=false,abortAfterFirst,brokenSink=false}={}){
 const trace=[],events=[],gates=[],senders=[];let busy=0,maxBusy=0
 const open=async kind=>{trace.push('bind_'+kind);if(busy||failSecond&&kind==='knowledge_query')throw new WorkerHeartbeatWriterError('writer_busy');const sender={generation:ids[senders.length],async send(value,selected){trace.push({kind,value,options:selected});if(busy)throw new WorkerHeartbeatWriterError('writer_busy');busy++;maxBusy=Math.max(busy,maxBusy);const gate=deferred();gates.push(gate);try{await gate.promise}finally{busy--}},snapshot:()=>({lifecycle:'open',io:'settled',outcome:'none'}),close(){trace.push('close_'+kind);return {lifecycle:'closed',io:'settled',outcome:'none'}}};senders.push(sender);if(senders.length===1)abortAfterFirst?.abort();return sender}
 const globals={now:performance.now.bind(performance),setTimeout,clearTimeout,AbortSignal,WorkerHeartbeatWriterError,writerLimits,writerFail:code=>{throw new WorkerHeartbeatWriterError(code)},openWorkerHeartbeatWorkerSender:open,createWorkerHeartbeatBoundedReporter,process:{env:{AGENT_STUDIO_PG_WORKER_HEARTBEAT_ENABLED:'true'},stderr:{write:text=>{if(brokenSink)throw Error('sink');events.push(JSON.parse(text))}}}}
 const names=['knowledgeHeartbeatSendQueue','pairedLifecycle','observeKnowledgeHeartbeatFailure','openKnowledgeWorkerHeartbeatLifecycles'],api=load(names.map(name=>fn(pair,name)).join('\n'),names,globals),old=load(fn(single,'openWorkerHeartbeatWorkerLifecycle'),['openWorkerHeartbeatWorkerLifecycle'],{...globals,writerKind:value=>value}).openWorkerHeartbeatWorkerLifecycle
 return {api,old,trace,events,gates,senders,maxBusy:()=>maxBusy,release(){for(const gate of gates)gate.resolve()}}
}

test('actual old lifecycle starts index report before second bind and reproduces original Broker busy rejection',async()=>{
 const m=model();let first
 try{first=await m.old('knowledge_index');assert.equal(m.trace[0],'bind_knowledge_index');assert.equal(m.trace[1].kind,'knowledge_index');await assert.rejects(m.old('knowledge_query'),error=>error.code==='writer_busy')}
 finally{first?.close();m.release();await flush()}
})
test('actual pair binds both original fixed senders before first report and serializes two unknown startup reports within unchanged budgets',async()=>{
 const m=model();let pair
 try{pair=await m.api.openKnowledgeWorkerHeartbeatLifecycles({index:true,query:true},new AbortController().signal);assert.deepEqual(m.trace.slice(0,2),['bind_knowledge_index','bind_knowledge_query']);pair.index.startupChecksComplete();pair.query.startupChecksComplete();await flush();assert.equal(m.gates.length,1);const first=m.trace.find(v=>typeof v==='object');assert.equal(first.value.state,'unknown');assert.equal(first.options.timeoutMs,5000);m.gates[0].resolve();await flush();assert.equal(m.gates.length,2);const calls=m.trace.filter(v=>typeof v==='object');assert.equal(calls[1].value.state,'unknown');assert.equal(calls[1].value.sequence,1);assert.equal(calls[1].options.timeoutMs,5000);assert.equal(m.maxBusy(),1)}
 finally{pair?.index?.close();pair?.query?.close();m.release();await flush()}
})
test('waiting abort never dispatches, extends a deadline, retries or releases an unobserved first I/O gate',async()=>{
 const m=model(),queue=m.api.knowledgeHeartbeatSendQueue(),first=deferred();let calls=0,settled=false
 const a={generation:ids[0],send:async()=>{calls++;await first.promise},close(){}},b={generation:ids[1],send:async()=>{calls++},close(){}}
 const original=options(),work=queue.wrap(a)(report(),original);void work.then(()=>{settled=true});await flush();const abort=new AbortController(),next={signal:abort.signal,timeoutMs:30,deadlineMonotonicMs:performance.now()+30},rejected=assert.rejects(queue.wrap(b)(report(),next),error=>error.code==='writer_deadline')
 abort.abort();await rejected;queue.close(a);await flush();assert.equal(calls,1);assert.equal(settled,false);first.resolve();await work;assert.equal(calls,1)
})
test('actual waiting deadline expires while an abort-ignoring first sender remains unobserved, with no second I/O',async()=>{
 const m=model(),queue=m.api.knowledgeHeartbeatSendQueue(),held=deferred(),abort=new AbortController();let calls=0,settled=false
 const first={send:async()=>{calls++;await held.promise}},second={send:async()=>{calls++}},one=queue.wrap(first)(report(),{...options(),signal:abort.signal});void one.then(()=>{settled=true});await flush()
 const start=performance.now(),two=queue.wrap(second)(report(),options(35));abort.abort();await assert.rejects(two,error=>error.code==='writer_deadline');assert.ok(performance.now()-start>=20);assert.equal(calls,1);assert.equal(settled,false);held.resolve();await one;await flush();assert.equal(calls,1)
})
test('actual queue forwards original options/deadline and report objects unchanged and starts each adapter exactly once',async()=>{
 const m=model(),queue=m.api.knowledgeHeartbeatSendQueue(),held=deferred(),calls=[],a={send:async(r,o)=>{calls.push([r,o]);await held.promise}},b={send:async(r,o)=>calls.push([r,o])},ra=report(),rb=report(2),oa=options(),ob=options(),one=queue.wrap(a)(ra,oa),two=queue.wrap(b)(rb,ob)
 await flush();assert.equal(calls.length,1);held.resolve();await Promise.all([one,two]);assert.equal(calls.length,2);assert.equal(calls[0][0],ra);assert.equal(calls[0][1],oa);assert.equal(calls[1][0],rb);assert.equal(calls[1][1],ob)
 let count=0;const failing={send:async()=>{count++;throw new WorkerHeartbeatWriterError('writer_busy')}};await assert.rejects(queue.wrap(failing)(report(),options()),error=>error.code==='writer_busy');assert.equal(count,1)
})
test('expired, closed or invalid queued sends cannot invoke a sender',async()=>{
 const m=model(),queue=m.api.knowledgeHeartbeatSendQueue();let calls=0;const sender={send:async()=>{calls++}}
 await assert.rejects(queue.wrap(sender)(report(),{...options(),deadlineMonotonicMs:performance.now()-1}),error=>error.code==='writer_deadline');queue.close(sender);await assert.rejects(queue.wrap(sender)(report(),options()),error=>error.code==='writer_closed')
 await assert.rejects(queue.wrap(sender)(report(),{...options(),timeoutMs:5001}),error=>error.code==='writer_protocol_refused');assert.equal(calls,0)
})
test('partial second-binding failure closes original owned sender without starting reports and preserves the original failure',async()=>{
 const m=model({failSecond:true});await assert.rejects(m.api.openKnowledgeWorkerHeartbeatLifecycles({index:true,query:true},new AbortController().signal),error=>error.code==='writer_busy');assert.deepEqual(m.trace,['bind_knowledge_index','bind_knowledge_query','close_knowledge_index']);assert.deepEqual(m.events,[{event:'knowledge_heartbeat_failure_observation',phase:'open_query_sender',code:'writer_busy',observed_data_only:true}])
})
test('startup signal after first actual binding closes it and returns stopped pair without second bind, report or fake ready',async()=>{
 const controller=new AbortController(),m=model({abortAfterFirst:controller}),pair=await m.api.openKnowledgeWorkerHeartbeatLifecycles({index:true,query:true},controller.signal);assert.deepEqual(pair,{index:null,query:null});assert.deepEqual(m.trace,['bind_knowledge_index','close_knowledge_index']);assert.equal(m.events.length,0)
})
test('actual exported factory remains default off with no real credential, IPC or reporter I/O',async()=>{
 const saved=process.env.AGENT_STUDIO_PG_WORKER_HEARTBEAT_ENABLED
 try{process.env.AGENT_STUDIO_PG_WORKER_HEARTBEAT_ENABLED='false';assert.deepEqual(await actualOpenPair({index:true,query:true},new AbortController().signal),{index:null,query:null})}
 finally{if(saved===undefined)delete process.env.AGENT_STUDIO_PG_WORKER_HEARTBEAT_ENABLED;else process.env.AGENT_STUDIO_PG_WORKER_HEARTBEAT_ENABLED=saved}
})
test('phase/code diagnostics contain only closed values and sink failures do not replace original errors',async()=>{
 const m=model(),observe=m.api.observeKnowledgeHeartbeatFailure;observe('open_query_sender',{code:'writer_busy',cookie:'private',stack:'private SQL'});assert.deepEqual(m.events[0],{event:'knowledge_heartbeat_failure_observation',phase:'open_query_sender',code:'writer_busy',observed_data_only:true});observe('private phase',{});assert.equal(m.events.length,1);observe('open_index_sender',{code:'private text'});assert.equal(m.events[1].code,null)
 const bad=model({failSecond:true,brokenSink:true});await assert.rejects(bad.api.openKnowledgeWorkerHeartbeatLifecycles({index:true,query:true},new AbortController().signal),error=>error.code==='writer_busy')
})
test('entry keeps actual Worker construction, claim-close/abort and both startup attestations after the paired factory',()=>{
 const source=read('services/pg-api/src/knowledge-index-service.ts'),open=source.indexOf('await openKnowledgeWorkerHeartbeatLifecycles'),index=source.indexOf('new KnowledgeIndexWorker',open),query=source.indexOf('new KnowledgeQueryWorker',open),ready=source.indexOf('indexHeartbeat?.startupChecksComplete();queryHeartbeat?.startupChecksComplete()',open);assert.ok(open>0&&index>open&&query>index&&ready>query);assert.ok(source.indexOf('if(controller.signal.aborted){stop();return',open)<ready)
 assert.match(source,/closeWorkerClaims=\(\)=>\{index\?\.closeNewClaims\(\);query\?\.closeNewClaims\(\)\}/);assert.match(source,/if\(claimsClosed\?\.\(\)\)\{indexHeartbeat\?\.newClaimsClosed\(\);queryHeartbeat\?\.newClaimsClosed\(\)\}/);assert.match(pair,/intervalMs:writerLimits.intervalMs,sendDeadlineMs:writerLimits.sendMs/);assert.equal(writerLimits.intervalMs,30000);assert.equal(writerLimits.sendMs,5000)
})
test('owned launcher/parent forward only exact Knowledge diagnostic shape and retain unknown-output discard',()=>{
 const child=read('services/pg-api/tests/helpers/worker-heartbeat-writer-ci-child.mjs'),fixture=read('services/pg-api/tests/helpers/worker-heartbeat-writer-ci-fixture.mjs'),output=load(fn(child,'knowledgeHeartbeatOutputObservation'),['knowledgeHeartbeatOutputObservation']).knowledgeHeartbeatOutputObservation
 const fail=()=>{throw Error('closed data')},fields=load(fn(fixture,'fields'),['fields'],{fail}).fields,parent=load(fn(fixture,'writerKnowledgeHeartbeatFailureObservation'),['writerKnowledgeHeartbeatFailureObservation'],{fields}).writerKnowledgeHeartbeatFailureObservation
 const good={event:'knowledge_heartbeat_failure_observation',phase:'open_query_sender',code:'writer_busy',observed_data_only:true},event=output('knowledge_index','stderr',JSON.stringify(good));assert.ok(event);assert.deepEqual(parent(event,['knowledge_index','knowledge_query']),event)
 for(const value of [{...good,cookie:'private'},{...good,phase:'arbitrary'},{...good,code:'private SQL'},{...good,code:['writer_busy']}])assert.equal(output('knowledge_index','stderr',JSON.stringify(value)),null)
 assert.equal(output('model','stderr',JSON.stringify(good)),null);assert.equal(output('knowledge_index','stdout',JSON.stringify(good)),null);assert.equal(parent({...event,pid:4},['knowledge_index']),null);assert.equal(parent(event,['model']),null)
 assert.match(child,/if\(bytes>65536\)/);assert.match(fixture,/if\(c.outputBytes>65536\)/)
})
