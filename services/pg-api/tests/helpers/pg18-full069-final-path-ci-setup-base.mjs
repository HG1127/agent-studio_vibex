// Borrowed original controlled fixture mechanics, not another cluster factory.
import fs from 'node:fs'
import path from 'node:path'
import {pathToFileURL} from 'node:url'
import {spawn,execFileSync} from 'node:child_process'
import {createHash,randomBytes,randomUUID,sign,X509Certificate} from 'node:crypto'
import {performance} from 'node:perf_hooks'
import {setTimeout as delay} from 'node:timers/promises'
import {assertVerifiedCompleteProfileStage} from './pg18-complete-install-ci-stage.mjs'
import {ownedCompleteProfilePool} from './pg18-complete-install-ci-containers.mjs'
import {finalPathCiFail as fail} from './pg18-full069-final-path-ci-contract.mjs'
import {full069NetworkPolicyDigest} from '../../src/pg18-full069-network-policy.mjs'
const sha=b=>createHash('sha256').update(b).digest('hex'),hex=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v),cleanEnv=()=>({PATH:'/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',HOME:'/root',LANG:'C.UTF-8'})
const kinds=['prepare','model','workflow_safe','workflow_v2','agent_autonomous','knowledge_index','knowledge_query','assessment'],names=['studio_telemetry_owner','studio_telemetry_reader',...kinds.flatMap(k=>[1,2].map(n=>'studio_telemetry_tx_'+k+'_'+n))]
const fixed={config:'/etc/agentstudio/telemetry-control',store:'/var/lib/agentstudio-telemetry-control',credentials:'/run/credentials/agentstudio-telemetry-control.service',sockets:'/run/agentstudio-telemetry-control',writerSockets:'/run/agentstudio-telemetry-writers',liveConfig:'/etc/agentstudio/full069-worker-live',liveStore:'/var/lib/agentstudio-full069-worker-live'}
const pins={sql:'5ed1080d9f7b651ea2ae7fceca09db7f61c679f107e196df13ae201a8f99505f',record:'4e1fd93b6217d5cf414189f568d395f48a3e3e54e1ee455e65d28d4717e15143',snapshot:'17215237dbc5f81ba8fbbb2fd8eae2a9da7e0e0cfa859124ab50f3ccd60671ec',lock:'eb56da11d2713724419f938ef874991fd50fc082dda09837b779ee5841a21c6a'}
function ancestors(dir){let current='/';for(const part of dir.split('/').filter(Boolean)){current=path.join(current,part);if(!fs.existsSync(current))fs.mkdirSync(current,{mode:0o755});const st=fs.lstatSync(current);if(!st.isDirectory()||st.isSymbolicLink()||st.uid!==0||st.gid!==0||(st.mode&0o7022)!==0||fs.realpathSync(current)!==current)fail('root_ancestor')}}

function directory(s,dir,mode=0o700,gid=0){ancestors(path.dirname(dir));if(fs.existsSync(dir))fail('existing_owned_path');fs.mkdirSync(dir,{mode});fs.chownSync(dir,0,gid);fs.chmodSync(dir,mode);const st=fs.lstatSync(dir);s.directories.set(dir,{dev:st.dev,ino:st.ino});return dir}

function file(name,bytes,uid=0,mode=0o600){const fd=fs.openSync(name,fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_NOFOLLOW|fs.constants.O_WRONLY,mode);try{fs.writeFileSync(fd,bytes);fs.fchownSync(fd,uid,0);fs.fchmodSync(fd,mode);fs.fsyncSync(fd)}finally{fs.closeSync(fd)}const st=fs.lstatSync(name);if(!st.isFile()||st.isSymbolicLink()||st.nlink!==1||st.uid!==uid||st.gid!==0||(st.mode&0o7777)!==mode||sha(fs.readFileSync(name))!==sha(bytes))fail('private_write');return name}

function privateRead(name,max=2097152){const st=fs.lstatSync(name);if(!st.isFile()||st.isSymbolicLink()||st.nlink!==1||st.uid!==0||st.gid!==0||![0o400,0o600].includes(st.mode&0o7777)||st.size<1||st.size>max)fail('private_read');return fs.readFileSync(name)}

function json(bytes){return JSON.parse(bytes.toString('utf8'))}

function signed(s,name,payload){const bytes=Buffer.from(JSON.stringify({payload,signature:sign(null,Buffer.from(JSON.stringify(payload)),s.signer.privateKey).toString('base64')})+'\n');file(name,bytes);return sha(bytes)}

async function until(check,label,ms){const end=performance.now()+ms;do{if(await check())return;await delay(50)}while(performance.now()<end);fail(label)}

