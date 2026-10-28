export type WorkerHeartbeatActivationControlSources=Readonly<{
 source_sha256:string
 manifest:Readonly<{format:'worker_heartbeat_activation_control_sources_v1';parser:Readonly<{name:'typescript';version:'5.9.3';sha256:string}>;sources:readonly Readonly<{path:string;sha256:string}>[];imports:readonly Readonly<{from:string;to:string}>[];externals:readonly string[]}>
}>
export function captureWorkerHeartbeatActivationControlSources():Promise<WorkerHeartbeatActivationControlSources>
export function assertWorkerHeartbeatActivationControlSources(snapshot:unknown,expected:string):asserts snapshot is WorkerHeartbeatActivationControlSources
