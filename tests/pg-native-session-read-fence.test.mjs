import test from "node:test"
import assert from "node:assert/strict"
import {createPgNativeSessionReadFence}
  from "../src/lib/pgNativeSessionReadFence.ts"

const deferred=()=>{
  let resolve
  const promise=new Promise(done=>{resolve=done})
  return {promise,resolve}
}

test("a session transition invalidates all earlier employee data reads",async()=>{
  const gate=createPgNativeSessionReadFence()
  const employeeA=gate.session()
  const pending=deferred()
  const readA=gate.beginRead()
  const responseA=pending.promise.then(value=>
    gate.acceptsRead(readA)?value:"discarded")
  const employeeB=gate.invalidate()
  assert.notEqual(employeeA,employeeB)
  assert.equal(gate.acceptsSession(employeeA),false)
  assert.equal(gate.acceptsSession(employeeB),true)
  assert.equal(gate.acceptsRead(readA),false)
  pending.resolve({owner:"employee-A",agents:["private"]})
  assert.equal(await responseA,"discarded")
  const readB=gate.beginRead()
  assert.equal(gate.acceptsRead(readB),true)
})
test("out-of-order refreshes cannot overwrite more recent data",async()=>{
  const gate=createPgNativeSessionReadFence()
  const first=gate.beginRead()
  const second=gate.beginRead()
  assert.equal(gate.acceptsRead(first),false)
  assert.equal(gate.acceptsRead(second),true)
  const third=gate.beginRead()
  assert.equal(gate.acceptsRead(second),false)
  assert.equal(gate.acceptsRead(third),true)
})
test("logout and account switching invalidate old tickets even when refresh IDs repeat",()=>{
  const gate=createPgNativeSessionReadFence()
  const current=gate.beginRead()
  const oldSession=gate.session()
  gate.invalidate()
  const next=gate.beginRead()
  assert.equal(current.read,next.read)
  assert.notEqual(current.session,next.session)
  assert.equal(gate.acceptsRead(current),false)
  assert.equal(gate.acceptsRead(next),true)
  gate.invalidate()
  assert.equal(gate.acceptsSession(oldSession),false)
  assert.equal(gate.acceptsRead(next),false)
})
test("a failed sign-in can never resurrect data from the prior session",()=>{
  const gate=createPgNativeSessionReadFence()
  const oldProfileRead=gate.beginRead()
  const loginGeneration=gate.invalidate()
  assert.equal(gate.acceptsRead(oldProfileRead),false)
  assert.equal(gate.acceptsSession(loginGeneration),true)
  const nextLoginGeneration=gate.invalidate()
  assert.equal(gate.acceptsSession(loginGeneration),false)
  assert.equal(gate.acceptsSession(nextLoginGeneration),true)
})
test("fence guards are pure and do not store any browser credential",()=>{
  const fence=createPgNativeSessionReadFence()
  assert.deepEqual(Object.keys(fence).sort(),[
    "acceptsRead","acceptsSession","beginRead","invalidate","session"
  ])
  assert.deepEqual(fence.beginRead(),{session:0,read:1})
  assert.deepEqual(fence.beginRead(),{session:0,read:2})
  assert.equal(fence.invalidate(),1)
  assert.deepEqual(fence.beginRead(),{session:1,read:1})
})
