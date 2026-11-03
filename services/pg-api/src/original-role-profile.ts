import {HttpError,type SqlPool,type SqlClient} from './contracts.ts'
import {verifyOriginalRoleCatalog} from './original-role-catalog.mjs'
const pools=new WeakMap<object,{connect:SqlPool['connect'];database_oid:string}>()
const clients=new WeakMap<object,boolean>(),discard=new WeakSet<object>()
const releases=new WeakMap<object,SqlClient['release']>()
function secureRelease(db:SqlClient){
 if(releases.get(db)===db.release)return
 const original=db.release as (destroy?:boolean)=>void
 if(typeof original!=='function')throw Error('original_role_discard_port_required')
 const wrapped=(destroy?:boolean)=>{if(destroy===true||discard.has(db))original.call(db,true);else original.call(db)}
 try{Object.defineProperty(db,'release',{value:wrapped,writable:true,configurable:true})}catch{throw Error('original_role_discard_port_required')}
 releases.set(db,wrapped)
}
export const originalRoleClientNeedsDiscard=(db:SqlClient)=>discard.has(db)
export function selectOriginalRoleProfile(env:NodeJS.ProcessEnv){
 const p=env.AGENT_STUDIO_ORIGINAL_ROLES_PROFILE,a=env.AGENT_STUDIO_ORIGINAL_ROLES_APPROVED
 if(p===undefined&&a===undefined)return false
 if(p!=='original-roles-v2'||a!=='APPROVE_DISPOSABLE_ORIGINAL_ROLES_V2_ONLY')throw Error('original_role_profile_not_approved')
 return true
}
const sessionSQL="SELECT current_user::text AS role,current_setting('search_path') AS search_path,current_setting('statement_timeout') AS statement_timeout,(SELECT setting::integer FROM pg_settings WHERE name='statement_timeout') AS timeout_ms"
const roles=new Set(['agentstudio_api','agentstudio_worker','agentstudio_stage_login','agentstudio_stage_worker'])
/** One fresh complete catalog statement in this actual transaction. No cached
 * metadata hash, approval callback or startup observation authorizes it. */
async function fresh(db:SqlClient,purpose:'startup'|'transaction'){
 const begun=performance.now(),context=(await db.query<{role:string;search_path:string;statement_timeout:string;timeout_ms:number}>(sessionSQL)).rows
 const c=context[0]
 if(context.length!==1||!c||!roles.has(c.role)||typeof c.search_path!=='string'||c.search_path.length>10000||typeof c.statement_timeout!=='string'||c.statement_timeout.length>80||!Number.isSafeInteger(c.timeout_ms)||c.timeout_ms<0)throw Error('original_role_audit_context_required')
 const budget=Math.min(c.timeout_ms||5000,5000)
 if(performance.now()-begun>=budget)throw Error('original_role_catalog_deadline')
 let primary:unknown,hasPrimary=false,result:Awaited<ReturnType<typeof verifyOriginalRoleCatalog>>|undefined
 try{
  await db.query("SELECT set_config('statement_timeout',$1::text,true)",[String(budget)])
  await db.query('SET LOCAL ROLE agentstudio_api');await db.query('SET LOCAL search_path=pg_catalog')
  result=await verifyOriginalRoleCatalog(db,{purpose})
  if(performance.now()-begun>=budget)throw Error('original_role_catalog_deadline')
 }catch(error){primary=error;hasPrimary=true}
 // Restoration failures quarantine the connection. Keep the first failure;
 // do not retry a failed restoration or treat a later success as confirmation.
 for(const [sql,args]of [["SELECT set_config('search_path',$1::text,true)",[c.search_path]],['SET LOCAL ROLE '+c.role,undefined],["SELECT set_config('statement_timeout',$1::text,true)",[c.statement_timeout]]] as const){
  try{await db.query(sql,args?[...args]:undefined)}catch(error){discard.add(db);if(!hasPrimary){primary=Error('original_role_audit_cleanup_unconfirmed');hasPrimary=true}}
 }
 if(hasPrimary)throw primary
 return result!
}
export async function prepareOriginalRolePool(pool:SqlPool,env:NodeJS.ProcessEnv){
 if(!selectOriginalRoleProfile(env))return null
 pools.delete(pool)
 const db=await pool.connect();let beginAttempted=false,begun=false,primary:unknown,hasPrimary=false,proof:Awaited<ReturnType<typeof verifyOriginalRoleCatalog>>|undefined
 clients.delete(db)
 try{secureRelease(db);beginAttempted=true;await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');begun=true;proof=await fresh(db,'startup')}
 catch(error){if(beginAttempted&&!begun)discard.add(db);primary=error;hasPrimary=true}
 finally{
  if(begun)try{await db.query('ROLLBACK')}catch(error){discard.add(db);if(!hasPrimary){primary=Error('original_role_cleanup_unconfirmed');hasPrimary=true}}
  try{(db as SqlClient&{release(destroy?:boolean):void}).release(discard.has(db))}catch(error){if(!hasPrimary){primary=Error('original_role_release_unconfirmed');hasPrimary=true}}
 }
 if(hasPrimary)throw primary
 pools.set(pool,{connect:pool.connect,database_oid:proof!.database_oid})
 return Object.freeze({profile:'original-roles-v2',source_sha256:proof!.source_sha256,services_started:false})
}
/** Low-level additive audit in caller-owned READ ONLY startup transaction.
 * Normal employee/Worker transactions always enter applyOriginalRoleScope. */
export async function prepareOriginalRoleClient(db:SqlClient,env:NodeJS.ProcessEnv){
 clients.delete(db)
 if(!selectOriginalRoleProfile(env))throw Error('original_role_profile_not_approved')
 // A startup-only inspection returns evidence, never a reusable DML permit.
 return verifyOriginalRoleCatalog(db)
}
export async function applyOriginalRoleScope(db:SqlClient,pool:SqlPool){
 clients.delete(db)
 if(discard.has(db))throw Error('original_role_connection_discard_required')
 const selected=pools.get(pool)
 if(selected&&selected.connect!==pool.connect)throw Error('original_role_pool_changed')
 const rows=(await db.query<{installed:boolean;database_oid:string}>("SELECT to_regnamespace('agentstudio_roles') IS NOT NULL AS installed,(SELECT oid::text FROM pg_database WHERE datname=current_database()) AS database_oid")).rows
 if(rows.length!==1||typeof rows[0]!.installed!=='boolean')throw Error('original_role_profile_unavailable')
 if(rows[0]!.installed&&!selected||selected&&(!rows[0]!.installed||rows[0]!.database_oid!==selected.database_oid))throw Error('original_role_profile_required')
 if(selected){secureRelease(db);const proof=await fresh(db,'transaction');if(proof.database_oid!==selected.database_oid)throw Error('original_role_profile_required')}
 clients.set(db,!!selected)
}
export const originalRoleProfileEnabled=(db:SqlClient)=>clients.get(db)===true&&!discard.has(db)
export function requireOriginalRoleProfile(db:SqlClient){if(!originalRoleProfileEnabled(db))throw new HttpError(409,'original_role_profile_required')}
