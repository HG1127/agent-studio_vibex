import test from "node:test"
import assert from "node:assert/strict"
import vm from "node:vm"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..")
const source=fs.readFileSync(path.join(root,"pocketbase/pb_hooks/modules/trace_metrics.js"),"utf8")
const scope={module:{exports:{}}}
vm.runInNewContext(source,scope,{timeout:1000})
const {summarize}=scope.module.exports
test("trace metrics include bounded p50 p95 without recording raw input",()=>{
  const rows=[0,100,200,300,400,500,600,700,800,900].map((duration_ms,index)=>({
    duration_ms,operation:index%2?"model":"tool",status:index%3?"succeeded":"failed",
    api_key:"DO_NOT_ECHO",input:"SECRET_PROMPT",
  }))
  const stats=summarize(rows)
  assert.equal(stats.sampled_spans,10)
  assert.equal(stats.model_calls,5)
  assert.equal(stats.tool_calls,5)
  assert.equal(stats.p50_ms,400)
  assert.equal(stats.p95_ms,900)
  assert.equal(stats.failed_spans,4)
  assert.equal(stats.average_ms,450)
  assert.doesNotMatch(JSON.stringify(stats),/DO_NOT_ECHO|SECRET_PROMPT/)
})
test("trace metrics handle empty and invalid latency samples",()=>{
  assert.equal(summarize([]).p95_ms,0)
  assert.equal(summarize(null).sampled_spans,0)
  const stats=summarize([{duration_ms:-1,status:"failed"},{duration_ms:"garbage",operation:"tool"}])
  assert.equal(stats.p50_ms,0)
  assert.equal(stats.failed_spans,1)
})
