// GitHub-hosted disposable PG18 only. Real SQL roles, HTTPS Cookie/CSRF,
// owner RLS and private mTLS; synthetic model executor, no provider traffic.
import test from "node:test"
import assert from "node:assert/strict"
import {createHash,randomBytes} from "node:crypto"
import {createServer,request} from "node:https"
import {execFileSync} from "node:child_process"
import {mkdtempSync,readFileSync,realpathSync,rmSync} from "node:fs"
import {tmpdir} from "node:os"
import path from "node:path"
import pg from "pg"
import {requireEphemeralPg18Ci} from "../src/pg18-ephemeral-ci-guard.mjs"
import {loadPg18CiBaseline} from "../src/pg18-ci-schema.mjs"
import {loadNativeAuthPg18CiSchema} from "../src/pg18-native-auth-ci-schema.mjs"
import {verifyBoundDispatchPrivileges,verifyBoundDispatchRole} from "../src/bound-dispatch-role-preflight.ts"
import {NativeAuthRepository} from "../src/native-auth-repository.mjs"
import {createNativeAuthHttpHandler} from "../src/native-auth-http.mjs"
import {createPgNativePilotApi} from "../../../src/lib/pgNativePilotApi.ts"
import {createHandler} from "../src/http.ts"
import {createNativeRunRepository} from "../src/native-run-repository.ts"
import {AgentSpecRepository} from "../src/repository.ts"
import {ModelConnectionRepository} from "../src/model-connection-repository.ts"
import {AgentPrepareWorker} from "../src/agent-worker.ts"
import {AgentModelWorker} from "../src/model-worker.ts"
import {OwnerBoundModelDispatch} from "../src/owner-model-dispatch.ts"
import {BoundLeaseIdentityRepository,createVerifiedBoundDispatchAdapter} from "../src/bound-lease-identity.ts"
import {createBoundModelMutualTlsClient} from "../src/bound-model-client.ts"
import {permitNativePg18BusinessUatRequest} from "../src/native-config-uat-policy.ts"
import {withDisposableBoundModelTls} from "./helpers/bound-model-loopback-tls.mjs"

const adapter=pool=>({async connect(){
  const c=await pool.connect()
  return {async query(sql,values=[]){const r=await c.query(sql,values);return {rows:r.rows}},
    release(){c.release()}}
}})
const upgrade=name=>readFileSync(new URL("../../../db/postgres/migrations/"+name,import.meta.url),"utf8")
  .split(/\r?\n/).filter(line=>!line.trim().startsWith("\\")).join("\n")
const policy={configurationWrites:true,employeeProvisioning:true,runApprovalUat:true,
  boundModelExecutionUat:true,modelProbeUat:true}

async function startNativeHttps(auth,pool,key){
  const parent=realpathSync(tmpdir())
  const folder=mkdtempSync(path.join(parent,"pg18-bound-native-ci-"))
  assert.equal(path.dirname(realpathSync(folder)),parent)
  let server
  try{
    execFileSync("openssl",["req","-x509","-newkey","rsa:2048","-nodes","-sha256",
      "-keyout","native.key","-out","native.pem","-days","1","-subj","/CN=localhost",
      "-addext","subjectAltName=DNS:localhost,IP:127.0.0.1"],
    {cwd:folder,stdio:"ignore",timeout:20000,windowsHide:true})
    const ca=readFileSync(path.join(folder,"native.pem"))
    server=createServer({cert:ca,key:readFileSync(path.join(folder,"native.key")),minVersion:"TLSv1.2"})
    await new Promise((resolve,reject)=>{server.once("error",reject);server.listen(0,"127.0.0.1",resolve)})
    const port=server.address().port,origin="https://localhost:"+port
    let backend
    const native=createNativeAuthHttpHandler({auth,allowedOrigin:origin,
      allowEmployeeProvisioning:true,allowConfigurationWrites:true,allowModelProbe:true,
      businessHandler:(req,res)=>{
        const route=new URL(req.url,"https://localhost").pathname
        if(!permitNativePg18BusinessUatRequest(route,req.method,policy)){
          res.writeHead(405,{"Content-Type":"application/json"})
          res.end(JSON.stringify({error:"pilot_business_writes_disabled"}));return
        }
        return backend(req,res)
      }})
    backend=createHandler({allowedOrigin:origin,
      verifyToken:async()=>{throw Error("native_cookie_required")},
      authenticateRequest:native.authenticateRequest,
      repository:new AgentSpecRepository(pool),runRepository:createNativeRunRepository(pool,policy),
      modelConnectionRepository:new ModelConnectionRepository(pool,key),
      modelConnectionProbe:async()=>({status:"ok",latency_ms:1,error_code:""})})
    server.on("request",native.handler)
    let cookie=""
    const transport=(route,init={})=>new Promise((resolve,reject)=>{
      const body=init.body?Buffer.from(init.body):null
      const req=request({hostname:"127.0.0.1",servername:"localhost",port,
        path:route.replace(/^\/__pg_native(?=\/|$)/,""),method:init.method??"GET",
        ca,rejectUnauthorized:true,agent:false,timeout:10000,
        headers:{...init.headers,...(body?{"content-length":String(body.length)}:{}),
          ...(cookie?{Cookie:cookie}:{}),...(init.method&&init.method!=="GET"?{Origin:origin}:{})}},res=>{
        const chunks=[];let bytes=0
        res.on("data",chunk=>{bytes+=chunk.length;if(bytes>65536)res.destroy();else chunks.push(chunk)})
        res.on("error",reject)
        res.on("end",()=>{
          const saved=res.headers["set-cookie"]?.[0]
          if(saved){assert.match(saved,/HttpOnly/i);assert.match(saved,/Secure/i);cookie=saved.split(";")[0]}
          resolve(new Response(Buffer.concat(chunks),{status:res.statusCode}))
        })
      })
      req.on("timeout",()=>req.destroy(Error("ci_https_timeout")))
      req.on("error",reject);req.end(body??undefined)
    })
    return {api:createPgNativePilotApi(transport),async close(){
      server.closeAllConnections();await new Promise(resolve=>server.close(resolve))
      rmSync(folder,{recursive:true,force:true})}}
  }catch(error){
    if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}
    rmSync(folder,{recursive:true,force:true});throw error
  }
}

