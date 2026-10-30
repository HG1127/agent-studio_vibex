// Independent new-job ownership boundary. No old guard override or target args.
import fs from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import {randomBytes} from 'node:crypto'
import {execFileSync,spawnSync} from 'node:child_process'
import {completeProfileCiBinding} from './pg18-complete-install-ci-guard.mjs'
import {assertVerifiedCompleteProfileStage} from './pg18-complete-install-ci-stage.mjs'
const image='pgvector/pgvector:0.8.7-pg18',job='pg18-complete-install',leases=new WeakMap(),targets=new WeakMap()
let dockerConfig
const fail=code=>{throw Error('complete_install_container_refused:'+code)},hex=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value)
const runtimePoolPhases=Object.freeze(['private_target_reference','verified_stage_runtime','container_inspect','ownership_pool_construct','ownership_query','ownership_pool_end','runtime_login_validation','runtime_pool_construct','runtime_pool_error_handler'])
const runtimePoolErrorCodes=Object.freeze([
 'complete_install_container_refused:private_target_reference_required','complete_install_container_refused:full_container_id',
 'complete_install_container_refused:identity','complete_install_container_refused:private_docker_config_required',
 'complete_install_container_refused:bounded_docker_operation','complete_install_container_refused:owner_changed','complete_install_container_refused:fixture_runtime_login',
 'complete_install_stage_refused:verified_stage_reference_required','descriptive_patch_operator_runtime_refused','descriptive_patch_operator_source_refused',
 'ENOENT','EACCES','ERR_MODULE_NOT_FOUND','ECONNREFUSED','ECONNRESET','ETIMEDOUT',
])
// Pure closed diagnostic formatter: no message/stack/SQL/parameters are echoed.
export function completeProfileRuntimePoolDiagnostic(phase,error){
 let code,message
 try{code=Object.getOwnPropertyDescriptor(error,'code')?.value;message=Object.getOwnPropertyDescriptor(error,'message')?.value}catch{}
 return Object.freeze({diagnostic:'descriptive_install_ci_runtime_pool_failure_v1',phase:runtimePoolPhases.includes(phase)?phase:'unknown_phase',
  sqlstate:typeof code==='string'&&/^[A-Z0-9]{5}$/.test(code)?code:'no_sqlstate',
  error_code:runtimePoolErrorCodes.includes(code)?code:runtimePoolErrorCodes.includes(message)?message:'operation_failed'})
}
const env=()=>({PATH:'/usr/local/bin:/usr/bin:/bin',HOME:'/root',LANG:'C.UTF-8'})
function command(args,{input,extraEnv={},timeout=120000}={}){if(!dockerConfig)fail('private_docker_config_required');try{return execFileSync('/usr/bin/docker',['--config',dockerConfig,...args],{env:{...env(),...extraEnv},input,timeout,maxBuffer:128*1024*1024,windowsHide:true})}catch{fail('bounded_docker_operation')}}
function configure(loaded,create=false){assertVerifiedCompleteProfileStage(loaded);const dir=loaded.stageInput+'/docker-config';if(create)fs.mkdirSync(dir,{mode:0o700});const s=fs.lstatSync(dir);if(!s.isDirectory()||s.isSymbolicLink()||s.uid!==0||s.gid!==0||(s.mode&0o7777)!==0o700)fail('private_docker_config');dockerConfig=dir}
function installContainerSpec(binding,nonce,kind){
 if(!['main','restore'].includes(kind)||!hex(nonce))fail('spec')
 return Object.freeze({kind,port:kind==='main'?5333:5334,db:'agent_studio',name:'agentstudio-complete-install-'+kind+'-'+binding.run+'-'+binding.attempt+'-'+nonce.slice(0,16),pgdata:'/var/lib/postgresql/complete-install-'+kind+'-'+nonce.slice(0,16),cluster:'ci-complete-'+kind+'-'+nonce.slice(0,24)})
}
function inspect(id,spec,binding,nonce,imageId,{running=true}={}){
 if(!hex(id))fail('full_container_id')
 const rows=JSON.parse(command(['inspect',id])),c=rows[0],h=c?.HostConfig,l=c?.Config?.Labels??{}
 if(rows.length!==1||c.Id!==id||c.Name!=='/'+spec.name||c.Image!==imageId||c.Config.Image!==imageId||running&&!c.State?.Running||h?.NetworkMode!=='host'||h.Privileged!==false||h.PublishAllPorts!==false||(h.Binds??[]).length||(h.Devices??[]).length||(h.VolumesFrom??[]).length||(h.CapAdd??[]).length||Object.keys(h.PortBindings??{}).length||!['','private'].includes(h.PidMode)||
  JSON.stringify(Object.keys(h.Tmpfs??{}).sort())!==JSON.stringify(['/run','/var/lib/postgresql'])||!Array.isArray(c.Mounts)||c.Mounts.some(m=>m.Type!=='tmpfs'||!['/run','/var/lib/postgresql'].includes(m.Destination))||JSON.stringify(c.Config.Entrypoint)!==JSON.stringify(['docker-entrypoint.sh'])||JSON.stringify(c.Config.Cmd)!==JSON.stringify(['postgres','-p',String(spec.port),'-c','listen_addresses=127.0.0.1','-c','cluster_name='+spec.cluster])||
  !Object.entries({run:binding.run,attempt:binding.attempt,job,nonce,purpose:spec.kind}).every(([key,value])=>l['org.agentstudio.complete-install.'+key]===value)||!['POSTGRES_USER=postgres','POSTGRES_DB='+spec.db,'PGDATA='+spec.pgdata].every(value=>c.Config.Env.includes(value)))fail('identity')
 return c
}
async function freePort(port){await new Promise((resolve,reject)=>{const s=net.createServer();s.once('error',()=>reject(Error('complete_install_container_refused:existing_port')));s.listen({host:'127.0.0.1',port,exclusive:true},()=>s.close(resolve))})}
export async function createCompleteProfileContainers(permit,loaded){
 const b=completeProfileCiBinding(permit);if(b.kind!=='provision')fail('provision_permit');assertVerifiedCompleteProfileStage(loaded)
 configure(loaded,true)
 for(const port of [5333,5334])await freePort(port)
 const nonce=loaded.stageNonce,password=randomBytes(40).toString('hex'),file=loaded.stageInput+'/admin.secret'
 const fd=fs.openSync(file,fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_NOFOLLOW|fs.constants.O_WRONLY,0o600)
 try{fs.writeFileSync(fd,password);fs.fchmodSync(fd,0o600);fs.fsyncSync(fd)}finally{fs.closeSync(fd)}
 command(['pull',image],{timeout:300000});const images=JSON.parse(command(['image','inspect',image])),imageId=images[0]?.Id
 if(images.length!==1||!/^sha256:[a-f0-9]{64}$/.test(imageId??''))fail('image')
 const lease=Object.freeze({}),state={binding:b,nonce,imageId,created:[],loaded,password};leases.set(lease,state)
 try{for(const kind of ['main','restore']){
  const spec=installContainerSpec(b,nonce,kind),existing=command(['ps','--all','--quiet','--filter','name=^/'+spec.name+'$']).toString().trim();if(existing)fail('existing_named_container')
  const args=['run','--detach','--name',spec.name,'--network','host','--tmpfs','/var/lib/postgresql:rw,nosuid,nodev,size=768m','--tmpfs','/run:rw,nosuid,nodev,size=32m']
  for(const[key,value]of Object.entries({run:b.run,attempt:b.attempt,job,nonce,purpose:kind}))args.push('--label','org.agentstudio.complete-install.'+key+'='+value)
  args.push('--env','POSTGRES_USER=postgres','--env','POSTGRES_DB='+spec.db,'--env','POSTGRES_PASSWORD','--env','PGDATA='+spec.pgdata,imageId,'postgres','-p',String(spec.port),'-c','listen_addresses=127.0.0.1','-c','cluster_name='+spec.cluster)
  const id=command(args,{extraEnv:{POSTGRES_PASSWORD:password}}).toString().trim();if(!hex(id))fail('created_id');state.created.push({id,spec})
  const until=Date.now()+120000;let ready=false
  while(Date.now()<until){inspect(id,spec,b,nonce,imageId);const p=spawnSync('/usr/bin/docker',['--config',dockerConfig,'exec',id,'pg_isready','--host=127.0.0.1','--port='+spec.port,'--username=postgres','--dbname='+spec.db],{env:env(),timeout:5000,stdio:'ignore',windowsHide:true});if(p.status===0){ready=true;break}await new Promise(done=>setTimeout(done,250))}
  if(!ready)fail('readiness_timeout')
  const control=command(['exec','--user','postgres','--env','LC_ALL=C',id,'pg_controldata',spec.pgdata]).toString('utf8'),system=/^Database system identifier:\s*([1-9][0-9]{0,19})\s*$/m.exec(control)?.[1]
  if(!system)fail('created_control_identity');state.created.at(-1).system=system
 }}catch(error){try{await closeCompleteProfileContainers(lease)}catch{}throw error}
 return Object.freeze({lease,mainId:state.created[0].id,restoreId:state.created[1].id,imageId})
}
export async function closeCompleteProfileContainers(lease){
 const s=leases.get(lease);if(!s)fail('created_lease_required')
 assertVerifiedCompleteProfileStage(s.loaded)
 for(const {id,spec,system}of [...s.created].reverse()){
  const c=inspect(id,spec,s.binding,s.nonce,s.imageId,{running:false})
  if(c.State?.Running){
   const pool=new s.loaded.Pool({host:'127.0.0.1',port:spec.port,database:'postgres',user:'postgres',password:s.password,max:1,connectionTimeoutMillis:5000});pool.on('error',()=>{})
   try{const r=(await pool.query("SELECT (pg_control_system()).system_identifier::text AS system_id,session_user AS login,inet_server_port() AS port,current_setting('data_directory') AS data,current_setting('cluster_name') AS cluster,(SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname='agent_studio') AS owner")).rows[0];if(!r||system&&r.system_id!==system||r.login!=='postgres'||r.port!==spec.port||r.data!==spec.pgdata||r.cluster!==spec.cluster||r.owner!==null&&r.owner!=='postgres')fail('cleanup_actual_owner')}finally{await pool.end()}
  }
  command(['rm','--force','--volumes',id])
 }
 leases.delete(lease)
}
export async function attestCompleteProfileTargets(permit,loaded){
 const b=completeProfileCiBinding(permit);if(b.kind!=='fixture')fail('fixture_permit');assertVerifiedCompleteProfileStage(loaded)
 configure(loaded)
 const file=loaded.stageInput+'/admin.secret',st=fs.lstatSync(file)
 if(!st.isFile()||st.isSymbolicLink()||st.uid!==0||st.gid!==0||st.nlink!==1||(st.mode&0o7777)!==0o600||st.size!==80)fail('private_synthetic_secret')
 const password=fs.readFileSync(file,'utf8');if(!/^[a-f0-9]{80}$/.test(password))fail('synthetic_secret_shape')
 const result={}
 for(const kind of ['main','restore']){
  const spec=installContainerSpec(b,b.nonce,kind),id=kind==='main'?b.mainId:b.restoreId,c=inspect(id,spec,b,b.nonce,b.imageId)
  if(!c.Config.Env.includes('POSTGRES_PASSWORD='+password))fail('container_credential_binding')
  const control=command(['exec','--user','postgres','--env','LC_ALL=C',id,'pg_controldata',spec.pgdata]).toString('utf8'),system=/^Database system identifier:\s*([1-9][0-9]{0,19})\s*$/m.exec(control)?.[1]
  if(!system)fail('control_identity')
  const pool=new loaded.Pool({host:'127.0.0.1',port:spec.port,database:spec.db,user:'postgres',password,ssl:false,options:'',max:1,connectionTimeoutMillis:5000,statement_timeout:45000});pool.on('error',()=>{})
  let row
  try{row=(await pool.query("SELECT current_database() AS db,session_user AS login,current_user AS actor,host(inet_server_addr()) AS address,inet_server_port() AS port,current_setting('server_version_num')::integer AS version,current_setting('server_encoding') AS encoding,(SELECT rolsuper FROM pg_roles WHERE rolname=session_user) AS super,(SELECT datallowconn AND NOT datistemplate AND datconnlimit=-1 FROM pg_database WHERE datname=current_database()) AS normal_database,current_setting('data_directory') AS data,current_setting('cluster_name') AS cluster,pg_postmaster_start_time() AS started,(pg_control_system()).system_identifier::text AS system_id,(SELECT oid::text FROM pg_database WHERE datname=current_database()) AS oid,(SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname=current_database()) AS owner,(SELECT count(*)::integer FROM pg_namespace WHERE nspname IN('agentstudio','agentstudio_auth')) AS schemas,(SELECT count(*)::integer FROM pg_roles WHERE rolname !~ '^pg_') AS roles,(SELECT count(*)::integer FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname<>'information_schema') AS objects,(SELECT count(*)::integer FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname<>'information_schema') AS functions,(SELECT count(*)::integer FROM pg_extension WHERE extname<>'plpgsql') AS extensions")).rows[0]}finally{await pool.end()}
  const started=Date.parse(row?.started),created=Date.parse(c.Created)
  if(!row||row.db!==spec.db||row.owner!=='postgres'||row.login!=='postgres'||row.actor!=='postgres'||row.address!=='127.0.0.1'||row.port!==spec.port||row.version<180000||row.version>=190000||row.data!==spec.pgdata||row.cluster!==spec.cluster||row.system_id!==system||!/^\d+$/.test(row.oid)||row.encoding!=='UTF8'||row.super!==true||row.normal_database!==true||row.schemas!==0||row.roles!==1||row.objects!==0||row.functions!==0||row.extensions!==0||!Number.isFinite(started)||started<created-5000||started>Date.now()+2000||Date.now()-started>300000)fail('genuine_fresh_database')
  const target=Object.freeze({kind,port:spec.port,database:spec.db,systemIdentifier:system,databaseOid:row.oid,id});targets.set(target,{b,spec,id,password,loaded,system,oid:row.oid});result[kind]=target
 }
 if(result.main.systemIdentifier===result.restore.systemIdentifier)fail('independent_system_identifiers')
 return Object.freeze(result)
}
// Read-only same-cohort assertion. Private original references only; no Docker,
// connection, filesystem mutation, target DTO, callback or authority is created.
export function assertOwnedCompleteProfileCohort(permit,loaded,target){
 const b=completeProfileCiBinding(permit),s=targets.get(target)
 if(!s)fail('private_target_reference_required');assertVerifiedCompleteProfileStage(loaded)
 const input='/root/agentstudio-complete-install-input/'+b.run+'-'+b.attempt+'-'+b.nonce,keys=['kind','run','attempt','nonce','profileSha','mainId','restoreId','imageId','sourceManifestSha','runtimeManifestSha']
 if(b.kind!=='fixture'||s.loaded!==loaded||keys.some(k=>s.b[k]!==b[k])||loaded.stageNonce!==b.nonce||loaded.stageInput!==input||loaded.tree!==input+'/tree'||loaded.profileSha!==b.profileSha||s.spec.kind!=='main'||s.spec.port!==5333||s.spec.db!=='agent_studio'||s.id!==b.mainId||target.id!==s.id||target.kind!==s.spec.kind||target.port!==s.spec.port||target.database!==s.spec.db||target.systemIdentifier!==s.system||target.databaseOid!==s.oid)fail('cohort_reference_mismatch')
 return true
}
async function owned(target,trace){
 const mark=phase=>{if(trace)trace.phase=phase}
 mark('private_target_reference')
 const s=targets.get(target);if(!s)fail('private_target_reference_required')
 mark('verified_stage_runtime');assertVerifiedCompleteProfileStage(s.loaded)
 mark('container_inspect');inspect(s.id,s.spec,s.b,s.b.nonce,s.b.imageId)
 mark('ownership_pool_construct')
 const pool=new s.loaded.Pool({host:'127.0.0.1',port:s.spec.port,database:'postgres',user:'postgres',password:s.password,max:1,connectionTimeoutMillis:5000});pool.on('error',()=>{})
 let verified=false
 try{mark('ownership_query');const r=(await pool.query("SELECT (pg_control_system()).system_identifier::text AS system_id,inet_server_port() AS port,current_setting('data_directory') AS data,current_setting('cluster_name') AS cluster,session_user AS login,(SELECT oid::text FROM pg_database WHERE datname='agent_studio') AS oid,(SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname='agent_studio') AS owner")).rows[0];if(r.system_id!==s.system||r.port!==s.spec.port||r.data!==s.spec.pgdata||r.cluster!==s.spec.cluster||r.login!=='postgres'||r.oid!==s.oid||r.owner!=='postgres')fail('owner_changed');verified=true}finally{if(verified)mark('ownership_pool_end');await pool.end()}
 return s
}
export async function ownedCompleteProfilePool(target,max=2){const s=await owned(target);if(![1,2,4].includes(max))fail('pool_bound');const pool=new s.loaded.Pool({host:'127.0.0.1',port:s.spec.port,database:'agent_studio',user:'postgres',password:s.password,ssl:false,options:'',max,connectionTimeoutMillis:5000,statement_timeout:45000,query_timeout:50000});pool.on('error',()=>{});return pool}
export async function ownedCompleteProfileArchive(target,operation,input){
 const s=await owned(target),commands={dump:['pg_dump','--format=custom','--create','--dbname=agent_studio'],globals:['pg_dumpall','--roles-only','--no-role-passwords'],restore_globals:['psql','--no-psqlrc','--set=ON_ERROR_STOP=on','--dbname=postgres']},selected=commands[operation]
 if(!Object.hasOwn(commands,operation)||operation==='restore_globals'&&(!Buffer.isBuffer(input)||input.length>8*1024*1024)||operation!=='restore_globals'&&input!==undefined)fail('closed_archive_operation')
 return command(['exec','--interactive','--user','postgres','--env','PGPASSWORD='+s.password,s.id,selected[0],'--host=127.0.0.1','--port='+s.spec.port,'--username=postgres',...selected.slice(1)],{input})
}
export async function ownedCompleteProfileRuntimePool(target,login,password){
 const trace={phase:'private_target_reference'}
 try{
  const s=await owned(target,trace)
  trace.phase='runtime_login_validation'
  if(!['agentstudio_stage_login'].includes(login)||!/^\w{80}$/.test(password)||!/^[a-f0-9]{80}$/.test(password))fail('fixture_runtime_login')
  trace.phase='runtime_pool_construct'
  const pool=new s.loaded.Pool({host:'127.0.0.1',port:s.spec.port,database:'agent_studio',user:login,password,ssl:false,options:'',max:1,connectionTimeoutMillis:5000,statement_timeout:45000})
  trace.phase='runtime_pool_error_handler';pool.on('error',()=>{});return pool
 }catch(error){try{process.stderr.write(JSON.stringify(completeProfileRuntimePoolDiagnostic(trace.phase,error))+'\n')}catch{}throw error}
}

