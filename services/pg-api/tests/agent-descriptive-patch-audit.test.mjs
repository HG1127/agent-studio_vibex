// Pure catalog doubles and offline SQL extraction only. No SQL is executed.
import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {verifyAgentDescriptivePatchCore,agentDescriptivePatchCheckExpression as normalize} from '../src/agent-descriptive-patch-audit-core.ts'
import {verifyAgentDescriptivePatchCredentials,inspectAgentDescriptivePatchSchema} from '../src/agent-descriptive-patch-audit.ts'
const sql=readFileSync(new URL('../../../db/postgres/migrations/pg_v9_060_agent_descriptive_patch.sql',import.meta.url),'utf8')
const digest=value=>createHash('sha256').update(value,'utf8').digest('hex')
const prefix='agent_descriptive_patch_',bad=/^unsafe_agent_descriptive_patch_privileges$/
const refused=error=>bad.test(error.message)
const pins={agent_descriptive_patch_receipt:'598e628e351ab88a863f6204780515894508d1d6a0ea7aef3ebdf9256b96aa68',agent_descriptive_patch_accept:'7d52ca4a0fb3b8a9580503dc8f3c1389bebaf8d56ab8a361caead942b5412091'}
// Fixture expectations come from independently reviewed, fingerprinted DDL,
// never from the production auditor's private literal manifest.
function definitions(){
 return [...sql.matchAll(/CREATE TABLE agentstudio\.(\w+)\(\n([^]*?)\n\);/g)].map(m=>{
  const fields=[],keys=[],checks=[],foreign=[]
  for(const raw of m[2].split('\n')){
   const line=raw.trim().replace(/,$/,'');let a
   if(a=/^(\w+) (.+?) NOT NULL(?: DEFAULT .+)?$/.exec(line))fields.push({name:a[1],type:a[2],required:true,clean:true})
   else if(a=/^CONSTRAINT (\w+) (PRIMARY KEY|UNIQUE)\(([^)]+)\)$/.exec(line))keys.push({name:a[1],kind:a[2]==='PRIMARY KEY'?'p':'u',columns:a[3].split(',')})
   else if(a=/^CONSTRAINT (\w+) CHECK\((.*)\)$/.exec(line))checks.push({name:a[1],expression:a[2].replace(/(jsonb_array_length\(\w+\)|\b\w+) BETWEEN (\d+) AND (\d+)/g,'$1 >= $2 AND $1 <= $3')})
   else if(a=/^CONSTRAINT (\w+) FOREIGN KEY\(([^)]+)\) REFERENCES (agentstudio\.\w+)\(([^)]+)\) ON UPDATE NO ACTION ON DELETE RESTRICT$/.exec(line))foreign.push({name:a[1],columns:a[2].split(','),target:a[3],references:a[4].split(',')})
   else assert.fail('Unrecognized fixed060 definition: '+line)
  }
  return {name:m[1],fields,keys,checks,foreign}
 })
}
function fixture(){
 let next=7000
 const defs=definitions(),rows=defs.map((d,i)=>({...d,id:6000+i,indexes:d.keys.map(k=>({id:next++,name:k.name,primary:k.kind==='p',columns:k.columns,ok:true})),constraints:[],relation:true,empty:true}))
 for(const t of rows){
  t.constraints=[...t.keys.map((k,i)=>({id:next++,index_id:t.indexes[i].id,target_id:0,...k,expression:null,target:null,references:[],ok:true,ri:true})),
   ...t.checks.map(c=>({id:next++,index_id:0,target_id:0,...c,kind:'c',columns:[],target:null,references:[],ok:true,ri:true})),
   ...t.foreign.map(f=>{const parent=rows.find(r=>'agentstudio.'+r.name===f.target);return{id:next++,index_id:parent.indexes[0].id,target_id:parent.id,...f,kind:'f',expression:null,ok:true,ri:true}}),
   ...t.fields.map(c=>({id:next++,index_id:0,target_id:0,name:t.name+'_'+c.name+'_not_null',kind:'n',expression:null,columns:[c.name],target:null,references:[],ok:true,ri:true}))]
 }
 const state={objects:rows.flatMap(t=>[{name:t.name,id:t.id,kind:'r'},...t.indexes.map(i=>({name:i.name,id:i.id,kind:'i'}))]),routines:[{name:'agent_descriptive_patch_receipt',args:'uuid, text',sha:pins.agent_descriptive_patch_receipt,ok:true},{name:'agent_descriptive_patch_accept',args:'jsonb',sha:pins.agent_descriptive_patch_accept,ok:true}],types:rows.flatMap(t=>[{name:t.name,table:t.name,ok:true},{name:'_'+t.name,table:t.name,ok:true}]),clean:true,readable:true,installed:true,predecessor:true,role:true,version:180006,extraInternal:true,throwAt:null}
 const trace=[]
 const db={async query(query,args=[]){
  trace.push({sql:query,args:structuredClone(args)})
  if(state.throwAt&&query.includes(state.throwAt))throw Error('private catalog driver detail')
  if(query==='BEGIN READ ONLY'||query==='SET LOCAL ROLE agentstudio_api'||query==='ROLLBACK')return {rows:[]}
  if(query.includes('has_column_privilege(current_user'))return {rows:[{ok:state.readable}]}
  if(query.includes("version='pg_v9_060'"))return {rows:[{installed:state.installed,predecessor:state.predecessor}]}
  if(query.includes("version='pg_v9_059'"))return {rows:[{installed:true,predecessor:true}]}
  if(query.includes('left(c.relname,')&&query.includes('AS kind'))return {rows:args[0]===prefix?state.objects:[]}
  if(query.includes('oidvectortypes'))return {rows:args[0]===prefix?state.routines:[]}
  if(query.startsWith('SELECT t.typname'))return {rows:args[0]===prefix?state.types:[]}
  if(query.startsWith('SELECT NOT EXISTS')&&typeof args[0]==='string')return {rows:[{ok:state.clean}]}
  if(query.includes('FROM pg_catalog.pg_roles r WHERE r.rolname=$1'))return {rows:[{ok:state.role}]}
  if(query.includes("current_setting('server_version_num')"))return {rows:[{version:state.version}]}
  if(query.includes('AND t.tgisinternal AND NOT(t.tgconstraint=ANY'))return {rows:[{ok:state.extraInternal}]}
  const t=rows.find(r=>r.id===args[0])
  assert.ok(t,'Only declared catalog/OID queries are allowed: '+query)
  if(query.startsWith('WITH relation AS'))return {rows:[{ok:t.relation}]}
  if(query.startsWith('SELECT a.attname'))return {rows:t.fields}
  if(query.startsWith('SELECT NOT EXISTS'))return {rows:[{ok:t.empty}]}
  if(query.startsWith('SELECT c.oid::integer AS id,c.relname'))return {rows:t.indexes}
  if(query.startsWith('SELECT x.oid::integer AS id,x.conindid'))return {rows:t.constraints}
  assert.fail('Unexpected query: '+query)
 }}
 return {db,state,rows,trace}
}
const reject=async mutate=>{const f=fixture();mutate(f);await assert.rejects(verifyAgentDescriptivePatchCore(f.db),refused)}

