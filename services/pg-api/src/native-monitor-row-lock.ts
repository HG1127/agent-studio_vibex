// Closed 074 lock/read ports. No table name, SQL fragment or owner claim is authority.
// The surrounding verified Actor transaction retains every acquired lock.
import {HttpError,type SqlClient} from './contracts.ts'
import {ownId} from './own-operations-contract.ts'
import {assertOwnedAdmissionContext} from './repository.ts'
const queries={
 case:'SELECT agentstudio.monitor_live_case_read_lock($1::uuid,$2::uuid,$3::boolean) AS value',
 monitor:'SELECT agentstudio.monitor_live_monitor_read_lock($1::uuid,$2::uuid,$3::boolean) AS value',
 check:'SELECT agentstudio.monitor_live_check_read_lock($1::uuid,$2::uuid,$3::boolean) AS value',
} as const
async function locked(db:SqlClient,kind:keyof typeof queries,owner:string,id:string,update:boolean):Promise<Record<string,unknown>|null>{
 ownId(owner);ownId(id)
 if(typeof update!=='boolean')throw new HttpError(400,'invalid_monitor_read_lock')
 await assertOwnedAdmissionContext(db,owner)
 const rows=(await db.query<{value:unknown}>(queries[kind],[id,owner,update])).rows
 if(!Array.isArray(rows)||rows.length!==1||!rows[0]||Object.keys(rows[0]).join(',')!=='value')throw new HttpError(503,'monitor_history_integrity_error')
 const value=rows[0].value
 if(value===null)return null
 if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value))||Object.getOwnPropertyDescriptor(value,'id')?.value!==id)throw new HttpError(503,'monitor_history_integrity_error')
 return value as Record<string,unknown>
}
export const readMonitorCaseLocked=(db:SqlClient,owner:string,id:string,update=false)=>locked(db,'case',owner,id,update)
export const readMonitorRowLocked=(db:SqlClient,owner:string,id:string,update=false)=>locked(db,'monitor',owner,id,update)
export const readMonitorCheckLocked=(db:SqlClient,owner:string,id:string,update=false)=>locked(db,'check',owner,id,update)
