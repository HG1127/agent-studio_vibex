import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {ordinaryCaseTables as tables,ordinaryCaseFunctions as functions} from '../src/native-ordinary-case-schema.ts'
import {verifyOrdinaryCaseSchema,inspectOptionalOrdinaryCase,ordinaryCasePresenceSql} from '../src/native-ordinary-case-audit.ts'
import {ordinary077Catalog} from './helpers/ordinary077-catalog-data.mjs'
// Catalog DATA tests only. No PostgreSQL engine or installed-schema acceptance.
const deny=async(stage,target,change)=>{const fixture=ordinary077Catalog((s,t,rows,p)=>{if(s===stage&&t===target)change(rows,p)});await assert.rejects(verifyOrdinaryCaseSchema(fixture.db),/unsafe_ordinary_case|unsafe_monitor_live/)}
test('literal077 migration has four distinct ordinary tables and15 body-hashed private RPCs',async()=>{
 const f=ordinary077Catalog();await verifyOrdinaryCaseSchema(f.db)
 const ddl=readFileSync(new URL('../../../db/postgres/migrations/pg_v9_077_ordinary_case_runs.sql',import.meta.url),'utf8')
 assert.equal(tables.length,4);assert.equal(functions.length,15)
 for(const m of ddl.matchAll(/CREATE FUNCTION agentstudio\.(ordinary_case_[a-z_]+)\(([^)]*)\)[\s\S]*?AS \$fn\$([\s\S]*?)\$fn\$;/g)){const fn=functions.find(f=>f.name===m[1]&&f.args===m[2]);assert(fn);assert.equal(createHash('sha256').update(m[3]).digest('hex'),fn.sha256)}
 assert(!/CREATE OR REPLACE|ALTER TABLE agentstudio\.monitor_live|INSERT INTO agentstudio\.monitor_live_checks/i.test(ddl))
 assert(!/lease_token uuid NOT NULL/.test(ddl));assert(ddl.includes('fresh.xmin=pg_current_xact_id()::xid'))
 const raw=f.trace.filter(q=>(q.sql.startsWith('/* monitor074:table-column-acl */')||q.sql.startsWith('/* monitor074:function-acl */'))&&Number(q.p[0])>=5000)
 assert.equal(raw.length,19);for(const q of raw)assert(!/JOIN\s+pg_catalog\.pg_roles|WHERE[^]*privilege_type\s*=|WHERE[^]*grantee\s*(?:IN|=|<>)/i.test(q.sql))
})
for(const t of tables){
 for(const key of ['oid','owner','missing','PUBLIC','grantable','wrong-grantor','duplicate','column'])test(t.name+' rejects '+key,async()=>{
  if(key==='oid')return deny('table',t.name,rows=>rows[0].table_oid='01')
  if(key==='owner')return deny('table',t.name,rows=>rows[0].owner_oid='126')
  return deny('table-acl',t.name,rows=>{if(key==='missing')rows.pop();if(key==='PUBLIC')rows.push({...rows[8],grantee:'0'});if(key==='grantable')rows[8].grantable=true;if(key==='wrong-grantor')rows[8].grantor='11';if(key==='duplicate')rows[7]={...rows[6]};if(key==='column')rows.push({...rows[8],scope:'column',column_number:999,column_name:'dropped_or_hidden'})})
 })
 for(const stage of ['column','policy','constraint','index','trigger'])test(t.name+' rejects changed '+stage,async()=>deny(stage,t.name,rows=>{if(stage==='column')rows[0].safe=false;if(stage==='policy')rows[0].using_expr='true';if(stage==='constraint')rows[0].definition='CHECK(true)';if(stage==='index')rows[0].safe=false;if(stage==='trigger')rows[0].safe=false}))
}
for(const fn of functions){
 test(fn.name+' rejects edited body',async()=>deny('function',fn.name+'('+fn.args+')',rows=>rows[0].source+=' -- changed'))
 for(const key of ['PUBLIC','missing','grantable','wrong-grantor'])test(fn.name+' rejects '+key,async()=>deny('function-acl',fn.name,rows=>{if(key==='PUBLIC')rows.push({...rows[0],grantee:'0'});if(key==='missing')rows.pop();if(key==='grantable')rows[0].grantable=true;if(key==='wrong-grantor')rows[0].grantor='11'}))
}
test('partial or extra077 presence is never treated as absent',async()=>{await deny('presence','077',rows=>rows.pop());await deny('presence','077',rows=>rows.push({kind:'function',name:'ordinary_case_shadow'}))})
test('ordinary077 full audit refuses missing or unknown incoming074 edges and changed FK actions',async()=>{
 await deny('incoming-constraints','074',rows=>rows.pop())
 await deny('incoming-constraints','074',rows=>rows.push({...rows[0],name:'unreviewed_incoming'}))
 await deny('incoming-constraints','074',rows=>{rows[0].delete_action='c'})
 await deny('presence','074',rows=>rows.push({kind:'constraint',name:'unreviewed_incoming'}))
})
for(const t of tables)test(t.name+' matches authored BEFORE UPDATE OR DELETE ROW trigger and refuses statement substitutes',async()=>{
 const ddl=readFileSync(new URL('../../../db/postgres/migrations/pg_v9_077_ordinary_case_runs.sql',import.meta.url),'utf8'),fn=t.mutable?'ordinary_case_slot_guard':'ordinary_case_immutable'
 assert.match(ddl,new RegExp('CREATE TRIGGER '+t.name+'_immutable BEFORE UPDATE OR DELETE\\s+ON agentstudio\\.'+t.name+' FOR EACH ROW EXECUTE FUNCTION agentstudio\\.'+fn+'\\(\\);'))
 assert.equal(1+2+8+16,27)
 for(const type of [0,26,58,59])await deny('trigger',t.name,rows=>{rows[0].type=type})
})
test('optional absence reads no RPC, rolls back and releases once',async()=>{const trace=[];let released=0;const pool={connect:async()=>({query:async sql=>{trace.push(sql);return{rows:sql===ordinaryCasePresenceSql?[]:[]}},release(){released++}})};assert.equal(await inspectOptionalOrdinaryCase(pool),'absent');assert.equal(released,1);assert.equal(trace.at(-1),'ROLLBACK');assert(trace.every(q=>!q.includes('ordinary_case_bind(')))})
