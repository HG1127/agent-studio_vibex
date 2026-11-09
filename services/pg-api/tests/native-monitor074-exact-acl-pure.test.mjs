// Complete catalog DATA walks, not PG ACL/RLS acceptance. No SQL execution.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {monitorLiveTables as tables,monitorLiveFunctions as functions} from '../src/native-monitor-live-schema.ts'
import {verifyMonitorLiveSchema} from '../src/native-monitor-live-audit.ts'
import {monitor074Catalog,monitor074TableOid,monitor074FunctionOid} from './helpers/monitor074-catalog-data.mjs'
const denied=async(stage,target,change)=>{const f=monitor074Catalog((s,t,rows,p)=>{if(s===stage&&t===target)change(rows,p)});await assert.rejects(verifyMonitorLiveSchema(f.db),/unsafe_monitor_live/)}
test('full catalog binds14 table and69 function OIDs and compares every unfiltered raw ACL row',async()=>{
 const f=monitor074Catalog();await verifyMonitorLiveSchema(f.db)
 assert.equal(f.trace.filter(q=>q.sql.startsWith('/* monitor074:table-column-acl */')).length,tables.length)
 assert.equal(f.trace.filter(q=>q.sql.startsWith('/* monitor074:function-acl */')).length,functions.length)
 for(const q of f.trace.filter(q=>q.sql.startsWith('/* monitor074:table-column-acl */')||q.sql.startsWith('/* monitor074:function-acl */'))){
  assert(!/JOIN\s+pg_catalog\.pg_roles|WHERE[^]*privilege_type\s*=|WHERE[^]*grantee\s*(?:IN|=|<>)/i.test(q.sql),'raw ACL row filters are forbidden')
  assert(q.sql.includes('aclexplode'));assert(/^[1-9][0-9]*$/.test(q.p[0]))
 }
 for(const q of f.trace.filter(q=>q.sql.startsWith("SELECT c.relkind='r'")&&String(q.p[0]).includes('monitor_live_'))){assert(q.sql.includes("NOT has_table_privilege($2,c.oid,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')"));assert(q.sql.includes("'pg_maintain'"));assert(q.sql.includes('owner.rolsuper'))}
})
for(const t of tables)test(t.name+' every canonical owner/API raw edge is necessary and bound to actual table',async()=>{
 for(let n=0;n<9;n++){
  await denied('table-acl',t.name,r=>{r[n].grantor='98765'})
  await denied('table-acl',t.name,r=>{r[n].grantable=true})
  await denied('table-acl',t.name,r=>r.splice(n,1))
 }
 await denied('table-acl',t.name,r=>{r[0].object_oid=String(Number(monitor074TableOid(t.name))+999)})
})
const table=tables[0].name
for(const [label,change]of [
 ['PUBLIC',r=>{r[8].grantee='0'}],['extra superuser',r=>r.push({...r[8],grantee:'20'})],['builtin role',r=>r.push({...r[8],grantee:'3373'})],['ordinary role',r=>r.push({...r[8],grantee:'999'})],['duplicate',r=>r.push({...r[8]})],['owner missing despite effective rights',r=>r.shift()],['column grant',r=>r.push({...r[8],scope:'column',column_number:1,column_name:'owner_user_id'})],['owner column grant',r=>r.push({...r[0],scope:'column',column_number:1,column_name:'owner_user_id'})],['wrong privilege',r=>{r[8].privilege='INSERT'}],['hidden extra property',r=>{r[8].safe=true}],['string grant option',r=>{r[8].grantable='false'}],['wrong scope',r=>{r[0].scope='function'}],['wrong column',r=>{r[0].column_number=1}],['number objectOID',r=>{r[0].object_oid=Number(r[0].object_oid)}],
])test('complete table multiset rejects '+label,()=>denied('table-acl',table,change))
for(const fn of functions){const signature=fn.name+'('+fn.args+')';test(signature+' every owner/API/Worker/dispatch EXECUTE edge is exact',async()=>{
 const count=fn.roles.length+1
 for(let n=0;n<count;n++){
  await denied('function-acl',signature,r=>{r[n].grantor='20'})
  await denied('function-acl',signature,r=>{r[n].grantable=true})
  await denied('function-acl',signature,r=>r.splice(n,1))
 }
 await denied('function-acl',signature,r=>{r[0].function_oid=String(Number(monitor074FunctionOid(signature))+999)})
})}
const fn=functions.find(f=>f.roles.length>0),signature=fn.name+'('+fn.args+')'
for(const [label,change]of [
 ['PUBLIC',r=>r.push({...r[0],grantee:'0'})],['superuser',r=>r.push({...r[0],grantee:'20'})],['builtin role',r=>r.push({...r[0],grantee:'3373'})],['extra API/Worker role',r=>r.push({...r[0],grantee:'999'})],['duplicate owner',r=>r.push({...r[0]})],['owner revoke',r=>r.shift()],['privilege drift',r=>{r[0].privilege='SELECT'}],['extra metadata',r=>{r[0].safe=true}],['wrong OID type',r=>{r[0].function_oid=Number(r[0].function_oid)}],['nonboolean grant option',r=>{r[0].grantable=0}],
])test('complete function multiset rejects '+label,()=>denied('function-acl',signature,change))
for(const [label,change]of [
 ['missing',r=>r.pop()],['duplicate',r=>{r[2]={...r[1]}}],['same OID',r=>{r[1].oid=r[0].oid}],['wrong name',r=>{r[1].name='PUBLIC'}],['zero',r=>{r[1].oid='0'}],['negative',r=>{r[1].oid='-1'}],['noncanonical',r=>{r[1].oid='0124'}],['overflow',r=>{r[1].oid='4294967296'}],['numeric type',r=>{r[1].oid=124}],['extra field',r=>{r[1].ready=true}],
])test('allowed runtime role OIDs reject '+label,()=>denied('role-oids','074',change))
for(const t of tables)for(const [label,change]of [['invalid owner',r=>{r[0].owner_oid='0'}],['runtime as owner',r=>{r[0].owner_oid='124'}],['invalid tableOID',r=>{r[0].table_oid='4294967296'}],['wrong API OID',r=>{r[0].api_oid=999}]])test(t.name+' metadata rejects '+label,()=>denied('table',t.name,change))
test('all14 tables require the same canonical superuser owner and unique actual table OID',async()=>{
 for(const t of tables.slice(1)){await denied('table',t.name,r=>{r[0].owner_oid='20'});await denied('table',t.name,r=>{r[0].table_oid=monitor074TableOid(tables[0].name)})}
})
for(const fn of functions){const signature=fn.name+'('+fn.args+')';test(signature+' metadata owner remains canonical and functionOID cannot be invalid',async()=>{
 await denied('function',signature,r=>{r[0].owner_oid='20'})
 await denied('function',signature,r=>{r[0].function_oid='0'})
})}
test('distinct function signatures cannot share one catalog OID',()=>denied('function',functions[1].name+'('+functions[1].args+')',r=>{r[0].function_oid=monitor074FunctionOid(functions[0].name+'('+functions[0].args+')')}))
test('explicit ACL verification contains SELECTs only and no capability/SQL mutation authority',()=>{
 const text=fs.readFileSync(new URL('../src/native-monitor-live-acl.ts',import.meta.url),'utf8')
 assert.doesNotMatch(text,/\b(?:INSERT INTO|UPDATE agentstudio|DELETE FROM|GRANT |REVOKE |ALTER |CREATE )/)
 assert.doesNotMatch(text,/\.filter\(/);assert(text.includes('att.attnum>0 LIMIT 10'));assert(!text.includes('NOT att.attisdropped'))
})
