import test from "node:test"
import assert from "node:assert/strict"
import {readFileSync} from "node:fs"
import {randomUUID} from "node:crypto"
import {createServer} from "node:http"
import {PGlite} from "@electric-sql/pglite"
import {vector} from "@electric-sql/pglite-pgvector"
import {freshSchemaForTest} from "../src/baota-pg18-fresh-init.mjs"
import {reviewedNativeSqlForEmbeddedTest,prepareNativeAuthPgliteRoles} from "./helpers/native-pg18-embedded.mjs"
import {NativeAuthRepository} from "../src/native-auth-repository.mjs"
import {createNativeAuthHttpHandler} from "../src/native-auth-http.mjs"
import {KnowledgeEmbeddingRepository} from "../src/knowledge-embedding-repository.ts"
import {embeddingEndpointPolicy} from "../src/knowledge-embedding-policy.ts"
import {scopedKnowledgePool,scopedEmbeddingSettingsPool} from "../src/knowledge-scope-policy.ts"
import {AgentSpecRepository} from "../src/repository.ts"
import {ModelConnectionRepository} from "../src/model-connection-repository.ts"
import {KnowledgeBaseRepository} from "../src/knowledge-repository.ts"
import {KnowledgeContentRepository} from "../src/knowledge-content-repository.ts"
import {KnowledgeAccessRepository} from "../src/knowledge-access-repository.ts"
import {verifyKnowledgeEmbeddingSchema} from "../src/knowledge-embedding-privileges.ts"
import {createHandler} from "../src/http.ts"
import {permitNativePg18BusinessUatRequest,selectNativePg18UatCapabilities} from "../src/native-config-uat-policy.ts"
import {createPgNativePilotApi} from "../../../src/lib/pgNativePilotApi.ts"
const origin="https://embedding.example.test",password="Synthetic-Embedding-Settings#2026"
const sql=name=>readFileSync(new URL("../../../db/postgres/"+name,import.meta.url),"utf8").split(/\r?\n/).filter(line=>!line.trim().startsWith("\\")).join("\n")
async function fixture(){
  const db=await PGlite.create({extensions:{vector}})
  await db.exec("CREATE DATABASE agent_studio");await db.exec(freshSchemaForTest().sql)
  await prepareNativeAuthPgliteRoles(db);await db.exec(reviewedNativeSqlForEmbeddedTest(sql("010_pg18_native_auth_proposed.sql")))
  await db.query("INSERT INTO agentstudio.schema_migrations(version,description) VALUES('pg_v9_023','synthetic embedding fixture predecessor') ON CONFLICT DO NOTHING")
  for(const name of ["024_bound_dispatch_identity","025_workflow_model_identity","026_workflow_tool_identity","027_workflow_agent_identity","028_autonomous_agent_identity","029_mcp_connections","030_mcp_tool_identity","031_smithery_managed","032_knowledge_access","033_knowledge_content","034_knowledge_runtime","035_knowledge_embedding_state"])
    await db.exec(sql("migrations/pg_v9_"+name+".sql"))
  let tail=Promise.resolve()
  const raw={async connect(){const before=tail;let release;tail=new Promise(done=>release=done);await before;return {query:(text,args=[])=>db.query(text,args),release}}}
  const pool=scopedEmbeddingSettingsPool(scopedKnowledgePool(raw,true),true)
  const auth=new NativeAuthRepository(pool),owner=await auth.provisionInitialAdmin({email:"owner@example.test",password,display_name:"Owner"})
  const token=await auth.login("owner@example.test",password),reader=await auth.provisionEmployee(token.token,{email:"reader@example.test",password,display_name:"Reader"})
  const embedding=new KnowledgeEmbeddingRepository(pool,embeddingEndpointPolicy({})),models=new ModelConnectionRepository(pool,Buffer.alloc(32,35)),policy={configurationWrites:true,employeeProvisioning:true,knowledgeSharingUat:true,knowledgeEmbeddingSettingsUat:true}
  await verifyKnowledgeEmbeddingSchema(pool)
  let backend
  const native=createNativeAuthHttpHandler({auth,allowedOrigin:origin,allowConfigurationWrites:true,allowKnowledgeSharing:true,allowKnowledgeEmbeddingSettings:true,businessHandler:(req,res)=>{
    if(!permitNativePg18BusinessUatRequest(new URL(req.url,origin).pathname,req.method,policy)){res.writeHead(405,{"Content-Type":"application/json"});res.end(JSON.stringify({error:"native_readonly"}));return}
    return backend(req,res)
  }})
  backend=createHandler({allowedOrigin:origin,repository:new AgentSpecRepository(pool),modelConnectionRepository:models,
    knowledgeRepository:new KnowledgeBaseRepository(pool),knowledgeAccessRepository:new KnowledgeAccessRepository(pool,(identity,email)=>auth.resolveKnowledgeRecipient(identity,email)),knowledgeContentRepository:new KnowledgeContentRepository(pool),
    knowledgeEmbeddingRepository:embedding,authenticateRequest:native.authenticateRequest,verifyToken:async()=>{throw Error("Bearer forbidden")}})
  const server=createServer(native.handler);await new Promise(done=>server.listen(0,"127.0.0.1",done));const address="http://127.0.0.1:"+server.address().port
  const client=()=>{let cookie="";const calls=[],state={dropNext:false};const transport=async(url,options={})=>{
    calls.push({url,options});const headers=new Headers(options.headers);headers.set("Origin",origin);if(cookie)headers.set("Cookie",cookie)
    const result=await fetch(address+url,{...options,headers}),set=result.headers.get("set-cookie");if(set)cookie=set.split(";")[0]
    if(state.dropNext&&options.method==="POST"&&url.endsWith("/knowledge-embedding/settings")&&result.ok){state.dropNext=false;await result.arrayBuffer();throw Error("synthetic response loss")}
    return result
  };return {api:createPgNativePilotApi(transport,""),transport,calls,state}}
  return {db,pool,auth,owner,reader,embedding,policy,client,async close(){server.closeAllConnections();await new Promise(done=>server.close(done));await db.close()}}
}
test("native Cookie embedding configuration recovers a lost reply without automatic writes, and exposes only owner metadata",async()=>{
  const f=await fixture()
  try{
    const owner=f.client(),reader=f.client();await owner.api.login("owner@example.test",password);await reader.api.login("reader@example.test",password)
    assert.equal((await owner.api.getConfigCapabilities()).knowledge_embedding_settings_enabled,true)
    const model=await owner.api.createModelConnection({name:"Embedding",provider:"openai",base_url:"https://api.openai.com/v1",api_key:"synthetic-own-embedding-key-never-network",models:["synthetic"],enabled:true})
    const base=await owner.api.createKnowledge("Semantic profile","Synthetic only")
    const request={action:"configure",request_id:randomUUID(),expected_revision:0,connection_id:model.id,connection_revision:model.revision,model_name:"synthetic",base_url:"https://api.openai.com/v1"}
    owner.state.dropNext=true
    await assert.rejects(owner.api.changeKnowledgeEmbeddingSettings(request),error=>error.code==="pg_native_connection_unavailable")
    assert.equal(owner.calls.filter(call=>call.url.endsWith("/knowledge-embedding/settings")&&call.options.method==="POST").length,1)
    const receipt=await owner.api.getKnowledgeEmbeddingReceipt(request.request_id)
    assert.equal(receipt.revision,1);assert.equal(receipt.action,"configure")
    assert.equal((await owner.api.changeKnowledgeEmbeddingSettings(request)).replayed,true)
    assert.equal(await reader.api.getKnowledgeEmbeddingReceipt(request.request_id),null)
    assert.equal((await reader.api.getKnowledgeEmbeddingSettings()).configured,false)
    await owner.api.importSharedKnowledge(base.id,{request_id:randomUUID(),filename:"notes.txt",text:"owner-consented incremental queue"})
    const status=await owner.api.getKnowledgeEmbeddingStatus(base.id)
    assert.equal(status.pending,1);assert.equal(status.queued,true);assert.equal(status.indexed,0)
    await assert.rejects(reader.api.getKnowledgeEmbeddingStatus(base.id),error=>error.status===404)
    const spoof=await reader.transport("/api/v2/knowledge-embedding/bases/"+base.id+"/status",{headers:{"X-Rh-User-Id":f.owner.id}})
    assert.equal(spoof.status,404)
    await assert.rejects(owner.api.changeKnowledgeEmbeddingSettings({...request,request_id:randomUUID(),expected_revision:1,api_key:"must not be accepted"}),error=>error.status===400)
    const noCsrf=await owner.transport("/api/v2/knowledge-embedding/settings",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"disable",request_id:randomUUID(),expected_revision:1})})
    assert.equal(noCsrf.status,403)
    const settings=await owner.api.getKnowledgeEmbeddingSettings()
    assert.equal(settings.configured,true);assert.equal(settings.dimensions,null)
    for(const object of [receipt,status,settings])for(const key of ["api_key","api_key_ciphertext","embedding","text_content","object_key"])assert.equal(Object.hasOwn(object,key),false)
    const identity=(await f.db.query("SELECT external_issuer AS issuer,external_subject AS subject FROM agentstudio.users WHERE id=$1",[f.owner.id])).rows[0]
    await f.db.query("UPDATE agentstudio_auth.accounts SET enabled=false WHERE user_id=$1",[f.owner.id])
    await assert.rejects(f.embedding.settings(identity),error=>error.status===403)
    await assert.rejects(owner.api.getKnowledgeEmbeddingSettings(),error=>error.status===401)
    f.policy.knowledgeEmbeddingSettingsUat=false
    await assert.rejects(reader.api.getKnowledgeEmbeddingSettings(),error=>error.status===405)
  }finally{await f.close()}
})
test("embedding settings require config, sharing, dedicated approval and a listening non-root HTTPS context",()=>{
  const env={AGENT_STUDIO_PG18_CONFIG_WRITE_UAT_ENABLED:"true",AGENT_STUDIO_PG18_UAT_APPROVAL:"APPROVE_ISOLATED_PG18_CONFIG_UAT_ONLY",AGENT_STUDIO_PG18_KNOWLEDGE_SHARING_UAT_ENABLED:"true",AGENT_STUDIO_PG18_KNOWLEDGE_SHARING_UAT_APPROVED:"APPROVE_DISPOSABLE_PG18_KNOWLEDGE_SHARING_ONLY",AGENT_STUDIO_PG18_EMBEDDING_SETTINGS_UAT_ENABLED:"true",AGENT_STUDIO_PG18_EMBEDDING_SETTINGS_UAT_APPROVED:"APPROVE_DISPOSABLE_PG18_EMBEDDING_SETTINGS_ONLY"}
  const policy=selectNativePg18UatCapabilities(env,true,origin,1001)
  assert.equal(policy.knowledgeEmbeddingSettingsUat,true)
  for(const method of ["GET","POST"])assert.equal(permitNativePg18BusinessUatRequest("/api/v2/knowledge-embedding/settings",method,policy),true)
  assert.equal(permitNativePg18BusinessUatRequest("/api/v2/knowledge-embedding/settings","GET",{configurationWrites:true,knowledgeSharingUat:true}),false)
  for(const edit of [{AGENT_STUDIO_PG18_KNOWLEDGE_SHARING_UAT_ENABLED:undefined,AGENT_STUDIO_PG18_KNOWLEDGE_SHARING_UAT_APPROVED:undefined},{AGENT_STUDIO_PG18_CONFIG_WRITE_UAT_ENABLED:undefined},{AGENT_STUDIO_PG18_EMBEDDING_SETTINGS_UAT_APPROVED:"wrong"}])assert.throws(()=>selectNativePg18UatCapabilities({...env,...edit},true,origin,1001))
  assert.throws(()=>selectNativePg18UatCapabilities(env,false,origin,1001));assert.throws(()=>selectNativePg18UatCapabilities(env,true,"http://example.test",1001));assert.throws(()=>selectNativePg18UatCapabilities(env,true,origin,0))
})
