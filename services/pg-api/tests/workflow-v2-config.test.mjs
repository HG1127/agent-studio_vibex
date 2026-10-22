// Real embedded SQL/RLS + Native Cookie HTTP, all data and keys synthetic.
import test from "node:test"
import assert from "node:assert/strict"
import {readFileSync} from "node:fs"
import {createServer} from "node:http"
import {randomBytes} from "node:crypto"
import {PGlite} from "@electric-sql/pglite"
import {vector} from "@electric-sql/pglite-pgvector"
import {safeWorkflowGraph} from "../src/contracts.ts"
import {WorkflowRepository} from "../src/workflow-repository.ts"
import {WorkflowSafeRunRepository} from "../src/workflow-safe-run-repository.ts"
import {WorkflowValidationRepository} from "../src/workflow-validation-repository.ts"
import {safeWorkflowPlan} from "../src/workflow-safe-plan.ts"
import {AgentSpecRepository} from "../src/repository.ts"
import {ModelConnectionRepository} from "../src/model-connection-repository.ts"
import {ToolConnectionRepository} from "../src/tool-connection-repository.ts"
import {KnowledgeBaseRepository} from "../src/knowledge-repository.ts"
import {NativeAuthRepository} from "../src/native-auth-repository.mjs"
import {createNativeAuthHttpHandler} from "../src/native-auth-http.mjs"
import {createHandler} from "../src/http.ts"
import {freshSchemaForTest} from "../src/baota-pg18-fresh-init.mjs"
import {reviewedNativeSqlForEmbeddedTest,prepareNativeAuthPgliteRoles} from "./helpers/native-pg18-embedded.mjs"
import {createPgNativePilotApi} from "../../../src/lib/pgNativePilotApi.ts"
const node=(id,type,data={})=>({id,type,data:{title:id,...data},position:{x:0,y:0}})
const edge=(source,target,sourceHandle)=>({id:source+"-"+target+"-"+(sourceHandle??"default"),source,target,
  ...(sourceHandle?{sourceHandle}:{})})
function nested(){return {version:2,nodes:[node("start","start"),
  node("outer","loop",{mode:"count",count:3,max_iterations:3}),
  node("inner","loop",{mode:"list",list_source:"{{input}}",delimiter:"line",max_iterations:5}),
  node("calculate","tool",{tool:"calculate",params_template:'{"expression":"{{loop.item}}+1"}'}),
  node("condition","condition",{op:"contains",value:"ok",ref_title:"calculate"}),
  node("finishBody","tool",{tool:"summarize",params_template:'{"text":"{{calculate.output}}"}'}),
  node("end","end",{output_template:"{{outer.output}}"})],edges:[edge("start","outer"),
    edge("outer","inner"),edge("outer","end","done"),edge("inner","calculate"),
    edge("inner","condition","done"),edge("calculate","inner"),
    edge("condition","outer","false"),edge("condition","finishBody","true"),edge("finishBody","outer")]}}

test("versioned graph preserves full node data and nested bounded loop exits",()=>{
  const graph=nested()
  assert.deepEqual(safeWorkflowGraph(graph),graph)
  assert.deepEqual(safeWorkflowGraph(JSON.parse(JSON.stringify(graph))),graph)
  assert.throws(()=>safeWorkflowPlan(graph),error=>error.code==="workflow_execution_node_not_supported")
  const v1={nodes:[node("start","start"),node("end","end")],edges:[edge("start","end")]}
  assert.equal(safeWorkflowPlan(v1).nodes.length,2)
  const implicit=structuredClone(v1);implicit.nodes[1].data.output_template="must not be ignored"
  assert.throws(()=>safeWorkflowGraph(implicit),error=>error.code==="invalid_workflow_graph")
})

