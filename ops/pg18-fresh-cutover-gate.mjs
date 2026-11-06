#!/usr/bin/env node
// Read-only source inventory for a fresh PG18 cutover of disposable PB test data.
// This never connects to SQLite/PostgreSQL, runs Workers, modifies websites,
// changes config or certifies deployment. Actual release evidence is assessed
// separately; neither a source-text hint nor retained legacy code proves parity.
import {readFileSync,readdirSync} from "node:fs"
import {createHash} from "node:crypto"
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
const entrypointPaths=Object.freeze([
  "src/App.tsx","src/lib/pgNativeSession.ts",
  "services/pg-api/src/native-server.ts",
  "services/pg-api/src/worker-loop.ts",
  "services/pg-api/src/model-worker-loop.ts",
  "services/pg-api/src/workflow-worker-loop.ts",
  "services/pg-api/src/worker-heartbeat-activation-control-service.ts",
  "services/pg-api/src/native-company-worker-heartbeats.ts",
  "services/pg-api/src/pg18-fresh-runtime-source.mjs",
  "ops/verify-pg18-only-web-build.mjs",
])
const requiredEvidence=Object.freeze([
  "verified_final_candidate_and_delivery_closure",
  "verified_pg_only_web_build",
  "verified_existing_reachable_feature_parity",
  "verified_native_http_employee_and_business_flows",
  "native_run_and_approval_parity",
  "full_workflow_execution_parity",
  "verified_pg18_worker_operations",
  "verified_worker_transitive_model_secret_denial",
  "verified_owner_model_worker_broker_parity",
  "independent_https_employee_uat",
  "verified_target_network_and_minimal_privileges",
  "verified_target_long_running_workers",
  "verified_8090_full_rollback",
  "explicit_production_cutover_signoff",
])
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
  const entrypoints=entrypointPaths.map(relative=>{
    const bytes=readFileSync(path.join(root,relative))
    return {path:relative,bytes:bytes.length,sha256:createHash("sha256").update(bytes).digest("hex")}
  })
  // This command has no target, UAT, backup or signed-release inputs. Explicitly
  // leave those gates unevaluated instead of inferring them from substrings.
  const results=Object.fromEntries(requiredEvidence.map(key=>[key,false]))
  const blockers=Object.entries(results).filter(([key,ready])=>!ready)
    .map(([key])=>key)
  return {
    mode:"report",migration:"fresh_pg18_disposable_8090_pb_testdata",
    report_schema:"fresh_pg18_source_inventory_v2",
    evidence_scope:"source_inventory_only",is_authority:false,
    source_branch_target:null,source_branch_selection_required:true,
    measured_frontend_source_files:sourceFiles("src").length,
    pocketbase_dependent_files:legacy.length,
    pocketbase_dependencies:legacy,
    source_observations:{
      legacy_reference_scope:"source_text_hints_not_runtime_reachability",
      retained_legacy_code_is_not_a_cutover_blocker_by_itself:true,
      selected_entrypoints:entrypoints,
      fingerprint_scope:"raw_worktree_bytes_of_selected_entrypoints_not_dependency_closure",
    },
    required_evidence:requiredEvidence.map(key=>({key,status:"not_evaluated_by_source_report"})),
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
