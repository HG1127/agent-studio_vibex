// Root-only ingress. Only a genuine private Controller handle creates a broker.
// Worker supplied values never select SQL, target, role, UID or a constructor.
import fs from 'node:fs'
import path from 'node:path'
import net from 'node:net'
import {performance} from 'node:perf_hooks'
import {randomBytes,randomUUID,createHash,timingSafeEqual} from 'node:crypto'
import type {Control} from './worker-heartbeat-activation-control-contract.ts'
import {getWorkerHeartbeatWriterBridge} from './worker-heartbeat-activation-control.ts'
import {workerHeartbeatKinds,type WorkerHeartbeatKind} from './worker-heartbeat-contract.ts'
import type {WorkerHeartbeatReport} from './worker-heartbeat-report-sequence.ts'
import {writerProtocol,writerBootProtocol,writerLimits,writerPaths,writerLaunchGroup,writerSocketPath,writerKind,writerUid,writerUuid,writerHex,writerObject,writerEncode,writerDecode,parseWriterRequest,writerFail,WorkerHeartbeatWriterError,type WriterSettings,type WriterAck} from './worker-heartbeat-writer-protocol.ts'
import {assertWriterBootUidUnused,stageWriterBootCredential,stageWriterBootBatchDescriptor} from './worker-heartbeat-writer-credentials.ts'

declare const brokerBrand:unique symbol,slotBrand:unique symbol,backendBrand:unique symbol
export type WorkerHeartbeatWriterBroker=Readonly<{[brokerBrand]:true}>
export type WriterSlotReference=Readonly<{[slotBrand]:true}>
export type WriterBackendReference=Readonly<{[backendBrand]:true}>
export type WriterPublishedSlot=Readonly<{reference:WriterSlotReference;kind:WorkerHeartbeatKind;slot_no:1|2;generation:string;role_oid:number;action_id:string;publication_epoch:string}>
export type WriterJournalPhase='writer_boot_issued'|'writer_boot_staged'|'writer_boot_claimed'|'writer_backend_bound'|'writer_backend_ended'|'writer_quarantined'
export type WriterJournalEvent=Readonly<{phase:WriterJournalPhase;data:unknown;instance_id:string}>
/** Closures are created by the real Controller State only. No broker constructor
 * accepts this interface from its caller; get...Bridge validates Control first. */
