// Closed values only. No parser, profile, nonce or UID value grants authority.
import {workerHeartbeatKinds,type WorkerHeartbeatKind} from './worker-heartbeat-contract.ts'
import type {WorkerHeartbeatReport} from './worker-heartbeat-report-sequence.ts'
import {parseWorkerHeartbeatControlJson} from './worker-heartbeat-activation-control-contract.ts'

export const writerProtocol='worker_heartbeat_writer_v1' as const
export const writerBootProtocol='worker_heartbeat_writer_boot_v1' as const
export const writerLimits=Object.freeze({frameBytes:2048,credentialBytes:1024,sendMs:5000,intervalMs:30000,slots:16,peersPerKind:2,uidPool:128})
export const writerPaths=Object.freeze({sockets:'/run/agentstudio-telemetry-writers',store:'/var/lib/agentstudio-telemetry-control/worker-boots'})
const units:Readonly<Record<WorkerHeartbeatKind,string>>=Object.freeze({prepare:'agentstudio-pg18-prepare.service',model:'agentstudio-pg18-model.service',workflow_safe:'agentstudio-pg18-workflow.service',workflow_v2:'agentstudio-pg18-workflow.service',agent_autonomous:'agentstudio-pg18-agent.service',knowledge_index:'agentstudio-pg18-knowledge-index.service',knowledge_query:'agentstudio-pg18-knowledge-index.service',assessment:'agentstudio-pg18-review-worker.service'})
export type WriterSettings=Readonly<{enabled:false}>|Readonly<{enabled:true;native_uid:number;groups:readonly Readonly<{kind:WorkerHeartbeatKind;gid:number}>[];boot_uids:readonly number[];uid_policy:'exclusive_never_reuse'}>
export type WriterBootCredential=Readonly<{protocol:typeof writerBootProtocol;kind:WorkerHeartbeatKind;uid:number;generation:string;secret:string}>
export type WriterBindRequest=Readonly<{protocol:typeof writerProtocol;request_id:string;op:'bind';boot_secret:string}>
export type WriterReportRequest=Readonly<{protocol:typeof writerProtocol;request_id:string;op:'report';binding_id:string;permit:string;report:WorkerHeartbeatReport}>
export type WriterRequest=WriterBindRequest|WriterReportRequest
export type WriterHello=Readonly<{binding_id:string;instance_id:string;generation:string;next_permit:string}>
export type WriterAck=Readonly<{accepted:true;sequence:number;observed_at:string;next_permit:string}>
export type WriterRejection=Readonly<{code:WriterErrorCode;not_dispatched:boolean;settled:true;next_permit?:string}>
export type WriterErrorCode='writer_protocol_refused'|'writer_not_enrolled'|'writer_busy'|'writer_closed'|'writer_uncertain'|'writer_deadline'|'writer_io_failed'
export class WorkerHeartbeatWriterError extends Error{
 readonly automatic_retry_authorized=false
 readonly code:WriterErrorCode
 constructor(code:WriterErrorCode){super(code);this.name='WorkerHeartbeatWriterError';this.code=code}
}
export function writerFail(code:WriterErrorCode='writer_protocol_refused'):never{throw new WorkerHeartbeatWriterError(code)}
export function writerObject(raw:unknown,keys:readonly string[]):Record<string,unknown>{
 if(!raw||typeof raw!=='object'||![Object.prototype,null].includes(Object.getPrototypeOf(raw))||Reflect.ownKeys(raw).length!==keys.length)return writerFail()
 const descriptors=Object.getOwnPropertyDescriptors(raw),result:Record<string,unknown>={}
 for(const key of keys){const d=descriptors[key];if(!d?.enumerable||!Object.hasOwn(d,'value'))return writerFail();result[key]=d.value}
 return result
}
export const writerHex=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v)
export const writerUuid=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v)
export const writerUid=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>0&&v<=2147483647
export function writerKind(raw:unknown):WorkerHeartbeatKind{if(typeof raw!=='string'||!workerHeartbeatKinds.some(k=>k===raw))return writerFail();return raw as WorkerHeartbeatKind}
export function writerUnit(kind:WorkerHeartbeatKind):string{return units[writerKind(kind)]}
export function writerSocketPath(kind:WorkerHeartbeatKind):string{return writerPaths.sockets+'/'+writerKind(kind)+'/report.sock'}
export function writerCredentialDirectory(kind:WorkerHeartbeatKind):string{return '/run/credentials/'+writerUnit(kind)}
export function writerCredentialLeaf(kind:WorkerHeartbeatKind):string{return 'telemetry-'+writerKind(kind).replaceAll('_','-')+'.boot.json'}
export function writerCredentialPath(kind:WorkerHeartbeatKind):string{return writerCredentialDirectory(kind)+'/'+writerCredentialLeaf(kind)}
export function writerLaunchGroup(kind:WorkerHeartbeatKind):string{return kind==='knowledge_index'||kind==='knowledge_query'?'knowledge':writerKind(kind)}
function array(raw:unknown,max:number):unknown[]{
 if(!Array.isArray(raw)||Object.getPrototypeOf(raw)!==Array.prototype||raw.length>max||Reflect.ownKeys(raw).length!==raw.length+1)return writerFail()
 const descriptors=Object.getOwnPropertyDescriptors(raw)
 return Array.from({length:raw.length},(_,i)=>{const d=descriptors[String(i)];if(!d?.enumerable||!Object.hasOwn(d,'value'))return writerFail();return d.value})
}
export function parseWriterSettings(raw:unknown,nativeGid:number):WriterSettings{
 if(!raw||typeof raw!=='object')return writerFail()
 const enabled=Object.getOwnPropertyDescriptor(raw,'enabled')?.value
 if(enabled===false){writerObject(raw,['enabled']);return Object.freeze({enabled:false})}
 const value=writerObject(raw,['enabled','native_uid','groups','boot_uids','uid_policy'])
 if(value.enabled!==true||!writerUid(value.native_uid)||!writerUid(nativeGid)||value.uid_policy!=='exclusive_never_reuse')return writerFail()
 const groups=array(value.groups,8).map((raw,i)=>{const row=writerObject(raw,['kind','gid']);if(row.kind!==workerHeartbeatKinds[i]||!writerUid(row.gid)||row.gid===nativeGid)return writerFail();return Object.freeze({kind:writerKind(row.kind),gid:row.gid})})
 if(groups.length!==8||new Set(groups.map(v=>v.gid)).size!==8)return writerFail()
 const boot_uids=array(value.boot_uids,writerLimits.uidPool)
 if(!boot_uids.length||boot_uids.some(uid=>!writerUid(uid)||uid===value.native_uid)||new Set(boot_uids).size!==boot_uids.length)return writerFail()
 return Object.freeze({enabled:true,native_uid:value.native_uid,groups:Object.freeze(groups),boot_uids:Object.freeze(boot_uids as number[]),uid_policy:'exclusive_never_reuse'})
}
export function parseWriterBootCredential(raw:unknown,kind:WorkerHeartbeatKind):WriterBootCredential{
 const v=writerObject(raw,['protocol','kind','uid','generation','secret'])
 if(v.protocol!==writerBootProtocol||v.kind!==writerKind(kind)||!writerUid(v.uid)||!writerUuid(v.generation)||!writerHex(v.secret))return writerFail()
 return Object.freeze({protocol:writerBootProtocol,kind,uid:v.uid,generation:v.generation,secret:v.secret})
}
export function parseWriterReport(raw:unknown):WorkerHeartbeatReport{
 const v=writerObject(raw,['protocol','generation','sequence','state','reason'])
 if(v.protocol!=='native_worker_heartbeat_report_v1'||!writerUuid(v.generation)||typeof v.sequence!=='number'||!Number.isSafeInteger(v.sequence)||v.sequence<1)return writerFail()
 if(v.state==='unknown'&&(v.reason==='startup_checks_pending'||v.reason==='loop_unavailable'))return Object.freeze({protocol:v.protocol,generation:v.generation,sequence:v.sequence,state:v.state,reason:v.reason})
 if(v.state==='ready'&&v.reason==='startup_checks_complete')return Object.freeze({protocol:v.protocol,generation:v.generation,sequence:v.sequence,state:v.state,reason:v.reason})
 if(v.state==='draining'&&v.reason==='new_claims_closed')return Object.freeze({protocol:v.protocol,generation:v.generation,sequence:v.sequence,state:v.state,reason:v.reason})
 return writerFail()
}
export function parseWriterRequest(raw:unknown):WriterRequest{
 if(!raw||typeof raw!=='object')return writerFail()
 const op=Object.getOwnPropertyDescriptor(raw,'op')?.value
 const v=writerObject(raw,op==='bind'?['protocol','request_id','op','boot_secret']:['protocol','request_id','op','binding_id','permit','report'])
 if(v.protocol!==writerProtocol||!writerUuid(v.request_id))return writerFail()
 if(op==='bind'&&writerHex(v.boot_secret))return Object.freeze({protocol:writerProtocol,request_id:v.request_id,op,boot_secret:v.boot_secret})
 if(op==='report'&&writerHex(v.binding_id)&&writerHex(v.permit))return Object.freeze({protocol:writerProtocol,request_id:v.request_id,op,binding_id:v.binding_id,permit:v.permit,report:parseWriterReport(v.report)})
 return writerFail()
}
export function writerUtc(raw:unknown):string{
 if(typeof raw!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(raw)||raw.startsWith('0000-'))return writerFail()
 const n=Date.parse(raw);if(!Number.isSafeInteger(n)||new Date(n).toISOString()!==raw)return writerFail();return raw
}
export function parseWriterHello(raw:unknown):WriterHello{
 const v=writerObject(raw,['binding_id','instance_id','generation','next_permit'])
 if(!writerHex(v.binding_id)||!writerUuid(v.instance_id)||!writerUuid(v.generation)||!writerHex(v.next_permit))return writerFail()
 return Object.freeze({binding_id:v.binding_id,instance_id:v.instance_id,generation:v.generation,next_permit:v.next_permit})
}
export function parseWriterAck(raw:unknown,sequence:number):WriterAck{
 const v=writerObject(raw,['accepted','sequence','observed_at','next_permit'])
 if(v.accepted!==true||v.sequence!==sequence||!Number.isSafeInteger(sequence)||sequence<1||!writerHex(v.next_permit))return writerFail()
 return Object.freeze({accepted:true,sequence,observed_at:writerUtc(v.observed_at),next_permit:v.next_permit})
}
export function parseWriterResponse(raw:unknown,request:string,phase:'bind'|'report',sequence?:number):Readonly<{ok:true;value:WriterHello|WriterAck}>|Readonly<{ok:false;value:WriterRejection}>{
 const envelope=writerObject(raw,['protocol','request_id','ok','value'])
 if(envelope.protocol!==writerProtocol||envelope.request_id!==request||typeof envelope.ok!=='boolean')return writerFail()
 if(envelope.ok)return Object.freeze({ok:true,value:phase==='bind'?parseWriterHello(envelope.value):parseWriterAck(envelope.value,sequence!)})
 if(!envelope.value||typeof envelope.value!=='object')return writerFail()
 const hasNext=Object.hasOwn(envelope.value,'next_permit'),v=writerObject(envelope.value,hasNext?['code','not_dispatched','settled','next_permit']:['code','not_dispatched','settled'])
 if(!['writer_protocol_refused','writer_not_enrolled','writer_busy','writer_closed','writer_uncertain','writer_deadline','writer_io_failed'].includes(v.code as string)||typeof v.not_dispatched!=='boolean'||v.settled!==true)return writerFail()
 if(hasNext&&(phase!=='report'||v.code!=='writer_busy'||v.not_dispatched!==true||!writerHex(v.next_permit)))return writerFail()
 return Object.freeze({ok:false,value:Object.freeze({...v}) as WriterRejection})
}
export function writerEncode(raw:unknown):Buffer{
 const bytes=Buffer.from(JSON.stringify(raw));if(!bytes.length||bytes.length>writerLimits.frameBytes)return writerFail()
 const header=Buffer.alloc(4);header.writeUInt32BE(bytes.length);return Buffer.concat([header,bytes])
}
export function writerDecode(bytes:Uint8Array,max:number=writerLimits.frameBytes):unknown{
 try{return parseWorkerHeartbeatControlJson(bytes,max)}catch{return writerFail()}
}
