// Shared read-only preflight for PostgreSQL Prepare and Model Workers.
// Both actual Worker CLI --preflight paths and the separate BaoTa review
// entrypoints call this SAME implementation. It does not import any
// task runner, model provider, or migration code; SELECT and BEGIN READ ONLY.
import {readFileSync,lstatSync,accessSync,constants} from "node:fs"
import type {SqlClient,SqlPool} from "./contracts.ts"
import {assertPg18WorkerCredentialBinding} from "./worker-activation-guard.ts"
import {assertPg18CredentialMetadata} from "./worker-credential-policy.ts"
import {selectPgRuntimeTarget,verifyPgRuntimeTarget} from "./pg-runtime-target.ts"
import {verifyPgWorkerRoleBoundary} from "./worker-role-preflight.ts"
import {verifyOptionalCredentialBoundary} from "./optional-credential-boundary.ts"
import {selectKnowledgeSharing} from "./knowledge-sharing-policy.ts"
import {verifyKnowledgeRuntimeSchema} from "./knowledge-content-privileges.ts"

export type PgWorkerName="prepare"|"model"
const allowedStages=[
  "credential_binding","runtime_target_config","secret_file","pg_module",
  "pg_tcp_connection","pg_server_identity","worker_role_boundary","pool_cleanup",
] as const
type FailedStage=typeof allowedStages[number]
function report(kind:PgWorkerName,status:"passed"|"failed",stage:FailedStage|"complete"){
  process.stdout.write(JSON.stringify({
    mode:"preflight",worker:kind,
    target:"agent_studio",database_port:5333,
    stage,status,verified_roles:status==="passed",
    db_writes_performed:false,worker_started:false,
    external_model_calls:false,production_cutover_allowed:false
  })+"\n")
}
export async function runPg18NativeWorkerReadonlyPreflight(kind:PgWorkerName):Promise<void>{
  if(kind!=="prepare"&&kind!=="model")throw Error("readonly_worker_kind_invalid")
  let stage:FailedStage="credential_binding"
  let closePool:(()=>Promise<void>)|undefined
  let failure:FailedStage|undefined
  try{
    assertPg18WorkerCredentialBinding(process.env,kind)
    stage="runtime_target_config"
    const knowledgeSharing=selectKnowledgeSharing(process.env)
    if(process.env.AGENT_STUDIO_PG_PILOT_ENABLED!=="true")
      throw Error("pilot_disabled")
    const target=selectPgRuntimeTarget(process.env,"worker")
    if(target.mode!=="baota_pg18"||target.expectedMajor!==18||
       target.host!=="127.0.0.1"||target.port!==5333||
       target.database!=="agent_studio"||
       target.user!=="agentstudio_stage_worker")
      throw Error("pg18_target_invalid")
    stage="secret_file"
    const file=process.env.AGENT_STUDIO_PG_WORKER_PASSWORD_FILE
    if(!file)throw Error("missing_credential_path")
    const meta=lstatSync(file)
    let canRead=false
    try{accessSync(file,constants.R_OK);canRead=true}catch{}
    assertPg18CredentialMetadata({
      kind,env:process.env,file,stat:meta,uid:process.getuid?.(),canRead})
    const password=readFileSync(file,"utf8").replace(/[\r\n]+$/g,"")
    if(password.length<32||/^(.)\1+$/.test(password))
      throw Error("credential_format_invalid")
    stage="pg_module"
    const {Pool}=await import("pg")
    if(typeof Pool!=="function")throw Error("pg_driver_unavailable")
    const pool=new Pool({
      host:target.host,port:target.port,user:target.user,
      database:target.database,password,
      max:1,connectionTimeoutMillis:4000,
      idleTimeoutMillis:9000,statement_timeout:9000,
    })
    pool.on("error",()=>{})
    closePool=()=>pool.end()
    const adapter:SqlPool={
      async connect():Promise<SqlClient>{
        const c=await pool.connect()
        return {
          async query<Row>(sql:string,params:unknown[]=[]){
            const response=await c.query(sql,params)
            return {rows:response.rows as Row[]}
          },
          release(){c.release()},
        }
      },
    }
    stage="pg_tcp_connection"
    const session=await adapter.connect()
    session.release()
    stage="pg_server_identity"
    await verifyPgRuntimeTarget(adapter,target)
    stage="worker_role_boundary"
    await verifyPgWorkerRoleBoundary(adapter,target)
    if(knowledgeSharing)await verifyKnowledgeRuntimeSchema(adapter,true)
    // The additive operator package may reuse an older SHA-pinned general
    // verifier. Audit optional credentials here too so that package cannot
    // silently omit this boundary while preserving the old reviewed files.
    const optional=await adapter.connect()
    try{
      await optional.query("BEGIN READ ONLY")
      try{await optional.query("SET LOCAL ROLE agentstudio_api");await verifyOptionalCredentialBoundary(optional,"worker")}
      finally{await optional.query("ROLLBACK")}
    }finally{optional.release()}
  }catch{
    failure=stage
  }finally{
    if(closePool){
      try{await closePool()}
      catch{if(!failure)failure="pool_cleanup"}
    }
  }
  if(failure){
    report(kind,"failed",failure)
    process.exitCode=3
  }else report(kind,"passed","complete")
}
