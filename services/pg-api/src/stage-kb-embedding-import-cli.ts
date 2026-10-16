#!/usr/bin/env node
// W16: explicit, one-shot, OFFLINE snapshot -> isolated PostgreSQL17 DBA
// frozen archive. No runtime embedding, no model calls, no queued jobs.
// --plan never creates a PostgreSQL connection.
import fs from "node:fs"
import path from "node:path"
import {fileURLToPath} from "node:url"
import {Pool} from "pg"
import {
  loadKbEmbeddingStateSnapshot,
  importKbEmbeddingStateArchive,
} from "./stage-kb-embedding-state-import.ts"
import type {SqlPool,SqlClient} from "./contracts.ts"

const entry=fileURLToPath(import.meta.url)
const repo=path.resolve(path.dirname(entry),"../../..")
const oldLive=path.join(repo,"pocketbase","pb_data")
const deny=(code:string):never=>{throw Error(code)}
function parse(argv:string[]){
  const options=new Map<string,true|string>()
  for(let i=0;i<argv.length;i++){
    const flag=argv[i]
    if(!flag||!["--plan","--execute","--snapshot","--manifest",
      "--mapping","--confirm-stage"].includes(flag)||options.has(flag))
      deny("invalid_embedding_stage_arguments")
    if(flag==="--plan"||flag==="--execute"){
      options.set(flag,true);continue
    }
    const value=argv[++i]
    if(!value||value.startsWith("--"))deny("invalid_embedding_stage_arguments")
    options.set(String(flag),String(value))
  }
  if(options.has("--plan")===options.has("--execute")||
     ["--snapshot","--manifest","--mapping"].some(
       x=>typeof options.get(x)!=="string"))
    deny("invalid_embedding_stage_arguments")
  const mode=options.has("--plan")?"plan":"execute"
  if(mode==="execute"&&options.get("--confirm-stage")!=="agentstudio_stage")
    deny("stage_confirmation_required")
  if(mode==="plan"&&options.has("--confirm-stage"))
    deny("invalid_embedding_stage_arguments")
  return {
    mode,snapshot:String(options.get("--snapshot")),
    manifest:String(options.get("--manifest")),
    mapping:String(options.get("--mapping")),
  }
}
function resolveSecret(input:string){
  const absolute=path.resolve(input)
  const stat=fs.lstatSync(absolute)
  if(!stat.isFile()||stat.isSymbolicLink()||stat.size<32||stat.size>4096)
    deny("embedding_stage_secret_invalid")
  const real=fs.realpathSync(absolute)
  if(real!==absolute)deny("embedding_stage_secret_invalid")
  const original=fs.existsSync(oldLive)?fs.realpathSync(oldLive):oldLive
  const norm=(x:string)=>process.platform==="win32"?x.toLowerCase():x
  if(norm(real)===norm(original)||
     norm(real).startsWith(norm(original+path.sep)))
    deny("embedding_stage_secret_invalid")
  const secret=fs.readFileSync(real,"utf8").replace(/[\r\n]+$/g,"")
  if(secret.length<32||secret.length>2048||/[\r\n\0]/.test(secret)||
     /^(.)\1+$/.test(secret))deny("embedding_stage_secret_invalid")
  return secret
}
function createPool(){
  if(process.env.AGENT_STUDIO_PG_STAGE_EMBEDDING_ARCHIVE_ENABLED!=="true")
    deny("embedding_stage_import_disabled")
  if(!["postgres","127.0.0.1"].includes(
       String(process.env.AGENT_STUDIO_PG_HOST))||
     process.env.AGENT_STUDIO_PG_DATABASE!=="agentstudio_stage"||
     process.env.AGENT_STUDIO_PG_IMPORT_USER!=="agentstudio_admin")
    deny("embedding_stage_target_unsafe")
  const secretFile=process.env.AGENT_STUDIO_PG_IMPORT_PASSWORD_FILE
  if(!secretFile)deny("embedding_stage_secret_required")
  return new Pool({
    host:String(process.env.AGENT_STUDIO_PG_HOST),port:5432,
    database:"agentstudio_stage",user:"agentstudio_admin",
    password:resolveSecret(String(secretFile)),max:1,
    connectionTimeoutMillis:5000,statement_timeout:30000,
    idleTimeoutMillis:8000,
  })
}
export async function runCli(argv:string[]){
  const args=parse(argv)
  if(args.mode==="execute"&&
     process.env.AGENT_STUDIO_PG_STAGE_EMBEDDING_ARCHIVE_ENABLED!=="true")
    deny("embedding_stage_import_disabled")
  const batch=loadKbEmbeddingStateSnapshot({
    snapshot:args.snapshot,manifest:args.manifest,mapping:args.mapping,
  })
  const counts={
    settings:batch.rows.filter(r=>
      r.table==="agent_studio_kb_embedding_settings").length,
    queue:batch.rows.filter(r=>
      r.table==="agent_studio_kb_embedding_queue").length,
  }
  const report={
    mode:args.mode==="plan"?"plan_only":"isolated_pg17_archive",
    source_snapshot_sha256:batch.snapshot,
    settings_rows:counts.settings,queue_rows:counts.queue,
    source_read_only:true,
    embedding_enabled:false,jobs_created:0,
    historical_queue_replayed:false,
    model_connection_credentials_copied:false,
    production_cutover_allowed:false,
  }
  if(args.mode==="plan"){
    console.log(JSON.stringify({...report,result:"verified_offline_plan_only"},null,2))
    return
  }
  if(batch.rows.length===0){
    console.log(JSON.stringify({...report,result:"no_embedding_history_rows"},null,2))
    return
  }
  const pool=createPool()
  const adapter:SqlPool={
    async connect():Promise<SqlClient>{
      const client=await pool.connect()
      return {
        async query<T>(sql:string,params:unknown[]=[]){
          const value=await client.query(sql,params)
          return {rows:value.rows as T[]}
        },
        release(){client.release()},
      }
    },
  }
  try{
    const receipt=await importKbEmbeddingStateArchive(adapter,batch)
    console.log(JSON.stringify({...report,
      result:"embedding_history_archived_no_execution",
      imported:receipt.imported,replayed:receipt.replayed},null,2))
  }finally{await pool.end()}
}
if(process.argv[1]&&path.resolve(process.argv[1])===entry){
  runCli(process.argv.slice(2)).catch(error=>{
    const safe=new Set([
      "invalid_embedding_stage_arguments","stage_confirmation_required",
      "embedding_stage_import_disabled","embedding_stage_target_unsafe",
      "embedding_stage_secret_required","embedding_stage_secret_invalid",
    ])
    const message=error instanceof Error?error.message:""
    console.error("Embedding archive refused: "+
      (safe.has(message)?message:"embedding_archive_staging_failed"))
    process.exitCode=1
  })
}
