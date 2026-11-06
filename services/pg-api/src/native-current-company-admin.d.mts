import type {SqlPool} from './contracts.ts'
declare const contextBrand: unique symbol
export interface NativeCompanyAdminContext {readonly [contextBrand]:true}
export class NativeCompanyAdminError extends Error {
  readonly status:number
  readonly code:string
  constructor(status:number,code:string)
}
/** Internal auth-pool guard only. No telemetry authorization or activation. */
export class NativeCurrentCompanyAdmin {
  constructor(authPool:SqlPool)
  authorize(token:string):Promise<NativeCompanyAdminContext>
  assertBeforeRead(token:string,context:NativeCompanyAdminContext):void
  confirmAfterRead(token:string,context:NativeCompanyAdminContext):Promise<void>
}
