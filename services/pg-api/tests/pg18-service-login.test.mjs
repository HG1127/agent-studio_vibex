import test from "node:test"
import assert from "node:assert/strict"
import {spawnSync} from "node:child_process"
import {fileURLToPath} from "node:url"
import {preparationFixture as fixture,preparationSnapshot as snapshot,preparationNativePassword as nativePassword} from "./helpers/pg18-preparation-fixture.mjs"
import {verifyFreshRuntime} from "../src/pg18-fresh-runtime-install.ts"
import {reviewedNativeSqlForEmbeddedTest} from "./helpers/native-pg18-embedded.mjs"
import {serviceLoginKinds,serviceLoginDefinition,serviceLoginReceiptVersion,serviceLoginTargetGuardSql} from "../src/pg18-service-login-policy.mjs"
import {serviceLoginVerifier,matchesServiceScram,validateServiceLoginPassword} from "../src/pg18-service-login-secrets.mjs"
import {inspectPreparedServiceLogins,reservePreparedServiceLogin,activatePreparedServiceLogin} from "../src/pg18-service-login-inspector.ts"
import {parseServiceLoginArguments,runServiceLogin,collectPreparedServiceEvidence} from "../src/pg18-service-login-cli.mjs"
import {verifyPg18ServiceHbaOrder,verifyNativeHbaOrder} from "../src/native-activation-cli.mjs"

const passwordFor=k=>String(serviceLoginKinds.indexOf(k)+1).repeat(80)
function rulesFor(login){return [
  {rule_number:1,type:"local",database:["agent_studio"],user_name:[login],auth_method:"reject",error:null},
  {rule_number:2,type:"host",database:["agent_studio"],user_name:[login],auth_method:"scram-sha-256",address:"127.0.0.1",netmask:"255.255.255.255",error:null},
]}
function allRules(){return ["agentstudio_native_login",...serviceLoginKinds.map(k=>serviceLoginDefinition(k).login)].flatMap((login,i)=>rulesFor(login).map(r=>({...r,rule_number:r.rule_number+i*2})))}

test("service plans are offline and operations require exact target, source pin and distinct write authorization",async()=>{
  for(const kind of serviceLoginKinds){const plan=await runServiceLogin(["--plan","--service",kind],{DATABASE_URL:"NEVER_CONNECT"})
    assert.equal(plan.network_used,false);assert.equal(plan.services_started,false);assert.equal(plan.production_cutover_allowed,false);assert.equal(plan.source_sha256,snapshot.source_sha256)}
  const enabled={AGENT_STUDIO_PG18_SERVICE_LOGINS_ENABLED:"true"},preflight=["--preflight","--service","api","--confirm-database","agent_studio"]
  assert.equal(parseServiceLoginArguments(preflight,enabled,"linux",0).read_only,true)
  for(const args of [[],["--plan","--service","__proto__"],["--plan","--service","api","--execute"],preflight.slice(0,3),[...preflight.slice(0,4),"postgres"]])
    assert.throws(()=>parseServiceLoginArguments(args,enabled,"linux",0),/invalid_service_login/)
  for(const env of [{},{...enabled,PGHOST:"127.0.0.1"},{...enabled,DATABASE_URL:"private"}])assert.throws(()=>parseServiceLoginArguments(preflight,env,"linux",0),/operations_disabled/)
  for(const [platform,uid] of [["win32",0],["linux",1000]])assert.throws(()=>parseServiceLoginArguments(preflight,enabled,platform,uid),/operations_disabled/)
  const activate=["--activate",...preflight.slice(1),"--expected-source-sha256",snapshot.source_sha256]
  assert.throws(()=>parseServiceLoginArguments(activate,enabled,"linux",0),/write_not_approved/)
  const reserveEnv={...enabled,AGENT_STUDIO_PG18_SERVICE_LOGIN_WRITE_APPROVED:"APPROVE_PG18_SERVICE_LOGIN_RESERVE_ONLY"}
  assert.throws(()=>parseServiceLoginArguments(activate,reserveEnv,"linux",0),/write_not_approved/)
  assert.equal(parseServiceLoginArguments(["--reserve",...activate.slice(1)],reserveEnv,"linux",0).mode,"reserve")
  const entry=fileURLToPath(new URL("../src/pg18-service-login-cli.mjs",import.meta.url))
  const preload="data:text/javascript,"+encodeURIComponent("import net from 'node:net';import{syncBuiltinESMExports}from'node:module';net.Socket.prototype.connect=()=>{throw Error('FORBIDDEN_SERVICE_TCP')};syncBuiltinESMExports();")
  for(const args of [["--plan","--service","broker"],activate]){
    const child=spawnSync(process.execPath,["--import",preload,entry,...args],{env:{...process.env,DATABASE_URL:"DO_NOT_PRINT_PRIVATE_TARGET",AGENT_STUDIO_PG18_SERVICE_ADMIN_PASSWORD_FILE:"/do-not-read-secret"},encoding:"utf8",timeout:15000,windowsHide:true})
    assert.equal(child.status,args[0]==="--plan"?0:1,child.stderr)
    assert.doesNotMatch(child.stdout+child.stderr,/FORBIDDEN_SERVICE_TCP|DO_NOT_PRINT_PRIVATE_TARGET|do-not-read-secret/)
  }
})

