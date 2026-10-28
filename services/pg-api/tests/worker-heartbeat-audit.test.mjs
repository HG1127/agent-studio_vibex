// Pure catalog doubles and nonexecuted source obligations ONLY. These do not
// prove SQL syntax, database privileges, locking, liveness or runtime activation.
import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {verifyWorkerHeartbeatCore,workerHeartbeatSchemaPins} from '../src/worker-heartbeat-audit-core.ts'
import {verifyWorkerHeartbeatSchemaFull,inspectWorkerHeartbeatSchemaFull} from '../src/worker-heartbeat-audit.ts'

const hash=s=>createHash('sha256').update(s).digest('hex')
const sql=readFileSync(new URL('../../../db/postgres/telemetry/001_worker_heartbeats.sql',import.meta.url),'utf8')
const kinds=['prepare','model','workflow_safe','workflow_v2','agent_autonomous','knowledge_index','knowledge_query','assessment']
const writers=kinds.flatMap(k=>[1,2].map(s=>`studio_telemetry_tx_${k}_${s}`))
const names=['studio_telemetry_owner','studio_telemetry_reader',...writers]
const expected={schema:'telemetry_v1',phase:'schema_full_dormant',runtime_activated:false}
const pins={"sql":"d4131c5b60434e56e2a58a634ad27a440c29d6aec39809b791af337b59c252c9","record":"4e1fd93b6217d5cf414189f568d395f48a3e3e54e1ee455e65d28d4717e15143","snapshot":"17215237dbc5f81ba8fbbb2fd8eae2a9da7e0e0cfa859124ab50f3ccd60671ec"}
const defs={kind_config:[['ordinal','smallint',true,null],['kind','text',true,null],['instrumented','boolean',true,'false'],['enabled','boolean',true,'false']],slot_state:[['kind','text',true,null],['slot_no','smallint',true,null],['login_oid','oid',true,null],['login_name','text',true,null],['enabled','boolean',true,'false'],['generation','uuid',false,null],['last_sequence','bigint',true,"'0'::bigint"],['state','text',false,null],['reason','text',false,null],['observed_at','timestamp with time zone',false,null],['draining','boolean',true,'false']]}
const ck={
 telemetry_kind_range:'((ordinal >= 1) AND (ordinal <= 8))',telemetry_kind_enabled:'((NOT enabled) OR instrumented)',
 telemetry_slot_range:'((slot_no >= 1) AND (slot_no <= 2))',telemetry_slot_sequence:"((last_sequence >= 0) AND (last_sequence <= '9007199254740991'::bigint))",telemetry_slot_enabled:'((NOT enabled) OR (generation IS NOT NULL))',
 telemetry_slot_observation:"(((last_sequence = 0) AND (state IS NULL) AND (reason IS NULL) AND (observed_at IS NULL) AND (NOT draining)) OR ((last_sequence > 0) AND (generation IS NOT NULL) AND (state IS NOT NULL) AND (reason IS NOT NULL) AND (observed_at IS NOT NULL) AND (((state = 'unknown'::text) AND (reason = ANY (ARRAY['startup_checks_pending'::text, 'loop_unavailable'::text]))) OR ((state = 'ready'::text) AND (reason = 'startup_checks_complete'::text)) OR ((state = 'draining'::text) AND (reason = 'new_claims_closed'::text))) AND (draining = (state = 'draining'::text))))",
}
const keys=[['telemetry_kind_pk','kind_config','p',['ordinal']],['telemetry_kind_unique','kind_config','u',['kind']],['telemetry_slot_pk','slot_state','p',['kind','slot_no']],['telemetry_slot_login_oid','slot_state','u',['login_oid']],['telemetry_slot_login_name','slot_state','u',['login_name']],['telemetry_slot_kind_fk','slot_state','f',['kind']]]
function fixture(){
 let n=300
 const roles=names.map((name,i)=>({id:100+i,name,login:false,inherit:false,super:false,bypass:false,create_db:false,create_role:false,replication:false,connection_limit:i===0?-1:i===1?2:1,config:null,no_expiry:true,memberships:0}))
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
 const state={target:{database:'agent_studio_telemetry',version:180006,encoding:'UTF8',owner_id:1,owner_super:true,authentic_audit:true,consistent_readonly:true,controlled_path:true,isolated:true},roles,namespace:[{id:10,name:'studio_telemetry',owner_id:1,comment:'agent_studio_telemetry/telemetry_v1/schema_full_dormant'}],tables:[{id:20,name:'kind_config',owner_id:100,ok:true},{id:21,name:'slot_state',owner_id:100,ok:true}],columns:Object.entries(defs).flatMap(([relation,attrs])=>attrs.map(([name,type,required,def],i)=>({relation,name,type,required,default:def,ordinal:i+1,plain:true}))),not_nulls:Object.entries(defs).flatMap(([relation,attrs])=>attrs.filter(a=>a[2]).map(a=>({relation,columns:[a[0]],ok:true}))),constraints,indexes,policies:['kind_config','slot_state'].map(relation=>({relation,name:'telemetry_owner_policy',command:'*',permissive:true,roles:[100],qual:'true',check:'true'})),routines:funcs,acl,boundaries:{ok:true},database_acl,sensitive:roles.flatMap(r=>['pg_authid','pg_shadow'].map((name,i)=>({role_id:r.id,name:'pg_catalog.'+name,kind:i?'v':'r',effective:false,raw_grant:false}))),kind_registry:kinds.map((kind,i)=>({ordinal:i+1,kind,instrumented:false,enabled:false})),slot_registry:kinds.flatMap(kind=>[1,2].map(slot_no=>({kind,slot_no,login_name:`studio_telemetry_tx_${kind}_${slot_no}`,login_oid:roles.find(r=>r.name===`studio_telemetry_tx_${kind}_${slot_no}`).id,enabled:false,generation:null,last_sequence:'0',state:null,reason:null,observed_at:null,draining:false})))}
 const trace=[],faults=new Set();let released=0
 const db={async query(sql,args=[]){trace.push({sql,args:structuredClone(args)});if(faults.has(sql))throw Error('private query failure')
  if(['BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY','SET LOCAL search_path=pg_catalog','ROLLBACK'].includes(sql))return {rows:[]}
  const tag=/^\/\* telemetry_v1:([a-z_]+) \*\//.exec(sql)?.[1]
  assert.ok(tag&&Object.hasOwn(state,tag),'Unexpected query: '+sql)
  if(faults.has(tag))throw Error('private catalog failure')
  if(faults.has(tag+':malformed'))return {rows:null}
  const value=state[tag];return {rows:structuredClone(Array.isArray(value)?value:[value])}
 },release(){released++;if(faults.has('release'))throw Error('private release failure')}}
 return {state,db,trace,faults,pool:{async connect(){if(faults.has('connect'))throw Error('private acquire failure');return db}},released:()=>released}
}
const refused=e=>e.message==='unsafe_worker_heartbeat_schema'
const unavailable=e=>e.status===503&&e.code==='worker_heartbeat_schema_unavailable'&&e.message==='worker_heartbeat_schema_unavailable'
async function reject(change){const f=fixture();change(f.state,f);await assert.rejects(verifyWorkerHeartbeatCore(f.db),refused)}

