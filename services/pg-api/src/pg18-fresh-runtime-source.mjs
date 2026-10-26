// Fixed, reviewed source sequence for a NEW database. No legacy import stamps.
import {readFileSync} from "node:fs"
import {createHash} from "node:crypto"
import {fileURLToPath} from "node:url"
import path from "node:path"
import {captureFreshPg18Baseline} from "./baota-pg18-fresh-init.mjs"
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../../..")
const suffixes=["019_model_connections","020_model_credential_broker","021_tool_connections","022_schedule_draft_fence","023_workflow_safe_worker",
  "024_bound_dispatch_identity","025_workflow_model_identity","026_workflow_tool_identity","027_workflow_agent_identity","028_autonomous_agent_identity",
  "029_mcp_connections","030_mcp_tool_identity","031_smithery_managed","032_knowledge_access","033_knowledge_content","034_knowledge_runtime",
  "035_knowledge_embedding_state","036_knowledge_embedding_consent","037_knowledge_index_runtime","038_knowledge_query_runtime","039_knowledge_execution_source",
  "040_approved_semantic_tools","041_keyword_observations","042_agent_knowledge_observations","043_workflow_sample_lineage","044_schedule_execution","045_agent_collaboration","046_agent_releases","047_employee_governance","048_agent_human_input","049_agent_memory","050_agent_memory_context"]
const sha=value=>createHash("sha256").update(value).digest("hex")
export const freshRuntimeReceipt="pg18_fresh_runtime_001"
export const freshRuntimeRoles=Object.freeze(["agentstudio_api","agentstudio_worker","agentstudio_model_broker","agentstudio_stage_login","agentstudio_stage_worker",
  "agentstudio_native_auth","agentstudio_native_login","agentstudio_bound_dispatch","agentstudio_knowledge_acl","agentstudio_knowledge_content","agentstudio_knowledge_embedding",
  "agentstudio_knowledge_index","agentstudio_knowledge_index_worker","agentstudio_knowledge_index_broker","agentstudio_knowledge_query","agentstudio_knowledge_execution",
  "agentstudio_knowledge_keyword","agentstudio_knowledge_agent","agentstudio_knowledge_lineage","agentstudio_scheduler","agentstudio_collaboration","agentstudio_releases"])
export function freshRuntimeSqlBody(raw){
  const lines=raw.split(/\r?\n/),meta=lines.filter(x=>x.trim().startsWith("\\"))
  if(meta.some(x=>x.trim()!=="\\set ON_ERROR_STOP on")||meta.length>1||lines.filter(x=>x.trim()==="BEGIN;").length!==1||lines.filter(x=>x.trim()==="COMMIT;").length!==1)
    throw Error("fresh_runtime_sql_format_changed")
  return lines.filter(x=>!["\\set ON_ERROR_STOP on","BEGIN;","COMMIT;"].includes(x.trim())).join("\n")
}
export function captureFreshRuntimeSources(){
  const baseline=captureFreshPg18Baseline(),entries=[{path:"db/postgres/010_pg18_native_auth_proposed.sql",version:"pg18_native_auth_001"},
    ...suffixes.map(suffix=>({path:"db/postgres/migrations/pg_v9_"+suffix+".sql",version:"pg_v9_"+suffix.slice(0,3)}))]
  const steps=entries.map(entry=>{const raw=readFileSync(path.join(root,entry.path),"utf8");return Object.freeze({...entry,sha256:sha(raw),sql:freshRuntimeSqlBody(raw)})})
  const sources=Object.freeze([Object.freeze({path:"db/postgres/001_stage_schema.sql",sha256:baseline.hash,versions:Object.freeze(["pg_v8_001","pg_v8_004","pg_v8_005"])}),
    ...steps.map(({path,version,sha256})=>Object.freeze({path,version,sha256}))])
  const versions=Object.freeze([...sources[0].versions,...steps.map(s=>s.version)].sort())
  const tables=new Set()
  for(const sql of [baseline.sql,...steps.map(s=>s.sql)])for(const match of sql.matchAll(/\bCREATE TABLE(?: IF NOT EXISTS)?\s+(agentstudio(?:_auth)?)\.([a-z_]+)/g))tables.add(match[1]+"."+match[2])
  return Object.freeze({baseline:Object.freeze(baseline),steps:Object.freeze(steps),sources,versions,tables:Object.freeze([...tables].sort()),
    source_sha256:sha(JSON.stringify({format:"pg18_fresh_runtime_sources_v1",sources}))})
}
export function freshRuntimePlan(snapshot){return {mode:"plan",format:"pg18_fresh_runtime_v1",database:"agent_studio",host:"127.0.0.1",port:5333,postgres_major:18,
  source_sha256:snapshot.source_sha256,sources:snapshot.sources,migration_versions:snapshot.versions,latest_migration:"pg_v9_050",receipt_version:freshRuntimeReceipt,
  legacy_rows_copied:0,legacy_import_versions_fabricated:false,atomic:true,service_logins_enabled:false,services_started:false,network_used:false,production_cutover_allowed:false}}
