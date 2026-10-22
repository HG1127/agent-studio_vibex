import test from "node:test"
import assert from "node:assert/strict"
import {readFileSync} from "node:fs"
import path from "node:path"
import {fileURLToPath} from "node:url"
import {PGlite} from "@electric-sql/pglite"
import {vector} from "@electric-sql/pglite-pgvector"
import {freshSchemaForTest} from "../src/baota-pg18-fresh-init.mjs"
import {
  reviewedNativeSqlForEmbeddedTest,prepareNativeAuthPgliteRoles
} from "./helpers/native-pg18-embedded.mjs"

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../../..")
const file=readFileSync(path.join(root,"ops/baota-pg18-native-postcheck.sql"),"utf8")
const migration=readFileSync(path.join(root,
  "db/postgres/010_pg18_native_auth_proposed.sql"),"utf8")
const executable=file.split(/\r?\n/)
  .filter(line=>!line.trim().startsWith("\\")).join("\n")
test("BaoTa native auth postcheck is strictly read-only and requires disabled auth login",()=>{
  assert.match(file,/BEGIN READ ONLY;/)
  assert.match(file,/ROLLBACK;/)
  assert.match(file,/AUTH_SCHEMA_OK_LOGIN_STILL_DISABLED/)
  assert.match(file,/NOT rolcanlogin AND NOT rolsuper AND NOT rolbypassrls/)
  assert.match(file,/rolpassword IS NULL/)
  assert.match(file,/native_auth_accounts_service/)
  assert.match(file,/native_auth_insert_local_users/)
  assert.match(file,/NOT has_table_privilege/)
  assert.doesNotMatch(file,/\b(?:DROP|TRUNCATE|UPDATE|DELETE|INSERT|ALTER|CREATE)\s+/i)
})
test("postcheck detects newly installed auth schema but does not approve PG17 target",async()=>{
  const db=await PGlite.create({extensions:{vector}})
  try{
    await db.exec("CREATE DATABASE agent_studio")
    await db.exec(freshSchemaForTest().sql)
    await prepareNativeAuthPgliteRoles(db)
    await db.exec(reviewedNativeSqlForEmbeddedTest(migration))
    const output=await db.exec(executable)
    const rows=output.flatMap(x=>x.rows||[])
    const last=rows.find(x=>Object.hasOwn(x,"native_auth_schema_status"))
    assert.ok(last)
    assert.equal(last.native_auth_schema_status,"NO_GO_AUTH_SCHEMA_POSTCHECK")
    // Only the isolated PG17 test copy can bypass PG18/port identity.
    // Every privilege, RLS, table count, role and ledger assertion stays live.
    const positiveTestCopy=executable
      .replace("current_database()='agent_studio'","TRUE")
      .replace("current_setting('server_version_num')::integer BETWEEN 180000 AND 189999","TRUE")
      .replace("current_setting('port')::integer=5333","TRUE")
      .replace("(SELECT extversion FROM pg_extension WHERE extname='vector')='0.8.7'","TRUE")
    assert.notEqual(positiveTestCopy,executable)
    const syntheticOutput=await db.exec(positiveTestCopy)
    const positive=syntheticOutput.flatMap(x=>x.rows||[])
      .find(x=>Object.hasOwn(x,"native_auth_schema_status"))
    assert.equal(positive?.native_auth_schema_status,
      "AUTH_SCHEMA_OK_LOGIN_STILL_DISABLED")
    const native=(await db.query(
      "SELECT count(*)::integer AS n FROM pg_tables WHERE schemaname='agentstudio_auth'"
    )).rows[0]
    assert.equal(native.n,2)
    const original=(await db.query(
      "SELECT count(*)::integer AS n FROM pg_tables WHERE schemaname='agentstudio'"
    )).rows[0]
    assert.equal(original.n,23)
    const r=(await db.query(
      "SELECT rolcanlogin,rolsuper FROM pg_roles WHERE rolname='agentstudio_native_login'"
    )).rows[0]
    assert.equal(r.rolcanlogin,false)
    assert.equal(r.rolsuper,false)
    const ledger=(await db.query(
      "SELECT count(*)::integer AS n FROM agentstudio.schema_migrations")).rows[0]
    assert.equal(ledger.n,4)
  }finally{await db.close()}
})
