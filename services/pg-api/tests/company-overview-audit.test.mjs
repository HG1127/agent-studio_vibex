// Catalog doubles/offline source checks only. No SQL, PG emulator or sockets.
import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {verifyCompanyOverviewCore} from '../src/company-overview-audit-core.ts'
import {verifyCompanyOverviewSchema,inspectCompanyOverviewSchema} from '../src/company-overview-audit.ts'
import {companyDatabaseCount,parseCompanyOverview,parseCompanyEmployeePage} from '../src/company-overview-contract.ts'

const digest=value=>createHash('sha256').update(value,'utf8').digest('hex')
const sql=readFileSync(new URL('../../../db/postgres/migrations/pg_v9_061_company_overview.sql',import.meta.url),'utf8')
const pins={company_overview:'db392df51b3033d09558f196fc4fe94a54ce6bca48e9fe01877eb1818b3330ed',company_employee_stats:'ac6b0eedcb87d0e9c60ab68217c4e3ec11f35003b7daa428a90d8340f31989b8'}
const role=11,api=10,native="(external_issuer = 'urn:agentstudio:local:v1'::text)"
const definitions=[
 ['agentstudio.users',[['id','uuid',true],['external_issuer','text',true],['display_name','text',true],['status','text',true]],'company_users_select','users_owner','(id = agentstudio.actor_id())'],
 ['agentstudio_auth.accounts',[['user_id','uuid',true],['enabled','boolean',true],['is_admin','boolean',true]],'company_accounts_select',null,null],
 ['agentstudio.runs',[['owner_user_id','uuid',true],['kind','text',true],['status','text',true],['created_at','timestamp with time zone',true]],'company_runs_select','owner_runs','(owner_user_id = agentstudio.actor_id())'],
 ['agentstudio.schedules',[['owner_user_id','uuid',true],['enabled','boolean',true],['deleted_at','timestamp with time zone',false],['next_at','timestamp with time zone',false]],'company_schedules_select','owner_schedules','(owner_user_id = agentstudio.actor_id())'],
 ['agentstudio.knowledge_bases',[['owner_user_id','uuid',true]],'company_knowledge_select','owner_knowledge_bases','(owner_user_id = agentstudio.actor_id())'],
]
function fixture(){
 let next=400
 const bases=definitions.map(([name],i)=>({name,id:200+i,owner_id:99,ok:true}))
 const columns=definitions.flatMap(([relation,cols],i)=>cols.map(([name,type,required])=>({relation,relation_id:200+i,owner_id:99,name,type,required,plain:true,read:true,insert:false,update:false,reference:false})))
 for(const [relation,name] of [['agentstudio_auth.accounts','email'],['agentstudio_auth.accounts','password_record'],['agentstudio_auth.sessions','token_digest'],['agentstudio.runs','checkpoint'],['agentstudio.runs','instruction'],['agentstudio.jobs','payload'],['public.unrelated','private']])columns.push({relation,name,read:false,insert:false,update:false,reference:false})
 const policies=definitions.map(([relation,,name],i)=>({id:next++,relation,name,command:'r',permissive:true,roles:[role],qual:i===0?native:'true',check:null}))
 const applicable_policies=policies.map(p=>({...structuredClone(p),relation_id:bases.find(b=>b.name===p.relation).id}))
 for(const [relation,,,name,expression] of definitions)if(name)applicable_policies.push({relation_id:bases.find(b=>b.name===relation).id,relation,name,command:'*',permissive:true,roles:[api],qual:expression,check:expression})
 const routines=Object.entries(pins).map(([name,sha],i)=>({schema:'agentstudio',id:100+i,name,owner_id:role,args:i===0?'':'integer, uuid',result:'jsonb',language:'plpgsql',volatility:'s',definer:true,strict:false,leakproof:false,parallel:'u',kind:'f',defaults:0,modes:null,argnames:null,ordinary:true,config:['search_path=pg_catalog'],sha}))
 const state={stamp:{readable:true,installed:true,predecessor:true},roles:[{id:role,name:'agentstudio_company_metadata_reader',login:false,inherit:false,super:false,bypass:false,create_role:false,create_db:false,replication:false,connection_limit:-1,config:null,memberships:0}],routines,policies,orphans:{ok:true},api:{id:api,current_role:true,ok:true,version:180006},function_acl:routines.flatMap(f=>[role,api].map(grantee=>({function_id:f.id,grantor:role,grantee,privilege:'EXECUTE',grantable:false}))),function_effective:routines.map(f=>({id:f.id,api:true,other_roles:[]})),owner_surface:{ok:true},schema_acl:['agentstudio','agentstudio_auth'].map(name=>({name,owner_grant:true,privilege:'USAGE',grantable:false})),bases,columns,column_acl:columns.filter(c=>c.read).map(c=>({relation:c.relation,name:c.name,owner_grant:true,privilege:'SELECT',grantable:false})),applicable_policies,actor:{id:90,schema:'agentstudio',name:'actor_id',args:'',result:'uuid',language:'sql',volatility:'s',definer:false,strict:false,leakproof:false,config:null,sha:'084b38798ae2c68f4165ee40800b909c874e8765372d357ee41845f92ec80555',executable:true,owner_safe:true}}
 state.identity_keys=[{relation:'agentstudio.users',relation_id:200,id:210,columns:['id'],ok:true},{relation:'agentstudio_auth.accounts',relation_id:201,id:211,columns:['user_id'],ok:true}]
 state.actor.ordinary=true
 state.sensitive_catalogs=[{name:'pg_catalog.pg_authid',id:1260,kind:'r',table_read:false,column_read:false,table_write:false,column_write:false},{name:'pg_catalog.pg_shadow',id:12000,kind:'v',table_read:false,column_read:false,table_write:false,column_write:false}]
 const trace=[];let oldCalls=0,released=0;const faults=new Set()
 const db={async query(query,args=[]){trace.push({sql:query,args:structuredClone(args)});if(faults.has(query))throw Error('synthetic private driver details')
  if(['BEGIN READ ONLY','SET LOCAL ROLE agentstudio_api','ROLLBACK'].includes(query))return {rows:[]}
  const tag=/^\/\* company061:([a-z_]+) \*\//.exec(query)?.[1]
  if(!tag){oldCalls++;throw Error('actual predecessor060 full chain entered; no fake positive old catalog')}
  assert.ok(Object.hasOwn(state,tag),'Only declared catalog tags are allowed: '+tag)
  const value=state[tag];return {rows:structuredClone(Array.isArray(value)?value:[value])}
 },release(){released++;if(faults.has('release'))throw Error('private release failure')}}
 return {state,db,trace,faults,pool:{async connect(){return db}},oldCalls:()=>oldCalls,released:()=>released}
}
function absent(f){Object.assign(f.state.stamp,{installed:false,predecessor:false});f.state.roles=[];f.state.routines=[];f.state.policies=[]}
const refused=e=>e.message==='unsafe_company_overview_privileges'
const unavailable=e=>e.status===503&&e.code==='company_projection_unavailable'&&e.message==='company_projection_unavailable'
async function reject(change){const f=fixture();change(f.state,f);await assert.rejects(verifyCompanyOverviewCore(f.db),refused)}

