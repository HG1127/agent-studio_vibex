// Independent controller. No constructor accepts a pool, clock, SQL or target.
import fs from 'node:fs'
import path from 'node:path'
import net from 'node:net'
import {performance} from 'node:perf_hooks'
import {fileURLToPath} from 'node:url'
import {createPublicKey,verify,randomUUID,randomBytes,pbkdf2Sync,createHmac,timingSafeEqual,createHash} from 'node:crypto'
import type {Client,Pool,PoolClient} from 'pg'
import type {SqlClient,QueryResult} from './contracts.ts'
import {workerHeartbeatKinds,parseWorkerHeartbeatSnapshot,type WorkerHeartbeatSnapshot} from './worker-heartbeat-contract.ts'
import {verifyWorkerHeartbeatActivatedCatalog} from './worker-heartbeat-activated-audit.ts'
import {verifyWorkerHeartbeatManagementCatalog} from './worker-heartbeat-management-audit.ts'
import {controlFail,controlFreeze,controlHex,controlUuid,controlEpoch,controlObject,controlPaths,controlLimits,controlSha,controlJournalPhases,parseWorkerHeartbeatControlJson,parseWorkerHeartbeatRootProfile,parseWorkerHeartbeatControlCommand,parseWorkerHeartbeatReadRequest,WorkerHeartbeatControlError,
 type Control,type OperatorPeer,type ReaderPeer,type MutationPermit,type RecoveryObservation,type ReadLease,type FinishedRead,type ControlDbAccess,type Phase,type ControlStatus,type PlanSummary,type MutationOutcome,type RecoveryReport,type JournalRecord,type JournalPhase,type RootProfile,type ControlErrorCode,type WorkerHeartbeatRegistryPrivateMaterial} from './worker-heartbeat-activation-control-contract.ts'
