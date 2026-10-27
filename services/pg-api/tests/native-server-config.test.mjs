import test from "node:test"
import assert from "node:assert/strict"
import {spawnSync} from "node:child_process"
import {Readable} from "node:stream"
import {readFileSync} from "node:fs"
import path from "node:path"
import {fileURLToPath} from "node:url"
import {nativePg18ServerConfig,nativePg18ServerPlan,assertNativeServeOrigin,nativeRuntimeCredentialConfig} from "../src/native-server.ts"
import {createNativeOwnOperationsBusinessHandler} from "../src/own-operations-http.ts"
import {selectNativePg18UatCapabilities} from "../src/native-config-uat-policy.ts"
const baseline={
  AGENT_STUDIO_PG_NATIVE_PILOT_ENABLED:"true",
  AGENT_STUDIO_PG_NATIVE_REVIEWED:"true",
  AGENT_STUDIO_PG_PILOT_ENABLED:"true",
  AGENT_STUDIO_PG_BAOTA18_ENABLED:"true",
  AGENT_STUDIO_PG_BAOTA18_TARGET_CONFIRMED:"true",
  AGENT_STUDIO_PG_HOST:"127.0.0.1",
  AGENT_STUDIO_PG_PORT:"5333",
  AGENT_STUDIO_PG_DATABASE:"agent_studio",
  AGENT_STUDIO_PG_USER:"agentstudio_stage_login",
  AGENT_STUDIO_PG_NATIVE_AUTH_USER:"agentstudio_native_login",
  AGENT_STUDIO_INTERNAL_APP_ORIGIN:"https://studio.test",
  AGENT_STUDIO_PG_PASSWORD_FILE:"/root/.agentstudio-pg18-secrets/api.secret",
  AGENT_STUDIO_PG_NATIVE_AUTH_PASSWORD_FILE:"/root/.agentstudio-pg18-secrets/native-auth.secret",
  AGENT_STUDIO_PG_MODEL_ENCRYPTION_KEY_FILE:"/root/.agentstudio-pg18-secrets/model-encryption.secret",
}

test("native PG18 API requires explicit execution mode and --plan uses no TCP",()=>{
  const plan=nativePg18ServerPlan()
  assert.equal(plan.mode,"plan")
  assert.equal(plan.database,"agent_studio")
  assert.equal(plan.database_port,5333)
  assert.equal(plan.network_used,false)
  assert.equal(plan.workers_started,false)
  assert.equal(plan.configuration_writes_default,false)
  assert.equal(plan.employee_provisioning_default,false)
  assert.equal(plan.agent_run_and_approval_enabled,false)
  assert.equal(plan.production_cutover_allowed,false)
  const source=path.resolve(path.dirname(fileURLToPath(import.meta.url)),
    "../src/native-server.ts")
  const launch=(args)=>spawnSync(process.execPath,
    ["--experimental-strip-types",source,...args],{
      encoding:"utf8",timeout:12000,
      env:{...process.env,DATABASE_URL:"postgres://invalid-target"}
    })
  const offline=launch(["--plan"])
  assert.equal(offline.status,0,offline.stderr)
  assert.equal(JSON.parse(offline.stdout).network_used,false)
  const omitted=launch([])
  assert.equal(omitted.status,1)
  assert.match(omitted.stderr,/NATIVE_SERVER_EXPLICIT_MODE_REQUIRED/)
  assert.doesNotMatch(omitted.stderr,/ECONNREFUSED|invalid-target/)
})
test("native PG18 service is scoped to loopback, separate passwords and explicit approval",()=>{
  const good=nativePg18ServerConfig(baseline,"linux")
  assert.equal(good.host,"127.0.0.1")
  assert.equal(good.port,5333)
  assert.equal(good.database,"agent_studio")
  assert.equal(good.allowedOrigin,"https://studio.test")
  assert.equal(good.listenPort,7403)
  assert.equal(good.api.user,"agentstudio_stage_login")
  assert.equal(good.user,"agentstudio_native_login")
  assert.notEqual(good.apiFile,good.authFile)
})


test("HTTP loopback is permitted only for preflight, serving employees requires HTTPS",()=>{
  assert.doesNotThrow(()=>assertNativeServeOrigin("http://127.0.0.1:7403",false))
  assert.throws(()=>assertNativeServeOrigin("http://127.0.0.1:7403",true),
    /unsafe_native_pg18_server_config/)
  assert.throws(()=>assertNativeServeOrigin("http://localhost:7403",true),
    /unsafe_native_pg18_server_config/)
  assert.doesNotThrow(()=>assertNativeServeOrigin("https://studio.test",true))
})

