// Actual complete-profile CLI against independently attested disposable PG18.
// No injected pool/auditor, modified product query, provider or target server.
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {requireCompleteProfileFixtureCi} from './helpers/pg18-complete-install-ci-guard.mjs'
const here=fileURLToPath(import.meta.url)
const phase=name=>console.log(JSON.stringify({event:'complete065_actual_case_start',case:name,production_GO:false}))
export async function runCompleteInstallFixture(argv,env=process.env){
 if(argv.length!==1||argv[0]!=='--run')throw Error('complete_install_fixture_arguments')
 const permit=requireCompleteProfileFixtureCi(env)
 phase('independent_stage_and_cluster_attestation')
 const [{completeProfileStageDescriptor,loadVerifiedCompleteProfileStage},{attestCompleteProfileTargets,ownedCompleteProfilePool},fs,{randomBytes},{spawn},assertModule]=await Promise.all([import('./helpers/pg18-complete-install-ci-stage.mjs'),import('./helpers/pg18-complete-install-ci-containers.mjs'),import('node:fs'),import('node:crypto'),import('node:child_process'),import('node:assert/strict')])
 const assert=assertModule.default,stage=completeProfileStageDescriptor(permit),loaded=await loadVerifiedCompleteProfileStage(permit,stage),targets=await attestCompleteProfileTargets(permit,loaded),admin=await ownedCompleteProfilePool(targets.main,1)
 const secret=(name,value)=>{const file=path.join(stage.input,name);const fd=fs.openSync(file,fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_NOFOLLOW|fs.constants.O_WRONLY,0o400);try{fs.writeFileSync(fd,value);fs.fchmodSync(fd,0o400);fs.fsyncSync(fd)}finally{fs.closeSync(fd)}return file}
 const apiPassword=randomBytes(40).toString('hex'),workerPassword=randomBytes(40).toString('hex'),apiFile=secret('complete-api.secret',apiPassword),workerFile=secret('complete-worker.secret',workerPassword)
 const runtime='AGENT_STUDIO_DESCRIPTIVE_PATCH_060_',settings={PATH:'/usr/local/bin:/usr/bin:/bin',HOME:'/root',LANG:'C.UTF-8',AGENT_STUDIO_BAOTA_FRESH_PG_ENABLED:'true',AGENT_STUDIO_BAOTA_PG_HOST:'127.0.0.1',AGENT_STUDIO_BAOTA_PG_PORT:'5333',AGENT_STUDIO_BAOTA_PG_DATABASE:'agent_studio',AGENT_STUDIO_BAOTA_PG_ADMIN_USER:'postgres',AGENT_STUDIO_BAOTA_PG_ADMIN_PASSWORD_FILE:stage.input+'/admin.secret',AGENT_STUDIO_BAOTA_PG_API_PASSWORD_FILE:apiFile,AGENT_STUDIO_BAOTA_PG_WORKER_PASSWORD_FILE:workerFile,AGENT_STUDIO_PG18_RUNTIME_INIT_APPROVED:'APPROVE_EMPTY_PG18_RUNTIME_INIT_ONLY',[runtime+'RUNTIME_MANIFEST_FILE']:stage.input+'/runtime-manifest.json',[runtime+'RUNTIME_MANIFEST_SHA256']:stage.runtimeManifestSha,[runtime+'RUNTIME_LOCK_SHA256']:'eb56da11d2713724419f938ef874991fd50fc082dda09837b779ee5841a21c6a'}
 const command=async(mode,override={})=>{
  const args=[mode,'--profile','complete065',mode==='--install'?'--confirm-empty-database':'--confirm-database','agent_studio','--expected-source-sha256',stage.profileSha]
  const observed=await new Promise((resolve,reject)=>{
   const child=spawn(process.execPath,['--experimental-strip-types',loaded.tree+'/services/pg-api/src/baota-pg18-complete-init.mjs',...args],{env:{...settings,...override},stdio:['ignore','pipe','pipe'],windowsHide:true});let stdout='',stderr='',bytes=0,killer
   const timer=setTimeout(()=>{child.kill('SIGTERM');killer=setTimeout(()=>child.kill('SIGKILL'),5000)},360000)
   for(const [stream,key]of [[child.stdout,'out'],[child.stderr,'err']])stream.on('data',chunk=>{bytes+=chunk.length;if(bytes>4194304){child.kill('SIGTERM');return}if(key==='out')stdout+=chunk;else stderr+=chunk})
   child.once('error',()=>{clearTimeout(timer);reject(Error('complete_install_actual_cli_start_failed'))});child.once('close',code=>{clearTimeout(timer);if(killer)clearTimeout(killer);if(bytes>4194304)return reject(Error('complete_install_actual_cli_output_bound'));let value;try{value=stdout.trim()?JSON.parse(stdout):null}catch{return reject(Error('complete_install_actual_cli_shape'))}resolve({code,value,closed_code:/\bcomplete065_[a-z_]+\b/.exec(stderr)?.[0]??null})})
  })
  console.log(JSON.stringify({event:'complete065_actual_cli_result',mode,exit:observed.code,closed_code:observed.closed_code,state:['pending','empty','incomplete_or_foreign','schema_installed_inert','schema_installed_services_prepared'].includes(observed.value?.state)?observed.value.state:null,commit_acknowledged:observed.value?.invocation_commit_acknowledged===true,child_exit:observed.value?.owned_child_exit_code??null,child_refusal:observed.value?.owned_child_refusal_code??null,production_GO:false}))
  return observed
 }
 const counts=async()=>{const rows=(await admin.query("SELECT (SELECT count(*)::integer FROM pg_namespace WHERE nspname IN('agentstudio','agentstudio_auth')) AS schemas,(SELECT count(*)::integer FROM pg_roles WHERE rolname LIKE 'agentstudio_%') AS roles")).rows[0];return rows}
 const step=(name,values={})=>console.log(JSON.stringify({event:'complete065_actual_case_pass',case:name,...values,production_GO:false}))
 try{
  phase('empty_inspection');let r=await command('--inspect');assert.equal(r.code,0);assert.equal(r.value.state,'empty');assert.equal(r.value.writes_performed,false);step('independently_owned_empty_target_actual_cli_inspect')
  phase('existing_object_refusal')
  await admin.query('CREATE TABLE public.complete_install_owned_sentinel(id integer PRIMARY KEY);INSERT INTO public.complete_install_owned_sentinel VALUES(1)')
  r=await command('--install');assert.equal(r.code,1);assert.equal(r.closed_code,'complete065_existing_schema_refused');assert.equal((await admin.query('SELECT id FROM public.complete_install_owned_sentinel')).rows[0].id,1);assert.deepEqual(await counts(),{schemas:0,roles:0});step('existing_objects_refused_without_cleanup_or_application_ddl')
  // Fixture removes only its own just-created sentinel; product never does.
  await admin.query('DROP TABLE public.complete_install_owned_sentinel')
  phase('failed_child_no_replay');r=await command('--install',{AGENT_STUDIO_BAOTA_PG_API_PASSWORD_FILE:stage.input+'/not-created.secret'});assert.equal(r.code,0);assert.equal(r.value.invocation_commit_acknowledged,false);assert.equal(r.value.commit_unknown,true);assert.equal(r.value.state,'empty');assert.deepEqual(await counts(),{schemas:0,roles:0});step('failed_owned_child_leaves_actual_empty_target_and_never_retries')
  phase('complete_fresh_installation')
  r=await command('--install');assert.equal(r.code,0);assert.equal(r.value.invocation_commit_acknowledged,true);assert.equal(r.value.state,'schema_installed_inert');assert.equal(r.value.actual_login_audit_required,true);assert.equal(r.value.production_cutover_allowed,false)
  const before=(await admin.query('SELECT version,description FROM agentstudio.schema_migrations ORDER BY version')).rows;assert.ok(before.some(v=>v.version==='pg_v9_065'));assert.ok(before.some(v=>v.version==='pg18_complete_065_001'));assert.equal(before.length,loaded.complete.versions.length+2)
  const logins=(await admin.query("SELECT rolname FROM pg_roles WHERE rolname LIKE 'agentstudio_%' AND rolcanlogin")).rows;assert.deepEqual(logins,[]);step('one_actual_fresh_transaction_installs_all49_sources_through065_and_leaves_logins_inert',{source_count:49,versions:before.length})
  phase('original_receipt_recovery');r=await command('--install');assert.equal(r.code,0);assert.equal(r.value.already_installed,true);assert.equal(r.value.writes_performed,false);assert.deepEqual((await admin.query('SELECT version,description FROM agentstudio.schema_migrations ORDER BY version')).rows,before);step('original_source_receipt_recovery_does_not_replay_installation')
  phase('inert_api_login_refusal')
  r=await command('--verify');assert.equal(r.code,1);step('unactivated_actual_api_login_cannot_be_fabricated_by_admin')
  // Explicit synthetic fixture activation of only the original API LOGIN.
  phase('independent_actual_api_login_audit');assert.match(apiPassword,/^[a-f0-9]{80}$/);await admin.query('ALTER ROLE agentstudio_stage_login LOGIN')
  r=await command('--verify');assert.equal(r.code,0);assert.equal(r.value.actual_api_login_verified,true);assert.equal(r.value.full_catalog_audit_verified,true);assert.equal(r.value.feature_activation_authorized,false);assert.equal(r.value.production_cutover_allowed,false);step('separate_actual_api_login_passes_full065_to059_predecessor_catalog_chain')
  phase('extra_api_membership_refusal');await admin.query('GRANT agentstudio_worker TO agentstudio_stage_login')
  r=await command('--verify');assert.equal(r.code,1);await admin.query('REVOKE agentstudio_worker FROM agentstudio_stage_login');r=await command('--verify');assert.equal(r.code,0);step('extra_api_membership_refused_then_original_exact_membership_verified')
  console.log(JSON.stringify({event:'complete065_actual_summary',passed:8,actual_cli:true,actual_pg18:true,actual_login_audit:true,all_services_started:false,backup_restore_verified:false,employee_UAT:false,qualifying24h:false,production_GO:false}))
 }finally{await admin.end()}
}
if(process.argv[1]&&path.resolve(process.argv[1])===here){try{await runCompleteInstallFixture(process.argv.slice(2))}catch(error){const raw=Object.getOwnPropertyDescriptor(error??{},'message')?.value;console.error(JSON.stringify({event:'complete065_actual_failure',code:typeof raw==='string'&&/^(?:complete_[a-z0-9_:]+|unsafe_[a-z0-9_]+)$/.test(raw)?raw:'actual_assertion_or_operation_failed',production_GO:false}));process.exitCode=1}}
