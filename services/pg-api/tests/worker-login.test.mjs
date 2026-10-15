// Real embedded PostgreSQL proof: separate Worker login is NON-superuser,
// cannot inspect employee prompts, but can read only the status metadata
// necessary to block uncertain external writes.
import test from "node:test"
import assert from "node:assert/strict"
import {readFileSync} from "node:fs"
import path from "node:path"
import {fileURLToPath} from "node:url"
import {PGlite} from "@electric-sql/pglite"
import {vector} from "@electric-sql/pglite-pgvector"

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../../..")
const read=f=>readFileSync(path.join(root,f),"utf8")
  .split(/\r?\n/).filter(l=>!l.trim().startsWith("\\")).join("\n")
test("trusted Worker login sees status and ambiguous writes but not private Agent content",async()=>{
  const pg=await PGlite.create({extensions:{vector}})
  try{
    await pg.exec(read("db/postgres/001_stage_schema.sql"))
    const database=(await pg.query("SELECT current_database() AS db")).rows[0].db
    const original=read("db/postgres/012_stage_worker_login.sql")
    assert.match(original,/current_database\(\)<>'agentstudio_stage'/)
    const stage=original.replace(
      "current_database()<>'agentstudio_stage'",
      "current_database()<>'"+database+"'")
      .replace("pg_read_file('/run/secrets/worker_login_password')",
        "'SYNTHETIC-STAGING-ONLY-WORKER-PASSWORD-123456789' ")
      .replaceAll("ON DATABASE agentstudio_stage","ON DATABASE "+database)
    await pg.exec(stage)
    const roles=await pg.query(
      "SELECT rolcanlogin,rolsuper,rolbypassrls FROM pg_roles "+
      "WHERE rolname='agentstudio_stage_worker'")
    assert.deepEqual(roles.rows,[{
      rolcanlogin:true,rolsuper:false,rolbypassrls:false,
    }])
    const user=await pg.query(
      "INSERT INTO agentstudio.users(external_issuer,external_subject) "+
      "VALUES('synthetic-worker-issuer','A') RETURNING id")
    const id=user.rows[0].id
    const spec=await pg.query(
      "INSERT INTO agentstudio.agent_specs(owner_user_id,name,spec) "+
      "VALUES($1,'Secret Plan','{\"goal\":\"sensitive\"}'::jsonb) "+
      "RETURNING id",[id])
    const run=await pg.query(
      "INSERT INTO agentstudio.runs(owner_user_id,kind,agent_spec_id,"+
      "instruction) VALUES($1,'agent',$2,'PRIVATE EMPLOYEE INSTRUCTION') "+
      "RETURNING id",[id,spec.rows[0].id])
    await pg.query(
      "INSERT INTO agentstudio.jobs(owner_user_id,run_id,kind,dedupe_key,payload) "+
      "VALUES($1,$2,'run_tick','blocked-job',"+
      "'{\"phase\":\"prepare\",\"spec_revision\":1}'::jsonb)",[id,run.rows[0].id])
    await pg.query(
      "INSERT INTO agentstudio.external_effects "+
      "(run_id,owner_user_id,step_key,tool_name,arguments_sha256,idempotency_key,status) "+
      "VALUES($1,$2,'write','external',$3,'unknown-effect','unknown')",
      [run.rows[0].id,id,"a".repeat(64)])
    await pg.exec("SET SESSION AUTHORIZATION agentstudio_stage_worker")
    await assert.rejects(pg.query(
      "SELECT instruction FROM agentstudio.runs"),/permission denied/i)
    await pg.exec("BEGIN")
    try{
      await pg.exec("SET LOCAL ROLE agentstudio_worker")
      const statuses=await pg.query(
        "SELECT run_id,status FROM agentstudio.external_effects")
      assert.equal(statuses.rows.length,1)
      assert.equal(statuses.rows[0].status,"unknown")
      const users=await pg.query("SELECT id,status FROM agentstudio.users")
      assert.equal(users.rows[0].id,id)
      const claim=await pg.query(read("db/postgres/005_claim_agent_prepare.sql"),
        ["stage-worker-check",90])
      assert.equal(claim.rows.length,0,
        "Unknown external write MUST prevent leasing even under Worker RLS")
      await pg.exec("SET LOCAL ROLE agentstudio_api")
      await pg.query("SELECT set_config('agentstudio.actor_id',$1,true)",[id])
      assert.equal((await pg.query(
        "SELECT count(*)::int AS n FROM agentstudio.agent_specs"))
        .rows[0].n,1)
      await pg.exec("COMMIT")
    }catch(error){await pg.exec("ROLLBACK");throw error}
    await assert.rejects(pg.query(
      "SELECT instruction FROM agentstudio.runs"),/permission denied/i)
  }finally{await pg.close()}
})
