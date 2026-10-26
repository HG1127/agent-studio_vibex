import test from 'node:test'
import assert from 'node:assert/strict'
import {createPgNativeOutcomeMemorySession} from '../src/lib/pgNativeAgentOutcomeMemorySession.ts'
import {PgNativePilotError} from '../src/lib/pgNativePilotApi.ts'
const run='22222222-2222-4222-8222-222222222222',other='33333333-3333-4333-8333-333333333333',request='44444444-4444-4444-8444-444444444444'
const pending={enabled:true,protocol:'agent_memory_outcome_v1',run_id:run,spec_id:other,spec_revision:1,intent_sha256:'a'.repeat(64),memory_id:request,stopped:false,state:'pending',result:null}
const turn=()=>new Promise(resolve=>setImmediate(resolve))
async function fixture(){
  const calls=[];let keys=0
  const api={getAgentOutcomeMemory:async id=>({...pending,run_id:id}),stopAgentOutcomeMemory:async body=>{calls.push(['stop',structuredClone(body)]);throw new PgNativePilotError(0,'lost')},confirmAgentOutcomeStop:async body=>{calls.push(['confirm',structuredClone(body)]);return {run_id:body.run_id,request_id:body.request_id,intent_sha256:body.expected_intent_sha256,stopped:true,recorded:true,replayed:true}}}
  const model=createPgNativeOutcomeMemorySession(api,{key:()=>{keys++;return request}});model.setAvailable(true);model.setActive(true);await model.select(run);return {model,api,calls,keys:()=>keys}
}
test('explicit privacy stop freezes one original request and coalesces ambiguous duplicates',async()=>{
  const f=await fixture();await f.model.stop(false);assert.equal(f.calls.length,0)
  const first=f.model.stop(true),second=f.model.stop(true);assert.equal(first,second);await first
  assert.equal(f.keys(),1);assert.equal(f.calls.length,1);const frozen=structuredClone(f.calls[0][1])
  await f.model.select(other);assert.equal(f.model.snapshot().runId,run);assert.match(f.model.snapshot().error,/原任务/)
  await f.model.retrySameRequest();assert.deepEqual(f.calls[1][1],frozen);assert.equal(f.keys(),1)
  await f.model.confirm();assert.deepEqual(f.calls[2][1],frozen);assert.equal(f.model.snapshot().pending,null);assert.equal(f.model.snapshot().status.stopped,true)
  await f.model.stop(true);assert.equal(f.calls.length,3);assert.equal(f.keys(),1);f.model.dispose()
})
test('navigation and capability outage hide state but retain the same original stop for read-only confirmation',async()=>{
  const f=await fixture();await f.model.stop(true);const body=f.calls[0][1]
  f.model.setActive(false);assert.equal(f.model.snapshot().runId,null);assert.equal(f.model.snapshot().pending,null)
  f.model.setAvailable(false);f.model.setActive(true);await f.model.confirm();assert.equal(f.calls.length,1)
  f.model.setAvailable(true);await turn();assert.equal(f.model.snapshot().pending.request_id,request)
  await f.model.confirm();assert.deepEqual(f.calls.at(-1)[1],body);assert.equal(f.model.snapshot().pending,null);f.model.dispose()
})
test('an older task read cannot repaint a newly selected task or a confirmed privacy stop',async()=>{
  const f=await fixture();let resolve
  f.api.getAgentOutcomeMemory=()=>new Promise(done=>{resolve=done});const old=f.model.refresh();await turn()
  f.api.getAgentOutcomeMemory=async id=>({...pending,run_id:id});await f.model.select(other);resolve(pending);await old;assert.equal(f.model.snapshot().status.run_id,other)
  await f.model.select(run);await f.model.stop(true);await f.model.confirm();assert.equal(f.model.snapshot().pending,null);f.model.dispose()
})
test('logout/disposal fences a late stop reply and cannot recreate another employee request',async()=>{
  const f=await fixture();let resolve
  f.api.stopAgentOutcomeMemory=body=>{f.calls.push(['stop',body]);return new Promise(done=>{resolve=done})}
  const work=f.model.stop(true);await turn();f.model.dispose();resolve({run_id:run,request_id:request,intent_sha256:pending.intent_sha256,stopped:true,recorded:true,replayed:false});await work
  assert.equal(f.model.snapshot().runId,null);assert.equal(f.model.snapshot().pending,null);await f.model.retrySameRequest();assert.equal(f.calls.length,1)
})
test('expired Cookie clears the employee session and never retries a terminal task',async()=>{
  let expired=0;const api={getAgentOutcomeMemory:async()=>{throw new PgNativePilotError(401,'expired')},stopAgentOutcomeMemory:async()=>{throw Error('unexpected stop')},confirmAgentOutcomeStop:async()=>{throw Error('unexpected confirm')}}
  const model=createPgNativeOutcomeMemorySession(api,{onExpired:()=>{expired++}});model.setAvailable(true);model.setActive(true);await model.select(run)
  assert.equal(expired,1);assert.equal(model.snapshot().runId,null);await model.stop(true);await model.confirm();assert.equal(expired,1)
})
test('missing original receipt and malformed success retain the original recovery body without changing its consent',async()=>{
  const f=await fixture();await f.model.stop(true);const original=f.calls[0][1]
  f.api.confirmAgentOutcomeStop=async()=>{throw new PgNativePilotError(404,'not_found')};await f.model.confirm();assert.equal(f.model.snapshot().pending.request_id,request)
  f.api.confirmAgentOutcomeStop=async()=>({run_id:other,request_id:request,intent_sha256:pending.intent_sha256,stopped:true,recorded:true,replayed:true});await f.model.confirm();assert.ok(f.model.snapshot().pending)
  await f.model.retrySameRequest();assert.deepEqual(f.calls.at(-1)[1],original);assert.equal(f.keys(),1);f.model.dispose()
})
