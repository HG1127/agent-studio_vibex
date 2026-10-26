import test from 'node:test'
import assert from 'node:assert/strict'
import {safeAgentSpec} from '../src/contracts.ts'
import {autonomousAgentGraph} from '../src/autonomous-agent-graph.ts'
import {createWorkflowV2Checkpoint} from '../src/workflow-v2-machine.ts'
import {createWorkflowAgentState,inspectWorkflowAgentState,inspectWorkflowAgentHumanHistory,recordWorkflowAgentResult,recordWorkflowAgentHumanResponse} from '../src/workflow-v2-agent-machine.ts'
const binding={connection_id:'22222222-2222-4222-8222-222222222222',connection_revision:2,model_id:'synthetic'}
const spec=safeAgentSpec({goal:'synthetic goal',task_scope:'Owner only',deliverables:['Answer'],done_criteria:['Evidence'],tools:['calculate','knowledge_search','summarize'],knowledge_base_ids:[],model_binding:binding})
const parent={step_key:'wf2_00002_agent',node_id:'agent',kind:'agent',input:'synthetic task',input_sha256:'a'.repeat(64),configuration:{title:'Role',agent_binding:{spec_id:'11111111-1111-4111-8111-111111111111',spec_revision:1},max_steps:3},missing:[]}
const view=(state,p=parent)=>inspectWorkflowAgentState(state,p)
const apply=(state,output,p=parent)=>{const pending=view(state,p).pending;assert.ok(pending);return recordWorkflowAgentResult(state,p,{step_key:pending.step_key,input_sha256:pending.input_sha256,output})}
let nextRequest=0
const response=(state,decision,answer='',p=parent)=>{
  const pending=view(state,p).pending_input;assert.ok(pending)
  return {request_id:'33333333-3333-4333-8333-'+String(++nextRequest).padStart(12,'0'),step_key:pending.step_key,input_sha256:pending.input_sha256,decision,answer}
}
const create=(extra={},p=parent)=>createWorkflowAgentState(p,{...spec,...extra},undefined,{humanInput:true})

test('owner run plan choice is strict, overrides role default and binds the graph and all subsequent response prompts',()=>{
  const args=[parent.configuration.agent_binding.spec_id,1,3]
  const inherited=autonomousAgentGraph(...args),enabled=autonomousAgentGraph(...args,undefined,true),disabled=autonomousAgentGraph(...args,undefined,false)
  assert.equal(Object.hasOwn(inherited.nodes[1].data,'require_plan_review'),false)
  const hashes=[inherited,enabled,disabled].map(graph=>createWorkflowV2Checkpoint(graph,'Same owned task').graph_sha256)
  assert.equal(new Set(hashes).size,3)
  for(const value of ['true',null,0,{}])assert.throws(()=>autonomousAgentGraph(...args,undefined,value))
  const off={...parent,configuration:{...parent.configuration,require_plan_review:false}}
  assert.equal(JSON.parse(view(create({require_plan_review:true},off),off).pending.input).human_input.require_plan_review,false)
  let state=apply(create({require_plan_review:true},off),'{"action":"answer","answer":"Owner explicitly disabled plan review"}',off)
  assert.equal(view(state,off).status,'succeeded')
  const on={...parent,configuration:{...parent.configuration,require_plan_review:true}}
  state=apply(create({},on),'{"action":"answer","answer":"Owner explicitly requires review"}',on)
  assert.equal(view(state,on).status,'awaiting_input')
})

