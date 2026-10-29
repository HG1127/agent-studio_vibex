#!/usr/bin/env node
// Root-only three-LOGIN preparation. It never starts the original service,
// constructs a provider, runs a queue, rewrites old records or installs units.
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {parseReviewStackArguments,reviewStackDefinitions as defs,reviewStackPlan,reviewStackRefusal} from './pg18-complete-review-stack-plan.mjs'
const here=fileURLToPath(import.meta.url),prefix='AGENT_STUDIO_DESCRIPTIVE_PATCH_060_',envPrefix='AGENT_STUDIO_COMPLETE_REVIEW_STACK_',fail=code=>{throw Error('complete069_review_stack_'+code)}
function host(env,write){
 if(env!==process.env||process.platform!=='linux'||process.getuid?.()!==0||process.getgid?.()!==0||process.versions.node.split('.')[0]!=='24'||process.execArgv.some(v=>v!=='--experimental-strip-types'))fail('host_refused')
 for(const[key,d]of Object.entries(Object.getOwnPropertyDescriptors(env)))if(!('value'in d)||key==='DATABASE_URL'||/^PG|^NODE_PG_|^LD_|^DYLD_|^DOCKER_/.test(key)||['NODE_OPTIONS','NODE_PATH','NODE_COMPILE_CACHE','NODE_V8_COVERAGE','NODE_EXTRA_CA_CERTS','NODE_TLS_REJECT_UNAUTHORIZED','SSL_CERT_FILE','SSL_CERT_DIR','OPENSSL_CONF','OPENSSL_MODULES','HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','http_proxy','https_proxy','all_proxy'].includes(key)&&d.value)fail('ambient_configuration_refused')
 if(env[envPrefix+'ENABLED']!=='true'||env.AGENT_STUDIO_BAOTA_PG_HOST!=='127.0.0.1'||env.AGENT_STUDIO_BAOTA_PG_PORT!=='5333'||env.AGENT_STUDIO_BAOTA_PG_DATABASE!=='agent_studio'||env.AGENT_STUDIO_BAOTA_PG_ADMIN_USER!=='postgres')fail('target_refused')
 if(write&&env[envPrefix+'WRITE_APPROVED']!=='PREPARE_COMPLETE069_FIXED_REVIEW_STACK_ONLY')fail('write_not_approved')
 if(env[prefix+'RUNTIME_LOCK_SHA256']!=='eb56da11d2713724419f938ef874991fd50fc082dda09837b779ee5841a21c6a')fail('runtime_required')
}
export async function runReviewStack(argv,env=process.env){
 const cfg=parseReviewStackArguments(argv);if(cfg.mode==='plan')return reviewStackPlan()
 host(env,cfg.mode==='prepare')
 const [source,runtime,fs,{createHash},secretModule,journal]=await Promise.all([import('./pg18-complete-profile-source.mjs'),import('./pg18-complete-operator-runtime.mjs'),import('node:fs'),import('node:crypto'),import('./native-activation-cli.mjs'),import('./pg18-complete-review-stack-journal.mjs')])
 const snapshot=await source.captureCompleteProfileSources();source.assertCompleteProfileDeployment(snapshot,cfg.sourceSha256)
 const cap=runtime.verifyCompleteProfileOperatorRuntime(snapshot,cfg.sourceSha256,{manifestFile:env[prefix+'RUNTIME_MANIFEST_FILE'],manifestSha256:env[prefix+'RUNTIME_MANIFEST_SHA256'],lockSha256:env[prefix+'RUNTIME_LOCK_SHA256']}),{Pool}=runtime.loadCompleteProfileOperatorPg(cap)
 const core=await import('./pg18-complete-review-stack-core.mjs'),original=await import('./pg18-complete-service-core.mjs'),profile=await import('./pg18-complete-profile.ts'),scram=await import('./pg18-service-login-secrets.mjs'),reviewJournal=await import('./pg18-complete-review-worker-journal.mjs'),executorJournal=await import('./pg18-complete-executor-journal.mjs'),sha=v=>createHash('sha256').update(v).digest('hex')
 const readParents=()=>{try{const review=reviewJournal.readComplete069ReviewWorkerOperation(env.AGENT_STUDIO_COMPLETE_REVIEW_WORKER_JOURNAL_DIR,{...cfg,operationId:cfg.reviewOperationId}),executor=executorJournal.readComplete069ExecutorOperation(env.AGENT_STUDIO_COMPLETE_EXECUTOR_JOURNAL_DIR,{...cfg,operationId:cfg.executorOperationId}),links={review_operation_id:cfg.reviewOperationId,review_intent_sha256:sha(JSON.stringify(review)),executor_operation_id:cfg.executorOperationId,executor_intent_sha256:sha(JSON.stringify(executor))};if(executor.review_intent_sha256!==links.review_intent_sha256)fail('parent_record_refused');return {review,executor,links}}catch{fail('parent_record_refused')}}
 let parents
 const credential=file=>{const x=secretModule.readPg18OperatorSecret(file),s=fs.lstatSync(x.real);if(s.nlink!==1||s.uid!==0||s.gid!==0||![0o400,0o600].includes(s.mode&0o7777))fail('private_secret_required');return x}
 const files={admin:env.AGENT_STUDIO_BAOTA_PG_ADMIN_PASSWORD_FILE,api:env.AGENT_STUDIO_BAOTA_PG_API_PASSWORD_FILE,model_broker:env[envPrefix+'MODEL_BROKER_PASSWORD_FILE'],review_worker:env[envPrefix+'REVIEW_WORKER_PASSWORD_FILE'],executor:env[envPrefix+'EXECUTOR_PASSWORD_FILE'],...Object.fromEntries(defs.map(d=>[d.key,env[envPrefix+d.key.toUpperCase()+'_PASSWORD_FILE']]))}
 const secrets=Object.fromEntries(Object.entries(files).map(([k,v])=>[k,credential(v)])),values=Object.values(secrets)
 if(new Set(values.map(v=>v.password)).size!==values.length||new Set(values.map(v=>v.device+':'+v.inode)).size!==values.length)fail('independent_secret_required')
 for(const d of defs)scram.validateServiceLoginPassword(secrets[d.key].password)
 const sourceBoundary=()=>{host(env,cfg.mode==='prepare');source.assertCompleteProfileDeployment(snapshot,cfg.sourceSha256);runtime.assertCompleteProfileOperatorRuntime(cap);for(const x of values){const n=credential(x.real);if(n.device!==x.device||n.inode!==x.inode||n.password!==x.password)fail('secret_changed')}}
 const boundary=()=>{sourceBoundary();if(!parents||JSON.stringify(readParents().links)!==JSON.stringify(parents.links))fail('parent_record_changed')}
 const users={api:'agentstudio_stage_login',model_broker:'agentstudio_model_broker_login',review_worker:'agentstudio_review_worker_login',executor:'agentstudio_local_executor_login',...Object.fromEntries(defs.map(d=>[d.key,d.login]))},opts=(user,password,max=1)=>({host:'127.0.0.1',port:5333,database:'agent_studio',user,password,ssl:false,options:'',max,connectionTimeoutMillis:5000,statement_timeout:60000,query_timeout:65000,idleTimeoutMillis:1000,application_name:'agentstudio-complete069-review-stack'})
 const admin=new Pool(opts('postgres',secrets.admin.password,4)),pools=Object.fromEntries(Object.entries(users).map(([k,user])=>[k,new Pool(opts(user,secrets[k].password))]));for(const p of [admin,...Object.values(pools)])p.on('error',()=>{})
 const evidence={commit_acknowledged:false,role_matrix_verified:false,old_catalog_unchanged:false,migration_ledger_unchanged:false,all_table_images_unchanged:false,verifiers_match_intent:false,prior_logins_verified:false,new_logins_verified:false,actual_api_catalog_verified:false,refusal_code:null}
 let lock,locked=false,intent
 try{
  sourceBoundary();lock=await admin.connect();await original.completeServiceTarget(lock,cfg.target);parents=readParents();boundary()
  if((await lock.query('SELECT pg_try_advisory_lock(61824,20261029) AND pg_try_advisory_lock(61824,20261102) AS locked')).rows[0]?.locked!==true)fail('preparation_lock_busy');locked=true
  if(cfg.mode==='inspect-operation'){
   intent=journal.readReviewStackOperation(env[envPrefix+'JOURNAL_DIR'],cfg)
   if(Object.keys(parents.links).some(k=>intent[k]!==parents.links[k]))fail('parent_record_changed')
   const observed=await core.observeReviewStack(admin,pools,snapshot,cfg,intent);boundary()
   return {format:'complete069_review_stack_observation_v1',profile:'complete069',operation_id:cfg.operationId,source_sha256:cfg.sourceSha256,target:cfg.target,fixed_logins:defs.map(d=>d.login),...observed,observed_ready:Object.values(observed).every(v=>v===true),prior_commit_acknowledged:false,automatic_retry_authorized:false,writes_performed:false,services_started:false,runtime_authorization:false,qualifies:false,production_cutover_allowed:false}
  }
  const before=await core.reviewStackPreflight(admin,pools,snapshot,cfg)
  if(before.executorBaseline!==parents.executor.baseline_catalog_sha256||before.executorImage!==parents.executor.business_image_sha256||before.ledger!==parents.executor.ledger_sha256||sha(before.knownVerifiers.agentstudio_local_executor_login)!==parents.executor.verifier_sha256||sha(before.knownVerifiers.agentstudio_review_worker_login)!==parents.review.verifier_sha256)fail('parent_state_changed')
  before.links=parents.links
  await core.verifyReviewStackPriorPools(pools)
  if((await profile.verifyCompleteProfile(admin,pools.api,snapshot,cfg.sourceSha256)).full_catalog_audit_verified!==true)fail('full_api_catalog_required')
  for(const d of defs)if(before.allVerifiers.some(v=>scram.matchesServiceScram(secrets[d.key].password,v)))fail('secret_reused')
  const verifiers=Object.fromEntries(defs.map(d=>[d.login,scram.serviceLoginVerifier(secrets[d.key].password)]))
  try{
   evidence.commit_acknowledged=await core.prepareReviewStack(admin,pools,snapshot,cfg,verifiers,before,(digests,state)=>{boundary();intent=journal.startReviewStackOperation(env[envPrefix+'JOURNAL_DIR'],cfg,digests,state)})
   boundary();Object.assign(evidence,await core.observeReviewStack(admin,pools,snapshot,cfg,intent));boundary()
  }catch(error){evidence.refusal_code=reviewStackRefusal(error);if(!intent)throw error}
  journal.finishReviewStackOperation(env[envPrefix+'JOURNAL_DIR'],cfg,evidence)
  const verified=Object.entries(evidence).every(([k,v])=>k==='refusal_code'?v===null:v===true)
  return {format:'complete069_review_stack_preparation_v1',profile:'complete069',operation_id:cfg.operationId,source_sha256:cfg.sourceSha256,target:cfg.target,fixed_logins:defs.map(d=>d.login),...evidence,verified,commit_unknown:!evidence.commit_acknowledged,read_only_confirmation_required:!verified,automatic_retry_authorized:false,services_started:false,runtime_authorization:false,qualifies:false,production_cutover_allowed:false}
 }finally{if(lock){if(locked)await lock.query('SELECT pg_advisory_unlock(61824,20261102),pg_advisory_unlock(61824,20261029)').catch(()=>{});lock.release(true)}for(const p of [...Object.values(pools),admin])await p.end()}
}
if(process.argv[1]&&path.resolve(process.argv[1])===here){try{const r=await runReviewStack(process.argv.slice(2));process.stdout.write(JSON.stringify(r)+'\n');if(r.verified===false)process.exitCode=1}catch(error){process.stderr.write(reviewStackRefusal(error)+'\n');process.exitCode=1}}
