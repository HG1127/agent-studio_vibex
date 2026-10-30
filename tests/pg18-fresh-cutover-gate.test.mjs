import test from "node:test"
import assert from "node:assert/strict"
import {readFileSync} from "node:fs"
import {createHash} from "node:crypto"
import {spawnSync} from "node:child_process"
import path from "node:path"
import {fileURLToPath,pathToFileURL} from "node:url"
import {reportFreshPgCutover} from "../ops/pg18-fresh-cutover-gate.mjs"

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..")
test("source inventory separates retained legacy references from missing release evidence",()=>{
  const result=reportFreshPgCutover()
  assert.equal(result.report_schema,"fresh_pg18_source_inventory_v2")
  assert.equal(result.evidence_scope,"source_inventory_only")
  assert.equal(result.is_authority,false)
  assert.equal(result.migration,"fresh_pg18_disposable_8090_pb_testdata")
  assert.equal(result.no_sqlite_record_import_needed,true)
  assert.equal(result.source_branch_target,null)
  assert.equal(result.source_branch_selection_required,true)
  assert.equal(result.pocketbase_dependent_files,result.pocketbase_dependencies.length)
  assert.ok(result.measured_frontend_source_files>=result.pocketbase_dependent_files)
  assert.equal(result.source_observations.retained_legacy_code_is_not_a_cutover_blocker_by_itself,true)
  assert.equal(result.source_observations.legacy_reference_scope,"source_text_hints_not_runtime_reachability")
  for(const name of ["verified_pg_only_web_build","verified_existing_reachable_feature_parity","native_run_and_approval_parity","verified_pg18_worker_operations","independent_https_employee_uat","verified_8090_full_rollback","explicit_production_cutover_signoff"]){
    assert.equal(result.gates[name],false,name);assert.ok(result.blockers.includes(name),name)
  }
  assert.ok(result.required_evidence.every(x=>x.status==="not_evaluated_by_source_report"&&result.gates[x.key]===false))
  assert.equal(result.cutover_allowed,false)
  assert.equal(result.old_pocketbase_must_remain_running,true)
  assert.equal(result.sqlite_data_deleted,false)
  assert.equal(result.network_used,false)
  assert.equal(result.writes_performed,false)
})
test("selected entry fingerprints identify actual raw source bytes without claiming full closure",()=>{
  const result=reportFreshPgCutover(),entries=result.source_observations.selected_entrypoints
  assert.ok(entries.length>=6)
  assert.equal(new Set(entries.map(x=>x.path)).size,entries.length)
  assert.ok(entries.some(x=>x.path==="services/pg-api/src/native-server.ts"))
  assert.ok(entries.some(x=>x.path==="services/pg-api/src/worker-heartbeat-activation-control-service.ts"))
  assert.equal(result.source_observations.fingerprint_scope,"raw_worktree_bytes_of_selected_entrypoints_not_dependency_closure")
  for(const row of entries){
    assert.equal(path.isAbsolute(row.path),false);assert.ok(!row.path.split("/").includes(".."))
    const bytes=readFileSync(path.join(root,row.path))
    assert.equal(row.bytes,bytes.length);assert.equal(row.sha256,createHash("sha256").update(bytes).digest("hex"))
  }
})
test("gate requires explicit command and --assert-ready returns failure without writes",()=>{
  const cli=path.join(root,"ops/pg18-fresh-cutover-gate.mjs")
  const sentinel="postgres://source_report_must_not_connect_or_print_this"
  const code=`import {registerHooks} from "node:module";
  registerHooks({resolve(s,c,n){if(["node:net","node:tls","node:http","node:https","node:sqlite","node:child_process","pg","pocketbase"].includes(s))throw Error("unexpected_source_report_effect");return n(s,c)}});
  globalThis.fetch=()=>{throw Error("unexpected_source_report_effect")};
  process.argv=[process.execPath,${JSON.stringify(cli)},"--assert-ready"];
  await import(${JSON.stringify(pathToFileURL(cli).href)});`
  const check=spawnSync(process.execPath,["--input-type=module","-e",code],{
    encoding:"utf8",timeout:18000,
    env:{...process.env,DATABASE_URL:sentinel,PGHOST:"must-not-connect",AGENT_STUDIO_PG_CUTOVER_APPROVED:"true"}
  })
  assert.equal(check.status,3,check.stderr)
  assert.doesNotMatch(check.stdout+check.stderr,/unexpected_source_report_effect/)
  assert.ok(!check.stdout.includes(sentinel))
  const report=JSON.parse(check.stdout)
  assert.equal(report.cutover_allowed,false)
  assert.ok(report.blockers.length>=5)
  assert.equal(report.network_used,false)
  assert.equal(report.writes_performed,false)
  for(const args of [[],["--force-go"],["--report","--assert-ready"]]){
    const invalid=spawnSync(process.execPath,[cli,...args],{encoding:"utf8",timeout:16000})
    assert.equal(invalid.status,2);assert.match(invalid.stderr,/invalid_arguments/)
  }
})
test("the evidence reporter does not modify production services or expose secrets",()=>{
  const source=readFileSync(path.join(root,"ops/pg18-fresh-cutover-gate.mjs"),"utf8")
  assert.doesNotMatch(source,/execSync|spawnSync|writeFile|unlink|rmSync|fetch\(|new Pool|new PocketBase/)
  assert.match(source,/cutover_allowed:blockers.length===0/)
  assert.match(source,/no_sqlite_record_import_needed:true/)
})
