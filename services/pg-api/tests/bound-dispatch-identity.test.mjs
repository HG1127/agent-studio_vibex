// Disposable, embedded PostgreSQL role+identity fence tests.
// No TCP, API keys, external providers, PocketBase or company databases.
import test from "node:test"
import assert from "node:assert/strict"
import {readFileSync} from "node:fs"
import path from "node:path"
import {fileURLToPath} from "node:url"
import {PGlite} from "@electric-sql/pglite"
import {vector} from "@electric-sql/pglite-pgvector"

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../../..")
const sql=relative=>readFileSync(path.join(root,relative),"utf8")
  .split(/\r?\n/).filter(line=>!line.trim().startsWith("\\")).join("\n")
const schema=sql("db/postgres/001_stage_schema.sql")
const migration=sql("db/postgres/migrations/pg_v9_024_bound_dispatch_identity.sql")
const workflowUpgrade=sql("db/postgres/migrations/pg_v9_023_workflow_safe_worker.sql")
const leaseToken="9a14acc6-c4fe-48b0-bc38-fab610635d20"
const issuer="https://synthetic-worker-lease.invalid"
async function fixture(){
  const db=await PGlite.create({extensions:{vector}})
  await db.exec(schema)
  // Exact synthetic predecessor ledger: the fresh schema already contains
  // the required workflow_tick kind, but this does NOT apply a real migration.
  await db.query(
    "INSERT INTO agentstudio.schema_migrations(version,description) "+
    "VALUES('pg_v9_023','synthetic reviewed prior baseline')")
  await db.exec(migration)
  const users={}
  for(const name of ["alice","bob"]){
    users[name]=(await db.query(
      "INSERT INTO agentstudio.users(external_issuer,external_subject,status) "+
      "VALUES($1,$2,'active') RETURNING id",[issuer,name])).rows[0].id
  }
  const spec=(await db.query(
    "INSERT INTO agentstudio.agent_specs(owner_user_id,name,spec) "+
    "VALUES($1::uuid,'synthetic owner-bound Agent',$2::jsonb) RETURNING id",
    [users.alice,JSON.stringify({goal:"Synthetic only",model_binding:{
      connection_id:"8b365fab-7fcf-49fb-bf2a-a8a1bb80c48e",
      connection_revision:1,model_id:"gpt-4.1-mini",
    }})])).rows[0]
  const run=(await db.query(
    "INSERT INTO agentstudio.runs(owner_user_id,kind,agent_spec_id,status,"+
    "instruction,checkpoint) VALUES($1::uuid,'agent',$2::uuid,'running',"+
    "'Synthetic request',$3::jsonb) RETURNING id",
    [users.alice,spec.id,JSON.stringify({stage:"model_running",spec_revision:1})]
  )).rows[0]
  const job=(await db.query(
    "INSERT INTO agentstudio.jobs(owner_user_id,run_id,kind,dedupe_key,"+
    "status,payload,lease_owner,lease_token,lease_version,lease_until) "+
    "VALUES($1::uuid,$2::uuid,'run_tick','synthetic:dispatch','leased',"+
    "$3::jsonb,'bound-worker', $4::uuid,1,clock_timestamp()+interval '4 minutes') "+
    "RETURNING id",
    [users.alice,run.id,JSON.stringify({phase:"model",spec_revision:1}),leaseToken]
  )).rows[0]
  await db.query(
    "INSERT INTO agentstudio.approvals(owner_user_id,run_id,step_key,requested_by,"+
    "decided_by,status,decided_at) VALUES($1::uuid,$2::uuid,'model',$1::uuid,"+
    "$1::uuid,'approved',clock_timestamp())",[users.alice,run.id])
  await db.query(
    "INSERT INTO agentstudio.external_effects(owner_user_id,run_id,step_key,"+
    "tool_name,arguments_sha256,idempotency_key,status) "+
    "VALUES($1::uuid,$2::uuid,'model','model.generate',$3::text,$4::text,'started')",
    [users.alice,run.id,"a".repeat(64),"model:"+run.id])
  const claim={run_id:run.id,job_id:job.id,lease_token:leaseToken,
    lease_version:1,lease_owner:"bound-worker"}
  async function resolve(c=claim){
    await db.query("BEGIN")
    try{
      await db.query("SET LOCAL ROLE agentstudio_bound_dispatch")
      const result=await db.query(
        "SELECT issuer,subject FROM agentstudio.bound_model_lease_identity("+
        "$1::uuid,$2::uuid,$3::uuid,$4::bigint,$5::text)",
        [c.run_id,c.job_id,c.lease_token,c.lease_version,c.lease_owner])
      return result.rows
    }finally{await db.query("ROLLBACK")}
  }
  return {db,users,run,job,spec,claim,resolve,async close(){await db.close()}}
}
test("reviewed migration restricts lease identity lookup to dedicated NOLOGIN group",async()=>{
  const f=await fixture()
  try{
    const roles=(await f.db.query(
      "SELECT rolname,rolcanlogin,rolinherit,rolsuper,rolbypassrls,rolcreaterole "+
      "FROM pg_roles WHERE rolname='agentstudio_bound_dispatch'")).rows[0]
    assert.deepEqual(roles,{rolname:"agentstudio_bound_dispatch",
      rolcanlogin:false,rolinherit:false,rolsuper:false,rolbypassrls:false,
      rolcreaterole:false})
    const signature="agentstudio.bound_model_lease_identity(uuid,uuid,uuid,bigint,text)"
    const acl=(await f.db.query(
      "SELECT has_function_privilege('agentstudio_api',$1::text,'EXECUTE') AS api,"+
      "has_function_privilege('agentstudio_worker',$1::text,'EXECUTE') AS worker,"+
      "has_function_privilege('agentstudio_model_broker',$1::text,'EXECUTE') AS broker,"+
      "has_function_privilege('agentstudio_bound_dispatch',$1::text,'EXECUTE') AS gateway",
      [signature])).rows[0]
    assert.deepEqual(acl,{api:false,worker:false,broker:false,gateway:true})
    const actual=await f.resolve()
    assert.deepEqual(actual,[{issuer,subject:"alice"}])
    await f.db.exec(migration)
    assert.deepEqual(await f.resolve(),actual)
    const ledger=(await f.db.query("SELECT count(*)::int AS n "+
      "FROM agentstudio.schema_migrations WHERE version='pg_v9_024'")).rows[0]
    assert.equal(ledger.n,1)
  }finally{await f.close()}
})
test("forged lease, different job, wrong Worker and expired token return no identity",async()=>{
  const f=await fixture()
  try{
    const c=f.claim
    for(const altered of [
      {...c,lease_token:"c648132a-5c35-4698-9626-329f46cffc84"},
      {...c,lease_version:2},
      {...c,lease_owner:"another-worker"},
      {...c,run_id:f.users.bob},
      {...c,job_id:"f0950d8d-6645-461c-848c-fd282095f786"},
    ])assert.deepEqual(await f.resolve(altered),[])
    assert.deepEqual(await f.resolve(),[{issuer,subject:"alice"}])
    await f.db.query("UPDATE agentstudio.jobs SET lease_until="+
      "clock_timestamp()-interval '1 second' WHERE id=$1::uuid",[f.job.id])
    assert.deepEqual(await f.resolve(),[])
  }finally{await f.close()}
})
test("revoked approval, disabled employee, wrong revision, or ambiguous effect cannot resolve",async()=>{
  const f=await fixture()
  try{
    await f.db.query("UPDATE agentstudio.approvals SET status='rejected' "+
      "WHERE run_id=$1::uuid",[f.run.id])
    assert.deepEqual(await f.resolve(),[])
    await f.db.query("UPDATE agentstudio.approvals SET status='approved' "+
      "WHERE run_id=$1::uuid",[f.run.id])
    await f.db.query("UPDATE agentstudio.users SET status='disabled' WHERE id=$1::uuid",
      [f.users.alice])
    assert.deepEqual(await f.resolve(),[])
    await f.db.query("UPDATE agentstudio.users SET status='active' WHERE id=$1::uuid",
      [f.users.alice])
    await f.db.query("UPDATE agentstudio.agent_specs SET revision=revision+1 "+
      "WHERE id=$1::uuid",[f.spec.id])
    assert.deepEqual(await f.resolve(),[])
    await f.db.query("UPDATE agentstudio.agent_specs SET revision=1 "+
      "WHERE id=$1::uuid",[f.spec.id])
    await f.db.query("UPDATE agentstudio.external_effects SET status='unknown' "+
      "WHERE run_id=$1::uuid",[f.run.id])
    assert.deepEqual(await f.resolve(),[])
  }finally{await f.close()}
})


