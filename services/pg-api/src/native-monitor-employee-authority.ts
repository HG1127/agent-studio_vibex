// Employee-only author/review entry shared by business writes and monitoring.
// Native052 Actor epoch does not turn an execution login into an employee.
import {HttpError,type SqlClient} from './contracts.ts'
import {ownDatabaseCount} from './own-operations-contract.ts'
import {assertOwnedAdmissionContext} from './repository.ts'
export async function requireMonitorEmployeeAuthority(db:SqlClient,owner:string):Promise<number>{
 await assertOwnedAdmissionContext(db,owner)
 const rows=(await db.query<{epoch:unknown;api_only:boolean}>("SELECT agentstudio.agent_memory_outcome_epoch() AS epoch,NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles r WHERE (r.rolsuper OR r.rolbypassrls OR r.rolname ~ '^agentstudio_.*(worker|dispatch|broker)$') AND pg_has_role(session_user,r.oid,'MEMBER')) AS api_only")).rows
 if(rows.length!==1||rows[0]?.api_only!==true)throw new HttpError(403,'monitor_employee_review_required')
 if(rows[0]?.epoch===null)throw new HttpError(401,'session_required')
 const epoch=ownDatabaseCount(rows[0]?.epoch);if(epoch<1)throw new HttpError(401,'session_required');return epoch
}
