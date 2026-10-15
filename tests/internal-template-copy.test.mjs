import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import vm from "node:vm"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const source = fs.readFileSync(path.join(root,"pocketbase/pb_hooks/modules/internal_template_copy.js"),"utf8")
const sandbox={module:{exports:{}}}
vm.runInNewContext(source,sandbox,{timeout:1000})
const {makeCopy,fromRecord}=sandbox.module.exports
const plain=o=>JSON.parse(JSON.stringify(o))

test("internal template copy only includes safe allowlisted fields and built-in tools",()=>{
  const safe=plain(makeCopy({
    goal:"Research trends",
    task_scope:"Public sources only",
    deliverables:["Report"],tools:["calculate","knowledge_search","external_post","calculate"],
    task_plan:["Gather","Compare"],done_criteria:["Cite"],
    require_approval:false,
    knowledge_base_ids:["privileged-kb"],
    model_connection_id:"PERSONAL_KEY",
    api_key:"PRIVATE_TOKEN",
    context:{confidential:"SECRET"},
  }))
  assert.equal(safe.goal,"Research trends")
  assert.deepEqual(safe.tools,["calculate","knowledge_search"])
  assert.deepEqual(safe.knowledge_base_ids,[])
  assert.equal(safe.require_approval,true)
  assert.equal(Object.hasOwn(safe,"api_key"),false)
  assert.equal(Object.hasOwn(safe,"model_connection_id"),false)
  assert.equal(Object.hasOwn(safe,"context"),false)
  assert.doesNotMatch(JSON.stringify(safe),/PERSONAL_KEY|PRIVATE_TOKEN|privileged-kb|SECRET/)
})

test("internal template record fallback survives PocketBase Go-style JSON string failures",()=>{
  const record={
    get(){return null},
    publicExport(){return {spec:{
      goal:"Be precise",tools:["summarize","dangerous_external"],deliverables:["Summary"],
    }}},
    getString(){return "map[goal:GoMap]"},
  }
  const safe=plain(fromRecord(record))
  assert.equal(safe.goal,"Be precise")
  assert.deepEqual(safe.tools,["summarize"])
  assert.throws(()=>fromRecord({get(){return null},publicExport(){return {}},getString(){return "invalid"}}),
    /source_spec_invalid/)
})

test("shared free-form instructions require human review outside automatic filtering",()=>{
  const safe=plain(makeCopy({goal:"Please contact vendor after approval",tools:[]}))
  assert.equal(safe.goal,"Please contact vendor after approval")
  // Parser makes no claim to classify all possible confidential text.
  assert.equal(safe.require_approval,true)
})
