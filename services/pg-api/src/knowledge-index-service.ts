#!/usr/bin/env node
// Separate private daemons. Import/--plan never read credentials or use network.
import {createServer} from "node:https"
import {X509Certificate,createPrivateKey} from "node:crypto"
import {fileURLToPath} from "node:url"
import path from "node:path"
import type {Pool as PgPool} from "pg"
import type {SqlPool,SqlClient} from "./contracts.ts"
import {selectPgRuntimeTarget,verifyPgRuntimeTarget} from "./pg-runtime-target.ts"
import {boundCredentialDirectory,readBoundRuntimeCredential} from "./bound-runtime-credentials.ts"
import {boundCertificateFingerprint} from "./bound-worker-mtls.ts"
import {assertBoundDispatchTlsMaterial} from "./bound-tls-material.ts"
import {verifyBoundDispatchRole} from "./bound-dispatch-role-preflight.ts"
import {parseModelEncryptionKey} from "./model-connection-crypto.ts"
import {selectKnowledgeIndexRuntime,scopedKnowledgeIndexPool} from "./knowledge-index-policy.ts"
import {verifyKnowledgeIndexLogin} from "./knowledge-index-privileges.ts"
import {KnowledgeIndexBroker} from "./knowledge-index-broker.ts"
import {KnowledgeIndexWorker} from "./knowledge-index-worker.ts"
import {createKnowledgeIndexPrivateClient,createKnowledgeIndexPrivateHandler} from "./knowledge-index-private-tls.ts"
import {createKnowledgeEmbeddingTransport} from "./knowledge-embedding-transport.ts"
import {embeddingEndpointPolicy} from "./knowledge-embedding-policy.ts"
import {selectKnowledgeQueryRuntime,scopedKnowledgeQueryPool} from "./knowledge-query-policy.ts"
import {KnowledgeQueryBroker} from "./knowledge-query-broker.ts"
import {KnowledgeQueryWorker} from "./knowledge-query-worker.ts"
import {createKnowledgeQueryPrivateClient,createKnowledgeQueryPrivateHandler} from "./knowledge-query-private-tls.ts"
import {verifyKnowledgeQuerySchema} from "./knowledge-query-audit.ts"
import {knowledgeQueryRoute} from "./knowledge-query-contracts.ts"
import {selectKnowledgeToolRuntime,scopedKnowledgeToolPool,verifyKnowledgeToolSchema} from "./knowledge-tool-policy.ts"
import {selectKnowledgeSharing} from "./knowledge-sharing-policy.ts"
import {scopedKnowledgePool} from "./knowledge-scope-policy.ts"
export function knowledgeIndexOfflinePlan(){return {mode:"plan",services:["knowledge-index","knowledge-index-broker"],broker_bind:"127.0.0.1",broker_port:7455,
  requires_mutual_tls:true,independent_database_roles:true,credentials_read:false,network_used:false,provider_calls:false,workers_started:false,production_cutover_allowed:false}}
