#!/usr/bin/env node
// W18: verified frozen PocketBase KB metadata + documents/chunks/vectors +
// embedding settings/queue, all in ONE PostgreSQL17 stage transaction.
// No runtime RAG, API, worker, ACL or model connection activation.
import fs from "node:fs"
import path from "node:path"
import {fileURLToPath} from "node:url"
import {Pool} from "pg"
import {
  loadKbCombinedSnapshot,importKbCombinedAtomic,
} from "./stage-kb-combined-import.ts"
import type {SqlPool,SqlClient} from "./contracts.ts"

const entry=fileURLToPath(import.meta.url)
const live=path.resolve(path.dirname(entry),"../../../pocketbase/pb_data")
const refuse=(code:string):never=>{throw Error(code)}
function parse(args:string[]){
  const flags=new Map<string,true|string>()
  for(let i=0;i<args.length;i++){
    const flag=args[i]
    if(!flag||!["--plan","--execute","--snapshot","--manifest",
      "--mapping","--confirm-stage"].includes(flag)||flags.has(flag))
      refuse("invalid_combined_kb_arguments")
    if(flag==="--plan"||flag==="--execute"){
      flags.set(flag,true);continue
    }
    const value=args[++i]
    if(!value||value.startsWith("--"))refuse("invalid_combined_kb_arguments")
    flags.set(String(flag),String(value))
  }
  if(flags.has("--plan")===flags.has("--execute")||
     ["--snapshot","--manifest","--mapping"].some(x=>
       typeof flags.get(x)!=="string"))refuse("invalid_combined_kb_arguments")
  const mode=flags.has("--plan")?"plan":"execute"
  if(mode==="plan"&&flags.has("--confirm-stage"))
    refuse("invalid_combined_kb_arguments")
  if(mode==="execute"&&flags.get("--confirm-stage")!=="agentstudio_stage")
    refuse("isolated_kb_stage_confirmation_required")
  return {mode,
    snapshot:String(flags.get("--snapshot")),
    manifest:String(flags.get("--manifest")),
    mapping:String(flags.get("--mapping")),
  }
}
function safeStagePassword(){
  const file=process.env.AGENT_STUDIO_PG_IMPORT_PASSWORD_FILE
  if(!file)refuse("kb_stage_secret_file_missing")
  const p=path.resolve(String(file)),st=fs.lstatSync(p)
  if(!st.isFile()||st.isSymbolicLink()||st.size<32||st.size>4096)
    refuse("kb_stage_secret_invalid")
  const real=fs.realpathSync(p)
  const original=fs.existsSync(live)?fs.realpathSync(live):live
  const norm=(x:string)=>process.platform==="win32"?x.toLowerCase():x
  if(norm(p)!==norm(real)||norm(real)===norm(original)||
     norm(real).startsWith(norm(original+path.sep)))
    refuse("kb_stage_secret_invalid")
  const secret=fs.readFileSync(real,"utf8").replace(/[\r\n]+$/g,"")
  if(secret.length<32||secret.length>2048||
     /[\r\n\0]/.test(secret)||/^(.)\1+$/.test(secret))
    refuse("kb_stage_secret_invalid")
  return secret
}
function pgPool(){
  if(process.env.AGENT_STUDIO_PG_STAGE_KB_COMBINED_ENABLED!=="true")
    refuse("kb_combined_stage_disabled")
  if(!["127.0.0.1","postgres"].includes(
      String(process.env.AGENT_STUDIO_PG_HOST))||
     process.env.AGENT_STUDIO_PG_DATABASE!=="agentstudio_stage"||
     process.env.AGENT_STUDIO_PG_IMPORT_USER!=="agentstudio_admin")
    refuse("kb_combined_stage_target_unsafe")
  return new Pool({
    host:String(process.env.AGENT_STUDIO_PG_HOST),port:5432,
    database:"agentstudio_stage",user:"agentstudio_admin",
    password:safeStagePassword(),max:1,
    connectionTimeoutMillis:5000,statement_timeout:45000,idleTimeoutMillis:7000,
  })
}
export async function runCli(argv:string[]){
  const args=parse(argv)
  if(args.mode==="execute"&&
     process.env.AGENT_STUDIO_PG_STAGE_KB_COMBINED_ENABLED!=="true")
    refuse("kb_combined_stage_disabled")
  const batch=loadKbCombinedSnapshot(args)
  const base={
    operation:args.mode==="plan"?"plan_only":"isolated_stage_atomic",
    source_snapshot_sha256:batch.snapshot,
    source_read_only:true,
    knowledge_archive_only:true,
    embedding_enabled:false,
    rag_enabled:false,acl_activated:false,jobs_created:0,
    production_cutover_allowed:false,
  }
  if(args.mode==="plan"){
    console.log(JSON.stringify({...base,result:"verified_frozen_combined_source"},null,2))
    return
  }
  const pool=pgPool()
  const adapter:SqlPool={
    async connect():Promise<SqlClient>{
      const conn=await pool.connect()
      return {async query<T>(sql:string,values:unknown[]=[]){
        const r=await conn.query(sql,values)
        return {rows:r.rows as T[]}
      },release(){conn.release()}}
    },
  }
  try{
    const receipt=await importKbCombinedAtomic(adapter,batch)
    console.log(JSON.stringify({...base,
      result:"single_transaction_three_domains_staged",
      metadata_imported:receipt.metadata.imported,
      content_imported:receipt.content.imported,
      embedding_imported:receipt.embedding.imported,
      metadata_replayed:receipt.metadata.replayed,
      content_replayed:receipt.content.replayed,
      embedding_replayed:receipt.embedding.replayed},null,2))
  }finally{await pool.end()}
}
if(process.argv[1]&&path.resolve(process.argv[1])===entry){
  runCli(process.argv.slice(2)).catch(error=>{
    const publicCodes=new Set([
      "invalid_combined_kb_arguments","isolated_kb_stage_confirmation_required",
      "kb_combined_stage_disabled","kb_combined_stage_target_unsafe",
      "kb_stage_secret_file_missing","kb_stage_secret_invalid",
    ])
    const code=error instanceof Error?error.message:""
    console.error("Combined KB staging refused: "+
      (publicCodes.has(code)?code:"kb_combined_stage_failed"))
    process.exitCode=1
  })
}
