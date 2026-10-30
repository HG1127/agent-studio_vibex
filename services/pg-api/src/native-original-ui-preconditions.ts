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
