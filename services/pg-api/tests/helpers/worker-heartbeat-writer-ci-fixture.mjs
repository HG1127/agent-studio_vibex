// AUTHORING ONLY until run by the distinct hosted control CI. Import-safe.
// No original heartbeat/060 workflow permit, fake DB access, target or PID input.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import net from 'node:net'
import {request as httpRequest} from 'node:http'
import {fileURLToPath,pathToFileURL} from 'node:url'
import {spawn,execFileSync} from 'node:child_process'
import {randomBytes,randomUUID,createHash,generateKeyPairSync,sign} from 'node:crypto'
import {performance} from 'node:perf_hooks'
import {workerHeartbeatActivationControlCiDescriptor,workerHeartbeatActivationControlCiMainOptions} from './worker-heartbeat-activation-control-ci-guard.mjs'

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../../..')
const paths=Object.freeze({config:'/etc/agentstudio/telemetry-control',store:'/var/lib/agentstudio-telemetry-control',credentials:'/run/credentials/agentstudio-telemetry-control.service',sockets:'/run/agentstudio-telemetry-control',reader:'/run/agentstudio-telemetry-control/reader.sock',ops:'/run/agentstudio-telemetry-control/operator.sock'})
const kinds=['prepare','model','workflow_safe','workflow_v2','agent_autonomous','knowledge_index','knowledge_query','assessment']
const names=['studio_telemetry_owner','studio_telemetry_reader',...kinds.flatMap(k=>[1,2].map(n=>'studio_telemetry_tx_'+k+'_'+n))]
const freshPin='0a3baa8dd28309b5b133c10be944f803d10a71fc5bef1805d26153c69e813a13',baselinePin='af29a65a28c3dbde02bde8723b726f5493886d6d155142bc3bf00fd127be0f58'
const sqlPin='5ed1080d9f7b651ea2ae7fceca09db7f61c679f107e196df13ae201a8f99505f',recordPin='4e1fd93b6217d5cf414189f568d395f48a3e3e54e1ee455e65d28d4717e15143',snapshotPin='17215237dbc5f81ba8fbbb2fd8eae2a9da7e0e0cfa859124ab50f3ccd60671ec'
const sha=b=>createHash('sha256').update(b).digest('hex'),hex=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v),uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v)
const fail=code=>{throw Error('telemetry_control_ci_fixture_refused:'+code)}
function safe(phase,error){let code;try{code=Object.getOwnPropertyDescriptor(error,'code')?.value}catch{}return Error('telemetry_control_ci_fixture_refused:'+phase+':'+(typeof code==='string'&&/^[A-Z0-9]{5}$/.test(code)?code:'NO_SQLSTATE'))}
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms))
async function until(check,phase,ms=20000){const end=performance.now()+ms;do{if(await check())return;await delay(25)}while(performance.now()<end);fail(phase)}
function fields(v,keys){if(!v||typeof v!=='object'||![Object.prototype,null].includes(Object.getPrototypeOf(v))||Reflect.ownKeys(v).length!==keys.length)fail('closed_data');const out={};for(const k of keys){const d=Object.getOwnPropertyDescriptor(v,k);if(!d?.enumerable||!('value'in d))fail('closed_data');out[k]=d.value}return out}
function stamp(s){return {dev:s.dev,ino:s.ino,uid:s.uid,gid:s.gid,mode:s.mode}}
function sameStamp(a,b){return ['dev','ino','uid','gid','mode'].every(k=>a[k]===b[k])}
function read(file,{mode=0o600,max=4194304,pin}={}){
 const a=fs.lstatSync(file);if(!a.isFile()||a.isSymbolicLink()||a.nlink!==1||a.uid!==0||a.gid!==0||(a.mode&0o7777)!==mode||a.size<1||a.size>max||fs.realpathSync(file)!==file)fail('private_file')
 const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW|fs.constants.O_NONBLOCK)
 try{const b=fs.readFileSync(fd),z=fs.fstatSync(fd),last=fs.lstatSync(file);if(!sameStamp(a,z)||!sameStamp(a,last)||a.size!==z.size||a.size!==last.size||a.mtimeMs!==z.mtimeMs||a.ctimeMs!==z.ctimeMs||b.length!==a.size||pin&&sha(b)!==pin)fail('file_changed');return b}finally{fs.closeSync(fd)}
}
function syncDir(dir){const fd=fs.openSync(dir,fs.constants.O_RDONLY|fs.constants.O_DIRECTORY|fs.constants.O_NOFOLLOW);try{fs.fsyncSync(fd)}finally{fs.closeSync(fd)}}
function write(file,value){const bytes=Buffer.isBuffer(value)?value:Buffer.from(value),fd=fs.openSync(file,fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_NOFOLLOW,0o600);try{fs.writeFileSync(fd,bytes);fs.fchmodSync(fd,0o600);fs.fsyncSync(fd)}finally{fs.closeSync(fd)}syncDir(path.dirname(file));if(!read(file).equals(bytes))fail('write_readback')}
function ancestor(dir){let at='/';for(const p of dir.split('/').filter(Boolean)){at=path.join(at,p);if(!fs.existsSync(at))fs.mkdirSync(at,{mode:0o755});const s=fs.lstatSync(at);if(!s.isDirectory()||s.isSymbolicLink()||s.uid!==0||s.gid!==0||(s.mode&0o7022)!==0||fs.realpathSync(at)!==at)fail('root_ancestor')}}
function privateTree(s,dir,mode=0o700,gid=0){ancestor(path.dirname(dir));if(fs.existsSync(dir))fail('existing_fixed_root');fs.mkdirSync(dir,{mode});fs.chownSync(dir,0,gid);fs.chmodSync(dir,mode);const st=fs.lstatSync(dir);if(st.uid!==0||st.gid!==gid||(st.mode&0o7777)!==mode)fail('root_directory');s.ownedDirectories.set(dir,stamp(st))}
function stageBinding(d,ci){
 const suffix=ci.run+'-'+ci.attempt+'-'+ci.nonce.slice(0,16)
 if(d.format!=='worker_heartbeat_control_ci_stages_v1'||d.controlRoot!=='/var/lib/agentstudio-telemetry-control-ci-'+suffix||d.nativeRoot!=='/var/lib/agentstudio-telemetry-native-ci-'+suffix||d.tools!=='/root/agentstudio-telemetry-control-ci-input/'+suffix||d.nonce!==ci.nonce||d.run!==ci.run||d.attempt!==ci.attempt||d.nodePath!==process.execPath||!hex(d.sourceSha)||!hex(d.sourceManifestSha256)||!hex(d.runtimeManifestSha256)||!hex(d.nativeManifestSha256)||d.sourceManifestFile!==d.tools+'/source-manifest.json'||d.runtimeManifestFile!==d.tools+'/runtime-manifest.json'||d.nativeManifestFile!==d.tools+'/native-manifest.json'||d.nativeChildPath!==d.nativeRoot+'/services/pg-api/tests/helpers/native-company-worker-heartbeats-control-ci-child.mjs')fail('stage_descriptor')
 for(const dir of [d.controlRoot,d.nativeRoot]){const st=fs.lstatSync(dir);if(!st.isDirectory()||st.isSymbolicLink()||st.uid!==0||st.gid!==0||(st.mode&0o7777)!==0o555)fail('sealed_stage')}
}

export async function createWorkerHeartbeatWriterCiFixture(proof,privateStage,writerVariant='v2_on'){
 // Exact original distinct proof MUST be admitted before filesystem/driver I/O.
 const ci=workerHeartbeatActivationControlCiDescriptor(proof),main=workerHeartbeatActivationControlCiMainOptions(proof)
 const stageModule=await import('./worker-heartbeat-activation-control-ci-stage.mjs'),stage=stageModule.describeWorkerHeartbeatControlCiStages(proof,privateStage)
 stageBinding(stage,ci);if(main.port!==5432||main.database!=='agentstudio_pg18_ci'||ci.port!==5333)fail('sponsor_binding')
 const workspace=fs.statSync(root);if(!Number.isInteger(workspace.uid)||workspace.uid<1||!Number.isInteger(workspace.gid)||workspace.gid<1)fail('native_nonroot_workspace_identity')
 const sourceBytes=read(stage.sourceManifestFile,{pin:stage.sourceManifestSha256}),runtimeBytes=read(stage.runtimeManifestFile,{pin:stage.runtimeManifestSha256}),nativeBytes=read(stage.nativeManifestFile,{pin:stage.nativeManifestSha256})
 if(sha(sourceBytes)!==stage.sourceSha)fail('source_manifest_digest')
 const [{default:pg},containers,fresh,installer,baseline,activation,nativeAuth,client,contract]=await Promise.all([
  import('pg'),import('./worker-heartbeat-activation-control-ci-container.mjs'),import('../../src/pg18-fresh-runtime-source.mjs'),import('../../src/pg18-fresh-runtime-install.ts'),import('../../src/baota-pg18-fresh-init.mjs'),import('../../src/native-activation-cli.mjs'),import('../../src/native-auth-repository.mjs'),
  import(pathToFileURL(stage.nativeRoot+'/services/pg-api/src/worker-heartbeat-activation-control-client.ts').href),import(pathToFileURL(stage.nativeRoot+'/services/pg-api/src/worker-heartbeat-activation-control-contract.ts').href)
 ])
 const sourceManifest=contract.parseWorkerHeartbeatControlJson(sourceBytes,2097152),nativeManifest=contract.parseWorkerHeartbeatControlJson(nativeBytes,2097152)
 if(sourceManifest.format!=='worker_heartbeat_activation_control_sources_v1'||nativeManifest.format!=='worker_heartbeat_native_ci_files_v1')fail('manifest_format')
 for(const [base,entries]of [[stage.controlRoot,sourceManifest.sources],[stage.nativeRoot,nativeManifest.files]])for(const file of entries){if(typeof file.path!=='string'||! /^(?:services\/pg-api|shared|db\/postgres)\/[A-Za-z0-9_./-]+$/.test(file.path)||file.path.split('/').some(v=>!v||v==='.'||v==='..'))fail('manifest_path');read(base+'/'+file.path,{mode:0o444,pin:file.sha256,max:16777216})}
 const snapshot=fresh.captureFreshRuntimeSources();if(snapshot.source_sha256!==freshPin||snapshot.baseline.hash!==baselinePin||snapshot.versions.at(-1)!=='pg_v9_050')fail('frozen_fresh050')
 const s={proof,ci,stage,pg,containers,client,contract,workspace,snapshot,installer,activation,sourceBytes,runtimeBytes,writerVariant,pools:new Set(),reads:new Set(),writers:new Set(),children:new Set(),ackRules:new Set(),ownedDirectories:new Map(),ownedSockets:new Map(),plans:new WeakMap(),lastAction:null,currentPolicy:null,closed:false,container:null,control:null,native:null,httpNative:null,httpRequests:new Set(),phase:'create_owned_container'}
 const pool=options=>{const p=new pg.Pool(options);p.on('error',()=>{});s.pools.add(p);return p}
 async function close(){return closeFixture(s)}
 try{
  s.container=await containers.createTelemetryControlCiContainer(proof)
  s.nativeOptions=containers.telemetryControlCiContainerNativeOptions(s.container);s.nativeAdmin=pool(s.nativeOptions)
  s.phase='original001_raw010_fresh050'
  const db=await s.nativeAdmin.connect();try{
   await db.query('BEGIN');await db.query(snapshot.baseline.sql)
   for(const [name,groups]of [['agentstudio_stage_login',['agentstudio_api']],['agentstudio_stage_worker',['agentstudio_api','agentstudio_worker']]]){const password=randomBytes(40).toString('hex');await db.query('CREATE ROLE '+name+" LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD '"+activation.makeNativeScramVerifier(password)+"'");for(const group of groups)await db.query('GRANT '+group+' TO '+name+' WITH ADMIN FALSE, INHERIT FALSE, SET TRUE')}
   await baseline.verifyFreshForTest(db);await installer.installFreshRuntime(db,snapshot);await db.query('COMMIT')
  }catch(error){await db.query('ROLLBACK').catch(()=>{});throw error}finally{db.release()}
  const raw010=fs.readFileSync(path.join(root,'db/postgres/010_pg18_native_auth_proposed.sql'));if(sha(raw010)!==snapshot.sources.find(v=>v.path==='db/postgres/010_pg18_native_auth_proposed.sql')?.sha256)fail('raw010_changed')
  s.nativePassword=randomBytes(40).toString('hex');await s.nativeAdmin.query("ALTER ROLE agentstudio_native_login LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD '"+activation.makeNativeScramVerifier(s.nativePassword)+"'")
  s.authOptions={...s.nativeOptions,user:'agentstudio_native_login',password:s.nativePassword,max:2};s.auth=pool(s.authOptions);s.repo=new nativeAuth.NativeAuthRepository(s.auth)
  const a={email:'control-admin@example.test',password:'ControlAdmin#'+randomBytes(20).toString('hex'),display_name:'Synthetic Control Admin'},b={email:'control-employee@example.test',password:'ControlEmployee#'+randomBytes(20).toString('hex'),display_name:'Synthetic Control Employee'}
  await s.repo.provisionInitialAdmin(a);s.adminSession=await s.repo.login(a.email,a.password);await s.repo.createGovernedEmployee(s.adminSession.token,{...b,is_admin:false,share_enabled:true});s.employeeSession=await s.repo.login(b.email,b.password)
  s.revokedSession=await s.repo.login(a.email,a.password);await s.repo.revokeSession(s.revokedSession.token)
  s.nativeDataSha=await nativeHttpData(s)
  await installer.verifyRuntimeSchemaReceipt(s.nativeAdmin,snapshot,true);s.nativeSchema=await nativeSchema(s)
  s.phase='new_telemetry_database_original001';await containers.createTelemetryControlCiDatabase(s.container);s.telemetryOptions=containers.telemetryControlCiContainerTelemetryOptions(s.container);s.telemetry=pool({...s.telemetryOptions,max:4})
  const telemetrySql=fs.readFileSync(path.join(root,'db/postgres/telemetry/001_worker_heartbeats.sql'));if(sha(telemetrySql)!==sqlPin)fail('telemetry_sql_pin');await s.telemetry.query(telemetrySql.toString('utf8'))
  s.phase='private_root_configuration';await configure(s);await writerCodeStage(s)
  s.phase='genuine_management_catalog_preaudit';await preauditManagement(s)
  s.phase='cold_actual_controller';await startController(s)
  const bootStatus=await rpc(s,{op:'inspect'});if(bootStatus.phase!=='closed'||bootStatus.read_gate!=='closed'||bootStatus.in_flight_reads!==0||!hex(bootStatus.policy_sha256)||bootStatus.is_activation_capability!==false)fail('new_actual_closed_bootstrap')
  s.phase='actual_native_child';await startNative(s)
  const api=makeApi(s);await api.verify();return Object.freeze(api)
 }catch(error){const codes=[...s.control?.closedCodes??[]].filter(code=>contract.controlErrorCodes.includes(code)).sort(),primary=Error(safe(s.phase,error).message+(codes.length?':controller_codes='+codes.join(','):''));try{await close()}catch(cleanup){throw new AggregateError([primary,safe('owned_cleanup',cleanup)],'telemetry_control_ci_fixture_setup_and_cleanup_failed')}throw primary}
}

async function nativeSchema(s){
 const versions=(await s.nativeAdmin.query('SELECT version,description FROM agentstudio.schema_migrations ORDER BY version')).rows
 const objects=(await s.nativeAdmin.query("SELECT n.nspname,c.relname,c.relowner::text,c.relacl,c.relrowsecurity,c.relforcerowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('agentstudio','agentstudio_auth') ORDER BY n.nspname,c.relname")).rows
 return sha(JSON.stringify({versions,objects}))
}
async function nativeHttpData(s){
 // Only server-side row digests leave SQL; never log accounts/password/session
 // data. This is an invariant comparison, not an authentication capability.
 const row=(await s.nativeAdmin.query("SELECT (SELECT md5(coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.user_id)::text,'[]')) FROM agentstudio_auth.accounts a) AS accounts,(SELECT md5(coalesce(jsonb_agg(to_jsonb(u) ORDER BY u.id)::text,'[]')) FROM agentstudio.users u) AS users,(SELECT md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.token_digest)::text,'[]')) FROM agentstudio_auth.sessions t) AS sessions")).rows[0]
 const x=fields(row,['accounts','users','sessions'])
 if(Object.values(x).some(value=>typeof value!=='string'||!/^[a-f0-9]{32}$/.test(value)))fail('native_http_data_digest')
 return sha(Buffer.from(JSON.stringify(x)))
}

