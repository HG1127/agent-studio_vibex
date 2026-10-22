// Disposable PostgreSQL engine test of REAL DB-role boundaries, not merely
// application-level owner filters. Uses embedded PGlite (PG17 semantics),
// synthetic identities and no BaoTa TCP, credentials, models, or network I/O.
// This is NOT a substitute for live PG18 tenant/concurrency validation.
import test from "node:test"
import assert from "node:assert/strict"
import {PGlite} from "@electric-sql/pglite"
import {vector} from "@electric-sql/pglite-pgvector"
import {readFileSync} from "node:fs"
import path from "node:path"
import {fileURLToPath} from "node:url"
import {AgentPrepareWorker} from "../src/agent-worker.ts"

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../../..")
const baseline=readFileSync(path.join(root,"db/postgres/001_stage_schema.sql"),"utf8")
  .split(/\r?\n/).filter(line=>!line.trim().startsWith("\\")).join("\n")

async function roleTransaction(pg,role,actor,body){
  await pg.query("BEGIN")
  try{
    if(!["agentstudio_api","agentstudio_worker"].includes(role))
      throw Error("forbidden_test_role")
    await pg.query("SET LOCAL ROLE "+role)
    if(actor!==undefined){
      await pg.query("SELECT set_config('agentstudio.actor_id',$1,true)",[actor])
    }
    return await body()
  }finally{
    await pg.query("ROLLBACK")
  }
}
function isPermissionError(err){
  return /permission denied|row-level security policy/i.test(String(err?.message))
}
// PostgreSQL marks the whole transaction aborted after a denied statement;
// SAVEPOINT isolation lets the test assert multiple independent denials.
async function expectDenied(pg,sql,params=[]){
  await pg.query("SAVEPOINT denied_statement")
  try{
    await assert.rejects(pg.query(sql,params),isPermissionError)
  }finally{
    await pg.query("ROLLBACK TO SAVEPOINT denied_statement")
    await pg.query("RELEASE SAVEPOINT denied_statement")
  }
}
test("disposable PG owner RLS and nonprivileged Worker column boundaries",async()=>{
  const db=await PGlite.create({extensions:{vector}})
  try{
    await db.exec(baseline)
    const users=[]
    for(const name of ["a","b"]){
      const user=await db.query(
        "INSERT INTO agentstudio.users(external_issuer,external_subject) "+
        "VALUES('https://isolation.test',$1) RETURNING id",[name])
      users.push(user.rows[0].id)
    }
    const specs=[]
    const runs=[]
    for(const user of users){
      const spec=await db.query(
        "INSERT INTO agentstudio.agent_specs(owner_user_id,name,spec) "+
        "VALUES($1,'UAT only','{\"goal\":\"Synthetic\"}'::jsonb) RETURNING id",
        [user])
      specs.push(spec.rows[0].id)
      const run=await db.query(
        "INSERT INTO agentstudio.runs(owner_user_id,kind,agent_spec_id,instruction) "+
        "VALUES($1,'agent',$2,'Private synthetic prompt') RETURNING id",
        [user,spec.rows[0].id])
      runs.push(run.rows[0].id)
    }
    await roleTransaction(db,"agentstudio_api",users[0],async()=>{
      const own=await db.query("SELECT id FROM agentstudio.runs ORDER BY id")
      assert.deepEqual(own.rows.map(x=>x.id),[runs[0]])
      const specsVisible=await db.query("SELECT id FROM agentstudio.agent_specs")
      assert.deepEqual(specsVisible.rows.map(x=>x.id),[specs[0]])
      assert.equal((await db.query(
        "UPDATE agentstudio.runs SET status='failed' WHERE id=$1 RETURNING id",
        [runs[1]])).rows.length,0,"other employee's run is not writable")
      await expectDenied(db,
        "INSERT INTO agentstudio.run_steps(owner_user_id,run_id,step_key) "+
        "VALUES($1,$2,'cross-owner')",[users[1],runs[1]])
    })
    await roleTransaction(db,"agentstudio_worker",undefined,async()=>{
      const status=await db.query(
        "SELECT id,status,owner_user_id FROM agentstudio.runs ORDER BY id")
      assert.equal(status.rows.length,2,
        "worker can see only queue identity/status metadata")
      await expectDenied(db,
        "SELECT instruction FROM agentstudio.runs LIMIT 1")
      await expectDenied(db,
        "SELECT spec FROM agentstudio.agent_specs LIMIT 1")
      await expectDenied(db,
        "UPDATE agentstudio.runs SET status='failed' WHERE id=$1",[runs[0]])
      await expectDenied(db,
        "SELECT external_issuer FROM agentstudio.users LIMIT 1")
    })
    assert.equal((await db.query(
      "SELECT count(*)::integer AS n FROM agentstudio.run_steps")).rows[0].n,0,
      "denied cross-owner insert did not persist")
    assert.deepEqual((await db.query(
      "SELECT status FROM agentstudio.runs ORDER BY id")).rows.map(x=>x.status),
      ["queued","queued"],"RLS exercise did not alter either run")
  }finally{await db.close()}
})
test("real worker-role anti-replay claim does not ignore unknown effects under RLS",async()=>{
  const db=await PGlite.create({extensions:{vector}})
  try{
    await db.exec(baseline)
    const owner=(await db.query(
      "INSERT INTO agentstudio.users(external_issuer,external_subject) "+
      "VALUES('https://isolated.test','operator') RETURNING id"
    )).rows[0].id
    const spec=(await db.query(
      "INSERT INTO agentstudio.agent_specs(owner_user_id,name,spec) "+
      "VALUES($1,'Test policy','{\"goal\":\"Synthetic\"}'::jsonb) RETURNING id",
      [owner])).rows[0].id
    const runs=[]
    for(const label of ["blocked","allowed"]){
      const id=(await db.query(
        "INSERT INTO agentstudio.runs(owner_user_id,kind,agent_spec_id,instruction) "+
        "VALUES($1,'agent',$2,'Synthetic UAT') RETURNING id",
        [owner,spec])).rows[0].id
      runs.push(id)
      await db.query(
        "INSERT INTO agentstudio.jobs(owner_user_id,run_id,kind,dedupe_key,payload,scheduled_at) "+
        "VALUES($1,$2,'run_tick',$3,'{\"phase\":\"prepare\",\"spec_revision\":1}'::jsonb,"+
        "clock_timestamp()-interval '2 seconds')",
        [owner,id,label])
    }
    await db.query(
      "INSERT INTO agentstudio.external_effects "+
      "(owner_user_id,run_id,step_key,tool_name,arguments_sha256,idempotency_key,status) "+
      "VALUES($1,$2,'uncertain','payment.existing',$3,'blocked-effect','unknown')",
      [owner,runs[0],"a".repeat(64)])
    const pool={async connect(){return {
      query(sql,params=[]){return db.query(sql,params)},
      release(){}
    }}}
    const worker=new AgentPrepareWorker(pool,"isolated-rls-worker")
    const claimed=await worker.claim()
    assert.equal(claimed?.run_id,runs[1],
      "unknown external effect must not become invisible behind worker RLS")
    assert.equal((await worker.claim())?.id,undefined,
      "blocked job cannot be leased even while the other worker lease is active")
    await roleTransaction(db,"agentstudio_worker",undefined,async()=>{
      const effects=await db.query(
        "SELECT run_id,status FROM agentstudio.external_effects")
      assert.deepEqual(effects.rows.map(x=>x.status),["unknown"])
      await assert.rejects(db.query(
        "SELECT arguments_sha256 FROM agentstudio.external_effects"),
        isPermissionError)
    })
    const statuses=(await db.query(
      "SELECT run_id,status FROM agentstudio.jobs ORDER BY dedupe_key")).rows
    assert.equal(statuses[0].status,"leased")
    assert.equal(statuses[1].status,"queued")
  }finally{await db.close()}
})

