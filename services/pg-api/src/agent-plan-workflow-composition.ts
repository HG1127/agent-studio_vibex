// Runnable F05 composition. Import creates no pools, listeners or Workers.
// All startup checks run on original authenticated clients before SET ROLE.
import type {IncomingMessage,ServerResponse} from 'node:http'
import type {request as HttpsRequest} from 'node:https'
import type {SqlPool,SqlClient,Identity} from './contracts.ts'
import type {ProviderResolver} from './model-connection-probe.ts'
import {verifyOptionalCredentialBoundary} from './optional-credential-boundary.ts'
import {AgentPlanWorkflowLedgerRepository} from './agent-plan-workflow-ledger.ts'
import {AgentPlanWorkflowBroker} from './agent-plan-workflow-broker.ts'
import {AgentPlanWorkflowWorker} from './agent-plan-workflow-worker.ts'
import {createAgentPlanWorkflowMutualTlsClient,createAgentPlanWorkflowInternalHandler,type AgentPlanWorkflowClientConfig} from './agent-plan-workflow-client.ts'
import {createAgentPlanWorkflowHttpHandler} from './agent-plan-workflow-http.ts'
import {selectNativeAgentPlanWorkflowCapabilities,agentPlanWorkflowExecutionEnabled,agentPlanWorkflowExecutionApproval,assertAgentPlanWorkflowSession,type AgentPlanWorkflowDatabaseRole} from './agent-plan-workflow-runtime-policy.ts'

