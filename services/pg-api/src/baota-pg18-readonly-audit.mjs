#!/usr/bin/env node
// BaoTa Agent Studio PG18: no HTTP server, no Agent/Worker start, no DML.
// The probe connects with two independent least-privilege logins and executes
// only SELECT and transaction-local role/rollback statements.
import fs from "node:fs"
import path from "node:path"
import {fileURLToPath} from "node:url"

const database="agent_studio"
const host="127.0.0.1"
const port=5333
const runtime=[
  {login:"agentstudio_stage_login",role:"agentstudio_api",file:"api.secret"},
  {login:"agentstudio_stage_worker",role:"agentstudio_worker",file:"worker.secret"},
]
const secretDir="/root/.agentstudio-pg18-secrets"
function refuse(code){throw Error(code)}

export function parseOptions(argv,env=process.env,platform=process.platform){
  if(argv.length===1&&argv[0]==="--plan"){
    return {mode:"plan",database,host,port,expected_major:18,
      service_logins:2,read_only:true,network_used:false,
      production_cutover_allowed:false}
  }
  if(argv.length!==3||argv[0]!=="--audit"||
     argv[1]!=="--confirm-database"||argv[2]!==database)
    refuse("invalid_arguments")
  if(platform!=="linux"||env.AGENT_STUDIO_PG18_READONLY_AUDIT_ENABLED!=="true"||
     Object.keys(env).some(name=>
       name==="DATABASE_URL"||(/^PG[A-Z_]/.test(name)&&env[name]!==undefined)))
    refuse("audit_not_enabled_or_unsafe_environment")
  return {mode:"audit",database,host,port,expected_major:18,
    service_logins:2,read_only:true,production_cutover_allowed:false}
}
function readSecret(name){
  if(!runtime.some(item=>item.file===name))refuse("unapproved_secret")
  const dir=fs.lstatSync(secretDir)
  if(!dir.isDirectory()||dir.isSymbolicLink()||(dir.mode&0o077)!==0)
    refuse("private_secret_directory_required")
  const file=path.join(secretDir,name)
  const st=fs.lstatSync(file)
  if(!st.isFile()||st.isSymbolicLink()||(st.mode&0o077)!==0||
     st.size<40||st.size>512)refuse("private_secret_file_required")
  const raw=fs.readFileSync(file)
  const value=raw.toString("utf8")
  if(!Buffer.from(value,"utf8").equals(raw))refuse("invalid_secret")
  const trimmed=value.replace(/\r?\n$/,"")
  if(trimmed.length<40||trimmed.length>256||/[^!-~]/.test(trimmed)||
     /[\0\r\n]/.test(trimmed))refuse("invalid_secret")
  return trimmed
}
function equal(value,expected,code){
  if(value!==expected)refuse(code)
}
async function assertDeniedInReadOnlyTransaction(db,sql){
  await db.query("SAVEPOINT agentstudio_audit_denied")
  let denied=false
  try{await db.query(sql)}
  catch(error){denied=error?.code==="42501"}
  await db.query("ROLLBACK TO SAVEPOINT agentstudio_audit_denied")
  await db.query("RELEASE SAVEPOINT agentstudio_audit_denied")
  if(!denied)refuse("unexpected_sensitive_table_access")
}
async function auditOne(pg,account){
  const password=readSecret(account.file)
  const db=new pg.Client({host,port,database,user:account.login,
    password,ssl:false,connectionTimeoutMillis:4000,
    query_timeout:10000,statement_timeout:10000,
    application_name:"agentstudio-pg18-readonly-audit"})
  let connected=false,started=false
  try{
    await db.connect()
    connected=true
    const identity=(await db.query(
      "SELECT current_database() AS db,session_user AS login,"+
      "host(inet_server_addr()) AS server_address,"+
      "inet_server_port() AS port,"+
      "current_setting('server_version_num')::integer AS version,"+
      "rolsuper AS superuser,rolbypassrls AS bypass "+
      "FROM pg_roles WHERE rolname=session_user")).rows[0]
    if(!identity||identity.db!==database||identity.login!==account.login||
       identity.server_address!==host||identity.port!==port||
       identity.version<180000||identity.version>=190000||
       identity.superuser!==false||identity.bypass!==false)
      refuse("unsafe_postgresql_target_or_role")
    const roleMember=(await db.query(
      "SELECT pg_has_role($1::name,$2::name,'member') AS yes",
      [account.login,account.role])).rows[0]?.yes
    equal(roleMember,true,"service_role_membership_missing")
    const schema=(await db.query(
      "SELECT count(*)::integer AS n FROM pg_tables WHERE schemaname='agentstudio'")).rows[0]
    equal(schema?.n,21,"unexpected_table_inventory")
    const rls=(await db.query(
      "SELECT count(*)::integer AS n FROM pg_class c "+
      "JOIN pg_namespace n ON n.oid=c.relnamespace "+
      "WHERE n.nspname='agentstudio' AND c.relkind='r' "+
      "AND c.relrowsecurity AND c.relforcerowsecurity")).rows[0]
    equal(rls?.n,20,"force_rls_missing")
    const vector=(await db.query(
      "SELECT extversion FROM pg_extension WHERE extname='vector'")).rows[0]
    equal(vector?.extversion,"0.8.7","pgvector_mismatch")
    await db.query("BEGIN READ ONLY")
    started=true
    await db.query("SET LOCAL ROLE "+account.role)
    const current=(await db.query("SELECT current_user AS role")).rows[0]
    equal(current?.role,account.role,"role_switch_failed")
    if(account.role==="agentstudio_api"){
      const actor=(await db.query(
        "SELECT agentstudio.actor_id() AS id")).rows[0]
      equal(actor?.id,null,"unexpected_actor_context")
      const visible=(await db.query(
        "SELECT count(*)::integer AS n FROM agentstudio.agent_specs")).rows[0]
      equal(visible?.n,0,"anonymous_rls_visibility")
      await assertDeniedInReadOnlyTransaction(db,
        "SELECT version FROM agentstudio.schema_migrations LIMIT 1")
    }else{
      await db.query("SELECT id,status FROM agentstudio.users LIMIT 1")
      await db.query("SELECT run_id,status FROM agentstudio.external_effects LIMIT 1")
      await assertDeniedInReadOnlyTransaction(db,
        "SELECT name FROM agentstudio.agent_specs LIMIT 1")
      await assertDeniedInReadOnlyTransaction(db,
        "SELECT instruction FROM agentstudio.runs LIMIT 1")
    }
    await db.query("ROLLBACK")
    started=false
    return {login:account.login,scope:account.role,connection_ok:true,
      read_only_transaction:true,roles_and_denials_checked:true}
  }finally{
    if(started&&connected)await db.query("ROLLBACK").catch(()=>undefined)
    if(connected)await db.end().catch(()=>undefined)
  }
}
export async function run(argv,env=process.env,platform=process.platform){
  const cfg=parseOptions(argv,env,platform)
  if(cfg.mode==="plan")return cfg
  const {default:pg}=await import("pg")
  const results=[]
  for(const item of runtime)results.push(await auditOne(pg,item))
  return {...cfg,passes:results,approved_for_api_cutover:false,
    approved_for_worker_start:false}
}
export async function main(argv){
  try{process.stdout.write(JSON.stringify(await run(argv))+"\n")}
  catch(error){
    const known=new Set(["invalid_arguments",
      "audit_not_enabled_or_unsafe_environment",
      "unapproved_secret","private_secret_directory_required",
      "private_secret_file_required","invalid_secret",
      "unsafe_postgresql_target_or_role","service_role_membership_missing",
      "unexpected_table_inventory","force_rls_missing","pgvector_mismatch",
      "role_switch_failed","unexpected_actor_context",
      "anonymous_rls_visibility","unexpected_sensitive_table_access"])
    const code=error instanceof Error&&known.has(error.message)
      ?error.message:"readonly_audit_failed"
    process.stderr.write("PG18_READONLY_AUDIT_FAILED:"+code+"\n")
    process.exitCode=1
  }
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))
  void main(process.argv.slice(2))
