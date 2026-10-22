import test from "node:test"
import assert from "node:assert/strict"
import {createWorkflowV2Checkpoint,inspectWorkflowV2Checkpoint,
  advanceWorkflowV2Checkpoint,recordWorkflowV2EffectResult} from "../src/workflow-v2-machine.ts"
const node=(id,type,data={})=>({id,type,data:{title:id,
  ...(type==="model"?{model_binding:{connection_id:"11111111-1111-1111-1111-111111111111",connection_revision:1,model_id:"synthetic-model"}}:{}),
  ...(type==="agent"?{agent_binding:{spec_id:"22222222-2222-2222-2222-222222222222",spec_revision:1}}:{}),
  ...data},position:{x:0,y:0}})
const edge=(source,target,sourceHandle)=>({id:source+"-"+target+"-"+(sourceHandle??"default"),source,target,
  ...(sourceHandle?{sourceHandle}:{})})
function drive(graph,input,answer){
  let cp=createWorkflowV2Checkpoint(graph,input),view=inspectWorkflowV2Checkpoint(graph,cp)
  const requests=[],events=[]
  for(let step=0;step<402;step++){
    const next=advanceWorkflowV2Checkpoint(graph,JSON.parse(JSON.stringify(cp)))
    cp=next.checkpoint;view=next.view;events.push(...next.events)
    assert.deepEqual(inspectWorkflowV2Checkpoint(graph,JSON.parse(JSON.stringify(cp))),view,"restart must reconstruct exactly the same state")
    if(view.pending){
      requests.push(view.pending)
      if(!answer)break
      const waiting=advanceWorkflowV2Checkpoint(graph,cp)
      assert.equal(waiting.progressed,false);assert.deepEqual(waiting.checkpoint,cp)
      const completion={step_key:view.pending.step_key,input_sha256:view.pending.input_sha256,
        output:answer(view.pending,requests.length)}
      cp=recordWorkflowV2EffectResult(graph,cp,completion)
      assert.deepEqual(recordWorkflowV2EffectResult(graph,cp,completion),cp,"same result replay is idempotent")
    }else if(view.status==="succeeded"||view.status==="failed")break
    else assert.equal(next.progressed,true)
  }
  return {cp,view,requests,events}
}
function branching(){return {version:2,nodes:[node("start","start"),
  node("choice","condition",{ref_title:"start",op:"gt",value:"10"}),
  node("end","end",{output_template:"{{yes.output}}|{{no.output}}"}),
  node("yes","model",{prompt:"true {{input}}"}),node("no","tool",{tool:"calculate",params_template:'{"expression":"1+1"}'})],
  edges:[edge("start","choice"),edge("choice","yes","true"),edge("choice","no","false"),edge("yes","end"),edge("no","end")]}}
function nested(){return {version:2,nodes:[node("start","start"),
  node("outer","loop",{mode:"count",count:2}),node("inner","loop",{mode:"count",count:2}),
  node("work","agent",{prompt:"{{loop.item}}/{{loop.index}}",max_steps:3}),
  node("end","end",{output_template:"{{outer.output}}"})],
  edges:[edge("start","outer"),edge("outer","inner"),edge("outer","end","done"),
    edge("inner","work"),edge("inner","outer","done"),edge("work","inner")]}}

