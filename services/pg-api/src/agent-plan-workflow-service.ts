#!/usr/bin/env node
// Explicit isolated F05 entry. --plan/--help are offline and default is off.
// No legacy bound-dispatch modification or new telemetry kind.
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {randomUUID} from 'node:crypto'
import {setTimeout as delay} from 'node:timers/promises'
import type {Pool as PgPool} from 'pg'
import type {SqlPool,SqlClient} from './contracts.ts'
import type {Duplex} from 'node:stream'
import {agentPlanWorkflowServiceConfig,parseAgentPlanWorkflowServiceArgs,agentPlanWorkflowServiceOfflinePlan,agentPlanWorkflowServiceHelp,readAgentPlanWorkflowCredential,inspectAgentPlanWorkflowCredential,agentPlanWorkflowDatabasePassword,assertAgentPlanWorkflowServiceTls,type AgentPlanWorkflowServiceKind} from './agent-plan-workflow-service-config.ts'
import {createAgentPlanWorkflowBrokerRuntime,createAgentPlanWorkflowWorkerRuntime,inspectAgentPlanWorkflowServicePool} from './agent-plan-workflow-composition.ts'
import {agentPlanWorkflowExecutionApproval} from './agent-plan-workflow-runtime-policy.ts'
import {verifyPgRuntimeTarget} from './pg-runtime-target.ts'

