import type {LocalIntent,LocalReply,LocalJob} from './native-local-device-contract.mjs'
export type NativeDirectoryScope={owner:string;epoch:number}
export type NativeDirectoryHandle=Readonly<{requestId:string;scope:Readonly<NativeDirectoryScope>}>
export type NativeDirectoryApi={record:(v:LocalIntent,signal?:AbortSignal)=>Promise<LocalReply>;confirm:(v:LocalIntent,signal?:AbortSignal)=>Promise<LocalReply>;getJob:(id:string,signal?:AbortSignal)=>Promise<LocalJob>}
export class NativeDirectoryError extends Error{readonly code:string;readonly status:number;constructor(code:string,status?:number)}
export function createNativeDirectoryJobs(options:{createApi:(options:{transport:typeof fetch;rootPath:'/__pg_native'})=>NativeDirectoryApi;transport?:typeof fetch;getContext:()=>NativeDirectoryScope;randomUUID?:()=>string}):{begin:(v:{deviceId:string;requestId:string;root:string;path:string},expected?:NativeDirectoryScope)=>NativeDirectoryHandle;submit:(handle:NativeDirectoryHandle,signal?:AbortSignal)=>Promise<string>;get:(handle:NativeDirectoryHandle,signal?:AbortSignal)=>Promise<LocalJob>;cancel:(handle:NativeDirectoryHandle,signal?:AbortSignal)=>Promise<LocalReply>;invalidate:()=>void}
