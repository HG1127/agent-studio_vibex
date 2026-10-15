#!/usr/bin/env node
// V8.8 staging-only domain importer for reviewed frozen PocketBase snapshots.
// Enforces plan-before-execute, immutable source hash, full table manifest,
// approved user UUID mapping, external secret file and a fixed isolated PG17.
// This does NOT enable workflows, schedules, historical runs or team ACLs.
import fs from "node:fs"
import path from "node:path"
import {createHash} from "node:crypto"
import {fileURLToPath} from "node:url"
import {DatabaseSync} from "node:sqlite"
import {Pool} from "pg"
import {
  prepareWorkflowImport,importLegacyWorkflowsToStage,
} from "./stage-workflow-import.ts"
import {
  prepareScheduleImport,importLegacySchedulesToStage,
} from "./stage-schedule-import.ts"
import {
  prepareCollaborationImport,importLegacyCollaborationsToStage,
} from "./stage-collaboration-import.ts"
import {
  prepareHistoryImport,importLegacyHistoryToStage,
} from "./stage-history-import.ts"
import {
  prepareWorkflowHistoryImport,importLegacyWorkflowHistoryToStage,
} from "./stage-workflow-history-import.ts"
import type {SqlPool,SqlClient} from "./contracts.ts"

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../../..")
const liveDir=path.join(root,"pocketbase","pb_data")
const domains={
  workflow:["workflows"],
  schedules:["agent_studio_schedules"],
  collaboration:[
    "agent_studio_spec_access","agent_studio_kb_access",
    "agent_studio_spec_proposals","agent_studio_kb_access_events",
    "agent_studio_spec_collab_audit","agent_studio_spec_revisions",
  ],
  "workflow-history":["workflow_runs","workflow_events"],
  history:["agent_runs"],
} as const
type Domain=keyof typeof domains
function refuse(code:string):never{throw Error(code)}
const digest=(buf:Buffer|string)=>createHash("sha256").update(buf).digest("hex")
const isName=(x:string)=>/^[A-Za-z_][A-Za-z_0-9]{0,120}$/.test(x)
function canonical(value:string){
  const full=fs.realpathSync(path.resolve(value))
  const st=fs.statSync(full)
  if(!st.isFile()||st.size<1)refuse("invalid_input_file")
  const source=fs.existsSync(liveDir)?fs.realpathSync(liveDir):liveDir
  const norm=(x:string)=>process.platform==="win32"?x.toLowerCase():x
  if(norm(full)===norm(source)||
     norm(full).startsWith(norm(source+path.sep)))
    refuse("live_pocketbase_source_forbidden")
  return {full,bytes:st.size,modified:st.mtimeMs}
}
function parse(argv:string[]){
  const flags=new Map<string,string|true>()
  for(let i=0;i<argv.length;i++){
    const key=argv[i]
    if(!key||!["--plan","--execute","--domain","--snapshot","--manifest",
       "--mapping","--confirm-stage"].includes(key)||flags.has(key))
      refuse("invalid_stage_domain_arguments")
    if(key==="--plan"||key==="--execute"){flags.set(key,true);continue}
    const value=argv[++i]
    if(!value||value.startsWith("--"))refuse("invalid_stage_domain_arguments")
    flags.set(key,value)
  }
  if(flags.has("--plan")===flags.has("--execute")||
     !Object.hasOwn(domains,String(flags.get("--domain")))||
     ["--snapshot","--manifest","--mapping"].some(k=>typeof flags.get(k)!=="string"))
    refuse("invalid_stage_domain_arguments")
  if(flags.has("--execute")&&flags.get("--confirm-stage")!=="agentstudio_stage")
    refuse("operator_stage_confirmation_required")
  if(flags.has("--plan")&&flags.has("--confirm-stage"))
    refuse("invalid_stage_domain_arguments")
  return {
    mode:flags.has("--plan")?"plan":"execute",
    domain:String(flags.get("--domain")) as Domain,
    snapshot:String(flags.get("--snapshot")),
    manifest:String(flags.get("--manifest")),
    mapping:String(flags.get("--mapping")),
  } as const
}
function verifySource(args:ReturnType<typeof parse>){
  const files=[
    canonical(args.snapshot),canonical(args.manifest),canonical(args.mapping),
  ]
  if(new Set(files.map(x=>x.full.toLowerCase())).size!==3)
    refuse("stage_domain_input_paths_not_distinct")
  const [source,manifestFile,mappingFile]=files as [
    typeof files[0],typeof files[0],typeof files[0],
  ]
  if(["-wal","-shm","-journal"].some(ext=>fs.existsSync(source.full+ext)))
    refuse("stage_source_not_frozen")
  if(manifestFile.bytes>5_000_000||mappingFile.bytes>5_000_000)
    refuse("stage_review_metadata_too_large")
  const body=fs.readFileSync(manifestFile.full,"utf8")
  const review=fs.readFileSync(mappingFile.full,"utf8")
  let meta:Record<string,unknown>,identities:Record<string,unknown>
  try{
    meta=JSON.parse(body)
    identities=JSON.parse(review)
  }catch{return refuse("stage_manifest_or_mapping_invalid")}
  if(meta.format!=="agent-studio-sqlite-snapshot-v1"||
     typeof meta.sha256!=="string"||
     !/^[0-9a-f]{64}$/.test(meta.sha256)||
     meta.bytes!==source.bytes||
     !meta.tables||typeof meta.tables!=="object"||Array.isArray(meta.tables)||
     digest(fs.readFileSync(source.full))!==meta.sha256)
    refuse("stage_snapshot_not_verified")
  if(identities.schema_version!=="studio-approved-identity-map-v2"||
     identities.source_sha256!==meta.sha256||
     !Array.isArray(identities.records))
    refuse("stage_mapping_not_bound_to_snapshot")
  const db=new DatabaseSync(source.full,{readOnly:true})
  const rows:Record<string,number>={}
  try{
    const ok=db.prepare("PRAGMA quick_check").get()
    if(Object.values(ok??{})[0]!=="ok")refuse("stage_snapshot_integrity_failed")
    const tables=db.prepare("SELECT name FROM sqlite_master WHERE type='table' "+
      "AND name NOT GLOB 'sqlite_*' ORDER BY name").all().map(x=>String(x.name))
    if(!tables.length||Object.keys(meta.tables as object).length!==tables.length)
      refuse("stage_manifest_incomplete")
    for(const name of tables){
      if(!isName(name))refuse("stage_source_table_name_unsupported")
      const n=Number(db.prepare('SELECT COUNT(*) AS n FROM "'+name+'"').get()?.n)
      if(!Number.isSafeInteger(n)||n<0||
        (meta.tables as Record<string,unknown>)[name]!==n)
        refuse("stage_manifest_row_count_mismatch")
      rows[name]=n
    }
    for(const required of domains[args.domain])
      if(rows[required]===undefined)refuse("stage_domain_source_table_missing")
    const rawUsers=db.prepare(
      "SELECT 1 AS ok FROM sqlite_master WHERE type='table' AND name='studio_users'"
    ).get()
    if(!rawUsers)refuse("stage_employees_table_missing")
    const employeeIds=db.prepare("SELECT id FROM studio_users").all()
      .map(x=>String(x.id))
    if(employeeIds.length<1||employeeIds.length>5000||
       new Set(employeeIds).size!==employeeIds.length)
      refuse("stage_employee_count_invalid")
    const allowed=new Set(employeeIds)
    const seen=new Set<string>(),mapped=new Set<string>()
    for(const item of identities.records as Record<string,unknown>[]){
      if(!item||typeof item.old_id!=="string"||!allowed.has(item.old_id)||
         typeof item.new_studio_user_id!=="string"||
         !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(item.new_studio_user_id)||
         typeof item.verified_by!=="string"||
         item.verified_by.trim().length<2||
         typeof item.approved_at!=="string"||
         !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/.test(item.approved_at)||
         !Number.isFinite(Date.parse(item.approved_at))||
         seen.has(item.old_id)||mapped.has(item.new_studio_user_id.toLowerCase()))
        refuse("stage_employee_mapping_unapproved")
      seen.add(item.old_id);mapped.add(item.new_studio_user_id.toLowerCase())
    }
    if(seen.size!==employeeIds.length)
      refuse("stage_employee_mapping_incomplete")
  }finally{db.close()}
  if(files.some((f,i)=>{
     const st=fs.statSync(f.full)
     return st.size!==f.bytes||st.mtimeMs!==f.modified||
       (i===1?fs.readFileSync(f.full,"utf8")!==body:
        i===2?fs.readFileSync(f.full,"utf8")!==review:false)
   })||["-wal","-shm","-journal"].some(ext=>fs.existsSync(source.full+ext)))
    refuse("stage_input_modified_during_preflight")
  return {sha:meta.sha256 as string,files,counts:rows}
}
function secretFromFile(){
  const filename=process.env.AGENT_STUDIO_PG_IMPORT_PASSWORD_FILE
  if(!filename)refuse("stage_password_file_required")
  const info=canonical(filename)
  if(info.bytes<32||info.bytes>4096)refuse("stage_password_size_invalid")
  const value=fs.readFileSync(info.full,"utf8").replace(/[\r\n]+$/g,"")
  if(value.length<32||value.length>2048||/[\r\n\0]/.test(value)||
     /^(.)\1+$/.test(value))
    refuse("stage_password_invalid")
  return value
}
function stagePool(){
  if(process.env.AGENT_STUDIO_PG_STAGE_DOMAIN_IMPORT_ENABLED!=="true")
    refuse("stage_domain_import_disabled")
  const host=process.env.AGENT_STUDIO_PG_HOST
  if(!["postgres","127.0.0.1"].includes(String(host))||
     process.env.AGENT_STUDIO_PG_DATABASE!=="agentstudio_stage"||
     process.env.AGENT_STUDIO_PG_IMPORT_USER!=="agentstudio_admin")
    refuse("unsafe_stage_domain_database_target")
  return new Pool({
    host:String(host),port:5432,database:"agentstudio_stage",
    user:"agentstudio_admin",password:secretFromFile(),
    max:1,connectionTimeoutMillis:5000,statement_timeout:35000,
  })
}
function buildPlan(args:ReturnType<typeof parse>){
  switch(args.domain){
    case "workflow":return prepareWorkflowImport(args.snapshot,args.manifest,args.mapping)
    case "schedules":return prepareScheduleImport(args.snapshot,args.manifest,args.mapping)
    case "collaboration":return prepareCollaborationImport(args.snapshot,args.manifest,args.mapping)
    case "workflow-history":return prepareWorkflowHistoryImport(args.snapshot,args.manifest,args.mapping)
    case "history":return prepareHistoryImport(args.snapshot,args.manifest,args.mapping)
  }
}
export async function runCli(argv:string[]){
  const args=parse(argv)
  if(args.mode==="execute"&&
     process.env.AGENT_STUDIO_PG_STAGE_DOMAIN_IMPORT_ENABLED!=="true")
    refuse("stage_domain_import_disabled")
  const verified=verifySource(args)
  const count=domains[args.domain].reduce((sum,name)=>sum+verified.counts[name]!,0)
  const base={
    operation:args.mode==="plan"?"plan_only":"stage_only",
    source_snapshot_sha256:verified.sha,
    domain:args.domain,source_rows:count,
    source_read_only:true,
    old_workflows_executable:false,
    old_schedules_enabled:false,
    historical_runs_replayed:false,
    collaboration_acl_activated:false,
    production_cutover_allowed:false,
  }
  if(count===0){
    // A skipped domain is not an unverified zero: the entire snapshot,
    // manifest and reviewed identity mapping were independently checked.
    console.log(JSON.stringify({...base,result:"no_source_records"},null,2))
    return
  }
  const plan=buildPlan(args)
  if(plan.source_snapshot_sha256!==verified.sha)
    refuse("stage_domain_plan_snapshot_changed")
  if(args.mode==="plan"){
    console.log(JSON.stringify({...base,result:"source_plan_verified"},null,2))
    return
  }
  const pool=stagePool()
  const adapter:SqlPool={
    async connect():Promise<SqlClient>{
      const conn=await pool.connect()
      return {
        async query<R>(sql:string,values:unknown[]=[]){
          const result=await conn.query(sql,values)
          return {rows:result.rows as R[]}
        },
        release(){conn.release()},
      }
    },
  }
  try{
    const receipt=await (args.domain==="workflow"?
      importLegacyWorkflowsToStage(adapter,plan as ReturnType<typeof prepareWorkflowImport>):
      args.domain==="schedules"?
        importLegacySchedulesToStage(adapter,plan as ReturnType<typeof prepareScheduleImport>):
      args.domain==="collaboration"?
        importLegacyCollaborationsToStage(adapter,plan as ReturnType<typeof prepareCollaborationImport>):
        args.domain==="workflow-history"?
          importLegacyWorkflowHistoryToStage(adapter,plan as ReturnType<typeof prepareWorkflowHistoryImport>):
          importLegacyHistoryToStage(adapter,plan as ReturnType<typeof prepareHistoryImport>))
    console.log(JSON.stringify({...base,result:"stage_domain_reconciled",
      imported:receipt.imported,replayed:receipt.replayed,
      reconciled:receipt.reconciled},null,2))
  }finally{await pool.end()}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  runCli(process.argv.slice(2)).catch(error=>{
    // No exception text from SQLite/PG can contain source values or secrets.
    const allow=new Set([
      "invalid_stage_domain_arguments","operator_stage_confirmation_required",
      "live_pocketbase_source_forbidden","invalid_input_file",
      "stage_domain_input_paths_not_distinct","stage_source_not_frozen",
      "stage_review_metadata_too_large","stage_manifest_or_mapping_invalid",
      "stage_snapshot_not_verified","stage_mapping_not_bound_to_snapshot",
      "stage_snapshot_integrity_failed","stage_manifest_incomplete",
      "stage_source_table_name_unsupported","stage_manifest_row_count_mismatch",
      "stage_domain_source_table_missing","stage_employees_table_missing",
      "stage_employee_count_invalid","stage_employee_mapping_unapproved",
      "stage_employee_mapping_incomplete","stage_input_modified_during_preflight",
      "stage_password_file_required","stage_password_size_invalid",
      "stage_password_invalid","stage_domain_import_disabled",
      "unsafe_stage_domain_database_target","stage_domain_plan_snapshot_changed",
    ])
    const message=error instanceof Error?error.message:""
    console.error("Staging domain import refused: "+
      (allow.has(message)?message:"stage_domain_import_failed"))
    process.exitCode=1
  })
}
