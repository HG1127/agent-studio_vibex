import type {Pool} from 'pg'
import type {DescriptivePatchOperatorSnapshot} from './agent-descriptive-patch-operator-source.mjs'
export type DescriptivePatchOperatorRuntimeManifest=Readonly<{
  format:'agent_descriptive_patch_operator_runtime_v1';lock_sha256:string;pg_version:'8.23.1'
  packages:readonly Readonly<{name:string;version:string}>[]
  files:readonly Readonly<{path:string;sha256:string;bytes:number}>[]
}>
declare const verifiedRuntime:unique symbol
export type DescriptivePatchOperatorRuntimeCapability=Readonly<{[verifiedRuntime]:true}>
export const descriptivePatchOperatorRuntimePolicy:Readonly<{
  format:'agent_descriptive_patch_operator_runtime_v1';lock_sha256:string;pg_version:'8.23.1'
  packages:Readonly<Record<string,Readonly<{version:string;entry:string;dependencies:readonly string[]}>>>
}>
export function parseDescriptivePatchOperatorRuntimeManifest(raw:string|Uint8Array,expectedManifestSha256:string,expectedLockSha256:string):DescriptivePatchOperatorRuntimeManifest
export function assertDescriptivePatchOperatorRuntimeEnvironment(env:Readonly<Record<string,string|undefined>>,execArgv:readonly string[]):void
export function assertDescriptivePatchOperatorRuntimeMetadata(raw:Readonly<{type:string;symlink:boolean;uid:number;gid:number;mode:number;nlink:number;size:number}>,kind:'ancestor'|'directory'|'code'|'manifest'|'private-directory'):void
export function assertDescriptivePatchOperatorRuntimeStable(before:Readonly<Record<'dev'|'ino'|'mode'|'uid'|'gid'|'nlink'|'size'|'mtimeMs'|'ctimeMs',number>>,after:Readonly<Record<'dev'|'ino'|'mode'|'uid'|'gid'|'nlink'|'size'|'mtimeMs'|'ctimeMs',number>>):void
export function assertDescriptivePatchOperatorRuntimeInventory(expected:readonly string[],actual:readonly string[]):void
export function assertDescriptivePatchOperatorRuntimeCacheRecord(module:unknown,expectedFile:string,previousModule?:unknown,previousExports?:unknown):void
export function verifyDescriptivePatchOperatorRuntime(snapshot:DescriptivePatchOperatorSnapshot,expectedSourceSha256:string,options:Readonly<{manifestFile:string;manifestSha256:string;lockSha256:string}>):DescriptivePatchOperatorRuntimeCapability
export function assertDescriptivePatchOperatorRuntime(capability:DescriptivePatchOperatorRuntimeCapability):void
export function resolveDescriptivePatchOperatorRuntimeModule(manifest:DescriptivePatchOperatorRuntimeManifest,from:string,specifier:string,conditions?:readonly string[]):Readonly<{builtin:string}>|Readonly<{path:string;format:'commonjs'|'json'}>
export function loadDescriptivePatchOperatorPg(capability:DescriptivePatchOperatorRuntimeCapability):Readonly<{Pool:typeof Pool}>
