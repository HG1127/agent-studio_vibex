import test from "node:test"
import assert from "node:assert/strict"
import {safeAgentSpec} from "../src/contracts.ts"
import {createWorkflowAgentState,inspectWorkflowAgentState,recordWorkflowAgentResult,selectWorkflowAgentExecution} from "../src/workflow-v2-agent-machine.ts"
import {preparedWorkflowAgentModelRequest} from "../src/model-connection-executor.ts"
const ref={spec_id:"11111111-1111-4111-8111-111111111111",spec_revision:1}
const binding={connection_id:"22222222-2222-4222-8222-222222222222",connection_revision:2,model_id:"synthetic"}
const spec=safeAgentSpec({goal:"synthetic goal",task_scope:"Owner only",deliverables:["Answer"],done_criteria:["Evidence"],
  tools:["calculate","knowledge_search","summarize"],knowledge_base_ids:[],model_binding:binding})
const parent={step_key:"wf2_00002_agent",node_id:"agent",kind:"agent",input:"synthetic task",input_sha256:"a".repeat(64),
  configuration:{title:"Role",agent_binding:ref,max_steps:3},missing:[]}
const apply=(state,output,options={})=>{
  const pending=inspectWorkflowAgentState(state,parent).pending
  return recordWorkflowAgentResult(state,parent,{step_key:pending.step_key,input_sha256:pending.input_sha256,output,...options})
}
test("Agent model/tool rounds replay stable requests, scope tools/model and discard optional private reasoning",()=>{
  let state=createWorkflowAgentState(parent,spec),view=inspectWorkflowAgentState(state,parent)
  assert.equal(view.pending.kind,"model");assert.equal(view.pending.agent_context.round,1)
  assert.equal(view.pending.configuration.model_binding.connection_id,binding.connection_id)
  state=apply(state,JSON.stringify({action:"tool",tool:"calculate",params:{expression:"2+2"},think:"PRIVATE_REASONING_DO_NOT_COPY"}))
  view=inspectWorkflowAgentState(state,parent)
  assert.equal(view.pending.kind,"tool");assert.equal(view.pending.step_key,"wf2_00002_agent_a01t")
  state=apply(state,"2+2 = 4");view=inspectWorkflowAgentState(state,parent)
  const prompt=JSON.parse(view.pending.input)
  assert.equal(prompt.round,2);assert.match(prompt.history[0].observation,/4/)
  assert.equal(view.pending.input.includes("PRIVATE_REASONING_DO_NOT_COPY"),false)
  assert.deepEqual(inspectWorkflowAgentState(JSON.parse(JSON.stringify(state)),parent),view)
  state=apply(state,JSON.stringify({action:"answer",answer:"final 4"}))
  assert.equal(inspectWorkflowAgentState(state,parent).output,"final 4")
  const first=state.results[0]
  assert.deepEqual(recordWorkflowAgentResult(state,parent,first),state)
  assert.throws(()=>recordWorkflowAgentResult(state,parent,{...first,output:"changed"}),/invalid_workflow_agent_state/)
})
test("Agent rejects reordered/future results, stale snapshots, wrong hashes and model-selected undeclared tools",()=>{
  const state=createWorkflowAgentState(parent,spec),pending=inspectWorkflowAgentState(state,parent).pending
  for(const wrong of [{step_key:"wf2_00002_agent_a02m",input_sha256:pending.input_sha256,output:"later"},
    {step_key:pending.step_key,input_sha256:"f".repeat(64),output:"wrong"}])assert.throws(()=>recordWorkflowAgentResult(state,parent,wrong))
  assert.throws(()=>inspectWorkflowAgentState({...state,parent_input_sha256:"f".repeat(64)},parent))
  assert.throws(()=>inspectWorkflowAgentState({...state,spec:{...spec,goal:"tampered"}},parent))
  const denied=apply(state,JSON.stringify({action:"tool",tool:"web_fetch",params:{url:"https://public.example.com"}}))
  assert.equal(inspectWorkflowAgentState(denied,parent).error_code,"workflow_agent_tool_not_allowed")
  const reordered=JSON.parse(JSON.stringify(state));reordered.spec=Object.fromEntries(Object.entries(reordered.spec).reverse())
  assert.deepEqual(inspectWorkflowAgentState(reordered,parent),inspectWorkflowAgentState(state,parent))
})
test("Tool rejection and known failures feed bounded observations; model rejection stops without another call",()=>{
  let state=createWorkflowAgentState(parent,spec)
  state=apply(state,'{"action":"tool","tool":"calculate","params":{"expression":"1/0"}}')
  const failed=apply(state,"",{outcome:"failed",code:"workflow_calculation_invalid"})
  assert.match(inspectWorkflowAgentState(failed,parent).pending.input,/workflow_calculation_invalid/)
  const rejected=apply(state,"",{outcome:"rejected"})
  assert.match(inspectWorkflowAgentState(rejected,parent).pending.input,/员工已拒绝/)
  const stop=apply(createWorkflowAgentState(parent,spec),"",{outcome:"rejected"})
  assert.equal(inspectWorkflowAgentState(stop,parent).status,"rejected")
})
test("Five rounds are bounded and plain-text final answers remain supported",()=>{
  const bounded={...parent,configuration:{...parent.configuration,max_steps:5}}
  let state=createWorkflowAgentState(bounded,spec),calls=0
  for(let i=1;i<=5;i++)for(const output of ['{"action":"tool","tool":"calculate","params":{"expression":"2+2"}}',"4"]){
    const pending=inspectWorkflowAgentState(state,bounded).pending;assert.ok(pending);calls++
    state=recordWorkflowAgentResult(state,bounded,{step_key:pending.step_key,input_sha256:pending.input_sha256,output})
  }
  const final=inspectWorkflowAgentState(state,bounded);assert.equal(calls,10);assert.equal(final.status,"failed");assert.equal(final.error_code,"workflow_agent_max_steps")
  for(const answer of ["Plain answer","123"]){const simple=apply(createWorkflowAgentState(parent,spec),answer)
    assert.equal(inspectWorkflowAgentState(simple,parent).output,answer)}
})
test("Agent generation has its own bounded prompt profile and startup approval",()=>{
  assert.equal(selectWorkflowAgentExecution({}),false)
  assert.throws(()=>selectWorkflowAgentExecution({AGENT_STUDIO_PG_WORKFLOW_V2_AGENTS_ENABLED:"true"}))
  assert.equal(selectWorkflowAgentExecution({AGENT_STUDIO_PG_WORKFLOW_V2_AGENTS_ENABLED:"true",
    AGENT_STUDIO_PG_WORKFLOW_V2_AGENTS_APPROVED:"APPROVE_DISPOSABLE_PG18_WORKFLOW_V2_AGENTS_ONLY"}),true)
  const prepared=preparedWorkflowAgentModelRequest({provider:"openai",base_url:"https://api.openai.com/v1",model_id:"synthetic",
    api_key:"synthetic-never-network-key"},"中".repeat(60000))
  assert.equal(JSON.parse(prepared.body).max_completion_tokens,4096)
  assert.match(JSON.parse(prepared.body).messages[0].content,/JSON.*UNTRUSTED/s)
  assert.equal(JSON.parse(prepared.body).messages[1].content.length,60000)
  assert.throws(()=>preparedWorkflowAgentModelRequest({provider:"openai",base_url:"https://api.openai.com/v1",model_id:"synthetic",api_key:"synthetic-key"},"x".repeat(131073)))
})
