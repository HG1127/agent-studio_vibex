#!/usr/bin/env node
import type {WorkerHeartbeatWorkerLifecycle} from './worker-heartbeat-worker-lifecycle.ts'
import {selectKnowledgeSharing} from "./knowledge-sharing-policy.ts"
import {verifyKnowledgeRuntimeSchema,verifyKnowledgeAgentSchema,verifyWorkflowSampleLineageSchema} from "./knowledge-content-privileges.ts"
// Isolated opt-in model execution. NEVER starts alongside production V7 Worker.
import {readFileSync,lstatSync,accessSync,constants} from "node:fs"
import {randomUUID} from "node:crypto"
import {setTimeout as sleep} from "node:timers/promises"
import type {SqlClient,SqlPool} from "./contracts.ts"
import {selectPgRuntimeTarget,verifyPgRuntimeTarget} from "./pg-runtime-target.ts"
import {verifyPgWorkerRoleBoundary} from "./worker-role-preflight.ts"
import {assertPg18CredentialMetadata} from "./worker-credential-policy.ts"
import {assertPgWorkerActivation,assertPg18WorkerCredentialBinding,
  pgWorkerOfflinePlan}
  from "./worker-activation-guard.ts"

function required(name:string):string {
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
    try{assertPg18CredentialMetadata({kind:"model",env:process.env,
      file,stat,uid:process.getuid?.(),canRead})}
    catch{throw Error("unsafe_worker_secret")}
  }
  const password=readFileSync(file,"utf8").replace(/[\r\n]+$/g,"")
  if(password.length<32||/^(.)\1+$/.test(password))
    throw Error("unsafe_worker_secret")
  return {...target,password}
}
async function main(preflight=false){
  // PG18 --preflight runs the same audited module as the isolated MODEL
  // one-shot review; no provider/AgentModelWorker is imported in this mode.
  if(preflight&&process.env.AGENT_STUDIO_PG_BAOTA18_ENABLED==="true"){
    const {runPg18NativeWorkerReadonlyPreflight}=await import("./pg18-native-worker-readonly.ts")
    await runPg18NativeWorkerReadonlyPreflight("model")
    return
  }
  if(!preflight)assertPgWorkerActivation(process.env,process.argv.slice(2))
  assertPg18WorkerCredentialBinding(process.env,"model")
  if(process.env.AGENT_STUDIO_PG_PILOT_ENABLED!=="true"||
     (!preflight&&process.env.AGENT_STUDIO_PG_MODEL_WORKER_ENABLED!=="true"))
    throw Error("model_worker_disabled")
  const config=connection()
  // Defer the driver until credential and target validation. Offline --plan
  // does not load any DB, provider, Worker or task SQL modules.
  let stop=false
  let heartbeat:WorkerHeartbeatWorkerLifecycle|null=null
  let closeNewClaims:(()=>void)|undefined
  const requestStop=()=>{stop=true;closeNewClaims?.()}
  process.once("SIGTERM",requestStop)
  process.once("SIGINT",requestStop)
  const {Pool}=await import("pg")
  const pool=new Pool({host:config.host,port:config.port,
    user:config.user,database:config.database,password:config.password,
    max:2,connectionTimeoutMillis:4000,
    statement_timeout:8000,idleTimeoutMillis:10000})
  const adapter:SqlPool={knowledgeSharing:selectKnowledgeSharing(process.env),async connect():Promise<SqlClient>{
    const db=await pool.connect()
    return {
      async query<Row>(sql:string,params:unknown[]=[]){
        const result=await db.query(sql,params)
        return {rows:result.rows as Row[]}
      },
      release(){db.release()},
    }
  }}
  try{
    await verifyPgRuntimeTarget(adapter,config)
    // Shared read-only role preflight rejects extra privilege and leaked
    // native-auth membership before constructing any model provider.
    await verifyPgWorkerRoleBoundary(adapter,config)
    if(config.mode==="baota_pg18"){await verifyKnowledgeAgentSchema(adapter);await verifyWorkflowSampleLineageSchema(adapter)}
      if(adapter.knowledgeSharing)await verifyKnowledgeRuntimeSchema(adapter,true)
    if(preflight){
      process.stdout.write(JSON.stringify({
        mode:"preflight",worker:"model",target:config.database,
        database_port:config.port,verified_roles:true,
        db_writes_performed:false,worker_started:false,
        external_model_calls:false,production_cutover_allowed:false
      })+"\n")
      return
    }
    if(process.env.AGENT_STUDIO_PG_WORKER_HEARTBEAT_ENABLED==='true')heartbeat=await (await import('./worker-heartbeat-worker-lifecycle.ts')).openWorkerHeartbeatWorkerLifecycle('model')
    // Do not configure the provider until the exact DB endpoint and role pass.
    // Neither a model provider nor claim SQL is loaded in read-only preflight.
    const [{AgentModelWorker},{createStagingOpenAIProvider},transport]=await Promise.all([
      import("./model-worker.ts"),import("./model-provider.ts"),
      import("./bound-model-worker-runtime.ts")
    ])
    // The bound Worker never reads provider credentials and cannot fall back
    // to a shared fixed model. All role checks above precede TLS file loading.
    const bound=transport.selectBoundModelWorkerMode(process.env)==="bound"
    const dispatch=bound?transport.createApprovedBoundModelWorkerDispatch(process.env):undefined
    const provider=bound?{async generate(){throw Error("model_binding_required")}}:
      createStagingOpenAIProvider()
    const worker=new AgentModelWorker(adapter,
      "agent-model-"+randomUUID().slice(0,8),provider,
      dispatch?{boundModelDispatch:dispatch,boundExecutionApproved:true,boundOnly:true}:{})
    closeNewClaims=()=>{worker.closeNewClaims();if(worker.claimAdmissionSnapshot().closed)heartbeat?.newClaimsClosed()}
    if(stop){closeNewClaims();return}
    heartbeat?.startupChecksComplete()
    process.stdout.write(JSON.stringify({service:"pg-agent-model",
      state:"ready",mode:bound?"approved_owner_bound_text_only":"approved_text_only"})+"\n")
    while(!stop){
      try{
        const result=await worker.tick()
        if(result.status!=="idle")process.stdout.write(JSON.stringify({
          service:"pg-agent-model",state:result.status})+"\n")
        await sleep(result.status==="idle"?900:150)
      }catch{
        heartbeat?.loopUnavailable()
        process.stderr.write(JSON.stringify({service:"pg-agent-model",
          error:"model_worker_tick_failed"})+"\n")
        await sleep(2000)
      }
    }
  }finally{heartbeat?.close();await pool.end()}
}
const launchArgs=process.argv.slice(2)
if(launchArgs.length===1&&launchArgs[0]==="--plan"){
  process.stdout.write(JSON.stringify(pgWorkerOfflinePlan("model"))+"\n")
}else if(launchArgs.length===1&&
         ["--serve","--preflight"].includes(launchArgs[0]!)){
  void main(launchArgs[0]==="--preflight").catch((error:unknown)=>{
    const m=error instanceof Error?error.message:""
    const allowed=/^(model_worker_disabled|missing_[A-Z0-9_]+|unsafe_[a-z_]+|invalid_model_id|pg18_worker_not_approved)$/
    process.stderr.write(JSON.stringify({service:"pg-agent-model",
      error:allowed.test(m)?m:"model_worker_start_failed"})+"\n")
    process.exitCode=1
  })
}else{
  process.stderr.write("PG_MODEL_WORKER_EXPLICIT_MODE_REQUIRED\n")
  process.exitCode=1
}
