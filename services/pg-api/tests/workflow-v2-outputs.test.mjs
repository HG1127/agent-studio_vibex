// Real Native Cookie/RLS/embedded SQL with synthetic final effects only.
import test from "node:test"
import assert from "node:assert/strict"
import {workflowNodeDebugFixture,debugCredential} from "./helpers/workflow-node-debug-fixture.mjs"
import {WorkflowRepository} from "../src/workflow-repository.ts"
import {AgentSpecRepository} from "../src/repository.ts"
import {safeAgentSpec} from "../src/contracts.ts"
import {WorkflowV2Worker} from "../src/workflow-v2-worker.ts"
import {permitNativePg18BusinessUatRequest} from "../src/native-config-uat-policy.ts"
import {redactResultText} from "../src/public-result-text.ts"
const node=(id,type,data)=>({id,type,data:{title:id,...data},position:{x:0,y:0}})
const edge=(source,target,sourceHandle)=>({id:source+"_"+target,source,target,...(sourceHandle?{sourceHandle}:{})})

test("public Workflow final and node output history mask complete text before bounded previews without mutating the replay",async()=>{
  const f=await workflowNodeDebugFixture()
  try{
    const binding=f.graph.nodes.find(node=>node.type==="model").data.model_binding
    const graph={version:2,nodes:[node('start','start'),node('report','model',{prompt:'Synthetic public report',model_binding:binding}),node('end','end',{output_template:'{{report.output}}'})],edges:[edge('start','report'),edge('report','end')]}
    const flow=await f.alice.api.createWorkflowGraph('Redacted Workflow output',graph),started=await f.alice.api.submitWorkflowV2Run(flow.id,1,'Synthetic report','redacted-output-original'),id=started.run.id
    const output='x'.repeat(235)+' sk-SyntheticWorkflowKey012345 Bearer SyntheticWorkflowBearer\ntoken=syntheticWorkflowToken api_key=syntheticWorkflowApi\n'+'交付'.repeat(1800)
    let calls=0;const worker=()=>new WorkflowV2Worker(f.pool,'synthetic-redacted-output',{executor:{async execute(){calls++;return output}}})
    for(let i=0;i<16;i++){
      const detail=await f.alice.api.getWorkflowV2Run(id);if(detail.run.status==='succeeded')break
      if(detail.run.status==='awaiting_approval')await f.alice.api.decideWorkflowV2Node(id,'approved',detail.pending_effect.step_key,detail.pending_effect.input_sha256)
      await worker().tick()
    }
    const privateRun=async()=>(await f.db.query('SELECT result_text,checkpoint FROM agentstudio.runs WHERE id=$1',[id])).rows[0]
    const before=await privateRun();assert.equal(before.result_text,output);assert.equal(calls,1)
    const done=await f.alice.api.getWorkflowV2Run(id);assert.equal(done.run.status,'succeeded');assert.equal(done.run.result_text,redactResultText(output))
    assert.equal((await f.alice.api.listWorkflowV2Runs(flow.id))[0].result_preview,redactResultText(output).slice(0,240))
    const latest=await f.alice.api.getWorkflowV2Outputs(id),history=await f.alice.api.getWorkflowV2OutputHistory(id)
    assert.equal(latest.nodes.find(row=>row.node_id==='report').output_text,redactResultText(output).slice(0,4000))
    assert.equal(history.items.find(row=>row.node_id==='report').output_text,redactResultText(output).slice(0,4000));assert.equal(latest.run.output_version,history.run.output_version)
    await assert.rejects(f.bob.api.getWorkflowV2Outputs(id),e=>e.status===404)
    assert.deepEqual(await privateRun(),before);assert.equal((await worker().tick()).status,'idle');assert.equal(calls,1)
  }finally{await f.close()}
})

