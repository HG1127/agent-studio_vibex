// Disposable CI-only: real PostgreSQL 18 Native Auth / HTTPS-cookie / RLS.
//
// Guard rejects any non-GitHub/disposable target BEFORE socket or TLS work.
// A localhost HTTPS server with a newly generated, CA-verified test cert
// exercises actual cookie+CSRF headers, independent auth/API database roles
// and two synthetic employees. No production servers or paid model calls.
import test from "node:test"
import assert from "node:assert/strict"
import {createHash} from "node:crypto"
import {createServer as createTlsServer,request as httpsRequest} from "node:https"
import {execFileSync} from "node:child_process"
import {mkdtempSync,readFileSync,rmSync} from "node:fs"
import {tmpdir} from "node:os"
import path from "node:path"
import pg from "pg"
import {requireEphemeralPg18Ci} from "../src/pg18-ephemeral-ci-guard.mjs"
import {loadPg18CiBaseline} from "../src/pg18-ci-schema.mjs"
import {loadNativeAuthPg18CiSchema} from "../src/pg18-native-auth-ci-schema.mjs"
import {NativeAuthRepository} from "../src/native-auth-repository.mjs"
import {createNativeAuthHttpHandler} from "../src/native-auth-http.mjs"
import {AgentSpecRepository} from "../src/repository.ts"

function adapter(pool){
  return {async connect(){
    const c=await pool.connect()
    return {async query(sql,params=[]){
      const answer=await c.query(sql,params)
      return {rows:answer.rows}
    },release(){c.release()}}
  }}
}
function syntheticPassword(seed,name){
  return "synthetic-"+createHash("sha256")
    .update(seed+":native-"+name).digest("hex").slice(0,50)
}
function assertTargetAndEmpty(rows){
  const row=rows[0]
  assert.ok(row)
  assert.equal(row.db,"agentstudio_pg18_ci")
  assert.equal(row.login,"agentstudio_admin")
  assert.equal(row.superuser,true)
  assert.ok(Number(row.version)>=180000&&Number(row.version)<190000)
  assert.equal(Number(row.appTables),0)
  assert.equal(Number(row.localSchemas),0)
  assert.equal(Number(row.reusedRoles),0)
}
async function provisionIsolatedRoles(admin,target){
  const apiPass=syntheticPassword(target.password,"api")
  const workerPass=syntheticPassword(target.password,"worker")
  const authPass=syntheticPassword(target.password,"auth")
  // All 3 passwords consist ONLY of static ASCII and SHA256 hex characters.
  // Role names and database are literal, not interpolated.
  await admin.query("CREATE ROLE agentstudio_stage_login LOGIN NOINHERIT "+
    "NOSUPERUSER NOBYPASSRLS PASSWORD '"+apiPass+"'")
  await admin.query("CREATE ROLE agentstudio_stage_worker LOGIN NOINHERIT "+
    "NOSUPERUSER NOBYPASSRLS PASSWORD '"+workerPass+"'")
  await admin.query("GRANT agentstudio_api TO agentstudio_stage_login")
  await admin.query(
    "GRANT agentstudio_worker,agentstudio_api TO agentstudio_stage_worker")
  await admin.query(loadNativeAuthPg18CiSchema().sql)
  await admin.query(
    "ALTER ROLE agentstudio_native_login WITH LOGIN PASSWORD '"+authPass+"'")
  // This test database belongs to a fresh CI-only container; do not grant
  // native_auth to stage_login or stage_worker.
  return {apiPass,authPass}
}
function startTrustedTlsFixture(handler){
  const folder=mkdtempSync(path.join(tmpdir(),"pg18-native-tls-"))
  const key=path.join(folder,"local.key")
  const cert=path.join(folder,"local.crt")
  try{
    execFileSync("openssl",[
      "req","-x509","-newkey","rsa:2048","-nodes","-sha256",
      "-keyout",key,"-out",cert,"-days","1",
      "-subj","/CN=localhost","-addext","subjectAltName=DNS:localhost,IP:127.0.0.1"
    ],{stdio:"ignore",timeout:15000})
    const server=createTlsServer({
      key:readFileSync(key),cert:readFileSync(cert)
    },handler)
    return {server,ca:readFileSync(cert),
      remove(){rmSync(folder,{force:true,recursive:true})}}
  }catch(error){rmSync(folder,{force:true,recursive:true});throw error}
}
function callHttps(port,ca,route,{method="GET",body,cookie,origin,
  authorization,extraHeaders={}}={}){
  return new Promise((resolve,reject)=>{
    const bytes=body===undefined?null:Buffer.from(JSON.stringify(body))
    const headers={
      Accept:"application/json",
      ...(bytes?{"Content-Type":"application/json",
        "Content-Length":String(bytes.length)}:{}),
      ...(cookie?{Cookie:cookie}:{}),
      ...(origin?{Origin:origin}:{}),
      ...extraHeaders,
      ...(authorization?{Authorization:authorization}:{}),
    }
    const request=httpsRequest({
      hostname:"127.0.0.1",servername:"localhost",port,
      method,path:route,headers,ca,rejectUnauthorized:true,
      timeout:9000,agent:false
    },response=>{
      const chunks=[]
      response.on("data",d=>chunks.push(d))
      response.on("end",()=>{
        let output
        try{output=JSON.parse(Buffer.concat(chunks).toString("utf8"))}
        catch{return reject(Error("invalid_ci_json_response"))}
        resolve({status:response.statusCode,body:output,
          cookie:response.headers["set-cookie"]?.[0]??""})
      })
      response.on("error",reject)
    })
    request.on("timeout",()=>request.destroy(Error("tls_ci_timeout")))
    request.on("error",reject)
    request.end(bytes??undefined)
  })
}
async function businessProfile(req,res,native,agentRepository){
  try{
    if(req.url!=="/uat/agents"||req.method!=="GET"){
      res.writeHead(404,{"Content-Type":"application/json"})
      res.end(JSON.stringify({error:"uat_route_not_found"}))
      return
    }
    const identity=await native.authenticateRequest(req)
    const records=await agentRepository.list(identity)
    res.writeHead(200,{"Content-Type":"application/json",
      "Cache-Control":"no-store"})
    res.end(JSON.stringify({names:records.map(r=>r.name)}))
  }catch(error){
    const status=Number.isInteger(error?.status)?error.status:503
    res.writeHead(status,{"Content-Type":"application/json"})
    res.end(JSON.stringify({error:status===503?"uat_unavailable":error.code??error.message}))
  }
}

