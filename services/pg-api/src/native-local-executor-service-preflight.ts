// Dedicated read-only preflight. No feature activation or listener authority.
import type {SqlPool} from './contracts.ts'
import {isIP} from 'node:net'
import {verifyNativeLocalDeviceOriginal,verifyNativeLocalDeviceSchema} from './native-local-device-audit.ts'
const refused=():never=>{throw Error('native_local_executor_preflight_refused')}
export type ExecutorPreflightTarget=Readonly<{database:'agent_studio';port:5333}|{database:'agentstudio_pg18_ci';port:5432;observed_server_address:string}>
export async function inspectNativeLocalExecutorPreflight(pool:SqlPool,target:ExecutorPreflightTarget){
 if(!target||!(target.database==='agent_studio'&&target.port===5333||target.database==='agentstudio_pg18_ci'&&target.port===5432))return refused()
 const expectedAddress=target.database==='agent_studio'?'127.0.0.1':target.observed_server_address
 if(typeof expectedAddress!=='string'||isIP(expectedAddress)===0)return refused()
 const db=await pool.connect();let begun=false
 try{
  await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');begun=true
  const rows=(await db.query<{database:string;login:string;actor:string;host:string;port:number;version:number;primary:boolean;readonly:string;connect_only:boolean}>("SELECT current_database() AS database,session_user::text AS login,current_user::text AS actor,host(inet_server_addr()) AS host,inet_server_port() AS port,current_setting('server_version_num')::integer AS version,NOT pg_is_in_recovery() AS primary,current_setting('transaction_read_only') AS readonly,has_database_privilege(session_user,current_database(),'CONNECT') AND NOT has_database_privilege(session_user,current_database(),'CREATE') AS connect_only")).rows,r=rows[0]
  if(rows.length!==1||!r||r.database!==target.database||r.port!==target.port||r.host!==expectedAddress||r.login!=='agentstudio_local_executor_login'||r.actor!==r.login||!Number.isSafeInteger(r.version)||r.version<180000||r.version>=190000||r.primary!==true||r.readonly!=='on'||r.connect_only!==true)return refused()
  // Direct original C auditors: no caller-supplied positive validator or table
  // read. Their exact source/ACL checks precede the fixed installed-marker RPC.
  await verifyNativeLocalDeviceOriginal(db,'agentstudio_local_executor')
  await db.query('SET LOCAL ROLE agentstudio_local_executor')
  await verifyNativeLocalDeviceSchema(db,'agentstudio_local_executor')
  return {scope:'executor_login_and_C_catalog_only',read_only:true,original_C_audit_verified:true,transaction_bound_identity:true,listener_started:false,device_paired:false,effect_executed:false,live_service_proven:false,production_cutover_allowed:false}
 }finally{try{if(begun)await db.query('ROLLBACK')}finally{db.release()}}
}
