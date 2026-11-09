export type NativeEmployeeInventoryScope={owner:string;epoch:number}
export type NativeEmployeeDevice={backend:'native_pg';id:string;name:string;revoked:boolean;seen_ms:number;catalog:string;catalog_sha256:string;version:number;paired:boolean;pairing_expires_ms:number}
export type NativeEmployeeInventory={backend:'native_pg';owner:string;epoch:number;items:NativeEmployeeDevice[]}
export class NativeEmployeeInventoryError extends Error{readonly status:number;readonly code:string;constructor(status:number,code:string)}
export function readNativeEmployeeInventory(value:unknown,expected:NativeEmployeeInventoryScope):NativeEmployeeDevice[]
export function createNativeEmployeeInventoryReader(options:{transport?:typeof fetch;getContext:()=>NativeEmployeeInventoryScope;timeoutMs?:number}):{read(signal?:AbortSignal,expected?:NativeEmployeeInventoryScope):Promise<NativeEmployeeInventory>}
export function createNativeEmployeeLiveInventoryReader(options:Parameters<typeof createNativeEmployeeInventoryReader>[0]):ReturnType<typeof createNativeEmployeeInventoryReader>