async function preauditManagement(s){
 // A separate genuine read-only catalog check, not a controller DbAccess,
 // runtime capability or registry observation. Query results are never adapted.
 const {verifyWorkerHeartbeatManagementCatalog}=await import(pathToFileURL(s.stage.controlRoot+'/services/pg-api/src/worker-heartbeat-management-audit.ts').href)
 const raw=await s.telemetry.connect();let last='none',queries=0,active=false,primary,cleanup,rollbackKnown=false
 try{
  const address=(await raw.query('SELECT inet_server_addr()::text AS inet_text,host(inet_server_addr()) AS host_text')).rows[0]
  if(address.host_text!=='127.0.0.1'||address.inet_text!=='127.0.0.1/32')fail('actual_inet_address_representation')
  process.stdout.write(JSON.stringify({event:'telemetry_control_ci_actual_loopback_representation',...address})+'\n')
  await raw.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');active=true
  await raw.query("SET LOCAL search_path=pg_catalog; SET LOCAL statement_timeout='1000ms'; SET LOCAL lock_timeout='250ms'")
  const db={async query(sql,args=[]){const tag=/^\/\* telemetry_v1_management_catalog:([a-z_]+) \*\//.exec(sql);if(!tag)fail('catalog_probe_query_tag');last=tag[1];queries++;return raw.query(sql,args)},release(){fail('catalog_probe_cannot_release')}}
  const b=s.binding,expectations={protocol:'worker_heartbeat_management_catalog_expectations_v1',database_oid:b.database_oid,database_owner_oid:b.owner_oid,schema_oid:b.schema_oid,operator:{oid:b.operator_oid,name:b.operator_login},roles:b.roles.map((r,i)=>({oid:r.oid,name:r.name,login:false,inherit:false,super:false,bypass:false,create_db:false,create_role:false,replication:false,connection_limit:i===0?-1:i===1?2:1,config:null,no_expiry:true,memberships:0}))}
  await verifyWorkerHeartbeatManagementCatalog(db,expectations)
  process.stdout.write(JSON.stringify({event:'telemetry_control_ci_management_catalog_preaudit_pass',queries,controller_authority:false})+'\n')
 }catch(error){primary=error;process.stderr.write(JSON.stringify({event:'telemetry_control_ci_management_catalog_preaudit_failed',last_query_tag:last,queries,controller_authority:false})+'\n')}
 finally{
  if(active)try{await raw.query('ROLLBACK');rollbackKnown=true}catch(error){cleanup=error}
  try{raw.release(Boolean(primary||cleanup)||!rollbackKnown)}catch(error){cleanup=cleanup?new AggregateError([cleanup,error],'telemetry_control_ci_preaudit_rollback_and_release_failed'):error}
 }
 if(primary&&cleanup)throw new AggregateError([primary,cleanup],'telemetry_control_ci_management_preaudit_and_cleanup_failed')
 if(primary)throw primary
 if(cleanup)throw cleanup
}
async function configure(s){
 const identity=(await s.telemetry.query("SELECT system_identifier::text AS system_id,current_database() AS database,d.oid::integer AS database_oid,d.datdba::integer AS owner_oid,(SELECT oid::integer FROM pg_namespace WHERE nspname='studio_telemetry') AS schema_oid,session_user::text AS operator_login,r.oid::integer AS operator_oid,host(inet_server_addr()) AS server_addr,inet_server_port() AS server_port,(extract(epoch FROM pg_postmaster_start_time())*1000000)::numeric(30,0)::text AS postmaster_started_us FROM pg_control_system(),pg_database d JOIN pg_roles r ON r.rolname=session_user WHERE d.datname=current_database()")).rows[0]
 if(identity.database!=='agent_studio_telemetry'||identity.operator_login!=='postgres'||identity.server_addr!=='127.0.0.1'||identity.server_port!==5333||identity.owner_oid!==identity.operator_oid)fail('telemetry_actual_binding')
 const roleRows=(await s.telemetry.query("SELECT rolname::text AS name,oid::integer AS oid,rolcanlogin,rolpassword FROM pg_authid WHERE starts_with(rolname,'studio_telemetry_')")).rows
 if(roleRows.length!==18||roleRows.some(r=>r.rolcanlogin||r.rolpassword!==null))fail('dormant_actual_roles')
 const roles=names.map(name=>{const r=roleRows.find(r=>r.name===name);if(!r)fail('dormant_role_name');return {name,oid:r.oid}})
 s.binding={...identity,roles,sql_pin:sqlPin,record_pin:recordPin,snapshot_pin:snapshotPin}
 s.currentPolicy={protocol:'worker_heartbeat_activation_policy_v1',binding:{installation_id:randomUUID(),system_id:identity.system_id,database_oid:identity.database_oid,owner_oid:identity.owner_oid,schema_oid:identity.schema_oid,server_addr:identity.server_addr,server_port:identity.server_port,postmaster_started_us:identity.postmaster_started_us,operator_name:identity.operator_login,role_oids:roles.map(r=>r.oid)},reader:{login:false,verifier_sha256:null},kinds:kinds.map(kind=>({kind,instrumented:false,enabled:false})),slots:kinds.flatMap(kind=>[1,2].map(slot_no=>({kind,slot_no,mode:'unused',generation:null,verifier_sha256:null})))}
 for(const dir of [paths.config,paths.store,paths.credentials])privateTree(s,dir)
 for(const dir of [paths.config+'/drafts',paths.config+'/approvals',paths.config+'/resumes',paths.store+'/plans',paths.store+'/credentials'])privateTree(s,dir)
 privateTree(s,paths.sockets,0o750,s.workspace.gid)
 const key=generateKeyPairSync('ed25519');s.signingKey=key.privateKey
 write(paths.config+'/approval-public.pem',key.publicKey.export({type:'spki',format:'pem'}));write(paths.config+'/source-manifest.json',s.sourceBytes);write(paths.config+'/runtime-manifest.json',s.runtimeBytes)
 const readerPassword=randomBytes(40).toString('hex');if(!/^[a-f0-9]{80}$/.test(s.telemetryOptions.password))fail('container_operator_password_shape')
 write(paths.credentials+'/operator-password',s.telemetryOptions.password);write(paths.credentials+'/reader-password',readerPassword)
 const profile={protocol:'worker_heartbeat_control_profile_v1',mode:'closed',source_sha256:s.stage.sourceSha,source_manifest_sha256:s.stage.sourceManifestSha256,runtime_manifest_sha256:s.stage.runtimeManifestSha256,admin_password_sha256:sha(s.telemetryOptions.password),reader_password_sha256:sha(readerPassword),native_gid:s.workspace.gid,binding:s.binding,policy:s.currentPolicy}
 signed(s,paths.config+'/profile.json',writerCiProfile(s,profile))
 const genesis={format:'worker_heartbeat_control_journal_v1',sequence:0,previous_sha256:'0'.repeat(64),instance_id:randomUUID(),epoch:'0',action_id:null,phase:'boot',data:{protocol:'worker_heartbeat_control_enrollment_v1',binding_sha256:sha(JSON.stringify(s.binding)),source_sha256:s.stage.sourceSha,initial_policy_json_sha256:sha(JSON.stringify(s.currentPolicy))}}
 write(paths.store+'/journal.jsonl',JSON.stringify({...genesis,record_sha256:sha(JSON.stringify(genesis))})+'\n')
}
function signed(s,file,payload){write(file,JSON.stringify({payload,signature:sign(null,Buffer.from(JSON.stringify(payload)),s.signingKey).toString('base64')})+'\n')}
async function rpc(s,command){return s.client.sendWorkerHeartbeatOperatorCommand(command)}
/* WRITER_FAILURE_OBSERVATION_BEGIN */
// Only fixed Controller failure metadata is forwarded. All arbitrary output
// still goes through the original discard/error-code path unchanged below.
function writerControlFailureObservation(raw,stream){
 try{
  if(stream!=='stderr')return null
  const v=fields(raw,['event','site','kind','observed_data_only']),sites=Object.freeze(["authorize_entry","apply_entry","record_entry","cleanup_entry","authorize_runtime","authorize_approval","authorize_expiry","authorize_intent_journal","apply_runtime","apply_closing","apply_writer_pause","apply_readers_cleanup","apply_serial","apply_registry_read","apply_target","apply_begin","apply_all_locks","apply_locked_before","apply_material","apply_write","apply_commit","apply_after_verify","apply_retire","apply_publish","record_identity_before","record_selection_before","record_query","record_selection_after","record_identity_after","record_final_guard","cleanup_end_client","cleanup_discover","cleanup_wait_absence","cleanup_ended_journal"]),kinds=Object.freeze(["source_refused","runtime_refused","control_error","writer_closed","writer_uncertain","writer_busy","writer_not_enrolled","query_cancelled","query_lock_timeout","query_client_timeout","query_client_closed","filesystem_io","transport_io","abort","type_error","range_error","syntax_error","other"])
  if(v.event!=='worker_heartbeat_control_failure_observation'||v.observed_data_only!==true||!sites.includes(v.site)||!kinds.includes(v.kind))return null
  return {event:'worker_heartbeat_control_failure_observation',site:v.site,kind:v.kind,observed_data_only:true}
 }catch{return null}
}
/* WRITER_FAILURE_OBSERVATION_END */function closedControllerOutput(s,c,chunk,stream){
 c[stream+'Bytes']+=chunk.length;if(c[stream+'Bytes']>32768){c.p.kill('SIGTERM');return}
 let text=(c[stream+'Partial']??'')+chunk.toString('utf8');if(Buffer.byteLength(text)>4096)text=text.slice(-4096)
 const lines=text.split('\n');c[stream+'Partial']=lines.pop()
 for(const line of lines){/* WRITER_FAILURE_OBSERVATION_BEGIN */try{const observation=writerControlFailureObservation(s.contract.parseWorkerHeartbeatControlJson(Buffer.from(line),4096),stream);if(observation)process.stderr.write(JSON.stringify(observation)+'\n')}catch{}/* WRITER_FAILURE_OBSERVATION_END */try{const x=fields(s.contract.parseWorkerHeartbeatControlJson(Buffer.from(line),4096),['error','automatic_retry_authorized']);if(x.automatic_retry_authorized===false&&s.contract.controlErrorCodes.includes(x.error))c.closedCodes.add(x.error)}catch{ /* Discard all arbitrary warnings/stack/diagnostic text. */ }}
}
async function startController(s){
 // Service has one fixed verb. It is a separate cold process, never import-run.
 const file=s.stage.controlRoot+'/services/pg-api/src/worker-heartbeat-activation-control-service.ts'
 const p=spawn(s.stage.nodePath,['--experimental-strip-types',file,'serve'],{cwd:s.stage.controlRoot,env:{PATH:'/usr/local/bin:/usr/bin:/bin',LANG:'C.UTF-8',AGENT_STUDIO_TELEMETRY_CONTROL_ENABLED:'true'},stdio:['ignore','pipe','pipe'],windowsHide:true})
 const c={p,exited:false,exit:null,stderrBytes:0,stdoutBytes:0,closedCodes:new Set(),pending:new Map()};s.children.add(c);s.control=c;p.on('error',()=>{});p.stdout.on('data',b=>closedControllerOutput(s,c,b,'stdout'));p.stderr.on('data',b=>closedControllerOutput(s,c,b,'stderr'));p.once('close',(code,signal)=>{c.exited=true;c.exit={code,signal}})
 await until(async()=>{if(c.exited)fail('controller_boot_exited');if(!fs.existsSync(paths.ops)||!fs.existsSync(paths.reader))return false;const v=await rpc(s,{op:'inspect'});if(!uuid(v.instance_id)||!['closed','recovery_required'].includes(v.phase)||v.read_gate!=='closed')fail('actual_closed_boot');s.instance=v.instance_id;return true},'controller_boot_timeout',30000)
 for(const file of [paths.ops,paths.reader]){const st=fs.lstatSync(file);if(!st.isSocket()||st.uid!==0||(st.mode&0o7777)!==(file===paths.reader?0o660:0o600))fail('own_socket_identity');s.ownedSockets.set(file,stamp(st))}
 const records=read(paths.store+'/journal.jsonl').toString('utf8').trimEnd().split('\n').map(v=>s.contract.parseWorkerHeartbeatControlJson(Buffer.from(v),2097152)),boot=records.reverse().find(r=>r.phase==='boot'&&r.instance_id===s.instance&&r.data?.control_backend)
 if(!boot||!Number.isInteger(boot.data.control_backend.pid)||typeof boot.data.control_backend.started!=='string')fail('own_backend_ledger');s.controlBackend=boot.data.control_backend
}
async function startNative(s){
 // The actual parent-owned child is one-shot; no invented multi-request ABI.
 const r=(await s.nativeAdmin.query("SELECT (pg_control_system()).system_identifier::text AS system_id,(SELECT oid::text FROM pg_database WHERE datname=current_database()) AS database_oid,(SELECT oid::text FROM pg_roles WHERE rolname='agentstudio_native_login') AS login_oid,(extract(epoch FROM pg_postmaster_start_time())*1000000)::numeric(30,0)::text AS postmaster_started_us")).rows[0]
 if(r.system_id!==s.binding.system_id||r.postmaster_started_us!==s.binding.postmaster_started_us)fail('native_same_owned_cluster')
 s.nativeFixture={run:s.ci.run,attempt:s.ci.attempt,source_revision:s.ci.source_revision,nonce:s.ci.nonce,...r,native_uid:s.workspace.uid,native_gid:s.workspace.gid}
 const childBytes=read(s.stage.nativeChildPath,{mode:0o444}),bytes=Buffer.from(JSON.stringify({protocol:'native_company_worker_heartbeats_control_ci_fixture_v1',fixture:s.nativeFixture,child_sha256:sha(childBytes)})+'\n'),file=s.stage.nativeRoot+'/native-control-ci-fixture.json'
 // Fixed nonce-scoped DATA sidecar, not code/credential/authority. Root can create
 // this one enrolled file in its own sealed stage without changing code modes.
 write(file,bytes);fs.chmodSync(file,0o444);syncDir(s.stage.nativeRoot);read(file,{mode:0o444,pin:sha(bytes)});s.nativeFixtureSha=sha(bytes);s.nativeMarker={file,stamp:stamp(fs.lstatSync(file))}
}
function packet(body){const bytes=Buffer.from(JSON.stringify(body));if(bytes.length<1||bytes.length>16384)fail('wire_size');const header=Buffer.alloc(4);header.writeUInt32BE(bytes.length);return Buffer.concat([header,bytes])}
async function nativeRead(s,choice){
 if(s.closed||!['admin','employee','missing'].includes(choice))fail('native_read_choice')
 const cookie=choice==='admin'?s.adminSession.token:choice==='employee'?s.employeeSession.token:''
 const env={PATH:'/usr/local/bin:/usr/bin:/bin',LANG:'C.UTF-8',AGENT_STUDIO_NATIVE_CONTROL_CI_CHILD:'YES_DISPOSABLE_NATIVE_READ_FIXTURE_ONLY'}
 for(const key of ['CI','GITHUB_ACTIONS','RUNNER_OS','RUNNER_ENVIRONMENT','GITHUB_REPOSITORY','GITHUB_WORKFLOW','GITHUB_JOB','GITHUB_EVENT_NAME','GITHUB_RUN_ID','GITHUB_RUN_ATTEMPT','GITHUB_SHA','GITHUB_REF','GITHUB_WORKFLOW_REF'])env[key]=process.env[key]
 const p=spawn('/usr/bin/setpriv',['--reuid='+s.workspace.uid,'--regid='+s.workspace.gid,'--clear-groups','--inh-caps=-all','--ambient-caps=-all','--bounding-set=-all',s.stage.nodePath,'--experimental-strip-types',s.stage.nativeChildPath,'--run'],{cwd:s.stage.nativeRoot,env,stdio:['pipe','pipe','pipe'],windowsHide:true})
 const owned={p,exited:false,exit:null,pending:new Map()};s.children.add(owned);s.native=owned
 let bytes=Buffer.alloc(0),stderr=0,failed=false
 p.on('error',()=>{failed=true});p.stdin.on('error',()=>{});p.stdout.on('data',b=>{bytes=Buffer.concat([bytes,b]);if(bytes.length>32768){failed=true;p.kill('SIGTERM')}});p.stderr.on('data',b=>{stderr+=b.length;if(stderr>32768){failed=true;p.kill('SIGTERM')}})
 const exited=new Promise(resolve=>p.once('close',(code,signal)=>{owned.exited=true;owned.exit={code,signal};resolve()})),timer=setTimeout(()=>{failed=true;p.kill('SIGTERM')},20000)
 p.stdin.end(packet({protocol:'native_company_worker_heartbeats_control_ci_child_v1',fixture_sha256:s.nativeFixtureSha,fixture:s.nativeFixture,auth_password:s.nativePassword,cookie}))
 try{await exited;if(failed)fail('native_child_bounded');const value=s.contract.parseWorkerHeartbeatControlJson(bytes,32768)
  if(choice==='admin'&&owned.exit.code===0){const o=fields(value,['snapshot','local']);s.contract.controlObject(o.local,['inFlight','timedOut','cleanupUnknown']);return {snapshot:await snapshotValue(s,o.snapshot),local:o.local}}
  const o=fields(value,['error','local']),error=fields(o.error,['status','code']);if(![401,403,503].includes(error.status)||!['session_required','admin_required','company_worker_heartbeats_unavailable','native_control_ci_failed','native_control_ci_refused'].includes(error.code))fail('native_child_error_shape')
  return {error,local:o.local}
 }finally{clearTimeout(timer);s.children.delete(owned);if(s.native===owned)s.native=null}
}
function nativeHttpStatus(raw){
 const v=fields(raw,['protocol','enabled','local','pool','hold','responses'])
 if(v.protocol!=='native_company_worker_heartbeats_http_ci_status_v2'||typeof v.enabled!=='boolean')fail('native_http_status')
 const local=value=>{const x=fields(value,['inFlight','timedOut','cleanupUnknown']);if(Object.values(x).some(n=>!Number.isInteger(n)||n<0||n>2)||x.timedOut>x.inFlight||x.cleanupUnknown>x.inFlight)fail('native_http_local');return x}
 const l=local(v.local),p=fields(v.pool,['total','idle','waiting'])
 if(Object.values(p).some(n=>!Number.isInteger(n)||n<0||n>2)||p.idle>p.total||!Array.isArray(v.responses)||v.responses.length>32)fail('native_http_pool')
 const hold=fields(v.hold,['cycle','phase','held','acquired','released','release_errors','failed','release_reason','elapsed_ms','duration_ms','warming','warm_held','warm_release_errors','unconfirmed'])
 if(!Number.isSafeInteger(hold.cycle)||hold.cycle<0||hold.cycle>4096||!['idle','acquiring','held','released','failed'].includes(hold.phase)||
  ['held','acquired','released','release_errors','warm_held','warm_release_errors','unconfirmed'].some(key=>!Number.isInteger(hold[key])||hold[key]<0||hold[key]>2)||
  hold.released>hold.acquired||typeof hold.failed!=='boolean'||typeof hold.warming!=='boolean'||
  ![null,'timer','stop','error'].includes(hold.release_reason)||
  ['elapsed_ms','duration_ms'].some(key=>!Number.isSafeInteger(hold[key])||hold[key]<0||hold[key]>3600000))fail('native_http_hold_status')
 const responses=v.responses.map(raw=>{const r=fields(raw,['request_id','status','local']);if(!uuid(r.request_id)||![200,401,403,503].includes(r.status))fail('native_http_response_receipt');return {...r,local:local(r.local)}})
 return {...v,local:l,pool:p,hold,responses}
}
async function nativeHttpStart(s){
 if(s.httpNative)return
 if(s.closed)fail('native_http_fixture_closed')
 const ci=workerHeartbeatActivationControlCiDescriptor(s.proof)
 if(ci.nonce!==s.ci.nonce)fail('native_http_proof')
 const env={PATH:'/usr/local/bin:/usr/bin:/bin',LANG:'C.UTF-8',AGENT_STUDIO_NATIVE_CONTROL_CI_CHILD:'YES_DISPOSABLE_NATIVE_READ_FIXTURE_ONLY'}
 for(const key of ['CI','GITHUB_ACTIONS','RUNNER_OS','RUNNER_ENVIRONMENT','GITHUB_REPOSITORY','GITHUB_WORKFLOW','GITHUB_JOB','GITHUB_EVENT_NAME','GITHUB_RUN_ID','GITHUB_RUN_ATTEMPT','GITHUB_SHA','GITHUB_REF','GITHUB_WORKFLOW_REF'])env[key]=process.env[key]
 const p=spawn('/usr/bin/setpriv',['--reuid='+s.workspace.uid,'--regid='+s.workspace.gid,'--clear-groups','--inh-caps=-all','--ambient-caps=-all','--bounding-set=-all',s.stage.nodePath,'--experimental-strip-types',s.stage.nativeChildPath,'--http-run'],{cwd:s.stage.nativeRoot,env,stdio:['pipe','pipe','pipe','ipc'],windowsHide:true})
 const c={p,exited:false,exit:null,pending:new Map(),address:null,stdout:Buffer.alloc(0),stderr:0};s.children.add(c);s.httpNative=c
 let readyResolve,readyReject
 const ready=new Promise((yes,no)=>{readyResolve=yes;readyReject=no})
 const failReady=()=>readyReject(Error('telemetry_control_ci_fixture_refused:native_http_child'))
 p.on('error',failReady);p.stdin.on('error',()=>{})
 p.stdout.on('data',chunk=>{c.stdout=Buffer.concat([c.stdout,chunk]);if(c.stdout.length>32768){failReady();p.kill('SIGTERM');return}
  if(!c.stdout.includes(10))return
  try{
   if(c.address||c.stdout.indexOf(10)!==c.stdout.length-1)fail('native_http_ready_frame')
   const v=fields(s.contract.parseWorkerHeartbeatControlJson(c.stdout.subarray(0,-1),32768),['protocol','host','port','origin','enabled','local'])
   if(v.protocol!=='native_company_worker_heartbeats_http_ci_ready_v2'||v.host!=='127.0.0.1'||!Number.isInteger(v.port)||v.port<1024||v.port>65535||[5333,5432].includes(v.port)||v.origin!=='https://native-control-ci.example.test'||v.enabled!==false)fail('native_http_ready_binding')
   assert.deepEqual(v.local,{inFlight:0,timedOut:0,cleanupUnknown:0});c.address=v;readyResolve()
  }catch{failReady();p.kill('SIGTERM')}
 })
 p.stderr.on('data',chunk=>{c.stderr+=chunk.length;if(c.stderr>32768){failReady();p.kill('SIGTERM')}})
 p.on('message',raw=>{try{
  const v=fields(raw,['protocol','request_id','ok','value']),pending=c.pending.get(v.request_id)
  if(v.protocol!=='native_company_worker_heartbeats_http_ci_reply_v2'||!uuid(v.request_id)||typeof v.ok!=='boolean'||!pending)fail('native_http_reply')
  const status=v.ok?nativeHttpStatus(v.value):null
  c.pending.delete(v.request_id);clearTimeout(pending.timer)
  v.ok?pending.resolve(status):pending.reject(Error('telemetry_control_ci_fixture_refused:native_http_command'))
 }catch{failReady();for(const pending of c.pending.values()){clearTimeout(pending.timer);pending.reject(Error('telemetry_control_ci_fixture_refused:native_http_bad_reply'))}c.pending.clear();p.kill('SIGTERM')}})
 p.once('close',(code,signal)=>{c.exited=true;c.exit={code,signal};failReady();for(const pending of c.pending.values()){clearTimeout(pending.timer);pending.reject(Error('telemetry_control_ci_fixture_refused:native_http_exit'))}c.pending.clear()})
 const timer=setTimeout(()=>{failReady();p.kill('SIGTERM')},30000)
 p.stdin.end(packet({protocol:'native_company_worker_heartbeats_control_ci_child_v1',fixture_sha256:s.nativeFixtureSha,fixture:s.nativeFixture,auth_password:s.nativePassword,cookie:''}))
 try{await ready}finally{clearTimeout(timer)}
}
async function nativeHttpCommand(s,op){
 const c=s.httpNative
 if(!c||c.exited||!c.address||!['enable','disable','status','stop','prime_auth_clients','hold_auth_clients_1s'].includes(op)||c.pending.size>=8)fail('native_http_command_scope')
 const request_id=randomUUID()
 return new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>{c.pending.delete(request_id);reject(Error('telemetry_control_ci_fixture_refused:native_http_command_timeout'))},op==='stop'?30000:5000)
  c.pending.set(request_id,{resolve,reject,timer})
  c.p.send({protocol:'native_company_worker_heartbeats_http_ci_command_v2',request_id,op},error=>{if(error){const pending=c.pending.get(request_id);if(pending){clearTimeout(timer);c.pending.delete(request_id);reject(Error('telemetry_control_ci_fixture_refused:native_http_send'))}}})
 })
}
async function nativeHttpRead(s,choice){
 const c=s.httpNative
 if(s.closed||!c||c.exited||!c.address||!['admin','employee','missing','invalid','revoked','spoof','origin'].includes(choice))fail('native_http_read_scope')
 const {NATIVE_SESSION_COOKIE}=await import('../../src/native-employee-auth.mjs')
 const cookie=choice==='employee'?s.employeeSession.token:choice==='revoked'?s.revokedSession.token:choice==='invalid'?randomBytes(32).toString('base64url'):s.adminSession.token
 const id=randomUUID(),headers={Origin:choice==='origin'?'https://foreign.example.test':c.address.origin,'X-Agentstudio-Ci-Request':id,Connection:'close'}
 if(choice!=='missing')headers.Cookie=NATIVE_SESSION_COOKIE+'='+cookie
 if(choice==='spoof')headers['X-Rh-User-Id']='00000000-0000-4000-8000-000000000001'
 const started=performance.now()
 const work=new Promise((resolve,reject)=>{
  let bytes=Buffer.alloc(0),done=false
  const finish=(error,value)=>{if(done)return;done=true;clearTimeout(timer);error?reject(Error('telemetry_control_ci_fixture_refused:native_http_transport')):resolve(value)}
  const request=httpRequest({host:'127.0.0.1',port:c.address.port,method:'GET',path:'/api/v2/company-worker-heartbeats',headers,agent:false},response=>{
   response.on('data',chunk=>{bytes=Buffer.concat([bytes,chunk]);if(bytes.length>32768){response.destroy();finish(true)}})
   response.once('error',()=>finish(true));response.once('aborted',()=>finish(true))
   response.once('end',()=>{try{
    if(!response.complete||![200,401,403,503].includes(response.statusCode))fail('native_http_status_code')
    const body=s.contract.parseWorkerHeartbeatControlJson(bytes,32768)
    for(const [key,value]of Object.entries({'cache-control':'no-store',pragma:'no-cache','x-content-type-options':'nosniff','referrer-policy':'no-referrer','cross-origin-resource-policy':'same-origin','x-frame-options':'DENY'}))if(response.headers[key]!==value)fail('native_http_response_headers')
    if(['set-cookie','location','access-control-allow-origin'].some(k=>response.headers[k]!==undefined))fail('native_http_private_headers')
    if(response.statusCode===200){snapshotValue(s,body).then(snapshot=>finish(false,{request_id:id,status:200,body:snapshot,elapsed_ms:Math.round(performance.now()-started)}),()=>finish(true));return}
    const value=fields(body,['error']),expected=response.statusCode===401?'session_required':response.statusCode===403?'admin_required':'company_worker_heartbeats_unavailable'
    if(value.error!==expected)fail('native_http_error_body')
    finish(false,{request_id:id,status:response.statusCode,body,elapsed_ms:Math.round(performance.now()-started)})
   }catch{finish(true)}})
  })
  const timer=setTimeout(()=>{request.destroy();finish(true)},14000)
  request.once('error',()=>finish(true));request.end()
 })
 s.httpRequests.add(work);try{return await work}finally{s.httpRequests.delete(work)}
}
async function nativeHttpClean(s){
 await until(async()=>{
  const status=await nativeHttpCommand(s,'status')
  if(status.local.inFlight!==0||status.local.cleanupUnknown!==0||status.pool.waiting!==0||status.hold.held!==0||status.hold.warming||status.hold.warm_held!==0)return false
  if(status.hold.unconfirmed!==0)fail('native_http_unconfirmed_owned_clients')
  if(status.hold.failed||status.hold.release_errors!==0||status.hold.warm_release_errors!==0)fail('native_http_owned_client_release_failed')
  const row=(await s.nativeAdmin.query("SELECT count(*)::integer AS total,count(*) FILTER(WHERE state IS DISTINCT FROM 'idle' OR xact_start IS NOT NULL)::integer AS busy FROM pg_stat_activity WHERE datid=$1::oid AND usename='agentstudio_native_login' AND application_name='agentstudio-native-http-control-ci'",[s.nativeFixture.database_oid])).rows[0]
  return row.total<=2&&row.busy===0
 },'native_http_actual_cleanup',30000)
 await waitReaders(s)
}
async function nativeHttpStop(s){
 const c=s.httpNative;if(!c)return true
 if(!c.exited){await nativeHttpClean(s);await nativeHttpCommand(s,'stop');await until(()=>c.exited,'native_http_owned_exit',12000)}
 if(c.exit?.code!==0||c.exit?.signal!==null)fail('native_http_exit_code')
 if(s.httpRequests.size!==0)fail('native_http_requests_not_settled')
 s.children.delete(c);s.httpNative=null
 await until(async()=>(await s.nativeAdmin.query("SELECT NOT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datid=$1::oid AND usename='agentstudio_native_login' AND application_name='agentstudio-native-http-control-ci') AS gone",[s.nativeFixture.database_oid])).rows[0]?.gone===true,'native_http_actual_backend_absence',10000)
 return true
}
async function nativeHttpCapacity(s){
 await nativeHttpClean(s)
 let firstDone=false,secondDone=false
 const a=nativeHttpRead(s,'admin').finally(()=>{firstDone=true}),b=nativeHttpRead(s,'admin').finally(()=>{secondDone=true})
 const settled=Promise.allSettled([a,b])
 try{
  await until(async()=>(await nativeHttpCommand(s,'status')).local.inFlight===2,'native_http_shared_two_reservations',3000)
  const third=await nativeHttpRead(s,'admin')
  assert.equal(third.status,503);assert.equal(firstDone,false);assert.equal(secondDone,false)
  for(const result of await settled){if(result.status!=='fulfilled')throw result.reason;assert.ok([200,503].includes(result.value.status))}
 }finally{await settled;await nativeHttpClean(s)}
 return true
}
async function nativeHttpLateCleanup(s){
 const ci=workerHeartbeatActivationControlCiDescriptor(s.proof)
 if(s.closed||ci.nonce!==s.ci.nonce||!s.httpNative)fail('native_http_own_fault_scope')
 await nativeHttpClean(s)
 const warm=await nativeHttpRead(s,'admin');assert.equal(warm.status,200);await nativeHttpClean(s)
 // Establish both actual idle connections before enrolling DROP rules. The
 // later fixed hold only borrows these existing clients; it creates no socket.
 const primed=await nativeHttpCommand(s,'prime_auth_clients')
 assert.equal(primed.pool.total,2);assert.equal(primed.pool.idle,2);assert.equal(primed.pool.waiting,0)
 assert.equal(primed.hold.warming,false);assert.equal(primed.hold.warm_held,0);assert.equal(primed.hold.warm_release_errors,0);assert.equal(primed.hold.unconfirmed,0)
 const rows=(await s.nativeAdmin.query("SELECT a.pid,a.backend_start::text AS started,a.client_port,host(a.client_addr) AS client_addr,a.datid::text AS database_oid,r.oid::text AS login_oid,a.backend_type,a.state,a.xact_start FROM pg_stat_activity a JOIN pg_roles r ON r.rolname=a.usename WHERE a.datid=$1::oid AND r.oid=$2::oid AND a.application_name='agentstudio-native-http-control-ci'",[s.nativeFixture.database_oid,s.nativeFixture.login_oid])).rows
 if(rows.length!==2||new Set(rows.map(r=>r.client_port)).size!==rows.length)fail('native_http_owned_connections')
 const rules=[]
 for(const r of rows){
  if(!Number.isInteger(r.pid)||r.pid<1||typeof r.started!=='string'||!Number.isFinite(Date.parse(r.started))||r.database_oid!==s.nativeFixture.database_oid||r.login_oid!==s.nativeFixture.login_oid||r.client_addr!=='127.0.0.1'||r.backend_type!=='client backend'||r.state!=='idle'||r.xact_start!==null||!Number.isInteger(r.client_port)||r.client_port<1024||r.client_port>65535||[5333,5432].includes(r.client_port))fail('native_http_owned_connection_identity')
  const comment='agentstudio-native-http-ci:'+ci.run+':'+ci.attempt+':'+ci.nonce.slice(0,16)+':'+randomUUID()
  const rule=Object.freeze({comment,args:Object.freeze(['-p','tcp','-s','127.0.0.1','-d','127.0.0.1','--sport','5333','--dport',String(r.client_port),'-m','comment','--comment',comment,'-j','DROP'])})
  if(rulePresent(rule))fail('native_http_fault_not_unique');s.ackRules.add(rule);rules.push(rule)
 }
 let primary,result,requestOutcome
 try{
  for(const rule of rules){iptables(['-I','OUTPUT','1',...rule.args]);if(!rulePresent(rule))fail('native_http_fault_missing')}
  const held=await nativeHttpCommand(s,'hold_auth_clients_1s')
  if(held.hold.phase!=='held'||held.hold.held!==2||held.hold.acquired!==2||held.hold.released!==0||held.hold.failed||held.hold.release_errors!==0||held.hold.unconfirmed!==0||held.hold.elapsed_ms>200)fail('native_http_hold_setup_window_missed')
  const cycle=held.hold.cycle
  // Observe every outcome immediately, including any setup rejection below.
  requestOutcome=nativeHttpRead(s,'admin').then(value=>({value}),error=>({error}))
  let queued
  await until(async()=>{
   const status=await nativeHttpCommand(s,'status')
   if(status.hold.cycle!==cycle||status.hold.phase!=='held'||status.hold.held!==2||status.hold.elapsed_ms>200)fail('native_http_hold_queue_window_missed')
   if(status.pool.waiting>=1&&status.local.inFlight>=1){queued=status;return true}
   return false
  },'native_http_actual_auth_checkout_queue',1000)
  const outcome=await requestOutcome;if(outcome.error)throw outcome.error
  const response=outcome.value
  if(response.status!==503||response.elapsed_ms<7900||response.elapsed_ms>=14000)fail('native_http_original_budget_not_exercised_by_fixture')
  const status=await nativeHttpCommand(s,'status'),released=status.hold
  assert.equal(released.cycle,cycle);assert.equal(released.phase,'released');assert.equal(released.held,0)
  assert.equal(released.acquired,2);assert.equal(released.released,2);assert.equal(released.release_errors,0);assert.equal(released.failed,false)
  assert.equal(released.release_reason,'timer');assert.ok(released.duration_ms>=1000)
  assert.equal(released.warming,false);assert.equal(released.warm_held,0);assert.equal(released.warm_release_errors,0);assert.equal(released.unconfirmed,0)
  const receipt=status.responses.find(r=>r.request_id===response.request_id)
  if(!receipt||receipt.status!==503||receipt.local.inFlight<1||receipt.local.timedOut<1)fail('native_http_retention_window_not_observed_by_fixture')
  process.stdout.write(JSON.stringify({event:'native_http_real_hold_cleanup_evidence',hold_duration_ms:released.duration_ms,queue_observed_elapsed_ms:queued.hold.elapsed_ms,actual_clients_acquired:2,actual_clients_released:2,response_elapsed_ms:response.elapsed_ms,reservation_retained_at_response:true})+'\n')
  result={http_status:503,real_timeout_observed:true,reservation_retained_at_response:true,real_pool_hold_released:true,queued_during_fixed_hold:true}
 }catch(error){primary=error}
 const cleanup=[]
 for(const rule of rules)try{removeAckRule(s,rule)}catch(error){cleanup.push(error)}
 // No timed-out or failed HTTP promise is abandoned during fault teardown.
 if(requestOutcome)await requestOutcome
 if(cleanup.length)throw new AggregateError([...(primary?[primary]:[]),...cleanup],'native_http_exact_fault_cleanup_failed')
 if(primary)throw primary
 await nativeHttpClean(s)
 const after=await nativeHttpRead(s,'admin');assert.equal(after.status,200);await nativeHttpClean(s)
 return Object.freeze({...result,actual_cleanup_verified:true,new_explicit_request_succeeded:true})
}

