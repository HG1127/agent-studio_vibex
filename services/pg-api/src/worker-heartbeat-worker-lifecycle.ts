// Entry-owned caller attestations only. No fake startup/claim/ACK proof is
// accepted as an authority factory; each actual entry owns the check ordering.
import type {WorkerHeartbeatKind} from './worker-heartbeat-contract.ts'
import {createWorkerHeartbeatBoundedReporter,type WorkerHeartbeatBoundedReporterSnapshot} from './worker-heartbeat-bounded-reporter.ts'
import {openWorkerHeartbeatWorkerSender} from './worker-heartbeat-worker-sender.ts'
import {writerLimits,writerKind,writerFail} from './worker-heartbeat-writer-protocol.ts'

export type WorkerHeartbeatWorkerLifecycle=Readonly<{startupChecksComplete():void;loopUnavailable():void;newClaimsClosed():void;close():WorkerHeartbeatBoundedReporterSnapshot}>
export async function openWorkerHeartbeatWorkerLifecycle(rawKind:WorkerHeartbeatKind):Promise<WorkerHeartbeatWorkerLifecycle|null>{
 const kind=writerKind(rawKind),enabled=process.env.AGENT_STUDIO_PG_WORKER_HEARTBEAT_ENABLED
 if(enabled===undefined||enabled==='false')return null
 if(enabled!=='true')return writerFail('writer_not_enrolled')
 const sender=await openWorkerHeartbeatWorkerSender(kind)
 const reporter=createWorkerHeartbeatBoundedReporter({generation:sender.generation,intervalMs:writerLimits.intervalMs,sendDeadlineMs:writerLimits.sendMs,send:sender.send})
 let phase:'starting'|'ready'|'draining'|'closed'='starting'
 reporter.start()
 return Object.freeze({
  startupChecksComplete(){if(phase!=='starting')return;reporter.transition({type:'startup_checks_complete',completed:true});phase='ready'},
  loopUnavailable(){if(phase==='closed'||phase==='draining')return;reporter.transition({type:'loop_unavailable'})},
  newClaimsClosed(){if(phase==='closed'||phase==='draining')return;reporter.transition({type:'drain',new_claims_closed:true});phase='draining'},
  close(){if(phase!=='closed'){phase='closed';reporter.close();sender.close()}return reporter.snapshot()},
 })
}
