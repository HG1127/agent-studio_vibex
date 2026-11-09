import type {SqlClient} from './contracts.ts'
const fail=():never=>{throw Error('unsafe_monitor_live_inbox_schema')}
export function monitorLiveOid(value:unknown):string{
 if(typeof value!=='string'||!/^[1-9][0-9]{0,9}$/.test(value)||Number(value)>4294967295)return fail()
 return value
}
export async function monitorLiveRoleOids(db:SqlClient,names:readonly string[]):Promise<ReadonlyMap<string,string>>{
 if(new Set(names).size!==names.length)return fail()
 const rows=(await db.query<{name:string;oid:string}>("/* monitor074:role-oids */ SELECT rolname::text AS name,oid::text AS oid FROM pg_catalog.pg_roles WHERE rolname=ANY($1::text[]) ORDER BY rolname",[[...names]])).rows
 if(!Array.isArray(rows)||rows.length!==names.length)return fail()
 const result=new Map<string,string>(),oids=new Set<string>()
 for(const row of rows){if(!row||Object.keys(row).sort().join(',')!=='name,oid'||!names.includes(row.name)||result.has(row.name))return fail();const oid=monitorLiveOid(row.oid);if(oids.has(oid))return fail();oids.add(oid);result.set(row.name,oid)}
 return result
}
/** Complete raw edge multiset: no role join or privilege/grantee filtering. */
export async function verifyMonitorLiveTableAcl(db:SqlClient,tableOid:string,ownerOid:string,apiOid:string){
 monitorLiveOid(tableOid);monitorLiveOid(ownerOid);monitorLiveOid(apiOid);if(ownerOid===apiOid)return fail()
 const rows=(await db.query<{scope:string;object_oid:string;column_number:number;column_name:string|null;grantor:string;grantee:string;privilege:string;grantable:boolean}>(
 "/* monitor074:table-column-acl */ SELECT 'table'::text AS scope,c.oid::text AS object_oid,0::integer AS column_number,NULL::text AS column_name,a.grantor::text AS grantor,a.grantee::text AS grantee,a.privilege_type AS privilege,a.is_grantable AS grantable FROM pg_catalog.pg_class c CROSS JOIN LATERAL pg_catalog.aclexplode(coalesce(c.relacl,pg_catalog.acldefault('r',c.relowner))) a WHERE c.oid=$1::oid UNION ALL "+
 "SELECT 'column'::text,att.attrelid::text,att.attnum::integer,att.attname::text,a.grantor::text,a.grantee::text,a.privilege_type,a.is_grantable FROM pg_catalog.pg_attribute att CROSS JOIN LATERAL pg_catalog.aclexplode(att.attacl) a WHERE att.attrelid=$1::oid AND att.attnum>0 LIMIT 10",[tableOid])).rows
 const edge=(grantee:string,privilege:string)=>JSON.stringify(['table',tableOid,0,null,ownerOid,grantee,privilege,false])
 const expected=[...['DELETE','INSERT','MAINTAIN','REFERENCES','SELECT','TRIGGER','TRUNCATE','UPDATE'].map(privilege=>edge(ownerOid,privilege)),edge(apiOid,'SELECT')].sort()
 if(!Array.isArray(rows)||rows.length!==expected.length)return fail()
 const actual=Array.from(rows,row=>{if(!row||Object.keys(row).sort().join(',')!=='column_name,column_number,grantable,grantee,grantor,object_oid,privilege,scope')return fail();return JSON.stringify([row.scope,row.object_oid,row.column_number,row.column_name,row.grantor,row.grantee,row.privilege,row.grantable])}).sort()
 if(actual.some((v,i)=>v!==expected[i]))return fail()
}
export async function verifyMonitorLiveFunctionAcl(db:SqlClient,functionOid:string,ownerOid:string,allowedRoleOids:readonly string[]){
 monitorLiveOid(functionOid);monitorLiveOid(ownerOid);allowedRoleOids.forEach(monitorLiveOid)
 if(new Set(allowedRoleOids).size!==allowedRoleOids.length||allowedRoleOids.includes(ownerOid))return fail()
 const rows=(await db.query<{function_oid:string;grantor:string;grantee:string;privilege:string;grantable:boolean}>(
 "/* monitor074:function-acl */ SELECT p.oid::text AS function_oid,a.grantor::text AS grantor,a.grantee::text AS grantee,a.privilege_type AS privilege,a.is_grantable AS grantable FROM pg_catalog.pg_proc p CROSS JOIN LATERAL pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a WHERE p.oid=$1::oid LIMIT $2::integer",[functionOid,allowedRoleOids.length+2])).rows
 const expected=[ownerOid,...allowedRoleOids].map(grantee=>JSON.stringify([functionOid,ownerOid,grantee,'EXECUTE',false])).sort()
 if(!Array.isArray(rows)||rows.length!==expected.length)return fail()
 const actual=Array.from(rows,row=>{if(!row||Object.keys(row).sort().join(',')!=='function_oid,grantable,grantee,grantor,privilege')return fail();return JSON.stringify([row.function_oid,row.grantor,row.grantee,row.privilege,row.grantable])}).sort()
 if(actual.some((v,i)=>v!==expected[i]))return fail()
}
