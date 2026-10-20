#!/usr/bin/env node
// Independent PostgreSQL 18 / native employee-auth API PILOT.
// No user identities, service logins or passwords are provisioned here.
// Requires separate, non-superuser API and auth-service login accounts.
// Strictly localhost; do not start without a reviewed native auth migration,
// first-admin enrollment, reverse-proxy HTTPS and isolated test approval.
import {readFileSync,lstatSync,realpathSync,accessSync,constants} from "node:fs"
import {createServer,type IncomingMessage,type ServerResponse} from "node:http"
import {assertNativePg18Credential,nativePg18CredentialDirectory,
  type NativePg18SecretName} from "./native-credential-policy.ts"
import path from "node:path"
import {fileURLToPath} from "node:url"
import type {Pool as PgPool} from "pg"
import {selectPgRuntimeTarget,verifyPgRuntimeTarget} from "./pg-runtime-target.ts"
import {verifyDatabaseRole,AgentSpecRepository} from "./repository.ts"
import {RunRepository} from "./run-repository.ts"
import {ScheduleInventoryRepository} from "./schedule-inventory-repository.ts"
import {WorkflowRepository} from "./workflow-repository.ts"
import {KnowledgeBaseRepository} from "./knowledge-repository.ts"
import {createHandler} from "./http.ts"
import {NativeAuthRepository} from "./native-auth-repository.mjs"
import {createNativeAuthHttpHandler} from "./native-auth-http.mjs"
import type {SqlClient,SqlPool} from "./contracts.ts"
import {selectNativePg18UatCapabilities,permitNativePg18BusinessUatRequest}
  from "./native-config-uat-policy.ts"

const portDefault=7403
const here=fileURLToPath(import.meta.url)
const root=path.resolve(path.dirname(here),"../../..")
const serviceCredentials=nativePg18CredentialDirectory
const rootVault="/root/.agentstudio-pg18-secrets"
export function nativeRuntimeCredentialConfig(
  env:NodeJS.ProcessEnv,listen:boolean,uid=process.getuid?.()
):{apiFile:string,authFile:string,credentialDir:string}{
  const apiFile=required(env,"AGENT_STUDIO_PG_PASSWORD_FILE")
  const authFile=required(env,"AGENT_STUDIO_PG_NATIVE_AUTH_PASSWORD_FILE")
  if(!listen){
    if(env.CREDENTIALS_DIRECTORY!==undefined||
       apiFile!==rootVault+"/api.secret"||
       authFile!==rootVault+"/native-auth.secret")reject()
    return {apiFile,authFile,credentialDir:rootVault}
  }
  // A long-lived HTTP server must never read root vault credentials or run
  // as root. systemd copies secrets into its private credential mount.
  if(!Number.isSafeInteger(uid)||uid===undefined||uid<=0||
     env.CREDENTIALS_DIRECTORY!==serviceCredentials||
     apiFile!==serviceCredentials+"/api.secret"||
     authFile!==serviceCredentials+"/native-auth.secret")reject()
  return {apiFile,authFile,credentialDir:serviceCredentials}
}