test("PG18 TCP: native HTTPS approval -> independent private mTLS Broker -> durable bound result, no replay",async()=>{
  // FIRST effectful operation: exact GitHub-only target attestation. No pool,
  // certificate generation, listener or model executor exists before it.
  const target=requireEphemeralPg18Ci(process.env)
  const admin=new pg.Pool(target),pools=[]
  const key=randomBytes(32)
  let front
  try{
    const observed=(await admin.query("SELECT current_database() AS db,session_user AS login,"+
      "current_setting('server_version_num')::int AS version,"+
      "(SELECT count(*)::int FROM pg_namespace WHERE nspname IN ('agentstudio','agentstudio_auth')) AS existing,"+
      "(SELECT count(*)::int FROM pg_roles WHERE rolname LIKE 'agentstudio\\_%' ESCAPE '\\') AS roles")).rows[0]
    assert.equal(observed.db,"agentstudio_pg18_ci");assert.equal(observed.login,"agentstudio_admin")
    assert.ok(observed.version>=180000&&observed.version<190000)
    assert.equal(observed.existing,0);assert.equal(observed.roles,1) // only the CI administrator
    await admin.query(loadPg18CiBaseline().sql)
    // The fresh schema contains V9 table shapes. This marker is explicitly
    // synthetic CI setup, never proof of a historical migration on a host.
    await admin.query("INSERT INTO agentstudio.schema_migrations(version,description) "+
      "VALUES('pg_v9_022','synthetic CI predecessor')")
    await admin.query(upgrade("pg_v9_023_workflow_safe_worker.sql"))
    await admin.query(upgrade("pg_v9_024_bound_dispatch_identity.sql"))
    const accounts=[
      ["agentstudio_stage_login","agentstudio_api"],
      ["agentstudio_stage_worker","agentstudio_worker,agentstudio_api"],
      ["agentstudio_bound_dispatch_login","agentstudio_bound_dispatch"],
      ["agentstudio_model_broker_login","agentstudio_model_broker"],
    ]
    const byLogin={}
    for(const [login,roles] of accounts){
      // All identifiers are literal constants and every password is ASCII
      // hex derived from the disposable Actions password. Never print them.
      const password="synthetic-"+createHash("sha256").update(target.password+":"+login).digest("hex")
      await admin.query("CREATE ROLE "+login+" LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS "+
        "NOCREATEROLE NOCREATEDB NOREPLICATION PASSWORD '"+password+"'")
      await admin.query("GRANT "+roles+" TO "+login)
      const pool=new pg.Pool({...target,user:login,password,max:5})
      pools.push(pool);byLogin[login]=pool
    }
    await admin.query(loadNativeAuthPg18CiSchema().sql)
    const authPassword="synthetic-"+createHash("sha256").update(target.password+":auth").digest("hex")
    await admin.query("ALTER ROLE agentstudio_native_login LOGIN PASSWORD '"+authPassword+"'")
    const authPool=new pg.Pool({...target,user:"agentstudio_native_login",password:authPassword})
    pools.push(authPool)
    const apiPool=adapter(byLogin.agentstudio_stage_login)
    const identityPool=adapter(byLogin.agentstudio_bound_dispatch_login)
    const brokerPool=adapter(byLogin.agentstudio_model_broker_login)
    const workerPool=adapter(byLogin.agentstudio_stage_worker)
    for(const [kind,pool] of [["api",apiPool],["identity",identityPool],["broker",brokerPool]])
      await verifyBoundDispatchPrivileges(pool,kind)
    // A disposable CI database must NOT pass the actual deployment target
    // wrapper. The privilege inspector above does not bypass that wrapper.
    await assert.rejects(verifyBoundDispatchRole(apiPool,{mode:"baota_pg18",host:"127.0.0.1",
      port:5333,database:"agent_studio",user:"agentstudio_stage_login",expectedMajor:18},"api"),
    /pg_runtime_target_mismatch/)
    await admin.query("GRANT pg_read_server_files TO agentstudio_bound_dispatch_login")
    await assert.rejects(verifyBoundDispatchPrivileges(identityPool,"identity"),/unsafe_bound_dispatch_database_role/)
    await admin.query("REVOKE pg_read_server_files FROM agentstudio_bound_dispatch_login")
    await verifyBoundDispatchPrivileges(identityPool,"identity")
    await admin.query("GRANT SELECT(api_key_ciphertext) ON agentstudio.model_connections TO agentstudio_api")
    await assert.rejects(verifyBoundDispatchPrivileges(apiPool,"api"),/unsafe_bound_dispatch_database_role/)
    await admin.query("REVOKE SELECT(api_key_ciphertext) ON agentstudio.model_connections FROM agentstudio_api")
    await verifyBoundDispatchPrivileges(apiPool,"api")
    const auth=new NativeAuthRepository(adapter(authPool))
    await auth.provisionInitialAdmin({email:"admin@example.com",password:"SyntheticAdminPassword#2026",display_name:"CI Admin"})
    front=await startNativeHttps(auth,apiPool,key)
    const api=front.api
    await api.login("admin@example.com","SyntheticAdminPassword#2026")
    const secret="SyntheticProviderCredentialNeverSentToProvider012345"
    const saved=await api.createModelConnection({name:"CI owner",provider:"openai",
      base_url:"https://api.openai.com/v1",api_key:secret,models:["gpt-4.1-mini"],enabled:true})
    const ready=await api.testModelConnection(saved.id,saved.revision)
    const agent=await api.createAgent("CI owner Agent","Synthetic facts only")
    await api.bindAgentModel(agent.id,agent.revision,{connection_id:ready.id,
      connection_revision:ready.revision,model_id:"gpt-4.1-mini"})
    const instruction="Produce a disposable synthetic summary",requestKey="pg18-bound-ci-run-0001"
    const submitted=await api.submitRun(agent.id,instruction,requestKey)
    await api.createEmployee("other@example.com","SyntheticOtherPassword#2026","Other employee")
    await api.login("other@example.com","SyntheticOtherPassword#2026")
    await assert.rejects(api.getRun(submitted.run.id),e=>e.status===404)
    await assert.rejects(api.decideModel(submitted.run.id,"approved"),e=>e.status===404)
    const prepare=new AgentPrepareWorker(workerPool,"ci-bound-prepare")
    assert.equal((await prepare.tick()).status,"prepared")
    await api.login("admin@example.com","SyntheticAdminPassword#2026")
    await api.decideModel(submitted.run.id,"approved")
    let generated=0,fallback=0
    const broker=new OwnerBoundModelDispatch(apiPool,key,async(material,input)=>{
      generated++;assert.equal(material.api_key,secret);assert.equal(input.instruction,instruction)
      return "Synthetic PG18 bound model result"
    },brokerPool)
    const verified=createVerifiedBoundDispatchAdapter(new BoundLeaseIdentityRepository(identityPool),broker)
    await withDisposableBoundModelTls(verified,async config=>{
      const worker=new AgentModelWorker(workerPool,"ci-bound-model",{async generate(){
        fallback++;throw Error("shared_model_fallback_forbidden")
      }},{boundOnly:true,boundExecutionApproved:true,boundModelDispatch:createBoundModelMutualTlsClient(config)})
      assert.equal((await worker.tick()).status,"succeeded")
      assert.equal((await worker.tick()).status,"idle")
    })
    const result=await api.getRun(submitted.run.id)
    assert.equal(result.run.status,"succeeded");assert.equal(result.run.result_text,"Synthetic PG18 bound model result")
    assert.equal(JSON.stringify(result).includes(secret),false)
    assert.equal((await api.submitRun(agent.id,instruction,requestKey)).replayed,true)
    assert.equal(generated,1);assert.equal(fallback,0)
    const effects=(await admin.query("SELECT step_key,status FROM agentstudio.external_effects "+
      "WHERE run_id=$1 ORDER BY step_key",[submitted.run.id])).rows
    assert.deepEqual(effects,[{step_key:"model",status:"succeeded"},{step_key:"model_bound_dispatch",status:"succeeded"}])
  }finally{
    if(front)await front.close()
    await Promise.all(pools.map(pool=>pool.end()));await admin.end();key.fill(0)
  }
})
