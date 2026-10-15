#!/usr/bin/env node
// Read-only PostgreSQL migration readiness scanner for a VERIFIED and FROZEN
// PocketBase SQLite backup. No secrets, identifiers, row bodies, or file paths
// are written to the report. NEVER opens the application's live pb_data DB.
import fs from "node:fs"
import path from "node:path"
import {createHash} from "node:crypto"
import {DatabaseSync} from "node:sqlite"
import {fileURLToPath} from "node:url"

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..")
const sourceData=path.join(root,"pocketbase","pb_data")
const VALID_KEYS=new Set(["--snapshot","--manifest","--output","--strict"])
const groups={
  identity:["studio_users"],
  configs:["agent_specs","workflows","spec_versions","agent_templates",
    "agent_memories","agent_studio_template_invites"],
  runtime:["agent_runs","workflow_runs","run_events","workflow_events",
    "agent_studio_run_leases","agent_studio_side_effects",
    "agent_studio_execution_spans","tool_invocations","llm_jobs",
    "agent_worker_health"],
  knowledge:["agent_studio_kb_bases","agent_studio_kb_documents",
    "agent_studio_kb_chunks","agent_studio_kb_vectors",
    "agent_studio_kb_embedding_settings","agent_studio_kb_embedding_queue",
    "agent_studio_kb_access","agent_studio_kb_access_events"],
  schedules:["agent_studio_schedules","agent_studio_schedule_occurrences"],
  collaboration:["agent_studio_spec_access","agent_studio_spec_proposals",
    "agent_studio_spec_collab_audit","agent_studio_approval_delegations",
    "agent_studio_review_audit"],
  credentials:["model_connections","tool_connections","integration_tokens",
    "smithery_keys","market_connections"],
  extensions:["integration_invocations","market_cache","market_i18n"],
  schema_ledger:["agent_studio_schema_migrations"],
}
const catalog=new Map()
for(const [group,tables] of Object.entries(groups))
  for(const table of tables)catalog.set(table,group)
