import test from "node:test"
import assert from "node:assert/strict"
import {readFileSync} from "node:fs"
import {spawnSync} from "node:child_process"
import path from "node:path"
import {fileURLToPath} from "node:url"
import {reportFreshPgCutover} from "../ops/pg18-fresh-cutover-gate.mjs"

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..")
test("fresh cutover gate records specific PocketBase leftovers and refuses GO",()=>{
  const result=reportFreshPgCutover()
  assert.equal(result.migration,"fresh_pg18_disposable_8090_pb_testdata")
  assert.equal(result.no_sqlite_record_import_needed,true)
  assert.ok(result.pocketbase_dependent_files>20)
  const names=result.pocketbase_dependencies.map(row=>row.path)
  for(const path of [
    "src/pages/Login/LoginPage.tsx",
    "src/pages/Home/useHome.ts",
    "src/pages/WorkflowCanvas/useWorkflowCanvas.ts",
    "src/pages/ModelConnections/useModelConnections.ts",
    "src/pages/ScheduledTasks/useScheduledTasks.ts",
  ])assert.ok(names.includes(path),path)
  assert.equal(result.gates.native_cookie_session_client_isolated,true)
  assert.equal(result.gates.legacy_ui_pocketbase_dependencies,false)
  assert.equal(result.gates.full_pg_only_login_and_route_guard,false)
  assert.equal(result.gates.native_http_supports_business_writes,false)
  assert.equal(result.gates.native_run_and_approval_parity,false,
    "isolated Run/approval UAT must never be mistaken for production parity")
  assert.equal(result.gates.verified_pg18_worker_operations,false)
  assert.equal(result.cutover_allowed,false)
  assert.equal(result.old_pocketbase_must_remain_running,true)
  assert.equal(result.sqlite_data_deleted,false)
  assert.equal(result.network_used,false)
  assert.equal(result.writes_performed,false)
})
test("gate requires explicit command and --assert-ready returns failure without writes",()=>{
  const cli=path.join(root,"ops/pg18-fresh-cutover-gate.mjs")
  const check=spawnSync(process.execPath,[cli,"--assert-ready"],{
    encoding:"utf8",timeout:18000,
    env:{...process.env,DATABASE_URL:"postgres://must-not-connect"}
  })
  assert.equal(check.status,3,check.stderr)
  const report=JSON.parse(check.stdout)
  assert.equal(report.cutover_allowed,false)
  assert.ok(report.blockers.length>=5)
  assert.equal(report.network_used,false)
  assert.equal(report.writes_performed,false)
  const missing=spawnSync(process.execPath,[cli],{
    encoding:"utf8",timeout:16000
  })
  assert.equal(missing.status,2)
  assert.match(missing.stderr,/invalid_arguments/)
})
test("the evidence reporter does not modify production services or expose secrets",()=>{
  const source=readFileSync(path.join(root,"ops/pg18-fresh-cutover-gate.mjs"),"utf8")
  assert.doesNotMatch(source,/execSync|spawnSync|writeFile|unlink|rmSync|fetch\(|new Pool|new PocketBase/)
  assert.match(source,/cutover_allowed:blockers.length===0/)
  assert.match(source,/no_sqlite_record_import_needed:true/)
})
