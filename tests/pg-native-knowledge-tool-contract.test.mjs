import test from "node:test"
import assert from "node:assert/strict"
import {createPgNativePilotApi} from "../src/lib/pgNativePilotApi.ts"
import {KNOWLEDGE_TOOL_CHARGE_ACKNOWLEDGEMENT as ACK} from "../services/pg-api/src/knowledge-retrieval-binding.ts"
import {exportPgWorkflowJson,importPgWorkflowJson} from "../src/lib/pgNativeWorkflowTransfer.ts"
const id="11111111-1111-4111-8111-111111111111",base="22222222-2222-4222-8222-222222222222",profile="33333333-3333-4333-8333-333333333333"
const retrieval={mode:"hybrid",profile_id:profile,profile_revision:2,consent_revision:3}
test("both native approval routes send a fee acknowledgement only for the explicit approved intent",async()=>{
  const calls=[],api=createPgNativePilotApi(async(url,options)=>{calls.push({url,...options});return Response.json({})},"")
  for(const method of [api.decideWorkflowV2Node,api.decideAutonomousAgentNode]){
    await method(id,"approved","wf2_00002_search","a".repeat(64),ACK)
    assert.deepEqual(JSON.parse(calls.at(-1).body),{decision:"approved",step_key:"wf2_00002_search",input_sha256:"a".repeat(64),knowledge_query_charge:ACK})
    assert.equal(calls.at(-1).credentials,"same-origin")
    await method(id,"rejected","wf2_00002_search","a".repeat(64))
    assert.equal(Object.hasOwn(JSON.parse(calls.at(-1).body),"knowledge_query_charge"),false)
    const before=calls.length
    await assert.rejects(method(id,"rejected","wf2_00002_search","a".repeat(64),ACK),e=>e.status===400)
    await assert.rejects(method(id,"approved","wf2_00002_search","a".repeat(64),"PAY_ONCE_FOR_THIS_READER_QUERY"),e=>e.status===400)
    assert.equal(calls.length,before)
  }
})
test("unrelated Agent edits preserve frozen retrieval policy; removing KBs or explicitly choosing keyword clears it",async()=>{
  const role={id,name:"Synthetic",revision:3,spec:{goal:"Own goal",task_scope:"Own scope",tools:["knowledge_search"],knowledge_base_ids:[base],knowledge_retrieval:retrieval}}
  const api=createPgNativePilotApi(async(url,options)=>Response.json({item:options.method==="GET"?role:{...role,revision:4,spec:JSON.parse(options.body).spec}}),"")
  for(const action of [()=>api.updateAgent(id,3,"Changed name","Changed goal"),()=>api.bindAgentModel(id,3,null),()=>api.updateAgentHttpTools(id,3,[]),()=>api.updateAgentMcpTools(id,3,[]),()=>api.updateAgentKnowledgeBases(id,3,[base])]){
    assert.deepEqual((await action()).spec.knowledge_retrieval,retrieval)
  }
  assert.equal((await api.updateAgentKnowledgeBases(id,3,[])).spec.knowledge_retrieval,undefined)
  assert.equal((await api.updateAgentKnowledgeBases(id,3,[base],null)).spec.knowledge_retrieval,undefined)
  await assert.rejects(api.updateAgentKnowledgeBases(id,3,[],retrieval),e=>e.status===400)
})
test("portable semantic graphs strip billing/profile/KB bindings and import as an inert Tool requiring rebinding",()=>{
  const graph={version:2,nodes:[{id:"start",type:"start",data:{title:"Start"},position:{x:0,y:0}},
    {id:"search",type:"tool",data:{title:"Semantic",tool:"knowledge_search",knowledge_base_ids:[base],knowledge_retrieval:retrieval,params_template:'{"query":"Synthetic"}'},position:{x:100,y:0}},
    {id:"end",type:"end",data:{title:"End"},position:{x:200,y:0}}],edges:[{id:"a",source:"start",target:"search"},{id:"b",source:"search",target:"end"}]}
  const text=exportPgWorkflowJson("Synthetic",graph)
  assert.equal(text.includes(profile),false);assert.equal(text.includes(base),false);assert.equal(text.includes("knowledge_retrieval"),false)
  let sequence=0;const imported=importPgWorkflowJson(text,()=>String(++sequence))
  assert.equal(imported.graph.nodes.find(n=>n.type==="tool").data.tool_binding_required,true)
})
