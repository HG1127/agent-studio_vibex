
import {verifyOriginalStaff084Schema} from './original-staff-audit084.mjs'
/** Real rows only. A named complete profile receives its own whole-catalog audit.
 * Default standalone084 still executes its untouched strict auditor. */
export async function verifyOriginalStaffCompatible084Schema(db){
 const rows=(await db.query("SELECT description FROM agentstudio.schema_migrations WHERE version='pg18_employee_staff084_composite_001'")).rows
 if(!Array.isArray(rows)||rows.length>1)throw Error('staff_composite_receipt_unavailable')
 if(rows.length===0)return await verifyOriginalStaff084Schema(db)
 const {verifyEmployeeStaff084AuthClient}=await import('./employee-staff084-profile.mjs')
 await verifyEmployeeStaff084AuthClient(db)
}