async function command(s,filename,args,environment,options={}){
 const {uid,gid,timeout=180000}=options
 return new Promise((resolve,reject)=>{
  const child=spawn(s.nodePath??process.execPath,['--experimental-strip-types',filename,...args],{cwd:s.deployment??s.loaded.tree,env:environment,stdio:['ignore','pipe','pipe'],windowsHide:true,...(uid?{uid,gid}:{} )})
  let out='',err='',bytes=0,stopping=false,killer
  const stop=()=>{if(stopping)return;stopping=true;child.kill('SIGTERM');killer=setTimeout(()=>child.kill('SIGKILL'),5000)},timer=setTimeout(stop,timeout)
  child.stdout.on('data',b=>{bytes+=b.length;if(bytes>262144){stop();return}out+=b});child.stderr.on('data',b=>{bytes+=b.length;if(bytes>262144){stop();return}err+=b})
  child.once('error',()=>{clearTimeout(timer);if(killer)clearTimeout(killer);reject(Error('full069_path_ci_refused:child_start'))});child.once('close',(code,signal)=>{clearTimeout(timer);if(killer)clearTimeout(killer);if(stopping||signal!==null||bytes>262144)return reject(Error('full069_path_ci_refused:child_bound'));let value;try{value=out.trim()?JSON.parse(out):null}catch{return reject(Error('full069_path_ci_refused:child_json'))}const refusal=/\b(?:complete069_review_worker|complete_service)_[a-z_]+\b/.exec(err)?.[0]??null;let earlyReason=null;for(const line of err.split(/\r?\n/)){try{const v=JSON.parse(line);if(Object.keys(v).sort().join(',')==='error,production_cutover_allowed,qualifies_run'&&v.qualifies_run===false&&v.production_cutover_allowed===false&&typeof v.error==='string'&&/^full069_worker_live_[a-z_]{1,80}$/.test(v.error))earlyReason=v.error}catch{}}console.log(JSON.stringify({event:'full069_worker_path_ci_actual_cli',entry:path.basename(filename),mode:args[0],exit:code,refusal,short_reason:typeof value?.reason==='string'&&/^full069_worker_live_[a-z_]{1,80}$/.test(value.reason)?value.reason:earlyReason,qualifies_run:false}));resolve({code,value,stdout:out})})
 })
}

function start(s,filename,args,environment){const p=spawn(s.nodePath??process.execPath,['--experimental-strip-types',filename,...args],{cwd:s.deployment,env:environment,stdio:['ignore','pipe','pipe'],windowsHide:true}),c={p,closed:false,exit:null,bytes:0,output:[]};for(const stream of[p.stdout,p.stderr])stream.on('data',b=>{c.bytes+=b.length;if(c.bytes>262144)p.kill('SIGTERM');else c.output.push(b)});p.once('error',()=>{c.failed=true});p.once('close',(code,signal)=>{c.closed=true;c.exit={code,signal}});return c}

async function stop(c){if(!c||c.closed)return {graceful:!!c&&c.exit?.code===0&&c.exit?.signal===null};c.p.kill('SIGTERM');let forced=false;try{await until(()=>c.closed,'owned_process_stop',12000)}catch{forced=true;c.p.kill('SIGKILL');await until(()=>c.closed,'owned_process_kill',5000)}return {graceful:!forced&&c.exit?.code===0&&c.exit?.signal===null,forced}}

function tls(s){
 const dir=directory(s,s.work+'/tls'),run=args=>execFileSync('/usr/bin/openssl',args,{cwd:dir,env:cleanEnv(),stdio:'ignore',timeout:20000,windowsHide:true})
 run(['req','-x509','-newkey','rsa:2048','-nodes','-sha256','-keyout','ca.key','-out','ca.pem','-days','3','-subj','/CN=Owned full069 path CA','-addext','basicConstraints=critical,CA:TRUE','-addext','keyUsage=critical,keyCertSign,cRLSign'])
 for(const name of['server','worker']){run(['req','-new','-newkey','rsa:2048','-nodes','-keyout',name+'.key','-out',name+'.csr','-subj','/CN=Owned full069 path '+name]);file(dir+'/'+name+'.ext',Buffer.from('basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage='+(name==='server'?'serverAuth':'clientAuth')+'\nsubjectAltName=DNS:localhost,IP:127.0.0.1\n'));run(['x509','-req','-in',name+'.csr','-CA','ca.pem','-CAkey','ca.key','-CAcreateserial','-out',name+'.pem','-days','3','-sha256','-extfile',name+'.ext'])}
 for(const name of fs.readdirSync(dir))fs.chmodSync(dir+'/'+name,0o600)
 const read=name=>privateRead(dir+'/'+name),server=new X509Certificate(read('server.pem')),client=new X509Certificate(read('worker.pem'))
 s.tls={ca:read('ca.pem'),certificate:read('server.pem'),key:read('server.key'),client:read('worker.pem'),clientKey:read('worker.key'),serverPin:server.fingerprint256.replaceAll(':','').toLowerCase(),clientPin:client.fingerprint256.replaceAll(':','').toLowerCase(),validFrom:Date.parse(server.validFrom)}
}