test("prepare approval conflict rolls back step, audit and run state atomically",async()=>{
  const db=await PGlite.create({extensions:{vector}})
  try{
    await db.exec(baseline)
    const owner=(await db.query(
      "INSERT INTO agentstudio.users(external_issuer,external_subject) "+
      "VALUES('https://rollback.test','synthetic') RETURNING id"
    )).rows[0].id
    const spec=(await db.query(
      "INSERT INTO agentstudio.agent_specs(owner_user_id,name,spec) "+
      "VALUES($1,'Synthetic rollback','{\"goal\":\"Rollback test\"}'::jsonb) "+
      "RETURNING id",[owner])).rows[0].id
    const run=(await db.query(
      "INSERT INTO agentstudio.runs(owner_user_id,kind,agent_spec_id,instruction) "+
      "VALUES($1,'agent',$2,'No external effect') RETURNING id",
      [owner,spec])).rows[0].id
    await db.query(
      "INSERT INTO agentstudio.jobs(owner_user_id,run_id,kind,dedupe_key,payload) "+
      "VALUES($1,$2,'run_tick','rollback-case',"+
      "'{\"phase\":\"prepare\",\"spec_revision\":1}'::jsonb)",
      [owner,run])
    // An existing approval forces a UNIQUE conflict AFTER the prepare-step
    // insert, exposing accidental partial transactions if rollback breaks.
    await db.query(
      "INSERT INTO agentstudio.approvals(owner_user_id,run_id,step_key,requested_by) "+
      "VALUES($1,$2,'model',$1)",[owner,run])
    const pool={async connect(){return {
      query(sql,params=[]){return db.query(sql,params)},
      release(){}
    }}}
    const worker=new AgentPrepareWorker(pool,"rollback-worker")
    const lease=await worker.claim()
    assert.equal(lease.run_id,run)
    await assert.rejects(worker.prepare(lease),e=>
      e?.code==="23505"||/duplicate key|unique constraint/i.test(String(e?.message)))
    const count=async(table)=>(
      await db.query("SELECT count(*)::integer AS n FROM agentstudio."+table+
      " WHERE run_id=$1",[run])).rows[0].n
    assert.equal(await count("run_steps"),0,
      "step inserted before the approval conflict must rollback")
    assert.equal(await count("audit_events"),0)
    assert.equal(await count("approvals"),1,
      "original approval must not be removed or duplicated")
    assert.equal((await db.query(
      "SELECT status,step_count FROM agentstudio.runs WHERE id=$1",
      [run])).rows[0].status,"queued")
    assert.equal((await db.query(
      "SELECT step_count FROM agentstudio.runs WHERE id=$1",
      [run])).rows[0].step_count,0)
    assert.deepEqual(await worker.resolveFailure(lease),
      {status:"retry_scheduled",run_id:run})
    const queued=(await db.query(
      "SELECT status,attempts,lease_token,lease_owner FROM agentstudio.jobs "+
      "WHERE run_id=$1",[run])).rows[0]
    assert.equal(queued.status,"queued")
    assert.equal(queued.attempts,1)
    assert.equal(queued.lease_token,null)
    assert.equal(queued.lease_owner,null)
    assert.equal(await count("run_steps"),0)
    assert.equal(await count("audit_events"),0)
  }finally{await db.close()}
})
