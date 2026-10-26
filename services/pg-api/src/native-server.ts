#!/usr/bin/env node
import {scopedKnowledgePool,scopedEmbeddingSettingsPool,scopedEmbeddingConsentPool} from "./knowledge-scope-policy.ts"
import {KnowledgeEmbeddingConsentRepository} from "./knowledge-embedding-consent-repository.ts"
import {verifyKnowledgeEmbeddingConsentSchema} from "./knowledge-embedding-consent-privileges.ts"
import {scopedKnowledgeIndexPool} from "./knowledge-index-policy.ts"
import {KnowledgeIndexRepository} from "./knowledge-index-repository.ts"
import {verifyKnowledgeIndexSchema} from "./knowledge-index-privileges.ts"
import {scopedKnowledgeQueryPool} from "./knowledge-query-policy.ts"
import {KnowledgeQueryRepository} from "./knowledge-query-repository.ts"
import {verifyKnowledgeQuerySchema} from "./knowledge-query-audit.ts"
import {scopedKnowledgeToolPool,verifyKnowledgeToolSchema} from "./knowledge-tool-policy.ts"
import {KnowledgeEmbeddingRepository} from "./knowledge-embedding-repository.ts"
import {embeddingEndpointPolicy} from "./knowledge-embedding-policy.ts"
import {verifyKnowledgeEmbeddingSchema} from "./knowledge-embedding-privileges.ts"
import {AutonomousAgentRunRepository} from "./autonomous-agent-run-repository.ts"
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
import {createNativeRunRepository} from "./native-run-repository.ts"
import {ScheduleInventoryRepository} from "./schedule-inventory-repository.ts"
import {ScheduleDraftRepository} from "./schedule-draft-repository.ts"
import {ScheduleRuntimeRepository} from "./schedule-runtime-repository.ts"
import {AgentCollaborationRepository} from "./agent-collaboration-repository.ts"
import {inspectAgentCollaborationSchema} from "./agent-collaboration-audit.ts"
import {AgentReleaseRepository} from "./agent-release-repository.ts"
import {inspectAgentReleaseSchema} from "./agent-release-audit.ts"
import {verifyScheduleRuntimeSchema} from "./schedule-runtime-audit.ts"
import {WorkflowRepository} from "./workflow-repository.ts"
import {WorkflowValidationRepository} from "./workflow-validation-repository.ts"
import {WorkflowSafeRunRepository} from "./workflow-safe-run-repository.ts"
import {WorkflowV2RunRepository} from "./workflow-v2-run-repository.ts"
import {KnowledgeBaseRepository} from "./knowledge-repository.ts"
import {KnowledgeAccessRepository} from "./knowledge-access-repository.ts"
import {KnowledgeContentRepository} from "./knowledge-content-repository.ts"
import {verifyKnowledgeRuntimeSchema,verifyKnowledgeAgentSchema,verifyWorkflowSampleLineageSchema} from "./knowledge-content-privileges.ts"
import {createHandler} from "./http.ts"
import {NativeAuthRepository} from "./native-auth-repository.mjs"
import {inspectEmployeeGovernanceSchema} from "./native-employee-governance-audit.mjs"
import {createNativeAuthHttpHandler} from "./native-auth-http.mjs"
import {ModelConnectionRepository} from "./model-connection-repository.ts"
import {ToolConnectionRepository} from "./tool-connection-repository.ts"
import {McpConnectionRepository} from "./mcp-connection-repository.ts"
import {createMcpDiscovery} from "./mcp-discovery.ts"
import {createMcpNetwork} from "./mcp-network.ts"
import {verifyMcpDiscoveryPrivileges,verifyMcpExecutionSchema} from "./mcp-privileges.ts"
import {SmitheryRepository} from "./smithery-repository.ts"
import {createSmitheryNetwork} from "./smithery-network.ts"
import {verifySmitheryPrivileges} from "./smithery-privileges.ts"
import {verifyOptionalCredentialBoundary} from "./optional-credential-boundary.ts"
import {createProviderConnectivityProbe} from "./model-connection-probe.ts"
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
):{apiFile:string,authFile:string,modelKeyFile:string,credentialDir:string}{
  const apiFile=required(env,"AGENT_STUDIO_PG_PASSWORD_FILE")
  const authFile=required(env,"AGENT_STUDIO_PG_NATIVE_AUTH_PASSWORD_FILE")
  const modelKeyFile=required(env,"AGENT_STUDIO_PG_MODEL_ENCRYPTION_KEY_FILE")
  if(!listen){
    if(env.CREDENTIALS_DIRECTORY!==undefined||
       apiFile!==rootVault+"/api.secret"||
       authFile!==rootVault+"/native-auth.secret"||
       modelKeyFile!==rootVault+"/model-encryption.secret")reject()
    return {apiFile,authFile,modelKeyFile,credentialDir:rootVault}
  }
  // A long-lived HTTP server must never read root vault credentials or run
  // as root. systemd copies secrets into its private credential mount.
  if(!Number.isSafeInteger(uid)||uid===undefined||uid<=0||
     env.CREDENTIALS_DIRECTORY!==serviceCredentials||
     apiFile!==serviceCredentials+"/api.secret"||
     authFile!==serviceCredentials+"/native-auth.secret"||
     modelKeyFile!==serviceCredentials+"/model-encryption.secret")reject()
  return {apiFile,authFile,modelKeyFile,credentialDir:serviceCredentials}
}
// Provider probes use a distinct login that can only SET ROLE
// agentstudio_model_broker. Without explicit probe UAT approval this fourth
// credential is forbidden; --plan and --preflight never use it.
export function nativeBrokerCredentialConfig(
  env:NodeJS.ProcessEnv,listen:boolean,modelProbeUat:boolean,
):string|null{
  const file=env.AGENT_STUDIO_PG_MODEL_BROKER_PASSWORD_FILE
  const user=env.AGENT_STUDIO_PG_MODEL_BROKER_USER
  if(!listen){
    if(file!==undefined||user!==undefined)reject()
    return null
  }
  if(!modelProbeUat){
    if(file!==undefined||user!==undefined)reject()
    return null
  }
  // Never report model-probe capability as enabled without its separate
  // credential broker login; refuse startup before opening HTTP.
  if(user!=="agentstudio_model_broker_login"||
     file!==serviceCredentials+"/model-broker.secret")reject()
  return file
}
/** Offline plan is intentionally safe on machines without database access. */
export function nativePg18ServerPlan(){
  return {mode:"plan",service:"agentstudio-pg18-native-pilot",
    database:"agent_studio",database_port:5333,host:"127.0.0.1",
    http_bind:"127.0.0.1",default_http_port:7403,
    requires_two_independent_logins:true,
    model_credentials:"aes_256_gcm_external_key",
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
    if(basename!=="api.secret"&&basename!=="native-auth.secret"&&
       basename!=="model-encryption.secret"&&
       basename!=="model-broker.secret")reject()
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
      if(!approved||!Number.isSafeInteger(Number(approved.active_admins))||Number(approved.active_admins)<1)reject()
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
      return Number(approved.active_admins)
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
  const modelKeySecret=safeSecret(files.modelKeyFile,listen,env)
  const brokerFile=nativeBrokerCredentialConfig(
    env,listen,capabilities.modelProbeUat||capabilities.mcpDiscoveryUat===true||capabilities.smitheryManagementUat===true)
  const brokerSecret=brokerFile?safeSecret(brokerFile,listen,env):null
  const {parseModelEncryptionKey}=await import("./model-connection-crypto.ts")
  const modelEncryptionKey=parseModelEncryptionKey(modelKeySecret.password)
  const secrets=[apiSecret,authSecret,modelKeySecret,
    ...(brokerSecret?[brokerSecret]:[])]
  for(let i=0;i<secrets.length;i++)for(let j=i+1;j<secrets.length;j++)
    if(secrets[i]!.stat.dev===secrets[j]!.stat.dev&&
       secrets[i]!.stat.ino===secrets[j]!.stat.ino)reject()
  // Resolve pg only for explicit --preflight/--serve, so offline --plan
  // never loads a database driver or attempts to use the network.
  const {Pool}=await import("pg")
  const businessPool=new Pool({host:cfg.host,port:5333,database:cfg.database,
    user:cfg.api.user,password:apiSecret.password,max:5,
    connectionTimeoutMillis:4000,statement_timeout:10000})
  const authPool=new Pool({host:cfg.host,port:5333,database:cfg.database,
    user:cfg.user,password:authSecret.password,max:3,
    connectionTimeoutMillis:4000,statement_timeout:10000})
  const brokerPool=brokerSecret?new Pool({
    host:cfg.host,port:5333,database:cfg.database,
    user:"agentstudio_model_broker_login",password:brokerSecret.password,max:2,
    connectionTimeoutMillis:4000,statement_timeout:8000}):null
  const business=scopedKnowledgeToolPool(scopedKnowledgeQueryPool(scopedKnowledgeIndexPool(scopedEmbeddingConsentPool(scopedEmbeddingSettingsPool(scopedKnowledgePool(adapter(businessPool),capabilities.knowledgeSharingUat===true),capabilities.knowledgeEmbeddingSettingsUat===true),capabilities.knowledgeEmbeddingConsentUat===true),capabilities.knowledgeIndexRuntimeUat===true),capabilities.knowledgeQueryRuntimeUat===true),capabilities.knowledgeToolExecutionUat===true)
  businessPool.on("error",()=>{})
  authPool.on("error",()=>{})
  brokerPool?.on("error",()=>{})
  let server:ReturnType<typeof createServer>|undefined
  try{
    await verifyPgRuntimeTarget(business,cfg.api)
    await verifyDatabaseRole(business)
    const verifiedActiveAdmins=await verifyNativeAuthService(adapter(authPool))
    if(brokerPool){
      // Read-only, before opening HTTP. The model secret broker must be
      // independent of both regular API and Worker login membership.
      const db=await brokerPool.connect()
      try{
        await db.query("BEGIN READ ONLY")
        try{
          await db.query("SET LOCAL ROLE agentstudio_model_broker")
          const result=await db.query<{
            role:string;api:boolean;worker:boolean;
            keyReadable:boolean;writeAllowed:boolean
          }>("SELECT current_user AS role,"+
            "pg_has_role(session_user,'agentstudio_api','member') AS api,"+
            "pg_has_role(session_user,'agentstudio_worker','member') AS worker,"+
            "has_column_privilege(current_user,'agentstudio.model_connections',"+
              "'api_key_ciphertext','SELECT') AS \"keyReadable\","+
            "has_table_privilege(current_user,'agentstudio.model_connections',"+
              "'UPDATE') AS \"writeAllowed\"")
          const role=result.rows[0]
          if(!role||role.role!=="agentstudio_model_broker"||
             role.api!==false||role.worker!==false||
             role.keyReadable!==true||role.writeAllowed!==false)reject()
          await verifyOptionalCredentialBoundary({
            async query<Row>(sql:string,params:unknown[]=[]){const value=await db.query(sql,params);return {rows:value.rows as Row[]}},
            release(){/* The enclosing transaction owns this connection. */},
          },"broker")
        }finally{await db.query("ROLLBACK")}
      }finally{db.release()}
    }
    // A separate, strictly read-only deployment preflight never opens HTTP.
    if(capabilities.mcpDiscoveryUat===true){
      if(!brokerPool)reject()
      await verifyMcpDiscoveryPrivileges(business,adapter(brokerPool))
    }
    if(capabilities.mcpToolExecutionUat===true)await verifyMcpExecutionSchema(business)
    if(capabilities.smitheryManagementUat===true){
      if(!brokerPool)reject()
      await verifyMcpDiscoveryPrivileges(business,adapter(brokerPool))
      await verifySmitheryPrivileges(business,adapter(brokerPool))
    }
    await verifyKnowledgeAgentSchema(business)
    await verifyWorkflowSampleLineageSchema(business)
    if(capabilities.knowledgeSharingUat===true||capabilities.workflowV2ExecutionUat===true||capabilities.autonomousAgentUat===true)await verifyKnowledgeRuntimeSchema(business,true)
    if(capabilities.knowledgeEmbeddingSettingsUat===true)await verifyKnowledgeEmbeddingSchema(business)
    if(capabilities.knowledgeEmbeddingConsentUat===true)await verifyKnowledgeEmbeddingConsentSchema(business)
    if(capabilities.knowledgeIndexRuntimeUat===true)await verifyKnowledgeIndexSchema(business)
    if(capabilities.knowledgeQueryRuntimeUat===true)await verifyKnowledgeQuerySchema(business)
    if(capabilities.knowledgeToolExecutionUat===true)await verifyKnowledgeToolSchema(business)
    if(capabilities.scheduleRuntimeUat===true)await verifyScheduleRuntimeSchema(business)
    const employeeGovernanceAvailable=await inspectEmployeeGovernanceSchema(business)
    const collaborationAvailable=await inspectAgentCollaborationSchema(business)
    const releasesAvailable=await inspectAgentReleaseSchema(business)
    if(!listen){
      await Promise.all([businessPool.end(),authPool.end(),
        ...(brokerPool?[brokerPool.end()]:[])])
      return {mode:"preflight",ready:true,target:"agent_studio",
        verified_roles:2,verified_active_admins:verifiedActiveAdmins,
        writes_performed:false,port_opened:false,
        workers_started:false,production_cutover_allowed:false}
    }
    const auth=new NativeAuthRepository(adapter(authPool))
    let businessHandler:ReturnType<typeof createHandler>|undefined
    const native=createNativeAuthHttpHandler({auth,allowedOrigin:cfg.allowedOrigin,
      allowEmployeeGovernance:employeeGovernanceAvailable,
      allowConfigurationWrites:capabilities.configurationWrites,
      allowModelProbe:capabilities.modelProbeUat,
      allowMcpDiscovery:capabilities.mcpDiscoveryUat===true,
      allowSmitheryManagement:capabilities.smitheryManagementUat===true,
      allowKnowledgeSharing:capabilities.knowledgeSharingUat===true,
      allowKnowledgeEmbeddingSettings:capabilities.knowledgeEmbeddingSettingsUat===true,
      allowKnowledgeEmbeddingConsent:capabilities.knowledgeEmbeddingConsentUat===true,
      allowKnowledgeIndexRuntime:capabilities.knowledgeIndexRuntimeUat===true,
      allowKnowledgeQueryRuntime:capabilities.knowledgeQueryRuntimeUat===true,
      allowKnowledgeToolExecution:capabilities.knowledgeToolExecutionUat===true,
      allowMcpToolExecution:capabilities.mcpToolExecutionUat===true,
      allowRunSubmission:capabilities.runApprovalUat,
      allowBoundRunSubmission:capabilities.boundModelExecutionUat===true,
      allowWorkflowValidation:capabilities.workflowValidationUat===true,
      allowWorkflowExecution:capabilities.workflowExecutionUat===true,
      allowAutonomousAgentSubmission:capabilities.autonomousAgentUat===true,
      allowWorkflowV2Submission:capabilities.workflowV2ExecutionUat===true,
      allowScheduleRuntime:capabilities.scheduleRuntimeUat===true,
      allowAgentCollaboration:collaborationAvailable,
      allowAgentReleases:releasesAvailable,
      allowEmployeeProvisioning:capabilities.employeeProvisioning,
      businessHandler:(req:IncomingMessage,res:ServerResponse)=>{
        // Only verified employee identity (in createHandler) may mutate an
        // owner-owned records. Each mutation needs its independent policy
        // below; public routes never mount the private Broker or executor.
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
      repository:new AgentSpecRepository(business),
      ...(collaborationAvailable?{agentCollaborationRepository:new AgentCollaborationRepository(business,(identity,email)=>auth.resolveKnowledgeRecipient(identity,email),{enabled:capabilities.configurationWrites===true})}:{}),
      ...(releasesAvailable?{agentReleaseRepository:new AgentReleaseRepository(business,{enabled:capabilities.configurationWrites===true,allowAcceptance:capabilities.autonomousAgentUat===true,
        allowMcpExecution:capabilities.mcpToolExecutionUat===true,allowKnowledgeExecution:capabilities.knowledgeToolExecutionUat===true})}:{}),
      modelConnectionRepository:new ModelConnectionRepository(
        business,modelEncryptionKey,
        brokerPool?adapter(brokerPool):business),
      toolConnectionRepository:new ToolConnectionRepository(
        business,modelEncryptionKey),
      mcpConnectionRepository:new McpConnectionRepository(business,modelEncryptionKey,brokerPool?adapter(brokerPool):undefined),
      ...(capabilities.mcpDiscoveryUat===true?{mcpDiscovery:createMcpDiscovery(createMcpNetwork())}:{}),
      ...(capabilities.smitheryManagementUat===true?{smitheryRepository:new SmitheryRepository(business,modelEncryptionKey,adapter(brokerPool!),createSmitheryNetwork())}:{}),
      // Explicit opt-in is required for ANY provider-network egress.
      ...(capabilities.modelProbeUat===true
        ?{modelConnectionProbe:createProviderConnectivityProbe()}:{}),
      // Existing own Agent Run history is safe to READ in default mode.
      // Native route policy still denies all submissions and approvals unless
      // the SECOND explicit isolated UAT grant is present. Model binding
      // submission additionally requires the independent generation UAT grant.
      // The public API never constructs a provider executor or private Broker.
      runRepository:createNativeRunRepository(business,capabilities),
      workflowRepository:new WorkflowRepository(business),
      // Owner-scoped Workflow run history is GET-only by default. The route
      // policy independently gates queue submissions behind explicit UAT.
      workflowSafeRunRepository:new WorkflowSafeRunRepository(business),
      autonomousAgentRunRepository:new AutonomousAgentRunRepository(business,{allowMcpExecution:capabilities.mcpToolExecutionUat===true,allowKnowledgeExecution:capabilities.knowledgeToolExecutionUat===true}),
      workflowV2RunRepository:new WorkflowV2RunRepository(business,"workflow_native_v2",{allowMcpExecution:capabilities.mcpToolExecutionUat===true,allowKnowledgeExecution:capabilities.knowledgeToolExecutionUat===true}),
      // Only a separately approved, inert Start/End-only validation run.
      ...(capabilities.workflowValidationUat===true
        ?{workflowValidationRepository:new WorkflowValidationRepository(
          business)}:{}),
      knowledgeRepository:new KnowledgeBaseRepository(business),
      ...(capabilities.knowledgeSharingUat===true?{
        knowledgeAccessRepository:new KnowledgeAccessRepository(business,(identity,email)=>auth.resolveKnowledgeRecipient(identity,email)),
        knowledgeContentRepository:new KnowledgeContentRepository(business),
      }:{}),
      ...(capabilities.knowledgeEmbeddingSettingsUat===true?{knowledgeEmbeddingRepository:new KnowledgeEmbeddingRepository(business,embeddingEndpointPolicy(process.env))}:{}),
      ...(capabilities.knowledgeEmbeddingConsentUat===true?{knowledgeEmbeddingConsentRepository:new KnowledgeEmbeddingConsentRepository(business)}:{}),
      ...(capabilities.knowledgeIndexRuntimeUat===true?{knowledgeIndexRepository:new KnowledgeIndexRepository(business)}:{}),
      ...(capabilities.knowledgeQueryRuntimeUat===true?{knowledgeQueryRepository:new KnowledgeQueryRepository(business)}:{}),
      scheduleInventory:new ScheduleInventoryRepository(business),
      scheduleRuntimeRepository:new ScheduleRuntimeRepository(business,{enabled:capabilities.scheduleRuntimeUat===true,allowMcpExecution:capabilities.mcpToolExecutionUat===true,allowKnowledgeExecution:capabilities.knowledgeToolExecutionUat===true}),
      // Schedule drafts are inert and only available behind explicit config UAT.
      ...(capabilities.configurationWrites===true
        ?{scheduleDraftRepository:new ScheduleDraftRepository(business)}:{})
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
      bound_model_run_uat_enabled:capabilities.boundModelExecutionUat===true,
      provider_probe_uat_enabled:capabilities.modelProbeUat,
      workflow_validation_uat_enabled:capabilities.workflowValidationUat===true,
      workflow_execution_uat_enabled:capabilities.workflowExecutionUat===true,
      autonomous_agent_submission_uat_enabled:capabilities.autonomousAgentUat===true,
      workflow_v2_submission_uat_enabled:capabilities.workflowV2ExecutionUat===true,
      schedule_execution_uat_enabled:capabilities.scheduleRuntimeUat===true,
      workers_started:false,production_cutover_allowed:false})+"\n")
    let shuttingDown=false
    const shutdown=()=>{
      if(shuttingDown)return
      shuttingDown=true
      localServer.close(()=>{
        void Promise.all([businessPool.end(),authPool.end(),
          ...(brokerPool?[brokerPool.end()]:[])])
          .then(()=>{process.exitCode=0})
      })
    }
    process.once("SIGTERM",shutdown)
    process.once("SIGINT",shutdown)
    return {server:localServer,shutdown}
  }catch(error){
    if(server?.listening)server.close()
    await Promise.allSettled([businessPool.end(),authPool.end(),
      ...(brokerPool?[brokerPool.end()]:[])])
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