async function publishControlRuntime(s){
 assertVerifiedCompleteProfileStage(s.loaded)
 const runtime=await import(pathToFileURL(s.deployment+'/services/pg-api/src/worker-heartbeat-activation-control-runtime.mjs').href),source=await import(pathToFileURL(s.deployment+'/services/pg-api/src/worker-heartbeat-activation-control-source.mjs').href),policy=runtime.workerHeartbeatActivationControlRuntimePolicy
 if(policy.format!=='worker_heartbeat_activation_control_runtime_v1'||policy.lock_sha256!==pins.lock||policy.pg_version!=='8.23.1'||Object.keys(policy.packages).length!==14)fail('control_runtime_policy')
 const read=name=>{const st=fs.lstatSync(name);if(!st.isFile()||st.isSymbolicLink()||st.uid!==0||st.gid!==0||st.nlink!==1||(st.mode&0o7777)!==0o444||st.size<1||st.size>16777216)fail('control_runtime_file');const bytes=fs.readFileSync(name),last=fs.lstatSync(name);if(['dev','ino','size','mtimeMs','ctimeMs'].some(k=>st[k]!==last[k]))fail('control_runtime_changed');return bytes},api=s.deployment+'/services/pg-api',modules=api+'/node_modules',found=new Map(),pending=['pg']
 if(sha(read(api+'/package.json'))!=='90488a84c79a53a83efea6440062941f08668765f76b7effd97bf6a33e4b9d58'||sha(read(api+'/pnpm-lock.yaml'))!==pins.lock)fail('control_runtime_package_lock')
 while(pending.length){
  const name=pending.pop(),expected=policy.packages[name];if(!expected)fail('control_runtime_dependency')
  // Walk the original fixed flat deployment, without requesting a second pg
  // resolution through the already locked operator loader in this process.
  const dir=modules+'/'+name,st=fs.lstatSync(dir);if(!st.isDirectory()||st.isSymbolicLink()||st.uid!==0||st.gid!==0||(st.mode&0o7777)!==0o555||fs.realpathSync(dir)!==dir)fail('control_runtime_scope');if(found.has(name))continue
  const pkg=JSON.parse(read(dir+'/package.json')),deps={...pkg.dependencies,...pkg.optionalDependencies,...pkg.peerDependencies};if(name==='pg')delete deps['pg-native']
  if(pkg.name!==name||pkg.version!==expected.version||Object.keys(deps).sort().join('\0')!==[...expected.dependencies].sort().join('\0'))fail('control_runtime_graph')
  found.set(name,dir);for(const dependency of expected.dependencies)pending.push(dependency)
 }
 if(found.size!==14)fail('control_runtime_dependency_count')
 const files=[];for(const[name,dir]of [...found].sort(([a],[b])=>a<b?-1:a>b?1:0)){
  const walk=relative=>{for(const leaf of fs.readdirSync(path.join(dir,relative)).sort()){const next=relative?relative+'/'+leaf:leaf,fileName=path.join(dir,next),st=fs.lstatSync(fileName);if(st.isSymbolicLink()||st.uid!==0||st.gid!==0)fail('control_runtime_file');if(st.isDirectory()){if((st.mode&0o7777)!==0o555)fail('control_runtime_directory');walk(next);continue}if(!/^[A-Za-z0-9_./-]+$/.test(next)||next.split('/').some(p=>!p||p==='.'||p==='..'||p==='node_modules')||/\.(?:node|wasm|dll|exe|so|dylib|pem|key)$/i.test(next)||fs.realpathSync(fileName)!==fileName)fail('control_runtime_file');const bytes=read(fileName);files.push({path:'services/pg-api/node_modules/'+name+'/'+next,sha256:sha(bytes),bytes:bytes.length})}};walk('')
 }
 if(files.length!==138)fail('control_runtime_inventory');files.sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0)
 // A fresh manifest comes from the genuine Control policy and actual protected
 // package bytes. The original operator manifest is never parsed or retagged.
 const manifest={format:policy.format,lock_sha256:pins.lock,pg_version:policy.pg_version,packages:Object.keys(policy.packages).sort().map(name=>({name,version:policy.packages[name].version})),files},bytes=Buffer.from(JSON.stringify(manifest)),manifestFile=fixed.config+'/runtime-manifest.json'
 file(manifestFile,bytes);s.controlRuntimeSha=sha(bytes)
 const snapshot=await source.captureWorkerHeartbeatActivationControlSources();source.assertWorkerHeartbeatActivationControlSources(snapshot,s.controlSource.source_sha256)
 runtime.verifyWorkerHeartbeatActivationControlRuntime(snapshot,s.controlSource.source_sha256,{manifestFile,manifestSha256:s.controlRuntimeSha,lockSha256:pins.lock})
 assertVerifiedCompleteProfileStage(s.loaded)
 console.log(JSON.stringify({event:'full069_worker_path_ci_actual_Control_runtime',independently_collected:true,original_Control_verifier_passed:true,operator_manifest_changed:false,packages:14,files:138,qualifies_run:false,production_cutover_allowed:false}))
}

