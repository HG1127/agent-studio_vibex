#!/usr/bin/env node
// Creates schema and least-privilege roles inside an ALREADY CREATED, EMPTY,
// dedicated BaoTa PostgreSQL 18 database. No legacy data, DROP, or cutover.
import fs from "node:fs"
import path from "node:path"
import {createHash} from "node:crypto"
import {fileURLToPath} from "node:url"

const here=fileURLToPath(import.meta.url)
const root=path.resolve(path.dirname(here),"../../..")
const target="agent_studio"
const roles=["agentstudio_api","agentstudio_worker",
  "agentstudio_stage_login","agentstudio_stage_worker","agentstudio_model_broker"]
function fail(code){throw Error(code)}
function parse(argv){
  if(argv.length===1&&argv[0]==="--plan")return false
  if(argv.length===3&&argv[0]==="--execute"&&argv[1]==="--confirm-stage"&&argv[2]===target)
    return true
  fail("invalid_arguments")
}
function sourceSql(){
  const raw=fs.readFileSync(path.join(root,"db/postgres/001_stage_schema.sql"),"utf8")
  const lines=raw.split(/\r?\n/)
  if(lines.filter(x=>x.trim().startsWith("\\")).join("")!=="\\set ON_ERROR_STOP on"||
     lines.filter(x=>x.trim()==="BEGIN;").length!==1||
     lines.filter(x=>x.trim()==="COMMIT;").length!==1)
    fail("unknown_schema_format")
  return {hash:createHash("sha256").update(raw).digest("hex"),
    sql:lines.filter(x=>!["\\set ON_ERROR_STOP on","BEGIN;","COMMIT;"].includes(x.trim())).join("\n")}
}
function config(env){
  if(env.AGENT_STUDIO_BAOTA_FRESH_PG_ENABLED!=="true")fail("baota_init_disabled")
  if(process.platform!=="linux")fail("baota_linux_only")
  if(env.AGENT_STUDIO_BAOTA_PG_HOST!=="127.0.0.1"||
     env.AGENT_STUDIO_BAOTA_PG_DATABASE!==target||
     env.AGENT_STUDIO_BAOTA_PG_PORT!=="5333"||
     !["postgres","agentstudio_admin"].includes(env.AGENT_STUDIO_BAOTA_PG_ADMIN_USER))
    fail("unsafe_baota_target")
  if(Object.keys(env).some(k=>(/^PG[A-Z_]/.test(k)||k==="DATABASE_URL")&&env[k]!==undefined))
    fail("ambient_pg_configuration_forbidden")
  return {host:"127.0.0.1",port:5333,database:target,
    user:env.AGENT_STUDIO_BAOTA_PG_ADMIN_USER,
    files:[env.AGENT_STUDIO_BAOTA_PG_ADMIN_PASSWORD_FILE,
      env.AGENT_STUDIO_BAOTA_PG_API_PASSWORD_FILE,
      env.AGENT_STUDIO_BAOTA_PG_WORKER_PASSWORD_FILE]}
}
// An existing BaoTa postgres password is verified by the real database.
// Do not demand a server-wide admin rotation merely to provision fresh roles.
function readPasswordContent(raw,isExistingAdmin){
  const value=raw.toString("utf8")
  if(!Buffer.from(value).equals(raw))fail("invalid_secret_file")
  const trimmed=value.replace(/\r?\n$/,"")
  // Preserve the *existing* administrator's actual valid password, even
  // when short, Unicode, or containing spaces. PostgreSQL authenticates it.
  // Only newly provisioned API/Worker passwords have our stronger policy.
  if(isExistingAdmin){
    if(trimmed.length===0||Buffer.byteLength(trimmed,"utf8")>512||
       /[\0\r\n]/.test(trimmed))
      fail("invalid_secret_file")
  }else if(trimmed.length<40||trimmed.length>256||
           /[^!-~]/.test(trimmed)||/^(.)\1+$/.test(trimmed))
    fail("invalid_secret_file")
  return trimmed
}
function secret(input,isExistingAdmin=false){
  if(typeof input!=="string"||!path.isAbsolute(input)||input.startsWith("//")||
     input.split(/[\\/]/).some(x=>x.toLowerCase()==="pb_data"))
    fail("external_secret_file_required")
  let current=path.parse(input).root
  for(const part of input.slice(current.length).split(path.sep)){
    if(!part)continue
    current=path.join(current,part)
    if(fs.lstatSync(current).isSymbolicLink())fail("external_secret_file_required")
  }
  const file=fs.realpathSync(input)
  const relative=path.relative(root,file)
  if(relative===""||(!relative.startsWith(".."+path.sep)&&relative!==".."&&!path.isAbsolute(relative)))
    fail("external_secret_file_required")
  const st=fs.statSync(file)
  if(!st.isFile()||st.size<(isExistingAdmin?1:40)||
     st.size>(isExistingAdmin?514:512)||(st.mode&0o077)!==0)
    fail("private_secret_file_required")
  const value=readPasswordContent(fs.readFileSync(file),isExistingAdmin)
  return {value,device:st.dev,inode:st.ino}
}
async function ensureEmpty(db,username){
  const r=(await db.query(
    "SELECT current_database() AS db,session_user AS login,current_user AS role,"+
    "current_setting('server_version_num')::int AS version,"+
    "(SELECT rolsuper FROM pg_roles WHERE rolname=session_user) AS superuser")).rows[0]
  if(r?.db!==target||r.login!==username||r.role!==username||
     r.version<180000||r.version>=190000||r.superuser!==true)
    fail("invalid_pg18_admin_target")
  if(!(await db.query(
    "SELECT EXISTS(SELECT 1 FROM pg_available_extensions WHERE name='vector') AS yes")).rows[0]?.yes)
    fail("pgvector_unavailable")
  const probes=[
    ["agentstudio_schema_exists","SELECT count(*)::int AS n FROM pg_namespace WHERE nspname='agentstudio'"],
    ["nonempty_database","SELECT count(*)::int AS n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace "+
      "WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname<>'information_schema' "+
      "AND c.relkind IN ('r','p','m','v','f','S')"],
    ["nonempty_database","SELECT count(*)::int AS n FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace "+
      "WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname<>'information_schema'"],
    ["nonempty_database","SELECT count(*)::int AS n FROM pg_namespace "+
      "WHERE nspname NOT LIKE 'pg_%' AND nspname NOT IN ('public','information_schema')"],
    ["nonempty_database","SELECT count(*)::int AS n FROM pg_extension WHERE extname<>'plpgsql'"],
    ["global_role_collision","SELECT count(*)::int AS n FROM pg_roles WHERE rolname=ANY($1::text[])"],
  ]
  for(const [code,sql] of probes){
    const result=await db.query(sql,code==="global_role_collision"?[roles]:[])
    if(Number(result.rows[0]?.n)!==0)fail(code)
  }
}
const makeLogins=[
  "DO $newlogins$",
  "BEGIN",
  "  EXECUTE format('CREATE ROLE agentstudio_stage_login LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS PASSWORD %L',",
  "    current_setting('agentstudio.bootstrap_api_password'));",
  "  EXECUTE format('CREATE ROLE agentstudio_stage_worker LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS PASSWORD %L',",
  "    current_setting('agentstudio.bootstrap_worker_password'));",
  "END $newlogins$;",
  "GRANT agentstudio_api TO agentstudio_stage_login;",
  "GRANT agentstudio_worker,agentstudio_api TO agentstudio_stage_worker;",
  "REVOKE CONNECT ON DATABASE agent_studio FROM PUBLIC;",
  "GRANT CONNECT ON DATABASE agent_studio TO agentstudio_stage_login,agentstudio_stage_worker;",
  "REVOKE CREATE ON SCHEMA public FROM PUBLIC;",
].join("\n")
async function verify(db){
  const count=async sql=>Number((await db.query(sql)).rows[0]?.n)
  const tables=await count("SELECT count(*)::int AS n FROM pg_tables WHERE schemaname='agentstudio'")
  const rls=await count("SELECT count(*)::int AS n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace "+
    "WHERE n.nspname='agentstudio' AND c.relkind='r' AND c.relrowsecurity AND c.relforcerowsecurity")
  const vec=await count("SELECT count(*)::int AS n FROM pg_extension WHERE extname='vector'")
  const ledger=await count("SELECT count(*)::int AS n FROM agentstudio.schema_migrations")
  const users=await count("SELECT count(*)::int AS n FROM agentstudio.users")
  const jobs=await count("SELECT count(*)::int AS n FROM agentstudio.jobs")
  const identities=(await db.query(
    "SELECT rolname,rolsuper,rolbypassrls,rolcanlogin FROM pg_roles "+
    "WHERE rolname=ANY($1::text[])",[roles])).rows
  const m=new Map(identities.map(x=>[x.rolname,x]))
  // BaoTa may retain the historical md5 global default. Require SCRAM for
  // our new service credentials irrespective of that legacy setting.
  const credentials=(await db.query(
    "SELECT rolname,rolpassword LIKE 'SCRAM-SHA-256$%' AS scram "+
    "FROM pg_authid WHERE rolname=ANY($1::text[])",
    [["agentstudio_stage_login","agentstudio_stage_worker"]])).rows
  if(credentials.length!==2||credentials.some(x=>x.scram!==true))
    fail("service_role_password_not_scram")

  if(tables!==23||rls!==22||vec!==1||ledger!==3||users!==0||jobs!==0||
     identities.length!==5||
     identities.some(x=>x.rolsuper||x.rolbypassrls)||
     m.get("agentstudio_api")?.rolcanlogin||
     m.get("agentstudio_worker")?.rolcanlogin||
     m.get("agentstudio_model_broker")?.rolcanlogin||
     m.get("agentstudio_stage_login")?.rolcanlogin!==true||
     m.get("agentstudio_stage_worker")?.rolcanlogin!==true)
    fail("schema_or_role_verification_failed")
  const membership=(await db.query(
    "SELECT pg_has_role('agentstudio_stage_login','agentstudio_api','member') AS api,"+
    "pg_has_role('agentstudio_stage_worker','agentstudio_worker','member') AS worker,"+
    "pg_has_role('agentstudio_stage_worker','agentstudio_api','member') AS worker_api")).rows[0]
  if(!membership?.api||!membership?.worker||!membership?.worker_api)
    fail("role_grants_missing")
  return {tables,rls,pgvector:true,ledger,users,jobs,login_roles:2}
}
export async function run(argv,env=process.env){
  const execute=parse(argv),baseline=sourceSql()
  const plan={mode:execute?"fresh_init":"plan",database:target,
    expected_postgres_major:18,expected_port:5333,baseline_sha256:baseline.hash,
    migration_source:"new_empty_database",old_sqlite_rows_copied:0,
    production_cutover_allowed:false}
  if(!execute)return {...plan,network_used:false}
  return {...plan,initialized:true,...await initializeFreshPg18Baseline(env,baseline)}
}
// Shared transaction for baseline-only and full-runtime initialization. The
// caller supplies an already captured source snapshot; no service is started.
export async function initializeFreshPg18Baseline(env,baseline,complete){
  const cfg=config(env)
  const secrets=cfg.files.map((file,index)=>secret(file,index===0))
  if(new Set(secrets.map(x=>x.device+":"+x.inode)).size!==3||
     new Set(secrets.map(x=>x.value)).size!==3)
    fail("secrets_not_independent")
  const {default:pg}=await import("pg")
  const pool=new pg.Pool({host:cfg.host,port:5333,database:target,user:cfg.user,
    password:secrets[0].value,ssl:false,options:"",max:1,
    connectionTimeoutMillis:5000,statement_timeout:60000,idleTimeoutMillis:1000})
  pool.on("error",()=>{})
  let client
  try{
    client=await pool.connect()
    await client.query("BEGIN")
    try{
      await client.query("SET LOCAL lock_timeout='5s'")
      await client.query("SET LOCAL password_encryption='scram-sha-256'")
      await client.query("SELECT pg_advisory_xact_lock(61824,271828)")
      await ensureEmpty(client,cfg.user)
      await client.query(baseline.sql)
      await client.query("SELECT set_config('agentstudio.bootstrap_api_password',$1,true)",[secrets[1].value])
      await client.query("SELECT set_config('agentstudio.bootstrap_worker_password',$1,true)",[secrets[2].value])
      await client.query(makeLogins)
      const verification=await verify(client)
      const result=complete?await complete(client,verification):{verification}
      await client.query("COMMIT")
      return result
    }catch(error){
      await client.query("ROLLBACK").catch(()=>undefined)
      throw error
    }
  }finally{client?.release();await pool.end()}
}
// Pure SQL pieces are exported for offline embedded PostgreSQL regression.
export {sourceSql as freshSchemaForTest,makeLogins as loginSqlForTest,
  verify as verifyFreshForTest}
export {sourceSql as captureFreshPg18Baseline}
export {readPasswordContent as readPasswordContentForTest}
export async function main(argv){
  try{process.stdout.write(JSON.stringify(await run(argv))+"\n")}
  catch(error){
    const permitted=new Set(["invalid_arguments","unknown_schema_format",
      "baota_init_disabled","baota_linux_only","unsafe_baota_target",
      "ambient_pg_configuration_forbidden","external_secret_file_required",
      "private_secret_file_required","invalid_secret_file",
      "invalid_pg18_admin_target","pgvector_unavailable","agentstudio_schema_exists",
      "nonempty_database","global_role_collision","schema_or_role_verification_failed",
      "role_grants_missing","secrets_not_independent",
      "service_role_password_not_scram"])
    const message=error instanceof Error?error.message:""
    process.stderr.write("baota_pg_fresh_init_refused:"+
      (permitted.has(message)?message:"initialization_failed")+"\n")
    process.exitCode=1
  }
}
if(process.argv[1]&&path.resolve(process.argv[1])===here)
  void main(process.argv.slice(2))