function refuse():never{throw Error("unsafe_knowledge_index_service_config")}
export function knowledgeIndexServiceConfig(env:NodeJS.ProcessEnv,kind:"worker"|"broker",mode:"preflight"|"serve",platform=process.platform,uid=process.getuid?.()){
  if(!["worker","broker"].includes(kind)||!["preflight","serve"].includes(mode)||platform!=="linux"||!Number.isSafeInteger(uid)||uid===undefined||uid<=0||
    env.AGENT_STUDIO_PG_KNOWLEDGE_INDEX_REVIEWED!=="true")refuse()
  const service=kind==="worker"?"knowledge-index":"knowledge-index-broker",directory=boundCredentialDirectory(service)
  if(env.CREDENTIALS_DIRECTORY!==directory)refuse()
  const target=selectPgRuntimeTarget(env,"api",platform)
  if(target.mode!=="baota_pg18")refuse()
  const approved=selectKnowledgeIndexRuntime(env),queryApproved=selectKnowledgeQueryRuntime(env)
  const knowledgeToolsApproved=selectKnowledgeToolRuntime(env)
  const sharingEnabled=selectKnowledgeSharing(env)
  if(queryApproved&&!sharingEnabled)refuse()
  if(mode==="serve"&&!approved&&!queryApproved)refuse()
  const fingerprint=kind==="worker"?env.AGENT_STUDIO_PG_KNOWLEDGE_INDEX_SERVER_FINGERPRINT:env.AGENT_STUDIO_PG_KNOWLEDGE_INDEX_CLIENT_FINGERPRINT
  try{boundCertificateFingerprint(fingerprint)}catch{refuse()}
  return {kind,mode,service,directory,target,approved,queryApproved,sharingEnabled,...(knowledgeToolsApproved?{knowledgeToolsApproved:true}:{}),fingerprint:fingerprint!,origin:"https://127.0.0.1:7455",port:7455} as const
}
export function assertKnowledgeIndexWorkerTls(ca:Buffer,cert:Buffer,key:Buffer,now=Date.now()):void{
  try{
    const roots=(ca.toString("utf8").match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g)??[]).map(x=>new X509Certificate(x)),leaf=new X509Certificate(cert)
    if(!roots.length||roots.some(x=>!x.ca)||leaf.ca||!leaf.checkPrivateKey(createPrivateKey(key))||!roots.some(x=>leaf.verify(x.publicKey))||
      !leaf.keyUsage?.includes("1.3.6.1.5.5.7.3.2")||[...roots,leaf].some(x=>Date.parse(x.validFrom)>now||Date.parse(x.validTo)<=now))refuse()
  }catch{refuse()}
}
function password(raw:Buffer):string{
  const value=raw.toString("utf8").replace(/[\r\n]+$/g,"")
  if(value.length<32||value.length>512||/[\u0000-\u0020\u007f]/.test(value))refuse()
  return value
}
function adapter(pool:PgPool):SqlPool{return {async connect():Promise<SqlClient>{const db=await pool.connect();let tainted=false;return {async query<Row>(sql:string,args:unknown[]=[]){
  try{const result=await db.query(sql,args);return {rows:result.rows as Row[]}}catch(error){tainted=true;throw error}},release:()=>db.release(tainted?Error("knowledge_connection_discarded"):undefined)}}}}
