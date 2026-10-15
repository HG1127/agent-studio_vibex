import test from "node:test"
import assert from "node:assert/strict"
import vm from "node:vm"
import fs from "node:fs"
import path from "node:path"
import {fileURLToPath} from "node:url"

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..")
const source=fs.readFileSync(path.join(root,"pocketbase/pb_hooks/modules/execution_trace.js"),"utf8")
const sandbox={module:{exports:{}}}
vm.runInNewContext(source,sandbox,{timeout:1200})
const {record}=sandbox.module.exports

test("Execution trace repository stores only allowlisted metadata and sanitizes error code",()=>{
  let bound
  const app={db(){return {newQuery(sql){
    assert.match(sql,/INSERT INTO agent_studio_execution_spans/)
    return {bind(params){bound=params;return {execute(){}}}}
  }}}}
  record(app,{
    owner:"owner-A",runId:"1234567890abcde",spanId:"abcdefghijklmno",kind:"workflow",
    stepRef:"node-with invalid spaces",
    operation:"model",status:"failed",
    errorCode:"Bearer secret-value",durationMs:9e8,
    createdMs:1234,apiKey:"sensitive-should-not-store",
    prompt:"secret prompt should never be retained",
  })
  assert.deepEqual(Object.keys(bound).sort(),[
    "created","duration","error","id","kind","operation","run","status","step","trace","uid"
  ])
  assert.equal(bound.uid,"owner-A")
  assert.equal(bound.kind,"workflow")
  assert.equal(bound.step,"unknown")
  assert.equal(bound.error,"model_error")
  assert.equal(bound.duration,600000)
  assert.doesNotMatch(JSON.stringify(bound),/sensitive-should-not-store|secret prompt|Bearer secret-value/)
})

test("Trace repository rejects missing identity and invalid span ID",()=>{
  const app={db(){throw Error("should not access database")}}
  assert.throws(()=>record(app,{kind:"agent",runId:"1234567890abcde",spanId:"abcdefghijklmno"}),/invalid_execution_span/)
  assert.throws(()=>record(app,{kind:"workflow",owner:"owner",runId:"1234567890abcde",spanId:"no"}),/invalid_execution_span/)
})
