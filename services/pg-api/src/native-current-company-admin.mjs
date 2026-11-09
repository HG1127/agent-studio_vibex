// Internal pre/post authorization for a later separate telemetry read.
// Importing this module creates no connection or HTTP route. A context proves
// Native authority only; it is not an activation receipt or a telemetry lease.
import {performance} from 'node:perf_hooks'
import {hashOpaqueSession,NATIVE_LOCAL_ISSUER} from './native-employee-auth.mjs'
import {inspectEmployeeGovernance} from './native-employee-governance-audit.mjs'

export class NativeCompanyAdminError extends Error {
  constructor(status,code){super(code);this.status=status;this.code=code}
}
const fail=(status,code)=>{throw new NativeCompanyAdminError(status,code)}
const unavailable=()=>fail(503,'company_admin_authorization_unavailable')
const sessionRequired=()=>fail(401,'session_required')
const lifetimeMs=10000
const rowKeys=['user_id','external_subject','enabled','is_admin','status','revision','expires_at','checked_at']
const uuid=value=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value)
function record(raw,keys){
  if(!raw||typeof raw!=='object'||![Object.prototype,null].includes(Object.getPrototypeOf(raw))||Reflect.ownKeys(raw).length!==keys.length)unavailable()
  const descriptors=Object.getOwnPropertyDescriptors(raw)
  if(keys.some(key=>!descriptors[key]?.enumerable||!Object.hasOwn(descriptors[key],'value')))unavailable()
  return Object.fromEntries(keys.map(key=>[key,descriptors[key].value]))
}
function digest(token){try{return hashOpaqueSession(token).toString('hex')}catch{sessionRequired()}}
const roleSql="SELECT current_user::text AS role,session_user::text AS login,current_database() AS database,"+
  "current_setting('transaction_read_only') AS read_only,current_setting('search_path') AS search_path,"+
  "rolcanlogin AND NOT rolsuper AND NOT rolinherit AND NOT rolbypassrls AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication "+
  "AND rolvaliduntil IS NULL AND coalesce(cardinality(rolconfig),0)=0 "+
  "AND NOT pg_has_role(session_user,'agentstudio_api','MEMBER') AND NOT pg_has_role(session_user,'agentstudio_worker','MEMBER') "+
  "AND (SELECT count(*)=1 AND bool_and(parent.rolname='agentstudio_native_auth' AND NOT m.admin_option AND NOT m.inherit_option AND m.set_option) "+
  "FROM pg_auth_members m JOIN pg_roles parent ON parent.oid=m.roleid WHERE m.member=r.oid) AS safe_login "+
  "FROM pg_roles r WHERE r.rolname=session_user"
const sessionSql="SELECT a.user_id::text AS user_id,u.external_subject,a.enabled,a.is_admin,u.status,"+
  "a.governance_revision::text AS revision,s.expires_at::text AS expires_at,clock_timestamp()::text AS checked_at "+
  "FROM agentstudio_auth.sessions s JOIN agentstudio_auth.accounts a ON a.user_id=s.user_id "+
  "JOIN agentstudio.users u ON u.id=a.user_id WHERE s.token_digest=$1 AND s.revoked_at IS NULL "+
  "AND s.expires_at>clock_timestamp() AND a.enabled AND u.status='active' AND u.external_issuer=$2"
