// PURE registry-model tests. Only the FUTURE controller assertion is replaced.
// Test permits/doubles prove no driver provenance, locks, approval, SQL or authority.
import test from 'node:test'
import assert from 'node:assert/strict'
import {registerHooks} from 'node:module'
import {readFileSync} from 'node:fs'
import {createHash} from 'node:crypto'
const support='data:text/javascript;base64,'+Buffer.from([
 'const permits=new WeakMap()',
 'export function issue(db,mode){const a=Object.freeze(Object.create(null));permits.set(a,{db,mode,live:true});return a}',
 'export function revoke(a){permits.get(a).live=false}',
 'export function assertWorkerHeartbeatControlDbAccess(db,a,mode){const p=a&&typeof a==="object"?permits.get(a):null;if(!p||!p.live||p.db!==db||p.mode!==mode)throw Error("TEST_ONLY_control_access_refused")}'
].join('\n')).toString('base64')
registerHooks({resolve(s,c,next){
 if(s==='./worker-heartbeat-activation-control.ts'&&c.parentURL?.endsWith('/worker-heartbeat-activation-registry.ts'))return {url:support,shortCircuit:true}
 return next(s,c)
}})
const {issue,revoke}=await import(support)
const {
 inspectWorkerHeartbeatActivationRegistry:inspect,describeWorkerHeartbeatRegistry:describe,
 prepareWorkerHeartbeatRegistryPlan:prepare,describeWorkerHeartbeatRegistryPlan:describePlan,
 readWorkerHeartbeatRegistryPlanMaterial:material,
 applyLockedWorkerHeartbeatRegistryPlan:apply,verifyWorkerHeartbeatRegistryAfter:verify
}=await import('../src/worker-heartbeat-activation-registry.ts')
const kinds=['prepare','model','workflow_safe','workflow_v2','agent_autonomous','knowledge_index','knowledge_query','assessment']
const names=['studio_telemetry_owner','studio_telemetry_reader',...kinds.flatMap(k=>[1,2].map(s=>'studio_telemetry_tx_'+k+'_'+s))]
const gen='11111111-1111-4111-8111-111111111111',stamp='2026-10-28T12:00:00.000Z'
const sha=x=>createHash('sha256').update(x).digest('hex')
const refused=e=>e.message==='worker_heartbeat_registry_refused'&&e.code==='registry_mismatch'&&e.status===503&&e.automatic_retry_authorized===false&&!('cause'in e)
function fixture(active=false){
 const policy={protocol:'worker_heartbeat_activation_policy_v1',
 binding:{installation_id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',system_id:'1234567890123456789',database_oid:40,owner_oid:1,schema_oid:10,
 server_addr:'127.0.0.1',server_port:5432,postmaster_started_us:'1793188800000000',operator_name:'telemetry_operator',role_oids:names.map((_,i)=>100+i)},
 reader:{login:active,verifier_sha256:active?'a'.repeat(64):null},
 kinds:kinds.map((kind,i)=>({kind,instrumented:active&&i===0,enabled:active&&i===0})),
 slots:kinds.flatMap(kind=>[1,2].map(slot_no=>({kind,slot_no,mode:active&&kind==='prepare'&&slot_no===1?'active':'unused',
 generation:active&&kind==='prepare'&&slot_no===1?gen:null,verifier_sha256:active&&kind==='prepare'&&slot_no===1?'b'.repeat(64):null})))}
 const roles=names.map((name,i)=>[String(100+i),name,i===1?active:i===2&&active,false,false,false,false,false,false,
 i===0?-1:i===1?2:1,null,true,0,i===1&&active?'a'.repeat(64):i===2&&active?'b'.repeat(64):null,true])
 const state={mode:'read',at:stamp,kinds:policy.kinds.map((k,i)=>[i+1,k.kind,k.instrumented,k.enabled]),
 slots:policy.slots.map((s,i)=>[s.kind,s.slot_no,String(102+i),names[2+i],s.mode==='active',s.generation,'0',null,null,null,false,true]),
 roles,target:{},registry:{},fault:null,afterQuery:null,pause:null}
 const trace=[]
 const context=()=>({actor:'telemetry_operator',session_login:'telemetry_operator',read_only:state.mode==='read'?'on':'off',
 isolation:state.mode==='read'?'repeatable read':'read committed',search_path:'pg_catalog',no_temp:true})
 const db={async query(sql,args=[]){
 trace.push({sql,args:structuredClone(args)})
 if(state.pause){const pause=state.pause;state.pause=null;await pause}
 if(state.fault&&sql.includes(state.fault))throw Error('PRIVATE SQL SCRAM generation cookie detail')
 let row
 if(sql.startsWith('/* telemetry_activation_registry:target */'))row={
 database:'agent_studio_telemetry',database_oid:'40',owner_oid:'1',schema_oid:'10',...context(),
 authentic_operator:true,owner_no_non_super_members:true,version:180006,encoding:'UTF8',server_addr:sql.includes('host(inet_server_addr()) AS server_addr')?'127.0.0.1':'127.0.0.1/32',server_port:5432,
 postmaster_started_us:'1793188800000000',system_id:'1234567890123456789',recovery:false,roles:state.roles,...state.target}
 else if(sql.startsWith('/* telemetry_activation_registry:registry */'))row={
 protocol:'telemetry_registry_observation_v1',...context(),clock_valid:true,as_of:state.at,kinds:state.kinds,slots:state.slots,...state.registry}
 else if(sql.startsWith('ALTER ROLE ')){
 const m=/^ALTER ROLE "([a-z0-9_]+)" (NOLOGIN PASSWORD NULL|LOGIN PASSWORD '([^']+)')$/.exec(sql)
 assert.ok(m,'only closed role template');const i=names.indexOf(m[1]);assert.ok(i>=1,'owner never written')
 state.roles[i][2]=m[2]!=='NOLOGIN PASSWORD NULL';state.roles[i][13]=m[3]?sha(m[3]):null
 }else if(sql.startsWith('/* telemetry_activation_registry:update_kind */')){
 const [ordinal,kind,instrumented,enabled]=args;assert.equal(state.kinds[ordinal-1][1],kind)
 state.kinds[ordinal-1]=[ordinal,kind,instrumented,enabled];row={ordinal,kind,instrumented,enabled}
 }else if(sql.startsWith('/* telemetry_activation_registry:reset_slot */')){
 const [kind,slot_no,login_oid,login_name,generation]=args,i=state.slots.findIndex(s=>s[0]===kind&&s[1]===slot_no)
 assert.equal(state.slots[i][2],String(login_oid));assert.equal(state.slots[i][3],login_name)
 state.slots[i]=[kind,slot_no,String(login_oid),login_name,true,generation,'0',null,null,null,false,true]
 row={kind,slot_no,login_oid:String(login_oid),login_name,enabled:true,generation,sequence:'0',state:null,reason:null,observed_at:null,draining:false}
 }else if(sql.startsWith('/* telemetry_activation_registry:retire_slot */')){
 const [kind,slot_no,,,generation]=args,i=state.slots.findIndex(s=>s[0]===kind&&s[1]===slot_no)
 assert.equal(state.slots[i][5],generation);state.slots[i][4]=false;row={kind,slot_no,enabled:false,generation}
 }else assert.fail('unexpected SQL; no secret echo')
 state.afterQuery?.(sql)
 return {rows:row?[structuredClone(row)]:[]}
 },release(){assert.fail('registry must not release controller client')}}
 return {policy,state,trace,db,access:{read:issue(db,'read'),write:issue(db,'write')}}
}
const inspectF=f=>inspect(f.db,f.access.read,f.policy)
function draft(f){return {protocol:'worker_heartbeat_activation_draft_v1',reader:'keep',kinds:structuredClone(f.policy.kinds),
 slots:f.policy.slots.map(s=>({kind:s.kind,slot_no:s.slot_no,action:'keep'}))}}
