#!/usr/bin/env node
import type {WorkerHeartbeatWorkerLifecycle} from './worker-heartbeat-worker-lifecycle.ts'
// Separate opt-in PostgreSQL Workflow Worker. Start/End nodes only.
// Never imports model providers, tools, arbitrary HTTP or PocketBase workers.
import {readFileSync,lstatSync,accessSync,constants} from "node:fs"
import {randomUUID} from "node:crypto"
import {setTimeout as sleep} from "node:timers/promises"
import type {SqlClient,SqlPool} from "./contracts.ts"
import {selectPgRuntimeTarget,verifyPgRuntimeTarget} from "./pg-runtime-target.ts"
import {verifyPgWorkerRoleBoundary} from "./worker-role-preflight.ts"
import {assertPg18CredentialMetadata} from "./worker-credential-policy.ts"
import {assertPgWorkerActivation,assertPg18WorkerCredentialBinding,
  pgWorkerOfflinePlan} from "./worker-activation-guard.ts"
const approval="APPROVE_ISOLATED_PG_WORKFLOW_START_END_ONLY"
function required(name:string):string{
  const value=process.env[name]?.trim()||""
  if(!value)throw Error("missing_"+name)
  return value
}
function connection(){
  const target=selectPgRuntimeTarget(process.env,"worker")
  const file=required("AGENT_STUDIO_PG_WORKER_PASSWORD_FILE")
  const stat=lstatSync(file)
  if(!stat.isFile()||stat.isSymbolicLink()||stat.size<32||stat.size>4096)
    throw Error("unsafe_worker_secret")
  if(target.mode==="baota_pg18"){
    let canRead=false
    try{accessSync(file,constants.R_OK);canRead=true}catch{}
    try{assertPg18CredentialMetadata({kind:"workflow",env:process.env,
      file,stat,uid:process.getuid?.(),canRead})}
    catch{throw Error("unsafe_worker_secret")}
  }
  const password=readFileSync(file,"utf8").replace(/[\r\n]+$/g,"")
  if(password.length<32||/^(.)\1+$/.test(password))throw Error("unsafe_worker_secret")
  return {...target,password}
}
async function main(mode:"serve"|"preflight"){
  if(mode==="serve"){
    assertPgWorkerActivation(process.env,["--serve"])
    if(process.env.AGENT_STUDIO_PG_PILOT_ENABLED!=="true"||
       process.env.AGENT_STUDIO_PG_WORKFLOW_WORKER_ENABLED!=="true"||
       process.env.AGENT_STUDIO_PG_WORKFLOW_WORKER_APPROVED!==approval)
      throw Error("workflow_worker_not_approved")
  }
  assertPg18WorkerCredentialBinding(process.env,"workflow")
  const cfg=connection()
  let stop=false
  let heartbeat:WorkerHeartbeatWorkerLifecycle|null=null
  let closeNewClaims:(()=>void)|undefined
  const requestStop=()=>{stop=true;closeNewClaims?.()}
  process.once("SIGTERM",requestStop)
  process.once("SIGINT",requestStop)
  const {Pool}=await import("pg")
  const pool=new Pool({host:cfg.host,port:cfg.port,user:cfg.user,
    database:cfg.database,password:cfg.password,max:2,
    connectionTimeoutMillis:4000,statement_timeout:8000,idleTimeoutMillis:10000})
  const adapter:SqlPool={async connect():Promise<SqlClient>{
    const db=await pool.connect()
    return {async query<Row>(sql:string,params:unknown[]=[]){
      const result=await db.query(sql,params);return {rows:result.rows as Row[]}
    },release(){db.release()}}
  }}
  try{
    await verifyPgRuntimeTarget(adapter,cfg)
    await verifyPgWorkerRoleBoundary(adapter,cfg)
    if(mode==="preflight"){
      process.stdout.write(JSON.stringify({mode:"preflight",worker:"workflow",
        target:cfg.database,database_port:cfg.port,verified_roles:true,
        db_writes_performed:false,worker_started:false,external_calls:false,
        production_cutover_allowed:false})+"\n")
      return
    }
    if(process.env.AGENT_STUDIO_PG_WORKER_HEARTBEAT_ENABLED==='true')heartbeat=await (await import('./worker-heartbeat-worker-lifecycle.ts')).openWorkerHeartbeatWorkerLifecycle('workflow_safe')
    // Read-only preflight never loads the executor or its claim SQL.
    const {WorkflowSafeWorker}=await import("./workflow-safe-worker.ts")
    const worker=new WorkflowSafeWorker(adapter,"pg-workflow-"+randomUUID().slice(0,8))
    closeNewClaims=()=>{worker.closeNewClaims();if(worker.claimAdmissionSnapshot().closed)heartbeat?.newClaimsClosed()}
    if(stop){closeNewClaims();return}
    heartbeat?.startupChecksComplete()
    process.stdout.write(JSON.stringify({service:"pg-agent-workflow",
      state:"ready",mode:"start_end_only",external_calls:false,
      scheduler_started:false,production_cutover_allowed:false})+"\n")
    while(!stop){
      try{
        const result=await worker.tick()
        if(result.status!=="idle")process.stdout.write(JSON.stringify({
          service:"pg-agent-workflow",state:result.status,
          run_id:result.run_id,steps_completed:result.steps_completed??0
        })+"\n")
        await sleep(result.status==="idle"?900:100)
      }catch{
        heartbeat?.loopUnavailable()
        process.stderr.write(JSON.stringify({service:"pg-agent-workflow",
          error:"workflow_worker_tick_failed"})+"\n")
        await sleep(1500)
      }
    }
  }finally{heartbeat?.close();await pool.end()}
}
const args=process.argv.slice(2)
if(args.length===1&&args[0]==="--plan"){
  process.stdout.write(JSON.stringify({...pgWorkerOfflinePlan("workflow"),
    mode:"plan",workflow_execution:"start_end_only",separate_approval_required:true})+"\n")
}else if(args.length===1&&args[0]==="--preflight"){
  void main("preflight").catch((error:unknown)=>{
    const m=error instanceof Error?error.message:""
    const allowed=/^(missing_[A-Z0-9_]+|unsafe_[a-z_]+|invalid_model_id|pg18_worker_not_approved|workflow_worker_not_approved|pg18_worker_credential_binding_required)$/
    process.stderr.write(JSON.stringify({service:"pg-agent-workflow",
      error:allowed.test(m)?m:"workflow_worker_preflight_failed"})+"\n")
    process.exitCode=1
  })
}else if(args.length===1&&args[0]==="--serve"){
  void main("serve").catch((error:unknown)=>{
    const m=error instanceof Error?error.message:""
    const allowed=/^(missing_[A-Z0-9_]+|unsafe_[a-z_]+|invalid_model_id|pg18_worker_not_approved|workflow_worker_not_approved|pg18_worker_credential_binding_required)$/
    process.stderr.write(JSON.stringify({service:"pg-agent-workflow",
      error:allowed.test(m)?m:"workflow_worker_start_failed"})+"\n")
    process.exitCode=1
  })
}else{
  process.stderr.write("PG_WORKFLOW_WORKER_EXPLICIT_MODE_REQUIRED\n")
  process.exitCode=1
}