function checkedRow(rows){
  if(!Array.isArray(rows)||rows.length>1)unavailable()
  if(rows.length===0)sessionRequired()
  const row=record(rows[0],rowKeys)
  if(!uuid(row.user_id)||typeof row.external_subject!=='string'||!row.external_subject||row.external_subject.length>255||row.external_subject.includes('\0')||
    typeof row.enabled!=='boolean'||typeof row.is_admin!=='boolean'||!['active','disabled'].includes(row.status)||
    typeof row.revision!=='string'||!/^[1-9][0-9]{0,18}$/.test(row.revision)||BigInt(row.revision)>9223372036854775807n||
    typeof row.expires_at!=='string'||typeof row.checked_at!=='string'||!Number.isFinite(Date.parse(row.expires_at))||!Number.isFinite(Date.parse(row.checked_at)))unavailable()
  if(!row.enabled||row.status!=='active'||Date.parse(row.expires_at)<=Date.parse(row.checked_at))sessionRequired()
  if(!row.is_admin)fail(403,'admin_required')
  return Object.freeze({user_id:row.user_id,subject:row.external_subject,revision:row.revision,expires_at:row.expires_at})
}
export class NativeCurrentCompanyAdmin {
  #pool;#contexts=new WeakMap();#pending=0
  constructor(authPool){this.#pool=authPool}
  async #read(tokenDigest){
    // No unbounded application queue in front of the separately bounded pool.
    if(this.#pending>=2)unavailable()
    this.#pending++
    let client,active=false,destroy=false,row,failure
    try{
      client=await this.#pool.connect()
      active=true
      await client.query('BEGIN ISOLATION LEVEL READ COMMITTED READ ONLY')
      await client.query("SET LOCAL statement_timeout='3000ms'; SET LOCAL lock_timeout='1000ms'; SET LOCAL search_path=pg_catalog")
      await client.query('SET LOCAL ROLE agentstudio_native_auth')
      const roles=(await client.query(roleSql)).rows
      if(!Array.isArray(roles)||roles.length!==1)unavailable()
      const role=record(roles[0],['role','login','database','read_only','search_path','safe_login'])
      if(role.role!=='agentstudio_native_auth'||role.login!=='agentstudio_native_login'||role.database!=='agent_studio'||role.read_only!=='on'||role.search_path!=='pg_catalog'||role.safe_login!==true)unavailable()
      // This guard is for the installed governance schema, with a monotonic
      // revision. Legacy absence never becomes a fallback admin success.
      if(await inspectEmployeeGovernance(client)!==true)unavailable()
      // The auth login has no migration-ledger SELECT. Startup performs the
      // separate full schema audit; this per-read guard adds no new grant.
      row=checkedRow((await client.query(sessionSql,[Buffer.from(tokenDigest,'hex'),NATIVE_LOCAL_ISSUER])).rows)
      await client.query('COMMIT')
      active=false
    }catch(error){
      failure=error instanceof NativeCompanyAdminError?error:new NativeCompanyAdminError(503,'company_admin_authorization_unavailable')
      if(client&&active)try{await client.query('ROLLBACK')}catch{destroy=true}
    }
    if(client)try{await client.release(destroy)}catch{failure??=new NativeCompanyAdminError(503,'company_admin_authorization_unavailable')}
    this.#pending--
    if(failure)throw failure
    return row
  }
  async authorize(token){
    const tokenDigest=digest(token),started=performance.now(),row=await this.#read(tokenDigest)
    if(performance.now()-started>=lifetimeMs)unavailable()
    const context=Object.freeze(Object.create(null))
    this.#contexts.set(context,{tokenDigest,started,row})
    return context
  }
  assertBeforeRead(token,context){
    const saved=this.#contexts.get(context)
    try{if(!saved||saved.tokenDigest!==digest(token)||performance.now()-saved.started>=lifetimeMs)unavailable()}
    catch(error){this.#contexts.delete(context);throw error}
  }
  async confirmAfterRead(token,context){
    // Consume before the first await. Concurrent or later replay cannot reuse
    // this request context, even if the fresh postcheck fails.
    const saved=this.#contexts.get(context);this.#contexts.delete(context)
    if(!saved||saved.tokenDigest!==digest(token)||performance.now()-saved.started>=lifetimeMs)unavailable()
    const current=await this.#read(saved.tokenDigest)
    if(performance.now()-saved.started>=lifetimeMs||Object.keys(saved.row).some(key=>saved.row[key]!==current[key]))unavailable()
  }
}
