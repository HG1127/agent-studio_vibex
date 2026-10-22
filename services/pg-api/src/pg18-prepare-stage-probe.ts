#!/usr/bin/env node
/**
 * PostgreSQL 18 PREPARE Worker read-only STAGE probe.
 * Standalone entrypoint: NO agent-worker, model worker, task leasing or tools.
 * Only metadata access, SELECT and existing BEGIN READ ONLY role checks.
 * On failures emit a fixed stage name; never print exception data or secrets.
 */
import {lstatSync,readFileSync} from "node:fs"
import {assertPg18WorkerCredentialBinding} from "./worker-activation-guard.ts"
import {selectPgRuntimeTarget,verifyPgRuntimeTarget} from "./pg-runtime-target.ts"
import {verifyPgWorkerRoleBoundary} from "./worker-role-preflight.ts"
import type {SqlPool,SqlClient} from "./contracts.ts"

const marker="pg18_prepare_stage_probe_v1"
const stages=[
  "credential_binding","runtime_target_config","secret_file",
  "pg_module","pg_tcp_connection","pg_server_identity",
  "worker_role_boundary","pool_cleanup",
] as const
type Stage=typeof stages[number]
type Outcome={status:"passed"|"failed"; stage:Stage|"complete";
  diagnostic_marker:string;readonly_preflight:boolean;
  database_writes_performed:false;task_worker_started:false;
  model_worker_started:false;external_model_calls:false;
  production_cutover_allowed:false}

function report(status:Outcome["status"],stage:Outcome["stage"]){
  const payload:Outcome={diagnostic_marker:marker,status,stage,
    readonly_preflight:true,database_writes_performed:false,
    task_worker_started:false,model_worker_started:false,
    external_model_calls:false,production_cutover_allowed:false}
  process.stdout.write(JSON.stringify(payload)+"\n")
}
async function main(){
  let stage:Stage="credential_binding"
  let closePool:(()=>Promise<void>)|undefined
  let failed:Stage|undefined
  try{
    assertPg18WorkerCredentialBinding(process.env,"prepare")
    stage="runtime_target_config"
    const target=selectPgRuntimeTarget(process.env,"worker")
    if(target.mode!=="baota_pg18"||target.database!=="agent_studio"||
       target.port!==5333||target.host!=="127.0.0.1"||
       target.user!=="agentstudio_stage_worker"||target.expectedMajor!==18)
      throw Error("invalid_target")
    stage="secret_file"
    const file=process.env.AGENT_STUDIO_PG_WORKER_PASSWORD_FILE
    if(!file)throw Error("missing_file")
    const info=lstatSync(file)
    if(!info.isFile()||info.isSymbolicLink()||info.size<32||
       info.size>4096||(info.mode&0o077)!==0||
       ![0,process.getuid?.()].includes(info.uid))throw Error("invalid_credential_metadata")
    const password=readFileSync(file,"utf8").replace(/[\r\n]+$/g,"")
    if(password.length<32||/^(.)\1+$/.test(password))
      throw Error("invalid_credential")
    stage="pg_module"
    const {Pool}=await import("pg")
    if(typeof Pool!=="function")throw Error("driver_unavailable")
    const pool=new Pool({host:target.host,port:target.port,
      database:target.database,user:target.user,password,
      max:1,connectionTimeoutMillis:4000,statement_timeout:9000,
      idleTimeoutMillis:9000})
    pool.on("error",()=>{})
    closePool=()=>pool.end()
    const adapter:SqlPool={
      async connect():Promise<SqlClient>{
        const conn=await pool.connect()
        return {
          async query<Row>(sql:string,values:unknown[]=[]){
            const response=await conn.query(sql,values)
            return {rows:response.rows as Row[]}
          },
          release(){conn.release()},
        }
      }
    }
    stage="pg_tcp_connection"
    const session=await adapter.connect()
    session.release()
    stage="pg_server_identity"
    await verifyPgRuntimeTarget(adapter,target)
    stage="worker_role_boundary"
    await verifyPgWorkerRoleBoundary(adapter,target)
  }catch{
    failed=stage
  }finally{
    if(closePool){
      try{await closePool()}
      catch{if(!failed)failed="pool_cleanup"}
    }
  }
  if(failed){report("failed",failed);process.exitCode=3}
  else report("passed","complete")
}
if(process.argv.length===3&&process.argv[2]==="--preflight"){
  void main().catch(()=>{
    report("failed","credential_binding")
    process.exitCode=3
  })
}else{
  process.stderr.write("PG18_PREPARE_STAGE_EXPLICIT_READONLY_MODE_REQUIRED\n")
  process.exitCode=2
}
