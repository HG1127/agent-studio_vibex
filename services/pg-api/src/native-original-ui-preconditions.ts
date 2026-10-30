import type {IncomingMessage} from 'node:http'
import {HttpError,isUuid} from './contracts.ts'

/** An account-switch precondition, never an authentication credential. */
export function expectedOriginalUiEmployee(req:IncomingMessage):string{
  const expected=req.headers['x-agentstudio-expected-employee']
  if(typeof expected!=='string'||!isUuid(expected))throw new HttpError(400,'invalid_original_ui_employee_precondition')
  return expected.toLowerCase()
}
/** Call inside withActor, after actual Cookie identity has resolved in SQL. */
export function assertOriginalUiEmployee(actual:string,expected?:string):void{
  if(expected===undefined)return
  if(!isUuid(expected))throw new HttpError(400,'invalid_original_ui_employee_precondition')
  if(actual.toLowerCase()!==expected.toLowerCase())throw new HttpError(409,'employee_session_changed')
}

/** Optional strict account-switch condition; absence preserves reference callers. */
export function optionalExpectedOriginalUiEmployee(req:IncomingMessage):string|undefined{
 const expected=req.headers['x-agentstudio-expected-employee'],raw=req.rawHeaders??[]
 const invalid=():never=>{throw new HttpError(400,'invalid_original_ui_employee_precondition')}
 if(!Array.isArray(raw)||raw.length%2!==0)return invalid()
 let count=0,value:string|undefined
 for(let i=0;i<raw.length;i+=2){const name=raw[i],item=raw[i+1];if(typeof name!=='string'||typeof item!=='string')return invalid();if(name.toLowerCase()==='x-agentstudio-expected-employee'){count++;value=item}}
 if(expected===undefined){if(count!==0)return invalid();return undefined}
 if(typeof expected!=='string'||count!==1||value!==expected)return invalid()
 return expectedOriginalUiEmployee(req)
}
