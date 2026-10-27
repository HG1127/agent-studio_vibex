import test from 'node:test'
import assert from 'node:assert/strict'
import {safeAgentSpec} from '../src/contracts.ts'
import {createWorkflowAgentState,inspectWorkflowAgentState,recordWorkflowAgentResult,recordWorkflowAgentHumanResponse} from '../src/workflow-v2-agent-machine.ts'
import {agentMemoryDerivedTools} from '../src/agent-memory-derived-tools.ts'
const spec_id='11111111-1111-4111-8111-111111111111',binding={connection_id:'22222222-2222-4222-8222-222222222222',connection_revision:2,model_id:'synthetic'}
const spec=safeAgentSpec({goal:'source-only',task_scope:'Owned',deliverables:['Answer'],done_criteria:['Evidence'],tools:['calculate','summarize'],knowledge_base_ids:[],model_binding:binding})
const parent={step_key:'wf2_00002_agent',node_id:'agent',kind:'agent',input:'synthetic task',input_sha256:'a'.repeat(64),configuration:{title:'Role',agent_binding:{spec_id,spec_revision:1},max_steps:4},missing:[]}
const apply=(state,output,extra={})=>{const p=inspectWorkflowAgentState(state,parent).pending;assert.ok(p);return recordWorkflowAgentResult(state,parent,{step_key:p.step_key,input_sha256:p.input_sha256,output,...extra})}
test('derived tools come from validated private replay, skip denied operations and do not mutate original evidence',()=>{
  let state=createWorkflowAgentState(parent,spec,undefined,{humanInput:true,fullDelivery:true})
  state=apply(state,'{"action":"tool","tool":"calculate","params":{"expression":"2+2"}}');state=apply(state,'4')
  state=apply(state,'{"action":"tool","tool":"summarize","params":{"text":"Synthetic only"}}');state=apply(state,'',{outcome:'rejected'})
  state=apply(state,'{"action":"answer","answer":"Complete"}')
  const original=JSON.stringify(state);assert.deepEqual(agentMemoryDerivedTools(state,parent),['calculate']);assert.equal(JSON.stringify(state),original)
  const forged=structuredClone(state);forged.results[1].input_sha256='f'.repeat(64)
  assert.throws(()=>agentMemoryDerivedTools(forged,parent))
})
test('derived tool replay consumes the original human reply before subsequent model/tool results',()=>{
  let state=createWorkflowAgentState(parent,spec,undefined,{humanInput:true})
  state=apply(state,'{"action":"ask_user","question":"Which deadline?"}')
  const pending=inspectWorkflowAgentState(state,parent).pending_input
  state=recordWorkflowAgentHumanResponse(state,parent,{request_id:'33333333-3333-4333-8333-333333333333',step_key:pending.step_key,input_sha256:pending.input_sha256,decision:'reply',answer:'2030-01-31'})
  state=apply(state,'{"action":"tool","tool":"calculate","params":{"expression":"2+2"}}');state=apply(state,'4')
  state=apply(state,'{"action":"answer","answer":"Done"}')
  assert.deepEqual(agentMemoryDerivedTools(state,parent),['calculate'])
})
