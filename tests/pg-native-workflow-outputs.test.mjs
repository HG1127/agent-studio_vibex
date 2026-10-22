import test from "node:test"
import assert from "node:assert/strict"
import {createPgNativePilotApi,PgNativePilotError} from "../src/lib/pgNativePilotApi.ts"
import {createPgNativeWorkflowOutputSession} from "../src/lib/pgNativeWorkflowOutputSession.ts"
import {historicalWorkflowSamples} from "../src/lib/pgNativeWorkflowOutputSamples.ts"
import {parseWorkflowLatestOutputs,parseWorkflowOutputHistory} from "../services/pg-api/src/workflow-v2-output-contract.ts"
const run="11111111-1111-4111-8111-111111111111",flow="22222222-2222-4222-8222-222222222222",other="33333333-3333-4333-8333-333333333333"
const header=()=>({run_id:run,workflow_id:flow,workflow_revision:1,graph_sha256:"a".repeat(64),output_version:"b".repeat(64),status:"succeeded",instruction:"Historical task",updated_at:"2026-10-23T00:00:00.000Z",max_output_chars:4000})
const latest=()=>({format:"workflow_v2_outputs_v1",kind:"latest",run:header(),nodes:[
  {node_id:"start",title:"Start",node_type:"start",node_status:"done",output_text:"Historical task"},
  {node_id:"tool",title:"Tool",node_type:"tool",node_status:"done",output_text:"Historical Tool output"},
  {node_id:"model",title:"Model",node_type:"model",node_status:"done",output_text:"Safe Model result"},
  {node_id:"end",title:"End",node_type:"end",node_status:"done",output_text:"Safe Model result"}]})
const history=(after="",changed={})=>({format:"workflow_v2_outputs_v1",kind:"history",run:{...header(),...changed},
  items:[{node_id:after?"model":"tool",title:after?"Model":"Tool",node_type:after?"model":"tool",step_key:after?"wf2_00003_model":"wf2_00002_tool",status:"succeeded",output_text:after?"Safe Model result":"Historical Tool output"}],total:2,next_after:after?null:"wf2_00002_tool"})
const graph=()=>({version:2,nodes:latest().nodes.map((node,index)=>({id:node.node_id,type:node.node_type,data:{title:node.title,...(node.node_type==="tool"?{tool:"calculate",params_template:"{}"}:{}),...(node.node_type==="model"?{prompt:"{{Tool.output}}"}:{}),...(node.node_type==="end"?{output_template:"{{Model.output}}"}:{})},position:{x:index*200,y:0}})),
  edges:[{id:"a",source:"start",target:"tool"},{id:"b",source:"tool",target:"model"},{id:"c",source:"model",target:"end"}]})
const defer=()=>{let resolve;const promise=new Promise(done=>{resolve=done});return {promise,resolve}}

