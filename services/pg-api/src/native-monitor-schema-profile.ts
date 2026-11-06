import {isProxy} from 'node:util/types'
import type {SqlClient} from './contracts.ts'
import {monitorLiveOid} from './native-monitor-live-acl.ts'
import {monitorLiveTables} from './native-monitor-live-schema.ts'

// Catalog compatibility only. Execution and source access still require their
// original independent approvals and full ordinary077 audit.
export type MonitorLiveSchemaProfile='monitor074'|'monitor074-ordinary077'
const fail=():never=>{throw Error('unsafe_monitor_live_schema_profile')}
export function checkedMonitorLiveSchemaProfile(value:unknown):MonitorLiveSchemaProfile{
 if(value==='monitor074'||value==='monitor074-ordinary077')return value
 return fail()
}
export const monitorLiveIncomingSql=`/* monitor074:complete-external-incoming-constraints */
SELECT c.oid::text AS constraint_oid,c.conname::text AS name,
 sn.nspname::text AS source_schema,s.relname::text AS source_table,s.oid::text AS source_oid,s.relowner::text AS owner_oid,
 tn.nspname::text AS target_schema,t.relname::text AS target_table,t.oid::text AS target_oid,t.relowner::text AS target_owner_oid,
 c.contype::text AS kind,c.conkey AS keys,c.confkey AS target_keys,
 c.confupdtype::text AS update_action,c.confdeltype::text AS delete_action,c.confmatchtype::text AS match,
 c.convalidated AS valid,c.conenforced AS enforced,c.condeferrable AS deferrable,c.condeferred AS deferred,
 c.conislocal AND c.coninhcount=0 AND c.conparentid=0 AS local,c.contypid=0 AND NOT c.conperiod AS ordinary,c.connoinherit AS no_inherit,
 pg_catalog.pg_get_constraintdef(c.oid,true) AS definition,
 s.relkind='r' AND s.relpersistence='p' AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_inherits i WHERE i.inhrelid=s.oid OR i.inhparent=s.oid) AS table_ordinary
FROM pg_catalog.pg_constraint c JOIN pg_catalog.pg_class s ON s.oid=c.conrelid JOIN pg_catalog.pg_namespace sn ON sn.oid=s.relnamespace
 JOIN pg_catalog.pg_class t ON t.oid=c.confrelid JOIN pg_catalog.pg_namespace tn ON tn.oid=t.relnamespace
WHERE tn.nspname='agentstudio' AND t.relname=ANY($1::text[])
 AND NOT(sn.nspname='agentstudio' AND s.relname=ANY($1::text[]))
ORDER BY sn.nspname,s.relname,c.conname,c.oid`
const fields=['constraint_oid','name','source_schema','source_table','source_oid','owner_oid','target_schema','target_table','target_oid','target_owner_oid','kind','keys','target_keys','update_action','delete_action','match','valid','enforced','deferrable','deferred','local','ordinary','no_inherit','definition','table_ordinary'] as const
const canonical=(s:string)=>s.replace(/\s+/g,'')
function ownRow(raw:unknown):Record<typeof fields[number],unknown>{
 if(!raw||typeof raw!=='object'||isProxy(raw)||Object.getPrototypeOf(raw)!==Object.prototype)fail()
 const ds=Object.getOwnPropertyDescriptors(raw)
 if(Reflect.ownKeys(ds).length!==fields.length||fields.some(k=>!ds[k]?.enumerable||!Object.hasOwn(ds[k]!,'value')))fail()
 return Object.fromEntries(fields.map(k=>[k,ds[k]!.value])) as Record<typeof fields[number],unknown>
}
function exactKeys(raw:unknown,expected:readonly number[]){
 if(!Array.isArray(raw)||isProxy(raw)||Object.getPrototypeOf(raw)!==Array.prototype)fail()
 const ds=Object.getOwnPropertyDescriptors(raw)
 if(ds.length?.value!==expected.length||Reflect.ownKeys(ds).length!==expected.length+1||expected.some((n,i)=>!ds[i]?.enumerable||!Object.hasOwn(ds[i]!,'value')||ds[i]!.value!==n))fail()
}
export function monitorLiveExtensionPresence(profile:MonitorLiveSchemaProfile,rows:unknown):readonly string[]{
 checkedMonitorLiveSchemaProfile(profile)
 if(!Array.isArray(rows)||isProxy(rows)||Object.getPrototypeOf(rows)!==Array.prototype)return fail()
 const descriptors=Object.getOwnPropertyDescriptors(rows)
 if(Reflect.ownKeys(descriptors).length!==rows.length+1)fail()
 if(profile==='monitor074'){if(rows.length)fail();return Object.freeze([])}
 if(rows.length!==1||!Object.hasOwn(rows,0))fail()
 const descriptor=descriptors[0];if(!descriptor?.enumerable||!Object.hasOwn(descriptor,'value'))return fail()
 const r=ownRow(descriptor.value)
 for(const key of ['constraint_oid','source_oid','owner_oid','target_oid','target_owner_oid'] as const)monitorLiveOid(r[key])
 if(r.name!=='ordinary_case_runs_fk3'||r.source_schema!=='agentstudio'||r.source_table!=='ordinary_case_runs'||r.target_schema!=='agentstudio'||r.target_table!=='monitor_live_cases'||r.source_oid===r.target_oid||r.owner_oid!==r.target_owner_oid||r.kind!=='f'||r.update_action!=='a'||r.delete_action!=='a'||r.match!=='s'||r.valid!==true||r.enforced!==true||r.deferrable!==false||r.deferred!==false||r.local!==true||r.ordinary!==true||r.no_inherit!==true||r.table_ordinary!==true||typeof r.definition!=='string'||canonical(r.definition)!=='FOREIGNKEY(case_id,owner_user_id)REFERENCESagentstudio.monitor_live_cases(id,owner_user_id)')fail()
 exactKeys(r.keys,[4,3]);exactKeys(r.target_keys,[1,2])
 return Object.freeze(['constraint:ordinary_case_runs_fk3'])
}
export async function readMonitorLiveExtensionPresence(db:SqlClient,profile:MonitorLiveSchemaProfile):Promise<readonly string[]>{
 checkedMonitorLiveSchemaProfile(profile)
 if(profile==='monitor074')return Object.freeze([])
 // No name, owner, constraint type or source-schema allowlist in this query:
 // every external edge targeting any of the14 original tables is inspected.
 const result=await db.query(monitorLiveIncomingSql,[monitorLiveTables.map(t=>t.name)])
 return monitorLiveExtensionPresence(profile,result.rows)
}