test('fixed060 v3 SQL inventory and offline raw body pins match independently reviewed literals',()=>{
 assert.equal(digest(sql),'b8aac275e692a81d2e05c8825f33bba7e5f418199e3dce97a409832f951ccbc9')
 const defs=definitions();assert.deepEqual(defs.map(d=>[d.fields.length,d.keys.length,d.checks.length,d.foreign.length]),[[32,2,7,0],[9,3,3,1]])
 const source=readFileSync(new URL('../src/agent-descriptive-patch-audit-core.ts',import.meta.url),'utf8')
 const found=[];for(const m of sql.matchAll(/CREATE FUNCTION agentstudio\.(\w+)\([^]*?AS \$fn\$([^]*?)\$fn\$;/g)){found.push(m[1]);assert.equal(digest(m[2]),pins[m[1]]);assert.ok(source.includes('sha:"'+pins[m[1]]+'"'))}
 assert.deepEqual(found.toSorted(),Object.keys(pins).toSorted());assert.doesNotMatch(source,/node:fs|readFile|load.*migration|from ["'][^"']*agent-(?:generated|opinion|assessment|review|optimization)-audit/)
 const receipt=sql.slice(sql.indexOf('CREATE FUNCTION agentstudio.agent_descriptive_patch_receipt'),sql.indexOf('CREATE FUNCTION agentstudio.agent_descriptive_patch_accept'))
 assert.match(receipt,/collaboration_safe_text\(before_description\)=before_description/);assert.doesNotMatch(receipt,/agent_assessment_result_valid\('optimize',jsonb_build_object\('descriptive',(?:before|after)_description/)
 assert.match(receipt,/agent_assessment_result_valid\('optimize',jsonb_build_object\('descriptive',model_patch/)
})
test('complete exact060 catalog passes standalone audit; counts derive from its own manifest',async()=>{
 const f=fixture();assert.equal(await verifyAgentDescriptivePatchCore(f.db),true)
 const extra=f.trace.find(q=>q.sql.includes('AND t.tgisinternal AND NOT(t.tgconstraint=ANY'))
 assert.deepEqual(extra.args[0],[6000,6001]);assert.deepEqual(extra.args[1],f.rows[1].constraints.filter(c=>c.kind==='f').map(c=>c.id))
 assert.equal(extra.args[1].length,1)
 for(const q of f.trace)assert.doesNotMatch(q.sql,/^\s*(?:INSERT|UPDATE|DELETE|MERGE|CREATE|ALTER|GRANT|REVOKE)\b|^\s*SELECT\s+agentstudio\./i)
})
test('only confirmed complete absence is false; inaccessible stamp, partial and orphan states refuse',async()=>{
 const f=fixture();f.state.objects=[];f.state.types=[];f.state.routines=[];f.state.installed=false;assert.equal(await verifyAgentDescriptivePatchCore(f.db),false);assert.equal(await verifyAgentDescriptivePatchCredentials(f.db),false)
 for(const name of ['objects','types','routines']){const p=fixture();p.state.objects=[];p.state.types=[];p.state.routines=[];p.state.installed=false;p.state[name]=fixture().state[name].slice(0,1);await assert.rejects(verifyAgentDescriptivePatchCore(p.db),refused)}
 await reject(f=>{f.state.installed=false});await reject(f=>{f.state.predecessor=false});await reject(f=>{f.state.readable=false})
 f.state.readable=false;await assert.rejects(verifyAgentDescriptivePatchCore(f.db),refused)
})
test('cross-schema shadows, orphan decorations and all malformed inventories refuse before absence',async()=>{
 await reject(f=>{f.state.clean=false});await reject(f=>{f.state.objects.push({id:1,name:prefix+'extra',kind:'v'})});await reject(f=>{f.state.objects[1].kind='S'})
 await reject(f=>{f.state.objects[1].id=f.state.objects[0].id});await reject(f=>{f.state.objects[1].name=f.state.objects[2].name});await reject(f=>{f.state.types[0].ok=false});await reject(f=>{f.state.types[0].table='wrong'});await reject(f=>{f.state.types[1].name=f.state.types[0].name})
 const f=fixture();await verifyAgentDescriptivePatchCore(f.db);const q=f.trace.find(q=>q.sql.startsWith('SELECT NOT EXISTS')&&q.args[0]===prefix).sql
 for(const catalog of ['pg_class c','pg_proc p','pg_type t','pg_constraint x','pg_trigger t','pg_policy','pg_event_trigger','pg_roles'])assert.ok(q.includes(catalog),catalog)
 assert.equal((q.match(/n\.nspname<>'agentstudio'/g)||[]).length,4)
})
test('routine ABI/body/owner/ACL and API role grant drift remain fail closed',async()=>{
 for(const change of [r=>{r.sha='0'.repeat(64)},r=>{r.args='text'},r=>{r.ok=false},r=>{r.name=prefix+'extra'}])await reject(f=>change(f.state.routines[0]))
 await reject(f=>{f.state.routines.push({...f.state.routines[0]})});await reject(f=>{f.state.role=false})
 const f=fixture();await verifyAgentDescriptivePatchCore(f.db);const routine=f.trace.find(q=>q.sql.includes('oidvectortypes')).sql,relation=f.trace.find(q=>q.sql.startsWith('WITH relation AS')).sql,role=f.trace.find(q=>q.sql.includes('FROM pg_catalog.pg_roles r WHERE r.rolname=$1')).sql
 for(const part of ['agent_generated_receipt(uuid,text)','proconfig','aclexplode','has_function_privilege','NOT r.rolsuper','prosupport','pronargdefaults','proowner'])assert.ok(routine.includes(part),part)
 for(const part of ['has_any_column_privilege','has_table_privilege','SELECT,INSERT,UPDATE,REFERENCES','DELETE,TRUNCATE,TRIGGER,MAINTAIN','difference'])assert.ok(relation.includes(part),part)
 assert.match(role,/builtin\.rolcanlogin/);assert.match(role,/pg_has_role\(member\.oid,builtin\.oid,'MEMBER'\)/)
})
test('exact columns/order/nullability/default/collation and private relation privileges are checked',async()=>{
 for(const change of [t=>{t.relation=false},t=>{t.empty=false},t=>{t.fields[0].clean=false},t=>{t.fields[0].required=false},t=>{t.fields[0].type='text'},t=>{t.fields.reverse()},t=>{t.fields.push({...t.fields[0],name:'extra'})}])await reject(f=>change(f.rows[0]))
 const f=fixture();await verifyAgentDescriptivePatchCore(f.db);assert.ok(f.trace.find(q=>q.sql.startsWith('SELECT a.attname')).sql.includes('a.attcollation=(SELECT typcollation'))
})
test('PK/unique actual index OIDs and canonical index shapes cannot be substituted',async()=>{
 for(const change of [t=>{t.indexes[0].id++},t=>{t.indexes[0].ok=false},t=>{t.indexes[0].primary=false},t=>{t.indexes[0].columns.reverse()},t=>{t.constraints.find(c=>c.kind==='p').index_id=t.indexes[1].id}])await reject(f=>change(f.rows[0]))
})
test('CHECK comparison permits deparser-only conjunction/JSON literal forms and rejects weaker logic',async()=>{
 const e='source_owner_epoch >= 1 AND source_owner_epoch <= 9007199254740989 AND acceptance_owner_epoch = source_owner_epoch'
 assert.equal(normalize(e),normalize("(((source_owner_epoch >= 1) AND (source_owner_epoch <= '9007199254740989'::bigint)) AND (acceptance_owner_epoch = source_owner_epoch))"))
 assert.equal(normalize("provided_keys <@ '[\"goal\", \"task_scope\"]'::jsonb"),normalize("provided_keys <@ '[\"goal\",\"task_scope\"]'::jsonb"))
 for(const changed of [e.replace('AND','OR'),e.replace('source_owner_epoch >=','source_owner_epoch::integer >='),e.replace('9007199254740989','9007199254740990'),e+' OR true'])assert.notEqual(normalize(e),normalize(changed))
 assert.notEqual(normalize("pg_catalog.jsonb_typeof(provided_keys)='array'"),normalize("public.jsonb_typeof(provided_keys)='array'"))
 for(const change of [c=>{c.expression=c.expression.replace(' AND ',' OR ')},c=>{c.name=prefix+'unknown_check'},c=>{c.ok=false}])await reject(f=>change(f.rows[0].constraints.find(c=>c.name.endsWith('hashes_ck'))))
})
test('the one family FK pins target and referenced index OIDs and exact four RI mounts',async()=>{
 for(const change of [c=>{c.target='public.agent_descriptive_patch_acceptances'},c=>{c.target_id++},c=>{c.index_id++},c=>{c.columns.reverse()},c=>{c.references.reverse()},c=>{c.ri=false},c=>{c.ok=false}])await reject(f=>change(f.rows[1].constraints.find(c=>c.kind==='f')))
 await reject(f=>{f.state.extraInternal=false})
 const f=fixture();await verifyAgentDescriptivePatchCore(f.db);const q=f.trace.find(q=>q.sql.startsWith('SELECT x.oid')).sql
 for(const part of ['count(*)=4','count(DISTINCT p.proname)=4',"n.nspname='pg_catalog'",'t.tgconstraint=x.oid','t.tgconstrindid=x.conindid',"confupdtype='a'","confdeltype='r'",'RI_FKey_check_ins','RI_FKey_check_upd','RI_FKey_restrict_del','RI_FKey_noaction_upd'])assert.ok(q.includes(part),part)
})
test('extra or duplicate constraints and PG18 per-column NOT NULL drift refuse',async()=>{
 await reject(f=>{f.rows[0].constraints.push({...f.rows[0].constraints[0],id:99999,name:'extra'})});await reject(f=>{f.rows[0].constraints[1].id=f.rows[0].constraints[0].id})
 await reject(f=>{f.rows[0].constraints=f.rows[0].constraints.filter(c=>c.kind!=='n')});await reject(f=>{f.rows[0].constraints.find(c=>c.kind==='n').ok=false});await reject(f=>{const n=f.rows[0].constraints.filter(c=>c.kind==='n');n[0].columns=n[1].columns})
 const f=fixture();f.state.version=170006;for(const t of f.rows)t.constraints=t.constraints.filter(c=>c.kind!=='n');assert.equal(await verifyAgentDescriptivePatchCore(f.db),true)
 await reject(f=>{f.state.version=160999})
})
test('full wrapper actually invokes the frozen059 full chain rather than accepting new-core success',async()=>{
 const f=fixture();assert.equal(await verifyAgentDescriptivePatchCore(f.db),true)
 await assert.rejects(verifyAgentDescriptivePatchCredentials(f.db),refused)
 assert.ok(f.trace.some(q=>q.args[0]==='agent_generated_'&&q.sql.includes('oidvectortypes')))
 const wrapper=readFileSync(new URL('../src/agent-descriptive-patch-audit.ts',import.meta.url),'utf8');assert.match(wrapper,/await verifyAgentGeneratedCredentials\(db\)/);assert.doesNotMatch(wrapper,/verifyAgentGeneratedCore/)
})
test('startup inspector only reads catalogs, rolls back and releases on absence and every failure',async()=>{
 const f=fixture();f.state.objects=[];f.state.types=[];f.state.routines=[];f.state.installed=false;let released=0
 const pool={async connect(){return {...f.db,release(){released++}}}}
 assert.equal(await inspectAgentDescriptivePatchSchema(pool),false);assert.equal(released,1);assert.deepEqual(f.trace.slice(0,2).map(q=>q.sql),['BEGIN READ ONLY','SET LOCAL ROLE agentstudio_api']);assert.equal(f.trace.at(-1).sql,'ROLLBACK')
 const broken=fixture();broken.state.throwAt='pg_class';let failureReleased=0;await assert.rejects(inspectAgentDescriptivePatchSchema({async connect(){return {...broken.db,release(){failureReleased++}}}}),refused);assert.equal(failureReleased,1);assert.equal(broken.trace.at(-1).sql,'ROLLBACK')
 await assert.rejects(inspectAgentDescriptivePatchSchema({async connect(){throw Error('private connection detail')}}),refused)
 const badRollback={async connect(){return {async query(){throw Error('private failure')},release(){released++}}}};await assert.rejects(inspectAgentDescriptivePatchSchema(badRollback),refused);assert.equal(released,2)
})