test("long-running Native API requires non-root systemd isolated credentials",()=>{
  const directory="/run/credentials/agentstudio-pg18-native.service"
  const service={
    ...baseline,
    CREDENTIALS_DIRECTORY:directory,
    AGENT_STUDIO_PG_PASSWORD_FILE:directory+"/api.secret",
    AGENT_STUDIO_PG_NATIVE_AUTH_PASSWORD_FILE:directory+"/native-auth.secret",
    AGENT_STUDIO_PG_MODEL_ENCRYPTION_KEY_FILE:directory+"/model-encryption.secret"
  }
  assert.throws(()=>nativeRuntimeCredentialConfig(service,true,0),
    /unsafe_native_pg18_server_config/)
  assert.throws(()=>nativeRuntimeCredentialConfig(baseline,true,1000),
    /unsafe_native_pg18_server_config/)
  assert.throws(()=>nativeRuntimeCredentialConfig({
    ...service,CREDENTIALS_DIRECTORY:"/run/credentials/other.service"
  },true,1000),/unsafe_native_pg18_server_config/)
  assert.throws(()=>nativeRuntimeCredentialConfig({
    ...service,AGENT_STUDIO_PG_PASSWORD_FILE:"/root/.agentstudio-pg18-secrets/api.secret"
  },true,1000),/unsafe_native_pg18_server_config/)
  assert.deepEqual(nativeRuntimeCredentialConfig(service,true,1000),{
    credentialDir:directory,
    apiFile:directory+"/api.secret",
    authFile:directory+"/native-auth.secret",
    modelKeyFile:directory+"/model-encryption.secret"
  })
  assert.deepEqual(nativeRuntimeCredentialConfig(baseline,false,0),{
    credentialDir:"/root/.agentstudio-pg18-secrets",
    apiFile:"/root/.agentstudio-pg18-secrets/api.secret",
    authFile:"/root/.agentstudio-pg18-secrets/native-auth.secret",
    modelKeyFile:"/root/.agentstudio-pg18-secrets/model-encryption.secret"
  })
})
test("native server permits only owner-scoped Run reads by default; approval writes remain gated",async()=>{
  const source=readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)),
    "../src/native-server.ts"),"utf8")
  assert.match(source,/runRepository:createNativeRunRepository\(business,capabilities\)/)
  const shared=readFileSync(new URL("../src/own-operations-http.ts",import.meta.url),"utf8")
  assert.match(source,/import \{createNativeOwnOperationsBusinessHandler\} from "\.\/own-operations-http\.ts"/)
  assert.match(source,/businessHandler=createNativeOwnOperationsBusinessHandler\(\{[\s\S]*?authenticateRequest:native\.authenticateRequest,[\s\S]*?policy:capabilities,businessHandler,\s*\}\)/)
  assert.match(source,/businessHandler:\(req:IncomingMessage,res:ServerResponse\)=>\{[\s\S]*?return businessHandler\(req,res\)/)
  const compose=source.indexOf("businessHandler=createNativeOwnOperationsBusinessHandler("),listen=source.indexOf("const localServer=createServer(native.handler)")
  assert.ok(compose>=0&&listen>compose,"the actual listener must use the composed Native handler")
  assert.match(shared,/if\(!permitNativePg18BusinessUatRequest\(pathname,req\.method\|\|"",policy\)\)/)
  const guard=shared.indexOf("if(!permitNativePg18BusinessUatRequest("),own=shared.indexOf("if(await own(req,res))return"),fallback=shared.indexOf("await businessHandler(req,res)")
  assert.ok(guard>=0&&own>guard&&fallback>own,"the original global policy must precede owner auth and fallback")
  assert.doesNotMatch(source,/allowBoundModelRuns:true/)
  assert.match(source,/verified_active_admins:verifiedActiveAdmins/)
  assert.match(source,/verified_roles:2/)
  assert.match(source,/host\(inet_server_addr\(\)\)/)
  assert.match(source,/rolcanlogin/)
  assert.match(source,/rolcreaterole/)
  assert.match(source,/vault\.uid!==0/)
  assert.match(source,/stat\.uid!==0/)
  assert.match(source,/serviceCredentials/)
  assert.match(source,/BEGIN READ ONLY/)
  assert.match(source,/SAVEPOINT native_preflight_access/)
  assert.match(source,/ROLLBACK TO SAVEPOINT native_preflight_access/)
  assert.match(source,/if\(!denied\)reject\(\)/)
  assert.match(source,/allowEmployeeProvisioning:capabilities.employeeProvisioning/)
  assert.match(shared,/pilot_business_writes_disabled/)
  assert.match(source,/selectNativePg18UatCapabilities/)

  // Exercise the real shared dispatcher with in-memory streams only. A foreign
  // Origin makes an Own request fail403 if its handler runs before the guard.
  const origin="https://studio.test",trace=[]
  const policy=selectNativePg18UatCapabilities({},false,origin,0)
  assert.equal(policy.configurationWrites,false);assert.equal(policy.runApprovalUat,false)
  const handler=createNativeOwnOperationsBusinessHandler({policy,allowedOrigin:origin,
    authenticateRequest:async()=>{trace.push("auth");return {issuer:"urn:agentstudio:local:v1",subject:"synthetic-verified-owner"}},
    businessHandler:async(_req,res)=>{trace.push("fallback");res.writeHead(200);res.end(JSON.stringify({existing:true}))},
  })
  const request=async(url,method,requestOrigin="https://foreign.test")=>{
    const req=Readable.from([]);Object.assign(req,{url,method,headers:{origin:requestOrigin,cookie:"__Host-agentstudio_session="+"S".repeat(43)}})
    const res={writeHead(status){this.status=status},end(raw){this.body=JSON.parse(raw)}}
    await handler(req,res);return res
  }
  const id="11111111-1111-4111-8111-111111111111"
  for(const url of ["/api/v2/own-overview","/api/v2/own-todos"]){
    const res=await request(url,"POST");assert.equal(res.status,405);assert.deepEqual(res.body,{error:"method_not_allowed"})
  }
  for(const [url,method] of [["/api/v2/agent-specs","POST"],["/api/v2/runs","POST"],["/api/v2/runs/"+id+"/model-approval","POST"],["/api/v2/workflows/"+id+"/runs","POST"],["/api/v2/workflow-v2-runs/"+id+"/decision","POST"]]){
    const res=await request(url,method);assert.equal(res.status,405);assert.deepEqual(res.body,{error:"pilot_business_writes_disabled"})
  }
  assert.deepEqual(trace,[],"denied routes must reach neither owner authentication nor business fallback")
  const ownRead=await request("/api/v2/own-overview","GET",origin)
  assert.equal(ownRead.status,409);assert.deepEqual(ownRead.body,{error:"own_overview_unavailable"});assert.deepEqual(trace,["auth"])
  const runRead=await request("/api/v2/runs","GET",origin)
  assert.equal(runRead.status,200);assert.deepEqual(runRead.body,{existing:true});assert.deepEqual(trace,["auth","fallback"])
})
test("native PG18 refuses nonapproved targets, role reuse, implicit URLs and unsafely served sites",()=>{
  const wrong=[
    {AGENT_STUDIO_PG_NATIVE_PILOT_ENABLED:"false"},
    {AGENT_STUDIO_PG_NATIVE_REVIEWED:undefined},
    {AGENT_STUDIO_PG_PORT:"5432"},
    {AGENT_STUDIO_PG_HOST:"localhost"},
    {AGENT_STUDIO_PG_DATABASE:"vcaios"},
    {AGENT_STUDIO_PG_USER:"postgres"},
    {AGENT_STUDIO_PG_NATIVE_AUTH_USER:"agentstudio_stage_login"},
    {AGENT_STUDIO_INTERNAL_APP_ORIGIN:"http://example.com"},
    {AGENT_STUDIO_INTERNAL_APP_ORIGIN:"http://127.0.0.1:8000"},
    {AGENT_STUDIO_INTERNAL_APP_ORIGIN:"https://studio.test/path"},
    {AGENT_STUDIO_INTERNAL_APP_ORIGIN:"https://evil.test?sid=token"},
    {AGENT_STUDIO_PG_PASSWORD_FILE:baseline.AGENT_STUDIO_PG_NATIVE_AUTH_PASSWORD_FILE},
    {AGENT_STUDIO_PG_PASSWORD_FILE:"/root/unsafe-other-api.secret"},
    {AGENT_STUDIO_PG_NATIVE_AUTH_PASSWORD_FILE:"/tmp/shared.secret"},
    {AGENT_STUDIO_PG_NATIVE_API_PORT:"70000"},
    {AGENT_STUDIO_OIDC_ISSUER:"https://foreign-identity-provider.example"},
    {PGHOST:"something-else"},
    {DATABASE_URL:"postgres://admin@host/private"}
  ]
  for(const change of wrong)
    assert.throws(()=>nativePg18ServerConfig({...baseline,...change},"linux"),
      /unsafe_/,
      JSON.stringify(change))
  assert.throws(()=>nativePg18ServerConfig(baseline,"win32"),/unsafe_/)
  const local=nativePg18ServerConfig({
    ...baseline,AGENT_STUDIO_INTERNAL_APP_ORIGIN:"http://127.0.0.1:8000",
    AGENT_STUDIO_PG_NATIVE_LOCAL_HTTP_TEST:"true"
  },"linux")
  assert.equal(local.allowedOrigin,"http://127.0.0.1:8000")
})
