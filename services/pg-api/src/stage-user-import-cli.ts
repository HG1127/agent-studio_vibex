#!/usr/bin/env node
// Opt-in, one-shot, STAGE-only OIDC identity preprovision. Never active login.
// --plan only reads approved, SHA256-verified offline SQLite+identity files.
// --execute requires explicit operator opt-in and private PG17 stage secrets.
import fs from "node:fs"
import path from "node:path"
import {fileURLToPath} from "node:url"
import {Pool} from "pg"
import {prepareDisabledUserProvision,provisionDisabledStageUsers,
  StageUserError} from "./stage-user-import.ts"
import type {SqlPool,SqlClient} from "./contracts.ts"

const here=fileURLToPath(import.meta.url)
function fail(code:string):never{throw new StageUserError(code)}
function flags(argv:string[]){
  const options=new Map<string,string|true>()
  for(let i=0;i<argv.length;i++){
    const flag=argv[i]
    if(!flag||![
      "--snapshot","--manifest","--mapping","--oidc","--plan","--execute",
    ].includes(flag)||options.has(flag))fail("invalid_stage_identity_arguments")
    if(flag==="--plan"||flag==="--execute"){
      options.set(flag,true);continue
    }
    const value=argv[++i]
    if(!value||value.startsWith("--"))fail("invalid_stage_identity_arguments")
    options.set(flag,value)
  }
  if(options.has("--plan")===options.has("--execute")||
     ["--snapshot","--manifest","--mapping","--oidc"].some(x=>
       typeof options.get(x)!=="string"))
    fail("invalid_stage_identity_arguments")
  return {
    mode:options.has("--execute")?"execute":"plan",
    snapshot:String(options.get("--snapshot")),
    manifest:String(options.get("--manifest")),
    mapping:String(options.get("--mapping")),
    oidc:String(options.get("--oidc")),
  }
}
function secureStagePool():Pool{
  if(process.env.AGENT_STUDIO_PG_STAGE_USER_IMPORT_ENABLED!=="true")
    fail("identity_import_disabled")
  const host=process.env.AGENT_STUDIO_PG_HOST
  if(!["postgres","127.0.0.1"].includes(String(host))||
     process.env.AGENT_STUDIO_PG_DATABASE!=="agentstudio_stage"||
     process.env.AGENT_STUDIO_PG_IMPORT_USER!=="agentstudio_admin")
    fail("unsafe_identity_postgres_target")
  const filename=process.env.AGENT_STUDIO_PG_IMPORT_PASSWORD_FILE
  if(!filename)fail("identity_secret_file_missing")
  const real=fs.realpathSync(path.resolve(filename))
  const size=fs.statSync(real).size
  if(size<32||size>4096)fail("identity_secret_size_invalid")
  const root=path.resolve(path.dirname(here),"../../..","pocketbase","pb_data")
  const live=fs.existsSync(root)?fs.realpathSync(root):root
  const normalize=(x:string)=>process.platform==="win32"?x.toLowerCase():x
  if(normalize(real).startsWith(normalize(live+path.sep)))
    fail("live_pocketbase_data_forbidden")
  const password=fs.readFileSync(real,"utf8").replace(/[\r\n]+$/g,"")
  if(password.length<32||password.length>2048||
     /[\0\r\n]/.test(password)||/^(.)\1+$/.test(password))
    fail("identity_secret_invalid")
  return new Pool({
    host:String(host),database:"agentstudio_stage",user:"agentstudio_admin",
    password,port:5432,max:1,connectionTimeoutMillis:5000,
    statement_timeout:20000,idleTimeoutMillis:9000,
  })
}
export async function runCli(argv:string[]){
  const options=flags(argv)
  if(options.mode==="execute"&&
     process.env.AGENT_STUDIO_PG_STAGE_USER_IMPORT_ENABLED!=="true")
    fail("identity_import_disabled")
  const plan=prepareDisabledUserProvision(
    options.snapshot,options.manifest,options.mapping,options.oidc)
  const summary={
    operation:options.mode==="plan"?"plan_only":"stage_only",
    source_snapshot_sha256:plan.source_snapshot_sha256,
    reviewed_users:plan.rows.length,
    source_read_only:true,content_exported:false,
    passwords_copied:false,users_enabled:false,
    production_cutover_allowed:false,
  }
  if(options.mode==="plan"){
    console.log(JSON.stringify({...summary,result:"dry_run_only"},null,2))
    return
  }
  const sqlPool=secureStagePool()
  const adapter:SqlPool={async connect():Promise<SqlClient>{
    const db=await sqlPool.connect()
    return {
      async query<R>(sql:string,values:unknown[]=[]){
        const result=await db.query(sql,values)
        return {rows:result.rows as R[]}
      },release(){db.release()},
    }
  }}
  try{
    const out=await provisionDisabledStageUsers(adapter,plan)
    console.log(JSON.stringify({...summary,result:"stage_users_disabled",
      users_created:out.users_created,users_replayed:out.users_replayed,
      users_reconciled:out.users_reconciled},null,2))
  }finally{await sqlPool.end()}
}
if(process.argv[1]&&path.resolve(process.argv[1])===here){
  runCli(process.argv.slice(2)).catch(error=>{
    const safe=new Set([
      "invalid_stage_identity_arguments","identity_import_disabled",
      "unsafe_identity_postgres_target","identity_secret_file_missing",
      "identity_secret_size_invalid","identity_secret_invalid",
      "live_pocketbase_data_forbidden",
    ])
    const code=error instanceof StageUserError?error.message:"failure"
    console.error("Stage identity import refused: "+
      (safe.has(code)?code:"identity_stage_import_failed"))
    process.exitCode=1
  })
}