async function telemetry(s){
 s.telemetrySetupStartedAt=new Date().toISOString()
 // Original private target ownership is checked immediately before this new,
 // fixture-owned telemetry database and HBA operation. No external target input.
 const proof=await ownedCompleteProfilePool(s.target,1);await proof.end();assertVerifiedCompleteProfileStage(s.loaded)
 await publishFinalPathCiHba(s)
 if((await s.admin.query("SELECT count(*)::integer AS n FROM pg_database WHERE datname='agent_studio_telemetry'")).rows[0].n!==0)fail('telemetry_preexists')
 await s.admin.query('CREATE DATABASE agent_studio_telemetry OWNER postgres')
 s.telemetry=new s.loaded.Pool({host:'127.0.0.1',port:5333,database:'agent_studio_telemetry',user:'postgres',password:s.adminPassword,ssl:false,options:'',max:1,connectionTimeoutMillis:5000,statement_timeout:15000});s.telemetry.on('error',()=>{s.failed=true})
 const sql=fs.readFileSync(s.deployment+'/db/postgres/telemetry/001_worker_heartbeats.sql');if(sha(sql)!==pins.sql)fail('telemetry_sql_pin');await s.telemetry.query(sql.toString('utf8'))
 const identity=(await s.telemetry.query("SELECT system_identifier::text AS system_id,current_database() AS database,d.oid::integer AS database_oid,d.datdba::integer AS owner_oid,(SELECT oid::integer FROM pg_namespace WHERE nspname='studio_telemetry') AS schema_oid,session_user::text AS operator_login,r.oid::integer AS operator_oid,host(inet_server_addr()) AS server_addr,inet_server_port() AS server_port,(extract(epoch FROM pg_postmaster_start_time())*1000000)::numeric(30,0)::text AS postmaster_started_us FROM pg_control_system(),pg_database d JOIN pg_roles r ON r.rolname=session_user WHERE d.datname=current_database()")).rows[0]
 if(identity.system_id!==s.target.systemIdentifier||identity.database!=='agent_studio_telemetry'||identity.operator_login!=='postgres'||identity.server_addr!=='127.0.0.1'||identity.server_port!==5333||identity.owner_oid!==identity.operator_oid)fail('telemetry_binding')
 const rows=(await s.telemetry.query("SELECT rolname AS name,oid::integer AS oid,NOT rolcanlogin AND rolpassword IS NULL AS dormant FROM pg_authid WHERE starts_with(rolname,'studio_telemetry_')")).rows;if(rows.length!==18||rows.some(r=>r.dormant!==true))fail('telemetry_dormant_roles');s.binding={...identity,roles:names.map(name=>{const r=rows.find(v=>v.name===name);if(!r)fail('telemetry_role');return {name,oid:r.oid}}),sql_pin:pins.sql,record_pin:pins.record,snapshot_pin:pins.snapshot}
 s.policy={protocol:'worker_heartbeat_activation_policy_v1',binding:{installation_id:randomUUID(),system_id:identity.system_id,database_oid:identity.database_oid,owner_oid:identity.owner_oid,schema_oid:identity.schema_oid,server_addr:identity.server_addr,server_port:identity.server_port,postmaster_started_us:identity.postmaster_started_us,operator_name:identity.operator_login,role_oids:s.binding.roles.map(r=>r.oid)},reader:{login:false,verifier_sha256:null},kinds:kinds.map(kind=>({kind,instrumented:false,enabled:false})),slots:kinds.flatMap(kind=>[1,2].map(slot_no=>({kind,slot_no,mode:'unused',generation:null,verifier_sha256:null})))}
 s.writers={enabled:true,native_uid:61001,groups:kinds.map((kind,i)=>({kind,gid:62000+i})),boot_uids:Array.from({length:128},(_,i)=>63000+i),uid_policy:'exclusive_never_reuse'}
 const allocated=new Set(fs.readFileSync('/etc/passwd','utf8').split('\n').filter(Boolean).map(v=>Number(v.split(':')[2])));if([61001,...s.writers.boot_uids].some(uid=>allocated.has(uid)))fail('uid_already_allocated')
 for(const dir of[fixed.config,fixed.store,fixed.credentials,fixed.liveConfig,fixed.liveStore])directory(s,dir)
 for(const dir of[fixed.config+'/drafts',fixed.config+'/approvals',fixed.config+'/resumes',fixed.store+'/plans',fixed.store+'/credentials'])directory(s,dir)
 directory(s,fixed.sockets,0o750,61001);if(fs.existsSync(fixed.writerSockets))fail('writer_sockets_preexist')
 file(fixed.config+'/approval-public.pem',Buffer.from(s.signer.publicKey.export({type:'spki',format:'pem'})));file(fixed.config+'/source-manifest.json',Buffer.from(JSON.stringify(s.controlSource.manifest)));await publishControlRuntime(s)
 const readerPassword=randomBytes(40).toString('hex');file(fixed.credentials+'/operator-password',Buffer.from(s.adminPassword));file(fixed.credentials+'/reader-password',Buffer.from(readerPassword))
 const profile={protocol:'worker_heartbeat_control_profile_v2',mode:'closed',source_sha256:s.controlSource.source_sha256,source_manifest_sha256:s.controlSource.source_sha256,runtime_manifest_sha256:s.controlRuntimeSha,admin_password_sha256:sha(s.adminPassword),reader_password_sha256:sha(readerPassword),native_gid:61001,binding:s.binding,policy:s.policy,writers:s.writers};s.telemetryProfileSha=signed(s,fixed.config+'/profile.json',profile)
 const genesis={format:'worker_heartbeat_control_journal_v1',sequence:0,previous_sha256:'0'.repeat(64),instance_id:randomUUID(),epoch:'0',action_id:null,phase:'boot',data:{protocol:'worker_heartbeat_control_enrollment_v1',binding_sha256:sha(JSON.stringify(s.binding)),source_sha256:s.controlSource.source_sha256,initial_policy_json_sha256:sha(JSON.stringify(s.policy))}};file(fixed.store+'/journal.jsonl',Buffer.from(JSON.stringify({...genesis,record_sha256:sha(JSON.stringify(genesis))})+'\n'))
 s.controller=start(s,s.deployment+'/services/pg-api/src/worker-heartbeat-activation-control-service.ts',['serve'],{...cleanEnv(),AGENT_STUDIO_TELEMETRY_CONTROL_ENABLED:'true'})
 const client=await import(pathToFileURL(s.deployment+'/services/pg-api/src/worker-heartbeat-activation-control-client.ts').href);s.rpc=client.sendWorkerHeartbeatOperatorCommand
 await until(async()=>{if(s.controller.closed||s.controller.failed)fail('controller_exited');if(!fs.existsSync(fixed.sockets+'/operator.sock'))return false;const status=await s.rpc({op:'inspect'});return status.phase==='closed'&&status.read_gate==='closed'&&status.in_flight_reads===0},'controller_closed_boot',30000)
 const status=await s.rpc({op:'inspect'}),id=randomUUID(),draft={protocol:'worker_heartbeat_activation_draft_v1',reader:'activate',kinds:kinds.map(kind=>({kind,instrumented:true,enabled:true})),slots:kinds.flatMap(kind=>[1,2].map(slot_no=>({kind,slot_no,action:slot_no===1?'activate':'keep'})))}
 signed(s,fixed.config+'/drafts/'+id+'.json',{protocol:'worker_heartbeat_control_draft_v1',action_id:id,expected_epoch:status.fence_epoch,before_sha256:status.policy_sha256,desired_policy:draft,expires_at:new Date(Date.now()+120000).toISOString()})
 const prepared=await s.rpc({op:'prepare',action_id:id});if(prepared.action_id!==id||!hex(prepared.plan_sha256)||prepared.before_sha256!==status.policy_sha256)fail('telemetry_prepare')
 signed(s,fixed.config+'/approvals/'+id+'.json',{protocol:'worker_heartbeat_control_approval_v1',action_id:id,plan_sha256:prepared.plan_sha256,source_sha256:s.controlSource.source_sha256,binding_sha256:sha(JSON.stringify(s.binding)),expected_epoch:prepared.expected_epoch,actor:'owned-synthetic-ci',not_before:new Date(Date.now()-1000).toISOString(),expires_at:new Date(Date.now()+120000).toISOString(),scope:'MUTATE_TELEMETRY_REGISTRY_ONLY'})
 const applied=await s.rpc({op:'apply',action_id:id});if(applied.action_id!==id||applied.commit_acknowledged!==true||applied.after_verified!==true||applied.publication_completed!==true||applied.automatic_retry_authorized!==false)fail('telemetry_apply');s.status=await s.rpc({op:'inspect'});if(s.status.phase!=='serving'||s.status.read_gate!=='open'||s.status.policy_sha256!==prepared.after_sha256||s.status.fence_epoch!==applied.epoch)fail('telemetry_publication')
 const ws=fs.lstatSync(fixed.writerSockets);if(!ws.isDirectory()||ws.isSymbolicLink()||ws.uid!==0||ws.gid!==0||(ws.mode&0o7777)!==0o711)fail('writer_sockets');s.directories.set(fixed.writerSockets,{dev:ws.dev,ino:ws.ino})
}