const targets={
  studio_users:"users",agent_specs:"agent_specs",workflows:"workflows",
  agent_runs:"runs",workflow_runs:"runs",
  agent_studio_kb_bases:"knowledge_bases",
  agent_studio_kb_documents:"knowledge_documents",
  agent_studio_kb_chunks:"knowledge_chunks",
  agent_studio_kb_vectors:"knowledge_chunks",
  agent_studio_schedules:"schedules",
  agent_studio_schedule_occurrences:"schedule_occurrences",
  agent_studio_run_leases:"run_leases",
  agent_studio_side_effects:"external_effects",
  agent_studio_approval_delegations:"approvals",
  agent_studio_review_audit:"audit_events",
}
const groupGate={
  identity:"approved_identity_and_auth_mapping_required",
  configs:"lossless_config_and_foreign_key_mapping_required",
  runtime:"execution_history_and_side_effect_fencing_required",
  knowledge:"document_vector_and_acl_mapping_required",
  schedules:"disabled_schedule_replay_plan_required",
  collaboration:"owner_consent_and_team_rbac_required",
  credentials:"reprovision_secrets_never_copy",
  extensions:"explicit_rebuild_or_archive_policy_required",
  schema_ledger:"rebuild_stage_migration_ledger_not_copy",
}
const quote=key=>'"'+String(key).replaceAll('"','""')+'"'
function fail(code){throw Error(code)}
function parse(argv){
  const result={}
  for(let i=0;i<argv.length;i++){
    const k=argv[i]
    if(!VALID_KEYS.has(k)||Object.hasOwn(result,k))fail("invalid_arguments")
    if(k==="--strict"){result[k]=true;continue}
    if(!argv[i+1]||argv[i+1].startsWith("--"))fail("invalid_arguments")
    result[k]=argv[++i]
  }
  if(!result["--snapshot"])fail("snapshot_required")
  if(!result["--manifest"])fail("verified_manifest_required")
  return result
}
function safePath(file){
  const resolved=fs.realpathSync(path.resolve(file))
  const stat=fs.lstatSync(resolved)
  if(!stat.isFile()||stat.size===0)fail("invalid_snapshot_file")
  const source=fs.existsSync(sourceData)?fs.realpathSync(sourceData):path.resolve(sourceData)
  const normalized=process.platform==="win32"
    ?s=>s.toLowerCase():s=>s
  if(normalized(resolved)===normalized(source)||
     normalized(resolved).startsWith(normalized(source+path.sep)))
    fail("refuse_live_pocketbase_data")
  return {resolved,size:stat.size,mtimeMs:stat.mtimeMs}
}
function verifiedStatSame(file,initial){
  const now=fs.statSync(file)
  if(now.size!==initial.size || now.mtimeMs!==initial.mtimeMs)
    fail("snapshot_mutated_during_read")
}
async function sha256(file){
  const hash=createHash("sha256")
  const stream=fs.createReadStream(file)
  for await(const bytes of stream)hash.update(bytes)
  return hash.digest("hex")
}
function rows(db,table){
  const found=db.prepare("SELECT COUNT(*) AS n FROM "+quote(table)).get()
  const n=Number(found?.n)
  if(!Number.isSafeInteger(n)||n<0)fail("unsafe_table_count")
  return n
}
function inspect(db){
  const tables=db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' "+
    "AND name NOT LIKE 'sqlite_%' ORDER BY name").all()
    .map(row=>String(row.name))
  const items=[]
  for(const table of tables){
    const columns=db.prepare("PRAGMA table_info("+quote(table)+")").all()
      .map(x=>String(x.name))
    const count=rows(db,table)
    const group=catalog.get(table)||
      (table.startsWith("_")?"pocketbase_internal":"unmapped")
    const exposure=columns.some(col=>/password|secret|api_key|credential|private.?key|token/i.test(col))
    const gate=group==="pocketbase_internal"
      ?"pocketbase_internal_do_not_bulk_copy":
      group==="unmapped"?"unknown_table_requires_review":groupGate[group]
    items.push({
      table,rows:count,group,postgres_target:targets[table]||null,
      action:gate,contains_credential_columns:exposure,
      owner_field_detected:columns.filter(col=>[
        "rh_user_id","owner_uid","owner_user_id","member_uid",
        "recipient_uid","reviewer_uid"].includes(col)),
      column_count:columns.length,
      blocking:count>0 && group!=="schema_ledger",
    })
  }
  return items
}
export async function run(args){
  const flags=parse(args)
  const input=safePath(flags["--snapshot"])
  const manifestFile=safePath(flags["--manifest"])
  if(input.resolved===manifestFile.resolved)fail("manifest_is_snapshot")
  let manifest
  try{manifest=JSON.parse(fs.readFileSync(manifestFile.resolved,"utf8"))}
  catch{fail("invalid_manifest_json")}
  if(manifest?.format!=="agent-studio-sqlite-snapshot-v1" ||
     !/^[a-f0-9]{64}$/.test(String(manifest.sha256))||
     !Number.isSafeInteger(manifest.bytes)||manifest.bytes<=0 ||
     !manifest.tables||typeof manifest.tables!=="object"||Array.isArray(manifest.tables))
    fail("unsupported_snapshot_manifest")
  if(input.size!==manifest.bytes ||
     await sha256(input.resolved)!==manifest.sha256)
    fail("snapshot_sha256_mismatch")
  let db
  let items
  try{
    db=new DatabaseSync(input.resolved,{readOnly:true})
    const ok=db.prepare("PRAGMA quick_check").get()
    if(Object.values(ok||{})[0]!=="ok")fail("sqlite_integrity_failed")
    items=inspect(db)
    const actual=new Map(items.map(it=>[it.table,it.rows]))
    for(const [name,total] of Object.entries(manifest.tables)){
      if(!Number.isSafeInteger(total)||total<0||
         actual.get(name)!==total)
        fail("snapshot_manifest_count_mismatch")
    }
  }finally{db?.close()}
  verifiedStatSame(input.resolved,input)
  verifiedStatSame(manifestFile.resolved,manifestFile)
  const blockers=items.filter(row=>row.blocking)
  const groupsReport={}
  for(const item of items){
    const current=groupsReport[item.group]||{tables:0,rows:0,blocking_tables:0}
    current.tables++
    current.rows+=item.rows
    current.blocking_tables+=Number(item.blocking)
    groupsReport[item.group]=current
  }
  const report={
    format:"agentstudio-pg-migration-readiness-v1",
    source:"verified_offline_pocketbase_snapshot",
    source_sha256:manifest.sha256,
    source_bytes:manifest.bytes,
    read_only:true,
    contains_row_content:false,
    contains_identity_values:false,
    contains_secret_values:false,
    data_migration_performed:false,
    postgres_connect_attempted:false,
    ready_for_isolated_inventory:true,
    ready_for_production_cutover:false,
    gates:[
      "signed_employee_identity_and_id_mapping",
      "lossless_legacy_to_pg_schema_transforms",
      "secret_reprovision_and_rotation",
      "workflow_schedule_knowledge_and_team_feature_parity",
      "real_postgresql17_tcp_parallel_worker_acceptance",
      "dryrun_row_level_reconciliation_on_new_stage_db",
      "backup_restore_and_rollback_rehearsal",
    ],
    scanned_tables:items.length,
    scanned_rows:items.reduce((n,row)=>n+row.rows,0),
    blocking_tables:blockers.length,
    credential_sensitive_tables:items.filter(row=>row.rows&&row.contains_credential_columns).length,
    unmapped_nonempty_tables:items.filter(row=>row.rows&&row.group==="unmapped").length,
    groups:groupsReport,
    inventory:items,
    warning:"Readiness inventory only. Do not interpret PG table-name similarities as lossless migrated data.",
  }
  if(flags["--output"]){
    const output=path.resolve(flags["--output"])
    const dirname=path.dirname(output)
    fs.mkdirSync(dirname,{recursive:true,mode:0o700})
    if(output===input.resolved||output===manifestFile.resolved||
      output.startsWith(path.resolve(sourceData)+path.sep))
      fail("unsafe_output_path")
    fs.writeFileSync(output,JSON.stringify(report,null,2)+"\n",
      {flag:"wx",mode:0o600})
    console.log("Redacted readiness report written (source ID and row bodies excluded).")
  }else console.log(JSON.stringify(report,null,2))
  if(flags["--strict"]&&blockers.length)process.exitCode=2
  return report
}
if(process.argv[1] &&
  path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  run(process.argv.slice(2)).catch(err=>{
    const known=new Set([
      "invalid_arguments","snapshot_required","verified_manifest_required",
      "invalid_snapshot_file","refuse_live_pocketbase_data",
      "manifest_is_snapshot","invalid_manifest_json","unsupported_snapshot_manifest",
      "snapshot_sha256_mismatch","sqlite_integrity_failed",
      "snapshot_manifest_count_mismatch","snapshot_mutated_during_read",
      "unsafe_table_count","unsafe_output_path",
    ])
    const code=known.has(err?.message)?err.message:"readiness_scan_failed"
    console.error("Migration readiness refused: "+code)
    process.exitCode=1
  })
}
