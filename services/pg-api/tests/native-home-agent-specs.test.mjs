import assert from 'node:assert/strict'
import test from 'node:test'
import {Readable} from 'node:stream'
import fs from 'node:fs'
import {NativeHomeAgentSpecsRepository} from '../src/native-home-agent-specs-repository.ts'
import {createNativeHomeAgentSpecsHttp,originalHomeAgentPrefix} from '../src/native-home-agent-specs-http.ts'
import {prepareNativeHomeAgentSpecs,selectNativeHomeAuthoring} from '../src/native-home-agent-specs-runtime.ts'
import {safeAgentSpec} from '../src/contracts.ts'
import {verifyNativeHomeAuthoringSchema} from '../src/native-home-authoring-audit.ts'

// Pure in-memory protocol/control-flow tests. The harness never parses or
// executes SQL and is not evidence of PostgreSQL/RLS/FK/trigger behavior.
const owner='11111111-1111-4111-8111-111111111111',key='22222222-2222-4222-8222-222222222222'
const identity={issuer:'urn:agentstudio:local:v1',subject:'employee-subject'},origin='https://studio.example.test'
const spec={goal:'目标',task_scope:'范围',deliverables:['成果'],task_plan:['计划'],done_criteria:['完成'],tools:[],knowledge_base_ids:[]}
const authoring={format:'agentstudio.home-authoring.v1',source:'template',template_key:'research',tool_requirements:[' 未连接的研究工具 ','未连接的研究工具','未连接的研究工具']}
const initial={id:key,owner_user_id:owner,name:'原方案',spec:safeAgentSpec(spec),revision:3,created_at:'2026-01-01T00:00:00.000Z',updated_at:'2026-01-01T00:00:00.000Z'}
function harness(existing=true){
  const state={rows:existing?[structuredClone(initial)]:[],metadata:existing?{[key]:structuredClone(authoring)}:{},audits:[],queries:[],calls:[],connects:0,failAudit:false,failMetadata:false,failCommit:false,sourceInstalled:true,hiddenIds:[],sourceError:null}
 const pool={async connect(){state.connects++;let pending
  return {release(){state.queries.push('release')},async query(sql,args=[]){
    state.queries.push(sql);state.calls.push({sql,args})
   if(sql==='BEGIN'){pending=structuredClone({rows:state.rows,metadata:state.metadata,audits:state.audits});return{rows:[]}}
   if(sql==='COMMIT'){if(state.failCommit)throw state.failCommit;Object.assign(state,pending);return{rows:[]}}
   if(sql==='ROLLBACK'){pending=undefined;return{rows:[]}}
   if(sql.startsWith('SET LOCAL ROLE ')||sql.startsWith('SELECT set_config('))return{rows:[]}
   if(sql.includes('agentstudio.identity_user_id('))return{rows:[{id:owner}]}
    if(sql.startsWith("SELECT to_regprocedure('agentstudio.agent_caller_internal_sources()')"))return{rows:[{ok:state.sourceInstalled}]}
    if(sql==='SELECT agentstudio.agent_caller_internal_sources() AS ids'){if(state.sourceError)throw state.sourceError;return{rows:[{ids:state.hiddenIds}]}}
   if(sql.startsWith('SELECT revision FROM agentstudio.agent_specs'))return{rows:pending.rows.filter(r=>r.id===args[0]&&r.owner_user_id===args[1]).map(r=>({revision:r.revision}))}
   if(sql.startsWith('INSERT INTO agentstudio.agent_specs(')){const r={...structuredClone(initial),name:args[1],spec:JSON.parse(args[2]),revision:1};pending.rows.push(r);return{rows:[{id:r.id}]}}
   if(sql.startsWith('UPDATE agentstudio.agent_specs SET ')){const r=pending.rows.find(r=>r.id===args[0]&&r.owner_user_id===args[1]&&r.revision===args[4]);if(!r)return{rows:[]};Object.assign(r,{name:args[2],spec:JSON.parse(args[3]),revision:r.revision+1});return{rows:[{id:r.id}]}}
   if(sql.startsWith('INSERT INTO agentstudio.agent_spec_authoring(')){if(state.failMetadata)throw state.failMetadata;pending.metadata[args[0]]=JSON.parse(args[2]);return{rows:[]}}
   if(sql.startsWith('SELECT s.id,s.owner_user_id,')){const rows=sql.includes('WHERE s.id=')?pending.rows.filter(r=>r.id===args[0]&&r.owner_user_id===args[1]):pending.rows.filter(r=>r.owner_user_id===args[0]).slice(0,args[1]);return{rows:rows.map(r=>({...structuredClone(r),authoring:pending.metadata[r.id]??null}))}}
   if(sql.startsWith('INSERT INTO agentstudio.audit_events(')){if(state.failAudit)throw state.failAudit;pending.audits.push({owner:args[0],action:args[1],id:args[2],data:JSON.parse(args[3])});return{rows:[]}}
   throw Error('Unexpected pure-harness query: '+sql)
  }}
 }}
 return{state,pool,repo:new NativeHomeAgentSpecsRepository(pool)}
}
test('full create keeps original requirements separate from executable tools and returns real row shape',async()=>{
 const h=harness(false),saved=await h.repo.create(identity,{name:'新方案',spec,authoring})
 assert.equal(saved.id,key);assert.equal(saved.owner_user_id,owner);assert.equal(saved.revision,1)
 assert.deepEqual(saved.spec.tools,[]);assert.deepEqual(saved.authoring,authoring)
 assert(!Object.hasOwn(saved.spec,'authoring'));assert.equal(saved.spec.require_approval,true)
 assert.deepEqual(Object.keys(saved).sort(),['id','owner_user_id','name','spec','revision','created_at','updated_at','authoring'].sort())
 assert.equal(h.state.audits.length,1);assert(!JSON.stringify(h.state.audits).includes('未连接'))
 assert.equal(h.state.queries.filter(q=>q==='BEGIN').length,1);assert.equal(h.state.queries.filter(q=>q==='COMMIT').length,1)
})
test('one CAS update atomically changes full spec and authoring on the same client',async()=>{
 const h=harness(),next={...authoring,source:'create',template_key:'',tool_requirements:['其他需求']}
 const saved=await h.repo.update(identity,key,3,{name:'修改',spec:{...spec,deliverables:['新成果']},authoring:next})
 assert.equal(saved.revision,4);assert.deepEqual(saved.spec.deliverables,['新成果']);assert.deepEqual(saved.authoring,next)
 assert.equal(h.state.connects,1);assert.equal(h.state.audits[0].data.spec_revision,4)
})
test('omitted PATCH authoring preserves the existing independent metadata',async()=>{
 const h=harness(),saved=await h.repo.update(identity,key,3,{name:'修改',spec})
 assert.deepEqual(saved.authoring,authoring);assert(!h.state.queries.some(q=>q.startsWith('INSERT INTO agentstudio.agent_spec_authoring(')))
})
test('existing PG record without metadata is returned as null provenance',async()=>{
 const h=harness();h.state.metadata={}
 assert.equal((await h.repo.get(identity,key)).authoring,null)
})
const sourceRead=(h,operation)=>operation==='list'?h.repo.list(identity):operation==='get'?h.repo.get(identity,key):h.repo.update(identity,key,3,{name:'原方案',spec,authoring})
const noTargetAccess=h=>{
  assert(!h.state.queries.some(q=>q.startsWith('SELECT s.id,')||q.startsWith('SELECT revision FROM agentstudio.agent_specs')||q.startsWith('INSERT INTO agentstudio.')||q.startsWith('UPDATE agentstudio.')))
  assert(h.state.queries.includes('ROLLBACK'));assert(!h.state.queries.includes('COMMIT'));assert.equal(h.state.queries.at(-1),'release')
  assert.equal(h.state.rows[0].revision,3);assert.deepEqual(h.state.metadata[key],authoring);assert.deepEqual(h.state.audits,[])
}
for(const operation of ['list','get','update'])test('missing original068 source helper refuses070 '+operation+' before target lookup or mutation',async()=>{
  const h=harness();h.state.sourceInstalled=false
  await assert.rejects(sourceRead(h,operation),e=>e.status===503&&e.code==='original_home_source_unavailable');noTargetAccess(h)
})
test('unknown source installation state or malformed helper rows refuse every070 read/update',async()=>{
  for(const operation of ['list','get','update'])for(const invalid of [null,{},['not-a-uuid']]){
    const h=harness();if(invalid===null)h.state.sourceInstalled=null;else h.state.hiddenIds=invalid
    await assert.rejects(sourceRead(h,operation),e=>e.status===503&&e.code==='original_home_source_unavailable');noTargetAccess(h)
  }
})
test('source helper database errors propagate without a fallback empty set or target access',async()=>{
  for(const operation of ['list','get','update']){const h=harness(),sentinel=Error('source catalog failure');h.state.sourceError=sentinel;await assert.rejects(sourceRead(h,operation),e=>e===sentinel);noTargetAccess(h)}
})
for(const operation of ['get','update'])test('an installed hidden source remains404 in070 '+operation+' before target access',async()=>{
  const h=harness();h.state.hiddenIds=[key]
  await assert.rejects(sourceRead(h,operation),e=>e.status===404&&e.code==='spec_not_found');noTargetAccess(h)
})
test('070 list binds the actual installed hidden IDs to its existing SQL exclusion',async()=>{
  const h=harness();h.state.hiddenIds=[key];await h.repo.list(identity)
  const call=h.state.calls.find(c=>c.sql.startsWith('SELECT s.id,'));assert(call.sql.includes('NOT(s.id=ANY($3::uuid[]))'));assert.deepEqual(call.args[2],[key])
})
test('stale revision rolls back without spec/metadata/audit writes',async()=>{
 const h=harness();await assert.rejects(h.repo.update(identity,key,2,{name:'修改',spec,authoring}),e=>e.code==='revision_conflict')
 assert.equal(h.state.rows[0].revision,3);assert.equal(h.state.audits.length,0)
 assert(!h.state.queries.some(q=>q.startsWith('UPDATE agentstudio.agent_specs ')));assert(h.state.queries.includes('ROLLBACK'))
})
test('an account-switch precondition is checked against SQL Actor before any create or update',async()=>{
 for(const operation of ['create','update']){
  const h=harness(operation==='update')
  const action=operation==='create'?()=>h.repo.create(identity,{name:'员工A草稿',spec,authoring},key):()=>h.repo.update(identity,key,3,{name:'员工A草稿',spec,authoring},key)
  await assert.rejects(action(),e=>e.status===409&&e.code==='employee_session_changed')
  assert(!h.state.queries.some(q=>q.startsWith('INSERT INTO agentstudio.')||q.startsWith('UPDATE agentstudio.')))
  assert.equal(h.state.audits.length,0);assert(h.state.queries.includes('ROLLBACK'))
 }
})
for(const failure of ['failMetadata','failAudit'])test(failure+' propagates the same error and rolls back the whole control-flow unit',async()=>{
 const h=harness(),sentinel=Error(failure);h.state[failure]=sentinel
 await assert.rejects(h.repo.update(identity,key,3,{name:'修改',spec,authoring}),e=>e===sentinel)
 assert.equal(h.state.rows[0].revision,3);assert.deepEqual(h.state.metadata[key],authoring);assert.equal(h.state.audits.length,0)
 assert(!h.state.queries.includes('COMMIT'));assert(h.state.queries.includes('ROLLBACK'));assert.equal(h.state.queries.at(-1),'release')
})
test('commit error never starts another transaction or automatically repeats creation',async()=>{
 const h=harness(false),sentinel=Error('unknown_commit_ack');h.state.failCommit=sentinel
 await assert.rejects(h.repo.create(identity,{name:'修改',spec,authoring}),e=>e===sentinel)
 assert.equal(h.state.connects,1);assert.equal(h.state.queries.filter(q=>q.startsWith('INSERT INTO agentstudio.agent_specs(')).length,1)
})
test('non-Native identity is rejected before opening a pool client',async()=>{
 const h=harness();assert.throws(()=>h.repo.list({issuer:'forged',subject:'x'}),e=>e.status===403);assert.equal(h.state.connects,0)
})
test('frozen execution validator still rejects metadata and free-form executable names',()=>{
 assert.throws(()=>safeAgentSpec({...spec,authoring}),e=>e.code==='unsafe_agent_spec_field')
 assert.throws(()=>safeAgentSpec({...spec,tools:['未连接的研究工具']}),e=>e.code==='unknown_tool')
})
function request(method,path,payload,extra={}){
 const bytes=payload===undefined?'':JSON.stringify(payload),req=Readable.from(bytes?[Buffer.from(bytes)]:[])
 Object.assign(req,{method,url:path,headers:{origin,'sec-fetch-site':'same-origin','x-agentstudio-request':'1','x-agentstudio-expected-employee':owner,'content-type':'application/json',...(bytes?{'content-length':String(Buffer.byteLength(bytes))}:{}),...extra}})
 return req
}
function response(){return{status:0,headers:null,bytes:'',writeHead(status,headers){this.status=status;this.headers=headers},end(value){this.bytes=value},json(){return JSON.parse(this.bytes)}}}
function httpHarness(allowWrites=true){let calls=0;const repository={list:async()=>{calls++;return[]},get:async()=>{calls++;return initial},create:async()=>{calls++;return initial},update:async()=>{calls++;return initial}};return{repository,get calls(){return calls},handler:createNativeHomeAgentSpecsHttp({repository,authenticateRequest:async()=>identity,allowedOrigin:origin,allowWrites})}}
test('owner injection, missing CAS and DELETE never reach repository mutation',async()=>{
 const h=httpHarness()
 for(const [method,payload] of [['POST',{name:'x',spec,authoring,owner_user_id:owner}],['PATCH',{name:'x',spec,authoring}],['DELETE',undefined]]){
  const res=response();await h.handler(request(method,originalHomeAgentPrefix+(method==='POST'?'':'/'+key),payload),res);assert([400,405].includes(res.status))
 }
 assert.equal(h.calls,0)
})
test('write-disabled Native facade keeps GET but refuses POST, without mutating',async()=>{
 const h=httpHarness(false),a=response(),b=response()
 await h.handler(request('GET',originalHomeAgentPrefix+'?limit=50'),a);await h.handler(request('POST',originalHomeAgentPrefix,{name:'x',spec,authoring}),b)
 assert.equal(a.status,200);assert.equal(b.status,405);assert.equal(h.calls,1)
})
test('missing or malformed account preconditions cannot reach an authenticated HTTP mutation',async()=>{
 const h=httpHarness()
 for(const expected of [undefined,['11111111-1111-4111-8111-111111111111'],'unverified-browser-name']){
  const res=response();await h.handler(request('POST',originalHomeAgentPrefix,{name:'x',spec,authoring},{'x-agentstudio-expected-employee':expected}),res)
  assert.equal(res.status,400);assert.deepEqual(res.json(),{error:'invalid_original_ui_employee_precondition'})
 }
 assert.equal(h.calls,0)
})
test('cross-origin and duplicate/unknown query keys are rejected before data access',async()=>{
 const h=httpHarness()
 for(const req of [request('POST',originalHomeAgentPrefix,{name:'x',spec,authoring},{origin:'https://elsewhere.test'}),request('GET',originalHomeAgentPrefix+'?limit=1&limit=2'),request('GET',originalHomeAgentPrefix+'?owner='+owner)]){
  const res=response();await h.handler(req,res);assert([400,403].includes(res.status))
 }
 assert.equal(h.calls,0)
})
test('unexpected internal error never reflects a raw message or stack',async()=>{
 const h=httpHarness();h.repository.list=async()=>{throw Error('PRIVATE SQL SECRET PATH')}
 const res=response();await h.handler(request('GET',originalHomeAgentPrefix),res)
 assert.equal(res.status,503);assert.deepEqual(res.json(),{error:'original_home_request_unavailable'});assert(!res.bytes.includes('PRIVATE'))
})
test('oversized list is refused without clipping fields or claiming a partial result',async()=>{
 const h=httpHarness();h.repository.list=async()=>[{...initial,spec:{goal:'x'.repeat(1048577)}}]
 const res=response();await h.handler(request('GET',originalHomeAgentPrefix),res)
 assert.equal(res.status,503);assert.deepEqual(res.json(),{error:'original_home_response_too_large'})
})
test('feature defaults off after auditing actual absence; explicit reads retain an independent write gate',async()=>{
 let connects=0
 const pool={connect:async()=>{connects++;return{query:async()=>({rows:[]}),release(){}}}}
 assert.equal(await prepareNativeHomeAgentSpecs({pool,env:{},listen:true,allowedOrigin:origin,configurationWrites:false,allowNativeLocalAgentSpecs:false,authenticateRequest:async()=>identity}),null)
 assert.equal(connects,1)
 assert.deepEqual(selectNativeHomeAuthoring({AGENT_STUDIO_PG18_ORIGINAL_HOME_ENABLED:'true'},true,origin,false),{available:true,allowWrites:false})
 for(const [flag,listen,site] of [['false',true,origin],['true',false,origin],['true',true,'http://localhost']])assert.throws(()=>selectNativeHomeAuthoring({AGENT_STUDIO_PG18_ORIGINAL_HOME_ENABLED:flag},listen,site,true))
})

