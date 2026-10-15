#!/usr/bin/env node
// STRICT staging-only import ENTRYPOINT. Never runs on the public web API.
// --plan reads a frozen verified SQLite backup and approved ID map ONLY;
// --execute additionally needs explicit environment opt-in and an isolated
// agentstudio_stage PostgreSQL admin password secret (file, NOT env value).
import fs from "node:fs"
import path from "node:path"
import {createHash} from "node:crypto"
import {DatabaseSync} from "node:sqlite"
import {fileURLToPath} from "node:url"
import {Pool} from "pg"
import {normalizeLegacyAgent,importLegacyAgentsToStage,
  StageImportError,type LegacyAgentRow} from "./stage-agent-import.ts"
import type {SqlPool,SqlClient} from "./contracts.ts"

const here=path.dirname(fileURLToPath(import.meta.url))
const root=path.resolve(here,"../../..")
const prodData=path.join(root,"pocketbase","pb_data")
const hex=/^[a-f0-9]{64}$/
const uid=/^[A-Za-z0-9_-]{1,120}$/
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
function fail(code:string):never{throw new StageImportError(code)}
function safeFile(value:string,kind:string){
  const file=fs.realpathSync(path.resolve(value))
  const stat=fs.lstatSync(file)
  if(!stat.isFile()||stat.size===0)fail("bad_"+kind+"_file")
  const source=fs.existsSync(prodData)?fs.realpathSync(prodData):prodData
  const norm=(name:string)=>process.platform==="win32"?name.toLowerCase():name
  if(norm(file)===norm(source)||
     norm(file).startsWith(norm(source+path.sep)))fail("live_data_not_allowed")
  if(kind!=="snapshot"&&stat.size>5_000_000)fail("stage_metadata_file_too_large")
  return {file,size:stat.size,mtimeMs:stat.mtimeMs}
}
async function fileDigest(file:string){
  const sha=createHash("sha256")
  for await(const part of fs.createReadStream(file))sha.update(part)
  return sha.digest("hex")
}
function same(input:{file:string;size:number;mtimeMs:number}){
  const stat=fs.statSync(input.file)
  if(stat.size!==input.size||stat.mtimeMs!==input.mtimeMs)
    fail("source_changed_during_import_preflight")
}
function readJson(file:string){
  try{return JSON.parse(fs.readFileSync(file,"utf8")) as Record<string,unknown>}
  catch{return fail("invalid_stage_json_input")}
}
function args(argv:string[]){
  const options:Record<string,string|boolean>={}
  for(let i=0;i<argv.length;i++){
    const key=argv[i]
    if(!key)fail("invalid_stage_args")
    if(!["--snapshot","--manifest","--mapping","--plan","--execute"].includes(key)||
       Object.hasOwn(options,key))fail("invalid_stage_args")
    if(key==="--execute"||key==="--plan"){options[key]=true;continue}
    if(!argv[i+1]||argv[i+1]?.startsWith("--"))fail("invalid_stage_args")
    options[key]=argv[++i]!
  }
  if(Boolean(options["--plan"])===Boolean(options["--execute"])||
     typeof options["--snapshot"]!=="string"||
     typeof options["--manifest"]!=="string"||
     typeof options["--mapping"]!=="string")fail("invalid_stage_args")
  return options as {"--snapshot":string;"--manifest":string;
    "--mapping":string;"--plan"?:boolean;"--execute"?:boolean}
}
function validateMap(raw:Record<string,unknown>,snapshot:string,
  sourceIds:Set<string>):Map<string,string>{
  if(raw.schema_version!=="studio-approved-identity-map-v2"||
     raw.source_sha256!==snapshot || !Array.isArray(raw.records))
    fail("mapping_not_approved_for_snapshot")
  const result=new Map<string,string>(),targets=new Set<string>()
  for(const record of raw.records){
    const row=record as Record<string,unknown>
    if(!row||typeof row.old_id!=="string"||!uid.test(row.old_id)||
       typeof row.new_studio_user_id!=="string"||
       !uuid.test(row.new_studio_user_id)||
       typeof row.verified_by!=="string"||
       row.verified_by.trim().length<2||row.verified_by.length>120 ||
       typeof row.approved_at!=="string"||
       !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/.test(row.approved_at)||
       !Number.isFinite(Date.parse(row.approved_at)))
      fail("unverified_identity_mapping")
    const dest=row.new_studio_user_id.toLowerCase()
    if(result.has(row.old_id)||targets.has(dest)||
       !sourceIds.has(row.old_id))fail("identity_mapping_collision")
    result.set(row.old_id,dest)
    targets.add(dest)
  }
  if(result.size!==sourceIds.size)fail("identity_mapping_incomplete")
  return result
}
function assertColumns(db:DatabaseSync,table:string,wanted:string[]){
  const exists=db.prepare("SELECT name FROM sqlite_master "+
    "WHERE name=? AND type='table'").get(table)
  if(!exists)fail("snapshot_required_table_missing")
  const columns=db.prepare('PRAGMA table_info("'+table+'")').all()
    .map(x=>String(x.name))
  if(wanted.some(x=>!columns.includes(x)))fail("snapshot_source_schema_drift")
  if(table==="agent_specs"){
    const known=new Set([
      "id","rh_user_id","name","spec","source","template_key",
      "created","updated",
    ])
    if(columns.some(x=>!known.has(x)))
      fail("snapshot_source_schema_unmapped_column")
  }
}
function sqliteCount(db:DatabaseSync,table:string){
  const count=db.prepare('SELECT count(*) AS n FROM "'+table+'"').get() as
    {n:number|bigint}
  const n=Number(count.n)
  if(!Number.isSafeInteger(n)||n<0)fail("snapshot_invalid_row_count")
  return n
}
async function extract(argv:string[]):Promise<{
  sha:string;batch:LegacyAgentRow[];
  metadata:{file:string;size:number;mtimeMs:number}[];
  blocked:Record<string,number>;
}>{
  const opts=args(argv)
  const files=[
    safeFile(opts["--snapshot"],"snapshot"),
    safeFile(opts["--manifest"],"manifest"),
    safeFile(opts["--mapping"],"mapping"),
  ]
  if(new Set(files.map(x=>x.file)).size!==3)fail("stage_source_paths_duplicate")
  const [snapshot,manifest,mapFile]=files as [typeof files[0],typeof files[0],typeof files[0]]
  const info=readJson(manifest.file)
  if(info.format!=="agent-studio-sqlite-snapshot-v1"||
     typeof info.sha256!=="string"||!hex.test(info.sha256)||
     info.bytes!==snapshot.size ||
     !info.tables||typeof info.tables!=="object"||
     Array.isArray(info.tables))fail("invalid_verified_snapshot_manifest")
  if(await fileDigest(snapshot.file)!==info.sha256)
    fail("snapshot_file_hash_mismatch")
  const db=new DatabaseSync(snapshot.file,{readOnly:true})
  let batch:LegacyAgentRow[]=[]
  const blocked:Record<string,number>={}
  try{
    if(Object.values(db.prepare("PRAGMA quick_check").get()??{})[0]!=="ok")
      fail("sqlite_integrity_failed")
    assertColumns(db,"studio_users",["id"])
    assertColumns(db,"agent_specs",[
      "id","rh_user_id","name","spec","created","updated",
    ])
    const sourceIds=new Set(db.prepare("SELECT id FROM studio_users")
      .all().map(x=>String(x.id)))
    if(sourceIds.size===0 || [...sourceIds].some(x=>!uid.test(x)))
      fail("snapshot_employees_invalid")
    const owners=validateMap(readJson(mapFile.file),info.sha256,sourceIds)
    for(const [name,count] of Object.entries(
      info.tables as Record<string,number>)){
      if(typeof name!=="string"||
         !/^[a-zA-Z_][a-zA-Z0-9_]{0,120}$/.test(name)||
         !Number.isSafeInteger(count)||count<0)
        fail("invalid_snapshot_manifest_count")
      const found=db.prepare("SELECT 1 AS ok FROM sqlite_master "+
        "WHERE type='table' AND name=?").get(name)
      if(!found||sqliteCount(db,name)!==count)
        fail("snapshot_manifest_table_count_mismatch")
    }
    if(sqliteCount(db,"agent_specs")>5000)
      fail("stage_batch_max_5000_exceeded")
    const columns=db.prepare('PRAGMA table_info("agent_specs")').all()
      .map(x=>String(x.name))
    const select=["id","rh_user_id","name","spec","created","updated",
      ...(columns.includes("source")?["source"]:[]),
      ...(columns.includes("template_key")?["template_key"]:[])]
    const sql="SELECT "+select.map(x=>'"'+x+'"').join(",")+
      " FROM agent_specs ORDER BY id"
    const rows=db.prepare(sql).all()
    for(const raw of rows){
      try{batch.push(normalizeLegacyAgent(raw,owners))}
      catch(error){
        const key=error instanceof StageImportError?
          error.message:"legacy_row_validation_failed"
        blocked[key]=(blocked[key]||0)+1
      }
    }
    if(batch.length===0 && !Object.keys(blocked).length)
      fail("no_agent_records_in_snapshot")
    if(batch.length+Object.values(blocked).reduce((a,b)=>a+b,0)!==
       sqliteCount(db,"agent_specs"))
      fail("snapshot_agent_row_count_mismatch")
  }finally{db.close()}
  for(const file of files)same(file)
  return {sha:info.sha256,batch,metadata:files,blocked}
}
function makePool(){
  if(process.env.AGENT_STUDIO_PG_STAGE_AGENT_IMPORT_ENABLED!=="true")
    fail("stage_import_disabled")
  const host=process.env.AGENT_STUDIO_PG_HOST
  const database=process.env.AGENT_STUDIO_PG_DATABASE
  const user=process.env.AGENT_STUDIO_PG_IMPORT_USER
  if(!["postgres","127.0.0.1"].includes(String(host))||
     database!=="agentstudio_stage"||
     user!=="agentstudio_admin")
    fail("unsafe_stage_connection")
  const secretFile=process.env.AGENT_STUDIO_PG_IMPORT_PASSWORD_FILE
  if(!secretFile)fail("stage_password_file_missing")
  const secret=safeFile(secretFile,"secret")
  if(secret.size<32||secret.size>4096)fail("stage_secret_invalid")
  const password=fs.readFileSync(secret.file,"utf8").replace(/[\r\n]+$/g,"")
  if(password.length<32||/^(.)\1+$/.test(password)||
     /[\n\r\0]/.test(password))fail("stage_secret_invalid")
  return new Pool({
    host,database,user,password,port:5432,max:1,
    connectionTimeoutMillis:5000,statement_timeout:18000,
    idleTimeoutMillis:9000,
  })
}
export async function runCli(argv:string[]){
  const flags=args(argv)
  // Explicit opt-in before even reading potentially sensitive input.
  if(flags["--execute"] &&
     process.env.AGENT_STUDIO_PG_STAGE_AGENT_IMPORT_ENABLED!=="true")
    fail("stage_import_disabled")
  const data=await extract(argv)
  const blockers=Object.entries(data.blocked)
  const summary={
    mode:flags["--plan"]?"plan_only":"execute_stage_only",
    source_snapshot_sha256:data.sha,
    read_only_source:true,contains_content:false,contains_user_ids:false,
    target:"agentstudio_stage",
    compatible_records:data.batch.length,
    incompatible_records:blockers.reduce((sum,entry)=>sum+entry[1],0),
    blocker_codes:Object.fromEntries(blockers),
    production_cutover_allowed:false,
  }
  if(blockers.length){
    console.log(JSON.stringify({...summary,
      result:"blocked_lossless_import_required"},null,2))
    process.exitCode=2
    return
  }
  if(flags["--plan"]){
    console.log(JSON.stringify({...summary,result:"dry_run_only"},null,2))
    return
  }
  // Never connect to production; internal SQL transaction repeats these
  // stage database name, login, version and migration checks independently.
  const client=makePool()
  const adapter:SqlPool={async connect():Promise<SqlClient>{
    const db=await client.connect()
    return {
      async query<Row>(sql:string,values:unknown[]=[]){
        const r=await db.query(sql,values)
        return {rows:r.rows as Row[]}
      },
      release(){db.release()},
    }
  }}
  try{
    const result=await importLegacyAgentsToStage(adapter,data.sha,data.batch)
    console.log(JSON.stringify({...summary,result:"stage_import_reconciled",
      imported:result.imported,replayed:result.replayed,
      reconciled:result.reconciled},null,2))
  }finally{await client.end()}
}
if(process.argv[1] &&
   path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  runCli(process.argv.slice(2)).catch(error=>{
    const whitelist=new Set([
      "invalid_stage_args","bad_snapshot_file","bad_manifest_file",
      "bad_mapping_file","stage_metadata_file_too_large",
      "live_data_not_allowed","stage_source_paths_duplicate",
      "invalid_verified_snapshot_manifest","snapshot_file_hash_mismatch",
      "sqlite_integrity_failed","snapshot_required_table_missing",
      "snapshot_source_schema_drift","snapshot_source_schema_unmapped_column",
      "snapshot_employees_invalid","identity_mapping_collision",
      "identity_mapping_incomplete","unverified_identity_mapping",
      "mapping_not_approved_for_snapshot","invalid_snapshot_manifest_count",
      "snapshot_manifest_table_count_mismatch","stage_batch_max_5000_exceeded",
      "no_agent_records_in_snapshot","snapshot_agent_row_count_mismatch",
      "source_changed_during_import_preflight","stage_import_disabled",
      "unsafe_stage_connection","stage_password_file_missing",
      "stage_secret_invalid",
    ])
    const code=error instanceof StageImportError?
      error.message:"stage_import_failed"
    console.error("Agent stage import refused: "+
      (whitelist.has(code)?code:"stage_import_failed"))
    process.exitCode=1
  })
}