test("output client uses validated same-origin GETs, bounded cursors and an optional owner Workflow history scope",async()=>{
  const calls=[],api=createPgNativePilotApi(async(url,options)=>{calls.push({url,options});return new Response(JSON.stringify(url.includes("output-history")?history():url.includes("workflow_id=")?{items:[]}:latest()),{headers:{"Content-Type":"application/json"}})},"")
  assert.equal((await api.getWorkflowV2Outputs(run)).run.run_id,run);await api.getWorkflowV2OutputHistory(run,"",1);await api.listWorkflowV2Runs(flow)
  assert.deepEqual(calls.map(call=>call.url),["/api/v2/workflow-v2-runs/"+run+"/outputs","/api/v2/workflow-v2-runs/"+run+"/output-history?limit=1&after=","/api/v2/workflow-v2-runs?workflow_id="+flow])
  assert.ok(calls.every(call=>call.options.credentials==="same-origin"&&call.options.method==="GET"&&!call.options.headers.Authorization))
  for(const action of [()=>api.getWorkflowV2Outputs("bad/id"),()=>api.getWorkflowV2OutputHistory(run,"bad"),()=>api.getWorkflowV2OutputHistory(run,"",51),()=>api.listWorkflowV2Runs("bad")])await assert.rejects(action,error=>error.status===400)
  assert.equal(calls.length,3)
  const malformed=createPgNativePilotApi(async()=>new Response(JSON.stringify({...latest(),graph:{private:"must-not-render"}})),"")
  await assert.rejects(malformed.getWorkflowV2Outputs(run),error=>error.status===503&&error.code==="invalid_workflow_output_response")
})
test("explicit reads coalesce, and hidden/obsolete/disposed responses cannot repopulate a view",async()=>{
  let pending=defer(),calls=0
  const api={getWorkflowV2Outputs:async()=>{calls++;return pending.promise},getWorkflowV2OutputHistory:async()=>history()}
  const model=createPgNativeWorkflowOutputSession(api,run,flow,()=>{});model.setActive(true);assert.equal(calls,0)
  const first=model.latest();assert.equal(first,model.latest());await new Promise(setImmediate);assert.equal(calls,1)
  model.setActive(false);model.setActive(true);pending.resolve(latest());await first;assert.equal(model.snapshot().latest,null)
  pending=defer();const second=model.latest();await new Promise(setImmediate);model.dispose();pending.resolve(latest());await second;assert.equal(model.snapshot().latest,null)
})
test("history appends exact pages and refuses to mix changed execution progress or duplicate cursors",async()=>{
  let changed=false,calls=0,held
  const api={getWorkflowV2Outputs:async()=>latest(),getWorkflowV2OutputHistory:async(_id,after)=>{calls++;if(held)return held.promise;return history(after,changed?{output_version:"c".repeat(64)}:{})}}
  const model=createPgNativeWorkflowOutputSession(api,run,flow,()=>{});model.setActive(true);await model.latest();await model.history();await model.history()
  assert.deepEqual(model.snapshot().history.map(step=>step.step_key),["wf2_00002_tool","wf2_00003_model"]);assert.equal(model.snapshot().nextAfter,null);await model.history();assert.equal(calls,2)
  await model.latest();changed=true;await model.history();assert.equal(model.snapshot().latest,null);assert.match(model.snapshot().error,/执行进度已更新/)
  changed=false;await model.latest();held=defer();const first=model.history(),second=model.history();await new Promise(setImmediate);const before=calls;held.resolve(history());await Promise.all([first,second]);assert.equal(calls,before)
  held=null;api.getWorkflowV2OutputHistory=async()=>history();await model.history();assert.equal(model.snapshot().latest,null);assert.ok(model.snapshot().error);model.dispose()
})
test("wrong Workflow context and Native 401 clear the entire private output snapshot",async()=>{
  let expired=0
  const api={getWorkflowV2Outputs:async()=>({...latest(),run:{...header(),workflow_id:other}}),getWorkflowV2OutputHistory:async()=>history()}
  const model=createPgNativeWorkflowOutputSession(api,run,flow,()=>{expired++});model.setActive(true);await model.latest();assert.equal(model.snapshot().latest,null)
  api.getWorkflowV2Outputs=async()=>latest();await model.latest();assert.ok(model.snapshot().latest)
  api.getWorkflowV2OutputHistory=async()=>{throw new PgNativePilotError(401,"expired")};await model.history();assert.equal(expired,1);assert.equal(model.snapshot().latest,null);assert.deepEqual(model.snapshot().history,[])
  api.getWorkflowV2Outputs=async()=>{throw Error("must not be called after expiry")};model.setActive(true);await model.latest();assert.equal(expired,1)
})
test("historical samples match the same Workflow and stable node identity, exclude skipped/type-changed/debug virtual nodes and preserve explicit empty output",()=>{
  const source=latest(),current=graph(),before=JSON.stringify(source)
  const result=historicalWorkflowSamples(source,flow,2,current,"model");assert.deepEqual({...result.outputs},{tool:"Historical Tool output"});assert.match(result.warnings.join(" "),/不同修订/)
  assert.throws(()=>historicalWorkflowSamples(source,other,1,current,"model"))
  const skipped=structuredClone(source);skipped.nodes[1].node_status="skipped";assert.deepEqual({...historicalWorkflowSamples(skipped,flow,1,current,"model").outputs},{})
  const changed=structuredClone(current);changed.nodes[1].type="model";assert.deepEqual({...historicalWorkflowSamples(source,flow,1,changed,"model").outputs},{})
  const empty=structuredClone(source);empty.nodes[1].output_text="";assert.equal(historicalWorkflowSamples(empty,flow,1,current,"model").outputs.tool,"")
  const debug={...source,run:{...header(),node_debug_id:"model"},nodes:source.nodes.filter(node=>node.node_id!=="tool")}
  assert.deepEqual({...historicalWorkflowSamples(debug,flow,1,current,"end").outputs},{model:"Safe Model result"})
  assert.notEqual(result.context,historicalWorkflowSamples({...source,run:{...header(),output_version:"c".repeat(64)}},flow,2,current,"model").context)
  assert.equal(JSON.stringify(source),before)
})
test("public output DTO refuses arbitrary metadata, invalid loop paths, long output and malformed history identity",()=>{
  const source=latest()
  for(const node of [{...source.nodes[1],output_text:"x".repeat(4001)},{...source.nodes[1],node_status:"pending"},{...source.nodes[1],configuration:{api_key:"private"}},{...source.nodes[1],loop_path:null},
    {...source.nodes[1],loop_path:[{node_id:"loop",round:2,total:1}]}])assert.throws(()=>parseWorkflowLatestOutputs({...source,nodes:[source.nodes[0],node]}))
  assert.throws(()=>parseWorkflowOutputHistory({...history(),items:[{...history().items[0],node_id:"different"}]}))
  assert.throws(()=>parseWorkflowOutputHistory({...history(),next_after:"wf2_00003_model"}))
  assert.throws(()=>parseWorkflowLatestOutputs({...source,run:{...header(),run_id:other}},run))
})
