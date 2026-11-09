#!/usr/bin/env node
import {reportWorkerStartupFailure} from './pg18-full069-worker-startup-observation.mjs'
import type {WorkerHeartbeatWorkerLifecycle} from './worker-heartbeat-worker-lifecycle.ts'
import {selectKnowledgeSharing} from "./knowledge-sharing-policy.ts"
import {verifyKnowledgeRuntimeSchema} from "./knowledge-content-privileges.ts"
// V8 isolated PostgreSQL preparation Worker. Never starts V7 PocketBase or
// performs model calls, external tool writes, browser navigation or migration.
import {readFileSync,lstatSync,accessSync,constants} from "node:fs"
import {setTimeout as sleep} from "node:timers/promises"
import {randomUUID} from "node:crypto"
import type {SqlClient,SqlPool} from "./contracts.ts"
import {selectPgRuntimeTarget,verifyPgRuntimeTarget} from "./pg-runtime-target.ts"
import {verifyPgWorkerRoleBoundary} from "./worker-role-preflight.ts"
import {assertPg18CredentialMetadata} from "./worker-credential-policy.ts"
import {assertPgWorkerActivation,assertPg18WorkerCredentialBinding,
  pgWorkerOfflinePlan}
  from "./worker-activation-guard.ts"

function requireEnv(name:string):string{
  const value=String(process.env[name]||"").trim()
  if(!value)throw Error("missing_"+name)
  return value
}
function workerConnection(){
  const target=selectPgRuntimeTarget(process.env,"worker")
  const file=requireEnv("AGENT_STUDIO_PG_WORKER_PASSWORD_FILE")
  const stat=lstatSync(file)
  if(!stat.isFile()||stat.isSymbolicLink()||stat.size<32||stat.size>4096)
    throw Error("unsafe_worker_secret_file")
  if(target.mode==="baota_pg18"){
    let canRead=false
    try{accessSync(file,constants.R_OK);canRead=true}catch{}
    try{assertPg18CredentialMetadata({kind:"prepare",env:process.env,
      file,stat,uid:process.getuid?.(),canRead})}
    catch{throw Error("unsafe_worker_secret_file")}
  }
  const password=readFileSync(file,"utf8").replace(/[\r\n]+$/g,"")
  if(password.length<32||/^(.)\1+$/.test(password))
    throw Error("unsafe_worker_secret_file")
  return {...target,password}
}
let startupStage='entry'
async function main(preflight=false){
  // Real PG18 --preflight and the audited stand-alone PREPARE review entry
  // share exactly the same read-only implementation; preserve PG17 behavior.
  if(preflight&&process.env.AGENT_STUDIO_PG_BAOTA18_ENABLED==="true"){
    const {runPg18NativeWorkerReadonlyPreflight}=await import("./pg18-native-worker-readonly.ts")
    await runPg18NativeWorkerReadonlyPreflight("prepare")
    return
  }
  startupStage='activation';if(!preflight)assertPgWorkerActivation(process.env,process.argv.slice(2))
  startupStage='credential_binding';assertPg18WorkerCredentialBinding(process.env,"prepare")
  if(process.env.AGENT_STUDIO_PG_PILOT_ENABLED!=="true"||
     (!preflight&&process.env.AGENT_STUDIO_PG_PREPARE_WORKER_ENABLED!=="true"))
    throw Error("worker_disabled")
  startupStage='credential_read';const config=workerConnection()
  let stopping=false
  let heartbeat:WorkerHeartbeatWorkerLifecycle|null=null
  let closeNewClaims:(()=>void)|undefined
  const stop=()=>{stopping=true;closeNewClaims?.()}
  process.once("SIGTERM",stop)
  process.once("SIGINT",stop)
  // Keep --plan completely offline; for --preflight load ONLY the DB driver,
  // never the worker SQL sources or execution engine.
  startupStage='pg_import';const {Pool}=await import("pg")
  startupStage='pool_create';const pool=new Pool({
    host:config.host,port:config.port,user:config.user,
    database:config.database,password:config.password,
    max:2,connectionTimeoutMillis:4000,
    idleTimeoutMillis:10000,statement_timeout:9000})
  const adapter:SqlPool={knowledgeSharing:selectKnowledgeSharing(process.env),
    async connect():Promise<SqlClient>{
      const c=await pool.connect()
      return {
        async query<Row>(statement:string,params:unknown[]=[]){
          const response=await c.query(statement,params)
          return {rows:response.rows as Row[]}
        },
        release(){c.release()},
      }
    },
  }
  try{
    startupStage='target_audit';await verifyPgRuntimeTarget(adapter,config)
    startupStage='worker_role_audit';await verifyPgWorkerRoleBoundary(adapter,config)
      startupStage='knowledge_runtime_audit';if(adapter.knowledgeSharing)await verifyKnowledgeRuntimeSchema(adapter,true)
    if(preflight){
      process.stdout.write(JSON.stringify({
        mode:"preflight",worker:"prepare",target:config.database,
        database_port:config.port,verified_roles:true,
        db_writes_performed:false,worker_started:false,
        external_model_calls:false,production_cutover_allowed:false
      })+"\n")
      return
    }
    startupStage='heartbeat_open';if(process.env.AGENT_STUDIO_PG_WORKER_HEARTBEAT_ENABLED==='true')heartbeat=await (await import('./worker-heartbeat-worker-lifecycle.ts')).openWorkerHeartbeatWorkerLifecycle('prepare')
    // Execution-only code and claim SQL are not loaded during --preflight.
    startupStage='worker_import';const {AgentPrepareWorker}=await import("./agent-worker.ts")
    startupStage='worker_construct';const worker=new AgentPrepareWorker(adapter,
      "agent-prepare-"+randomUUID().slice(0,8))
    closeNewClaims=()=>{worker.closeNewClaims();if(worker.claimAdmissionSnapshot().closed)heartbeat?.newClaimsClosed()}
    // A signal may have arrived while startup checks or the lazy import awaited.
    if(stopping){closeNewClaims();return}
    heartbeat?.startupChecksComplete()
    process.stdout.write(JSON.stringify({
      service:"pg-agent-prepare",state:"ready",mode:"prepare_only",
    })+"\n")
    startupStage='loop_run';while(!stopping){
      try{
        const result=await worker.tick()
        // Metrics only, never prompt, tenant ID, or job body.
        if(result.status!=="idle")process.stdout.write(JSON.stringify({
          service:"pg-agent-prepare",state:result.status,
        })+"\n")
        await sleep(result.status==="idle"?750:100)
      }catch{
        heartbeat?.loopUnavailable()
        process.stderr.write(JSON.stringify({
          service:"pg-agent-prepare",error:"worker_tick_failed",
        })+"\n")
        await sleep(2000)
      }
    }
  }finally{const priorStartupStage=startupStage;startupStage='pool_cleanup';heartbeat?.close();await pool.end();startupStage=priorStartupStage}
}
const launchArgs=process.argv.slice(2)
if(launchArgs.length===1&&launchArgs[0]==="--plan"){
  process.stdout.write(JSON.stringify(pgWorkerOfflinePlan("prepare"))+"\n")
}else if(launchArgs.length===1&&
         ["--serve","--preflight"].includes(launchArgs[0]!)){
  void main(launchArgs[0]==="--preflight").catch(error=>{
    try{reportWorkerStartupFailure(startupStage,error)}catch{}
    const message=error instanceof Error?error.message:"unknown_error"
    const code=/^(worker_disabled|missing_[A-Z0-9_]+|unsafe_[a-z_]+|worker_permission_missing|pg18_worker_not_approved)$/
      .test(message)?message:"worker_start_failed"
    process.stderr.write(JSON.stringify({
      service:"pg-agent-prepare",error:code,
    })+"\n")
    process.exitCode=1
  })
}else{
  process.stderr.write("PG_PREPARE_WORKER_EXPLICIT_MODE_REQUIRED\n")
  process.exitCode=1
}
