import test from "node:test"
import assert from "node:assert/strict"
import {agentFixture,alice,bob} from "./helpers/workflow-v2-agent-fixture.mjs"
import {workflowNodeDebugFixture,debugKey} from "./helpers/workflow-node-debug-fixture.mjs"
import {McpConnectionRepository,safeMcpConnectionInput} from "../src/mcp-connection-repository.ts"
import {withActor} from "../src/repository.ts"
import {withModelBrokerActor} from "../src/model-broker-actor.ts"
import {createMcpDiscovery} from "../src/mcp-discovery.ts"
import {verifyMcpDiscoveryPrivileges} from "../src/mcp-privileges.ts"
import {selectNativePg18UatCapabilities,permitNativePg18BusinessUatRequest} from "../src/native-config-uat-policy.ts"
const secret="synthetic-mcp-only-secret-never-network",input={name:"Own MCP",description:"Synthetic remote tools",url:"https://mcp.example.com/server",
  headers:[{key:"Authorization",value:"Bearer "+secret}],enabled:true}
const catalog={version:"2026-07-28",tools:[{name:"lookup",description:"Lookup",input_schema:{type:"object",properties:{query:{type:"string"}}},read_only:true,destructive:false,requires_tasks:false}]}
test("MCP configuration owner/RLS/CAS, request UUID and encrypted headers stay separate from ordinary HTTP Tools",async()=>{
  const f=await agentFixture({autonomous:true})
  try{
    await f.db.exec(f.sql("migrations/pg_v9_029_mcp_connections.sql"))
    await verifyMcpDiscoveryPrivileges(f.pool,f.pool)
    const repo=new McpConnectionRepository(f.pool,debugKey,f.pool),request="11111111-1111-4111-8111-111111111111"
    const own=await repo.create(alice,input,request)
    assert.deepEqual(own.headers,[{key:"authorization",value:"••••"}]);assert.equal(own.catalog,null)
    assert.equal((await repo.create(alice,input,request)).id,own.id)
    await assert.rejects(repo.update(alice,own.id,{...input,headers:[{key:"renamed-credential",value:""}]},1),error=>error.status===400)
    assert.equal((await repo.get(alice,own.id)).revision,1)
    await assert.rejects(repo.create(alice,{...input,name:"Changed"},request),/mcp_create_request_conflict/)
    await assert.rejects(repo.create(bob,input,request),/mcp_create_request_conflict/)
    assert.equal(await repo.get(bob,own.id),null);assert.deepEqual(await repo.list(bob),[])
    await assert.rejects(withActor(f.pool,alice,db=>db.query("SELECT value_ciphertext FROM agentstudio.mcp_connection_headers")),/permission denied/)
    await assert.rejects(withModelBrokerActor(f.pool,alice,db=>db.query("UPDATE agentstudio.mcp_connection_headers SET header_name='bad'")),/credential_broker_unavailable/)
    assert.equal((await withModelBrokerActor(f.pool,bob,db=>db.query("SELECT value_ciphertext FROM agentstudio.mcp_connection_headers"))).rows.length,0)
    const next=await repo.update(alice,own.id,{...input,headers:[{key:"authorization",value:""}]},1)
    const ready=await repo.discover(alice,next.id,next.revision,async material=>{assert.equal(material.headers[0].value,"Bearer "+secret);return catalog})
    assert.equal(ready.status,"ok");assert.deepEqual(ready.catalog,catalog)
    await assert.rejects(repo.update(alice,ready.id,input,1),error=>error.status===409)
    await assert.rejects(repo.delete(bob,ready.id,ready.revision),error=>error.status===404)
    await assert.rejects(repo.discover(alice,ready.id,ready.revision,async()=>catalog),error=>error.status===429)
    const edited=await repo.update(alice,ready.id,input,ready.revision)
    assert.equal(edited.catalog,null);assert.equal(edited.status,"untested")
    const audit=JSON.stringify((await f.db.query("SELECT metadata FROM agentstudio.audit_events WHERE target_kind='mcp_connection'")).rows)
    for(const text of [secret,input.url,"lookup"])assert.equal(audit.includes(text),false)
    assert.equal((await f.db.query("SELECT count(*)::int AS n FROM agentstudio.tool_connections")).rows[0].n,0)
    await repo.delete(alice,edited.id,edited.revision)
    assert.equal((await f.db.query("SELECT count(*)::int AS n FROM agentstudio.mcp_connection_headers")).rows[0].n,0)
  }finally{await f.close()}
})
test("discovery coalescing, concurrent edit and sanitized failure cannot publish stale catalogs or secrets",async()=>{
  const f=await agentFixture({autonomous:true})
  try{
    await f.db.exec(f.sql("migrations/pg_v9_029_mcp_connections.sql"));const repo=new McpConnectionRepository(f.pool,debugKey,f.pool),own=await repo.create(alice,input)
    let entered,finish;const started=new Promise(resolve=>{entered=resolve}),held=new Promise(resolve=>{finish=resolve})
    const pending=repo.discover(alice,own.id,1,async()=>{entered();await held;return catalog})
    await started;await assert.rejects(repo.discover(alice,own.id,1,async()=>catalog),error=>error.status===429)
    await assert.rejects(repo.discover(bob,own.id,1,async()=>catalog),error=>error.status===404)
    await repo.update(alice,own.id,{...input,name:"Updated"},1);finish()
    await assert.rejects(pending,error=>error.status===409);assert.equal((await repo.get(alice,own.id)).catalog,null)
    const failed=await repo.discover(alice,own.id,2,async()=>{throw Error(secret)})
    assert.equal(failed.status,"error");assert.equal(failed.last_error,"mcp_discovery_failed");assert.equal(JSON.stringify(failed).includes(secret),false)
    await assert.rejects(new McpConnectionRepository(f.pool,debugKey).discover(alice,own.id,failed.revision,async()=>catalog),error=>error.status===503)
  }finally{await f.close()}
})
test("Native Cookie discovery is independently gated and only lists tools; forged employee headers cannot read another connection",async()=>{
  let calls=0
  const f=await workflowNodeDebugFixture({mcpDiscovery:createMcpDiscovery(async(material,wire)=>{
    calls++;assert.equal(material.headers[0].value,"Bearer "+secret);assert.equal(wire.body.method,"tools/list")
    return {status:200,session:"",content_type:"application/json",text:JSON.stringify({jsonrpc:"2.0",id:wire.body.id,result:{tools:[{name:"lookup",inputSchema:{type:"object"}}]}})}
  })})
  try{
    const requestId="22222222-2222-4222-8222-222222222222",headers={"Content-Type":"application/json","X-AgentStudio-Request":"1"}
    const create=()=>f.alice.raw("/api/v2/mcp-connections",{method:"POST",headers,body:JSON.stringify({...input,request_id:requestId})})
    assert.equal((await create()).status,201);assert.equal((await create()).status,201)
    const discover=()=>f.alice.raw("/api/v2/mcp-connections/"+requestId+"/discover",{method:"POST",headers,body:'{"expected_revision":1}'})
    f.enable(false);assert.equal((await discover()).status,405);assert.equal(calls,0)
    f.enable(true);const response=await discover();assert.equal(response.status,200)
    const payload=await response.json();assert.equal(payload.item.catalog.tools[0].name,"lookup");assert.equal(calls,1)
    const client=await f.alice.api.getMcpConnection(requestId)
    assert.equal(client.catalog.tools[0].name,"lookup");assert.equal((await f.alice.api.listMcpConnections()).length,1)
    assert.equal(JSON.stringify(payload).includes(secret),false)
    assert.equal((await f.bob.raw("/api/v2/mcp-connections/"+requestId,{headers:{"X-Rh-User-Id":f.owner.subject}})).status,404)
    assert.equal((await f.alice.raw("/api/v2/mcp-connections/"+requestId+"/discover",{method:"POST",headers:{"Content-Type":"application/json"},body:'{"expected_revision":2}'})).status,403)
    const counts=(await f.db.query("SELECT (SELECT count(*) FROM agentstudio.jobs)::int AS jobs,(SELECT count(*) FROM agentstudio.external_effects)::int AS effects")).rows[0]
    assert.deepEqual(counts,{jobs:0,effects:0})
  }finally{await f.close()}
})
test("MCP discovery requires its own HTTPS non-root opt-in and refuses arbitrary RPC/identity fields",()=>{
  for(const bad of [{...input,rpc:"tools/call"},{...input,owner_user_id:"forged"},{...input,headers:[{key:"mcp-session-id",value:"forged"}]}])assert.throws(()=>safeMcpConnectionInput(bad))
  const route="/api/v2/mcp-connections/11111111-1111-4111-8111-111111111111/discover",base={configurationWrites:true}
  assert.equal(permitNativePg18BusinessUatRequest(route,"POST",base),false)
  assert.equal(permitNativePg18BusinessUatRequest(route,"POST",{...base,mcpDiscoveryUat:true}),true)
  const env={AGENT_STUDIO_PG18_CONFIG_WRITE_UAT_ENABLED:"true",AGENT_STUDIO_PG18_UAT_APPROVAL:"APPROVE_ISOLATED_PG18_CONFIG_UAT_ONLY",
    AGENT_STUDIO_PG18_MCP_DISCOVERY_UAT_ENABLED:"true",AGENT_STUDIO_PG18_MCP_DISCOVERY_UAT_APPROVED:"APPROVE_DISPOSABLE_PG18_MCP_DISCOVERY_ONLY"}
  assert.equal(selectNativePg18UatCapabilities(env,true,"https://localhost",1001).mcpDiscoveryUat,true)
  for(const [listen,origin,uid] of [[false,"https://localhost",1001],[true,"http://localhost",1001],[true,"https://localhost",0]])
    assert.throws(()=>selectNativePg18UatCapabilities(env,listen,origin,uid))
  for(const changed of [{...env,AGENT_STUDIO_PG18_MCP_DISCOVERY_UAT_APPROVED:"wrong"},{...env,AGENT_STUDIO_PG18_MCP_DISCOVERY_UAT_ENABLED:"false"}])
    assert.throws(()=>selectNativePg18UatCapabilities(changed,true,"https://localhost",1001))
})
