// Pure assertions over actual SELECT results; no SQL, Pool or Worker is mocked.
import {isIP} from 'node:net'
export const originalScheduleWorkerLogin='agentstudio_stage_worker'
export const originalScheduleWorkerGroups=Object.freeze(['agentstudio_api','agentstudio_worker'])
const fail=()=>{throw Error('original_schedule_worker_login_boundary_refused')}
const instanceKeys=Object.freeze(['database','version','system_identifier','database_oid','postmaster_started_us','server_addr','server_port'])
const targetKeys=Object.freeze([...instanceKeys,'login','superuser','primary'])
const exactObject=(v,keys)=>{if(!v||typeof v!=='object'||![Object.prototype,null].includes(Object.getPrototypeOf(v))||Reflect.ownKeys(v).length!==keys.length||Object.keys(v).sort().join(',')!==[...keys].sort().join(',')||Object.values(Object.getOwnPropertyDescriptors(v)).some(d=>!Object.hasOwn(d,'value')))fail()}
const decimal=(v,max)=>typeof v==='string'&&/^[1-9][0-9]{0,19}$/.test(v)&&BigInt(v)<=max
function checkedTargetFrame(v,target){
 // Client address is authorized separately from the server's accepted address.
 // No CIDR/private-network allowlist can replace exact fixture-instance binding.
 if(!target||target.host!=='127.0.0.1'||target.port!==5432||target.database!=='agentstudio_pg18_ci'||target.user!=='agentstudio_admin')fail()
 exactObject(v,targetKeys)
 if(v.database!==target.database||v.login!==target.user||v.superuser!==true||v.primary!==true||!Number.isInteger(v.version)||v.version<180000||v.version>=190000||!decimal(v.system_identifier,18446744073709551615n)||!decimal(v.database_oid,4294967295n)||!decimal(v.postmaster_started_us,9223372036854775807n)||typeof v.server_addr!=='string'||!isIP(v.server_addr)||!Number.isInteger(v.server_port)||v.server_port<1||v.server_port>65535)fail()
}
/** Called once, only on SELECT results from the already initialized f.db. */
export function captureOriginalScheduleWorkerTarget(v,target){checkedTargetFrame(v,target);return Object.freeze(Object.fromEntries(instanceKeys.map(k=>[k,v[k]])))}
export function checkOriginalScheduleWorkerTarget(v,target,binding){checkedTargetFrame(v,target);exactObject(binding,instanceKeys);if(instanceKeys.some(k=>v[k]!==binding[k]))fail()}
export function checkOriginalScheduleWorkerRole(v,enabled){
 if(typeof enabled!=='boolean'||!v||v.name!==originalScheduleWorkerLogin||v.login!==enabled||v.superuser!==false||v.inherits!==false||v.bypassrls!==false||v.createrole!==false||v.createdb!==false||v.replication!==false||v.config!==null||v.valid_until!==null||v.connection_limit!==-1||v.no_direct_privileges!==true||v.connect!==true||v.database_create!==false||!Number.isSafeInteger(v.connections)||v.connections<0||typeof v.verifier!=='string'||!/^SCRAM-SHA-256\$[0-9]+:[A-Za-z0-9+/]+=*\$[A-Za-z0-9+/]+=*:[A-Za-z0-9+/]+=*$/.test(v.verifier))fail()
 return v
}
export function checkOriginalScheduleWorkerMembers(rows){
 if(!Array.isArray(rows)||rows.length!==2)fail()
 const actual=[...rows].sort((a,b)=>a.role.localeCompare(b.role,'en'))
 for(let i=0;i<2;i++){const r=actual[i];if(r.member!==originalScheduleWorkerLogin||r.role!==originalScheduleWorkerGroups[i]||r.admin!==false||r.inherit!==false||r.set!==true)fail()}
}