/** Offline plan is intentionally safe on machines without database access. */
export function nativePg18ServerPlan(){
  return {mode:"plan",service:"agentstudio-pg18-native-pilot",
    database:"agent_studio",database_port:5333,host:"127.0.0.1",
    http_bind:"127.0.0.1",default_http_port:7403,
    requires_two_independent_logins:true,
    employee_auth:"native_session",tls_required_for_remote_browser:true,
    configuration_writes_default:false,employee_provisioning_default:false,
    agent_run_and_approval_enabled:false,
    network_used:false,workers_started:false,
    production_cutover_allowed:false}
}
function reject():never{throw Error("unsafe_native_pg18_server_config")}
export function assertNativeServeOrigin(origin:string,listen:boolean){
  if(listen&&!origin.startsWith("https://"))reject()
}
function required(env:NodeJS.ProcessEnv,key:string):string{
  const value=env[key]
  if(typeof value!=="string"||!value.trim())reject()
  return value
}
function safeSecret(file:string,listen:boolean,env:NodeJS.ProcessEnv){
  if(!path.isAbsolute(file)||file.includes("\0"))reject()
  const directory=listen?serviceCredentials:rootVault
  if(path.dirname(file)!==directory)reject()
  const vault=lstatSync(directory)
  const uid=process.getuid?.()
  if(!vault.isDirectory()||vault.isSymbolicLink()||
     (listen?((vault.mode&0o022)!==0||
       ![0,uid].includes(vault.uid)):
       (vault.uid!==0||(vault.mode&0o077)!==0)))reject()
  const stat=lstatSync(file)
  if(!stat.isFile()||stat.isSymbolicLink()||stat.size<40||stat.size>512)
    reject()
  if(listen){
    // The two credentials must match the exact systemd LoadCredential path,
    // non-root owner/reader, and the root:root 0440 ACL exception observed
    // on this host. Never grant blanket access to group-readable secrets.
    const basename=path.basename(file)
    if(basename!=="api.secret"&&basename!=="native-auth.secret")reject()
    let canRead=false
    try{accessSync(file,constants.R_OK);canRead=true}catch{}
    try{
      assertNativePg18Credential({name:basename as NativePg18SecretName,
        file,env,uid,stat,canRead})
    }catch{reject()}
  }else if(stat.uid!==0||(stat.mode&0o077)!==0||
           (stat.mode&0o7000)!==0)reject()
  const name=realpathSync(file)
  const relative=path.relative(root,name)
  if(relative===""||(!relative.startsWith(".."+path.sep)&&
     relative!==".."&&!path.isAbsolute(relative)))reject()
  const raw=readFileSync(name)
  const password=raw.toString("utf8").replace(/\r?\n$/,"")
  if(!Buffer.from(password+"\n").equals(raw)&&
     !Buffer.from(password).equals(raw))reject()
  if(password.length<40||password.length>256||/[^!-~]/.test(password))reject()
  return {password,stat,name}
}
export function nativePg18ServerConfig(
  env:NodeJS.ProcessEnv,platform=process.platform,listen=false,
  uid=process.getuid?.()
){
  if(platform!=="linux"||
     env.AGENT_STUDIO_PG_NATIVE_PILOT_ENABLED!=="true"||
     env.AGENT_STUDIO_PG_NATIVE_REVIEWED!=="true")
    reject()
  const api=selectPgRuntimeTarget(env,"api",platform)
  if(api.mode!=="baota_pg18")reject()
  const nativeUser=required(env,"AGENT_STUDIO_PG_NATIVE_AUTH_USER")
  if(nativeUser!=="agentstudio_native_login")reject()
  const origin=required(env,"AGENT_STUDIO_INTERNAL_APP_ORIGIN")
  let parsed:URL
  try{parsed=new URL(origin)}catch{reject()}
  if(parsed.origin!==origin||
     (parsed.protocol!=="https:"&&
       !(parsed.protocol==="http:"&&
         ["127.0.0.1","localhost"].includes(parsed.hostname)&&
         env.AGENT_STUDIO_PG_NATIVE_LOCAL_HTTP_TEST==="true")))reject()
  if(Object.keys(env).some(k=>k.startsWith("AGENT_STUDIO_OIDC_")&&env[k]))reject()
  const port=Number(env.AGENT_STUDIO_PG_NATIVE_API_PORT||portDefault)
  if(!Number.isSafeInteger(port)||port<1024||port>65535)reject()
  const files=nativeRuntimeCredentialConfig(env,listen,uid)
  return {api,user:nativeUser,host:"127.0.0.1",port:5333,
    database:"agent_studio",listenPort:port,allowedOrigin:origin,
    ...files}
}
function adapter(pool:PgPool):SqlPool{
  return {async connect():Promise<SqlClient>{
    const client=await pool.connect()
    return {
      async query<Row>(sql:string,params:unknown[]=[]){
        const value=await client.query(sql,params)
        return {rows:value.rows as Row[]}
      },
      release(){client.release()}
    }
  }}
}
async function verifyNativeAuthService(pool:SqlPool){
  const client=await pool.connect()
  try{
    const r=(await client.query<{
      db:string;login:string;port:number;version:number;superuser:boolean
      loginEnabled:boolean;serverAddress:string;createRole:boolean
      bypassrls:boolean;member:boolean;apiMember:boolean
      workerMember:boolean;apiCanAuth:boolean;workerCanAuth:boolean
    }>("SELECT current_database() AS db,session_user AS login,"+
      "inet_server_port() AS port,host(inet_server_addr()) AS \"serverAddress\","+
      "current_setting('server_version_num')::integer AS version,"+
      "rolsuper AS superuser,rolbypassrls AS bypassrls,"+
      "rolcanlogin AS \"loginEnabled\",rolcreaterole AS \"createRole\","+
      "pg_has_role(session_user,'agentstudio_native_auth','member') AS member,"+
      "pg_has_role(session_user,'agentstudio_api','member') AS \"apiMember\","+
      "pg_has_role(session_user,'agentstudio_worker','member') AS \"workerMember\","+
      "pg_has_role('agentstudio_stage_login','agentstudio_native_auth','member') AS \"apiCanAuth\","+
      "pg_has_role('agentstudio_stage_worker','agentstudio_native_auth','member') AS \"workerCanAuth\" "+
      "FROM pg_roles WHERE rolname=session_user")).rows[0]
    if(!r||r.db!=="agent_studio"||r.login!=="agentstudio_native_login"||
       Number(r.port)!==5333||r.serverAddress!=="127.0.0.1"||
       r.version<180000||r.version>=190000||
       r.loginEnabled!==true||r.createRole!==false||
       r.superuser!==false||r.bypassrls!==false||r.member!==true||
       r.apiMember||r.workerMember||r.apiCanAuth||r.workerCanAuth)
      reject()
    await client.query("BEGIN READ ONLY")
    try{
      await client.query("SET LOCAL ROLE agentstudio_native_auth")
      const active=(await client.query<{role:string}>(
        "SELECT current_user AS role")).rows[0]
      if(active?.role!=="agentstudio_native_auth")reject()
      const objects=await client.query<{
        schema_exists:boolean;accounts_exists:boolean;sessions_exists:boolean
      }>("SELECT to_regnamespace('agentstudio_auth') IS NOT NULL AS schema_exists,"+
        "to_regclass('agentstudio_auth.accounts') IS NOT NULL AS accounts_exists,"+
        "to_regclass('agentstudio_auth.sessions') IS NOT NULL AS sessions_exists")
      const m=objects.rows[0]
      if(!m?.schema_exists||!m.accounts_exists||!m.sessions_exists)reject()
      const approved=(await client.query<{active_admins:string|number}>(
        "SELECT count(*)::integer AS active_admins "+
        "FROM agentstudio_auth.accounts a "+
        "JOIN agentstudio.users u ON u.id=a.user_id "+
        "WHERE a.enabled AND a.is_admin "+
        "AND u.status='active' AND "+
        "u.external_issuer='urn:agentstudio:local:v1'")).rows[0]
      if(Number(approved?.active_admins)!==1)reject()
      // A compromised role grant must not expose private Agent records,
      // even to the dedicated password verifier identity.
      await client.query("SAVEPOINT native_preflight_access")
      let denied=false
      try{
        await client.query("SELECT name FROM agentstudio.agent_specs LIMIT 1")
      }catch(error){
        denied=(error as {code?:string}).code==="42501"
      }
      await client.query("ROLLBACK TO SAVEPOINT native_preflight_access")
      await client.query("RELEASE SAVEPOINT native_preflight_access")
      if(!denied)reject()
    }finally{await client.query("ROLLBACK")}
  }finally{client.release()}
}
export async function startNativePg18Server(env=process.env,listen=true){
  // Do not rewrite the caller environment to simulate root-vault paths.
  // The real non-root systemd LoadCredential paths must pass unchanged.
  const cfg=nativePg18ServerConfig(env,process.platform,listen)
  // Plain HTTP is allowed ONLY to make read-only local deployment checks.
  // Real employee sessions use Secure host-only cookies behind HTTPS.
  assertNativeServeOrigin(cfg.allowedOrigin,listen)
  // Explicit non-root, HTTPS-only opt-in. Default always remains READ ONLY.
  // No UAT capabilities are permitted with --preflight.
  const capabilities=selectNativePg18UatCapabilities(
    env,listen,cfg.allowedOrigin)
  const files=nativeRuntimeCredentialConfig(env,listen)
  const apiSecret=safeSecret(files.apiFile,listen,env)
  const authSecret=safeSecret(files.authFile,listen,env)
  if(apiSecret.stat.dev===authSecret.stat.dev&&
     apiSecret.stat.ino===authSecret.stat.ino)reject()
  // Resolve pg only for explicit --preflight/--serve, so offline --plan
  // never loads a database driver or attempts to use the network.
  const {Pool}=await import("pg")
  const businessPool=new Pool({host:cfg.host,port:5333,database:cfg.database,
    user:cfg.api.user,password:apiSecret.password,max:5,
    connectionTimeoutMillis:4000,statement_timeout:10000})
  const authPool=new Pool({host:cfg.host,port:5333,database:cfg.database,
    user:cfg.user,password:authSecret.password,max:3,
    connectionTimeoutMillis:4000,statement_timeout:10000})
  businessPool.on("error",()=>{})
  authPool.on("error",()=>{})
  let server:ReturnType<typeof createServer>|undefined
  try{
    await verifyPgRuntimeTarget(adapter(businessPool),cfg.api)
    await verifyDatabaseRole(adapter(businessPool))
    await verifyNativeAuthService(adapter(authPool))
    // A separate, strictly read-only deployment preflight never opens HTTP.
    if(!listen){
      await Promise.all([businessPool.end(),authPool.end()])
      return {mode:"preflight",ready:true,target:"agent_studio",
        verified_roles:2,verified_active_admins:1,
        writes_performed:false,port_opened:false,
        workers_started:false,production_cutover_allowed:false}
    }
    const auth=new NativeAuthRepository(adapter(authPool))
    let businessHandler:ReturnType<typeof createHandler>|undefined
    const native=createNativeAuthHttpHandler({auth,allowedOrigin:cfg.allowedOrigin,
      allowEmployeeProvisioning:capabilities.employeeProvisioning,
      businessHandler:(req:IncomingMessage,res:ServerResponse)=>{
        // Only verified employee identity (in createHandler) may mutate an
        // owner-owned config. Never admit runs, approvals, tool effects or
        // knowledge imports through this opt-in test service.
        const pathname=new URL(req.url||"/","http://127.0.0.1").pathname
        if(!permitNativePg18BusinessUatRequest(
          pathname,req.method||"",capabilities)){
          res.writeHead(405,{"Content-Type":"application/json; charset=utf-8",
            "Cache-Control":"no-store"})
          res.end(JSON.stringify({error:"pilot_business_writes_disabled"}))
          return
        }
        if(!businessHandler)throw Error("business_handler_unavailable")
        return businessHandler(req,res)
      }})
    businessHandler=createHandler({
      allowedOrigin:cfg.allowedOrigin,
      verifyToken:async()=>{throw Error("oidc_disabled_in_native_mode")},
      authenticateRequest:native.authenticateRequest,
      repository:new AgentSpecRepository(adapter(businessPool)),
      // A SECOND, fail-closed isolated-UAT approval is required for enqueue
      // and model decisions. Never enabled by configurationWrites alone.
      ...(capabilities.runApprovalUat===true
        ?{runRepository:new RunRepository(adapter(businessPool))}:{}),
      workflowRepository:new WorkflowRepository(adapter(businessPool)),
      knowledgeRepository:new KnowledgeBaseRepository(adapter(businessPool)),
      scheduleInventory:new ScheduleInventoryRepository(adapter(businessPool))
    })
    const localServer=createServer(native.handler)
    server=localServer
    localServer.requestTimeout=15000
    localServer.headersTimeout=12000
    localServer.maxRequestsPerSocket=100
    localServer.listen(cfg.listenPort,"127.0.0.1")
    await new Promise<void>((resolve,rejectStart)=>{
      localServer.once("listening",()=>resolve())
      localServer.once("error",rejectStart)
    })
    process.stdout.write(JSON.stringify({service:"agentstudio-pg18-native-pilot",
      state:"listening",bind:"127.0.0.1",port:cfg.listenPort,
      config_uat_write_enabled:capabilities.configurationWrites,
      employee_uat_enabled:capabilities.employeeProvisioning,
      run_approval_uat_enabled:capabilities.runApprovalUat,
      workers_started:false,production_cutover_allowed:false})+"\n")
    let shuttingDown=false
    const shutdown=()=>{
      if(shuttingDown)return
      shuttingDown=true
      localServer.close(()=>{
        void Promise.all([businessPool.end(),authPool.end()])
          .then(()=>{process.exitCode=0})
      })
    }
    process.once("SIGTERM",shutdown)
    process.once("SIGINT",shutdown)
    return {server:localServer,shutdown}
  }catch(error){
    if(server?.listening)server.close()
    await Promise.allSettled([businessPool.end(),authPool.end()])
    throw error
  }
}
if(process.argv[1]&&path.resolve(process.argv[1])===here){
  const args=process.argv.slice(2)
  if(args.length===1&&args[0]==="--plan"){
    process.stdout.write(JSON.stringify(nativePg18ServerPlan())+"\n")
  }else if(args.length===1&&
           ["--preflight","--serve"].includes(args[0]??"")){
    void startNativePg18Server(process.env,args[0]==="--serve")
      .then(result=>{
        if(args[0]==="--preflight")
          process.stdout.write(JSON.stringify(result)+"\n")
      })
      .catch(()=>{
        process.stderr.write(JSON.stringify({
          service:"agentstudio-pg18-native-pilot",
          error:"native_server_start_refused"
        })+"\n")
        process.exitCode=1
      })
  }else{
    process.stderr.write("NATIVE_SERVER_EXPLICIT_MODE_REQUIRED\n")
    process.exitCode=1
  }
}