test("owner outputs replay every loop round, withhold Agent planner/step JSON and remain readable after execution/config revocation",async()=>{
  const f=await workflowNodeDebugFixture();let ordinary=0,planning=0,tool=0,probed=false
  try{
    const binding=f.graph.nodes.find(node=>node.type==="model").data.model_binding
    const spec=await new AgentSpecRepository(f.pool).create(f.owner,"Output role",safeAgentSpec({goal:"PRIVATE_ROLE_GOAL",tools:["calculate"],model_binding:binding}))
    const graph={version:2,nodes:[node("start","start"),node("loop","loop",{mode:"count",count:2,max_iterations:2}),node("model","model",{prompt:"PRIVATE_CONFIG_PROMPT {{loop.item}}",model_binding:binding}),
      node("tool","tool",{tool:"calculate",params_template:'{"expression":"2+2"}'}),node("agent","agent",{agent_binding:{spec_id:spec.id,spec_revision:1},max_steps:3}),node("end","end",{output_template:"{{agent.output}}"})],
      edges:[edge("start","loop"),edge("loop","model"),edge("model","tool"),edge("tool","loop"),edge("loop","agent","done"),edge("agent","end")]}
    const flow=await f.alice.api.createWorkflowGraph("Outputs synthetic flow",graph),result=await f.alice.api.submitWorkflowV2Run(flow.id,1,"OWNER_TASK_ONLY","outputs-native-run-0001"),runId=result.run.id
    const privateStrings=["PRIVATE_CONFIG_PROMPT","PRIVATE_ROLE_GOAL","PRIVATE_REASONING","PRIVATE_NOTE","RAW_STEP_POISON",debugCredential,f.model.id]
    const assertPrivate=payload=>{const text=JSON.stringify(payload);for(const secret of privateStrings)assert.equal(text.includes(secret),false,secret+" must stay private")}
    const worker=()=>new WorkflowV2Worker(f.pool,"synthetic-output-worker",{agentExecutionApproved:true,executor:{async execute(request){
      if(request.kind==="tool"){tool++;return "4"}
      assert.equal(request.kind,"model")
      if(!request.agent_context){ordinary++;return "<b>Business result "+ordinary+"</b>"}
      planning++;return JSON.stringify(planning===1?{action:"tool",tool:"calculate",params:{expression:"2+2"},think:"PRIVATE_REASONING",note:"PRIVATE_NOTE"}:{action:"answer",answer:"SAFE_AGENT_FINAL",think:"PRIVATE_REASONING",note:"PRIVATE_NOTE"})
    }}})
    for(let i=0;i<35;i++){
      const tick=await worker().tick(),detail=await f.alice.api.getWorkflowV2Run(runId)
      if(detail.run.status==="succeeded")break
      if(detail.run.status!=="awaiting_approval")continue
      if(detail.pending_effect.agent_context?.phase==="tool"){
        assert.equal(JSON.stringify((await f.db.query("SELECT checkpoint FROM agentstudio.runs WHERE id=$1",[runId])).rows).includes("PRIVATE_REASONING"),true)
        await f.db.query("UPDATE agentstudio.run_steps SET metadata=metadata||$2::jsonb WHERE run_id=$1",[runId,JSON.stringify({output_text:"RAW_STEP_POISON",headers:{Authorization:debugCredential}})])
        f.enable(false);const mid=await f.alice.api.getWorkflowV2Outputs(runId),midHistory=await f.alice.api.getWorkflowV2OutputHistory(runId)
        assertPrivate(mid);assertPrivate(midHistory);assert.equal(mid.nodes.find(item=>item.node_id==="agent").output_text,undefined);probed=true;f.enable(true)
      }
      await f.alice.api.decideWorkflowV2Node(runId,"approved",detail.pending_effect.step_key,detail.pending_effect.input_sha256)
      assert.notEqual(tick.status,"failed")
    }
    assert.equal(probed,true);assert.equal(ordinary,2);assert.equal(planning,2);assert.equal(tool,3)
    assert.equal((await f.alice.api.getWorkflowV2Run(runId)).run.status,"succeeded")
    const counts=async()=>(await f.db.query("SELECT (SELECT count(*) FROM agentstudio.jobs)::int AS jobs,(SELECT count(*) FROM agentstudio.external_effects)::int AS effects")).rows[0]
    const before=await counts();f.enable(false)
    assert.deepEqual((await f.alice.api.listWorkflowV2Runs(flow.id)).map(run=>run.id),[runId])
    assert.deepEqual(await f.alice.api.listWorkflowV2Runs(f.flow.id),[])
    assert.deepEqual(await f.bob.api.listWorkflowV2Runs(flow.id),[])
    const latest=await f.alice.api.getWorkflowV2Outputs(runId);assertPrivate(latest)
    assert.equal(latest.nodes.find(item=>item.node_id==="agent").output_text,"SAFE_AGENT_FINAL")
    assert.equal(latest.nodes.find(item=>item.node_id==="model").output_text,"<b>Business result 2</b>")
    assert.deepEqual(latest.nodes.find(item=>item.node_id==="model").loop_path,[{node_id:"loop",round:2,total:2}])
    let after="",items=[];for(let page=0;page<12;page++){
      const output=await f.alice.api.getWorkflowV2OutputHistory(runId,after,2);assertPrivate(output);assert.equal(output.run.output_version,latest.run.output_version)
      items.push(...output.items);if(!output.next_after)break;assert.notEqual(output.next_after,after);after=output.next_after
    }
    assert.equal(items.length,8);assert.equal(new Set(items.map(item=>item.step_key)).size,items.length)
    assert.deepEqual(items.filter(item=>item.node_id==="model").map(item=>item.loop_path[0].round),[1,2])
    assert.equal(items.filter(item=>item.node_type==="agent").length,1)
    await assert.rejects(f.bob.api.getWorkflowV2Outputs(runId),error=>error.status===404)
    await assert.rejects(f.bob.api.getWorkflowV2OutputHistory(runId),error=>error.status===404)
    assert.equal((await fetch(f.base+"/api/v2/workflow-v2-runs/"+runId+"/outputs",{headers:{"X-Rh-User-Id":"alice"}})).status,401)
    for(const suffix of ["outputs?limit=1","output-history?limit=51","output-history?after=bad","output-history?limit=1&limit=2","output-history?query=private"])
      assert.equal((await f.alice.raw("/api/v2/workflow-v2-runs/"+runId+"/"+suffix)).status,400)
    await new WorkflowRepository(f.pool).update(f.owner,flow.id,"Changed revision",graph,1)
    assert.equal((await f.alice.api.getWorkflowV2Outputs(runId)).run.workflow_revision,1)
    assert.deepEqual(await counts(),before);assert.equal(ordinary,2);assert.equal(planning,2)
    for(const suffix of ["outputs","output-history"]){const path="/api/v2/workflow-v2-runs/"+runId+"/"+suffix
      assert.equal(permitNativePg18BusinessUatRequest(path,"GET",{}),true);assert.equal(permitNativePg18BusinessUatRequest(path,"POST",{}),false)}
  }finally{await f.close()}
})
test("node-test output projection marks its limited scope and never returns the frozen prompt or samples",async()=>{
  const f=await workflowNodeDebugFixture()
  try{
    const submitted=await f.alice.api.submitWorkflowNodeDebug(f.flow.id,f.body),runId=submitted.run.id
    const worker=new WorkflowV2Worker(f.pool,"debug-output-worker",{executor:{async execute(){return "x".repeat(6000)}}})
    await worker.tick();const pending=(await f.alice.api.getWorkflowV2Run(runId)).pending_effect
    await f.alice.api.decideWorkflowV2Node(runId,"approved",pending.step_key,pending.input_sha256);await worker.tick();await worker.tick()
    const latest=await f.alice.api.getWorkflowV2Outputs(runId),history=await f.alice.api.getWorkflowV2OutputHistory(runId)
    assert.equal(latest.run.node_debug_id,"model");assert.equal(latest.run.max_output_chars,4000)
    assert.equal(latest.nodes.find(node=>node.node_type==="model").output_text.length,4000)
    for(const response of [latest,history]){const raw=JSON.stringify(response);assert.equal(raw.includes('quoted \\"sample'),false);assert.equal(raw.includes('"samples"'),false);assert.equal(raw.includes('"model_binding"'),false);assert.equal(raw.includes('"graph"'),false)}
  }finally{await f.close()}
})
