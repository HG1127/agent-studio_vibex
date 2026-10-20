import test from "node:test"
import assert from "node:assert/strict"
import vm from "node:vm"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..")
const source=fs.readFileSync(path.join(root,"pocketbase/pb_hooks/modules/tool_policy.js"),"utf8")
const sandbox={module:{exports:{}}}
vm.runInNewContext(source,sandbox,{timeout:1000})
const {classify,allowAutomaticRetry}=sandbox.module.exports

test("policy recognizes builtin tools as nonwrites and permitted to retry",()=>{
  for(const toolName of ["calculate","summarize","knowledge_search","web_fetch","web_search"]){
    const p=classify({toolName,requireApproval:true})
    assert.equal(p.builtin,true)
    assert.equal(p.write,false)
    assert.equal(p.requiresApproval,false)
    assert.equal(allowAutomaticRetry(p,true),true)
  }
})
test("GET external is a read; POST, PUT, unknown defaults are writes",()=>{
  assert.equal(classify({toolName:"CustomerLookup",external:true,method:"GET",requireApproval:true}).requiresApproval,false)
  for(const method of ["POST","PUT","DELETE","patch",""]){
    const p=classify({toolName:"CustomerUpdate",external:true,method,requireApproval:true})
    assert.equal(p.write,true)
    assert.equal(p.requiresApproval,true)
    assert.equal(allowAutomaticRetry(p,true),false)
  }
})
test("market tools are always treated as writes and require approval when enabled",()=>{
  const p=classify({toolName:"mkt__remote",market:true,method:"GET",requireApproval:true})
  assert.equal(p.write,true)
  assert.equal(p.requiresApproval,true)
  assert.equal(allowAutomaticRetry(p,true),false)
  assert.equal(classify({toolName:"mkt__remote",market:true,alreadyApproved:true,requireApproval:true}).requiresApproval,false)
})
test("operator mandatory approval cannot be disabled by employee settings",()=>{
  const write=classify({toolName:"Payment",external:true,method:"POST",
    requireApproval:false,mandatoryApproval:true})
  assert.equal(write.requiresApproval,true)
  assert.equal(write.approvalPolicy,"mandatory")
  assert.equal(allowAutomaticRetry(write,true),false)
  const approved=classify({toolName:"Payment",external:true,method:"POST",
    requireApproval:false,mandatoryApproval:true,alreadyApproved:true})
  assert.equal(approved.requiresApproval,false)
  const read=classify({toolName:"Read",external:true,method:"GET",
    requireApproval:false,mandatoryApproval:true})
  assert.equal(read.requiresApproval,false)
})

test("unresolved external names cannot be marked authorized or safely retried by guesswork",()=>{
  const p=classify({toolName:"NotConfigured",external:false,requireApproval:true})
  assert.equal(p.external,false)
  assert.equal(p.requiresApproval,false)
  assert.equal(p.write,false)
  assert.equal(allowAutomaticRetry(p,false),false)
})
