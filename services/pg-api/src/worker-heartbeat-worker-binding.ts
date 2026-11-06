// Non-root fixed-path IPC only. No pg/DB password, target/pool/clock injection.
import fs from 'node:fs'
import path from 'node:path'
import net from 'node:net'
import {performance} from 'node:perf_hooks'
import {randomUUID} from 'node:crypto'
import type {WorkerHeartbeatKind} from './worker-heartbeat-contract.ts'
import type {WorkerHeartbeatSendOptions} from './worker-heartbeat-bounded-reporter.ts'
import type {WorkerHeartbeatReport} from './worker-heartbeat-report-sequence.ts'
import {readWorkerHeartbeatWriterCredential} from './worker-heartbeat-writer-credentials.ts'
import {writerProtocol,writerLimits,writerPaths,writerKind,writerSocketPath,writerEncode,writerDecode,parseWriterResponse,parseWriterReport,writerObject,writerFail,WorkerHeartbeatWriterError,type WriterHello} from './worker-heartbeat-writer-protocol.ts'

declare const bindingBrand:unique symbol
export type WorkerHeartbeatWorkerBinding=Readonly<{[bindingBrand]:true}>
type Binding={socket:net.Socket;hello:WriterHello;permit:string|null;sequence:number;pending:boolean;closed:boolean;uncertain:boolean;abort?:()=>void;outcome:'none'|'acknowledged'|'not_dispatched'|'rejected'|'unknown'}
export type WorkerHeartbeatBindingSnapshot=Readonly<{lifecycle:'open'|'closed';io:'settled'|'inflight'|'uncertain';outcome:Binding['outcome']}>
const bindings=new WeakMap<object,Binding>(),now=performance.now.bind(performance)
function state(handle:WorkerHeartbeatWorkerBinding):Binding{const s=bindings.get(handle);if(!s)return writerFail('writer_not_enrolled');return s}
function socketIdentity(kind:WorkerHeartbeatKind){
 if(process.platform!=='linux'||!process.getuid||process.getuid()<=0||process.versions.node.split('.')[0]!=='24')return writerFail('writer_not_enrolled')
 const file=writerSocketPath(kind);let current='/'
 for(const part of path.dirname(file).split('/').filter(Boolean)){
  current=path.join(current,part);const st=fs.lstatSync(current)
  if(!st.isDirectory()||st.isSymbolicLink()||st.uid!==0||(st.mode&0o7022)!==0||fs.realpathSync(current)!==current)return writerFail('writer_not_enrolled')
 }
 const root=fs.lstatSync(writerPaths.sockets),directory=fs.lstatSync(path.dirname(file)),socket=fs.lstatSync(file)
 if(root.gid!==0||(root.mode&0o7777)!==0o711||directory.gid<=0||(directory.mode&0o7777)!==0o710||!socket.isSocket()||socket.isSymbolicLink()||socket.uid!==0||socket.gid!==directory.gid||(socket.mode&0o7777)!==0o660)return writerFail('writer_not_enrolled')
 return {dev:socket.dev,ino:socket.ino,uid:socket.uid,gid:socket.gid,mode:socket.mode}
}
function quarantine(s:Binding,uncertain:boolean):void{s.closed=true;s.permit=null;s.uncertain=s.uncertain||uncertain;s.outcome=uncertain?'unknown':'rejected';s.socket.destroy()}
function options(raw:WorkerHeartbeatSendOptions):{signal:AbortSignal;deadline:number}{
 const v=writerObject(raw,['signal','timeoutMs','deadlineMonotonicMs'])
 if(!(v.signal instanceof AbortSignal)||typeof v.timeoutMs!=='number'||!Number.isSafeInteger(v.timeoutMs)||v.timeoutMs<1||v.timeoutMs>writerLimits.sendMs||typeof v.deadlineMonotonicMs!=='number'||!Number.isFinite(v.deadlineMonotonicMs))return writerFail()
 return {signal:v.signal,deadline:Math.min(now()+writerLimits.sendMs,now()+v.timeoutMs,v.deadlineMonotonicMs)}
}
function exchange(s:Binding,body:unknown,request:string,phase:'bind'|'report',deadline:number,signal?:AbortSignal,sequence?:number):Promise<ReturnType<typeof parseWriterResponse>>{
 if(s.closed||s.pending)return Promise.reject(new WorkerHeartbeatWriterError('writer_closed'))
 if(now()>=deadline){quarantine(s,false);return Promise.reject(new WorkerHeartbeatWriterError('writer_deadline'))}
 let frame:Buffer
 try{frame=writerEncode(body)}catch{quarantine(s,false);return Promise.reject(new WorkerHeartbeatWriterError('writer_protocol_refused'))}
 s.pending=true
 return new Promise((resolve,reject)=>{
  let bytes=Buffer.alloc(0),ended=false,submitted=false,writeDone=false,response:ReturnType<typeof parseWriterResponse>|undefined
  const clean=()=>{clearTimeout(timer);signal?.removeEventListener('abort',aborted);s.socket.off('data',data);s.socket.off('close',closed);s.socket.off('error',closed);s.abort=undefined}
  const fail=(code:'writer_io_failed'|'writer_deadline'|'writer_protocol_refused')=>{
   if(ended)return;ended=true;clean();if(!submitted)frame.fill(0);quarantine(s,phase==='report'&&submitted)
   // No observable Root outcome after possible report submission. Retain this
   // one native Promise/slot; close is not fabricated remote settlement.
   if(phase==='report'&&submitted)return
   s.pending=false;reject(new WorkerHeartbeatWriterError(code))
  }
  const closed=()=>fail('writer_io_failed'),aborted=()=>fail('writer_deadline')
  const finish=()=>{
   if(ended||!response||!writeDone)return
   if(now()>=deadline)return fail('writer_deadline')
   ended=true;clean();s.pending=false;resolve(response)
  }
  const data=(chunk:Buffer)=>{
   if(ended)return;bytes=Buffer.concat([bytes,chunk]);if(bytes.length>writerLimits.frameBytes+4)return fail('writer_protocol_refused')
   if(bytes.length<4)return;const length=bytes.readUInt32BE(0)
   if(length<1||length>writerLimits.frameBytes)return fail('writer_protocol_refused');if(bytes.length<length+4)return
   if(bytes.length!==length+4)return fail('writer_protocol_refused')
   try{response=parseWriterResponse(writerDecode(bytes.subarray(4)),request,phase,sequence);finish()}catch{fail('writer_protocol_refused')}
  }
  const timer=setTimeout(()=>fail('writer_deadline'),Math.max(1,deadline-now()))
  s.abort=aborted;signal?.addEventListener('abort',aborted,{once:true});s.socket.on('data',data);s.socket.once('close',closed);s.socket.once('error',closed)
  if(signal?.aborted)return aborted()
  try{submitted=true;s.socket.write(frame,error=>{frame.fill(0);if(error)return fail('writer_io_failed');writeDone=true;finish()})}catch{frame.fill(0);fail('writer_io_failed')}
 })
}
export async function openWorkerHeartbeatWorkerBinding(rawKind:WorkerHeartbeatKind):Promise<WorkerHeartbeatWorkerBinding>{
 const kind=writerKind(rawKind),deadline=now()+writerLimits.sendMs,credential=readWorkerHeartbeatWriterCredential(kind),before=socketIdentity(kind)
 if(now()>=deadline)return writerFail('writer_deadline')
 const socket=net.createConnection({path:writerSocketPath(kind)})
 await new Promise<void>((resolve,reject)=>{
  const fail=()=>{clearTimeout(timer);socket.destroy();reject(new WorkerHeartbeatWriterError('writer_io_failed'))},timer=setTimeout(fail,Math.max(1,deadline-now()))
  socket.once('error',fail);socket.once('connect',()=>{clearTimeout(timer);socket.off('error',fail);try{const after=socketIdentity(kind);if((Object.keys(before) as (keyof typeof before)[]).some(k=>before[k]!==after[k]))return fail();resolve()}catch{fail()}})
 })
 const s:Binding={socket,hello:undefined as unknown as WriterHello,permit:null,sequence:0,pending:false,closed:false,uncertain:false,outcome:'none'}
 socket.on('error',()=>{});socket.on('close',()=>{s.closed=true;s.permit=null;if(s.pending){s.uncertain=true;s.outcome='unknown'}})
 const request=randomUUID()
 try{
  const response=await exchange(s,{protocol:writerProtocol,request_id:request,op:'bind',boot_secret:credential.secret},request,'bind',deadline)
  if(!response.ok)return writerFail(response.value.code)
  const hello=response.value as WriterHello;if(hello.generation!==credential.generation)return writerFail('writer_not_enrolled')
  s.hello=hello;s.permit=hello.next_permit
  const handle=Object.freeze(Object.create(null)) as WorkerHeartbeatWorkerBinding;bindings.set(handle,s);return handle
 }catch(error){quarantine(s,false);if(error instanceof WorkerHeartbeatWriterError)throw error;return writerFail('writer_not_enrolled')}
}
export function describeWorkerHeartbeatWorkerBinding(handle:WorkerHeartbeatWorkerBinding):Readonly<{generation:string}>{const s=state(handle);if(s.closed)return writerFail('writer_closed');return Object.freeze({generation:s.hello.generation})}
export async function sendWorkerHeartbeatBoundReport(handle:WorkerHeartbeatWorkerBinding,raw:WorkerHeartbeatReport,rawOptions:WorkerHeartbeatSendOptions):Promise<void>{
 const s=state(handle),report=parseWriterReport(raw),selected=options(rawOptions)
 if(s.closed||s.pending||!s.permit||report.generation!==s.hello.generation||report.sequence<=s.sequence)return writerFail('writer_closed')
 const permit=s.permit;s.permit=null;s.sequence=report.sequence;const request=randomUUID()
 const result=await exchange(s,{protocol:writerProtocol,request_id:request,op:'report',binding_id:s.hello.binding_id,permit,report},request,'report',selected.deadline,selected.signal,report.sequence)
 if(s.closed||now()>=selected.deadline){quarantine(s,true);return writerFail('writer_deadline')}
 if(!result.ok){
  if(result.value.code==='writer_busy'&&result.value.not_dispatched&&result.value.next_permit){s.permit=result.value.next_permit;s.outcome='not_dispatched';return}
  quarantine(s,false);return writerFail(result.value.code)
 }
 const ack=result.value as import('./worker-heartbeat-writer-protocol.ts').WriterAck;s.permit=ack.next_permit;s.outcome='acknowledged'
}
export function snapshotWorkerHeartbeatWorkerBinding(handle:WorkerHeartbeatWorkerBinding):WorkerHeartbeatBindingSnapshot{
 const s=state(handle);return Object.freeze({lifecycle:s.closed?'closed':'open',io:s.uncertain?'uncertain':s.pending?'inflight':'settled',outcome:s.outcome})
}
export function closeWorkerHeartbeatWorkerBinding(handle:WorkerHeartbeatWorkerBinding):WorkerHeartbeatBindingSnapshot{const s=state(handle);s.abort?.();quarantine(s,s.pending);return snapshotWorkerHeartbeatWorkerBinding(handle)}
