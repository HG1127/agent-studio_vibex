import test from "node:test"
import assert from "node:assert/strict"
import {spawnSync} from "node:child_process"
import {readFileSync} from "node:fs"
import path from "node:path"
import {fileURLToPath} from "node:url"
import {nativePg18ServerConfig,nativePg18ServerPlan,assertNativeServeOrigin,nativeRuntimeCredentialConfig} from "../src/native-server.ts"
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
    AGENT_STUDIO_PG_NATIVE_AUTH_PASSWORD_FILE:directory+"/native-auth.secret"
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
    authFile:directory+"/native-auth.secret"
  })
  assert.deepEqual(nativeRuntimeCredentialConfig(baseline,false,0),{
    credentialDir:"/root/.agentstudio-pg18-secrets",
    apiFile:"/root/.agentstudio-pg18-secrets/api.secret",
    authFile:"/root/.agentstudio-pg18-secrets/native-auth.secret"
  })
})
test("native server gates run/approval repository behind isolated UAT flag and verifies two roles",()=>{
  const source=readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)),
    "../src/native-server.ts"),"utf8")
  assert.match(source,/capabilities\.runApprovalUat===true/)
  assert.match(source,/runRepository:new RunRepository/)
  assert.match(source,/permitNativePg18BusinessUatRequest/)
  assert.match(source,/verified_active_admins:1/)
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
  assert.match(source,/pilot_business_writes_disabled/)
  assert.match(source,/permitNativePg18BusinessUatRequest/)
  assert.match(source,/selectNativePg18UatCapabilities/)
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

test("native systemd nonroot preflight checks live credential binding but never opens HTTP",()=>{
  const file=path.resolve(path.dirname(fileURLToPath(import.meta.url)),
    "../src/native-server.ts")
  const src=readFileSync(file,"utf8")
  assert.match(src,/--preflight-nonroot/)
  assert.match(src,/startNativePg18Server\(process\.env,args\[0\]==="--serve",/)
  assert.match(src,/args\[0\]!=="--preflight"\)/)
  assert.match(src,/credential_mode:credentialMode\?"systemd_nonroot":"root_offline"/)
  assert.match(src,/selectNativePg18UatCapabilities\(\s*env,listen/)
  assert.match(src,/assertNativeServeOrigin\(cfg\.allowedOrigin,credentialMode\)/)
  const beforeListen=src.indexOf("if(!listen){",src.indexOf("export async function startNativePg18Server"))
  const socketSetup=src.indexOf("localServer.listen(",beforeListen)
  assert.ok(beforeListen>0 && socketSetup>beforeListen,
    "no HTTP socket may be opened before readonly preflight returns")
  const noEnv=spawnSync(process.execPath,
    ["--experimental-strip-types",file,"--preflight-nonroot"],
    {encoding:"utf8",timeout:12000,
      env:{PATH:process.env.PATH??"",HOME:process.env.HOME??"",
        DATABASE_URL:"postgres://127.0.0.1:5333/agent_studio"}}
  )
  assert.equal(noEnv.status,1)
  assert.equal(noEnv.stdout,"")
  assert.match(noEnv.stderr,/native_server_start_refused/)
  assert.doesNotMatch(noEnv.stderr,/ECONNREFUSED|password authentication failed/)
})