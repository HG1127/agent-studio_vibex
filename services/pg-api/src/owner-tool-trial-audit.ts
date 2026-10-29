// New069 extension only. Existing Native/base guards remain mandatory in place.
// No HTTP flag or caller-supplied verifier can bless the catalog.
import type {SqlClient,SqlPool} from './contracts.ts'
import {verifyOwnerToolTrialCore} from './owner-tool-trial-audit-core.ts'
import {ownOperationsGuardSql} from './own-operations-repository.ts'
export async function verifyOwnerToolTrialCredentials(db:SqlClient):Promise<boolean>{
 try{
  if(await verifyOwnerToolTrialCore(db)!==true)return false
  const rows=(await db.query<{ok:boolean}>(ownOperationsGuardSql)).rows
  if(rows.length===1&&rows[0]?.ok===true)return true
 }catch{}
 throw Error('unsafe_owner_tool_trial_privileges')
}
export async function inspectOwnerToolTrialSchema(pool:SqlPool):Promise<boolean>{
 const db=await pool.connect();let begun=false
 try{await db.query('BEGIN READ ONLY');begun=true;await db.query('SET LOCAL ROLE agentstudio_api');return await verifyOwnerToolTrialCredentials(db)}
 finally{try{if(begun)await db.query('ROLLBACK')}finally{db.release()}}
}
