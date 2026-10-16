#!/usr/bin/env node
// V8.8 migration operator. All input is one consistent, verified,
// operator-approved OFFLINE PocketBase SQLite snapshot. This process
// coordinates existing one-shot, fail-closed importers. It never creates
// or changes a production database and never declares production GO.
//
// NOTE: Each domain importer commits its own transaction. On failure the
// isolated STAGE may be PARTIAL; idempotent rerun of the SAME snapshot is
// supported. Operations must restore/discard the separate stage DB on failure.
import fs from "node:fs"
import path from "node:path"
import {fileURLToPath} from "node:url"
import {createHash} from "node:crypto"
import {spawnSync} from "node:child_process"
import {DatabaseSync} from "node:sqlite"

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../../..")
const service=path.join(root,"services","pg-api","src")
const liveDir=path.join(root,"pocketbase","pb_data")
const phases={
  identity:"stage-user-import-cli.ts",
  agent:"stage-agent-import-cli.ts",
  workflow:"stage-domain-import-cli.ts",
  knowledge_empty:"stage-knowledge-base-import-cli.ts",
  knowledge_combined:"stage-kb-combined-import-cli.ts",
  knowledge_atomic:"stage-kb-atomic-import-cli.ts",
  schedules:"stage-domain-import-cli.ts",
  collaboration:"stage-domain-import-cli.ts",
  agent_events:"stage-domain-import-cli.ts",
  workflow_history:"stage-domain-import-cli.ts",
  history:"stage-domain-import-cli.ts",
  reconciliation:"stage-reconciliation-cli.ts",
}
const businessTables={
  agent:"agent_specs",workflow:"workflows",
  knowledge_empty:"agent_studio_kb_bases",
  schedules:"agent_studio_schedules",history:"agent_runs",
}
const collaboration=[
  "agent_studio_spec_access","agent_studio_kb_access",
  "agent_studio_spec_proposals","agent_studio_kb_access_events",
  "agent_studio_spec_collab_audit","agent_studio_spec_revisions",
]
const kbContent=[
  "agent_studio_kb_documents","agent_studio_kb_chunks",
  "agent_studio_kb_vectors",
]
const kbEmbeddingState=[
  "agent_studio_kb_embedding_settings",
  "agent_studio_kb_embedding_queue",
]
const workflowHistoryTables=["workflow_runs","workflow_events"]
const agentEventTables=["run_events"]
const namesOfKnownBusiness=new Set([
  "studio_users","model_connections",...Object.values(businessTables),
  ...collaboration,...kbContent,...kbEmbeddingState,...workflowHistoryTables,...agentEventTables,
  "agent_studio_schema_migrations",
])
// Never skip arbitrary underscore-prefixed SQLite tables. Only these
// audited PocketBase-owned control tables are rebuilt by the new platform,
// and even then the operator reports their nonzero inventory explicitly.
// Unknown _tables (including auth-related tables) MUST block stage import.
const pocketBasePlatformAuthTables=new Set([
  "_superusers","_mfas","_otps","_externalAuths","_authOrigins",
])
const pocketBasePlatformTables=new Set([
  "_collections","_migrations","_params","_logs","_requests",
  ...pocketBasePlatformAuthTables,
])
function fail(code){throw Error(code)}
function options(argv){
  const args={}
  const fields=new Set([
    "--plan","--execute","--snapshot","--manifest","--mapping",
    "--oidc","--approval","--confirm-isolated-stage","--allow-partial-trial",
  ])
  for(let i=0;i<argv.length;i++){
    const flag=argv[i]
    if(!fields.has(flag)||Object.hasOwn(args,flag))fail("invalid_arguments")
    if(["--plan","--execute","--allow-partial-trial"].includes(flag)){
      args[flag]=true
      continue
    }
    const value=argv[++i]
    if(!value||value.startsWith("--"))fail("invalid_arguments")
    args[flag]=value
  }
  if(Boolean(args["--plan"])===Boolean(args["--execute"])||
     ["--snapshot","--manifest","--mapping","--oidc","--approval"]
       .some(k=>typeof args[k]!=="string"))
    fail("invalid_arguments")
  if(args["--execute"]&&(
     args["--confirm-isolated-stage"]!=="agentstudio_stage"||
     args["--allow-partial-trial"]!==true))
    fail("isolated_stage_confirmation_required")
  if(args["--plan"]&&(
     args["--confirm-isolated-stage"]||args["--allow-partial-trial"]))
    fail("invalid_arguments")
  return args
}
function checkedFile(file,kind){
  const full=fs.realpathSync(path.resolve(file))
  const stat=fs.lstatSync(full)
  if(!stat.isFile()||!stat.size)fail("invalid_"+kind+"_input")
  const live=fs.existsSync(liveDir)?fs.realpathSync(liveDir):liveDir
  const normal=(value)=>process.platform==="win32"?
    value.toLowerCase():value
  if(normal(full)===normal(live)||
     normal(full).startsWith(normal(live+path.sep)))
    fail("live_pocketbase_source_forbidden")
  if(kind!=="snapshot"&&stat.size>5_000_000)
    fail("oversized_review_file")
  return {full,bytes:stat.size,modified:stat.mtimeMs}
}
const sha256=file=>createHash("sha256")
  .update(fs.readFileSync(file)).digest("hex")