test('061 fixed raw source, two routine body pins and16-column grants match independently reviewed literals',()=>{
 assert.equal(digest(sql),'fc02db13a38de7fcb7a78afdadf9c966e58fc8339fd9cc1e57bac3fa84243923')
 const bodies=[...sql.matchAll(/CREATE FUNCTION agentstudio\.(\w+)\([^]*?AS \$fn\$([^]*?)\$fn\$;/g)]
 assert.equal(bodies.length,2)
 const core=readFileSync(new URL('../src/company-overview-audit-core.ts',import.meta.url),'utf8')
 for(const m of bodies){assert.equal(digest(m[2]),pins[m[1]]);assert.ok(core.includes(pins[m[1]]))}
 const actor=readFileSync(new URL('../../../db/postgres/001_stage_schema.sql',import.meta.url),'utf8').match(/AS \$actor\$([^]*?)\$actor\$/)[1]
 assert.equal(digest(actor),'084b38798ae2c68f4165ee40800b909c874e8765372d357ee41845f92ec80555')
 const grants=[...sql.matchAll(/GRANT SELECT\(([^)]+)\) ON (\S+) TO agentstudio_company_metadata_reader;/g)].map(m=>[m[2],m[1].split(',')])
 assert.deepEqual(grants,definitions.map(([name,cols])=>[name,cols.map(c=>c[0])]))
 assert.equal(grants.flatMap(g=>g[1]).length,16)
 assert.doesNotMatch(sql,/CREATE TABLE|CREATE TRIGGER|GRANT UPDATE/)
 assert.doesNotMatch(core,/node:fs|readFile|load.*migration/)
})