function mountedProcess(s,id,uid,gid,groups,environment,inputs){
 const unit=id==='native'?'agentstudio-pg18-native.service':s.liveEntries.find(e=>e.id===id).unit,dir=directory(s,s.work+'/mount-'+id),mounts=[]
 for(const[leaf,bytes]of Object.entries(inputs)){const source=file(dir+'/'+leaf,Buffer.isBuffer(bytes)?bytes:Buffer.from(bytes),uid,0o400);mounts.push({source,leaf,sha256:sha(fs.readFileSync(source))})}
 return {uid,gid,groups,environment,mounts}
}

function processProfiles(s){
 const base={AGENT_STUDIO_PG_PILOT_ENABLED:'true',AGENT_STUDIO_PG_BAOTA18_ENABLED:'true',AGENT_STUDIO_PG_BAOTA18_TARGET_CONFIRMED:'true',AGENT_STUDIO_PG_HOST:'127.0.0.1',AGENT_STUDIO_PG_PORT:'5333',AGENT_STUDIO_PG_DATABASE:'agent_studio'}
 const nativeDirectory='/run/credentials/agentstudio-pg18-native.service'
 s.native=mountedProcess(s,'native',61001,61001,[],{...base,AGENT_STUDIO_PG_NATIVE_PILOT_ENABLED:'true',AGENT_STUDIO_PG_NATIVE_REVIEWED:'true',AGENT_STUDIO_PG_USER:'agentstudio_stage_login',AGENT_STUDIO_PG_NATIVE_AUTH_USER:'agentstudio_native_login',AGENT_STUDIO_PG_PASSWORD_FILE:nativeDirectory+'/api.secret',AGENT_STUDIO_PG_NATIVE_AUTH_PASSWORD_FILE:nativeDirectory+'/native-auth.secret',AGENT_STUDIO_PG_MODEL_ENCRYPTION_KEY_FILE:nativeDirectory+'/model-encryption.secret',AGENT_STUDIO_INTERNAL_APP_ORIGIN:'https://127.0.0.1:17443',AGENT_STUDIO_PG_NATIVE_API_PORT:'17403',AGENT_STUDIO_PG_NATIVE_COMPANY_WORKER_HEARTBEATS_READ_ENABLED:'true',AGENT_STUDIO_PG_NATIVE_COMPANY_WORKER_HEARTBEATS_REVIEWED:'true'},{'api.secret':s.passwords.api,'native-auth.secret':s.passwords['native-auth'],'model-encryption.secret':s.modelKey})
 const deliveryRoot=fixed.store+'/worker-boots',deliveries=fs.readdirSync(deliveryRoot).filter(v=>/^[a-f0-9-]{36}\.batch\.delivery\.json$/.test(v)).map(name=>json(privateRead(deliveryRoot+'/'+name)))
 if(deliveries.length!==7||new Set(deliveries.map(v=>v.uid)).size!==7||deliveries.some(v=>v.protocol!=='worker_heartbeat_writer_delivery_v1'||v.delivery!=='read_only_bind_uid_0400'||v.requires_exclusive_uid_reservation!==true||!s.writers.boot_uids.includes(v.uid)))fail('seven_original_boot_deliveries')
 s.workers=s.liveEntries.map(entry=>{
  const batch=deliveries.find(d=>d.items.length===entry.kinds.length&&entry.kinds.every(kind=>d.items.some(v=>v.kind===kind)));if(!batch)fail('entry_boot_delivery')
  const kind=entry.kinds[0],directoryPath='/run/credentials/'+entry.unit,inputs={'worker.secret':kind==='knowledge_index'?s.passwords['index-worker']:kind==='assessment'?s.reviewPassword:s.passwords.worker}
  /** @type {Record<string,string>} */
  const env={...base,AGENT_STUDIO_PG_WORKER_HEARTBEAT_ENABLED:'true',AGENT_STUDIO_PG_BAOTA18_WORKER_TRIAL_ALLOWED:'true',AGENT_STUDIO_PG18_WORKER_TRIAL_OPERATOR_APPROVED:'APPROVE_ISOLATED_PG18_WORKER_TRIAL_ONLY',...(['knowledge_index','assessment'].includes(kind)?{AGENT_STUDIO_PG_USER:'agentstudio_stage_login'}:{AGENT_STUDIO_PG_WORKER_USER:'agentstudio_stage_worker',AGENT_STUDIO_PG_WORKER_PASSWORD_FILE:directoryPath+'/worker.secret'})}
  if(kind==='prepare')env.AGENT_STUDIO_PG_PREPARE_WORKER_ENABLED='true'
  if(kind==='model'){Object.assign(env,{AGENT_STUDIO_PG_MODEL_WORKER_ENABLED:'true',AGENT_STUDIO_MODEL_ID:'synthetic-empty-queue',AGENT_STUDIO_MODEL_API_KEY_FILE:directoryPath+'/provider.secret'});inputs['provider.secret']='synthetic-unused-provider-'+randomBytes(24).toString('hex')}
  if(kind==='workflow_safe')Object.assign(env,{AGENT_STUDIO_PG_WORKFLOW_WORKER_ENABLED:'true',AGENT_STUDIO_PG_WORKFLOW_WORKER_APPROVED:'APPROVE_ISOLATED_PG_WORKFLOW_START_END_ONLY'})
  if(kind==='workflow_v2')Object.assign(env,{AGENT_STUDIO_PG_WORKFLOW_V2_WORKER_ENABLED:'true',AGENT_STUDIO_PG_WORKFLOW_V2_WORKER_APPROVED:'APPROVE_ISOLATED_PG_WORKFLOW_V2_RUNTIME_ONLY'})
  if(kind==='agent_autonomous'){Object.assign(env,{AGENT_STUDIO_PG_AUTONOMOUS_AGENT_ENABLED:'true',AGENT_STUDIO_PG_AUTONOMOUS_AGENT_APPROVED:'APPROVE_DISPOSABLE_PG18_AUTONOMOUS_AGENT_ONLY',AGENT_STUDIO_PG_WORKFLOW_V2_MODEL_ENABLED:'true',AGENT_STUDIO_PG_WORKFLOW_V2_MODEL_APPROVED:'APPROVE_DISPOSABLE_PG18_WORKFLOW_V2_MODEL_ONLY',AGENT_STUDIO_PG_WORKFLOW_V2_TOOLS_ENABLED:'true',AGENT_STUDIO_PG_WORKFLOW_V2_TOOLS_APPROVED:'APPROVE_DISPOSABLE_PG18_WORKFLOW_V2_TOOLS_ONLY',AGENT_STUDIO_PG_BOUND_DISPATCH_SERVER_FINGERPRINT:s.tls.serverPin});Object.assign(inputs,{'dispatch-ca.pem':s.tls.ca,'dispatch-agent.pem':s.autonomousTls.client,'dispatch-agent.key':s.autonomousTls.clientKey})}
  if(kind==='knowledge_index'){Object.assign(inputs,{'dispatch-ca.pem':s.tls.ca,'dispatch-worker.pem':s.tls.client,'dispatch-worker.key':s.tls.clientKey});Object.assign(env,{AGENT_STUDIO_PG_KNOWLEDGE_INDEX_REVIEWED:'true',AGENT_STUDIO_PG_KNOWLEDGE_INDEX_SERVER_FINGERPRINT:s.tls.serverPin,AGENT_STUDIO_PG18_KNOWLEDGE_INDEX_UAT_ENABLED:'true',AGENT_STUDIO_PG18_KNOWLEDGE_INDEX_UAT_APPROVED:'APPROVE_DISPOSABLE_PG18_OWNER_EMBEDDING_INDEX_UAT',AGENT_STUDIO_PG18_KNOWLEDGE_QUERY_UAT_ENABLED:'true',AGENT_STUDIO_PG18_KNOWLEDGE_QUERY_UAT_APPROVED:'APPROVE_DISPOSABLE_PG18_READER_EMBEDDING_QUERY_UAT',AGENT_STUDIO_PG18_KNOWLEDGE_SHARING_UAT_ENABLED:'true',AGENT_STUDIO_PG18_KNOWLEDGE_SHARING_UAT_APPROVED:'APPROVE_DISPOSABLE_PG18_KNOWLEDGE_SHARING_ONLY'})}
  if(kind==='assessment'){Object.assign(inputs,{'review-ca.pem':s.tls.ca,'review-worker.pem':s.tls.client,'review-worker.key':s.tls.clientKey});Object.assign(env,{AGENT_STUDIO_PG18_REVIEW_EXECUTION_ENABLED:'true',AGENT_STUDIO_PG18_REVIEW_EXECUTION_APPROVED:'APPROVE_DISPOSABLE_PG18_PAID_REVIEW_EXECUTION_ONLY',AGENT_STUDIO_PG_REVIEW_SERVICE_REVIEWED:'true',AGENT_STUDIO_PG_REVIEW_ORIGIN:'https://127.0.0.1:7459',AGENT_STUDIO_PG_REVIEW_SERVER_FINGERPRINT:s.tls.serverPin,AGENT_STUDIO_PG_REVIEW_CLIENT_FINGERPRINT:s.tls.clientPin})}
  const process=mountedProcess(s,entry.id,batch.uid,batch.uid,entry.kinds.map(kind=>s.writers.groups.find(v=>v.kind===kind).gid),env,inputs)
  for(const item of batch.items){if(item.boot_id!==batch.boot_id||item.uid!==batch.uid||!item.source_file.startsWith(deliveryRoot+'/')||item.mounted_file!==directoryPath+'/telemetry-'+item.kind.replaceAll('_','-')+'.boot.json')fail('boot_mount_binding');const st=fs.lstatSync(item.source_file),bytes=fs.readFileSync(item.source_file);if(!st.isFile()||st.isSymbolicLink()||st.uid!==batch.uid||st.gid!==0||(st.mode&0o7777)!==0o400||st.nlink!==1||sha(bytes)!==item.sha256)fail('boot_mount_metadata');process.mounts.push({source:item.source_file,leaf:path.basename(item.mounted_file),sha256:item.sha256})}
  return process
 })
}

