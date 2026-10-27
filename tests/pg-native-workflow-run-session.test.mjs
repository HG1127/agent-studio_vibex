import test from "node:test"
import assert from "node:assert/strict"
import {createPgNativeWorkflowRunSession,workflowApprovalReady,workflowStepReview} from "../src/lib/pgNativeWorkflowRunSession.ts"
import {newPgWorkflowGraph,addPgWorkflowNode,patchPgWorkflowNode} from "../src/lib/pgNativeWorkflowGraph.ts"
import {PgNativePilotError} from "../src/lib/pgNativePilotApi.ts"
const flowId="11111111-1111-4111-8111-111111111111",runId="22222222-2222-4222-8222-222222222222",modelId="33333333-3333-4333-8333-333333333333"
const binding={connection_id:modelId,connection_revision:2,model_id:"synthetic"},step="wf2_00002_node_1",hash="a".repeat(64)
const draft={workflowId:flowId,revision:3,instruction:" Workflow task "}
function fixture(){
  let graph=addPgWorkflowNode(newPgWorkflowGraph(),"model","start-end",(()=>{let id=0;return ()=>String(++id)})())
  graph=patchPgWorkflowNode(graph,"node_1",{title:"Model",prompt:"Own task",model_binding:binding})
  const workflow={id:flowId,revision:3,name:"Own flow",graph}
  const model={id:modelId,revision:2,name:"Own model",provider:"openai",base_url:"https://api.openai.com/v1",enabled:true,status:"ok",models:["synthetic"]}
  const pending={step_key:step,input_sha256:hash,node_id:"node_1",kind:"model",input:"Actual approved prompt",configuration:{title:"Model",model_binding:binding},missing:[]}
  const make=()=>({execution_mode:"workflow_native_v2",replayed:false,run:{id:runId,kind:"workflow",workflow_id:flowId,status:"awaiting_approval",instruction:"Workflow task",result_text:"",checkpoint:{workflow_revision:3},step_count:0},steps:[],approvals:[{step_key:step,status:"pending"}],pending_effect:pending})
  let detail=make();const calls=[]
  const api={listWorkflowV2Runs:async()=>[{id:runId,workflow_id:flowId,status:detail.run.status,instruction_preview:"Workflow task",result_preview:""}],
    getWorkflowV2Run:async()=>detail,getWorkflow:async()=>workflow,getModelConnection:async()=>model,getAgent:async()=>{throw new PgNativePilotError(404,"missing")},
    submitWorkflowV2Run:async(...args)=>{calls.push(args);return detail},decideWorkflowV2Node:async(...args)=>{calls.push(args);detail={...detail,approvals:[{step_key:args[2],status:args[1]}]};return detail},
    cancelWorkflowV2Run:async()=>({...detail,run:{...detail.run,status:"cancelled"}})}
  return {api,workflow,model,calls,make,get detail(){return detail},set detail(value){detail=value}}
}
const turn=()=>new Promise(resolve=>setImmediate(resolve))
test("Workflow adapter binds its own mode/revision and freezes submission after a lost committed response",async()=>{
  const f=fixture(),session=createPgNativeWorkflowRunSession(f.api,{key:()=>"workflow-ui-key-0001"});session.setActive(true);await turn()
  f.api.submitWorkflowV2Run=async(...args)=>{f.calls.push(args);throw new PgNativePilotError(0,"lost")}
  await session.submit(draft);assert.ok(session.snapshot().pendingSubmit)
  session.setActive(false);session.setActive(true);f.api.submitWorkflowV2Run=async(...args)=>{f.calls.push(args);return {...f.detail,replayed:true}}
  await session.submit({...draft,instruction:"changed",revision:9});assert.deepEqual(f.calls[0],f.calls[1]);assert.equal(session.snapshot().pendingSubmit,null)
  assert.equal(session.snapshot().detail.execution_mode,"workflow_native_v2");session.dispose()
})
test("owner metadata GETs make exact model/Workflow revisions reviewable; stale metadata cannot enable approval",async()=>{
  const f=fixture(),session=createPgNativeWorkflowRunSession(f.api);session.setActive(true);await turn();await session.select(runId)
  const detail=session.snapshot().detail;assert.equal(workflowApprovalReady(detail),true)
  assert.equal(workflowStepReview(detail.pending_effect).text,"Actual approved prompt")
  f.model.revision++;await session.refresh();assert.equal(workflowApprovalReady(session.snapshot().detail),false)
  f.model.revision--;f.workflow.revision++;await session.refresh();assert.equal(workflowApprovalReady(session.snapshot().detail),false)
  f.workflow.revision--;f.api.getModelConnection=async()=>{throw new PgNativePilotError(404,"foreign_or_absent")};await session.refresh()
  assert.ok(session.snapshot().detail);assert.equal(workflowApprovalReady(session.snapshot().detail),false)
  await session.decide("rejected");assert.equal(session.snapshot().pendingMutation,null);session.dispose()
})
test("exact decision receipt recovers a bounded-history replay; a wrong receipt cannot confirm it",async()=>{
  const f=fixture(),session=createPgNativeWorkflowRunSession(f.api);session.setActive(true);await turn();await session.select(runId)
  f.api.decideWorkflowV2Node=async()=>{throw new PgNativePilotError(0,"lost")};await session.decide("approved",true)
  f.api.decideWorkflowV2Node=async()=>({...f.detail,approvals:[],decision_confirmation:{run_id:runId,step_key:step,input_sha256:"f".repeat(64),status:"approved"}})
  await session.retryMutation();assert.ok(session.snapshot().pendingMutation)
  f.api.decideWorkflowV2Node=async()=>({...f.detail,approvals:[],decision_confirmation:{run_id:runId,step_key:step,input_sha256:hash,status:"approved"}})
  await session.retryMutation();assert.equal(session.snapshot().pendingMutation,null);session.dispose()
})
test("Agent-child planning review omits reasoning and current role revisions remain mandatory",async()=>{
  const f=fixture(),agentId="44444444-4444-4444-8444-444444444444"
  let graph=addPgWorkflowNode(newPgWorkflowGraph(),"agent","start-end",(()=>{let id=0;return ()=>String(++id)})())
  graph=patchPgWorkflowNode(graph,"node_1",{title:"Agent",agent_binding:{spec_id:agentId,spec_revision:1},max_steps:3})
  f.workflow.graph=graph
  const agent={id:agentId,revision:1,name:"Own role",spec:{goal:"Own",task_scope:"",tools:["calculate"],model_binding:binding}}
  f.api.getAgent=async()=>agent
  f.detail={...f.detail,pending_effect:{...f.detail.pending_effect,agent_context:{parent_step_key:"wf2_00002_node_1",round:1,phase:"model"},input:JSON.stringify({task:"Own task",think:"PRIVATE_REASONING",history:[]})}}
  const session=createPgNativeWorkflowRunSession(f.api);session.setActive(true);await turn();await session.select(runId)
  assert.equal(workflowApprovalReady(session.snapshot().detail),true);const review=workflowStepReview(session.snapshot().detail.pending_effect)
  assert.equal(review.text,"Own task");assert.equal(JSON.stringify(review).includes("PRIVATE_REASONING"),false)
  agent.revision++;await session.refresh();assert.equal(workflowApprovalReady(session.snapshot().detail),false);session.dispose()
})
test("a 401 during resource review destroys the employee view; a different execution mode is never accepted",async()=>{
  const f=fixture();let expired=0
  const session=createPgNativeWorkflowRunSession(f.api,{onExpired:()=>{expired++}});session.setActive(true);await turn()
  f.api.getModelConnection=async()=>{throw new PgNativePilotError(401,"expired")};await session.select(runId)
  assert.equal(expired,1);assert.equal(session.snapshot().detail,null)
  const next=fixture();next.detail={...next.detail,execution_mode:"agent_native_v2",run:{...next.detail.run,kind:"agent",workflow_id:null}}
  const guarded=createPgNativeWorkflowRunSession(next.api);guarded.setActive(true);await turn();await guarded.submit(draft)
  assert.ok(guarded.snapshot().pendingSubmit);assert.equal(guarded.snapshot().detail,null);guarded.dispose()
})
