// Native holds only this fixed read socket, never a telemetry password or PID.
import fs from 'node:fs'
import net from 'node:net'
import {performance} from 'node:perf_hooks'
import {randomUUID} from 'node:crypto'
import {parseWorkerHeartbeatSnapshot,type WorkerHeartbeatSnapshot} from './worker-heartbeat-contract.ts'
import {controlPaths,controlLimits,controlObject,controlUuid,controlHex,controlEpoch,controlFreeze,controlErrorCodes,parseWorkerHeartbeatControlJson,parseWorkerHeartbeatControlCommand,controlFail,WorkerHeartbeatControlError,type ControlCommand,type ControlStatus,type PlanSummary,type MutationOutcome,type RecoveryReport,type ControlErrorCode} from './worker-heartbeat-activation-control-contract.ts'
declare const clientBrand:unique symbol,pendingBrand:unique symbol,completedBrand:unique symbol,budgetBrand:unique symbol
export type ReaderClient=Readonly<{[clientBrand]:true}>
export type PendingRead=Readonly<{[pendingBrand]:true}>
export type CompletedRead=Readonly<{[completedBrand]:true}>
export type NativeReadBudget=Readonly<{[budgetBrand]:true}>
type Channel={socket:net.Socket;open:boolean;deadline:number;pending:boolean}
type Pending={channel:Channel;request:string;id:string;instance:string;epoch:string;used:boolean}
const budgets=new WeakMap<object,{deadline:number;used:boolean}>(),clients=new WeakMap<object,Channel>(),pendingReads=new WeakMap<object,Pending>(),completedReads=new WeakMap<object,{channel:Channel;snapshot:WorkerHeartbeatSnapshot;used:boolean}>()
const opaque=<T>():T=>Object.freeze(Object.create(null)) as T
export function beginWorkerHeartbeatNativeReadBudget():NativeReadBudget{const token=opaque<NativeReadBudget>();budgets.set(token,{deadline:performance.now()+controlLimits.nativeBudgetMs,used:false});return token}
function channel(handle:ReaderClient):Channel{const c=clients.get(handle);if(!c||!c.open)controlFail('untrusted_reference');if(performance.now()>=c.deadline){c.open=false;c.socket.destroy();controlFail('lease_expired')}return c}
function socketIdentity(file:string,kind:'operator'|'reader'){
 if(process.platform!=='linux')controlFail('source_runtime_refused')
 let at='/';for(const part of controlPaths.sockets.split('/').filter(Boolean)){at+='/'+part;at=at.replaceAll('//','/');const s=fs.lstatSync(at);if(!s.isDirectory()||s.isSymbolicLink()||s.uid!==0||(s.mode&0o7022)!==0)controlFail('binding_changed')}
 const st=fs.lstatSync(file);if(!st.isSocket()||st.isSymbolicLink()||st.uid!==0||(st.mode&0o7777)!==(kind==='reader'?0o660:0o600))controlFail('binding_changed');return st
}
async function connect(kind:'operator'|'reader',deadline:number):Promise<Channel>{
 const file=kind==='operator'?controlPaths.ops:controlPaths.reader,before=socketIdentity(file,kind)
 return new Promise((resolve,reject)=>{const socket=net.createConnection({path:file}),timer=setTimeout(()=>{socket.destroy();reject(new WorkerHeartbeatControlError('reader_timeout'))},Math.max(1,Math.min(2000,deadline-performance.now())))
  socket.once('error',()=>{clearTimeout(timer);reject(new WorkerHeartbeatControlError('control_io_failed'))})
  socket.once('connect',()=>{clearTimeout(timer);try{const after=socketIdentity(file,kind);if(before.dev!==after.dev||before.ino!==after.ino||before.mode!==after.mode||before.uid!==after.uid||before.gid!==after.gid)controlFail('binding_changed');const c={socket,open:true,deadline,pending:false};socket.on('close',()=>{c.open=false});resolve(c)}catch{socket.destroy();reject(new WorkerHeartbeatControlError('binding_changed'))}})
 })
}
async function exchange(c:Channel,body:unknown):Promise<unknown>{
 if(!c.open||c.pending||performance.now()>=c.deadline)controlFail('lease_expired');c.pending=true
 return new Promise((resolve,reject)=>{let buffer=Buffer.alloc(0),ended=false
  const cleanup=()=>{clearTimeout(timer);c.pending=false;c.socket.off('data',data);c.socket.off('close',closed);c.socket.off('error',closed)}
  const fail=(code:'reader_timeout'|'control_io_failed'|'invalid_command')=>{if(ended)return;ended=true;cleanup();c.open=false;c.socket.destroy();reject(new WorkerHeartbeatControlError(code))}
  const closed=()=>fail('control_io_failed'),timer=setTimeout(()=>fail('reader_timeout'),Math.max(1,c.deadline-performance.now()))
  const data=(bytes:Buffer)=>{if(ended)return;buffer=Buffer.concat([buffer,bytes]);if(buffer.length>controlLimits.frameBytes+4)return fail('invalid_command');if(buffer.length<4)return;const size=buffer.readUInt32BE(0);if(size<1||size>controlLimits.frameBytes)return fail('invalid_command');if(buffer.length<size+4)return;if(buffer.length!==size+4)return fail('invalid_command');try{const result=parseWorkerHeartbeatControlJson(buffer.subarray(4));ended=true;cleanup();resolve(result)}catch{fail('invalid_command')}}
  c.socket.on('data',data);c.socket.once('close',closed);c.socket.once('error',closed)
  const bytes=Buffer.from(JSON.stringify(body));if(bytes.length>controlLimits.frameBytes)return fail('invalid_command');const header=Buffer.alloc(4);header.writeUInt32BE(bytes.length);c.socket.write(Buffer.concat([header,bytes]))
 })
}
function response(raw:unknown,request:string):unknown{const x=controlObject(raw,['protocol','request_id','ok','value']);if(x.protocol!=='worker_heartbeat_control_v1'||x.request_id!==request||typeof x.ok!=='boolean')controlFail('invalid_command');if(!x.ok){const e=controlObject(x.value,['code']);if(typeof e.code!=='string'||!controlErrorCodes.includes(e.code as ControlErrorCode))controlFail('invalid_command');controlFail(e.code as ControlErrorCode)}return x.value}
export async function connectWorkerHeartbeatReadControl(budget:NativeReadBudget):Promise<ReaderClient>{
 const b=budgets.get(budget);if(!b||b.used||performance.now()>=b.deadline)controlFail('untrusted_reference');b.used=true
 const c=await connect('reader',b.deadline),handle=opaque<ReaderClient>();clients.set(handle,c);return handle
}
export async function prepareWorkerHeartbeatSnapshot(handle:ReaderClient):Promise<PendingRead>{
 const c=channel(handle),request=randomUUID(),started=performance.now(),raw=response(await exchange(c,{protocol:'worker_heartbeat_control_v1',request_id:request,op:'prepare_read'}),request),x=controlObject(raw,['pending_id','instance_id','epoch','remaining_ms'])
 if(!controlHex(x.pending_id)||!controlUuid(x.instance_id)||!controlEpoch(x.epoch)||typeof x.remaining_ms!=='number'||!Number.isSafeInteger(x.remaining_ms)||x.remaining_ms<1||x.remaining_ms>controlLimits.leaseMs)controlFail('invalid_command')
 c.deadline=Math.min(c.deadline,started+controlLimits.leaseMs,performance.now()+x.remaining_ms);channel(handle);const token=opaque<PendingRead>();pendingReads.set(token,{channel:c,request,id:x.pending_id,instance:x.instance_id,epoch:x.epoch,used:false});return token
}
export async function finishWorkerHeartbeatSnapshot(handle:ReaderClient,token:PendingRead):Promise<CompletedRead>{
 const c=channel(handle),p=pendingReads.get(token);if(!p||p.channel!==c||p.used)controlFail('untrusted_reference');p.used=true
 const request=randomUUID(),raw=response(await exchange(c,{protocol:'worker_heartbeat_control_v1',request_id:request,op:'finish_read',pending_id:p.id,instance_id:p.instance,epoch:p.epoch}),request)
 channel(handle);const snapshot=parseWorkerHeartbeatSnapshot(raw),finished=opaque<CompletedRead>();completedReads.set(finished,{channel:c,snapshot,used:false});return finished
}
export function consumeWorkerHeartbeatSnapshot(handle:ReaderClient,token:CompletedRead):WorkerHeartbeatSnapshot{const c=channel(handle),r=completedReads.get(token);if(!r||r.channel!==c||r.used)controlFail('untrusted_reference');r.used=true;completedReads.delete(token);return r.snapshot}
export async function cancelWorkerHeartbeatSnapshot(handle:ReaderClient,token:PendingRead):Promise<void>{const c=clients.get(handle),p=pendingReads.get(token);if(!c||!p||p.channel!==c)controlFail('untrusted_reference');if(p.used)return;p.used=true;if(!c.open||performance.now()>=c.deadline){c.open=false;c.socket.destroy();return}const request=randomUUID();try{response(await exchange(c,{protocol:'worker_heartbeat_control_v1',request_id:request,op:'cancel_read',pending_id:p.id,instance_id:p.instance,epoch:p.epoch}),request)}finally{c.open=false;c.socket.destroy()}}
export async function closeWorkerHeartbeatReadControl(handle:ReaderClient):Promise<void>{const c=clients.get(handle);if(!c)controlFail('untrusted_reference');c.open=false;c.socket.destroy();clients.delete(handle)}
export async function sendWorkerHeartbeatOperatorCommand(raw:ControlCommand):Promise<ControlStatus|PlanSummary|MutationOutcome|RecoveryReport>{
 const command=parseWorkerHeartbeatControlCommand(raw);if(process.platform!=='linux'||process.getuid?.()!==0)controlFail('untrusted_reference')
 const c=await connect('operator',performance.now()+controlLimits.operationMs),request=randomUUID()
 try{return controlFreeze(response(await exchange(c,{protocol:'worker_heartbeat_control_operator_v1',request_id:request,command}),request)) as ControlStatus|PlanSummary|MutationOutcome|RecoveryReport}finally{c.open=false;c.socket.destroy()}
}
