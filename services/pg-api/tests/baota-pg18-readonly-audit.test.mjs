import test from "node:test"
import assert from "node:assert/strict"
import {readFileSync} from "node:fs"
import {spawnSync} from "node:child_process"
import path from "node:path"
import {fileURLToPath} from "node:url"
import {parseOptions,run} from "../src/baota-pg18-readonly-audit.mjs"

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../../..")
const entry=path.join(root,"services/pg-api/src/baota-pg18-readonly-audit.mjs")
test("offline PG18 read-only audit plan contains no secrets or network calls",async()=>{
  const env={PGHOST:"attacker.local",DATABASE_URL:"postgres://invalid/production",
    AGENT_STUDIO_PG18_READONLY_AUDIT_ENABLED:"false"}
  const plan=await run(["--plan"],env,"win32")
  assert.deepEqual(plan,{mode:"plan",database:"agent_studio",
    host:"127.0.0.1",port:5333,expected_major:18,
    service_logins:2,read_only:true,network_used:false,
    production_cutover_allowed:false})
  assert.ok(!JSON.stringify(plan).includes("attacker.local"))
})
test("command refuses any write flag, alternate DB, and unsafe env before secrets",()=>{
  for(const args of [[],["--audit"],["--execute"],["--plan","--audit"],
    ["--audit","--confirm-database","vcaios"],
    ["--audit","--confirm-database","postgres"],
    ["--audit","--confirm-database","agent_studio","--force"]]){
    assert.throws(()=>parseOptions(args,{}, "linux"),/invalid_arguments/)
  }
  assert.throws(()=>parseOptions(["--audit","--confirm-database","agent_studio"],{},
    "linux"),/audit_not_enabled_or_unsafe_environment/)
  const safe={AGENT_STUDIO_PG18_READONLY_AUDIT_ENABLED:"true"}
  for(const env of [ {...safe,DATABASE_URL:"postgres://a"},
    {...safe,PGPORT:"5432"},{...safe,PGHOST:"prod.example"}]){
    assert.throws(()=>parseOptions(["--audit","--confirm-database","agent_studio"],
      env,"linux"),/audit_not_enabled_or_unsafe_environment/)
  }
  assert.throws(()=>parseOptions(["--audit","--confirm-database","agent_studio"],
    safe,"win32"),/audit_not_enabled_or_unsafe_environment/)
  const permitted=parseOptions(["--audit","--confirm-database","agent_studio"],
    safe,"linux")
  assert.equal(permitted.read_only,true)
  assert.equal(permitted.production_cutover_allowed,false)
})
test("run standalone --plan cannot reach a TCP socket",()=>{
  const preload="data:text/javascript,"+encodeURIComponent(
    "import net from 'node:net';"+
    "import {syncBuiltinESMExports} from 'node:module';"+
    "net.Socket.prototype.connect=()=>{throw Error('FORBIDDEN_TCP')};"+
    "syncBuiltinESMExports();")
  const child=spawnSync(process.execPath,["--import",preload,entry,"--plan"],{
    encoding:"utf8",cwd:root,timeout:10000,
    env:{...process.env,DATABASE_URL:"danger",PGHOST:"danger"}})
  assert.equal(child.status,0,child.stderr)
  const plan=JSON.parse(child.stdout)
  assert.equal(plan.network_used,false)
  assert.doesNotMatch(child.stdout+child.stderr,/FORBIDDEN_TCP|danger/)
})
test("runtime contains no SQL write operations or dangerous external effects",()=>{
  const body=readFileSync(entry,"utf8")
  assert.match(body,/BEGIN READ ONLY/)
  // PostgreSQL inet_server_addr()::text may include /32; host() strips it.
  assert.match(body,/host\(inet_server_addr\(\)\) AS server_address/)
  assert.doesNotMatch(body,/inet_server_addr\(\)::text AS server_address/)
  assert.match(body,/ROLLBACK/)
  assert.match(body,/SAVEPOINT/)
  assert.match(body,/rolbypassrls/)
  assert.match(body,/agentstudio\.actor_id/)
  assert.match(body,/42501/)
  assert.doesNotMatch(body,/\b(?:DROP|TRUNCATE|CREATE TABLE|ALTER TABLE|INSERT INTO|UPDATE\s+agentstudio|DELETE FROM)\b/i)
  assert.doesNotMatch(body,/createServer|fetch\(|spawn\(|execSync|\.listen\(/)
})
