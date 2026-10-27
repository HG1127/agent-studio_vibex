import test from "node:test"
import assert from "node:assert/strict"
import {randomUUID} from "node:crypto"
import {agentFixture,alice,bob} from "./helpers/workflow-v2-agent-fixture.mjs"
import {SmitheryRepository} from "../src/smithery-repository.ts"
import {McpConnectionRepository} from "../src/mcp-connection-repository.ts"
import {verifySmitheryPrivileges} from "../src/smithery-privileges.ts"
const encryption=Buffer.from("0123456789abcdef".repeat(4),"hex"),secret="SyntheticSmitheryCredentialNeverNetwork012345",selection={namespace:"own",server:"vendor/lookup",name:"Own managed MCP",description:"Synthetic only"}
async function fixture(){
  const f=await agentFixture({mcp:true,smithery:true}),remote=new Map(),calls=[],state={vendorState:"connected",losePut:false,loseDelete:false,rejectKey:false,beforePut:null}
  const transport=async(key,wire)=>{
    calls.push({key,wire});if(wire.path==="/namespaces")return state.rejectKey?{status:401,data:{error:secret}}:{status:200,data:{namespaces:["own"]}}
    if(wire.path.startsWith("/servers?"))return {status:200,data:{servers:[{qualifiedName:"vendor/lookup",displayName:"Lookup",isDeployed:true}]}}
    if(wire.method==="GET")return {status:remote.has(wire.path)?200:404,data:remote.get(wire.path)??null}
    if(wire.method==="PUT"){
      await state.beforePut?.()
      const row={connectionId:wire.path.split("/").at(-1),transport:"http",metadata:wire.body.metadata,status:{state:state.vendorState,
        ...(state.vendorState==="auth_required"?{setupUrl:"https://auth.smithery.ai/setup?state=opaque"}:{})}}
      remote.set(wire.path,row);if(state.losePut){state.losePut=false;throw Error(secret)}return {status:201,data:row}
    }
    assert.equal(wire.method,"DELETE");remote.delete(wire.path)
    if(state.loseDelete){state.loseDelete=false;throw Error(secret)}return {status:204,data:null}
  }
  const repo=new SmitheryRepository(f.pool,encryption,f.pool,transport),mcp=new McpConnectionRepository(f.pool,encryption,f.pool)
  return {...f,repo,mcp,remote,calls,state}
}
const writes=f=>f.calls.filter(call=>call.wire.method!=="GET")
test("Smithery key storage is encrypted and owner-scoped; the API sees only metadata and no Worker obtains grants",async()=>{
  const f=await fixture()
  try{
    assert.deepEqual(await f.repo.keyStatus(alice),{has_key:false,revision:0,tail:"",last_request_id:null})
    f.state.rejectKey=true
    await assert.rejects(f.repo.saveKey(alice,secret,0,randomUUID()),error=>error.status===400&&error.code==="invalid_smithery_key")
    assert.equal((await f.repo.keyStatus(alice)).has_key,false);f.state.rejectKey=false
    const request=randomUUID(),saved=await f.repo.saveKey(alice,secret,0,request)
    assert.equal(saved.has_key,true);assert.equal(saved.revision,1);assert.equal(saved.tail,secret.slice(-4));assert.equal(writes(f).length,0)
    const before=f.calls.length;assert.deepEqual(await f.repo.saveKey(alice,secret,0,request),saved);assert.equal(f.calls.length,before)
    await assert.rejects(f.repo.saveKey(alice,secret+"other",1,request),/smithery_key_request_conflict/)
    assert.equal((await f.repo.keyStatus(bob)).has_key,false);await assert.rejects(f.repo.namespaces(bob),/smithery_key_required/)
    assert.deepEqual(await f.repo.namespaces(alice),["own"]);assert.equal((await f.repo.catalog(alice,"lookup",1)).items[0].server,"vendor/lookup")
    const row=(await f.db.query("SELECT encode(api_key_ciphertext,'hex') AS cipher,has_column_privilege('agentstudio_api','agentstudio.smithery_credentials','api_key_ciphertext','SELECT') AS api_read,"+
      "has_table_privilege('agentstudio_worker','agentstudio.smithery_credentials','SELECT,INSERT,UPDATE,DELETE') AS worker_access FROM agentstudio.smithery_credentials")).rows[0]
    assert.equal(row.api_read,false);assert.equal(row.worker_access,false);assert.equal(row.cipher.includes(Buffer.from(secret).toString("hex")),false)
    await verifySmitheryPrivileges(f.pool,f.pool)
    await f.db.query("GRANT SELECT(api_key_ciphertext) ON agentstudio.smithery_credentials TO agentstudio_api")
    await assert.rejects(verifySmitheryPrivileges(f.pool,f.pool),/unsafe_smithery_privileges/)
    await f.db.query("REVOKE SELECT(api_key_ciphertext) ON agentstudio.smithery_credentials FROM agentstudio_api")
    await f.db.query("GRANT SELECT(namespace) ON agentstudio.smithery_connections TO agentstudio_worker")
    await assert.rejects(verifySmitheryPrivileges(f.pool,f.pool),/unsafe_smithery_privileges/)
    await f.db.query("REVOKE SELECT(namespace) ON agentstudio.smithery_connections FROM agentstudio_worker")
    await verifySmitheryPrivileges(f.pool,f.pool)
    assert.equal(JSON.stringify((await f.db.query("SELECT metadata FROM agentstudio.audit_events WHERE action LIKE 'smithery.%'")).rows).includes(secret),false)
  }finally{await f.close()}
})

