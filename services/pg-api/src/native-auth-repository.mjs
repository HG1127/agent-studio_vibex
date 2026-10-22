// Unwired, fail-closed standalone PostgreSQL native auth repository.
// No process listens or provisions real users by importing this module.
// Must run via an isolated non-superuser login that can SET ROLE to
// agentstudio_native_auth. Business API/Worker roles must NEVER join that group.
import {randomUUID} from "node:crypto"
import {
  normalizeEmployeeEmail,verifyEmployeePassword,hashEmployeePassword,
  validateEmployeePassword,validateEmployeeDisplayName,
  generateOpaqueSession,
  hashOpaqueSession,NATIVE_LOCAL_ISSUER,
} from "./native-employee-auth.mjs"

const role="agentstudio_native_auth"
const maxFailures=5
const lockMinutes=15
const sessionHours=12

function deny(){throw Error("invalid_employee_credentials")}
async function withNativeAuth(pool,callback){
  const db=await pool.connect()
  let active=false
  try{
    await db.query("BEGIN")
    active=true
    await db.query("SET LOCAL ROLE "+role)
    const roleResult=await db.query("SELECT current_user AS role")
    if(roleResult.rows[0]?.role!==role)throw Error("native_auth_role_unavailable")
    const result=await callback(db)
    await db.query("COMMIT")
    active=false
    return result
  }catch(error){
    if(active)await db.query("ROLLBACK").catch(()=>undefined)
    throw error
  }finally{db.release()}
}
function asDate(value){
  if(value===null||value===undefined)return null
  const d=value instanceof Date?value:new Date(value)
  return Number.isFinite(d.getTime())?d:null
}
export class NativeAuthRepository{
  constructor(pool){this.pool=pool}
  // Operator-only bootstrap entry point. Never expose as an HTTP route.
  // Exclusive transaction-scoped lock makes parallel first-admin attempts
  // mutually exclusive across server processes and authenticated sessions.
  async provisionInitialAdmin({email,password,display_name}){
    const normalized=normalizeEmployeeEmail(email)
    const display=validateEmployeeDisplayName(display_name)
    validateEmployeePassword(password)
    const record=await hashEmployeePassword(password)
    return await withNativeAuth(this.pool,async db=>{
      await db.query("SELECT pg_advisory_xact_lock(61824,20261016)")
      const count=await db.query(
        "SELECT count(*)::integer AS n FROM agentstudio_auth.accounts")
      const localUsers=await db.query(
        "SELECT count(*)::integer AS n FROM agentstudio.users "+
        "WHERE external_issuer=$1",[NATIVE_LOCAL_ISSUER])
      if(count.rows[0]?.n!==0||localUsers.rows[0]?.n!==0)
        throw Error("native_admin_already_initialized")
      const id=randomUUID()
      const subject=randomUUID()
      await db.query(
        "INSERT INTO agentstudio.users(id,external_issuer,"+
        "external_subject,display_name,status) "+
        "VALUES($1,$2,$3,$4,'active')",
        [id,NATIVE_LOCAL_ISSUER,subject,display])
      await db.query(
        "INSERT INTO agentstudio_auth.accounts"+
        "(user_id,email,password_record,enabled,is_admin) "+
        "VALUES($1,$2,$3,true,true)",[id,normalized,record])
      return {id,email:normalized,display_name:display,is_admin:true}
    })
  }
  async login(email,password){
    // Always perform the bounded password KDF even if email is malformed or
    // the account does not exist. Public handlers must return generic 401.
    let normalized
    let emailValid=true
    try{normalized=normalizeEmployeeEmail(email)}
    catch{
      normalized="nonexistent@invalid.example"
      emailValid=false
    }
    return await withNativeAuth(this.pool,async(db)=>{
      const result=await db.query(
        "SELECT c.user_id,c.password_record,c.enabled,c.is_admin,c.failed_attempts,"+
        "c.locked_until,u.external_subject "+
        "FROM agentstudio_auth.accounts c "+
        "JOIN agentstudio.users u ON u.id=c.user_id "+
        "WHERE c.email=$1 AND u.external_issuer=$2 "+
        "AND u.status='active' FOR UPDATE OF c",
        [normalized,NATIVE_LOCAL_ISSUER])
      const account=result.rows[0]
      const valid=await verifyEmployeePassword(password,account?.password_record)
      const locked=asDate(account?.locked_until)
      if(!emailValid||!account?.enabled||!valid||
         (locked&&locked.getTime()>Date.now())){
        if(emailValid&&account?.enabled&&(!locked||locked.getTime()<=Date.now())){
          await db.query(
            "UPDATE agentstudio_auth.accounts "+
            "SET failed_attempts=CASE WHEN failed_attempts >= $2 "+
            "THEN failed_attempts ELSE failed_attempts+1 END,"+
            "locked_until=CASE WHEN failed_attempts+1 >= $2 "+
            "THEN now()+make_interval(mins=>$3) ELSE NULL END,"+
            "updated_at=now() WHERE user_id=$1",
            [account.user_id,maxFailures,lockMinutes])
        }
        // Rollback is not desired for failed attempt counters; COMMIT them.
        return {authenticated:false}
      }
      await db.query(
        "UPDATE agentstudio_auth.accounts SET failed_attempts=0,"+
        "locked_until=NULL,updated_at=now() WHERE user_id=$1",
        [account.user_id])
      const session=generateOpaqueSession()
      const expiresAt=new Date(Date.now()+sessionHours*3600_000)
      await db.query(
        "INSERT INTO agentstudio_auth.sessions(token_digest,user_id,expires_at) "+
        "VALUES($1,$2,$3)",
        [session.digest,account.user_id,expiresAt])
      return {authenticated:true,token:session.token,expiresAt,
        identity:{issuer:NATIVE_LOCAL_ISSUER,subject:account.external_subject},
        is_admin:account.is_admin===true}
    }).then(result=>{
      if(!result.authenticated)deny()
      return result
    })
  }
  async getSessionProfile(token){
    let digest
    try{digest=hashOpaqueSession(token)}
    catch{return null}
    return await withNativeAuth(this.pool,async(db)=>{
      const result=await db.query(
        "SELECT u.id,u.external_subject,u.display_name,a.email,a.is_admin "+
        "FROM agentstudio_auth.sessions s "+
        "JOIN agentstudio_auth.accounts a ON a.user_id=s.user_id "+
        "JOIN agentstudio.users u ON u.id=s.user_id "+
        "WHERE s.token_digest=$1 AND s.revoked_at IS NULL "+
        "AND s.expires_at>now() AND a.enabled=true "+
        "AND u.status='active' AND u.external_issuer=$2",
        [digest,NATIVE_LOCAL_ISSUER])
      const row=result.rows[0]
      return row&&typeof row.external_subject==="string"&&
        row.external_subject.length>0&&row.external_subject.length<=255
        ?{id:row.id,email:row.email,display_name:row.display_name,
          is_admin:row.is_admin===true,
          identity:{issuer:NATIVE_LOCAL_ISSUER,subject:row.external_subject}}
        :null
    })
  }
  async verifySession(token){
    const profile=await this.getSessionProfile(token)
    return profile?.identity??null
  }
  async listEmployees(adminSessionToken,limit=50){
    const bounded=Number.isSafeInteger(limit)?Math.max(1,Math.min(100,limit)):50
    let digest
    try{digest=hashOpaqueSession(adminSessionToken)}
    catch{throw Error("admin_session_required")}
    return await withNativeAuth(this.pool,async(db)=>{
      const session=await db.query(
        "SELECT a.is_admin FROM agentstudio_auth.sessions s "+
        "JOIN agentstudio_auth.accounts a ON a.user_id=s.user_id "+
        "JOIN agentstudio.users u ON u.id=s.user_id "+
        "WHERE s.token_digest=$1 AND s.revoked_at IS NULL "+
        "AND s.expires_at>now() AND a.enabled=true "+
        "AND u.status='active' AND u.external_issuer=$2",
        [digest,NATIVE_LOCAL_ISSUER])
      if(session.rows[0]?.is_admin!==true)
        throw Error("admin_session_required")
      const result=await db.query(
        "SELECT u.id,a.email,u.display_name,a.is_admin,a.enabled,u.status,"+
        "u.created_at FROM agentstudio_auth.accounts a "+
        "JOIN agentstudio.users u ON u.id=a.user_id "+
        "WHERE u.external_issuer=$1 ORDER BY u.created_at DESC,u.id "+
        "LIMIT $2::int",[NATIVE_LOCAL_ISSUER,bounded])
      return result.rows.map(row=>({
        id:row.id,email:row.email,display_name:row.display_name,
        is_admin:row.is_admin===true,enabled:row.enabled===true,
        status:row.status,created_at:row.created_at,
      }))
    })
  }
  async provisionEmployee(adminSessionToken,{email,password,display_name}){
    const normalized=normalizeEmployeeEmail(email)
    validateEmployeePassword(password)
    const display=validateEmployeeDisplayName(display_name)
    let digest
    try{digest=hashOpaqueSession(adminSessionToken)}
    catch{throw Error("admin_session_required")}
    // Expensive KDF is outside the DB transaction to limit lock duration.
    const record=await hashEmployeePassword(password)
    return await withNativeAuth(this.pool,async(db)=>{
      const session=await db.query(
        "SELECT a.is_admin FROM agentstudio_auth.sessions s "+
        "JOIN agentstudio_auth.accounts a ON a.user_id=s.user_id "+
        "JOIN agentstudio.users u ON u.id=s.user_id "+
        "WHERE s.token_digest=$1 AND s.revoked_at IS NULL "+
        "AND s.expires_at>now() AND a.enabled=true "+
        "AND u.status='active' AND u.external_issuer=$2",
        [digest,NATIVE_LOCAL_ISSUER])
      if(session.rows[0]?.is_admin!==true)
        throw Error("admin_session_required")
      const id=randomUUID()
      const subject=randomUUID()
      await db.query(
        "INSERT INTO agentstudio.users(id,external_issuer,"+
        "external_subject,display_name,status) "+
        "VALUES($1,$2,$3,$4,'active')",
        [id,NATIVE_LOCAL_ISSUER,subject,display])
      await db.query(
        "INSERT INTO agentstudio_auth.accounts"+
        "(user_id,email,password_record,enabled,is_admin) "+
        "VALUES($1,$2,$3,true,false)",
        [id,normalized,record])
      return {id,email:normalized,display_name:display,
        is_admin:false}
    })
  }
  async revokeSession(token){
    let digest
    try{digest=hashOpaqueSession(token)}
    catch{return false}
    return await withNativeAuth(this.pool,async(db)=>{
      const result=await db.query(
        "UPDATE agentstudio_auth.sessions "+
        "SET revoked_at=now() WHERE token_digest=$1 "+
        "AND revoked_at IS NULL RETURNING token_digest",
        [digest])
      return result.rows.length===1
    })
  }
}
