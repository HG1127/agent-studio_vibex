// Test the REAL least-privilege bootstrap SQL against embedded PostgreSQL.
// A dummy password replaces pg_read_file() in-memory ONLY because this WASM
// engine has no Docker Secret mount. The actual production/staging SQL is not
// edited, and no network/database service/browser is launched.
import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import {fileURLToPath} from "node:url"
import {PGlite} from "@electric-sql/pglite"
import {vector} from "@electric-sql/pglite-pgvector"

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../../..")
const load=relative=>fs.readFileSync(path.join(root,relative),"utf8")
  .split(/\r?\n/).filter(l=>!l.trim().startsWith("\\")).join("\n")

test("staging API bootstrap creates non-admin login and enforces owner RLS",async()=>{
  const pg=await PGlite.create({extensions:{vector}})
  try{
    await pg.exec(load("db/postgres/001_stage_schema.sql"))
    const originalSql=load("db/postgres/011_stage_api_login.sql")
    // PGlite may use an embedded database name other than agentstudio_stage.
    // ONLY this throwaway in-memory fixture substitutes the expected name.
    const dbName=String((await pg.query("SELECT current_database() AS name")).rows[0].name)
    assert.match(dbName,/^[a-z_][a-z0-9_]*$/)
    const fixture=originalSql
      .replace(
        "current_database() <> 'agentstudio_stage'",
        "current_database() <> '"+dbName+"'",
      )
      .replace("pg_read_file('/run/secrets/api_login_password')",
        "'SYNTHETIC-LOCAL-PGLITE-ONLY-NOT-A-PASSWORD-12345678'")
      .replaceAll("ON DATABASE agentstudio_stage", "ON DATABASE "+dbName)
    assert.notEqual(fixture,originalSql,
      "Synthetic credential replacement must be contained in this test")
    await pg.exec(fixture)

    const role=await pg.query(
      "SELECT rolcanlogin,rolsuper,rolbypassrls FROM pg_roles "+
      "WHERE rolname='agentstudio_stage_login'")
    assert.equal(role.rows.length,1)
    assert.deepEqual(role.rows[0],{
      rolcanlogin:true,rolsuper:false,rolbypassrls:false,
    })

    const issuer="https://trusted-stage-id.invalid"
    const a=await pg.query(
      "INSERT INTO agentstudio.users(external_issuer,external_subject) "+
      "VALUES($1,'A') RETURNING id",[issuer])
    const b=await pg.query(
      "INSERT INTO agentstudio.users(external_issuer,external_subject) "+
      "VALUES($1,'B') RETURNING id",[issuer])
    const aid=a.rows[0].id,bid=b.rows[0].id
    await pg.exec("SET SESSION AUTHORIZATION agentstudio_stage_login")
    const nonAdmin=await pg.query("SELECT session_user,current_user")
    assert.equal(nonAdmin.rows[0].session_user,"agentstudio_stage_login")
    await assert.rejects(pg.query("SELECT * FROM agentstudio.agent_specs"),
      /permission denied/i)

    await pg.exec("BEGIN")
    try{
      await pg.exec("SET LOCAL ROLE agentstudio_api")
      const identity=await pg.query(
        "SELECT agentstudio.identity_user_id($1::text,$2::text) AS id",
        [issuer,"A"])
      assert.equal(identity.rows[0].id,aid)
      await pg.query("SELECT set_config('agentstudio.actor_id',$1,true)",[aid])
      const created=await pg.query(
        "INSERT INTO agentstudio.agent_specs(owner_user_id,name,spec) "+
        "VALUES($1,'Owner A','{}'::jsonb) RETURNING id",[aid])
      assert.equal(created.rows.length,1)
      const visible=await pg.query("SELECT count(*)::int AS count FROM agentstudio.agent_specs")
      assert.equal(visible.rows[0].count,1)
      // B's data cannot be inserted/changed by A's authenticated transaction.
      await pg.exec("SAVEPOINT privilege_denied")
      await assert.rejects(
        pg.query("INSERT INTO agentstudio.agent_specs(owner_user_id,name,spec) "+
          "VALUES($1,'Spoofed B','{}'::jsonb)",[bid]),
        /row.level security|violates row.level security/i)
      await pg.exec("ROLLBACK TO SAVEPOINT privilege_denied")
      await pg.exec("COMMIT")
    }catch(err){
      await pg.exec("ROLLBACK")
      throw err
    }

    const after=await pg.query("SELECT current_user,session_user")
    assert.equal(after.rows[0].current_user,"agentstudio_stage_login")
    await assert.rejects(pg.query("SELECT * FROM agentstudio.agent_specs"),
      /permission denied/i)
  }finally{
    await pg.close()
  }
})
