import test from "node:test"
import assert from "node:assert/strict"
import {loadKnowledgeToolContext,currentKnowledgeBinding,knowledgeBindingCurrent,knowledgePendingMatches} from "../src/lib/pgNativeKnowledgeTool.ts"
import {createPgNativePilotApi,PgNativePilotError} from "../src/lib/pgNativePilotApi.ts"
import {createPgNativeWorkflowRunSession,workflowApprovalReady,workflowStepReview} from "../src/lib/pgNativeWorkflowRunSession.ts"
import {createPgNativeAutonomousAgentSession,autonomousApprovalReady} from "../src/lib/pgNativeAutonomousAgentSession.ts"
import {KNOWLEDGE_TOOL_CHARGE_ACKNOWLEDGEMENT as ack} from "../services/pg-api/src/knowledge-retrieval-binding.ts"
const flowId="11111111-1111-4111-8111-111111111111",runId="22222222-2222-4222-8222-222222222222",agentId="33333333-3333-4333-8333-333333333333"
const profileId="44444444-4444-4444-8444-444444444444",baseId="55555555-5555-4555-8555-555555555555",modelId="66666666-6666-4666-8666-666666666666"
const consent={revision:3,profile_id:profileId,profile_revision:2,profile_valid:true,query_enabled:true,index_enabled:false}
const context={enabled:true,consent},binding=currentKnowledgeBinding("hybrid",context),hash="a".repeat(64),step="wf2_00002_search"
const turn=()=>new Promise(resolve=>setImmediate(resolve))
function fixture(kind="workflow"){
  const configuration={title:"Search",tool:"knowledge_search",knowledge_base_ids:[baseId],knowledge_retrieval:binding,params_template:'{"query":"Own query"}'}
  const graph={version:2,nodes:[{id:"start",type:"start",data:{title:"Start"},position:{x:0,y:0}},
    {id:"search",type:"tool",data:configuration,position:{x:100,y:0}},{id:"end",type:"end",data:{title:"End"},position:{x:200,y:0}}],edges:[{id:"a",source:"start",target:"search"},{id:"b",source:"search",target:"end"}]}
  const agent={id:agentId,revision:2,name:"Own Agent",spec:{goal:"Own goal",tools:["knowledge_search"],knowledge_base_ids:[baseId],knowledge_retrieval:binding,model_binding:{connection_id:modelId,connection_revision:1,model_id:"synthetic"}}}
  const model={id:modelId,revision:1,name:"Own model",provider:"openai",base_url:"https://api.openai.com/v1",enabled:true,status:"ok",models:["synthetic"]}
  const workflow={id:flowId,revision:2,name:"Own Workflow",graph}
  let record={execution_mode:kind==="workflow"?"workflow_native_v2":"agent_native_v2",replayed:false,
    run:{id:runId,kind,workflow_id:kind==="workflow"?flowId:null,agent_spec_id:kind==="workflow"?null:agentId,status:"awaiting_approval",instruction:"Private task",result_text:"",step_count:0,checkpoint:{workflow_revision:2,spec_revision:2,max_steps:3}},
    steps:[],approvals:[{step_key:step,status:"pending"}],pending_effect:{step_key:step,input_sha256:hash,node_id:kind==="workflow"?"search":"agent",kind:"tool",input:'{"query":"Own query"}',configuration,
      ...(kind==="workflow"?{}:{agent_context:{parent_step_key:"wf2_00002_agent",round:1,phase:"tool"}}),missing:[]}}
  let settings=structuredClone(context),handler=async(...args)=>{calls.push(args);throw new PgNativePilotError(0,"lost")};const calls=[]
  const api={getConfigCapabilities:async()=>({knowledge_tool_runtime_enabled:settings.enabled}),getKnowledgeEmbeddingConsent:async()=>settings.consent,
    listKnowledge:async()=>[],listSharedKnowledge:async()=>[{id:baseId,name:"Own shared source",owner_name:"Owner",base_revision:1,semantic_allowed:true}],
    getAgent:async()=>agent,getWorkflow:async()=>workflow,getModelConnection:async()=>model,
    getWorkflowV2Run:async()=>record,getAutonomousAgentRun:async()=>record,
    listWorkflowV2Runs:async()=>[{id:runId,status:record.run.status,instruction_preview:"Own task",result_preview:record.run.result_text}],
    listAutonomousAgentRuns:async()=>[{id:runId,status:record.run.status,instruction_preview:"Own task",result_preview:record.run.result_text}],
    decideWorkflowV2Node:(...args)=>handler(...args),decideAutonomousAgentNode:(...args)=>handler(...args)}
  const session=kind==="workflow"?createPgNativeWorkflowRunSession(api):createPgNativeAutonomousAgentSession(api)
  return {api,session,agent,model,workflow,calls,get record(){return record},set record(value){record=value},set settings(value){settings=value},set handler(value){handler=value}}
}