type Role=AgentPlanWorkflowDatabaseRole|'agentstudio_api'|'agentstudio_model_broker'
const refuse=():never=>{throw Error('agent_plan_workflow_startup_refused')}
async function assertOriginalLogin(db:SqlClient,role:Role):Promise<void>{
 if(role==='agentstudio_plan_workflow_worker'||role==='agentstudio_plan_workflow_dispatch')return assertAgentPlanWorkflowSession(db,role)
 const flags='rolcanlogin AS login,rolinherit AS inherit,rolsuper AS superuser,rolbypassrls AS bypassrls,rolcreatedb AS createdb,rolcreaterole AS createrole,rolreplication AS replication'
 const safe=(v:Record<string,unknown>)=>[v.inherit,v.superuser,v.bypassrls,v.createdb,v.createrole,v.replication].every(x=>x===false)
 const rows=(await db.query<Record<string,unknown>>('SELECT '+flags+',current_user=session_user AS initial_role FROM pg_catalog.pg_roles WHERE rolname=session_user')).rows,r=rows[0]
 if(rows.length!==1||!r||r.login!==true||r.initial_role!==true||!safe(r))return refuse()
 const targets=(await db.query<Record<string,unknown>>('SELECT '+flags+' FROM pg_catalog.pg_roles WHERE rolname=$1::text',[role])).rows,t=targets[0]
 if(targets.length!==1||!t||t.login!==false||!safe(t))return refuse()
 const reachable=(await db.query<{name:string}>("SELECT r.rolname AS name FROM pg_catalog.pg_roles r WHERE r.rolname<>session_user AND pg_catalog.pg_has_role(session_user,r.oid,'MEMBER') ORDER BY r.rolname")).rows
 const direct=(await db.query<{name:string;admin:boolean;inherit:boolean;set:boolean}>('SELECT r.rolname AS name,m.admin_option AS admin,m.inherit_option AS inherit,m.set_option AS "set" FROM pg_catalog.pg_auth_members m JOIN pg_catalog.pg_roles member ON member.oid=m.member JOIN pg_catalog.pg_roles r ON r.oid=m.roleid WHERE member.rolname=session_user ORDER BY r.rolname,m.grantor')).rows,g=direct[0]
 if(reachable.length!==1||reachable[0]?.name!==role||direct.length!==1||!g||g.name!==role||g.admin!==false||g.inherit!==false||g.set!==true)return refuse()
}
export async function inspectAgentPlanWorkflowServicePool(pool:SqlPool,role:Role):Promise<void>{
 if(!['agentstudio_api','agentstudio_model_broker','agentstudio_plan_workflow_worker','agentstudio_plan_workflow_dispatch'].includes(role))return refuse()
 const db=await pool.connect();let begun=false
 try{
  await db.query('BEGIN READ ONLY');begun=true
  await db.query("SET LOCAL lock_timeout='3s'");await db.query("SET LOCAL statement_timeout='8s'")
  await assertOriginalLogin(db,role)
  const server=(await db.query<{version:number|string}>('SELECT current_setting(\'server_version_num\')::integer AS version')).rows
  if(server.length!==1||Number(server[0]?.version)<180000||Number(server[0]?.version)>=190000||!Number.isSafeInteger(Number(server[0]?.version)))return refuse()
  // role is a closed constant union, never data from HTTP or environment.
  await db.query('SET LOCAL ROLE '+role)
  const current=(await db.query<{role:string}>('SELECT current_user AS role')).rows
  if(current.length!==1||current[0]?.role!==role)return refuse()
  if(role==='agentstudio_model_broker')await verifyOptionalCredentialBoundary(db,'broker')
  else if(await (await import('./agent-plan-workflow-audit.ts')).verifyAgentPlanWorkflowCredentials(db)!==true)return refuse()
 }finally{try{if(begun)await db.query('ROLLBACK')}finally{db.release()}}
}
export async function prepareAgentPlanWorkflowNative(config:{pool:SqlPool;env:Record<string,string|undefined>;listen:boolean;allowedOrigin:string;configurationWrites:boolean}){
 const caps=selectNativeAgentPlanWorkflowCapabilities(config.env,config.listen,config.allowedOrigin,config.configurationWrites)
 if(caps.available)await inspectAgentPlanWorkflowServicePool(config.pool,'agentstudio_api')
 const repository=caps.available?new AgentPlanWorkflowLedgerRepository(config.pool,{audit:(await import('./agent-plan-workflow-audit.ts')).verifyAgentPlanWorkflowCredentials,allowSubmissions:caps.submissions,allowSaves:caps.saves}):null
 return Object.freeze({capabilities:Object.freeze(caps),metadataOptions:Object.freeze({allowAgentPlanWorkflow:caps.available,allowAgentPlanWorkflowSubmissions:caps.submissions,allowAgentPlanWorkflowSaves:caps.saves}),
  createHandler(authenticateRequest:(req:IncomingMessage)=>Promise<Identity>){
   return repository?createAgentPlanWorkflowHttpHandler({repository,authenticateRequest,allowedOrigin:config.allowedOrigin,available:true}):null
  }})
}
type Activation={executionEnabled?:boolean;executionApproval?:string}
export async function createAgentPlanWorkflowBrokerRuntime(config:Activation&{businessPool:SqlPool;dispatchPool:SqlPool;secretPool:SqlPool;key:Buffer;reviewedClientFingerprint256:string;resolver?:ProviderResolver;request?:typeof HttpsRequest}){
 if(!agentPlanWorkflowExecutionEnabled(config))throw Error('agent_plan_workflow_service_disabled')
 if(new Set([config.businessPool,config.dispatchPool,config.secretPool]).size!==3)return refuse()
 await inspectAgentPlanWorkflowServicePool(config.businessPool,'agentstudio_api')
 await inspectAgentPlanWorkflowServicePool(config.dispatchPool,'agentstudio_plan_workflow_dispatch')
 await inspectAgentPlanWorkflowServicePool(config.secretPool,'agentstudio_model_broker')
 const broker=new AgentPlanWorkflowBroker(config.businessPool,config.dispatchPool,config.secretPool,config.key,{...config,audit:(await import('./agent-plan-workflow-audit.ts')).verifyAgentPlanWorkflowCredentials})
 let closing=false
 const pending=new Set<Promise<unknown>>()
 const dispatch=(proof:Parameters<typeof broker.dispatch>[0])=>{
  if(closing)return Promise.reject(Error('agent_plan_workflow_service_closing'))
  const work=broker.dispatch(proof);pending.add(work);void work.then(()=>pending.delete(work),()=>pending.delete(work));return work
 }
 try{
  const handler=createAgentPlanWorkflowInternalHandler({...config,dispatch})
  return {broker,handler,closeNewDispatches(){closing=true},async drain(){closing=true;while(pending.size)await Promise.allSettled([...pending])},close(){closing=true;broker.close()}}
 }catch(error){broker.close();throw error}
}
export async function createAgentPlanWorkflowWorkerRuntime(config:AgentPlanWorkflowClientConfig&{workerPool:SqlPool;workerId:string}){
 if(!agentPlanWorkflowExecutionEnabled(config))throw Error('agent_plan_workflow_service_disabled')
 await inspectAgentPlanWorkflowServicePool(config.workerPool,'agentstudio_plan_workflow_worker')
 const client=createAgentPlanWorkflowMutualTlsClient(config)
 try{
  const worker=new AgentPlanWorkflowWorker(config.workerPool,config.workerId,client,{executionEnabled:true,executionApproval:agentPlanWorkflowExecutionApproval,audit:(await import('./agent-plan-workflow-audit.ts')).verifyAgentPlanWorkflowCredentials})
  return {worker,client,closeNewClaims:()=>worker.closeNewClaims(),close(){worker.closeNewClaims();client.close()}}
 }catch(error){client.close();throw error}
}
export type AgentPlanWorkflowHandler=(req:IncomingMessage,res:ServerResponse)=>Promise<void>