async function snapshotValue(s,value){const m=await import(pathToFileURL(s.stage.nativeRoot+'/services/pg-api/src/worker-heartbeat-contract.ts').href);return m.parseWorkerHeartbeatSnapshot(value)}
async function wire(s){
 if(s.closed||!s.control||s.control.exited)fail('own_control_required')
 const actual=fs.lstatSync(paths.reader),saved=s.ownedSockets.get(paths.reader);if(!saved||!sameStamp(actual,saved)||!actual.isSocket())fail('reader_socket_changed')
 const socket=net.createConnection({path:paths.reader}),read={socket,closed:false,busy:false,meta:null,prepared:false,finished:false}
 s.reads.add(read);socket.on('error',()=>{});socket.once('close',()=>{read.closed=true})
 try{await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{socket.destroy();reject(Error('telemetry_control_ci_wire_connect_timeout'))},2000);socket.once('connect',()=>{clearTimeout(timer);resolve()});socket.once('error',()=>{clearTimeout(timer);reject(Error('telemetry_control_ci_wire_connect_refused'))});socket.once('close',()=>{clearTimeout(timer);reject(Error('telemetry_control_ci_wire_closed'))})})}catch(error){socket.destroy();s.reads.delete(read);throw error}
 read.request=async body=>{
  if(read.closed||read.busy)fail('owned_wire_unavailable');read.busy=true
  return new Promise((resolve,reject)=>{let bytes=Buffer.alloc(0),done=false
   const cleanup=()=>{clearTimeout(timer);socket.off('data',data);socket.off('error',bad);socket.off('close',bad);read.busy=false}
   const refuse=()=>{if(done)return;done=true;cleanup();socket.destroy();reject(Error('telemetry_control_ci_wire_refused'))},bad=()=>refuse(),timer=setTimeout(refuse,8000)
   const data=b=>{bytes=Buffer.concat([bytes,b]);if(bytes.length>16388)return refuse();if(bytes.length<4)return;const n=bytes.readUInt32BE(0);if(n<1||n>16384||bytes.length>n+4)return refuse();if(bytes.length<n+4)return
    try{const value=s.contract.parseWorkerHeartbeatControlJson(bytes.subarray(4)),o=fields(value,['protocol','request_id','ok','value']);if(o.protocol!=='worker_heartbeat_control_v1'||o.request_id!==body.request_id||typeof o.ok!=='boolean')return refuse();let code;if(!o.ok){const e=fields(o.value,['code']);if(!s.contract.controlErrorCodes.includes(e.code))return refuse();code=e.code}done=true;cleanup();if(o.ok)resolve(o.value);else reject(Object.assign(Error('telemetry_control_ci_wire_refused'),{code}))}catch{refuse()}
   }
   socket.on('data',data);socket.once('error',bad);socket.once('close',bad);socket.write(packet(body))
  })
 }
 read.prepare=async()=>{if(read.prepared)fail('prepare_once');const value=fields(await read.request({protocol:'worker_heartbeat_control_v1',request_id:randomUUID(),op:'prepare_read'}),['pending_id','instance_id','epoch','remaining_ms']);if(!hex(value.pending_id)||value.instance_id!==s.instance||!s.contract.controlEpoch(value.epoch)||!Number.isSafeInteger(value.remaining_ms)||value.remaining_ms<1||value.remaining_ms>5000)fail('real_pending_metadata');read.meta=value;read.prepared=true;return Object.freeze({prepared:true,epoch:value.epoch})}
 read.finish=async()=>{if(!read.meta)fail('prepare_required');const value=await read.request({protocol:'worker_heartbeat_control_v1',request_id:randomUUID(),op:'finish_read',pending_id:read.meta.pending_id,instance_id:read.meta.instance_id,epoch:read.meta.epoch});read.finished=true;return snapshotValue(s,value)}
 read.cancel=async()=>{if(!read.meta||read.closed)return;await read.request({protocol:'worker_heartbeat_control_v1',request_id:randomUUID(),op:'cancel_read',pending_id:read.meta.pending_id,instance_id:read.meta.instance_id,epoch:read.meta.epoch})}
 read.close=async()=>{socket.destroy();s.reads.delete(read)}
 return read
}
async function waitReaders(s){await until(async()=>{const status=await rpc(s,{op:'inspect'});if(status.in_flight_reads!==0)return false;const rows=(await s.telemetry.query("SELECT count(*)::integer AS n FROM pg_stat_activity WHERE datid=$1::oid AND usename='studio_telemetry_reader' AND (state IS DISTINCT FROM 'idle' OR xact_start IS NOT NULL)",[s.binding.database_oid])).rows;return rows[0]?.n===0},'actual_reader_cleanup_timeout',20000)}
function draft(s,reader='keep'){return {protocol:'worker_heartbeat_activation_draft_v1',reader,kinds:s.currentPolicy.kinds.map(v=>({...v})),slots:s.currentPolicy.slots.map(v=>({kind:v.kind,slot_no:v.slot_no,action:'keep'}))}}
async function prepare(s,data){
 if(s.closed)fail('fixture_closed');const status=await rpc(s,{op:'inspect'});if(!hex(status.policy_sha256))fail('comparison_state_required')
 const action_id=randomUUID(),payload={protocol:'worker_heartbeat_control_draft_v1',action_id,expected_epoch:status.fence_epoch,before_sha256:status.policy_sha256,desired_policy:s.contract.parseWorkerHeartbeatControlJson(Buffer.from(JSON.stringify(data))),expires_at:new Date(Date.now()+120000).toISOString()}
 signed(s,paths.config+'/drafts/'+action_id+'.json',payload);const summary=await rpc(s,{op:'prepare',action_id});if(summary.action_id!==action_id||!hex(summary.plan_sha256)||!hex(summary.before_sha256)||!hex(summary.after_sha256)||summary.expected_epoch!==status.fence_epoch||summary.before_sha256!==status.policy_sha256)fail('actual_prepared_summary')
 const handle=Object.freeze({...summary});s.plans.set(handle,{summary,used:false});return handle
}
async function apply(s,handle){
 const p=s.plans.get(handle);if(!p||p.used)fail('own_prepared_required');p.used=true;const a=p.summary
 signed(s,paths.config+'/approvals/'+a.action_id+'.json',{protocol:'worker_heartbeat_control_approval_v1',action_id:a.action_id,plan_sha256:a.plan_sha256,source_sha256:s.stage.sourceSha,binding_sha256:sha(JSON.stringify(s.binding)),expected_epoch:a.expected_epoch,actor:'owned-synthetic-ci',not_before:new Date(Date.now()-1000).toISOString(),expires_at:new Date(Date.now()+120000).toISOString(),scope:'MUTATE_TELEMETRY_REGISTRY_ONLY'})
 s.lastAction=a.action_id;const result=await rpc(s,{op:'apply',action_id:a.action_id});if(result.action_id!==a.action_id||result.commit_acknowledged!==true||result.after_verified!==true||result.publication_completed!==true||result.automatic_retry_authorized!==false)fail('actual_mutation_ack_required')
 const staged=s.contract.parseWorkerHeartbeatControlJson(read(paths.store+'/plans/'+a.action_id+'.material.json'),2097152);if(staged.material.plan_sha256!==a.plan_sha256||staged.material.after_sha256!==a.after_sha256)fail('actual_staged_material_binding');s.currentPolicy=staged.material.after_policy
 const status=await rpc(s,{op:'inspect'});if(status.policy_sha256!==a.after_sha256||status.fence_epoch!==result.epoch||status.read_gate!==(s.currentPolicy.reader.login?'open':'closed'))fail('published_epoch_binding')
 return result
}
async function credential(s,name){
 if(!names.slice(1).includes(name))fail('fixed_credential_name');const status=await rpc(s,{op:'inspect'}),entries=fs.readdirSync(paths.store+'/credentials').filter(v=>v.startsWith(name+'.')&&/\.[0-9]+\.json$/.test(v)).sort((a,b)=>BigInt(a.split('.')[1])<BigInt(b.split('.')[1])?-1:1)
 const latest=entries.at(-1);if(!latest)fail('published_credential_missing');const c=s.contract.parseWorkerHeartbeatControlJson(read(paths.store+'/credentials/'+latest));if(c.protocol!=='worker_heartbeat_control_credential_v1'||c.role!==name||c.oid!==s.binding.roles.find(v=>v.name===name)?.oid||BigInt(c.epoch)>BigInt(status.published_epoch??'0')||c.password!==null&&(typeof c.password!=='string'||!/^[a-f0-9]{64}$/.test(c.password)))fail('credential_binding');return c
}
async function record(s,input){
 const x=fields(input,['sequence','state','reason']);if(!Number.isSafeInteger(x.sequence)||x.sequence<1||!((x.state==='ready'&&x.reason==='startup_checks_complete')||(x.state==='unknown'&&['startup_checks_pending','loop_unavailable'].includes(x.reason))||(x.state==='draining'&&x.reason==='new_claims_closed')))fail('report_data')
 const c=await credential(s,'studio_telemetry_tx_prepare_1');if(!c.password||!uuid(c.generation))fail('active_writer_required')
 const raw=new s.pg.Client({...s.telemetryOptions,user:c.role,password:c.password,max:undefined});raw.on('error',()=>{});s.writers.add(raw)
 try{await raw.connect();const role=(await raw.query('SELECT current_database() AS db,current_user::text AS actor,session_user::text AS login,oid::integer AS oid FROM pg_roles WHERE rolname=session_user')).rows[0];if(role.db!=='agent_studio_telemetry'||role.actor!==c.role||role.login!==c.role||role.oid!==c.oid)fail('actual_writer_identity')
  const r=(await raw.query('SELECT studio_telemetry.record($1,$2,$3::bigint,$4,$5) AS value',['native_worker_heartbeat_report_v1',c.generation,x.sequence,x.state,x.reason])).rows[0]?.value;if(!r||r.accepted!==true||String(r.sequence)!==String(x.sequence))fail('actual_record_ack');return Object.freeze({accepted:true,sequence:x.sequence})
 }finally{await raw.end();s.writers.delete(raw)}
}
const commitCompleteHex='|430000000b434f4d4d495400|'
function iptables(args){return execFileSync('/usr/sbin/iptables',['--wait','5',...args],{env:{PATH:'/usr/sbin:/usr/bin:/sbin:/bin',LANG:'C.UTF-8',LC_ALL:'C'},timeout:10000,maxBuffer:262144,stdio:['ignore','pipe','pipe'],windowsHide:true})}
function rulePresent(rule){try{iptables(['-C','OUTPUT',...rule.args]);return true}catch(error){if(error?.status===1)return false;throw safe('own_ack_rule_check',error)}}
function removeAckRule(s,rule){
 if(!s.ackRules.has(rule))fail('own_ack_rule_reference')
 let primary
 try{if(rulePresent(rule))iptables(['-D','OUTPUT',...rule.args])}catch(error){primary=safe('own_ack_rule_delete',error)}
 // An uncertain delete is settled by a real exact rule check, not a local bit.
 try{if(rulePresent(rule))throw primary??Error('telemetry_control_ci_fixture_refused:own_ack_rule_remains')}catch(error){throw primary??safe('own_ack_rule_absence',error)}
 s.ackRules.delete(rule)
}
async function rotateAckLoss(s,api){
 // Re-admit the actual distinct hosted proof before any rule/probe side effect.
 const ci=workerHeartbeatActivationControlCiDescriptor(s.proof)
 if(s.closed||ci.nonce!==s.ci.nonce||s.currentPolicy.slots[0].mode!=='active')fail('own_active_rotate_required')
 const d=draft(s);d.slots[0].action='rotate';const prepared=await prepare(s,d)
 const status=await rpc(s,{op:'inspect'}),journal=read(paths.store+'/journal.jsonl').toString('utf8').trimEnd().split('\n').map(v=>s.contract.parseWorkerHeartbeatControlJson(Buffer.from(v),2097152)),boot=journal.reverse().find(r=>r.phase==='boot'&&r.instance_id===status.instance_id&&r.data?.control_backend)
 if(!boot)fail('own_ack_backend_ledger');const b=fields(boot.data.control_backend,['pid','started']);if(!Number.isInteger(b.pid)||b.pid<1||typeof b.started!=='string')fail('own_ack_backend_identity')
 const rows=(await s.telemetry.query("SELECT a.pid,a.backend_start::text AS started,a.client_port,host(a.client_addr) AS client_addr,a.datid::text AS database_oid,r.oid::text AS operator_oid,a.backend_type FROM pg_stat_activity a JOIN pg_roles r ON r.rolname=a.usename WHERE a.pid=$1 AND a.backend_start=$2::timestamptz AND a.datid=$3::oid AND r.oid=$4::oid",[b.pid,b.started,s.binding.database_oid,s.binding.operator_oid])).rows
 const r=rows[0];if(rows.length!==1||r.pid!==b.pid||r.started!==b.started||r.client_addr!=='127.0.0.1'||r.database_oid!==String(s.binding.database_oid)||r.operator_oid!==String(s.binding.operator_oid)||r.backend_type!=='client backend'||!Number.isInteger(r.client_port)||r.client_port<1024||r.client_port>65535||[5333,5432].includes(r.client_port))fail('actual_own_ack_client_port')
 const comment='agentstudio-telemetry-control-ci:'+ci.run+':'+ci.attempt+':'+ci.nonce.slice(0,16)+':'+prepared.action_id
 const rule=Object.freeze({comment,args:Object.freeze(['-p','tcp','-s','127.0.0.1','-d','127.0.0.1','--sport','5333','--dport',String(r.client_port),'-m','comment','--comment',comment,'-m','string','--algo','bm','--hex-string',commitCompleteHex,'-j','DROP'])})
 // Check absence before claiming ownership; never remove an existing rule.
 if(rulePresent(rule))fail('ack_rule_not_unique');s.ackRules.add(rule)
 let primary
 try{
  iptables(['-I','OUTPUT','1',...rule.args]);if(!rulePresent(rule))fail('actual_ack_rule_missing')
  let lost=false
  try{await apply(s,prepared)}catch(error){if(error instanceof s.contract.WorkerHeartbeatControlError&&error.code==='commit_unknown')lost=true;else throw error}
  if(!lost)fail('actual_commit_ack_was_not_lost')
  await api.waitForLastJournalPhase('commit_unknown');const closed=await api.inspect();if(closed.phase!=='recovery_required'||closed.read_gate!=='closed'||closed.mutation_in_flight!==false)fail('unknown_must_remain_closed')
 }catch(error){primary=error}
 try{removeAckRule(s,rule)}catch(cleanup){if(primary)throw new AggregateError([primary,cleanup],'telemetry_control_ci_ack_loss_and_exact_rule_cleanup_failed');throw cleanup}
 if(primary)throw primary
 // The controller deliberately does not equate raw.end()/RPC settlement with
 // PostgreSQL backend exit. Observe absence of this exact attested old session
 // before requesting its independent read-only recovery classification.
 await until(async()=>(await s.telemetry.query('SELECT NOT EXISTS(SELECT 1 FROM pg_stat_activity WHERE pid=$1 AND backend_start=$2::timestamptz AND datid=$3::oid) AS gone',[b.pid,b.started,s.binding.database_oid])).rows[0]?.gone===true,'actual_lost_ack_backend_absence_timeout',20000)
 // Recover performs independent genuine RRRO catalog/registry/material reads;
 // the actual report, not a synthetic committed marker, decides this assertion.
 const report=await api.recoverLast();if(report.observed!=='after_matches'||report.original_commit_acknowledged!==false||report.read_gate_opened!==false||report.automatic_retry_authorized!==false)fail('actual_lost_ack_recovery_after_required')
 const resumed=await api.resumeLast(report);if(resumed.phase!==(s.currentPolicy.reader.login?'serving':'closed')||resumed.read_gate!==(s.currentPolicy.reader.login?'open':'closed'))fail('actual_fresh_resume_required')
 return Object.freeze({action_id:prepared.action_id,recovery:report,resumed})
}
function makeApi(s){
 const api={
  writer:writerCiApi(s),
  inspect:()=>rpc(s,{op:'inspect'}),
  prepare:data=>prepare(s,data),apply:handle=>apply(s,handle),
  async change(data){return apply(s,await prepare(s,data))},
  async activateFirst(){const d=draft(s,s.currentPolicy.reader.login?'keep':'activate');d.kinds[0]={kind:'prepare',instrumented:true,enabled:true};d.slots[0].action='activate';return this.change(d)},
  async rotateFirst(){const d=draft(s);d.slots[0].action='rotate';return this.change(d)},
  rotateFirstWithCommitAckLoss(){return rotateAckLoss(s,api)},
  async retireFirst(){const d=draft(s);d.slots[0].action='retire';d.kinds[0].enabled=false;return this.change(d)},
  disableReader(){return this.change(draft(s,'disable'))},
  enableReader(){return this.change(draft(s,'activate'))},
  recordFirst:input=>record(s,input),
  async controlledRead(){
   const start=performance.now(),r=await wire(s);let phase='prepare'
   try{await r.prepare();process.stdout.write(JSON.stringify({event:'telemetry_control_ci_read_phase',phase,elapsed_ms:Math.round(performance.now()-start)})+'\n');phase='finish';const result=await r.finish();process.stdout.write(JSON.stringify({event:'telemetry_control_ci_read_phase',phase,elapsed_ms:Math.round(performance.now()-start)})+'\n');return result}
   catch(error){const code=Object.getOwnPropertyDescriptor(error??{},'code')?.value;process.stderr.write(JSON.stringify({event:'telemetry_control_ci_read_phase_failed',phase,elapsed_ms:Math.round(performance.now()-start),...(s.contract.controlErrorCodes.includes(code)?{code}:{})})+'\n');throw error}
   finally{await r.close();await waitReaders(s)}
  },
  nativeReadAdmin:()=>nativeRead(s,'admin'),nativeReadEmployee:()=>nativeRead(s,'employee'),nativeReadMissing:()=>nativeRead(s,'missing'),
  nativeHttpStart:()=>nativeHttpStart(s),nativeHttpRead:choice=>nativeHttpRead(s,choice),nativeHttpEnable:()=>nativeHttpCommand(s,'enable'),nativeHttpStatus:()=>nativeHttpCommand(s,'status'),
  nativeHttpCapacity:()=>nativeHttpCapacity(s),nativeHttpLateCleanup:()=>nativeHttpLateCleanup(s),nativeHttpClean:()=>nativeHttpClean(s),nativeHttpStop:()=>nativeHttpStop(s),
  async openRead(){const r=await wire(s);return Object.freeze({prepare:()=>r.prepare(),finish:()=>r.finish(),cancel:()=>r.cancel(),close:()=>r.close()})},
  async assertReplayRefused(){const r=await wire(s);try{await r.prepare();await r.finish();await assert.rejects(()=>r.finish(),error=>error.code==='untrusted_reference'||error.code==='lease_revoked'||error.code==='lease_replayed')}finally{await r.close();await waitReaders(s)}return true},
  async assertCapacityAndExpiry(){
   const a=await wire(s),b=await wire(s);let c,expired
   const first=a.prepare().then(value=>({value}),error=>({error})),second=b.prepare().then(value=>({value}),error=>({error}))
   try{await until(async()=>(await rpc(s,{op:'inspect'})).in_flight_reads===2,'two_real_read_reservations',4000)
    await assert.rejects(async()=>{c=await wire(s);await c.prepare()},/telemetry_control_ci_wire_|reader_capacity/)
    // Observe both actual prepare settlements, even if a bounded queued read
    // expires. No detached timed-out query is treated as released capacity.
    for(const r of await Promise.all([first,second]))if(r.error&&!/telemetry_control_ci_wire_|owned_wire_unavailable/.test(r.error.message))throw r.error
    for(const r of [a,b,c])if(r)await r.close();await waitReaders(s)
    const active=(await s.telemetry.query("SELECT count(*)::integer AS n FROM pg_stat_activity WHERE datid=$1::oid AND usename='studio_telemetry_reader'",[s.binding.database_oid])).rows[0];assert.ok(active.n<=2)
    expired=await wire(s);await expired.prepare();await delay(5200);await assert.rejects(()=>expired.finish(),/telemetry_control_ci_wire_|owned_wire_unavailable/);await waitReaders(s);assert.equal((await rpc(s,{op:'inspect'})).in_flight_reads,0)
   }finally{await Promise.all([first,second]);for(const r of [a,b,c,expired])if(r)await r.close()}
   return true
  },
  waitReadersClean:()=>waitReaders(s),
  async waitForLastJournalPhase(phase){
   if(!s.lastAction||!['before_change','material_staged','commit_pending','commit_acknowledged','commit_unknown','rollback_known','rollback_unknown','publication_pending','published'].includes(phase))fail('fixed_journal_phase')
   let observed
   await until(()=>{const bytes=read(paths.store+'/journal.jsonl').toString('utf8');if(!bytes.endsWith('\n'))return false;for(const line of bytes.trimEnd().split('\n')){const record=s.contract.parseWorkerHeartbeatControlJson(Buffer.from(line),2097152);if(record.action_id===s.lastAction&&record.phase===phase){observed={action_id:record.action_id,phase:record.phase,epoch:record.epoch,record_sha256:record.record_sha256,observed_file_data_only:true,is_commit_proof:false};return true}}return false},'own_phase_observation_timeout',30000)
   return Object.freeze(observed)
  },
  async recoverLast(){if(!s.lastAction)fail('original_action_required');const result=await rpc(s,{op:'recover',action_id:s.lastAction});if(result.action_id!==s.lastAction||result.automatic_retry_authorized!==false||result.read_gate_opened!==false||!hex(result.journal_head_sha256))fail('actual_recovery_report');s.lastRecovery=result;return result},
  async resumeLast(report){if(!s.lastAction||report!==s.lastRecovery||!['before_matches','after_matches'].includes(report.observed))fail('actual_own_recovery_report_required');const status=await rpc(s,{op:'inspect'}),id=randomUUID();signed(s,paths.config+'/resumes/'+id+'.json',{protocol:'worker_heartbeat_control_resume_v1',action_id:id,recovered_action_id:s.lastAction,expected_epoch:status.fence_epoch,journal_head_sha256:report.journal_head_sha256,source_sha256:s.stage.sourceSha,binding_sha256:sha(JSON.stringify(s.binding)),observed:report.observed,actor:'owned-synthetic-ci',not_before:new Date(Date.now()-1000).toISOString(),expires_at:new Date(Date.now()+120000).toISOString(),scope:'RESUME_VERIFIED_PUBLICATION_ONLY'});const result=await rpc(s,{op:'resume_publication',action_id:id,recovered_action_id:s.lastAction});if(report.observed==='after_matches'){const staged=s.contract.parseWorkerHeartbeatControlJson(read(paths.store+'/plans/'+s.lastAction+'.material.json'),2097152);s.currentPolicy=staged.material.after_policy}return result},
  async terminateOwnControllerBackend(){
   const status=await rpc(s,{op:'inspect'}),records=read(paths.store+'/journal.jsonl').toString('utf8').trimEnd().split('\n').map(v=>s.contract.parseWorkerHeartbeatControlJson(Buffer.from(v),2097152)),boot=records.reverse().find(r=>r.phase==='boot'&&r.instance_id===status.instance_id&&r.data?.control_backend)
   if(!boot)fail('actual_own_control_backend_required');const b=fields(boot.data.control_backend,['pid','started']);if(!Number.isInteger(b.pid)||b.pid<1||typeof b.started!=='string')fail('backend_identity')
   const rows=(await s.telemetry.query('SELECT pg_terminate_backend(a.pid) AS stopped FROM pg_stat_activity a JOIN pg_roles r ON r.rolname=a.usename WHERE a.pid=$1 AND a.backend_start=$2::timestamptz AND a.datid=$3::oid AND r.oid=$4::oid',[b.pid,b.started,s.binding.database_oid,s.binding.operator_oid])).rows;if(rows.length!==1||rows[0].stopped!==true)fail('own_backend_termination');await until(async()=>(await s.telemetry.query('SELECT NOT EXISTS(SELECT 1 FROM pg_stat_activity WHERE pid=$1 AND backend_start=$2::timestamptz) AS gone',[b.pid,b.started])).rows[0]?.gone===true,'own_control_backend_still_live');return true
  },
  async restart(){await stopProcess(s,s.control);if(s.controlBackend)await until(async()=>(await s.telemetry.query('SELECT NOT EXISTS(SELECT 1 FROM pg_stat_activity WHERE pid=$1 AND backend_start=$2::timestamptz) AS gone',[s.controlBackend.pid,s.controlBackend.started])).rows[0]?.gone===true,'actual_old_control_absence');await removeSockets(s);await startController(s);return rpc(s,{op:'inspect'})},
  async verify(){stageBinding(s.stage,s.ci);if(await s.containers.verifyTelemetryControlCiContainer(s.container)!==true)fail('owned_container_binding');if(await nativeSchema(s)!==s.nativeSchema)fail('native_schema_changed');if(!s.writerBusiness)await s.installer.verifyRuntimeSchemaReceipt(s.nativeAdmin,s.snapshot,true);else await verifyWriterBusiness(s);if(s.closed)fail('fixture_closed');const status=await rpc(s,{op:'inspect'});if(status.instance_id!==s.instance||status.in_flight_reads>2)fail('actual_controller_status');return true},
  async final(){await waitReaders(s);await this.verify();const rows=(await s.nativeAdmin.query('SELECT (SELECT count(*)::integer FROM agentstudio_auth.accounts) AS accounts,(SELECT count(*)::integer FROM agentstudio.jobs) AS jobs,(SELECT count(*)::integer FROM agentstudio.runs) AS runs')).rows[0];if(rows.accounts!==2||rows.jobs!==0||rows.runs!==0||await s.repo.inspectEmployeeGovernance()!==true||await nativeHttpData(s)!==s.nativeDataSha)fail('synthetic_native_data_invariants');return true},
  close:()=>closeFixture(s),
 }
 return api
}
async function stopProcess(s,c){
 if(!c)return
 if(!s.children.has(c))fail('only_owned_child_stop')
 if(!c.exited){c.p.kill('SIGTERM');try{await until(()=>c.exited,'own_child_term_timeout',12000)}catch{if(!c.exited)c.p.kill('SIGKILL');await until(()=>c.exited,'own_child_kill_timeout',5000)}}
 if(!c.exited)fail('own_child_exit_unknown');s.children.delete(c)
}
async function removeSockets(s){
 for(const [file,expected]of s.ownedSockets){if(fs.existsSync(file)){const st=fs.lstatSync(file);if(!st.isSocket()||!sameStamp(st,expected)||!['/run/agentstudio-telemetry-control/operator.sock','/run/agentstudio-telemetry-control/reader.sock'].includes(path.resolve(file)))fail('own_socket_replaced');fs.unlinkSync(file)}}s.ownedSockets.clear();if(fs.existsSync(paths.sockets))syncDir(paths.sockets)
}
function removeOwnDirectory(s,dir){
 const expected=s.ownedDirectories.get(dir),resolved=path.resolve(dir)
 if(!expected||resolved!==dir||![paths.config,paths.store,paths.credentials,paths.sockets,paths.config+'/drafts',paths.config+'/approvals',paths.config+'/resumes',paths.store+'/plans',paths.store+'/credentials'].includes(resolved))fail('cleanup_path')
 if(!fs.existsSync(dir)){s.ownedDirectories.delete(dir);return}
 const st=fs.lstatSync(dir);if(!sameStamp(st,expected)||!st.isDirectory()||st.isSymbolicLink())fail('own_directory_replaced')
 for(const name of fs.readdirSync(dir)){const file=path.join(dir,name),a=fs.lstatSync(file);if(a.isSymbolicLink()||a.uid!==0||a.dev!==st.dev)fail('cleanup_unknown_entry');if(a.isDirectory()){if(!s.ownedDirectories.has(file))fail('cleanup_unknown_directory');removeOwnDirectory(s,file)}else if(a.isFile()&&a.nlink===1||(a.isSocket()&&[paths.reader,paths.ops].includes(file))){fs.unlinkSync(file)}else fail('cleanup_unknown_type')}
 fs.rmdirSync(dir);s.ownedDirectories.delete(dir)
}
async function closeFixture(s){
 if(s.closing)return s.closing
 s.closed=true
 s.closing=(async()=>{const errors=[]
  for(const rule of [...s.ackRules])try{removeAckRule(s,rule)}catch(error){errors.push(safe('own_ack_rule_cleanup',error))}
  if(s.httpNative)try{await nativeHttpStop(s)}catch(error){errors.push(safe('own_native_http_close',error))}
  for(const r of [...s.reads])try{await r.close()}catch(error){errors.push(safe('own_read_close',error))}
  for(const lock of [...s.writerRowLocks?.values()??[]])try{await lock.handle.release()}catch(error){errors.push(safe('own_writer_row_lock_release',error))}
  for(const c of [...s.children])try{await stopProcess(s,c)}catch(error){errors.push(safe('own_child_stop',error))}
  for(const c of [...s.writers])try{await c.end();s.writers.delete(c)}catch(error){errors.push(safe('own_writer_close',error))}
  // Actual SQL backend absence is queried after process exit, never inferred
  // from kill/destroy. Pool idle readers are gone after own controller exits.
  if(s.telemetry)try{await until(async()=>(await s.telemetry.query("SELECT NOT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datid=$1::oid AND usename='studio_telemetry_reader') AS gone",[s.binding?.database_oid??0])).rows[0]?.gone===true,'reader_backend_absence_timeout',10000)}catch(error){errors.push(safe('actual_reader_absence',error))}
  if(s.telemetry&&s.writerSettings)try{await until(async()=>(await writerBackendRows(s)).length===0,'writer_actual_backend_absence',12000)}catch(error){errors.push(safe('writer_backend_absence',error))}
  for(const p of [...s.pools])try{await p.end();s.pools.delete(p)}catch(error){errors.push(safe('own_pool_close',error))}
  let containerGone=false
  if(s.container)try{await s.containers.closeTelemetryControlCiContainer(s.container);containerGone=true;s.container=null}catch(error){errors.push(safe('own_container_close',error))}
  if(!s.children.size&&containerGone){
   try{await writerArtifactsCleanup(s)}catch(error){errors.push(safe('writer_owned_artifact_cleanup',error))}
   try{await removeSockets(s);for(const dir of [...s.ownedDirectories.keys()].sort((a,b)=>b.length-a.length))if(s.ownedDirectories.has(dir))removeOwnDirectory(s,dir)}catch(error){errors.push(safe('own_root_cleanup',error))}
   // Parent owns both immutable code stages. Leave its nonce marker alongside
   // them for parent stage disposal; never recursively remove a stage here.
  }
  if(errors.length){
   const allowed=['own_ack_rule_cleanup','own_native_http_close','own_read_close','own_child_stop','own_writer_row_lock_release','own_writer_close','actual_reader_absence','writer_backend_absence','own_pool_close','own_container_close','writer_owned_artifact_cleanup','own_root_cleanup']
   const failures=errors.map(error=>{const value=/^telemetry_control_ci_fixture_refused:([a-z_]+):([A-Z0-9_]+)$/.exec(String(error?.message));return {phase:value&&allowed.includes(value[1])?value[1]:'unknown',sqlstate:value&&/^[A-Z0-9]{5}$/.test(value[2])?value[2]:null}})
   process.stderr.write(JSON.stringify({event:'genuine_writer_ci_cleanup_failure_phases',failures})+'\n')
   throw new AggregateError(errors,'telemetry_control_ci_fixture_owned_cleanup_failed')
  }
 })();return s.closing
}

