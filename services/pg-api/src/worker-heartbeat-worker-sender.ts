// Fixed-kind real IPC factory. A caller cannot inject a transport or a clock.
import type {WorkerHeartbeatKind} from './worker-heartbeat-contract.ts'
import type {WorkerHeartbeatReportSender} from './worker-heartbeat-bounded-reporter.ts'
import {openWorkerHeartbeatWorkerBinding,describeWorkerHeartbeatWorkerBinding,sendWorkerHeartbeatBoundReport,snapshotWorkerHeartbeatWorkerBinding,closeWorkerHeartbeatWorkerBinding,type WorkerHeartbeatBindingSnapshot} from './worker-heartbeat-worker-binding.ts'

export type WorkerHeartbeatWorkerSender=Readonly<{generation:string;send:WorkerHeartbeatReportSender;snapshot():WorkerHeartbeatBindingSnapshot;close():WorkerHeartbeatBindingSnapshot}>
export async function openWorkerHeartbeatWorkerSender(kind:WorkerHeartbeatKind):Promise<WorkerHeartbeatWorkerSender>{
 const binding=await openWorkerHeartbeatWorkerBinding(kind),description=describeWorkerHeartbeatWorkerBinding(binding)
 return Object.freeze({generation:description.generation,send:(report,options)=>sendWorkerHeartbeatBoundReport(binding,report,options),snapshot:()=>snapshotWorkerHeartbeatWorkerBinding(binding),close:()=>closeWorkerHeartbeatWorkerBinding(binding)})
}