test("V9.023 then V9.024 apply and replay on disposable, fresh PostgreSQL schema",async()=>{
  const db=await PGlite.create({extensions:{vector}})
  try{
    await db.exec(schema)
    await db.query(
      "INSERT INTO agentstudio.schema_migrations(version,description) "+
      "VALUES('pg_v9_022','disposable synthetic pre-upgrade marker')")
    await db.exec(workflowUpgrade)
    await db.exec(migration)
    await db.exec(migration)
    const result=(await db.query(
      "SELECT (SELECT count(*)::integer FROM agentstudio.schema_migrations "+
      "WHERE version='pg_v9_023') AS workflow,"+
      "(SELECT count(*)::integer FROM agentstudio.schema_migrations "+
      "WHERE version='pg_v9_024') AS identity")).rows[0]
    assert.deepEqual(result,{workflow:1,identity:1})
    const jobConstraint=(await db.query(
      "SELECT pg_get_constraintdef(c.oid) AS definition "+
      "FROM pg_constraint c JOIN pg_class t ON c.conrelid=t.oid "+
      "JOIN pg_namespace n ON n.oid=t.relnamespace "+
      "WHERE n.nspname='agentstudio' AND t.relname='jobs' "+
      "AND c.conname='ck_jobs_kind'")).rows[0]
    assert.match(jobConstraint?.definition??"",/workflow_tick/)
    const privileges=(await db.query(
      "SELECT has_function_privilege('agentstudio_api',"+
      "'agentstudio.bound_model_lease_identity(uuid,uuid,uuid,bigint,text)',"+
      "'EXECUTE') AS api,"+
      "has_function_privilege('agentstudio_bound_dispatch',"+
      "'agentstudio.bound_model_lease_identity(uuid,uuid,uuid,bigint,text)',"+
      "'EXECUTE') AS dispatch")).rows[0]
    assert.deepEqual(privileges,{api:false,dispatch:true})
  }finally{await db.close()}
})
test("V9.024 rejects preexisting privileged dispatch groups and leaves no partial migration",async()=>{
  for(const [mutation,reason] of [
    ["GRANT agentstudio_bound_dispatch TO agentstudio_api",
      "bound_dispatch_group_membership_not_isolated"],
    ["GRANT agentstudio_bound_dispatch TO agentstudio_worker",
      "bound_dispatch_group_membership_not_isolated"],
    ["ALTER ROLE agentstudio_bound_dispatch LOGIN",
      "unsafe_existing_bound_dispatch_group_role"],
  ]){
    const db=await PGlite.create({extensions:{vector}})
    try{
      await db.exec(schema)
      await db.query(
        "INSERT INTO agentstudio.schema_migrations(version,description) "+
        "VALUES('pg_v9_023','isolated previous baseline')")
      await db.query(
        "CREATE ROLE agentstudio_bound_dispatch NOLOGIN NOINHERIT "+
        "NOSUPERUSER NOBYPASSRLS")
      await db.query(mutation)
      await assert.rejects(db.exec(migration),
        error=>String(error?.message).includes(reason),mutation)
      // The rejected transactional DDL must never grant a usable function.
      await db.query("ROLLBACK").catch(()=>undefined)
      const check=(await db.query(
        "SELECT (SELECT count(*)::integer FROM agentstudio.schema_migrations "+
        "WHERE version='pg_v9_024') AS ledger,"+
        "to_regprocedure("+
        "'agentstudio.bound_model_lease_identity(uuid,uuid,uuid,bigint,text)') "+
        "IS NULL AS no_function")).rows[0]
      assert.deepEqual(check,{ledger:0,no_function:true})
    }finally{await db.close()}
  }
})
