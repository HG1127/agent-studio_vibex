import type {Pool} from 'pg'
import type {CompleteProfileSnapshot} from './pg18-complete-profile-source.mjs'
export type CompleteProfileOperatorRuntimeManifest=Readonly<{
  format:'agent_descriptive_patch_operator_runtime_v1';lock_sha256:string;pg_version:'8.23.1'
  packages:readonly Readonly<{name:string;version:string}>[]
  files:readonly Readonly<{path:string;sha256:string;bytes:number}>[]
}>
declare const verifiedRuntime:unique symbol
export type CompleteProfileOperatorRuntimeCapability=Readonly<{[verifiedRuntime]:true}>
export const completeProfileOperatorRuntimePolicy:Readonly<{
  format:'agent_descriptive_patch_operator_runtime_v1';lock_sha256:string;pg_version:'8.23.1'
  packages:Readonly<Record<string,Readonly<{version:string;entry:string;dependencies:readonly string[]}>>>
}>
export function parseCompleteProfileOperatorRuntimeManifest(raw:string|Uint8Array,expectedManifestSha256:string,expectedLockSha256:string):CompleteProfileOperatorRuntimeManifest
export function assertCompleteProfileOperatorRuntimeEnvironment(env:Readonly<Record<string,string|undefined>>,execArgv:readonly string[]):void
export function assertCompleteProfileOperatorRuntimeMetadata(raw:Readonly<{type:string;symlink:boolean;uid:number;gid:number;mode:number;nlink:number;size:number}>,kind:'ancestor'|'directory'|'code'|'manifest'|'private-directory'):void
export function assertCompleteProfileOperatorRuntimeStable(before:Readonly<Record<'dev'|'ino'|'mode'|'uid'|'gid'|'nlink'|'size'|'mtimeMs'|'ctimeMs',number>>,after:Readonly<Record<'dev'|'ino'|'mode'|'uid'|'gid'|'nlink'|'size'|'mtimeMs'|'ctimeMs',number>>):void
export function assertCompleteProfileOperatorRuntimeInventory(expected:readonly string[],actual:readonly string[]):void
export function assertCompleteProfileOperatorRuntimeCacheRecord(module:unknown,expectedFile:string,previousModule?:unknown,previousExports?:unknown):void
export function verifyCompleteProfileOperatorRuntime(snapshot:CompleteProfileSnapshot,expectedSourceSha256:string,options:Readonly<{manifestFile:string;manifestSha256:string;lockSha256:string}>):CompleteProfileOperatorRuntimeCapability
export function assertCompleteProfileOperatorRuntime(capability:CompleteProfileOperatorRuntimeCapability):void
export function resolveCompleteProfileOperatorRuntimeModule(manifest:CompleteProfileOperatorRuntimeManifest,from:string,specifier:string,conditions?:readonly string[]):Readonly<{builtin:string}>|Readonly<{path:string;format:'commonjs'|'json'}>
export function loadCompleteProfileOperatorPg(capability:CompleteProfileOperatorRuntimeCapability):Readonly<{Pool:typeof Pool}>

export function isCompleteProfileInitializerDriverRequest(from:unknown,specifier:unknown,conditions:unknown):boolean
export function isCompleteProfileFirstAdminDriverRequest(from:unknown,specifier:unknown,conditions:unknown):boolean
