#!/usr/bin/env node
import {selectKnowledgeSharing} from "./knowledge-sharing-policy.ts"
import {scopedKnowledgePool,scopedEmbeddingConsentPool,scopedEmbeddingSettingsPool} from "./knowledge-scope-policy.ts"
import {scopedKnowledgeQueryPool} from "./knowledge-query-policy.ts"
import {selectKnowledgeToolRuntime,scopedKnowledgeToolPool,verifyKnowledgeToolSchema} from "./knowledge-tool-policy.ts"
import {verifyKnowledgeRuntimeSchema} from "./knowledge-content-privileges.ts"
// Separate, private PG18 Broker. Never mount this handler on Native/8090.
// Import and --plan perform no credential I/O, database access or listening.
import {createServer} from "node:https"
import {assertBoundDispatchTlsMaterial} from "./bound-tls-material.ts"
export {assertBoundDispatchTlsMaterial} from "./bound-tls-material.ts"
import path from "node:path"
import {fileURLToPath} from "node:url"
import type {Pool as PgPool} from "pg"
import type {SqlPool,SqlClient} from "./contracts.ts"
import {selectPgRuntimeTarget} from "./pg-runtime-target.ts"
import {selectAutonomousAgentExecution} from "./durable-v2-root.ts"
import {verifyBoundWorkerMutualTlsPeer} from "./bound-worker-mtls.ts"
import {boundCertificateFingerprint} from "./bound-worker-mtls.ts"
import {boundCredentialDirectory,readBoundRuntimeCredential} from "./bound-runtime-credentials.ts"
import {verifyBoundDispatchRole,verifyWorkflowModelIdentityPrivileges,verifyWorkflowEffectIdentityPrivileges} from "./bound-dispatch-role-preflight.ts"
import {parseModelEncryptionKey} from "./model-connection-crypto.ts"
import {selectBoundGenerationUat,createIsolatedBoundModelExecutor,createIsolatedWorkflowModelExecutor,createIsolatedWorkflowNodeDebugExecutor,createIsolatedWorkflowAgentModelExecutor,createIsolatedAutonomousAgentModelExecutor} from "./model-connection-executor.ts"
import {OwnerBoundModelDispatch} from "./owner-model-dispatch.ts"
import {BoundLeaseIdentityRepository,createVerifiedBoundDispatchAdapter} from "./bound-lease-identity.ts"
import {createIsolatedBoundModelInternalHandler} from "./bound-model-internal-handler.ts"
import {workflowV2ModelRoute,selectWorkflowV2ModelExecution} from "./workflow-v2-model-contract.ts"
import {createWorkflowV2ModelInternalHandler} from "./workflow-v2-model-handler.ts"
import {WorkflowV2ModelDispatch,WorkflowV2ModelLeaseIdentity,verifiedWorkflowV2ModelDispatch} from "./workflow-v2-model-dispatch.ts"
import {workflowV2ToolRoute,selectWorkflowV2ToolExecution} from "./workflow-v2-tool-contract.ts"
import {createWorkflowV2ToolInternalHandler} from "./workflow-v2-tool-handler.ts"
import {WorkflowV2ToolDispatch,WorkflowV2ToolLeaseIdentity,verifiedWorkflowV2ToolDispatch} from "./workflow-v2-tool-dispatch.ts"
import {createWorkflowToolNetwork} from "./workflow-v2-tool-network.ts"
import {selectWorkflowAgentExecution} from "./workflow-v2-agent-machine.ts"
import {createMcpToolExecutor,selectMcpExecution} from "./mcp-call.ts"
import {createMcpNetwork} from "./mcp-network.ts"
import {verifyMcpDiscoveryPrivileges,verifyMcpExecutionSchema} from "./mcp-privileges.ts"

