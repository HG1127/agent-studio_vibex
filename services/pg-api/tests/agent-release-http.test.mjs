import test from "node:test"
import assert from "node:assert/strict"
import {createServer} from "node:http"
import {readFileSync} from "node:fs"
import {randomUUID} from "node:crypto"
import {agentCollaborationFixture} from "./helpers/agent-collaboration-fixture.mjs"
import {freshRuntimeSqlBody} from "../src/pg18-fresh-runtime-source.mjs"
import {AgentSpecRepository} from "../src/repository.ts"
import {AgentReleaseRepository} from "../src/agent-release-repository.ts"
import {ModelConnectionRepository} from "../src/model-connection-repository.ts"
import {createHandler} from "../src/http.ts"
import {createNativeAuthHttpHandler} from "../src/native-auth-http.mjs"
import {permitNativePg18BusinessUatRequest} from "../src/native-config-uat-policy.ts"
import {createPgNativePilotApi} from "../../../src/lib/pgNativePilotApi.ts"

test("full version Cookie/SDK paths retain owner/CSRF boundaries, independent acceptance consent and read-only receipt recovery",async()=>{
  const f=await agentCollaborationFixture(),key=Buffer.from("0123456789abcdef".repeat(4),"hex")
  let server,handler,enabled=true,acceptance=false
  try{
    await f.db.exec(freshRuntimeSqlBody(readFileSync(new URL("../../../db/postgres/migrations/pg_v9_046_agent_releases.sql",import.meta.url),"utf8")))
    await f.db.query("INSERT INTO agentstudio.schema_migrations(version,description) VALUES('pg_v9_046','SYNTHETIC HTTP TEST ONLY; incomplete candidate')")
    server=createServer((req,res)=>{void handler(req,res)})
    await new Promise((resolve,reject)=>{server.once("error",reject);server.listen(0,"127.0.0.1",resolve)})
    const origin="http://127.0.0.1:"+server.address().port
    const configure=()=>{
      let business
      const native=createNativeAuthHttpHandler({auth:f.store,allowedOrigin:origin,allowConfigurationWrites:enabled,allowAgentReleases:true,allowAutonomousAgentSubmission:acceptance,
        businessHandler:(req,res)=>{
          if(!permitNativePg18BusinessUatRequest(new URL(req.url,origin).pathname,req.method,{configurationWrites:enabled,autonomousAgentUat:acceptance})){
            res.writeHead(405,{"Content-Type":"application/json"});res.end(JSON.stringify({error:"pilot_business_writes_disabled"}));return}
          return business(req,res)
        }})
      business=createHandler({allowedOrigin:origin,verifyToken:async()=>{throw Error("No OIDC or arbitrary user fallback")},authenticateRequest:native.authenticateRequest,
        repository:new AgentSpecRepository(f.pool),agentReleaseRepository:new AgentReleaseRepository(f.pool,{enabled,allowAcceptance:acceptance})})
      handler=native.handler
    }
    configure()
    const call=async(path,{method="GET",body,cookie,csrf=true,extra={}}={})=>{
      const response=await fetch(origin+path,{method,headers:{Origin:origin,"Content-Type":"application/json",...(csrf?{"X-AgentStudio-Request":"1"}:{}),...(cookie?{Cookie:cookie}:{}),...extra},
        ...(body===undefined?{}:{body:JSON.stringify(body)})})
      return {status:response.status,headers:response.headers,body:await response.json()}
    }
    const login=async(email,password)=>{const response=await call("/api/native-auth/login",{method:"POST",body:{email,password}});assert.equal(response.status,200);return response.headers.get("set-cookie").split(";")[0]}
    const alice=await login("synthetic-admin@example.test","SyntheticServiceAdmin#2026"),bob=await login("collaborator@example.test","SyntheticCollaborator#2026")
    const client=cookie=>createPgNativePilotApi((route,init)=>fetch(origin+String(route).replace(/^\/__pg_native/,""),{...init,headers:{...init.headers,Origin:origin,Cookie:cookie}}))
    const api=client(alice),other=client(bob)
    const role=await api.createAgent("Owner full release role","Initial owner goal"),base="/api/v2/agent-releases/"+role.id,workspace=await api.getAgentReleases(role.id)
    assert.equal((await api.getConfigCapabilities()).agent_releases_available,true)
    assert.equal((await api.getConfigCapabilities()).agent_release_acceptance_enabled,false)
    await assert.rejects(other.getAgentReleases(role.id),e=>e.status===404)
    assert.equal((await call(base,{extra:{"X-Rh-User-Id":f.owner.id}})).status,401)
    assert.equal((await call(base+"?request_id="+randomUUID(),{cookie:alice})).status,400)
    const save={action:"snapshot",request_id:randomUUID(),expected_spec_revision:workspace.spec_revision,source_sha256:workspace.source_sha256,note:"Owned full snapshot",test_run_id:null}
    assert.equal((await call(base+"/change",{method:"POST",cookie:alice,body:save,csrf:false})).status,403)
    assert.equal((await call(base+"/change",{method:"POST",cookie:alice,body:save,extra:{Origin:"https://foreign.invalid"}})).status,403)
    const saved=await api.changeAgentRelease(role.id,save),version=await api.getAgentReleaseVersion(role.id,saved.version_id)
    assert.equal(version.spec_snapshot.goal,"Initial owner goal");assert.equal(version.test_current,false)
    await assert.rejects(other.getAgentReleaseVersion(role.id,version.id),e=>e.status===404)
    const missing={...save,request_id:randomUUID()}
    await assert.rejects(api.confirmAgentRelease(role.id,missing),e=>e.status===404)
    assert.equal((await api.getAgentReleases(role.id)).versions.length,1)
    const models=new ModelConnectionRepository(f.pool,key),model=await models.create(f.alice,{name:"Synthetic HTTP model",provider:"openai",base_url:"https://api.openai.com/v1",api_key:"SyntheticHttpAcceptanceModelKey",models:["synthetic"],enabled:true})
    const ready=await models.testConnection(f.alice,model.id,model.revision,async()=>({status:"ok",latency_ms:1,error_code:""}))
    const start={action:"acceptance",request_id:randomUUID(),expected_spec_revision:workspace.spec_revision,source_sha256:workspace.source_sha256,
      instruction:"Synthetic queued acceptance",max_steps:8,model_binding:{connection_id:ready.id,connection_revision:ready.revision,model_id:"synthetic"},confirm:true}
    assert.equal((await call(base+"/change",{method:"POST",cookie:alice,body:start})).status,400)
    assert.equal((await call(base+"/acceptance",{method:"POST",cookie:alice,body:start})).status,405)
    acceptance=true;configure()
    assert.equal((await api.getConfigCapabilities()).agent_release_acceptance_enabled,true)
    const accepted=await api.changeAgentRelease(role.id,start)
    const status=await api.getAgentReleaseAcceptance(role.id,accepted.run_id)
    assert.equal(status.status,"queued");assert.equal(status.test_current,false);assert.equal(status.max_steps,8)
    await assert.rejects(other.getAgentReleaseAcceptance(role.id,accepted.run_id),e=>e.status===404)
    const before=await api.getAgentReleases(role.id),publish={action:"publish",request_id:randomUUID(),expected_spec_revision:before.spec_revision,source_sha256:before.source_sha256,
      version_id:version.id,version_sha256:version.version_sha256,expected_version_revision:version.revision,expected_release_revision:before.release_revision,confirm:true,acknowledge_untested:true}
    assert.equal((await api.changeAgentRelease(role.id,publish)).status,"published")
    enabled=false;configure()
    const disabled=await api.getConfigCapabilities();assert.equal(disabled.agent_releases_available,true);assert.equal(disabled.agent_release_acceptance_enabled,false)
    assert.equal((await api.getAgentReleases(role.id)).active_version_id,version.id)
    assert.equal((await api.confirmAgentRelease(role.id,save)).replayed,true)
    assert.equal((await api.confirmAgentRelease(role.id,start)).run_id,accepted.run_id)
    await assert.rejects(api.confirmAgentRelease(role.id,{...start,request_id:randomUUID()}),e=>e.status===404)
    await assert.rejects(api.changeAgentRelease(role.id,{...save,request_id:randomUUID()}),e=>e.status===405)
    await assert.rejects(api.changeAgentRelease(role.id,{...start,request_id:randomUUID()}),e=>e.status===405)
    assert.equal((await call(base+"/confirm",{method:"POST",cookie:alice,body:save,csrf:false})).status,403)
    assert.equal((await f.db.query("SELECT count(*)::int AS n FROM agentstudio.runs")).rows[0].n,1)
    assert.equal((await f.db.query("SELECT count(*)::int AS n FROM agentstudio.agent_release_versions")).rows[0].n,1)
  }finally{if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}await f.close();key.fill(0)}
})
