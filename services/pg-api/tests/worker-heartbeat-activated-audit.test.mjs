// PURE catalog doubles and nonexecuted SQL/source obligations only.
// No SQL, database, network, provider or worker process is used. Passing these
// tests does NOT establish actual catalog privileges or current activation.
import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {parseWorkerHeartbeatReaderCatalogExpectations,verifyWorkerHeartbeatActivatedCatalogCore}
 from '../src/worker-heartbeat-activated-audit-core.ts'
import {verifyWorkerHeartbeatActivatedCatalog,inspectWorkerHeartbeatActivatedCatalog}
 from '../src/worker-heartbeat-activated-audit.ts'
import {workerHeartbeatSchemaPins} from '../src/worker-heartbeat-audit-core.ts'
const kinds=['prepare','model','workflow_safe','workflow_v2','agent_autonomous','knowledge_index','knowledge_query','assessment']
const writers=kinds.flatMap(k=>[1,2].map(s=>`studio_telemetry_tx_${k}_${s}`))
const names=['studio_telemetry_owner','studio_telemetry_reader',...writers]
const pins={sql:'5ed1080d9f7b651ea2ae7fceca09db7f61c679f107e196df13ae201a8f99505f',record:'4e1fd93b6217d5cf414189f568d395f48a3e3e54e1ee455e65d28d4717e15143',snapshot:'17215237dbc5f81ba8fbbb2fd8eae2a9da7e0e0cfa859124ab50f3ccd60671ec'}
const expected={schema:'telemetry_v1',phase:'activated_reader_catalog_only',catalog_verified:true,
 registry_verified:false,activation_current_verified:false,native_authorization_verified:false,runtime_readiness_verified:false}
