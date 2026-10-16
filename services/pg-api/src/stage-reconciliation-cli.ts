#!/usr/bin/env node
// V8.7 STAGING ONLY / read-only, privacy-redacted reconciliation entry.
// --plan has NO PostgreSQL connections. --execute starts a READ ONLY
// transaction on the fixed isolated PG17 stage, never a production target.
import fs from "node:fs"
import path from "node:path"
import {fileURLToPath} from "node:url"
import {Pool} from "pg"
import {planOfflineReconciliation,reconcileStage,
  type ReconciliationInput} from "./stage-reconciliation.ts"
import type {SqlPool,SqlClient} from "./contracts.ts"

const filePath=fileURLToPath(import.meta.url)
function stop(code:string):never{throw Error(code)}
const allowed=new Set([
  "--plan","--execute","--snapshot","--manifest","--mapping","--approval","--reviewed-idp",
])
function parse(argv:string[]){
  const args=new Map<string,string|true>()
  for(let i=0;i<argv.length;i++){
    const flag=argv[i]
    if(!flag||!allowed.has(flag)||args.has(flag))stop("invalid_arguments")
    if(flag==="--plan"||flag==="--execute"){args.set(flag,true);continue}
    const value=argv[++i]
    if(!value||value.startsWith("--"))stop("invalid_arguments")
    args.set(flag,value)
  }
  if(args.has("--plan")===args.has("--execute")||
     [...allowed].filter(x=>x!=="--plan"&&x!=="--execute"&&x!=="--reviewed-idp")
       .some(x=>typeof args.get(x)!=="string"))
    stop("invalid_arguments")
  return {
    mode:args.has("--plan")?"plan":"execute",
    snapshot:String(args.get("--snapshot")),
    manifest:String(args.get("--manifest")),
    mapping:String(args.get("--mapping")),
    reviewedIdp:typeof args.get("--reviewed-idp")==="string"?String(args.get("--reviewed-idp")):undefined,
    approval:String(args.get("--approval")),
  } as const
}
function privateFile(value:string,label:string){
  const resolved=fs.realpathSync(path.resolve(value))
  const stat=fs.lstatSync(resolved)
  if(!stat.isFile()||!stat.size||stat.size>1_000_000)
    stop("invalid_"+label+"_file")
  const live=path.resolve(path.dirname(filePath),"../../..","pocketbase","pb_data")
  const trusted=fs.existsSync(live)?fs.realpathSync(live):live
  const norm=(x:string)=>process.platform==="win32"?x.toLowerCase():x
  if(norm(resolved)===norm(trusted)||
     norm(resolved).startsWith(norm(trusted+path.sep)))
    stop("live_source_forbidden")
  return resolved
}
function approvalFile(filename:string):ReconciliationInput["approval"]{
  try{
    const data=JSON.parse(fs.readFileSync(privateFile(filename,"approval"),"utf8"))
    if(!data||typeof data!=="object"||Array.isArray(data)||
       typeof data.source_sha256!=="string"||
       !/^[a-f0-9]{64}$/.test(data.source_sha256)||
       typeof data.approved_by!=="string"||
       data.approved_by.trim().length<2||
       data.approved_by.length>120||
       typeof data.approved_at!=="string"||
       !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/.test(data.approved_at)||
       !Number.isFinite(Date.parse(data.approved_at)))
      stop("approval_review_invalid")
    return {
      source_sha256:data.source_sha256,
      approved_by:data.approved_by,
      approved_at:data.approved_at,
    }
  }catch{return stop("approval_review_invalid")}
}
function stagePassword(){
  const filename=process.env.AGENT_STUDIO_PG_STAGE_RECONCILIATION_PASSWORD_FILE
  if(!filename)stop("stage_password_file_required")
  const resolved=fs.realpathSync(path.resolve(filename))
  const data=path.resolve(path.dirname(filePath),"../../..","pocketbase","pb_data")
  const live=fs.existsSync(data)?fs.realpathSync(data):data
  const norm=(x:string)=>process.platform==="win32"?x.toLowerCase():x
  if(norm(resolved)===norm(live)||
     norm(resolved).startsWith(norm(live+path.sep)))
    stop("stage_password_file_invalid")
  const stat=fs.statSync(resolved)
  if(!stat.isFile()||stat.size<32||stat.size>4096)
    stop("stage_password_file_invalid")
  const original=fs.readFileSync(resolved,"utf8")
  const password=original.replace(/[\r\n]+$/g,"")
  if(password.length<32||password.length>2048||
     /[\r\n\0]/.test(password)||/^(.)\1+$/.test(password))
    stop("stage_password_file_invalid")
  return password
}
function stagePool(){
  if(process.env.AGENT_STUDIO_PG_STAGE_RECONCILIATION_ENABLED!=="true")
    stop("reconciliation_disabled")
  const host=process.env.AGENT_STUDIO_PG_HOST
  if(!["127.0.0.1","postgres"].includes(String(host))||
     process.env.AGENT_STUDIO_PG_DATABASE!=="agentstudio_stage"||
     process.env.AGENT_STUDIO_PG_RECONCILIATION_USER!=="agentstudio_admin")
    stop("unsafe_stage_target")
  return new Pool({
    host:String(host),port:5432,database:"agentstudio_stage",
    user:"agentstudio_admin",password:stagePassword(),
    max:1,connectionTimeoutMillis:5000,
    statement_timeout:30000,idleTimeoutMillis:5000,
    // Second guard beyond BEGIN READ ONLY: no writes possible even if
    // a future refactor accidentally tries SQL before the transaction.
    options:"-c default_transaction_read_only=on",
    application_name:"agentstudio_stage_reconciliation",
  })
}
export async function runCli(argv:string[]){
  const args=parse(argv)
  // A direct --execute is blocked even before access to source files.
  if(args.mode==="execute"&&
     process.env.AGENT_STUDIO_PG_STAGE_RECONCILIATION_ENABLED!=="true")
    stop("reconciliation_disabled")
  const approval=approvalFile(args.approval)
  const input:ReconciliationInput={
    snapshot:args.snapshot,manifest:args.manifest,
    mapping:args.mapping,approval,
    ...(args.reviewedIdp?{reviewed_idp:args.reviewedIdp}:{}),
  }
  const plan=planOfflineReconciliation(input)
  const base={
    purpose:"isolated_postgresql_migration_reconciliation",
    source_snapshot_sha256:plan.source_sha256,
    source_verified:plan.state==="source_verified",
    source_read_only:true,target_read_only:true,
    contains_user_ids:false,contains_secrets:false,
    output_complete_source_coverage:false,
    production_cutover_allowed:false,
  }
  if(plan.state!=="source_verified"){
    console.log(JSON.stringify({...base,mode:args.mode,result:"blocked",
      blockers:plan.blockers},null,2))
    process.exitCode=2
    return
  }
  if(args.mode==="plan"){
    console.log(JSON.stringify({...base,mode:"plan_only",
      result:"source_inventory_only",
      domains:plan.domains,blockers:plan.blockers},null,2))
    return
  }
  const pool=stagePool()
  try{
    const adapter:SqlPool={
      async connect():Promise<SqlClient>{
        const client=await pool.connect()
        return {
          async query<T>(sql:string,params:unknown[]=[]){
            const result=await client.query(sql,params)
            return {rows:result.rows as T[]}
          },
          release(){client.release()},
        }
      },
    }
    const result=await reconcileStage(input,adapter)
    const failing=result.some(r=>r.status!=="success")
    console.log(JSON.stringify({...base,mode:"execute_read_only",
      result:failing?"not_ready_for_cutover":"scoped_reconciliation_passed",
      // Never interpret a scoped success as a production approval.
      blockers:failing?["unreconciled_or_unsupported_domains"]:[],
      domains:result},null,2))
    if(failing)process.exitCode=2
  }finally{await pool.end()}
}
if(process.argv[1]&&path.resolve(process.argv[1])===filePath){
  runCli(process.argv.slice(2)).catch(error=>{
    const known=new Set([
      "invalid_arguments","approval_review_invalid",
      "reconciliation_disabled","unsafe_stage_target",
      "stage_password_file_required","stage_password_file_invalid",
    ])
    const code=error instanceof Error?error.message:""
    console.error("Stage reconciliation refused: "+
      (known.has(code)?code:"reconciliation_failed"))
    process.exitCode=1
  })
}
