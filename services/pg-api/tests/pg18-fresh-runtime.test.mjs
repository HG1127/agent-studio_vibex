import test from "node:test"
import assert from "node:assert/strict"
import {readFileSync} from "node:fs"
import {spawnSync} from "node:child_process"
import {fileURLToPath} from "node:url"
import {PGlite} from "@electric-sql/pglite"
import {vector} from "@electric-sql/pglite-pgvector"
import {captureFreshRuntimeSources,freshRuntimePlan,freshRuntimeSqlBody,freshRuntimeReceipt,freshRuntimeRoles} from "../src/pg18-fresh-runtime-source.mjs"
import {runRuntimeInit} from "../src/baota-pg18-runtime-init.mjs"
import {installFreshRuntime,verifyFreshRuntime} from "../src/pg18-fresh-runtime-install.ts"
import {loginSqlForTest,verifyFreshForTest} from "../src/baota-pg18-fresh-init.mjs"
import {reviewedNativeSqlForEmbeddedTest} from "./helpers/native-pg18-embedded.mjs"
import {collectNativeActivationEvidenceForTest,diagnoseNativeSchema} from "../src/native-activation-cli.mjs"
const snapshot=captureFreshRuntimeSources()
async function fixture(){
  const db=await PGlite.create({extensions:{vector}});await db.exec("CREATE DATABASE agent_studio")
  const api={async query(sql,values=[]){
    const copy=sql===snapshot.steps[0].sql?reviewedNativeSqlForEmbeddedTest(sql):sql
    return values.length?db.query(copy,values):(await db.exec(copy)).at(-1)??{rows:[]}
  }}
  async function baseline(){
    await db.exec("BEGIN; SET LOCAL password_encryption='scram-sha-256'");await db.exec(snapshot.baseline.sql)
    for(const [name,value] of [["api","SyntheticFreshApi0123456789abcdefghijklmnopqrstuvwxyz"],["worker","SyntheticFreshWorker0123456789abcdefghijklmnopqrstuvwxyz"]])
      await db.query("SELECT set_config($1,$2,true)",["agentstudio.bootstrap_"+name+"_password",value])
    await db.exec(loginSqlForTest);await verifyFreshForTest(db)
  }
  return {db,api,baseline,async verify(){await db.exec("BEGIN");try{return await verifyFreshRuntime(api,snapshot,true)}finally{await db.exec("ROLLBACK")}},close:()=>db.close()}
}

test("full fresh plan captures the genuine 019..046 path, source hashes and disabled login result without a fabricated predecessor",async()=>{
  const plan=await runRuntimeInit(["--plan"],{DATABASE_URL:"DO_NOT_USE",AGENT_STUDIO_BAOTA_PG_ADMIN_PASSWORD_FILE:"/do-not-read"})
  assert.equal(plan.source_sha256,snapshot.source_sha256);assert.equal(plan.network_used,false);assert.equal(plan.atomic,true);assert.equal(plan.sources.length,30)
  assert.equal(plan.service_logins_enabled,false);assert.equal(plan.production_cutover_allowed,false)
  assert.equal(plan.migration_versions.length,32);assert.equal(plan.sources[2].version,"pg_v9_019");assert.equal(plan.sources.at(-1).version,"pg_v9_046")
  assert.ok(plan.migration_versions.includes("pg_v9_022"));assert.ok(!plan.migration_versions.includes("pg_v8_002"))
  assert.equal(plan.legacy_import_versions_fabricated,false);assert.doesNotMatch(JSON.stringify(plan),/DO_NOT_USE|do-not-read|CREATE ROLE|password_record/)
  assert.deepEqual(plan,freshRuntimePlan(snapshot))
  for(const invalid of [[],["--execute"],["--plan","--force"],["--execute","--confirm-empty-database","postgres","--expected-source-sha256",snapshot.source_sha256]])
    await assert.rejects(runRuntimeInit(invalid),/invalid_runtime_init_arguments/)
  await assert.rejects(runRuntimeInit(["--execute","--confirm-empty-database","agent_studio","--expected-source-sha256","0".repeat(64)]),/runtime_init_source_changed/)
  await assert.rejects(runRuntimeInit(["--execute","--confirm-empty-database","agent_studio","--expected-source-sha256",snapshot.source_sha256],{}),/runtime_init_not_approved/)
})

