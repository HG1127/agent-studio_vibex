#!/usr/bin/env node
// Isolated opt-in model execution. NEVER starts alongside production V7 Worker.
import {readFileSync,statSync} from "node:fs"
import {randomUUID} from "node:crypto"
import {setTimeout as sleep} from "node:timers/promises"
import {Pool} from "pg"
import {AgentModelWorker} from "./model-worker.ts"
import {createStagingOpenAIProvider} from "./model-provider.ts"
import type {SqlClient,SqlPool} from "./contracts.ts"

function required(name:string):string {
  const value=process.env[name]?.trim()||""
  if(!value)throw Error("missing_"+name)
  return value
}
function connection(){
  const host=required("AGENT_STUDIO_PG_HOST")
  const user=required("AGENT_STUDIO_PG_WORKER_USER")
  const database=required("AGENT_STUDIO_PG_DATABASE")
  if(!["postgres","127.0.0.1","localhost"].includes(host)||
    user!=="agentstudio_stage_worker"||database!=="agentstudio_stage")
    throw Error("unsafe_model_worker_database")
  const file=required("AGENT_STUDIO_PG_WORKER_PASSWORD_FILE")
  const stat=statSync(file)
  if(!stat.isFile()||stat.size<32||stat.size>4096)
    throw Error("unsafe_worker_secret")
  const password=readFileSync(file,"utf8").replace(/[\r\n]+$/g,"")
  if(password.length<32||/^(.)\1+$/.test(password))
    throw Error("unsafe_worker_secret")
  return {host,user,database,password}
}
async function main(){
  if(process.env.AGENT_STUDIO_PG_PILOT_ENABLED!=="true"||
     process.env.AGENT_STUDIO_PG_MODEL_WORKER_ENABLED!=="true")
    throw Error("model_worker_disabled")
  const provider=createStagingOpenAIProvider()
  const pool=new Pool({...connection(),max:2,connectionTimeoutMillis:4000,
    statement_timeout:8000,idleTimeoutMillis:10000})
  const adapter:SqlPool={async connect():Promise<SqlClient>{
    const db=await pool.connect()
    return {
      async query<Row>(sql:string,params:unknown[]=[]){
        const result=await db.query(sql,params)
        return {rows:result.rows as Row[]}
      },
      release(){db.release()},
    }
  }}
  let stop=false
  process.once("SIGTERM",()=>{stop=true})
  process.once("SIGINT",()=>{stop=true})
  try{
    // Fail closed unless this truly is the separately provisioned stage login.
    const db=await pool.connect()
    try{
      const roles=await db.query(
        "SELECT session_user AS login,rolsuper,bypass.rolbypassrls "+
        "FROM pg_roles AS bypass WHERE rolname=session_user")
      const role=roles.rows[0]
      if(role?.login!=="agentstudio_stage_worker"||
         role.rolsuper||role.rolbypassrls)
        throw Error("unsafe_model_worker_login")
      await db.query("BEGIN")
      try{
        await db.query("SET LOCAL ROLE agentstudio_worker")
        await db.query("SET LOCAL ROLE agentstudio_api")
      }finally{await db.query("ROLLBACK")}
    }finally{db.release()}
    const worker=new AgentModelWorker(adapter,
      "agent-model-"+randomUUID().slice(0,8),provider)
    process.stdout.write(JSON.stringify({service:"pg-agent-model",
      state:"ready",mode:"approved_text_only"})+"\n")
    while(!stop){
      try{
        const result=await worker.tick()
        if(result.status!=="idle")process.stdout.write(JSON.stringify({
          service:"pg-agent-model",state:result.status})+"\n")
        await sleep(result.status==="idle"?900:150)
      }catch{
        process.stderr.write(JSON.stringify({service:"pg-agent-model",
          error:"model_worker_tick_failed"})+"\n")
        await sleep(2000)
      }
    }
  }finally{await pool.end()}
}
main().catch((error:unknown)=>{
  const m=error instanceof Error?error.message:""
  const allowed=/^(model_worker_disabled|missing_[A-Z0-9_]+|unsafe_[a-z_]+|invalid_model_id)$/
  process.stderr.write(JSON.stringify({service:"pg-agent-model",
    error:allowed.test(m)?m:"model_worker_start_failed"})+"\n")
  process.exitCode=1
})