function activate(f){const d=draft(f);d.reader='activate';d.kinds[0]={kind:'prepare',instrumented:true,enabled:true};d.slots[0].action='activate';return d}
function report(f,seq,state='ready',reason='startup_checks_complete',at=stamp){
 Object.assign(f.state.slots[0],{6:String(seq),7:state,8:reason,9:at,10:state==='draining'})
}
async function rejectPolicy(change){const f=fixture();change(f.policy);await assert.rejects(inspectF(f),refused);assert.equal(f.trace.length,0)}
async function rejectState(change,active=false){const f=fixture(active);change(f.state);await assert.rejects(inspectF(f),refused)}
test('dormant and active observations are private; old reader parser remains strict',async()=>{
 const f=fixture(),o=await inspectF(f);assert.equal(Object.getPrototypeOf(o),null);assert.ok(Object.isFrozen(o));assert.deepEqual(Reflect.ownKeys(o),[])
 assert.equal(describe(o).catalog_expectations,null);assert.equal(f.trace.length,2)
 const a=fixture(true),d=describe(await inspectF(a));assert.equal(d.catalog_expectations.roles.length,18)
 assert.equal(d.catalog_expectations.roles[0].login,false);assert.equal(d.catalog_expectations.roles[1].login,true)
 assert.ok(Object.isFrozen(d.catalog_expectations.roles[0]));assert.deepEqual(Object.keys(d),['policy_sha256','private_material_sha256','checked_at_utc','catalog_expectations'])
 assert.doesNotMatch(JSON.stringify(d),/11111111|verifier|password|sequence|current_verified/)
})
test('forged, cloned, wrong-mode, wrong-client and revoked permits fail before SQL',async()=>{
 const f=fixture();for(const a of [{},structuredClone(f.access.read),f.access.write,fixture().access.read])await assert.rejects(inspect(f.db,a,f.policy),refused)
 revoke(f.access.read);await assert.rejects(inspectF(f),refused);assert.equal(f.trace.length,0)
})
test('closed policy rejects shape/getter/array/target/OID inputs before SQL',async()=>{
 let calls=0
 for(const change of [
 p=>{p.extra=true},p=>{p.binding.role_oids[1]=p.binding.role_oids[0]},p=>{p.binding.owner_oid=p.binding.role_oids[0]},
 p=>{p.binding.system_id='01'},p=>{p.binding.server_addr='localhost'},p=>{p.binding.operator_name='studio_telemetry_reader'},
 p=>{p.slots.pop()},p=>{p.kinds.reverse()},p=>{p.slots[0].generation=gen},p=>{p.reader.login=true},p=>{p.slots[0].mode='active'},
 p=>Object.defineProperty(p,'reader',{enumerable:true,get(){calls++;return {}}}),
 p=>Object.defineProperty(p.slots,'0',{enumerable:true,get(){calls++;return {}}}),p=>{p.binding.role_oids[0]=4294967296},
 p=>{for(let i=0;i<2;i++){p.slots[i].mode='retired';p.slots[i].generation=gen}}
 ])await rejectPolicy(change);assert.equal(calls,0)
})
test('target and all 18 role attributes/material/OIDs are exact',async()=>{
 for(const change of [
 s=>{s.target.database='agent_studio'},s=>{s.target.database_oid='41'},s=>{s.target.owner_oid='2'},s=>{s.target.schema_oid='11'},
 s=>{s.target.actor='other'},s=>{s.target.session_login='other'},s=>{s.target.authentic_operator=false},s=>{s.target.owner_no_non_super_members=false},
 s=>{s.target.version=170000},s=>{s.target.encoding='LATIN1'},s=>{s.target.recovery=true},s=>{s.target.server_addr='127.0.0.2'},
 s=>{s.target.server_port=5433},s=>{s.target.system_id='other'},s=>{s.target.postmaster_started_us='1793188800000001'},
 s=>{s.target.read_only='off'},s=>{s.target.isolation='read committed'},s=>{s.target.search_path='public'},s=>{s.target.no_temp=false},
 s=>{s.roles.pop()},s=>{s.roles.push(structuredClone(s.roles[0]))},s=>{s.roles[0][2]=true},s=>{s.roles[1][0]='999'},
 ...[3,4,5,6,7,8].map(i=>s=>{s.roles[1][i]=true}),s=>{s.roles[1][9]=1},s=>{s.roles[1][10]=[]},
 s=>{s.roles[1][11]=false},s=>{s.roles[1][12]=1},s=>{s.roles[1][13]='a'.repeat(64)},s=>{s.roles[1][14]=false}
 ])await rejectState(change)
})
test('registry rejects missing/duplicate/hidden rows and invalid inactive observations',async()=>{
 for(const change of [
 s=>{s.kinds.pop()},s=>{s.kinds[0][0]=2},s=>{s.kinds[0][2]=true},s=>{s.slots.pop()},s=>{s.slots[1]=structuredClone(s.slots[0])},
 s=>{s.slots[0][2]='999'},s=>{s.slots[0][3]='wrong'},s=>{s.slots[0][4]=true},s=>{s.slots[0][5]=gen},
 s=>{s.slots[0][6]='01'},s=>{s.slots[0][6]='9007199254740992'},s=>{s.slots[0][7]='ready'},s=>{s.slots[0][11]=false},
 s=>{s.registry.clock_valid=false},s=>{s.registry.as_of='0000-01-01T00:00:00.000Z'},s=>{s.registry.as_of='2026-02-30T00:00:00.000Z'},s=>{s.registry.no_temp=false}
 ])await rejectState(change)
 for(const change of [
 s=>{s.slots[0][6]='1'},s=>{s.slots[0][11]=false},
 s=>{Object.assign(s.slots[0],{6:'1',7:'ready',8:'startup_checks_complete',9:'2026-10-28T12:00:00.001Z'})},
 s=>{Object.assign(s.slots[0],{6:'1',7:'unknown',8:'startup_checks_complete',9:stamp})}
 ])await rejectState(change,true)
})
test('legal dynamic progress leaves hashes unchanged and same-sequence replay is exact',async()=>{
 const f=fixture(true);report(f,1);const a=await inspectF(f),d=describe(a)
 report(f,8,'unknown','loop_unavailable');f.state.at='2026-10-28T12:00:00.001Z'
 const b=await inspect(f.db,f.access.read,a);assert.equal(describe(b).policy_sha256,d.policy_sha256);assert.equal(describe(b).private_material_sha256,d.private_material_sha256)
 await inspect(f.db,f.access.read,b);f.state.slots[0][8]='startup_checks_pending';await assert.rejects(inspect(f.db,f.access.read,b),refused)
})
test('sequence/time rollback and draining revival are rejected',async()=>{
 for(const mutate of [f=>report(f,1),f=>{f.state.at='2026-10-28T11:59:59.999Z'},
 f=>report(f,3,'draining','new_claims_closed','2026-10-28T11:59:59.999Z'),f=>report(f,3)]){
 const f=fixture(true);report(f,2,'draining','new_claims_closed');const o=await inspectF(f);mutate(f);await assert.rejects(inspect(f.db,f.access.read,o),refused)}
})