function networkHash(){const outputs=['/usr/sbin/iptables-save','/usr/sbin/ip6tables-save'].map(executable=>execFileSync(executable,[],{env:cleanEnv(),encoding:'utf8',timeout:5000,maxBuffer:1048576,windowsHide:true}).split(/\r?\n/).filter(s=>s&&!s.startsWith('#')).join('\n'));return full069NetworkPolicyDigest(outputs.join('\n---\n'))}

function network(s,remove=false){
 const chain='AS_F069_'+s.loaded.stageNonce.slice(0,12),uids=[s.native.uid,...s.workers.map(v=>v.uid)],run=(binary,args)=>execFileSync(binary,['--wait','5',...args],{env:cleanEnv(),timeout:10000,maxBuffer:262144,windowsHide:true})
 if(remove){for(const rule of [...s.networkRules].reverse()){run(rule.binary,['-C','OUTPUT',...rule.args]);run(rule.binary,['-D','OUTPUT',...rule.args])}for(const binary of [...s.networkChains].reverse()){run(binary,['-F',chain]);run(binary,['-X',chain])}s.networkRules=[];s.networkChains=[];return}
 s.networkRules=[];s.networkChains=[]
 for(const binary of['/usr/sbin/iptables','/usr/sbin/ip6tables']){run(binary,['-N',chain]);s.networkChains.push(binary);if(binary.endsWith('/iptables'))run(binary,['-A',chain,'-d','127.0.0.0/8','-j','RETURN']);run(binary,['-A',chain,'-j','REJECT']);for(const uid of uids){const args=['-m','owner','--uid-owner',String(uid),'-m','comment','--comment','owned-full069-'+s.loaded.stageNonce,'-j',chain];run(binary,['-I','OUTPUT','1',...args]);s.networkRules.push({binary,args})}}
 s.networkSha=networkHash()
}