const origin="https://127.0.0.1:7453"
const directory=boundCredentialDirectory("dispatch")
function refuse():never{throw Error("unsafe_bound_dispatch_server_config")}
export function boundDispatchOfflinePlan(){
  return {mode:"plan",service:"pg18-private-bound-model-broker",bind:"127.0.0.1",port:7453,
    independent_database_logins:3,requires_mutual_tls:true,
    network_used:false,credentials_read:false,workers_started:false,
    external_model_calls:false,production_cutover_allowed:false}
}
export function boundDispatchServerConfig(
  env:NodeJS.ProcessEnv,mode:"preflight"|"serve",
  platform=process.platform,uid=process.getuid?.(),
){
  if(!["preflight","serve"].includes(mode)||platform!=="linux"||
     !Number.isSafeInteger(uid)||uid===undefined||uid<=0||
     env.AGENT_STUDIO_PG_BOUND_DISPATCH_REVIEWED!=="true"||
     env.CREDENTIALS_DIRECTORY!==directory)refuse()
  const target=selectPgRuntimeTarget(env,"api",platform)
  if(target.mode!=="baota_pg18")refuse()
  try{boundCertificateFingerprint(env.AGENT_STUDIO_PG_BOUND_DISPATCH_CLIENT_FINGERPRINT)}
  catch{refuse()}
  const knowledgeSharingEnabled=selectKnowledgeSharing(env)
  const workflowModelEnabled=selectWorkflowV2ModelExecution(env)
  const workflowToolsEnabled=selectWorkflowV2ToolExecution(env)
  const knowledgeToolsEnabled=selectKnowledgeToolRuntime(env)
  if(knowledgeToolsEnabled&&!workflowToolsEnabled)refuse()
  const mcpEnabled=selectMcpExecution(env)
  if(mcpEnabled&&!workflowToolsEnabled)refuse()
  const autonomousEnabled=selectAutonomousAgentExecution(env)
  const autonomousFingerprint=env.AGENT_STUDIO_PG_AUTONOMOUS_AGENT_CLIENT_FINGERPRINT
  const workflowAgentsEnabled=selectWorkflowAgentExecution(env)
  if(autonomousEnabled&&(!workflowModelEnabled||!workflowToolsEnabled))refuse()
  if(workflowAgentsEnabled&&(!workflowModelEnabled||!workflowToolsEnabled))refuse()
  const workflowFingerprint=env.AGENT_STUDIO_PG_WORKFLOW_V2_CLIENT_FINGERPRINT
  if(workflowModelEnabled||workflowToolsEnabled)try{
    const workflowPin=boundCertificateFingerprint(workflowFingerprint)
    if(workflowPin.equals(boundCertificateFingerprint(env.AGENT_STUDIO_PG_BOUND_DISPATCH_CLIENT_FINGERPRINT)))refuse()
  }catch{refuse()}
  if(autonomousEnabled)try{
    const pin=boundCertificateFingerprint(autonomousFingerprint)
    if(pin.equals(boundCertificateFingerprint(workflowFingerprint))||pin.equals(boundCertificateFingerprint(env.AGENT_STUDIO_PG_BOUND_DISPATCH_CLIENT_FINGERPRINT)))refuse()
  }catch{refuse()}
  if(mode==="serve")selectBoundGenerationUat(env,true,origin,uid)
  return {target,origin,directory,port:7453 as const,...(knowledgeSharingEnabled?{knowledgeSharingEnabled:true}:{}),...(knowledgeToolsEnabled?{knowledgeToolsEnabled:true}:{}),
    workerFingerprint:env.AGENT_STUDIO_PG_BOUND_DISPATCH_CLIENT_FINGERPRINT!,workflowModelEnabled,workflowToolsEnabled,workflowAgentsEnabled,workflowFingerprint,autonomousEnabled,autonomousFingerprint,...(mcpEnabled?{mcpEnabled:true}:{} )}
}
function password(bytes:Buffer):string{
  const value=bytes.toString("utf8").replace(/[\r\n]+$/g,"")
  if(value.length<32||value.length>512||/[\u0000-\u0020\u007f]/u.test(value))refuse()
  return value
}
function adapter(pool:PgPool):SqlPool{
  return {async connect():Promise<SqlClient>{
    const db=await pool.connect()
    return {async query<Row>(sql:string,values:unknown[]=[]){
      const result=await db.query(sql,values);return {rows:result.rows as Row[]}
    },release(){db.release()}}
  }}
}
export async function startBoundDispatchServer(
  env=process.env,mode:"preflight"|"serve"="preflight",
){
  const cfg=boundDispatchServerConfig(env,mode)
  const read=(name:string)=>readBoundRuntimeCredential("dispatch",name,env)
  const apiPassword=password(read("api.secret"))
  const identityPassword=password(read("identity.secret"))
  const brokerPassword=password(read("broker.secret"))
  const encryptionKey=parseModelEncryptionKey(read("model-encryption.secret").toString("utf8"))
  if(new Set([apiPassword,identityPassword,brokerPassword,encryptionKey.toString("hex")]).size!==4)refuse()
  const ca=read("dispatch-ca.pem"),cert=read("dispatch-server.pem"),key=read("dispatch-server.key")
  assertBoundDispatchTlsMaterial(ca,cert,key)
  // Driver and executor construction are deferred until exact target and
  // private credentials pass. Preflight never constructs a provider executor.
  const {Pool}=await import("pg")
  const connect=(user:string,secret:string)=>new Pool({
    host:cfg.target.host,port:cfg.target.port,database:cfg.target.database,
    user,password:secret,max:3,connectionTimeoutMillis:4000,statement_timeout:8000,
  })
  const api=connect("agentstudio_stage_login",apiPassword)
  const identities=connect("agentstudio_bound_dispatch_login",identityPassword)
  const broker=connect("agentstudio_model_broker_login",brokerPassword)
  const business=scopedKnowledgeToolPool(scopedKnowledgeQueryPool(scopedEmbeddingConsentPool(scopedEmbeddingSettingsPool(scopedKnowledgePool(adapter(api),cfg.knowledgeSharingEnabled===true),cfg.knowledgeToolsEnabled===true),cfg.knowledgeToolsEnabled===true),cfg.knowledgeToolsEnabled===true),cfg.knowledgeToolsEnabled===true)
  const pools=[api,identities,broker]
  for(const pool of pools)pool.on("error",()=>{})
  let server:ReturnType<typeof createServer>|undefined
  const endPools=async()=>{await Promise.allSettled(pools.map(pool=>pool.end()))}
  try{
    await verifyBoundDispatchRole(business,cfg.target,"api")
    await verifyBoundDispatchRole(adapter(identities),cfg.target,"identity")
    await verifyBoundDispatchRole(adapter(broker),cfg.target,"broker")
    if(cfg.workflowModelEnabled){
      await verifyWorkflowModelIdentityPrivileges(business,"api")
      await verifyWorkflowModelIdentityPrivileges(adapter(identities),"identity")
      await verifyWorkflowModelIdentityPrivileges(adapter(broker),"broker")
    }
    if(cfg.workflowToolsEnabled)for(const [kind,pool] of [["api",api],["identity",identities],["broker",broker]] as const)
      await verifyWorkflowEffectIdentityPrivileges(adapter(pool),kind,"tool")
    if(cfg.workflowAgentsEnabled)for(const effect of ["agent_model","agent_tool"] as const)
      for(const [kind,pool] of [["api",api],["identity",identities],["broker",broker]] as const)
        await verifyWorkflowEffectIdentityPrivileges(adapter(pool),kind,effect)
    if(cfg.autonomousEnabled)for(const effect of ["autonomous_model","autonomous_tool"] as const)
      for(const [kind,pool] of [["api",api],["identity",identities],["broker",broker]] as const)
        await verifyWorkflowEffectIdentityPrivileges(adapter(pool),kind,effect)
    if(cfg.mcpEnabled){await verifyMcpDiscoveryPrivileges(business,adapter(broker));await verifyMcpExecutionSchema(business)}
    if(cfg.knowledgeSharingEnabled)await verifyKnowledgeRuntimeSchema(business)
    if(cfg.knowledgeToolsEnabled)await verifyKnowledgeToolSchema(business)
    if(mode==="preflight"){
      await endPools()
      encryptionKey.fill(0)
      return {mode,ready:true,verified_roles:3,tls_material_verified:true,
        writes_performed:false,port_opened:false,external_model_calls:false,
        production_cutover_allowed:false}
    }
    const executor=createIsolatedBoundModelExecutor(env,origin,true)
    const dispatch=new OwnerBoundModelDispatch(business,encryptionKey,executor,adapter(broker))
    const handler=createIsolatedBoundModelInternalHandler({
      approvedForIsolatedUat:true,reviewedClientFingerprint256:cfg.workerFingerprint,
      dispatch:createVerifiedBoundDispatchAdapter(new BoundLeaseIdentityRepository(adapter(identities)),dispatch),
    })
    const makeV2Handlers=(pin:string,autonomous:boolean)=>{
      const executionMode=autonomous?"agent_native_v2" as const:"workflow_native_v2" as const
      const agentExecutor=autonomous?createIsolatedAutonomousAgentModelExecutor(env,origin,true):
        cfg.workflowAgentsEnabled?createIsolatedWorkflowAgentModelExecutor(env,origin,true):undefined
      return {
        model:cfg.workflowModelEnabled?createWorkflowV2ModelInternalHandler({approvedForIsolatedUat:true,executionMode,
          reviewedClientFingerprint256:pin,dispatch:verifiedWorkflowV2ModelDispatch(new WorkflowV2ModelLeaseIdentity(adapter(identities)),
            new WorkflowV2ModelDispatch(business,encryptionKey,createIsolatedWorkflowModelExecutor(env,origin,true),adapter(broker),{
              allowAgentExecution:!autonomous&&cfg.workflowAgentsEnabled,allowAutonomousExecution:autonomous,agentExecutor,
              nodeDebugExecutor:autonomous?undefined:createIsolatedWorkflowNodeDebugExecutor(env,origin,true)}))}):undefined,
        tool:cfg.workflowToolsEnabled?createWorkflowV2ToolInternalHandler({approvedForIsolatedUat:true,executionMode,
          reviewedClientFingerprint256:pin,dispatch:verifiedWorkflowV2ToolDispatch(new WorkflowV2ToolLeaseIdentity(adapter(identities)),
            new WorkflowV2ToolDispatch(business,encryptionKey,{...createWorkflowToolNetwork(),
              ...(cfg.mcpEnabled?{mcp:createMcpToolExecutor(createMcpNetwork())}:{}),
              summarize:createIsolatedWorkflowModelExecutor(env,origin,true)},adapter(broker),{
                allowAgentExecution:!autonomous&&cfg.workflowAgentsEnabled,allowAutonomousExecution:autonomous,allowKnowledgeExecution:cfg.knowledgeToolsEnabled===true}))}):undefined,
      }
    }
    const workflowHandlers=cfg.workflowModelEnabled||cfg.workflowToolsEnabled?makeV2Handlers(cfg.workflowFingerprint!,false):undefined
    const autonomousHandlers=cfg.autonomousEnabled?makeV2Handlers(cfg.autonomousFingerprint!,true):undefined
    server=createServer({key,cert,ca,requestCert:true,rejectUnauthorized:true,minVersion:"TLSv1.2"},(req,res)=>{
      let handlers=workflowHandlers
      if(autonomousHandlers)try{verifyBoundWorkerMutualTlsPeer(req.socket,cfg.autonomousFingerprint!);handlers=autonomousHandlers}catch{}
      const selected=req.url===workflowV2ToolRoute&&handlers?.tool?handlers.tool:
        req.url===workflowV2ModelRoute&&handlers?.model?handlers.model:handler
      void selected(req,res).catch(()=>res.destroy())
    })
    server.requestTimeout=60000
    server.headersTimeout=12000
    server.maxRequestsPerSocket=1
    await new Promise<void>((resolve,reject)=>{
      server!.once("error",reject);server!.listen(cfg.port,"127.0.0.1",resolve)
    })
    let closing=false
    const close=async()=>{
      if(closing)return
      closing=true
      await new Promise<void>((resolve,reject)=>server!.close(error=>error?reject(error):resolve()))
      await endPools();encryptionKey.fill(0)
    }
    return {mode,ready:true,bind:"127.0.0.1",port:cfg.port,close,
      production_cutover_allowed:false}
  }catch(error){
    if(server?.listening){
      server.closeAllConnections()
      await new Promise<void>(resolve=>server!.close(()=>resolve()))
    }
    await endPools();encryptionKey.fill(0)
    throw error
  }
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2)
  if(args.length===1&&args[0]==="--plan"){
    process.stdout.write(JSON.stringify(boundDispatchOfflinePlan())+"\n")
  }else if(args.length===1&&(args[0]==="--preflight"||args[0]==="--serve")){
    void startBoundDispatchServer(process.env,args[0]==="--serve"?"serve":"preflight")
      .then(result=>{
        const {close,...report}=result
        process.stdout.write(JSON.stringify(report)+"\n")
        if(close){
          const stop=()=>{void close().catch(()=>{process.exitCode=1})}
          process.once("SIGTERM",stop);process.once("SIGINT",stop)
        }
      }).catch(()=>{process.stderr.write("BOUND_DISPATCH_START_FAILED\n");process.exitCode=1})
  }else{
    process.stderr.write("BOUND_DISPATCH_EXPLICIT_MODE_REQUIRED\n");process.exitCode=2
  }
}