test("Tool metadata defaults disabled, never requests consent when off and rejects stale profile/billing or scope",async()=>{
  let reads=0
  assert.deepEqual(await loadKnowledgeToolContext({getConfigCapabilities:async()=>({}),getKnowledgeEmbeddingConsent:async()=>{reads++;return consent}}),{enabled:false,consent:null})
  assert.equal(reads,0);assert.ok(knowledgeBindingCurrent(binding,context))
  for(const patch of [{profile_valid:false},{query_enabled:false},{profile_valid:"true"},{query_enabled:"true"},{revision:4},{profile_revision:3},{profile_id:baseId}])assert.equal(knowledgeBindingCurrent(binding,{enabled:true,consent:{...consent,...patch}}),false)
  assert.equal(knowledgeBindingCurrent({...binding,payer:agentId},context),false)
  assert.equal(currentKnowledgeBinding("hybrid",{enabled:false,consent}),undefined)
  const pending={kind:"tool",configuration:{tool:"knowledge_search",knowledge_retrieval:binding,knowledge_base_ids:[baseId]}}
  assert.ok(knowledgePendingMatches(pending,binding,[baseId]))
  assert.equal(knowledgePendingMatches(pending,binding,[profileId]),false)
  assert.equal(knowledgePendingMatches(pending,undefined,[baseId]),false)
  const caps={mode:"native_pg18",config_writes_enabled:true,model_probe_enabled:false,run_execution_enabled:false,knowledge_tool_runtime_enabled:true}
  const api=createPgNativePilotApi(async()=>new Response(JSON.stringify(caps),{headers:{"content-type":"application/json"}}),"")
  await assert.rejects(api.getConfigCapabilities(),e=>e.code==="invalid_native_capabilities")
})

test("Workflow and autonomous paid decisions freeze explicit fee intent through lost responses, changed view and exact retries",async()=>{
  for(const kind of ["workflow","agent"]){
    const f=fixture(kind),s=f.session;s.setActive(true);await turn();await s.select(runId)
    await s.decide("approved",true);assert.equal(f.calls.length,0)
    await s.decide("approved",false,true);assert.equal(f.calls.length,0)
    await s.decide("approved",true,true);const intent=s.snapshot().pendingMutation
    assert.ok(Object.isFrozen(intent));assert.equal(intent.knowledge_query_charge,ack)
    assert.deepEqual(f.calls[0],[runId,"approved",step,hash,ack])
    f.record={...f.record,pending_effect:{...f.record.pending_effect,step_key:"wf2_00003_other",input_sha256:"b".repeat(64)}}
    f.handler=async(...args)=>{f.calls.push(args);throw new PgNativePilotError(409,"changed")}
    await s.decide("rejected");await s.retryMutation();assert.deepEqual(f.calls[1],f.calls[0]);assert.equal(s.snapshot().pendingMutation,intent)
    s.setActive(false);assert.equal(s.snapshot().detail,null);assert.deepEqual(s.snapshot().runs,[]);assert.equal(s.snapshot().pendingMutation,intent)
    s.dispose();assert.equal(s.snapshot().pendingMutation,null)
  }
})

test("both approval views and sessions block stale paid bindings; refusal never authorizes a charge",async()=>{
  for(const kind of ["workflow","agent"]){
    const f=fixture(kind),s=f.session;s.setActive(true);await turn();await s.select(runId)
    const ready=()=>kind==="workflow"?workflowApprovalReady(s.snapshot().detail):autonomousApprovalReady(s.snapshot().detail,[f.agent],[f.model])
    assert.equal(ready(),true);assert.equal(workflowStepReview(f.record.pending_effect).charged,true)
    f.settings={enabled:true,consent:{...consent,revision:4}};await s.refresh();assert.equal(ready(),false)
    await s.decide("approved",true,true);assert.equal(f.calls.length,0)
    f.settings=structuredClone(context);f.api.listSharedKnowledge=async()=>[];await s.refresh();assert.equal(ready(),false)
    await s.decide("approved",true,true);assert.equal(f.calls.length,0)
    f.handler=async(...args)=>{f.calls.push(args);return {...f.record,approvals:[{step_key:step,status:"rejected"}]}}
    await s.decide("rejected",false,true);assert.deepEqual(f.calls[0],[runId,"rejected",step,hash]);s.dispose()
  }
})

test("background failures and hidden late writes cannot leave retained prompts/results in either employee view",async()=>{
  for(const kind of ["workflow","agent"]){
    const f=fixture(kind),s=f.session;s.setActive(true);await turn();await s.select(runId)
    f.record={...f.record,run:{...f.record.run,result_text:"Retained private evidence"}};await s.refresh();assert.match(s.snapshot().detail.run.result_text,/Retained/)
    f.record={...f.record,knowledge_outputs_available:false,run:{...f.record.run,result_text:""}};await s.refresh();await s.decide("approved",true,true)
    assert.equal(f.calls.length,0);assert.equal(s.snapshot().detail.knowledge_outputs_available,false)
    f.record={...f.record,knowledge_outputs_available:"invalid"};await s.refresh();assert.equal(s.snapshot().detail,null)
    f.record={...f.record,knowledge_outputs_available:true};await s.refresh()
    const route=kind==="workflow"?"getWorkflowV2Run":"getAutonomousAgentRun",old=f.api[route]
    f.api[route]=async()=>{throw new PgNativePilotError(409,"knowledge_observations_unavailable")};await s.poll()
    assert.equal(s.snapshot().detail,null);assert.deepEqual(s.snapshot().runs,[])
    f.api[route]=old;await s.refresh();let resolve
    f.handler=()=>new Promise(done=>{resolve=done});const work=s.decide("approved",true,true);await turn();s.setActive(false)
    resolve({...f.record,decision_confirmation:{run_id:runId,step_key:step,input_sha256:hash,status:"approved"}});await work
    assert.equal(s.snapshot().detail,null);assert.deepEqual(s.snapshot().runs,[]);s.dispose()
  }
})
