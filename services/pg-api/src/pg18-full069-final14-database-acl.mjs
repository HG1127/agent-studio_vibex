// Pure comparison of the complete SELECT result only. No SQL, Pool, role changes,
// session projection, authority, source allowlist input or filtered ACL hash.
import {complete069PlanWorkflowPredecessors} from './pg18-complete-plan-workflow-predecessor-plan.mjs'
import {complete069PlanWorkflowAbi} from './pg18-complete-plan-workflow-plan.mjs'
import {workerHeartbeatKinds} from './worker-heartbeat-contract.ts'
const businessNames=Object.freeze([...complete069PlanWorkflowPredecessors.map(r=>r.login),...complete069PlanWorkflowAbi.map(r=>r.login)]),telemetryNames=Object.freeze(['studio_telemetry_reader',...workerHeartbeatKinds.flatMap(k=>[1,2].map(n=>'studio_telemetry_tx_'+k+'_'+n))]),databaseNames=Object.freeze(['agent_studio','agent_studio_telemetry','postgres','template0','template1'])
const fail=()=>{throw Error('full069_final14_catalog_database_acl')},oid=v=>typeof v==='string'&&/^[1-9][0-9]{0,9}$/.test(v)&&BigInt(v)<=4294967295n
function values(raw,required,exact=false){
 if(!raw||typeof raw!=='object'||![Object.prototype,null].includes(Object.getPrototypeOf(raw)))return fail()
 const ds=Object.getOwnPropertyDescriptors(raw),keys=Reflect.ownKeys(raw)
 if(keys.some(k=>typeof k!=='string'||!ds[k]?.enumerable||!Object.hasOwn(ds[k],'value'))||required.some(k=>!Object.hasOwn(ds,k))||exact&&keys.length!==required.length)return fail()
 return Object.fromEntries(required.map(k=>[k,ds[k].value]))
}
function list(raw){if(!Array.isArray(raw)||Object.getPrototypeOf(raw)!==Array.prototype||Reflect.ownKeys(raw).length!==raw.length+1)return fail();return Array.from({length:raw.length},(_,i)=>{const d=Object.getOwnPropertyDescriptor(raw,String(i));if(!d?.enumerable||!Object.hasOwn(d,'value'))return fail();return d.value})}
const rowKeys=['database_oid','database','owner','grantee_oid','grantee','grantor','privilege','grantable']
const key=r=>JSON.stringify(rowKeys.map(k=>r[k]))
export function inspectFinal14DatabaseAclRows(rawAcl,rawDatabases,rawRoles){
 const databases=list(rawDatabases).map(r=>values(r,['id','name','owner'])),roles=list(rawRoles).map(r=>values(r,['id','name'])),rows=list(rawAcl).map(r=>values(r,rowKeys,true))
 if(databases.length!==5||new Set(databases.map(r=>r.id)).size!==5||new Set(databases.map(r=>r.name)).size!==5||databases.some(r=>!databaseNames.includes(r.name)||!oid(r.id)||r.owner!=='postgres')||new Set(roles.map(r=>r.name)).size!==roles.length||new Set(roles.map(r=>r.id)).size!==roles.length||roles.some(r=>!oid(r.id)||typeof r.name!=='string'))fail()
 const roleMap=new Map(roles.map(r=>[r.name,r.id])),dbMap=new Map(databases.map(r=>[r.name,r.id]))
 if(roleMap.get('postgres')!=='10'||[...businessNames,...telemetryNames].some(n=>!roleMap.has(n)))fail()
 const expected=[],add=(database,grantee,privilege)=>expected.push({database_oid:dbMap.get(database),database,owner:'postgres',grantee_oid:grantee==='PUBLIC'?'0':roleMap.get(grantee),grantee,grantor:'postgres',privilege,grantable:false})
 for(const database of databaseNames){
  for(const privilege of ['CREATE','CONNECT','TEMPORARY'])add(database,'postgres',privilege)
  if(database==='agent_studio'){
   // The original050 bootstrap revokes PUBLIC CONNECT only. The original C8
   // and final F05 plans explicitly preserve its existing PUBLIC TEMP grant.
   add(database,'PUBLIC','TEMPORARY');for(const login of businessNames)add(database,login,'CONNECT')
  }else if(database==='agent_studio_telemetry'){
   // Original Telemetry SQL revokes PUBLIC ALL and grants only17 LOGIN CONNECTs.
   for(const login of telemetryNames)add(database,login,'CONNECT')
  }else for(const privilege of ['CONNECT','TEMPORARY'])add(database,'PUBLIC',privilege)
 }
 // Exact whole-result comparison rejects unknown/missing/duplicate rows, wrong
 // database/role OIDs, owner/grantor changes and every GRANT OPTION. Original
 // runtime validation still owns the fixed role, target and database inventory.
 const actualKeys=rows.map(key).sort(),expectedKeys=expected.map(key).sort()
 if(JSON.stringify(actualKeys)!==JSON.stringify(expectedKeys))fail()
 return Object.freeze({record_only:true,runtime_authorization:false,grant_rows:expected.length,business_logins:14,telemetry_connect_logins:17,qualifies_run:false})
}
