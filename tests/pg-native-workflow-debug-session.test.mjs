import test from "node:test"
import assert from "node:assert/strict"
import {createPgNativeWorkflowDebugSession,workflowDebugFingerprint} from "../src/lib/pgNativeWorkflowDebugSession.ts"
import {PgNativePilotError} from "../src/lib/pgNativePilotApi.ts"
const workflow="11111111-1111-4111-8111-111111111111",run="22222222-2222-4222-8222-222222222222"
const draft=()=>({workflowId:workflow,revision:2,nodeId:"model",samples:{input:"Own task",outputs:{tool:"Synthetic private sample"}}})
function fixture(){
  let detail={run:{id:run,kind:"workflow",workflow_id:workflow,status:"queued",instruction:"Own task",result_text:"",checkpoint:{workflow_revision:2,node_debug:{node_id:"model",request_sha256:"a".repeat(64)}}},
    approvals:[],steps:[],pending_effect:null,replayed:false,execution_mode:"workflow_native_v2"}
  const calls=[],api={listWorkflowV2Runs:async()=>[{id:run,status:"queued",instruction_preview:"Own task",result_preview:"",debug_node_id:"model"}],getWorkflowV2Run:async()=>detail,
    submitWorkflowNodeDebug:async(id,body)=>{calls.push(structuredClone({id,body}));return detail}}
  return {api,calls,get detail(){return detail},set detail(value){detail=value}}
}
test("single-node sample fingerprint coalesces and freezes the complete original context after an unconfirmed response",async()=>{
  const f=fixture();let keys=0
  const controller=createPgNativeWorkflowDebugSession(f.api,{key:()=>{keys++;return "synthetic-debug-key"}});controller.setActive(true);await controller.refresh()
  const original=draft(),expected=await workflowDebugFingerprint(original),first=controller.submit(original)
  assert.equal(controller.submit(original),first);await first
  assert.ok(controller.snapshot().pendingSubmit);assert.equal(controller.snapshot().detail,null)
  original.samples.outputs.tool="CHANGED CALLER DATA";original.samples.input="changed"
  assert.equal(controller.snapshot().pendingSubmit.samples.outputs.tool,"Synthetic private sample")
  f.detail={...f.detail,replayed:true,run:{...f.detail.run,checkpoint:{...f.detail.run.checkpoint,node_debug:{node_id:"model",request_sha256:expected}}}}
  await controller.submit({...original,nodeId:"different",revision:99})
  assert.deepEqual(f.calls[0],f.calls[1]);assert.equal(keys,1);assert.equal(controller.snapshot().pendingSubmit,null);controller.dispose()
})
test("a normal Workflow response cannot confirm a node test, and logout/401 fences all private context",async()=>{
  const f=fixture();let expired=0
  f.detail={...f.detail,run:{...f.detail.run,checkpoint:{workflow_revision:2}}}
  const controller=createPgNativeWorkflowDebugSession(f.api,{onExpired:()=>{expired++},key:()=>"synthetic-debug-key"});controller.setActive(true);await controller.refresh()
  await controller.submit(draft());assert.ok(controller.snapshot().pendingSubmit)
  f.api.getWorkflowV2Run=async()=>{throw new PgNativePilotError(401,"expired")}
  const pending=controller.snapshot().pendingSubmit
  await controller.select(run);assert.equal(expired,0);assert.equal(controller.snapshot().pendingSubmit,pending)
  await controller.refresh(run) // The original read can expire; replacement selection stays blocked.
  assert.equal(expired,1);assert.equal(controller.snapshot().detail,null);assert.equal(controller.snapshot().pendingSubmit,null)
  controller.dispose()
})
test("sample fingerprints are stable across JSON key order and differ when any frozen sample changes",async()=>{
  const first={...draft(),samples:{input:"Unicode 中文 {{data}}",outputs:{second:"b",first:"a"},loop:{item:"value",index:2}}}
  const second={...first,samples:{loop:{index:2,item:"value"},outputs:{first:"a",second:"b"},input:"Unicode 中文 {{data}}"}}
  assert.equal(await workflowDebugFingerprint(first),await workflowDebugFingerprint(second))
  assert.notEqual(await workflowDebugFingerprint(first),await workflowDebugFingerprint({...second,samples:{...second.samples,input:"different"}}))
})

test("a replay with unavailable historical samples confirms the original fingerprint while keeping its instruction redacted",async()=>{
  const f=fixture(),original=draft(),expected=await workflowDebugFingerprint(original)
  f.detail={...f.detail,knowledge_outputs_available:false,replayed:true,run:{...f.detail.run,instruction:"",checkpoint:{...f.detail.run.checkpoint,node_debug:{node_id:"model",request_sha256:expected}}}}
  const session=createPgNativeWorkflowDebugSession(f.api,{key:()=>"synthetic-debug-replay"});session.setActive(true);await session.refresh();await session.submit(original)
  assert.equal(session.snapshot().pendingSubmit,null);assert.equal(session.snapshot().detail.run.instruction,"");assert.equal(session.snapshot().detail.knowledge_outputs_available,false)
  session.dispose()
})
