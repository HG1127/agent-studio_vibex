// Actual API functions; all responses and transports are inert terminal DATA.
// No browser, HTTP server, SQL, Worker or provider is started.
import test from 'node:test'
import assert from 'node:assert/strict'
import {createOriginalSchedulesApi,prepareOriginalScheduleIntent} from '../src/lib/originalSchedulesApi.ts'
import {createOriginalVersionReleaseApi} from '../src/lib/originalVersionReleaseApi.ts'
import * as schedule from './helpers/original-schedules-terminal-data.mjs'
import * as release from './helpers/original-version-release-terminal-data.mjs'
const json=value=>new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json'}})
const schedulesCap=schedule.envelope({metadata_writes_enabled:true,automatic_execution_enabled:true,pause_enabled:true,worker_alive:null,history_retained_after_delete:true})
const releasesCap={mode:'native_pg18',config_writes_enabled:true,agent_releases_available:true,agent_release_acceptance_enabled:true,autonomous_agent_submission_enabled:true}
async function client(kind,options={}){
 const calls=[],records=[]
 const intent=kind==='schedule'?await prepareOriginalScheduleIntent(schedule.operation(),schedule.E):null
 const choice={action:'snapshot',request_id:release.Q,expected_spec_revision:3,source_sha256:release.A,note:'',test_run_id:null}
 const cap=kind==='schedule'?schedulesCap:releasesCap
 const ack=kind==='schedule'?schedule.envelope(schedule.receipt(intent.operation)):release.envelope({spec_id:release.S,request_id:release.Q,replayed:false,version_id:release.V,version_sha256:release.D,version_no:13,version_revision:1,release_revision:2,status:'draft',source_sha256:release.A,test_passed:false})
 const transport=async(path,init)=>{
  calls.push({path,init});const record={method:init.method,aborts:0,cancels:0,releases:0,reads:0};records.push(record);init.signal.addEventListener('abort',()=>record.aborts++,{once:true})
  const selected=options.reply?.(init.method,record),response=selected===undefined?json(init.method==='GET'?cap:ack):await selected
  if(response.body){const stream=response.body,get=stream.getReader.bind(stream);Object.defineProperty(stream,'getReader',{value(){const reader=get();return{read(){record.reads++;return reader.read()},cancel(){record.cancels++;return reader.cancel()},releaseLock(){record.releases++;return reader.releaseLock()}}}})}
  return response
 }
 const api=kind==='schedule'?createOriginalSchedulesApi({employeeId:schedule.E,rootPath:'',transport,timeoutMs:options.timeoutMs??8000}):createOriginalVersionReleaseApi({employeeId:release.E,rootPath:'',transport,timeoutMs:options.timeoutMs??8000})
 return {calls,records,cap,ack,read:signal=>api.capabilities(signal),write:signal=>kind==='schedule'?api.change(intent.operation,intent.pending,signal):api.change(release.S,choice,signal)}
}
for(const kind of ['schedule','release']){
 for(const method of ['GET','POST'])test(kind+' complete '+method+' releases its reader without aborting or cancelling the acknowledged HTTP response',async()=>{
  const f=await client(kind);await(method==='GET'?f.read():f.write());for(const row of f.records){assert.equal(row.aborts,0);assert.equal(row.cancels,0);assert.equal(row.releases,1);assert(row.reads>=1)}assert.equal(f.calls.filter(r=>r.init.method==='POST').length,method==='POST'?1:0)
  for(const {init}of f.calls){assert.equal(init.credentials,'same-origin');assert.equal(init.cache,'no-store');assert.equal(init.redirect,'error');assert.equal(init.signal.aborted,false);assert.equal(init.headers['X-Rh-User-Id'],undefined);assert.equal(init.headers.Authorization,undefined)}
 })
 test(kind+' complete server refusal stays definite without cancelling or retrying its response',async()=>{
  const code=kind==='schedule'?'original_schedule_source_changed':'agent_release_source_changed',f=await client(kind,{reply:method=>method==='POST'?new Response(JSON.stringify({error:code}),{status:409,headers:{'Content-Type':'application/json'}}):undefined})
  await assert.rejects(f.write(),e=>e.status===409&&e.code===code&&!e.outcomeUnknown);const post=f.records.find(r=>r.method==='POST');assert.equal(post.aborts,0);assert.equal(post.cancels,0);assert.equal(post.releases,1);assert.equal(f.calls.filter(r=>r.init.method==='POST').length,1)
 })
 for(const method of ['GET','POST'])test(kind+' incomplete '+method+' body still aborts and cancels at the existing finite response deadline',async()=>{
  let cancelled=0;const f=await client(kind,{timeoutMs:15,reply:actual=>actual===method?new Response(new ReadableStream({start(c){c.enqueue(new TextEncoder().encode('{'))},cancel(){cancelled++}}),{headers:{'Content-Type':'application/json'}}):undefined})
  await assert.rejects(method==='GET'?f.read():f.write(),e=>e.status===0&&e.outcomeUnknown===(method==='POST'));await new Promise(r=>setImmediate(r));const target=f.records.find(r=>r.method===method);assert.equal(target.aborts,1);assert.equal(target.cancels,1);assert.equal(cancelled,1);assert.equal(f.calls.filter(r=>r.init.method==='POST').length,method==='POST'?1:0)
 })
 for(const method of ['GET','POST'])test(kind+' late '+method+' response after deadline is cancelled unread and cannot settle or replay the request',async()=>{
  let deliver,cancelled=0,pulls=0;const deferred=new Promise(resolve=>{deliver=resolve}),f=await client(kind,{timeoutMs:15,reply:actual=>actual===method?deferred:undefined})
  await assert.rejects(method==='GET'?f.read():f.write(),e=>e.status===0&&e.outcomeUnknown===(method==='POST'));deliver(new Response(new ReadableStream({pull(){pulls++},cancel(){cancelled++}},{highWaterMark:0}),{headers:{'Content-Type':'application/json'}}));await new Promise(r=>setImmediate(r));assert.equal(cancelled,1);assert.equal(pulls,0);const target=f.records.find(r=>r.method===method);assert.equal(target.aborts,1);assert.equal(target.reads,0);assert.equal(f.calls.filter(r=>r.init.method==='POST').length,method==='POST'?1:0)
 })
 for(const body of ['length','oversize','invalid-json'])test(kind+' '+body+' POST remains unconfirmed with no retry and unchanged response bounds',async()=>{
  const f=await client(kind,{reply:method=>method==='POST'?(body==='length'?new Response('{}',{headers:{'Content-Type':'application/json','Content-Length':'3'}}):body==='oversize'?new Response('x'.repeat(1048577),{headers:{'Content-Type':'application/json'}}):new Response('{',{headers:{'Content-Type':'application/json'}})):undefined})
  await assert.rejects(f.write(),e=>e.outcomeUnknown);assert.equal(f.calls.filter(r=>r.init.method==='POST').length,1);const target=f.records.find(r=>r.method==='POST');assert.equal(target.aborts,body==='invalid-json'?0:1)
 })
 test(kind+' preaborted metadata read never calls transport',async()=>{const f=await client(kind),abort=new AbortController();abort.abort();await assert.rejects(f.read(abort.signal),e=>e.status===0&&!e.outcomeUnknown);assert.equal(f.calls.length,0)})
}