function pathFailureDiagnostic(error,controller){
 const message=Object.getOwnPropertyDescriptor(error??{},'message')?.value,code=Object.getOwnPropertyDescriptor(error??{},'code')?.value,allowed=['source_runtime_refused','binding_changed','store_invalid','not_enrolled','control_io_failed','singleton_busy','approval_invalid','invalid_command'];let controllerError=null
 for(const line of Buffer.concat(controller?.output??[]).toString('utf8').split(/\r?\n/)){try{const v=JSON.parse(line);if(Object.keys(v).sort().join(',')==='automatic_retry_authorized,error'&&v.automatic_retry_authorized===false&&allowed.includes(v.error))controllerError=v.error}catch{}}
 return {event:'full069_worker_path_ci_primary_failure',refusal:typeof message==='string'&&(/^full069_path_ci_refused:[a-z_]+$/.test(message)||['descriptive_patch_operator_runtime_refused','worker_heartbeat_activation_control_runtime_refused'].includes(message))?message:'operation_failed',sqlstate:typeof code==='string'&&/^[0-9A-Z]{5}$/.test(code)?code:null,error_code:['ERR_MODULE_NOT_FOUND','ERR_PACKAGE_PATH_NOT_EXPORTED','ERR_UNSUPPORTED_DIR_IMPORT','ERR_REQUIRE_ESM','ERR_INVALID_ARG_TYPE','ENOENT','EACCES','EPERM'].includes(code)?code:null,controller_error:controllerError,controller_exit:controller?.closed?controller.exit?.code:null,controller_signal:controller?.closed?controller.exit?.signal:null,qualifies_run:false,production_cutover_allowed:false}
}

