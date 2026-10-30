import test from 'node:test'
import assert from 'node:assert/strict'
import {Readable} from 'node:stream'
import {parseOriginalAgentCatalogQuery,originalAgentCatalogSorts} from '../../../shared/original-agent-catalog.ts'
import {safeAgentSpec} from '../src/contracts.ts'
import {NativeAgentCatalogRepository} from '../src/native-agent-catalog-repository.ts'
import {createNativeAgentCatalogHttp,originalAgentCatalogPrefix} from '../src/native-agent-catalog-http.ts'

// These are query-protocol/control-flow DATA fixtures, not a SQL interpreter.
// No PostgreSQL, RLS/FK, Cookie, provider or concurrency proof is produced.
const owner='11111111-1111-4111-8111-111111111111',key='22222222-2222-4222-8222-222222222222',other='33333333-3333-4333-8333-333333333333'
const identity={issuer:'urn:agentstudio:local:v1',subject:'verified-identity-stub'},origin='https://studio.example.test'
const spec=safeAgentSpec({goal:'literal goal',task_scope:'scope',deliverables:['output'],task_plan:['step'],done_criteria:['done'],tools:[],knowledge_base_ids:[]})
const authoring={format:'agentstudio.home-authoring.v1',source:'template',template_key:'research',tool_requirements:['pending requirement']}
const record=()=>({id:key,owner_user_id:owner,name:'name',spec:structuredClone(spec),revision:'7',created_at:'2026-10-30T00:00:00Z',updated_at:'2026-10-30T01:00:00Z',authoring:structuredClone(authoring),favorite:false})
const code=expected=>error=>error?.code===expected
function fixture(){
 const state={actor:owner,hiddenFunction:true,queries:[],connects:0,releases:[],total:'1',pageRows:[record()],master:true,revision:'7',favorite:undefined,audits:[],hidden:[],failAudit:null,failCommit:null,failCount:null,failRollback:false,committed:0}
 const pool={async connect(){state.connects++;let pending
  return{release(discard){state.releases.push(discard??false)},async query(sql,args=[]){
   state.queries.push({sql,args:structuredClone(args)})
   if(sql==='BEGIN'||sql==='BEGIN ISOLATION LEVEL REPEATABLE READ'){pending={favorite:state.favorite,audits:[...state.audits]};return{rows:[]}}
   if(sql==='COMMIT'){if(state.failCommit)throw state.failCommit;state.favorite=pending.favorite;state.audits=pending.audits;state.committed++;return{rows:[]}}
   if(sql==='ROLLBACK'){if(state.failRollback)throw Error('rollback failed');pending=undefined;return{rows:[]}}
   if(sql.startsWith('SET LOCAL ROLE ')||sql.startsWith('SELECT set_config('))return{rows:[]}
   if(sql.includes('agentstudio.identity_user_id('))return{rows:[{id:state.actor}]}
   if(sql.startsWith("SELECT to_regprocedure('agentstudio.agent_caller_internal_sources()')"))return{rows:[{ok:state.hiddenFunction}]}
   if(sql==='SELECT agentstudio.agent_caller_internal_sources() AS ids')return{rows:[{ids:state.hidden}]}
   if(sql.startsWith('SELECT count(*)::text AS total')){if(state.failCount)throw state.failCount;return{rows:[{total:state.total}]}}
   if(sql.startsWith('SELECT s.id,s.owner_user_id'))return{rows:structuredClone(state.pageRows)}
   if(sql.startsWith('SELECT revision FROM agentstudio.agent_specs'))return{rows:state.master?[{revision:state.revision}]:[]}
   if(sql.startsWith('SELECT favorite FROM agentstudio.agent_spec_favorites'))return{rows:pending.favorite===undefined?[]:[{favorite:pending.favorite}]}
   if(sql.startsWith('INSERT INTO agentstudio.agent_spec_favorites(')){pending.favorite=args[2];return{rows:[{agent_spec_id:args[0],owner_user_id:args[1],favorite:args[2]}]}}
   if(sql.startsWith('INSERT INTO agentstudio.audit_events(')){if(state.failAudit)throw state.failAudit;pending.audits.push(JSON.parse(args[2]));return{rows:[]}}
   throw Error('Unexpected pure query fixture: '+sql)
  }}
 }}
 return{state,pool,repo:new NativeAgentCatalogRepository(pool)}
}
test('catalog query defaults to the original18-row page and exact supported sorts',()=>{
 assert.deepEqual(parseOriginalAgentCatalogQuery({}),{page:1,perPage:18,q:'',source:'all',favorite:false,sort:'updated_desc'})
 for(const sort of originalAgentCatalogSorts)assert.equal(parseOriginalAgentCatalogQuery({sort}).sort,sort)
 assert.equal(parseOriginalAgentCatalogQuery({q:'  字面%_  ',favorite:'1',source:'template'}).q,'字面%_')
})
test('query rejects injection, duplicate-shape types and out-of-contract bounds without truncation',()=>{
 for(const input of[{owner_user_id:owner},{page:'0'},{page:'01'},{page:'1000001'},{perPage:'51'},{perPage:'1.5'},{q:'x'.repeat(101)},{q:'a\u0000b'},{source:'unknown'},{favorite:'0'},{favorite:''},{sort:'name_asc;DROP TABLE x'},[]])assert.throws(()=>parseOriginalAgentCatalogQuery(input))
 let calls=0;const raw={};Object.defineProperty(raw,'q',{enumerable:true,get(){calls++;return'bad'}});assert.throws(()=>parseOriginalAgentCatalogQuery(raw));assert.equal(calls,0)
})
test('page five beyond50 uses SQL count and offset72 in one existing Actor control-flow unit',async()=>{
 const f=fixture();f.state.total='73';const result=await f.repo.list(identity,parseOriginalAgentCatalogQuery({page:'5'}))
 assert.equal(result.totalItems,73);assert.equal(result.totalPages,5);assert.equal(result.page,5);assert.equal(result.perPage,18);assert.equal(result.items.length,1)
 assert.equal(f.state.connects,1);assert.equal(f.state.queries[0].sql,'BEGIN ISOLATION LEVEL REPEATABLE READ');assert.equal(f.state.queries.at(-1).sql,'COMMIT')
 const count=f.state.queries.find(q=>q.sql.startsWith('SELECT count(*)')),page=f.state.queries.find(q=>q.sql.startsWith('SELECT s.id,'))
 assert.deepEqual(page.args.slice(0,5),count.args);assert.deepEqual(page.args.slice(5),[18,72]);assert(page.sql.includes('LIMIT $6::int OFFSET $7::bigint'))
 assert(f.state.queries.findIndex(q=>q.sql.includes('identity_user_id'))<f.state.queries.indexOf(count));assert.deepEqual(f.state.releases,[false])
})
test('empty and out-of-range pages retain accurate totals without invented rows',async()=>{
 const f=fixture();f.state.total='0';f.state.pageRows=[];assert.deepEqual(await f.repo.list(identity,parseOriginalAgentCatalogQuery({})),{items:[],totalItems:0,totalPages:0,page:1,perPage:18})
 f.state.total='20';const result=await f.repo.list(identity,parseOriginalAgentCatalogQuery({page:'3'}));assert.equal(result.totalItems,20);assert.equal(result.totalPages,2);assert.deepEqual(result.items,[])
})
test('literal search/source/favorite and caller exclusions remain bound values, not SQL fragments',async()=>{
 const f=fixture();f.state.hidden=[other];const q="x%'_ OR true--";await f.repo.list(identity,parseOriginalAgentCatalogQuery({q,source:'create',favorite:'1',sort:'favorite_desc'}))
 const queries=f.state.queries.filter(v=>v.sql.startsWith('SELECT count(*)')||v.sql.startsWith('SELECT s.id,'))
 for(const query of queries){assert.deepEqual(query.args.slice(0,5),[owner,q,'create',true,[other]]);assert(!query.sql.includes(q));assert(query.sql.includes('strpos(lower('));assert(query.sql.includes("a.authoring->>'source'=$3::text"));assert(query.sql.includes('NOT(s.id=ANY($5::uuid[]))'))}
 assert(queries[1].sql.includes('COALESCE(f.favorite,false) DESC,s.updated_at DESC,s.id ASC'))
})
test('a missing original caller-source helper refuses instead of exposing internal Agents',async()=>{
 const f=fixture();f.state.hiddenFunction=false;await assert.rejects(f.repo.list(identity,parseOriginalAgentCatalogQuery({})),code('original_agent_catalog_unavailable'));assert(!f.state.queries.some(q=>q.sql.startsWith('SELECT count(*)')))
})
test('all five sort choices use fixed source-defined SQL and stable id ordering',async()=>{
 for(const sort of originalAgentCatalogSorts){const f=fixture();await f.repo.list(identity,parseOriginalAgentCatalogQuery({sort}));const sql=f.state.queries.find(v=>v.sql.startsWith('SELECT s.id,')).sql;assert(sql.includes('s.id ASC'));assert(!sql.includes('undefined'))}
})
test('legacy null provenance remains null and every row includes the real revision/favorite',async()=>{
 const f=fixture();f.state.pageRows[0].authoring=null;f.state.pageRows[0].favorite=true;const row=(await f.repo.list(identity,parseOriginalAgentCatalogQuery({}))).items[0]
 assert.equal(row.authoring,null);assert.equal(row.favorite,true);assert.equal(row.revision,7);assert.equal(row.owner_user_id,owner);assert.equal(row.spec.require_approval,true)
})
test('cross-owner, secret-bearing or inconsistent persisted rows cannot become catalog output',async()=>{
 for(const mutate of[r=>r.owner_user_id=other,r=>r.spec.api_key='PRIVATE',r=>r.authoring={...authoring,token:'PRIVATE'},r=>r.revision='9007199254740992',r=>r.favorite='true']){const f=fixture();mutate(f.state.pageRows[0]);await assert.rejects(f.repo.list(identity,parseOriginalAgentCatalogQuery({})),code('original_agent_catalog_unavailable'));assert.equal(f.state.committed,0)}
 const f=fixture();f.state.total='2';await assert.rejects(f.repo.list(identity,parseOriginalAgentCatalogQuery({})),code('original_agent_catalog_unavailable'))
})
test('favorite is absolute, verifies locked real spec revision and never changes it',async()=>{
 const f=fixture();const a=await f.repo.favorite(identity,key,true,7,owner),b=await f.repo.favorite(identity,key,true,7,owner),c=await f.repo.favorite(identity,key,false,7,owner)
 assert.deepEqual(a,{agent_spec_id:key,favorite:true,revision:7});assert.deepEqual(b,a);assert.deepEqual(c,{agent_spec_id:key,favorite:false,revision:7});assert.equal(f.state.revision,'7');assert.equal(f.state.favorite,false)
 assert(!f.state.queries.some(q=>/^UPDATE agentstudio\.agent_specs|^DELETE /i.test(q.sql)))
 assert(f.state.queries.some(q=>q.sql.includes('WHERE id=$1::uuid AND owner_user_id=$2::uuid FOR UPDATE')))
 assert.deepEqual(f.state.audits.at(-1),{format:'agentstudio.agent-catalog-favorite.v1',spec_revision:7,previous_favorite:true,favorite:false})
 assert(!JSON.stringify(f.state.audits).includes('literal goal'))
})
test('stale revision, foreign/missing master and hidden caller source refuse before favorite mutation',async()=>{
 for(const scenario of['stale','missing','hidden']){const f=fixture();if(scenario==='stale')f.state.revision='8';if(scenario==='missing')f.state.master=false;if(scenario==='hidden')f.state.hidden=[key]
  await assert.rejects(f.repo.favorite(identity,key,true,7,owner),code(scenario==='stale'?'revision_conflict':'spec_not_found'));assert(!f.state.queries.some(q=>q.sql.startsWith('INSERT INTO agentstudio.agent_spec_favorites')));assert.equal(f.state.audits.length,0);assert(f.state.queries.some(q=>q.sql==='ROLLBACK'))}
})
test('audit failure rolls back the favorite and preserves the same error',async()=>{
 const f=fixture(),sentinel=Error('audit failed');f.state.failAudit=sentinel;await assert.rejects(f.repo.favorite(identity,key,true,7,owner),e=>e===sentinel);assert.equal(f.state.favorite,undefined);assert.equal(f.state.committed,0);assert.deepEqual(f.state.releases,[false])
})
test('unknown commit acknowledgement never retries a favorite transaction',async()=>{
 const f=fixture(),sentinel=Error('unknown commit');f.state.failCommit=sentinel;await assert.rejects(f.repo.favorite(identity,key,true,7,owner),e=>e===sentinel);assert.equal(f.state.connects,1);assert.equal(f.state.queries.filter(q=>q.sql.startsWith('INSERT INTO agentstudio.agent_spec_favorites')).length,1)
})
test('snapshot query failure preserves the error and requests discard after failed rollback',async()=>{
 const f=fixture(),sentinel=Error('count unavailable');f.state.failCount=sentinel;f.state.failRollback=true;await assert.rejects(f.repo.list(identity,parseOriginalAgentCatalogQuery({})),e=>e===sentinel);assert.deepEqual(f.state.releases,[true])
})
test('invalid favorite and non-Native identity reject before pool admission',()=>{
 const f=fixture();for(const [id,favorite,revision] of[['PB-id',true,1],[key,'true',1],[key,true,0],[key,true,1.5]])assert.throws(()=>f.repo.favorite(identity,id,favorite,revision,owner))
 assert.throws(()=>f.repo.list({issuer:'foreign',subject:'x'},parseOriginalAgentCatalogQuery({})));assert.equal(f.state.connects,0)
})
test('expected employee is checked against the real Actor mapping before any target lookup or write',async()=>{
 const f=fixture();f.state.actor=other
 await assert.rejects(f.repo.favorite(identity,key,true,7,owner),code('employee_session_changed'))
 assert(!f.state.queries.some(q=>q.sql.includes('agent_caller_internal_sources')||q.sql.startsWith('SELECT revision')||q.sql.startsWith('INSERT INTO ')));assert.equal(f.state.committed,0)
 const a=fixture();assert.throws(()=>a.repo.favorite(identity,key,true,7,undefined),code('expected_employee_required'));assert.equal(a.state.connects,0)
})
function request(method,url,payload,headers={}){const bytes=payload===undefined?null:Buffer.from(JSON.stringify(payload));return Object.assign(Readable.from(bytes?[bytes]:[]),{method,url,headers:{origin,'x-agentstudio-expected-employee':owner,'sec-fetch-site':'same-origin','x-agentstudio-request':'1','content-type':'application/json',...(bytes?{'content-length':String(bytes.length)}:{}),...headers}})}
function response(){return{status:0,body:'',headers:{},writeHead(status,headers){this.status=status;this.headers=headers},end(bytes){this.body=bytes},json(){return JSON.parse(this.body)}}}
function httpFixture(writes=true){const calls=[],repository={async list(identity,input){calls.push({op:'list',identity,input});return{items:[],totalItems:0,page:input.page,totalPages:0,perPage:input.perPage}},async favorite(identity,id,favorite,revision,expectedEmployee){calls.push({op:'favorite',identity,id,favorite,revision,expectedEmployee});return{agent_spec_id:id,favorite,revision}}};return{calls,repository,handler:createNativeAgentCatalogHttp({repository,authenticateRequest:async()=>identity,allowedOrigin:origin,allowWrites:writes})}}
test('HTTP uses fixed DTOs and verified identity; GET detail remains outside catalog',async()=>{
 const f=httpFixture(),a=response(),b=response(),c=response();await f.handler(request('GET',originalAgentCatalogPrefix+'?page=2&perPage=18&sort=name_asc'),a);await f.handler(request('POST',originalAgentCatalogPrefix+'/'+key+'/favorite',{favorite:true,expected_revision:7}),b);await f.handler(request('GET',originalAgentCatalogPrefix+'/'+key),c)
 assert.deepEqual(a.json(),{items:[],totalItems:0,page:2,totalPages:0,perPage:18});assert.deepEqual(b.json(),{agent_spec_id:key,favorite:true,revision:7});assert.equal(c.status,405);assert.equal(f.calls.length,2);assert.equal(f.calls[0].identity,identity);assert.equal(a.headers['Cache-Control'],'no-store')
})
test('HTTP rejects owner injection, duplicate/unknown keys and non-boolean writes before repo',async()=>{
 const f=httpFixture();for(const req of[request('GET',originalAgentCatalogPrefix+'?page=1&page=2'),request('GET',originalAgentCatalogPrefix+'?owner='+owner),request('POST',originalAgentCatalogPrefix+'/'+key+'/favorite',{favorite:true,expected_revision:7,owner_user_id:owner}),request('POST',originalAgentCatalogPrefix+'/'+key+'/favorite',{favorite:'true',expected_revision:7}),request('POST',originalAgentCatalogPrefix+'/'+key+'/favorite',{favorite:true})]){const res=response();await f.handler(req,res);assert.equal(res.status,400)}assert.equal(f.calls.length,0)
})
test('favorite HTTP requires an exact expected-employee header and forwards it only as a precondition',async()=>{
 for(const header of[undefined,'not-a-uuid',[owner,other]]){const f=httpFixture(),res=response();await f.handler(request('POST',originalAgentCatalogPrefix+'/'+key+'/favorite',{favorite:true,expected_revision:7},{'x-agentstudio-expected-employee':header}),res);assert.equal(res.status,400);assert.equal(res.json().error,'expected_employee_required');assert.equal(f.calls.length,0)}
 const f=httpFixture(),res=response();await f.handler(request('POST',originalAgentCatalogPrefix+'/'+key+'/favorite',{favorite:true,expected_revision:7}),res);assert.equal(f.calls[0].expectedEmployee,owner);assert.equal(f.calls[0].identity,identity)
})
test('HTTP Origin/CSRF/config gate refuse writes independently of the enabled read route',async()=>{
 const f=httpFixture(false),a=response(),b=response();await f.handler(request('GET',originalAgentCatalogPrefix),a);await f.handler(request('POST',originalAgentCatalogPrefix+'/'+key+'/favorite',{favorite:true,expected_revision:7}),b);assert.equal(a.status,200);assert.equal(b.status,405)
 for(const headers of[{origin:'https://elsewhere.test'},{'x-agentstudio-request':undefined}]){const h=httpFixture(),res=response();await h.handler(request('POST',originalAgentCatalogPrefix+'/'+key+'/favorite',{favorite:true,expected_revision:7},headers),res);assert.equal(res.status,403);assert.equal(h.calls.length,0)}
})
test('HTTP raw SQL/internal errors and oversized pages never leak or silently clip',async()=>{
 const f=httpFixture();f.repository.list=async()=>{throw Error('PRIVATE DATABASE SECRET')};const a=response();await f.handler(request('GET',originalAgentCatalogPrefix),a);assert.equal(a.status,503);assert(!a.body.includes('PRIVATE'))
 f.repository.list=async()=>({items:[{spec:{goal:'x'.repeat(1048577)}}],totalItems:1,page:1,perPage:18,totalPages:1});const b=response();await f.handler(request('GET',originalAgentCatalogPrefix),b);assert.equal(b.status,503);assert.deepEqual(b.json(),{error:'original_agent_catalog_response_too_large'})
})
