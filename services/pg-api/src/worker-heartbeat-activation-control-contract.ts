// Comparison data and closed protocols only. No factory here grants authority.
import {createHash} from 'node:crypto'
import type {WorkerHeartbeatSnapshot} from './worker-heartbeat-contract.ts'
declare const controlBrand:unique symbol,peerBrand:unique symbol,mutationBrand:unique symbol,recoveryBrand:unique symbol,readBrand:unique symbol,finishedBrand:unique symbol,dbBrand:unique symbol
export type Control=Readonly<{[controlBrand]:true}>
export type OperatorPeer=Readonly<{[peerBrand]:'operator'}>
export type ReaderPeer=Readonly<{[peerBrand]:'reader'}>
export type MutationPermit=Readonly<{[mutationBrand]:true}>
export type RecoveryObservation=Readonly<{[recoveryBrand]:true}>
export type ReadLease=Readonly<{[readBrand]:true}>
export type FinishedRead=Readonly<{[finishedBrand]:true}>
export type ControlDbAccess=Readonly<{[dbBrand]:'read'|'write'}>
export type Phase='booting'|'closed'|'auditing'|'serving'|'closing_reads'|'waiting_readers'|'applying'|'commit_pending'|'commit_unknown'|'postcheck'|'publishing'|'recovery_required'|'stopping'|'stopped'
export type ControlErrorCode='invalid_command'|'untrusted_reference'|'source_runtime_refused'|'binding_changed'|'store_invalid'|'not_enrolled'|'singleton_busy'|'control_closed'|'control_busy'|'plan_stale'|'approval_invalid'|'approval_expired'|'permit_stale'|'reader_capacity'|'reader_timeout'|'lease_expired'|'lease_revoked'|'lease_replayed'|'reader_cleanup_unknown'|'registry_mismatch'|'rollback_unknown'|'commit_unknown'|'committed_unpublished'|'recovery_in_progress'|'recovery_conflict'|'control_io_failed'
export const controlErrorCodes:readonly ControlErrorCode[]=Object.freeze(['invalid_command','untrusted_reference','source_runtime_refused','binding_changed','store_invalid','not_enrolled','singleton_busy','control_closed','control_busy','plan_stale','approval_invalid','approval_expired','permit_stale','reader_capacity','reader_timeout','lease_expired','lease_revoked','lease_replayed','reader_cleanup_unknown','registry_mismatch','rollback_unknown','commit_unknown','committed_unpublished','recovery_in_progress','recovery_conflict','control_io_failed'])
export class WorkerHeartbeatControlError extends Error {
 readonly automatic_retry_authorized=false
 readonly code:ControlErrorCode
 constructor(code:ControlErrorCode){super(code);this.code=code;this.name='WorkerHeartbeatControlError'}
}
export function controlFail(code:ControlErrorCode):never{throw new WorkerHeartbeatControlError(code)}
export const controlLimits=Object.freeze({leases:2,leaseMs:5000,nativeBudgetMs:8000,frameBytes:16384,acquireMs:2000,readerStatementMs:3000,lockMs:1000,controlStatementMs:10000,operationMs:30000})
export const controlPaths=Object.freeze({config:'/etc/agentstudio/telemetry-control',store:'/var/lib/agentstudio-telemetry-control',credentials:'/run/credentials/agentstudio-telemetry-control.service',sockets:'/run/agentstudio-telemetry-control',ops:'/run/agentstudio-telemetry-control/operator.sock',reader:'/run/agentstudio-telemetry-control/reader.sock'})
export type ControlStatus=Readonly<{phase:Phase;instance_id:string;fence_epoch:string;published_epoch:string|null;policy_sha256:string|null;read_gate:'open'|'closed';in_flight_reads:0|1|2;mutation_in_flight:boolean;is_activation_capability:false}>
export type PlanSummary=Readonly<{action_id:string;plan_sha256:string;before_sha256:string;after_sha256:string;expected_epoch:string;requires_explicit_approval:true;authorizes_database_writes:false}>
export type MutationOutcome=Readonly<{action_id:string;epoch:string;commit_acknowledged:true;after_verified:true;publication_completed:true;automatic_retry_authorized:false}>
export type RecoveryReport=Readonly<{action_id:string;observed:'after_matches'|'before_matches'|'mixed_or_unsafe'|'old_backend_live'|'unobservable';observed_policy_sha256:string|null;journal_head_sha256:string;original_commit_acknowledged:boolean;automatic_retry_authorized:false;read_gate_opened:false}>
export type ControlCommand=Readonly<{op:'inspect'|'stop'}|{op:'prepare'|'apply'|'recover';action_id:string}|{op:'resume_publication';action_id:string;recovered_action_id:string}>
export type WireRequest=Readonly<{protocol:'worker_heartbeat_control_v1';request_id:string;op:'prepare_read'}|{protocol:'worker_heartbeat_control_v1';request_id:string;op:'finish_read'|'cancel_read';pending_id:string;instance_id:string;epoch:string}>
export type JournalPhase='boot'|'plan_prepared'|'authorized'|'closing'|'readers_clean'|'before_change'|'material_staged'|'commit_pending'|'commit_acknowledged'|'commit_unknown'|'rollback_known'|'rollback_unknown'|'after_verified'|'old_connections_retired'|'publication_pending'|'published'|'abandoned'|'recovery_observed'|'reader_bound'|'reader_ended'
export const controlJournalPhases:readonly JournalPhase[]=Object.freeze(['boot','plan_prepared','authorized','closing','readers_clean','before_change','material_staged','commit_pending','commit_acknowledged','commit_unknown','rollback_known','rollback_unknown','after_verified','old_connections_retired','publication_pending','published','abandoned','recovery_observed','reader_bound','reader_ended'])
/** Sensitive data, NOT authority. Only protected write access may obtain it. */
export type WorkerHeartbeatRegistryPrivateMaterial=Readonly<{protocol:'worker_heartbeat_registry_private_material_v1';plan_sha256:string;before_sha256:string;after_sha256:string;before_policy:unknown;after_policy:unknown;roles:readonly Readonly<{name:string;oid:number;password:string|null;verifier_sha256:string|null;generation:string|null}>[]}>
export type JournalRecord=Readonly<{format:'worker_heartbeat_control_journal_v1';sequence:number;previous_sha256:string;record_sha256:string;instance_id:string;epoch:string;action_id:string|null;phase:JournalPhase;data:unknown}>
export type RootProfile=Readonly<{protocol:'worker_heartbeat_control_profile_v1';mode:'closed'|'serve';source_sha256:string;source_manifest_sha256:string;runtime_manifest_sha256:string;admin_password_sha256:string;reader_password_sha256:string;native_gid:number;binding:unknown;policy:unknown}>
export type PendingSnapshot=Readonly<{snapshot:WorkerHeartbeatSnapshot;static_sha256:string;as_of:string}>
export const controlSha=(value:string|Uint8Array):string=>createHash('sha256').update(value).digest('hex')
export const controlHex=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v)
export const controlUuid=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v)
export const controlEpoch=(v:unknown):v is string=>typeof v==='string'&&/^(?:0|[1-9][0-9]{0,19})$/.test(v)&&BigInt(v)<=18446744073709551615n
export function controlFreeze<T>(value:T):Readonly<T>{const seen=new WeakSet<object>();let nodes=0;const visit=(v:unknown,depth:number)=>{if(depth>24||++nodes>10000)controlFail('invalid_command');if(v&&typeof v==='object'){if(seen.has(v)||![Object.prototype,null,Array.prototype].includes(Object.getPrototypeOf(v)))controlFail('invalid_command');seen.add(v);for(const key of Reflect.ownKeys(v)){const d=Object.getOwnPropertyDescriptor(v,key);if(typeof key!=='string'||!d||!('value'in d)||!d.enumerable&&!(Array.isArray(v)&&key==='length'))controlFail('invalid_command');visit(d.value,depth+1)}Object.freeze(v)}};visit(value,0);return value}
export function controlObject(raw:unknown,keys:readonly string[]):Record<string,unknown>{
 if(!raw||typeof raw!=='object'||![Object.prototype,null].includes(Object.getPrototypeOf(raw))||Reflect.ownKeys(raw).length!==keys.length)return controlFail('invalid_command')
 const d=Object.getOwnPropertyDescriptors(raw),out:Record<string,unknown>={}
 for(const key of keys){const v=d[key];if(!v?.enumerable||!Object.hasOwn(v,'value'))return controlFail('invalid_command');out[key]=v.value}
 return out
}
/** Strict bounded JSON, including duplicate decoded names and unsafe numbers. */
export function parseWorkerHeartbeatControlJson(raw:Uint8Array,max:number=controlLimits.frameBytes):unknown{
 const bytes=Buffer.from(raw),text=bytes.toString('utf8');let i=0,nodes=0
 if(!Number.isSafeInteger(max)||max<1||max>4194304||bytes.length<1||bytes.length>max||text.charCodeAt(0)===0xfeff||text.includes('\0')||!Buffer.from(text).equals(bytes))return controlFail('invalid_command')
 const fail=():never=>controlFail('invalid_command'),ws=()=>{while(/[ \r\n\t]/.test(text[i]??'!'))i++}
 const string=():string=>{const at=i++;while(i<text.length){const c=text[i++];if(c==='\\'){i++;continue}if(c==='"'){let s:unknown;try{s=JSON.parse(text.slice(at,i))}catch{return fail()}if(typeof s!=='string'||s.includes('\0')||Buffer.from(s).toString('utf8')!==s)return fail();return s}}return fail()}
 const value=(depth:number):unknown=>{
  if(depth>24||++nodes>10000)return fail();ws();const c=text[i]
  if(c==='"')return string()
  if(c==='{'){i++;ws();const result:Record<string,unknown>={},seen=new Set<string>();if(text[i]==='}'){i++;return result}for(;;){ws();if(text[i]!=='"')return fail();const key=string();if(seen.has(key)||['__proto__','prototype','constructor'].includes(key))return fail();seen.add(key);ws();if(text[i++]!==':')return fail();Object.defineProperty(result,key,{value:value(depth+1),enumerable:true});ws();if(text[i]==='}'){i++;return result}if(text[i++]!==',')return fail()}}
  if(c==='['){i++;ws();const result:unknown[]=[];if(text[i]===']'){i++;return result}for(;;){result.push(value(depth+1));ws();if(text[i]===']'){i++;return result}if(text[i++]!==',')return fail()}}
  for(const [s,v]of [['true',true],['false',false],['null',null]] as const)if(text.startsWith(s,i)){i+=s.length;return v}
  const m=text.slice(i).match(/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/);if(!m)return fail();i+=m[0].length;const n=Number(m[0]);if(!Number.isSafeInteger(n)||Object.is(n,-0))return fail();return n
 }
 const result=value(0);ws();if(i!==text.length)return fail();return controlFreeze(result)
}
export function parseWorkerHeartbeatControlCommand(raw:unknown):ControlCommand{
 const kind=controlObject(raw,['op',...(raw&&typeof raw==='object'&&Object.getOwnPropertyDescriptor(raw,'op')?.value==='resume_publication'?['action_id','recovered_action_id']:raw&&typeof raw==='object'&&['prepare','apply','recover'].includes(Object.getOwnPropertyDescriptor(raw,'op')?.value)?['action_id']:[])])
 if(kind.op==='inspect'||kind.op==='stop')return Object.freeze({op:kind.op})
 if(!controlUuid(kind.action_id))return controlFail('invalid_command')
 if(kind.op==='prepare'||kind.op==='apply'||kind.op==='recover')return Object.freeze({op:kind.op,action_id:kind.action_id})
 if(kind.op==='resume_publication'&&controlUuid(kind.recovered_action_id))return Object.freeze({op:kind.op,action_id:kind.action_id,recovered_action_id:kind.recovered_action_id})
 return controlFail('invalid_command')
}
export function parseWorkerHeartbeatReadRequest(raw:unknown):WireRequest{
 if(!raw||typeof raw!=='object')return controlFail('invalid_command')
 const op=Object.getOwnPropertyDescriptor(raw,'op')?.value,object=controlObject(raw,op==='prepare_read'?['protocol','request_id','op']:['protocol','request_id','op','pending_id','instance_id','epoch'])
 if(object.protocol!=='worker_heartbeat_control_v1'||!controlUuid(object.request_id))return controlFail('invalid_command')
 if(op==='prepare_read')return Object.freeze({protocol:object.protocol,request_id:object.request_id,op})
 if((op==='finish_read'||op==='cancel_read')&&controlHex(object.pending_id)&&controlUuid(object.instance_id)&&controlEpoch(object.epoch))return Object.freeze({protocol:object.protocol,request_id:object.request_id,op,pending_id:object.pending_id,instance_id:object.instance_id,epoch:object.epoch})
 return controlFail('invalid_command')
}
export function parseWorkerHeartbeatRootProfile(raw:unknown):RootProfile{
 const x=controlObject(raw,['protocol','mode','source_sha256','source_manifest_sha256','runtime_manifest_sha256','admin_password_sha256','reader_password_sha256','native_gid','binding','policy'])
 if(x.protocol!=='worker_heartbeat_control_profile_v1'||typeof x.mode!=='string'||!['closed','serve'].includes(x.mode)||typeof x.native_gid!=='number'||!Number.isSafeInteger(x.native_gid)||x.native_gid<1||x.native_gid>2147483647||['source_sha256','source_manifest_sha256','runtime_manifest_sha256','admin_password_sha256','reader_password_sha256'].some(k=>!controlHex(x[k])))return controlFail('invalid_command')
 return controlFreeze(x) as RootProfile
}