async function publishFinalPathCiHba(s){
 const verifier=await import(pathToFileURL(s.deployment+'/services/pg-api/src/pg18-full069-final14-catalog.mjs'))
 const rows=(await s.admin.query('SELECT rule_number,type,database,user_name,address,netmask,auth_method,error,options FROM pg_hba_file_rules ORDER BY rule_number')).rows;verifier.inspectFinal14Hba(rows,{telemetry:false})
 if(!hex(s.target.id))fail('owned_container_id');const dockerConfig=s.loaded.stageInput+'/docker-config',dc=fs.lstatSync(dockerConfig);if(!dc.isDirectory()||dc.isSymbolicLink()||dc.uid!==0||dc.gid!==0||(dc.mode&0o7777)!==0o700)fail('private_docker_config')
 const old=execFileSync('/usr/bin/docker',['--config',dockerConfig,'exec','--user','postgres',s.target.id,'sh','-c','cat "$PGDATA/pg_hba.conf"'],{env:cleanEnv(),timeout:10000,maxBuffer:65536}),text=old.toString('utf8');if(!Buffer.from(text).equals(old)||!text.endsWith('\n')||text.includes('studio_telemetry_'))fail('hba_preexisting_or_encoding')
 const lines=text.split('\n'),at=lines.findIndex(l=>/^\s*(?:local\s+all\s+all|host\s+all\s+all)\s/.test(l));if(at<0)fail('hba_final_reject_missing');const active=names.slice(1),added=active.flatMap(login=>['local all '+login+' reject','host agent_studio_telemetry '+login+' 127.0.0.1/32 scram-sha-256']);lines.splice(at,0,...added)
 execFileSync('/usr/bin/docker',['--config',dockerConfig,'exec','--interactive','--user','postgres',s.target.id,'sh','-c','umask 077; cat > "$PGDATA/pg_hba.conf"'],{input:Buffer.from(lines.join('\n')),env:cleanEnv(),timeout:10000,windowsHide:true})
 const before=(await s.admin.query('SELECT pg_conf_load_time()::text AS loaded')).rows[0].loaded;if((await s.admin.query('SELECT pg_reload_conf() AS ok')).rows[0].ok!==true)fail('hba_reload');await until(async()=>(await s.admin.query('SELECT pg_conf_load_time()::text AS loaded')).rows[0].loaded!==before,'hba_reload_wait',5000)
 const actual=(await s.admin.query('SELECT rule_number,type,database,user_name,address,netmask,auth_method,error,options FROM pg_hba_file_rules ORDER BY rule_number')).rows;verifier.inspectFinal14Hba(actual,{telemetry:true});s.currentHbaSha=sha(JSON.stringify(actual))
}

export {ancestors,directory,file,privateRead,json,signed,until,command,start,stop,tls,publishControlRuntime,telemetry,mountedProcess,processProfiles,networkHash,network,pathFailureDiagnostic,fixed,pins,kinds,sha,cleanEnv,publishFinalPathCiHba}