const hash=value=>createHash('sha256').update(value).digest('hex')
const defs={kind_config:[['ordinal','smallint',true,null],['kind','text',true,null],['instrumented','boolean',true,'false'],['enabled','boolean',true,'false']],slot_state:[['kind','text',true,null],['slot_no','smallint',true,null],['login_oid','oid',true,null],['login_name','text',true,null],['enabled','boolean',true,'false'],['generation','uuid',false,null],['last_sequence','bigint',true,"'0'::bigint"],['state','text',false,null],['reason','text',false,null],['observed_at','timestamp with time zone',false,null],['draining','boolean',true,'false']]}
const ck={
 telemetry_kind_range:'((ordinal >= 1) AND (ordinal <= 8))',telemetry_kind_enabled:'((NOT enabled) OR instrumented)',
 telemetry_slot_range:'((slot_no >= 1) AND (slot_no <= 2))',telemetry_slot_sequence:"((last_sequence >= 0) AND (last_sequence <= '9007199254740991'::bigint))",telemetry_slot_enabled:'((NOT enabled) OR (generation IS NOT NULL))',
 telemetry_slot_observation:"(((last_sequence = 0) AND (state IS NULL) AND (reason IS NULL) AND (observed_at IS NULL) AND (NOT draining)) OR ((last_sequence > 0) AND (generation IS NOT NULL) AND (state IS NOT NULL) AND (reason IS NOT NULL) AND (observed_at IS NOT NULL) AND (((state = 'unknown'::text) AND (reason = ANY (ARRAY['startup_checks_pending'::text, 'loop_unavailable'::text]))) OR ((state = 'ready'::text) AND (reason = 'startup_checks_complete'::text)) OR ((state = 'draining'::text) AND (reason = 'new_claims_closed'::text))) AND (draining = (state = 'draining'::text))))",
}
const keys=[['telemetry_kind_pk','kind_config','p',['ordinal']],['telemetry_kind_unique','kind_config','u',['kind']],['telemetry_slot_pk','slot_state','p',['kind','slot_no']],['telemetry_slot_login_oid','slot_state','u',['login_oid']],['telemetry_slot_login_name','slot_state','u',['login_name']],['telemetry_slot_kind_fk','slot_state','f',['kind']]]
function fixture(){
 let n=300
 const heap={access_method_id:200,access_method:'heap',access_method_type:'t',handler_id:201,heap_handler_id:201,handler_schema:'pg_catalog',handler_name:'heap_tableam_handler',handler_language:'internal',handler_source:'heap_tableam_handler',handler_args:'internal',handler_result:'table_am_handler',handler_kind:'f'}
 const roles=names.map((name,i)=>({id:100+i,name,login:i===1||(i>1&&i%2===0),inherit:false,super:false,bypass:false,create_db:false,create_role:false,replication:false,connection_limit:i===0?-1:i===1?2:1,config:null,no_expiry:true,memberships:0}))
 const funcs=['record','snapshot'].map((name,i)=>({id:30+i,schema:'studio_telemetry',name,owner_id:100,args:i===0?'text, text, bigint, text, text':'',result:'jsonb',language:'plpgsql',volatility:'v',definer:true,strict:false,leakproof:false,parallel:'u',kind:'f',defaults:0,modes:null,argnames:null,ordinary:true,config:['search_path=pg_catalog'],sha:pins[name]}))
 const indexes=keys.filter(k=>k[2]!=='f').map(([name,relation,kind,columns],i)=>({id:50+i,name,relation,columns,primary:kind==='p',ok:true}))
 const constraints=keys.map(([name,relation,kind,columns])=>({id:n++,index_id:kind==='f'?51:indexes.find(i=>i.name===name).id,relation,name,kind,columns,expression:null,target_id:kind==='f'?20:0,target_columns:kind==='f'?['kind']:[],ok:true}))
 for(const [name,expression] of Object.entries(ck))constraints.push({id:n++,index_id:0,relation:name.startsWith('telemetry_kind_')?'kind_config':'slot_state',name,kind:'c',columns:[],expression,target_id:0,target_columns:[],ok:true})
 const acl=[]
 for(const privilege of ['USAGE','CREATE'])acl.push({object:'schema',id:10,grantor:1,grantee:1,privilege,grantable:false})
 for(const r of roles)acl.push({object:'schema',id:10,grantor:1,grantee:r.id,privilege:'USAGE',grantable:false})
 for(const f of funcs)for(const grantee of f.name==='snapshot'?[100,101]:[100,...roles.slice(2).map(r=>r.id)])acl.push({object:'function',id:f.id,grantor:100,grantee,privilege:'EXECUTE',grantable:false})
 for(const id of [20,21])for(const privilege of ['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN'])acl.push({object:'table',id,grantor:100,grantee:100,privilege,grantable:false})
 const database_acl=['CREATE','CONNECT','TEMPORARY'].map(privilege=>({grantor:1,grantee:1,privilege,grantable:false}))
 for(const r of roles.slice(1))database_acl.push({grantor:1,grantee:r.id,privilege:'CONNECT',grantable:false})
 const state={target:{database_id:40,login_name:'studio_telemetry_reader',login_oid:101,database:'agent_studio_telemetry',version:180006,encoding:'UTF8',owner_id:1,owner_super:true,authentic_audit:true,consistent_readonly:true,controlled_path:true,isolated:true},roles,namespace:[{id:10,name:'studio_telemetry',owner_id:1,comment:'agent_studio_telemetry/telemetry_v1/schema_full_dormant'}],tables:[{id:20,name:'kind_config',owner_id:100,ok:true,...heap},{id:21,name:'slot_state',owner_id:100,ok:true,...heap}],columns:Object.entries(defs).flatMap(([relation,attrs])=>attrs.map(([name,type,required,def],i)=>({relation,name,type,required,default:def,ordinal:i+1,plain:true}))),not_nulls:Object.entries(defs).flatMap(([relation,attrs])=>attrs.filter(a=>a[2]).map(a=>({relation,columns:[a[0]],ok:true}))),constraints,indexes,policies:['kind_config','slot_state'].map(relation=>({relation,name:'telemetry_owner_policy',command:'*',permissive:true,roles:[100],qual:'true',check:'true'})),routines:funcs,acl,boundaries:{ok:true},database_acl,sensitive:roles.flatMap(r=>['pg_authid','pg_shadow'].map((name,i)=>({role_id:r.id,name:'pg_catalog.'+name,kind:i?'v':'r',effective:false,raw_grant:false})))}
 const profile={protocol:'worker_heartbeat_reader_catalog_expectations_v1',database_oid:40,database_owner_oid:1,schema_oid:10,
  roles:roles.map(({id,...r})=>({oid:id,...structuredClone(r)}))}
 const trace=[],faults=new Set();let released=0
 const db={async query(sql,args=[]){trace.push({sql,args:structuredClone(args)});if(faults.has(sql))throw Error('private query failure')
  if(['BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY','SET LOCAL search_path=pg_catalog',"SET LOCAL statement_timeout='5000ms'; SET LOCAL lock_timeout='1000ms'",'ROLLBACK'].includes(sql))return {rows:[]}
  const tag=/^\/\* telemetry_v1_reader_catalog:([a-z_]+) \*\//.exec(sql)?.[1]
  assert.ok(tag&&Object.hasOwn(state,tag),'Unexpected query: '+sql)
  if(faults.has(tag))throw Error('private catalog failure')
  if(faults.has(tag+':malformed'))return {rows:null}
  const value=state[tag];return {rows:structuredClone(Array.isArray(value)?value:[value])}
 },release(){released++;if(faults.has('release'))throw Error('private release failure')}}
 return {state,profile,db,trace,faults,pool:{async connect(){if(faults.has('connect'))throw Error('private acquire failure');return db}},released:()=>released}
}