// These are deliberately non-authoritative catalog-shaped DATA fixtures.
// They test rejection/prosrc binding, not real PostgreSQL privileges or RLS.
function auditData(){
 const sql=fs.readFileSync(new URL('../../../db/postgres/migrations/pg_v9_070_home_authoring.sql',import.meta.url),'utf8')
 const bodies=[...sql.matchAll(/CREATE FUNCTION agentstudio\.(\w+)\([^;]+?AS \$fn\$([\s\S]*?)\$fn\$;/g)].map(m=>m[2])
 const names=['agent_spec_id','owner_user_id','authoring','created_at','updated_at']
 const constraints=[
  {name:'agent_spec_authoring_pkey',type:'p',keys:[1],no_inherit:true,definition:'PRIMARY KEY (agent_spec_id)'},
  {name:'agent_spec_authoring_owner_fk',type:'f',keys:[1,2],no_inherit:true,definition:'FOREIGN KEY (agent_spec_id, owner_user_id) REFERENCES agentstudio.agent_specs(id, owner_user_id) ON UPDATE RESTRICT ON DELETE RESTRICT'},
  {name:'agent_spec_authoring_valid_ck',type:'c',keys:[3],no_inherit:false,definition:'CHECK (agentstudio.home_authoring_valid(authoring))'},
  ...names.map((name,i)=>({name:'agent_spec_authoring_'+name+'_not_null',type:'n',keys:[i+1],no_inherit:false,definition:'NOT NULL '+name})),
 ].map(value=>({...value,valid:true,enforced:true,deferrable:false,deferred:false,is_local:true,inherited:0,root:true,ordinary:true}))
 return{state:{ok:true,api_oid:123,no_grant_option:true},columns:names.map((name,i)=>({name,type:i>=3?'timestamp with time zone':i===2?'jsonb':'uuid',notnull:true,default_expr:i>=3?'clock_timestamp()':null,read:true,insert:i<=2,update:['authoring','updated_at'].includes(name),reference:false,no_grant_option:true})),policies:[{name:'agent_spec_authoring_owner',command:'*',permissive:true,roles:[123],using_expr:'(owner_user_id = agentstudio.actor_id())',check_expr:'(owner_user_id = agentstudio.actor_id())'}],constraints,functions:bodies.map((source,i)=>({ok:true,no_grant_option:true,language:i===0?'sql':'plpgsql',returns:i===0?'integer':'boolean',source}))}
}
async function inspectData(data){let fn=0;return verifyNativeHomeAuthoringSchema({async query(sql){
 if(sql.includes('AS api_oid'))return{rows:[data.state]}
 if(sql.startsWith('SELECT a.attname'))return{rows:data.columns}
 if(sql.startsWith('SELECT polname'))return{rows:data.policies}
 if(sql.startsWith('SELECT conname'))return{rows:data.constraints}
 if(sql.includes('AS language'))return{rows:[data.functions[fn++]]}
 if(sql.startsWith('SELECT count(*)=2'))return{rows:[{ok:true}]}
 throw Error('Unexpected pure catalog fixture query')
}})}
test('optional070 audit binds its two independently pinned helper bodies',async()=>{
 await inspectData(auditData())
 const changed=auditData();changed.functions[1].source+='\n-- changed'
 await assert.rejects(inspectData(changed),/unsafe_original_home_authoring_schema/)
})
test('optional070 audit rejects wrong RLS policy instead of trusting a caller flag',async()=>{
 const changed=auditData();changed.policies[0].using_expr='true'
 await assert.rejects(inspectData(changed),/unsafe_original_home_authoring_schema/)
})
test('optional070 audit rejects API identity-column UPDATE grants',async()=>{
 const changed=auditData();changed.columns[1].update=true
 await assert.rejects(inspectData(changed),/unsafe_original_home_authoring_schema/)
})
test('optional070 audit rejects CASCADE or deferred owner-reference changes',async()=>{
 for(const alter of [d=>d.constraints[1].definition=d.constraints[1].definition.replace('ON DELETE RESTRICT','ON DELETE CASCADE'),d=>d.constraints[1].deferrable=true]){
  const changed=auditData();alter(changed);await assert.rejects(inspectData(changed),/unsafe_original_home_authoring_schema/)
 }
})