test("branch joins wait for the selected effect and never execute or read the dead branch",()=>{
  for(const [input,kind,output] of [["count: 12","model","answer|"],["count: 3","tool","|answer"]]){
    const result=drive(branching(),input,()=>"answer")
    assert.equal(result.view.status,"succeeded");assert.equal(result.view.result_text,output)
    assert.deepEqual(result.requests.map(request=>request.kind),[kind])
    assert.ok(result.events.some(event=>event.status==="skipped"))
    assert.ok(result.events.at(-1).missing.length===1)
  }
})
test("nested loops keep stable per-invocation keys and replay innermost item/index across restart",()=>{
  const result=drive(nested(),"task",request=>"result "+request.input)
  assert.equal(result.view.status,"succeeded")
  assert.deepEqual(result.requests.map(request=>request.input),["1/1","2/2","1/1","2/2"])
  assert.equal(new Set(result.requests.map(request=>request.step_key)).size,4)
  assert.equal(new Set(result.requests.map(request=>request.input_sha256)).size,4)
  assert.equal(result.view.loops.find(loop=>loop.id==="outer").round,2)
  assert.match(result.view.result_text,/result 2\/2/)
})
test("bounded list loops support JSON objects, early stop, empty lists and malformed input",()=>{
  const graph={version:2,nodes:[node("start","start"),
    node("loop","loop",{mode:"list",list_source:"{{input}}",delimiter:"json_array",max_iterations:10,stop_keyword:"STOP"}),
    node("model","model",{prompt:"{{loop.index}}:{{loop.item}}"}),node("end","end",{output_template:"{{loop.output}}"})],
    edges:[edge("start","loop"),edge("loop","model"),edge("loop","end","done"),edge("model","loop")]}
  const result=drive(graph,'[{"id":1},"two","unused"]',(_,n)=>n===2?"STOP":"first")
  assert.equal(result.view.status,"succeeded")
  assert.deepEqual(result.requests.map(request=>request.input),['1:{"id":1}',"2:two"])
  assert.equal(result.view.loops[0].round,2)
  const empty=drive(graph,"[]",()=>{throw Error("must not execute empty body")})
  assert.equal(empty.requests.length,0);assert.equal(empty.view.status,"succeeded")
  assert.match(empty.view.result_text,/共执行 0 轮/)
  const invalid=drive(graph,"{}")
  assert.equal(invalid.view.status,"failed");assert.equal(invalid.view.error_code,"workflow_loop_list_invalid")
})
test("effect requests freeze identity, input hash and result order; forged checkpoints cannot advance",()=>{
  const graph=branching(),waiting=drive(graph,"count 12")
  const request=waiting.view.pending
  assert.equal(waiting.view.status,"waiting")
  const valid={step_key:request.step_key,input_sha256:request.input_sha256,output:"approved synthetic result"}
  for(const changed of [{...valid,input_sha256:"a".repeat(64)},{...valid,step_key:"wf2_99999_future"}])
    assert.throws(()=>recordWorkflowV2EffectResult(graph,waiting.cp,changed),error=>error.code==="workflow_effect_result_conflict")
  const completed=recordWorkflowV2EffectResult(graph,waiting.cp,valid)
  assert.throws(()=>recordWorkflowV2EffectResult(graph,completed,{...valid,output:"changed"}),/workflow_effect_result_conflict/)
  assert.throws(()=>inspectWorkflowV2Checkpoint(graph,{...completed,cursor:0}),/invalid_workflow_checkpoint/)
  assert.throws(()=>inspectWorkflowV2Checkpoint(graph,{...waiting.cp,cursor:waiting.cp.cursor+1}),/invalid_workflow_checkpoint/)
  const changed=structuredClone(graph);changed.nodes[3].data.prompt="different"
  assert.throws(()=>inspectWorkflowV2Checkpoint(changed,waiting.cp),/invalid_workflow_checkpoint/)
})
test("render expansion and repeated identical paid inputs fail before another effect request",()=>{
  const loop=nested();loop.nodes[1].data.count=4;loop.nodes[3].data.prompt="same costly input"
  const stuck=drive(loop,"task",()=>"done")
  assert.equal(stuck.requests.length,2);assert.equal(stuck.view.status,"failed")
  assert.equal(stuck.view.error_code,"workflow_stuck_loop_detected")
  const graph=branching();graph.nodes[1].data.op="contains";graph.nodes[1].data.value="x"
  graph.nodes[3].data.prompt="{{start.output}}".repeat(20)
  const huge=drive(graph,"x".repeat(1200))
  assert.equal(huge.requests.length,0);assert.equal(huge.view.error_code,"workflow_rendered_input_too_large")
})
test("pure nested execution stops at the global 200-node budget without an external adapter",()=>{
  const graph={version:2,nodes:[node("start","start"),node("outer","loop",{mode:"count",count:20,max_iterations:20}),
    node("inner","loop",{mode:"count",count:20,max_iterations:20}),node("test","condition",{ref_title:"start",op:"contains",value:"yes"}),node("end","end")],
    edges:[edge("start","outer"),edge("outer","inner"),edge("outer","end","done"),edge("inner","test"),
      edge("inner","outer","done"),edge("test","inner","true"),edge("test","inner","false")]}
  const result=drive(graph,"yes")
  assert.equal(result.view.executions,200);assert.equal(result.view.status,"failed")
  assert.equal(result.view.error_code,"workflow_execution_budget_exceeded");assert.equal(result.requests.length,0)
})
test("prototype-shaped IDs and unknown variables stay literal data",()=>{
  const graph={version:2,nodes:[node("__proto__","start"),
    node("constructor","model",{prompt:"{{__proto__.output}} {{unknown}}"}),
    node("toString","end",{output_template:"{{constructor.output}}"})],
    edges:[edge("__proto__","constructor"),edge("constructor","toString")]}
  const result=drive(graph,"literal",()=>"safe")
  assert.equal(result.view.result_text,"safe")
  assert.deepEqual(result.requests[0].missing,["unknown"])
  assert.equal(Object.prototype.polluted,undefined)
})

test("draft model/Agent nodes fail before requests; empty Agent input uses the task, model input must be explicit",()=>{
  for(const [kind,binding] of [["model","model_binding"],["agent","agent_binding"]]){
    const graph={version:2,nodes:[node("start","start"),node("work",kind,{prompt:"{{input}}"}),node("end","end")],
      edges:[edge("start","work"),edge("work","end")]}
    delete graph.nodes[1].data[binding]
    const draft=drive(graph,"task")
    assert.equal(draft.requests.length,0);assert.equal(draft.view.error_code,"workflow_"+kind+"_binding_missing")
    graph.nodes[1]=node("work",kind,{prompt:""})
    const empty=drive(graph,"task",()=>"answer")
    assert.equal(empty.view.status,kind==="agent"?"succeeded":"failed")
    if(kind==="agent")assert.equal(empty.requests[0].input,"task")
    else assert.equal(empty.view.error_code,"workflow_effect_input_empty")
  }
})
