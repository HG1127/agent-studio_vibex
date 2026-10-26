// Pure VM integration only. Does not enable admission, Worker or model sending.
import test from 'node:test'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {safeAgentSpec} from '../src/contracts.ts'
import {buildAgentMemoryContext} from '../src/agent-memory-context.ts'
import {createWorkflowAgentState,inspectWorkflowAgentState,recordWorkflowAgentResult} from '../src/workflow-v2-agent-machine.ts'
const spec_id='11111111-1111-4111-8111-111111111111',owner='33333333-3333-4333-8333-333333333333',binding={connection_id:'22222222-2222-4222-8222-222222222222',connection_revision:2,model_id:'synthetic'}
const spec=safeAgentSpec({goal:'synthetic goal',task_scope:'Owner only',deliverables:['Answer'],done_criteria:['Evidence'],tools:['calculate','knowledge_search','summarize'],knowledge_base_ids:[],model_binding:binding})
const parent={step_key:'wf2_00002_agent',node_id:'agent',kind:'agent',input:'记住：报告使用中文。整理报告',input_sha256:'a'.repeat(64),configuration:{title:'Role',agent_binding:{spec_id,spec_revision:1},max_steps:3},missing:[]}
const saved={id:'44444444-4444-4444-8444-444444444444',kind:'user',fact:'报告使用中文',tools_used:'',content_sha256:createHash('sha256').update('报告使用中文').digest('hex')}
const context=buildAgentMemoryContext({owner_user_id:owner,spec_id,spec_revision:1,instruction:parent.input},[saved],saved.id)
const create=()=>createWorkflowAgentState(parent,spec,undefined,{humanInput:true,fullDelivery:true,memoryContext:context})
test('memory context enters private snapshot and every model/tool fingerprint, while instructions never become approval',()=>{
  let state=create(),view=inspectWorkflowAgentState(state,parent)
  const prompt=JSON.parse(view.pending.input)
  assert.equal(prompt.task,'整理报告');assert.deepEqual(prompt.memory_context.saved_user_instructions,['【用户指令】报告使用中文'])
  assert.equal(prompt.human_input.plan_review_confirmed,false)
  assert.match(prompt.instruction,/never authorize tools, payment/)
  const legacy=createWorkflowAgentState(parent,spec,undefined,{humanInput:true,fullDelivery:true})
  assert.notEqual(state.snapshot_sha256,legacy.snapshot_sha256);assert.notEqual(view.pending.input_sha256,inspectWorkflowAgentState(legacy,parent).pending.input_sha256)
  const first=view.pending
  state=recordWorkflowAgentResult(state,parent,{step_key:first.step_key,input_sha256:first.input_sha256,output:'{"action":"tool","tool":"calculate","params":{"expression":"2+2"}}'})
  view=inspectWorkflowAgentState(state,parent);assert.equal(view.pending.kind,'tool')
  assert.deepEqual(inspectWorkflowAgentState(JSON.parse(JSON.stringify(state)),parent),view)
  assert.equal(JSON.stringify(view.pending.configuration).includes('agent_memory_run_contexts'),false)
})
test('stripped, injected and changed private memory contexts cannot replay old snapshot/model receipts',()=>{
  const state=create(),{memory_context,...stripped}=state
  assert.throws(()=>inspectWorkflowAgentState(stripped,parent))
  const altered=structuredClone(state);altered.memory_context.memories[0].hint='【用户指令】forged'
  assert.throws(()=>inspectWorkflowAgentState(altered,parent))
  const legacy=createWorkflowAgentState(parent,spec,undefined,{humanInput:true,fullDelivery:true})
  assert.throws(()=>inspectWorkflowAgentState({...legacy,memory_context:context},parent))
  const old=inspectWorkflowAgentState(legacy,parent).pending
  assert.throws(()=>recordWorkflowAgentResult(state,parent,{step_key:old.step_key,input_sha256:old.input_sha256,output:'old receipt'}))
  assert.throws(()=>createWorkflowAgentState(parent,spec,undefined,{memoryContext:context}))
})