test("one new-database transaction installs genuine schemas, empty business tables, least privileges, disabled logins and a source receipt",async()=>{
  const f=await fixture()
  try{
    await f.baseline();const result=await installFreshRuntime(f.api,snapshot);await f.db.exec("COMMIT")
    assert.equal(result.migration_versions,32);assert.equal(result.roles,22);assert.equal(result.service_logins_enabled,false);assert.equal(result.knowledge_privileges_verified,true)
    assert.equal(result.tables,snapshot.tables.length);assert.equal(result.empty_business_tables,snapshot.tables.length-1)
    assert.deepEqual(await f.verify(),result)
    const versions=(await f.db.query("SELECT version,description FROM agentstudio.schema_migrations ORDER BY version")).rows
    assert.equal(versions.length,33);assert.ok(versions.some(r=>r.version==="pg_v9_022"&&r.description.startsWith("Inert-only")))
    assert.equal(versions.some(r=>/synthetic|fake|predecessor/i.test(r.description)),false)
    const receipt=JSON.parse(versions.find(r=>r.version===freshRuntimeReceipt).description)
    assert.equal(receipt.source_sha256,snapshot.source_sha256);assert.equal(receipt.sources.length,30)
    assert.doesNotMatch(JSON.stringify(receipt),/SyntheticFresh|SCRAM|password_file|ciphertext|lease_token/)
    assert.equal((await f.db.query("SELECT count(*)::int AS n FROM pg_roles WHERE rolname=ANY($1::text[]) AND rolcanlogin",[freshRuntimeRoles])).rows[0].n,0)
    await f.db.exec("BEGIN");try{await assert.rejects(installFreshRuntime(f.api,snapshot),/native_auth_requires_reviewed_pg18_baseline/)}finally{await f.db.exec("ROLLBACK")}
    assert.deepEqual(await f.verify(),result)
  }finally{await f.close()}
})

test("failure deep in the runtime chain rolls back baseline, global roles and receipts; a clean retry succeeds",async()=>{
  const f=await fixture()
  try{
    await f.baseline()
    const broken={query(sql,args=[]){if(sql===snapshot.steps.find(s=>s.version==="pg_v9_041").sql)throw Error("injected_after_semantic_schema");return f.api.query(sql,args)}}
    await assert.rejects(installFreshRuntime(broken,snapshot),/injected_after_semantic_schema/);await f.db.exec("ROLLBACK")
    assert.equal((await f.db.query("SELECT to_regnamespace('agentstudio') AS schema")).rows[0].schema,null)
    assert.equal((await f.db.query("SELECT count(*)::int AS n FROM pg_roles WHERE rolname=ANY($1::text[])",[freshRuntimeRoles])).rows[0].n,0)
    await f.baseline();await installFreshRuntime(f.api,snapshot);await f.db.exec("COMMIT");assert.equal((await f.verify()).migration_versions,32)
  }finally{await f.close()}
})

test("post-install verification refuses login activation, private privilege drift, RLS loss, receipt edits, fabricated history and nonempty business data",async()=>{
  const f=await fixture()
  try{
    await f.baseline();await installFreshRuntime(f.api,snapshot);await f.db.exec("COMMIT")
    for(const sql of ["ALTER ROLE agentstudio_stage_worker LOGIN","GRANT SELECT(api_key_ciphertext) ON agentstudio.model_connections TO agentstudio_api",
      "ALTER TABLE agentstudio.workflow_sample_lineage NO FORCE ROW LEVEL SECURITY","UPDATE agentstudio.schema_migrations SET description='{}' WHERE version='pg18_fresh_runtime_001'",
      "INSERT INTO agentstudio.schema_migrations(version,description) VALUES('pg_v8_002','not actually applied')",
      "INSERT INTO agentstudio.users(external_issuer,external_subject) VALUES('https://fresh.test','nonempty')",
      "CREATE TABLE agentstudio.unreviewed_table(id integer)"]){
      await f.db.exec("BEGIN");try{await f.db.exec(sql);await assert.rejects(verifyFreshRuntime(f.api,snapshot,true),/fresh_runtime_verification_failed/)}finally{await f.db.exec("ROLLBACK")}
    }
    assert.equal((await f.verify()).service_logins_enabled,false)
  }finally{await f.close()}
})

