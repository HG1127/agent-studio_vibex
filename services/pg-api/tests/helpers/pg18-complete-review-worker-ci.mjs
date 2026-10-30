// New-purpose hosted synthetic continuation. All mutations go through the
import {finalPathCiSidecarsEnabled,captureFinalPathCiCommand} from './pg18-full069-final-path-ci-sidecars.mjs'
// actual root preparer CLI; direct negative mutations are confined to the
// attested newly owned PG18 target and restored before positive proof.
import fs from 'node:fs'
import path from 'node:path'
import {spawn,execFileSync} from 'node:child_process'
import {createHash,randomBytes,randomUUID,X509Certificate} from 'node:crypto'
import {requireCompleteProfileFixtureCi} from './pg18-complete-install-ci-guard.mjs'
import {assertVerifiedCompleteProfileStage} from './pg18-complete-install-ci-stage.mjs'
import {ownedCompleteProfilePool,configureOwnedCompleteServiceHba} from './pg18-complete-install-ci-containers.mjs'
const sha=b=>createHash('sha256').update(b).digest('hex'),fail=c=>{throw Error('complete_service_review_worker_'+c)}
const login='agentstudio_review_worker_login',group='agentstudio_review_worker'
function privateFile(file,bytes,uid=0,gid=0){const fd=fs.openSync(file,fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_NOFOLLOW|fs.constants.O_WRONLY,0o400);try{fs.writeFileSync(fd,bytes);fs.fchownSync(fd,uid,gid);fs.fchmodSync(fd,0o400);fs.fsyncSync(fd)}finally{fs.closeSync(fd)}}
async function child(file,args,env,options={},discard=false){const finalPathCaptured=[];
 return new Promise((resolve,reject)=>{
  const p=spawn(process.execPath,['--experimental-strip-types',file,...args],{env,stdio:['ignore','pipe','pipe'],windowsHide:true,...options});let stdout='',stderr='',bytes=0,stopping=false,killer
  const stop=()=>{stopping=true;p.kill('SIGTERM');killer=setTimeout(()=>p.kill('SIGKILL'),5000)},timer=setTimeout(stop,150000)
  p.stdout.on('data',b=>{bytes+=b.length;if(bytes>65536){stop();return}if(finalPathCiSidecarsEnabled()&&!discard)finalPathCaptured.push(Buffer.from(b));if(!discard)stdout+=b});p.stderr.on('data',b=>{bytes+=b.length;if(bytes>65536){stop();return}stderr+=b})
  p.once('error',()=>{clearTimeout(timer);reject(Error('complete_service_review_worker_child_start'))});p.once('close',code=>{clearTimeout(timer);if(killer)clearTimeout(killer);if(stopping)return reject(Error('complete_service_review_worker_child_bound'));let report;try{report=stdout.trim()?JSON.parse(stdout):null}catch{return reject(Error('complete_service_review_worker_child_report'))}const refusal=/\bcomplete069_review_worker_(?:[a-z_]+|sqlstate_[0-9A-Z]{5})\b/.exec(stderr)?.[0]??null;console.log(JSON.stringify({event:'complete069_review_worker_actual_cli_result',phase:file.endsWith('/agent-assessment-service.ts')?'original_preflight_worker':args[0]==='--inspect-operation'?'inspect_operation':'prepare',exit:Number.isSafeInteger(code)?code:null,refusal,reported_refusal:typeof report?.refusal_code==='string'&&/^complete069_review_worker_(?:[a-z_]+|sqlstate_[0-9A-Z]{5})$/.test(report.refusal_code)?report.refusal_code:null,verified:report?.verified===true,output_deliberately_discarded:discard,production_GO:false}));if(finalPathCiSidecarsEnabled())try{captureFinalPathCiCommand(file,args,env,code,discard?null:Buffer.concat(finalPathCaptured),discard)}catch(error){return reject(error)};resolve({code,report,refusal})})
 })
}
async function originalReadOnlyCli(loaded,password){
 assertVerifiedCompleteProfileStage(loaded)
 const dest='/var/lib/agentstudio-complete-review-preflight-'+loaded.stageNonce,credentials='/run/credentials/agentstudio-pg18-review-worker.service',scratch=loaded.stageInput+'/review-preflight-tls',uid=65534,gid=65534
 if(!/^[a-f0-9]{64}$/.test(loaded.stageNonce)||[dest,credentials,scratch].some(p=>fs.existsSync(p)))fail('existing_preflight_path')
 const roots=new Map(),remember=p=>{const s=fs.lstatSync(p);if(!s.isDirectory()||s.isSymbolicLink())fail('owned_directory');roots.set(p,{dev:s.dev,ino:s.ino})}
 try{
  for(const p of ['/','/var','/var/lib','/run','/run/credentials']){if(!fs.existsSync(p)&&p==='/run/credentials')fs.mkdirSync(p,{mode:0o755});const s=fs.lstatSync(p);if(!s.isDirectory()||s.isSymbolicLink()||s.uid!==0||s.gid!==0||(s.mode&0o7777)!==0o755)fail('preflight_parent')}
  fs.mkdirSync(dest,{mode:0o755});remember(dest)
  const copy=(from,to)=>{for(const name of fs.readdirSync(from).sort()){const a=path.join(from,name),b=path.join(to,name),s=fs.lstatSync(a);if(s.isSymbolicLink()||s.uid!==0||s.gid!==0||(s.mode&0o022)!==0)fail('preflight_source');if(s.isDirectory()){fs.mkdirSync(b,{mode:0o755});copy(a,b);fs.chmodSync(b,0o555)}else if(s.isFile()&&s.nlink===1){const bytes=fs.readFileSync(a);fs.writeFileSync(b,bytes,{flag:'wx',mode:0o444});if(sha(fs.readFileSync(b))!==sha(bytes))fail('preflight_source_copy')}else fail('preflight_source_kind')}};copy(loaded.tree,dest);fs.chmodSync(dest,0o555)
  for(const f of loaded.complete.manifest.sources)if(sha(fs.readFileSync(dest+'/'+f.path))!==f.sha256)fail('preflight_source_binding')
  fs.mkdirSync(scratch,{mode:0o700});remember(scratch)
  const openssl=args=>execFileSync('/usr/bin/openssl',args,{cwd:scratch,stdio:'ignore',timeout:20000,env:{PATH:'/usr/bin:/bin',LANG:'C.UTF-8'},windowsHide:true})
  openssl(['req','-x509','-newkey','rsa:2048','-nodes','-sha256','-keyout','ca.key','-out','ca.pem','-days','1','-subj','/CN=Disposable full069 Review CA','-addext','basicConstraints=critical,CA:TRUE','-addext','keyUsage=critical,keyCertSign,cRLSign'])
  for(const name of ['server','worker']){
   openssl(['req','-new','-newkey','rsa:2048','-nodes','-keyout',name+'.key','-out',name+'.csr','-subj','/CN=Disposable full069 Review '+name])
   fs.writeFileSync(scratch+'/'+name+'.ext',['basicConstraints=CA:FALSE','keyUsage=digitalSignature,keyEncipherment','extendedKeyUsage='+(name==='server'?'serverAuth':'clientAuth'),...(name==='server'?['subjectAltName=DNS:localhost,IP:127.0.0.1']:[])].join('\n'),{flag:'wx',mode:0o600})
   openssl(['x509','-req','-in',name+'.csr','-CA','ca.pem','-CAkey','ca.key','-CAcreateserial','-out',name+'.pem','-days','1','-sha256','-extfile',name+'.ext'])
  }
  fs.mkdirSync(credentials,{mode:0o700});remember(credentials);fs.chownSync(credentials,uid,gid)
  for(const[name,bytes]of Object.entries({'worker.secret':password,'review-ca.pem':fs.readFileSync(scratch+'/ca.pem'),'review-worker.pem':fs.readFileSync(scratch+'/worker.pem'),'review-worker.key':fs.readFileSync(scratch+'/worker.key')}))privateFile(credentials+'/'+name,bytes,uid,gid)
  const {agentAssessmentApproval}=await loaded.from('services/pg-api/src/agent-assessment-contract.ts')
  const env={PATH:'/usr/local/bin:/usr/bin:/bin',HOME:'/nonexistent',LANG:'C.UTF-8',CREDENTIALS_DIRECTORY:credentials,AGENT_STUDIO_PG18_REVIEW_EXECUTION_ENABLED:'true',AGENT_STUDIO_PG18_REVIEW_EXECUTION_APPROVED:agentAssessmentApproval,AGENT_STUDIO_PG_REVIEW_SERVICE_REVIEWED:'true',AGENT_STUDIO_PG_REVIEW_ORIGIN:'https://127.0.0.1:7459',AGENT_STUDIO_PG_REVIEW_SERVER_FINGERPRINT:new X509Certificate(fs.readFileSync(scratch+'/server.pem')).fingerprint256,AGENT_STUDIO_PG_REVIEW_CLIENT_FINGERPRINT:new X509Certificate(fs.readFileSync(scratch+'/worker.pem')).fingerprint256,AGENT_STUDIO_PG_REVIEW_WORKER_LOGIN:login,AGENT_STUDIO_PG_PILOT_ENABLED:'true',AGENT_STUDIO_PG_BAOTA18_ENABLED:'true',AGENT_STUDIO_PG_BAOTA18_TARGET_CONFIRMED:'true',AGENT_STUDIO_PG_HOST:'127.0.0.1',AGENT_STUDIO_PG_PORT:'5333',AGENT_STUDIO_PG_DATABASE:'agent_studio',AGENT_STUDIO_PG_USER:'agentstudio_stage_login'}
  const result=await child(dest+'/services/pg-api/src/agent-assessment-service.ts',['--preflight','worker'],env,{uid,gid,cwd:dest+'/services/pg-api'})
  if(result.code!==0||result.report?.mode!=='preflight'||result.report.service!=='worker'||result.report.ready!==true||result.report.read_only!==true||result.report.verified_roles!==1||result.report.tls_material_verified!==true||result.report.worker_started!==false||result.report.db_writes_performed!==false||result.report.port_opened!==false||result.report.external_model_calls!==false)fail('original_cli_preflight')
  return true
 }finally{
  for(const[p,identity]of [...roots].reverse()){const s=fs.lstatSync(p);if(!s.isDirectory()||s.isSymbolicLink()||s.dev!==identity.dev||s.ino!==identity.ino)fail('preflight_cleanup_ownership');if(p!==dest&&p!==credentials&&p!==scratch)fail('preflight_cleanup_path');fs.rmSync(p,{recursive:true})}
 }
}
export async function verifyComplete069ReviewWorkerCi(loaded,target,inputs){
 requireCompleteProfileFixtureCi();assertVerifiedCompleteProfileStage(loaded)
 if(!inputs||Object.keys(inputs).sort().join(',')!=='api,stageWorker'||![inputs.api,inputs.stageWorker].every(v=>typeof v==='string'&&/^[a-f0-9]{80}$/.test(v))||target.kind!=='main'||target.port!==5333||target.database!=='agent_studio')fail('fixed_inputs')
 const admin=await ownedCompleteProfilePool(target,1),password=randomBytes(40).toString('hex'),journal=loaded.stageInput+'/review-worker-operation-records',apiFile=loaded.stageInput+'/review-api.secret',passwordFile=loaded.stageInput+'/review-worker.secret'
 const assert=(condition,code)=>{if(!condition)fail(code)},equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b)
 const ledger=async()=>(await admin.query('SELECT version,description FROM agentstudio.schema_migrations ORDER BY version')).rows
 const role=async()=>(await admin.query("SELECT rolcanlogin AS enabled,rolpassword AS verifier FROM pg_authid WHERE rolname='agentstudio_review_worker_login'")).rows[0]
 const image=async()=>{const result=[];for(const table of loaded.complete.tables){assert(/^(?:agentstudio|agentstudio_auth)\.[a-z_]+$/.test(table),'image_table');const q=table.split('.').map(s=>'"'+s+'"').join('.');result.push([table,(await admin.query("SELECT encode(sha256(convert_to(coalesce(jsonb_agg(j ORDER BY j::text),'[]'::jsonb)::text,'UTF8')),'hex') AS hash FROM (SELECT to_jsonb(t) AS j FROM "+q+' t) s')).rows[0].hash])}return result}
 let dedicated,stageWorker
 try{
  assert(await role()===undefined,'preexisting_review_role');const beforeLedger=await ledger(),beforeImage=await image();assert(beforeLedger.length===57&&beforeImage.length===133,'initial_shape')
  fs.mkdirSync(journal,{mode:0o700});privateFile(apiFile,inputs.api);privateFile(passwordFile,password)
  const runtime='AGENT_STUDIO_DESCRIPTIVE_PATCH_060_',env={PATH:'/usr/local/bin:/usr/bin:/bin',HOME:'/root',LANG:'C.UTF-8',AGENT_STUDIO_BAOTA_PG_HOST:'127.0.0.1',AGENT_STUDIO_BAOTA_PG_PORT:'5333',AGENT_STUDIO_BAOTA_PG_DATABASE:'agent_studio',AGENT_STUDIO_BAOTA_PG_ADMIN_USER:'postgres',AGENT_STUDIO_BAOTA_PG_ADMIN_PASSWORD_FILE:loaded.stageInput+'/admin.secret',AGENT_STUDIO_BAOTA_PG_API_PASSWORD_FILE:apiFile,AGENT_STUDIO_COMPLETE_REVIEW_WORKER_ENABLED:'true',AGENT_STUDIO_COMPLETE_REVIEW_WORKER_WRITE_APPROVED:'PREPARE_COMPLETE069_FIXED_REVIEW_WORKER_ONLY',AGENT_STUDIO_COMPLETE_REVIEW_WORKER_PASSWORD_FILE:passwordFile,AGENT_STUDIO_COMPLETE_REVIEW_WORKER_JOURNAL_DIR:journal,[runtime+'RUNTIME_MANIFEST_FILE']:loaded.stageInput+'/runtime-manifest.json',[runtime+'RUNTIME_MANIFEST_SHA256']:sha(fs.readFileSync(loaded.stageInput+'/runtime-manifest.json')),[runtime+'RUNTIME_LOCK_SHA256']:'eb56da11d2713724419f938ef874991fd50fc082dda09837b779ee5841a21c6a'}
  const args=(mode,id)=>[mode,'--profile','complete069','--confirm-database','agent_studio','--expected-source-sha256',loaded.profileSha,'--expected-system-identifier',target.systemIdentifier,'--expected-database-oid',target.databaseOid,'--operation-id',id]
  const command=(mode,id=randomUUID(),patch={},discard=false)=>child(loaded.tree+'/services/pg-api/src/pg18-complete-review-worker-cli.mjs',args(mode,id),{...env,...patch},{},discard)
  await configureOwnedCompleteServiceHba(target,'review-worker')
  let r=await command('--prepare',undefined,{AGENT_STUDIO_COMPLETE_REVIEW_WORKER_WRITE_APPROVED:'false'});assert(r.code===1&&r.refusal==='complete069_review_worker_write_not_approved','missing_approval')
  const bad=args('--prepare',randomUUID());bad[10]=String(Number(target.databaseOid)+1);r=await child(loaded.tree+'/services/pg-api/src/pg18-complete-review-worker-cli.mjs',bad,env);assert(r.code===1&&r.refusal==='complete069_review_worker_predecessor_complete_service_target_refused','wrong_target')
  const wrong=args('--prepare',randomUUID());wrong[6]='0'.repeat(64);r=await child(loaded.tree+'/services/pg-api/src/pg18-complete-review-worker-cli.mjs',wrong,env);assert(r.code===1&&r.refusal==='complete069_review_worker_source_refused','wrong_source')
  r=await command('--prepare',undefined,{AGENT_STUDIO_COMPLETE_REVIEW_WORKER_PASSWORD_FILE:apiFile});assert(r.code===1&&r.refusal==='complete069_review_worker_independent_secret_required','secret_reuse')
  await configureOwnedCompleteServiceHba(target,'review-worker-earlier-trust-negative');r=await command('--prepare');assert(r.code===1&&r.refusal==='complete069_review_worker_hba_refused','earlier_trust');await configureOwnedCompleteServiceHba(target,'review-worker')
  fs.chmodSync(journal,0o755);r=await command('--prepare');assert(r.code===1&&r.refusal==='complete069_review_worker_private_record_required','public_journal');fs.chmodSync(journal,0o700)
  assert(await role()===undefined&&fs.readdirSync(journal).length===0,'negative_mutation_or_record')
  const id=randomUUID();r=await command('--prepare',id,{},true);assert(r.code===0&&r.report===null,'actual_prepare_lost_stdout')
  const prepared=await role(),record=fs.readFileSync(journal+'/'+id+'.result.json'),report=JSON.parse(record)
  assert(prepared.enabled===true&&report.commit_acknowledged===true&&report.actual_login_verified===true&&report.actual_api_catalog_verified===true&&report.migration_ledger_unchanged===true&&report.runtime_authorization===false,'actual_prepare_evidence')
  r=await command('--inspect-operation',id);assert(r.code===0&&r.report.actual_login_verified===true&&r.report.actual_api_catalog_verified===true&&r.report.prior_commit_acknowledged===false&&r.report.writes_performed===false&&r.report.runtime_authorization===false,'readonly_observation')
  r=await command('--prepare',id);assert(r.code===1&&equal(await role(),prepared)&&fs.readFileSync(journal+'/'+id+'.result.json').equals(record),'replay_or_takeover')
  const options=(user,password)=>({host:'127.0.0.1',port:5333,database:'agent_studio',user,password,ssl:false,options:'',max:1,connectionTimeoutMillis:5000,statement_timeout:15000})
  dedicated=new loaded.Pool(options(login,password));stageWorker=new loaded.Pool(options('agentstudio_stage_worker',inputs.stageWorker));for(const p of [dedicated,stageWorker])p.on('error',()=>{})
  const {inspectAgentAssessmentOperatorPool}=await loaded.from('services/pg-api/src/agent-assessment-service.ts'),runtimeTarget={mode:'baota_pg18',host:'127.0.0.1',port:5333,database:'agent_studio',user:login,expectedMajor:18}
  await inspectAgentAssessmentOperatorPool(dedicated,runtimeTarget,'worker')
  let code=null;try{await inspectAgentAssessmentOperatorPool(stageWorker,{...runtimeTarget,user:'agentstudio_stage_worker'},'worker')}catch(error){code=error?.message};assert(code==='agent_assessment_session_role_refused','borrowed_stage_worker')
  await admin.query('ALTER ROLE agentstudio_review_worker_login INHERIT');code=null
  try{await inspectAgentAssessmentOperatorPool(dedicated,runtimeTarget,'worker')}catch(error){code=error?.message}finally{await admin.query('ALTER ROLE agentstudio_review_worker_login NOINHERIT')};assert(code==='agent_assessment_session_role_refused','inherit_not_refused')
  const denied=async(sql,setRole=false)=>{const db=await dedicated.connect();let begun=false;try{await db.query('BEGIN READ ONLY');begun=true;if(setRole)await db.query('SET LOCAL ROLE '+group);let state=null;try{await db.query(sql)}catch(error){state=error?.code};assert(state==='42501','direct_privilege_denial')}finally{if(begun)await db.query('ROLLBACK');db.release()}}
  await denied('SELECT email FROM agentstudio_auth.accounts');await denied('SELECT name FROM agentstudio.agent_specs');await denied('SELECT description FROM agentstudio.schema_migrations',true)
  await inspectAgentAssessmentOperatorPool(dedicated,runtimeTarget,'worker')
  assert(await originalReadOnlyCli(loaded,password),'formal_original_preflight')
  r=await command('--inspect-operation',id);assert(r.code===0&&r.report.actual_login_verified===true&&r.report.actual_api_catalog_verified===true,'final_live_recheck')
  assert(equal(await ledger(),beforeLedger)&&equal(await image(),beforeImage),'all133_images_or_ledger_changed')
  const intent=fs.readFileSync(journal+'/'+id+'.intent.json');assert(!intent.includes(password)&&!intent.includes(inputs.api)&&!record.includes(password)&&!record.includes(inputs.stageWorker),'credential_leak')
  for(const file of fs.readdirSync(journal)){const s=fs.lstatSync(journal+'/'+file);assert(s.uid===0&&s.gid===0&&s.nlink===1&&!s.isSymbolicLink()&&(s.mode&0o7777)===0o600,'record_metadata')}
  assertVerifiedCompleteProfileStage(loaded)
  return {actual_preparation_cli:true,actual_dedicated_login_verified:true,original_assessment_operator_pool_verified:true,original_nonroot_cli_preflight_verified:true,borrowed_stage_worker_refused:true,unsafe_inherit_refused:true,all133_table_images_unchanged:true,ledger57_unchanged:true,prior_commit_acknowledged:false,runtime_authorization:false,worker_process_started:false,actual_pg_commit_ack_loss_injected:false,production_GO:false}
 }finally{for(const p of [stageWorker,dedicated,admin])if(p)await p.end()}
}
