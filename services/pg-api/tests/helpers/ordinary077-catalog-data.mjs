import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {ordinaryCaseTables as tables,ordinaryCaseFunctions as functions} from '../../src/native-ordinary-case-schema.ts'
import {ordinaryCasePresenceSql,ordinaryCaseExpectedPresence} from '../../src/native-ordinary-case-audit.ts'
import {monitor074Catalog,monitor074TableOid} from './monitor074-catalog-data.mjs'
import {monitorLiveIncomingSql} from '../../src/native-monitor-schema-profile.ts'
const ddl=readFileSync(new URL('../../../../db/postgres/migrations/pg_v9_077_ordinary_case_runs.sql',import.meta.url),'utf8')
const bodies=new Map([...ddl.matchAll(/CREATE FUNCTION agentstudio\.([a-z0-9_]+)\(([^)]*)\)[\s\S]*?AS \$fn\$([\s\S]*?)\$fn\$;/g)].map(m=>[m[1]+'('+m[2]+')',m[3]]))
const ids={agentstudio_api:'123',agentstudio_worker:'126',agentstudio_bound_dispatch:'127'}
export const ordinaryTableOid=name=>String(5000+tables.findIndex(t=>t.name===name))
export const ordinaryFunctionOid=signature=>String(6000+functions.findIndex(f=>f.name+'('+f.args+')'===signature))
export function ordinary077Catalog(change=()=>{}){
 const old=monitor074Catalog((stage,target,rows,p)=>{if(stage==='presence'&&target==='074')rows.push({kind:'constraint',name:'ordinary_case_runs_fk3'});change(stage,target,rows,p)}),trace=[]
 const respond=(stage,target,rows,p)=>{const copy=structuredClone(rows);change(stage,target,copy,p);return{rows:copy}}
 const db={async query(sql,p=[]){
  trace.push({sql,p})
   if(sql===monitorLiveIncomingSql){
    const source=tables.find(t=>t.name==='ordinary_case_runs'),fk=source.constraints.find(c=>c.name==='ordinary_case_runs_fk3')
    return respond('incoming-constraints','074',[{constraint_oid:'7000',name:fk.name,source_schema:'agentstudio',source_table:source.name,source_oid:ordinaryTableOid(source.name),owner_oid:'10',target_schema:'agentstudio',target_table:'monitor_live_cases',target_oid:monitor074TableOid('monitor_live_cases'),target_owner_oid:'10',kind:fk.type,keys:fk.keys.map(name=>source.columns.findIndex(c=>c.name===name)+1),target_keys:[1,2],update_action:'a',delete_action:'a',match:'s',valid:true,enforced:true,deferrable:false,deferred:false,local:true,ordinary:true,no_inherit:true,definition:fk.definition,table_ordinary:true}],p)
   }
  if(sql===ordinaryCasePresenceSql)return respond('presence','077',ordinaryCaseExpectedPresence.map(v=>{const at=v.indexOf(':');return{kind:v.slice(0,at),name:v.slice(at+1)}}),p)
  if(sql.startsWith('/* monitor074:role-oids */')&&p[0].includes('agentstudio_bound_dispatch'))return respond('role-oids','077',p[0].map(name=>({name,oid:ids[name]})),p)
  if(sql.startsWith('/* monitor074:table-column-acl */')&&tables.some(t=>ordinaryTableOid(t.name)===p[0])){
   const rows=[...['DELETE','INSERT','MAINTAIN','REFERENCES','SELECT','TRIGGER','TRUNCATE','UPDATE'].map(privilege=>({scope:'table',object_oid:p[0],column_number:0,column_name:null,grantor:'10',grantee:'10',privilege,grantable:false})),{scope:'table',object_oid:p[0],column_number:0,column_name:null,grantor:'10',grantee:'123',privilege:'SELECT',grantable:false}]
   return respond('table-acl',tables.find(t=>ordinaryTableOid(t.name)===p[0]).name,rows,p)
  }
  if(sql.startsWith('/* monitor074:function-acl */')&&functions.some(f=>ordinaryFunctionOid(f.name+'('+f.args+')')===p[0])){
   const fn=functions.find(f=>ordinaryFunctionOid(f.name+'('+f.args+')')===p[0]);return respond('function-acl',fn.name,['10',...fn.roles.map(r=>ids[r])].map(grantee=>({function_oid:p[0],grantor:'10',grantee,privilege:'EXECUTE',grantable:false})),p)
  }
  const t=tables.find(t=>'agentstudio.'+t.name===p[0])
  if(t){const target=t.name
   if(sql.startsWith("SELECT c.relkind='r'"))return respond('table',target,[{ok:true,api_oid:123,owner_oid:'10',table_oid:ordinaryTableOid(target)}],p)
   if(sql.startsWith('SELECT a.attname AS name'))return respond('column',target,t.columns.map(c=>({...c,safe:true})),p)
   if(sql.startsWith('SELECT polname AS name'))return respond('policy',target,[{name:target+'_owner',command:'r',permissive:true,roles:[123],using_expr:'(owner_user_id = agentstudio.actor_id())',check_expr:null}],p)
   if(sql.startsWith('SELECT conname AS name')){
    const authored=t.constraints.map(c=>{const marker='CONSTRAINT '+c.name+' ',start=ddl.indexOf(marker);assert(start>=0);let end=ddl.indexOf(',\n CONSTRAINT ',start);const tableEnd=ddl.indexOf('\n);',start);if(end<0||tableEnd<end)end=tableEnd;const definition=ddl.slice(start+marker.length,end).trim();const names=c.type==='c'?t.columns.filter(col=>new RegExp('\\b'+col.name+'\\b').test(definition)).map(col=>col.name):definition.slice(definition.indexOf('(')+1,definition.indexOf(')')).split(',').map(s=>s.trim());return{name:c.name,type:c.type,keys:names.map(name=>t.columns.findIndex(col=>col.name===name)+1),valid:true,enforced:true,deferrable:false,deferred:false,local:true,ordinary:true,no_inherit:['p','u','f'].includes(c.type),definition}})
    return respond('constraint',target,[...authored,...t.columns.flatMap((c,i)=>c.required?[{name:target+'_'+c.name+'_not_null',type:'n',keys:[i+1],valid:true,enforced:true,deferrable:false,deferred:false,local:true,ordinary:true,no_inherit:false,definition:'NOT NULL '+c.name}]:[])],p)
   }
   if(sql.startsWith('SELECT ci.relname AS name'))return respond('index',target,t.constraints.filter(c=>['p','u'].includes(c.type)).map(c=>({name:c.name,keys:[...c.keys],safe:true})),p)
   if(sql.startsWith('SELECT tgname AS name'))return respond('trigger',target,[{name:target+'_immutable',type:58,function_oid:ordinaryFunctionOid((t.mutable?'ordinary_case_slot_guard':'ordinary_case_immutable')+'()'),safe:true}],p)
  }
  if(sql.startsWith("SELECT p.prokind='f'")&&String(p[0]).startsWith('agentstudio.ordinary_case_')){
   const key=p[0].slice('agentstudio.'.length);assert(bodies.has(key));return respond('function',key,[{ok:true,source:bodies.get(key),owner_oid:'10',function_oid:ordinaryFunctionOid(key)}],p)
  }
  return old.db.query(sql,p)
 }}
 return{db,trace}
}
