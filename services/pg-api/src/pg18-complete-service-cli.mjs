#!/usr/bin/env node
// Explicit root-only fresh full069 service preparation. Original protocols
// remain closed; this tool never emits their receipt or starts any service.
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {parseCompleteServiceArguments,completeServiceDefinition,completeServicePlan,completeServiceRefusal} from './pg18-complete-service-plan.mjs'
const here=fileURLToPath(import.meta.url),prefix='AGENT_STUDIO_DESCRIPTIVE_PATCH_060_'
const fail=code=>{throw Error('complete_service_'+code)}
function host(env,write){
 if(env!==process.env||process.platform!=='linux'||process.getuid?.()!==0||process.getgid?.()!==0||process.versions.node.split('.')[0]!=='24'||process.execArgv.some(x=>x!=='--experimental-strip-types'))fail('host_refused')
 for(const [key,d]of Object.entries(Object.getOwnPropertyDescriptors(env)))if(!('value'in d)||key==='DATABASE_URL'||/^PG|^NODE_PG_|^LD_|^DYLD_|^DOCKER_/.test(key)||['NODE_OPTIONS','NODE_PATH','NODE_COMPILE_CACHE','NODE_V8_COVERAGE','NODE_EXTRA_CA_CERTS','NODE_TLS_REJECT_UNAUTHORIZED','SSL_CERT_FILE','SSL_CERT_DIR','OPENSSL_CONF','OPENSSL_MODULES','HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','http_proxy','https_proxy','all_proxy'].includes(key)&&d.value)fail('ambient_configuration_refused')
 if(env.AGENT_STUDIO_COMPLETE_SERVICE_ENABLED!=='true'||env.AGENT_STUDIO_BAOTA_PG_HOST!=='127.0.0.1'||env.AGENT_STUDIO_BAOTA_PG_PORT!=='5333'||env.AGENT_STUDIO_BAOTA_PG_DATABASE!=='agent_studio'||env.AGENT_STUDIO_BAOTA_PG_ADMIN_USER!=='postgres')fail('target_refused')
 if(write&&env.AGENT_STUDIO_COMPLETE_SERVICE_WRITE_APPROVED!=='PREPARE_COMPLETE069_ISOLATED_ACCOUNTS_ONLY')fail('write_not_approved')
 if(env[prefix+'RUNTIME_LOCK_SHA256']!=='eb56da11d2713724419f938ef874991fd50fc082dda09837b779ee5841a21c6a')fail('runtime_required')
}
const opts=(user,password)=>({host:'127.0.0.1',port:5333,database:'agent_studio',user,password,ssl:false,options:'',max:user==='postgres'?2:1,connectionTimeoutMillis:5000,statement_timeout:45000,query_timeout:50000,idleTimeoutMillis:1000,application_name:'agentstudio-complete069-prepare'})
export async function runCompleteService(argv,env=process.env){
 const cfg=parseCompleteServiceArguments(argv)
 if(cfg.mode==='plan')return completeServicePlan()
 host(env,cfg.mode==='prepare')
 const [{captureCompleteProfileSources,assertCompleteProfileDeployment},runtime,fs,{createHash},secretModule,journal]=await Promise.all([import('./pg18-complete-profile-source.mjs'),import('./pg18-complete-operator-runtime.mjs'),import('node:fs'),import('node:crypto'),import('./native-activation-cli.mjs'),import('./pg18-complete-service-journal.mjs')])
 const snapshot=await captureCompleteProfileSources();assertCompleteProfileDeployment(snapshot,cfg.sourceSha256)
 const capability=runtime.verifyCompleteProfileOperatorRuntime(snapshot,cfg.sourceSha256,{manifestFile:env[prefix+'RUNTIME_MANIFEST_FILE'],manifestSha256:env[prefix+'RUNTIME_MANIFEST_SHA256'],lockSha256:env[prefix+'RUNTIME_LOCK_SHA256']})
 const {Pool}=runtime.loadCompleteProfileOperatorPg(capability)
 const core=await import('./pg18-complete-service-core.mjs'),profile=await import('./pg18-complete-profile.ts'),scram=await import('./pg18-service-login-secrets.mjs')
 const credential=file=>{const x=secretModule.readPg18OperatorSecret(file),s=fs.lstatSync(x.real);if(s.nlink!==1||s.uid!==0||s.gid!==0||![0o400,0o600].includes(s.mode&0o7777))fail('private_secret_required');return x}
 const adminSecret=credential(env.AGENT_STUDIO_BAOTA_PG_ADMIN_PASSWORD_FILE),apiSecret=credential(env.AGENT_STUDIO_BAOTA_PG_API_PASSWORD_FILE)
 const serviceSecret=cfg.action==='api'?apiSecret:credential(env.AGENT_STUDIO_COMPLETE_SERVICE_PASSWORD_FILE)
 const secrets=cfg.action==='api'?[adminSecret,apiSecret]:[adminSecret,apiSecret,serviceSecret]
 if(new Set(secrets.map(x=>x.password)).size!==secrets.length||new Set(secrets.map(x=>x.device+':'+x.inode)).size!==secrets.length)fail('independent_secret_required')
 const boundary=()=>{host(env,cfg.mode==='prepare');assertCompleteProfileDeployment(snapshot,cfg.sourceSha256);runtime.assertCompleteProfileOperatorRuntime(capability);for(const x of secrets){const now=credential(x.real);if(now.device!==x.device||now.inode!==x.inode||now.password!==x.password)fail('secret_changed')}}
 const action=cfg.action==='first-admin'?'native-auth':cfg.action,d=completeServiceDefinition(action),sha=s=>createHash('sha256').update(s).digest('hex')
 const admin=new Pool(opts('postgres',adminSecret.password)),api=new Pool(opts('agentstudio_stage_login',apiSecret.password)),service=cfg.action==='api'?api:new Pool(opts(d.login,serviceSecret.password))
 for(const p of new Set([admin,api,service]))p.on('error',()=>{})
 let lock,locked=false,intent=null,commitAcknowledged=false
 const evidence={commit_acknowledged:false,actual_login_verified:false,actual_api_catalog_verified:false,first_admin_verified:false,migration_ledger_unchanged:false,refusal_code:null}
 try{
  boundary();lock=await admin.connect();await core.completeServiceTarget(lock,cfg.target)
  if((await lock.query('SELECT pg_try_advisory_lock(61824,20261029) AS locked')).rows[0]?.locked!==true)fail('preparation_lock_busy')
  locked=true
  if(cfg.mode==='inspect-operation'){
   // A fresh read-only observation is never promoted to an ACK for a prior
   // COMMIT and never causes a role mutation or a repeated enrollment.
   intent=journal.readCompleteServiceOperation(env.AGENT_STUDIO_COMPLETE_SERVICE_JOURNAL_DIR,cfg)
   const observed=await profile.inspectCompleteProfile(admin,snapshot,cfg.sourceSha256,cfg.target)
   if(!observed.structure_and_receipt_verified)fail('full_profile_required')
   await core.completeServiceCatalog(lock,snapshot)
   const row=(await lock.query('SELECT rolcanlogin AS enabled,rolpassword AS verifier FROM pg_authid WHERE rolname=$1',[d.login])).rows[0]
   const matches=typeof row?.verifier==='string'&&sha(row.verifier)===intent.verifier_sha256
   let actual=false,catalog=false,first=false
   if(row?.enabled===true&&matches){try{actual=await core.completeServiceActualLogin(service,action);await profile.verifyCompleteProfile(admin,api,snapshot,cfg.sourceSha256);catalog=true;if(cfg.action==='first-admin')first=await core.completeServiceInitialAdmin(lock,true)}catch{}}
   boundary();return {format:'complete069_service_observation_v1',action:cfg.action,operation_id:cfg.operationId,source_sha256:cfg.sourceSha256,target:cfg.target,observed_role_enabled:row?.enabled===true,verifier_matches_intent:matches,actual_login_verified:actual,actual_api_catalog_verified:catalog,first_admin_verified:first,prior_commit_acknowledged:false,automatic_retry_authorized:false,writes_performed:false,services_started:false,production_cutover_allowed:false}
  }
  const before=await core.completeServicePreflight(admin,api,snapshot,cfg)
  const start=digest=>{boundary();intent=journal.startCompleteServiceOperation(env.AGENT_STUDIO_COMPLETE_SERVICE_JOURNAL_DIR,cfg,digest)}
  try{
   if(cfg.action==='first-admin'){
    // Reuse the WHOLE original CLI run(), including its own preflight,
    // private files, exclusive native enrollment lock and KDF/repository.
    const original=await import('./native-first-admin-cli.mjs')
    if(credential(env.AGENT_STUDIO_PG_NATIVE_AUTH_PASSWORD_FILE).real!==serviceSecret.real)fail('native_secret_binding_required')
    const employee=credential(env.AGENT_STUDIO_PG18_FIRST_ADMIN_PASSWORD_FILE),employeeProfile=credential(env.AGENT_STUDIO_PG18_FIRST_ADMIN_PROFILE_FILE)
    if([adminSecret,apiSecret,serviceSecret,employee,employeeProfile].some((v,i,a)=>a.slice(0,i).some(x=>x.device===v.device&&x.inode===v.inode))||secrets.some(x=>x.password===employee.password)||[...before.roles.values()].some(r=>r.verifier!==null&&scram.matchesServiceScram(employee.password,r.verifier)))fail('independent_first_admin_input_required')
    secrets.push(employee,employeeProfile)
    const nativeVerifier=before.roles.get(d.login)?.verifier;if(typeof nativeVerifier!=='string')fail('native_auth_preparation_required')
    start(sha(nativeVerifier));boundary()
    const result=await original.run(['--execute','--confirm-database','agent_studio'],env)
    if(result.first_admin_created!==true)fail('first_admin_not_acknowledged')
    commitAcknowledged=true
   }else{
    const prepared=await core.prepareCompleteServiceRole(admin,api,snapshot,cfg,serviceSecret.password,before.ledger,start)
    commitAcknowledged=prepared.commitAcknowledged===true
   }
   boundary();evidence.commit_acknowledged=commitAcknowledged
   await core.completeServiceCatalog(lock,snapshot)
   evidence.actual_login_verified=await core.completeServiceActualLogin(service,action)
   await profile.verifyCompleteProfile(admin,api,snapshot,cfg.sourceSha256);evidence.actual_api_catalog_verified=true
   if(!['api','native-auth'].includes(cfg.action))evidence.first_admin_verified=await core.completeServiceInitialAdmin(lock,true)
   evidence.migration_ledger_unchanged=await core.completeServiceLedger(lock)===before.ledger
   if(!evidence.migration_ledger_unchanged)fail('ledger_changed')
   boundary()
  }catch(error){evidence.commit_acknowledged=commitAcknowledged;evidence.refusal_code=completeServiceRefusal(error);if(!intent)throw error}
  journal.finishCompleteServiceOperation(env.AGENT_STUDIO_COMPLETE_SERVICE_JOURNAL_DIR,cfg,evidence)
  const verified=commitAcknowledged&&evidence.actual_login_verified&&evidence.actual_api_catalog_verified&&evidence.migration_ledger_unchanged&&evidence.refusal_code===null
  return {format:'complete069_service_preparation_v1',action:cfg.action,operation_id:cfg.operationId,source_sha256:cfg.sourceSha256,target:cfg.target,...evidence,verified,commit_unknown:!commitAcknowledged,read_only_confirmation_required:!verified,automatic_retry_authorized:false,services_started:false,production_cutover_allowed:false}
 }finally{
  if(lock){if(locked)await lock.query('SELECT pg_advisory_unlock(61824,20261029)').catch(()=>{});lock.release(true)}
  for(const p of new Set([service,api,admin]))await p.end()
 }
}
if(process.argv[1]&&path.resolve(process.argv[1])===here){try{const r=await runCompleteService(process.argv.slice(2));process.stdout.write(JSON.stringify(r)+'\n');if(r.verified===false)process.exitCode=1}catch(error){process.stderr.write(completeServiceRefusal(error)+'\n');process.exitCode=1}}
