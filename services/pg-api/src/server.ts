#!/usr/bin/env node
// V8 independent PostgreSQL API pilot ONLY. No PocketBase modification,
// no browser launch, no admin access, and no automatic Docker/DB creation.
import {readFileSync,statSync} from "node:fs"
import {createServer} from "node:http"
import {Pool} from "pg"
import {createOidcVerifier} from "./auth.ts"
import {AgentSpecRepository,verifyDatabaseRole} from "./repository.ts"
import {RunRepository} from "./run-repository.ts"
import {WorkflowRepository} from "./workflow-repository.ts"
import {KnowledgeBaseRepository} from "./knowledge-repository.ts"
import {createHandler} from "./http.ts"
import type {SqlClient,SqlPool} from "./contracts.ts"
import {selectPgRuntimeTarget,verifyPgRuntimeTarget} from "./pg-runtime-target.ts"

function required(name:string):string {
  const value=String(process.env[name]||"").trim()
  if(!value)throw new Error("missing_"+name)
  return value
}
function loadStagingDatabaseConfig() {
  const target=selectPgRuntimeTarget(process.env,"api")
  const file=required("AGENT_STUDIO_PG_PASSWORD_FILE")
  const stat=statSync(file)
  if(!stat.isFile() || stat.size>4096 || stat.size<32)
    throw new Error("unsafe_password_file")
  const password=readFileSync(file,"utf8").replace(/[\r\n]+$/g,"")
  if(password.length<32 || /^(.)\1+$/.test(password))
    throw new Error("unsafe_password_file")
  return {...target,password}
}
async function main(){
  // F05 uses current Native employee Cookie identity exclusively.
  if(Object.keys(process.env).some(key=>key.startsWith("AGENT_STUDIO_PG18_AGENT_PLAN_WORKFLOW_")&&process.env[key]!==undefined))
    throw new Error("agent_plan_workflow_native_cookie_required")
  if(process.env.AGENT_STUDIO_PG_PILOT_ENABLED!=="true")
    throw new Error("pilot_disabled")
  const credentials=loadStagingDatabaseConfig()
  const verifyToken=createOidcVerifier({
    issuer:required("AGENT_STUDIO_OIDC_ISSUER"),
    audience:required("AGENT_STUDIO_OIDC_AUDIENCE"),
    jwksUrl:required("AGENT_STUDIO_OIDC_JWKS_URL"),
  })
  const allowedOrigin=required("AGENT_STUDIO_INTERNAL_APP_ORIGIN")
  const url=new URL(allowedOrigin)
  if(!["https:","http:"].includes(url.protocol) ||
     (url.protocol==="http:" && url.hostname!=="localhost" &&
      url.hostname!=="127.0.0.1") ||
     url.pathname!=="/" || url.search || url.hash)
    throw new Error("unsafe_internal_origin")
  const port=Number(process.env.AGENT_STUDIO_PG_API_PORT||7402)
  if(!Number.isSafeInteger(port) || port<1024 || port>65535)
    throw new Error("invalid_listen_port")
  const bind=process.env.AGENT_STUDIO_PG_API_BIND||"127.0.0.1"
  if(!["127.0.0.1","0.0.0.0"].includes(bind))
    throw new Error("invalid_listen_bind")
  // Container access is only permissible behind loopback-bound host mapping.
  if(bind==="0.0.0.0" && process.env.AGENT_STUDIO_PG_PILOT_CONTAINER!=="true")
    throw new Error("unsafe_listen_bind")

  const pool=new Pool({
    host:credentials.host,port:credentials.port,
    user:credentials.user,database:credentials.database,
    password:credentials.password,max:5,
    connectionTimeoutMillis:4000,idleTimeoutMillis:30000,
    statement_timeout:10000})
  const adapter:SqlPool={
    async connect():Promise<SqlClient> {
      const client=await pool.connect()
      return {
        async query<Row>(sql:string,values:unknown[]=[]){
          const result=await client.query(sql,values)
          return {rows:result.rows as Row[]}
        },
        release(){client.release()},
      }
    },
  }
  try{
    await verifyPgRuntimeTarget(adapter,credentials)
    await verifyDatabaseRole(adapter)
    const repository=new AgentSpecRepository(adapter)
    const runRepository=new RunRepository(adapter)
    const workflowRepository=new WorkflowRepository(adapter)
    const knowledgeRepository=new KnowledgeBaseRepository(adapter)
    const server=createServer(createHandler({repository,runRepository,workflowRepository,knowledgeRepository,verifyToken,allowedOrigin}))
    server.requestTimeout=15000
    server.headersTimeout=12000
    server.maxRequestsPerSocket=100
    server.listen(port,bind,()=>{
      process.stdout.write(JSON.stringify({service:"pg-api-pilot",state:"listening",
        port,scope:"isolated"})+"\n")
    })
    const stop=()=>{
      server.close(()=>{void pool.end().then(()=>process.exit(0))})
    }
    process.once("SIGTERM",stop)
    process.once("SIGINT",stop)
  }catch(error){
    await pool.end()
    throw error
  }
}
main().catch((error:unknown)=>{
  // Never print database URLs, credentials or JWTs to logs.
  const message=error instanceof Error?error.message:"unknown_error"
  const safeCode=/^(pilot_disabled|missing_[A-Z0-9_]+|unsafe_[a-z_]+|invalid_[a-z_]+|database_api_role_unavailable)$/.test(message)
    ? message:"service_start_failed"
  process.stderr.write(JSON.stringify({service:"pg-api-pilot",error:safeCode})+"\n")
  process.exitCode=1
})