export type WorkerHeartbeatWriterRootBridge=Readonly<{
 settings:Extract<WriterSettings,{enabled:true}>
 instance_id:string
 check(mode:'serve'|'cleanup'):void
 current():readonly WriterPublishedSlot[]
 history():readonly WriterJournalEvent[]
 persist(phase:WriterJournalPhase,data:unknown):void
 busy():boolean
 open(slot:WriterSlotReference):Promise<WriterBackendReference>
 record(backend:WriterBackendReference,report:WorkerHeartbeatReport):Promise<Omit<WriterAck,'next_permit'>>
 close(backend:WriterBackendReference):Promise<void>
}>
type Boot={id:string;uid:number;slot:WriterPublishedSlot;secret:Buffer;claimed:boolean;revoked:boolean}
type Peer={socket:net.Socket;kind:WorkerHeartbeatKind;open:boolean;busy:boolean;boot?:Boot;backend?:WriterBackendReference;binding?:string;permit?:string;lastSequence:number;work?:Promise<void>;cleanup?:Promise<void>;timer?:ReturnType<typeof setTimeout>}
type Broker={bridge:WorkerHeartbeatWriterRootBridge;servers:Set<net.Server>;peers:Set<Peer>;boots:Map<string,Boot>;issued:Set<string>;usedUids:Set<number>;paused:boolean;closed:boolean;active?:Peer;refreshing:boolean;enrollmentError:boolean}
const brokers=new WeakMap<object,Broker>(),controls=new WeakSet<object>(),closures=new WeakMap<object,Promise<void>>()
const opaque=<T>():T=>Object.freeze(Object.create(null)) as T
const secret=()=>randomBytes(32).toString('hex'),hash=(v:Uint8Array|string)=>createHash('sha256').update(v).digest('hex')
const slotKey=(slot:Pick<WriterPublishedSlot,'kind'|'slot_no'|'generation'>)=>slot.kind+':'+slot.slot_no+':'+slot.generation
function state(handle:WorkerHeartbeatWriterBroker):Broker{const s=brokers.get(handle);if(!s)return writerFail('writer_not_enrolled');return s}
function peerCurrent(s:Broker,p:Peer){
 s.bridge.check('serve');if(s.closed||s.paused||!p.open||!p.boot||p.boot.revoked||!p.backend||!s.bridge.current().some(slot=>slotKey(slot)===slotKey(p.boot!.slot)&&slot.role_oid===p.boot!.slot.role_oid))return writerFail('writer_closed')
}
function ensureDirectory(file:string,mode:number,gid:number){
 const parent=path.dirname(file);let at='/'
 for(const part of parent.split('/').filter(Boolean)){at=path.join(at,part);const st=fs.lstatSync(at);if(!st.isDirectory()||st.isSymbolicLink()||st.uid!==0||(st.mode&0o7022)!==0||fs.realpathSync(at)!==at)return writerFail('writer_not_enrolled')}
 let created=false;try{fs.mkdirSync(file,{mode:0o700});created=true}catch(error){if((error as NodeJS.ErrnoException).code!=='EEXIST')return writerFail('writer_not_enrolled')}
 if(created){fs.chownSync(file,0,gid);fs.chmodSync(file,mode)}
 const st=fs.lstatSync(file);if(!st.isDirectory()||st.isSymbolicLink()||st.uid!==0||st.gid!==gid||(st.mode&0o7777)!==mode||fs.realpathSync(file)!==file)return writerFail('writer_not_enrolled')
}
function parseHistory(s:Broker){
 for(const entry of s.bridge.history())if(entry.phase==='writer_boot_issued'){
  const v=writerObject(entry.data,['boot_id','uid','bindings']);if(!writerUuid(v.boot_id)||!writerUid(v.uid)||s.usedUids.has(v.uid)||!Array.isArray(v.bindings)||v.bindings.length<1||v.bindings.length>2)return writerFail('writer_not_enrolled')
  s.usedUids.add(v.uid)
  const rows=v.bindings.map(raw=>{const row=writerObject(raw,['kind','slot_no','generation','role_oid','secret_sha256']);writerKind(row.kind);if(![1,2].includes(row.slot_no as number)||!writerUuid(row.generation)||!writerUid(row.role_oid)||!writerHex(row.secret_sha256))return writerFail('writer_not_enrolled');return row})
  if(rows.length===2&&(rows[0]!.kind===rows[1]!.kind||!rows.every(row=>row.kind==='knowledge_index'||row.kind==='knowledge_query')||rows[0]!.slot_no!==rows[1]!.slot_no))return writerFail('writer_not_enrolled')
  for(const row of rows){const key=slotKey(row as unknown as WriterPublishedSlot);if(s.issued.has(key))return writerFail('writer_not_enrolled');s.issued.add(key)}
 }
}
function writerBootBatches(slots:readonly WriterPublishedSlot[],issued:Set<string>){
 const grouped=new Map<string,WriterPublishedSlot[]>(),batches:WriterPublishedSlot[][]=[];let blockedKnowledge=false
 for(const slot of slots){if(issued.has(slotKey(slot)))continue;const key=writerLaunchGroup(slot.kind)+':'+slot.slot_no+':'+slot.action_id,rows=grouped.get(key)??[];rows.push(slot);grouped.set(key,rows)}
 for(const rows of grouped.values()){
  if(rows.some(row=>writerLaunchGroup(row.kind)==='knowledge')){
   const other=rows[0]!.kind==='knowledge_index'?'knowledge_query':'knowledge_index'
   if(slots.some(slot=>slot.kind===other)&&!(rows.length===2&&rows.some(row=>row.kind===other))){blockedKnowledge=true;continue}
  }
  batches.push(rows)
 }
 return {batches,blockedKnowledge}
}
export async function openWorkerHeartbeatWriterBroker(control:Control):Promise<WorkerHeartbeatWriterBroker|null>{
 const bridge=getWorkerHeartbeatWriterBridge(control);if(!bridge)return null
 if(controls.has(control))return writerFail('writer_closed');controls.add(control)
 const s:Broker={bridge,servers:new Set(),peers:new Set(),boots:new Map(),issued:new Set(),usedUids:new Set(),paused:false,closed:false,refreshing:false,enrollmentError:false}
 parseHistory(s);const handle=opaque<WorkerHeartbeatWriterBroker>();brokers.set(handle,s)
 await refreshWorkerHeartbeatWriterBroker(handle);return handle
}
export async function refreshWorkerHeartbeatWriterBroker(handle:WorkerHeartbeatWriterBroker):Promise<void>{
 const s=state(handle);s.bridge.check('serve');if(s.closed||s.refreshing)return writerFail('writer_closed');s.refreshing=true
 try{
  const slots=s.bridge.current(),live=new Map(slots.map(slot=>[slotKey(slot),slot]))
  for(const [key,boot]of s.boots)if(!live.has(slotKey(boot.slot))||live.get(slotKey(boot.slot))!.role_oid!==boot.slot.role_oid){boot.revoked=true;boot.secret.fill(0);s.boots.delete(key)}
  await Promise.all([...s.peers].filter(p=>p.boot?.revoked).map(p=>closePeer(s,p)))
  s.bridge.check('serve')
  const selected=writerBootBatches(slots,s.issued);if(selected.blockedKnowledge)s.enrollmentError=true
  for(const rows of selected.batches){
   s.bridge.check('serve');const uid=s.bridge.settings.boot_uids.find(value=>!s.usedUids.has(value))
   if(uid===undefined){s.enrollmentError=true;break}
   // Only actually unused, exclusively reserved UIDs may be allocated. This
   // observation is supplemented by the explicit deployment reservation gate.
   assertWriterBootUidUnused(uid)
   const id=randomUUID(),items=rows.map(slot=>({slot,secret:secret()})),bindings=items.map(item=>({kind:item.slot.kind,slot_no:item.slot.slot_no,generation:item.slot.generation,role_oid:item.slot.role_oid,secret_sha256:hash(item.secret)}))
   // Consume UID/generations durably before any token file or hello can escape.
   s.bridge.persist('writer_boot_issued',{boot_id:id,uid,bindings});s.usedUids.add(uid);for(const slot of rows)s.issued.add(slotKey(slot))
   const deliveries=items.map(item=>{s.bridge.check('serve');return stageWriterBootCredential(id,{protocol:writerBootProtocol,kind:item.slot.kind,uid,generation:item.slot.generation,secret:item.secret})})
   s.bridge.check('serve');stageWriterBootBatchDescriptor(id,deliveries);s.bridge.persist('writer_boot_staged',{boot_id:id,uid,bindings});s.bridge.check('serve')
   for(const item of items)s.boots.set(slotKey(item.slot),{id,uid,slot:item.slot,secret:Buffer.from(item.secret),claimed:false,revoked:false})
  }
  s.paused=false
 }catch{s.enrollmentError=true;throw new WorkerHeartbeatWriterError('writer_not_enrolled')}finally{s.refreshing=false}
}
async function closePeer(s:Broker,p:Peer):Promise<void>{
 if(p.cleanup)return p.cleanup
 p.open=false;p.permit=undefined;if(p.timer)clearTimeout(p.timer);p.socket.destroy();if(p.boot)p.boot.revoked=true
 p.cleanup=(async()=>{
  if(p.backend)await s.bridge.close(p.backend)
  if(p.work)await p.work.catch(()=>{})
  if(p.backend)await s.bridge.close(p.backend)
  s.peers.delete(p)
 })()
 return p.cleanup
}
function reply(p:Peer,request:string,ok:boolean,value:unknown){if(p.open&&p.socket.writable)p.socket.write(writerEncode({protocol:writerProtocol,request_id:request,ok,value}))}
async function bind(s:Broker,p:Peer,request:string,provided:string){
 s.bridge.check('serve');if(s.paused||s.bridge.busy())return writerFail('writer_busy')
 if(p.boot)return writerFail()
 const bytes=Buffer.from(provided),boot=[...s.boots.values()].find(value=>value.slot.kind===p.kind&&!value.revoked&&!value.claimed&&value.secret.length===bytes.length&&timingSafeEqual(value.secret,bytes));bytes.fill(0)
 if(!boot)return writerFail('writer_not_enrolled')
 boot.claimed=true;boot.secret.fill(0);p.boot=boot;p.binding=secret()
 s.bridge.persist('writer_boot_claimed',{boot_id:boot.id,uid:boot.uid,kind:p.kind,slot_no:boot.slot.slot_no,generation:boot.slot.generation,role_oid:boot.slot.role_oid,binding_id:p.binding})
 p.backend=await s.bridge.open(boot.slot.reference);peerCurrent(s,p)
 p.permit=secret();reply(p,request,true,{binding_id:p.binding,instance_id:s.bridge.instance_id,generation:boot.slot.generation,next_permit:p.permit})
}
async function report(s:Broker,p:Peer,request:string,binding:string,permit:string,value:WorkerHeartbeatReport){
 s.bridge.check('cleanup')
 if(!p.boot||p.boot.revoked||!p.backend||p.binding!==binding||!p.permit||!timingSafeEqual(Buffer.from(p.permit),Buffer.from(permit))||value.generation!==p.boot.slot.generation||value.sequence<=p.lastSequence)return writerFail()
 // An issued permit is consumed synchronously, before any await or reentry.
 p.permit=undefined;p.lastSequence=value.sequence
 if(s.paused||s.active||s.bridge.busy()){
  p.permit=secret();reply(p,request,false,{code:'writer_busy',not_dispatched:true,settled:true,next_permit:p.permit});return
 }
 peerCurrent(s,p);s.active=p
 try{
  const ack=await s.bridge.record(p.backend,value);peerCurrent(s,p)
  p.permit=secret();reply(p,request,true,{...ack,next_permit:p.permit})
 }catch(error){
  // A Root bridge rejection is returned only after owned cleanup is known.
  // If cleanup is itself uncertain closePeer rejects, so no settled ACK leaves.
  if(p.boot)p.boot.revoked=true
  if(p.backend)await s.bridge.close(p.backend)
  reply(p,request,false,{code:error instanceof WorkerHeartbeatWriterError?error.code:'writer_uncertain',not_dispatched:false,settled:true})
  p.socket.end()
 }finally{if(s.active===p)s.active=undefined}
}
function accept(s:Broker,kind:WorkerHeartbeatKind,socket:net.Socket){
 if(s.closed||[...s.peers].filter(p=>p.kind===kind).length>=writerLimits.peersPerKind){socket.destroy();return}
 const p:Peer={socket,kind,open:true,busy:false,lastSequence:0};s.peers.add(p);let bytes=Buffer.alloc(0)
 const disconnect=()=>{void closePeer(s,p).catch(()=>{s.paused=true})};socket.on('error',()=>{});socket.once('close',disconnect)
 p.timer=setTimeout(disconnect,writerLimits.sendMs)
 socket.on('data',(chunk:Buffer)=>{
  if(!p.open||p.busy){socket.destroy();return}bytes=Buffer.concat([bytes,chunk]);if(bytes.length>writerLimits.frameBytes+4){socket.destroy();return}
  if(bytes.length<4)return;const size=bytes.readUInt32BE(0);if(size<1||size>writerLimits.frameBytes){socket.destroy();return}if(bytes.length<size+4)return;if(bytes.length!==size+4){socket.destroy();return}
  const raw=bytes.subarray(4);bytes=Buffer.alloc(0);p.busy=true;if(p.timer)clearTimeout(p.timer)
  const deadline=performance.now()+writerLimits.sendMs;p.timer=setTimeout(()=>{if(p.boot)p.boot.revoked=true;disconnect()},writerLimits.sendMs)
  p.work=(async()=>{
   let request:string|undefined
   try{
    s.bridge.check('cleanup');const message=parseWriterRequest(writerDecode(raw));request=message.request_id
    if(performance.now()>=deadline)return writerFail('writer_deadline')
    if(message.op==='bind')await bind(s,p,request,message.boot_secret)
    else await report(s,p,request,message.binding_id,message.permit,message.report)
   }catch(error){
    // Framing/auth failures are terminal. Known no-SQL failure can be replied
    // without inventing a DB acknowledgement or another generation/permit.
    if(request&&p.open&&!p.backend)reply(p,request,false,{code:error instanceof WorkerHeartbeatWriterError?error.code:'writer_closed',not_dispatched:true,settled:true})
    socket.end();if(p.boot)p.boot.revoked=true
   }finally{p.busy=false;if(p.timer)clearTimeout(p.timer);p.timer=undefined}
  })()
 })
}
export async function serveWorkerHeartbeatWriterBroker(handle:WorkerHeartbeatWriterBroker):Promise<void>{
 const s=state(handle);s.bridge.check('serve');if(s.closed||s.servers.size)return writerFail('writer_closed')
 try{
 ensureDirectory(writerPaths.sockets,0o711,0)
 for(const {kind,gid}of s.bridge.settings.groups){
  s.bridge.check('serve');ensureDirectory(path.dirname(writerSocketPath(kind)),0o710,gid)
  const file=writerSocketPath(kind);try{fs.lstatSync(file);return writerFail('writer_not_enrolled')}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error}
  const server=net.createServer(socket=>accept(s,kind,socket));s.servers.add(server);server.on('error',()=>{s.paused=true})
  server.maxConnections=writerLimits.peersPerKind
  const mask=process.umask(0o077)
  try{await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(file,()=>{server.off('error',reject);resolve()})})}finally{process.umask(mask)}
  s.bridge.check('serve');fs.chownSync(file,0,gid);fs.chmodSync(file,0o660);const st=fs.lstatSync(file)
  if(!st.isSocket()||st.isSymbolicLink()||st.uid!==0||st.gid!==gid||(st.mode&0o7777)!==0o660)return writerFail('writer_not_enrolled')
 }
 }catch(error){await closeWorkerHeartbeatWriterBroker(handle);throw error}
}
export async function pauseWorkerHeartbeatWriterBroker(handle:WorkerHeartbeatWriterBroker):Promise<void>{
 const s=state(handle);s.bridge.check('cleanup');s.paused=true
 await Promise.all([...s.peers].filter(p=>p.busy||p===s.active).map(p=>{if(p.boot)p.boot.revoked=true;return closePeer(s,p)}))
 s.bridge.check('cleanup')
}
export async function closeWorkerHeartbeatWriterBroker(handle:WorkerHeartbeatWriterBroker):Promise<void>{
 const s=state(handle),old=closures.get(handle);if(old)return old;s.closed=true;s.paused=true
 const promise=(async()=>{
  const servers=[...s.servers].filter(server=>server.listening).map(server=>new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve())))
  await Promise.all([...s.peers].map(p=>closePeer(s,p)));await Promise.all(servers)
  for(const boot of s.boots.values())boot.secret.fill(0);s.boots.clear();s.servers.clear()
 })();closures.set(handle,promise);return promise
}