test("SQL body extraction retains every internal guard and refuses unknown metacommands or transaction shape",()=>{
  const original=readFileSync(new URL("../../../db/postgres/010_pg18_native_auth_proposed.sql",import.meta.url),"utf8")
  const body=freshRuntimeSqlBody(original)
  for(const guard of ["current_database() <> 'agent_studio'","session_user <> 'postgres'","current_setting('port')::integer <> 5333","current_setting('server_version_num')::int < 180000"])
    assert.ok(body.includes(guard))
  for(const wrong of [original+"\nCOMMIT;",original.replace("COMMIT;",""),"\\include other.sql\n"+original])assert.throws(()=>freshRuntimeSqlBody(wrong),/fresh_runtime_sql_format_changed/)
})

test("Native activation recognizes the exact empty full runtime receipt without relaxing target, HBA, role or source guards",async()=>{
  const f=await fixture()
  const state={database:"agent_studio",session_user:"postgres",server_address:"127.0.0.1",port:5333,version:180000,superuser:true}
  const rules=[{rule_number:1,type:"local",database:["agent_studio"],user_name:["agentstudio_native_login"],auth_method:"reject",address:null,netmask:null,error:null},
    {rule_number:2,type:"host",database:["agent_studio"],user_name:["agentstudio_native_login"],auth_method:"scram-sha-256",address:"127.0.0.1",netmask:"255.255.255.255",error:null}]
  const probe={query(sql,args=[]){if(sql.includes("host(inet_server_addr())"))return Promise.resolve({rows:[state]})
    if(sql.includes("FROM pg_hba_file_rules"))return Promise.resolve({rows:rules});return f.api.query(sql,args)}}
  try{
    await f.baseline();await installFreshRuntime(f.api,snapshot);await f.db.exec("COMMIT")
    await f.db.exec("BEGIN READ ONLY")
    let evidence
    try{evidence=await collectNativeActivationEvidenceForTest(probe)}finally{await f.db.exec("ROLLBACK")}
    assert.deepEqual(evidence.fresh_runtime,{verified:true});assert.equal(evidence.base_tables,51);assert.equal(evidence.base_force_rls,50)
    assert.equal(diagnoseNativeSchema(evidence).ready,true)
    for(const change of [{fresh_runtime:{verified:false}},{fresh_runtime:undefined},{base_tables:45},{base_force_rls:42},{state:{...state,port:5432}},{hba_rule:false},{local_rule_safe:false},{activated:true},{business_can_auth:true}])
      assert.equal(diagnoseNativeSchema({...evidence,...change}).ready,false)
    for(const sql of ["UPDATE agentstudio.schema_migrations SET description='{}' WHERE version='pg18_fresh_runtime_001'",
      "ALTER ROLE agentstudio_stage_worker LOGIN","CREATE TABLE agentstudio.unreviewed(id integer)"]){
      await f.db.exec("BEGIN");try{await f.db.exec(sql);const invalid=await collectNativeActivationEvidenceForTest(probe)
        assert.deepEqual(invalid.fresh_runtime,{verified:false});assert.equal(diagnoseNativeSchema(invalid).ready,false)
      }finally{await f.db.exec("ROLLBACK")}
    }
  }finally{await f.close()}
})

test("offline runtime CLI cannot connect or read poisoned password paths and default execution refuses without any target contact",()=>{
  const entry=new URL("../src/baota-pg18-runtime-init.mjs",import.meta.url)
  const preload="data:text/javascript,"+encodeURIComponent("import net from 'node:net';import {syncBuiltinESMExports} from 'node:module';net.Socket.prototype.connect=()=>{throw Error('FORBIDDEN_RUNTIME_TCP')};syncBuiltinESMExports();")
  const env={...process.env,DATABASE_URL:"NEVER_CONNECT_PRODUCTION",AGENT_STUDIO_BAOTA_PG_ADMIN_PASSWORD_FILE:"/missing-private-password"}
  const plan=spawnSync(process.execPath,["--import",preload,fileURLToPath(entry),"--plan"],{env,encoding:"utf8",timeout:15000})
  assert.equal(plan.status,0,plan.stderr);assert.equal(JSON.parse(plan.stdout).network_used,false)
  assert.doesNotMatch(plan.stdout+plan.stderr,/FORBIDDEN_RUNTIME_TCP|NEVER_CONNECT_PRODUCTION|missing-private-password/)
})