// Additional effects belong only to the already verified disposable fixture.
function writerCiProfile(s,base){
 const variants=['v1','v2_omitted','v2_off','v2_on'];if(!variants.includes(s.writerVariant))fail('writer_variant')
 const settings={enabled:true,native_uid:s.workspace.uid,groups:kinds.map((kind,i)=>({kind,gid:62000+i})),boot_uids:Array.from({length:128},(_,i)=>63000+i),uid_policy:'exclusive_never_reuse'}
 if(settings.groups.some(v=>v.gid===s.workspace.gid)||settings.boot_uids.includes(s.workspace.uid))fail('reserved_identity_collision')
 const passwd=fs.readFileSync('/etc/passwd','utf8').split('\n').filter(Boolean).map(line=>Number(line.split(':')[2]))
 if(settings.boot_uids.some(uid=>passwd.includes(uid)))fail('reserved_uid_already_allocated')
 s.writerSettings=settings;s.writerChildren=new Set();s.writerFiles=new Map();s.writerDirectories=new Map();s.writerMounts=[];s.writerRowLocks=new Map();s.writerRecordWitnesses=new WeakMap();s.writerStoppedChildren=new WeakSet()
 const protocol=s.writerVariant==='v1'?base.protocol:'worker_heartbeat_control_profile_v2'
 s.writerProfile={...base,protocol,...(s.writerVariant==='v2_on'?{writers:settings}:s.writerVariant==='v2_off'?{writers:{enabled:false}}:{})}
 return s.writerProfile
}
function writerPrivateDirectory(s,dir,mode=0o700){
 ancestor(path.dirname(dir));if(fs.existsSync(dir))fail('writer_existing_owned_directory');fs.mkdirSync(dir,{mode});fs.chmodSync(dir,mode);s.writerDirectories.set(dir,stamp(fs.lstatSync(dir)))
}
function writerFile(s,file,bytes,uid=0,mode=0o600){
 if(!Buffer.isBuffer(bytes))bytes=Buffer.from(bytes);const fd=fs.openSync(file,fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_NOFOLLOW,mode)
 try{fs.writeFileSync(fd,bytes);fs.fchownSync(fd,uid,0);fs.fchmodSync(fd,mode);fs.fsyncSync(fd)}finally{fs.closeSync(fd)}
 const st=fs.lstatSync(file);if(!st.isFile()||st.isSymbolicLink()||st.uid!==uid||st.gid!==0||(st.mode&0o7777)!==mode||st.nlink!==1||sha(fs.readFileSync(file))!==sha(bytes))fail('writer_owned_file')
 s.writerFiles.set(file,{...stamp(st),sha256:sha(bytes)});return {source:file,sha256:sha(bytes)}
}
async function writerCodeStage(s){
 s.writerWork='/root/agentstudio-telemetry-writer-ci-'+s.ci.run+'-'+s.ci.attempt+'-'+s.ci.nonce.slice(0,16)
 s.writerCode='/var/lib/agentstudio-telemetry-writer-ci-'+s.ci.run+'-'+s.ci.attempt+'-'+s.ci.nonce.slice(0,16)
 writerPrivateDirectory(s,s.writerWork);writerPrivateDirectory(s,s.writerWork+'/business');writerPrivateDirectory(s,s.writerCode)
 // Only actual checked-out source and installed locked dependencies. Never
 // copy .env, pb_data, company data or user-supplied package/target material.
 const copyTree=(from,to)=>{
  if(!fs.existsSync(to)){fs.mkdirSync(to,{mode:0o700});s.writerDirectories.set(to,stamp(fs.lstatSync(to)))}
  for(const name of fs.readdirSync(from)){
   if(name.startsWith('.env')||['pb_data','.git'].includes(name))fail('writer_stage_forbidden_file')
   const src=path.join(from,name),dst=path.join(to,name),resolved=fs.realpathSync(src),st=fs.statSync(src)
   if(st.isDirectory())copyTree(resolved,dst)
   else if(st.isFile())writerFile(s,dst,fs.readFileSync(resolved),0,0o444)
   else fail('writer_stage_type')
  }
 }
 for(const relative of ['services','services/pg-api','services/pg-api/tests','services/pg-api/tests/helpers','db']){const dir=s.writerCode+'/'+relative;if(!fs.existsSync(dir))writerPrivateDirectory(s,dir)}
 for(const relative of ['services/pg-api/src','shared','db/postgres'])copyTree(root+'/'+relative,s.writerCode+'/'+relative)
 copyTree(s.stage.controlRoot+'/services/pg-api/node_modules',s.writerCode+'/services/pg-api/node_modules')
 for(const relative of ['services/pg-api/package.json','services/pg-api/pnpm-lock.yaml','services/pg-api/tests/helpers/worker-heartbeat-writer-ci-child.mjs','services/pg-api/tests/helpers/worker-heartbeat-activation-control-ci-guard.mjs'])writerFile(s,s.writerCode+'/'+relative,fs.readFileSync(root+'/'+relative),0,0o444)
 // The original guard's one relative import is copied as actual source too.
 s.writerChild=s.writerCode+'/services/pg-api/tests/helpers/worker-heartbeat-writer-ci-child.mjs';s.writerChildSha=sha(fs.readFileSync(s.writerChild))
 const manifest=[...s.writerFiles].filter(([file])=>file.startsWith(s.writerCode+'/')).map(([file,v])=>({path:file.slice(s.writerCode.length+1),sha256:v.sha256})).sort((a,b)=>a.path.localeCompare(b.path))
 writerFile(s,s.writerWork+'/worker-code-manifest.json',JSON.stringify({source_revision:s.ci.source_revision,files:manifest})+'\n')
 for(const dir of [...s.writerDirectories.keys()].filter(dir=>dir===s.writerCode||dir.startsWith(s.writerCode+'/')).sort((a,b)=>b.length-a.length)){fs.chmodSync(dir,0o555);s.writerDirectories.set(dir,stamp(fs.lstatSync(dir)))}
}
function writerJournal(s){return read(paths.store+'/journal.jsonl').toString('utf8').trimEnd().split('\n').map(line=>s.contract.parseWorkerHeartbeatControlJson(Buffer.from(line),2097152))}
function writerDeliveries(s){
 const journal=writerJournal(s),staged=new Map(journal.filter(r=>r.phase==='writer_boot_staged').map(r=>[r.data.boot_id,r])),store=paths.store+'/worker-boots',result=[]
 if(!fs.existsSync(store))return result
 for(const name of fs.readdirSync(store).filter(name=>/^[a-f0-9-]{36}\.batch\.delivery\.json$/.test(name))){
  const bytes=read(store+'/'+name),d=s.contract.parseWorkerHeartbeatControlJson(bytes,8192),record=staged.get(d.boot_id)
  if(!record||d.protocol!=='worker_heartbeat_writer_delivery_v1'||d.delivery!=='read_only_bind_uid_0400'||d.requires_exclusive_uid_reservation!==true||record.instance_id!==s.instance||d.uid!==record.data.uid||!s.writerSettings.boot_uids.includes(d.uid)||!Array.isArray(d.items))continue
  for(const item of d.items){const match=record.data.bindings.find(v=>v.kind===item.kind&&v.generation===item.generation);if(!match||item.boot_id!==d.boot_id||item.uid!==d.uid||!hex(item.sha256)||item.source_file!==store+'/'+d.boot_id+'.'+item.kind+'.boot.json')fail('writer_batch_source');const st=fs.lstatSync(item.source_file);if(st.uid!==d.uid||st.gid!==0||(st.mode&0o7777)!==0o400||st.nlink!==1||!st.isFile()||st.isSymbolicLink()||sha(fs.readFileSync(item.source_file))!==item.sha256)fail('writer_exact_issued_token')}
  result.push(d)
 }
 return result
}
const writerUnits={prepare:'prepare',model:'model',workflow_safe:'workflow',workflow_v2:'workflow',agent_autonomous:'agent',knowledge_index:'knowledge-index',knowledge_query:'knowledge-index',assessment:'review-worker'}
function writerLaunchEnv(s,selected,enabled){
 const first=selected[0],unit=writerUnits[first],env={PATH:'/usr/local/bin:/usr/bin:/bin',LANG:'C.UTF-8',CREDENTIALS_DIRECTORY:'/run/credentials/agentstudio-pg18-'+unit+'.service',...(enabled?{AGENT_STUDIO_PG_WORKER_HEARTBEAT_ENABLED:'true'}:{})}
 return env
}
async function launchWriter(s,{selected,mode='component',enabled=true,batch,access=[],native=false,extraBatches=[]}){
 if(!selected.length||selected.some(kind=>!kinds.includes(kind))||selected.length>2||selected.length===2&&!selected.every(k=>k==='knowledge_index'||k==='knowledge_query'))fail('writer_fixed_launch_selection')
 if(batch&&!writerDeliveries(s).some(value=>value.boot_id===batch.boot_id&&value.uid===batch.uid))fail('writer_actual_batch_required')
 const uid=native?s.workspace.uid:!enabled&&mode==='entry'?64000+(s.writerOffUidSerial=(s.writerOffUidSerial??0)+1):batch?.uid??s.writerSettings.boot_uids.at(-1),groups=mode==='access'?access:selected.map(kind=>s.writerSettings.groups.find(v=>v.kind===kind).gid),env=writerLaunchEnv(s,selected,enabled)
 const mounts=[...(batch?[batch]:[]),...extraBatches].flatMap(value=>value.items.map(v=>({source:v.source_file,target:v.mounted_file,sha256:v.sha256,owner_uid:v.uid})))
 if(mode==='entry')Object.assign(env,await writerBusinessEnvironment(s,selected,uid,mounts))
 const claimBaseline=mode==='entry'&&selected[0]==='knowledge_index'?(await s.nativeAdmin.query("SELECT funcname,calls::text FROM pg_stat_user_functions WHERE schemaname='agentstudio' AND funcname=ANY($1::text[])",[['knowledge_index_claim','knowledge_query_claim']])).rows:[]
 const file=s.writerWork+'/plan-'+randomUUID()+'.json',plan={protocol:'worker_heartbeat_writer_ci_launch_v1',run:s.ci.run,attempt:s.ci.attempt,revision:s.ci.source_revision,stage:s.writerCode,child_sha256:s.writerChildSha,mode,kinds:selected,uid,gid:native?s.workspace.gid:uid,groups,env,mounts,access,parent_mount_namespace:fs.readlinkSync('/proc/self/ns/mnt')}
 writerFile(s,file,JSON.stringify(plan)+'\n')
 const p=spawn('/usr/bin/unshare',['--mount','--propagation','private',s.stage.nodePath,'--experimental-strip-types',s.writerChild,'--launch',file],{cwd:s.writerCode,env:{...process.env},stdio:['ignore','pipe','pipe','ipc'],windowsHide:true})
 const c={p,exited:false,exit:null,messages:[],pending:new Map(),kind:selected.join('+'),launchAt:performance.now(),outputBytes:0,claimBaseline};s.children.add(c);s.writerChildren.add(c)
 p.on('error',()=>{});p.on('message',value=>{if(!value||typeof value!=='object')return;c.messages.push(value);if(c.messages.length>256){p.kill('SIGTERM');return}if(value.event==='component_result'){const pending=c.pending.get(value.id);if(pending){c.pending.delete(value.id);clearTimeout(pending.timer);pending.resolve(value)}}if(value.event==='kernel_child_started')c.actualPid=value.pid})
 for(const stream of [p.stdout,p.stderr])stream.on('data',bytes=>{c.outputBytes+=bytes.length;if(c.outputBytes>65536)p.kill('SIGTERM')})
 p.once('close',(code,signal)=>{c.exited=true;c.exit={code,signal};for(const v of c.pending.values()){clearTimeout(v.timer);v.reject(Error('writer_ci_owned_child_exit'))}c.pending.clear()})
 await until(()=>{if(c.messages.some(v=>v.event==='kernel_child_started'))return true;if(c.exited)fail('writer_launcher_exited');return false},'writer_kernel_spawn',20000)
 try{const proc=fs.readFileSync('/proc/'+c.actualPid+'/status','utf8'),uids=proc.match(/^Uid:\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)/m);if(!uids||uids.slice(1).some(v=>Number(v)!==uid))fail('writer_actual_kernel_uid');c.kernelUidVerified=true}
 catch(error){if(error.code!=='ENOENT'||!['plan','access'].includes(mode))throw error;c.kernelUidVerified=false}
 c.uid=uid;c.groups=groups;c.selected=selected;c.batch=batch;c.mode=mode
 if(mode==='component')await until(()=>{if(c.exited)fail('writer_component_exited');return c.messages.some(v=>v.event==='component_ready')},'writer_component_import',30000)
 return c
}
async function writerCommand(s,c,command,ms=15000){
 if(!s.writerChildren.has(c)||c.exited||c.mode!=='component')fail('writer_owned_live_component')
 const id=randomUUID();return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{c.pending.delete(id);reject(Error('writer_ci_command_timeout'))},ms);c.pending.set(id,{resolve,reject,timer});c.p.send({...command,id})})
}
async function writerRows(s){return (await s.telemetry.query("SELECT kind,slot_no::integer,generation::text,last_sequence::text AS sequence,state,reason,to_char(observed_at AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"') AS observed_at,draining,enabled FROM studio_telemetry.slot_state ORDER BY kind,slot_no")).rows}
async function writerBackendRows(s){return (await s.telemetry.query("SELECT a.pid,a.backend_start::text AS started,a.usename,r.oid::integer AS role_oid,a.state,a.wait_event_type,a.wait_event,a.query,a.datid::integer AS database_oid,pg_blocking_pids(a.pid) AS blocking_pids FROM pg_stat_activity a JOIN pg_roles r ON r.rolname=a.usename WHERE a.datid=$1::oid AND starts_with(a.usename,'studio_telemetry_tx_') ORDER BY a.usename",[s.binding.database_oid])).rows}
async function writerChange(s,changes){
 const d=draft(s,s.currentPolicy.reader.login?'keep':'activate');for(const change of changes){if(!kinds.includes(change.kind)||![1,2].includes(change.slot_no)||!['activate','rotate','retire'].includes(change.action))fail('writer_fixed_change');d.kinds[kinds.indexOf(change.kind)]={kind:change.kind,instrumented:true,enabled:change.action!=='retire'};d.slots.find(v=>v.kind===change.kind&&v.slot_no===change.slot_no).action=change.action}
 const result=await apply(s,await prepare(s,d));return {result,batches:writerDeliveries(s)}
}
async function writerStop(s,c){if(!s.writerChildren.has(c))fail('writer_ci_owned_writer_stop');await stopProcess(s,c);if(c.mode==='entry'&&(c.exit?.code!==0||c.exit?.signal!==null))fail('writer_actual_entry_did_not_exit_gracefully');s.writerStoppedChildren.add(c);s.writerChildren.delete(c)}
async function writerNoIo(s){
 assert.equal(fs.existsSync('/run/agentstudio-telemetry-writers'),false);assert.equal(fs.existsSync(paths.store+'/worker-boots'),false)
 assert.equal(writerJournal(s).filter(v=>v.phase.startsWith('writer_')).length,0);assert.equal((await writerBackendRows(s)).length,0)
 return true
}
// TEST observations only. Original CI proof/container owns every client/file.
// These private handles never authorize a Controller/SQL/Worker operation.
const writerLockIdentitySQL="SELECT pg_backend_pid() AS pid,a.backend_start::text AS started,a.datid::integer AS database_oid,current_user::text AS actor,session_user::text AS login FROM pg_stat_activity a WHERE a.pid=pg_backend_pid()"
function writerObservationJournal(s){
 const text=read(paths.store+'/journal.jsonl').toString('utf8');if(!text.endsWith('\n'))fail('writer_ci_journal_incomplete')
 const records=text.slice(0,-1).split('\n').map(line=>s.contract.parseWorkerHeartbeatControlJson(Buffer.from(line),2097152));let previous='0'.repeat(64)
 for(let i=0;i<records.length;i++){
  const r=fields(records[i],['format','sequence','previous_sha256','instance_id','epoch','action_id','phase','data','record_sha256']),{record_sha256,...body}=r
  if(r.format!=='worker_heartbeat_control_journal_v1'||r.sequence!==i||r.previous_sha256!==previous||!uuid(r.instance_id)||!s.contract.controlEpoch(r.epoch)||r.action_id!==null&&!uuid(r.action_id)||!s.contract.controlJournalPhases.includes(r.phase)||!hex(record_sha256)||sha(JSON.stringify(body))!==record_sha256)fail('writer_ci_journal_chain')
  previous=record_sha256
 }
 return records
}
async function writerLockIdentity(s,db){
 const rows=(await db.query(writerLockIdentitySQL)).rows,r=rows[0]
 if(rows.length!==1||!Number.isInteger(r.pid)||r.pid<1||typeof r.started!=='string'||!r.started||r.started.length>100||r.database_oid!==s.binding.database_oid||r.actor!==s.binding.operator_login||r.login!==s.binding.operator_login)fail('writer_ci_owned_lock_identity')
 return {pid:r.pid,started:r.started}
}
async function writerRowLock(s,kind,slot_no=1){
 if(!kinds.includes(kind)||![1,2].includes(slot_no))fail('writer_lock_selection')
 const key=kind+':'+slot_no;if(s.writerRowLocks.has(key))fail('writer_ci_duplicate_owned_lock')
 const db=await s.telemetry.connect();let begun=false,released=false,releaseError,attempted=false,lease
 try{
  await db.query('BEGIN');begun=true;const backend=await writerLockIdentity(s,db)
  const rows=(await db.query('SELECT kind FROM studio_telemetry.slot_state WHERE kind=$1 AND slot_no=$2 FOR UPDATE',[kind,slot_no])).rows
  if(rows.length!==1||rows[0].kind!==kind)fail('writer_ci_owned_lock_row')
  const handle=Object.freeze({async release(){
   if(attempted){if(releaseError)throw releaseError;if(!released)fail('writer_ci_owned_lock_release_unknown');return}
   attempted=true
   try{const result=await db.query('ROLLBACK');if(result.command!=='ROLLBACK')fail('writer_ci_owned_lock_release_unknown');released=true;lease.released=true;s.writerRowLocks.delete(key)}
   catch(error){releaseError=error;throw error}finally{db.release()}
  }})
  lease={kind,slot_no,backend,db,handle,released:false};s.writerRowLocks.set(key,lease);return handle
 }catch(error){if(begun)try{await db.query('ROLLBACK')}finally{db.release()}else db.release();throw error}
}
function writerBoundObservation(s,kind,current,records,allowEnded=false){
 const role=s.binding.roles.find(r=>r.name==='studio_telemetry_tx_'+kind+'_1')
 if(!role||!current||current.enabled!==true||!uuid(current.generation))fail('writer_ci_current_generation')
 const bound=records.filter(r=>r.phase==='writer_backend_bound'&&r.instance_id===s.instance&&r.data.kind===kind&&r.data.slot_no===1&&r.data.generation===current.generation&&r.data.role_oid===role.oid&&r.data.database_oid===s.binding.database_oid)
 if(bound.length!==1)fail('writer_ci_current_bound_backend')
 const r=bound[0],d=fields(r.data,['backend_id','kind','slot_no','generation','role_oid','database_oid','backend']),b=fields(d.backend,['pid','started'])
 if(!uuid(d.backend_id)||!Number.isInteger(b.pid)||b.pid<1||typeof b.started!=='string'||!b.started)fail('writer_ci_bound_backend_identity')
 if(!allowEnded&&records.some(r=>r.phase==='writer_backend_ended'&&r.instance_id===s.instance&&r.data.backend_id===d.backend_id))fail('writer_ci_record_backend_already_ended')
 return {instance:s.instance,role_name:role.name,...d,backend:{pid:b.pid,started:b.started},bound_sequence:r.sequence}
}
function writerActiveRecordMatches(row,bound,lock){
 return row.pid===bound.backend.pid&&row.started===bound.backend.started&&row.role_oid===bound.role_oid&&row.database_oid===bound.database_oid&&row.usename===bound.role_name&&row.state==='active'&&row.query==='SELECT studio_telemetry.record($1::text,$2::text,$3::bigint,$4::text,$5::text) AS value'&&row.wait_event_type==='Lock'&&Array.isArray(row.blocking_pids)&&row.blocking_pids.every(pid=>Number.isInteger(pid)&&pid>0)&&row.blocking_pids.includes(lock.backend.pid)
}
async function writerWaitRecord(s,kind){
 if(!kinds.includes(kind))fail('writer_fixed_kind')
 const lock=s.writerRowLocks.get(kind+':1');if(!lock||lock.released)fail('writer_ci_record_owned_lock_required')
 const identity=await writerLockIdentity(s,lock.db);if(identity.pid!==lock.backend.pid||identity.started!==lock.backend.started)fail('writer_ci_owned_lock_replaced')
 const current=(await writerRows(s)).find(r=>r.kind===kind&&r.slot_no===1),initial=writerObservationJournal(s),bound=writerBoundObservation(s,kind,current,initial)
 let actual,observed
 await until(async()=>{
  if(lock.released)fail('writer_ci_record_owned_lock_released')
  const records=writerObservationJournal(s);if(records.some(r=>r.phase==='writer_backend_ended'&&r.instance_id===bound.instance&&r.data.backend_id===bound.backend_id))fail('writer_ci_record_ended_before_observation')
  actual=(await writerBackendRows(s)).find(row=>writerActiveRecordMatches(row,bound,lock));if(!actual)return false
  observed=records.at(-1).sequence;return true
 },'writer_real_minimal_role_record',10000)
 const handle=Object.freeze({pid:actual.pid,role_oid:actual.role_oid,login:actual.usename,record_called_as_su:false,observed_data_only:true,authority:false})
 s.writerRecordWitnesses.set(handle,{bound,lock,observed_head:observed});return handle
}
function writerCancellationWitness(s,handle,prepared){
 const witness=s.writerRecordWitnesses.get(handle),plan=s.plans.get(prepared)
 if(!witness||!plan||!plan.used||s.lastAction!==plan.summary.action_id||witness.bound.instance!==s.instance)fail('writer_ci_owned_cancellation_witness')
 return {witness,action:plan.summary.action_id}
}
function writerSameEnded(record,bound){
 if(record.phase!=='writer_backend_ended'||record.instance_id!==bound.instance||record.data.backend_id!==bound.backend_id)return false
 const d=fields(record.data,['backend_id','kind','slot_no','generation','role_oid','database_oid','backend']),b=fields(d.backend,['pid','started'])
 if(d.kind!==bound.kind||d.slot_no!==bound.slot_no||d.generation!==bound.generation||d.role_oid!==bound.role_oid||d.database_oid!==bound.database_oid||b.pid!==bound.backend.pid||b.started!==bound.backend.started)fail('writer_ci_ended_backend_mismatch')
 return true
}
async function writerBackendAbsent(s,b){
 const rows=(await s.telemetry.query("SELECT NOT EXISTS(SELECT 1 FROM pg_stat_activity WHERE pid=$1 AND backend_start=$2::timestamptz AND datid=$3::oid) AS exact_gone,NOT EXISTS(SELECT 1 FROM pg_stat_activity a JOIN pg_roles r ON r.rolname=a.usename WHERE a.datid=$3::oid AND r.oid=$4::oid) AS role_gone",[b.backend.pid,b.backend.started,b.database_oid,b.role_oid])).rows
 if(rows.length!==1||typeof rows[0].exact_gone!=='boolean'||typeof rows[0].role_gone!=='boolean')fail('writer_ci_backend_absence_shape')
 return rows[0].exact_gone&&rows[0].role_gone
}
async function writerWaitChildCleanup(s,c){
 if(!s.writerChildren.has(c)||c.mode!=='component'||c.kernelUidVerified!==true||c.selected.length!==1||!c.batch)fail('writer_ci_owned_cleanup_child')
 const kind=c.selected[0],item=c.batch.items.find(v=>v.kind===kind),records=writerObservationJournal(s),current=(await writerRows(s)).find(r=>r.kind===kind&&r.slot_no===1)
 if(!item||current?.generation!==item.generation)fail('writer_ci_owned_cleanup_generation')
 const bound=writerBoundObservation(s,kind,current,records,true),claimed=records.filter(r=>r.phase==='writer_boot_claimed'&&r.instance_id===bound.instance&&r.data.boot_id===c.batch.boot_id&&r.data.uid===c.uid&&r.data.kind===kind&&r.data.slot_no===1&&r.data.generation===bound.generation&&r.data.role_oid===bound.role_oid)
 if(claimed.length!==1)fail('writer_ci_owned_cleanup_claim')
 await until(async()=>{
  const fresh=writerObservationJournal(s),ended=fresh.filter(r=>writerSameEnded(r,bound))
  if(ended.length>1)fail('writer_ci_owned_cleanup_duplicate_end');if(!ended.length)return false
  if(ended[0].sequence<=bound.bound_sequence||!await writerBackendAbsent(s,bound))fail('writer_ci_backend_live_after_ended')
  return true
 },'writer_previous_owned_cleanup',5000)
 process.stdout.write(JSON.stringify({event:'genuine_writer_ci_previous_owned_cleanup',matching_bound_and_claimed_backend:true,matching_backend_ended_observed:true,actual_exact_backend_absent:true,actual_role_backend_absent:true,nonroot_uncertain_slot_untouched:true,observed_data_only:true})+'\n')
 return Object.freeze({observed_data_only:true,authority:false})
}
// Read-only observation after our actual child stop. OS/SQL backend absence
// alone can precede Root's final runtime checks and cleanup-counter release.
async function writerWaitStoppedCleanup(s,children){
 if(!Array.isArray(children)||children.length<1||children.length>16||new Set(children).size!==children.length)fail('writer_ci_stopped_children_selection')
 const initial=writerObservationJournal(s),expected=[]
 for(const c of children){
  if(!s.writerStoppedChildren.has(c)||c.exited!==true||c.kernelUidVerified!==true||!['component','entry'].includes(c.mode)||!Array.isArray(c.selected)||c.selected.length<1||c.selected.length>2)fail('writer_ci_owned_stopped_child')
  if(!c.batch){
   if(c.mode!=='entry'||initial.some(r=>r.phase==='writer_boot_claimed'&&r.data.uid===c.uid))fail('writer_ci_stopped_unissued_child')
   continue
  }
  const staged=initial.filter(r=>r.phase==='writer_boot_staged'&&r.data.boot_id===c.batch.boot_id&&r.data.uid===c.uid)
  if(staged.length!==1||!Array.isArray(staged[0].data.bindings))fail('writer_ci_stopped_staged_batch')
  for(const kind of c.selected){
   const item=c.batch.items.find(v=>v.kind===kind),role=s.binding.roles.find(r=>r.name==='studio_telemetry_tx_'+kind+'_1')
   if(!item||!role||!uuid(item.generation)||!staged[0].data.bindings.some(v=>v.kind===kind&&v.slot_no===1&&v.generation===item.generation&&v.role_oid===role.oid))fail('writer_ci_stopped_original_generation')
   const instance=staged[0].instance_id,claims=initial.filter(r=>r.phase==='writer_boot_claimed'&&r.instance_id===instance&&r.data.boot_id===c.batch.boot_id&&r.data.uid===c.uid&&r.data.kind===kind&&r.data.slot_no===1&&r.data.generation===item.generation&&r.data.role_oid===role.oid)
   if(claims.length>1)fail('writer_ci_stopped_duplicate_claim')
   const rows=initial.filter(r=>r.phase==='writer_backend_bound'&&r.instance_id===instance&&r.data.kind===kind&&r.data.slot_no===1&&r.data.generation===item.generation&&r.data.role_oid===role.oid&&r.data.database_oid===s.binding.database_oid)
   if(rows.length!==claims.length)fail('writer_ci_stopped_claim_bound_mismatch')
   if(!rows.length)continue
   const record=rows[0],d=fields(record.data,['backend_id','kind','slot_no','generation','role_oid','database_oid','backend']),backend=fields(d.backend,['pid','started'])
   if(!uuid(d.backend_id)||!Number.isInteger(backend.pid)||backend.pid<1||typeof backend.started!=='string'||!backend.started||record.sequence<=claims[0].sequence)fail('writer_ci_stopped_bound_identity')
   expected.push({instance,...d,backend:{pid:backend.pid,started:backend.started},bound_sequence:record.sequence})
  }
 }
 if(new Set(expected.map(v=>v.backend_id)).size!==expected.length)fail('writer_ci_stopped_duplicate_backend')
 await until(async()=>{
  const fresh=writerObservationJournal(s)
  for(const b of expected){const ended=fresh.filter(r=>writerSameEnded(r,b));if(ended.length>1)fail('writer_ci_stopped_duplicate_end');if(!ended.length)return false;if(ended[0].sequence<=b.bound_sequence||!await writerBackendAbsent(s,b))fail('writer_ci_stopped_backend_live_after_ended')}
  return true
 },'writer_stopped_owned_cleanup',5000)
 process.stdout.write(JSON.stringify({event:'genuine_writer_ci_stopped_owned_cleanup',stopped_children:children.length,matched_owned_backends:expected.length,matching_original_staged_claim_bound_and_ended:true,actual_exact_and_role_absence:true,current_generation_not_substituted:true,nonroot_uncertain_slots_untouched:true,observed_data_only:true})+'\n')
 return Object.freeze({observed_data_only:true,authority:false})
}

function writerCancellationProgress(records,witness,action){
 const {bound,lock}=witness;if(lock.released)fail('writer_ci_cancellation_lock_released')
 const closes=records.filter(r=>r.phase==='closing'&&r.instance_id===bound.instance&&r.action_id===action),ends=records.filter(r=>writerSameEnded(r,bound))
 if(closes.length>1||ends.length>1)fail('writer_ci_cancellation_duplicate_journal')
 if(records.some(r=>r.instance_id===bound.instance&&r.action_id===action&&['before_change','commit_pending','commit_acknowledged','publication_pending','published'].includes(r.phase)))fail('writer_ci_mutation_crossed_held_row_lock')
 if(ends.length&&(!closes.length||ends[0].sequence<=closes[0].sequence))fail('writer_ci_record_ended_before_closing')
 if(!closes.length||!ends.length)return null
 if(closes[0].sequence<=witness.observed_head||bound.bound_sequence>witness.observed_head)fail('writer_ci_cancellation_journal_order')
 return {closing_sequence:closes[0].sequence,ended_sequence:ends[0].sequence,observed_head:records.at(-1).sequence}
}
async function writerCancellationAbsent(s,handle,prepared){
 const {witness,action}=writerCancellationWitness(s,handle,prepared),records=writerObservationJournal(s),progress=writerCancellationProgress(records,witness,action)
 if(!progress)return false
 if(!await writerBackendAbsent(s,witness.bound))fail('writer_ci_backend_live_after_ended')
 if(witness.lock.released)fail('writer_ci_cancellation_lock_released')
 const fresh=writerObservationJournal(s),checked=writerCancellationProgress(fresh,witness,action)
 if(!checked||checked.closing_sequence!==progress.closing_sequence||checked.ended_sequence!==progress.ended_sequence)fail('writer_ci_cancellation_observation_changed')
 witness.absence={...checked,action}
 process.stdout.write(JSON.stringify({event:'genuine_writer_ci_cancellation_absence',active_owned_backend_observed:true,owned_lock_blocker_observed:true,closing_before_ended:true,actual_exact_backend_absent:true,actual_role_backend_absent:true,own_row_lock_held:true,published:false,observed_data_only:true})+'\n')
 return true
}
function writerAssertCancellationPublished(s,handle,prepared,result){
 const {witness,action}=writerCancellationWitness(s,handle,prepared),a=witness.absence
 if(!a||a.action!==action||!witness.lock.released||result.action_id!==action||result.publication_completed!==true)fail('writer_ci_cancellation_absence_required')
 const records=writerObservationJournal(s),phases=['closing','readers_clean','before_change','material_staged','commit_pending','commit_acknowledged','after_verified','old_connections_retired','publication_pending','published'],selected=Object.create(null)
 for(const phase of phases){const rows=records.filter(r=>r.instance_id===witness.bound.instance&&r.action_id===action&&r.phase===phase);if(rows.length!==1)fail('writer_ci_cancellation_publication_phase');selected[phase]=rows[0]}
 const ends=records.filter(r=>writerSameEnded(r,witness.bound));if(ends.length!==1||ends[0].sequence!==a.ended_sequence||selected.closing.sequence!==a.closing_sequence)fail('writer_ci_cancellation_publication_backend')
 if(!(witness.bound.bound_sequence<=witness.observed_head&&witness.observed_head<selected.closing.sequence&&selected.closing.sequence<ends[0].sequence&&ends[0].sequence<=a.observed_head&&a.observed_head<selected.before_change.sequence&&ends[0].sequence<selected.readers_clean.sequence&&selected.readers_clean.sequence<selected.before_change.sequence))fail('writer_ci_cancellation_publication_order')
 for(let i=2;i<phases.length-1;i++)if(selected[phases[i]].sequence>=selected[phases[i+1]].sequence)fail('writer_ci_cancellation_publication_order')
 if(selected.published.epoch!==result.epoch)fail('writer_ci_cancellation_publication_epoch')
 process.stdout.write(JSON.stringify({event:'genuine_writer_ci_cancellation_publication',closing_before_owned_backend_ended:true,actual_absence_before_write:true,actual_absence_before_publication:true,original_mutation_acknowledged:true,observed_data_only:true})+'\n')
 return Object.freeze({observed_data_only:true,authority:false})
}

function writerCiApi(s){return Object.freeze({
 kinds:Object.freeze([...kinds]),variant:s.writerVariant,
 change:changes=>writerChange(s,changes),deliveries:()=>writerDeliveries(s),rows:()=>writerRows(s),backends:()=>writerBackendRows(s),journal:()=>writerJournal(s).filter(r=>r.phase.startsWith('writer_')).map(r=>({phase:r.phase,instance_id:r.instance_id,data:r.data})),
 launch:options=>launchWriter(s,options),command:(c,command,ms)=>writerCommand(s,c,command,ms),stop:c=>writerStop(s,c),noIo:()=>writerNoIo(s),
 rowLock:(kind,slot_no=1)=>writerRowLock(s,kind,slot_no),
 async tableLock(){const db=await s.telemetry.connect();await db.query('BEGIN');await db.query('LOCK TABLE studio_telemetry.slot_state IN ACCESS EXCLUSIVE MODE');let done=false;return Object.freeze({async release(){if(done)return;done=true;try{await db.query('ROLLBACK')}finally{db.release()}}})},
 async waitBindBlocked(){await until(async()=>(await s.telemetry.query("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE pid=$1 AND wait_event_type='Lock' AND query LIKE 'SELECT k.instrumented,%') AS held",[s.controlBackend.pid])).rows[0].held,'writer_actual_bind_guard_blocked',10000);return true},
 async prepareRotate(kind){if(!kinds.includes(kind))fail('writer_fixed_kind');const d=draft(s);d.slots.find(v=>v.kind===kind&&v.slot_no===1).action='rotate';return prepare(s,d)},
 waitWriterRecord:kind=>writerWaitRecord(s,kind),
 waitChildCleanup:child=>writerWaitChildCleanup(s,child),
 waitStoppedCleanup:children=>writerWaitStoppedCleanup(s,children),
 cancellationAbsent:(witness,prepared)=>writerCancellationAbsent(s,witness,prepared),
 assertCancellationPublished:(witness,prepared,result)=>writerAssertCancellationPublished(s,witness,prepared,result),
 async waitReady(selected,ms=130000){await until(async()=>{const rows=await writerRows(s);return selected.every(kind=>{const row=rows.find(v=>v.kind===kind&&v.slot_no===1);return row?.state==='ready'&&Number(row.sequence)>=2})},'writer_actual_ready_rows',ms);return true},
 async kernelAccess({selected,batch,groups,native=false,extraBatches=[]}){const child=await launchWriter(s,{selected,mode:'access',batch,access:groups,native,extraBatches});await until(()=>child.messages.some(v=>v.event==='kernel_access'),'writer_real_access_result',10000);const result=child.messages.find(v=>v.event==='kernel_access');assert.equal(result.uid,child.uid);await writerStop(s,child);return result},
 async restartServing(){await stopProcess(s,s.control);await removeSockets(s);await writerRemoveSockets(s);await startController(s);const status=await rpc(s,{op:'inspect'});if(status.phase!=='closed')fail('writer_restart_closed');await apply(s,await prepare(s,draft(s,'keep')));return rpc(s,{op:'inspect'})},
 async businessSetup(){return writerBusinessSetup(s)},
 async replaceOldMountedCredential(c,kind,batch){
  if(!s.writerChildren.has(c)||c.exited||!c.selected.includes(kind)||batch.uid===c.uid||!writerDeliveries(s).some(v=>v.boot_id===batch.boot_id))fail('writer_owned_old_process_required')
  const item=batch.items.find(v=>v.kind===kind);if(!item)fail('writer_current_credential_required')
  const status=fs.readFileSync('/proc/'+c.actualPid+'/status','utf8');if(!new RegExp('^Uid:\\s+'+c.uid+'\\s+'+c.uid+'\\s+'+c.uid+'\\s+'+c.uid+'$','m').test(status))fail('writer_old_process_uid_changed')
  const run=args=>execFileSync('/usr/bin/nsenter',['--target',String(c.actualPid),'--mount','--','/usr/bin/mount',...args],{env:{PATH:'/usr/bin:/bin',LANG:'C.UTF-8'},timeout:10000,stdio:['ignore','pipe','pipe'],windowsHide:true})
  run(['--bind',item.source_file,item.mounted_file]);run(['-o','remount,bind,ro,nosuid,nodev,noexec',item.mounted_file]);return true
 },
 async businessCounts(){return (await s.nativeAdmin.query("SELECT (SELECT count(*)::integer FROM agentstudio.jobs) AS jobs,(SELECT count(*)::integer FROM agentstudio.runs) AS runs,(SELECT count(*)::integer FROM agentstudio.agent_review_requests) AS reviews,(SELECT count(*)::integer FROM agentstudio.knowledge_query_jobs) AS queries")).rows[0]},
 async entryReady(c){
  if(!s.writerChildren.has(c)||c.mode!=='entry')fail('writer_actual_entry_required')
  if(c.selected[0]==='knowledge_index'){
   await until(async()=>{if(c.exited)fail('writer_knowledge_entry_exited');const rows=(await s.nativeAdmin.query("SELECT funcname,calls::text FROM pg_stat_user_functions WHERE schemaname='agentstudio' AND funcname=ANY($1::text[])",[['knowledge_index_claim','knowledge_query_claim']])).rows;return rows.length===2&&rows.every(row=>BigInt(row.calls)>BigInt(c.claimBaseline.find(v=>v.funcname===row.funcname)?.calls??'0'))},'writer_actual_knowledge_both_claim_hooks',45000)
  }else await until(()=>{if(c.exited)fail('writer_actual_entry_exited');return c.messages.some(v=>v.event==='entry_metadata'&&v.ready===true)},'writer_actual_entry_ready',45000)
  return true
 },
 async timing(c){return {kind:c.kind,kernel_uid_verified:c.kernelUidVerified===true,elapsed_ms:Math.round(performance.now()-c.launchAt),exited:c.exited,component_only:c.mode!=='entry'}},
 async final(){assert.equal((await writerBackendRows(s)).length,0);assert.ok(writerJournal(s).filter(v=>v.phase==='writer_boot_issued').length<=128);return true},
 })}
async function writerBusinessSetup(s){
 if(s.writerBusiness)return true
 await s.nativeAdmin.query("ALTER SYSTEM SET track_functions='all'");await s.nativeAdmin.query('SELECT pg_reload_conf()')
 const extra=['051_agent_memory_derived','052_agent_memory_outcome','053_agent_memory_failure_source','054_agent_feedback','055_agent_optimization','056_agent_review_ledger','057_agent_assessment_execution','058_agent_opinion_read','059_agent_generated_acceptance','060_agent_descriptive_patch','061_company_overview']
 for(const name of extra){const file=root+'/db/postgres/migrations/pg_v9_'+name+'.sql',bytes=fs.readFileSync(file);await s.nativeAdmin.query(bytes.toString('utf8').split(/\r?\n/).filter(v=>!v.trim().startsWith('\\')).join('\n'))}
 s.writerBusinessPasswords=new Map();for(const [login,group]of [['agentstudio_stage_worker',null],['agentstudio_knowledge_index_worker_login','agentstudio_knowledge_index_worker'],['agentstudio_review_worker_login','agentstudio_review_worker']]){
  const password=randomBytes(40).toString('hex');s.writerBusinessPasswords.set(login,password)
  const role=(await s.nativeAdmin.query('SELECT oid::integer FROM pg_roles WHERE rolname=$1',[login])).rows
  if(group&&role.length)fail('writer_business_login_preexists')
  await s.nativeAdmin.query((group?'CREATE':'ALTER')+' ROLE '+login+" LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD '"+s.activation.makeNativeScramVerifier(password)+"'")
  if(group)await s.nativeAdmin.query('GRANT '+group+' TO '+login+' WITH ADMIN FALSE, INHERIT FALSE, SET TRUE')
 }
 // The fresh050 baseline intentionally keeps the old stage LOGIN dormant with
 // both parent memberships. This disposable entry fixture narrows it before
 // explicit activation; it does not edit that original installer or receipt.
 await s.nativeAdmin.query('REVOKE agentstudio_api FROM agentstudio_stage_worker')
 assert.equal((await s.nativeAdmin.query("SELECT pg_has_role('agentstudio_stage_worker','agentstudio_api','MEMBER') AS bad")).rows[0].bad,false)
 const tls=s.writerWork+'/tls';writerPrivateDirectory(s,tls);const run=args=>execFileSync('/usr/bin/openssl',args,{env:{PATH:'/usr/bin:/bin',LANG:'C.UTF-8'},timeout:10000,maxBuffer:16384,stdio:['ignore','pipe','pipe'],windowsHide:true})
 run(['req','-x509','-newkey','rsa:2048','-nodes','-keyout',tls+'/ca.key','-out',tls+'/ca.pem','-subj','/CN=writer-ci-ca','-days','1','-addext','basicConstraints=critical,CA:TRUE'])
 for(const name of ['worker','server']){const ext=tls+'/'+name+'.cnf';fs.writeFileSync(ext,'basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage='+('worker'===name?'clientAuth':'serverAuth')+'\nsubjectAltName=IP:127.0.0.1\n',{mode:0o600});run(['req','-new','-newkey','rsa:2048','-nodes','-keyout',tls+'/'+name+'.key','-out',tls+'/'+name+'.csr','-subj','/CN=writer-ci-'+name]);run(['x509','-req','-in',tls+'/'+name+'.csr','-CA',tls+'/ca.pem','-CAkey',tls+'/ca.key','-CAcreateserial','-out',tls+'/'+name+'.pem','-days','1','-extfile',ext])}
 // Capture only our generated files, never unknown contents, for later cleanup.
 for(const name of fs.readdirSync(tls)){const file=tls+'/'+name;fs.chmodSync(file,0o600);s.writerFiles.set(file,{...stamp(fs.lstatSync(file)),sha256:sha(fs.readFileSync(file))})}
 const {X509Certificate}=await import('node:crypto');s.writerTls={ca:fs.readFileSync(tls+'/ca.pem'),cert:fs.readFileSync(tls+'/worker.pem'),key:fs.readFileSync(tls+'/worker.key'),serverPin:new X509Certificate(fs.readFileSync(tls+'/server.pem')).fingerprint256.replaceAll(':','').toLowerCase(),clientPin:new X509Certificate(fs.readFileSync(tls+'/worker.pem')).fingerprint256.replaceAll(':','').toLowerCase()}
 await verifyWriterBusiness(s);s.writerBusiness=true;s.nativeSchema=await nativeSchema(s);s.nativeDataSha=await nativeHttpData(s);return true
}
async function verifyWriterBusiness(s){
 const {verifyCompanyOverviewSchema}=await import('../../src/company-overview-audit.ts'),db=await s.nativeAdmin.connect()
 try{await db.query('BEGIN READ ONLY');await db.query('SET LOCAL ROLE agentstudio_api');await verifyCompanyOverviewSchema(db)}finally{try{await db.query('ROLLBACK')}finally{db.release()}}
 return true
}
async function writerBusinessEnvironment(s,selected,uid,mounts){
 if(!s.writerBusiness)fail('writer_business_setup_required');const kind=selected[0],unit=writerUnits[kind],directory='/run/credentials/agentstudio-pg18-'+unit+'.service',base=s.writerWork+'/business/'+uid
 writerPrivateDirectory(s,base)
 const add=(name,bytes)=>{const file=writerFile(s,base+'/'+name,bytes,uid,0o400);mounts.push({...file,target:directory+'/'+name})}
 const login=kind==='knowledge_index'?'agentstudio_knowledge_index_worker_login':kind==='assessment'?'agentstudio_review_worker_login':'agentstudio_stage_worker';add('worker.secret',s.writerBusinessPasswords.get(login))
 const env={AGENT_STUDIO_PG_PILOT_ENABLED:'true',AGENT_STUDIO_PG_BAOTA18_ENABLED:'true',AGENT_STUDIO_PG_BAOTA18_TARGET_CONFIRMED:'true',AGENT_STUDIO_PG_BAOTA18_WORKER_TRIAL_ALLOWED:'true',AGENT_STUDIO_PG18_WORKER_TRIAL_OPERATOR_APPROVED:'APPROVE_ISOLATED_PG18_WORKER_TRIAL_ONLY',AGENT_STUDIO_PG_HOST:'127.0.0.1',AGENT_STUDIO_PG_PORT:'5333',AGENT_STUDIO_PG_DATABASE:'agent_studio',...(['knowledge_index','assessment'].includes(kind)?{AGENT_STUDIO_PG_USER:'agentstudio_stage_login'}:{AGENT_STUDIO_PG_WORKER_USER:'agentstudio_stage_worker',AGENT_STUDIO_PG_WORKER_PASSWORD_FILE:directory+'/worker.secret'})}
 const tls=()=>{add('dispatch-ca.pem',s.writerTls.ca);add('dispatch-worker.pem',s.writerTls.cert);add('dispatch-worker.key',s.writerTls.key)}
 if(kind==='prepare')env.AGENT_STUDIO_PG_PREPARE_WORKER_ENABLED='true'
 if(kind==='model'){env.AGENT_STUDIO_PG_MODEL_WORKER_ENABLED='true';env.AGENT_STUDIO_MODEL_ID='ci-empty-queue';env.AGENT_STUDIO_MODEL_API_KEY_FILE=directory+'/provider.secret';add('provider.secret','synthetic-unused-provider-'+randomBytes(24).toString('hex'))}
 if(kind==='workflow_safe')Object.assign(env,{AGENT_STUDIO_PG_WORKFLOW_WORKER_ENABLED:'true',AGENT_STUDIO_PG_WORKFLOW_WORKER_APPROVED:'APPROVE_ISOLATED_PG_WORKFLOW_START_END_ONLY'})
 if(kind==='workflow_v2')Object.assign(env,{AGENT_STUDIO_PG_WORKFLOW_V2_WORKER_ENABLED:'true',AGENT_STUDIO_PG_WORKFLOW_V2_WORKER_APPROVED:'APPROVE_ISOLATED_PG_WORKFLOW_V2_RUNTIME_ONLY'})
 if(kind==='agent_autonomous'){
  Object.assign(env,{AGENT_STUDIO_PG_AUTONOMOUS_AGENT_ENABLED:'true',AGENT_STUDIO_PG_AUTONOMOUS_AGENT_APPROVED:'APPROVE_DISPOSABLE_PG18_AUTONOMOUS_AGENT_ONLY',AGENT_STUDIO_PG_WORKFLOW_V2_MODEL_ENABLED:'true',AGENT_STUDIO_PG_WORKFLOW_V2_MODEL_APPROVED:'APPROVE_DISPOSABLE_PG18_WORKFLOW_V2_MODEL_ONLY',AGENT_STUDIO_PG_WORKFLOW_V2_TOOLS_ENABLED:'true',AGENT_STUDIO_PG_WORKFLOW_V2_TOOLS_APPROVED:'APPROVE_DISPOSABLE_PG18_WORKFLOW_V2_TOOLS_ONLY',AGENT_STUDIO_PG_BOUND_DISPATCH_SERVER_FINGERPRINT:s.writerTls.serverPin})
  add('dispatch-ca.pem',s.writerTls.ca);add('dispatch-agent.pem',s.writerTls.cert);add('dispatch-agent.key',s.writerTls.key)
 }
 if(kind==='knowledge_index'){
  tls();Object.assign(env,{AGENT_STUDIO_PG_KNOWLEDGE_INDEX_REVIEWED:'true',AGENT_STUDIO_PG_KNOWLEDGE_INDEX_SERVER_FINGERPRINT:s.writerTls.serverPin,AGENT_STUDIO_PG18_KNOWLEDGE_INDEX_UAT_ENABLED:'true',AGENT_STUDIO_PG18_KNOWLEDGE_INDEX_UAT_APPROVED:'APPROVE_DISPOSABLE_PG18_OWNER_EMBEDDING_INDEX_UAT',AGENT_STUDIO_PG18_KNOWLEDGE_QUERY_UAT_ENABLED:'true',AGENT_STUDIO_PG18_KNOWLEDGE_QUERY_UAT_APPROVED:'APPROVE_DISPOSABLE_PG18_READER_EMBEDDING_QUERY_UAT',AGENT_STUDIO_PG18_KNOWLEDGE_SHARING_UAT_ENABLED:'true',AGENT_STUDIO_PG18_KNOWLEDGE_SHARING_UAT_APPROVED:'APPROVE_DISPOSABLE_PG18_KNOWLEDGE_SHARING_ONLY'})
 }
 if(kind==='assessment'){
  add('review-ca.pem',s.writerTls.ca);add('review-worker.pem',s.writerTls.cert);add('review-worker.key',s.writerTls.key)
  Object.assign(env,{AGENT_STUDIO_PG18_REVIEW_EXECUTION_ENABLED:'true',AGENT_STUDIO_PG18_REVIEW_EXECUTION_APPROVED:'APPROVE_DISPOSABLE_PG18_PAID_REVIEW_EXECUTION_ONLY',AGENT_STUDIO_PG_REVIEW_SERVICE_REVIEWED:'true',AGENT_STUDIO_PG_REVIEW_ORIGIN:'https://127.0.0.1:7459',AGENT_STUDIO_PG_REVIEW_SERVER_FINGERPRINT:s.writerTls.serverPin,AGENT_STUDIO_PG_REVIEW_CLIENT_FINGERPRINT:s.writerTls.clientPin})
 }
 return env
}
async function writerRemoveSockets(s){
 const base='/run/agentstudio-telemetry-writers';if(!fs.existsSync(base))return
 const parent=fs.lstatSync(base);if(!parent.isDirectory()||parent.isSymbolicLink()||parent.uid!==0||parent.gid!==0||(parent.mode&0o7777)!==0o711)fail('writer_cleanup_socket_root')
 for(const {kind,gid}of s.writerSettings.groups){const directory=base+'/'+kind;if(!fs.existsSync(directory))continue;const st=fs.lstatSync(directory);if(!st.isDirectory()||st.isSymbolicLink()||st.uid!==0||st.gid!==gid||(st.mode&0o7777)!==0o710)fail('writer_cleanup_kind');for(const name of fs.readdirSync(directory)){if(name!=='report.sock')fail('writer_cleanup_unknown_socket');const file=directory+'/'+name,meta=fs.lstatSync(file);if(!meta.isSocket()||meta.isSymbolicLink()||meta.uid!==0||meta.gid!==gid||(meta.mode&0o7777)!==0o660)fail('writer_cleanup_socket');fs.unlinkSync(file)}fs.rmdirSync(directory)}
 if(fs.readdirSync(base).length)fail('writer_cleanup_unknown_kind');fs.rmdirSync(base)
}
async function writerArtifactsCleanup(s){
 if(!s.writerSettings)return
 await writerRemoveSockets(s)
 const store=paths.store+'/worker-boots'
 if(fs.existsSync(store)){
  const st=fs.lstatSync(store);if(!st.isDirectory()||st.isSymbolicLink()||st.uid!==0||st.gid!==0||(st.mode&0o7777)!==0o700)fail('writer_cleanup_store')
  const issued=new Map(writerJournal(s).filter(v=>v.phase==='writer_boot_issued').map(v=>[v.data.boot_id,v.data]))
  for(const name of fs.readdirSync(store)){
   const match=/^([a-f0-9-]{36})\.(?:(prepare|model|workflow_safe|workflow_v2|agent_autonomous|knowledge_index|knowledge_query|assessment)\.(boot|delivery)|batch\.delivery)\.json$/.exec(name),file=store+'/'+name,meta=fs.lstatSync(file),boot=match&&issued.get(match[1])
   if(!boot||!meta.isFile()||meta.isSymbolicLink()||meta.nlink!==1||meta.gid!==0||meta.uid!==(match[3]==='boot'?boot.uid:0)||(meta.mode&0o7777)!==(match[3]==='boot'?0o400:0o600)||match[2]&&!boot.bindings.some(v=>v.kind===match[2]))fail('writer_cleanup_unknown_credential')
   fs.unlinkSync(file)
  }
  fs.rmdirSync(store)
 }
 for(const [file,expected]of [...s.writerFiles].sort((a,b)=>b[0].length-a[0].length)){
  const current=fs.lstatSync(file);if(!sameStamp(current,expected)||!current.isFile()||current.isSymbolicLink()||sha(fs.readFileSync(file))!==expected.sha256)fail('writer_cleanup_owned_file_changed');fs.unlinkSync(file)
 }
 for(const [directory,expected]of [...s.writerDirectories].sort((a,b)=>b[0].length-a[0].length)){
  const current=fs.lstatSync(directory);if(!sameStamp(current,expected)||!current.isDirectory()||current.isSymbolicLink()||fs.readdirSync(directory).length)fail('writer_cleanup_owned_directory_changed');fs.rmdirSync(directory)
 }
}
