#!/usr/bin/env node
// Separate fixed Review LOGIN provisioner. It never starts a Worker/Broker,
// writes an old receipt, enrolls an employee or extends the original C actions.
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {parseComplete069ReviewWorkerArguments,complete069ReviewWorkerPlan,complete069ReviewWorkerRefusal,complete069ReviewWorkerAbi as abi} from './pg18-complete-review-worker-plan.mjs'
const here=fileURLToPath(import.meta.url),prefix='AGENT_STUDIO_DESCRIPTIVE_PATCH_060_',fail=code=>{throw Error('complete069_review_worker_'+code)}
function host(env,write){
 if(env!==process.env||process.platform!=='linux'||process.getuid?.()!==0||process.getgid?.()!==0||process.versions.node.split('.')[0]!=='24'||process.execArgv.some(v=>v!=='--experimental-strip-types'))fail('host_refused')
 for(const[key,d]of Object.entries(Object.getOwnPropertyDescriptors(env)))if(!('value'in d)||key==='DATABASE_URL'||/^PG|^NODE_PG_|^LD_|^DYLD_|^DOCKER_/.test(key)||['NODE_OPTIONS','NODE_PATH','NODE_COMPILE_CACHE','NODE_V8_COVERAGE','NODE_EXTRA_CA_CERTS','NODE_TLS_REJECT_UNAUTHORIZED','SSL_CERT_FILE','SSL_CERT_DIR','OPENSSL_CONF','OPENSSL_MODULES','HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','http_proxy','https_proxy','all_proxy'].includes(key)&&d.value)fail('ambient_configuration_refused')
 if(env.AGENT_STUDIO_COMPLETE_REVIEW_WORKER_ENABLED!=='true'||env.AGENT_STUDIO_BAOTA_PG_HOST!=='127.0.0.1'||env.AGENT_STUDIO_BAOTA_PG_PORT!=='5333'||env.AGENT_STUDIO_BAOTA_PG_DATABASE!=='agent_studio'||env.AGENT_STUDIO_BAOTA_PG_ADMIN_USER!=='postgres')fail('target_refused')
 if(write&&env.AGENT_STUDIO_COMPLETE_REVIEW_WORKER_WRITE_APPROVED!=='PREPARE_COMPLETE069_FIXED_REVIEW_WORKER_ONLY')fail('write_not_approved')
 if(env[prefix+'RUNTIME_LOCK_SHA256']!=='eb56da11d2713724419f938ef874991fd50fc082dda09837b779ee5841a21c6a')fail('runtime_required')
}
export async function runComplete069ReviewWorker(argv,env=process.env){
 const cfg=parseComplete069ReviewWorkerArguments(argv)
 if(cfg.mode==='plan')return complete069ReviewWorkerPlan()
 host(env,cfg.mode==='prepare')
 const [source,runtime,fs,{createHash},secretModule,journal]=await Promise.all([import('./pg18-complete-profile-source.mjs'),import('./pg18-complete-operator-runtime.mjs'),import('node:fs'),import('node:crypto'),import('./native-activation-cli.mjs'),import('./pg18-complete-review-worker-journal.mjs')])
 const snapshot=await source.captureCompleteProfileSources();source.assertCompleteProfileDeployment(snapshot,cfg.sourceSha256)
 const cap=runtime.verifyCompleteProfileOperatorRuntime(snapshot,cfg.sourceSha256,{manifestFile:env[prefix+'RUNTIME_MANIFEST_FILE'],manifestSha256:env[prefix+'RUNTIME_MANIFEST_SHA256'],lockSha256:env[prefix+'RUNTIME_LOCK_SHA256']}),{Pool}=runtime.loadCompleteProfileOperatorPg(cap)
 const core=await import('./pg18-complete-review-worker-core.mjs'),original=await import('./pg18-complete-service-core.mjs'),profile=await import('./pg18-complete-profile.ts'),scram=await import('./pg18-service-login-secrets.mjs')
 const credential=file=>{const x=secretModule.readPg18OperatorSecret(file),s=fs.lstatSync(x.real);if(s.nlink!==1||s.uid!==0||s.gid!==0||![0o400,0o600].includes(s.mode&0o7777))fail('private_secret_required');return x}
 const adminSecret=credential(env.AGENT_STUDIO_BAOTA_PG_ADMIN_PASSWORD_FILE),apiSecret=credential(env.AGENT_STUDIO_BAOTA_PG_API_PASSWORD_FILE),reviewSecret=credential(env.AGENT_STUDIO_COMPLETE_REVIEW_WORKER_PASSWORD_FILE),secrets=[adminSecret,apiSecret,reviewSecret]
 if(new Set(secrets.map(v=>v.password)).size!==3||new Set(secrets.map(v=>v.device+':'+v.inode)).size!==3)fail('independent_secret_required')
 scram.validateServiceLoginPassword(reviewSecret.password)
 const boundary=()=>{host(env,cfg.mode==='prepare');source.assertCompleteProfileDeployment(snapshot,cfg.sourceSha256);runtime.assertCompleteProfileOperatorRuntime(cap);for(const x of secrets){const now=credential(x.real);if(now.device!==x.device||now.inode!==x.inode||now.password!==x.password)fail('secret_changed')}}
 const options=(user,password)=>({host:'127.0.0.1',port:5333,database:'agent_studio',user,password,ssl:false,options:'',max:user==='postgres'?4:1,connectionTimeoutMillis:5000,statement_timeout:45000,query_timeout:50000,idleTimeoutMillis:1000,application_name:'agentstudio-complete069-review-prepare'})
 const admin=new Pool(options('postgres',adminSecret.password)),api=new Pool(options('agentstudio_stage_login',apiSecret.password)),dedicated=new Pool(options(abi.login,reviewSecret.password))
 for(const p of [admin,api,dedicated])p.on('error',()=>{})
 const evidence={commit_acknowledged:false,actual_login_verified:false,actual_api_catalog_verified:false,migration_ledger_unchanged:false,refusal_code:null}
 let lock,intent,locked=false
 try{
  boundary();lock=await admin.connect();await original.completeServiceTarget(lock,cfg.target)
  if((await lock.query('SELECT pg_try_advisory_lock(61824,20261029) AND pg_try_advisory_lock(61824,20261030) AS locked')).rows[0]?.locked!==true)fail('preparation_lock_busy')
  locked=true
  if(cfg.mode==='inspect-operation'){
   intent=journal.readComplete069ReviewWorkerOperation(env.AGENT_STUDIO_COMPLETE_REVIEW_WORKER_JOURNAL_DIR,cfg)
   const observed=await core.inspectComplete069ReviewWorker(admin,api,dedicated,snapshot,cfg,intent)
   boundary();return {format:'complete069_review_worker_observation_v1',profile:'complete069',login:abi.login,group:abi.group,operation_id:cfg.operationId,source_sha256:cfg.sourceSha256,target:cfg.target,...observed,prior_commit_acknowledged:false,automatic_retry_authorized:false,writes_performed:false,services_started:false,runtime_authorization:false,production_cutover_allowed:false}
  }
  const before=await core.complete069ReviewWorkerPreflight(admin,api,snapshot,cfg)
  const other=(await lock.query("SELECT rolpassword AS verifier FROM pg_authid WHERE rolname LIKE 'agentstudio_%' AND rolpassword IS NOT NULL")).rows
  if(other.some(r=>scram.matchesServiceScram(reviewSecret.password,r.verifier)))fail('secret_reused')
  const verifier=scram.serviceLoginVerifier(reviewSecret.password)
  try{
   evidence.commit_acknowledged=await core.prepareComplete069ReviewWorker(admin,api,snapshot,cfg,verifier,before,(digest,baseline)=>{boundary();intent=journal.startComplete069ReviewWorkerOperation(env.AGENT_STUDIO_COMPLETE_REVIEW_WORKER_JOURNAL_DIR,cfg,digest,baseline)})
   boundary();const state=await core.complete069ReviewWorkerState(lock,before.baseline)
   if(state.verifier!==verifier)fail('verifier_changed')
   evidence.actual_login_verified=await core.verifyComplete069ReviewWorkerLogin(dedicated)
   evidence.actual_api_catalog_verified=(await profile.verifyCompleteProfile(admin,api,snapshot,cfg.sourceSha256)).full_catalog_audit_verified===true
   evidence.migration_ledger_unchanged=await original.completeServiceLedger(lock)===before.ledger
   if(!evidence.actual_api_catalog_verified||!evidence.migration_ledger_unchanged)fail('postflight_refused')
   boundary()
  }catch(error){evidence.refusal_code=complete069ReviewWorkerRefusal(error);if(!intent)throw error}
  journal.finishComplete069ReviewWorkerOperation(env.AGENT_STUDIO_COMPLETE_REVIEW_WORKER_JOURNAL_DIR,cfg,evidence)
  const verified=evidence.commit_acknowledged&&evidence.actual_login_verified&&evidence.actual_api_catalog_verified&&evidence.migration_ledger_unchanged&&evidence.refusal_code===null
  return {format:'complete069_review_worker_preparation_v1',profile:'complete069',login:abi.login,group:abi.group,operation_id:cfg.operationId,source_sha256:cfg.sourceSha256,target:cfg.target,...evidence,verified,commit_unknown:!evidence.commit_acknowledged,read_only_confirmation_required:!verified,automatic_retry_authorized:false,services_started:false,runtime_authorization:false,production_cutover_allowed:false}
 }finally{
  if(lock){if(locked)await lock.query('SELECT pg_advisory_unlock(61824,20261030),pg_advisory_unlock(61824,20261029)').catch(()=>{});lock.release(true)}
  for(const p of [dedicated,api,admin])await p.end()
 }
}
if(process.argv[1]&&path.resolve(process.argv[1])===here){try{const r=await runComplete069ReviewWorker(process.argv.slice(2));process.stdout.write(JSON.stringify(r)+'\n');if(r.verified===false)process.exitCode=1}catch(error){process.stderr.write(complete069ReviewWorkerRefusal(error)+'\n');process.exitCode=1}}
