// One actual knowledge service, two original fixed-kind IPC senders. No
// transport/clock/capability injection, replay, new bind or deadline extension.
import {performance} from 'node:perf_hooks'
import {setTimeout,clearTimeout} from 'node:timers'
import {openWorkerHeartbeatWorkerSender,type WorkerHeartbeatWorkerSender} from './worker-heartbeat-worker-sender.ts'
import {createWorkerHeartbeatBoundedReporter,type WorkerHeartbeatReportSender,type WorkerHeartbeatBoundedReporterSnapshot} from './worker-heartbeat-bounded-reporter.ts'
import type {WorkerHeartbeatWorkerLifecycle} from './worker-heartbeat-worker-lifecycle.ts'
import {writerLimits,writerFail,WorkerHeartbeatWriterError} from './worker-heartbeat-writer-protocol.ts'
const now=performance.now.bind(performance)
type Waiting={sender:WorkerHeartbeatWorkerSender;cancel():void}
function knowledgeHeartbeatSendQueue(){
 let tail:Promise<void>=Promise.resolve()
 const closed=new WeakSet<WorkerHeartbeatWorkerSender>(),waiting=new Set<Waiting>()
 const wrap=(sender:WorkerHeartbeatWorkerSender):WorkerHeartbeatReportSender=>(report,options)=>{
  if(!(options.signal instanceof AbortSignal)||typeof options.timeoutMs!=='number'||!Number.isSafeInteger(options.timeoutMs)||options.timeoutMs<1||options.timeoutMs>writerLimits.sendMs||typeof options.deadlineMonotonicMs!=='number'||!Number.isFinite(options.deadlineMonotonicMs))return Promise.reject(new WorkerHeartbeatWriterError('writer_protocol_refused'))
  const predecessor=tail
  let resolve!:()=>void,reject!:(error:unknown)=>void,phase:'waiting'|'inflight'|'settled'|'cancelled'='waiting',timer:ReturnType<typeof setTimeout>|undefined
  const result=new Promise<void>((yes,no)=>{resolve=yes;reject=no})
  const finishWaiting=()=>{if(timer!==undefined){clearTimeout(timer);timer=undefined}options.signal.removeEventListener('abort',cancel);waiting.delete(item)}
  const cancel=()=>{if(phase!=='waiting')return;phase='cancelled';finishWaiting();reject(new WorkerHeartbeatWriterError(closed.has(sender)?'writer_closed':'writer_deadline'))}
  const item:Waiting={sender,cancel};waiting.add(item);options.signal.addEventListener('abort',cancel,{once:true})
  const deadline=Math.min(options.deadlineMonotonicMs,now()+options.timeoutMs)
  if(options.signal.aborted||closed.has(sender)||now()>=deadline)cancel()
  if(phase==='waiting')timer=setTimeout(cancel,Math.max(0,deadline-now()))
  const work=predecessor.then(async()=>{
   if(phase!=='waiting')return
   if(options.signal.aborted||closed.has(sender)||now()>=deadline){cancel();return}
   phase='inflight';finishWaiting()
   // Keep this gate until the ORIGINAL sender's whole I/O promise settles.
   // A caller's deadline/abort alone is not cleanup or permission to overlap.
   try{await sender.send(report,options);phase='settled';resolve()}catch(error){phase='settled';reject(error)}
  })
  tail=work.then(()=>{},()=>{})
  return result
 }
 return Object.freeze({wrap,close(sender:WorkerHeartbeatWorkerSender){closed.add(sender);for(const item of waiting)if(item.sender===sender)item.cancel()}})
}
function pairedLifecycle(sender:WorkerHeartbeatWorkerSender,queue:ReturnType<typeof knowledgeHeartbeatSendQueue>){
 const reporter=createWorkerHeartbeatBoundedReporter({generation:sender.generation,intervalMs:writerLimits.intervalMs,sendDeadlineMs:writerLimits.sendMs,send:queue.wrap(sender)})
 let phase:'starting'|'ready'|'draining'|'closed'='starting'
 const lifecycle:WorkerHeartbeatWorkerLifecycle=Object.freeze({
  startupChecksComplete(){if(phase!=='starting')return;reporter.transition({type:'startup_checks_complete',completed:true});phase='ready'},
  loopUnavailable(){if(phase==='closed'||phase==='draining')return;reporter.transition({type:'loop_unavailable'})},
  newClaimsClosed(){if(phase==='closed'||phase==='draining')return;reporter.transition({type:'drain',new_claims_closed:true});phase='draining'},
  close():WorkerHeartbeatBoundedReporterSnapshot{if(phase!=='closed'){phase='closed';reporter.close();queue.close(sender);sender.close()}return reporter.snapshot()},
 })
 return {lifecycle,start:()=>reporter.start()}
}
function observeKnowledgeHeartbeatFailure(phase:string,error:unknown){
 try{if(!['open_index_sender','open_query_sender','prepare_reporters','start_reporters'].includes(phase))return
  const descriptor=error&&(typeof error==='object'||typeof error==='function')?Object.getOwnPropertyDescriptor(error,'code'):undefined,code=descriptor&&'value'in descriptor?descriptor.value:undefined
  const bounded=typeof code==='string'&&['writer_protocol_refused','writer_not_enrolled','writer_busy','writer_closed','writer_uncertain','writer_deadline','writer_io_failed'].includes(code)?code:null
  process.stderr.write(JSON.stringify({event:'knowledge_heartbeat_failure_observation',phase,code:bounded,observed_data_only:true})+'\n')
 }catch{}
}
export async function openKnowledgeWorkerHeartbeatLifecycles(selection:{index:boolean;query:boolean},signal:AbortSignal):Promise<{index:WorkerHeartbeatWorkerLifecycle|null;query:WorkerHeartbeatWorkerLifecycle|null}>{
 const enabled=process.env.AGENT_STUDIO_PG_WORKER_HEARTBEAT_ENABLED,empty={index:null,query:null}
 if(enabled===undefined||enabled==='false')return empty
 if(enabled!=='true'||typeof selection.index!=='boolean'||typeof selection.query!=='boolean'||!(signal instanceof AbortSignal))return writerFail('writer_not_enrolled')
 const senders:WorkerHeartbeatWorkerSender[]=[],prepared:ReturnType<typeof pairedLifecycle>[]=[],queue=knowledgeHeartbeatSendQueue();let phase='open_index_sender'
 try{
  let index:WorkerHeartbeatWorkerSender|undefined,query:WorkerHeartbeatWorkerSender|undefined
  if(selection.index&&!signal.aborted){phase='open_index_sender';index=await openWorkerHeartbeatWorkerSender('knowledge_index');senders.push(index)}
  if(selection.query&&!signal.aborted){phase='open_query_sender';query=await openWorkerHeartbeatWorkerSender('knowledge_query');senders.push(query)}
  if(signal.aborted){for(const sender of senders)sender.close();return empty}
  phase='prepare_reporters'
  const first=index?pairedLifecycle(index,queue):null;if(first)prepared.push(first)
  const second=query?pairedLifecycle(query,queue):null;if(second)prepared.push(second)
  phase='start_reporters';for(const item of prepared)item.start()
  return {index:first?.lifecycle??null,query:second?.lifecycle??null}
 }catch(error){for(const item of prepared)item.lifecycle.close();for(const sender of senders)sender.close();if(signal.aborted)return empty;observeKnowledgeHeartbeatFailure(phase,error);throw error}
}