test('nonexecuted SQL obligations preserve Native disabled denominator, snapshot, aggregate boundaries and closed envelopes',()=>{
 const bodies=[...sql.matchAll(/CREATE FUNCTION agentstudio\.(\w+)\([^]*?AS \$fn\$([^]*?)\$fn\$;/g)]
 for(const [,name,body] of bodies){
  assert.match(body,/caller\.is_admin IS DISTINCT FROM true/);assert.match(body,/caller\.enabled IS DISTINCT FROM true/)
  assert.match(body,/EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'company_native_session_required'/)
  assert.match(body,/date_trunc\('milliseconds',statement_timestamp\(\)\)/)
  assert.doesNotMatch(body,/FOR SHARE|FOR UPDATE|clock_timestamp|agent_memory_outcome_epoch|\b(?:INSERT|UPDATE|DELETE)\b|agentstudio\.(?:jobs|approvals|external_effects)|\b(?:email|password_record|sessions|checkpoint|instruction|result_text|payload)\b/i)
  assert.match(body,/created_at>=at\.as_of-interval '7 days'/);assert.match(body,/next_at<at\.as_of-interval '60 seconds'/)
  assert.match(body,/knowledge AS\(SELECT k\.owner_user_id,count\(\*\)/)
  if(name==='company_overview')assert.doesNotMatch(body,/\bLIMIT\b/)
  else{assert.match(body,/\$1 NOT BETWEEN 1 AND 20/);assert.match(body,/u\.id>\$2/);assert.match(body,/ORDER BY u\.id LIMIT \$1\+1/);assert.match(body,/'has_more'/);assert.match(body,/'next_after'/)}
 }
 const keys=['agent_running','workflow_running','pending_approvals','human_input','failed_7d','overdue_schedules','knowledge_bases'],zero=Object.fromEntries(keys.map(k=>[k,companyDatabaseCount('0')]))
 const as_of='2026-10-28T01:02:03.123Z'
 assert.equal(parseCompanyOverview({protocol:'native_company_overview_v1',scope:'company_metadata_only',as_of,window_days:7,totals:{employees:companyDatabaseCount('205'),active:companyDatabaseCount('190'),...zero},worker:{availability:'unavailable',reason:'telemetry_not_installed'}}).totals.employees,205)
 const item={employee_id:'00000000-0000-4000-8000-000000000001',display_name:'Disabled synthetic employee',is_admin:false,enabled:false,status:'active',...zero,agent_running:3}
 assert.equal(parseCompanyEmployeePage({protocol:'native_company_employee_stats_v1',scope:'company_metadata_only',as_of,limit:20,items:[item],has_more:false,next_after:null}).items[0].agent_running,3)
 assert.throws(()=>companyDatabaseCount('9007199254740992'));assert.throws(()=>companyDatabaseCount(205))
})

test('clean confirmed absence alone is false; partial, inaccessible and orphan installation states reject',async()=>{
 const f=fixture();absent(f);assert.equal(await verifyCompanyOverviewCore(f.db),false)
 for(const key of ['roles','routines','policies'])await reject((s,f)=>{const retained=structuredClone(s[key]);absent(f);s[key]=retained})
 await reject((s,f)=>{absent(f);s.orphans.ok=false})
 await reject(s=>{s.stamp.readable=false});await reject(s=>{s.stamp.predecessor=false});await reject(s=>{delete s.stamp.installed})
})

test('the complete independent catalog fixture passes with no employee/source/telemetry read',async()=>{
 const f=fixture();assert.equal(await verifyCompanyOverviewCore(f.db),true);assert.equal(f.oldCalls(),0)
 assert.ok(f.trace.every(t=>t.sql.startsWith('/* company061:')))
 assert.ok(f.trace.every(t=>!t.sql.includes('SELECT agentstudio.company_overview(')))
})

test('catalog name arrays explicitly use text[] wire decoding with the actual pg driver, retaining strict array validation',async()=>{
 const {default:pg}=await import('pg')
 const nameArray=pg.types.getTypeParser(1003,'text'),textArray=pg.types.getTypeParser(1009,'text')
 // Actual pg-types2.2.0 treats PostgreSQL name[] as an unparsed string. Never
 // accept that string or normalize it into a guessed permission/key array.
 assert.equal(nameArray('{}'),'{}');assert.equal(nameArray('{id}'),'{id}')
 assert.deepEqual(textArray('{}'),[]);assert.deepEqual(textArray('{id}'),['id'])
 const f=fixture();assert.equal(await verifyCompanyOverviewCore(f.db),true)
 assert.match(f.trace.find(t=>t.sql.startsWith('/* company061:function_effective */')).sql,/ARRAY\(SELECT rolname::text FROM pg_catalog\.pg_roles/)
 assert.match(f.trace.find(t=>t.sql.startsWith('/* company061:identity_keys */')).sql,/ARRAY\(SELECT a\.attname::text FROM unnest\(x\.conkey\)/)
 const valid=fixture();valid.state.function_effective[0].other_roles=textArray('{}');valid.state.identity_keys[0].columns=textArray('{id}');valid.state.identity_keys[1].columns=textArray('{user_id}')
 assert.equal(await verifyCompanyOverviewCore(valid.db),true)
 await reject(s=>{s.function_effective[0].other_roles=nameArray('{}')})
 await reject(s=>{s.identity_keys[0].columns=nameArray('{id}')})
})

test('literal pg_ schema exclusion cannot hide pgx user table rights or effective column rights',async()=>{
 const f=fixture();f.state.columns.push({relation:'pgx_ct03_boundary.read_canary',name:'secret_text',read:false,insert:false,update:false,reference:false})
 assert.equal(await verifyCompanyOverviewCore(f.db),true)
 const surface=f.trace.find(t=>t.sql.startsWith('/* company061:owner_surface */')).sql,columns=f.trace.find(t=>t.sql.startsWith('/* company061:columns */')).sql
 assert.equal([...surface.matchAll(/NOT starts_with\(n\.nspname,'pg_'\)/g)].length,3)
 assert.equal([...columns.matchAll(/NOT starts_with\(n\.nspname,'pg_'\)/g)].length,1)
 assert.doesNotMatch(surface+columns,/LIKE\s+'pg_%'/i)
 for(const relation of ['ct03_boundary_control.read_canary','pgx_ct03_boundary.read_canary']){
  await reject(s=>s.columns.push({relation,name:'secret_text',read:true,insert:false,update:false,reference:false}))
  await reject(s=>s.column_acl.push({relation,name:'secret_text',owner_grant:true,privilege:'SELECT',grantable:false}))
 }
})

test('both exact sensitive catalogs reject any effective read/write without selecting credential rows or banning public metadata',async()=>{
 const f=fixture();assert.equal(await verifyCompanyOverviewCore(f.db),true)
 const q=f.trace.find(t=>t.sql.startsWith('/* company061:sensitive_catalogs */'))
 assert.deepEqual(q.args,[role,['pg_authid','pg_shadow']])
 assert.match(q.sql,/has_table_privilege\(\$1::oid,c\.oid,'SELECT'\)/)
 assert.match(q.sql,/has_any_column_privilege\(\$1::oid,c\.oid,'SELECT'\)/)
 assert.match(q.sql,/has_table_privilege\(\$1::oid,c\.oid,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'\)/)
 assert.match(q.sql,/has_any_column_privilege\(\$1::oid,c\.oid,'INSERT,UPDATE,REFERENCES'\)/)
 assert.match(q.sql,/WHERE n\.nspname='pg_catalog' AND c\.relname=ANY\(\$2::text\[\]\)/)
 assert.doesNotMatch(q.sql,/FROM pg_catalog\.(?:pg_authid|pg_shadow)|rolpassword|passwd|SELECT \*/i)
 for(const index of [0,1])for(const field of ['table_read','column_read','table_write','column_write'])await reject(s=>{s.sensitive_catalogs[index][field]=true})
 // Existing PUBLIC-readable pg_roles is not put on the denylist. No global
 // catalog SELECT prohibition or sensitive row probe is used by this check.
 assert.ok(!q.args[1].includes('pg_roles'))
})

test('missing, duplicate, substituted or malformed sensitive-catalog metadata fails closed',async()=>{
 await reject(s=>s.sensitive_catalogs.pop());await reject(s=>s.sensitive_catalogs.push({...s.sensitive_catalogs[0]}))
 await reject(s=>{s.sensitive_catalogs[1]={...s.sensitive_catalogs[0]}})
 for(const patch of [{id:0},{id:null},{name:'pg_catalog.pg_roles'},{kind:'v'},{table_read:null},{column_read:'false'},{table_write:undefined},{column_write:'false'}])await reject(s=>Object.assign(s.sensitive_catalogs[0],patch))
 await reject(s=>{s.sensitive_catalogs[1].id=s.sensitive_catalogs[0].id})
})

test('owner role attributes/memberships and API raw-auth reachability fail closed',async()=>{
 for(const field of ['login','inherit','super','bypass','create_role','create_db','replication'])await reject(s=>{s.roles[0][field]=true})
 for(const patch of [{memberships:1},{config:['search_path=public']},{connection_limit:0},{name:'agentstudio_company_shadow'},{id:0}])await reject(s=>Object.assign(s.roles[0],patch))
 await reject(s=>s.roles.push({...s.roles[0],id:999,name:'agentstudio_company_shadow'}))
 for(const patch of [{ok:false},{current_role:false},{version:160000},{version:190000},{id:null}])await reject(s=>Object.assign(s.api,patch))
})

test('function body, owner, schema, ABI, volatility and configuration substitutions reject',async()=>{
 for(const field of ['schema','owner_id','args','result','language','volatility','kind','sha'])await reject(s=>{s.routines[0][field]=field==='owner_id'?api:'drift'})
 for(const field of ['definer','ordinary'])await reject(s=>{s.routines[0][field]=false})
 for(const field of ['strict','leakproof'])await reject(s=>{s.routines[0][field]=true})
 for(const patch of [{parallel:'s'},{defaults:1},{modes:['o']},{argnames:['owner']},{config:['search_path=public']},{config:['search_path=pg_catalog','row_security=off']}])await reject(s=>Object.assign(s.routines[1],patch))
 await reject(s=>{s.routines[1].id=s.routines[0].id});await reject(s=>{s.routines.push({...s.routines[0],id:999,name:'company_shadow'})})
})

test('PUBLIC/old-role execution, grant options and unexpected grantors cannot substitute API-only ACLs',async()=>{
 for(const patch of [{grantee:0},{grantee:88},{grantor:99},{grantable:true},{privilege:'UPDATE'},{function_id:999}])await reject(s=>Object.assign(s.function_acl[0],patch))
 await reject(s=>s.function_acl.pop());await reject(s=>s.function_acl.push({...s.function_acl[0]}))
 await reject(s=>{s.function_effective[0].other_roles=['agentstudio_review_worker']})
 await reject(s=>{s.function_effective[1].api=false});await reject(s=>{s.function_effective[1].id=100})
})

test('extra owner capabilities/ownership/schema grants and malformed base dependencies reject',async()=>{
 await reject(s=>{s.owner_surface.ok=false})
 for(const patch of [{owner_grant:false},{privilege:'CREATE'},{grantable:true},{name:'public'}])await reject(s=>Object.assign(s.schema_acl[0],patch))
 await reject(s=>s.schema_acl.push({...s.schema_acl[0]}))
 await reject(s=>{s.bases[0].ok=false});await reject(s=>{s.bases[0].owner_id=0});await reject(s=>{s.bases[0].id=s.bases[1].id});await reject(s=>s.bases.pop())
})

test('only16 real metadata columns are readable and raw/private/type/default/collation drift rejects',async()=>{
 for(const patch of [{read:false},{type:'varchar'},{required:false},{plain:false},{relation_id:999},{owner_id:123}])await reject(s=>Object.assign(s.columns[0],patch))
 for(const field of ['insert','update','reference'])await reject(s=>{s.columns[0][field]=true})
 for(const name of ['email','password_record','token_digest','checkpoint','instruction','payload','private'])await reject(s=>{s.columns.find(c=>c.name===name).read=true})
 await reject(s=>s.columns.push({...s.columns[0]}));await reject(s=>s.columns.splice(0,1))
 for(const patch of [{privilege:'UPDATE'},{owner_grant:false},{grantable:true},{relation:'public.shadow'},{name:'email'}])await reject(s=>Object.assign(s.column_acl[0],patch))
 await reject(s=>s.column_acl.pop());await reject(s=>{s.column_acl[1]={...s.column_acl[0]}})
})

test('employee/account single-column immediate UUID primary keys prevent joined denominator multiplication',async()=>{
 for(const patch of [{ok:false},{id:0},{relation_id:999},{relation:'public.users'},{columns:['id','external_issuer']},{columns:['user_id']}])await reject(s=>Object.assign(s.identity_keys[0],patch))
 await reject(s=>s.identity_keys.pop());await reject(s=>s.identity_keys.push({...s.identity_keys[0]}))
 await reject(s=>{s.identity_keys[1].id=s.identity_keys[0].id});await reject(s=>{s.identity_keys[1].columns=['email']})
})

test('new private role policies and unchanged API owner policies reject broader or disabled-only alternatives',async()=>{
 for(const patch of [{roles:[0]},{roles:[role,api]},{command:'*'},{permissive:false},{qual:'enabled'},{check:'true'},{relation:'public.users'},{name:'company_shadow'}])await reject(s=>Object.assign(s.policies[0],patch))
 await reject(s=>{s.policies[1].id=s.policies[0].id})
 for(const patch of [{roles:[0]},{qual:'true'},{check:'true'},{command:'r'},{permissive:false},{relation_id:999}])await reject(s=>Object.assign(s.applicable_policies.find(p=>p.name==='owner_runs'),patch))
 await reject(s=>s.applicable_policies.push({...s.applicable_policies[0],name:'other_public',roles:[0]}))
 await reject(s=>{s.applicable_policies.find(p=>p.name==='company_accounts_select').roles=[api]})
})

test('actor helper is a fixed nondefiner dependency, not a mutable authority substitute',async()=>{
 for(const patch of [{sha:'0'.repeat(64)},{definer:true},{ordinary:false},{executable:false},{owner_safe:false},{config:['search_path=public']},{result:'text'},{args:'uuid'},{schema:'public'}])await reject(s=>Object.assign(s.actor,patch))
})

test('public verifier requires installation and actually invokes the unchanged060 FULL chain',async()=>{
 const missing=fixture();absent(missing);await assert.rejects(verifyCompanyOverviewSchema(missing.db),unavailable);assert.equal(missing.oldCalls(),0)
 const f=fixture();await assert.rejects(verifyCompanyOverviewSchema(f.db),unavailable);assert.equal(f.oldCalls(),1)
 // Deliberately no positive FULL-chain claim from this standalone new-family
 // fixture. Genuine060 and061 catalog coexistence requires real hosted PG.
})

test('startup inspection rolls back/releases on absence, unsafe schema and driver failures',async()=>{
 const clean=fixture();absent(clean);assert.equal(await inspectCompanyOverviewSchema(clean.pool),false);assert.equal(clean.released(),1);assert.deepEqual(clean.trace.slice(0,2).map(t=>t.sql),['BEGIN READ ONLY','SET LOCAL ROLE agentstudio_api']);assert.equal(clean.trace.at(-1).sql,'ROLLBACK')
 const unsafe=fixture();unsafe.state.roles[0].login=true;await assert.rejects(inspectCompanyOverviewSchema(unsafe.pool),unavailable);assert.equal(unsafe.released(),1);assert.equal(unsafe.trace.at(-1).sql,'ROLLBACK')
 for(const query of ['BEGIN READ ONLY','SET LOCAL ROLE agentstudio_api']){const f=fixture();f.faults.add(query);await assert.rejects(inspectCompanyOverviewSchema(f.pool),unavailable);assert.equal(f.released(),1);assert.equal(f.trace.at(-1).sql,'ROLLBACK')}
 const rollback=fixture();absent(rollback);rollback.faults.add('ROLLBACK');assert.equal(await inspectCompanyOverviewSchema(rollback.pool),false);assert.equal(rollback.released(),1)
 const release=fixture();absent(release);release.faults.add('release');assert.equal(await inspectCompanyOverviewSchema(release.pool),false);assert.equal(release.released(),1)
 const unsafeRelease=fixture();unsafeRelease.state.roles[0].login=true;unsafeRelease.faults.add('release');await assert.rejects(inspectCompanyOverviewSchema(unsafeRelease.pool),unavailable);assert.equal(unsafeRelease.released(),1)
 await assert.rejects(inspectCompanyOverviewSchema({async connect(){throw Error('private network details')}}),unavailable)
})