test("PG18 real-TCP Native employee login uses verified localhost HTTPS, isolated role and owner RLS",async()=>{
  // No Pool, OpenSSL or network before the exact CI-only target guard.
  const target=requireEphemeralPg18Ci(process.env)
  const admin=new pg.Pool(target)
  let apiPool,authPool,fixture
  try{
    const checked=await admin.query(
      "SELECT current_database() AS db,session_user AS login,"+
      "(SELECT rolsuper FROM pg_roles WHERE rolname=session_user) AS superuser,"+
      "current_setting('server_version_num')::integer AS version,"+
      "(SELECT count(*)::integer FROM pg_tables WHERE schemaname='agentstudio') AS \"appTables\","+
      "(SELECT count(*)::integer FROM pg_namespace "+
      "WHERE nspname IN ('agentstudio','agentstudio_auth')) AS \"localSchemas\","+
      "(SELECT count(*)::integer FROM pg_roles "+
      "WHERE rolname IN ('agentstudio_native_auth','agentstudio_native_login',"+
      "'agentstudio_stage_login','agentstudio_stage_worker','agentstudio_api',"+
      "'agentstudio_worker')) AS \"reusedRoles\"")
    assertTargetAndEmpty(checked.rows)
    await admin.query(loadPg18CiBaseline().sql)
    const secrets=await provisionIsolatedRoles(admin,target)
    apiPool=new pg.Pool({...target,user:"agentstudio_stage_login",
      password:secrets.apiPass,max:3})
    authPool=new pg.Pool({...target,user:"agentstudio_native_login",
      password:secrets.authPass,max:3})

    const auth=new NativeAuthRepository(adapter(authPool))
    const agentRepo=new AgentSpecRepository(adapter(apiPool))
    const owner=await auth.provisionInitialAdmin({
      email:"admin@example.com",password:"SyntheticNativeAdminPassword#2026",
      display_name:"Synthetic Admin"
    })
    assert.ok(owner.id)
    const identities=(await admin.query(
      "SELECT pg_has_role('agentstudio_stage_login','agentstudio_native_auth','member') "+
      "AS api,pg_has_role('agentstudio_stage_worker','agentstudio_native_auth','member') "+
      "AS worker,pg_has_role('agentstudio_native_login','agentstudio_api','member') "+
      "AS auth_api")).rows[0]
    assert.deepEqual(identities,{api:false,worker:false,auth_api:false})

    const business=adapter(apiPool)
    const authSession=await auth.login("admin@example.com",
      "SyntheticNativeAdminPassword#2026")
    const adminAgent=await agentRepo.create(authSession.identity,
      "Synthetic private admin research",{
        goal:"Confidential synthetic goal",task_scope:"No external calls",
        task_plan:[],deliverables:[],done_criteria:[],
        tools:[],knowledge_base_ids:[],require_approval:true
      })
    assert.equal(adminAgent.owner_user_id,owner.id)

    let native
    native=createNativeAuthHttpHandler({
      auth,allowedOrigin:"https://localhost",allowEmployeeProvisioning:true,
      businessHandler:(req,res)=>{
        void businessProfile(req,res,native,agentRepo)
      }
    })
    fixture=startTrustedTlsFixture(native.handler)
    const localServer=fixture.server
    await new Promise((resolve,reject)=>{
      localServer.once("error",reject)
      localServer.listen(0,"127.0.0.1",resolve)
    })
    const port=localServer.address().port
    const request=(route,opts)=>callHttps(port,fixture.ca,route,opts)
    const denied=await request("/api/native-auth/me")
    assert.equal(denied.status,401)
    const crossSite=await request("/api/native-auth/login",{
      method:"POST",origin:"https://evil.invalid",
      extraHeaders:{"X-AgentStudio-Request":"1"},
      body:{email:"admin@example.com",password:"SyntheticNativeAdminPassword#2026"}
    })
    assert.equal(crossSite.status,403)
    const noCsrf=await request("/api/native-auth/login",{
      method:"POST",origin:"https://localhost",
      body:{email:"admin@example.com",password:"SyntheticNativeAdminPassword#2026"}
    })
    assert.equal(noCsrf.status,403)

    const administrator=await request("/api/native-auth/login",{
      method:"POST",origin:"https://localhost",
      extraHeaders:{"X-AgentStudio-Request":"1"},
      body:{email:"admin@example.com",password:"SyntheticNativeAdminPassword#2026"}
    })
    assert.equal(administrator.status,200,JSON.stringify(administrator.body))
    assert.equal(administrator.body.role,"admin")
    assert.match(administrator.cookie,/^__Host-agentstudio_session=/)
    assert.match(administrator.cookie,/;\s*Secure;/)
    assert.match(administrator.cookie,/;\s*HttpOnly;/)
    assert.match(administrator.cookie,/;\s*SameSite=Strict/)
    assert.doesNotMatch(administrator.cookie,/Domain=/i)
    const adminCookie=administrator.cookie.split(";")[0]
    const adminProfile=await request("/api/native-auth/me",{cookie:adminCookie})
    assert.equal(adminProfile.body.user.email,"admin@example.com")
    const adminRecords=await request("/uat/agents",{cookie:adminCookie})
    assert.equal(adminRecords.status,200)
    assert.deepEqual(adminRecords.body.names,["Synthetic private admin research"])
    const bearerAttempt=await request("/uat/agents",{
      cookie:adminCookie,authorization:"Bearer forged.token"
    })
    assert.equal(bearerAttempt.status,401)

    const created=await request("/api/native-auth/employees",{
      method:"POST",cookie:adminCookie,origin:"https://localhost",
      extraHeaders:{"X-AgentStudio-Request":"1"},
      body:{email:"staff@example.com",
        password:"SyntheticEmployeePassword#2026",display_name:"Synthetic Staff"}
    })
    assert.equal(created.status,201,JSON.stringify(created.body))
    assert.equal(created.body.user.is_admin,false)
    const member=await request("/api/native-auth/login",{
      method:"POST",origin:"https://localhost",
      extraHeaders:{"X-AgentStudio-Request":"1"},
      body:{email:"staff@example.com",password:"SyntheticEmployeePassword#2026"}
    })
    assert.equal(member.status,200)
    const staffCookie=member.cookie.split(";")[0]
    const staffRecords=await request("/uat/agents",{cookie:staffCookie})
    assert.equal(staffRecords.status,200)
    assert.deepEqual(staffRecords.body.names,[],
      "real PG18 RLS must hide admin's private Agent from employee")
    const noAdmin=await request("/api/native-auth/employees",{
      method:"POST",cookie:staffCookie,origin:"https://localhost",
      extraHeaders:{"X-AgentStudio-Request":"1"},
      body:{email:"privileged@example.com",
        password:"SyntheticEmployeePassword#2026",display_name:"Attempted Admin"}
    })
    assert.equal(noAdmin.status,403)
    const signedOut=await request("/api/native-auth/logout",{
      method:"POST",cookie:staffCookie,origin:"https://localhost",
      extraHeaders:{"X-AgentStudio-Request":"1"},body:{}
    })
    assert.equal(signedOut.status,200)
    assert.match(signedOut.cookie,/Max-Age=0/)
    const revoked=await request("/uat/agents",{cookie:staffCookie})
    assert.equal(revoked.status,401)

    // No local business account can SELECT credential hashes or sessions.
    const apiClient=await apiPool.connect()
    try{
      await apiClient.query("BEGIN READ ONLY")
      await apiClient.query("SET LOCAL ROLE agentstudio_api")
      await assert.rejects(apiClient.query(
        "SELECT password_record FROM agentstudio_auth.accounts LIMIT 1"),
        e=>e?.code==="42501")
    }finally{await apiClient.query("ROLLBACK").catch(()=>{});apiClient.release()}
    const authClient=await authPool.connect()
    try{
      await authClient.query("BEGIN READ ONLY")
      await authClient.query("SET LOCAL ROLE agentstudio_native_auth")
      await assert.rejects(authClient.query(
        "SELECT name FROM agentstudio.agent_specs LIMIT 1"),
        e=>e?.code==="42501")
    }finally{await authClient.query("ROLLBACK").catch(()=>{});authClient.release()}
    assert.equal((await admin.query(
      "SELECT count(*)::integer AS n FROM agentstudio.jobs")).rows[0].n,0)
    assert.equal((await admin.query(
      "SELECT count(*)::integer AS n FROM agentstudio.external_effects")).rows[0].n,0)
  }finally{
    if(fixture){
      await new Promise(resolve=>fixture.server.close(resolve))
      fixture.remove()
    }
    await Promise.allSettled([apiPool?.end(),authPool?.end(),admin.end()].filter(Boolean))
  }
})
