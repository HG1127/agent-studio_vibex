#!/usr/bin/env node
// Explicit fresh complete067 entry. The old default050 entry is unchanged.
// No service launch, business activation, existing-schema upgrade or cleanup.
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {captureCompleteProfileSources,assertCompleteProfileSnapshot,assertCompleteProfileDeployment,completeProfilePlan,completeProfileName} from './pg18-complete-profile-source.mjs'
const here=fileURLToPath(import.meta.url),runtimePrefix='AGENT_STUDIO_DESCRIPTIVE_PATCH_060_'
const fail=code=>{throw Error('complete067_'+code)}
const digest=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value)
// Closed refusal metadata only. Never return driver messages, SQL or secrets.
export function completeProfileRefusalCode(error){
 const value=Object.getOwnPropertyDescriptor(error??{},'message')?.value,sqlstate=Object.getOwnPropertyDescriptor(error??{},'code')?.value
 if(typeof value==='string'&&/^complete067_[a-z_]+$/.test(value))return value
 const original=new Set(['unknown_schema_format','baota_init_disabled','baota_linux_only','unsafe_baota_target','ambient_pg_configuration_forbidden','external_secret_file_required','private_secret_file_required','invalid_secret_file','invalid_pg18_admin_target','pgvector_unavailable','agentstudio_schema_exists','nonempty_database','global_role_collision','schema_or_role_verification_failed','role_grants_missing','secrets_not_independent','service_role_password_not_scram','fresh_runtime_verification_failed','descriptive_patch_operator_runtime_refused','descriptive_patch_operator_source_refused','unsafe_agent_memory_privileges','unsafe_agent_memory_context_privileges','unsafe_knowledge_content_privileges','unsafe_knowledge_embedding_privileges','unsafe_knowledge_keyword_privileges','unsafe_knowledge_agent_privileges','unsafe_knowledge_lineage_privileges','unsafe_schedule_privileges','unsafe_agent_collaboration_privileges','unsafe_agent_release_privileges','unsafe_agent_human_input_privileges'])
 if(original.has(value))return 'complete067_predecessor_'+value
 if(typeof sqlstate==='string'&&/^[0-9A-Z]{5}$/.test(sqlstate))return 'complete067_sqlstate_'+sqlstate
 return 'complete067_operation_refused'
}
export function parseCompleteProfileArguments(argv){
 if(!Array.isArray(argv)||argv.some(v=>typeof v!=='string')||argv[1]!=='--profile'||argv[2]!==completeProfileName)fail('invalid_arguments')
 if(argv.length===3&&argv[0]==='--plan')return Object.freeze({mode:'plan',profile:completeProfileName})
 if(argv[0]==='--install-child'){
  if(argv.length!==11||argv[3]!=='--confirm-empty-database'||argv[4]!=='agent_studio'||argv[5]!=='--expected-source-sha256'||!digest(argv[6])||argv[7]!=='--expected-system-identifier'||! /^[1-9][0-9]{0,19}$/.test(argv[8])||argv[9]!=='--expected-database-oid'||! /^[1-9][0-9]{0,19}$/.test(argv[10]))fail('invalid_arguments')
  return Object.freeze({mode:'install-child',profile:completeProfileName,expected_source_sha256:argv[6],expected_target:Object.freeze({system_identifier:argv[8],database_oid:argv[10]})})
 }
 if(argv.length!==7||!['--install','--inspect','--verify'].includes(argv[0])||argv[3]!==('--install'===argv[0]?'--confirm-empty-database':'--confirm-database')||argv[4]!=='agent_studio'||argv[5]!=='--expected-source-sha256'||!digest(argv[6]))fail('invalid_arguments')
 return Object.freeze({mode:argv[0].slice(2),profile:completeProfileName,expected_source_sha256:argv[6]})
}
function host(env,install){
 if(env!==process.env||process.platform!=='linux'||process.getuid?.()!==0||process.getgid?.()!==0||process.versions.node.split('.')[0]!=='24'||process.execArgv.some(v=>v!=='--experimental-strip-types'))fail('host_refused')
 for(const [key,descriptor]of Object.entries(Object.getOwnPropertyDescriptors(env))){
  if(!('value'in descriptor)||key==='DATABASE_URL'||/^PG|^NODE_PG_|^DOCKER_|^LD_|^DYLD_/.test(key)||['NODE_OPTIONS','NODE_PATH','NODE_COMPILE_CACHE','NODE_V8_COVERAGE','NODE_EXTRA_CA_CERTS','NODE_TLS_REJECT_UNAUTHORIZED','SSL_CERT_FILE','SSL_CERT_DIR','OPENSSL_CONF','OPENSSL_MODULES'].includes(key)&&descriptor.value)fail('ambient_configuration_refused')
 }
 if(env.AGENT_STUDIO_BAOTA_FRESH_PG_ENABLED!=='true'||env.AGENT_STUDIO_BAOTA_PG_HOST!=='127.0.0.1'||env.AGENT_STUDIO_BAOTA_PG_PORT!=='5333'||env.AGENT_STUDIO_BAOTA_PG_DATABASE!=='agent_studio'||env.AGENT_STUDIO_BAOTA_PG_ADMIN_USER!=='postgres')fail('target_refused')
 if(install&&env.AGENT_STUDIO_PG18_RUNTIME_INIT_APPROVED!=='APPROVE_EMPTY_PG18_RUNTIME_INIT_ONLY')fail('install_not_approved')
 for(const suffix of ['RUNTIME_MANIFEST_SHA256','RUNTIME_LOCK_SHA256'])if(!digest(env[runtimePrefix+suffix]))fail('runtime_required')
 if(env[runtimePrefix+'RUNTIME_LOCK_SHA256']!=='eb56da11d2713724419f938ef874991fd50fc082dda09837b779ee5841a21c6a')fail('runtime_required')
}
async function dependencies(snapshot,expected,env){
 assertCompleteProfileDeployment(snapshot,expected)
 // Independent complete-profile capability binds the full source closure and
 // the unchanged14-package inventory; old059/060 admission stays unchanged.
 const runtime=await import('./pg18-complete-operator-runtime.mjs')
 const capability=runtime.verifyCompleteProfileOperatorRuntime(snapshot,expected,{manifestFile:env[runtimePrefix+'RUNTIME_MANIFEST_FILE'],manifestSha256:env[runtimePrefix+'RUNTIME_MANIFEST_SHA256'],lockSha256:env[runtimePrefix+'RUNTIME_LOCK_SHA256']})
 const pg=runtime.loadCompleteProfileOperatorPg(capability)
 const boundary=()=>{host(env,false);assertCompleteProfileDeployment(snapshot,expected);runtime.assertCompleteProfileOperatorRuntime(capability)}
 boundary()
 return {pg,boundary}
}
function poolOptions(password,user='postgres'){return {host:'127.0.0.1',port:5333,database:'agent_studio',user,password,ssl:false,options:'',max:1,connectionTimeoutMillis:5000,statement_timeout:45000,query_timeout:50000,idleTimeoutMillis:1000,application_name:'agentstudio-complete067-operator'}}
const own=object=>object&&typeof object==='object'&&!Array.isArray(object)&&Object.getPrototypeOf(object)===Object.prototype
function acceptedCommitMessage(value,expected){
 if(!own(value)||Object.keys(value).sort().join(',')!=='kind,source_sha256,target'||value.kind!=='complete067_committed'||value.source_sha256!==expected||!own(value.target)||Object.keys(value.target).sort().join(',')!=='database_oid,system_identifier')return null
 const {system_identifier,database_oid}=value.target
 return typeof system_identifier==='string'&&/^[1-9][0-9]{0,19}$/.test(system_identifier)&&typeof database_oid==='string'&&/^[1-9][0-9]{0,19}$/.test(database_oid)?{system_identifier,database_oid}:null
}
// Bound only this invocation's own child. Its original initializer owns all
// SQL/credentials and COMMIT. Termination never kills arbitrary DB backends.
async function installChild(expected,target){
 const {fork}=await import('node:child_process')
 return new Promise((resolve,reject)=>{
  const child=fork(here,['--install-child','--profile',completeProfileName,'--confirm-empty-database','agent_studio','--expected-source-sha256',expected,'--expected-system-identifier',target.system_identifier,'--expected-database-oid',target.database_oid],{execArgv:['--experimental-strip-types'],env:process.env,stdio:['ignore','pipe','pipe','ipc'],windowsHide:true})
  let committed=null,exceeded=false,output=0,killTimer,stderr=''
  const timer=setTimeout(()=>{exceeded=true;child.kill('SIGTERM');killTimer=setTimeout(()=>child.kill('SIGKILL'),5000)},300000)
  child.once('error',error=>{clearTimeout(timer);if(killTimer)clearTimeout(killTimer);reject(Error('complete067_owned_child_start_failed'))})
  child.on('message',message=>{const target=acceptedCommitMessage(message,expected);if(target){if(committed){exceeded=true;child.kill('SIGTERM')}else committed=target}})
  for(const stream of [child.stdout,child.stderr])stream.on('data',bytes=>{output+=bytes.length;if(stream===child.stderr&&stderr.length<1024)stderr+=bytes.toString('utf8').slice(0,1024-stderr.length);if(output>65536){exceeded=true;child.kill('SIGTERM')}})
  child.once('close',(code,signal)=>{clearTimeout(timer);if(killTimer)clearTimeout(killTimer);const refusal=stderr.trim();resolve(Object.freeze({closed:true,exit_code:code,signal,committed,exceeded,refusal_code:/^complete067_(?:[a-z_]+|sqlstate_[0-9A-Z]{5})$/.test(refusal)?refusal:null}))})
 })
}
export async function runCompleteProfile(argv,env=process.env){
 const cfg=parseCompleteProfileArguments(argv)
 // The plan branch does not inspect environment secrets, import pg/runtime or
 // spawn any process. It reads only the closed reviewed code/SQL source graph.
 if(cfg.mode==='plan')return completeProfilePlan(await captureCompleteProfileSources())
 host(env,cfg.mode==='install'||cfg.mode==='install-child')
 const snapshot=await captureCompleteProfileSources(),expected=cfg.expected_source_sha256
 assertCompleteProfileSnapshot(snapshot,expected)
 const {pg,boundary}=await dependencies(snapshot,expected,env)
 const core=await import('./pg18-complete-profile.ts')
 if(cfg.mode==='install-child'){
  if(typeof process.send!=='function'||!process.connected)fail('owned_child_required')
  const {initializeFreshPg18Baseline}=await import('./baota-pg18-fresh-init.mjs')
  boundary();host(env,true)
  // No fake pool or DDL replacement: this is the real original050 initializer.
  const installed=await initializeFreshPg18Baseline(env,snapshot.fresh.baseline,async db=>{boundary();const result=await core.installCompleteProfile(db,snapshot,expected,cfg.expected_target);boundary();return result})
  boundary();process.send({kind:'complete067_committed',source_sha256:expected,target:installed.target})
  if(process.connected)process.disconnect()
  return {mode:'install-child',commit_acknowledged:true,services_started:false,production_cutover_allowed:false}
 }
 const {readPg18OperatorSecret}=await import('./native-activation-cli.mjs')
 const credential=readPg18OperatorSecret(env.AGENT_STUDIO_BAOTA_PG_ADMIN_PASSWORD_FILE),admin=new pg.Pool(poolOptions(credential.password));admin.on('error',()=>{})
 let api
 try{
  boundary()
  const before=await core.inspectCompleteProfile(admin,snapshot,expected)
  boundary()
  if(cfg.mode==='inspect')return {mode:'inspect',...before,network_used:true,writes_performed:false}
  if(cfg.mode==='verify'){
   // No automatic login activation, SET SESSION AUTHORIZATION, fabricated
   // Native context or privileged client wrapped as a runtime pool.
   const apiSecret=readPg18OperatorSecret(env.AGENT_STUDIO_BAOTA_PG_API_PASSWORD_FILE)
   if(apiSecret.password===credential.password||apiSecret.device===credential.device&&apiSecret.inode===credential.inode)fail('independent_api_secret_required')
   api=new pg.Pool({...poolOptions(apiSecret.password,'agentstudio_stage_login'),options:'-c default_transaction_read_only=on'});api.on('error',()=>{})
   const verified=await core.verifyCompleteProfile(admin,api,snapshot,expected)
   boundary();return {mode:'verify',...verified,network_used:true,writes_performed:false}
  }
  if(before.structure_and_receipt_verified)return {mode:'install',...before,already_installed:true,invocation_commit_acknowledged:false,network_used:true,writes_performed:false,actual_login_audit_required:true}
  if(before.state!=='empty')fail(before.state==='pending'?'prior_operation_pending':'existing_schema_refused')
  host(env,true);boundary()
  const child=await installChild(expected,before.target)
  boundary()
  // A dropped ACK/timeout is never converted into another installation. The
  // original advisory locks and actual source-bound receipt decide only the
  // observed physical state after the owned process has exited.
  const after=await core.inspectCompleteProfile(admin,snapshot,expected,before.target)
  boundary()
  const acknowledged=child.exit_code===0&&!child.exceeded&&child.committed?.system_identifier===before.target.system_identifier&&child.committed?.database_oid===before.target.database_oid
  if(acknowledged&&!after.structure_and_receipt_verified)fail('durable_postflight_failed')
  return {mode:'install',...after,observed_installation_state:after.state==='empty'?'rolled_back_or_not_started':after.state,invocation_commit_acknowledged:acknowledged,commit_unknown:!acknowledged,owned_child_closed:true,owned_child_exit_code:Number.isSafeInteger(child.exit_code)?child.exit_code:null,owned_child_refusal_code:child.refusal_code??null,network_used:true,writes_performed:true,actual_login_audit_required:true,cleanup_performed:false}
 }finally{if(api)await api.end();await admin.end()}
}
if(process.argv[1]&&path.resolve(process.argv[1])===here){
 try{process.stdout.write(JSON.stringify(await runCompleteProfile(process.argv.slice(2)))+'\n')}
 catch(error){process.stderr.write(completeProfileRefusalCode(error)+'\n');process.exitCode=1;if(process.connected)process.disconnect()}
}