// Only the newly owned disposable main container. No production HBA path or
// caller-supplied rule is accepted; this does not alter the original guards.
export async function configureOwnedCompleteServiceHba(target,scenario='reviewed'){
 const s=await owned(target)
 if(s.spec.kind!=='main'||s.spec.port!==5333||!['reviewed','earlier-trust-negative','review-worker','review-worker-earlier-trust-negative','executor','executor-earlier-trust-negative','plan-workflow','plan-workflow-earlier-trust-negative'].includes(scenario))fail('service_hba_target')
 const logins=['agentstudio_stage_login','agentstudio_native_login','agentstudio_stage_worker','agentstudio_bound_dispatch_login','agentstudio_model_broker_login','agentstudio_knowledge_index_worker_login','agentstudio_knowledge_index_broker_login']
 const lines=['local all postgres peer',...logins.map(n=>'local agent_studio '+n+' reject'),'local all all reject','host all postgres 127.0.0.1/32 scram-sha-256',...logins.map(n=>'host agent_studio '+n+' 127.0.0.1/32 scram-sha-256'),'host all all 0.0.0.0/0 reject','host all all ::/0 reject']
 if(['review-worker','review-worker-earlier-trust-negative','executor','executor-earlier-trust-negative'].includes(scenario))lines.unshift('local all agentstudio_review_worker_login reject','host agent_studio agentstudio_review_worker_login 127.0.0.1/32 scram-sha-256','host all agentstudio_review_worker_login 0.0.0.0/0 reject','host all agentstudio_review_worker_login ::/0 reject')
 if(['executor','executor-earlier-trust-negative'].includes(scenario))lines.unshift('local all agentstudio_local_executor_login reject','host agent_studio agentstudio_local_executor_login 127.0.0.1/32 scram-sha-256','host all agentstudio_local_executor_login 0.0.0.0/0 reject','host all agentstudio_local_executor_login ::/0 reject')
 if(['plan-workflow','plan-workflow-earlier-trust-negative'].includes(scenario))for(const name of ['review_worker','local_executor','review_dispatch','design_worker','design_dispatch','plan_workflow_worker','plan_workflow_dispatch']){const login='agentstudio_'+name+'_login';lines.unshift('local all '+login+' reject','host agent_studio '+login+' 127.0.0.1/32 scram-sha-256','host all '+login+' 0.0.0.0/0 reject','host all '+login+' ::/0 reject')}
 if(scenario==='plan-workflow-earlier-trust-negative')lines.unshift('host all agentstudio_plan_workflow_worker_login 127.0.0.1/32 trust')
 if(scenario==='executor-earlier-trust-negative')lines.unshift('host all agentstudio_local_executor_login 127.0.0.1/32 trust')
 if(scenario==='review-worker-earlier-trust-negative')lines.unshift('host all agentstudio_review_worker_login 127.0.0.1/32 trust')
 if(scenario==='earlier-trust-negative')lines.unshift('host all all 127.0.0.1/32 trust')
 command(['exec','--interactive','--user','postgres',s.id,'sh','-c','umask 077; cat > "$PGDATA/pg_hba.conf"'],{input:Buffer.from(lines.join('\n')+'\n')})
 const pool=await ownedCompleteProfilePool(target,1)
 try{
  const before=(await pool.query('SELECT pg_conf_load_time()::text AS loaded')).rows[0]?.loaded
  if((await pool.query('SELECT pg_reload_conf() AS reloaded')).rows[0]?.reloaded!==true)fail('service_hba_reload')
  const until=Date.now()+5000;let changed=false
  while(Date.now()<until){if((await pool.query('SELECT pg_conf_load_time()::text AS loaded')).rows[0]?.loaded!==before){changed=true;break}await new Promise(done=>setTimeout(done,100))}
  if(!changed)fail('service_hba_reload_timeout')
 }finally{await pool.end()}
}

