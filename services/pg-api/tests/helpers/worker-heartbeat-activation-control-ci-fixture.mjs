// AUTHORING ONLY until run by the distinct hosted control CI. Import-safe.
// No original heartbeat/060 workflow permit, fake DB access, target or PID input.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import net from 'node:net'
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

export async function createWorkerHeartbeatActivationControlCiFixture(proof,privateStage){
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
 const s={proof,ci,stage,pg,containers,client,contract,workspace,snapshot,installer,activation,sourceBytes,runtimeBytes,pools:new Set(),reads:new Set(),writers:new Set(),children:new Set(),ackRules:new Set(),ownedDirectories:new Map(),ownedSockets:new Map(),plans:new WeakMap(),lastAction:null,currentPolicy:null,closed:false,container:null,control:null,native:null,phase:'create_owned_container'}
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
  await installer.verifyRuntimeSchemaReceipt(s.nativeAdmin,snapshot,true);s.nativeSchema=await nativeSchema(s)
  s.phase='new_telemetry_database_original001';await containers.createTelemetryControlCiDatabase(s.container);s.telemetryOptions=containers.telemetryControlCiContainerTelemetryOptions(s.container);s.telemetry=pool(s.telemetryOptions)
  const telemetrySql=fs.readFileSync(path.join(root,'db/postgres/telemetry/001_worker_heartbeats.sql'));if(sha(telemetrySql)!==sqlPin)fail('telemetry_sql_pin');await s.telemetry.query(telemetrySql.toString('utf8'))
  s.phase='private_root_configuration';await configure(s)
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
 signed(s,paths.config+'/profile.json',profile)
 const genesis={format:'worker_heartbeat_control_journal_v1',sequence:0,previous_sha256:'0'.repeat(64),instance_id:randomUUID(),epoch:'0',action_id:null,phase:'boot',data:{protocol:'worker_heartbeat_control_enrollment_v1',binding_sha256:sha(JSON.stringify(s.binding)),source_sha256:s.stage.sourceSha,initial_policy_json_sha256:sha(JSON.stringify(s.currentPolicy))}}
 write(paths.store+'/journal.jsonl',JSON.stringify({...genesis,record_sha256:sha(JSON.stringify(genesis))})+'\n')
}
function signed(s,file,payload){write(file,JSON.stringify({payload,signature:sign(null,Buffer.from(JSON.stringify(payload)),s.signingKey).toString('base64')})+'\n')}
async function rpc(s,command){return s.client.sendWorkerHeartbeatOperatorCommand(command)}
function closedControllerOutput(s,c,chunk,stream){
 c[stream+'Bytes']+=chunk.length;if(c[stream+'Bytes']>32768){c.p.kill('SIGTERM');return}
 let text=(c[stream+'Partial']??'')+chunk.toString('utf8');if(Buffer.byteLength(text)>4096)text=text.slice(-4096)
 const lines=text.split('\n');c[stream+'Partial']=lines.pop()
 for(const line of lines){try{const x=fields(s.contract.parseWorkerHeartbeatControlJson(Buffer.from(line),4096),['error','automatic_retry_authorized']);if(x.automatic_retry_authorized===false&&s.contract.controlErrorCodes.includes(x.error))c.closedCodes.add(x.error)}catch{ /* Discard all arbitrary warnings/stack/diagnostic text. */ }}
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
  async verify(){stageBinding(s.stage,s.ci);if(await s.containers.verifyTelemetryControlCiContainer(s.container)!==true)fail('owned_container_binding');if(await nativeSchema(s)!==s.nativeSchema)fail('native_schema_changed');await s.installer.verifyRuntimeSchemaReceipt(s.nativeAdmin,s.snapshot,true);if(s.closed)fail('fixture_closed');const status=await rpc(s,{op:'inspect'});if(status.instance_id!==s.instance||status.in_flight_reads>2)fail('actual_controller_status');return true},
  async final(){await waitReaders(s);await this.verify();const rows=(await s.nativeAdmin.query('SELECT (SELECT count(*)::integer FROM agentstudio_auth.accounts) AS accounts,(SELECT count(*)::integer FROM agentstudio.jobs) AS jobs,(SELECT count(*)::integer FROM agentstudio.runs) AS runs')).rows[0];if(rows.accounts!==2||rows.jobs!==0||rows.runs!==0||await s.repo.inspectEmployeeGovernance()!==true)fail('synthetic_native_data_invariants');return true},
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
  for(const r of [...s.reads])try{await r.close()}catch(error){errors.push(safe('own_read_close',error))}
  for(const c of [...s.children])try{await stopProcess(s,c)}catch(error){errors.push(safe('own_child_stop',error))}
  for(const c of [...s.writers])try{await c.end();s.writers.delete(c)}catch(error){errors.push(safe('own_writer_close',error))}
  // Actual SQL backend absence is queried after process exit, never inferred
  // from kill/destroy. Pool idle readers are gone after own controller exits.
  if(s.telemetry)try{await until(async()=>(await s.telemetry.query("SELECT NOT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datid=$1::oid AND usename='studio_telemetry_reader') AS gone",[s.binding?.database_oid??0])).rows[0]?.gone===true,'reader_backend_absence_timeout',10000)}catch(error){errors.push(safe('actual_reader_absence',error))}
  for(const p of [...s.pools])try{await p.end();s.pools.delete(p)}catch(error){errors.push(safe('own_pool_close',error))}
  let containerGone=false
  if(s.container)try{await s.containers.closeTelemetryControlCiContainer(s.container);containerGone=true;s.container=null}catch(error){errors.push(safe('own_container_close',error))}
  if(!s.children.size&&containerGone){
   try{await removeSockets(s);for(const dir of [...s.ownedDirectories.keys()].sort((a,b)=>b.length-a.length))if(s.ownedDirectories.has(dir))removeOwnDirectory(s,dir)}catch(error){errors.push(safe('own_root_cleanup',error))}
   // Parent owns both immutable code stages. Leave its nonce marker alongside
   // them for parent stage disposal; never recursively remove a stage here.
  }
  if(errors.length)throw new AggregateError(errors,'telemetry_control_ci_fixture_owned_cleanup_failed')
 })();return s.closing
}