test('unmarked Agent journals retain accepted snapshot and model/tool/model golden hashes exactly',()=>{
  let state=createWorkflowAgentState(parent,spec)
  assert.equal(Object.hasOwn(state,'human_protocol'),false)
  assert.equal(Object.hasOwn(state.spec,'require_plan_review'),false)
  assert.equal(state.snapshot_sha256,'9d405b7befde886b44e377352ecac9f7016d1e55a77eb1eb6b8361ebdc95ae3f')
  assert.equal(view(state).pending.input_sha256,'b9f3d8812c4275894a6bb8935f9298ac834d8c54c2d2b84b9c47e98c030dddc0')
  state=apply(state,'{"action":"tool","tool":"calculate","params":{"expression":"2+2"}}')
  assert.equal(view(state).pending.input_sha256,'6cfa5cd7cbdc582e7ad305fd94f5ed7cd42df91ba2eb1345f4b1965ea93f5b5e')
  state=apply(state,'4')
  assert.equal(view(state).pending.input_sha256,'bb127c55748ec8ef2fdb0ebb1973dde558ecffd8faf3887c8b41e905038e38b9')
  state=apply(state,'{"action":"answer","answer":"4"}')
  assert.equal(view(state).status,'succeeded')
})
test('marked Agent final delivery preserves the complete bounded report while legacy journals keep their original4000-character output',()=>{
  const report='完整成果段落。\n'.repeat(1000)
  assert.ok(report.length>4000&&report.length<12000)
  const full=apply(createWorkflowAgentState(parent,spec,undefined,{humanInput:true,fullDelivery:true}),JSON.stringify({action:'answer',answer:report}));assert.equal(view(full).output,report)
  const legacy=apply(createWorkflowAgentState(parent,spec),JSON.stringify({action:'answer',answer:report}));assert.equal(view(legacy).output,report.slice(0,4000))
  const oldHuman=apply(create(),JSON.stringify({action:'answer',answer:report}));assert.equal(view(oldHuman).output,report.slice(0,4000))
  assert.throws(()=>view({...oldHuman,delivery_protocol:'agent_full_delivery_v1'}))
  const {delivery_protocol,...stripped}=full;assert.throws(()=>view(stripped))
})

test('clarification holds with no executable effect, survives replay and resumes the next paid model round only after an exact owner response',()=>{
  let state=apply(create(),JSON.stringify({action:'ask_user',question:'Which delivery date?',think:'PRIVATE_REASONING_DO_NOT_COPY'}))
  const waiting=view(state);assert.equal(waiting.status,'awaiting_input');assert.equal(waiting.pending,null)
  assert.equal(waiting.pending_input.kind,'clarification');assert.equal(waiting.pending_input.question,'Which delivery date?')
  assert.equal(JSON.stringify(waiting).includes('PRIVATE_REASONING_DO_NOT_COPY'),false)
  assert.deepEqual(view(JSON.parse(JSON.stringify(state))),waiting)
  const choice=response(state,'reply','字'.repeat(1600))
  for(const change of [{decision:'approve'},{input_sha256:'f'.repeat(64)},{answer:'字'.repeat(1601)},{step_key:'wf2_00002_agent_a02m_input'}])
    assert.throws(()=>recordWorkflowAgentHumanResponse(state,parent,{...choice,...change}))
  assert.throws(()=>recordWorkflowAgentResult(state,parent,{step_key:choice.step_key,input_sha256:choice.input_sha256,output:'pretend response'}))
  const after=recordWorkflowAgentHumanResponse(state,parent,choice)
  assert.equal(view(after).status,'waiting');assert.equal(view(after).round,2);assert.equal(view(after).pending.kind,'model')
  const prompt=JSON.parse(view(after).pending.input)
  assert.equal(JSON.parse(prompt.history[0].observation).answer.length,1600)
  assert.equal(view(after).pending.input.includes('PRIVATE_REASONING_DO_NOT_COPY'),false)
  assert.deepEqual(recordWorkflowAgentHumanResponse(after,parent,choice),after)
  assert.throws(()=>recordWorkflowAgentHumanResponse(after,parent,{...choice,answer:'changed'}))
  state=apply(after,'{"action":"answer","answer":"Delivered after owner clarification"}')
  assert.equal(view(state).status,'succeeded')
})

