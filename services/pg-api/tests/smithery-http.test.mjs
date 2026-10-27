import test from "node:test"
import assert from "node:assert/strict"
import {randomUUID} from "node:crypto"
import {workflowNodeDebugFixture} from "./helpers/workflow-node-debug-fixture.mjs"
import {selectNativePg18UatCapabilities,permitNativePg18BusinessUatRequest} from "../src/native-config-uat-policy.ts"
import {selectSmitheryManagement} from "../src/smithery-contracts.ts"
const secret="SyntheticSmitheryCookieCredentialNeverNetwork012345",selection={namespace:"own",server:"vendor/lookup",name:"Cookie MCP",description:"Synthetic only"}
test("Smithery management has an independent non-root HTTPS grant; config, discovery and tool-call grants do not imply it",()=>{
  assert.equal(selectSmitheryManagement({}),false);assert.throws(()=>selectSmitheryManagement({AGENT_STUDIO_PG18_SMITHERY_UAT_ENABLED:"true"}))
  const grant={AGENT_STUDIO_PG18_SMITHERY_UAT_ENABLED:"true",AGENT_STUDIO_PG18_SMITHERY_UAT_APPROVED:"APPROVE_DISPOSABLE_PG18_SMITHERY_MANAGEMENT_ONLY"},
    env={...grant,AGENT_STUDIO_PG18_CONFIG_WRITE_UAT_ENABLED:"true",AGENT_STUDIO_PG18_UAT_APPROVAL:"APPROVE_ISOLATED_PG18_CONFIG_UAT_ONLY"}
  assert.throws(()=>selectNativePg18UatCapabilities(grant,true,"https://localhost:7443",1100))
  const policy=selectNativePg18UatCapabilities(env,true,"https://localhost:7443",1100)
  assert.equal(policy.smitheryManagementUat,true);assert.equal(policy.mcpDiscoveryUat,undefined);assert.equal(policy.mcpToolExecutionUat,undefined)
  assert.equal(permitNativePg18BusinessUatRequest("/api/v2/smithery/key","POST",policy),true)
  assert.equal(permitNativePg18BusinessUatRequest("/api/v2/smithery/key","POST",{configurationWrites:true}),false)
  assert.throws(()=>selectNativePg18UatCapabilities(env,true,"http://localhost:7443",1100));assert.throws(()=>selectNativePg18UatCapabilities(env,true,"https://localhost:7443",0))
})
test("Native Cookie Smithery lifecycle enforces CSRF/owner/capability gates and publishes only an explicitly discovered MCP binding",async()=>{
  const remote=new Map(),requests=[]
  const f=await workflowNodeDebugFixture({mcpExecution:true,mcpDiscovery:async()=>({version:"2026-07-28",tools:[{name:"lookup",description:"Synthetic",input_schema:{type:"object"},read_only:true,destructive:false,requires_tasks:false}]}),
    smitheryTransport:async(key,wire)=>{requests.push(wire);assert.equal(key,secret)
      if(wire.path==="/namespaces")return {status:200,data:{namespaces:["own"]}}
      if(wire.method==="GET")return {status:remote.has(wire.path)?200:404,data:remote.get(wire.path)??null}
      if(wire.method==="DELETE"){remote.delete(wire.path);return {status:204,data:null}}
      const item={connectionId:wire.path.split("/").at(-1),transport:"http",metadata:wire.body.metadata,status:{state:"connected"}};remote.set(wire.path,item);return {status:201,data:item}
    }})
  try{
    const api=f.alice.api;assert.equal((await api.getConfigCapabilities()).smithery_management_enabled,true)
    const bad=await f.alice.raw("/api/v2/smithery/key",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({api_key:secret,expected_revision:0,request_id:randomUUID()})})
    assert.equal(bad.status,403);assert.equal(requests.length,0)
    const key=await api.saveSmitheryKey(secret,0,randomUUID());assert.equal(key.has_key,true)
    const id=randomUUID(),created=await api.connectSmithery(selection,id);assert.equal(created.enabled,true);assert.equal(created.mcp_status,"untested")
    await assert.rejects(f.bob.api.getSmitheryConnection(id),error=>error.status===404)
    const mcp=await api.getMcpConnection(id);assert.equal(mcp.managed_by,"smithery")
    const discovered=await api.discoverMcpConnection(id,mcp.revision),ref={connection_id:id,connection_revision:discovered.revision,tool_name:"lookup",catalog_sha256:discovered.catalog_sha256}
    let role=await api.createAgent("Cookie managed Agent","Synthetic task")
    role=await api.bindAgentModel(role.id,role.revision,f.graph.nodes.find(node=>node.type==="model").data.model_binding)
    role=await api.updateAgentMcpTools(role.id,role.revision,[{name:"mcp_lookup",...ref}]);assert.deepEqual(role.spec.mcp_tools,[{name:"mcp_lookup",...ref}])
    const beforePause=requests.length,paused=await api.operateSmithery(id,created.revision,"pause")
    assert.equal(paused.state,"paused");assert.equal(requests.length,beforePause)
    await assert.rejects(api.updateAgentMcpTools(role.id,role.revision,[{name:"mcp_lookup",...ref}]),error=>error.status===409)
    const resumed=await api.operateSmithery(id,paused.revision,"refresh")
    assert.equal(resumed.mcp_status,"untested")
    const revoked=await api.operateSmithery(id,resumed.revision,"revoke");assert.equal(revoked.state,"revoked");assert.equal(revoked.enabled,false)
    assert.equal(JSON.stringify(await api.listSmitheryConnections()).includes(secret),false)
    f.enable(false);const before=requests.length
    await assert.rejects(api.readSmitheryNamespaces(),error=>error.status===405);assert.equal(requests.length,before)
  }finally{await f.close()}
})
