import test from "node:test"
import assert from "node:assert/strict"
import {spawnSync} from "node:child_process"
import {readFileSync} from "node:fs"
import path from "node:path"
import {fileURLToPath} from "node:url"
import {PGlite} from "@electric-sql/pglite"
import {vector} from "@electric-sql/pglite-pgvector"
import {freshSchemaForTest} from "../src/baota-pg18-fresh-init.mjs"
import {reviewedNativeSqlForEmbeddedTest,prepareNativeAuthPgliteRoles} from "./helpers/native-pg18-embedded.mjs"
import {
  parseNativeActivation,diagnoseNativeSchema,runNativeActivation,
  collectNativeActivationEvidenceForTest,makeNativeScramVerifier,
  verifyNativeHbaOrder,
} from "../src/native-activation-cli.mjs"

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../../..")
const entry=path.join(root,"services/pg-api/src/native-activation-cli.mjs")
const safeEnv={
  AGENT_STUDIO_PG18_NATIVE_ACTIVATION_ENABLED:"true",
  AGENT_STUDIO_PG18_NATIVE_ACTIVATION_WRITE_APPROVED:"true",
  AGENT_STUDIO_PG18_NATIVE_ADMIN_PASSWORD_FILE:"/root/.agentstudio-pg18-secrets/postgres-admin.secret",
  AGENT_STUDIO_PG18_NATIVE_AUTH_LOGIN_PASSWORD_FILE:"/root/.agentstudio-pg18-secrets/native-auth.secret",
}
const base={
  state:{database:"agent_studio",session_user:"postgres",
    server_address:"127.0.0.1",port:5333,version:180000,superuser:true},
  base_tables:23,base_force_rls:22,vector:"0.8.7",ledger:true,
  auth_tables:2,auth_force_rls:2,membership:true,
  business_can_auth:false,worker_can_auth:false,login_can_business:false,
  group_no_login:true,login_no_super:true,activated:false,
  login_password_absent:true,hba_rule:true,local_rule_safe:true,
}
test("offline native activation plan never requires env, secrets, or networking",async()=>{
  const plan=await runNativeActivation(["--plan"],
    {...safeEnv,DATABASE_URL:"postgres://production"})
  assert.deepEqual(plan,{
    mode:"plan",database:"agent_studio",host:"127.0.0.1",port:5333,
    expected_major:18,identity_role:"agentstudio_native_login",
    login_initially_disabled:true,creates_db_tables:false,
    read_only:true,network_used:false,production_cutover_allowed:false,
  })
})
test("activation fails closed on missing authorization, wrong DB or non-Linux users",()=>{
  const activate=["--activate","--confirm-database","agent_studio"]
  const preflight=["--preflight","--confirm-database","agent_studio"]
  for(const args of [[],["--activate"],["--activate","--confirm-database","vcaios"],
    ["--preflight","--confirm-database","postgres"],
    ["--activate","--confirm-database","agent_studio","--retry"]])
    assert.throws(()=>parseNativeActivation(args,safeEnv,"linux",0),
      /invalid_activation_arguments/)
  const noapproval={...safeEnv,AGENT_STUDIO_PG18_NATIVE_ACTIVATION_WRITE_APPROVED:undefined}
  assert.throws(()=>parseNativeActivation(activate,noapproval,"linux",0),
    /activation_write_not_approved/)
  assert.equal(parseNativeActivation(preflight,noapproval,"linux",0).mode,"preflight")
  for(const change of [
    {AGENT_STUDIO_PG18_NATIVE_ACTIVATION_ENABLED:undefined},
    {DATABASE_URL:"postgresql://bad"},
    {PGHOST:"localhost"},
    {PGPORT:"5432"},
  ])assert.throws(()=>parseNativeActivation(preflight,{...safeEnv,...change},"linux",0),
    /activation_disabled/)
  assert.throws(()=>parseNativeActivation(activate,safeEnv,"win32",0),
    /activation_disabled/)
  assert.throws(()=>parseNativeActivation(activate,safeEnv,"linux",1000),
    /activation_disabled/)
  const allowed=parseNativeActivation(activate,safeEnv,"linux",0)
  assert.equal(allowed.database,"agent_studio")
  assert.equal(allowed.serviceFile,safeEnv.AGENT_STUDIO_PG18_NATIVE_AUTH_LOGIN_PASSWORD_FILE)
})
test("every privileged target and auth guard is required before activating",()=>{
  assert.deepEqual(diagnoseNativeSchema(base),{
    ready:true,blockers:[],existing_auth_tables:2,activated:false,
    production_cutover_allowed:false,
  })
  const bad=[
    {state:{...base.state,database:"vcaios"}},
    {state:{...base.state,session_user:"agentstudio_stage_login"}},
    {state:{...base.state,server_address:"127.0.0.2"}},
    {state:{...base.state,port:5432}},
    {state:{...base.state,version:170000}},
    {state:{...base.state,version:190000}},
    {state:{...base.state,superuser:false}},
    {base_tables:0},{base_tables:20},{base_tables:22},
    {base_force_rls:19},{base_force_rls:18},
    {vector:null},{ledger:false},{auth_tables:0},{auth_force_rls:1},
    {membership:false},{business_can_auth:true},{worker_can_auth:true},
    {login_can_business:true},{group_no_login:false},
    {login_no_super:false},{activated:true},{login_password_absent:false},
    {hba_rule:false},{local_rule_safe:false}
  ]
  for(const change of bad){
    const result=diagnoseNativeSchema({...base,...change})
    assert.equal(result.ready,false,JSON.stringify(change))
    assert.ok(result.blockers.length>0)
    assert.equal(result.production_cutover_allowed,false)
  }
  const existing=diagnoseNativeSchema({...base,auth_tables:0,
    auth_force_rls:0,membership:false,login_no_super:null,
    group_no_login:null,login_password_absent:null})
  assert.equal(existing.ready,false)
  assert.ok(existing.blockers.includes("native_auth_migration_not_applied")===false)
  assert.ok(existing.blockers.includes("native_auth_tables_or_rls_missing"))
})
test("actual embedded PostgreSQL preflight remains query-safe BEFORE native role exists",async()=>{
  const db=await PGlite.create({extensions:{vector}})
  try{
    await db.exec("CREATE DATABASE agent_studio")
    await db.exec(freshSchemaForTest().sql)
    await prepareNativeAuthPgliteRoles(db)
    const evidence=await collectNativeActivationEvidenceForTest(db)
    assert.equal(evidence.base_tables,23)
    assert.equal(evidence.base_force_rls,22)
    assert.equal(evidence.auth_tables,0)
    assert.equal(evidence.ledger,false)
    assert.equal(evidence.membership,false)
    assert.equal(evidence.group_no_login,null)
    assert.equal(diagnoseNativeSchema(evidence).ready,false)
    const migration=readFileSync(path.join(root,
      "db/postgres/010_pg18_native_auth_proposed.sql"),"utf8")
    await db.exec(reviewedNativeSqlForEmbeddedTest(migration))
    const after=await collectNativeActivationEvidenceForTest(db)
    assert.equal(after.auth_tables,2)
    assert.equal(after.auth_force_rls,2)
    assert.equal(after.ledger,true)
    assert.equal(after.membership,true)
    assert.equal(after.group_no_login,true)
    assert.equal(after.login_no_super,true)
    assert.equal(after.login_password_absent,true)
    assert.equal(after.activated,false)
    assert.equal(after.business_can_auth,false)
    assert.equal(after.worker_can_auth,false)
    assert.equal(after.hba_rule,false) // PGlite has no operator-authored server rules
    assert.equal(diagnoseNativeSchema(after).ready,false) // PG17, no TCP/HBA

  }finally{await db.close()}
})
test("HBA first-match blocks passwordless local socket and TCP trust",()=>{
  const rule=(rule_number,type,database,user_name,auth_method,address=null,netmask=null)=>({
    rule_number,type,database:[database],user_name:[user_name],
    auth_method,address,netmask,error:null,
  })
  const nativeLocal=rule(5,"local","agent_studio","agentstudio_native_login","reject")
  const nativeHost=rule(8,"host","agent_studio","agentstudio_native_login",
    "scram-sha-256","127.0.0.1","255.255.255.255")
  const broadLocal=rule(12,"local","all","all","trust")
  const otherDb=rule(4,"host","vcaios","vcaios","md5",
    "0.0.0.0","0.0.0.0")
  const safe=verifyNativeHbaOrder([broadLocal,nativeHost,otherDb,nativeLocal])
  assert.deepEqual(safe,{local:true,tcp:true})
  const shadow=verifyNativeHbaOrder([
    {...broadLocal,rule_number:1},nativeLocal,nativeHost
  ])
  assert.deepEqual(shadow,{local:false,tcp:true})
  const broadTcp=rule(2,"host","all","all","trust",
    "0.0.0.0","0.0.0.0")
  assert.deepEqual(verifyNativeHbaOrder([
    nativeLocal,broadLocal,nativeHost,broadTcp
  ]),{local:true,tcp:false})
  assert.deepEqual(verifyNativeHbaOrder([
    nativeLocal,nativeHost,{...otherDb,error:"invalid rule"}
  ]),{local:false,tcp:false})
  assert.deepEqual(verifyNativeHbaOrder([nativeHost,broadLocal]),
    {local:false,tcp:true})
})
test("native activation offline plan uses no TCP even with hostile env",()=>{
  const preload="data:text/javascript,"+encodeURIComponent(
    "import net from 'node:net';"+
    "import {syncBuiltinESMExports} from 'node:module';"+
    "net.Socket.prototype.connect=()=>{throw Error('FORBIDDEN_TCP')};"+
    "syncBuiltinESMExports();")
  const child=spawnSync(process.execPath,["--import",preload,entry,"--plan"],{
    cwd:root,encoding:"utf8",timeout:12000,
    env:{...process.env,DATABASE_URL:"postgres://host/unsafe"}})
  assert.equal(child.status,0,child.stderr)
  assert.equal(JSON.parse(child.stdout).network_used,false)
  assert.doesNotMatch(child.stdout+child.stderr,/FORBIDDEN_TCP|host\/unsafe/)
})

