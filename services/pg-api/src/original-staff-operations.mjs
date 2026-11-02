// Actual transaction bodies. Only the auth service pool may execute these;
// callers never supply an Actor, identity DTO or catalog approval callback.
import {createHash,randomUUID} from 'node:crypto'
import {staffExpectedOwner,parseOriginalStaffMutation,originalStaffPublicChoice,originalStaffEmployee,originalStaffListResult,originalStaffReceiptResult} from '../../../shared/original-staff-contract.mjs'
import {NATIVE_LOCAL_ISSUER,hashOpaqueSession,hashEmployeePassword,verifyEmployeePassword} from './native-employee-auth.mjs'
import {verifyOriginalStaff084Schema} from './original-staff-audit084.mjs'
const fail=code=>{throw Error(code)},one=rows=>{if(!Array.isArray(rows)||rows.length!==1)fail('original_staff_state_unavailable');return rows[0]}
export const staffStamp=field=>`to_char(${field} AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`
export const staffProfileColumns=`u.id,a.email,u.display_name,a.is_admin,a.enabled,u.status,a.share_enabled,a.staff_revision,a.governance_revision,${staffStamp('u.created_at')} AS created,${staffStamp('a.updated_at')} AS updated`
export const staffSelectTargetSQL=`/* original-staff:target */ SELECT ${staffProfileColumns} FROM agentstudio_auth.accounts a JOIN agentstudio.users u ON u.id=a.user_id WHERE a.user_id=$1::uuid AND u.external_issuer=$2 FOR UPDATE OF a,u`
const readProfile=row=>{if(typeof row?.is_admin!=='boolean'||typeof row.enabled!=='boolean'||!['active','disabled'].includes(row.status))fail('original_staff_state_unavailable');return originalStaffEmployee({id:row.id,email:row.email,display_name:row.display_name,role:row.is_admin?'admin':'employee',active:row.enabled&&row.status==='active',share_enabled:row.share_enabled,revision:Number(row.staff_revision),governance_revision:Number(row.governance_revision),created:row.created,updated:row.updated})}
export function originalStaffChangeEffects(before,choice){return Object.freeze({governance:before.role!==choice.role||before.active!==choice.active||before.share_enabled!==choice.share_enabled,revoke:before.role!==choice.role||before.active!==choice.active||before.email!==choice.email})}
export function originalStaffFingerprint(choice){return createHash('sha256').update(JSON.stringify(originalStaffPublicChoice(choice))).digest('hex')}
export async function verifyOriginalStaffSession(db,token,expectedOwner,{admin=true,locked=false}={}){
 const owner=staffExpectedOwner(expectedOwner);let digest;try{digest=hashOpaqueSession(token)}catch{fail('session_required')}
 const rows=(await db.query('/* original-staff:session */ SELECT a.user_id,a.is_admin FROM agentstudio_auth.sessions s JOIN agentstudio_auth.accounts a ON a.user_id=s.user_id JOIN agentstudio.users u ON u.id=a.user_id WHERE s.token_digest=$1 AND s.revoked_at IS NULL AND s.expires_at>clock_timestamp() AND a.enabled AND u.status=\'active\' AND u.external_issuer=$2'+(locked?' FOR SHARE OF a,u,s':''),[digest,NATIVE_LOCAL_ISSUER])).rows
 if(!Array.isArray(rows)||rows.length!==1)fail('session_required');const row=rows[0]
 if(row.user_id!==owner)fail('session_changed')
 if(admin&&row.is_admin!==true)fail('admin_required')
 return owner
}
export async function authorizeOriginalStaff(db,token,expectedOwner,admin=true){await verifyOriginalStaff084Schema(db);return verifyOriginalStaffSession(db,token,expectedOwner,{admin})}
export async function readOriginalStaffSelf(db,token,expectedOwner){const owner=await authorizeOriginalStaff(db,token,expectedOwner,false);const row=one((await db.query(`/* original-staff:self */ SELECT ${staffProfileColumns} FROM agentstudio_auth.accounts a JOIN agentstudio.users u ON u.id=a.user_id WHERE a.user_id=$1::uuid AND u.external_issuer=$2`,[owner,NATIVE_LOCAL_ISSUER])).rows);return{user:readProfile(row)}}
export const staffListSQL=`/* original-staff:list */ WITH inventory AS MATERIALIZED(
 SELECT u.id,a.email,u.display_name,CASE WHEN a.is_admin THEN 'admin' ELSE 'employee' END AS role,a.enabled AND u.status='active' AS active,a.share_enabled,a.staff_revision AS revision,a.governance_revision,${staffStamp('u.created_at')} AS created,${staffStamp('a.updated_at')} AS updated,u.created_at AS ordered
 FROM agentstudio_auth.accounts a JOIN agentstudio.users u ON u.id=a.user_id WHERE u.external_issuer=$1),
 filtered AS MATERIALIZED(SELECT * FROM inventory WHERE ($2='' OR strpos(lower(display_name),lower($2))>0 OR strpos(lower(email),lower($2))>0) AND ($3='' OR role=$3) AND ($4='' OR active=($4='true'))),
 counted AS(SELECT count(*)::integer AS total FROM filtered),
 paging AS(SELECT total,GREATEST(1,ceil(total::numeric/$6::integer)::integer) AS pages,LEAST($5::integer,GREATEST(1,ceil(total::numeric/$6::integer)::integer)) AS page FROM counted)
 SELECT jsonb_build_object('items',(SELECT coalesce(jsonb_agg(to_jsonb(selected)-'ordered' ORDER BY ordered DESC,id),'[]') FROM(SELECT * FROM filtered ORDER BY ordered DESC,id LIMIT $6::integer OFFSET (SELECT (page-1)*$6::integer FROM paging)) selected),'page',paging.page,'perPage',$6::integer,'totalItems',paging.total,'totalPages',paging.pages,'summary',(SELECT jsonb_build_object('total',count(*)::integer,'active',count(*) FILTER(WHERE active)::integer,'admins',count(*) FILTER(WHERE active AND role='admin')::integer,'sharing',count(*) FILTER(WHERE share_enabled)::integer) FROM inventory)) AS value FROM paging`
