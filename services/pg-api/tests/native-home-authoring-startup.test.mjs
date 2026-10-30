import fs from 'node:fs'
import test from 'node:test'
import assert from 'node:assert/strict'
import {prepareNativeHomeAgentSpecs} from '../src/native-home-agent-specs-runtime.ts'
import {originalHome070PresenceSql,inspectOptionalNativeHomeAuthoringSchema} from '../src/native-home-authoring-audit.ts'
import {originalHomeStatisticsPresenceSql} from '../src/native-home-knowledge-stats-audit.ts'
// Catalog-shaped DATA and query-control tests only. No SQL engine, sockets,
// real Cookie or real privilege/installation claims are provided by fixtures.
const names=['agent_spec_id','owner_user_id','authoring','created_at','updated_at']
const expected=['migration:pg_v9_070','relation:agent_spec_authoring','related_relation:agent_spec_authoring_pkey','type:agent_spec_authoring','type:_agent_spec_authoring','function:home_authoring_utf16_length','function:home_authoring_valid','constraint:agent_spec_authoring_pkey','constraint:agent_spec_authoring_owner_fk','constraint:agent_spec_authoring_valid_ck','policy:agent_spec_authoring_owner',...names.map(name=>'constraint:agent_spec_authoring_'+name+'_not_null')]
const presence=expected.map(x=>{const at=x.indexOf(':');return{kind:x.slice(0,at),name:x.slice(at+1)}})
const origin='https://studio.example.test',identity={issuer:'urn:agentstudio:local:v1',subject:'verified-by-test-stub'}
function fixture(rows=[]){
 const sql=fs.readFileSync(new URL('../../../db/postgres/migrations/pg_v9_070_home_authoring.sql',import.meta.url),'utf8'),bodies=[...sql.matchAll(/CREATE FUNCTION agentstudio\.(\w+)\([^;]+?AS \$fn\$([\s\S]*?)\$fn\$;/g)].map(m=>m[2])
 // REL_18_STABLE: CREATE TABLE PK/FK use connoinherit=true; the ordinary
 // CHECK and all five NOT NULL constraints use false, with no inheritance.
 const constraints=[
  {name:'agent_spec_authoring_pkey',type:'p',keys:[1],no_inherit:true,definition:'PRIMARY KEY (agent_spec_id)'},
  {name:'agent_spec_authoring_owner_fk',type:'f',keys:[1,2],no_inherit:true,definition:'FOREIGN KEY (agent_spec_id, owner_user_id) REFERENCES agentstudio.agent_specs(id, owner_user_id) ON UPDATE RESTRICT ON DELETE RESTRICT'},
  {name:'agent_spec_authoring_valid_ck',type:'c',keys:[3],no_inherit:false,definition:'CHECK (agentstudio.home_authoring_valid(authoring))'},
  ...names.map((name,i)=>({name:'agent_spec_authoring_'+name+'_not_null',type:'n',keys:[i+1],no_inherit:false,definition:'NOT NULL '+name})),
 ].map(value=>({...value,valid:true,enforced:true,deferrable:false,deferred:false,is_local:true,inherited:0,root:true,ordinary:true}))
 const columns=names.map((name,i)=>({name,type:i>=3?'timestamp with time zone':i===2?'jsonb':'uuid',notnull:true,default_expr:i>=3?'clock_timestamp()':null,read:true,insert:i<=2,update:['authoring','updated_at'].includes(name),reference:false,no_grant_option:true}))
 const functions=bodies.map((source,i)=>({ok:true,no_grant_option:true,language:i===0?'sql':'plpgsql',returns:i===0?'integer':'boolean',source}))
 const state={rows:structuredClone(rows),queries:[],released:0,unsafe:false,tamper:false,rollbackFailure:false,catalogFailure:null,tableNoGrantOption:true,columns,constraints,functions}
 const pool={async connect(){let fn=0;return{release(){state.released++},async query(query){
  state.queries.push(query)
  if(query==='ROLLBACK'){if(state.rollbackFailure)throw Error('rollback transport failed');return{rows:[]}}
  if(query.startsWith('BEGIN ')||query==='SET LOCAL ROLE agentstudio_api'||query==='SET LOCAL search_path=pg_catalog')return{rows:[]}
  if(query===originalHome070PresenceSql){if(state.catalogFailure)throw state.catalogFailure;return{rows:state.rows}}
  if(query===originalHomeStatisticsPresenceSql)return{rows:[]}
  if(query.includes("current_user='agentstudio_api' AND session_user"))return{rows:[{ok:true}]}
  if(query.includes('AS api_oid'))return{rows:[{ok:!state.unsafe,api_oid:123,no_grant_option:state.tableNoGrantOption}]}
  if(query.startsWith('SELECT a.attname'))return{rows:structuredClone(state.columns)}
  if(query.startsWith('SELECT polname'))return{rows:[{name:'agent_spec_authoring_owner',command:'*',permissive:true,roles:[123],using_expr:'(owner_user_id = agentstudio.actor_id())',check_expr:'(owner_user_id = agentstudio.actor_id())'}]}
  if(query.startsWith('SELECT conname'))return{rows:structuredClone(state.constraints)}
  if(query.includes('AS language')){const i=fn++,value=state.functions[i];return{rows:[{...value,source:value.source+(state.tamper&&i===1?'--tampered':'')}]}}
  if(query.startsWith('SELECT count(*)=2'))return{rows:[{ok:true}]}
  throw Error('Unexpected pure startup fixture query')
 }}}}
 return{state,pool,input:{pool,env:{},listen:true,allowedOrigin:origin,configurationWrites:false,allowNativeLocalAgentSpecs:false,authenticateRequest:async()=>identity}}
}
test('absent070 plus default-off performs a repeatable-read audit and mounts nothing',async()=>{
 const f=fixture();assert.equal(await prepareNativeHomeAgentSpecs(f.input),null)
 assert.equal(f.state.queries[0],'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');assert(f.state.queries.indexOf('SET LOCAL search_path=pg_catalog')<f.state.queries.indexOf(originalHome070PresenceSql));assert(f.state.queries.includes(originalHome070PresenceSql));assert(f.state.queries.includes(originalHomeStatisticsPresenceSql));assert.equal(f.state.queries.at(-1),'ROLLBACK');assert.equal(f.state.released,2)
})
test('complete safe fixture is still fully audited while feature is off',async()=>{
 const f=fixture(presence);assert.equal(await prepareNativeHomeAgentSpecs(f.input),null)
 assert(f.state.queries.some(q=>q.includes('AS api_oid')));assert(f.state.queries.some(q=>q.includes('AS language')))
})
for(const kind of ['migration','relation','function'])test('default-off rejects '+kind+'-only partial installation',async()=>{
 const f=fixture(presence.filter(v=>v.kind===kind));await assert.rejects(prepareNativeHomeAgentSpecs(f.input),/unsafe_original_home_authoring_schema/);assert.equal(f.state.released,1)
})
test('default-off rejects a missing policy or an extra related trigger',async()=>{
 for(const rows of [presence.filter(v=>v.kind!=='policy'),[...presence,{kind:'trigger',name:'agent_spec_authoring_injected'}]]){const f=fixture(rows);await assert.rejects(prepareNativeHomeAgentSpecs(f.input),/unsafe_original_home_authoring_schema/)}
})
test('default-off rejects unsafe installed grants and changed helper body',async()=>{
 for(const key of ['unsafe','tamper']){const f=fixture(presence);f.state[key]=true;await assert.rejects(prepareNativeHomeAgentSpecs(f.input),/unsafe_original_home_authoring_schema/)}
})
test('explicit enable cannot substitute for the missing actual schema',async()=>{
 const f=fixture();f.input.env={AGENT_STUDIO_PG18_ORIGINAL_HOME_ENABLED:'true'}
 await assert.rejects(prepareNativeHomeAgentSpecs(f.input),/original_home_authoring_schema_required/)
})
test('installed enabled fixture constructs the fixed router but preserves config-write gate',async()=>{
 const f=fixture(presence);f.input.env={AGENT_STUDIO_PG18_ORIGINAL_HOME_ENABLED:'true'}
 assert.equal(typeof await prepareNativeHomeAgentSpecs(f.input),'function');assert.equal(f.input.configurationWrites,false)
})
test('catalog failure propagates the same error and releases the read-only client',async()=>{
 const f=fixture(),sentinel=Error('catalog unavailable');f.state.catalogFailure=sentinel
 await assert.rejects(prepareNativeHomeAgentSpecs(f.input),e=>e===sentinel);assert.equal(f.state.queries.at(-1),'ROLLBACK');assert.equal(f.state.released,1)
})
test('rollback failure never yields an installed or absent readiness result',async()=>{
 const f=fixture();f.state.rollbackFailure=true
 await assert.rejects(inspectOptionalNativeHomeAuthoringSchema(f.pool),/original_home_schema_rollback_required/);assert.equal(f.state.released,1)
})

test('PG18 complete catalog-shaped data includes the PK-implied NOT NULL regardless of query row order',async()=>{
 const f=fixture(presence);f.state.constraints.reverse()
 assert.equal(f.state.constraints.filter(row=>row.type==='n').length,5)
 assert.equal(f.state.constraints.length,8)
 assert.equal(await inspectOptionalNativeHomeAuthoringSchema(f.pool),'installed')
})

for(const column of names)test('default-off refuses missing NOT NULL presence for '+column,async()=>{
 const f=fixture(presence.filter(row=>row.name!=='agent_spec_authoring_'+column+'_not_null'))
 await assert.rejects(prepareNativeHomeAgentSpecs(f.input),/unsafe_original_home_authoring_schema/)
})

test('presence names never substitute for any of the five real constraint rows',async()=>{
 for(const column of names){
  const f=fixture(presence);f.state.constraints=f.state.constraints.filter(row=>row.name!=='agent_spec_authoring_'+column+'_not_null')
  await assert.rejects(inspectOptionalNativeHomeAuthoringSchema(f.pool),/unsafe_original_home_authoring_schema/)
 }
})

for(const [field,value] of Object.entries({type:'c',keys:[2],valid:false,enforced:false,deferrable:true,deferred:true,is_local:false,inherited:1,root:false,no_inherit:true,ordinary:false,definition:'NOT NULL owner_user_id'}))
 test('PK-implied NOT NULL rejects changed '+field,async()=>{
  const f=fixture(presence),row=f.state.constraints.find(row=>row.name==='agent_spec_authoring_agent_spec_id_not_null')
  row[field]=value
  await assert.rejects(inspectOptionalNativeHomeAuthoringSchema(f.pool),/unsafe_original_home_authoring_schema/)
 })

test('missing constraint metadata cannot become a successful catalog result',async()=>{
 for(const field of ['keys','enforced','is_local','inherited','root','no_inherit','ordinary']){
  const f=fixture(presence);delete f.state.constraints.find(row=>row.type==='n')[field]
  await assert.rejects(inspectOptionalNativeHomeAuthoringSchema(f.pool),/unsafe_original_home_authoring_schema/)
 }
})

test('all eight constraints require exact keys, validation and non-inheritance metadata',async()=>{
 for(const type of ['p','f','c'])for(const field of ['keys','enforced','no_inherit']){
  const f=fixture(presence),row=f.state.constraints.find(row=>row.type===type)
  row[field]=field==='keys'?[5]:!row[field]
  await assert.rejects(inspectOptionalNativeHomeAuthoringSchema(f.pool),/unsafe_original_home_authoring_schema/)
 }
})

test('duplicate valid names cannot conceal a missing constraint, and extra constraints stay refused',async()=>{
 const duplicate=fixture(presence);duplicate.state.constraints[7]=structuredClone(duplicate.state.constraints[6])
 await assert.rejects(inspectOptionalNativeHomeAuthoringSchema(duplicate.pool),/unsafe_original_home_authoring_schema/)
 const extra=fixture(presence);extra.state.constraints.push({...extra.state.constraints[7],name:'agent_spec_authoring_extra_not_null'})
 await assert.rejects(inspectOptionalNativeHomeAuthoringSchema(extra.pool),/unsafe_original_home_authoring_schema/)
})

test('table ACL granting a non-owner GRANT OPTION is refused even when base access is correct',async()=>{
 const f=fixture(presence);f.state.tableNoGrantOption=false
 await assert.rejects(inspectOptionalNativeHomeAuthoringSchema(f.pool),/unsafe_original_home_authoring_schema/)
})
for(const column of names)test('column ACL GRANT OPTION is refused for '+column,async()=>{
 const f=fixture(presence);f.state.columns.find(row=>row.name===column).no_grant_option=false
 await assert.rejects(inspectOptionalNativeHomeAuthoringSchema(f.pool),/unsafe_original_home_authoring_schema/)
})
for(const i of [0,1])test('helper '+i+' EXECUTE GRANT OPTION is refused',async()=>{
 const f=fixture(presence);f.state.functions[i].no_grant_option=false
 await assert.rejects(inspectOptionalNativeHomeAuthoringSchema(f.pool),/unsafe_original_home_authoring_schema/)
})
test('an unavailable ACL grant-option result never yields an installed schema',async()=>{
 for(const kind of ['table','column','function']){
  const f=fixture(presence)
  if(kind==='table')f.state.tableNoGrantOption=undefined
  else if(kind==='column')delete f.state.columns[0].no_grant_option
  else delete f.state.functions[0].no_grant_option
  await assert.rejects(inspectOptionalNativeHomeAuthoringSchema(f.pool),/unsafe_original_home_authoring_schema/)
 }
})

test('ACL projections use actual table, column and function catalogs without a role exception',async()=>{
 const f=fixture(presence);await inspectOptionalNativeHomeAuthoringSchema(f.pool)
 for(const [catalog,owner] of [['c.relacl','c.relowner'],['a.attacl','c.relowner'],['p.proacl','p.proowner']]){
  const query=f.state.queries.find(query=>query.includes(catalog)&&query.includes('AS no_grant_option'))
  assert(query,'separate catalog ACL grant-option projection: '+catalog)
  assert(query.includes('aclexplode(')&&query.includes('is_grantable')&&query.includes('grantee<>'+owner))
 }
})
