import test from "node:test"
import assert from "node:assert/strict"
import { complexCreationCases, complexFixturePlan } from "./helpers/complex-design-cases.mjs"
import { sanitizeAgentRoles, validateAgentRoles } from "../src/lib/agentRoles.ts"
import { normalizeCapabilityRequirements, agentCapabilityReadiness } from "../src/lib/agentCapabilityPlan.ts"
import { resolveAgentToolRequirements, prepareGeneratedAgentPermissions } from "../src/lib/agentToolMatcher.ts"

test("diverse 2/3/8 stage proposals preserve task-specific DAG and unmet capabilities without granting tools", () => {
  const roleCounts=[]
  for(const scenario of complexCreationCases){
    const payload=JSON.parse(JSON.stringify(complexFixturePlan(scenario)))
    const draft={
      goal:payload.goal,task_scope:payload.task_scope,
      deliverables:payload.deliverables,tools:payload.tools,
      task_plan:payload.task_plan,done_criteria:payload.done_criteria,
      roles:sanitizeAgentRoles(payload.roles),
      capability_requirements:normalizeCapabilityRequirements(payload.capability_requirements),
      require_approval:payload.require_approval,
    }
    const matched=resolveAgentToolRequirements(scenario.requirement,draft,[],[])
    const plan=prepareGeneratedAgentPermissions(draft,matched)
    assert.equal(plan.roles.length,scenario.stages.length)
    assert.equal(plan.capability_requirements.length,scenario.capabilities.length)
    const validated=validateAgentRoles(plan.roles,plan.tools)
    assert.equal(validated.valid,true,scenario.marker+" "+validated.errors.join("; "))
    assert.deepEqual(validated.orderedRoles.map(role=>role.id),scenario.stages.map(([id])=>id))
    assert.ok(plan.roles.every(role=>role.tools.length===0),
      "proposal role tools from a model are never direct authorization")
    assert.equal(plan.require_approval,scenario.capabilities.some(row=>row[3]==="write"))
    assert.equal(plan.tools.includes("send_email"),false)
    assert.ok(plan.capability_requirements.every(need=>need.required),
      "required capabilities must remain visible as a plan, not silently disappear")
    // Without permissioned external tools, readiness must be blocked whenever
    // the draft requests integration/document actions we cannot actually run.
    const issues=agentCapabilityReadiness(plan,null,[],[])
    assert.ok(issues.length>0,scenario.marker+" must retain real unmet external dependencies")
    roleCounts.push(plan.roles.length)
  }
  assert.deepEqual(roleCounts,[2,3,8])
})

test("invalid model-generated dependency cycles cannot masquerade as valid complex plans",()=>{
  const fixture=complexFixturePlan(complexCreationCases[2])
  fixture.roles[0].depends_on=[fixture.roles.at(-1).id]
  const verified=validateAgentRoles(sanitizeAgentRoles(fixture.roles).map(role=>({...role,tools:[]})),[])
  assert.equal(verified.valid,false)
  assert.ok(verified.errors.some(message=>message.includes("循环")))
})

test("fake tool IDs in a generated proposal cannot authorize execution, including the write role",()=>{
  const fixture=complexFixturePlan(complexCreationCases[1])
  fixture.tools=["mkt__fabricated__crm_write"]
  fixture.roles.at(-1).tools=["mkt__fabricated__crm_write"]
  fixture.capability_requirements.at(-1).suggested_tool_ids=["mkt__fabricated__crm_write"]
  const draft={...fixture,roles:sanitizeAgentRoles(fixture.roles),
    capability_requirements:normalizeCapabilityRequirements(fixture.capability_requirements)}
  const plan=prepareGeneratedAgentPermissions(draft,
    resolveAgentToolRequirements(complexCreationCases[1].requirement,draft))
  assert.ok(!plan.tools.includes("mkt__fabricated__crm_write"))
  assert.ok(plan.roles.every(role=>role.tools.length===0))
  assert.equal(plan.require_approval,true)
})