export async function readOriginalStaffList(db,token,owner,choice){await authorizeOriginalStaff(db,token,owner);const v=one((await db.query(staffListSQL,[NATIVE_LOCAL_ISSUER,choice.q,choice.role,choice.active,choice.page,choice.perPage])).rows).value;if(!v||!Array.isArray(v.items)||!v.summary)fail('original_staff_state_unavailable');return originalStaffListResult(v)}
const receiptColumns=`actor_user_id,request_id,action,target_user_id,request_sha256,email,display_name,is_admin,enabled,status,share_enabled,revision,governance_revision,${staffStamp('profile_created_at')} AS created,${staffStamp('profile_updated_at')} AS updated,revoked_sessions`
export const staffReceiptSQL=`/* original-staff:receipt */ SELECT ${receiptColumns} FROM agentstudio_auth.original_staff_receipts WHERE actor_user_id=$1::uuid AND request_id=$2::uuid`
const receipt=row=>originalStaffReceiptResult({request_id:row.request_id,action:row.action,target_id:row.target_user_id,request_sha256:row.request_sha256,committed:true,user:readProfile({...row,id:row.target_user_id,staff_revision:row.revision}),revoked_sessions:row.revoked_sessions})
function matchesReceipt(row,choice,hash){if(row.request_id!==choice.request_id||row.action!==choice.action||row.request_sha256!==hash||choice.target_id!==null&&row.target_user_id!==choice.target_id)fail('employee_request_conflict')}
export async function readOriginalStaffReceipt(db,token,owner,choice){const actor=await authorizeOriginalStaff(db,token,owner),rows=(await db.query(staffReceiptSQL,[actor,choice.request_id])).rows;if(!Array.isArray(rows)||rows.length>1)fail('original_staff_state_unavailable');if(!rows.length)fail('employee_receipt_not_found');if(rows[0].actor_user_id!==actor)fail('original_staff_state_unavailable');matchesReceipt(rows[0],choice,choice.request_sha256);return receipt(rows[0])}
async function recordReceipt(db,actor,choice,profile,revoked,passwordRecord,beforeProfile){
 await db.query('/* original-staff:record */ INSERT INTO agentstudio_auth.original_staff_receipts(actor_user_id,request_id,action,target_user_id,request_sha256,email,display_name,is_admin,enabled,status,share_enabled,revision,profile_created_at,profile_updated_at,revoked_sessions,before_profile,governance_revision) VALUES($1::uuid,$2::uuid,$3,$4::uuid,$5,$6,$7,$8,$9,$10,$11,$12::bigint,$13::timestamptz,$14::timestamptz,$15,$16::jsonb,$17::bigint)',[actor,choice.request_id,choice.action,profile.id,originalStaffFingerprint(choice),profile.email,profile.display_name,profile.role==='admin',profile.active,profile.active?'active':'disabled',profile.share_enabled,profile.revision,profile.created,profile.updated,revoked,JSON.stringify(beforeProfile),profile.governance_revision])
 if(passwordRecord!==undefined)await db.query('/* original-staff:private-password-request */ INSERT INTO agentstudio_auth.original_staff_password_requests(actor_user_id,request_id,password_record) VALUES($1::uuid,$2::uuid,$3)',[actor,choice.request_id,passwordRecord])
 const row=one((await db.query(staffReceiptSQL,[actor,choice.request_id])).rows);matchesReceipt(row,{...choice,target_id:profile.id},originalStaffFingerprint(choice));const value=receipt(row);if(row.actor_user_id!==actor||JSON.stringify(value.user)!==JSON.stringify(profile)||value.revoked_sessions!==revoked)fail('original_staff_state_unavailable');return value
}
// Runs only inside the repository's real READ COMMITTED write transaction.
// A COMMIT ambiguity is surfaced by that repository; callers confirm via GET.
export async function writeOriginalStaff(db,token,expectedOwner,action,target,raw){
 const choice=parseOriginalStaffMutation(action,target,raw),hash=originalStaffFingerprint(choice)
 await db.query('SELECT pg_advisory_xact_lock(61824,20261048)')
 await verifyOriginalStaff084Schema(db)
 const actor=await verifyOriginalStaffSession(db,token,expectedOwner,{admin:true,locked:true})
 const prior=(await db.query(staffReceiptSQL,[actor,choice.request_id])).rows;if(!Array.isArray(prior)||prior.length>1)fail('original_staff_state_unavailable')
 if(prior.length){if(prior[0].actor_user_id!==actor)fail('original_staff_state_unavailable');matchesReceipt(prior[0],choice,hash);const secret=(await db.query('/* original-staff:private-repeat */ SELECT password_record FROM agentstudio_auth.original_staff_password_requests WHERE actor_user_id=$1::uuid AND request_id=$2::uuid',[actor,choice.request_id])).rows
  if(action==='update'){if(!Array.isArray(secret)||secret.length!==0)fail('original_staff_state_unavailable')}
  else if(!Array.isArray(secret)||secret.length!==1||!await verifyEmployeePassword(action==='create'?choice.password:choice.new_password,secret[0]?.password_record))fail('employee_request_conflict')
  return receipt(prior[0])
 }
 if(action==='create'){
  const record=await hashEmployeePassword(choice.password),id=randomUUID(),subject=randomUUID()
  await db.query('/* original-staff:create-user */ INSERT INTO agentstudio.users(id,external_issuer,external_subject,display_name,status) VALUES($1::uuid,$2,$3,$4,\'active\')',[id,NATIVE_LOCAL_ISSUER,subject,choice.display_name])
  await db.query('/* original-staff:create-account */ INSERT INTO agentstudio_auth.accounts(user_id,email,password_record,enabled,is_admin,share_enabled) VALUES($1::uuid,$2,$3,true,$4,$5)',[id,choice.email,record,choice.role==='admin',choice.share_enabled])
  const after=readProfile(one((await db.query(staffSelectTargetSQL,[id,NATIVE_LOCAL_ISSUER])).rows));if(after.id!==id||after.revision!==1||after.governance_revision!==1||!after.active||after.display_name!==choice.display_name||after.email!==choice.email||after.role!==choice.role||after.share_enabled!==choice.share_enabled)fail('original_staff_state_unavailable');return recordReceipt(db,actor,choice,after,false,record,{})
 }
 const rows=(await db.query(staffSelectTargetSQL,[target,NATIVE_LOCAL_ISSUER])).rows;if(!Array.isArray(rows)||rows.length>1)fail('original_staff_state_unavailable');if(!rows.length)fail('employee_not_found');const before=readProfile(rows[0])
 if(before.revision!==choice.expected_revision||before.governance_revision!==choice.expected_governance_revision||before.updated!==choice.expected_updated)fail('employee_revision_changed')
 if(actor===target&&action==='reset')fail('cannot_reset_self_password')
 if(actor===target&&(!choice.active||choice.role!=='admin'))fail('cannot_disable_self_admin')
 let record,revoked=false
 if(action==='update'){
  if(before.role==='admin'&&before.active&&(choice.role!=='admin'||!choice.active)){const n=one((await db.query('/* original-staff:active-admins */ SELECT count(*)::integer AS n FROM agentstudio_auth.accounts a JOIN agentstudio.users u ON u.id=a.user_id WHERE a.enabled AND a.is_admin AND u.status=\'active\' AND u.external_issuer=$1',[NATIVE_LOCAL_ISSUER])).rows).n;if(!Number.isSafeInteger(n)||n<1)fail('original_staff_state_unavailable');if(n<=1)fail('last_active_admin_required')}
  const effects=originalStaffChangeEffects(before,choice)
  if(effects.governance&&before.governance_revision>=Number.MAX_SAFE_INTEGER-1)fail('employee_revision_changed')
  const updated=(await db.query('/* original-staff:update-account */ UPDATE agentstudio_auth.accounts SET email=$2,is_admin=$3,enabled=$4,share_enabled=$5,governance_revision=governance_revision+CASE WHEN $9::boolean THEN 1 ELSE 0 END,updated_at=GREATEST(clock_timestamp(),updated_at+interval \'1 microsecond\') WHERE user_id=$1::uuid AND staff_revision=$6::bigint AND governance_revision=$7::bigint AND updated_at=$8::timestamptz RETURNING user_id',[target,choice.email,choice.role==='admin',choice.active,choice.share_enabled,choice.expected_revision,choice.expected_governance_revision,choice.expected_updated,effects.governance])).rows;one(updated)
  one((await db.query('/* original-staff:update-user */ UPDATE agentstudio.users SET display_name=$2,status=$3 WHERE id=$1::uuid AND external_issuer=$4 RETURNING id',[target,choice.display_name,choice.active?'active':'disabled',NATIVE_LOCAL_ISSUER])).rows)
  revoked=effects.revoke
 }else{
  const current=one((await db.query('/* original-staff:password-current */ SELECT password_record FROM agentstudio_auth.accounts WHERE user_id=$1::uuid FOR UPDATE',[target])).rows)
  if(await verifyEmployeePassword(choice.new_password,current.password_record))fail('employee_password_unchanged')
  record=await hashEmployeePassword(choice.new_password)
  one((await db.query('/* original-staff:reset */ UPDATE agentstudio_auth.accounts SET password_record=$2,password_changed_at=clock_timestamp(),failed_attempts=0,locked_until=NULL,updated_at=GREATEST(clock_timestamp(),updated_at+interval \'1 microsecond\') WHERE user_id=$1::uuid AND staff_revision=$3::bigint AND governance_revision=$4::bigint AND updated_at=$5::timestamptz RETURNING user_id',[target,record,choice.expected_revision,choice.expected_governance_revision,choice.expected_updated])).rows);revoked=true
 }
 if(revoked)await db.query('/* original-staff:revoke */ UPDATE agentstudio_auth.sessions SET revoked_at=clock_timestamp() WHERE user_id=$1::uuid AND revoked_at IS NULL',[target])
 const after=readProfile(one((await db.query(staffSelectTargetSQL,[target,NATIVE_LOCAL_ISSUER])).rows))
 const expected=action==='update'?{...before,display_name:choice.display_name,email:choice.email,role:choice.role,active:choice.active,share_enabled:choice.share_enabled}:before
 const governance=action==='update'&&originalStaffChangeEffects(before,choice).governance
 if(after.id!==target||after.revision!==before.revision+1||after.governance_revision!==before.governance_revision+(governance?1:0)||after.created!==before.created||after.updated<=before.updated||['display_name','email','role','active','share_enabled'].some(k=>after[k]!==expected[k]))fail('original_staff_state_unavailable')
 return recordReceipt(db,actor,choice,after,revoked,record,before)
}
