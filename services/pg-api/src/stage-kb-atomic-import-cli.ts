#!/usr/bin/env node
// V8.6 one-shot, stage-only, atomic legacy KB content import entry point.
// No PocketBase HTTP, model calls, scheduler activation, or public port.
// --plan NEVER opens a PG connection. --execute must be explicitly enabled.
import fs from "node:fs"
import path from "node:path"
import {fileURLToPath} from "node:url"
import {Pool} from "pg"
import {loadKbContentSnapshot,importKbSnapshotAtomic}
  from "./stage-kb-atomic-import.ts"
import type {SqlPool,SqlClient} from "./contracts.ts"

const here=fileURLToPath(import.meta.url)
type Args={
  mode:"plan"|"execute";snapshot:string;manifest:string;mapping:string
}
function deny(code:string):never{throw Error(code)}
function parse(argv:string[]):Args{
  const options=new Map<string,true|string>()
  for(let i=0;i<argv.length;i++){
    const arg=argv[i]
    if(!arg||!["--plan","--execute","--snapshot","--manifest",
      "--mapping"].includes(arg)||options.has(arg))deny("invalid_arguments")
    if(arg==="--plan"||arg==="--execute"){options.set(arg,true);continue}
    const value=argv[++i]
    if(!value||value.startsWith("--"))deny("invalid_arguments")
    options.set(arg,value)
  }
  if(options.has("--plan")===options.has("--execute")||
     ["--snapshot","--manifest","--mapping"].some(x=>
       typeof options.get(x)!=="string"))deny("invalid_arguments")
  return {
    mode:options.has("--plan")?"plan":"execute",
    snapshot:String(options.get("--snapshot")),
    manifest:String(options.get("--manifest")),
    mapping:String(options.get("--mapping")),
  }
}
function privateSecretFile(){
  const filename=process.env.AGENT_STUDIO_PG_IMPORT_PASSWORD_FILE
  if(!filename)deny("stage_secret_file_required")
  const real=fs.realpathSync(path.resolve(filename))
  const st=fs.statSync(real)
  if(!st.isFile()||st.size<32||st.size>4096)
    deny("stage_secret_size_invalid")
  const root=path.resolve(path.dirname(here),"../../..","pocketbase","pb_data")
  const live=fs.existsSync(root)?fs.realpathSync(root):root
  const canon=(input:string)=>process.platform==="win32"?
    input.toLowerCase():input
  if(canon(real)===canon(live)||
     canon(real).startsWith(canon(live+path.sep)))
    deny("secret_file_under_live_data")
  const password=fs.readFileSync(real,"utf8").replace(/[\r\n]+$/g,"")
  if(password.length<32||password.length>2048||
     /[\r\n\0]/.test(password)||/^(.)\1+$/.test(password))
    deny("stage_secret_invalid")
  return password
}
function privateStagePool():Pool{
  if(process.env.AGENT_STUDIO_PG_STAGE_KB_ATOMIC_ENABLED!=="true")
    deny("atomic_stage_import_disabled")
  const host=process.env.AGENT_STUDIO_PG_HOST
  if(!["postgres","127.0.0.1"].includes(String(host))||
     process.env.AGENT_STUDIO_PG_DATABASE!=="agentstudio_stage"||
     process.env.AGENT_STUDIO_PG_IMPORT_USER!=="agentstudio_admin")
    deny("unsafe_postgres_target")
  return new Pool({
    host:String(host),database:"agentstudio_stage",port:5432,
    user:"agentstudio_admin",password:privateSecretFile(),max:1,
    connectionTimeoutMillis:5000,statement_timeout:35000,
    idleTimeoutMillis:9000,
  })
}
export async function runCli(argv:string[]){
  const args=parse(argv)
  if(args.mode==="execute"&&
     process.env.AGENT_STUDIO_PG_STAGE_KB_ATOMIC_ENABLED!=="true")
    deny("atomic_stage_import_disabled")
  const batch=loadKbContentSnapshot({
    snapshot:args.snapshot,manifest:args.manifest,mapping:args.mapping,
  })
  const counts={
    documents:batch.rows.filter(x=>x.kind==="document").length,
    chunks:batch.rows.filter(x=>x.kind==="chunk").length,
    vectors:batch.rows.filter(x=>x.kind==="vector").length,
  }
  const report={
    operation:args.mode==="plan"?"plan_only":"isolated_stage_atomic",
    source_sha256:batch.snapshot,
    source_read_only:true,
    metadata_bases_with_content:new Set(batch.rows.map(x=>x.base)).size,
    content_records:counts,
    old_content_in_runtime_rag:false,
    old_acl_activated:false,
    old_workers_started:false,
    secrets_exported:false,
    production_cutover_allowed:false,
  }
  if(args.mode==="plan"){
    console.log(JSON.stringify({...report,result:"dry_run_only"},null,2))
    return
  }
  if(!batch.bases.length||!batch.rows.length)
    deny("no_atomic_content_to_import")
  const pool=privateStagePool()
  const adapter:SqlPool={
    async connect():Promise<SqlClient>{
      const db=await pool.connect()
      return {
        async query<T>(sql:string,values:unknown[]=[]){
          const r=await db.query(sql,values)
          return {rows:r.rows as T[]}
        },
        release(){db.release()},
      }
    },
  }
  try{
    const receipt=await importKbSnapshotAtomic(adapter,batch)
    console.log(JSON.stringify({...report,
      result:"metadata_and_content_staged_atomically",
      metadata_imported:receipt.imported,
      metadata_replayed:receipt.replayed,
      content_imported:receipt.archive?.imported??0,
      content_replayed:receipt.archive?.replayed??0,
      reconciled:receipt.archive?.reconciled??0,
    },null,2))
  }finally{await pool.end()}
}
if(process.argv[1]&&path.resolve(process.argv[1])===here){
  runCli(process.argv.slice(2)).catch(error=>{
    const safe=new Set([
      "invalid_arguments","atomic_stage_import_disabled",
      "unsafe_postgres_target","stage_secret_file_required",
      "stage_secret_size_invalid","secret_file_under_live_data",
      "stage_secret_invalid","no_atomic_content_to_import",
    ])
    const message=error instanceof Error?error.message:"error"
    // Parser, SQL and FS errors may contain user content, filenames or
    // credentials. Never log raw exceptions from an importer.
    console.error("Atomic KB staging refused: "+
      (safe.has(message)?message:"atomic_stage_import_failed"))
    process.exitCode=1
  })
}
