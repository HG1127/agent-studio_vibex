import {monitor074Catalog} from './helpers/monitor074-catalog-data.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {monitorLiveTables as liveTables,monitorLiveFunctions as liveFunctions,monitorLiveRoles} from '../src/native-monitor-live-schema.ts'
import {verifyMonitorLiveSchema,inspectOptionalMonitorLive,monitorLivePresenceSql,monitorLiveExpectedPresence} from '../src/native-monitor-live-audit.ts'
import {nativeMonitorTables as previousTables,nativeMonitorFunctions as previousFunctions} from '../src/native-monitor-inbox-schema.ts'
import {nativeMonitorPresenceSql,nativeMonitorExpectedPresence} from '../src/native-monitor-inbox-audit.ts'
// Literal-DDL catalog doubles only. This is not a PostgreSQL parser/engine or
// an installed-schema/RLS attestation. Production/Hosted PG validation remains required.
const digest=v=>createHash('sha256').update(v).digest('hex')
const previous=readFileSync(new URL('../../../db/postgres/migrations/pg_v9_073_monitor_inbox.sql',import.meta.url),'utf8')
const ddl=readFileSync(new URL('../../../db/postgres/migrations/pg_v9_074_monitor_live.sql',import.meta.url),'utf8')
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
const catalog=monitor074Catalog
test('complete 074 catalog walk composes the fixed 073 auditor and verifies all literal function bodies',async()=>{
 const f=catalog();await verifyMonitorLiveSchema(f.db)
 assert.equal(f.trace.filter(q=>q.sql.startsWith("SELECT p.prokind='f'")).length,previousFunctions.length+liveFunctions.length)
 assert(f.trace.findIndex(q=>q.sql===nativeMonitorPresenceSql)<f.trace.findIndex(q=>q.sql===monitorLivePresenceSql))
 assert.equal(liveBodies.size,liveFunctions.length);assert.equal(liveTables.length,14)
 assert.equal(new Set(monitorLiveExpectedPresence).size,monitorLiveExpectedPresence.length)
 for(const fn of liveFunctions)assert.equal(digest(liveBodies.get(fn.name+'('+fn.args+')')),fn.sha256,fn.name)
 assert.equal(digest(previous),'ba25340ea909384e46d25ab530f062c93bed9bbbb2d3edf3ebc22c2b12b664db')
})
test('literal table columns, constraint Var order, helper hashes and direct grants match the closed manifest',()=>{
 const blocks=[...ddl.matchAll(/CREATE TABLE agentstudio\.([a-z_]+)\(\n([\s\S]*?)\n\);/g)]
 assert.equal(blocks.length,liveTables.length)
 for(const t of liveTables){
  const body=blocks.find(m=>m[1]===t.name)?.[2];assert(body,t.name)
  const columns=body.split('\n').filter(v=>!v.includes('CONSTRAINT ')).map(v=>{
   const m=/^ ([a-z0-9_]+) ([a-z0-9_ ]+?)( NOT NULL)?[,]?$/.exec(v);assert(m,v)
   return{name:m[1],type:m[2],required:!!m[3]}
  })
  assert.deepEqual(columns,t.columns)
  for(const c of t.constraints)assert.deepEqual(literalConstraint(t,c).keys,c.keys.map(k=>t.columns.findIndex(col=>col.name===k)+1),c.name)
  assert(ddl.includes('FOR SELECT TO agentstudio_api USING(owner_user_id=agentstudio.actor_id())'))
 }
 assert.doesNotMatch(ddl,/GRANT (?:INSERT|UPDATE|DELETE|ALL) ON (?:TABLE )?agentstudio\.monitor_live_/)
 assert.doesNotMatch(ddl,/REFERENCES agentstudio\.native_monitor_/)
 assert.equal([...ddl.matchAll(/CREATE ROLE agentstudio_monitor_/g)].length,monitorLiveRoles.length)
})
test('partial, duplicate, stray objects and inherited 073 mutation fail closed',async()=>{
 for(const extra of [{kind:'relation',name:'monitor_live_shadow'},{kind:'type',name:'_monitor_live_shadow'},{kind:'function',name:'monitor_live_extra'},{kind:'constraint',name:'incoming_foreign_key'},{kind:'event_trigger',name:'monitor_live_evil'},{kind:'role',name:'agentstudio_monitor_extra'}]){
  const f=catalog((s,t,rows)=>{if(s==='presence'&&t==='074')rows.push(extra)})
  await assert.rejects(()=>verifyMonitorLiveSchema(f.db),/unsafe_monitor_live/)
 }
 for(const target of ['073','074']){
  for(const action of [rows=>rows.pop(),rows=>rows.push(rows[0])]){
   const f=catalog((s,t,rows)=>{if(s==='presence'&&t===target)action(rows)})
   await assert.rejects(()=>verifyMonitorLiveSchema(f.db),/unsafe_.*monitor/)
  }
 }
})
test('unsafe Worker/dispatch role metadata or memberships cannot pass the strict role query',async()=>{
 for(const role of monitorLiveRoles){
  const f=catalog((s,t,r)=>{if(s==='role'&&t===role)r[0].safe=false})
  await assert.rejects(()=>verifyMonitorLiveSchema(f.db),/unsafe_monitor_live/)
 }
 const f=catalog();await verifyMonitorLiveSchema(f.db)
 for(const q of f.trace.filter(q=>q.sql.startsWith('SELECT NOT r.rolcanlogin'))){
  for(const required of ['NOT r.rolinherit','NOT r.rolbypassrls','a.admin_option','a.inherit_option','NOT a.set_option',"pg_has_role(member.oid,other.oid,'MEMBER')"])assert(q.sql.includes(required))
 }
})
test('table/column/policy/index/trigger metadata remain exact, including owner RLS and no effective raw writes',async()=>{
 const patches=[
  ['table',r=>r[0].ok=false],['column',r=>r[0].type='text'],['column',r=>r[0].safe=false],['column',r=>r.reverse()],
  ['policy',r=>r[0].roles=[0]],['policy',r=>r[0].command='*'],['policy',r=>r[0].using_expr='true'],['policy',r=>r.push(r[0])],
  ['index',r=>r[0].safe=false],['index',r=>r[0].keys=['owner_user_id']],['trigger',r=>r[0].safe=false],['trigger',r=>r[0].function_name='monitor_live_immutable']
 ]
 for(const [stage,patch]of patches){
  const f=catalog((s,t,r)=>{if(s===stage&&t==='monitor_live_monitors')patch(r)})
  await assert.rejects(()=>verifyMonitorLiveSchema(f.db),/unsafe_monitor_live/)
 }
})
test('all CHECK keys retain expression order; reversed, missing and duplicate columns are rejected',async()=>{
 const name='monitor_live_requests_value_ck',table=liveTables.find(t=>t.name==='monitor_live_requests'),wanted=table.constraints.find(c=>c.name===name),ordered=literalConstraint(table,wanted).keys
 for(const keys of [[...ordered].reverse(),ordered.slice(1),[...ordered,ordered[0]]]){
  const f=catalog((s,t,r)=>{if(s==='constraint'&&t===table.name)r.find(c=>c.name===name).keys=keys})
  await assert.rejects(()=>verifyMonitorLiveSchema(f.db),/unsafe_monitor_live/)
 }
})
test('constraint type, enforcement, inheritance, deferral and immutable expressions reject mutation',async()=>{
 for(const patch of [{type:'u'},{valid:false},{enforced:false},{local:false},{ordinary:false},{no_inherit:true},{deferrable:true},{deferred:true},{definition:'CHECK (true)'}]){
  const f=catalog((s,t,r)=>{if(s==='constraint'&&t==='monitor_live_reads')Object.assign(r.find(c=>c.type==='c'),patch)})
  await assert.rejects(()=>verifyMonitorLiveSchema(f.db),/unsafe_monitor_live/)
 }
 const f=catalog((s,t,r)=>{if(s==='constraint'&&t==='monitor_live_monitors')r.find(c=>c.name==='monitor_live_monitors_current_fk').deferred=false})
 await assert.rejects(()=>verifyMonitorLiveSchema(f.db),/unsafe_monitor_live/)
})
test('function privilege/owner/config aggregate and byte-exact source hashes cannot be weakened',async()=>{
 for(const patch of [{ok:false},{source:'\nSELECT true\n'},{source:liveBodies.values().next().value.trimStart()}]){
  const f=catalog((s,t,r)=>{if(s==='function'&&t==='monitor_live_employee(uuid)')Object.assign(r[0],patch)})
  await assert.rejects(()=>verifyMonitorLiveSchema(f.db),/unsafe_monitor_live/)
 }
})
test('optional absence returns absent without running predecessor audit and always releases read-only transaction',async()=>{
 const trace=[],release=[]
 const pool={connect:async()=>({async query(sql){trace.push(sql);return{rows:[]}},release(...args){release.push(args)}})}
 assert.equal(await inspectOptionalMonitorLive(pool),'absent')
 assert.deepEqual(trace,['BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY','SET LOCAL ROLE agentstudio_api','SET LOCAL search_path=pg_catalog',monitorLivePresenceSql,'ROLLBACK'])
 assert.deepEqual(release,[[]])
})
test('partial install errors retain the primary failure; rollback errors discard and cannot attest installed',async()=>{
 for(const failRead of [false,true]){
  const release=[],pool={connect:async()=>({async query(sql){
   if(sql==='ROLLBACK')throw Error('synthetic rollback failure')
   if(sql===monitorLivePresenceSql){if(failRead)throw Error('synthetic catalog failure');return{rows:[]}}
   return{rows:[]}
  },release(...args){release.push(args)}})}
  await assert.rejects(()=>inspectOptionalMonitorLive(pool),failRead?/synthetic catalog failure/:/monitor_live_catalog_rollback_required/)
  assert.deepEqual(release,[[true]])
 }
 const f=catalog(),release=[],pool={connect:async()=>({async query(sql,p){if(['BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY','SET LOCAL ROLE agentstudio_api','SET LOCAL search_path=pg_catalog','ROLLBACK'].includes(sql))return{rows:[]};return f.db.query(sql,p)},release(...a){release.push(a)}})}
 assert.equal(await inspectOptionalMonitorLive(pool),'installed');assert.deepEqual(release,[[]])
})
