import test from "node:test"
import assert from "node:assert/strict"
import {spawnSync} from "node:child_process"
import {fileURLToPath} from "node:url"
import {randomUUID} from "node:crypto"
import {preparationFixture,preparationSnapshot as snapshot} from "./helpers/pg18-preparation-fixture.mjs"
import {runtimePreparationStages,inspectRuntimePreparationStage} from "../src/pg18-runtime-postcheck.ts"
import {serviceLoginKinds,serviceLoginDefinition} from "../src/pg18-service-login-policy.mjs"
import {reservePreparedServiceLogin,activatePreparedServiceLogin} from "../src/pg18-service-login-inspector.ts"
import {parseRuntimePostcheck,runRuntimePostcheck,inspectRuntimePreparationWithPool} from "../src/pg18-runtime-postcheck-cli.mjs"

function rules(){return ["agentstudio_native_login",...serviceLoginKinds.map(k=>serviceLoginDefinition(k).login)].flatMap((login,i)=>[
  {rule_number:i*2+1,type:"local",database:["agent_studio"],user_name:[login],auth_method:"reject",error:null},
  {rule_number:i*2+2,type:"host",database:["agent_studio"],user_name:[login],auth_method:"scram-sha-256",address:"127.0.0.1",netmask:"255.255.255.255",error:null},
])}
function evidence(f,options={}){
  const commands=[];let releases=0,hbaReads=0
  const pool={async connect(){return {async query(sql,args=[]){
    commands.push(sql)
    if(sql.includes("FROM pg_hba_file_rules")){hbaReads++;return {rows:options.rules??rules()}}
    if(sql.includes("FROM pg_catalog.pg_stat_activity"))return {rows:[{count:options.connected??0}]}
    return f.api.query(sql,args)
  },release(){releases++}}}}
  return {check:stage=>inspectRuntimePreparationWithPool(pool,snapshot,stage),commands,get releases(){return releases},get hbaReads(){return hbaReads}}
}
async function prepareAll(f){for(const [index,kind] of serviceLoginKinds.entries())await f.transaction(async db=>{
  await reservePreparedServiceLogin(db,kind,snapshot);await activatePreparedServiceLogin(db,kind,snapshot,String(index+1).repeat(80))
})}

test("all postcheck plans are offline; exact stage, target, source pin and Linux root opt-in are mandatory for inspection",async()=>{
  for(const stage of runtimePreparationStages){const plan=await runRuntimePostcheck(["--plan","--stage",stage],{DATABASE_URL:"DO_NOT_USE"})
    assert.equal(plan.network_used,false);assert.equal(plan.read_only,true);assert.equal(plan.writes_performed,false);assert.equal(plan.production_cutover_allowed,false);assert.equal(plan.source_sha256,snapshot.source_sha256)}
  const args=["--preflight","--stage","initialized","--confirm-database","agent_studio","--expected-source-sha256",snapshot.source_sha256]
  const env={AGENT_STUDIO_PG18_RUNTIME_POSTCHECK_ENABLED:"true"}
  assert.equal(parseRuntimePostcheck(args,env,"linux",0).stage,"initialized")
  for(const bad of [[],["--activate",...args.slice(1)],["--plan","--stage","unknown"],["--plan","--stage","first-admin","--execute"],args.slice(0,5),[...args.slice(0,4),"postgres",...args.slice(5)]])
    assert.throws(()=>parseRuntimePostcheck(bad,env,"linux",0),/invalid_runtime_postcheck/)
  for(const change of [{},{...env,PGOPTIONS:"unsafe"},{...env,DATABASE_URL:"private"}])assert.throws(()=>parseRuntimePostcheck(args,change,"linux",0),/runtime_postcheck_disabled/)
  for(const [platform,uid] of [["win32",0],["linux",1000]])assert.throws(()=>parseRuntimePostcheck(args,env,platform,uid),/runtime_postcheck_disabled/)
  const preload="data:text/javascript,"+encodeURIComponent("import net from 'node:net';import{syncBuiltinESMExports}from'node:module';net.Socket.prototype.connect=()=>{throw Error('FORBIDDEN_POSTCHECK_TCP')};syncBuiltinESMExports();")
  const cli=fileURLToPath(new URL("../src/pg18-runtime-postcheck-cli.mjs",import.meta.url))
  for(const argv of [["--plan","--stage","service-logins"],args]){
    const child=spawnSync(process.execPath,["--import",preload,cli,...argv],{env:{...process.env,DATABASE_URL:"PRIVATE_TARGET_MUST_NOT_APPEAR",AGENT_STUDIO_PG18_RUNTIME_POSTCHECK_ADMIN_PASSWORD_FILE:"/never-read-credential"},encoding:"utf8",timeout:15000,windowsHide:true})
    assert.equal(child.status,argv[0]==="--plan"?0:1,child.stderr)
    assert.doesNotMatch(child.stdout+child.stderr,/FORBIDDEN_POSTCHECK_TCP|PRIVATE_TARGET_MUST_NOT_APPEAR|never-read-credential/)
  }
})