test("independent SCRAM comparison rejects reused credentials without exposing a verifier or plaintext",()=>{
  const password=passwordFor("api"),verifier=serviceLoginVerifier(password)
  assert.equal(matchesServiceScram(password,verifier),true);assert.equal(matchesServiceScram(passwordFor("worker"),verifier),false)
  assert.ok(!verifier.includes(password));assert.equal(validateServiceLoginPassword(password),password)
  for(const invalid of ["short","A".repeat(80),password+"\n","x".repeat(80)])assert.throws(()=>validateServiceLoginPassword(invalid),/independent_service_password_required/)
  for(const invalid of ["md5abcdef","SCRAM-SHA-256$1:aaaa$aaaa:aaaa",verifier.replace("$15000:","$1000001:"),verifier.replace(/.$/,"!")])
    assert.throws(()=>matchesServiceScram(password,invalid),/service_password_state_unexpected/)
})

test("all six prepared logins activate independently after Native Auth and first admin; receipts retain exact source metadata only",async()=>{
  const f=await fixture()
  try{
    await assert.rejects(f.inspect(),/native_auth_activation_required_first/)
    await f.db.exec("ALTER ROLE agentstudio_native_login LOGIN PASSWORD '"+serviceLoginVerifier(nativePassword)+"'")
    await assert.rejects(f.inspect(),/first_native_admin_required/)
    await f.ready()
    for(const kind of serviceLoginKinds){
      const def=serviceLoginDefinition(kind),password=passwordFor(kind)
      await f.transaction(async db=>{const reserved=await reservePreparedServiceLogin(db,kind,snapshot)
        assert.equal(reserved.created,!["api","worker"].includes(kind));assert.equal(reserved.login,def.login)})
      await assert.rejects(f.transaction(db=>activatePreparedServiceLogin(db,kind,snapshot,nativePassword)),/password_reused/)
      if(kind!=="api")await assert.rejects(f.transaction(db=>activatePreparedServiceLogin(db,kind,snapshot,passwordFor("api"))),/password_reused/)
      const result=await f.transaction(db=>activatePreparedServiceLogin(db,kind,snapshot,password))
      assert.equal(result.activated,true);assert.equal(result.services_started,false);assert.equal(result.production_cutover_allowed,false)
      assert.doesNotMatch(JSON.stringify(result),new RegExp(password+"|SCRAM-SHA-256"))
      const state=await f.inspect();assert.equal(state.roles.get(def.login).login,true)
      assert.equal(state.receipts.find(r=>r.kind===kind)?.source_sha256,snapshot.source_sha256)
      await assert.rejects(f.transaction(db=>reservePreparedServiceLogin(db,kind,snapshot)),/already_activated/)
      await assert.rejects(f.transaction(db=>activatePreparedServiceLogin(db,kind,snapshot,password)),/already_activated/)
    }
    const state=await f.inspect();assert.equal(state.receipts.length,6)
    for(const receipt of state.receipts){assert.deepEqual(Object.keys(receipt).sort(),["format","kind","login","groups","source_sha256","operator","activated_at"].sort());assert.equal(receipt.operator,"postgres")}
    await assert.rejects(f.rollback(db=>verifyFreshRuntime(db,snapshot,true)),/fresh_runtime_verification_failed/)
    await f.rollback(async db=>{await db.query("ALTER ROLE agentstudio_stage_login NOLOGIN");await assert.rejects(inspectPreparedServiceLogins(db,snapshot),/unsafe_service_login_catalog/)})
  }finally{await f.close()}
})