function sealedSource(args){
  const paths=[
    checkedFile(args["--snapshot"],"snapshot"),
    checkedFile(args["--manifest"],"manifest"),
    checkedFile(args["--mapping"],"mapping"),
    checkedFile(args["--oidc"],"oidc"),
    checkedFile(args["--approval"],"approval"),
  ]
  if(new Set(paths.map(p=>p.full.toLowerCase())).size!==paths.length)
    fail("duplicate_operator_files")
  const [source,manifestFile,mappingFile,oidcFile,approvalFile]=paths
  if(["-wal","-shm","-journal"].some(s=>fs.existsSync(source.full+s)))
    fail("source_has_sqlite_sidecars")
  const fingerprints=paths.map(x=>sha256(x.full))
  let manifest,mapping,oidc,approval
  try{
    manifest=JSON.parse(fs.readFileSync(manifestFile.full,"utf8"))
    mapping=JSON.parse(fs.readFileSync(mappingFile.full,"utf8"))
    oidc=JSON.parse(fs.readFileSync(oidcFile.full,"utf8"))
    approval=JSON.parse(fs.readFileSync(approvalFile.full,"utf8"))
  }catch{fail("unreadable_operator_metadata")}
  const digest=fingerprints[0]
  if(manifest?.format!=="agent-studio-sqlite-snapshot-v1"||
     manifest.sha256!==digest||manifest.bytes!==source.bytes||
     !manifest.tables||typeof manifest.tables!=="object"||
     Array.isArray(manifest.tables))
    fail("snapshot_manifest_not_verified")
  if(mapping?.schema_version!=="studio-approved-identity-map-v2"||
     mapping.source_sha256!==digest||!Array.isArray(mapping.records)||
     oidc?.schema_version!=="studio-reviewed-oidc-provision-v1"||
     oidc.source_sha256!==digest||!Array.isArray(oidc.records)||
     approval?.source_sha256!==digest||
     typeof approval.approved_by!=="string"||
     approval.approved_by.trim().length<2||
     typeof approval.approved_at!=="string"||
     !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/.test(approval.approved_at)||
     !Number.isFinite(Date.parse(approval.approved_at)))
    fail("unapproved_operator_reviews")
  let counts={}
  const sqlite=new DatabaseSync(source.full,{readOnly:true})
  try{
    const check=sqlite.prepare("PRAGMA quick_check").get()
    if(Object.values(check||{})[0]!=="ok")fail("sqlite_integrity_failed")
    const tables=sqlite.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' "+
      "AND name NOT GLOB 'sqlite_*' ORDER BY name"
    ).all().map(r=>String(r.name))
    if(!tables.length||Object.keys(manifest.tables).length!==tables.length)
      fail("backup_manifest_incomplete")
    for(const name of tables){
      if(!/^[A-Za-z_][A-Za-z0-9_]{0,120}$/.test(name))
        fail("unsupported_sqlite_table_name")
      const count=Number(sqlite.prepare('SELECT COUNT(*) AS n FROM "'+name+'"').get().n)
      if(!Number.isSafeInteger(count)||count<0||count!==manifest.tables[name])
        fail("snapshot_manifest_table_mismatch")
      counts[name]=count
    }
    if(!Object.hasOwn(counts,"studio_users")||!counts.studio_users)
      fail("no_source_users")
  }finally{sqlite.close()}
  const verify=()=>{
    if(paths.some((p,i)=>{
      const stat=fs.statSync(p.full)
      return stat.size!==p.bytes||stat.mtimeMs!==p.modified||
        sha256(p.full)!==fingerprints[i]
    })||["-wal","-shm","-journal"].some(s=>fs.existsSync(source.full+s)))
      fail("operator_inputs_modified_during_trial")
  }
  verify()
  return {source_sha256:digest,counts,verify}
}
const sum=(counts,keys)=>keys.reduce((n,k)=>n+(counts[k]??0),0)
function candidatePhases(counts){
  if((sum(counts,kbContent)+sum(counts,kbEmbeddingState))>0 &&
     !(counts.agent_studio_kb_bases>0))
    fail("orphan_kb_content_without_base")
  const enabled=["identity"]
  if((counts.agent_specs??0)>0)enabled.push("agent")
  if((counts.workflows??0)>0)enabled.push("workflow")
  if((counts.agent_studio_kb_bases??0)>0){
    // Nonempty historical embedding settings/queue MUST NOT enter ordinary
    // W2/W6 paths. W18 requires a verified W16 same-snapshot capability.
    enabled.push(sum(counts,kbEmbeddingState)>0?
      "knowledge_combined":sum(counts,kbContent)>0?
      "knowledge_atomic":"knowledge_empty")
  }
  if((counts.agent_studio_schedules??0)>0)enabled.push("schedules")
  if(sum(counts,collaboration)>0)enabled.push("collaboration")
  if(sum(counts,workflowHistoryTables)>0)enabled.push("workflow_history")
  if((counts.agent_runs??0)>0)enabled.push("history")
  if(sum(counts,agentEventTables)>0)enabled.push("agent_events")
  enabled.push("reconciliation")
  return enabled
}
function commandFor(phase,args,mode){
  const base=[
    "--snapshot",args["--snapshot"],
    "--manifest",args["--manifest"],
    "--mapping",args["--mapping"],
  ]
  const command=[
    ...(mode==="plan"?["--plan"]:["--execute"]),
    ...base,
  ]
  if(phase==="identity")
    command.push("--oidc",args["--oidc"])
  if(phase==="reconciliation")
    command.push("--approval",args["--approval"],"--reviewed-idp",args["--oidc"])
  if(phase==="knowledge_combined"&&mode!=="plan")
    command.push("--confirm-stage","agentstudio_stage")
  const kind={
    workflow:"workflow",schedules:"schedules",
    collaboration:"collaboration",history:"history",
    workflow_history:"workflow-history",agent_events:"agent-events",
  }[phase]
  if(kind){
    command.push("--domain",kind)
    if(mode!=="plan")command.push("--confirm-stage","agentstudio_stage")
  }
  return [path.join(service,phases[phase]),command]
}
function runPhase(phase,args,mode){
  const [entry,flags]=commandFor(phase,args,mode)
  const env={...process.env,
    AGENT_STUDIO_PG_STAGE_USER_IMPORT_ENABLED:"false",
    AGENT_STUDIO_PG_STAGE_AGENT_IMPORT_ENABLED:"false",
    AGENT_STUDIO_PG_STAGE_KB_IMPORT_ENABLED:"false",
    AGENT_STUDIO_PG_STAGE_KB_COMBINED_ENABLED:"false",
    AGENT_STUDIO_PG_STAGE_KB_ATOMIC_ENABLED:"false",
    AGENT_STUDIO_PG_STAGE_DOMAIN_IMPORT_ENABLED:"false",
    AGENT_STUDIO_PG_STAGE_RECONCILIATION_ENABLED:"false",
  }
  if(mode==="execute"){
    const flag={
      identity:"AGENT_STUDIO_PG_STAGE_USER_IMPORT_ENABLED",
      agent:"AGENT_STUDIO_PG_STAGE_AGENT_IMPORT_ENABLED",
      knowledge_empty:"AGENT_STUDIO_PG_STAGE_KB_IMPORT_ENABLED",
      knowledge_combined:"AGENT_STUDIO_PG_STAGE_KB_COMBINED_ENABLED",
      knowledge_atomic:"AGENT_STUDIO_PG_STAGE_KB_ATOMIC_ENABLED",
      workflow:"AGENT_STUDIO_PG_STAGE_DOMAIN_IMPORT_ENABLED",
      schedules:"AGENT_STUDIO_PG_STAGE_DOMAIN_IMPORT_ENABLED",
      collaboration:"AGENT_STUDIO_PG_STAGE_DOMAIN_IMPORT_ENABLED",
      agent_events:"AGENT_STUDIO_PG_STAGE_DOMAIN_IMPORT_ENABLED",      workflow_history:"AGENT_STUDIO_PG_STAGE_DOMAIN_IMPORT_ENABLED",      history:"AGENT_STUDIO_PG_STAGE_DOMAIN_IMPORT_ENABLED",
      reconciliation:"AGENT_STUDIO_PG_STAGE_RECONCILIATION_ENABLED",
    }[phase]
    env[flag]="true"
    if(phase==="reconciliation"){
      env.AGENT_STUDIO_PG_RECONCILIATION_USER="agentstudio_admin"
      env.AGENT_STUDIO_PG_STAGE_RECONCILIATION_PASSWORD_FILE=
        env.AGENT_STUDIO_PG_IMPORT_PASSWORD_FILE||""
    }
    env.AGENT_STUDIO_PG_IMPORT_USER="agentstudio_admin"
  }
  const cmd=spawnSync(process.execPath,[
    "--experimental-strip-types",entry,...flags,
  ],{cwd:root,env,encoding:"utf8",timeout:95000,
    maxBuffer:1024*1024,windowsHide:true})
  let value=null
  try{value=JSON.parse(cmd.stdout||"null")}catch{}
  // Refuse raw child exception text: it might contain source file paths or
  // private content. Only return validated redacted JSON summary fields.
  const report=value&&typeof value==="object"?
    {
      source_count:value.source_rows??value.reviewed_users??value.compatible_records??
        value.metadata_bases_with_content??null,
      blocked:value.incompatible_records??value.blocked_bases??null,
      result:value.result??"",
      imported:value.imported??value.users_created??value.metadata_imported??null,
      replayed:value.replayed??value.users_replayed??value.metadata_replayed??null,
      reconciled:value.reconciled??value.users_reconciled??null,
    }:null
  return {
    phase,status:cmd.status===0?"passed":"blocked",
    exit_code:cmd.status??1,
    summary:report,
  }
}
function secureOperatorTarget(){
  if(process.env.AGENT_STUDIO_PG_STAGE_OPERATOR_ENABLED!=="true")
    fail("stage_operator_disabled")
  if(process.env.GITHUB_ACTIONS==="true")
    fail("real_business_snapshot_forbidden_in_github_ci")
  if(!["127.0.0.1","postgres"].includes(
     String(process.env.AGENT_STUDIO_PG_HOST))||
     process.env.AGENT_STUDIO_PG_DATABASE!=="agentstudio_stage"||
     process.env.AGENT_STUDIO_PG_IMPORT_USER!=="agentstudio_admin")
    fail("stage_operator_unsafe_target")
  if(!process.env.AGENT_STUDIO_PG_IMPORT_PASSWORD_FILE)
    fail("stage_operator_password_file_required")
  checkedFile(process.env.AGENT_STUDIO_PG_IMPORT_PASSWORD_FILE,"stage_password")
}
export async function run(argv){
  const args=options(argv)
  if(args["--execute"])secureOperatorTarget()
  const snapshot=sealedSource(args)
  const phasesToRun=candidatePhases(snapshot.counts)
  const inventory=Object.entries(snapshot.counts)
  const excludedPlatform=inventory.filter(([name,n])=>
    n>0&&pocketBasePlatformTables.has(name))
  const excludedAuth=excludedPlatform.filter(([name])=>
    pocketBasePlatformAuthTables.has(name))
  const unmapped=inventory.filter(([name,n])=>
    n>0&&!namesOfKnownBusiness.has(name)&&
    !pocketBasePlatformTables.has(name)).map(([name,n])=>({
      table:name,rows:n,
    }))
  const stage={
    operation:args["--plan"]?"dry_run":"isolated_stage_trial",
    source_sha256:snapshot.source_sha256,
    source_snapshot_verified:true,
    full_manifest_verified:true,
    source_tables:Object.keys(snapshot.counts).length,
    // Explicitly excluded platform metadata still requires independent
    // identity/schema/rules reconstruction and operator sign-off. No source
    // table names, values, account IDs or secrets enter a public report.
    excluded_platform_table_count:excludedPlatform.length,
    excluded_platform_row_count:excludedPlatform.reduce(
      (count,[,rows])=>count+rows,0),
    excluded_auth_table_count:excludedAuth.length,
    excluded_auth_row_count:excludedAuth.reduce(
      (count,[,rows])=>count+rows,0),
    legacy_auth_reprovision_review_required:excludedAuth.length>0,
    platform_configuration_rebuild_required:excludedPlatform.length>0,
    unmapped_nonempty_tables:unmapped.length,
    source_credential_rows:snapshot.counts.model_connections??0,
    source_dependent_data_not_activated:true,
    execution_would_be_partial_by_design:true,
    production_cutover_allowed:false,
  }
  // A newly discovered nonempty business table MUST NOT vanish from the
  // stage trial. A SHA-complete inventory is evidence of existence, not an
  // authorization to omit that table during migration. Do not connect PG.
  if(unmapped.length){
    console.log(JSON.stringify({...stage,result:"preflight_blocked",
      phase_results:[],blockers:["unmapped_nonempty_legacy_tables"]},null,2))
    process.exitCode=2
    return
  }
  const results=[]
  // Preflight EVERY active domain before ANY database write. Failures stop
  // the entire trial rather than leaving an avoidable partial stage.
  for(const phase of phasesToRun){
    const check=runPhase(phase,args,"plan")
    results.push(check)
  }
  snapshot.verify()
  const rejected=results.filter(x=>x.status==="blocked")
  if(rejected.length){
    console.log(JSON.stringify({...stage,result:"preflight_blocked",
      phase_results:results,
      blockers:["unverified_or_incompatible_source_domain"]},null,2))
    process.exitCode=2
    return
  }
  if(args["--plan"]){
    console.log(JSON.stringify({...stage,result:"preflight_verified",
      phase_results:results,
      blockers:["real_stage_import_not_run",
        ...(excludedAuth.length?
          ["pocketbase_legacy_auth_reprovision_unverified"]:[]),
        ...(excludedPlatform.length?
          ["pocketbase_platform_metadata_rebuild_unverified"]:[]),
        "credentials_and_unsupported_features_need_separate_policy",
        "production_parity_and_rollback_not_verified"]},null,2))
    return
  }
  const applied=[]
  for(const phase of phasesToRun){
    snapshot.verify()
    const result=runPhase(phase,args,"execute")
    applied.push(result)
    if(phase==="reconciliation"&&result.exit_code===2){
      console.log(JSON.stringify({...stage,
        result:"stage_imported_reconciliation_incomplete",
        phase_results:applied,
        blockers:["unreconciled_business_domains",
          "production_cutover_forbidden"]},null,2))
      process.exitCode=2
      return
    }
    if(result.status==="blocked"){
      console.log(JSON.stringify({...stage,result:"partial_stage_must_not_switch",
        phase_results:applied,
        blockers:["isolated_stage_must_be_reconciled_or_discarded",
          "production_cutover_forbidden"]},null,2))
      process.exitCode=2
      return
    }

  }
  console.log(JSON.stringify({...stage,result:"stage_trial_staged_not_production_ready",
    phase_results:applied,
    blockers:["real_business_uat_not_performed","production_cutover_forbidden"]},null,2))
}
export async function main(argv){
  return run(argv).catch(error=>{
    const allowed=new Set([
      "invalid_arguments","isolated_stage_confirmation_required",
      "invalid_snapshot_input","invalid_manifest_input",
      "invalid_mapping_input","invalid_oidc_input","invalid_approval_input",
      "orphan_kb_content_without_base",
      "duplicate_operator_files","live_pocketbase_source_forbidden",
      "source_has_sqlite_sidecars","oversized_review_file",
      "unreadable_operator_metadata","snapshot_manifest_not_verified",
      "unapproved_operator_reviews","sqlite_integrity_failed",
      "backup_manifest_incomplete","unsupported_sqlite_table_name",
      "snapshot_manifest_table_mismatch","no_source_users",
      "operator_inputs_modified_during_trial",
      "stage_operator_disabled","stage_operator_unsafe_target",
      "stage_operator_password_file_required",
      "real_business_snapshot_forbidden_in_github_ci",
    ])
    const code=error instanceof Error?error.message:""
    console.error("Isolated stage operator refused: "+
      (allowed.has(code)?code:"operator_preflight_failed"))
    process.exitCode=1
  })
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  void main(process.argv.slice(2))
}
