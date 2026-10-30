import type {SqlPool} from './contracts.ts'
import type {ModelConnectionRepository} from './model-connection-repository.ts'
import {verifyDatabaseRole} from './repository.ts'
import {verifyApprovalDelegationCredentials} from './approval-delegation-audit.ts'
import {verifyNativeLocalDeviceSchema} from './native-local-device-audit.ts'
import {verifyAgentCallerCredentials} from './agent-caller-audit.ts'
import {verifyOwnerToolTrialCredentials} from './owner-tool-trial-audit.ts'
import {verifyModelConfigReceiptSchema075} from './model-config-receipt-schema075.ts'
import {prepareModelConfigReceipts075} from './model-config-receipt-runtime.ts'

/** Dedicated optional075 readiness, not the frozen complete069 identifier.
 * Calls the same four actual069 auditors on the original authenticated client.
 * Never filters catalogs, changes roles/grants, substitutes a verifier or DDL. */
export async function auditModelConfigReceipt075After069(pool:SqlPool):Promise<void>{
 await verifyDatabaseRole(pool)
 const db=await pool.connect();let begun=false,primary:unknown
 try{
  await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');begun=true
  const session=(await db.query<{safe:boolean}>("SELECT current_user=session_user AND r.rolcanlogin AND NOT r.rolinherit AND NOT r.rolsuper AND NOT r.rolbypassrls AND NOT r.rolcreatedb AND NOT r.rolcreaterole AND NOT r.rolreplication AND r.rolconfig IS NULL AND r.rolvaliduntil IS NULL AND "+
   "(SELECT count(*) FROM pg_catalog.pg_auth_members WHERE member=r.oid)=1 AND (SELECT count(*) FROM pg_catalog.pg_roles p WHERE p.oid<>r.oid AND pg_has_role(r.oid,p.oid,'MEMBER'))=1 AND EXISTS(SELECT 1 FROM pg_catalog.pg_auth_members m JOIN pg_catalog.pg_roles p ON p.oid=m.roleid WHERE m.member=r.oid AND p.rolname='agentstudio_api' AND NOT m.admin_option AND NOT m.inherit_option AND m.set_option) AS safe FROM pg_catalog.pg_roles r WHERE r.rolname=session_user")).rows
  if(session.length!==1||session[0]?.safe!==true)throw Error('model_config_receipt075_actual_api_login_required')
  await db.query('SET LOCAL ROLE agentstudio_api');await db.query("SET LOCAL search_path=pg_catalog,public");await db.query("SET LOCAL lock_timeout='3s'");await db.query("SET LOCAL statement_timeout='8s'")
  if(await verifyApprovalDelegationCredentials(db)!==true||await verifyNativeLocalDeviceSchema(db)!==true||await verifyAgentCallerCredentials(db)!==true||await verifyOwnerToolTrialCredentials(db)!==true)throw Error('model_config_receipt075_original069_audit_required')
  await verifyModelConfigReceiptSchema075(db)
 }catch(error){primary=error;throw error}finally{try{if(begun)await db.query('ROLLBACK')}catch{if(primary===undefined)throw Error('model_config_receipt075_startup_rollback_required')}finally{db.release()}}
}
/** Absent075 stays default-off. Installed075 always requires actual069/role
 * audits, including when only recovery GET is enabled. No environment opt-out. */
export async function prepareModelConfigReceipts075After069(options:{models:ModelConnectionRepository;configurationWrites:boolean;env:NodeJS.ProcessEnv}){
 const component=await prepareModelConfigReceipts075(options)
 if(component===null)return null
 await auditModelConfigReceipt075After069(options.models.pool)
 return component
}
