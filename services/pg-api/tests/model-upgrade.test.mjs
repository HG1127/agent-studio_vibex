// Verify additive V8.2 staging schema upgrade against actual PostgreSQL SQL
// engine (PGlite), including an old V8 baseline, repeatability and RLS.
import test from "node:test"
import assert from "node:assert/strict"
import {readFileSync} from "node:fs"
import path from "node:path"
import {fileURLToPath} from "node:url"
import {PGlite} from "@electric-sql/pglite"
import {vector} from "@electric-sql/pglite-pgvector"

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../../..")
const read=filename=>readFileSync(path.join(root,filename),"utf8")
  .split(/\r?\n/).filter(row=>!row.startsWith("\\")).join("\n")
test("V8.1 -> V8.2 additive model result migration is idempotent and RLS remains owner-only",async()=>{
  const pg=await PGlite.create({extensions:{vector}})
  try{
    let schema=read("db/postgres/001_stage_schema.sql")
    schema=schema.replace(
      "  result_text text NOT NULL DEFAULT '' CHECK (length(result_text)<=20000),\n","")
      .replace(/\nINSERT INTO agentstudio\.schema_migrations\(version,description\)\s+VALUES\('pg_v8_004'[^\n]*\);/,"")
    await pg.exec(schema)
    const before=await pg.query(
      "SELECT 1 FROM information_schema.columns "+
      "WHERE table_schema='agentstudio' AND table_name='runs' "+
      "AND column_name='result_text'")
    assert.equal(before.rows.length,0,"fixture must represent previous stage schema")
    const current=(await pg.query("SELECT current_database() AS name")).rows[0].name
    const original=read("db/postgres/migrations/pg_v8_004_model_execution.sql")
    assert.match(original,/current_database\(\)<>'agentstudio_stage'/)
    const migration=original.replace(
      "current_database()<>'agentstudio_stage'",
      "current_database()<>'"+current+"'")
    await pg.exec(migration)
    await pg.exec(migration)
    const column=await pg.query(
      "SELECT column_name,is_nullable,column_default "+
      "FROM information_schema.columns WHERE table_schema='agentstudio' "+
      "AND table_name='runs' AND column_name='result_text'")
    assert.equal(column.rows.length,1)
    assert.equal(column.rows[0].is_nullable,"NO")
    assert.equal((await pg.query(
      "SELECT count(*)::int AS n FROM agentstudio.schema_migrations "+
      "WHERE version='pg_v8_004'")).rows[0].n,1)
    assert.equal((await pg.query(
      "SELECT count(*)::int AS n FROM pg_constraint WHERE "+
      "conname='ck_runs_result_text_size' AND "+
      "conrelid='agentstudio.runs'::regclass")).rows[0].n,1)
    const a=(await pg.query("INSERT INTO agentstudio.users "+
      "(external_issuer,external_subject) VALUES('stage','A') "+
      "RETURNING id")).rows[0].id
    const b=(await pg.query("INSERT INTO agentstudio.users "+
      "(external_issuer,external_subject) VALUES('stage','B') "+
      "RETURNING id")).rows[0].id
    const spec=(await pg.query(
      "INSERT INTO agentstudio.agent_specs(owner_user_id,name,spec) "+
      "VALUES($1,'Private','{}'::jsonb) RETURNING id",[a])).rows[0].id
    const run=(await pg.query(
      "INSERT INTO agentstudio.runs(owner_user_id,kind,agent_spec_id,result_text) "+
      "VALUES($1,'agent',$2,'private model result') RETURNING id",
      [a,spec])).rows[0].id
    await pg.exec("BEGIN")
    try{
      await pg.exec("SET LOCAL ROLE agentstudio_api")
      await pg.query("SELECT set_config('agentstudio.actor_id',$1,true)",[b])
      assert.equal((await pg.query(
        "SELECT result_text FROM agentstudio.runs WHERE id=$1",[run])).rows.length,0)
      await pg.exec("COMMIT")
    }catch(error){await pg.exec("ROLLBACK");throw error}
    await pg.exec("BEGIN")
    try{
      await pg.exec("SET LOCAL ROLE agentstudio_api")
      await pg.query("SELECT set_config('agentstudio.actor_id',$1,true)",[a])
      assert.equal((await pg.query(
        "SELECT result_text FROM agentstudio.runs WHERE id=$1",[run]))
        .rows[0].result_text,"private model result")
      await pg.exec("COMMIT")
    }catch(error){await pg.exec("ROLLBACK");throw error}
    await assert.rejects(pg.query(
      "UPDATE agentstudio.runs SET result_text=$1 WHERE id=$2",
      ["x".repeat(20001),run]),/check constraint/i)
  }finally{await pg.close()}
})