type Registry=typeof import('./worker-heartbeat-activation-registry.ts')
type RegistryObservation=Awaited<ReturnType<Registry['inspectWorkerHeartbeatActivationRegistry']>>
type RegistryPlan=ReturnType<Registry['prepareWorkerHeartbeatRegistryPlan']>
type Source=typeof import('./worker-heartbeat-activation-control-source.mjs')
type Runtime=typeof import('./worker-heartbeat-activation-control-runtime.mjs')
type Binding={system_id:string;database:'agent_studio_telemetry';database_oid:number;owner_oid:number;schema_oid:number;operator_login:string;operator_oid:number;server_addr:'127.0.0.1';server_port:number;postmaster_started_us:string;roles:readonly {name:string;oid:number}[];sql_pin:string;record_pin:string;snapshot_pin:string}
type Backend={pid:number;started:string}
type Peer={s:State;socket:net.Socket;kind:'operator'|'reader';open:boolean;request:string|null;leases:Set<Lease>}
type Access={s:State;db:SqlClient;raw:Client|PoolClient;mode:'read'|'write';active:boolean;beforeChange:boolean;allLocked:boolean;lease?:Lease;leasePhase?:'preparing'|'finalizing';expires?:number;epoch?:bigint}
type Lease={s:State;peer:Peer;handle:ReadLease;id:string;request:string;epoch:bigint;deadline:number;phase:'preparing'|'pending'|'finalizing'|'finished'|'consumed'|'revoked';client?:PoolClient;clientError?:()=>void;backend?:Backend;queryPending:boolean;transaction:boolean;uncertain:boolean;released:boolean;clean:boolean;snapshot?:WorkerHeartbeatSnapshot;begin?:RegistryObservation;finished?:FinishedRead;work?:Promise<unknown>;cleanup?:Promise<void>;timer:ReturnType<typeof setTimeout>}
type Action={id:string;plan:RegistryPlan;summary:PlanSummary;policy:unknown;privateMaterial?:unknown;approvalSha?:string;ack:boolean;epoch?:bigint}
type Mutation={s:State;peer:Peer;action:Action;expected:bigint;expires:number;consumed:boolean}
type Recovered={s:State;action:string;epoch:bigint;report:RecoveryReport;used:boolean;material?:WorkerHeartbeatRegistryPrivateMaterial;materialSha?:string;beforePasswords?:{oid:string;name:string;verifier:string|null}[]}
type State={handle:Control;profile:RootProfile;binding:Binding;registry:Registry;runtime:Runtime;runtimeCap:Parameters<Runtime['assertWorkerHeartbeatActivationControlRuntime']>[0];driver:{Client:typeof Client;Pool:typeof Pool};raw:Client;db:SqlClient;reader:Pool;operatorPassword:string;readerPassword:string;publicKey:ReturnType<typeof createPublicKey>;instance:string;phase:Phase;epoch:bigint;published:bigint|null;policy:unknown;policySha:string|null;journal:JournalRecord[];journalBytes:string;journalHead:string;journalFile:string;controlBackend:Backend;sqlTail:Promise<unknown>;sqlJobs:number;mutation:boolean;healthy:boolean;leases:Set<Lease>;peers:Set<Peer>;servers:Set<net.Server>;actions:Map<string,Action>;recoveries:Map<string,Recovered>;accesses:Set<Access>}
const states=new WeakMap<object,State>(),peerStates=new WeakMap<object,Peer>(),mutationStates=new WeakMap<object,Mutation>(),recoveryStates=new WeakMap<object,Recovered>(),leaseStates=new WeakMap<object,Lease>(),finishedStates=new WeakMap<object,Lease>(),dbAccesses=new WeakMap<object,Access>()
const closures=new WeakMap<object,Promise<void>>()
const facadeAccesses=new WeakMap<object,ControlDbAccess>()
const singleton=[0x41535443,0x54454c31],roleNames=['studio_telemetry_owner','studio_telemetry_reader',...workerHeartbeatKinds.flatMap(k=>[1,2].map(n=>'studio_telemetry_tx_'+k+'_'+n))]
const empty=<T>():T=>Object.freeze(Object.create(null)) as T
const state=(v:Control):State=>states.get(v)??controlFail('untrusted_reference')
const peer=(s:State,v:OperatorPeer|ReaderPeer,kind:'operator'|'reader'):Peer=>{const p=peerStates.get(v);if(!p||p.s!==s||!p.open||p.kind!==kind)return controlFail('untrusted_reference');return p}
function host(){
 if(process.platform!=='linux'||process.getuid?.()!==0||process.getgid?.()!==0||process.versions.node.split('.')[0]!=='24'||process.env.AGENT_STUDIO_TELEMETRY_CONTROL_ENABLED!=='true'||process.execArgv.some(v=>v!=='--experimental-strip-types'))controlFail('source_runtime_refused')
 for(const [key,d]of Object.entries(Object.getOwnPropertyDescriptors(process.env))){if(!('value'in d)||/^PG|^NODE_PG_|^DOCKER_|^LD_|^DYLD_/.test(key)||['DATABASE_URL','NODE_PATH','NODE_OPTIONS','NODE_COMPILE_CACHE','NODE_V8_COVERAGE','NODE_EXTRA_CA_CERTS','NODE_TLS_REJECT_UNAUTHORIZED','SSL_CERT_FILE','SSL_CERT_DIR','OPENSSL_CONF','OPENSSL_MODULES'].includes(key)&&d.value||key.startsWith('AGENT_STUDIO_TELEMETRY_CONTROL_')&&key!=='AGENT_STUDIO_TELEMETRY_CONTROL_ENABLED')controlFail('source_runtime_refused')}
}
function directory(dir:string,mode=0o700){
 if(!path.isAbsolute(dir)||path.normalize(dir)!==dir||dir.includes('\\'))controlFail('store_invalid')
 let at='/';for(const part of dir.split('/').filter(Boolean)){at=path.join(at,part);const st=fs.lstatSync(at);if(!st.isDirectory()||st.isSymbolicLink()||st.uid!==0||(st.mode&0o7022)!==0)controlFail('store_invalid')}
 if((fs.lstatSync(dir).mode&0o7777)!==mode)controlFail('store_invalid')
}
function privateRead(file:string,max=2097152):Buffer{
 directory(path.dirname(file));const a=fs.lstatSync(file)
 if(!a.isFile()||a.isSymbolicLink()||a.uid!==0||a.gid!==0||a.nlink!==1||(a.mode&0o7777)!==0o600||a.size<1||a.size>max||fs.realpathSync(file)!==file)controlFail('store_invalid')
 const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW|fs.constants.O_NONBLOCK)
 try{const bytes=fs.readFileSync(fd),z=fs.fstatSync(fd),last=fs.lstatSync(file);for(const k of ['dev','ino','size','mode','uid','gid','mtimeMs','ctimeMs','nlink'] as const)if(a[k]!==z[k]||a[k]!==last[k])controlFail('store_invalid');if(bytes.length!==a.size)controlFail('store_invalid');return bytes}finally{fs.closeSync(fd)}
}
function syncDir(dir:string){const fd=fs.openSync(dir,fs.constants.O_RDONLY|fs.constants.O_DIRECTORY|fs.constants.O_NOFOLLOW);try{fs.fsyncSync(fd)}finally{fs.closeSync(fd)}}
function privateWrite(file:string,bytes:Buffer|string){directory(path.dirname(file));const fd=fs.openSync(file,fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_NOFOLLOW,0o600);try{fs.writeFileSync(fd,bytes);fs.fchmodSync(fd,0o600);fs.fsyncSync(fd)}finally{fs.closeSync(fd)}syncDir(path.dirname(file));if(!privateRead(file,4194304).equals(Buffer.from(bytes)))controlFail('store_invalid')}
function signedBytes(bytes:Buffer,key:ReturnType<typeof createPublicKey>):unknown{
 const x=controlObject(parseWorkerHeartbeatControlJson(bytes,2097152),['payload','signature']);if(typeof x.signature!=='string'||!/^[A-Za-z0-9+/]{86}==$/.test(x.signature))controlFail('approval_invalid')
 if(!verify(null,Buffer.from(JSON.stringify(x.payload)),key,Buffer.from(x.signature,'base64')))controlFail('approval_invalid');return x.payload
}
function signed(file:string,key:ReturnType<typeof createPublicKey>):unknown{return signedBytes(privateRead(file),key)}
function parseBinding(raw:unknown):Binding{
 const x=controlObject(raw,['system_id','database','database_oid','owner_oid','schema_oid','operator_login','operator_oid','server_addr','server_port','postmaster_started_us','roles','sql_pin','record_pin','snapshot_pin'])
 const oid=(v:unknown)=>typeof v==='number'&&Number.isInteger(v)&&v>0&&v<=2147483647
 if(typeof x.system_id!=='string'||!/^[1-9][0-9]{0,19}$/.test(x.system_id)||BigInt(x.system_id)>18446744073709551615n||x.database!=='agent_studio_telemetry'||x.server_addr!=='127.0.0.1'||typeof x.server_port!=='number'||!Number.isInteger(x.server_port)||x.server_port<1024||x.server_port>65535||typeof x.operator_login!=='string'||! /^[a-z_][a-z0-9_]{0,62}$/.test(x.operator_login)||!oid(x.operator_oid)||x.operator_oid!==x.owner_oid||typeof x.postmaster_started_us!=='string'||! /^[1-9][0-9]{0,29}$/.test(x.postmaster_started_us)||['database_oid','owner_oid','schema_oid'].some(k=>!oid(x[k])))controlFail('binding_changed')
 if(x.sql_pin!=='5ed1080d9f7b651ea2ae7fceca09db7f61c679f107e196df13ae201a8f99505f'||x.record_pin!=='4e1fd93b6217d5cf414189f568d395f48a3e3e54e1ee455e65d28d4717e15143'||x.snapshot_pin!=='17215237dbc5f81ba8fbbb2fd8eae2a9da7e0e0cfa859124ab50f3ccd60671ec'||!Array.isArray(x.roles)||x.roles.length!==18)controlFail('binding_changed')
 const roles=x.roles.map((raw,i)=>{const r=controlObject(raw,['name','oid']);if(r.name!==roleNames[i]||!oid(r.oid)||r.oid===x.owner_oid)controlFail('binding_changed');return {name:r.name as string,oid:r.oid as number}});if(new Set(roles.map(r=>r.oid)).size!==18)controlFail('binding_changed')
 return controlFreeze({...x,roles}) as unknown as Binding
}
function preflightBundle(profile:RootProfile){
 const source=privateRead(controlPaths.config+'/source-manifest.json'),runtime=privateRead(controlPaths.config+'/runtime-manifest.json')
 if(controlSha(source)!==profile.source_manifest_sha256||controlSha(runtime)!==profile.runtime_manifest_sha256)controlFail('source_runtime_refused')
 const manifest=controlObject(parseWorkerHeartbeatControlJson(source,2097152),['format','parser','sources','imports','externals'])
 if(manifest.format!=='worker_heartbeat_activation_control_sources_v1'||controlSha(JSON.stringify(manifest))!==profile.source_sha256||!Array.isArray(manifest.sources))controlFail('source_runtime_refused')
 const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..')
 const rt=controlObject(parseWorkerHeartbeatControlJson(runtime,2097152),['format','lock_sha256','pg_version','packages','files']);if(!Array.isArray(rt.files))controlFail('source_runtime_refused')
 const files=[...manifest.sources,...rt.files];const parserPins:Record<string,string>={'lib/typescript.js':'3ae902c92cc44dace175c0e69e13a4b0899f6983c6121d76b9ab8dd5795e7675','package.json':'822ef7ca6452205657b6288b066481ecf508bfbf43455d715cf7d3ec457561e6','LICENSE.txt':'a7d00bfd54525bc694b6e32f64c7ebcf5e6b7ae3657be5cc12767bce74654a47','ThirdPartyNoticeText.txt':'1af3c68039c57e539422da82a4faada506ce6d0ea6f90e0b699d02dbcdb7a90c'}
 files.push(...Object.entries(parserPins).map(([p,sha256])=>({path:'services/pg-api/node_modules/typescript/'+p,sha256})))
 for(const raw of files){const f=raw as {path?:unknown;sha256?:unknown};if(typeof f.path!=='string'||! /^(?:services\/pg-api|shared|db\/postgres)\/[A-Za-z0-9_./-]+$/.test(f.path)||f.path.split('/').some(v=>!v||v==='.'||v==='..')||!controlHex(f.sha256))controlFail('source_runtime_refused');let at=root;for(const part of f.path.split('/')){const st=fs.lstatSync(at);if(!st.isDirectory()||st.isSymbolicLink()||st.uid!==0||st.gid!==0||(st.mode&0o7777)!==0o555)controlFail('source_runtime_refused');at=path.join(at,part)}const a=fs.lstatSync(at);if(!a.isFile()||a.isSymbolicLink()||a.nlink!==1||a.uid!==0||a.gid!==0||(a.mode&0o7777)!==0o444||a.size>16777216)controlFail('source_runtime_refused');const fd=fs.openSync(at,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);try{const bytes=fs.readFileSync(fd),z=fs.fstatSync(fd);for(const k of ['dev','ino','size','mtimeMs','ctimeMs'] as const)if(a[k]!==z[k]||a[k]!==fs.lstatSync(at)[k])controlFail('source_runtime_refused');if(controlSha(bytes)!==f.sha256)controlFail('source_runtime_refused')}finally{fs.closeSync(fd)}}
}
const targetSql="SELECT current_database() AS database,d.oid::text AS database_oid,d.datdba::text AS owner_oid,session_user::text AS login,current_user::text AS actor,host(inet_server_addr()) AS address,inet_server_port() AS port,current_setting('server_version_num')::integer AS version,current_setting('server_encoding') AS encoding,(pg_control_system()).system_identifier::text AS system_id,(extract(epoch FROM pg_postmaster_start_time())*1000000)::numeric(30,0)::text AS started,r.oid::text AS operator_oid,r.rolsuper AS super,NOT pg_is_in_recovery() AS primary,pg_backend_pid() AS pid,a.backend_start::text AS backend_start FROM pg_database d JOIN pg_roles r ON r.rolname=session_user JOIN pg_stat_activity a ON a.pid=pg_backend_pid() WHERE d.datname=current_database()"
async function target(raw:Client,b:Binding):Promise<Backend>{const r=(await raw.query(targetSql)).rows[0];if(!r||r.database!==b.database||r.database_oid!==String(b.database_oid)||r.owner_oid!==String(b.owner_oid)||r.login!==b.operator_login||r.actor!==b.operator_login||r.operator_oid!==String(b.operator_oid)||r.address!==b.server_addr||r.port!==b.server_port||r.version<180000||r.version>=190000||r.encoding!=='UTF8'||r.system_id!==b.system_id||r.started!==b.postmaster_started_us||r.super!==true||r.primary!==true||!Number.isInteger(r.pid)||typeof r.backend_start!=='string')controlFail('binding_changed');return {pid:r.pid,started:r.backend_start}}
function connection(s:Pick<State,'binding'|'operatorPassword'>){return {host:s.binding.server_addr,port:s.binding.server_port,database:s.binding.database,user:s.binding.operator_login,password:s.operatorPassword,ssl:false as const,options:'',connectionTimeoutMillis:2000,statement_timeout:10000,query_timeout:12000}}
function facade(raw:Client|PoolClient):SqlClient{const db:SqlClient={async query<Row=Record<string,unknown>>(sql:string,values:unknown[]=[]){const token=facadeAccesses.get(db),a=token&&dbAccesses.get(token);if(!token||!a||a.raw!==raw)controlFail('untrusted_reference');assertWorkerHeartbeatControlDbAccess(db,token,a.mode);const result=await raw.query(sql,values);assertWorkerHeartbeatControlDbAccess(db,token,a.mode);return result as unknown as QueryResult<Row>},release(){controlFail('untrusted_reference')}};return db}
function access(s:State,raw:Client|PoolClient,db:SqlClient,mode:'read'|'write'):ControlDbAccess{if(facadeAccesses.has(db))controlFail('control_busy');const token=empty<ControlDbAccess>(),a={s,raw,db,mode,active:true,beforeChange:false,allLocked:false};dbAccesses.set(token,a);facadeAccesses.set(db,token);s.accesses.add(a);return token}
export function assertWorkerHeartbeatControlDbAccess(db:SqlClient,permit:ControlDbAccess,mode:'read'|'write'):void{const a=dbAccesses.get(permit);if(!a||!a.active||a.db!==db||!['read','write'].includes(mode)||mode==='write'&&(!a.s.healthy||a.mode!=='write'||!a.beforeChange||!a.allLocked||a.s.phase!=='applying'||a.epoch!==a.s.epoch||a.expires===undefined||performance.now()>=a.expires))controlFail('untrusted_reference');if(a.lease&&a.leasePhase)leaseCheck(a.lease,a.leasePhase);a.s.runtime.assertWorkerHeartbeatActivationControlRuntime(a.s.runtimeCap)}
function invalidateAccess(s:State,token:ControlDbAccess){const a=dbAccesses.get(token);if(a){a.active=false;s.accesses.delete(a);dbAccesses.delete(token);if(facadeAccesses.get(a.db)===token)facadeAccesses.delete(a.db)}}
function observedSha(s:State,value:RegistryObservation){const v=s.registry.describeWorkerHeartbeatRegistry(value);return controlSha(JSON.stringify([v.policy_sha256,v.private_material_sha256]))}
async function managementCatalog(s:State,db:SqlClient,policy:unknown){
 const p=policyParts(s,policy)
 return verifyWorkerHeartbeatManagementCatalog(db,{protocol:'worker_heartbeat_management_catalog_expectations_v1',database_oid:s.binding.database_oid,database_owner_oid:s.binding.owner_oid,schema_oid:s.binding.schema_oid,operator:{oid:s.binding.operator_oid,name:s.binding.operator_login},roles:s.binding.roles.map((r,i)=>({oid:r.oid,name:r.name,login:i===0?false:i===1?p.reader.login:p.slots[i-2]!.mode==='active',inherit:false,super:false,bypass:false,create_db:false,create_role:false,replication:false,connection_limit:i===0?-1:i===1?2:1,config:null,no_expiry:true,memberships:0}))})
}
async function serial<T>(s:State,job:()=>Promise<T>):Promise<T>{if(s.sqlJobs>=4)controlFail('control_busy');s.sqlJobs++;const result=s.sqlTail.then(job);s.sqlTail=result.catch(()=>{});try{return await result}finally{s.sqlJobs--}}
function append(s:State,phase:JournalPhase,action:string|null,data:unknown){
 const record={format:'worker_heartbeat_control_journal_v1' as const,sequence:s.journal.length,previous_sha256:s.journalHead,instance_id:s.instance,epoch:s.epoch.toString(),action_id:action,phase,data},record_sha256=controlSha(JSON.stringify(record)),full={...record,record_sha256},line=JSON.stringify(full)+'\n'
 if(!privateRead(s.journalFile,4194304).equals(Buffer.from(s.journalBytes)))controlFail('store_invalid')
 const fd=fs.openSync(s.journalFile,fs.constants.O_WRONLY|fs.constants.O_APPEND|fs.constants.O_NOFOLLOW)
 try{const st=fs.fstatSync(fd);if(st.uid!==0||st.gid!==0||st.nlink!==1||(st.mode&0o7777)!==0o600||st.size!==Buffer.byteLength(s.journalBytes))controlFail('store_invalid');fs.writeFileSync(fd,line);fs.fsyncSync(fd)}finally{fs.closeSync(fd)}syncDir(path.dirname(s.journalFile));s.journalBytes+=line;s.journalHead=record_sha256;s.journal.push(controlFreeze(full));if(!privateRead(s.journalFile,4194304).equals(Buffer.from(s.journalBytes)))controlFail('store_invalid')
}
function journal(raw:Buffer):JournalRecord[]{const text=raw.toString('utf8');if(!text.endsWith('\n'))controlFail('store_invalid');const records:JournalRecord[]=[];let previous='0'.repeat(64),epoch=0n;for(const line of text.slice(0,-1).split('\n')){const x=controlObject(parseWorkerHeartbeatControlJson(Buffer.from(line),2097152),['format','sequence','previous_sha256','instance_id','epoch','action_id','phase','data','record_sha256']);const {record_sha256,...body}=x;if(x.format!=='worker_heartbeat_control_journal_v1'||x.sequence!==records.length||x.previous_sha256!==previous||!controlUuid(x.instance_id)||!controlEpoch(x.epoch)||BigInt(x.epoch)<epoch||x.action_id!==null&&!controlUuid(x.action_id)||typeof x.phase!=='string'||!controlJournalPhases.includes(x.phase as JournalPhase)||!controlHex(record_sha256)||controlSha(JSON.stringify(body))!==record_sha256||JSON.stringify(x)!==line)controlFail('store_invalid');epoch=BigInt(x.epoch);previous=record_sha256;records.push(x as JournalRecord)}return records}
async function inspectRegistry(s:State,policy=s.policy,l?:Lease):Promise<RegistryObservation>{
 const db=s.db,token=access(s,s.raw,db,'read');let active=false
 if(l){const a=dbAccesses.get(token)!;a.lease=l;a.leasePhase=l.phase==='finalizing'?'finalizing':'preparing'}
 const check=()=>assertWorkerHeartbeatControlDbAccess(db,token,'read')
 try{check();await target(s.raw,s.binding);check();await s.raw.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');active=true;check();await s.raw.query("SET LOCAL search_path=pg_catalog; SET LOCAL statement_timeout='1000ms'; SET LOCAL lock_timeout='250ms'");check();await managementCatalog(s,db,s.policy);const result=await s.registry.inspectWorkerHeartbeatActivationRegistry(db,token,policy);check();await s.raw.query('ROLLBACK');active=false;check();return result}finally{invalidateAccess(s,token);if(active)try{await s.raw.query('ROLLBACK')}catch{fault(s,'rollback_unknown');controlFail('rollback_unknown')}}
}
function runtimeCheck(s:State){if(!s.healthy)controlFail('control_closed');host();s.runtime.assertWorkerHeartbeatActivationControlRuntime(s.runtimeCap)}
function fault(s:State,_code:ControlErrorCode){s.phase='recovery_required';for(const l of s.leases)revoke(l);for(const a of s.accesses)a.active=false}
export function inspectWorkerHeartbeatActivationControl(control:Control):ControlStatus{const s=state(control);return Object.freeze({phase:s.phase,instance_id:s.instance,fence_epoch:s.epoch.toString(),published_epoch:s.published?.toString()??null,policy_sha256:s.policySha,read_gate:s.phase==='serving'?'open':'closed',in_flight_reads:s.leases.size as 0|1|2,mutation_in_flight:s.mutation,is_activation_capability:false})}
export async function openWorkerHeartbeatActivationControl():Promise<Control>{
 host();directory(controlPaths.config);directory(controlPaths.store);directory(controlPaths.credentials)
 const publicKey=createPublicKey(privateRead(controlPaths.config+'/approval-public.pem',8192));if(publicKey.asymmetricKeyType!=='ed25519')controlFail('approval_invalid')
 const profile=parseWorkerHeartbeatRootProfile(signed(controlPaths.config+'/profile.json',publicKey)),binding=parseBinding(profile.binding);preflightBundle(profile)
 const source:Source=await import('./worker-heartbeat-activation-control-source.mjs'),runtime=await import('./worker-heartbeat-activation-control-runtime.mjs'),snapshot=await source.captureWorkerHeartbeatActivationControlSources();source.assertWorkerHeartbeatActivationControlSources(snapshot,profile.source_sha256)
 const runtimeCap=runtime.verifyWorkerHeartbeatActivationControlRuntime(snapshot,profile.source_sha256,{manifestFile:controlPaths.config+'/runtime-manifest.json',manifestSha256:profile.runtime_manifest_sha256,lockSha256:'eb56da11d2713724419f938ef874991fd50fc082dda09837b779ee5841a21c6a'}),driver=runtime.loadWorkerHeartbeatActivationControlPg(runtimeCap)
 const operatorBytes=privateRead(controlPaths.credentials+'/operator-password',80),readerBytes=privateRead(controlPaths.credentials+'/reader-password',80);if(controlSha(operatorBytes)!==profile.admin_password_sha256||controlSha(readerBytes)!==profile.reader_password_sha256||! /^[a-f0-9]{80}$/.test(operatorBytes.toString())||! /^[a-f0-9]{80}$/.test(readerBytes.toString()))controlFail('binding_changed')
 const raw=new driver.Client(connection({binding,operatorPassword:operatorBytes.toString()}));raw.on('error',()=>{});let connected=false
 try{await raw.connect();connected=true;const controlBackend=await target(raw,binding);if((await raw.query('SELECT pg_try_advisory_lock($1::integer,$2::integer) AS held',singleton)).rows[0]?.held!==true)controlFail('singleton_busy')
  const registry=await import('./worker-heartbeat-activation-registry.ts'),journalFile=controlPaths.store+'/journal.jsonl',journalBytes=privateRead(journalFile,4194304).toString(),records=journal(Buffer.from(journalBytes));if(!records.length)controlFail('not_enrolled')
  const first=records[0]!,enrollment=controlObject(first.data,['protocol','binding_sha256','source_sha256','initial_policy_json_sha256']);if(first.sequence!==0||first.epoch!=='0'||first.phase!=='boot'||first.action_id!==null||enrollment.protocol!=='worker_heartbeat_control_enrollment_v1'||enrollment.binding_sha256!==controlSha(JSON.stringify(binding))||enrollment.source_sha256!==profile.source_sha256||enrollment.initial_policy_json_sha256!==controlSha(JSON.stringify(profile.policy)))controlFail('not_enrolled')
  const epoch=BigInt(records.at(-1)!.epoch)+1n;if(epoch>18446744073709551615n)controlFail('store_invalid')
  const handle=empty<Control>(),reader=new driver.Pool({...connection({binding,operatorPassword:readerBytes.toString()}),user:'studio_telemetry_reader',max:2,connectionTimeoutMillis:2000,statement_timeout:3000,query_timeout:4000});reader.on('error',()=>{})
  const s:State={handle,profile,binding,registry,runtime,runtimeCap,driver,raw,db:facade(raw),reader,operatorPassword:operatorBytes.toString(),readerPassword:readerBytes.toString(),publicKey,instance:randomUUID(),phase:'closed',epoch,published:null,policy:profile.policy,policySha:null,journal:records,journalBytes,journalHead:records.at(-1)!.record_sha256,journalFile,controlBackend,sqlTail:Promise.resolve(),sqlJobs:0,mutation:false,healthy:true,leases:new Set(),peers:new Set(),servers:new Set(),actions:new Map(),recoveries:new Map(),accesses:new Set()};states.set(handle,s)
  raw.on('error',()=>{if(s.raw===raw){s.healthy=false;fault(s,'control_io_failed')}});raw.on('end',()=>{if(s.raw===raw){s.healthy=false;fault(s,'control_io_failed')}});append(s,'boot',null,{source_sha256:profile.source_sha256,control_backend:controlBackend})
  const pending=new Set<string>();for(const r of records){if(r.action_id&&['before_change','commit_pending','commit_acknowledged','commit_unknown','rollback_unknown','publication_pending'].includes(r.phase))pending.add(r.action_id);if(r.action_id&&['published','abandoned'].includes(r.phase))pending.delete(r.action_id)}
  await reconcileReaders(s,records)
  const latest=[...records].reverse().find(r=>r.phase==='published');if(latest){const data=latest.data as {policy?:unknown};s.policy=data.policy}policyParts(s,s.policy)
  for(const r of records)if(r.phase==='published'&&r.action_id){const staged=readStaged(s,r.action_id);if(staged.material.roles.some(v=>v.name==='studio_telemetry_reader'))await replaceReaderPool(s,staged.material)}
  if(pending.size)s.phase='recovery_required';else{s.phase='auditing';const observed=await serial(s,()=>inspectRegistry(s));s.policySha=observedSha(s,observed);const p=policyParts(s,s.policy);if(p.reader.login&&!passwordsMatch({roles:[{name:'studio_telemetry_reader',oid:s.binding.roles[1]!.oid,password:s.readerPassword,verifier_sha256:p.reader.verifier_sha256 as string,generation:null}]},await verifierRows(s.raw,['studio_telemetry_reader'])))controlFail('binding_changed');if(profile.mode==='serve'){s.published=s.epoch;append(s,'published',null,{policy:s.policy,policy_sha256:s.policySha});s.phase=registry.describeWorkerHeartbeatRegistry(observed).catalog_expectations?'serving':'closed'}else s.phase='closed'}
  return handle
 }catch(error){if(connected)await raw.end().catch(()=>{});throw error instanceof WorkerHeartbeatControlError?error:new WorkerHeartbeatControlError('control_io_failed')}
}
async function observer<T>(s:State,body:(raw:Client)=>Promise<T>):Promise<T>{
 s.runtime.assertWorkerHeartbeatActivationControlRuntime(s.runtimeCap)
 const raw=new s.driver.Client(connection(s));raw.on('error',()=>{})
 try{await raw.connect();await target(raw,s.binding);await raw.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await raw.query("SET LOCAL search_path=pg_catalog; SET LOCAL statement_timeout='1000ms'; SET LOCAL lock_timeout='250ms'");try{return await body(raw)}finally{await raw.query('ROLLBACK')}}finally{await raw.end()}
}
async function backendGone(s:State,b:Backend):Promise<boolean>{return observer(s,async raw=>(await raw.query('SELECT NOT EXISTS(SELECT 1 FROM pg_stat_activity WHERE pid=$1 AND backend_start=$2::timestamptz) AS gone',[b.pid,b.started])).rows[0]?.gone===true)}
async function waitBackendGone(s:State,b:Backend){const end=performance.now()+2000;do{if(await backendGone(s,b))return;await new Promise(resolve=>setTimeout(resolve,25))}while(performance.now()<end);controlFail('reader_cleanup_unknown')}
async function reconcileReaders(s:State,records:readonly JournalRecord[]){
 const unfinished=new Map<string,Backend>()
 for(const r of records){if(r.phase==='reader_bound'){const d=controlObject(r.data,['lease_id','backend','role_oid','database_oid']),b=controlObject(d.backend,['pid','started']);if(!controlHex(d.lease_id)||d.role_oid!==s.binding.roles[1]!.oid||d.database_oid!==s.binding.database_oid||typeof b.pid!=='number'||!Number.isInteger(b.pid)||b.pid<1||typeof b.started!=='string')controlFail('store_invalid');unfinished.set(d.lease_id,{pid:b.pid,started:b.started})}else if(r.phase==='reader_ended'){const d=controlObject(r.data,['lease_id','backend']);if(!controlHex(d.lease_id)||JSON.stringify(unfinished.get(d.lease_id))!==JSON.stringify(d.backend))controlFail('store_invalid');unfinished.delete(d.lease_id)}}
 for(const [id,b]of unfinished){await waitBackendGone(s,b);append(s,'reader_ended',null,{lease_id:id,backend:b})}
 // Covers a crash after TCP acquisition but before the own PID/start was logged.
 // No fresh reader has been acquired by this controller at this point.
 const strays=await observer(s,async raw=>(await raw.query('SELECT a.pid,a.backend_start::text AS started FROM pg_stat_activity a JOIN pg_roles r ON r.rolname=a.usename WHERE a.datid=$1::oid AND r.oid=$2::oid',[s.binding.database_oid,s.binding.roles[1]!.oid])).rows)
 for(const b of strays){if(typeof b.pid!=='number'||typeof b.started!=='string')controlFail('binding_changed');await waitBackendGone(s,{pid:b.pid,started:b.started})}
}
function leaseCheck(l:Lease,phase:'pending'|'finalizing'|'finished'|'preparing'){
 const s=l.s;runtimeCheck(s)
 if(!l.peer.open||l.phase!==phase||s.phase!=='serving'||l.epoch!==s.epoch)controlFail('lease_revoked')
 if(performance.now()>=l.deadline){revoke(l);controlFail('lease_expired')}
}
async function readerQuery(l:Lease,sql:string){
 if(!l.client)controlFail('untrusted_reference');if(sql!=='ROLLBACK')leaseCheck(l,'preparing');l.queryPending=true
 try{const result=await l.client.query(sql);if(sql!=='ROLLBACK')leaseCheck(l,'preparing');return result}catch(error){l.uncertain=true;throw error}finally{l.queryPending=false}
}
async function cleanupLease(l:Lease):Promise<void>{
 if(l.cleanup)return l.cleanup
 l.cleanup=(async()=>{
  await l.work?.catch(()=>{})
  if(l.client&&!l.released){
   if(l.transaction&&!l.uncertain)try{await readerQuery(l,'ROLLBACK');l.transaction=false}catch{l.uncertain=true}
   if(l.clientError)l.client.off('error',l.clientError)
   try{l.client.release(l.uncertain);l.released=true}catch{l.uncertain=true;l.released=true}
   if(l.uncertain){if(!l.backend)controlFail('reader_cleanup_unknown');await waitBackendGone(l.s,l.backend)}
  }
  if(l.queryPending||l.transaction&&!l.uncertain)controlFail('reader_cleanup_unknown')
  l.clean=true;clearTimeout(l.timer);l.peer.leases.delete(l);l.s.leases.delete(l);if(l.backend)append(l.s,'reader_ended',null,{lease_id:l.id,backend:l.backend})
 })().catch(()=>{fault(l.s,'reader_cleanup_unknown');controlFail('reader_cleanup_unknown')})
 return l.cleanup
}
function revoke(l:Lease){
 if(l.phase==='consumed'||l.phase==='revoked')return
 l.phase='revoked';l.snapshot=undefined;clearTimeout(l.timer)
 // The lease stays in s.leases until actual I/O and backend cleanup settle.
 void cleanupLease(l).catch(()=>{})
}
export async function prepareWorkerHeartbeatControlRead(control:Control,p:ReaderPeer):Promise<ReadLease>{
 const s=state(control),owner=peer(s,p,'reader');runtimeCheck(s)
 if(s.phase!=='serving'||s.mutation)controlFail('control_closed');if(s.leases.size>=controlLimits.leases||owner.leases.size)controlFail('reader_capacity')
 const handle=empty<ReadLease>(),l:Lease={s,peer:owner,handle,id:randomBytes(32).toString('hex'),request:owner.request??randomUUID(),epoch:s.epoch,deadline:performance.now()+controlLimits.leaseMs,phase:'preparing',queryPending:false,transaction:false,uncertain:false,released:false,clean:false,timer:undefined as unknown as ReturnType<typeof setTimeout>}
 leaseStates.set(handle,l);s.leases.add(l);owner.leases.add(l);l.timer=setTimeout(()=>revoke(l),controlLimits.leaseMs)
 l.work=(async()=>{
  const begin=await serial(s,async()=>{leaseCheck(l,'preparing');return inspectRegistry(s,s.policy,l)});l.begin=begin;leaseCheck(l,'preparing')
  const expectations=s.registry.describeWorkerHeartbeatRegistry(begin).catalog_expectations;if(!expectations)controlFail('control_closed')
  l.client=await s.reader.connect();l.clientError=()=>{l.uncertain=true;revoke(l)};l.client.on('error',l.clientError);leaseCheck(l,'preparing')
  const identity=(await readerQuery(l,"SELECT pg_backend_pid() AS pid,backend_start::text AS started,current_database() AS database,current_user::text AS actor,session_user::text AS login,inet_server_port() AS port FROM pg_stat_activity WHERE pid=pg_backend_pid()")).rows[0]
  if(!identity||identity.database!==s.binding.database||identity.actor!=='studio_telemetry_reader'||identity.login!==identity.actor||identity.port!==s.binding.server_port||!Number.isInteger(identity.pid)||typeof identity.started!=='string')controlFail('binding_changed')
  l.backend={pid:identity.pid,started:identity.started};append(s,'reader_bound',null,{lease_id:l.id,backend:l.backend,role_oid:s.binding.roles[1]!.oid,database_oid:s.binding.database_oid})
  await readerQuery(l,'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');l.transaction=true
  await readerQuery(l,"SET LOCAL search_path=pg_catalog; SET LOCAL statement_timeout='3000ms'; SET LOCAL lock_timeout='1000ms'")
  await verifyWorkerHeartbeatActivatedCatalog({query:async(sql,values=[])=>{if(values.length){leaseCheck(l,'preparing');l.queryPending=true;try{const result=await l.client!.query(sql,values);leaseCheck(l,'preparing');return result}catch(error){l.uncertain=true;throw error}finally{l.queryPending=false}}return readerQuery(l,sql)},release(){controlFail('untrusted_reference')}},expectations)
  const rows=(await readerQuery(l,'SELECT studio_telemetry.snapshot() AS value')).rows;if(rows.length!==1)controlFail('registry_mismatch')
  const snapshot=parseWorkerHeartbeatSnapshot(rows[0]?.value);await readerQuery(l,'ROLLBACK');l.transaction=false;leaseCheck(l,'preparing');l.snapshot=snapshot;l.phase='pending'
 })()
 try{await l.work;return handle}catch(error){revoke(l);await cleanupLease(l);throw error instanceof WorkerHeartbeatControlError?error:new WorkerHeartbeatControlError('control_io_failed')}
}
export async function finalizeWorkerHeartbeatControlRead(control:Control,p:ReaderPeer,handle:ReadLease):Promise<FinishedRead>{
 const s=state(control),owner=peer(s,p,'reader'),l=leaseStates.get(handle);if(!l||l.s!==s||l.peer!==owner)controlFail('untrusted_reference')
 leaseCheck(l,'pending');l.phase='finalizing'
 try{
  await serial(s,async()=>{leaseCheck(l,'finalizing');if(!l.begin||!l.snapshot)controlFail('lease_revoked');const end=await inspectRegistry(s,l.begin,l),before=s.registry.describeWorkerHeartbeatRegistry(l.begin),after=s.registry.describeWorkerHeartbeatRegistry(end);if(observedSha(s,l.begin)!==observedSha(s,end)||Date.parse(l.snapshot.as_of)<Date.parse(before.checked_at_utc)||Date.parse(l.snapshot.as_of)>Date.parse(after.checked_at_utc))controlFail('registry_mismatch')})
  leaseCheck(l,'finalizing')
  if(l.client&&!l.released){if(l.clientError)l.client.off('error',l.clientError);l.client.release();l.released=true}if(l.queryPending||l.transaction)controlFail('reader_cleanup_unknown');l.clean=true
  const finished=empty<FinishedRead>();l.phase='finished';l.finished=finished;finishedStates.set(finished,l);return finished
 }catch(error){revoke(l);await cleanupLease(l);throw error instanceof WorkerHeartbeatControlError?error:new WorkerHeartbeatControlError('control_io_failed')}
}
export function consumeWorkerHeartbeatControlRead(control:Control,p:ReaderPeer,finished:FinishedRead):WorkerHeartbeatSnapshot{
 const s=state(control),owner=peer(s,p,'reader'),l=finishedStates.get(finished);if(!l||l.s!==s||l.peer!==owner||!l.snapshot||!l.clean)controlFail('untrusted_reference')
 leaseCheck(l,'finished');const snapshot=l.snapshot;l.snapshot=undefined;l.phase='consumed';clearTimeout(l.timer);s.leases.delete(l);owner.leases.delete(l);finishedStates.delete(finished);leaseStates.delete(l.handle);return snapshot
}
export async function cancelWorkerHeartbeatControlRead(control:Control,p:ReaderPeer,handle:ReadLease):Promise<void>{const s=state(control),owner=peer(s,p,'reader'),l=leaseStates.get(handle);if(!l||l.s!==s||l.peer!==owner)controlFail('untrusted_reference');revoke(l);await cleanupLease(l)}
function actionFile(id:string,suffix:string){if(!controlUuid(id)||!['draft','approval','material','prepared','resume'].includes(suffix))controlFail('invalid_command');return (suffix==='draft'||suffix==='approval'||suffix==='resume'?controlPaths.config+'/'+suffix+'s':controlPaths.store+'/plans')+'/'+id+'.json'}
function expiry(v:unknown):number{if(typeof v!=='string'||! /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(v))controlFail('approval_invalid');const stamp=Date.parse(v);if(!Number.isFinite(stamp)||stamp<=Date.now()||stamp-Date.now()>600000)controlFail('approval_expired');return performance.now()+Math.min(stamp-Date.now(),60000)}
export async function prepareWorkerHeartbeatMutation(control:Control,p:OperatorPeer,id:string):Promise<PlanSummary>{
 const s=state(control);peer(s,p,'operator');runtimeCheck(s);if(!controlUuid(id))controlFail('invalid_command');if(s.mutation||!['closed','serving'].includes(s.phase)||s.actions.has(id)||s.journal.some(r=>r.action_id===id))controlFail('control_busy')
 const expected=s.epoch
 const draft=controlObject(signed(actionFile(id,'draft'),s.publicKey),['protocol','action_id','expected_epoch','before_sha256','desired_policy','expires_at']);if(draft.protocol!=='worker_heartbeat_control_draft_v1'||draft.action_id!==id||draft.expected_epoch!==s.epoch.toString()||!controlHex(draft.before_sha256))controlFail('approval_invalid');expiry(draft.expires_at)
 const before=await serial(s,()=>inspectRegistry(s));if(s.epoch!==expected||s.mutation||!['closed','serving'].includes(s.phase)||observedSha(s,before)!==draft.before_sha256)controlFail('plan_stale')
 const plan=s.registry.prepareWorkerHeartbeatRegistryPlan(before,draft.desired_policy),description=s.registry.describeWorkerHeartbeatRegistryPlan(plan)
 if(!controlHex(description.plan_sha256)||description.before_sha256!==observedSha(s,before)||!controlHex(description.after_sha256))controlFail('registry_mismatch')
 const summary=Object.freeze({action_id:id,plan_sha256:description.plan_sha256,before_sha256:description.before_sha256,after_sha256:description.after_sha256,expected_epoch:s.epoch.toString(),requires_explicit_approval:true as const,authorizes_database_writes:false as const})
 privateWrite(actionFile(id,'prepared'),JSON.stringify({summary,before_policy:s.policy})+'\n');append(s,'plan_prepared',id,{plan_sha256:summary.plan_sha256,before_sha256:summary.before_sha256,after_sha256:summary.after_sha256});s.actions.set(id,{id,plan,summary,policy:draft.desired_policy,ack:false});return summary
}
export async function authorizeWorkerHeartbeatMutation(control:Control,p:OperatorPeer,id:string):Promise<MutationPermit>{
 const s=state(control),owner=peer(s,p,'operator');runtimeCheck(s);if(!controlUuid(id))controlFail('invalid_command');const action=s.actions.get(id);if(!action||action.summary.expected_epoch!==s.epoch.toString()||s.mutation||!['closed','serving'].includes(s.phase))controlFail('plan_stale')
 const expected=s.epoch
 const file=actionFile(id,'approval'),raw=privateRead(file),x=controlObject(signedBytes(raw,s.publicKey),['protocol','action_id','plan_sha256','source_sha256','binding_sha256','expected_epoch','actor','not_before','expires_at','scope'])
 if(x.protocol!=='worker_heartbeat_control_approval_v1'||x.action_id!==id||x.plan_sha256!==action.summary.plan_sha256||x.source_sha256!==s.profile.source_sha256||x.binding_sha256!==controlSha(JSON.stringify(s.binding))||x.expected_epoch!==s.epoch.toString()||typeof x.actor!=='string'||! /^[A-Za-z0-9_.@-]{1,128}$/.test(x.actor)||typeof x.not_before!=='string'||!Number.isFinite(Date.parse(x.not_before))||Date.parse(x.not_before)>Date.now()||x.scope!=='MUTATE_TELEMETRY_REGISTRY_ONLY')controlFail('approval_invalid')
 const expires=expiry(x.expires_at),before=await serial(s,()=>inspectRegistry(s));if(s.epoch!==expected||s.mutation||!['closed','serving'].includes(s.phase)||observedSha(s,before)!==action.summary.before_sha256||performance.now()>=expires)controlFail('plan_stale')
 action.approvalSha=controlSha(raw);const token=empty<MutationPermit>();mutationStates.set(token,{s,peer:owner,action,expected:s.epoch,expires,consumed:false});append(s,'authorized',id,{approval_sha256:action.approvalSha,plan_sha256:action.summary.plan_sha256});return token
}
async function lockRegistry(s:State){
 for(let i=0;i<workerHeartbeatKinds.length;i++){const kind=workerHeartbeatKinds[i]!,rows=(await s.raw.query('SELECT ordinal::integer,kind FROM studio_telemetry.kind_config WHERE ordinal=$1 AND kind=$2 FOR UPDATE',[i+1,kind])).rows;if(rows.length!==1||rows[0].ordinal!==i+1||rows[0].kind!==kind)controlFail('registry_mismatch')}
 for(let i=0;i<workerHeartbeatKinds.length;i++)for(const slot of [1,2]){const kind=workerHeartbeatKinds[i]!,name='studio_telemetry_tx_'+kind+'_'+slot,rows=(await s.raw.query('SELECT kind,slot_no::integer,login_oid::text,login_name FROM studio_telemetry.slot_state WHERE kind=$1 AND slot_no=$2 FOR UPDATE',[kind,slot])).rows;if(rows.length!==1||rows[0].kind!==kind||rows[0].slot_no!==slot||rows[0].login_name!==name||rows[0].login_oid!==String(s.binding.roles.find(r=>r.name===name)?.oid))controlFail('registry_mismatch')}
}
function policyParts(s:State,p:unknown){
 const x=controlObject(p,['protocol','binding','reader','kinds','slots']),b=controlObject(x.binding,['installation_id','system_id','database_oid','owner_oid','schema_oid','server_addr','server_port','postmaster_started_us','operator_name','role_oids'])
 if(x.protocol!=='worker_heartbeat_activation_policy_v1'||!controlUuid(b.installation_id)||b.system_id!==s.binding.system_id||b.database_oid!==s.binding.database_oid||b.owner_oid!==s.binding.owner_oid||b.schema_oid!==s.binding.schema_oid||b.server_addr!==s.binding.server_addr||b.server_port!==s.binding.server_port||b.postmaster_started_us!==s.binding.postmaster_started_us||b.operator_name!==s.binding.operator_login||JSON.stringify(b.role_oids)!==JSON.stringify(s.binding.roles.map(r=>r.oid))||!Array.isArray(x.slots)||x.slots.length!==16)controlFail('binding_changed')
 const reader=controlObject(x.reader,['login','verifier_sha256']);if(typeof reader.login!=='boolean'||(reader.login?!controlHex(reader.verifier_sha256):reader.verifier_sha256!==null))controlFail('registry_mismatch')
 const slots=x.slots.map((v,i)=>{const slot=controlObject(v,['kind','slot_no','mode','generation','verifier_sha256']);if(slot.kind!==workerHeartbeatKinds[Math.floor(i/2)]||slot.slot_no!==i%2+1||!['unused','active','retired'].includes(slot.mode as string)||(slot.mode==='unused'?slot.generation!==null:!controlUuid(slot.generation))||(slot.mode==='active'?!controlHex(slot.verifier_sha256):slot.verifier_sha256!==null))controlFail('registry_mismatch');return slot})
 return {reader,slots,binding:b}
}
function sameData(a:unknown,b:unknown):boolean{const canonical=(v:unknown):unknown=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,x])=>[k,canonical(x)])):v;return JSON.stringify(canonical(a))===JSON.stringify(canonical(b))}
function material(s:State,value:unknown,summary:PlanSummary):WorkerHeartbeatRegistryPrivateMaterial{
 const x=controlObject(value,['plan_sha256','before_sha256','after_sha256','before_policy','after_policy','credentials'])
 if(x.plan_sha256!==summary.plan_sha256||x.before_sha256!==summary.before_sha256||x.after_sha256!==summary.after_sha256||!sameData(x.before_policy,s.policy)||!Array.isArray(x.credentials)||x.credentials.length>17)controlFail('registry_mismatch')
 const before=policyParts(s,x.before_policy),after=policyParts(s,x.after_policy);if(JSON.stringify(before.binding)!==JSON.stringify(after.binding))controlFail('binding_changed')
 const credentials=x.credentials.map(raw=>{const c=controlObject(raw,['role_oid','role_name','password','generation']);if(typeof c.password!=='string'||! /^[a-f0-9]{64}$/.test(c.password))controlFail('registry_mismatch');return c}),roles:WorkerHeartbeatRegistryPrivateMaterial['roles'][number][]=[]
 for(let i=1;i<18;i++){
  const a=i===1?before.reader:before.slots[i-2]!,b=i===1?after.reader:after.slots[i-2]!;if(JSON.stringify(a)===JSON.stringify(b))continue
  const active=i===1?b.login===true:b.mode==='active',generation=i===1?null:b.generation as string|null,c=credentials.filter(v=>v.role_oid===s.binding.roles[i]!.oid&&v.role_name===roleNames[i])
  if(c.length!==(active?1:0)||active&&c[0]!.generation!==generation)controlFail('registry_mismatch')
  if(i>1&&active&&generation!==a.generation){const policies=[s.profile.policy,...s.journal.flatMap(r=>r.data&&typeof r.data==='object'?Object.values(r.data):[])];for(const p of policies){if(p&&typeof p==='object'&&Array.isArray((p as {slots?:unknown}).slots)&&((p as {slots:{generation?:unknown}[]}).slots).some(v=>v.generation===generation))controlFail('registry_mismatch')}}
  roles.push({name:roleNames[i]!,oid:s.binding.roles[i]!.oid,password:active?c[0]!.password as string:null,verifier_sha256:b.verifier_sha256 as string|null,generation})
 }
 if(roles.filter(r=>r.password!==null).length!==credentials.length)controlFail('registry_mismatch')
 return controlFreeze({protocol:'worker_heartbeat_registry_private_material_v1',plan_sha256:summary.plan_sha256,before_sha256:summary.before_sha256,after_sha256:summary.after_sha256,before_policy:x.before_policy,after_policy:x.after_policy,roles})
}
function passwordsMatch(m:Pick<WorkerHeartbeatRegistryPrivateMaterial,'roles'>,rows:{oid:string;name:string;verifier:string|null}[]){
 if(rows.length!==m.roles.length)return false
 return m.roles.every(r=>{const v=rows.find(v=>v.name===r.name&&v.oid===String(r.oid));if(!v)return false;if(r.password===null)return v.verifier===null&&r.verifier_sha256===null
  if(typeof v.verifier!=='string'||controlSha(v.verifier)!==r.verifier_sha256)return false
  const match=v.verifier.match(/^SCRAM-SHA-256\$4096:([A-Za-z0-9+/]{22}==)\$([A-Za-z0-9+/]{43}=):([A-Za-z0-9+/]{43}=)$/);if(!match)return false
  const salted=pbkdf2Sync(r.password,Buffer.from(match[1]!,'base64'),4096,32,'sha256'),client=createHmac('sha256',salted).update('Client Key').digest(),stored=createHash('sha256').update(client).digest(),server=createHmac('sha256',salted).update('Server Key').digest();salted.fill(0);client.fill(0)
  return timingSafeEqual(stored,Buffer.from(match[2]!,'base64'))&&timingSafeEqual(server,Buffer.from(match[3]!,'base64'))
 })
}
async function verifierRows(raw:Client,names:string[]){return (await raw.query('SELECT oid::text AS oid,rolname::text AS name,rolpassword AS verifier FROM pg_authid WHERE rolname=ANY($1::text[]) ORDER BY rolname',[names])).rows as {oid:string;name:string;verifier:string|null}[]}
function materialPath(id:string){if(!controlUuid(id))controlFail('invalid_command');return controlPaths.store+'/plans/'+id+'.material.json'}
async function cleanReaders(s:State){for(const l of s.leases)revoke(l);await Promise.all([...s.leases].map(cleanupLease));await s.sqlTail;if(s.leases.size)controlFail('reader_cleanup_unknown')}
async function retireConnections(s:State,m:WorkerHeartbeatRegistryPrivateMaterial){
 const names=m.roles.map(r=>r.name);if(!names.length)return
 const rows=(await s.raw.query('SELECT a.pid,a.backend_start::text AS started,r.oid::text AS role_oid FROM pg_stat_activity a JOIN pg_roles r ON r.rolname=a.usename WHERE a.datid=$1::oid AND a.usename=ANY($2::text[]) AND a.pid<>pg_backend_pid()',[s.binding.database_oid,names])).rows
 for(const row of rows){if(!m.roles.some(r=>String(r.oid)===row.role_oid))controlFail('binding_changed');const result=await s.raw.query('SELECT pg_terminate_backend(a.pid) AS stopped FROM pg_stat_activity a JOIN pg_roles r ON r.rolname=a.usename WHERE a.pid=$1 AND a.backend_start=$2::timestamptz AND a.datid=$3::oid AND r.oid=$4::oid',[row.pid,row.started,s.binding.database_oid,row.role_oid]);if(result.rows.length>1||result.rows.length===1&&result.rows[0].stopped!==true)controlFail('reader_cleanup_unknown');await waitBackendGone(s,{pid:row.pid,started:row.started})}
}
async function replaceReaderPool(s:State,m:WorkerHeartbeatRegistryPrivateMaterial){
 const reader=m.roles.find(r=>r.name==='studio_telemetry_reader');if(!reader||s.readerPassword===(reader.password??''))return
 await s.reader.end();s.readerPassword=reader.password??'';s.reader=new s.driver.Pool({...connection(s),user:'studio_telemetry_reader',password:s.readerPassword,max:2,connectionTimeoutMillis:2000,statement_timeout:3000,query_timeout:4000});s.reader.on('error',()=>{})
}
function publishFile(file:string,bytes:string){if(fs.existsSync(file)){if(!privateRead(file).equals(Buffer.from(bytes)))controlFail('store_invalid')}else privateWrite(file,bytes)}
async function publish(s:State,id:string,m:WorkerHeartbeatRegistryPrivateMaterial,materialSha:string){
 append(s,'publication_pending',id,{material_sha256:materialSha,policy:m.after_policy})
 await replaceReaderPool(s,m)
 for(const role of m.roles){const file=controlPaths.store+'/credentials/'+role.name+'.'+s.epoch.toString()+'.json';publishFile(file,JSON.stringify({protocol:'worker_heartbeat_control_credential_v1',action_id:id,epoch:s.epoch.toString(),role:role.name,oid:role.oid,password:role.password,generation:role.generation,policy_sha256:s.policySha})+'\n')}
 s.policy=m.after_policy;const observed=await inspectRegistry(s);if(observedSha(s,observed)!==s.policySha)controlFail('registry_mismatch');s.published=s.epoch;append(s,'published',id,{policy:s.policy,policy_sha256:s.policySha,material_sha256:materialSha});s.phase=s.registry.describeWorkerHeartbeatRegistry(observed).catalog_expectations?'serving':'closed'
}
export async function applyWorkerHeartbeatMutation(control:Control,p:OperatorPeer,token:MutationPermit):Promise<MutationOutcome>{
 const s=state(control),owner=peer(s,p,'operator'),permit=mutationStates.get(token)
 if(!permit||permit.s!==s||permit.peer!==owner||permit.consumed)controlFail('untrusted_reference');runtimeCheck(s);if(s.mutation||permit.expected!==s.epoch||performance.now()>=permit.expires)controlFail('permit_stale')
 if(s.epoch===18446744073709551615n)controlFail('store_invalid');permit.consumed=true;s.mutation=true;s.phase='closing_reads';s.epoch++;const action=permit.action;action.epoch=s.epoch
 let transaction=false,commitSent=false,accessToken:ControlDbAccess|undefined
 try{
  append(s,'closing',action.id,{plan_sha256:action.summary.plan_sha256});s.phase='waiting_readers';await cleanReaders(s);append(s,'readers_clean',action.id,{})
  return await serial(s,async()=>{
   if(performance.now()>=permit.expires)controlFail('approval_expired');await target(s.raw,s.binding);s.phase='applying';await s.raw.query('BEGIN ISOLATION LEVEL READ COMMITTED');transaction=true;await s.raw.query("SET LOCAL search_path=pg_catalog; SET LOCAL lock_timeout='1000ms'; SET LOCAL statement_timeout='10000ms'");await lockRegistry(s);const lockedBefore=await observePolicy(s,s.policy);if(lockedBefore.sha!==action.summary.before_sha256)controlFail('plan_stale')
   append(s,'before_change',action.id,{plan_sha256:action.summary.plan_sha256,before_sha256:action.summary.before_sha256,after_sha256:action.summary.after_sha256,before_policy:s.policy});accessToken=access(s,s.raw,s.db,'write');const grant=dbAccesses.get(accessToken)!;grant.allLocked=true;grant.beforeChange=true;grant.expires=permit.expires;grant.epoch=s.epoch
   if(performance.now()>=permit.expires)controlFail('plan_stale')
   const rawMaterial=s.registry.readWorkerHeartbeatRegistryPlanMaterial(s.db,accessToken,action.plan),m=material(s,rawMaterial,action.summary),names=m.roles.map(r=>r.name),beforePasswords=await verifierRows(s.raw,names),bytes=JSON.stringify({material:m,before_passwords:beforePasswords})+'\n',materialSha=controlSha(bytes)
   privateWrite(materialPath(action.id),bytes);action.privateMaterial=m;append(s,'material_staged',action.id,{material_sha256:materialSha,policy:m.after_policy});await s.registry.applyLockedWorkerHeartbeatRegistryPlan(s.db,accessToken,action.plan)
   if(performance.now()>=permit.expires)controlFail('approval_expired');append(s,'commit_pending',action.id,{material_sha256:materialSha});if(performance.now()>=permit.expires)controlFail('approval_expired');s.phase='commit_pending';commitSent=true;const result=await s.raw.query('COMMIT');transaction=false;if(result.command!=='COMMIT')controlFail('commit_unknown');action.ack=true;append(s,'commit_acknowledged',action.id,{material_sha256:materialSha});invalidateAccess(s,accessToken);accessToken=undefined;s.phase='postcheck'
   const after=await observer(s,async raw=>{const db=facade(raw),read=access(s,raw,db,'read');try{await managementCatalog(s,db,m.after_policy);return await s.registry.verifyWorkerHeartbeatRegistryAfter(db,read,action.plan)}finally{invalidateAccess(s,read)}});if(observedSha(s,after)!==action.summary.after_sha256)controlFail('registry_mismatch');s.policySha=observedSha(s,after)
   if(!passwordsMatch(m,await verifierRows(s.raw,names)))controlFail('registry_mismatch')
   append(s,'after_verified',action.id,{policy_sha256:s.policySha});await retireConnections(s,m);append(s,'old_connections_retired',action.id,{});s.phase='publishing';await publish(s,action.id,m,materialSha)
   return Object.freeze({action_id:action.id,epoch:s.epoch.toString(),commit_acknowledged:true as const,after_verified:true as const,publication_completed:true as const,automatic_retry_authorized:false as const})
  })
 }catch(error){
  if(accessToken)invalidateAccess(s,accessToken)
  if(commitSent&&!action.ack){try{append(s,'commit_unknown',action.id,{})}catch{}s.healthy=false;void s.raw.end().catch(()=>{});fault(s,'commit_unknown');controlFail('commit_unknown')}
  if(transaction)try{await s.raw.query('ROLLBACK');append(s,'rollback_known',action.id,{})}catch{try{append(s,'rollback_unknown',action.id,{})}catch{}fault(s,'rollback_unknown');controlFail('rollback_unknown')}
  fault(s,action.ack?'committed_unpublished':'registry_mismatch');throw new WorkerHeartbeatControlError(action.ack?'committed_unpublished':error instanceof WorkerHeartbeatControlError?error.code:'control_io_failed')
 }finally{s.mutation=false;s.actions.delete(action.id)}
}
function readStaged(s:State,id:string){
 const bytes=privateRead(materialPath(id)),sha=controlSha(bytes),record=s.journal.find(r=>r.action_id===id&&r.phase==='material_staged'),head=record?.data as {material_sha256?:unknown}|undefined
 if(!head||head.material_sha256!==sha)controlFail('store_invalid')
 const data=controlObject(parseWorkerHeartbeatControlJson(bytes,2097152),['material','before_passwords']),m=controlObject(data.material,['protocol','plan_sha256','before_sha256','after_sha256','before_policy','after_policy','roles'])
 if(m.protocol!=='worker_heartbeat_registry_private_material_v1'||!controlHex(m.plan_sha256)||!controlHex(m.before_sha256)||!controlHex(m.after_sha256)||!Array.isArray(m.roles)||m.roles.length>17||!Array.isArray(data.before_passwords)||data.before_passwords.length!==m.roles.length)controlFail('store_invalid')
 policyParts(s,m.before_policy);policyParts(s,m.after_policy)
 const roles=m.roles.map(raw=>{const r=controlObject(raw,['name','oid','password','verifier_sha256','generation']);if(typeof r.name!=='string'||!roleNames.slice(1).includes(r.name)||s.binding.roles.find(v=>v.name===r.name)?.oid!==r.oid||r.password!==null&&(typeof r.password!=='string'||! /^[a-f0-9]{64}$/.test(r.password))||(r.password===null?r.verifier_sha256!==null:!controlHex(r.verifier_sha256))||r.generation!==null&&!controlUuid(r.generation))controlFail('store_invalid');return r})
 if(new Set(roles.map(r=>r.name)).size!==roles.length)controlFail('store_invalid')
 const before=data.before_passwords.map(raw=>{const r=controlObject(raw,['oid','name','verifier']);if(!roles.some(v=>String(v.oid)===r.oid&&v.name===r.name)||r.verifier!==null&&typeof r.verifier!=='string')controlFail('store_invalid');return r as {oid:string;name:string;verifier:string|null}})
 if(new Set(before.map(r=>r.oid)).size!==before.length)controlFail('store_invalid')
 return {material:data.material as WorkerHeartbeatRegistryPrivateMaterial,sha,before}
}
async function observePolicy(s:State,p:unknown){return observer(s,async raw=>{const db=facade(raw),token=access(s,raw,db,'read');try{await managementCatalog(s,db,p);const observation=await s.registry.inspectWorkerHeartbeatActivationRegistry(db,token,p);return {sha:observedSha(s,observation),observation}}finally{invalidateAccess(s,token)}})}
function oldBackend(s:State,id:string):Backend{
 const index=s.journal.findIndex(r=>r.action_id===id&&r.phase==='before_change'),start=s.journal[index];if(!start)controlFail('recovery_conflict')
 const boot=s.journal.slice(0,index+1).reverse().find(r=>r.phase==='boot'&&r.instance_id===start.instance_id),data=boot?.data as {control_backend?:unknown}|undefined,b=controlObject(data?.control_backend,['pid','started']);if(typeof b.pid!=='number'||!Number.isInteger(b.pid)||b.pid<1||typeof b.started!=='string')controlFail('store_invalid');return {pid:b.pid,started:b.started}
}
export async function recoverWorkerHeartbeatMutation(control:Control,p:OperatorPeer,id:string):Promise<RecoveryObservation>{
 const s=state(control);peer(s,p,'operator');host();s.runtime.assertWorkerHeartbeatActivationControlRuntime(s.runtimeCap)
 if(!controlUuid(id)||s.mutation||s.phase!=='recovery_required')controlFail('recovery_in_progress')
 const entries=s.journal.filter(r=>r.action_id===id),start=entries.find(r=>r.phase==='before_change');if(!start||entries.some(r=>['published','abandoned'].includes(r.phase)))controlFail('recovery_conflict')
 s.mutation=true
 try{
  await cleanReaders(s)
  const ack=entries.some(r=>r.phase==='commit_acknowledged'),rolledBack=entries.some(r=>r.phase==='rollback_known'),old=oldBackend(s,id)
  let observed:RecoveryReport['observed']='unobservable',sha:string|null=null,staged:ReturnType<typeof readStaged>|undefined
  try{
   if(!ack&&!rolledBack&&!await backendGone(s,old))observed='old_backend_live'
   else{
    if(entries.some(r=>r.phase==='material_staged'))staged=readStaged(s,id)
    const prior=(start.data as {before_policy?:unknown}).before_policy
    if(staged){
     try{const after=await observePolicy(s,staged.material.after_policy),rows=await observer(s,raw=>verifierRows(raw,staged!.material.roles.map(r=>r.name)));if(after.sha===staged.material.after_sha256&&passwordsMatch(staged.material,rows)){observed='after_matches';sha=after.sha}}catch{}
    }
    if(observed!=='after_matches'){
     try{const before=await observePolicy(s,prior),rows=staged?await observer(s,raw=>verifierRows(raw,staged!.material.roles.map(r=>r.name))):[],equal=!staged||rows.length===staged.before.length&&rows.every(r=>staged!.before.some(v=>v.name===r.name&&v.oid===r.oid&&v.verifier===r.verifier));if(equal){observed='before_matches';sha=before.sha}else observed='mixed_or_unsafe'}catch{observed='mixed_or_unsafe'}
    }
   }
  }catch{observed='unobservable'}
  append(s,'recovery_observed',id,{observed,observed_policy_sha256:sha,original_commit_acknowledged:ack})
  const report:RecoveryReport=Object.freeze({action_id:id,observed,observed_policy_sha256:sha,journal_head_sha256:s.journalHead,original_commit_acknowledged:ack,automatic_retry_authorized:false,read_gate_opened:false}),value:Recovered={s,action:id,epoch:s.epoch,report,used:false,...staged?{material:staged.material,materialSha:staged.sha,beforePasswords:staged.before}:{}}
  const token=empty<RecoveryObservation>();recoveryStates.set(token,value);s.recoveries.set(id,value);return token
 }finally{s.mutation=false}
}
export function describeWorkerHeartbeatRecovery(token:RecoveryObservation):RecoveryReport{const r=recoveryStates.get(token);if(!r)controlFail('untrusted_reference');return r.report}
async function reacquire(s:State,id:string){
 if(s.healthy){await target(s.raw,s.binding);return}
 if(!await backendGone(s,oldBackend(s,id)))controlFail('recovery_conflict')
 const raw=new s.driver.Client(connection(s));raw.on('error',()=>{});let adopted=false
 try{await raw.connect();const backend=await target(raw,s.binding);if((await raw.query('SELECT pg_try_advisory_lock($1::integer,$2::integer) AS held',singleton)).rows[0]?.held!==true)controlFail('singleton_busy');s.raw=raw;s.db=facade(raw);s.controlBackend=backend;s.healthy=true;adopted=true;raw.on('error',()=>{if(s.raw===raw){s.healthy=false;fault(s,'control_io_failed')}});raw.on('end',()=>{if(s.raw===raw){s.healthy=false;fault(s,'control_io_failed')}});append(s,'boot',null,{source_sha256:s.profile.source_sha256,control_backend:backend})}finally{if(!adopted)await raw.end().catch(()=>{})}
}
/** New signed approval, new epoch, fresh read-only verification. Never retries SQL. */
export async function resumeWorkerHeartbeatPublication(control:Control,p:OperatorPeer,id:string,recoveredId:string):Promise<ControlStatus>{
 const s=state(control);peer(s,p,'operator');host();s.runtime.assertWorkerHeartbeatActivationControlRuntime(s.runtimeCap)
 const recovered=s.recoveries.get(recoveredId);if(!controlUuid(id)||id===recoveredId||s.journal.some(r=>r.action_id===id)||!recovered||recovered.used||recovered.epoch!==s.epoch||s.mutation||s.phase!=='recovery_required'||recovered.report.journal_head_sha256!==s.journalHead||!['after_matches','before_matches'].includes(recovered.report.observed))controlFail('recovery_conflict')
 const x=controlObject(signed(actionFile(id,'resume'),s.publicKey),['protocol','action_id','recovered_action_id','expected_epoch','journal_head_sha256','source_sha256','binding_sha256','observed','actor','not_before','expires_at','scope'])
 if(x.protocol!=='worker_heartbeat_control_resume_v1'||x.action_id!==id||x.recovered_action_id!==recoveredId||x.expected_epoch!==s.epoch.toString()||x.journal_head_sha256!==s.journalHead||x.source_sha256!==s.profile.source_sha256||x.binding_sha256!==controlSha(JSON.stringify(s.binding))||x.observed!==recovered.report.observed||typeof x.actor!=='string'||! /^[A-Za-z0-9_.@-]{1,128}$/.test(x.actor)||typeof x.not_before!=='string'||!Number.isFinite(Date.parse(x.not_before))||Date.parse(x.not_before)>Date.now()||x.scope!=='RESUME_VERIFIED_PUBLICATION_ONLY')controlFail('approval_invalid')
 const expires=expiry(x.expires_at);if(s.epoch===18446744073709551615n)controlFail('store_invalid');recovered.used=true;s.mutation=true;s.phase='waiting_readers';s.epoch++
 try{
  await cleanReaders(s);await reacquire(s,recoveredId)
  return await serial(s,async()=>{
   if(performance.now()>=expires)controlFail('approval_expired')
   const after=recovered.report.observed==='after_matches',material=recovered.material,start=s.journal.find(r=>r.action_id===recoveredId&&r.phase==='before_change')!,policy=after?material?.after_policy:(start.data as {before_policy:unknown}).before_policy
   if(!policy)controlFail('recovery_conflict');const current=await observePolicy(s,policy);if(current.sha!==recovered.report.observed_policy_sha256)controlFail('recovery_conflict')
   if(material){const rows=await verifierRows(s.raw,material.roles.map(r=>r.name));if(after?!passwordsMatch(material,rows):rows.length!==recovered.beforePasswords?.length||rows.some(r=>!recovered.beforePasswords!.some(v=>v.oid===r.oid&&v.name===r.name&&v.verifier===r.verifier)))controlFail('recovery_conflict')}
   if(performance.now()>=expires)controlFail('approval_expired');s.policySha=current.sha;s.phase='publishing'
   if(after){if(!material||!recovered.materialSha)controlFail('recovery_conflict');await retireConnections(s,material);await publish(s,recoveredId,material,recovered.materialSha)}
   else{s.policy=policy;s.published=s.epoch;append(s,'abandoned',recoveredId,{resume_action_id:id,before_sha256:current.sha});append(s,'published',null,{policy,policy_sha256:current.sha,resume_action_id:id});s.phase=s.registry.describeWorkerHeartbeatRegistry(current.observation).catalog_expectations?'serving':'closed'}
   append(s,'abandoned',id,{resumed_action_id:recoveredId});return inspectWorkerHeartbeatActivationControl(control)
  })
 }catch(error){fault(s,'recovery_conflict');throw error instanceof WorkerHeartbeatControlError?error:new WorkerHeartbeatControlError('recovery_conflict')}finally{s.mutation=false}
}
function frame(value:unknown){const bytes=Buffer.from(JSON.stringify(value));if(bytes.length<1||bytes.length>controlLimits.frameBytes)controlFail('invalid_command');const head=Buffer.alloc(4);head.writeUInt32BE(bytes.length);return Buffer.concat([head,bytes])}
async function operatorCommand(s:State,handle:OperatorPeer,raw:unknown){
 const command=parseWorkerHeartbeatControlCommand(raw)
 switch(command.op){
  case 'inspect':return inspectWorkerHeartbeatActivationControl(s.handle)
  case 'prepare':return prepareWorkerHeartbeatMutation(s.handle,handle,command.action_id)
  case 'apply':return applyWorkerHeartbeatMutation(s.handle,handle,await authorizeWorkerHeartbeatMutation(s.handle,handle,command.action_id))
  case 'recover':return describeWorkerHeartbeatRecovery(await recoverWorkerHeartbeatMutation(s.handle,handle,command.action_id))
  case 'resume_publication':return resumeWorkerHeartbeatPublication(s.handle,handle,command.action_id,command.recovered_action_id)
  case 'stop':s.phase='stopping';return inspectWorkerHeartbeatActivationControl(s.handle)
 }
}
function accept(s:State,socket:net.Socket,kind:'operator'|'reader'){
 // Kernel-enforced fixed pathname permissions are the peer boundary: operator
 // root-only 0600, reader root/native-group 0660 below root-owned 0750 directory.
 // Handles are minted only for actual sockets accepted by these own servers.
 if(s.phase==='stopping'||s.phase==='stopped'||[...s.peers].filter(p=>p.kind===kind).length>=(kind==='reader'?2:2)){socket.destroy();return}
 const handle=empty<ReaderPeer|OperatorPeer>(),owner:Peer={s,socket,kind,open:true,request:null,leases:new Set()};peerStates.set(handle,owner);s.peers.add(owner)
 let buffer=Buffer.alloc(0),busy=false,requests=0,stopRequested=false
 const timer=setTimeout(()=>socket.destroy(),kind==='reader'?controlLimits.nativeBudgetMs:controlLimits.operationMs)
 const disconnect=()=>{if(!owner.open)return;owner.open=false;clearTimeout(timer);s.peers.delete(owner);for(const l of owner.leases)revoke(l)}
 socket.on('error',()=>{});socket.once('close',disconnect)
 const reply=(request:string,ok:boolean,value:unknown)=>{if(owner.open)socket.write(frame({protocol:'worker_heartbeat_control_v1',request_id:request,ok,value}))}
 socket.on('data',(bytes:Buffer)=>{
  if(busy){socket.destroy();return}buffer=Buffer.concat([buffer,bytes]);if(buffer.length>controlLimits.frameBytes+4){socket.destroy();return}if(buffer.length<4)return
  const size=buffer.readUInt32BE(0);if(size<1||size>controlLimits.frameBytes){socket.destroy();return}if(buffer.length<size+4)return;if(buffer.length!==size+4||++requests>(kind==='reader'?3:1)){socket.destroy();return}
  const payload=buffer.subarray(4);buffer=Buffer.alloc(0);busy=true
  void (async()=>{
   let request:string|undefined
   try{
    const raw=parseWorkerHeartbeatControlJson(payload)
    if(kind==='operator'){
     const x=controlObject(raw,['protocol','request_id','command']);if(x.protocol!=='worker_heartbeat_control_operator_v1'||!controlUuid(x.request_id))controlFail('invalid_command');request=x.request_id
     const command=parseWorkerHeartbeatControlCommand(x.command);stopRequested=command.op==='stop';reply(request,true,await operatorCommand(s,handle as OperatorPeer,command));return
    }
    const x=parseWorkerHeartbeatReadRequest(raw);request=x.request_id;owner.request=request
    if(x.op==='prepare_read'){
     const token=await prepareWorkerHeartbeatControlRead(s.handle,handle as ReaderPeer),l=leaseStates.get(token)!;leaseCheck(l,'pending');reply(request,true,{pending_id:l.id,instance_id:s.instance,epoch:l.epoch.toString(),remaining_ms:Math.max(1,Math.floor(l.deadline-performance.now()))})
    }else{
     const lease=[...owner.leases].find(l=>l.id===x.pending_id&&s.instance===x.instance_id&&l.epoch.toString()===x.epoch);if(!lease)controlFail('untrusted_reference')
     if(x.op==='cancel_read'){await cancelWorkerHeartbeatControlRead(s.handle,handle as ReaderPeer,lease.handle);reply(request,true,{cancelled:true})}
     else{
      const token=await finalizeWorkerHeartbeatControlRead(s.handle,handle as ReaderPeer,lease.handle)
      // No await between final epoch/lease/source check, one-use consumption and
      // publication to this original accepted peer. Mutation cannot interleave.
      if(!owner.open||!socket.writable)controlFail('lease_revoked')
      const result=consumeWorkerHeartbeatControlRead(s.handle,handle as ReaderPeer,token);reply(request,true,result)
     }
    }
   }catch(error){if(request&&owner.open)reply(request,false,{code:error instanceof WorkerHeartbeatControlError?error.code:'control_io_failed'});for(const l of owner.leases)revoke(l)}
   finally{busy=false;if(kind==='operator')socket.end(()=>{if(stopRequested)void closeWorkerHeartbeatActivationControl(s.handle).catch(()=>{})})}
  })().catch(()=>socket.destroy())
 })
}
export async function serveWorkerHeartbeatActivationControl(control:Control):Promise<void>{
 const s=state(control);runtimeCheck(s);if(s.servers.size)controlFail('control_busy');directory(controlPaths.sockets,0o750);const dir=fs.lstatSync(controlPaths.sockets);if(dir.gid!==s.profile.native_gid)controlFail('binding_changed')
 try{for(const kind of ['operator','reader'] as const){const file=kind==='operator'?controlPaths.ops:controlPaths.reader;if(fs.existsSync(file))controlFail('store_invalid');const server=net.createServer(socket=>accept(s,socket,kind));s.servers.add(server);server.on('error',()=>{fault(s,'control_io_failed')});const old=process.umask(0o077)
   try{await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(file,()=>{server.off('error',reject);resolve()})})}finally{process.umask(old)}
   fs.chownSync(file,0,kind==='reader'?s.profile.native_gid:0);fs.chmodSync(file,kind==='reader'?0o660:0o600);const st=fs.lstatSync(file);if(!st.isSocket()||st.uid!==0||st.gid!==(kind==='reader'?s.profile.native_gid:0)||(st.mode&0o7777)!==(kind==='reader'?0o660:0o600))controlFail('binding_changed');syncDir(controlPaths.sockets)
  }}catch(error){await closeWorkerHeartbeatActivationControl(control);throw error}
}
export async function closeWorkerHeartbeatActivationControl(control:Control):Promise<void>{
 const s=state(control);if(s.phase==='stopped')return
 const existing=closures.get(control);if(existing)return existing
 const closing=(async()=>{s.phase='stopping';for(const a of s.accesses)a.active=false
  const servers=[...s.servers].map(server=>new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve())))
  for(const p of s.peers)p.socket.destroy()
  try{await cleanReaders(s);await s.sqlTail;await s.reader.end();await s.raw.end();await Promise.all(servers);s.servers.clear();s.healthy=false;s.phase='stopped';s.operatorPassword='';s.readerPassword=''}catch{fault(s,'reader_cleanup_unknown');controlFail('reader_cleanup_unknown')}
 })();closures.set(control,closing);return closing
}