// Independent fixed Review/Design continuation; original HBA helper unchanged.
// Only the attested newly owned main target accepts these fixed rules.
export async function configureOwnedCompleteReviewStackHba(target,scenario='reviewed'){
 const s=await owned(target)
 if(s.spec.kind!=='main'||s.spec.port!==5333||!['reviewed','earlier-trust-negative'].includes(scenario))fail('review_stack_hba_target')
 const old=['agentstudio_stage_login','agentstudio_native_login','agentstudio_stage_worker','agentstudio_bound_dispatch_login','agentstudio_model_broker_login','agentstudio_knowledge_index_worker_login','agentstudio_knowledge_index_broker_login'],next=['agentstudio_review_worker_login','agentstudio_local_executor_login','agentstudio_review_dispatch_login','agentstudio_design_worker_login','agentstudio_design_dispatch_login']
 const reviewRules=[...next.flatMap(n=>['local all '+n+' reject','host agent_studio '+n+' 127.0.0.1/32 scram-sha-256','host all '+n+' 0.0.0.0/0 reject','host all '+n+' ::/0 reject']),'local all postgres peer',...old.map(n=>'local agent_studio '+n+' reject'),'local all all reject','host all postgres 127.0.0.1/32 scram-sha-256',...old.map(n=>'host agent_studio '+n+' 127.0.0.1/32 scram-sha-256'),'host all all 0.0.0.0/0 reject','host all all ::/0 reject']
 if(scenario==='earlier-trust-negative')reviewRules.unshift('host all agentstudio_review_dispatch_login 127.0.0.1/32 trust')
 command(['exec','--interactive','--user','postgres',s.id,'sh','-c','umask 077; cat > "$PGDATA/pg_hba.conf"'],{input:Buffer.from(reviewRules.join('\n')+'\n')})
 const pool=await ownedCompleteProfilePool(target,1)
 try{
  const before=(await pool.query('SELECT pg_conf_load_time()::text AS loaded')).rows[0]?.loaded
  if((await pool.query('SELECT pg_reload_conf() AS reloaded')).rows[0]?.reloaded!==true)fail('review_stack_hba_reload')
  const until=Date.now()+5000;let changed=false
  while(Date.now()<until){if((await pool.query('SELECT pg_conf_load_time()::text AS loaded')).rows[0]?.loaded!==before){changed=true;break}await new Promise(done=>setTimeout(done,100))}
  if(!changed)fail('review_stack_hba_reload_timeout')
 }finally{await pool.end()}
}

