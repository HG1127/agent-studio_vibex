import test from "node:test"
import assert from "node:assert/strict"
import {agentFixture,alice,bob} from "./helpers/workflow-v2-agent-fixture.mjs"
import {McpConnectionRepository} from "../src/mcp-connection-repository.ts"
import {safeAgentSpec} from "../src/contracts.ts"
import {createMcpToolExecutor} from "../src/mcp-call.ts"
import {verifyMcpExecutionSchema} from "../src/mcp-privileges.ts"
import {RunRepository} from "../src/run-repository.ts"
import {WorkflowV2RunRepository} from "../src/workflow-v2-run-repository.ts"
import {AutonomousAgentRunRepository} from "../src/autonomous-agent-run-repository.ts"
import {WorkflowV2Worker} from "../src/workflow-v2-worker.ts"
import {workflowNodeDebugFixture} from "./helpers/workflow-node-debug-fixture.mjs"
import {createMcpDiscovery} from "../src/mcp-discovery.ts"
const key=Buffer.from("0123456789abcdef".repeat(4),"hex"),secret="synthetic-MCP-execution-secret-never-network"
const definition={name:"lookup",description:"Synthetic evidence; params: query",input_schema:{type:"object",properties:{query:{type:"string"}},required:["query"],additionalProperties:false},read_only:true,destructive:false,requires_tasks:false}
const input={name:"Own MCP",description:"Synthetic only",url:"https://mcp.example.com/server",headers:[{key:"authorization",value:"Bearer "+secret}],enabled:true}
async function setup(f,{version="2026-07-28",identity=alice}={}){
  const connections=new McpConnectionRepository(f.pool,key,f.pool),created=await connections.create(identity,input)
  const connection=await connections.discover(identity,created.id,created.revision,async()=>({version,tools:[definition]}))
  const binding={connection_id:connection.id,connection_revision:connection.revision,tool_name:definition.name,catalog_sha256:connection.catalog_sha256}
  const {require_approval:_,...body}=f.resources[identity===alice?"alice":"bob"].spec.spec
  const spec=await f.agents.create(identity,"MCP role",safeAgentSpec({...body,knowledge_base_ids:[],tools:["mcp_lookup"],mcp_tools:[{name:"mcp_lookup",...binding}]}))
  return {connection,binding,spec,connections,body}
}
async function direct(f,binding,params={query:"Own evidence"},repository=f.runs){
  const graph={version:2,nodes:[{id:"start",type:"start",data:{title:"Start"},position:{x:0,y:0}},
    {id:"tool",type:"tool",data:{title:"MCP",mcp_binding:binding,params_template:JSON.stringify(params)},position:{x:100,y:0}},
    {id:"end",type:"end",data:{title:"End",output_template:"{{MCP.output}}"},position:{x:200,y:0}}],edges:[{id:"a",source:"start",target:"tool"},{id:"b",source:"tool",target:"end"}]}
  const flow=await f.flows.create(alice,"Direct MCP",graph)
  return repository.submit(alice,flow.id,{expected_revision:1,instruction:"Own direct task",idempotency_key:"mcp-direct-"+flow.id})
}
const response=(wire,result,extra={})=>({status:200,content_type:"application/json",session:"",text:JSON.stringify({jsonrpc:"2.0",id:wire.body.id,result}),...extra})
for(const mode of ["workflow","agent","autonomous"])test(mode+": one owner-pinned MCP Tool crosses real private mTLS after approval and survives new Workers",async()=>{
  const f=await agentFixture({autonomous:mode==="autonomous",mcp:true});let modelCalls=0,toolCalls=0,approvals=0
  try{
    await verifyMcpExecutionSchema(f.pool);const own=await setup(f,{version:mode==="agent"?"2025-03-26":"2026-07-28"})
    const execute=createMcpToolExecutor(async(material,wire)=>{
      assert.equal(material.url,input.url);assert.equal(material.headers[0].value,"Bearer "+secret)
      if(wire.body.method==="initialize")return response(wire,{protocolVersion:"2025-03-26",capabilities:{tools:{}}},{session:"own-session"})
      if(wire.body.method==="notifications/initialized")return {status:202,text:"",content_type:"",session:""}
      toolCalls++;assert.equal(wire.body.method,"tools/call");assert.equal(wire.body.params.name,"lookup");assert.deepEqual(wire.body.params.arguments,{query:"Own evidence"})
      return response(wire,{content:[{type:"text",text:"Own observation / "+secret}]})
    })
    await f.privateTls(async(_material,prompt)=>{
      modelCalls++;const plan=JSON.parse(prompt)
      assert.equal(plan.role.mcp_tools[0].input_schema.type,"object")
      for(const privateText of [secret,input.url,own.connection.id])assert.equal(prompt.includes(privateText),false)
      return JSON.stringify(plan.round===1?{action:"tool",tool:"mcp_lookup",params:{query:"Own evidence"}}:{action:"answer",answer:"Own MCP final"})
    },async makeWorker=>{
      const queued=mode==="workflow"?await direct(f,own.binding):await f.make({spec:own.spec})
      const done=await f.drive(makeWorker,queued.run.id,pending=>{
        if(pending.kind==="tool"){approvals++;assert.deepEqual(pending.configuration.mcp_binding,own.binding);assert.equal(toolCalls,0)}return "approved"
      })
      assert.equal(done.run.status,"succeeded");assert.equal(toolCalls,1);assert.equal(approvals,1);assert.equal(modelCalls,mode==="workflow"?0:2)
      assert.equal(JSON.stringify(done).includes(secret),false);assert.equal(await f.runs.get(bob,queued.run.id),null)
      assert.equal((await makeWorker().tick()).status,"idle")
      const audit=JSON.stringify((await f.db.query("SELECT metadata FROM agentstudio.audit_events WHERE run_id=$1",[queued.run.id])).rows)
      for(const privateText of [secret,input.url,"Own evidence","Own MCP final"])assert.equal(audit.includes(privateText),false)
    },{toolExecutor:{mcp:execute}})
  }finally{await f.close()}
})
test("MCP rejects foreign/stale/forged catalog bindings before saving and one-shot Agent cannot admit them",async()=>{
  const f=await agentFixture({autonomous:true,mcp:true})
  try{
    const own=await setup(f),foreign=await setup(f,{identity:bob})
    for(const [binding,status] of [[foreign.binding,404],[{...own.binding,catalog_sha256:"a".repeat(64)},409],[{...own.binding,connection_revision:1},409]])
      await assert.rejects(f.agents.create(alice,"Invalid",safeAgentSpec({...own.body,tools:["mcp_lookup"],knowledge_base_ids:[],mcp_tools:[{name:"mcp_lookup",...binding}]})),error=>error.status===status)
    await assert.rejects(new RunRepository(f.pool,{allowBoundModelRuns:true}).submit(alice,own.spec.id,{instruction:"Synthetic",idempotency_key:"mcp-one-shot-refused"}),/agent_mcp_tools_require_autonomous_runtime/)
    assert.equal((await f.db.query("SELECT count(*)::int AS n FROM agentstudio.jobs")).rows[0].n,0)
  }finally{await f.close()}
})
test("MCP invalid args and explicit business errors are failed, while response loss is unknown and never resent",async()=>{
  const f=await agentFixture({mcp:true});let calls=0,decryptions=0,mode="error"
  try{
    const own=await setup(f)
    f.setFault(sql=>{if(sql.startsWith("SELECT")&&sql.includes("value_ciphertext")&&sql.includes("mcp_connection_headers"))decryptions++})
    const execute=createMcpToolExecutor(async(_material,wire)=>{calls++;if(mode==="unknown")throw Error("response lost after tools/call")
      return response(wire,{isError:true,content:[{type:"text",text:secret}]})})
    await f.privateTls(async()=>{throw Error("No model")},async makeWorker=>{
      const invalid=await direct(f,own.binding,{query:123}),bad=await f.drive(makeWorker,invalid.run.id)
      assert.equal(bad.run.status,"failed");assert.equal(calls,0);assert.equal(decryptions,0)
      const error=await direct(f,own.binding),known=await f.drive(makeWorker,error.run.id)
      assert.equal(known.run.status,"failed");assert.equal(known.run.last_error_code,"workflow_mcp_tool_error");assert.equal(calls,1)
      assert.deepEqual((await f.db.query("SELECT status FROM agentstudio.external_effects WHERE run_id=$1 ORDER BY step_key",[error.run.id])).rows,[{status:"failed"},{status:"failed"}])
      mode="unknown";const unknown=await direct(f,own.binding),paused=await f.drive(makeWorker,unknown.run.id)
      assert.equal(paused.run.status,"paused");assert.equal(calls,2)
      for(let i=0;i<3;i++)assert.equal((await makeWorker().tick()).status,"idle")
      assert.equal(calls,2)
    },{toolExecutor:{mcp:execute}})
  }finally{await f.close()}
})
test("catalog changes after approval and a missing MCP adapter cannot release credentials or call a remote tool",async()=>{
  const f=await agentFixture({mcp:true});let calls=0,changed=false
  try{
    const own=await setup(f)
    f.setBeforeDispatch(async(_request,kind)=>{if(kind!=="tool"||changed)return;changed=true
      await f.db.query("UPDATE agentstudio.mcp_connections SET catalog=jsonb_set(catalog,'{tools,0,description}','\"Changed without revision\"') WHERE id=$1",[own.connection.id])
    })
    await f.privateTls(async()=>{throw Error("No model")},async makeWorker=>{
      const queued=await direct(f,own.binding),done=await f.drive(makeWorker,queued.run.id)
      assert.equal(done.run.status,"paused");assert.equal(calls,0)
    },{toolExecutor:{async mcp(){calls++;return {text:"must not call",isError:false}}}})
    f.setBeforeDispatch(undefined)
    const refreshed=await own.connections.update(alice,own.connection.id,input,2),ready=await own.connections.discover(alice,refreshed.id,refreshed.revision,async()=>({version:"2026-07-28",tools:[definition]}))
    const binding={...own.binding,connection_revision:ready.revision,catalog_sha256:ready.catalog_sha256}
    await f.privateTls(async()=>{throw Error("No model")},async makeWorker=>{
      const queued=await direct(f,binding),done=await f.drive(makeWorker,queued.run.id)
      assert.equal(done.run.status,"failed");assert.equal(done.run.last_error_code,"workflow_tool_adapter_unavailable");assert.equal(calls,0)
    })
  }finally{await f.close()}
})
test("MCP run admission and approvals default closed before jobs/model planning, while rejection stays available",async()=>{
  const f=await agentFixture({mcp:true})
  try{
    const own=await setup(f),closed=new WorkflowV2RunRepository(f.pool)
    await assert.rejects(direct(f,own.binding,undefined,closed),/mcp_execution_not_enabled/)
    await assert.rejects(new AutonomousAgentRunRepository(f.pool).submit(alice,own.spec.id,{expected_revision:1,instruction:"Own",max_steps:3,idempotency_key:"mcp-native-default-closed"}),/mcp_execution_not_enabled/)
    assert.equal((await f.db.query("SELECT count(*)::int AS n FROM agentstudio.jobs")).rows[0].n,0)
    const queued=await direct(f,own.binding)
    await new WorkflowV2Worker(f.pool,"synthetic-mcp-admission").tick()
    const pending=(await f.runs.get(alice,queued.run.id)).pending_effect
    await assert.rejects(closed.decide(alice,queued.run.id,{decision:"approved",step_key:pending.step_key,input_sha256:pending.input_sha256}),/mcp_execution_not_enabled/)
    await closed.decide(alice,queued.run.id,{decision:"rejected",step_key:pending.step_key,input_sha256:pending.input_sha256})
    assert.equal((await f.runs.get(alice,queued.run.id)).approvals.at(-1).status,"rejected")
  }finally{await f.close()}
})
test("Native Cookie clients preserve MCP bindings through all Agent edits and queue only under the independent grant",async()=>{
  const f=await workflowNodeDebugFixture({mcpExecution:true,mcpDiscovery:createMcpDiscovery(async(_material,wire)=>response(wire,{tools:[{
    name:definition.name,description:definition.description,inputSchema:definition.input_schema,
  }]}))})
  try{
    const api=f.alice.api,created=await api.createMcpConnection(input,"11111111-1111-4111-8111-111111111111"),ready=await api.discoverMcpConnection(created.id,created.revision)
    const ref={connection_id:ready.id,connection_revision:ready.revision,tool_name:"lookup",catalog_sha256:ready.catalog_sha256}
    let role=await api.createAgent("Native MCP role","Own goal")
    role=await api.bindAgentModel(role.id,role.revision,f.graph.nodes.find(node=>node.type==="model").data.model_binding)
    role=await api.updateAgentMcpTools(role.id,role.revision,[{name:"mcp_lookup",...ref}])
    for(const edit of [(value)=>api.updateAgent(value.id,value.revision,"Retitled","New goal"),(value)=>api.updateAgentKnowledgeBases(value.id,value.revision,[]),
      (value)=>api.updateAgentHttpTools(value.id,value.revision,[]),(value)=>api.bindAgentModel(value.id,value.revision,value.spec.model_binding)]){
      role=await edit(role);assert.deepEqual(role.spec.mcp_tools,[{name:"mcp_lookup",...ref}]);assert.equal(role.spec.tools.includes("mcp_lookup"),true)
    }
    await assert.rejects(f.bob.api.updateAgentMcpTools(role.id,role.revision,[{name:"mcp_lookup",...ref}]),error=>error.status===404)
    const graph={version:2,nodes:[{id:"start",type:"start",data:{title:"Start"},position:{x:0,y:0}},
      {id:"tool",type:"tool",data:{title:"MCP",mcp_binding:ref,params_template:'{"query":"Own"}'},position:{x:100,y:0}},
      {id:"end",type:"end",data:{title:"End",output_template:"{{MCP.output}}"},position:{x:200,y:0}}],edges:[{id:"a",source:"start",target:"tool"},{id:"b",source:"tool",target:"end"}]}
    const flow=await api.createWorkflowGraph("Native MCP flow",graph)
    assert.equal((await api.getConfigCapabilities()).mcp_tool_runs_enabled,true)
    const submitted=await api.submitWorkflowV2Run(flow.id,1,"Own MCP task","native-mcp-submit-pinned")
    assert.equal(submitted.run.status,"queued")
    const removed=await api.updateAgentMcpTools(role.id,role.revision,[])
    assert.equal(removed.spec.mcp_tools,undefined);assert.equal(removed.spec.tools.includes("mcp_lookup"),false)
  }finally{await f.close()}
})
