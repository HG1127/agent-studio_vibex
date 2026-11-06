import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {monitorLiveTables as liveTables,monitorLiveFunctions as liveFunctions,monitorLiveRoles} from '../../src/native-monitor-live-schema.ts'
import {verifyMonitorLiveSchema,inspectOptionalMonitorLive,monitorLivePresenceSql,monitorLiveExpectedPresence} from '../../src/native-monitor-live-audit.ts'
import {nativeMonitorTables as previousTables,nativeMonitorFunctions as previousFunctions} from '../../src/native-monitor-inbox-schema.ts'
import {nativeMonitorPresenceSql,nativeMonitorExpectedPresence} from '../../src/native-monitor-inbox-audit.ts'
// Literal-DDL catalog doubles only. This is not a PostgreSQL parser/engine or
// an installed-schema/RLS attestation. Production/Hosted PG validation remains required.
const digest=v=>createHash('sha256').update(v).digest('hex')
const previous=readFileSync(new URL('../../../../db/postgres/migrations/pg_v9_073_monitor_inbox.sql',import.meta.url),'utf8')
const ddl=readFileSync(new URL('../../../../db/postgres/migrations/pg_v9_074_monitor_live.sql',import.meta.url),'utf8')
const parsedBodies=text=>new Map([...text.matchAll(/CREATE FUNCTION agentstudio\.([a-z0-9_]+)\(([^)]*)\)[\s\S]*?AS \$fn\$([\s\S]*?)\$fn\$;/g)].map(m=>[m[1]+'('+m[2]+')',m[3]]))
const previousBodies=parsedBodies(previous),liveBodies=parsedBodies(ddl),allTables=[...previousTables,...liveTables]
function literalConstraint(table,wanted){
 const sql=table.name.startsWith('native_')?previous:ddl
 const marker='CONSTRAINT '+wanted.name+' ',line=sql.split('\n').find(v=>v.includes(marker))
 assert(line,'literal authored '+wanted.name)
 const definition=line.slice(line.indexOf(marker)+marker.length).replace(/[,;]$/,'')
 // All current authored CHECKs are single closed helper calls. Preserve the
 // first expression Var occurrence, as PG18 StoreRelCheck does; never sort.
 let names
 if(wanted.type==='c'){
  const expression=definition.slice('CHECK('.length,-1)
  assert.match(expression,/^agentstudio\.[a-z_]+\([a-z0-9_,]+\)$/)
  names=[...new Set(expression.slice(expression.indexOf('(')+1,-1).split(','))]
 }else names=definition.slice(definition.indexOf('(')+1,definition.indexOf(')')).split(',')
 const keys=names.map(name=>{const n=table.columns.findIndex(c=>c.name===name)+1;assert(n>0,name);return n})
 return{name:wanted.name,type:wanted.type,keys,valid:true,enforced:true,deferrable:definition.includes(' DEFERRABLE'),deferred:definition.includes(' INITIALLY DEFERRED'),local:true,ordinary:true,no_inherit:['p','u','f'].includes(wanted.type),definition:definition.replace(' ON UPDATE NO ACTION ON DELETE NO ACTION','')}
}
export const monitor074RoleData=Object.freeze([{name:'agentstudio_api',oid:'123'},{name:'agentstudio_monitor_worker',oid:'124'},{name:'agentstudio_monitor_dispatch',oid:'125'},{name:'agentstudio_worker',oid:'126'}])
export const monitor074OwnerOid='10'
export const monitor074TableOid=name=>String(1000+liveTables.findIndex(t=>t.name===name))
export const monitor074FunctionOid=signature=>String(2000+liveFunctions.findIndex(f=>f.name+'('+f.args+')'===signature))
function tableEdges(oid){return[...['DELETE','INSERT','MAINTAIN','REFERENCES','SELECT','TRIGGER','TRUNCATE','UPDATE'].map(privilege=>({scope:'table',object_oid:oid,column_number:0,column_name:null,grantor:'10',grantee:'10',privilege,grantable:false})),{scope:'table',object_oid:oid,column_number:0,column_name:null,grantor:'10',grantee:'123',privilege:'SELECT',grantable:false}]}
export function monitor074Catalog(change=()=>{}){
 const trace=[]
 const respond=(stage,target,rows,p)=>{const copy=structuredClone(rows);change(stage,target,copy,p);return{rows:copy}}
 const db={async query(sql,p=[]){
  trace.push({sql,p})
  if(sql===nativeMonitorPresenceSql)return respond('presence','073',nativeMonitorExpectedPresence.map(v=>{const at=v.indexOf(':');return{kind:v.slice(0,at),name:v.slice(at+1)}}),p)
  if(sql===monitorLivePresenceSql)return respond('presence','074',monitorLiveExpectedPresence.map(v=>{const at=v.indexOf(':');return{kind:v.slice(0,at),name:v.slice(at+1)}}),p)
  if(sql.startsWith('/* monitor074:role-oids */'))return respond('role-oids','074',monitor074RoleData,p)
   if(sql.startsWith('/* monitor074:table-column-acl */')){const table=liveTables.find(t=>monitor074TableOid(t.name)===p[0]);assert(table);return respond('table-acl',table.name,tableEdges(p[0]),p)}
   if(sql.startsWith('/* monitor074:function-acl */')){const fn=liveFunctions.find(f=>monitor074FunctionOid(f.name+'('+f.args+')')===p[0]);assert(fn);const rows=['10',...fn.roles.map(name=>monitor074RoleData.find(r=>r.name===name).oid)].map(grantee=>({function_oid:p[0],grantor:'10',grantee,privilege:'EXECUTE',grantable:false}));assert.equal(p[1],rows.length+1);return respond('function-acl',fn.name+'('+fn.args+')',rows,p)}
   if(sql.startsWith('SELECT NOT r.rolcanlogin'))return respond('role',p[0],[{safe:true}],p)
  const t=allTables.find(t=>'agentstudio.'+t.name===p[0])
  if(t){
   const target=t.name
   if(sql.startsWith("SELECT c.relkind='r'"))return respond('table',target,[{ok:true,api_oid:123,...(target.startsWith('monitor_live_')?{owner_oid:'10',table_oid:monitor074TableOid(target)}:{})}],p)
   if(sql.startsWith('SELECT a.attname AS name'))return respond('column',target,t.columns.map(c=>({...c,safe:true})),p)
   if(sql.startsWith('SELECT polname AS name'))return respond('policy',target,[{name:target+'_owner',command:'r',permissive:true,roles:[123],using_expr:'(owner_user_id = agentstudio.actor_id())',check_expr:null}],p)
   if(sql.startsWith('SELECT conname AS name'))return respond('constraint',target,[...t.constraints.map(c=>literalConstraint(t,c)),...t.columns.flatMap((c,i)=>c.required?[{name:target+'_'+c.name+'_not_null',type:'n',keys:[i+1],valid:true,enforced:true,deferrable:false,deferred:false,local:true,ordinary:true,no_inherit:false,definition:'NOT NULL '+c.name}]:[])],p)
   if(sql.startsWith('SELECT ci.relname AS name'))return respond('index',target,t.constraints.filter(c=>['p','u'].includes(c.type)).map(c=>({name:c.name,keys:[...c.keys],safe:true})),p)
   if(sql.startsWith('SELECT tgname AS name')){
    const event=target.endsWith('_events'),namespace=target.startsWith('native_')?'native_monitor':'monitor_live'
    return respond('trigger',target,[{name:target+'_immutable',type:event?42:58,function_name:namespace+('mutable'in t&&t.mutable?'_state_guard':'_immutable'),safe:true},...(event?[{name:namespace+'_events_read_guard',type:19,function_name:namespace+'_read_guard',safe:true}]:[])],p)
   }
  }
  if(sql.startsWith("SELECT p.prokind='f'")){
   const key=String(p[0]).replace(/^agentstudio\./,''),body=(key.startsWith('native_')?previousBodies:liveBodies).get(key)
   assert.equal(typeof body,'string',key)
   return respond('function',key,[{ok:true,source:body,...(key.startsWith('monitor_live_')?{owner_oid:'10',function_oid:monitor074FunctionOid(key)}:{})}],p)
  }
  throw Error('unexpected pure catalog query '+sql)
 }}
 return{db,trace}
}
