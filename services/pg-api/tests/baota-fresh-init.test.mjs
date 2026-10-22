import test from "node:test"
import assert from "node:assert/strict"
import {createHash} from "node:crypto"
import {readFileSync} from "node:fs"
import {spawnSync} from "node:child_process"
import path from "node:path"
import {fileURLToPath} from "node:url"
import {run} from "../src/baota-fresh-init.mjs"

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../../..")
const entry=path.join(root,"services/pg-api/src/baota-fresh-init.mjs")
const schema=readFileSync(path.join(root,"db/postgres/001_stage_schema.sql"),"utf8")
test("BaoTa plan is offline and preserves canonical PostgreSQL 17 schema",async()=>{
  const plan=await run(["--plan"],{
    DATABASE_URL:"poisoned-production-url",
    AGENT_STUDIO_BAOTA_PG_HOST:"not-configured",
  })
  assert.equal(plan.mode,"plan")
  assert.equal(plan.database,"agentstudio_stage")
  assert.equal(plan.expected_postgres_major,17)
  assert.equal(plan.network_used,false)
  assert.equal(plan.production_cutover_allowed,false)
  assert.equal(plan.old_sqlite_rows_copied,0)
  assert.equal(plan.baseline_sha256,createHash("sha256").update(schema).digest("hex"))
  assert.ok(!JSON.stringify(plan).includes("poisoned"))
})
test("wrong target, unexpected flags and missing confirmation are rejected",async()=>{
  for(const arguments_ of [
    [],["--execute"],["--execute","--confirm-stage","vcaios"],
    ["--execute","--confirm-stage","postgres"],
    ["--execute","--confirm-stage","agentstudio_stage","--force"],
    ["--plan","--execute"],["--plan","--database","vcaios"],
  ])await assert.rejects(run(arguments_),/invalid_arguments/)
})
test("an ordinary invocation cannot mutate any PostgreSQL database",async()=>{
  await assert.rejects(run(["--execute","--confirm-stage","agentstudio_stage"],{}),
    /baota_init_disabled/)
})
test("explicit enable still requires approved Linux loopback and exact target",async()=>{
  const en={AGENT_STUDIO_BAOTA_FRESH_PG_ENABLED:"true"}
  const expected=process.platform==="linux"?/unsafe_baota_target/:/baota_linux_only/
  await assert.rejects(run(["--execute","--confirm-stage","agentstudio_stage"],en),expected)
})
test("offline CLI performs no TCP or unsafe filesystem secret access",()=>{
  const preload="data:text/javascript,"+encodeURIComponent(
    "import net from 'node:net';"+
    "import {syncBuiltinESMExports} from 'node:module';"+
    "net.Socket.prototype.connect=()=>{throw Error('FORBIDDEN_BAOTA_TCP')};"+
    "syncBuiltinESMExports();")
  const child=spawnSync(process.execPath,["--import",preload,entry,"--plan"],{
    cwd:root,encoding:"utf8",timeout:10000,
    env:{...process.env,
      AGENT_STUDIO_BAOTA_FRESH_PG_ENABLED:"false",
      AGENT_STUDIO_BAOTA_PG_ADMIN_PASSWORD_FILE:"/missing-secret-never-read",
      DATABASE_URL:"poisoned-production-url"}
  })
  assert.equal(child.status,0,child.stderr)
  assert.equal(JSON.parse(child.stdout).network_used,false)
  assert.doesNotMatch(child.stdout+child.stderr,/FORBIDDEN_BAOTA_TCP|poisoned-production-url/)
})