test("service catalog inspection refuses expanded role options, direct grants, altered schema receipts and unsafe helpers",async()=>{
  const f=await fixture()
  try{
    await f.ready()
    for(const sql of [
      "GRANT pg_read_all_data TO agentstudio_stage_login",
      "GRANT agentstudio_api TO agentstudio_stage_login WITH ADMIN TRUE",
      "GRANT agentstudio_api TO agentstudio_stage_login WITH INHERIT TRUE",
      "GRANT agentstudio_api TO agentstudio_stage_login WITH SET FALSE",
      "ALTER ROLE agentstudio_stage_worker INHERIT",
      "ALTER ROLE agentstudio_stage_login SET search_path='public'",
      "ALTER ROLE agentstudio_stage_login VALID UNTIL '2030-01-01'",
      "GRANT SELECT ON agentstudio.users TO agentstudio_stage_login",
      "GRANT USAGE ON SCHEMA agentstudio TO agentstudio_stage_login",
      "GRANT CREATE ON DATABASE postgres TO agentstudio_stage_login", // PGlite's actual current_database()
      "GRANT EXECUTE ON FUNCTION agentstudio.knowledge_keyword_snapshot(uuid[],text) TO agentstudio_stage_login",
      "GRANT SELECT(api_key_ciphertext) ON agentstudio.model_connections TO agentstudio_api",
      "ALTER TABLE agentstudio.workflow_sample_lineage NO FORCE ROW LEVEL SECURITY",
      "UPDATE agentstudio.schema_migrations SET description='{}' WHERE version='pg18_fresh_runtime_001'",
      "INSERT INTO agentstudio.schema_migrations(version,description) VALUES('pg18_service_login_unreviewed_001','{}')",
      "ALTER ROLE agentstudio_stage_login LOGIN",
      "GRANT SELECT ON agentstudio.workflow_sample_lineage TO agentstudio_api",
    ])await f.rollback(async db=>{await db.query(sql);await assert.rejects(inspectPreparedServiceLogins(db,snapshot),/unsafe_|verification_failed|invalid_service_login_receipt/,sql)})
    await f.inspect()
  }finally{await f.close()}
})

test("a failure between LOGIN and audit insert rolls back role reservation, password and receipt, then permits a clean retry",async()=>{
  const f=await fixture(),kind="identity",def=serviceLoginDefinition(kind)
  try{
    await f.ready()
    await assert.rejects(f.transaction(async db=>{
      await reservePreparedServiceLogin(db,kind,snapshot)
      const injected={query(sql,args=[]){if(sql.startsWith("INSERT INTO agentstudio.schema_migrations"))throw Error("synthetic_service_receipt_failure");return db.query(sql,args)}}
      await activatePreparedServiceLogin(injected,kind,snapshot,passwordFor(kind))
    }),/synthetic_service_receipt_failure/)
    assert.equal((await f.inspect()).roles.has(def.login),false)
    assert.equal((await f.db.query("SELECT count(*)::int AS n FROM agentstudio.schema_migrations WHERE version=$1",[serviceLoginReceiptVersion(kind)])).rows[0].n,0)
    await f.transaction(async db=>{await reservePreparedServiceLogin(db,kind,snapshot);await activatePreparedServiceLogin(db,kind,snapshot,passwordFor(kind))})
    for(const sql of [
      "UPDATE agentstudio.schema_migrations SET description=jsonb_set(description::jsonb,'{source_sha256}','\""+"0".repeat(64)+"\"')::text WHERE version='pg18_service_login_identity_001'",
      "UPDATE agentstudio.schema_migrations SET description=(description::jsonb||'{\"password\":\"forbidden\"}'::jsonb)::text WHERE version='pg18_service_login_identity_001'",
      "DELETE FROM agentstudio.schema_migrations WHERE version='pg18_service_login_identity_001'",
    ])await f.rollback(async db=>{await db.query(sql);await assert.rejects(inspectPreparedServiceLogins(db,snapshot),/invalid_service_login_receipt|unsafe_service_login_catalog/)})
  }finally{await f.close()}
})

