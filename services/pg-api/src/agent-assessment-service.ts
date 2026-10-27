#!/usr/bin/env node
// Explicit standalone review service only. No default/NativeServer wiring.
// Plan/help are offline. Preflight never constructs Worker/Broker/executor.
import path from "node:path"
import {fileURLToPath} from "node:url"
import {randomUUID} from "node:crypto"
import {setTimeout as delay} from "node:timers/promises"
import type {Pool as PgPool} from "pg"
import type {IncomingMessage,ServerResponse} from "node:http"
import type {Duplex} from "node:stream"
import type {SqlPool,SqlClient} from "./contracts.ts"
import type {PgRuntimeTarget} from "./pg-runtime-target.ts"
import type {AgentAssessmentProof,AgentAssessmentReply} from "./agent-assessment-contract.ts"
import {agentAssessmentServiceConfig,parseAgentAssessmentServiceArgs,agentAssessmentServiceOfflinePlan,agentAssessmentServiceHelp,readAgentAssessmentCredential,inspectAgentAssessmentCredential,agentAssessmentDatabasePassword,assertAgentAssessmentServiceTls,type AgentAssessmentServiceKind} from "./agent-assessment-service-config.ts"

function adapter(pool:PgPool,scope?:{knowledgeSharing:boolean;knowledgeTools:boolean}):SqlPool{
  return {knowledgeSharing:scope?.knowledgeSharing===true,knowledgeEmbeddingSettings:scope?.knowledgeTools===true,knowledgeEmbeddingConsent:scope?.knowledgeTools===true,knowledgeQueryRuntime:scope?.knowledgeTools===true,knowledgeToolRuntime:scope?.knowledgeTools===true,
    async connect():Promise<SqlClient>{const db=await pool.connect();return {async query<Row>(sql:string,params:unknown[]=[]){return {rows:(await db.query(sql,params)).rows as Row[]}},release(){db.release()}}}}
}
export async function inspectAgentAssessmentOperatorPool(pool:SqlPool,target:PgRuntimeTarget,kind:"worker"|"dispatch"):Promise<void>{
  if(kind!=="worker"&&kind!=="dispatch")throw Error("agent_assessment_preflight_refused")
  const [{verifyPgRuntimeTarget},{assertAgentAssessmentSession},{verifyAgentAssessmentCredentials}]=await Promise.all([import("./pg-runtime-target.ts"),import("./agent-assessment-role.ts"),import("./agent-assessment-audit.ts")])
  await verifyPgRuntimeTarget(pool,target)
  const db=await pool.connect();let begun=false
  const role=kind==="worker"?"agentstudio_review_worker":"agentstudio_review_dispatch"
  try{
    await db.query("BEGIN READ ONLY");begun=true
    await db.query("SET LOCAL lock_timeout='3s'");await db.query("SET LOCAL statement_timeout='8s'")
    await assertAgentAssessmentSession(db,role);await db.query("SET LOCAL ROLE "+role)
    if((await db.query<{role:string}>("SELECT current_user AS role")).rows[0]?.role!==role||!await verifyAgentAssessmentCredentials(db))throw Error("agent_assessment_preflight_refused")
  }finally{try{if(begun)await db.query("ROLLBACK")}finally{db.release()}}
}
async function inspectApiSchema(pool:SqlPool):Promise<void>{
  const {verifyAgentAssessmentCredentials}=await import("./agent-assessment-audit.ts"),db=await pool.connect();let begun=false
  try{await db.query("BEGIN READ ONLY");begun=true;await db.query("SET LOCAL ROLE agentstudio_api");if(!await verifyAgentAssessmentCredentials(db))throw Error("agent_assessment_preflight_refused")}
  finally{try{if(begun)await db.query("ROLLBACK")}finally{db.release()}}
}
async function bounded(work:Promise<unknown>,milliseconds:number):Promise<void>{
  let timer:ReturnType<typeof setTimeout>|undefined
  try{await Promise.race([work,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error("agent_assessment_shutdown_timeout")),milliseconds)})])}finally{if(timer)clearTimeout(timer)}
}
// Two separate admission checks are needed: an accepted keepalive request can
// arrive after close starts, and an earlier request can still be reading its
// body when close starts. Dispatches already admitted retain their own fence.
type DrainServer={readonly listening:boolean;close(callback:(error?:Error)=>void):unknown;closeAllConnections():void}
export function createAgentAssessmentServiceAdmission(dispatch:(proof:AgentAssessmentProof)=>Promise<AgentAssessmentReply>,wait:typeof bounded=bounded){
  let closing=false
  const handlers=new Set<Promise<unknown>>(),dispatches=new Set<Promise<unknown>>(),sockets=new Set<Duplex>()
  let socketsClosed:undefined|(()=>void)
  const track=<T>(work:Promise<T>,set:Set<Promise<unknown>>)=>{set.add(work);void work.then(()=>set.delete(work),()=>set.delete(work));return work}
  const refuse=(res:ServerResponse)=>{res.writeHead(503,{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store",Connection:"close"});res.end(JSON.stringify({error:"agent_assessment_service_closing"}))}
  let drain:Promise<void>|undefined
  return {
    close(){closing=true},
    dispatch(proof:AgentAssessmentProof):Promise<AgentAssessmentReply>{
      if(closing)return Promise.reject(Error("agent_assessment_service_closing"))
      return track(Promise.resolve().then(()=>{if(closing)throw Error("agent_assessment_service_closing");return dispatch(proof)}),dispatches)
    },
    handler(handle:(req:IncomingMessage,res:ServerResponse)=>Promise<void>){return (req:IncomingMessage,res:ServerResponse):Promise<void>=>{
      if(closing){refuse(res);return Promise.resolve()}
      return track(Promise.resolve().then(()=>{if(closing){refuse(res);return}return handle(req,res)}),handlers)
    }},
    trackSocket(socket:Duplex){
      // HTTPS 'connection' fires for the raw TCP socket before TLS succeeds.
      // closeAllConnections alone cannot cover pending TLS handshakes.
      if(closing){socket.destroy();return}
      sockets.add(socket);socket.once("close",()=>{sockets.delete(socket);if(!sockets.size)socketsClosed?.()})
    },
    drain(server:DrainServer):Promise<void>{
      closing=true
      return drain??(drain=(async()=>{
        const closed=server.listening?new Promise<void>((resolve,reject)=>{server.close(error=>error?reject(error):resolve())}):Promise.resolve()
        const application=(async()=>{while(handlers.size||dispatches.size)await Promise.allSettled([...handlers,...dispatches])})()
        const connections=sockets.size?new Promise<void>(resolve=>{socketsClosed=resolve}):Promise.resolve()
        // One55s budget for sockets AND application work, even after the
        // Worker disconnected. Pools/owned buffers remain available until
        // this drain completes or reaches its original advertised deadline.
        try{await wait(Promise.allSettled([closed,application,connections]).then(results=>{if(results.some(result=>result.status==="rejected"))throw Error("agent_assessment_drain_failed")}),55000)}
        catch{try{server.closeAllConnections()}catch{};for(const socket of [...sockets])try{socket.destroy()}catch{};throw Error("agent_assessment_shutdown_timeout")}
      })())
    },
  }
}
export async function startAgentAssessmentService(kind:AgentAssessmentServiceKind,mode:"preflight"|"serve"="preflight",env:NodeJS.ProcessEnv=process.env){
  // This must precede every file read, pg import, Pool and listener creation.
  const cfg=agentAssessmentServiceConfig(env,kind,mode),buffers:Buffer[]=[]
  const read=(name:string)=>{const bytes=readAgentAssessmentCredential(cfg,name);buffers.push(bytes);return bytes}
  let encryptionKey:Buffer|undefined
  let closeClient:undefined|(()=>void)
  const pools:PgPool[]=[];let shutdown:undefined|(()=>Promise<void>)
  const endPools=async()=>{const results=await Promise.allSettled(pools.map(pool=>pool.end()));if(results.some(result=>result.status==="rejected"))throw Error("agent_assessment_pool_shutdown_failed")}
  const clear=()=>{closeClient?.();for(const bytes of buffers)bytes.fill(0);encryptionKey?.fill(0)}
  try{
    const passwordNames=kind==="worker"?["worker.secret"]:["api.secret","dispatch.secret","broker.secret"],passwords=passwordNames.map(name=>agentAssessmentDatabasePassword(read(name)))
    if(new Set(passwords).size!==passwords.length)throw Error("unsafe_agent_assessment_credential")
    // Preflight checks encryption-key metadata only, never decrypts a model
    // credential or loads the model encryption key into executable Broker.
    if(kind==="broker")inspectAgentAssessmentCredential(cfg,"model-encryption.secret")
    const ca=read("review-ca.pem"),cert=read(kind==="worker"?"review-worker.pem":"review-server.pem"),tlsKey=read(kind==="worker"?"review-worker.key":"review-server.key")
    assertAgentAssessmentServiceTls(cfg,ca,cert,tlsKey)
    const {Pool}=await import("pg")
    const connect=(user:string,password:string)=>{const pool=new Pool({host:cfg.target.host,port:cfg.target.port,database:cfg.target.database,user,password,max:3,connectionTimeoutMillis:4000,idleTimeoutMillis:10000,statement_timeout:8000,...(mode==="preflight"?{options:"-c default_transaction_read_only=on"}:{})});pool.on("error",()=>{});pools.push(pool);return adapter(pool,kind==="broker"?cfg:undefined)}
    const dedicated=connect(kind==="worker"?cfg.workerLogin:cfg.dispatchLogin,passwords[kind==="worker"?0:1]!)
    await inspectAgentAssessmentOperatorPool(dedicated,{...cfg.target,user:kind==="worker"?cfg.workerLogin:cfg.dispatchLogin},kind==="worker"?"worker":"dispatch")
    let business:SqlPool|undefined,secret:SqlPool|undefined
    if(kind==="broker"){
      business=connect("agentstudio_stage_login",passwords[0]!);secret=connect("agentstudio_model_broker_login",passwords[2]!)
      const {verifyBoundDispatchRole}=await import("./bound-dispatch-role-preflight.ts")
      await verifyBoundDispatchRole(business,cfg.target,"api");await verifyBoundDispatchRole(secret,cfg.target,"broker");await inspectApiSchema(business)
    }
    if(mode==="preflight"){
      await bounded(endPools(),10000);clear()
      return {mode,service:kind,ready:true,read_only:true,verified_roles:kind==="worker"?1:3,tls_material_verified:true,encryption_key_loaded:false,db_writes_performed:false,port_opened:false,worker_started:false,external_model_calls:false,production_cutover_allowed:false}
    }
    const {agentAssessmentApproval}=await import("./agent-assessment-contract.ts"),activation={executionEnabled:true,executionApproval:agentAssessmentApproval}
    if(kind==="worker"){
      const [{AgentAssessmentWorker},{createAgentAssessmentMutualTlsClient}]=await Promise.all([import("./agent-assessment-worker.ts"),import("./agent-assessment-client.ts")])
      const client=createAgentAssessmentMutualTlsClient({...activation,origin:cfg.origin,reviewedServerFingerprint256:cfg.serverFingerprint,ca,cert,key:tlsKey})
      closeClient=client.close
      const worker=new AgentAssessmentWorker(dedicated,randomUUID(),client,activation)
      let stopping=false;const stopDelay=new AbortController()
      const loop=(async()=>{while(!stopping){let wait=1500;try{const result=await worker.tick();wait=result.state==="idle"?750:100;if(result.state!=="idle")process.stdout.write(JSON.stringify({service:"agent-assessment-worker",state:result.state})+"\n")}catch{process.stderr.write("AGENT_ASSESSMENT_WORKER_TICK_UNAVAILABLE\n")}if(!stopping)await delay(wait,undefined,{signal:stopDelay.signal}).catch(()=>undefined)}})()
      let closing:Promise<void>|undefined
      shutdown=()=>closing??(closing=(async()=>{stopping=true;stopDelay.abort();try{await bounded(loop,55000)}finally{closeClient?.();try{await bounded(endPools(),5000)}finally{clear()}}})())
      return {mode,service:kind,ready:true,worker_started:true,execution_enabled:true,production_cutover_allowed:false,close:shutdown}
    }
    const [{parseModelEncryptionKey},{AgentAssessmentBroker},{createAgentAssessmentInternalHandler},{createServer}]=await Promise.all([import("./model-connection-crypto.ts"),import("./agent-assessment-broker.ts"),import("./agent-assessment-client.ts"),import("node:https")])
    encryptionKey=parseModelEncryptionKey(read("model-encryption.secret").toString("utf8"))
    if(passwords.includes(encryptionKey.toString("hex")))throw Error("unsafe_agent_assessment_credential")
    const broker=new AgentAssessmentBroker(business!,dedicated,secret!,encryptionKey,activation),admission=createAgentAssessmentServiceAdmission(proof=>broker.dispatch(proof))
    const handler=admission.handler(createAgentAssessmentInternalHandler({...activation,reviewedClientFingerprint256:cfg.clientFingerprint,dispatch:proof=>admission.dispatch(proof)}))
    const server=createServer({ca,cert,key:tlsKey,requestCert:true,rejectUnauthorized:true,minVersion:"TLSv1.2"},(req,res)=>{void handler(req,res).catch(()=>res.destroy())})
    server.on("connection",socket=>admission.trackSocket(socket))
    server.requestTimeout=60000;server.headersTimeout=12000;server.keepAliveTimeout=1000;server.maxRequestsPerSocket=1
    let closing:Promise<void>|undefined
    shutdown=()=>closing??(closing=(async()=>{admission.close();try{await admission.drain(server)}finally{try{await bounded(endPools(),5000)}finally{clear()}}})())
    await new Promise<void>((resolve,reject)=>{server.once("error",reject);server.listen(cfg.port,"127.0.0.1",resolve)})
    return {mode,service:kind,ready:true,bind:"127.0.0.1",port:cfg.port,requires_mutual_tls:true,execution_enabled:true,production_cutover_allowed:false,close:shutdown}
  }catch(error){if(shutdown)await shutdown().catch(()=>undefined);else{await bounded(endPools(),5000).catch(()=>undefined);clear()}throw error}
}
export async function runAgentAssessmentServiceCli(args:string[],env:NodeJS.ProcessEnv=process.env):Promise<void>{
  const selected=parseAgentAssessmentServiceArgs(args)
  if(selected.mode==="plan"){process.stdout.write(JSON.stringify(agentAssessmentServiceOfflinePlan())+"\n");return}
  if(selected.mode==="help"){process.stdout.write(JSON.stringify(agentAssessmentServiceHelp())+"\n");return}
  if(!("kind" in selected))throw Error("agent_assessment_explicit_mode_required")
  const result=await startAgentAssessmentService(selected.kind,selected.mode,env),{close,...report}=result
  process.stdout.write(JSON.stringify(report)+"\n")
  if(close){let stopping=false;const stop=()=>{if(stopping)return;stopping=true;const deadline=setTimeout(()=>process.exit(1),65000);void close().then(()=>clearTimeout(deadline)).catch(()=>{process.stderr.write("AGENT_ASSESSMENT_SHUTDOWN_INCOMPLETE\n");process.exit(1)})};process.once("SIGTERM",stop);process.once("SIGINT",stop)}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))void runAgentAssessmentServiceCli(process.argv.slice(2)).catch(()=>{process.stderr.write("AGENT_ASSESSMENT_SERVICE_REFUSED\n");process.exitCode=1})
