import test from "node:test"
import assert from "node:assert/strict"
import {readFileSync} from "node:fs"
import path from "node:path"
import {fileURLToPath} from "node:url"
import {PGlite} from "@electric-sql/pglite"
import {vector} from "@electric-sql/pglite-pgvector"
import {freshSchemaForTest} from "../src/baota-pg18-fresh-init.mjs"
import {reviewedNativeSqlForEmbeddedTest,prepareNativeAuthPgliteRoles} from "./helpers/native-pg18-embedded.mjs"

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../../..")
const sql=readFileSync(path.join(root,"db/postgres/010_pg18_native_auth_proposed.sql"),"utf8")
test("proposed auth schema is independently gated, non-deploying and scoped to PG18",()=>{
  assert.match(sql,/current_database\(\) <> 'agent_studio'/)
  assert.match(sql,/server_version_num/)
  assert.match(sql,/180000/)
  assert.match(sql,/190000/)
  assert.match(sql,/current_setting\('server_version_num'\)/)
  assert.match(sql,/current_setting\('port'\)::integer <> 5333/)
  assert.match(sql,/pg_is_in_recovery\(\)/)
  assert.match(sql,/session_user <> 'postgres'/)
  assert.match(sql,/pg_v8_001.*pg_v8_004.*pg_v8_005/s)
  assert.match(sql,/extversion FROM pg_extension/)
  assert.match(sql,/pg_has_role\('agentstudio_stage_login'/)
  assert.match(sql,/rolsuper/)
  assert.match(sql,/agentstudio_native_auth/)
  assert.match(sql,/ENABLE ROW LEVEL SECURITY/)
  assert.match(sql,/FORCE ROW LEVEL SECURITY/)
  assert.match(sql,/REFERENCES agentstudio\.users/)
  assert.match(sql,/CREATE POLICY native_auth_verified_local_users/)
  assert.match(sql,/CREATE TABLE agentstudio_auth\.accounts/)
  assert.match(sql,/CREATE TABLE agentstudio_auth\.sessions/)
  assert.match(sql,/agentstudio_native_login NOLOGIN/)
  assert.match(sql,/CREATE POLICY native_auth_insert_local_users/)
  assert.match(sql,/is_admin boolean NOT NULL DEFAULT false/)
  assert.match(sql,/SET LOCAL lock_timeout/)
  assert.match(sql,/pg_advisory_xact_lock/)
  assert.match(sql,/COMMIT;/)
  assert.doesNotMatch(sql,/\bDROP TABLE\b|\bTRUNCATE\b|\bDROP DATABASE\b/i)
  assert.doesNotMatch(sql,/\bGRANT.*agentstudio_api\b/i)
})
test("auth tables are RLS protected, isolated and leave baseline untouched",async()=>{
  const db=await PGlite.create({extensions:{vector}})
  try{
    // The shipped PG18 guard remains intact; only the test copy differs.
    const executable=reviewedNativeSqlForEmbeddedTest(sql)
    assert.notEqual(executable,sql)
    await db.exec("CREATE DATABASE agent_studio")
    await db.exec(freshSchemaForTest().sql)
    await prepareNativeAuthPgliteRoles(db)
    await db.exec(executable)
    const tables=(await db.query(
      "SELECT relname,relrowsecurity,relforcerowsecurity FROM pg_class c "+
      "JOIN pg_namespace n ON c.relnamespace=n.oid "+
      "WHERE n.nspname='agentstudio_auth' AND c.relkind='r' "+
      "ORDER BY relname")).rows
    assert.equal(tables.length,2)
    assert.deepEqual(tables.map(r=>r.relname),["accounts","sessions"])
    assert.ok(tables.every(r=>r.relrowsecurity&&r.relforcerowsecurity))
    const migrations=(await db.query(
      "SELECT version FROM agentstudio.schema_migrations ORDER BY version")).rows
    assert.equal(migrations.length,4)
    assert.ok(migrations.some(m=>m.version==="pg18_native_auth_001"))
    const authRole=(await db.query(
      "SELECT rolcanlogin,rolsuper,rolbypassrls FROM pg_roles "+
      "WHERE rolname='agentstudio_native_auth'")).rows[0]
    assert.deepEqual(authRole,{rolcanlogin:false,rolsuper:false,rolbypassrls:false})
    await db.exec("BEGIN")
    try{
      await db.exec("SET LOCAL ROLE agentstudio_native_auth")
      await db.query("SELECT user_id,email FROM agentstudio_auth.accounts LIMIT 1")
      await db.query("SELECT token_digest FROM agentstudio_auth.sessions LIMIT 1")
      const visible=await db.query("SELECT id,status FROM agentstudio.users LIMIT 1")
      assert.equal(visible.rows.length,0)
      await assert.rejects(db.query(
        "SELECT name FROM agentstudio.agent_specs LIMIT 1"))
      await assert.rejects(db.query(
        "SELECT version FROM agentstudio.schema_migrations LIMIT 1"))
    }finally{await db.exec("ROLLBACK")}
  }finally{await db.close()}
})
test("failed auth migration transaction leaves no extra schema or role",async()=>{
  const db=await PGlite.create({extensions:{vector}})
  try{
    await db.exec("CREATE DATABASE agent_studio")
    await db.exec(freshSchemaForTest().sql)
    await prepareNativeAuthPgliteRoles(db)
    const before=(await db.query("SELECT count(*)::int AS n FROM pg_tables "+
      "WHERE schemaname='agentstudio'")).rows[0].n
    // Real PG18 target guard would reject the PGlite harness.
    await assert.rejects(db.exec(sql))
    // PostgreSQL leaves an explicit transaction in failed state on preflight refusal.
    await db.exec("ROLLBACK")
    const schema=(await db.query("SELECT to_regnamespace('agentstudio_auth') AS id")).rows[0]
    assert.equal(schema.id,null)
    const role=(await db.query("SELECT rolname FROM pg_roles "+
      "WHERE rolname='agentstudio_native_auth'")).rows
    assert.equal(role.length,0)
    assert.equal((await db.query("SELECT count(*)::int AS n FROM pg_tables "+
      "WHERE schemaname='agentstudio'")).rows[0].n,before)
  }finally{await db.close()}
})
