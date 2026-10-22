import test from "node:test"
import assert from "node:assert/strict"
import {readFileSync} from "node:fs"
import path from "node:path"
import {fileURLToPath} from "node:url"
import {PGlite} from "@electric-sql/pglite"
import {vector} from "@electric-sql/pglite-pgvector"
import {freshSchemaForTest} from "../src/baota-pg18-fresh-init.mjs"
import {reviewedNativeSqlForEmbeddedTest,
  prepareNativeAuthPgliteRoles}
  from "./helpers/native-pg18-embedded.mjs"

const base=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../../..")
const contents=name=>readFileSync(path.join(base,name),"utf8")
const audit=contents("ops/baota-pg18-worker-readonly-audit.sql")
const authSql=contents("db/postgres/010_pg18_native_auth_proposed.sql")

test("Worker security audit contains ONLY safe SELECT plus READ ONLY rollback",()=>{
  const statements=audit.split(";")
    .map(s=>s.split(/\r?\n/).filter(l=>!l.trim().startsWith("--"))
      .join(" ").trim())
    .filter(Boolean)
  assert.ok(statements.length<=4)
  assert.match(audit,/BEGIN READ ONLY;/)
  assert.match(audit,/ROLLBACK;/)
  assert.match(audit,/worker_cannot_read_run_instruction/)
  assert.match(audit,/worker_cannot_read_auth_accounts/)
  assert.match(audit,/worker_cannot_assume_native_auth_role/)
  assert.doesNotMatch(audit,/\b(?:INSERT INTO|UPDATE agentstudio|DELETE FROM|DROP TABLE|CREATE ROLE|ALTER ROLE)\b/i)
  assert.doesNotMatch(audit,/pg_read_file|pg_ls_dir|COPY\s+|PROGRAM/i)
})

test("embedded PostgreSQL verifies Worker ACL without exposing auth records or jobs",async()=>{
  const pg=await PGlite.create({extensions:{vector}})
  try{
    await pg.exec("CREATE DATABASE agent_studio")
    await pg.exec(freshSchemaForTest().sql)
    await prepareNativeAuthPgliteRoles(pg)
    await pg.exec(reviewedNativeSqlForEmbeddedTest(authSql))
    const result=await pg.exec(audit)
    const rowsets=result.filter(x=>Array.isArray(x.rows)&&x.rows.length)
    assert.equal(rowsets.length,1)
    const statuses=new Map(rowsets[0].rows.map(x=>[x.check_name,x.result]))
    for(const key of [
      "worker_login_is_nonprivileged",
      "worker_can_assume_queue_role",
      "worker_can_assume_api_role",
      "worker_queue_metadata_select",
      "worker_queue_status_update",
      "worker_external_effect_status_select",
      "worker_cannot_read_run_instruction",
      "worker_cannot_read_agent_specs",
      "worker_cannot_read_auth_accounts",
      "worker_cannot_use_native_auth_schema",
      "worker_cannot_assume_native_auth_role",
    ]){
      assert.equal(statuses.get(key),"PASS",key)
    }
    assert.equal((await pg.query(
      "SELECT count(*)::integer AS n FROM agentstudio.jobs")).rows[0].n,0)
    assert.equal((await pg.query(
      "SELECT count(*)::integer AS n FROM agentstudio_auth.sessions")).rows[0].n,0)
  }finally{await pg.close()}
})