export async function startKnowledgeIndexService(env=process.env,kind:"worker"|"broker"="worker",mode:"preflight"|"serve"="preflight"){
  const cfg=knowledgeIndexServiceConfig(env,kind,mode),read=(name:string)=>readBoundRuntimeCredential(cfg.service,name,env)
  const {Pool}=await import("pg"),pools:PgPool[]=[],controller=new AbortController()
  let key:Buffer|undefined,server:ReturnType<typeof createServer>|undefined
  const stop=()=>controller.abort()
  const pool=(user:string,secret:Buffer)=>{const value=new Pool({host:cfg.target.host,port:cfg.target.port,database:cfg.target.database,user,password:password(secret),max:2,
    connectionTimeoutMillis:4000,statement_timeout:6000,query_timeout:6500});value.on("error",()=>{});pools.push(value);return value}
  try{
    const user=kind==="worker"?"agentstudio_knowledge_index_worker_login":"agentstudio_knowledge_index_broker_login"
    const sqlSecret=read(kind==="worker"?"worker.secret":"index.secret"),business=adapter(pool(user,sqlSecret))
    await verifyPgRuntimeTarget(business,{...cfg.target,user});await verifyKnowledgeIndexLogin(business,kind)
    if(cfg.queryApproved)await verifyKnowledgeQuerySchema(business,kind)
    if(cfg.knowledgeToolsApproved)await verifyKnowledgeToolSchema(business,kind)
    const ca=read("dispatch-ca.pem"),cert=read(kind==="worker"?"dispatch-worker.pem":"dispatch-server.pem"),tlsKey=read(kind==="worker"?"dispatch-worker.key":"dispatch-server.key")
    let secretPool:SqlPool|undefined
    if(kind==="broker"){
      const brokerSecret=read("broker.secret")
      if(password(brokerSecret)===password(sqlSecret))refuse()
      secretPool=adapter(pool("agentstudio_model_broker_login",brokerSecret))
      await verifyBoundDispatchRole(secretPool,cfg.target,"broker")
      key=parseModelEncryptionKey(read("model-encryption.secret").toString("utf8"))
      if([password(sqlSecret),password(brokerSecret)].includes(key.toString("hex")))refuse()
      assertBoundDispatchTlsMaterial(ca,cert,tlsKey)
    }else{
      assertKnowledgeIndexWorkerTls(ca,cert,tlsKey)
      // Constructing this client validates its isolated origin/pin/material;
      // it performs no dial, including during read-only preflight.
      createKnowledgeIndexPrivateClient({approvedForIsolatedUat:true,origin:cfg.origin,reviewedServerFingerprint256:cfg.fingerprint,ca,cert,key:tlsKey})
    }
    if(mode==="preflight")return {mode,kind,roles_verified:true,credentials_read:true,network_used:true,provider_calls:false,workers_started:false,production_cutover_allowed:false}
    const runtime=scopedKnowledgeToolPool(scopedKnowledgeQueryPool(scopedKnowledgeIndexPool(scopedKnowledgePool(business,cfg.sharingEnabled),cfg.approved),cfg.queryApproved),cfg.knowledgeToolsApproved===true)
    process.once("SIGTERM",stop);process.once("SIGINT",stop)
    if(kind==="worker"){
      const config={approvedForIsolatedUat:true,origin:cfg.origin,reviewedServerFingerprint256:cfg.fingerprint,ca,cert,key:tlsKey}
      const index=cfg.approved?new KnowledgeIndexWorker(runtime,createKnowledgeIndexPrivateClient(config),{approvedForIsolatedUat:true}):null
      const query=cfg.queryApproved?new KnowledgeQueryWorker(runtime,createKnowledgeQueryPrivateClient(config),{approvedForIsolatedUat:true}):null
      while(!controller.signal.aborted){
        let active=false
        for(const worker of [query,index])if(worker&&!controller.signal.aborted)try{const result=await worker.tick(controller.signal);active=active||result.status==="indexed"||result.status==="retrieved"}catch{}
        if(!active&&!controller.signal.aborted)await new Promise<void>(resolve=>{const done=()=>{clearTimeout(timer);controller.signal.removeEventListener("abort",done);resolve()},timer=setTimeout(done,1000)
          controller.signal.addEventListener("abort",done,{once:true});if(controller.signal.aborted)done()})
      }
    }else{
      const transport=createKnowledgeEmbeddingTransport(embeddingEndpointPolicy(env))
      const index=cfg.approved?new KnowledgeIndexBroker(runtime,secretPool!,key!,transport,{approvedForIsolatedUat:true}):null
      const query=cfg.queryApproved?new KnowledgeQueryBroker(runtime,secretPool!,key!,transport,{approvedForIsolatedUat:true}):null
      const indexHandler=index?createKnowledgeIndexPrivateHandler({approvedForIsolatedUat:true,reviewedClientFingerprint256:cfg.fingerprint,dispatch:claim=>index.dispatch(claim)}):null
      const queryHandler=query?createKnowledgeQueryPrivateHandler({approvedForIsolatedUat:true,reviewedClientFingerprint256:cfg.fingerprint,dispatch:claim=>query.dispatch(claim)}):null
      const handler=async(req:Parameters<NonNullable<typeof indexHandler>>[0],res:Parameters<NonNullable<typeof indexHandler>>[1])=>{
        const selected=req.url===knowledgeQueryRoute?queryHandler:indexHandler
        if(selected)return selected(req,res)
        res.writeHead(404,{"Content-Type":"application/json","Cache-Control":"no-store"});res.end(JSON.stringify({error:"knowledge_runtime_route_disabled"}))
      }
      server=createServer({ca,cert,key:tlsKey,requestCert:true,rejectUnauthorized:true,minVersion:"TLSv1.2",maxHeaderSize:8192,handshakeTimeout:5000,connectionsCheckingInterval:1000},(req,res)=>{void handler(req,res).catch(()=>res.destroy())})
      server.headersTimeout=5000;server.requestTimeout=8000;server.keepAliveTimeout=1000;server.maxConnections=4
      server.setTimeout(30000,socket=>socket.destroy())
      await new Promise<void>((resolve,reject)=>{server!.once("error",reject);server!.listen(cfg.port,"127.0.0.1",resolve)})
      await new Promise<void>(resolve=>{controller.signal.addEventListener("abort",()=>resolve(),{once:true});if(controller.signal.aborted)resolve()})
    }
    return {mode:"stopped",kind,production_cutover_allowed:false}
  }finally{
    controller.abort();process.removeListener("SIGTERM",stop);process.removeListener("SIGINT",stop)
    if(server)await new Promise<void>(resolve=>server!.close(()=>resolve()))
    await Promise.allSettled(pools.map(p=>p.end()));key?.fill(0)
  }
}
const invoked=process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)
if(invoked){
  try{
    const args=process.argv.slice(2)
    if(args.length===0||args.length===1&&args[0]==="--plan")console.log(JSON.stringify(knowledgeIndexOfflinePlan()))
    else if(args.length===2&&["--preflight","--serve"].includes(args[0]!)&&["worker","broker"].includes(args[1]!))
      console.log(JSON.stringify(await startKnowledgeIndexService(process.env,args[1] as "worker"|"broker",args[0]==="--serve"?"serve":"preflight")))
    else refuse()
  }catch{console.error("knowledge_index_service_refused");process.exitCode=1}
}
