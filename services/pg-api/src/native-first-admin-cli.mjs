#!/usr/bin/env node
// Operator-only one-time first-admin creation for an isolated, reviewed PG18.
// This tool NEVER creates/changes database logins, schemas or role grants.
// It refuses to run outside Linux root and requires three 0600 files outside
// the repository. No password, email or database URL is echoed to logs.
import fs from "node:fs"
import path from "node:path"
import {fileURLToPath} from "node:url"
import {NativeAuthRepository} from "./native-auth-repository.mjs"
import {
  normalizeEmployeeEmail,validateEmployeeDisplayName,
  validateEmployeePassword,
} from "./native-employee-auth.mjs"

const here=fileURLToPath(import.meta.url)
const repo=path.resolve(path.dirname(here),"../../..")
const safeErrorNames=new Set([
  "first_admin_bootstrap_disabled","unsafe_first_admin_target",
  "invalid_first_admin_arguments","private_file_required",
  "first_admin_inputs_invalid","native_admin_already_initialized",
  "native_auth_role_unavailable","native_auth_sql_not_initialized",
  "native_auth_insert_grants_missing","first_admin_preflight_not_ready",
])
function reject(code){throw Error(code)}
function isUnder(outer,inner){
  const relative=path.relative(outer,inner)
  return relative===""||(!relative.startsWith(".."+path.sep)&&
    relative!==".."&&!path.isAbsolute(relative))
}
export function options(argv,env=process.env,platform=process.platform,uid=process.getuid?.()){
  if(argv.length===1&&argv[0]==="--plan")return {
    action:"plan",db:"agent_studio",host:"127.0.0.1",port:5333,
    postgres_major:18,root_only:true,requires_operator_files:3,
    identity_namespace:"urn:agentstudio:local:v1",
    initializes_only_one_admin:true,network_used:false,
    old_pocketbase_unchanged:true,production_cutover_allowed:false
  }
  if(argv.length!==3||!["--preflight","--execute"].includes(argv[0])||
      argv[1]!=="--confirm-database"||argv[2]!=="agent_studio")
    reject("invalid_first_admin_arguments")
  if(platform!=="linux"||uid!==0||
     env.AGENT_STUDIO_PG18_FIRST_ADMIN_ENABLED!=="true"||
     env.AGENT_STUDIO_PG_NATIVE_AUTH_USER!=="agentstudio_native_login"||
     Object.keys(env).some(name=>name==="DATABASE_URL"||
       (/^PG[A-Z_]/.test(name)&&env[name]!==undefined)))
    reject("first_admin_bootstrap_disabled")
  const action=argv[0].slice(2)
  return {
    action,db:"agent_studio",host:"127.0.0.1",port:5333,
    pgPassword:env.AGENT_STUDIO_PG_NATIVE_AUTH_PASSWORD_FILE,
    initialPassword:action==="execute"
      ?env.AGENT_STUDIO_PG18_FIRST_ADMIN_PASSWORD_FILE:undefined,
    profileFile:action==="execute"
      ?env.AGENT_STUDIO_PG18_FIRST_ADMIN_PROFILE_FILE:undefined,
  }
}
function privateFile(filename,maxBytes){
  if(typeof filename!=="string"||!path.isAbsolute(filename)||
     filename.includes("\0"))reject("private_file_required")
  let current=path.parse(filename).root
  for(const component of filename.slice(current.length).split(path.sep)){
    if(!component)continue
    current=path.join(current,component)
    if(fs.lstatSync(current).isSymbolicLink())reject("private_file_required")
  }
  const real=fs.realpathSync(filename)
  if(isUnder(repo,real))reject("private_file_required")
  const st=fs.statSync(real)
  if(!st.isFile()||!st.size||st.size>maxBytes||
     (st.mode&0o077)!==0||st.uid!==0)
    reject("private_file_required")
  const bytes=fs.readFileSync(real)
  const value=bytes.toString("utf8")
  if(!Buffer.from(value,"utf8").equals(bytes))reject("private_file_required")
  return {path:real,device:st.dev,inode:st.ino,value}
}
// This probe inspects the *real database* with a read-only transaction and
// the same authenticated role as first-admin enrollment. No account/user data
// is inserted, no password hash is computed, and no secret is returned.
export async function firstAdminPreflightForTest(pool){
  const client=await pool.connect()
  let transaction=false
  try{
    await client.query("BEGIN READ ONLY")
    transaction=true
    const identity=(await client.query(
      "SELECT current_database() AS db,session_user AS login,"+
      "inet_server_port() AS port,host(inet_server_addr()) AS addr,"+
      "current_setting('server_version_num')::int AS major,"+
      "rolcanlogin AS can_login,rolsuper AS superuser,"+
      "rolbypassrls AS bypass,rolcreaterole AS create_role,"+
      "pg_has_role(session_user,'agentstudio_native_auth','member') AS can_auth,"+
      "pg_has_role(session_user,'agentstudio_api','member') AS can_api,"+
      "pg_has_role(session_user,'agentstudio_worker','member') AS can_worker "+
      "FROM pg_roles WHERE rolname=session_user")).rows[0]
    if(!identity||identity.db!=="agent_studio"||
      identity.login!=="agentstudio_native_login"||
      identity.addr!=="127.0.0.1"||Number(identity.port)!==5333||
      identity.major<180000||identity.major>=190000||
      identity.can_login!==true||identity.superuser!==false||
      identity.bypass!==false||identity.create_role!==false||
      identity.can_auth!==true||identity.can_api!==false||
      identity.can_worker!==false)
      reject("unsafe_first_admin_target")
    await client.query("SET LOCAL ROLE agentstudio_native_auth")
    const current=(await client.query("SELECT current_user AS role")).rows[0]
    if(current?.role!=="agentstudio_native_auth")
      reject("native_auth_role_unavailable")
    const facts=(await client.query(
      "SELECT "+
      "(SELECT count(*)::integer FROM agentstudio_auth.accounts) AS accounts,"+
      "(SELECT count(*)::integer FROM agentstudio_auth.sessions) AS sessions,"+
      "(SELECT count(*)::integer FROM agentstudio.users WHERE "+
        "external_issuer='urn:agentstudio:local:v1') AS local_users,"+
      "has_column_privilege(current_user,'agentstudio.users','id','INSERT') "+
        "AS insert_user_id,"+
      "has_column_privilege(current_user,'agentstudio.users','external_issuer','INSERT') "+
        "AS insert_issuer,"+
      "has_column_privilege(current_user,'agentstudio.users','external_subject','INSERT') "+
        "AS insert_subject,"+
      "has_column_privilege(current_user,'agentstudio.users','display_name','INSERT') "+
        "AS insert_display,"+
      "has_column_privilege(current_user,'agentstudio.users','status','INSERT') "+
        "AS insert_status,"+
      "has_table_privilege(current_user,'agentstudio_auth.accounts','INSERT') "+
        "AS insert_account")).rows[0]
    const blockers=[]
    if(facts?.accounts!==0||facts?.local_users!==0||facts?.sessions!==0)
      blockers.push("native_admin_already_initialized")
    if(!facts?.insert_user_id||!facts?.insert_issuer||
       !facts?.insert_subject||!facts?.insert_display||
       !facts?.insert_status||!facts?.insert_account)
      blockers.push("native_auth_insert_grants_missing")
    return {mode:"preflight",ready:blockers.length===0,blockers,
      database:"agent_studio",role:"agentstudio_native_login",
      accounts:facts?.accounts??null,local_users_visible:facts?.local_users??null,
      writes_performed:false,production_cutover_allowed:false}
  }finally{
    if(transaction)await client.query("ROLLBACK").catch(()=>undefined)
    client.release()
  }
}

