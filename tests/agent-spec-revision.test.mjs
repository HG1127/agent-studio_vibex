import test from "node:test"
import assert from "node:assert/strict"
import { matchesAgentSpecSnapshot } from "../src/lib/agentSpecRevision.ts"

test("successful acceptance belongs to exact Agent configuration irrespective of JSON key order",()=>{
  const current={goal:"需求落地",task_plan:["提取需求","生成方案"],tools:["web_search"],require_plan_review:true}
  const snapshot={require_plan_review:true,tools:["web_search"],task_plan:["提取需求","生成方案"],goal:"需求落地"}
  assert.equal(matchesAgentSpecSnapshot(current,snapshot),true)
})
test("changed tools, review policy, plan steps or missing snapshot are not certified",()=>{
  const spec={goal:"方案",tools:["knowledge_search"],task_plan:["资料检索"]}
  assert.equal(matchesAgentSpecSnapshot(spec,{...spec,tools:["web_search"]}),false)
  assert.equal(matchesAgentSpecSnapshot(spec,{...spec,task_plan:["跳过审核"]}),false)
  assert.equal(matchesAgentSpecSnapshot(spec,null),false)
  assert.equal(matchesAgentSpecSnapshot(null,spec),false)
})
test("deep nesting and dangerous object keys fail closed",()=>{
  const spec={goal:"test"}
  assert.equal(matchesAgentSpecSnapshot(spec,JSON.parse('{"__proto__":{"x":1},"goal":"test"}')),false)
  let nested={}
  for(let i=0;i<31;i++)nested={part:nested}
  assert.equal(matchesAgentSpecSnapshot(nested,nested),false)
})