test("four genuine preparation stages are distinct, metadata-only and verified in repeatable read snapshots with rollback",async()=>{
  const f=await preparationFixture(),probe=evidence(f)
  try{
    const initial=await probe.check("initialized")
    assert.equal(initial.stage_verified,true);assert.equal(initial.tables,62);assert.equal(initial.forced_rls_tables,61);assert.equal(initial.source_versions,36)
    assert.equal(initial.hba_checked,false);assert.equal(probe.hbaReads,0);assert.equal(initial.native_login_enabled,false)
    await assert.rejects(probe.check("native-login"),/native_auth_activation_required_first/)
    await f.enableNative()
    const native=await probe.check("native-login");assert.equal(native.local_admins,0);assert.equal(native.native_login_enabled,true);assert.equal(native.hba_verified,true)
    await assert.rejects(probe.check("initialized"),/native_auth_login_must_remain_disabled/)
    await assert.rejects(probe.check("first-admin"),/runtime_preparation_stage_not_verified/)
    await f.provisionAdmin()
    const first=await probe.check("first-admin");assert.equal(first.local_admins,1);assert.equal(first.enabled_service_logins,0)
    await assert.rejects(probe.check("native-login"),/runtime_preparation_stage_not_verified/)
    await assert.rejects(probe.check("service-logins"),/runtime_preparation_stage_not_verified/)
    await prepareAll(f)
    const services=await probe.check("service-logins");assert.equal(services.service_activation_receipts,6);assert.equal(services.enabled_service_logins,6)
    assert.equal(services.service_connections_absent,true);assert.equal(services.scope,"database_preparation_stage_only");assert.equal(services.production_cutover_allowed,false)
    assert.doesNotMatch(JSON.stringify(services),/synthetic-admin|password|SCRAM|SyntheticServiceAdmin/)
    await assert.rejects(probe.check("first-admin"),/runtime_preparation_stage_not_verified/)
    assert.equal(probe.commands.filter(x=>x==="BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY").length,probe.releases)
    assert.equal(probe.commands.filter(x=>x==="ROLLBACK").length,probe.releases)
    assert.equal(probe.commands.includes("COMMIT"),false)
    assert.equal((await f.db.query("SELECT current_user AS role")).rows[0].role,"postgres")
  }finally{await f.close()}
})

test("postcheck refuses read-write or weaker isolation and does not leave a transaction or changed role behind on failure",async()=>{
  const f=await preparationFixture()
  try{
    for(const begin of ["BEGIN","BEGIN READ ONLY"]){await f.db.exec(begin)
      try{await assert.rejects(inspectRuntimePreparationStage(f.api,snapshot,"initialized"),/readonly_snapshot_required/)}finally{await f.db.exec("ROLLBACK")}}
    const probe=evidence(f)
    await assert.rejects(probe.check("first-admin"),/native_auth_activation_required_first/)
    assert.equal(probe.commands.at(-1),"ROLLBACK");assert.equal(probe.releases,1)
    assert.equal((await f.db.query("SELECT current_setting('transaction_read_only') AS state")).rows[0].state,"off")
    await f.db.exec("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY")
    try{await assert.rejects(f.db.query("INSERT INTO agentstudio.users(external_issuer,external_subject,display_name) VALUES('synthetic','forbidden','forbidden')"),/read-only transaction/)}finally{await f.db.exec("ROLLBACK")}
  }finally{await f.close()}
})