test("versioned graph rejects malformed branching, loop escape, crossed entry and unsafe payloads",()=>{
  const invalid=[]
  const add=edit=>{const graph=nested();edit(graph);invalid.push(graph)}
  add(g=>{g.nodes[3].data.headers={Authorization:"not-permitted"}})
  add(g=>{g.nodes[3].data.owner_user_id="forged"})
  add(g=>{g.nodes[3].data.params_template="x".repeat(12001)})
  add(g=>{g.nodes[1].data.count="3"})
  add(g=>{g.nodes[1].data.max_iterations=21})
  add(g=>{g.nodes[2].data.mode="eval"})
  add(g=>{g.nodes[4].data.op="javascript"})
  add(g=>{g.nodes[4].data.ref_title="not-present"})
  add(g=>{g.nodes[4].data.title="calculate"})
  add(g=>{g.edges.find(e=>e.source==="condition"&&e.sourceHandle==="true").sourceHandle="false"})
  add(g=>{g.edges.find(e=>e.source==="outer"&&e.sourceHandle==="done").sourceHandle="true"})
  add(g=>{g.edges.push(edge("calculate","end"))})
  add(g=>{g.edges.push(edge("start","calculate"))})
  add(g=>{g.edges.push(edge("finishBody","condition"))})
  add(g=>{g.edges=g.edges.filter(e=>e.source!=="calculate")})
  add(g=>{g.edges.push(edge("inner","outer","done"))})
  add(g=>{g.version=3})
  for(const graph of invalid)assert.throws(()=>safeWorkflowGraph(graph),error=>error.code==="invalid_workflow_graph")
  const huge={version:2,nodes:[node("start","start"),
    ...Array.from({length:4},(_,i)=>node("model"+i,"model",{prompt:"字".repeat(12000)})),node("end","end")],
    edges:[edge("start","model0"),edge("model0","model1"),edge("model1","model2"),edge("model2","model3"),edge("model3","end")]}
  assert.throws(()=>safeWorkflowGraph(huge),error=>error.code==="invalid_workflow_graph")
})

test("invalid configuration objects cannot execute serialization hooks during validation",()=>{
  let invoked=0
  for(const change of [
    graph=>{graph.nodes[0].data.toJSON=()=>{invoked++;return {title:"start"}}},
    graph=>{graph.nodes[0].data.title={toJSON(){invoked++;return "start"}}},
  ]){
    const graph=nested();change(graph)
    assert.throws(()=>safeWorkflowGraph(graph),error=>error.code==="invalid_workflow_graph")
  }
  assert.equal(invoked,0)
})

