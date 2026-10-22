import test from "node:test"
import assert from "node:assert/strict"
import {workflowNodeDebugFixture,debugKey,debugCredential} from "./helpers/workflow-node-debug-fixture.mjs"
import {WorkflowV2Worker} from "../src/workflow-v2-worker.ts"
import {WorkflowV2ModelDispatch,WorkflowV2ModelLeaseIdentity,verifiedWorkflowV2ModelDispatch} from "../src/workflow-v2-model-dispatch.ts"
import {workflowV2ModelEffectExecutor} from "../src/workflow-v2-model-client.ts"
import {createWorkflowV2ModelInternalHandler} from "../src/workflow-v2-model-handler.ts"
import {withDisposableBoundModelTls} from "./helpers/bound-model-loopback-tls.mjs"
import {createPgNativeWorkflowDebugSession} from "../../../src/lib/pgNativeWorkflowDebugSession.ts"
import {workflowApprovalReady} from "../../../src/lib/pgNativeWorkflowRunSession.ts"
const wire=(request,lease)=>({claim:{run_id:lease.run_id,job_id:lease.job_id,lease_token:lease.lease_token,lease_version:lease.lease_version,lease_owner:lease.worker_id},step_key:request.step_key,input_sha256:request.input_sha256})

test("Native Cookie single-node test recovers exact submit/decision, reviews real prompt and dispatches one Model over mTLS",async()=>{
  const f=await workflowNodeDebugFixture();let session,calls=0
  try{
    f.enable(false);await assert.rejects(f.alice.api.submitWorkflowNodeDebug(f.flow.id,f.body),error=>error.status===405);f.enable(true)
    await assert.rejects(f.bob.api.submitWorkflowNodeDebug(f.flow.id,f.body),error=>error.status===404)
    assert.equal((await fetch(f.base+"/api/v2/workflows/"+f.flow.id+"/model-node-debug",{method:"POST",headers:{Origin:"https://node-debug.test.invalid","X-AgentStudio-Request":"1","X-Rh-User-Id":"alice","Content-Type":"application/json"},body:JSON.stringify(f.body)})).status,401)
    assert.equal((await f.alice.raw("/api/v2/workflows/"+f.flow.id+"/model-node-debug",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(f.body)})).status,403)
    for(const wrong of [{...f.body,node_id:"tool"},{...f.body,samples:{...f.samples,outputs:{foreign:"secret"}}},{...f.body,graph:f.graph},{...f.body,model_binding:f.graph.nodes[2].data.model_binding}]){
      const response=await f.alice.raw("/api/v2/workflows/"+f.flow.id+"/model-node-debug",{method:"POST",headers:{"X-AgentStudio-Request":"1","Content-Type":"application/json"},body:JSON.stringify(wrong)});assert.equal(response.status,400)
    }
    const draft={workflowId:f.flow.id,revision:1,nodeId:"model",samples:f.samples}
    session=createPgNativeWorkflowDebugSession(f.alice.api,{key:()=>f.body.idempotency_key});session.setActive(true);await session.refresh()
    f.alice.dropped.submit=true;const first=session.submit(draft);assert.equal(session.submit(draft),first);await first
    assert.ok(session.snapshot().pendingSubmit);await session.submit({...draft,nodeId:"tool",samples:{input:"changed",outputs:{}}})
    const run=session.snapshot().detail.run;assert.equal(session.snapshot().pendingSubmit,null)
    assert.equal((await f.db.query("SELECT count(*)::int AS n FROM agentstudio.runs")).rows[0].n,1)
    assert.equal((await f.db.query("SELECT count(*)::int AS n FROM agentstudio.workflows")).rows[0].n,1)
    const submissions=f.alice.calls.filter(call=>call.route.endsWith("/model-node-debug")&&call.body===JSON.stringify(f.body));assert.ok(submissions.length>=2)
    assert.deepEqual(await f.bob.api.listWorkflowV2Runs(),[]);await assert.rejects(f.bob.api.getWorkflowV2Run(run.id),error=>error.status===404)
    const broker=new WorkflowV2ModelDispatch(f.pool,debugKey,async()=>{throw Error("normal-model-fallback-forbidden")},f.pool,{nodeDebugExecutor:async(material,prompt)=>{
      calls++;assert.equal(material.api_key,debugCredential);assert.equal(prompt,'Test Synthetic {{unknown}} task / quoted "sample"\nline');return "Synthetic node-only result"}})
    await withDisposableBoundModelTls(verifiedWorkflowV2ModelDispatch(new WorkflowV2ModelLeaseIdentity(f.pool),broker),async config=>{
      const worker=()=>new WorkflowV2Worker(f.pool,"synthetic-node-debug",{executor:workflowV2ModelEffectExecutor(config)})
      assert.equal((await worker().tick()).status,"awaiting_approval");await session.refresh()
      assert.equal(workflowApprovalReady(session.snapshot().detail),true);assert.equal(calls,0)
      assert.deepEqual(session.snapshot().detail.pending_effect.missing,[])
      f.alice.dropped.decision=true;await session.decide("approved",true);assert.ok(session.snapshot().pendingMutation)
      await session.retryMutation();assert.equal(session.snapshot().pendingMutation,null)
      for(let i=0;i<5;i++){if((await worker().tick()).status==="succeeded")break}
      await session.refresh();const done=session.snapshot().detail
      assert.equal(done.run.status,"succeeded");assert.equal(done.run.result_text,"Synthetic node-only result");assert.equal(calls,1)
      assert.equal(done.run.checkpoint.node_debug.node_id,"model");assert.match(done.run.checkpoint.node_debug.request_sha256,/^[a-f0-9]{64}$/);assert.equal(JSON.stringify(done.run.checkpoint).includes("outputs"),false)
      assert.equal(done.steps.filter(step=>step.metadata.node_type==="model").length,1);assert.equal(done.steps.some(step=>["tool","agent"].includes(step.metadata.node_type)),false)
      assert.equal((await worker().tick()).status,"idle");assert.equal(calls,1)
    },{handlerFactory:createWorkflowV2ModelInternalHandler})
    const audit=JSON.stringify((await f.db.query("SELECT metadata FROM agentstudio.audit_events")).rows)
    assert.equal(audit.includes(debugCredential),false);assert.equal(audit.includes(f.samples.input),false);assert.equal(audit.includes("quoted"),false)
    assert.equal((await f.alice.api.listWorkflowV2Runs())[0].debug_node_id,"model")
  }finally{session?.dispose();await f.close()}
})
test("private Broker re-derives the saved node and samples; missing debug transport or tampered context never falls back",async()=>{
  const f=await workflowNodeDebugFixture();let finish,running,calls=0
  try{
    const run=await f.alice.api.submitWorkflowNodeDebug(f.flow.id,f.body),worker=new WorkflowV2Worker(f.pool,"held-node-debug",{executor:{execute(request,lease){finish.enter({request,lease});return finish.result}}})
    assert.equal((await worker.tick()).status,"awaiting_approval");const pending=(await f.alice.api.getWorkflowV2Run(run.run.id)).pending_effect
    await f.alice.api.decideWorkflowV2Node(run.run.id,"approved",pending.step_key,pending.input_sha256)
    let enter,release;const ready=new Promise(resolve=>{enter=resolve}),result=new Promise(resolve=>{release=resolve});finish={enter,result,release}
    running=worker.tick();const held=await ready,request=wire(held.request,held.lease),identity=new WorkflowV2ModelLeaseIdentity(f.pool)
    const missing=verifiedWorkflowV2ModelDispatch(identity,new WorkflowV2ModelDispatch(f.pool,debugKey,async()=>{calls++;return "forbidden"},f.pool))
    await assert.rejects(missing(request),error=>error.code==="workflow_node_debug_executor_unavailable");assert.equal(calls,0)
    const original=(await f.db.query("SELECT checkpoint FROM agentstudio.runs WHERE id=$1",[run.run.id])).rows[0].checkpoint,changed=structuredClone(original)
    changed.node_debug.samples.outputs.tool="forged"
    await f.db.query("UPDATE agentstudio.runs SET checkpoint=$2::jsonb WHERE id=$1",[run.run.id,JSON.stringify(changed)])
    const dispatch=verifiedWorkflowV2ModelDispatch(identity,new WorkflowV2ModelDispatch(f.pool,debugKey,async()=>{throw Error("fallback")},f.pool,{nodeDebugExecutor:async()=>{calls++;return "Synthetic validated result"}}))
    await assert.rejects(dispatch(request),error=>error.code==="workflow_node_debug_state_changed");assert.equal(calls,0)
    await f.db.query("UPDATE agentstudio.runs SET checkpoint=$2::jsonb WHERE id=$1",[run.run.id,JSON.stringify(original)])
    const value=await dispatch(request);assert.equal(value.text,"Synthetic validated result");assert.equal(calls,1)
    await assert.rejects(dispatch(request));assert.equal(calls,1)
    release(value.text);await running;running=null
  }finally{finish?.release?.("Synthetic cleanup");if(running)await running;await f.close()}
})
test("an unknown single-node model outcome pauses and is never resent by a new Worker",async()=>{
  const f=await workflowNodeDebugFixture();let calls=0
  try{
    const run=await f.alice.api.submitWorkflowNodeDebug(f.flow.id,f.body)
    const dispatch=verifiedWorkflowV2ModelDispatch(new WorkflowV2ModelLeaseIdentity(f.pool),new WorkflowV2ModelDispatch(f.pool,debugKey,async()=>{throw Error("fallback")},f.pool,{nodeDebugExecutor:async()=>{calls++;throw Error("synthetic outcome lost")}}))
    await withDisposableBoundModelTls(dispatch,async config=>{
      const worker=()=>new WorkflowV2Worker(f.pool,"unknown-node-debug",{executor:workflowV2ModelEffectExecutor(config)})
      assert.equal((await worker().tick()).status,"awaiting_approval");const p=(await f.alice.api.getWorkflowV2Run(run.run.id)).pending_effect
      await f.alice.api.decideWorkflowV2Node(run.run.id,"approved",p.step_key,p.input_sha256)
      assert.equal((await worker().tick()).status,"paused");await worker().tick();assert.equal(calls,1)
      assert.equal((await f.alice.api.getWorkflowV2Run(run.run.id)).run.status,"paused")
      await assert.rejects(f.alice.api.cancelWorkflowV2Run(run.run.id),error=>error.status===409)
    },{handlerFactory:createWorkflowV2ModelInternalHandler})
  }finally{await f.close()}
})
