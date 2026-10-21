import test from "node:test"
import assert from "node:assert/strict"
import { TEMPLATE_PRESETS, BUILTIN_TOOL_OPTIONS } from "../src/pages/Home/presets.ts"

test("需求落地助手 is a reusable, executable, human-reviewed default",()=>{
  const row=TEMPLATE_PRESETS.find(item=>item.key==="delivery")
  assert.ok(row,"Users should be able to start from the proven need-to-delivery Agent")
  assert.equal(row.spec.require_plan_review,true)
  assert.equal(row.spec.require_approval,true)
  assert.ok(row.spec.task_plan.some(value=>value.includes("批准")))
  assert.ok(row.spec.done_criteria.some(value=>value.includes("验收")))
  for(const id of row.spec.tools)assert.ok(BUILTIN_TOOL_OPTIONS.some(item=>item.id===id),
    "Do not pretend unknown remote tools are already connected: "+id)
  assert.equal(row.spec.knowledge_base_ids,undefined,"Private KB never hardcoded in a reusable template")
  assert.ok(!JSON.stringify(row.spec).includes("mkt__"),"MCP access is scoped per employee and cannot be baked into a preset")
})
test("preset keys remain distinct and the default includes planning & verifiable completion standards",()=>{
  assert.equal(TEMPLATE_PRESETS.length,new Set(TEMPLATE_PRESETS.map(row=>row.key)).size)
  for(const template of TEMPLATE_PRESETS){
    assert.ok(template.defaultName && template.spec.goal && template.spec.task_scope)
    assert.ok(template.spec.deliverables.length && template.spec.task_plan.length)
    assert.ok(template.spec.done_criteria.length)
  }
})