export async function run(argv,env=process.env){
  const config=options(argv,env)
  if(config.action==="plan")return config
  const secrets=[privateFile(config.pgPassword,512)]
  if(config.action==="execute"){
    secrets.push(privateFile(config.initialPassword,512))
    secrets.push(privateFile(config.profileFile,2048))
  }
  if(new Set(secrets.map(x=>x.device+":"+x.inode)).size!==secrets.length)
    reject("private_file_required")
  const pgPassword=secrets[0].value.replace(/\r?\n$/,"")
  const password=config.action==="execute"
    ?secrets[1].value.replace(/\r?\n$/,""):undefined
  let profile
  if(config.action==="execute")try{
    profile=JSON.parse(secrets[2].value)
    if(!profile||typeof profile!=="object"||
       Array.isArray(profile)||
       Object.keys(profile).length!==2||
       !Object.hasOwn(profile,"email")||
       !Object.hasOwn(profile,"display_name"))
      reject("first_admin_inputs_invalid")
    normalizeEmployeeEmail(profile.email)
    validateEmployeeDisplayName(profile.display_name)
    validateEmployeePassword(password)
    if(!pgPassword||pgPassword===password||/[\0\r\n]/.test(pgPassword))
      reject("first_admin_inputs_invalid")
  }catch{reject("first_admin_inputs_invalid")}
  const {default:pg}=await import("pg")
  const {Pool}=pg
  const pool=new Pool({host:"127.0.0.1",port:5333,database:"agent_studio",
    user:"agentstudio_native_login",password:pgPassword,
    connectionTimeoutMillis:4000,statement_timeout:15000,max:1})
  try{
    const readiness=await firstAdminPreflightForTest(pool)
    if(config.action==="preflight")return readiness
    if(!readiness.ready)reject(readiness.blockers[0]??"first_admin_preflight_not_ready")
    const adapter={async connect(){
      const c=await pool.connect()
      return {query:(sql,params=[])=>c.query(sql,params),release(){c.release()}}
    }}
    const auth=new NativeAuthRepository(adapter)
    const admin=await auth.provisionInitialAdmin({
      email:profile.email,display_name:profile.display_name,password
    })
    return {action:"execute",first_admin_created:admin.is_admin===true,
      database:"agent_studio",old_pocketbase_unchanged:true,
      worker_started:false,production_cutover_allowed:false}
  }finally{await pool.end()}
}
export async function main(argv){
  try{process.stdout.write(JSON.stringify(await run(argv))+"\n")}
  catch(error){
    const code=error instanceof Error&&safeErrorNames.has(error.message)
      ?error.message:"first_admin_bootstrap_failed"
    process.stderr.write("PG18_FIRST_ADMIN_REFUSED:"+code+"\n")
    process.exitCode=1
  }
}
if(process.argv[1]&&path.resolve(process.argv[1])===here)
  void main(process.argv.slice(2))