test("native auth SCRAM verifier keeps the login secret out of logged statements",()=>{
  const credential="0123456789abcdef".repeat(5)
  const salt=Buffer.alloc(16,0x73)
  const verifier=makeNativeScramVerifier(credential,salt,15000)
  assert.ok(verifier.startsWith("SCRAM-SHA-256$15000:"))
  assert.equal(verifier.split("$").length,3)
  assert.equal(verifier,makeNativeScramVerifier(credential,salt,15000))
  assert.notEqual(verifier,makeNativeScramVerifier(credential,Buffer.alloc(16,0x75),15000))
  assert.ok(!verifier.includes(credential))
  assert.throws(()=>makeNativeScramVerifier("short"),/independent_high_entropy_secret_required/)
  assert.throws(()=>makeNativeScramVerifier(credential,Buffer.alloc(4)),/invalid_scram_parameters/)
})
test("operator password syntax is sealed, no broad DDL and no DB rebuild",()=>{
  const body=readFileSync(entry,"utf8")
  assert.match(body,/^const activatePassword=/m)
  assert.match(body,/\^\[0-9a-f\]\{80\}/)
  assert.match(body,/password_encryption='scram-sha-256'/)
  assert.match(body,/ALTER ROLE agentstudio_native_login LOGIN PASSWORD/)
  assert.match(body,/native_auth_preflight_not_ready/)
  assert.match(body,/pg_advisory_xact_lock/)
  assert.doesNotMatch(body,/\bDROP DATABASE\b|\bTRUNCATE\b|\bCREATE DATABASE\b|\bCREATE TABLE\b/i)
})
