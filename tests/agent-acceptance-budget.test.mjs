import test from "node:test"
import assert from "node:assert/strict"
import { agentAcceptanceBudget } from "../src/lib/agentAcceptanceBudget.ts"

test("single assistant retains legacy acceptance limits", () => {
  assert.deepEqual(agentAcceptanceBudget(null),{maxSteps:8,maxModelCalls:20})
  assert.deepEqual(agentAcceptanceBudget({roles:[]}),{maxSteps:8,maxModelCalls:20})
})
test("five-stage multi-tool Agent gets enough turns for calls and handoffs", () => {
  const budget=agentAcceptanceBudget({roles:Array.from({length:5},()=>({}))})
  assert.ok(budget.maxSteps>=19)
  assert.ok(budget.maxModelCalls>=25)
  assert.ok(budget.maxSteps<=48)
})
test("untrusted counts cannot remove hard budget caps", () => {
  const a=agentAcceptanceBudget({roles:Array.from({length:500},()=>({}))})
  assert.ok(a.maxSteps<=48)
  assert.ok(a.maxModelCalls<=64)
})
