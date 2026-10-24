import test from "node:test"
import assert from "node:assert/strict"
import {createPgNativeRunSubmission} from "../src/lib/pgNativeRunSubmission.ts"
import {PgNativePilotError} from "../src/lib/pgNativePilotApi.ts"
const a="11111111-1111-4111-8111-111111111111"
const b="22222222-2222-4222-8222-222222222222"
const result=(id=a,instruction="First task")=>({replayed:false,
  run:{id:b,agent_spec_id:id,instruction}})
test("rapid duplicate submissions join a single request; ambiguous retry freezes body and key",async()=>{
  let fail,calls=[]
  const guard=createPgNativeRunSubmission(()=>"synthetic-key-0001")
  const api={submitRun:async(...args)=>{calls.push(args);return new Promise((_resolve,reject)=>{fail=reject})}}
  const first=guard.submit(api,{agentId:a,instruction:" First task "})
  const duplicate=guard.submit(api,{agentId:b,instruction:"Changed task"})
  assert.equal(first,duplicate)
  await Promise.resolve()
  assert.deepEqual(calls,[[a,"First task","synthetic-key-0001"]])
  fail(new PgNativePilotError(0,"network_error"))
  await assert.rejects(first)
  assert.equal(Object.isFrozen(guard.pending()),true)
  const accepted=await guard.submit({submitRun:async(...args)=>{
    calls.push(args);return {...result(),replayed:true}
  }},{agentId:b,instruction:"Must not replace pending input"})
  assert.equal(accepted.replayed,true)
  assert.deepEqual(calls[0],calls[1])
  assert.equal(guard.pending(),null)
})
test("definite rejection permits editing, while a rejection after uncertain outcome cannot discard recovery key",async()=>{
  const guard=createPgNativeRunSubmission(()=>"synthetic-key-0002")
  const reject=status=>({submitRun:async()=>{throw new PgNativePilotError(status,"rejected")}})
  await assert.rejects(guard.submit(reject(409),{agentId:a,instruction:"First task"}))
  assert.equal(guard.pending(),null)
  await assert.rejects(guard.submit(reject(503),{agentId:b,instruction:"Second task"}))
  const pending=guard.pending()
  await assert.rejects(guard.submit(reject(409),{agentId:a,instruction:"Changed"}))
  assert.equal(guard.pending(),pending)
})
test("malformed success remains recoverable; closing an employee view discards late response and private draft",async()=>{
  const guard=createPgNativeRunSubmission(()=>"synthetic-key-0003")
  await assert.rejects(guard.submit({submitRun:async()=>result(b)},
    {agentId:a,instruction:"First task"}),/unconfirmed_run_submission/)
  assert.ok(guard.pending())
  let finish
  const later=guard.submit({submitRun:async()=>new Promise(resolve=>{finish=resolve})},
    {agentId:a,instruction:"First task"})
  await Promise.resolve()
  guard.dispose();finish(result())
  await assert.rejects(later,/run_view_expired/)
  assert.equal(guard.pending(),null)
  await assert.rejects(guard.submit({submitRun:async()=>result()},
    {agentId:a,instruction:"First task"}),/run_view_expired/)
})