async function fixture(){
  const db=await PGlite.create({extensions:{vector}}),key=randomBytes(32)
  let server
  await db.exec("CREATE DATABASE agent_studio")
  await db.exec(freshSchemaForTest().sql)
  await prepareNativeAuthPgliteRoles(db)
  await db.exec(reviewedNativeSqlForEmbeddedTest(readFileSync(
    new URL("../../../db/postgres/010_pg18_native_auth_proposed.sql",import.meta.url),"utf8")))
  let tail=Promise.resolve()
  const pool={async connect(){const previous=tail;let release
    tail=new Promise(resolve=>{release=resolve});await previous
    return {query:(sql,args=[])=>db.query(sql,args),release}}}
  const auth=new NativeAuthRepository(pool)
  const password="SyntheticWorkflowPassword#2026"
  await auth.provisionInitialAdmin({email:"alice@example.com",password,display_name:"Synthetic Alice"})
  const initial=await auth.login("alice@example.com",password)
  await auth.provisionEmployee(initial.token,{email:"bob@example.com",password,display_name:"Synthetic Bob"})
  const users={}
  for(const who of ["alice","bob"]){
    const login=await auth.login(who+"@example.com",password)
    users[who]=(await auth.getSessionProfile(login.token)).identity
  }
  const agents=new AgentSpecRepository(pool),flows=new WorkflowRepository(pool)
  const models=new ModelConnectionRepository(pool,key),tools=new ToolConnectionRepository(pool,key)
  const knowledge=new KnowledgeBaseRepository(pool),resources={}
  for(const who of ["alice","bob"]){
    const identity=users[who]
    const model=await models.create(identity,{name:who,provider:"openai",base_url:"https://api.openai.com/v1",
      api_key:"SyntheticWorkflowModelMaterialNeverReal0123456789",enabled:true,models:["gpt-4.1-mini"]})
    await db.query("UPDATE agentstudio.model_connections SET status='ok' WHERE id=$1",[model.id])
    const agent=await agents.create(identity,who,{goal:"Synthetic",task_scope:"",deliverables:[],task_plan:[],
      done_criteria:[],tools:[],knowledge_base_ids:[],require_approval:true})
    const tool=await tools.create(identity,{name:who,description:"Synthetic tool only",url:"https://api.example.com/run",
      method:"POST",headers:[],body_template:"{}",timeout_s:5,enabled:true})
    const kb=await knowledge.create(identity,who,"")
    resources[who]={model,agent,tool,kb}
  }
  const runs=new WorkflowSafeRunRepository(pool),validation=new WorkflowValidationRepository(pool)
  let backend
  const origin="https://workflow.test.invalid"
  const native=createNativeAuthHttpHandler({auth,allowedOrigin:origin,allowConfigurationWrites:true,
    businessHandler:(req,res)=>backend(req,res)})
  backend=createHandler({repository:agents,workflowRepository:flows,workflowSafeRunRepository:runs,
    workflowValidationRepository:validation,allowedOrigin:origin,
    verifyToken:async()=>{throw Error("native_cookie_required")},authenticateRequest:req=>native.authenticateRequest(req)})
  server=createServer((req,res)=>{void native.handler(req,res).catch(()=>res.destroy())})
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve))
  const makeApi=()=>{let cookie="";return createPgNativePilotApi(async(route,options={})=>{
    const response=await fetch("http://127.0.0.1:"+server.address().port+route,{...options,
      headers:{...options.headers,Origin:origin,...(cookie?{Cookie:cookie}:{})},signal:AbortSignal.timeout(10000)})
    const saved=response.headers.get("set-cookie");if(saved)cookie=saved.split(";")[0]
    return response
  },"")}
  const api=makeApi();await api.login("alice@example.com",password)
  return {db,pool,auth,flows,runs,validation,users,resources,api,makeApi,
    async close(){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await db.close();key.fill(0)}}
}
function bound(resources){return {version:2,nodes:[node("start","start",{input_hint:"Task instruction"}),
  node("model","model",{prompt:"{{input}}",model_binding:{connection_id:resources.model.id,
    connection_revision:resources.model.revision,model_id:"gpt-4.1-mini"}}),
  node("agent","agent",{prompt:"{{model.output}}",max_steps:3,
    agent_binding:{spec_id:resources.agent.id,spec_revision:resources.agent.revision}}),
  node("tool","tool",{tool_binding:{connection_id:resources.tool.id,connection_revision:resources.tool.revision},params_template:"{}"}),
  node("kb","tool",{tool:"knowledge_search",knowledge_base_ids:[resources.kb.id],params_template:'{"query":"{{input}}"}'}),
  node("end","end",{output_template:"{{kb.output}}"})],edges:[edge("start","model"),edge("model","agent"),
    edge("agent","tool"),edge("tool","kb"),edge("kb","end")]}}

test("Native Cookie HTTP persists V2 configuration, preserves optimistic revisions and audits no private text",async()=>{
  const f=await fixture()
  try{
    const graph=bound(f.resources.alice)
    const row=await f.api.createWorkflowGraph("Complete configuration",graph)
    assert.deepEqual(row.graph,graph)
    assert.deepEqual((await f.api.getWorkflow(row.id)).graph,graph)
    assert.equal((await f.api.listWorkflows()).length,1)
    const renamed=await f.api.updateWorkflow(row.id,1,"Rename preserves graph")
    assert.equal(renamed.revision,2);assert.deepEqual(renamed.graph,graph)
    const changed=structuredClone(graph);changed.nodes[1].data.prompt="Private revised prompt {{input}}"
    const updated=await f.api.updateWorkflowGraph(row.id,2,"Updated graph",changed)
    assert.equal(updated.revision,3);assert.deepEqual(updated.graph,changed)
    await assert.rejects(f.api.updateWorkflowGraph(row.id,2,"stale",graph),e=>e.status===409)
    const audit=(await f.db.query("SELECT action,metadata FROM agentstudio.audit_events "+
      "WHERE target_kind='workflow' AND target_id=$1 ORDER BY occurred_at",[row.id])).rows
    assert.deepEqual(audit.map(item=>item.action),["workflow.config_create","workflow.config_update","workflow.config_update"])
    assert.deepEqual(audit.at(-1).metadata,{revision:3,graph_version:2,node_count:6})
    assert.equal(JSON.stringify(audit).includes("Private revised prompt"),false)
    // The old Worker must never pretend that full-node configuration executed.
    await assert.rejects(f.api.submitWorkflowRun(row.id,3,"v2-must-not-run-0001"),e=>e.status===409)
    await assert.rejects(f.api.validateWorkflow(row.id,3,"v2-must-not-validate"),e=>e.status===409)
    assert.equal((await f.db.query("SELECT count(*)::int AS n FROM agentstudio.jobs")).rows[0].n,0)
    assert.equal((await f.db.query("SELECT count(*)::int AS n FROM agentstudio.runs")).rows[0].n,0)
    const bobApi=f.makeApi()
    await bobApi.login("bob@example.com","SyntheticWorkflowPassword#2026")
    assert.deepEqual(await bobApi.listWorkflows(),[])
    await assert.rejects(bobApi.getWorkflow(row.id),e=>e.status===404)
    await assert.rejects(bobApi.updateWorkflowGraph(row.id,3,"forged",graph),e=>e.status===404)
    await assert.rejects(bobApi.createWorkflowGraph("foreign resources",graph),e=>e.status===404)
    assert.equal(await f.flows.get(f.users.bob,row.id),null)
    assert.equal(await f.flows.update(f.users.bob,row.id,"forged",graph,3),null)
    assert.equal((await f.api.getWorkflow(row.id)).revision,3)
  }finally{await f.close()}
})