test("first-admin postcheck detects extra data, account/session state, RLS, role and source-receipt drift instead of accepting counts alone",async()=>{
  const f=await preparationFixture(),probe=evidence(f),extra=randomUUID()
  try{
    await f.ready();await probe.check("first-admin")
    const receipt=(await f.db.query("SELECT description FROM agentstudio.schema_migrations WHERE version='pg18_fresh_runtime_001'")).rows[0].description
    for(const [before,after] of [
      ["ALTER ROLE agentstudio_stage_worker INHERIT","ALTER ROLE agentstudio_stage_worker NOINHERIT"],
      ["GRANT pg_read_all_data TO agentstudio_stage_login","REVOKE pg_read_all_data FROM agentstudio_stage_login"],
      ["ALTER TABLE agentstudio.workflow_sample_lineage NO FORCE ROW LEVEL SECURITY","ALTER TABLE agentstudio.workflow_sample_lineage FORCE ROW LEVEL SECURITY"],
      ["ALTER TABLE agentstudio.schema_migrations ENABLE ROW LEVEL SECURITY","ALTER TABLE agentstudio.schema_migrations DISABLE ROW LEVEL SECURITY"],
      ["ALTER TABLE agentstudio.schema_migrations FORCE ROW LEVEL SECURITY","ALTER TABLE agentstudio.schema_migrations NO FORCE ROW LEVEL SECURITY"],
      ["UPDATE agentstudio_auth.accounts SET failed_attempts=1","UPDATE agentstudio_auth.accounts SET failed_attempts=0"],
      ["UPDATE agentstudio_auth.accounts SET enabled=false","UPDATE agentstudio_auth.accounts SET enabled=true"],
      ["UPDATE agentstudio_auth.accounts SET locked_until=now()","UPDATE agentstudio_auth.accounts SET locked_until=NULL"],
      ["INSERT INTO agentstudio.users(id,external_issuer,external_subject,display_name) VALUES('"+extra+"','synthetic','second-user','Synthetic extra')","DELETE FROM agentstudio.users WHERE id='"+extra+"'"],
      ["INSERT INTO agentstudio.audit_events(owner_user_id,actor_user_id,action,target_kind,target_id,result) SELECT id,id,'synthetic','test','none','succeeded' FROM agentstudio.users","DELETE FROM agentstudio.audit_events WHERE action='synthetic'"],
    ]){await f.api.query(before);try{await assert.rejects(probe.check("first-admin"),/unsafe_|stage_not_verified|verification_failed/,before)}finally{await f.api.query(after)}}
    await f.db.exec("UPDATE agentstudio.schema_migrations SET description='{}' WHERE version='pg18_fresh_runtime_001'")
    try{await assert.rejects(probe.check("first-admin"),/verification_failed/)}finally{await f.db.query("UPDATE agentstudio.schema_migrations SET description=$1 WHERE version='pg18_fresh_runtime_001'",[receipt])}
    await f.store.login("synthetic-admin@example.test","SyntheticServiceAdmin#2026")
    await assert.rejects(probe.check("first-admin"),/stage_not_verified/)
    await f.db.exec("DELETE FROM agentstudio_auth.sessions")
    await probe.check("first-admin")
  }finally{await f.close()}
})

test("stage evidence requires ordered HBA for every enabled login and zero runtime connections",async()=>{
  const f=await preparationFixture()
  try{
    await f.ready()
    await assert.rejects(evidence(f,{rules:[]}).check("first-admin"),/hba_not_ready/)
    await assert.rejects(evidence(f,{connected:1}).check("first-admin"),/connections_present/)
    await prepareAll(f)
    for(const login of ["agentstudio_native_login",...serviceLoginKinds.map(k=>serviceLoginDefinition(k).login)]){
      const filtered=rules().filter(r=>!r.user_name.includes(login))
      await assert.rejects(evidence(f,{rules:filtered}).check("service-logins"),/hba_not_ready/)
    }
    await evidence(f).check("service-logins")
  }finally{await f.close()}
})