async function bounded(work:Promise<unknown>,milliseconds:number){
 let timer:ReturnType<typeof setTimeout>|undefined
 try{await Promise.race([work,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('agent_plan_workflow_shutdown_incomplete')),milliseconds)})])}finally{if(timer)clearTimeout(timer)}
}
function adapter(pool:PgPool,scope:{knowledgeSharing:boolean;knowledgeTools:boolean}):SqlPool{
 return {knowledgeSharing:scope.knowledgeSharing,knowledgeToolRuntime:scope.knowledgeTools,knowledgeQueryRuntime:scope.knowledgeTools,
 async connect():Promise<SqlClient>{const db=await pool.connect();return {async query<Row>(sql:string,params:unknown[]=[]){return {rows:(await db.query(sql,params)).rows as Row[]}},release(){db.release()}}}}
}
export async function startAgentPlanWorkflowService(kind:AgentPlanWorkflowServiceKind,mode:'preflight'|'serve'='preflight',env:NodeJS.ProcessEnv=process.env){
 // Selection precedes every credential read, pg import, pool and listener.
 const cfg=agentPlanWorkflowServiceConfig(env,kind,mode),buffers:Buffer[]=[],pools:PgPool[]=[]
 let encryptionKey:Buffer|undefined,shutdown:(()=>Promise<void>)|undefined,dispose:(()=>void)|undefined
 const read=(name:string)=>{const bytes=readAgentPlanWorkflowCredential(cfg,name);buffers.push(bytes);return bytes}
 const clear=()=>{dispose?.();encryptionKey?.fill(0);for(const bytes of buffers)bytes.fill(0)}
 const endPools=async()=>{const results=await Promise.allSettled(pools.map(pool=>pool.end()));if(results.some(r=>r.status==='rejected'))throw Error('agent_plan_workflow_pool_shutdown_incomplete')}
 try{
  const passwordNames=kind==='worker'?['worker.secret']:['api.secret','dispatch.secret','broker.secret'],passwords=passwordNames.map(name=>agentPlanWorkflowDatabasePassword(read(name)))
  if(new Set(passwords).size!==passwords.length)throw Error('unsafe_agent_plan_workflow_credential')
  if(kind==='broker')inspectAgentPlanWorkflowCredential(cfg,'model-encryption.secret')
  const ca=read('plan-workflow-ca.pem'),cert=read(kind==='worker'?'plan-workflow-worker.pem':'plan-workflow-server.pem'),key=read(kind==='worker'?'plan-workflow-worker.key':'plan-workflow-server.key')
  assertAgentPlanWorkflowServiceTls(cfg,ca,cert,key)
  const {Pool}=await import('pg')
  const connect=(user:string,password:string)=>{const pool=new Pool({host:cfg.target.host,port:cfg.target.port,database:cfg.target.database,user,password,max:3,connectionTimeoutMillis:4000,idleTimeoutMillis:10000,statement_timeout:8000,...(mode==='preflight'?{options:'-c default_transaction_read_only=on'}:{})});pool.on('error',()=>{});pools.push(pool);return adapter(pool,cfg)}
  const dedicatedLogin=kind==='worker'?cfg.workerLogin:cfg.dispatchLogin,dedicated=connect(dedicatedLogin,passwords[kind==='worker'?0:1]!)
  await verifyPgRuntimeTarget(dedicated,{...cfg.target,user:dedicatedLogin})
  await inspectAgentPlanWorkflowServicePool(dedicated,kind==='worker'?'agentstudio_plan_workflow_worker':'agentstudio_plan_workflow_dispatch')
  let business:SqlPool|undefined,secret:SqlPool|undefined
  if(kind==='broker'){
   business=connect('agentstudio_stage_login',passwords[0]!);secret=connect('agentstudio_model_broker_login',passwords[2]!)
   await verifyPgRuntimeTarget(business,cfg.target);await verifyPgRuntimeTarget(secret,{...cfg.target,user:'agentstudio_model_broker_login'})
   await inspectAgentPlanWorkflowServicePool(business,'agentstudio_api');await inspectAgentPlanWorkflowServicePool(secret,'agentstudio_model_broker')
  }
  if(mode==='preflight'){
   await bounded(endPools(),5000);clear()
   return {mode,service:kind,ready:true,verified_roles:kind==='worker'?1:3,read_only:true,tls_material_verified:true,encryption_key_loaded:false,port_opened:false,worker_started:false,external_model_calls:false,production_cutover_allowed:false}
  }
  const activation={executionEnabled:true,executionApproval:agentPlanWorkflowExecutionApproval}
  if(kind==='worker'){
   const runtime=await createAgentPlanWorkflowWorkerRuntime({...activation,workerPool:dedicated,workerId:randomUUID(),reviewedOrigin:cfg.origin,reviewedServerFingerprint256:cfg.serverFingerprint,ca,cert,key})
   dispose=runtime.close
   let stopping=false,closing:Promise<void>|undefined;const pause=new AbortController()
   const loop=(async()=>{while(!stopping){try{await runtime.worker.tick()}catch{process.stderr.write('AGENT_PLAN_WORKFLOW_TICK_UNAVAILABLE\n')}if(!stopping)await delay(750,undefined,{signal:pause.signal}).catch(()=>undefined)}})()
   shutdown=()=>{stopping=true;runtime.closeNewClaims();pause.abort();return closing??(closing=(async()=>{try{await bounded(loop,55000)}finally{runtime.close();try{await bounded(endPools(),5000)}finally{clear()}}})())}
   return {mode,service:kind,ready:true,worker_started:true,execution_enabled:true,production_cutover_allowed:false,close:shutdown}
  }
  const [{parseModelEncryptionKey},{createServer}]=await Promise.all([import('./model-connection-crypto.ts'),import('node:https')])
  encryptionKey=parseModelEncryptionKey(read('model-encryption.secret').toString('utf8'))
  if(passwords.includes(encryptionKey.toString('hex')))throw Error('unsafe_agent_plan_workflow_credential')
  const runtime=await createAgentPlanWorkflowBrokerRuntime({...activation,businessPool:business!,dispatchPool:dedicated,secretPool:secret!,key:encryptionKey,reviewedClientFingerprint256:cfg.clientFingerprint})
  dispose=runtime.close
  let closing:Promise<void>|undefined,closingAdmission=false
  const handlers=new Set<Promise<unknown>>(),sockets=new Set<Duplex>()
  const server=createServer({ca,cert,key,requestCert:true,rejectUnauthorized:true,minVersion:'TLSv1.2'},(req,res)=>{
   if(closingAdmission){res.writeHead(503,{'Content-Type':'application/json',Connection:'close'});res.end(JSON.stringify({error:'agent_plan_workflow_service_closing'}));return}
   const work=runtime.handler(req,res);handlers.add(work);void work.catch(()=>res.destroy()).finally(()=>handlers.delete(work))
  })
  server.on('connection',socket=>{if(closingAdmission){socket.destroy();return}sockets.add(socket);socket.once('close',()=>sockets.delete(socket))})
  server.requestTimeout=60000;server.headersTimeout=12000;server.keepAliveTimeout=1000;server.maxRequestsPerSocket=1
  shutdown=()=>closing??(closing=(async()=>{
   closingAdmission=true;runtime.closeNewDispatches()
   const closed=server.listening?new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve())):Promise.resolve()
   try{await bounded(Promise.all([closed,runtime.drain(),(async()=>{while(handlers.size)await Promise.allSettled([...handlers])})()]),55000)}
   finally{server.closeAllConnections();for(const socket of sockets)socket.destroy();runtime.close();try{await bounded(endPools(),5000)}finally{clear()}}
  })())
  await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(cfg.port,'127.0.0.1',resolve)})
  return {mode,service:kind,ready:true,bind:'127.0.0.1',port:cfg.port,requires_mutual_tls:true,execution_enabled:true,production_cutover_allowed:false,close:shutdown}
 }catch(error){if(shutdown)await shutdown().catch(()=>undefined);else{clear();await bounded(endPools(),5000).catch(()=>undefined)}throw error}
}
export function attachAgentPlanWorkflowShutdown(close:()=>Promise<void>){
 let stopping=false
 const stop=()=>{if(stopping)return;stopping=true;const deadline=setTimeout(()=>process.exit(1),65000)
  void Promise.resolve().then(close).then(()=>{clearTimeout(deadline);process.off('SIGTERM',stop);process.off('SIGINT',stop)},()=>{clearTimeout(deadline);process.stderr.write('AGENT_PLAN_WORKFLOW_SHUTDOWN_INCOMPLETE\n');process.exit(1)})
 }
 process.on('SIGTERM',stop);process.on('SIGINT',stop)
}
export async function runAgentPlanWorkflowServiceCli(args:string[],env:NodeJS.ProcessEnv=process.env){
 const selected=parseAgentPlanWorkflowServiceArgs(args)
 if(selected.mode==='plan'||selected.mode==='help'){process.stdout.write(JSON.stringify(selected.mode==='plan'?agentPlanWorkflowServiceOfflinePlan():agentPlanWorkflowServiceHelp())+'\n');return}
 if(!('kind' in selected))throw Error('agent_plan_workflow_explicit_mode_required')
 const {close,...report}=await startAgentPlanWorkflowService(selected.kind,selected.mode,env)
 process.stdout.write(JSON.stringify(report)+'\n');if(close)attachAgentPlanWorkflowShutdown(close)
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))void runAgentPlanWorkflowServiceCli(process.argv.slice(2)).catch(()=>{process.stderr.write('AGENT_PLAN_WORKFLOW_SERVICE_REFUSED\n');process.exitCode=1})
