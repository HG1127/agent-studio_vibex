#!/usr/bin/env node
// Explicit employee UI070-073/075/078 combination on prepared disposable069. The
// original initializer, service preparer, default templates and identity stay exact.
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {captureEmployeeUi078Sources,assertEmployeeUi078Snapshot,assertEmployeeUi078Deployment,employeeUi078Plan,employeeUi078Profile} from './pg18-employee-ui078-source.mjs'
const here=fileURLToPath(import.meta.url),prefix='AGENT_STUDIO_DESCRIPTIVE_PATCH_060_',fail=code=>{throw Error('employee_ui078_'+code)},digest=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v)
const targetNumber=(v,max)=>typeof v==='string'&&/^[1-9][0-9]{0,19}$/.test(v)&&BigInt(v)<=max
export function parseEmployeeUi078Arguments(argv){
 if(!Array.isArray(argv)||argv.some(v=>typeof v!=='string')||argv[1]!=='--profile'||argv[2]!==employeeUi078Profile)fail('invalid_arguments')
 if(argv.length===3&&argv[0]==='--plan')return Object.freeze({mode:'plan',profile:employeeUi078Profile})
 const install=['--install','--install-child'].includes(argv[0])
 if(argv.length!==11||!['--inspect','--verify','--install','--install-child'].includes(argv[0])||argv[3]!==(install?'--confirm-prepared-disposable-database':'--confirm-database')||argv[4]!=='agent_studio'||argv[5]!=='--expected-source-sha256'||!digest(argv[6])||argv[7]!=='--expected-system-identifier'||!targetNumber(argv[8],18446744073709551615n)||argv[9]!=='--expected-database-oid'||!targetNumber(argv[10],4294967295n))fail('invalid_arguments')
 return Object.freeze({mode:argv[0].slice(2),profile:employeeUi078Profile,expected_source_sha256:argv[6],expected_target:Object.freeze({system_identifier:argv[8],database_oid:argv[10]})})
}
export function employeeUi078RefusalCode(error){
 const message=Object.getOwnPropertyDescriptor(error??{},'message')?.value,code=Object.getOwnPropertyDescriptor(error??{},'code')?.value
 if(typeof message==='string'&&/^employee_ui078_[a-z_]+$/.test(message))return message
 if(typeof message==='string'&&/^(?:complete069|complete_service)_[a-z_]+$/.test(message))return 'employee_ui078_predecessor_refused'
 if(typeof code==='string'&&/^[0-9A-Z]{5}$/.test(code))return 'employee_ui078_sqlstate_'+code
 return 'employee_ui078_operation_refused'
}
function host(env,install){
 if(env!==process.env||process.platform!=='linux'||process.getuid?.()!==0||process.getgid?.()!==0||process.versions.node.split('.')[0]!=='24'||process.execArgv.some(v=>v!=='--experimental-strip-types'))fail('host_refused')
 for(const [key,d]of Object.entries(Object.getOwnPropertyDescriptors(env))){if(!('value'in d)||key==='DATABASE_URL'||/^PG|^NODE_PG_|^DOCKER_|^LD_|^DYLD_/.test(key)||['NODE_OPTIONS','NODE_PATH','NODE_COMPILE_CACHE','NODE_V8_COVERAGE','NODE_EXTRA_CA_CERTS','NODE_TLS_REJECT_UNAUTHORIZED','SSL_CERT_FILE','SSL_CERT_DIR','OPENSSL_CONF','OPENSSL_MODULES'].includes(key)&&d.value)fail('ambient_configuration_refused')}
 if(env.AGENT_STUDIO_BAOTA_FRESH_PG_ENABLED!=='true'||env.AGENT_STUDIO_BAOTA_PG_HOST!=='127.0.0.1'||env.AGENT_STUDIO_BAOTA_PG_PORT!=='5333'||env.AGENT_STUDIO_BAOTA_PG_DATABASE!=='agent_studio'||env.AGENT_STUDIO_BAOTA_PG_ADMIN_USER!=='postgres')fail('target_refused')
 if(install&&env.AGENT_STUDIO_PG18_EMPLOYEE_UI078_INSTALL_APPROVED!=='APPROVE_PREPARED_DISPOSABLE_PG18_EMPLOYEE_UI078_ONLY')fail('install_not_approved')
 for(const suffix of ['RUNTIME_MANIFEST_SHA256','RUNTIME_LOCK_SHA256'])if(!digest(env[prefix+suffix]))fail('runtime_required')
 if(env[prefix+'RUNTIME_LOCK_SHA256']!=='eb56da11d2713724419f938ef874991fd50fc082dda09837b779ee5841a21c6a')fail('runtime_required')
}
async function dependencies(snapshot,expected,env){
 assertEmployeeUi078Deployment(snapshot,expected)
 const runtime=await import('./pg18-complete-operator-runtime.mjs')
 // Reuse the reviewed14-package loader with its actual base snapshot; the
 // additional source/deployment assertion binds all seven separately pinned SQL.
 const capability=runtime.verifyCompleteProfileOperatorRuntime(snapshot.base,snapshot.base.source_sha256,{manifestFile:env[prefix+'RUNTIME_MANIFEST_FILE'],manifestSha256:env[prefix+'RUNTIME_MANIFEST_SHA256'],lockSha256:env[prefix+'RUNTIME_LOCK_SHA256']})
 const pg=runtime.loadCompleteProfileOperatorPg(capability)
 const boundary=()=>{host(env,false);assertEmployeeUi078Deployment(snapshot,expected);runtime.assertCompleteProfileOperatorRuntime(capability)}
 boundary();return {pg,boundary}
}
function poolOptions(password,user='postgres'){return {host:'127.0.0.1',port:5333,database:'agent_studio',user,password,ssl:false,options:'',max:1,connectionTimeoutMillis:5000,statement_timeout:45000,query_timeout:50000,idleTimeoutMillis:1000,application_name:'agentstudio-employee-ui078-operator'}}
const own=v=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.getPrototypeOf(v)===Object.prototype
export function acceptedEmployeeUi078Commit(value,expected,target){
 if(!own(value)||Object.keys(value).sort().join(',')!=='kind,source_sha256,target'||value.kind!=='employee_ui078_committed_and_audited'||value.source_sha256!==expected||!own(value.target)||Object.keys(value.target).sort().join(',')!=='database_oid,system_identifier')return false
 return value.target.system_identifier===target.system_identifier&&value.target.database_oid===target.database_oid
}
async function installChild(expected,target){
 const {fork}=await import('node:child_process')
 return new Promise(resolve=>{
  const child=fork(here,['--install-child','--profile',employeeUi078Profile,'--confirm-prepared-disposable-database','agent_studio','--expected-source-sha256',expected,'--expected-system-identifier',target.system_identifier,'--expected-database-oid',target.database_oid],{execArgv:['--experimental-strip-types'],env:process.env,stdio:['ignore','pipe','pipe','ipc'],windowsHide:true})
  let acknowledged=false,exceeded=false,startFailed=false,output=0,killTimer,stderr=''
  const stop=()=>{if(exceeded)return;exceeded=true;try{child.kill('SIGTERM')}catch{startFailed=true}if(!killTimer)killTimer=setTimeout(()=>{try{child.kill('SIGKILL')}catch{startFailed=true}},5000)},timer=setTimeout(stop,300000)
  // An error does not attest that this owned child has closed. Observe its
  // close event before any parent reinspection; never replay after uncertainty.
  child.once('error',()=>{startFailed=true;stop()})
  child.on('message',value=>{if(acknowledged||!acceptedEmployeeUi078Commit(value,expected,target))stop();else acknowledged=true})
  for(const stream of [child.stdout,child.stderr])stream.on('data',bytes=>{output+=bytes.length;if(stream===child.stderr&&stderr.length<1024)stderr+=bytes.toString('utf8').slice(0,1024-stderr.length);if(output>65536)stop()})
  child.once('close',(code,signal)=>{clearTimeout(timer);if(killTimer)clearTimeout(killTimer);const refusal=stderr.trim();resolve(Object.freeze({closed:true,exit_code:code,signal,acknowledged:acknowledged&&!exceeded&&!startFailed&&code===0,exceeded,start_failed:startFailed,refusal_code:startFailed?'employee_ui078_owned_child_start_failed':/^employee_ui078_(?:[a-z_]+|sqlstate_[0-9A-Z]{5})$/.test(refusal)?refusal:null}))})
 })
}
export async function runEmployeeUi078(argv,env=process.env){
 const cfg=parseEmployeeUi078Arguments(argv)
 // Offline branch: no env/secret reads, runtime/pg import, child or network.
 if(cfg.mode==='plan')return employeeUi078Plan(await captureEmployeeUi078Sources())
 if(cfg.mode==='install-child'&&(typeof process.send!=='function'||!process.connected))fail('owned_child_required')
 host(env,['install','install-child'].includes(cfg.mode))
 const snapshot=await captureEmployeeUi078Sources(),expected=cfg.expected_source_sha256
 assertEmployeeUi078Snapshot(snapshot,expected)
 const {pg,boundary}=await dependencies(snapshot,expected,env),core=await import('./pg18-employee-ui078-profile.ts'),{readPg18OperatorSecret}=await import('./native-activation-cli.mjs')
 const adminSecret=readPg18OperatorSecret(env.AGENT_STUDIO_BAOTA_PG_ADMIN_PASSWORD_FILE),admin=new pg.Pool(poolOptions(adminSecret.password));admin.on('error',()=>{})
 let api
 try{
  boundary();const before=await core.inspectEmployeeUi078Profile(admin,snapshot,expected,cfg.expected_target);boundary()
  if(cfg.mode==='inspect')return {mode:'inspect',...before,network_used:true,writes_performed:false}
  if(cfg.mode==='install'&&before.structure_and_receipt_verified)return {mode:'install',...before,already_installed:true,invocation_commit_acknowledged:false,actual_login_audit_required:true,network_used:true,writes_performed:false}
  if(['install','install-child'].includes(cfg.mode)&&before.state!=='base_prepared')fail(before.state==='pending'?'prior_operation_pending':'exact_prepared069_required')
  const apiSecret=readPg18OperatorSecret(env.AGENT_STUDIO_BAOTA_PG_API_PASSWORD_FILE)
  if(apiSecret.password===adminSecret.password||apiSecret.device===adminSecret.device&&apiSecret.inode===adminSecret.inode)fail('independent_api_secret_required')
  api=new pg.Pool({...poolOptions(apiSecret.password,'agentstudio_stage_login'),options:'-c default_transaction_read_only=on'});api.on('error',()=>{})
  boundary()
  if(cfg.mode==='verify'){const verified=await core.verifyEmployeeUi078Profile(admin,api,snapshot,expected,cfg.expected_target);boundary();return {mode:'verify',...verified,network_used:true,writes_performed:false}}
  if(cfg.mode==='install-child'){
   host(env,true);boundary();const installed=await core.installEmployeeUi078Profile(admin,api,snapshot,expected,cfg.expected_target);boundary()
   process.send({kind:'employee_ui078_committed_and_audited',source_sha256:expected,target:installed.target});if(process.connected)process.disconnect()
   return {mode:'install-child',invocation_commit_acknowledged:true,services_started:false,production_GO:false}
  }
  host(env,true);boundary();const child=await installChild(expected,cfg.expected_target);boundary()
  // A lost ACK/timeout never authorizes another SQL transaction. Reinspect
  // only after this owned child is closed, against the same physical target.
  const after=await core.inspectEmployeeUi078Profile(admin,snapshot,expected,cfg.expected_target);boundary()
  if(child.acknowledged&&!after.structure_and_receipt_verified)fail('durable_postflight_failed')
  const verified=child.acknowledged?await core.verifyEmployeeUi078Profile(admin,api,snapshot,expected,cfg.expected_target):after;boundary()
  return {mode:'install',...verified,invocation_commit_acknowledged:child.acknowledged,commit_unknown:!child.acknowledged,actual_login_audit_required:!child.acknowledged,owned_child_closed:true,owned_child_exit_code:Number.isSafeInteger(child.exit_code)?child.exit_code:null,owned_child_refusal_code:child.refusal_code,network_used:true,writes_performed:true,automatic_retry_authorized:false,cleanup_performed:false}
 }finally{if(api)await api.end();await admin.end()}
}
if(process.argv[1]&&path.resolve(process.argv[1])===here){
 try{const result=await runEmployeeUi078(process.argv.slice(2));process.stdout.write(JSON.stringify(result)+'\n');if(result.commit_unknown)process.exitCode=2}
 catch(error){process.stderr.write(employeeUi078RefusalCode(error)+'\n');process.exitCode=1;if(process.connected)process.disconnect()}
}
