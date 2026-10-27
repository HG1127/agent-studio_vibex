import test from "node:test"
import assert from "node:assert/strict"
import {safeAgentSpec} from "../src/contracts.ts"
import {safeBoundModelRequest} from "../src/bound-model-contract.ts"
import {preparedSelectedModelRequest} from "../src/model-connection-executor.ts"
import {createPgNativePilotApi} from "../../../src/lib/pgNativePilotApi.ts"
const id="11111111-1111-4111-8111-111111111111"
const claim={run_id:id,job_id:"22222222-2222-4222-8222-222222222222",lease_token:"33333333-3333-4333-8333-333333333333",lease_version:1,lease_owner:"synthetic-role-worker"}
test("descriptive role capacity is independent of tool permission limits and preserves every safe field",()=>{
  const rows=Array.from({length:30},(_,i)=>String(i).padStart(2,"0")+"项".repeat(498))
  const raw={goal:"目".repeat(2998)+"🚀",task_scope:"域".repeat(4000),deliverables:rows,task_plan:rows,done_criteria:rows,tools:["calculate"]}
  const saved=safeAgentSpec(raw)
  for(const key of ["goal","task_scope","deliverables","task_plan","done_criteria"])assert.deepEqual(saved[key],raw[key])
  for(const extra of [{goal:raw.goal+"x"},{task_scope:raw.task_scope+"x"},{deliverables:[...rows,"overflow"]},{task_plan:["x".repeat(501)]},
    {done_criteria:["x\0y"]},{tools:Array(21).fill("calculate")},{owner_user_id:id}])assert.throws(()=>safeAgentSpec({...raw,...extra}))
})
test("private one-shot models retain role scope and task plan while their total prompt/request budgets remain independent",()=>{
  const input={goal:"g".repeat(3000),instruction:"i".repeat(2000),taskScope:"s".repeat(4000),deliverables:Array(30).fill("Deliver"),
    doneCriteria:Array(30).fill("Done"),taskPlan:Array.from({length:30},(_,i)=>"Plan-"+i)}
  assert.deepEqual(safeBoundModelRequest({claim,input}).input,input)
  for(const material of [
    {provider:"openai",base_url:"https://api.openai.com/v1",model_id:"synthetic"},
    {provider:"anthropic",base_url:"https://api.anthropic.com/v1",model_id:"synthetic"},
    {provider:"gemini",base_url:"https://generativelanguage.googleapis.com/v1beta",model_id:"models/synthetic"},
  ]){
    const configured={...material,api_key:"SyntheticRoleBudgetCredentialNeverNetwork"},bytes=preparedSelectedModelRequest(configured,input).body.toString("utf8")
    for(const value of [input.goal,input.taskScope,input.instruction,"Plan-29"])assert.equal(bytes.includes(value),true)
    assert.throws(()=>preparedSelectedModelRequest(configured,{...input,taskPlan:Array(30).fill("p".repeat(500))}),/invalid_bound_model_input/)
    for(const extra of [{goal:input.goal+"x"},{taskScope:input.taskScope+"x"},{instruction:input.instruction+"x"},{taskPlan:Array(31).fill("x")},{taskPlan:["x".repeat(501)]}]){
      assert.throws(()=>safeBoundModelRequest({claim,input:{...input,...extra}}))
      assert.throws(()=>preparedSelectedModelRequest(configured,{...input,...extra}),/invalid_bound_model_input/)
    }
  }
})
test("Native employee client retains a full3000-unit goal and refuses overflow before transport",async()=>{
  const requests=[],goal="目".repeat(2998)+"🚀",api=createPgNativePilotApi(async(route,init)=>{
    requests.push({route,init});return new Response(JSON.stringify({item:{id,name:"Synthetic",spec:{goal}}}),{status:200})
  })
  assert.equal((await api.createAgent("Synthetic",goal)).spec.goal,goal)
  assert.equal(JSON.parse(requests[0].init.body).spec.goal,goal)
  await assert.rejects(api.createAgent("Synthetic",goal+"x"),e=>e.code==="invalid_pg_native_agent_goal")
  await assert.rejects(api.updateAgent(id,1,"Synthetic",goal+"x"),e=>e.code==="invalid_pg_native_agent_goal")
  assert.equal(requests.length,1)
})