const refused=e=>e.message==='unsafe_worker_heartbeat_reader_catalog'
const unavailable=e=>e.status===503&&e.code==='worker_heartbeat_reader_catalog_unavailable'&&e.message==='worker_heartbeat_reader_catalog_unavailable'
async function reject(change){const f=fixture();change(f.state,f);await assert.rejects(verifyWorkerHeartbeatActivatedCatalogCore(f.db,f.profile),refused)}
async function badProfile(change){const f=fixture();change(f.profile,f);await assert.rejects(verifyWorkerHeartbeatActivatedCatalogCore(f.db,f.profile),refused);assert.equal(f.trace.length,0)}

test('original dormant SQL/core/wrapper/test remain byte-pinned; no dormant call or runtime authority is introduced',()=>{
 assert.deepEqual(workerHeartbeatSchemaPins,pins)
 for(const [path,sha] of [
 [
  "../../../db/postgres/telemetry/001_worker_heartbeats.sql",
  "5ed1080d9f7b651ea2ae7fceca09db7f61c679f107e196df13ae201a8f99505f"
 ],
 [
  "../src/worker-heartbeat-audit-core.ts",
  "1f90a04ff358f9922020f6070a931c4f1aa621b945b4de927454b0fb5607b33e"
 ],
 [
  "../src/worker-heartbeat-audit.ts",
  "da5923b04947a7338a90e9f065ebd07f39909372805741e0dc6986b0a86452db"
 ],
 [
  "../tests/worker-heartbeat-audit.test.mjs",
  "d00cf851d4b892a26e14526e117b3a65ff22a9eff0ad19846101a2c41962f7f1"
 ]
])assert.equal(hash(readFileSync(new URL(path,import.meta.url))),sha,path)
 const core=readFileSync(new URL('../src/worker-heartbeat-activated-audit-core.ts',import.meta.url),'utf8')
 const wrapper=readFileSync(new URL('../src/worker-heartbeat-activated-audit.ts',import.meta.url),'utf8')
 const executable=(core+wrapper).replace(/\/\/[^\n]*/g,'')
 assert.match(core,/import \{workerHeartbeatSchemaPins\} from "\.\/worker-heartbeat-audit-core\.ts"/)
 assert.doesNotMatch(executable,/verifyWorkerHeartbeatCore\s*\(|verifyWorkerHeartbeatSchemaFull\s*\(|inspectWorkerHeartbeatSchemaFull\s*\(/)
 assert.doesNotMatch(executable,/FROM studio_telemetry\.|JOIN studio_telemetry\.|SELECT studio_telemetry\.(?:record|snapshot)|\.\/native-auth|node:(?:net|tls|http|fs)|from ["']pg["']/)
 assert.doesNotMatch(executable,/GRANT\s|ALTER ROLE|CREATE ROLE|SET ROLE|\b(?:UPDATE|INSERT INTO|DELETE FROM|TRUNCATE TABLE)\s+studio_telemetry\./)
})

test('exact reader catalog gives only an immutable catalog result with all runtime authority unverified',async()=>{
 const f=fixture(),result=await verifyWorkerHeartbeatActivatedCatalogCore(f.db,f.profile)
 assert.deepEqual(result,expected);assert.ok(Object.isFrozen(result));assert.equal(result.runtime_activated,undefined)
 assert.equal(result.activation_current_verified,false);assert.equal(result.registry_verified,false)
 assert.deepEqual(await verifyWorkerHeartbeatActivatedCatalog(f.db,f.profile),expected)
 const tags=new Set(f.trace.map(q=>/^\/\* telemetry_v1_reader_catalog:([a-z_]+) \*\//.exec(q.sql)?.[1]))
 assert.equal(tags.size,14)
 for(const q of f.trace){
  assert.doesNotMatch(q.sql,/FROM studio_telemetry\.|JOIN studio_telemetry\.|SET ROLE|agentstudio_auth\.|agentstudio\.|rolpassword|passwd/)
  assert.doesNotMatch(q.sql,/FROM pg_catalog\.pg_authid\s|FROM pg_catalog\.pg_shadow\s/)
 }
 assert.equal(f.released(),0,'caller owns an already-connected client')
})

test('plain JSON expectations allow only comparison, not receipt provenance; exact zero/all/mixed writer LOGIN matrices work',async()=>{
 for(const setting of ['none','all','mixed']){
  const f=fixture()
  for(let i=2;i<18;i++)f.profile.roles[i].login=f.state.roles[i].login=setting==='all'||setting==='mixed'&&i%2===0
  const json=JSON.parse(JSON.stringify(f.profile))
  assert.deepEqual(await verifyWorkerHeartbeatActivatedCatalogCore(f.db,json),expected)
 }
 await badProfile(p=>{p.trusted_operator=true})
 await badProfile(p=>{p.activation_epoch='pretend-current'})
 await badProfile(p=>{p.roles[2].enabled=true})
})

test('expectations are closed, typed and detached before any query; all OIDs and flags are explicit',async()=>{
 for(const field of ['protocol','database_oid','database_owner_oid','schema_oid','roles'])await badProfile(p=>{delete p[field]})
 for(const [key,value] of Object.entries({protocol:'activation_capability',database_oid:'40',database_owner_oid:100,schema_oid:0}))await badProfile(p=>{p[key]=value})
 for(const value of [null,[],{},'profile',true]){const f=fixture();await assert.rejects(verifyWorkerHeartbeatActivatedCatalogCore(f.db,value),refused);assert.equal(f.trace.length,0)}
 for(let i=0;i<18;i++){
  for(const key of Object.keys(fixture().profile.roles[i]))await badProfile(p=>{delete p.roles[i][key]})
  for(const key of ['inherit','super','bypass','create_db','create_role','replication'])await badProfile(p=>{p.roles[i][key]=true})
  for(const [key,value] of Object.entries({oid:0,name:'studio_telemetry_other',login:'true',connection_limit:9,config:[],no_expiry:false,memberships:1}))await badProfile(p=>{p.roles[i][key]=value})
 }
 await badProfile(p=>{p.roles[0].login=true});await badProfile(p=>{p.roles[1].login=false})
 await badProfile(p=>{p.roles[1].oid=p.roles[0].oid});await badProfile(p=>{p.roles[2].oid=4294967296})
 await badProfile(p=>{p.roles.reverse()});await badProfile(p=>{p.roles.pop()});await badProfile(p=>{p.roles.push({...p.roles[0]})})
 const f=fixture(),parsed=parseWorkerHeartbeatReaderCatalogExpectations(f.profile)
 assert.notEqual(parsed,f.profile);assert.notEqual(parsed.roles,f.profile.roles)
 assert.ok(Object.isFrozen(parsed)&&Object.isFrozen(parsed.roles)&&parsed.roles.every(Object.isFrozen))
})

test('expectations reject accessors, custom prototypes, symbols, sparse and decorated role arrays without executing getters',async()=>{
 let reads=0
 await badProfile(p=>{Object.defineProperty(p,'schema_oid',{enumerable:true,get(){reads++;return 10}})})
 await badProfile(p=>{Object.defineProperty(p.roles[2],'oid',{enumerable:true,get(){reads++;return 102}})})
 await badProfile(p=>{Object.defineProperty(p.roles,'2',{enumerable:true,get(){reads++;return {}}})})
 assert.equal(reads,0)
 await badProfile(p=>{Object.setPrototypeOf(p,{})})
 await badProfile(p=>{p[Symbol('receipt')]=true})
 await badProfile(p=>{p.roles.extra=true});await badProfile(p=>{delete p.roles[2]})
 await badProfile(p=>{Object.setPrototypeOf(p.roles,Object.create(Array.prototype))})
 const f=fixture();Object.setPrototypeOf(f.profile,null);Object.setPrototypeOf(f.profile.roles[2],null)
 assert.deepEqual(await verifyWorkerHeartbeatActivatedCatalogCore(f.db,f.profile),expected)
})

test('caller mutation after the first await cannot change the in-flight expected role/OID/login profile',async()=>{
 const f=fixture();let resume,entered
 const waiting=new Promise(resolve=>{entered=resolve})
 const db={async query(sql,args){if(sql.startsWith('/* telemetry_v1_reader_catalog:target */')){entered();await new Promise(resolve=>{resume=resolve})}return f.db.query(sql,args)},release(){}}
 const pending=verifyWorkerHeartbeatActivatedCatalogCore(db,f.profile)
 await waiting
 f.profile.roles[2].oid=999;f.profile.roles[2].login=!f.profile.roles[2].login;f.profile.database_oid=900
 resume()
 assert.deepEqual(await pending,expected)
})

test('actual reader session, target OIDs, readonly/RR/no-temp and isolated PG18 target are mandatory before other catalog reads',async()=>{
 for(const [key,value] of Object.entries({database:'agent_studio',database_id:41,version:170009,encoding:'LATIN1',owner_id:9,owner_super:false,
  login_name:'studio_telemetry_tx_model_1',login_oid:999,authentic_audit:false,consistent_readonly:false,controlled_path:false,isolated:false})){
  const f=fixture();f.state.target[key]=value
  await assert.rejects(verifyWorkerHeartbeatActivatedCatalogCore(f.db,f.profile),refused)
  assert.equal(f.trace.length,1)
 }
 for(const value of [180000.5,190000,'180006',null])await reject(s=>{s.target.version=value})
 const f=fixture();await verifyWorkerHeartbeatActivatedCatalogCore(f.db,f.profile)
 const query=f.trace[0].sql
 for(const fragment of ["current_user=session_user","caller.rolname=session_user","transaction_read_only","repeatable read","pg_my_temp_schema()=0","server_encoding","d.oid::integer AS database_id"])assert.ok(query.includes(fragment))
})

test('actual roles must match all eighteen expected OIDs, LOGIN values and strict flags; same-name recreation is refused',async()=>{
 for(let i=0;i<18;i++){
  await reject(s=>{s.roles[i].id+=1000})
  await reject(s=>{s.roles[i].login=!s.roles[i].login})
  for(const key of ['inherit','super','bypass','create_db','create_role','replication'])await reject(s=>{s.roles[i][key]=true})
  for(const [key,value] of Object.entries({memberships:1,config:[],no_expiry:false,connection_limit:9,id:'100',name:'agentstudio_api'}))await reject(s=>{s.roles[i][key]=value})
 }
 await reject(s=>{s.roles[1].id=s.roles[0].id});await reject(s=>{s.roles.pop()});await reject(s=>{s.roles.push({...s.roles[0],id:999})})
 const f=fixture();f.state.roles.reverse()
 assert.deepEqual(await verifyWorkerHeartbeatActivatedCatalogCore(f.db,f.profile),expected,'catalog row ordering has no authority')
})

test('absence is not a successful reader audit; namespace OID/owner/version marker and object completeness are fixed',async()=>{
 for(const tag of Object.keys(fixture().state))await reject(s=>{s[tag]=[]})
 for(const [key,value] of Object.entries({id:11,name:'studio_telemetry_other',owner_id:100,comment:'activated'}))await reject(s=>{s.namespace[0][key]=value})
 await reject(s=>{s.namespace.push({...s.namespace[0]})})
})
test('table ownership/RLS/FORCE, actual heap AM and builtin handler identity, and exact fifteen columns are closed',async()=>{
 for(const [key,value] of Object.entries({name:'extra',owner_id:1,id:0,ok:false}))await reject(s=>{s.tables[0][key]=value})
 for(let i=0;i<2;i++)for(const [key,value] of Object.entries({access_method_id:0,access_method:'heap_alias',access_method_type:'i',handler_id:999,heap_handler_id:0,handler_schema:'public',handler_name:'heap_alias_handler',handler_language:'c',handler_source:'alternate_handler',handler_args:'',handler_result:'index_am_handler',handler_kind:'p'}))await reject(s=>{s.tables[i][key]=value})
 for(let i=0;i<2;i++)for(const key of Object.keys(fixture().state.tables[i]).filter(key=>key.startsWith('access_method')||key.includes('handler')))await reject(s=>{delete s.tables[i][key]})
 const f=fixture();assert.deepEqual(await verifyWorkerHeartbeatActivatedCatalogCore(f.db,f.profile),expected)
 const query=f.trace.find(q=>q.sql.startsWith('/* telemetry_v1_reader_catalog:tables */')).sql
 assert.match(query,/c\.relam::integer AS access_method_id/);assert.match(query,/pg_catalog\.pg_am am ON am\.oid=c\.relam/)
 assert.match(query,/pg_catalog\.pg_proc h ON h\.oid=am\.amhandler/);assert.match(query,/'pg_catalog\.heap_tableam_handler\(pg_catalog\.internal\)'::pg_catalog\.regprocedure/)
 for(const [key,value] of Object.entries({name:'payload',ordinal:2,type:'integer',required:false,default:'1',plain:false}))await reject(s=>{s.columns[0][key]=value})
 await reject(s=>{s.columns[10].default='0::bigint'});await reject(s=>{s.columns.push({...s.columns[0]})})
})
test('PG18 NOT NULL catalog constraints cannot be missing, duplicate, nonvalid or broadened',async()=>{
 await reject(s=>{s.not_nulls.pop()});await reject(s=>{s.not_nulls[0].ok=false});await reject(s=>{s.not_nulls[0].columns=['ordinal','kind']});await reject(s=>{s.not_nulls[0].columns='ordinal'});await reject(s=>{s.not_nulls[1]={...s.not_nulls[0]}})
})
test('every CHECK expression, key order, immediate FK target and index binding is independently exact',async()=>{
 for(let i=0;i<12;i++)await reject(s=>{s.constraints[i].ok=false})
 for(const c of Object.keys(ck))await reject(s=>{s.constraints.find(x=>x.name===c).expression='true'})
 for(const [key,value] of Object.entries({columns:['slot_no','kind'],kind:'u',relation:'kind_config',index_id:0}))await reject(s=>{s.constraints.find(x=>x.name==='telemetry_slot_pk')[key]=value})
 await reject(s=>{s.constraints.find(x=>x.kind==='f').target_id=21});await reject(s=>{s.constraints.find(x=>x.kind==='f').target_columns=['ordinal']})
})
test('index validity/operator/collation/options checks, uniqueness and primary identity cannot substitute',async()=>{
 for(const [key,value] of Object.entries({ok:false,primary:false,columns:['kind'],name:'alternate',id:'50'}))await reject(s=>{s.indexes[0][key]=value})
 await reject(s=>{s.indexes.push({...s.indexes[0]})});await reject(s=>{s.indexes[1].id=s.indexes[0].id})
})
test('only two owner-only true policies apply; PUBLIC, alternate owner, missing check and broad extras reject',async()=>{
 for(const [key,value] of Object.entries({name:'public_read',command:'r',permissive:false,roles:[0],qual:'false',check:null,relation:'private'}))await reject(s=>{s.policies[0][key]=value})
 await reject(s=>{s.policies.push({...s.policies[0]})})
})
test('both exact routine bodies and complete SQL ABI/configuration are pinned, with no self-registration routine',async()=>{
 for(const [key,value] of Object.entries({id:0,schema:'public',name:'beginBoot',owner_id:1,args:'text',result:'text',language:'sql',volatility:'s',definer:false,strict:true,leakproof:true,parallel:'s',kind:'p',defaults:1,modes:[],argnames:[],ordinary:false,config:['search_path=public'],sha:'0'.repeat(64)}))await reject(s=>{s.routines[0][key]=value})
 await reject(s=>{s.routines[1]={...s.routines[0]}})
})
test('raw schema/function/table ACLs reject PUBLIC, old/API/061 principals, extra rights, grantors and grant options',async()=>{
 for(const grantee of [0,999])await reject(s=>{s.acl.push({...s.acl.find(x=>x.object==='function'),grantee})})
 for(const [key,value] of Object.entries({grantor:1,grantable:true,privilege:'SELECT',grantee:999,id:999,object:'other'}))await reject(s=>{s.acl.find(x=>x.object==='function')[key]=value})
 await reject(s=>{s.acl.pop()});await reject(s=>{s.acl.push({...s.acl[0]})})
})
test('global ownership, default-ACL, effective access, built-in broad role and object/trigger/type boundary aggregate must be true',async()=>{
 for(const value of [false,null,'true',1])await reject(s=>{s.boundaries.ok=value})
 const f=fixture();await verifyWorkerHeartbeatActivatedCatalogCore(f.db,f.profile);const q=f.trace.find(x=>x.sql.startsWith('/* telemetry_v1_reader_catalog:boundaries */')).sql
 for(const fragment of ['pg_shdepend','pg_default_acl','pg_db_role_setting','pg_has_role','has_any_column_privilege','has_function_privilege','count(DISTINCT p.proname)=4','NOT starts_with(n.nspname,\'pg_\')'])assert.ok(q.includes(fragment))
 assert.doesNotMatch(q,/LIKE 'pg_%'/)
})
test('database ACL is limited to trusted DB owner and CONNECT-only reader/slots independent of LOGIN expectations',async()=>{
 for(const [key,value] of Object.entries({grantee:0,grantor:100,privilege:'TEMPORARY',grantable:true}))await reject(s=>{s.database_acl.find(x=>x.grantee===101)[key]=value})
 await reject(s=>{s.database_acl.pop()})
})
test('all eighteen roles and both exact sensitive catalogs reject raw/effective grants, missing rows and driver coercion',async()=>{
 for(let i=0;i<36;i++)for(const key of ['effective','raw_grant'])await reject(s=>{s.sensitive[i][key]=true})
 for(const [key,value] of Object.entries({name:'pg_catalog.pg_roles',kind:'m',role_id:'100'}))await reject(s=>{s.sensitive[0][key]=value})
 await reject(s=>{s.sensitive.pop()});await reject(s=>{s.sensitive[1]={...s.sensitive[0]}})
 const f=fixture();await verifyWorkerHeartbeatActivatedCatalogCore(f.db,f.profile);const q=f.trace.find(x=>x.sql.startsWith('/* telemetry_v1_reader_catalog:sensitive */')).sql
 assert.match(q,/aclexplode\(a.attacl\)/);assert.match(q,/aclexplode\(coalesce\(c.relacl/);assert.doesNotMatch(q,/FROM pg_catalog\.pg_authid\s|FROM pg_catalog\.pg_shadow\s|rolpassword|passwd/)
})

test('all malformed or inaccessible catalog results fail closed without partial evidence',async()=>{
 for(const tag of Object.keys(fixture().state)){
  await reject((s,f)=>{f.faults.add(tag)})
  await reject((s,f)=>{f.faults.add(tag+':malformed')})
 }
 await reject(s=>{s.target=[]});await reject(s=>{s.boundaries=[{ok:true},{ok:true}]})
 let reads=0
 const row={};Object.defineProperty(row,'database',{enumerable:true,get(){reads++;return 'agent_studio_telemetry'}})
 await assert.rejects(verifyWorkerHeartbeatActivatedCatalogCore({async query(){return {rows:[row]}},release(){}},fixture().profile),refused)
 assert.equal(reads,0)
})

test('wrapper uses actual RR readonly metadata transaction and returns only after rollback/release; no registry or snapshot',async()=>{
 const f=fixture();assert.deepEqual(await inspectWorkerHeartbeatActivatedCatalog(f.pool,f.profile),expected)
 assert.equal(f.trace[0].sql,'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
 assert.equal(f.trace[1].sql,'SET LOCAL search_path=pg_catalog')
 assert.equal(f.trace[2].sql,"SET LOCAL statement_timeout='5000ms'; SET LOCAL lock_timeout='1000ms'")
 assert.equal(f.trace.at(-1).sql,'ROLLBACK');assert.equal(f.released(),1)
 assert.ok(f.trace.every(q=>!q.sql.includes('SET ROLE')&&!q.sql.includes('FROM studio_telemetry.')))
})

test('wrapper rejects invalid expectations before connect and detaches valid ones before pool acquisition',async()=>{
 const f=fixture();let connected=0
 const pool={async connect(){connected++;return f.db}}
 const invalid={...f.profile,activation_current:true}
 await assert.rejects(inspectWorkerHeartbeatActivatedCatalog(pool,invalid),unavailable);assert.equal(connected,0)
 let resume,entered
 const waiting=new Promise(resolve=>{entered=resolve})
 const delayed={async connect(){entered();await new Promise(resolve=>{resume=resolve});return f.db}}
 const pending=inspectWorkerHeartbeatActivatedCatalog(delayed,f.profile)
 await waiting;f.profile.roles[2].oid=999;f.profile.schema_oid=77;resume()
 assert.deepEqual(await pending,expected);assert.equal(f.released(),1)
})

test('acquire/begin/settings/query/rollback/release failures are sanitized503 and release exactly once',async()=>{
 for(const fault of ['connect','BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY','SET LOCAL search_path=pg_catalog',
  "SET LOCAL statement_timeout='5000ms'; SET LOCAL lock_timeout='1000ms'",'roles','ROLLBACK','release']){
  const f=fixture();f.faults.add(fault)
  await assert.rejects(inspectWorkerHeartbeatActivatedCatalog(f.pool,f.profile),unavailable)
  assert.equal(f.released(),fault==='connect'?0:1)
 }
 const f=fixture();f.faults.add('target')
 await assert.rejects(verifyWorkerHeartbeatActivatedCatalog(f.db,f.profile),unavailable)
 assert.equal(f.released(),0,'verify-on-client does not own caller transaction')
})