test('opaque observations/plans reject clones, descriptions and JSON',async()=>{
 const f=fixture(),o=await inspectF(f)
 for(const bad of [{},structuredClone(o),describe(o)]){assert.throws(()=>describe(bad),refused);assert.throws(()=>prepare(bad,activate(f)),refused)}
 const p=prepare(o,activate(f))
 for(const bad of [{},structuredClone(p),describePlan(p)])assert.throws(()=>describePlan(bad),refused)
 assert.ok(Object.isFrozen(p));assert.deepEqual(Reflect.ownKeys(p),[])
 assert.deepEqual(Object.keys(describePlan(p)),['plan_sha256','before_sha256','after_sha256'])
})
test('draft rejects caller material, bad transitions and enabled kinds without active slots',async()=>{
 const f=fixture(),o=await inspectF(f)
 for(const change of [d=>{d.generation=gen},d=>{d.slots[0].password='caller'},d=>{d.slots[0].action='rotate'},
 d=>{d.slots[0].action='retire'},d=>{d.reader='rotate'},d=>{d.kinds[0].enabled=false},
 d=>{d.kinds[0].instrumented=false},d=>{d.slots[0].action='keep'},d=>{d.slots.reverse()}]){
 const d=activate(f);change(d);assert.throws(()=>prepare(o,d),refused)}
 const d=activate(f),p=prepare(o,d);d.slots[0].action='retire';d.kinds[0].enabled=false
 const p2=prepare(o,activate(f));assert.notEqual(describePlan(p).after_sha256,describePlan(p2).after_sha256)
})
test('private material requires original write access + private prepared plan and binds hashes',async()=>{
 const f=fixture(),p=prepare(await inspectF(f),activate(f))
 for(const a of [{},f.access.read,fixture().access.write])assert.throws(()=>material(f.db,a,p),refused)
 assert.throws(()=>material(f.db,f.access.write,describePlan(p)),refused)
 const m=material(f.db,f.access.write,p)
 assert.equal(m.credentials.length,2);assert.equal(m.plan_sha256,describePlan(p).plan_sha256)
 assert.ok(Object.isFrozen(m.credentials[0]));assert.match(m.credentials[0].password,/^[a-f0-9]{64}$/)
 assert.ok(!JSON.stringify(describePlan(p)).includes(m.credentials[0].password))
 assert.notEqual(m.after_policy.slots[0].generation,null)
 assert.equal(f.trace.length,2,'material reads no SQL or files')
})
test('apply consumes once, uses bounded SQL, resets only target slot; verify uses fresh state',async()=>{
 const f=fixture(),p=prepare(await inspectF(f),activate(f))
 await assert.rejects(apply(f.db,f.access.read,p),refused)
 const secrets=material(f.db,f.access.write,p)
 f.state.mode='write';await apply(f.db,f.access.write,p)
 const n=f.trace.length;await assert.rejects(apply(f.db,f.access.write,p),refused);assert.equal(f.trace.length,n)
 assert.throws(()=>material(f.db,f.access.write,p),refused)
 assert.equal(f.state.slots[0][4],true);assert.notEqual(f.state.slots[0][5],gen)
 assert.deepEqual(f.state.slots[0].slice(6,11),['0',null,null,null,false]);assert.equal(f.state.roles[0][2],false)
 for(const t of f.trace)assert.doesNotMatch(t.sql,/BEGIN|COMMIT|ROLLBACK|FOR UPDATE|FOR SHARE|GRANT |CREATE |pg_terminate_backend|SET ROLE/)
 f.state.mode='read';const after=await verify(f.db,f.access.read,p);assert.ok(describe(after).catalog_expectations)
 const publicText=JSON.stringify(describe(after))+JSON.stringify(describePlan(p))
 for(const credential of secrets.credentials){
 assert.ok(!publicText.includes(credential.password))
 const t=f.trace.find(t=>t.sql.startsWith('ALTER ROLE "'+credential.role_name+'" LOGIN'))
 const match=/LOGIN PASSWORD '(SCRAM-SHA-256\$4096:([^$]+)\$([^:]+):([^']+))'/.exec(t.sql)
 assert.ok(match);const salt=Buffer.from(match[2],'base64')
 const {pbkdf2Sync,createHmac}=await import('node:crypto')
 const salted=pbkdf2Sync(credential.password,salt,4096,32,'sha256')
 assert.equal(createHash('sha256').update(createHmac('sha256',salted).update('Client Key').digest()).digest('base64'),match[3])
 assert.equal(createHmac('sha256',salted).update('Server Key').digest('base64'),match[4])
 }
 assert.equal(describe(after).policy_sha256.length,64)
})
test('retirement preserves last legal report while rotation resets a fresh generation',async()=>{
 for(const action of ['retire','rotate']){
 const f=fixture(true);report(f,10,'draining','new_claims_closed');const o=await inspectF(f),d=draft(f)
 d.slots[0].action=action;if(action==='retire')d.kinds[0].enabled=false
 const p=prepare(o,d);f.state.mode='write';report(f,11,'draining','new_claims_closed');await apply(f.db,f.access.write,p)
 if(action==='retire'){assert.equal(f.state.slots[0][4],false);assert.equal(f.state.slots[0][5],gen)
 assert.equal(f.state.slots[0][6],'11');assert.equal(f.state.roles[2][2],false);assert.equal(f.state.roles[2][13],null)}
 else{assert.notEqual(f.state.slots[0][5],gen);assert.equal(f.state.slots[0][6],'0')}
 f.state.mode='read';await verify(f.db,f.access.read,p)
 }
})
test('non-reset reports may advance; static mismatch blocks the first write',async()=>{
 const f=fixture(true);report(f,1);const o=await inspectF(f),d=draft(f);d.reader='rotate';const p=prepare(o,d)
 report(f,20);f.state.mode='write';await apply(f.db,f.access.write,p)
 f.state.mode='read';report(f,40);await verify(f.db,f.access.read,p)
 const a=fixture(),ap=prepare(await inspectF(a),activate(a));a.state.roles[0][2]=true;a.state.mode='write'
 await assert.rejects(apply(a.db,a.access.write,ap),refused);assert.equal(a.trace.filter(t=>t.sql.startsWith('ALTER ROLE ')).length,0)
})
test('retired history cannot advance after the locked apply observation',async()=>{
 const f=fixture(true);report(f,10);const d=draft(f);d.slots[0].action='retire';d.kinds[0].enabled=false
 const p=prepare(await inspectF(f),d);report(f,11);f.state.mode='write';await apply(f.db,f.access.write,p)
 f.state.mode='read';await verify(f.db,f.access.read,p);report(f,12)
 await assert.rejects(verify(f.db,f.access.read,p),refused)
})
test('failure stays sanitized, forbids retry, and does not fabricate commit/rollback',async()=>{
 const f=fixture(),p=prepare(await inspectF(f),activate(f));f.state.mode='write';f.state.fault='reset_slot'
 await assert.rejects(apply(f.db,f.access.write,p),refused);const n=f.trace.length;f.state.fault=null
 await assert.rejects(apply(f.db,f.access.write,p),refused);assert.equal(f.trace.length,n)
 f.state.mode='read';await assert.rejects(verify(f.db,f.access.read,p),refused)
})
test('late query results after permit revocation stop before subsequent SQL',async()=>{
 const f=fixture(),p=prepare(await inspectF(f),activate(f));f.state.mode='write';f.state.afterQuery=()=>revoke(f.access.write)
 const n=f.trace.length;await assert.rejects(apply(f.db,f.access.write,p),refused);assert.equal(f.trace.length,n+1)
})
test('concurrent replay cannot release or poison the first apply guard',async()=>{
 const f=fixture(),p=prepare(await inspectF(f),activate(f));f.state.mode='write'
 let release;f.state.pause=new Promise(r=>{release=r});const first=apply(f.db,f.access.write,p)
 await assert.rejects(apply(f.db,f.access.write,p),refused);await assert.rejects(apply(f.db,f.access.write,p),refused)
 release();await first;f.state.mode='read';await verify(f.db,f.access.read,p)
})
test('after verification checks fresh target/material and rejects un-applied plans',async()=>{
 const f=fixture(),p=prepare(await inspectF(f),activate(f));await assert.rejects(verify(f.db,f.access.read,p),refused)
 f.state.mode='write';await apply(f.db,f.access.write,p);f.state.mode='read';f.state.roles[1][13]='c'.repeat(64)
 await assert.rejects(verify(f.db,f.access.read,p),refused);await assert.rejects(verify(f.db,f.access.read,describePlan(p)),refused)
})
test('source retains old pins and constructs no connection/authority/transaction',()=>{
 const source=readFileSync(new URL('../src/worker-heartbeat-activation-registry.ts',import.meta.url),'utf8')
 assert.match(source,/import \{assertWorkerHeartbeatControlDbAccess\} from '\.\/worker-heartbeat-activation-control\.ts'/)
 assert.doesNotMatch(source,/from ['"](?:pg|node:(?:net|tls|http|fs))['"]|new (?:Pool|Client)|\.connect\(|\.release\(|\.query\(['"](?:BEGIN|COMMIT|ROLLBACK)/)
 assert.match(source,/pg_catalog\.pg_roles r JOIN pg_catalog\.pg_authid a ON a\.oid=r\.oid/)
 assert.doesNotMatch(source,/r\.rolpassword|pg_catalog\.pg_authid r/)
 assert.match(source,/SCRAM-SHA-256\[\$\]4096/)
 for(const [path,expected] of [
 ['../src/worker-heartbeat-activated-audit-core.ts','ba670a1722b241781f6cd28b85bbd571ff1919bac47e5f1ebca090ddfcff28b5'],
 ['../../../db/postgres/telemetry/001_worker_heartbeats.sql','5ed1080d9f7b651ea2ae7fceca09db7f61c679f107e196df13ae201a8f99505f']])assert.equal(sha(readFileSync(new URL(path,import.meta.url))),expected)
})


