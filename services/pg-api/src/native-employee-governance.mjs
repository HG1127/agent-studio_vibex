// Auth-pool only. No business records or credential projection cross this API.
import {createHash,randomUUID} from 'node:crypto'
import {NATIVE_LOCAL_ISSUER,hashOpaqueSession,hashEmployeePassword,verifyEmployeePassword,
  normalizeEmployeeEmail,validateEmployeeDisplayName,validateEmployeePassword} from './native-employee-auth.mjs'

const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(v)
function fail(code){throw Error(code)}
function exact(raw,keys){
  if(!raw||typeof raw!=='object'||Array.isArray(raw)||![Object.prototype,null].includes(Object.getPrototypeOf(raw))||
    Reflect.ownKeys(raw).length!==keys.length||keys.some(k=>!Object.hasOwn(raw,k)))fail('invalid_employee_governance_input')
}
export function employeeChangeChoice(raw){
  exact(raw,['request_id','target_id','expected_revision','is_admin','enabled','share_enabled','confirm'])
  if(!uuid(raw.request_id)||!uuid(raw.target_id)||!Number.isSafeInteger(raw.expected_revision)||raw.expected_revision<1||raw.expected_revision>=Number.MAX_SAFE_INTEGER-1||
    ['is_admin','enabled','share_enabled'].some(k=>typeof raw[k]!=='boolean')||raw.confirm!==true)fail('invalid_employee_governance_input')
  return {request_id:raw.request_id.toLowerCase(),target_id:raw.target_id.toLowerCase(),expected_revision:raw.expected_revision,
    is_admin:raw.is_admin,enabled:raw.enabled,share_enabled:raw.share_enabled,confirm:true}
}
const fingerprint=choice=>createHash('sha256').update(JSON.stringify(choice)).digest('hex')
const state=row=>({is_admin:row.is_admin===true,enabled:row.enabled===true,status:row.status,share_enabled:row.share_enabled===true,revision:Number(row.governance_revision)})
const employee=row=>({id:row.user_id,email:row.email,display_name:row.display_name,...state(row)})
async function lockGovernance(db){await db.query('SELECT pg_advisory_xact_lock(61824,20261048)')}
async function session(db,token,admin=false){
  let digest;try{digest=hashOpaqueSession(token)}catch{fail(admin?'admin_session_required':'session_required')}
  const row=(await db.query('SELECT a.user_id,a.is_admin FROM agentstudio_auth.sessions s JOIN agentstudio_auth.accounts a ON a.user_id=s.user_id '+
    'JOIN agentstudio.users u ON u.id=a.user_id WHERE s.token_digest=$1 AND s.revoked_at IS NULL AND s.expires_at>clock_timestamp() '+
    'AND a.enabled AND u.status=\'active\' AND u.external_issuer=$2 FOR SHARE OF a,u,s',[digest,NATIVE_LOCAL_ISSUER])).rows[0]
  if(!row||admin&&!row.is_admin)fail(admin?'admin_session_required':'session_required')
  return row.user_id
}
async function record(db,actor,target,action,before,after,choice=null){
  await db.query('INSERT INTO agentstudio_auth.employee_governance_events(actor_user_id,target_user_id,action,request_id,request_sha256,before_state,after_state) '+
    'VALUES($1::uuid,$2::uuid,$3,$4::uuid,$5,$6::jsonb,$7::jsonb)',[actor,target,action,choice?.request_id??null,choice?fingerprint(choice):null,JSON.stringify(before),JSON.stringify(after)])
}
async function previous(db,actor,choice){
  const row=(await db.query('SELECT target_user_id,request_sha256,after_state FROM agentstudio_auth.employee_governance_events WHERE actor_user_id=$1::uuid AND request_id=$2::uuid',[actor,choice.request_id])).rows[0]
  if(!row)return null
  if(row.target_user_id!==choice.target_id||row.request_sha256!==fingerprint(choice))fail('employee_request_conflict')
  return {request_id:choice.request_id,target_id:choice.target_id,...row.after_state,replayed:true}
}
export class NativeEmployeeGovernanceRepository{
  constructor(pool,transaction){this.pool=pool;this.transaction=transaction}
  async change(token,raw){
    const choice=employeeChangeChoice(raw)
    return this.transaction(this.pool,async db=>{
      // A single advisory lock serializes all administrative identity changes,
      // so competing last-admin changes cannot both pass their count check.
      await lockGovernance(db);const actor=await session(db,token,true)
      const prior=await previous(db,actor,choice);if(prior)return prior
      if(actor===choice.target_id&&(!choice.enabled||!choice.is_admin))fail('cannot_disable_self_admin')
      const row=(await db.query('SELECT a.user_id,a.email,a.is_admin,a.enabled,a.share_enabled,a.governance_revision,u.status,u.display_name '+
        'FROM agentstudio_auth.accounts a JOIN agentstudio.users u ON u.id=a.user_id WHERE a.user_id=$1::uuid AND u.external_issuer=$2 FOR UPDATE OF a,u',
        [choice.target_id,NATIVE_LOCAL_ISSUER])).rows[0]
      if(!row)fail('employee_not_found')
      if(Number(row.governance_revision)!==choice.expected_revision)fail('employee_revision_changed')
      if(row.is_admin&&row.enabled&&row.status==='active'&&(!choice.is_admin||!choice.enabled)){
        const n=(await db.query('SELECT count(*)::integer AS n FROM agentstudio_auth.accounts a JOIN agentstudio.users u ON u.id=a.user_id '+
          'WHERE a.enabled AND a.is_admin AND u.status=\'active\' AND u.external_issuer=$1',[NATIVE_LOCAL_ISSUER])).rows[0]?.n
        if(Number(n)<=1)fail('last_active_admin_required')
      }
      const before=state(row),after={is_admin:choice.is_admin,enabled:choice.enabled,status:choice.enabled?'active':'disabled',share_enabled:choice.share_enabled,revision:choice.expected_revision+1}
      await db.query('UPDATE agentstudio_auth.accounts SET is_admin=$2,enabled=$3,share_enabled=$4,governance_revision=governance_revision+1,updated_at=clock_timestamp() WHERE user_id=$1::uuid',
        [choice.target_id,choice.is_admin,choice.enabled,choice.share_enabled])
      await db.query('UPDATE agentstudio.users SET status=$2 WHERE id=$1::uuid',[choice.target_id,after.status])
      // Role/status changes invalidate all old cookies, including concurrent
      // sessions. Re-enabling never revives a revoked session.
      if(before.is_admin!==after.is_admin||before.enabled!==after.enabled||before.status!==after.status)
        await db.query('UPDATE agentstudio_auth.sessions SET revoked_at=clock_timestamp() WHERE user_id=$1::uuid AND revoked_at IS NULL',[choice.target_id])
      await record(db,actor,choice.target_id,'employee.change',before,after,choice)
      return {request_id:choice.request_id,target_id:choice.target_id,...after,replayed:false}
    })
  }
  async confirm(token,raw){
    const choice=employeeChangeChoice(raw)
    return this.transaction(this.pool,async db=>{
      await lockGovernance(db);const actor=await session(db,token,true)
      const prior=await previous(db,actor,choice)
      if(!prior)fail('employee_receipt_not_found');return prior
    })
  }
  async create(token,raw){
    exact(raw,['email','password','display_name','is_admin','share_enabled'])
    const email=normalizeEmployeeEmail(raw.email),display_name=validateEmployeeDisplayName(raw.display_name)
    validateEmployeePassword(raw.password)
    if(typeof raw.is_admin!=='boolean'||typeof raw.share_enabled!=='boolean')fail('invalid_employee_governance_input')
    const password=await hashEmployeePassword(raw.password)
    return this.transaction(this.pool,async db=>{
      await lockGovernance(db);const actor=await session(db,token,true),id=randomUUID(),subject=randomUUID()
      await db.query('INSERT INTO agentstudio.users(id,external_issuer,external_subject,display_name,status) VALUES($1,$2,$3,$4,\'active\')',[id,NATIVE_LOCAL_ISSUER,subject,display_name])
      await db.query('INSERT INTO agentstudio_auth.accounts(user_id,email,password_record,enabled,is_admin,share_enabled) VALUES($1,$2,$3,true,$4,$5)',[id,email,password,raw.is_admin,raw.share_enabled])
      const after={is_admin:raw.is_admin,enabled:true,status:'active',share_enabled:raw.share_enabled,revision:1}
      await record(db,actor,id,'employee.create',{},after)
      return employee({user_id:id,email,display_name,...after,governance_revision:1})
    })
  }
  async changePassword(token,raw){
    exact(raw,['old_password','new_password'])
    validateEmployeePassword(raw.new_password)
    if(typeof raw.old_password!=='string'||Buffer.byteLength(raw.old_password,'utf8')>256)fail('invalid_employee_governance_input')
    const password=await hashEmployeePassword(raw.new_password)
    return this.transaction(this.pool,async db=>{
      await lockGovernance(db);const actor=await session(db,token)
      const row=(await db.query('SELECT password_record FROM agentstudio_auth.accounts WHERE user_id=$1::uuid FOR UPDATE',[actor])).rows[0]
      if(!await verifyEmployeePassword(raw.old_password,row?.password_record))fail('invalid_current_password')
      if(await verifyEmployeePassword(raw.new_password,row.password_record))fail('employee_password_unchanged')
      await db.query('UPDATE agentstudio_auth.accounts SET password_record=$2,password_changed_at=clock_timestamp(),failed_attempts=0,locked_until=NULL,updated_at=clock_timestamp() WHERE user_id=$1::uuid',[actor,password])
      await db.query('UPDATE agentstudio_auth.sessions SET revoked_at=clock_timestamp() WHERE user_id=$1::uuid AND revoked_at IS NULL',[actor])
      await record(db,actor,actor,'employee.password',{},{});return {ok:true,reauthenticate:true}
    })
  }
}
