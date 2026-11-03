#!/usr/bin/env node
// Private optional service. Import/default --plan creates no Driver, Pool,
// listener, Worker or provider request. Never mount on the public Native port.
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {createServer} from 'node:https'
import {X509Certificate,timingSafeEqual} from 'node:crypto'
import type {Pool as PgPool} from 'pg'
import type {SqlClient,SqlPool} from './contracts.ts'
import {readSkillAbCredential} from './original-skill-ab-credentials.ts'
import {selectSkillAbNative} from './original-skill-ab-native-runtime.ts'
import {skillAbExecutionApproval} from './original-skill-ab-provider.ts'
import {prepareOriginalRoleUiPool} from './original-role-ui-policy.ts'
import {prepareSkillAbPool} from './original-skill-ab-runtime.ts'
import {verifyBoundDispatchPrivileges} from './bound-dispatch-role-preflight.ts'
import {assertBoundDispatchTlsMaterial} from './bound-tls-material.ts'
import {boundCertificateFingerprint} from './bound-worker-mtls.ts'
import {parseModelEncryptionKey} from './model-connection-crypto.ts'
import {OriginalSkillAbBroker} from './original-skill-ab-broker.ts'
import {createSkillAbInternalHandler} from './original-skill-ab-client.ts'
const origin='https://127.0.0.1:7461'
function deny():never{throw Error('original_skill_ab_service_not_approved')}
function password(bytes:Buffer){let value:string;try{value=new TextDecoder('utf8',{fatal:true}).decode(bytes).replace(/\r?\n$/,'')}catch{deny()};if(value.length<16||value.length>512||/[\u0000-\u001f\u007f]/.test(value))deny();return value}
function adapter(pool:PgPool):SqlPool{return {async connect():Promise<SqlClient>{const db=await pool.connect();return {async query<Row>(sql:string,values:unknown[]=[]){const r=await db.query(sql,values);return {rows:r.rows as Row[]}},release(destroy?:boolean){db.release(destroy)}}}}}
async function target(pool:SqlPool,login:string){const db=await pool.connect();try{const rows=(await db.query<{db:string;login:string;role:string;host:string;port:number;version:number;primary:boolean}>("SELECT current_database() AS db,session_user AS login,current_user AS role,host(inet_server_addr()) AS host,inet_server_port() AS port,current_setting('server_version_num')::integer AS version,NOT pg_is_in_recovery() AS primary")).rows,r=rows[0];if(rows.length!==1||!r||r.db!=='agent_studio'||r.login!==login||r.role!==login||r.host!=='127.0.0.1'||r.port!==5333||r.version<180000||r.version>=190000||r.primary!==true)deny()}finally{db.release()}}
export async function startOriginalSkillAbService(env=process.env){
 const uid=process.getuid?.(),cap=selectSkillAbNative({env,listen:true,allowedOrigin:origin,configurationWrites:env.AGENT_STUDIO_PG18_CONFIG_WRITE_UAT_ENABLED==='true',uid})
 if(!cap.available||!cap.submissions)deny()
 const buffers:Buffer[]=[];const read=(name:string)=>{const b=readSkillAbCredential('broker',name,env,uid);buffers.push(b);return b}
 let api:PgPool|undefined,dispatch:PgPool|undefined,secret:PgPool|undefined,server:ReturnType<typeof createServer>|undefined,broker:OriginalSkillAbBroker|undefined,key:Buffer|undefined
 try{
  const apiPassword=password(read('api.secret')),dispatchPassword=password(read('dispatch.secret')),secretPassword=password(read('broker.secret'));key=parseModelEncryptionKey(read('model-encryption.secret').toString('utf8'))
  if(new Set([apiPassword,dispatchPassword,secretPassword,key.toString('hex')]).size!==4)deny()
  const ca=read('skill-ab-ca.pem'),cert=read('skill-ab-server.pem'),tlsKey=read('skill-ab-server.key');assertBoundDispatchTlsMaterial(ca,cert,tlsKey)
  const clientPin=boundCertificateFingerprint(env.AGENT_STUDIO_ORIGINAL_SKILL_AB_CLIENT_FINGERPRINT256??''),serverPin=boundCertificateFingerprint(new X509Certificate(cert).fingerprint256);if(timingSafeEqual(clientPin,serverPin))deny()
  const {Pool}=await import('pg'),connect=(user:string,secret:string)=>new Pool({host:'127.0.0.1',port:5333,database:'agent_studio',user,password:secret,max:3,connectionTimeoutMillis:4000,statement_timeout:5000})
  api=connect('agentstudio_stage_login',apiPassword);dispatch=connect('agentstudio_stage_skill_ab_dispatch',dispatchPassword);secret=connect('agentstudio_model_broker_login',secretPassword)
  const business=adapter(api),dispatchPool=adapter(dispatch),secretPool=adapter(secret)
  await Promise.all([target(business,'agentstudio_stage_login'),target(dispatchPool,'agentstudio_stage_skill_ab_dispatch'),target(secretPool,'agentstudio_model_broker_login')])
  await Promise.all([verifyBoundDispatchPrivileges(business,'api'),verifyBoundDispatchPrivileges(secretPool,'broker')])
  await prepareOriginalRoleUiPool(business,env);await prepareSkillAbPool(business,'agentstudio_api');await prepareSkillAbPool(dispatchPool,'agentstudio_skill_ab_dispatch')
  broker=new OriginalSkillAbBroker(business,dispatchPool,secretPool,key,{executionEnabled:true,executionApproval:skillAbExecutionApproval});key.fill(0)
  const handler=createSkillAbInternalHandler({executionEnabled:true,executionApproval:skillAbExecutionApproval,reviewedClientFingerprint256:clientPin.toString('hex'),broker})
  server=createServer({ca,cert,key:tlsKey,requestCert:true,rejectUnauthorized:true,minVersion:'TLSv1.2'},(req,res)=>{void handler(req,res).catch(()=>{if(!res.headersSent)res.writeHead(503,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({error:'original_skill_ab_outcome_unavailable'}))})})
  server.requestTimeout=60000;server.headersTimeout=10000
  await new Promise<void>((resolve,reject)=>{server!.once('error',reject);server!.listen(7461,'127.0.0.1',()=>{server!.removeListener('error',reject);resolve()})})
  // OpenSSL has loaded server material. Erase our credential-file copies.
  for(const b of buffers)b.fill(0)
  let closing:Promise<void>|undefined
  const close=()=>{if(closing)return closing;broker!.close();closing=(async()=>{await new Promise<void>((resolve,reject)=>server!.close(e=>e?reject(e):resolve()));await Promise.allSettled([api!.end(),dispatch!.end(),secret!.end()]);for(const b of buffers)b.fill(0)})();return closing}
  return {server,close}
 }catch{broker?.close();key?.fill(0);if(server?.listening)await new Promise<void>(resolve=>server!.close(()=>resolve()));await Promise.allSettled([api?.end(),dispatch?.end(),secret?.end()]);for(const b of buffers)b.fill(0);throw Error('original_skill_ab_service_start_failed')}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2),mode=args[0]??'--plan'
 if(args.length<=1&&mode==='--plan')process.stdout.write(JSON.stringify({protocol:'original-skill-ab-service-plan.v1',host:'127.0.0.1',port:7461,default_execution:false,requires_new_disposable_schema:true,requires_independent_pools:true,requires_mutual_TLS:true,workers_started:false,production_cutover_allowed:false})+'\n')
 else if(args.length===1&&mode==='--serve'){void startOriginalSkillAbService().then(service=>{const stop=()=>{void service.close().then(()=>{process.exitCode=0},()=>{process.exitCode=1})};process.once('SIGTERM',stop);process.once('SIGINT',stop);process.stdout.write(JSON.stringify({protocol:'original-skill-ab-service.v1',listening:'127.0.0.1:7461',workers_started:false,production_cutover_allowed:false})+'\n')},()=>{process.stderr.write('original_skill_ab_service_start_failed\n');process.exitCode=1})}
 else{process.stderr.write('original_skill_ab_service_mode_refused\n');process.exitCode=1}
}
