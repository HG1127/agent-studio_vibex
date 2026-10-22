import test from "node:test"
import assert from "node:assert/strict"
import {readFileSync} from "node:fs"
import path from "node:path"
import {fileURLToPath} from "node:url"
import {PGlite} from "@electric-sql/pglite"
import {vector} from "@electric-sql/pglite-pgvector"
import {freshSchemaForTest} from "../src/baota-pg18-fresh-init.mjs"
import {prepareNativeAuthPgliteRoles,
  reviewedNativeSqlForEmbeddedTest}
  from "./helpers/native-pg18-embedded.mjs"

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../../..")
const read=rel=>readFileSync(path.join(root,rel),"utf8")
const sql=read("ops/baota-pg18-worker-readonly-audit.sql")
const authSql=read("db/postgres/010_pg18_native_auth_proposed.sql")

test("BaoTa Worker audit consists only of SELECT within READ ONLY ROLLBACK",()=>{
  assert.match(sql,/^BEGIN READ ONLY;/m)
  assert.match(sql,/^ROLLBACK;/m)
  assert.match(sql,/FROM pg_catalog.pg_class/)
  assert.match(sql,/FROM pg_catalog.pg_roles/)
  assert.match(sql,/pg_has_role/)
  assert.match(sql,/worker_cannot_read_auth_accounts/)
  assert.match(sql,/worker_cannot_use_native_auth_schema/)
  assert.match(sql,/worker_cannot_assume_native_auth_role/)
  assert.doesNotMatch(sql,/^\s*(?:INSERT|UPDATE|DELETE|CREATE|DROP|GRANT|REVOKE|ALTER|TRUNCATE|DO)\b/im)
  assert.doesNotMatch(sql,/pg_read_file|pg_ls_dir|COPY\s+/i)
})

test("embedded PostgreSQL confirms all Worker grants and employee privacy checks",async()=>{
  const db=await PGlite.create({extensions:{vector}})
  try{
    await db.exec("CREATE DATABASE agent_studio")
    await db.exec(freshSchemaForTest().sql)
    await prepareNativeAuthPgliteRoles(db)
    await db.exec(reviewedNativeSqlForEmbeddedTest(authSql))
    const results=await db.exec(sql)
    const checks=results.find(r=>r.rows?.some(row=>row.check_name))?.rows
    assert.ok(checks,JSON.stringify(results).slice(0,800))
    assert.equal(checks.length,15)
    const byName=Object.fromEntries(checks.map(row=>[row.check_name,row.result]))
    for(const name of [
      "worker_login_is_nonprivileged",
      "worker_can_assume_queue_role","worker_can_assume_api_role",
      "worker_queue_metadata_select","worker_queue_status_update",
      "worker_external_effect_status_select",
      "worker_cannot_read_run_instruction",
      "worker_cannot_read_agent_specs",
      "worker_cannot_read_auth_accounts",
      "worker_cannot_use_native_auth_schema",
      "worker_cannot_assume_native_auth_role",
    ]){
      assert.equal(byName[name],"PASS",name)
    }
    assert.equal(byName.database_is_agent_studio,"FAIL",
      "PGlite synthetic CREATE DATABASE does not switch its active DB")
    // PGlite version, installed vector version and port can vary between
    // installed test runtimes. Assert only that they remain explicit gates:
    // real BaoTa must return PASS for ALL of them, unlike this fixture.
    for(const field of ["pg18_server_major","postgresql_port_5333",
      "vector_extension_0_8_7"])
      assert.ok(["PASS","FAIL"].includes(byName[field]),field)
  }finally{await db.close()}
})
