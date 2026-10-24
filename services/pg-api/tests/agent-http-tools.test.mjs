// Synthetic SQL + real private mTLS. Never contact an external Tool or model.
import test from "node:test"
import assert from "node:assert/strict"
import {safeAgentSpec} from "../src/contracts.ts"
import {ToolConnectionRepository} from "../src/tool-connection-repository.ts"
import {RunRepository} from "../src/run-repository.ts"
import {prepareWorkflowToolHttp} from "../src/workflow-v2-tool-network.ts"
import {workflowNodeDebugFixture} from "./helpers/workflow-node-debug-fixture.mjs"
import {agentFixture,alice,bob} from "./helpers/workflow-v2-agent-fixture.mjs"
const secret="synthetic-http-agent-secret-never-network"
const input={name:"Own HTTP",description:"Lookup evidence; params: query (string)",url:"https://tools.example.com/lookup",
  method:"POST",headers:[{key:"Authorization",value:"Bearer "+secret}],body_template:"{{input}}",timeout_s:10,enabled:true}
const declaration=connection=>({name:"http_lookup",description:input.description,connection_id:connection.id,connection_revision:connection.revision})
async function prepare(f,identity=alice){
  const connections=new ToolConnectionRepository(f.pool,Buffer.from("0123456789abcdef".repeat(4),"hex"))
  const connection=await connections.create(identity,input),http=declaration(connection)
  const old=f.resources[identity===alice?"alice":"bob"].spec.spec,{require_approval:_,...body}=old
  const spec=await f.agents.create(identity,"HTTP role",safeAgentSpec({...body,tools:["calculate",http.name],knowledge_base_ids:[],http_tools:[http]}))
  return {connection,http,spec,connections,body}
}
test("HTTP Agent declarations accept bounded named references only, with no implicit allowlist expansion",()=>{
  const http=declaration({id:"11111111-1111-4111-8111-111111111111",revision:2})
  const body={goal:"Synthetic",tools:[http.name],http_tools:[http]}
  assert.deepEqual(safeAgentSpec(body).http_tools,[http])
  assert.equal(Object.hasOwn(safeAgentSpec({goal:"Synthetic",tools:[],http_tools:[]}),"http_tools"),false)
  for(const invalid of [{...http,name:"calculate"},{...http,name:"http_bad\n"},{...http,connection_revision:0},
    {...http,connection_id:"../owner"},{...http,url:"https://foreign.example.com"},{...http,headers:[]},
    {...http,description:""},{...http,description:"x".repeat(501)},{...http,description:"line\nbreak"}])
    assert.throws(()=>safeAgentSpec({...body,http_tools:[invalid]}),error=>error.status===400)
  for(const http_tools of [[http,http],[http,{...http,name:"http_second"}],Array(11).fill(http)])
    assert.throws(()=>safeAgentSpec({...body,http_tools}),error=>error.status===400)
  assert.throws(()=>safeAgentSpec({...body,tools:[]}),/invalid_agent_http_tools/)
  assert.throws(()=>safeAgentSpec({...body,tools:[http.name,"http_not_declared"]}),/unknown_tool/)
})
test("Agent save validates owner/revision/enabled inside its transaction; legacy one-shot queue refuses custom Tools",async()=>{
  const f=await agentFixture({autonomous:true})
  try{
    const mine=await prepare(f),foreign=await prepare(f,bob)
    const before=(await f.agents.list(alice)).length
    const spec=http=>safeAgentSpec({...mine.body,tools:[http.name],knowledge_base_ids:[],http_tools:[http]})
    await assert.rejects(f.agents.create(alice,"Foreign",spec(foreign.http)),error=>error.status===404)
    await assert.rejects(f.agents.update(alice,mine.spec.id,"Stale",spec({...mine.http,connection_revision:2}),1),error=>error.status===409)
    await f.db.query("UPDATE agentstudio.tool_connections SET enabled=false WHERE id=$1",[mine.connection.id])
    await assert.rejects(f.agents.create(alice,"Disabled",spec(mine.http)),error=>error.code==="tool_connection_not_ready")
    assert.equal((await f.agents.list(alice)).length,before)
    assert.equal((await f.agents.get(alice,mine.spec.id)).revision,1)
    await assert.rejects(new RunRepository(f.pool,{allowBoundModelRuns:true}).submit(alice,mine.spec.id,{
      instruction:"Synthetic",idempotency_key:"legacy-http-tool-block"}),/agent_http_tools_require_autonomous_runtime/)
    assert.equal((await f.db.query("SELECT count(*)::int AS count FROM agentstudio.jobs")).rows[0].count,0)
  }finally{await f.close()}
})
for(const autonomous of [false,true]){
const mode=autonomous?"Autonomous":"Workflow"
test(mode+": declared HTTP Tool uses frozen owner binding over real mTLS, with separate approval and no planner credentials",async()=>{
  const f=await agentFixture({autonomous});let models=0,httpCalls=0,toolApprovals=0
  try{
    const own=await prepare(f),foreign=await prepare(f,bob)
    await f.privateTls(async(_material,prompt)=>{
      models++;const plan=JSON.parse(prompt)
      assert.deepEqual(plan.role.allowed_tools,["calculate",own.http.name])
      assert.deepEqual(plan.role.http_tools.map(({name,description})=>({name,description})),[{name:own.http.name,description:own.http.description}])
      for(const privateText of [own.connection.id,foreign.connection.id,secret,input.url])assert.equal(prompt.includes(privateText),false)
      return JSON.stringify(plan.round===1?{action:"tool",tool:own.http.name,params:{query:"Owner evidence"}}:{action:"answer",answer:"Own final result"})
    },async makeWorker=>{
      const queued=await f.make({spec:own.spec})
      const done=await f.drive(makeWorker,queued.run.id,pending=>{
        if(pending.agent_context?.phase==="tool"){
          toolApprovals++;assert.deepEqual(pending.configuration.tool_binding,{connection_id:own.connection.id,connection_revision:1})
          assert.equal(pending.configuration.tool,undefined);assert.equal(httpCalls,0)
        }return "approved"
      })
      assert.equal(done.run.status,"succeeded");assert.equal(done.run.result_text,"Own final result")
      assert.equal(httpCalls,1);assert.equal(models,2);assert.equal(toolApprovals,1)
      assert.equal(await f.runs.get(bob,queued.run.id),null);assert.equal((await makeWorker().tick()).status,"idle")
      const audit=JSON.stringify((await f.db.query("SELECT metadata FROM agentstudio.audit_events WHERE run_id=$1",[queued.run.id])).rows)
      for(const privateText of [secret,"Owner evidence","Own final result",input.url])assert.equal(audit.includes(privateText),false)
    },{toolExecutor:{async http(material,args){
      httpCalls++;assert.equal(material.url,input.url);assert.equal(material.method,"POST")
      const prepared=prepareWorkflowToolHttp(material,args)
      assert.equal(prepared.headers.authorization,"Bearer "+secret);assert.equal(prepared.body.toString(),JSON.stringify(args))
      assert.deepEqual(args,{query:"Owner evidence"});return "Own HTTP observation"
    }}})
  }finally{await f.close()}
})
test(mode+": rejected HTTP operation has no dispatch; an ambiguous operation pauses and cannot resend",async()=>{
  const f=await agentFixture({autonomous});let httpCalls=0
  try{
    const own=await prepare(f)
    await f.privateTls(async(_material,prompt)=>JSON.stringify(JSON.parse(prompt).round===1?
      {action:"tool",tool:own.http.name,params:{query:"Synthetic"}}:{action:"answer",answer:"After rejection"}),async makeWorker=>{
      const rejected=await f.make({spec:own.spec}),done=await f.drive(makeWorker,rejected.run.id,pending=>pending.agent_context?.phase==="tool"?"rejected":"approved")
      assert.equal(done.run.status,"succeeded");assert.equal(httpCalls,0)
      const unknown=await f.make({spec:own.spec}),paused=await f.drive(makeWorker,unknown.run.id)
      assert.equal(paused.run.status,"paused");assert.equal(httpCalls,1)
      for(let i=0;i<3;i++)assert.equal((await makeWorker().tick()).status,"idle")
      assert.equal(httpCalls,1)
    },{toolExecutor:{async http(){httpCalls++;throw Error("Synthetic response lost after POST")}}})
  }finally{await f.close()}
})
test(mode+": a connection changed after approval is fenced before credential dispatch",async()=>{
  const f=await agentFixture({autonomous});let httpCalls=0,changed=false
  try{
    const own=await prepare(f)
    f.setBeforeDispatch(async(_request,kind)=>{
      if(kind!=="tool"||changed)return;changed=true
      await f.db.query("UPDATE agentstudio.tool_connections SET revision=revision+1 WHERE id=$1",[own.connection.id])
    })
    await f.privateTls(async()=>JSON.stringify({action:"tool",tool:own.http.name,params:{query:"Synthetic"}}),async makeWorker=>{
      const queued=await f.make({spec:own.spec}),done=await f.drive(makeWorker,queued.run.id)
      assert.equal(done.run.status,"paused");assert.equal(changed,true);assert.equal(httpCalls,0)
    },{toolExecutor:{async http(){httpCalls++;return "must not dispatch"}}})
  }finally{await f.close()}
})
}
test("Native Cookie client saves/edits/removes HTTP Tool declarations without dropping other bindings or queuing effects",async()=>{
  const f=await workflowNodeDebugFixture({toolConnections:true})
  try{
    const connection=await f.alice.api.createToolConnection(input),http=declaration(connection)
    const agent=await f.alice.api.createAgent("Native HTTP Agent","Synthetic goal")
    let bound=await f.alice.api.updateAgentHttpTools(agent.id,agent.revision,[http])
    assert.deepEqual(bound.spec.http_tools,[http]);assert.deepEqual(bound.spec.tools,[http.name])
    await assert.rejects(f.bob.api.updateAgentHttpTools(agent.id,bound.revision,[http]),error=>error.status===404)
    bound=await f.alice.api.bindAgentModel(agent.id,bound.revision,f.graph.nodes.find(node=>node.type==="model").data.model_binding)
    bound=await f.alice.api.updateAgent(agent.id,bound.revision,"Renamed","New goal")
    bound=await f.alice.api.updateAgentKnowledgeBases(agent.id,bound.revision,[])
    assert.deepEqual(bound.spec.http_tools,[http]);assert.equal(bound.spec.tools.includes(http.name),true)
    const removed=await f.alice.api.updateAgentHttpTools(agent.id,bound.revision,[])
    assert.equal(removed.spec.http_tools,undefined);assert.equal(removed.spec.tools.includes(http.name),false)
    assert.deepEqual(removed.spec.model_binding,bound.spec.model_binding)
    const counts=(await f.db.query("SELECT (SELECT count(*) FROM agentstudio.jobs)::int AS jobs,(SELECT count(*) FROM agentstudio.external_effects)::int AS effects")).rows[0]
    assert.deepEqual(counts,{jobs:0,effects:0})
    const direct=await f.bob.raw("/api/v2/agent-specs/"+agent.id,{method:"PATCH",headers:{"Content-Type":"application/json","X-AgentStudio-Request":"1","X-Rh-User-Id":agent.owner_user_id??agent.id},
      body:JSON.stringify({name:"Forged",expected_revision:removed.revision,spec:{goal:"Forged",tools:[http.name],http_tools:[http]}})})
    assert.equal(direct.status,404)
  }finally{await f.close()}
})
