import fs from 'node:fs'
import test from 'node:test'
import assert from 'node:assert/strict'
import {originalAgentCatalog071PresenceSql,inspectOptionalNativeAgentCatalogSchema,verifyNativeAgentCatalogSchema} from '../src/native-agent-catalog-audit.ts'
import {originalHome070PresenceSql,inspectOptionalNativeHomeAuthoringSchema} from '../src/native-home-authoring-audit.ts'
import {prepareNativeAgentCatalog,selectNativeAgentCatalog} from '../src/native-agent-catalog-runtime.ts'
// Non-authoritative catalog-shaped DATA fixtures only; no SQL engine or DB.
const keys071=['migration:pg_v9_071','relation:agent_spec_favorites','related_relation:agent_spec_favorites_pkey','type:agent_spec_favorites','type:_agent_spec_favorites','constraint:agent_spec_favorites_pkey','constraint:agent_spec_favorites_owner_fk','policy:agent_spec_favorites_owner']
const keys070=['migration:pg_v9_070','relation:agent_spec_authoring','related_relation:agent_spec_authoring_pkey','type:agent_spec_authoring','type:_agent_spec_authoring','function:home_authoring_utf16_length','function:home_authoring_valid','constraint:agent_spec_authoring_pkey','constraint:agent_spec_authoring_owner_fk','constraint:agent_spec_authoring_valid_ck','policy:agent_spec_authoring_owner']
// Catalog NOT NULL expectations are backed by official PostgreSQL18 source,
// immutable commit e527e4a7665abc2f6aec4b19b5b0a677ec891dbd; this DATA
// fixture alone still proves no SQL/deparser/catalog installation behavior.
const columns071=['agent_spec_id','owner_user_id','favorite','created_at','updated_at'],columns070=['agent_spec_id','owner_user_id','authoring','created_at','updated_at']
keys071.push(...columns071.map(c=>'constraint:agent_spec_favorites_'+c+'_not_null'))
keys070.push(...columns070.map(c=>'constraint:agent_spec_authoring_'+c+'_not_null'))
const notNulls=(table,columns)=>columns.map((column,i)=>({name:table+'_'+column+'_not_null',type:'n',definition:'NOT NULL '+column,keys:[i+1],index_id:'0',foreign_relation:'0',no_inherit:false}))
const presence=keys=>keys.map(key=>{const i=key.indexOf(':');return{kind:key.slice(0,i),name:key.slice(i+1)}})
function fixture(installed=false){
 const sql=fs.readFileSync(new URL('../../../db/postgres/migrations/pg_v9_070_home_authoring.sql',import.meta.url),'utf8'),bodies=[...sql.matchAll(/CREATE FUNCTION agentstudio\.(\w+)\([^;]+?AS \$fn\$([\s\S]*?)\$fn\$;/g)].map(m=>m[2])
 const state={presence071:installed?presence(keys071):[],presence070:presence(keys070),queries:[],released:[],badTable:false,badColumn:false,badPolicy:false,badFK:false,badIndex:false,NNAlter:null,predecessorNNAlter:null,rollback:false,queryError:null}
 const pool={async connect(){let fn=0;return{release(discard){state.released.push(discard??false)},async query(query,args=[]){
  state.queries.push(query);if(query.startsWith('BEGIN ')||query==='SET LOCAL ROLE agentstudio_api'||query==='SET LOCAL search_path=pg_catalog')return{rows:[]}
  if(query==='ROLLBACK'){if(state.rollback)throw Error('rollback failed');return{rows:[]}}
  if(query===originalAgentCatalog071PresenceSql){if(state.queryError)throw state.queryError;return{rows:state.presence071}}
  if(query===originalHome070PresenceSql)return{rows:state.presence070}
  const successor=args[0]==='agentstudio.agent_spec_favorites'
  if(query.includes('AS api_oid'))return{rows:[{ok:!successor||!state.badTable,api_oid:123,no_grant_option:true}]}
  if(query.startsWith('SELECT a.attname'))return{rows:(successor?['agent_spec_id','owner_user_id','favorite','created_at','updated_at']:['agent_spec_id','owner_user_id','authoring','created_at','updated_at']).map((name,i)=>({name,type:i>=3?'timestamp with time zone':i===2?(successor?'boolean':'jsonb'):'uuid',notnull:true,required:true,default_expr:i>=3?'clock_timestamp()':successor&&i===2?'false':null,read:true,insert:i<=2,update:(successor?['favorite','updated_at']:['authoring','updated_at']).includes(name),reference:false,acl_safe:!state.badColumn,no_grant_option:true}))}
  if(query.startsWith('SELECT polname'))return{rows:[{name:successor?'agent_spec_favorites_owner':'agent_spec_authoring_owner',command:'*',permissive:true,roles:[123],using_expr:successor&&state.badPolicy?'true':'(owner_user_id = agentstudio.actor_id())',check_expr:'(owner_user_id = agentstudio.actor_id())'}]}
  if(query.startsWith('SELECT conname')){
   const constraints=successor?[{name:'agent_spec_favorites_pkey',type:'p',definition:'PRIMARY KEY (agent_spec_id)'},{name:'agent_spec_favorites_owner_fk',type:'f',definition:'FOREIGN KEY (agent_spec_id, owner_user_id) REFERENCES agentstudio.agent_specs(id, owner_user_id) ON UPDATE RESTRICT ON DELETE '+(state.badFK?'CASCADE':'RESTRICT')}]:[{name:'agent_spec_authoring_pkey',type:'p',definition:'PRIMARY KEY (agent_spec_id)'},{name:'agent_spec_authoring_owner_fk',type:'f',definition:'FOREIGN KEY (agent_spec_id, owner_user_id) REFERENCES agentstudio.agent_specs(id, owner_user_id) ON UPDATE RESTRICT ON DELETE RESTRICT'},{name:'agent_spec_authoring_valid_ck',type:'c',definition:'CHECK (agentstudio.home_authoring_valid(authoring))'}]
   const records=[...constraints.map(c=>({...c,keys:c.type==='p'?[1]:c.type==='f'?[1,2]:[3],no_inherit:c.type!=='c',index_id:c.type==='c'?'0':'456',foreign_relation:c.type==='f'?'789':'0'})),...notNulls(successor?'agent_spec_favorites':'agent_spec_authoring',successor?columns071:columns070)].map(c=>({...c,valid:true,enforced:true,deferrable:false,deferred:false,...(successor?{local:true,inheritance_count:0,parent_id:'0',domain_id:'0'}:{is_local:true,inherited:0,root:true,ordinary:true})}))
   if(successor&&state.NNAlter)state.NNAlter(records);if(!successor&&state.predecessorNNAlter)state.predecessorNNAlter(records);return{rows:records}
  }
  if(query.startsWith('SELECT ci.relname'))return{rows:[{name:'agent_spec_favorites_pkey',ok:!state.badIndex}]}
  if(query.includes('AS language')){const i=fn++;return{rows:[{ok:true,no_grant_option:true,language:i===0?'sql':'plpgsql',returns:i===0?'integer':'boolean',source:bodies[i]}]}}
  if(query.startsWith('SELECT count(*)=2'))return{rows:[{ok:true}]}
  throw Error('Unexpected071 catalog DATA query')
 }}}}
 return{state,pool,input:{pool,env:{},listen:true,allowedOrigin:'https://studio.example.test',configurationWrites:false,authenticateRequest:async()=>({issuer:'urn:agentstudio:local:v1',subject:'verified-stub'})}}
}
test('absent071 is safe while off, but still receives the pinned read-only RR presence check',async()=>{
 const f=fixture();assert.equal(await prepareNativeAgentCatalog(f.input),null);assert.equal(f.state.queries[0],'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');assert(f.state.queries.indexOf('SET LOCAL search_path=pg_catalog')<f.state.queries.indexOf(originalAgentCatalog071PresenceSql));assert.equal(f.state.queries.at(-1),'ROLLBACK');assert.deepEqual(f.state.released,[false])
})
test('complete071 checks actual070 inventory and both detailed audits even while off',async()=>{
 const f=fixture(true);assert.equal(await prepareNativeAgentCatalog(f.input),null);assert(f.state.queries.includes(originalHome070PresenceSql));assert(f.state.queries.some(q=>q.includes('a.is_grantable')));assert(f.state.queries.some(q=>q.includes('x.is_grantable')));assert(f.state.queries.some(q=>q.startsWith('SELECT ci.relname')))
})
for(const part of['migration','relation','policy'])test('default-off refuses '+part+'-only or missing-member071',async()=>{
 for(const rows of[presence(keys071).filter(r=>r.kind===part),presence(keys071).filter(r=>r.kind!==part)]){const f=fixture();f.state.presence071=rows;await assert.rejects(prepareNativeAgentCatalog(f.input),/unsafe_original_agent_catalog_schema/)}
})
test('extra071 helper/trigger/index or missing070 cannot pass as a complete profile',async()=>{
 for(const kind of['function','trigger','related_relation']){const f=fixture(true);f.state.presence071.push({kind,name:'unexpected'});await assert.rejects(inspectOptionalNativeAgentCatalogSchema(f.pool),/unsafe_original_agent_catalog_schema/)}
 const f=fixture(true);f.state.presence070=f.state.presence070.filter(r=>r.kind!=='migration');await assert.rejects(inspectOptionalNativeAgentCatalogSchema(f.pool),/unsafe_original_agent_catalog_schema/)
})
test('PG18 inventory includes all five named NOT NULL records, including the implicit PK column',async()=>{
 for(const column of columns071){const f=fixture(true);f.state.presence071=f.state.presence071.filter(r=>r.name!=='agent_spec_favorites_'+column+'_not_null');await assert.rejects(inspectOptionalNativeAgentCatalogSchema(f.pool),/unsafe_original_agent_catalog_schema/)}
})
test('071 requires every PG18 NOT NULL member of the unchanged070 installation',async()=>{
 for(const column of columns070){const f=fixture(true);f.state.presence070=f.state.presence070.filter(r=>r.name!=='agent_spec_authoring_'+column+'_not_null');await assert.rejects(inspectOptionalNativeAgentCatalogSchema(f.pool),/unsafe_original_agent_catalog_schema/)}
})
test('071 invokes the external corrected070 detailed NOT NULL audit in the same snapshot',async()=>{
 const f=fixture(true);f.state.predecessorNNAlter=rows=>{rows.find(c=>c.type==='n').enforced=false};await assert.rejects(inspectOptionalNativeAgentCatalogSchema(f.pool),/unsafe_original_home_authoring_schema/);assert(!f.state.queries.some(q=>q.startsWith('SELECT ci.relname')))
})
test('PG18 detailed071 constraint audit accepts the full seven-record source-derived shape',async()=>{
 const f=fixture(true),db=await f.pool.connect();try{await verifyNativeAgentCatalogSchema(db)}finally{db.release()}
})
const notNullMutations={
 missing:rows=>rows.splice(rows.findIndex(c=>c.name==='agent_spec_favorites_agent_spec_id_not_null'),1),
 extra:rows=>rows.push({...rows.find(c=>c.type==='n'),name:'agent_spec_favorites_extra_not_null'}),
 duplicate:rows=>{const a=rows.findIndex(c=>c.name==='agent_spec_favorites_favorite_not_null');rows[a]={...rows.find(c=>c.name==='agent_spec_favorites_owner_user_id_not_null')}},
 wrongColumn:rows=>{rows.find(c=>c.name==='agent_spec_favorites_favorite_not_null').keys=[2]},
 wrongDefinition:rows=>{rows.find(c=>c.name==='agent_spec_favorites_favorite_not_null').definition='NOT NULL owner_user_id'},
 notEnforced:rows=>{rows.find(c=>c.type==='n').enforced=false},
 notValidated:rows=>{rows.find(c=>c.type==='n').valid=false},
 noInherit:rows=>{rows.find(c=>c.type==='n').no_inherit=true},
 inherited:rows=>{rows.find(c=>c.type==='n').inheritance_count=1},
 nonlocal:rows=>{rows.find(c=>c.type==='n').local=false},
 parent:rows=>{rows.find(c=>c.type==='n').parent_id='123'},
 domain:rows=>{rows.find(c=>c.type==='n').domain_id='123'},
 index:rows=>{rows.find(c=>c.type==='n').index_id='123'},
 foreignRelation:rows=>{rows.find(c=>c.type==='n').foreign_relation='123'},
}
for(const [name,alter] of Object.entries(notNullMutations))test('PG18 NOT NULL '+name+' is refused without filtering contype n',async()=>{
 const f=fixture(true);f.state.NNAlter=alter;const db=await f.pool.connect();try{await assert.rejects(verifyNativeAgentCatalogSchema(db),/unsafe_original_agent_catalog_schema/)}finally{db.release()}
})
for(const failure of['badTable','badColumn','badPolicy','badFK','badIndex'])test('strict071 audit refuses '+failure+' DATA result',async()=>{const f=fixture(true);f.state[failure]=true;await assert.rejects(inspectOptionalNativeAgentCatalogSchema(f.pool),/unsafe_original_agent_catalog_schema/)})
test('flag cannot attest to absent installation and writes remain independently gated',async()=>{
 const f=fixture();f.input.env={AGENT_STUDIO_PG18_ORIGINAL_AGENT_CATALOG_ENABLED:'true'};await assert.rejects(prepareNativeAgentCatalog(f.input),/original_agent_catalog_schema_required/)
 const ready=fixture(true);ready.input.env=f.input.env;assert.equal(typeof (await prepareNativeAgentCatalog(ready.input)).createHandler(ready.input.authenticateRequest),'function');assert.equal(selectNativeAgentCatalog(f.input.env,true,f.input.allowedOrigin,false).allowWrites,false)
 for(const [flag,listen,origin] of[['false',true,f.input.allowedOrigin],['true',false,f.input.allowedOrigin],['true',true,'http://localhost']])assert.throws(()=>selectNativeAgentCatalog({AGENT_STUDIO_PG18_ORIGINAL_AGENT_CATALOG_ENABLED:flag},listen,origin,true))
})
test('rollback failure cannot return readiness and requests client discard',async()=>{const f=fixture();f.state.rollback=true;await assert.rejects(inspectOptionalNativeAgentCatalogSchema(f.pool),/original_agent_catalog_schema_rollback_required/);assert.deepEqual(f.state.released,[true])})
test('catalog primary failure survives a cleanup failure',async()=>{const f=fixture(),sentinel=Error('catalog unavailable');f.state.queryError=sentinel;f.state.rollback=true;await assert.rejects(inspectOptionalNativeAgentCatalogSchema(f.pool),e=>e===sentinel);assert.deepEqual(f.state.released,[true])})

// Execute only the exact JavaScript070 guard extracted from the candidate's
// Native entry source, with the actual imported auditor and query DATA client.
// This does not import/start Native, open a port, or prove real SQL/preflight.
const nativeSource=fs.readFileSync(new URL('../src/native-server.ts',import.meta.url),'utf8')
const guardStart=nativeSource.indexOf('    const originalHomeFlag=')
const guardEnd=nativeSource.indexOf('    const agentCatalog=',guardStart)
assert(guardStart>=0&&guardEnd>guardStart)
const homeGuardSource=nativeSource.slice(guardStart,guardEnd)
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor
const invokeHomePreflightGuard=new AsyncFunction('business','env','inspectOptionalNativeHomeAuthoringSchema',homeGuardSource+'\nreturn originalHomeSchema')
const preflightHome=(f,flag)=>invokeHomePreflightGuard(f.pool,flag===undefined?{}:{AGENT_STUDIO_PG18_ORIGINAL_HOME_ENABLED:flag},inspectOptionalNativeHomeAuthoringSchema)
test('Native source directly imports and invokes070 auditor before the real no-listen readiness return',()=>{
 assert(nativeSource.includes("import {inspectOptionalNativeHomeAuthoringSchema} from './native-home-authoring-audit.ts'"))
 const earlyReturn=nativeSource.indexOf('    if(!listen){\n      await Promise.all([businessPool.end()')
 assert(earlyReturn>guardEnd);assert(nativeSource.indexOf('const originalHomeHttp=await prepareNativeHomeAgentSpecs')>earlyReturn)
 assert(homeGuardSource.includes('await inspectOptionalNativeHomeAuthoringSchema(business)'));assert(!homeGuardSource.includes('listen'));assert(!homeGuardSource.includes('schemaStatus'))
})
test('extracted Native guard audits real absent070 DATA while flag is undefined',async()=>{
 const f=fixture();f.state.presence070=[];assert.equal(await preflightHome(f),'absent');assert(f.state.queries.includes(originalHome070PresenceSql));assert.equal(f.state.queries[0],'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');assert.equal(f.state.queries.at(-1),'ROLLBACK');assert.deepEqual(f.state.released,[false])
})
test('extracted Native guard audits complete070 DATA while off or enabled',async()=>{
 for(const flag of[undefined,'true']){const f=fixture();assert.equal(await preflightHome(f,flag),'installed');assert(f.state.queries.some(q=>q.includes('conenforced AS enforced')));assert(f.state.queries.some(q=>q.includes('AS language')));assert.deepEqual(f.state.released,[false])}
})
test('extracted Native guard rejects enabled070 when actual inventory is absent',async()=>{
 const f=fixture();f.state.presence070=[];await assert.rejects(preflightHome(f,'true'),/original_home_authoring_schema_required/);assert(f.state.queries.includes(originalHome070PresenceSql))
})
test('extracted Native guard accepts no explicit flag except the exact true string',async()=>{
 for(const flag of['false','','TRUE','1',null,true]){const f=fixture();await assert.rejects(preflightHome(f,flag),/unsafe_original_home_config/);assert.equal(f.state.queries.length,0)}
})
test('extracted Native guard rejects every missing070 inventory member even while off',async()=>{
 for(const member of keys070){const f=fixture();f.state.presence070=presence(keys070.filter(key=>key!==member));await assert.rejects(preflightHome(f),/unsafe_original_home_authoring_schema/);assert.equal(f.state.queries.at(-1),'ROLLBACK')}
})
test('extracted Native guard rejects partial/extra070 and unsafe detailed NOT NULL while off',async()=>{
 for(const rows of[presence(['migration:pg_v9_070']),presence(['relation:agent_spec_authoring']),presence([...keys070,'constraint:agent_spec_authoring_extra_not_null'])]){const f=fixture();f.state.presence070=rows;await assert.rejects(preflightHome(f),/unsafe_original_home_authoring_schema/)}
 const f=fixture();f.state.predecessorNNAlter=rows=>{rows.find(c=>c.type==='n').enforced=false};await assert.rejects(preflightHome(f),/unsafe_original_home_authoring_schema/)
})
test('extracted Native guard cannot turn a failed070 rollback into readiness',async()=>{
 const f=fixture();f.state.presence070=[];f.state.rollback=true;await assert.rejects(preflightHome(f),/original_home_schema_rollback_required/)
})