test("Smithery managed creation is stable, owner-bound, explicitly discovered and protected against generic MCP changes",async()=>{
  const f=await fixture()
  try{
    await f.repo.saveKey(alice,secret,0,randomUUID())
    f.state.vendorState="auth_required";const request=randomUUID(),created=await f.repo.connect(alice,selection,request)
    assert.equal(created.state,"auth_required");assert.equal(created.enabled,false);assert.equal(created.setup_url,"https://auth.smithery.ai/setup?state=opaque")
    assert.equal(writes(f).length,1);assert.equal((await f.repo.connect(alice,selection,request)).id,request);assert.equal(writes(f).length,1)
    await assert.rejects(f.repo.connect(alice,{...selection,name:"Conflicting"},request),/smithery_create_request_conflict/)
    await f.repo.saveKey(bob,secret,0,randomUUID());const before=f.calls.length
    assert.equal(await f.repo.get(bob,request),null);await assert.rejects(f.repo.connect(bob,selection,request),/smithery_create_request_conflict/);assert.equal(f.calls.length,before)
    for(const row of f.remote.values())row.status={state:"connected"}
    const refreshed=await f.repo.operate(alice,request,created.revision,"refresh")
    assert.equal(refreshed.state,"connected");assert.equal(refreshed.enabled,true);assert.equal(refreshed.mcp_status,"untested")
    const current=await f.mcp.get(alice,request)
    assert.deepEqual(current.headers,[{key:"authorization",value:"••••"}]);assert.equal(current.catalog,null)
    await assert.rejects(f.mcp.update(alice,request,{name:"Override",description:"Override",url:"https://other.example.com",enabled:true,headers:[]},current.revision),/mcp_connection_managed_by_smithery/)
    await assert.rejects(f.mcp.delete(alice,request,current.revision),/mcp_connection_managed_by_smithery/)
    const discovered=await f.mcp.discover(alice,request,current.revision,async material=>{
      assert.equal(material.url,"https://smithery.run/own/"+created.remote_connection_id);assert.equal(material.headers[0].value,"Bearer "+secret)
      return {version:"2026-07-28",tools:[{name:"lookup",description:"Synthetic",input_schema:{type:"object"},read_only:true,destructive:false,requires_tasks:false}]}
    })
    assert.equal(discovered.status,"ok");assert.equal(writes(f).length,1)
    const calls=f.calls.length,paused=await f.repo.pause(alice,request,refreshed.revision)
    assert.equal(paused.state,"paused");assert.equal(paused.enabled,false);assert.equal(f.calls.length,calls)
    assert.equal((await f.mcp.get(alice,request)).catalog,null)
    const resumed=await f.repo.operate(alice,request,paused.revision,"refresh")
    assert.equal(resumed.enabled,true);assert.equal(resumed.mcp_status,"untested");assert.equal(writes(f).length,1)
    assert.equal(JSON.stringify([await f.repo.list(alice),await f.mcp.list(alice)]).includes(secret),false)
  }finally{await f.close()}
})

