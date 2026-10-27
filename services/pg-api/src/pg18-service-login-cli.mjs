#!/usr/bin/env node
// One service at a time. Never starts a service or modifies HBA/OS credentials.
import path from "node:path"
import {fileURLToPath} from "node:url"
import {captureFreshRuntimeSources} from "./pg18-fresh-runtime-source.mjs"
import {serviceLoginDefinition,serviceLoginTargetGuardSql} from "./pg18-service-login-policy.mjs"
import {readPg18OperatorSecret,verifyPg18ServiceHbaOrder} from "./native-activation-cli.mjs"
import {validateServiceLoginPassword} from "./pg18-service-login-secrets.mjs"
import {inspectPreparedServiceLogins,reservePreparedServiceLogin,activatePreparedServiceLogin} from "./pg18-service-login-inspector.ts"
const here=fileURLToPath(import.meta.url)
export function parseServiceLoginArguments(argv,env=process.env,platform=process.platform,uid=process.getuid?.()){
  if(argv.length<3||!["--plan","--preflight","--reserve","--activate"].includes(argv[0])||argv[1]!=="--service")throw Error("invalid_service_login_arguments")
  const definition=serviceLoginDefinition(argv[2]),mode=argv[0]?.slice(2)
  if(mode==="plan"&&argv.length===3)return {mode,definition,read_only:true,network_used:false,production_cutover_allowed:false}
  const write=mode==="reserve"||mode==="activate"
  if(!["preflight","reserve","activate"].includes(mode)||argv.length!==(write?7:5)||argv[3]!=="--confirm-database"||argv[4]!=="agent_studio"||
    write&&(argv[5]!=="--expected-source-sha256"||!/^[a-f0-9]{64}$/.test(argv[6])))throw Error("invalid_service_login_arguments")
  if(platform!=="linux"||uid!==0||env.AGENT_STUDIO_PG18_SERVICE_LOGINS_ENABLED!=="true"||
    Object.keys(env).some(key=>key==="DATABASE_URL"||/^PG[A-Z_]/.test(key)))throw Error("service_login_operations_disabled")
  if(write&&env.AGENT_STUDIO_PG18_SERVICE_LOGIN_WRITE_APPROVED!=="APPROVE_PG18_SERVICE_LOGIN_"+mode.toUpperCase()+"_ONLY")throw Error("service_login_write_not_approved")
  return {mode,definition,expected_source_sha256:write?argv[6]:undefined,read_only:!write,production_cutover_allowed:false}
}
export async function collectPreparedServiceEvidence(db,snapshot,kind){
  await db.query(serviceLoginTargetGuardSql)
  const state=await inspectPreparedServiceLogins(db,snapshot),definition=serviceLoginDefinition(kind),role=state.roles.get(definition.login)
  const rules=(await db.query("SELECT rule_number,type,database,user_name,address,netmask,auth_method,error FROM pg_hba_file_rules ORDER BY rule_number")).rows
  const required=new Set(["agentstudio_native_login",definition.login,...state.receipts.map(r=>r.login)])
  for(const login of required){const hba=verifyPg18ServiceHbaOrder(rules,login);if(!hba.local||!hba.tcp)throw Error("service_login_hba_not_ready")}
  const connected=(await db.query("SELECT count(*)::integer AS count FROM pg_catalog.pg_stat_activity WHERE usename=$1 AND pid<>pg_backend_pid()",[definition.login])).rows[0]
  if(!connected||connected.count!==0)throw Error("service_login_connections_present")
  const activated=state.receipts.some(r=>r.kind===kind)
  return {service:kind,login:definition.login,groups:definition.groups,source_sha256:snapshot.source_sha256,
    reserved:Boolean(role),activated,ready_to_reserve:!activated,ready_to_activate:Boolean(role)&&!activated,
    hba_verified:true,privilege_catalog_verified:true,services_started:false,production_cutover_allowed:false}
}
export async function runServiceLogin(argv,env=process.env){
  const cfg=parseServiceLoginArguments(argv,env),snapshot=captureFreshRuntimeSources()
  if(cfg.mode==="plan")return {...cfg,definition:cfg.definition,database:"agent_studio",host:"127.0.0.1",port:5333,postgres_major:18,
    source_sha256:snapshot.source_sha256,secret_source:"independent root-owned private vault file",runtime_credential_delivery:"separate systemd LoadCredential review",services_started:false}
  if(cfg.expected_source_sha256&&cfg.expected_source_sha256!==snapshot.source_sha256)throw Error("service_login_source_changed")
  const admin=readPg18OperatorSecret(env.AGENT_STUDIO_PG18_SERVICE_ADMIN_PASSWORD_FILE)
  const password=cfg.mode==="activate"?readPg18OperatorSecret(env.AGENT_STUDIO_PG18_SERVICE_PASSWORD_FILE):null
  if(password){validateServiceLoginPassword(password.password)
    if(password.password===admin.password||password.device===admin.device&&password.inode===admin.inode)throw Error("independent_service_password_required")
  }
  const {Pool}=await import("pg"),pool=new Pool({host:"127.0.0.1",port:5333,database:"agent_studio",user:"postgres",password:admin.password,ssl:false,
    options:"",max:1,connectionTimeoutMillis:5000,statement_timeout:15000})
  let client
  try{
    client=await pool.connect();await client.query("BEGIN READ ONLY")
    let report
    try{report=await collectPreparedServiceEvidence(client,snapshot,cfg.definition.kind)}finally{await client.query("ROLLBACK")}
    if(cfg.mode==="preflight")return {mode:cfg.mode,...report,network_used:true,writes_performed:false}
    if(report.activated)throw Error("service_login_already_activated")
    await client.query("BEGIN")
    try{
      await client.query("SELECT pg_advisory_xact_lock(61824,20261024)")
      const checked=await collectPreparedServiceEvidence(client,snapshot,cfg.definition.kind)
      if(checked.activated)throw Error("service_login_already_activated")
      const reserved=await reservePreparedServiceLogin(client,cfg.definition.kind,snapshot)
      const result=cfg.mode==="activate"?await activatePreparedServiceLogin(client,cfg.definition.kind,snapshot,password.password):{...reserved,reserved:true,activated:false}
      await client.query("COMMIT")
      return {mode:cfg.mode,service:cfg.definition.kind,...result,network_used:true,services_started:false,production_cutover_allowed:false}
    }catch(error){await client.query("ROLLBACK").catch(()=>{});throw error}
  }finally{client?.release();await pool.end()}
}
if(process.argv[1]&&path.resolve(process.argv[1])===here){
  try{process.stdout.write(JSON.stringify(await runServiceLogin(process.argv.slice(2)))+"\n")}
  catch(error){const code=error instanceof Error?error.message:"",known=new Set(["invalid_service_login_arguments","invalid_service_login_kind","service_login_operations_disabled",
    "service_login_write_not_approved","service_login_source_changed","independent_service_password_required","private_secret_file_required","invalid_secret_format",
    "unsafe_service_login_catalog","native_auth_activation_required_first","first_native_admin_required","service_login_hba_not_ready","service_login_connections_present",
    "service_login_already_activated","service_login_not_reserved","service_login_password_reused","service_password_state_unexpected","service_login_target_not_approved",
    "fresh_runtime_verification_failed","invalid_service_login_receipt"])
    process.stderr.write("PG18_SERVICE_LOGIN_REFUSED:"+(known.has(code)?code:"service_login_operation_refused")+"\n");process.exitCode=1
  }
}
