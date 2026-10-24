import test from "node:test"
import assert from "node:assert/strict"
import {readFileSync} from "node:fs"
import path from "node:path"
import {fileURLToPath} from "node:url"
import {PGlite} from "@electric-sql/pglite"
import {vector} from "@electric-sql/pglite-pgvector"
import {freshSchemaForTest} from "../src/baota-pg18-fresh-init.mjs"

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../../..")
const original=readFileSync(path.join(root,
  "ops/baota-pg18-native-readonly-preflight.sql"),"utf8")
const runnable=original.split(/\r?\n/)
  .filter(line=>!line.trim().startsWith("\\")).join("\n")

test("BaoTa PG18 preflight is only SELECT + rollback and cannot modify schemas",()=>{
  assert.match(original,/BEGIN READ ONLY;/)
  assert.match(original,/ROLLBACK;/)
  assert.match(original,/READY_FOR_NATIVE_AUTH_SCHEMA_REVIEW/)
  assert.match(original,/current_database\(\)='agent_studio'/)
  assert.match(original,/current_setting\('port'\)::integer=5333/)
  assert.match(original,/current_setting\('server_version_num'\)/)
  assert.doesNotMatch(original,/\b(?:DROP|TRUNCATE|UPDATE|DELETE|INSERT|ALTER|CREATE ROLE|CREATE TABLE)\s+/i)
})

test("actual embedded PG17 correctly refuses to approve the PG18 deployment baseline",async()=>{
  const db=await PGlite.create({extensions:{vector}})
  try{
    await db.exec("CREATE DATABASE agent_studio")
    await db.exec(freshSchemaForTest().sql)
    const previous=(await db.query("SELECT count(*)::int AS n FROM pg_tables "+
      "WHERE schemaname='agentstudio'")).rows[0].n
    const result=await db.exec(runnable)
    const output=result.map(x=>x.rows||[]).flat()
    const last=output.find(x=>Object.hasOwn(x,"deployment_preflight"))
    assert.ok(last)
    assert.equal(last.deployment_preflight,"NO_GO_CHECK_BASELINE_DETAILS")
    const after=(await db.query("SELECT count(*)::int AS n FROM pg_tables "+
      "WHERE schemaname='agentstudio'")).rows[0].n
    assert.equal(after,previous)
    // Only the embedded test copy replaces target/version/vector predicates.
    // Current baseline counts remain real and must reject RLS loss.
    const reviewed=runnable.replace("current_database()='agent_studio'","TRUE")
      .replace("current_setting('server_version_num')::integer >=180000","TRUE")
      .replace("current_setting('server_version_num')::integer <190000","TRUE")
      .replace("current_setting('port')::integer=5333","TRUE")
      .replace("(SELECT extversion FROM pg_extension WHERE extname='vector')='0.8.7'","TRUE")
    const inspect=async()=> (await db.exec(reviewed)).flatMap(r=>r.rows??[]).find(r=>Object.hasOwn(r,"deployment_preflight"))?.deployment_preflight
    assert.equal(previous,23);assert.equal(await inspect(),"READY_FOR_NATIVE_AUTH_SCHEMA_REVIEW")
    await db.exec("ALTER TABLE agentstudio.users NO FORCE ROW LEVEL SECURITY")
    assert.equal(await inspect(),"NO_GO_CHECK_BASELINE_DETAILS")
  }finally{await db.close()}
})
