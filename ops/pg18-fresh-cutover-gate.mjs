#!/usr/bin/env node
// Read-only evidence gate for a fresh PG18 cutover of DISPOSABLE 8090 PB TEST DATA.
// This never connects to SQLite/PostgreSQL, runs Workers, modifies websites,
// changes config or certifies a cutover from a green unit-test result.
import {readFileSync,readdirSync} from "node:fs"
import path from "node:path"
import {fileURLToPath} from "node:url"

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..")
const read=relative=>readFileSync(path.join(root,relative),"utf8")
function sourceFiles(dir){
  const entries=readdirSync(path.join(root,dir),{withFileTypes:true})
  return entries.flatMap(e=>{
    const rel=dir+"/"+e.name
    if(e.isDirectory())return sourceFiles(rel)
    return e.isFile()&&/\.(?:ts|tsx|js|jsx)$/.test(e.name)?[rel]:[]
  })
}
const apiRoot="services/pg-api/src/"
const oldDependencyPatterns={
  pocketbase_import:/\bfrom\s*["'][^"']*(?:pocketbase|(?:@\/|\.\.?\/)+lib\/pb)["']/,
  pocketbase_url:/\bgetPocketBaseUrl\s*\(/,
  pocketbase_collection:/\bpb\.collection\s*\(/,
  pocketbase_token:/\b(?:pb\.authStore|vibexAuthHeaders|verifyStudioSession|decodeRhToken|redirectToRhLogin)\s*(?:\(|\.)/,
}
export function reportFreshPgCutover(){
  const legacy=[]
  for(const rel of sourceFiles("src")){
    const code=read(rel)
    const deps=Object.entries(oldDependencyPatterns).filter(([name,re])=>re.test(code))
      .map(([name])=>name)
    if(deps.length)legacy.push({path:rel,dependencies:deps})
  }
  const app=read("src/App.tsx")
  const nativeServer=read(apiRoot+"native-server.ts")
  const nativeAuthClient=read("src/lib/pgNativeSession.ts")
  const worker=read(apiRoot+"worker-loop.ts")
  const modelWorker=read(apiRoot+"model-worker-loop.ts")
  const workflowWorker=read(apiRoot+"workflow-worker-loop.ts")
  const results={
    legacy_ui_pocketbase_dependencies:legacy.length===0,
    full_pg_only_login_and_route_guard:
      !app.includes("verifyStudioSession")&&!app.includes("studioAuth"),
    native_http_supports_business_writes:
      !nativeServer.includes("pilot_business_writes_disabled")&&
      !nativeServer.includes('if(req.method!=="GET")'),
    native_http_supports_employee_provisioning:
      !nativeServer.includes("allowEmployeeProvisioning:false"),
    // A source-level, opt-in UAT repository is NOT operational parity.
    // This gate requires independent real PG18 Worker/approval/HTTPS UAT;
    // never flip a production gate from a substring found in source code.
    native_run_and_approval_parity:false,
    // Start/End-only safe-node Worker is a real slice, not full Workflow parity.
    full_workflow_execution_parity:false,
    verified_pg18_worker_operations:false, // needs real operator UAT
    // Source migrations now separate the broker role, but the real PG18
    // login-level privilege test has not yet been run on the target database.
    // Never flip this gate based only on isolated PGlite tests.
    verified_worker_transitive_model_secret_denial:false,
    verified_owner_model_worker_broker_parity:false,
    independent_https_employee_uat:false, // needs real browser evidence
    verified_8090_full_rollback:false, // needs real backup/restore exercise
    native_cookie_session_client_isolated:
      nativeAuthClient.includes('credentials:"same-origin"') &&
      !/from\s*["'][^"']*(?:pocketbase|lib\/pb)/.test(nativeAuthClient),
    worker_has_separate_pg18_opt_in:
      worker.includes("selectPgRuntimeTarget")&&
      modelWorker.includes("selectPgRuntimeTarget")&&
      workflowWorker.includes("selectPgRuntimeTarget")&&
      workflowWorker.includes("AGENT_STUDIO_PG_WORKFLOW_WORKER_APPROVED"),
  }
  const blockers=Object.entries(results).filter(([key,ready])=>!ready)
    .map(([key])=>key)
  return {
    mode:"report",migration:"fresh_pg18_disposable_8090_pb_testdata",
    source_branch_target:"migration/postgres-v8-6-staging-20261015",
    measured_frontend_source_files:sourceFiles("src").length,
    pocketbase_dependent_files:legacy.length,
    pocketbase_dependencies:legacy,
    gates:results,blockers,
    cutover_allowed:blockers.length===0,
    old_pocketbase_must_remain_running:blockers.length!==0,
    no_sqlite_record_import_needed:true,
    sqlite_data_deleted:false,
    network_used:false,writes_performed:false,
  }
}
function main(args){
  if(args.length!==1||!["--report","--assert-ready"].includes(args[0])){
    process.stderr.write("FRESH_PG18_CUTOVER_GATE:invalid_arguments\n")
    process.exitCode=2
    return
  }
  const report=reportFreshPgCutover()
  process.stdout.write(JSON.stringify(report,null,2)+"\n")
  if(args[0]==="--assert-ready"&&!report.cutover_allowed)
    process.exitCode=3
}
if(process.argv[1]&&path.resolve(process.argv[1])===
  fileURLToPath(import.meta.url))main(process.argv.slice(2))
