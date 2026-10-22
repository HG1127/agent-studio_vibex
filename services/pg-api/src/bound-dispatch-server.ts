#!/usr/bin/env node
// Separate, private PG18 Broker. Never mount this handler on Native/8090.
// Import and --plan perform no credential I/O, database access or listening.
import {createServer} from "node:https"
import {createPrivateKey,X509Certificate} from "node:crypto"
import path from "node:path"
import {fileURLToPath} from "node:url"
import type {Pool as PgPool} from "pg"
import type {SqlPool,SqlClient} from "./contracts.ts"
import {selectPgRuntimeTarget} from "./pg-runtime-target.ts"
import {boundCertificateFingerprint} from "./bound-worker-mtls.ts"
import {boundCredentialDirectory,readBoundRuntimeCredential} from "./bound-runtime-credentials.ts"
import {verifyBoundDispatchRole} from "./bound-dispatch-role-preflight.ts"
import {parseModelEncryptionKey} from "./model-connection-crypto.ts"
import {selectBoundGenerationUat,createIsolatedBoundModelExecutor} from "./model-connection-executor.ts"
import {OwnerBoundModelDispatch} from "./owner-model-dispatch.ts"
import {BoundLeaseIdentityRepository,createVerifiedBoundDispatchAdapter} from "./bound-lease-identity.ts"
import {createIsolatedBoundModelInternalHandler} from "./bound-model-internal-handler.ts"

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
  if(mode==="serve")selectBoundGenerationUat(env,true,origin,uid)
  return {target,origin,directory,port:7453 as const,
    workerFingerprint:env.AGENT_STUDIO_PG_BOUND_DISPATCH_CLIENT_FINGERPRINT!}
}
export function assertBoundDispatchTlsMaterial(
  ca:Buffer,cert:Buffer,key:Buffer,now=Date.now(),
):void{
  try{
    const certificates=ca.toString("utf8").match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g)
    if(!certificates?.length)refuse()
    const authorities=certificates.map(pem=>new X509Certificate(pem))
    const server=new X509Certificate(cert)
    for(const item of [...authorities,server]){
      const from=Date.parse(item.validFrom),to=Date.parse(item.validTo)
      if(!Number.isFinite(from)||!Number.isFinite(to)||from>now||to<=now)refuse()
    }
    if(authorities.some(item=>!item.ca)||server.ca||
       !server.checkHost("localhost")||!server.checkIP("127.0.0.1")||
       !server.checkPrivateKey(createPrivateKey(key))||
       !authorities.some(item=>server.verify(item.publicKey))||
       !server.keyUsage?.includes("1.3.6.1.5.5.7.3.1"))refuse()
  }catch{refuse()}
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
  const pools=[api,identities,broker]
  for(const pool of pools)pool.on("error",()=>{})
  let server:ReturnType<typeof createServer>|undefined
  const endPools=async()=>{await Promise.allSettled(pools.map(pool=>pool.end()))}
  try{
    await verifyBoundDispatchRole(adapter(api),cfg.target,"api")
    await verifyBoundDispatchRole(adapter(identities),cfg.target,"identity")
    await verifyBoundDispatchRole(adapter(broker),cfg.target,"broker")
    if(mode==="preflight"){
      await endPools()
      encryptionKey.fill(0)
      return {mode,ready:true,verified_roles:3,tls_material_verified:true,
        writes_performed:false,port_opened:false,external_model_calls:false,
        production_cutover_allowed:false}
    }
    const executor=createIsolatedBoundModelExecutor(env,origin,true)
    const dispatch=new OwnerBoundModelDispatch(adapter(api),encryptionKey,executor,adapter(broker))
    const handler=createIsolatedBoundModelInternalHandler({
      approvedForIsolatedUat:true,reviewedClientFingerprint256:cfg.workerFingerprint,
      dispatch:createVerifiedBoundDispatchAdapter(new BoundLeaseIdentityRepository(adapter(identities)),dispatch),
    })
    server=createServer({key,cert,ca,requestCert:true,rejectUnauthorized:true,minVersion:"TLSv1.2"},
      (req,res)=>{void handler(req,res).catch(()=>res.destroy())})
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
