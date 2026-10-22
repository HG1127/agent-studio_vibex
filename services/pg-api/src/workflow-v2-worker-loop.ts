#!/usr/bin/env node
// Explicit PG18 V2 Worker. Optional model-only private mTLS adapter, disabled
// by default. Tool/Agent nodes pause before creating an external effect.
import {readFileSync,lstatSync,accessSync,constants} from "node:fs"
import {randomUUID} from "node:crypto"
import {setTimeout as sleep} from "node:timers/promises"
import {selectPgRuntimeTarget,verifyPgRuntimeTarget} from "./pg-runtime-target.ts"
import {verifyPgWorkerRoleBoundary} from "./worker-role-preflight.ts"
import {assertPg18CredentialMetadata} from "./worker-credential-policy.ts"
import {assertPgWorkerActivation,assertPg18WorkerCredentialBinding,pgWorkerOfflinePlan} from "./worker-activation-guard.ts"
import {WorkflowV2Worker} from "./workflow-v2-worker.ts"
import {selectWorkflowV2ModelExecution} from "./workflow-v2-model-contract.ts"
import {readBoundRuntimeCredential} from "./bound-runtime-credentials.ts"
import {workflowV2ModelEffectExecutor} from "./workflow-v2-model-client.ts"
import type {SqlPool} from "./contracts.ts"
const marker="APPROVE_ISOLATED_PG_WORKFLOW_V2_RUNTIME_ONLY"
function required(name:string){const value=process.env[name]?.trim();if(!value)throw Error("missing_"+name);return value}
async function main(mode:"serve"|"preflight"){
  const modelEnabled=selectWorkflowV2ModelExecution(process.env)
  if(mode==="serve"){
    assertPgWorkerActivation(process.env,["--serve"])
    if(process.env.AGENT_STUDIO_PG_PILOT_ENABLED!=="true"||
       process.env.AGENT_STUDIO_PG_WORKFLOW_V2_WORKER_ENABLED!=="true"||
       process.env.AGENT_STUDIO_PG_WORKFLOW_V2_WORKER_APPROVED!==marker)throw Error("workflow_v2_worker_not_approved")
  }
  assertPg18WorkerCredentialBinding(process.env,"workflow")
  const target=selectPgRuntimeTarget(process.env,"worker")
  if(target.mode!=="baota_pg18")throw Error("workflow_v2_pg18_target_required")
  const file=required("AGENT_STUDIO_PG_WORKER_PASSWORD_FILE"),stat=lstatSync(file)
  let canRead=false;try{accessSync(file,constants.R_OK);canRead=true}catch{}
  assertPg18CredentialMetadata({kind:"workflow",env:process.env,file,stat,uid:process.getuid?.(),canRead})
  const password=readFileSync(file,"utf8").replace(/[\r\n]+$/g,"")
  if(password.length<32||password.length>4096||/^(.)\1+$/.test(password))throw Error("unsafe_worker_secret")
  const {Pool}=await import("pg")
  const pool=new Pool({host:target.host,port:target.port,user:target.user,database:target.database,password,max:2,
    connectionTimeoutMillis:4000,statement_timeout:8000,idleTimeoutMillis:10000})
  const adapter:SqlPool={async connect(){const db=await pool.connect();return {
    async query<Row>(sql:string,values:unknown[]=[]){return {rows:(await db.query(sql,values)).rows as Row[]}},release(){db.release()}}}}
  let stop=false;process.once("SIGTERM",()=>{stop=true});process.once("SIGINT",()=>{stop=true})
  try{
    await verifyPgRuntimeTarget(adapter,target);await verifyPgWorkerRoleBoundary(adapter,target)
    const executor=modelEnabled?workflowV2ModelEffectExecutor({approvedForIsolatedUat:true,
      origin:"https://127.0.0.1:7453",reviewedServerFingerprint256:required("AGENT_STUDIO_PG_BOUND_DISPATCH_SERVER_FINGERPRINT"),
      ca:readBoundRuntimeCredential("workflow","dispatch-ca.pem",process.env),
      cert:readBoundRuntimeCredential("workflow","dispatch-workflow.pem",process.env),
      key:readBoundRuntimeCredential("workflow","dispatch-workflow.key",process.env)}):undefined
    if(mode==="preflight"){
      process.stdout.write(JSON.stringify({mode,worker:"workflow_v2",verified_roles:true,db_writes_performed:false,
        worker_started:false,effect_executor_installed:false,model_adapter_config_verified:modelEnabled,production_cutover_allowed:false})+"\n");return
    }
    const worker=new WorkflowV2Worker(adapter,"pg-workflow-v2-"+randomUUID().slice(0,8),{executor})
    process.stdout.write(JSON.stringify({service:"pg-workflow-v2",state:"ready",effect_executor_installed:modelEnabled,
      scheduler_started:false,production_cutover_allowed:false})+"\n")
    while(!stop){
      try{const result=await worker.tick()
        if(result.status!=="idle")process.stdout.write(JSON.stringify({service:"pg-workflow-v2",state:result.status,run_id:result.run_id})+"\n")
        if(!stop)await sleep(result.status==="idle"?900:100)
      }catch{process.stderr.write('{"service":"pg-workflow-v2","error":"workflow_v2_tick_failed"}\n');if(!stop)await sleep(1500)}
    }
  }finally{await pool.end()}
}
const args=process.argv.slice(2)
if(args.length===1&&args[0]==="--plan"){
  process.stdout.write(JSON.stringify({...pgWorkerOfflinePlan("workflow"),mode:"plan",workflow_execution:"workflow_native_v2",
    effect_executor_installed:false,separate_approval_required:true,production_cutover_allowed:false})+"\n")
}else if(args.length===1&&(args[0]==="--preflight"||args[0]==="--serve")){
  void main(args[0]==="--serve"?"serve":"preflight").catch(error=>{
    const message=error instanceof Error?error.message:""
    const safe=/^(missing_[A-Z0-9_]+|unsafe_[a-z_]+|pg18_worker_not_approved|workflow_v2_worker_not_approved|workflow_v2_pg18_target_required|pg18_worker_credential_binding_required)$/
    process.stderr.write(JSON.stringify({service:"pg-workflow-v2",error:safe.test(message)?message:"workflow_v2_start_failed"})+"\n")
    process.exitCode=1
  })
}else{process.stderr.write("PG_WORKFLOW_V2_EXPLICIT_MODE_REQUIRED\n");process.exitCode=1}
