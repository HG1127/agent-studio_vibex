// Real PostgreSQL in-memory migration rehearsal: add narrowly scoped
// prepare Worker RLS/grants to an earlier disposable V8 schema, idempotently.
// Never touches BaoTa PostgreSQL, real users or production.
import test from "node:test"
import assert from "node:assert/strict"
import {readFileSync} from "node:fs"
import path from "node:path"
import {fileURLToPath} from "node:url"
import {PGlite} from "@electric-sql/pglite"
import {vector} from "@electric-sql/pglite-pgvector"

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../../..")
const get=file=>readFileSync(path.join(root,file),"utf8")
  .split(/\r?\n/).filter(l=>!l.trim().startsWith("\\")).join("\n")
test("old staging ledger upgrades Worker status grants and RLS without duplicates",async()=>{
  const pg=await PGlite.create({extensions:{vector}})
  try{
    const schema=get("db/postgres/001_stage_schema.sql")
    const additions=[
      "GRANT SELECT(id,status) ON agentstudio.users TO agentstudio_worker;\n",
      "GRANT SELECT(id,owner_user_id,status) ON agentstudio.runs TO agentstudio_worker;\n",
      "CREATE POLICY worker_run_status ON agentstudio.runs\n  FOR SELECT TO agentstudio_worker USING(true);\n",
      "CREATE POLICY worker_user_active ON agentstudio.users\n  FOR SELECT TO agentstudio_worker USING(true);\n",
      "CREATE POLICY worker_effect_safety_read ON agentstudio.external_effects\n  FOR SELECT TO agentstudio_worker USING (true);\n",
    ]
    let older=schema
    for(const part of additions){
      assert.ok(older.includes(part),"Missing expected staged delta: "+part.slice(0,50))
      older=older.replace(part,"")
    }
    await pg.exec(older)
    const original=get("db/postgres/migrations/pg_v8_003_prepare_worker.sql")
    const name=(await pg.query("SELECT current_database() AS db")).rows[0].db
    assert.match(original,/current_database\(\)<>'agentstudio_stage'/)
    const migration=original.replace(
      "current_database()<>'agentstudio_stage'",
      "current_database()<>'"+name+"'")
    await pg.exec(migration)
    await pg.exec(migration)
    const count=await pg.query(
      "SELECT count(*)::int AS n FROM pg_policies "+
      "WHERE schemaname='agentstudio'")
    assert.equal(count.rows[0].n,22)
    const ledger=await pg.query(
      "SELECT count(*)::int AS n FROM agentstudio.schema_migrations "+
      "WHERE version='pg_v8_003'")
    assert.equal(ledger.rows[0].n,1)
    await pg.exec("BEGIN")
    try{
      await pg.exec("SET LOCAL ROLE agentstudio_worker")
      await pg.exec("SAVEPOINT denied_prompt")
      await assert.rejects(pg.query(
        "SELECT instruction FROM agentstudio.runs"),/permission denied/i)
      await pg.exec("ROLLBACK TO SAVEPOINT denied_prompt")
      const effects=await pg.query(
        "SELECT run_id,status FROM agentstudio.external_effects")
      assert.deepEqual(effects.rows,[])
      const users=await pg.query("SELECT id,status FROM agentstudio.users")
      assert.deepEqual(users.rows,[])
    }finally{await pg.exec("ROLLBACK")}
  }finally{await pg.close()}
})
