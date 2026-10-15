#!/usr/bin/env node
// Strict off-line PocketBase KB metadata stage migration.
// --plan NEVER connects to PostgreSQL. --execute requires explicit opt-in and
// a one-shot isolated PostgreSQL17 stage container and external secrets.
// This slice supports only bases with NO documents, chunks, vectors or ACL.
import fs from "node:fs"
import path from "node:path"
import {createHash} from "node:crypto"
import {DatabaseSync} from "node:sqlite"
import {fileURLToPath} from "node:url"
import {Pool} from "pg"
import {normalizeLegacyKb,importLegacyKbsToStage,StageKnowledgeError,
  type LegacyKbRow} from "./stage-knowledge-base-import.ts"
import type {SqlClient,SqlPool} from "./contracts.ts"

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../../..")
const live=path.join(root,"pocketbase","pb_data")
const digest=/^[a-f0-9]{64}$/
const userName=/^[A-Za-z0-9_-]{1,120}$/
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const children=[
  "agent_studio_kb_documents","agent_studio_kb_chunks",
  "agent_studio_kb_vectors","agent_studio_kb_access",
  "agent_studio_kb_access_events","agent_studio_kb_embedding_queue",
]
function refuse(code:string):never{throw new StageKnowledgeError(code)}
function fileCheck(input:string,kind:string){
  const filename=fs.realpathSync(path.resolve(input))
  const stat=fs.lstatSync(filename)
  if(!stat.isFile()||stat.size<1)
    refuse("invalid_"+kind+"_file")
  const realLive=fs.existsSync(live)?fs.realpathSync(live):live
  const norm=(x:string)=>process.platform==="win32"?x.toLowerCase():x
  if(norm(filename)===norm(realLive)||
     norm(filename).startsWith(norm(realLive+path.sep)))
    refuse("live_pocketbase_data_forbidden")
  if(kind!=="snapshot"&&stat.size>5_000_000)
    refuse("migration_metadata_file_too_large")
  return {filename,size:stat.size,mtimeMs:stat.mtimeMs}
}
async function sha256(filename:string){
  const dig=createHash("sha256")
  for await(const chunk of fs.createReadStream(filename))dig.update(chunk)
  return dig.digest("hex")
}
function args(argv:string[]){
  const flags=new Map<string,string|true>()
  for(let i=0;i<argv.length;i++){
    const item=argv[i]
    if(!item||![
      "--plan","--execute","--snapshot","--manifest","--mapping"
    ].includes(item)||flags.has(item))
      refuse("invalid_kb_stage_arguments")
    if(item==="--plan"||item==="--execute"){
      flags.set(item,true);continue
    }
    const value=argv[++i]
    if(!value||value.startsWith("--"))
      refuse("invalid_kb_stage_arguments")
    flags.set(item,value)
  }
  if(flags.has("--plan")===flags.has("--execute")||
     ["--snapshot","--manifest","--mapping"]
       .some(flag=>typeof flags.get(flag)!=="string"))
    refuse("invalid_kb_stage_arguments")
  return {
    mode:flags.has("--execute")?"execute":"plan",
    snapshot:String(flags.get("--snapshot")),
    manifest:String(flags.get("--manifest")),
    mapping:String(flags.get("--mapping")),
  } as const
}
function json(filename:string):Record<string,unknown>{
  try{
    const v=JSON.parse(fs.readFileSync(filename,"utf8"))
    if(!v||Array.isArray(v)||typeof v!=="object")
      refuse("invalid_kb_stage_json")
    return v as Record<string,unknown>
  }catch{return refuse("invalid_kb_stage_json")}
}
function requireColumn(db:DatabaseSync,table:string,field:string){
  const cols=db.prepare('PRAGMA table_info("'+table+'")')
    .all().map(c=>String(c.name))
  if(!cols.includes(field))
    refuse("legacy_kb_source_column_missing")
}
function tableNames(db:DatabaseSync){
  return new Set(db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' "+
    "AND name NOT LIKE 'sqlite_%'").all().map(v=>String(v.name)))
}
function buildOwnerMap(mapping:Record<string,unknown>,sha:string,
  users:Set<string>){
  if(mapping.schema_version!=="studio-approved-identity-map-v2"||
     mapping.source_sha256!==sha||!Array.isArray(mapping.records))
    refuse("approved_kb_identity_mapping_required")
  const owner=new Map<string,string>()
  const targets=new Set<string>()
  for(const item of mapping.records){
    const x=item as Record<string,unknown>
    if(!x||typeof x.old_id!=="string"||
       !userName.test(x.old_id)||typeof x.new_studio_user_id!=="string"||
       !uuid.test(x.new_studio_user_id)||
       typeof x.verified_by!=="string"||
       x.verified_by.trim().length<2||
       typeof x.approved_at!=="string"||
       !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/.test(x.approved_at)||
       !Number.isFinite(Date.parse(x.approved_at)))
      refuse("unverified_kb_owner_mapping")
    const newId=x.new_studio_user_id.toLowerCase()
    if(owner.has(x.old_id)||targets.has(newId)||
       !users.has(x.old_id))
      refuse("ambiguous_kb_owner_mapping")
    owner.set(x.old_id,newId)
    targets.add(newId)
  }
  if(owner.size!==users.size)
    refuse("incomplete_kb_owner_mapping")
  return owner
}
function validateSnapshotSchema(db:DatabaseSync,names:Set<string>){
  if(!names.has("studio_users")||!names.has("agent_studio_kb_bases"))
    refuse("legacy_kb_source_table_missing")
  requireColumn(db,"studio_users","id")
  for(const col of ["id","rh_user_id","name","description","created_ms","updated_ms"])
    requireColumn(db,"agent_studio_kb_bases",col)
  const cols=db.prepare('PRAGMA table_info("agent_studio_kb_bases")')
    .all().map(c=>String(c.name))
  if(cols.some(c=>![
    "id","rh_user_id","name","description","created_ms","updated_ms"
  ].includes(c)))
    refuse("legacy_kb_unmapped_metadata_column")
  for(const table of children){
    if(names.has(table))requireColumn(db,table,"base_id")
  }
  if(names.has("agent_studio_kb_embedding_settings"))
    requireColumn(db,"agent_studio_kb_embedding_settings","rh_user_id")
}
function count(db:DatabaseSync,table:string){
  const result=db.prepare('SELECT count(*) AS n FROM "'+table+'"')
    .get() as {n:number|bigint}
  const n=Number(result.n)
  if(!Number.isSafeInteger(n)||n<0)
    refuse("legacy_kb_row_count_invalid")
  return n
}
async function extract(options:ReturnType<typeof args>){
  const files=[
    fileCheck(options.snapshot,"snapshot"),
    fileCheck(options.manifest,"manifest"),
    fileCheck(options.mapping,"mapping"),
  ]
  if(new Set(files.map(f=>f.filename)).size!==3)
    refuse("legacy_kb_input_paths_not_distinct")
  const [source,manifest,idMap]=files as [
    typeof files[0],typeof files[0],typeof files[0],
  ]
  const meta=json(manifest.filename)
  if(meta.format!=="agent-studio-sqlite-snapshot-v1"||
     typeof meta.sha256!=="string"||!digest.test(meta.sha256)||
     meta.bytes!==source.size||
     !meta.tables||Array.isArray(meta.tables)||
     typeof meta.tables!=="object")
    refuse("unverified_kb_snapshot_manifest")
  if(await sha256(source.filename)!==meta.sha256)
    refuse("kb_snapshot_sha256_mismatch")
  const db=new DatabaseSync(source.filename,{readOnly:true})
  const blockers:Record<string,number>={}
  const batch:LegacyKbRow[]=[]
  try{
    const ok=db.prepare("PRAGMA quick_check").get()
    if(Object.values(ok||{})[0]!=="ok")
      refuse("kb_snapshot_sqlite_integrity_failed")
    const names=tableNames(db)
    validateSnapshotSchema(db,names)
    const users=new Set(db.prepare("SELECT id FROM studio_users")
      .all().map(x=>String(x.id||"")))
    if(!users.size||[...users].some(x=>!userName.test(x)))
      refuse("kb_source_users_invalid")
    const owners=buildOwnerMap(json(idMap.filename),meta.sha256,users)
    for(const [table,n] of Object.entries(meta.tables as Record<string,unknown>)){
      if(!/^[a-zA-Z_][a-zA-Z0-9_]{0,119}$/.test(table)||
         !names.has(table)||!Number.isSafeInteger(n)||
         (n as number)<0||count(db,table)!==n)
        refuse("kb_snapshot_manifest_count_mismatch")
    }
    if(count(db,"agent_studio_kb_bases")>3000)
      refuse("kb_batch_too_large")
    const sql="SELECT id,rh_user_id,name,description,created_ms,updated_ms "+
      "FROM agent_studio_kb_bases ORDER BY id"
    const rows=db.prepare(sql).all()
    for(const record of rows){
      const legacyId=record.id,legacyOwner=record.rh_user_id
      if(typeof legacyId!=="string"||typeof legacyOwner!=="string")
        refuse("legacy_kb_source_identity_invalid")
      let hasData=false
      for(const table of children){
        if(names.has(table)&&db.prepare('SELECT 1 AS hit FROM "'+table+
          '" WHERE base_id=? LIMIT 1').get(legacyId)){
          hasData=true;break
        }
      }
      if(names.has("agent_studio_kb_embedding_settings")&&
         db.prepare("SELECT 1 AS hit FROM agent_studio_kb_embedding_settings "+
          "WHERE rh_user_id=? LIMIT 1").get(legacyOwner))
        hasData=true
      try{batch.push(normalizeLegacyKb(record,owners,hasData))}
      catch(err){
        const code=err instanceof StageKnowledgeError?
          err.message:"legacy_kb_unknown_row_error"
        blockers[code]=(blockers[code]||0)+1
      }
    }
    if(batch.length+Object.values(blockers).reduce((a,b)=>a+b,0)!==
       count(db,"agent_studio_kb_bases"))
      refuse("kb_source_reconciliation_count_mismatch")
  }finally{db.close()}
  for(const item of files){
    const now=fs.statSync(item.filename)
    if(now.size!==item.size||now.mtimeMs!==item.mtimeMs)
      refuse("kb_input_mutated_during_scan")
  }
  return {sha:meta.sha256,batch,blockers}
}
function newPool(){
  if(process.env.AGENT_STUDIO_PG_STAGE_KB_IMPORT_ENABLED!=="true")
    refuse("stage_kb_import_disabled")
  const host=process.env.AGENT_STUDIO_PG_HOST
  if(!["127.0.0.1","postgres"].includes(String(host))||
     process.env.AGENT_STUDIO_PG_DATABASE!=="agentstudio_stage"||
     process.env.AGENT_STUDIO_PG_IMPORT_USER!=="agentstudio_admin")
    refuse("unsafe_kb_postgres_target")
  const filename=process.env.AGENT_STUDIO_PG_IMPORT_PASSWORD_FILE
  if(!filename)refuse("stage_kb_secret_file_required")
  const file=fileCheck(filename,"secret")
  if(file.size<32||file.size>4096)
    refuse("stage_kb_secret_invalid")
  const password=fs.readFileSync(file.filename,"utf8")
    .replace(/[\r\n]+$/g,"")
  if(password.length<32||/[\r\n\0]/.test(password)||
     /^(.)\1+$/.test(password))
    refuse("stage_kb_secret_invalid")
  return new Pool({host:String(host),port:5432,
    user:"agentstudio_admin",database:"agentstudio_stage",password,
    max:1,connectionTimeoutMillis:5000,statement_timeout:18000})
}
export async function runCli(argv:string[]){
  const options=args(argv)
  if(options.mode==="execute"&&
     process.env.AGENT_STUDIO_PG_STAGE_KB_IMPORT_ENABLED!=="true")
    refuse("stage_kb_import_disabled")
  const result=await extract(options)
  const blockers=Object.entries(result.blockers)
  const report={
    operation:options.mode==="plan"?"plan_only":"stage_only",
    source_snapshot_sha256:result.sha,
    read_only_source:true,secret_values_exported:false,
    migration_scope:"empty_knowledge_bases_metadata_only",
    compatible_bases:result.batch.length,
    blocked_bases:blockers.reduce((sum,[,n])=>sum+n,0),
    blockers:Object.fromEntries(blockers),
    production_cutover_allowed:false,
  }
  if(blockers.length){
    console.log(JSON.stringify({...report,result:"blocked_no_write"},null,2))
    process.exitCode=2
    return
  }
  if(options.mode==="plan"||!result.batch.length){
    console.log(JSON.stringify({...report,result:options.mode==="plan"?
      "dry_run_only":"no_compatible_bases"},null,2))
    return
  }
  const pool=newPool()
  const adapter:SqlPool={async connect():Promise<SqlClient>{
    const db=await pool.connect()
    return {
      async query<R>(sql:string,values:unknown[]=[]){
        const out=await db.query(sql,values)
        return {rows:out.rows as R[]}
      },release(){db.release()},
    }
  }}
  try{
    const imported=await importLegacyKbsToStage(
      adapter,result.sha,result.batch)
    console.log(JSON.stringify({...report,result:"stage_metadata_reconciled",
      imported:imported.imported,replayed:imported.replayed,
      reconciled:imported.reconciled},null,2))
  }finally{await pool.end()}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  runCli(process.argv.slice(2)).catch(error=>{
    const safeCodes=new Set([
      "invalid_kb_stage_arguments","invalid_snapshot_file",
      "invalid_manifest_file","invalid_mapping_file","invalid_secret_file",
      "live_pocketbase_data_forbidden","migration_metadata_file_too_large",
      "legacy_kb_input_paths_not_distinct","invalid_kb_stage_json",
      "legacy_kb_source_identity_invalid",
      "legacy_kb_source_column_missing","legacy_kb_source_table_missing",
      "legacy_kb_unmapped_metadata_column","approved_kb_identity_mapping_required",
      "unverified_kb_owner_mapping","ambiguous_kb_owner_mapping",
      "incomplete_kb_owner_mapping","legacy_kb_row_count_invalid",
      "unverified_kb_snapshot_manifest","kb_snapshot_sha256_mismatch",
      "kb_snapshot_sqlite_integrity_failed","kb_source_users_invalid",
      "kb_snapshot_manifest_count_mismatch","kb_batch_too_large",
      "kb_source_reconciliation_count_mismatch","kb_input_mutated_during_scan",
      "stage_kb_import_disabled","unsafe_kb_postgres_target",
      "stage_kb_secret_file_required","stage_kb_secret_invalid",
    ])
    const code=error instanceof StageKnowledgeError?error.message:"error"
    console.error("KB stage import refused: "+
      (safeCodes.has(code)?code:"stage_kb_import_failed"))
    process.exitCode=1
  })
}