test("Smithery response loss is reconciled with GET; revoke always disables local use before any remote result",async()=>{
  const f=await fixture()
  try{
    await f.repo.saveKey(alice,secret,0,randomUUID());f.state.losePut=true
    const request=randomUUID(),unknown=await f.repo.connect(alice,selection,request)
    assert.equal(unknown.state,"unknown");assert.equal(unknown.enabled,false)
    assert.equal((await f.repo.connect(alice,selection,request)).state,"unknown");assert.equal(writes(f).length,1)
    const recovered=await f.repo.operate(alice,request,unknown.revision,"refresh")
    assert.equal(recovered.enabled,true);assert.equal(writes(f).length,1)
    f.state.loseDelete=true;const revoke=await f.repo.operate(alice,request,recovered.revision,"revoke")
    assert.equal(revoke.state,"revoke_unknown");assert.equal(revoke.enabled,false);assert.equal(revoke.revoke_requested,true)
    assert.deepEqual((await f.mcp.get(alice,request)).headers,[])
    await assert.rejects(f.repo.operate(alice,request,recovered.revision,"revoke"),/smithery_connection_changed/)
    const confirmed=await f.repo.operate(alice,request,revoke.revision,"refresh")
    assert.equal(confirmed.state,"revoked");assert.equal(confirmed.enabled,false);assert.equal(writes(f).length,2)
  }finally{await f.close()}
})

test("Smithery key rotation and removal atomically invalidate old catalogs and fence late connection responses",async()=>{
  const f=await fixture();let release
  try{
    await f.repo.saveKey(alice,secret,0,randomUUID())
    const created=await f.repo.connect(alice,selection,randomUUID()),old=await f.mcp.get(alice,created.id)
    await f.repo.saveKey(alice,secret+"rotated",1,randomUUID())
    const disabled=await f.mcp.get(alice,created.id)
    assert.equal(disabled.enabled,false);assert.ok(disabled.revision>old.revision);assert.deepEqual(disabled.headers,[])
    let entered;const ready=new Promise(resolve=>{entered=resolve}),held=new Promise(resolve=>{release=resolve})
    f.state.beforePut=async()=>{entered();await held}
    const request=randomUUID(),pending=f.repo.connect(alice,selection,request);await ready
    const rotated=await f.repo.saveKey(alice,secret+"latest",2,randomUUID());release();release=null
    const late=await pending;assert.equal(late.state,"needs_refresh");assert.equal(late.enabled,false)
    const removed=await f.repo.removeKey(alice,rotated.revision,randomUUID())
    assert.equal(removed.has_key,false);assert.equal((await f.mcp.get(alice,created.id)).enabled,false)
    assert.equal(f.remote.size,2);assert.equal(f.calls.some(call=>call.wire.method==="DELETE"),false)
    await assert.rejects(f.repo.namespaces(alice),/smithery_key_required/)
  }finally{release?.();await f.close()}
})
test("Smithery namespace ownership and remote binding proof fail closed before remote writes or credential publication",async()=>{
  const f=await fixture()
  try{
    await f.repo.saveKey(alice,secret,0,randomUUID())
    const foreign=await f.repo.connect(alice,{...selection,namespace:"foreign"},randomUUID())
    assert.equal(foreign.enabled,false);assert.equal(foreign.last_error,"smithery_namespace_not_owned");assert.equal(writes(f).length,0)
    const own=await f.repo.connect(alice,selection,randomUUID())
    const upstream=[...f.remote.values()][0];upstream.metadata={agent_studio_binding:"b".repeat(64)}
    const refused=await f.repo.operate(alice,own.id,own.revision,"revoke")
    assert.equal(refused.state,"revoke_unknown");assert.equal(refused.enabled,false);assert.equal(writes(f).length,1)
    assert.equal(f.remote.size,1);assert.deepEqual((await f.mcp.get(alice,own.id)).headers,[])
  }finally{await f.close()}
})
test("an uncertain Smithery create must first read remote absence before an explicit retry can reuse the original ID",async()=>{
  const f=await fixture()
  try{
    await f.repo.saveKey(alice,secret,0,randomUUID());f.state.beforePut=async()=>{throw Error("lost before provider commit")}
    const id=randomUUID(),unknown=await f.repo.connect(alice,selection,id)
    assert.equal(unknown.state,"unknown");await assert.rejects(f.repo.operate(alice,id,unknown.revision,"connect"),/smithery_reconcile_required/)
    const absent=await f.repo.operate(alice,id,unknown.revision,"refresh");assert.equal(absent.last_error,"smithery_remote_absent")
    f.state.beforePut=null;const retried=await f.repo.operate(alice,id,absent.revision,"connect")
    assert.equal(retried.id,id);assert.equal(retried.enabled,true);assert.equal(f.remote.size,1)
    assert.equal(new Set(writes(f).map(call=>call.wire.path)).size,1)
  }finally{await f.close()}
})