test("HBA checks honor earlier regex, include, group, hostname and non-GSS TCP rules for every fixed service",()=>{
  for(const login of ["agentstudio_native_login",...serviceLoginKinds.map(k=>serviceLoginDefinition(k).login)]){
    const safe=rulesFor(login).map(r=>({...r,rule_number:r.rule_number+10}))
    assert.deepEqual(verifyPg18ServiceHbaOrder(safe,login),{local:true,tcp:true})
    for(const [database,user] of [["/^agent_.*$",login],["@databases",login],["agent_studio","/^agentstudio_"],["agent_studio","@users"],["samerole","+service_group"]]){
      const shadow={...safe[0],rule_number:1,database:[database],user_name:[user],auth_method:"trust"}
      assert.deepEqual(verifyPg18ServiceHbaOrder([shadow,...safe],login),{local:false,tcp:true})
      assert.deepEqual(verifyPg18ServiceHbaOrder([{...shadow,type:"hostnogssenc",address:"samehost"},...safe],login),{local:true,tcp:false})
    }
    assert.deepEqual(verifyPg18ServiceHbaOrder([{...safe[1],rule_number:1,auth_method:"trust",address:"localhost"},...safe],login),{local:true,tcp:false})
    for(const invalid of [[...safe,{...safe[0]}],[{...safe[0],type:"include"},safe[1]],[{...safe[0],rule_number:null},safe[1]]])
      assert.deepEqual(verifyPg18ServiceHbaOrder(invalid,login),{local:false,tcp:false})
  }
  assert.deepEqual(verifyNativeHbaOrder(rulesFor("agentstudio_native_login")),{local:true,tcp:true})
  assert.deepEqual(verifyPg18ServiceHbaOrder(allRules(),"postgres"),{local:false,tcp:false})
})

test("service preflight checks Native and all active HBA guards and refuses live connections without writes",async()=>{
  const f=await fixture()
  try{
    await f.ready();await f.transaction(async db=>{await reservePreparedServiceLogin(db,"api",snapshot);await activatePreparedServiceLogin(db,"api",snapshot,passwordFor("api"))})
    const probe=(rules,count=0)=>({query(sql,args=[]){
      if(sql.includes("FROM pg_hba_file_rules"))return Promise.resolve({rows:rules})
      if(sql.includes("FROM pg_catalog.pg_stat_activity"))return Promise.resolve({rows:[{count}]})
      return f.api.query(sql,args)
    }})
    const report=await f.rollback(()=>collectPreparedServiceEvidence(probe(allRules()),snapshot,"identity"))
    assert.equal(report.reserved,false);assert.equal(report.activated,false);assert.equal(report.ready_to_reserve,true);assert.equal(report.ready_to_activate,false)
    for(const missing of ["agentstudio_native_login","agentstudio_stage_login","agentstudio_bound_dispatch_login"])
      await assert.rejects(f.rollback(()=>collectPreparedServiceEvidence(probe(allRules().filter(r=>!r.user_name.includes(missing))),snapshot,"identity")),/hba_not_ready/)
    await assert.rejects(f.rollback(()=>collectPreparedServiceEvidence(probe(allRules(),1),snapshot,"identity")),/connections_present/)
    await assert.rejects(f.db.exec(serviceLoginTargetGuardSql),/service_login_target_not_approved/)
    // Even after replacing the five embedded target predicates, a connection
    // without the real server-side IPv4 loopback address must still refuse.
    await assert.rejects(f.db.exec(reviewedNativeSqlForEmbeddedTest(serviceLoginTargetGuardSql)),/service_login_target_not_approved/)
    assert.equal((await f.inspect()).roles.has("agentstudio_bound_dispatch_login"),false)
  }finally{await f.close()}
})
