import test from 'node:test'
import assert from 'node:assert/strict'
import {createOriginalAgentRunTransport} from '../src/lib/originalAgentRunTransport.ts'
import {createOriginalRunDetailTransport} from '../src/lib/originalRunDetailTransport.ts'
const employee='11111111-1111-4111-8111-111111111111',route='/__pg_native/api/v2/agent-autonomous-runs/'+employee,tick=()=>new Promise(resolve=>setImmediate(resolve)),jsonText='{"text":"实际响应😀"}',bytes=new TextEncoder().encode(jsonText)
function observed(body=bytes,{declared,media='application/json',status=200,stall=false}={}){
 const counts={read:0,cancel:0,readerCancel:0,release:0,pull:0},stream=new ReadableStream({start(c){if(!stall){c.enqueue(body);c.close()}else c.enqueue(new Uint8Array([123]))},pull(){counts.pull++},cancel(){counts.cancel++}})
 const response=new Response(stream,{status,headers:{'content-type':media,...(declared===undefined?{}:{'content-length':String(declared)})}}),original=response.body.getReader.bind(response.body)
 response.body.getReader=()=>{const reader=original(),read=reader.read.bind(reader),release=reader.releaseLock.bind(reader),cancel=reader.cancel.bind(reader);reader.read=(...args)=>{counts.read++;return read(...args)};reader.releaseLock=()=>{counts.release++;return release()};reader.cancel=(...args)=>{counts.readerCancel++;return cancel(...args)};return reader}
 return{response,counts}
}
for(const[name,create,prefix]of [['AgentRun',createOriginalAgentRunTransport,'original_run'],['RunDetail',createOriginalRunDetailTransport,'original_detail']]){
 function fixture(options={}){const calls=[];let verifies=0;const api=create({employeeId:employee,timeoutMs:options.timeoutMs??1000,verifyEmployee:async()=>{verifies++;return options.verify?options.verify(verifies):employee},transport:async(url,init)=>{calls.push({url,init});return options.send(url,init)}});return{api,calls,verifies:()=>verifies}}
 test(name+' keeps a complete UTF8 response and releases its reader without abort/cancel, including later close',async()=>{
  const r=observed(bytes,{declared:bytes.length}),f=fixture({send:()=>r.response}),result=await f.api.transport(route);assert.deepEqual(await result.json(),{text:'实际响应😀'});assert.equal(r.counts.release,1);assert.equal(r.counts.cancel,0);assert.equal(r.counts.readerCancel,0);assert.equal(f.calls[0].init.signal.aborted,false);assert.equal(f.verifies(),2);f.api.close();assert.equal(f.calls[0].init.signal.aborted,false)
 })
 for(const[kind,body]of [['malformed JSON',new TextEncoder().encode('{')],['invalid UTF8',Uint8Array.from([123,34,120,34,58,34,255,34,125])]])test(name+' refuses complete '+kind+' while preserving the completed underlying response',async()=>{
  const r=observed(body),f=fixture({send:()=>r.response});await assert.rejects(f.api.transport(route),e=>e.code===prefix+'_response_refused');assert.equal(f.calls[0].init.signal.aborted,false);assert.equal(r.counts.cancel,0);assert.equal(r.counts.readerCancel,0);assert.equal(r.counts.release,1);f.api.close()
 })
 for(const declared of [bytes.length+1,1048577,'01','-1'])test(name+' aborts and cancels incomplete or invalid declared byte length '+declared,async()=>{
  const r=observed(bytes,{declared}),f=fixture({send:()=>r.response});await assert.rejects(f.api.transport(route));assert.equal(f.calls[0].init.signal.aborted,true);assert.equal(r.counts.cancel,declared===bytes.length+1?0:1);assert.equal(r.counts.release,1);f.api.close()
 })
 test(name+' cancels a refused media body before acquiring its reader',async()=>{
  const r=observed(bytes,{media:'text/html'}),f=fixture({send:()=>r.response});await assert.rejects(f.api.transport(route),e=>e.code===prefix+'_response_refused');assert.equal(f.calls[0].init.signal.aborted,true);assert.equal(r.counts.read,0);assert.equal(r.counts.cancel,1);f.api.close()
 })
 test(name+' preserves an actual full HTTP refusal status for the owning API decoder',async()=>{
  const r=observed(new TextEncoder().encode('{"error":"forbidden"}'),{status:403}),f=fixture({send:()=>r.response});const response=await f.api.transport(route);assert.equal(response.status,403);assert.deepEqual(await response.json(),{error:'forbidden'});assert.equal(f.calls[0].init.signal.aborted,false);assert.equal(r.counts.cancel,0);f.api.close()
 })
 test(name+' timeout cancels a partial reader and never resumes decoding or emits late success',async()=>{
  const r=observed(bytes,{stall:true}),f=fixture({send:()=>r.response,timeoutMs:15});await assert.rejects(f.api.transport(route),e=>e.code===prefix+'_read_unavailable');await tick();assert.equal(f.calls[0].init.signal.aborted,true);assert.equal(r.counts.cancel,1);assert.equal(r.counts.release,1);const count=r.counts.read;await tick();assert.equal(r.counts.read,count);f.api.close()
 })
 test(name+' caller abort retires the pending reader without another read or send',async()=>{
  const r=observed(bytes,{stall:true}),f=fixture({send:()=>r.response}),abort=new AbortController(),work=f.api.transport(route,{signal:abort.signal});await tick();abort.abort();await assert.rejects(work,e=>e.code===prefix+'_read_unavailable');await tick();assert.equal(r.counts.cancel,1);assert.equal(r.counts.release,1);assert.equal(f.calls.length,1);f.api.close()
 })
 for(const reason of ['close','deadline'])test(name+' '+reason+' rejects an uncooperative fetch and cancels its eventual response unread',async()=>{
  let resolve,pulls=0,cancels=0;const wait=new Promise(done=>{resolve=done}),f=fixture({send:()=>wait,timeoutMs:reason==='deadline'?15:1000}),work=f.api.transport(route);await tick();if(reason==='close')f.api.close();await assert.rejects(work,e=>e.code===prefix+'_read_unavailable');resolve(new Response(new ReadableStream({pull(){pulls++},cancel(){cancels++}},{highWaterMark:0}),{headers:{'content-type':'application/json'}}));await tick();assert.equal(pulls,0);assert.equal(cancels,1);assert.equal(f.calls.length,1);assert.equal(f.calls[0].init.signal.aborted,true);f.api.close()
 })
 test(name+' closing during post-EOF identity verification denies the value without aborting completed HTTP',async()=>{
  let resolve;const wait=new Promise(done=>{resolve=done}),r=observed(),f=fixture({send:()=>r.response,verify:n=>n===2?wait:employee}),work=f.api.transport(route);await tick();assert.equal(f.verifies(),2);f.api.close();await assert.rejects(work,e=>e.code===prefix+'_read_unavailable');assert.equal(f.calls[0].init.signal.aborted,false);assert.equal(r.counts.cancel,0);assert.equal(r.counts.release,1);resolve(employee);await tick()
 })
 test(name+' a pre-aborted request performs no fetch',async()=>{const f=fixture({send:()=>{throw Error('must not send')}}),abort=new AbortController();abort.abort();await assert.rejects(f.api.transport(route,{signal:abort.signal}));assert.equal(f.calls.length,0);f.api.close()})
}