test('a required plan cannot be completed by model final; revise is not approval and each new draft needs a new exact owner response',()=>{
  assert.throws(()=>createWorkflowAgentState(parent,{...spec,require_plan_review:true}),/agent_human_input_runtime_required/)
  let state=apply(create({require_plan_review:true}),'A complete first draft')
  assert.equal(view(state).status,'awaiting_input');assert.equal(view(state).pending_input.kind,'plan_review')
  assert.equal(view(state).pending_input.draft,'A complete first draft');assert.equal(view(state).output,'')
  const revise=response(state,'revise','Use a bounded acceptance checklist')
  assert.throws(()=>recordWorkflowAgentHumanResponse(state,parent,{...revise,decision:'reply'}))
  state=recordWorkflowAgentHumanResponse(state,parent,revise)
  assert.equal(JSON.parse(view(state).pending.input).human_input.plan_review_confirmed,false)
  state=apply(state,'{"action":"answer","answer":"Revised complete draft"}')
  assert.equal(view(state).status,'awaiting_input');assert.equal(view(state).round,2)
  const approval=response(state,'approve')
  assert.notEqual(approval.input_sha256,revise.input_sha256)
  assert.throws(()=>recordWorkflowAgentHumanResponse(state,parent,{...approval,input_sha256:revise.input_sha256}))
  state=recordWorkflowAgentHumanResponse(state,parent,approval)
  assert.equal(JSON.parse(view(state).pending.input).human_input.plan_review_confirmed,true)
  state=apply(state,'{"action":"answer","answer":"Final after actual owner approval"}')
  assert.equal(view(state).status,'succeeded');assert.equal(view(state).plan_review_confirmed,true)
  const history=inspectWorkflowAgentHumanHistory(state,parent)
  assert.deepEqual(history.map(item=>[item.kind,item.decision,item.draft,item.answer]),[['plan_review','revise','A complete first draft','Use a bounded acceptance checklist'],['plan_review','approve','Revised complete draft','']])
  assert.equal(Object.hasOwn(history[0],'results'),false)
})

test('forged future approvals, provider approval flags and protocol downgrade cannot manufacture plan approval or extra budget',()=>{
  const start=create({require_plan_review:true})
  assert.throws(()=>view({...start,human_protocol:undefined}))
  const fake=apply(start,'{"action":"answer","answer":"Pretend final","plan_review_confirmed":true}')
  assert.equal(view(fake).status,'failed')
  let state=apply(start,'{"action":"ask_user","question":"Approve the proposed scope"}')
  const choice=response(state,'approve')
  assert.throws(()=>view({...state,human_responses:[{...choice,step_key:'wf2_00002_agent_a03m_input'}]}))
  const after=recordWorkflowAgentHumanResponse(state,parent,choice)
  assert.throws(()=>view({...after,human_responses:[choice,{...choice,request_id:'44444444-4444-4444-8444-444444444444',step_key:'wf2_00002_agent_a03m_input'}]}))
  const single={...parent,configuration:{...parent.configuration,max_steps:1}}
  state=apply(create({require_plan_review:true},single),'One-round draft',single)
  state=recordWorkflowAgentHumanResponse(state,single,response(state,'approve','',single))
  assert.equal(view(state,single).status,'failed');assert.equal(view(state,single).error_code,'workflow_agent_max_steps')
})

test('plan-review flags are explicit booleans and old protocols reject human messages instead of changing old replay semantics',()=>{
  for(const require_plan_review of ['true',1,null,{}])assert.throws(()=>safeAgentSpec({goal:'Owned goal',require_plan_review}),/invalid_agent_plan_review/)
  assert.equal(Object.hasOwn(safeAgentSpec({goal:'Owned goal'}),'require_plan_review'),false)
  assert.equal(safeAgentSpec({goal:'Owned goal',require_plan_review:false}).require_plan_review,false)
  const old=apply(createWorkflowAgentState(parent,spec),'システムの旧結果')
  assert.equal(view(old).status,'succeeded')
  const unsupported=apply(createWorkflowAgentState(parent,spec),'{"action":"ask_user","question":"Unmarked protocol"}')
  assert.equal(view(unsupported).status,'failed')
})