export async function restoreOwnedCompleteProfileDatabase(target,dump){
 const s=await owned(target);if(!Buffer.isBuffer(dump)||dump.length<1||dump.length>128*1024*1024)fail('archive_input')
 const maintenance=new s.loaded.Pool({host:'127.0.0.1',port:s.spec.port,database:'postgres',user:'postgres',password:s.password,max:1});maintenance.on('error',()=>{})
 try{await maintenance.query('DROP DATABASE "agent_studio" WITH (FORCE)')}finally{await maintenance.end()}
 command(['exec','--interactive','--user','postgres','--env','PGPASSWORD='+s.password,s.id,'pg_restore','--host=127.0.0.1','--port='+s.spec.port,'--username=postgres','--exit-on-error','--create','--dbname=postgres'],{input:dump})
 const p=new s.loaded.Pool({host:'127.0.0.1',port:s.spec.port,database:'postgres',user:'postgres',password:s.password,max:1});p.on('error',()=>{})
 try{const r=(await p.query("SELECT oid::text AS oid,pg_get_userbyid(datdba) AS owner FROM pg_database WHERE datname='agent_studio'")).rows[0];if(!r||r.owner!=='postgres'||!/^\d+$/.test(r.oid))fail('restored_owner');s.oid=r.oid}finally{await p.end()}
 await owned(target)
}
