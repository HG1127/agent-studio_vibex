#!/usr/bin/env node
// V8 isolated PostgreSQL preparation Worker. Never starts V7 PocketBase or
// performs model calls, external tool writes, browser navigation or migration.
import {readFileSync,statSync} from "node:fs"
import {setTimeout as sleep} from "node:timers/promises"
import {randomUUID} from "node:crypto"
import {Pool} from "pg"
import {AgentPrepareWorker} from "./agent-worker.ts"
import type {SqlClient,SqlPool} from "./contracts.ts"

function requireEnv(name:string):string{
  const value=String(process.env[name]||"").trim()
  if(!value)throw Error("missing_"+name)
  return value
}
function workerConnection(){
  const host=requireEnv("AGENT_STUDIO_PG_HOST")
  const user=requireEnv("AGENT_STUDIO_PG_WORKER_USER")
  const database=requireEnv("AGENT_STUDIO_PG_DATABASE")
  if(!["postgres","127.0.0.1","localhost"].includes(host)||
     user!=="agentstudio_stage_worker"||
     database!=="agentstudio_stage")
    throw Error("unsafe_worker_database_config")
  const file=requireEnv("AGENT_STUDIO_PG_WORKER_PASSWORD_FILE")
  const stat=statSync(file)
  if(!stat.isFile()||stat.size<32||stat.size>4096)
    throw Error("unsafe_worker_secret_file")
  const password=readFileSync(file,"utf8").replace(/[\r\n]+$/g,"")
  if(password.length<32||/^(.)\1+$/.test(password))
    throw Error("unsafe_worker_secret_file")
  return {host,user,database,password}
}
async function verifyRoles(pool:SqlPool){
  const client=await pool.connect()
  try{
    const role=await client.query<{
      login:string;superuser:boolean;bypass:boolean
    }>(
      "SELECT session_user AS login,rolsuper AS superuser,"+
      "rolbypassrls AS bypass FROM pg_roles WHERE rolname=session_user")
    const r=role.rows[0]
    if(!r||r.login!=="agentstudio_stage_worker"||r.superuser||r.bypass)
      throw Error("unsafe_worker_login")
    for(const needed of ["agentstudio_worker","agentstudio_api"]){
      await client.query("BEGIN")
      try{
        await client.query("SET LOCAL ROLE "+needed)
        const changed=await client.query<{role:string}>(
          "SELECT current_user AS role")
        if(changed.rows[0]?.role!==needed)
          throw Error("worker_permission_missing")
      }finally{
        await client.query("ROLLBACK")
      }
    }
  }finally{client.release()}
}
async function main(){
  if(process.env.AGENT_STUDIO_PG_PILOT_ENABLED!=="true"||
     process.env.AGENT_STUDIO_PG_PREPARE_WORKER_ENABLED!=="true")
    throw Error("worker_disabled")
  const config=workerConnection()
  const pool=new Pool({...config,max:2,connectionTimeoutMillis:4000,
    idleTimeoutMillis:10000,statement_timeout:9000})
  const adapter:SqlPool={
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
  let stopping=false
  process.once("SIGTERM",()=>{stopping=true})
  process.once("SIGINT",()=>{stopping=true})
  try{
    await verifyRoles(adapter)
    const worker=new AgentPrepareWorker(adapter,
      "agent-prepare-"+randomUUID().slice(0,8))
    process.stdout.write(JSON.stringify({
      service:"pg-agent-prepare",state:"ready",mode:"prepare_only",
    })+"\n")
    while(!stopping){
      try{
        const result=await worker.tick()
        // Metrics only, never prompt, tenant ID, or job body.
        if(result.status!=="idle")process.stdout.write(JSON.stringify({
          service:"pg-agent-prepare",state:result.status,
        })+"\n")
        await sleep(result.status==="idle"?750:100)
      }catch{
        process.stderr.write(JSON.stringify({
          service:"pg-agent-prepare",error:"worker_tick_failed",
        })+"\n")
        await sleep(2000)
      }
    }
  }finally{await pool.end()}
}
main().catch(error=>{
  const message=error instanceof Error?error.message:"unknown_error"
  const code=/^(worker_disabled|missing_[A-Z0-9_]+|unsafe_[a-z_]+|worker_permission_missing)$/
    .test(message)?message:"worker_start_failed"
  process.stderr.write(JSON.stringify({
    service:"pg-agent-prepare",error:code,
  })+"\n")
  process.exitCode=1
})
