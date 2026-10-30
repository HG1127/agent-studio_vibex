import type {Pool} from 'pg'
import type {WorkerHeartbeatActivationControlSources} from './worker-heartbeat-activation-control-source.mjs'
export type WorkerHeartbeatActivationControlRuntimeManifest=Readonly<{
  format:'worker_heartbeat_activation_control_runtime_v1';lock_sha256:string;pg_version:'8.23.1'
  packages:readonly Readonly<{name:string;version:string}>[]
  files:readonly Readonly<{path:string;sha256:string;bytes:number}>[]
}>
declare const verifiedRuntime:unique symbol
export type WorkerHeartbeatActivationControlRuntimeCapability=Readonly<{[verifiedRuntime]:true}>
export const workerHeartbeatActivationControlRuntimePolicy:Readonly<{
  format:'worker_heartbeat_activation_control_runtime_v1';lock_sha256:string;pg_version:'8.23.1'
  packages:Readonly<Record<string,Readonly<{version:string;entry:string;dependencies:readonly string[]}>>>
}>
export function parseWorkerHeartbeatActivationControlRuntimeManifest(raw:string|Uint8Array,expectedManifestSha256:string,expectedLockSha256:string):WorkerHeartbeatActivationControlRuntimeManifest
export function assertWorkerHeartbeatActivationControlRuntimeEnvironment(env:Readonly<Record<string,string|undefined>>,execArgv:readonly string[]):void
export function assertWorkerHeartbeatActivationControlRuntimeMetadata(raw:Readonly<{type:string;symlink:boolean;uid:number;gid:number;mode:number;nlink:number;size:number}>,kind:'ancestor'|'directory'|'code'|'manifest'|'private-directory'):void
export function assertWorkerHeartbeatActivationControlRuntimeStable(before:Readonly<Record<'dev'|'ino'|'mode'|'uid'|'gid'|'nlink'|'size'|'mtimeMs'|'ctimeMs',number>>,after:Readonly<Record<'dev'|'ino'|'mode'|'uid'|'gid'|'nlink'|'size'|'mtimeMs'|'ctimeMs',number>>):void
export function assertWorkerHeartbeatActivationControlRuntimeInventory(expected:readonly string[],actual:readonly string[]):void
export function assertWorkerHeartbeatActivationControlRuntimeCacheRecord(module:unknown,expectedFile:string,previousModule?:unknown,previousExports?:unknown):void
export function verifyWorkerHeartbeatActivationControlRuntime(snapshot:WorkerHeartbeatActivationControlSources,expectedSourceSha256:string,options:Readonly<{manifestFile:string;manifestSha256:string;lockSha256:string}>):WorkerHeartbeatActivationControlRuntimeCapability
export function assertWorkerHeartbeatActivationControlRuntime(capability:WorkerHeartbeatActivationControlRuntimeCapability):void
export function resolveWorkerHeartbeatActivationControlRuntimeModule(manifest:WorkerHeartbeatActivationControlRuntimeManifest,from:string,specifier:string,conditions?:readonly string[]):Readonly<{builtin:string}>|Readonly<{path:string;format:'commonjs'|'json'}>
export function loadWorkerHeartbeatActivationControlPg(capability:WorkerHeartbeatActivationControlRuntimeCapability):Readonly<{Pool:typeof Pool;Client:typeof import('pg').Client}>