test("graph write rejects every foreign or stale resource and atomically rolls back audit and revision",async()=>{
  const f=await fixture()
  try{
    const own=bound(f.resources.alice),foreign=bound(f.resources.bob)
    const saved=await f.flows.create(f.users.alice,"Owner config",own)
    for(const index of [1,2,3,4]){
      const graph=structuredClone(own);graph.nodes[index]=foreign.nodes[index]
      await assert.rejects(f.flows.create(f.users.alice,"Denied",graph),e=>e.status===404)
      await assert.rejects(f.flows.update(f.users.alice,saved.id,"Denied",graph,1),e=>e.status===404)
    }
    for(const [index,key,revision] of [[1,"model_binding","connection_revision"],[2,"agent_binding","spec_revision"],[3,"tool_binding","connection_revision"]]){
      const graph=structuredClone(own);graph.nodes[index].data[key][revision]++
      await assert.rejects(f.flows.update(f.users.alice,saved.id,"Stale",graph,1),e=>e.status===409)
    }
    await f.db.query("UPDATE agentstudio.model_connections SET enabled=false WHERE id=$1",[f.resources.alice.model.id])
    await assert.rejects(f.flows.update(f.users.alice,saved.id,"Disabled",own,1),e=>e.code==="workflow_model_not_ready")
    const current=await f.flows.get(f.users.alice,saved.id)
    assert.equal(current.revision,1);assert.deepEqual(current.graph,own)
    assert.equal((await f.db.query("SELECT count(*)::int AS n FROM agentstudio.workflows")).rows[0].n,1)
    assert.equal((await f.db.query("SELECT count(*)::int AS n FROM agentstudio.audit_events WHERE target_kind='workflow'")).rows[0].n,1)
  }finally{await f.close()}
})

test("audit failure rolls back the graph insert/update and preserves the previous revision",async()=>{
  const f=await fixture()
  try{
    const graph=bound(f.resources.alice)
    const saved=await f.flows.create(f.users.alice,"Before",graph)
    await f.db.exec("CREATE FUNCTION public.fail_workflow_config_audit() RETURNS trigger LANGUAGE plpgsql AS $$ "+
      "BEGIN IF NEW.action IN ('workflow.config_create','workflow.config_update') THEN "+
      "RAISE EXCEPTION 'synthetic_config_audit_fault'; END IF; RETURN NEW; END $$; "+
      "CREATE TRIGGER synthetic_config_audit_fault BEFORE INSERT ON agentstudio.audit_events "+
      "FOR EACH ROW EXECUTE FUNCTION public.fail_workflow_config_audit()")
    await assert.rejects(f.flows.create(f.users.alice,"Must roll back",graph),/synthetic_config_audit_fault/)
    await assert.rejects(f.flows.update(f.users.alice,saved.id,"Must roll back",graph,1),/synthetic_config_audit_fault/)
    const current=await f.flows.get(f.users.alice,saved.id)
    assert.equal(current.name,"Before");assert.equal(current.revision,1)
    assert.equal((await f.flows.list(f.users.alice)).length,1)
    await f.db.exec("DROP TRIGGER synthetic_config_audit_fault ON agentstudio.audit_events")
    const next=await f.flows.update(f.users.alice,saved.id,"After recovery",graph,1)
    assert.equal(next.revision,2)
  }finally{await f.close()}
})
