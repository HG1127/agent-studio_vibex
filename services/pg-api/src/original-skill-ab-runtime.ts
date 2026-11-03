import {HttpError,type SqlClient,type SqlPool} from './contracts.ts'
import {skillAbCatalogSQL,assertSkillAbCatalog} from './original-skill-ab-catalog.mjs'
type Role='agentstudio_api'|'agentstudio_skill_ab_dispatch'
type Proof=ReturnType<typeof assertSkillAbCatalog>
const pools=new WeakMap<SqlPool,{role:Role;proof:Proof}>()
export async function assertSkillAbDispatchSession(db:SqlClient){
 const rows=(await db.query<{login:boolean;inherit:boolean;superuser:boolean;bypassrls:boolean;createdb:boolean;createrole:boolean;replication:boolean;initial_role:boolean}>("SELECT rolcanlogin AS login,rolinherit AS inherit,rolsuper AS superuser,rolbypassrls AS bypassrls,rolcreatedb AS createdb,rolcreaterole AS createrole,rolreplication AS replication,current_user=session_user AS initial_role FROM pg_catalog.pg_roles WHERE rolname=session_user")).rows
 const r=rows[0];if(rows.length!==1||!r||r.login!==true||r.initial_role!==true||[r.inherit,r.superuser,r.bypassrls,r.createdb,r.createrole,r.replication].some(v=>v!==false))throw Error('original_skill_ab_session_refused')
 const reachable=(await db.query<{name:string}>("SELECT r.rolname AS name FROM pg_catalog.pg_roles r WHERE r.rolname<>session_user AND pg_catalog.pg_has_role(session_user,r.oid,'MEMBER') ORDER BY r.rolname")).rows
 if(reachable.length!==1||reachable[0]?.name!=='agentstudio_skill_ab_dispatch')throw Error('original_skill_ab_session_refused')
}
/** Owned transaction. Any attempted BEGIN/COMMIT with unknown outcome discards
 * this connection. No caller gets an effect permission from an uncertain commit. */
export async function skillAbDispatchTransaction<T>(pool:SqlPool,body:(db:SqlClient)=>Promise<T>,startup=false):Promise<T>{
 const db:SqlClient&{release(destroy?:boolean):void}=await pool.connect();let attempted=false,begun=false,commitAttempted=false,destroy=false,primary:unknown,failed=false,value:T|undefined
 try{attempted=true;await db.query(startup?'BEGIN READ ONLY':'BEGIN');begun=true;await assertSkillAbDispatchSession(db);await db.query('SET LOCAL ROLE agentstudio_skill_ab_dispatch');await db.query('SET LOCAL search_path=pg_catalog');await db.query("SET LOCAL statement_timeout='5s'");await db.query("SET LOCAL lock_timeout='3s'");value=await body(db);commitAttempted=true;await db.query(startup?'ROLLBACK':'COMMIT');begun=false}
 catch(e){primary=e;failed=true;if(attempted&&!begun||commitAttempted)destroy=true}
 finally{if(begun)try{await db.query('ROLLBACK')}catch{destroy=true}try{db.release(destroy)}catch(e){if(!failed){primary=e;failed=true}}}
 if(failed)throw primary;return value!
}
export async function prepareSkillAbPool(pool:SqlPool,role:Role){
 pools.delete(pool)
 const inspect=async(db:SqlClient)=>assertSkillAbCatalog((await db.query<{value:unknown}>(skillAbCatalogSQL)).rows[0]?.value,role)
 let proof:Proof
 if(role==='agentstudio_skill_ab_dispatch')proof=await skillAbDispatchTransaction(pool,inspect,true)
 else{
  const db:SqlClient&{release(destroy?:boolean):void}=await pool.connect();let begun=false,attempted=false,rollbackAttempted=false,destroy=false,failed=false,primary:unknown,inspected:Proof|undefined
  try{attempted=true;await db.query('BEGIN READ ONLY');begun=true;await db.query('SET LOCAL ROLE agentstudio_api');await db.query('SET LOCAL search_path=pg_catalog');await db.query("SET LOCAL statement_timeout='5s'");inspected=await inspect(db);rollbackAttempted=true;await db.query('ROLLBACK');begun=false}
  catch(e){primary=e;failed=true;if(attempted&&!begun||rollbackAttempted)destroy=true}
  finally{if(begun&&!rollbackAttempted)try{await db.query('ROLLBACK')}catch{destroy=true}try{db.release(destroy)}catch(e){if(!failed){primary=e;failed=true}}}
  if(failed)throw primary;if(!inspected)throw Error('original_skill_ab_schema_required');proof=inspected
 }
 pools.set(pool,{role,proof});return proof
}
export async function auditSkillAbClient(db:SqlClient,pool:SqlPool,role:Role){
 const expected=pools.get(pool);if(!expected||expected.role!==role)throw new HttpError(409,'original_skill_ab_schema_required')
 await db.query('SET LOCAL search_path=pg_catalog');await db.query("SET LOCAL statement_timeout='5s'")
 const actual=assertSkillAbCatalog((await db.query<{value:unknown}>(skillAbCatalogSQL)).rows[0]?.value,role)
 if(actual.database_oid!==expected.proof.database_oid||actual.namespace_oid!==expected.proof.namespace_oid||actual.source_sha256!==expected.proof.source_sha256)throw new HttpError(409,'original_skill_ab_schema_changed')
 return actual
}