test('raw independent SQL and two literal routine body pins are fixed; old061 and frozen DTO remain unchanged',()=>{
 assert.deepEqual(workerHeartbeatSchemaPins,pins);assert.equal(hash(sql),pins.sql)
 for(const name of ['record','snapshot'])assert.equal(hash(sql.match(new RegExp('AS \\$'+name+'\\$([\\s\\S]*?)\\$'+name+'\\$;'))[1]),pins[name])
 for(const [path,sha] of [['../../../db/postgres/migrations/pg_v9_061_company_overview.sql','fc02db13a38de7fcb7a78afdadf9c966e58fc8339fd9cc1e57bac3fa84243923'],['../src/worker-heartbeat-contract.ts','336cebafc1c1b54542fc6828093cb0e87d333950bb3ace1ef318ad75f2d10eba']])assert.equal(hash(readFileSync(new URL(path,import.meta.url))),sha)
})
test('nonexecuted installation guard requires exact empty dedicated PG18 DB and does not create a DB or activate logins',()=>{
 const source=sql.replace(/--[^\n]*/g,'')
 assert.ok(source.indexOf("current_database() <> 'agent_studio_telemetry'")<source.indexOf('CREATE ROLE'))
 assert.match(source,/BETWEEN 180000 AND 189999/);assert.match(source,/requires_empty_database/)
 assert.equal((source.match(/CREATE TABLE /g)||[]).length,2);assert.equal((source.match(/CREATE FUNCTION /g)||[]).length,2)
 assert.doesNotMatch(source,/CREATE DATABASE|CREATE OR REPLACE|\bLOGIN\b|PASSWORD|pg_v9_|agentstudio[._]|ALTER DEFAULT PRIVILEGES|SET ROLE/)
 assert.match(source,/CREATE ROLE studio_telemetry_owner NOLOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS/)
 assert.match(source,/FOR s IN 1\.\.2/);assert.match(source,/generate_series\(1,2\)/)
})
test('nonexecuted record obligations bind authentic session login, current generation, bounded sequence and terminal drain',()=>{
 const body=sql.match(/AS \$record\$([\s\S]*?)\$record\$;/)[1]
 assert.match(body,/r\.rolname=session_user AND r\.rolcanlogin/);assert.match(body,/r\.oid=s\.login_oid AND r\.rolname=s\.login_name/)
 assert.ok(body.includes("slot.login_name<>'studio_telemetry_tx_'||slot.kind||'_'||slot.slot_no"))
 assert.match(body,/FOR SHARE OF k/);assert.match(body,/FOR UPDATE OF s/)
 assert.match(body,/slot\.generation::text<>\$2 COLLATE "C"/);assert.match(body,/\$3<slot\.last_sequence/)
 const replay=body.slice(body.indexOf('IF $3=slot.last_sequence'),body.indexOf('IF slot.draining'))
 assert.match(replay,/slot\.state IS DISTINCT FROM \$4 OR slot\.reason IS DISTINCT FROM \$5/);assert.match(replay,/RETURN jsonb_build_object/)
 assert.doesNotMatch(replay,/\bUPDATE\b[^\n]*SET|clock_timestamp\(/)
 assert.ok(body.indexOf("IF slot.draining")<body.indexOf('at:=date_trunc'))
 assert.match(body,/9007199254740991/);assert.match(body,/at<slot\.observed_at/)
 assert.doesNotMatch(body,/INSERT INTO|DELETE FROM|random_uuid|beginBoot|register|RESET |set_config|X-Rh/)
})
test('nonexecuted snapshot obligations use one readonly data statement and DB clock, exact8 rows/90s without auth or guessed freshness',()=>{
 const body=sql.match(/AS \$snapshot\$([\s\S]*?)\$snapshot\$;/)[1]
 assert.match(body,/transaction_read_only/);assert.equal((body.match(/clock_timestamp\(\)/g)||[]).length,1)
 assert.match(body,/clock AS MATERIALIZED/);assert.match(body,/s\.observed_at>clock\.at/)
 assert.match(body,/count\(\*\)=8/);assert.match(body,/count\(\*\)=16/);assert.match(body,/>=interval '90 seconds'/)
 for(const value of kinds)assert.ok(body.includes("'"+value+"'"))
 assert.match(body,/'native_company_worker_heartbeats_v1'/);assert.match(body,/'company_worker_metadata_only'/)
 assert.doesNotMatch(body,/\b(?:UPDATE|INSERT|DELETE|TRUNCATE)\b|agentstudio_auth|studio_users|GREATEST|statement_timestamp|now\(\)/)
})
test('complete independent fixture yields explicit dormant SchemaFull, never runtime activated; only two bounded domain tables are read',async()=>{
 const f=fixture();assert.deepEqual(await verifyWorkerHeartbeatCore(f.db),expected)
 assert.deepEqual(await verifyWorkerHeartbeatSchemaFull(f.db),expected)
 for(const q of f.trace){assert.doesNotMatch(q.sql,/agentstudio_auth\.|agentstudio\.|SET ROLE|FROM pg_catalog\.pg_authid\s|FROM pg_catalog\.pg_shadow\s/)}
 const data=f.trace.filter(q=>q.sql.includes('FROM studio_telemetry.'));assert.equal(data.length,4)
})
test('only clean complete absence is false; any partial role or namespace installation rejects',async()=>{
 let f=fixture();f.state.roles=[];f.state.namespace=[];assert.equal(await verifyWorkerHeartbeatCore(f.db),false)
 f=fixture();f.state.namespace=[];await assert.rejects(verifyWorkerHeartbeatCore(f.db),refused)
 for(const field of ['roles','tables','columns','not_nulls','constraints','indexes','policies','routines','acl','sensitive','kind_registry','slot_registry'])await reject(s=>{s[field]=[]})
})
test('wrong database/version/encoding/owner/audit context/isolation rejects before domain catalog access',async()=>{
 for(const [key,value] of Object.entries({database:'agent_studio',version:170009,encoding:'LATIN1',owner_id:'1',owner_super:false,authentic_audit:false,consistent_readonly:false,controlled_path:false,isolated:false}))await reject((s,f)=>{s.target[key]=value})
 for(const value of [180000.5,190000,'180006',null])await reject(s=>{s.target.version=value})
})
test('namespace identity, ownership, version marker and duplicates are closed',async()=>{
 for(const [key,value] of Object.entries({id:0,name:'studio_telemetry_other',owner_id:100,comment:'activated'}))await reject(s=>{s.namespace[0][key]=value})
 await reject(s=>{s.namespace.push({...s.namespace[0]})})
})
test('all eighteen roles require NOLOGIN and exact flags, zero memberships, expiry/config/connection bounds',async()=>{
 for(let i=0;i<18;i++)for(const key of ['login','inherit','super','bypass','create_db','create_role','replication'])await reject(s=>{s.roles[i][key]=true})
 for(const [key,value] of Object.entries({memberships:1,config:[],no_expiry:false,connection_limit:4,id:'100',name:'agentstudio_api'}))await reject(s=>{s.roles[0][key]=value})
 await reject(s=>{s.roles[1].id=s.roles[0].id});await reject(s=>{s.roles.push({...s.roles[0],id:999})})
})
test('table relation ownership/RLS/FORCE/heap assumptions and exact fifteen plain columns are closed',async()=>{
 for(const [key,value] of Object.entries({name:'extra',owner_id:1,id:0,ok:false}))await reject(s=>{s.tables[0][key]=value})
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
 const f=fixture();await verifyWorkerHeartbeatCore(f.db);const q=f.trace.find(x=>x.sql.startsWith('/* telemetry_v1:boundaries */')).sql
 for(const fragment of ['pg_shdepend','pg_default_acl','pg_db_role_setting','pg_has_role','has_any_column_privilege','has_function_privilege','count(DISTINCT p.proname)=4','NOT starts_with(n.nspname,\'pg_\')'])assert.ok(q.includes(fragment))
 assert.doesNotMatch(q,/LIKE 'pg_%'/)
})
test('database ACL is limited to trusted DB owner and CONNECT-only dormant reader/slots',async()=>{
 for(const [key,value] of Object.entries({grantee:0,grantor:100,privilege:'TEMPORARY',grantable:true}))await reject(s=>{s.database_acl.find(x=>x.grantee===101)[key]=value})
 await reject(s=>{s.database_acl.pop()})
})
test('all eighteen roles and both exact sensitive catalogs reject raw/effective grants, missing rows and driver coercion',async()=>{
 for(let i=0;i<36;i++)for(const key of ['effective','raw_grant'])await reject(s=>{s.sensitive[i][key]=true})
 for(const [key,value] of Object.entries({name:'pg_catalog.pg_roles',kind:'m',role_id:'100'}))await reject(s=>{s.sensitive[0][key]=value})
 await reject(s=>{s.sensitive.pop()});await reject(s=>{s.sensitive[1]={...s.sensitive[0]}})
 const f=fixture();await verifyWorkerHeartbeatCore(f.db);const q=f.trace.find(x=>x.sql.startsWith('/* telemetry_v1:sensitive */')).sql
 assert.match(q,/aclexplode\(a.attacl\)/);assert.match(q,/aclexplode\(coalesce\(c.relacl/);assert.doesNotMatch(q,/FROM pg_catalog\.pg_authid\s|FROM pg_catalog\.pg_shadow\s|rolpassword|passwd/)
})
test('all eight seeded kinds must remain exact, ordered, uninstrumented and disabled in SchemaFull phase',async()=>{
 for(const [key,value] of Object.entries({ordinal:2,kind:'scheduler',instrumented:true,enabled:true}))await reject(s=>{s.kind_registry[0][key]=value})
 await reject(s=>{s.kind_registry.reverse()})
})
test('all sixteen slots bind exact kind/slot and login OID/name; observation, activation and drain cannot masquerade as dormant',async()=>{
 for(let i=0;i<16;i++)await reject(s=>{s.slot_registry[i].login_oid=999})
 for(const [key,value] of Object.entries({kind:'model',slot_no:'1',login_name:'studio_telemetry_tx_model_1',enabled:true,generation:'11111111-1111-4111-8111-111111111111',last_sequence:'1',state:'ready',reason:'startup_checks_complete',observed_at:'2026-10-28T00:00:00.000Z',draining:true}))await reject(s=>{s.slot_registry[0][key]=value})
 await reject(s=>{s.slot_registry[1]={...s.slot_registry[0]}})
})
test('missing, malformed or inaccessible catalog results fail closed with no partial successful schema',async()=>{
 for(const tag of Object.keys(fixture().state)){await reject((s,f)=>{f.faults.add(tag)});await reject((s,f)=>{f.faults.add(tag+':malformed')})}
 await reject(s=>{s.target=[]});await reject(s=>{s.boundaries=[{ok:true},{ok:true}]})
})
test('inspection uses readonly transaction, no SET ROLE, and exposes dormant result only after rollback and release',async()=>{
 const f=fixture();assert.deepEqual(await inspectWorkerHeartbeatSchemaFull(f.pool),expected)
 assert.equal(f.trace[0].sql,'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');assert.equal(f.trace.at(-1).sql,'ROLLBACK');assert.equal(f.released(),1)
 assert.equal(f.trace[1].sql,'SET LOCAL search_path=pg_catalog')
 assert.ok(f.trace.every(x=>!x.sql.includes('SET ROLE')))
 const absent=fixture();absent.state.roles=[];absent.state.namespace=[];assert.equal(await inspectWorkerHeartbeatSchemaFull(absent.pool),false)
 await assert.rejects(verifyWorkerHeartbeatSchemaFull(absent.db),unavailable)
})
test('acquisition, transaction, core, rollback and release failures produce fixed503 and release once',async()=>{
 for(const fault of ['connect','BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY','SET LOCAL search_path=pg_catalog','roles','ROLLBACK','release']){const f=fixture();f.faults.add(fault);await assert.rejects(inspectWorkerHeartbeatSchemaFull(f.pool),unavailable);assert.equal(f.released(),fault==='connect'?0:1)}
})
