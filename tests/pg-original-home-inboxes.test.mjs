import test from 'node:test'
import assert from 'node:assert/strict'
import {Readable} from 'node:stream'
import {parseOriginalAgentPendingQuery,parseOriginalAgentInboxUrl,parseOriginalAgentMeta,parseOriginalAgentWorkspace,parseOriginalAgentPendingPage} from '../services/pg-api/src/original-agent-inbox-contract.ts'
import {OwnOperationsRepository,ownOperationsGuardSql,ownOperationsTables,ownOperationsSchemaSql,ownOperationsNowSql,ownSearchPattern,originalAgentWorkspaceCountSql,originalAgentRecentSql,originalAgentPendingSnippetSql,originalAgentPendingCountSql,originalAgentPendingPageSql} from '../services/pg-api/src/own-operations-repository.ts'
import {createOriginalAgentInboxHttp} from '../services/pg-api/src/original-agent-inbox-http.ts'
import {createNativeOwnOperationsBusinessHandler} from '../services/pg-api/src/own-operations-http.ts'
import {permitNativePg18BusinessUatRequest} from '../services/pg-api/src/native-config-uat-policy.ts'

// Pure DTO/SQL-text/mock tests only. No pool, server or SQL evaluator is opened.
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0'),owner=id(100),at='2026-10-27T01:02:03.123Z',micro='2026-10-27T01:02:03.123456Z'
const identity={issuer:'urn:agentstudio:local:v1',subject:'external-owner-subject'}
const meta=(n=1,extra={})=>({id:id(n),spec_id:id(10),spec_name:'名称_%\\😀',engine_kind:n%2?'agent_single':'agent_autonomous',status:'awaiting_input',created:at,updated:at,...extra})
const rows=n=>Array.from({length:n},(_,i)=>meta(i+1))
const workspace=(extra={})=>({protocol:'native_original_agent_workspace_v1',scope:'current_user',employee_id:owner,as_of:at,agent_run_total:99,items:rows(12),pending_count:37,pending_items:rows(20),...extra})
const q=(extra={})=>({page:1,perPage:10,status:'all',q:'',...extra})
const page=(query=q(),extra={})=>({protocol:'native_original_agent_pending_v1',scope:'current_user',employee_id:owner,as_of:at,items:rows(10),totalItems:37,totalPages:4,...query,...extra})
test('Agent totals remain independent of recent12 and pending20 snippets',()=>{
 const value=parseOriginalAgentWorkspace(workspace());assert.equal(value.agent_run_total,99);assert.equal(value.pending_count,37);assert.equal(value.items.length,12);assert.equal(value.pending_items.length,20)
 assert.equal(parseOriginalAgentWorkspace(workspace({agent_run_total:0,pending_count:0,items:[],pending_items:[]})).pending_count,0)
 for(const change of [{items:[]},{pending_items:[]},{agent_run_total:11},{pending_count:100},{pending_count:-0},{pending_count:'37'},{pending_count:null},{company_total:37}])assert.throws(()=>parseOriginalAgentWorkspace(workspace(change)))
})
test('Agent metadata never exposes Workflow, task bodies or executable destinations',()=>{
 for(const change of [{engine_kind:'workflow_v2'},{engine_kind:'schedule'},{instruction:'private'},{checkpoint:{}},{href:'/run'},{spec_id:null},{status:'unknown'},{created:'2026-02-30T01:02:03.123Z'},{spec_name:'\ud800'}])assert.throws(()=>parseOriginalAgentMeta(meta(1,change)))
 assert.equal(parseOriginalAgentMeta(meta()).engine_kind,'agent_single')
})
test('DTO refuses duplicate/sparse/accessor lists and missing pending rows without reading getters',()=>{
 for(const items of [[meta(),meta()],Array(12)])assert.throws(()=>parseOriginalAgentWorkspace(workspace({items})))
 const items=rows(12);Object.defineProperty(items,'0',{get(){assert.fail('getter executed')},enumerable:true});assert.throws(()=>parseOriginalAgentWorkspace(workspace({items})))
 assert.throws(()=>parseOriginalAgentWorkspace(workspace({pending_items:rows(20).map(v=>({...v,status:'succeeded'}))})))
})
test('numbered page requires exact true-count page length, echoes and pending status',()=>{
 assert.equal(parseOriginalAgentPendingPage(page(),q()).totalItems,37)
 assert.equal(parseOriginalAgentPendingPage(page(q({page:4}),{items:rows(7)}),q({page:4})).items.length,7)
 assert.equal(parseOriginalAgentPendingPage(page(q({page:5}),{items:[]}),q({page:5})).items.length,0)
 for(const change of [{items:[]},{totalPages:1},{page:2},{q:'other'},{totalItems:Infinity},{items:[meta(1,{status:'running'})]}])assert.throws(()=>parseOriginalAgentPendingPage(page(q(),change),q()))
 assert.throws(()=>parseOriginalAgentPendingPage(page(q({status:'awaiting_approval'})),q({status:'awaiting_approval'})))
})
test('query defaults are closed; null, caller owner, controls and unbounded pages are rejected',()=>{
 assert.deepEqual(parseOriginalAgentPendingQuery(),q())
 for(const change of [{owner_id:owner},{employee_id:owner},{page:0},{page:10001},{page:'1'},{page:null},{perPage:31},{status:'running'},{status:null},{q:null},{q:' x '},{q:'\0'},{q:'a'.repeat(101)}])assert.throws(()=>parseOriginalAgentPendingQuery(change))
 assert.deepEqual(parseOriginalAgentPendingQuery(q({page:10000,perPage:30,q:'%_\\😀'})),q({page:10000,perPage:30,q:'%_\\😀'}))
})
test('URL aliases, duplicate keys, caller owner and unsupported limits cannot reach owner reads',()=>{
 assert.deepEqual(parseOriginalAgentInboxUrl('/api/v2/original-ui/agent-workspace?limit=12'),{route:'workspace'})
 assert.deepEqual(parseOriginalAgentInboxUrl('/api/v2/original-ui/agent-pending?page=2&perPage=10&status=awaiting_input&q=%25'),{route:'pending',query:q({page:2,status:'awaiting_input',q:'%'})})
 for(const url of ['//foreign/x','/api/v2/original-ui/agent-pending#x','/api/v2/original-ui/agent-pending?page=01','/api/v2/original-ui/agent-pending?page=1&page=2','/api/v2/original-ui/agent-pending?owner_id='+owner,'/api/v2/original-ui/agent-workspace?limit=100','/api/v2/original-ui/../original-ui/agent-workspace'])assert.throws(()=>parseOriginalAgentInboxUrl(url))
})
test('COUNT SQL has no LIMIT; Agent-only owner predicates and page predicates remain identical',()=>{
 for(const sql of [originalAgentWorkspaceCountSql,originalAgentPendingCountSql]){assert.match(sql,/count\(\*\)::text/);assert.doesNotMatch(sql,/\bLIMIT\b|\bOFFSET\b/)}
 for(const sql of [originalAgentWorkspaceCountSql,originalAgentRecentSql,originalAgentPendingSnippetSql,originalAgentPendingCountSql,originalAgentPendingPageSql]){assert.match(sql,/r\.owner_user_id=\$1::uuid/);assert.match(sql,/kind IN\('agent_single','agent_autonomous'\)/);assert.doesNotMatch(sql,/rh_user|X-Rh|instruction AS|checkpoint AS/)}
 const countWhere=originalAgentPendingCountSql.slice(originalAgentPendingCountSql.lastIndexOf(' FROM agent_rows'))
 assert.equal(originalAgentPendingPageSql.slice(originalAgentPendingPageSql.lastIndexOf(' FROM agent_rows')).split(' ORDER BY')[0],countWhere)
 assert.match(originalAgentPendingPageSql,/ORDER BY updated_at DESC,id DESC LIMIT \$4::integer OFFSET \$5::integer$/)
 assert.equal(ownSearchPattern('%_\\😀'),'%\\%\\_\\\\😀%')
})
const dbRow=m=>({run_id:m.id,kind:m.engine_kind,resource_id:m.spec_id,resource_name:m.spec_name,status:m.status,created_at_us:micro,updated_at_us:micro})
function mockedRepository(overrides={}){
 const calls=[];let released=0
 const client={release(){released++},async query(sql,params){calls.push({sql,params})
  if(overrides.respond){const result=overrides.respond(sql,params);if(result!==undefined)return{rows:result}}
  if(sql.includes('identity_user_id('))return{rows:[{id:owner}]}
  if(sql.includes("current_user='agentstudio_api'"))return{rows:[{ok:true}]}
  if(sql===ownOperationsGuardSql)return{rows:[{ok:true}]}
  if(sql.includes('agent_memory_outcome_epoch() AS epoch'))return{rows:[{epoch:'1'}]}
  if(sql===ownOperationsSchemaSql)return{rows:ownOperationsTables.map(name=>({name,ok:true}))}
  if(sql===ownOperationsNowSql)return{rows:[{as_of:micro}]}
  if(sql===originalAgentWorkspaceCountSql)return{rows:[{total:'99',pending:'37'}]}
  if(sql===originalAgentRecentSql)return{rows:rows(12).map(dbRow)}
  if(sql===originalAgentPendingSnippetSql)return{rows:rows(20).map(dbRow)}
  if(sql===originalAgentPendingCountSql)return{rows:[{total:'37'}]}
  if(sql===originalAgentPendingPageSql)return{rows:rows(params[4]===30?7:10).map(dbRow)}
  return{rows:[]}
 }}
 return{calls,released:()=>released,repository:new OwnOperationsRepository({async connect(){return client}})}
}
test('mock-only repository goes through existing verified actor transaction and unbounded count first',async()=>{
 const f=mockedRepository(),value=await f.repository.originalAgentWorkspace(identity)
 assert.equal(value.employee_id,owner);assert.notEqual(value.employee_id,identity.subject);assert.equal(value.pending_count,37)
 assert.equal(f.calls[0].sql,'BEGIN ISOLATION LEVEL REPEATABLE READ');assert.equal(f.calls.at(-1).sql,'COMMIT');assert.equal(f.released(),1)
 const projection=f.calls.filter(c=>[originalAgentWorkspaceCountSql,originalAgentRecentSql,originalAgentPendingSnippetSql].includes(c.sql))
 assert.deepEqual(projection.map(c=>c.sql),[originalAgentWorkspaceCountSql,originalAgentRecentSql,originalAgentPendingSnippetSql]);assert.ok(projection.every(c=>c.params[0]===owner))
 assert.ok(f.calls.some(c=>c.sql===ownOperationsGuardSql));assert.ok(f.calls.some(c=>c.sql.includes('set_config(\'agentstudio.actor_id\'')))
})
test('mock-only paging binds same owner, status, literal search then perPage and offset',async()=>{
 const f=mockedRepository(),query=q({page:4,q:'%_\\😀'}),value=await f.repository.originalAgentPending(identity,query)
 assert.equal(value.totalItems,37);assert.equal(value.totalPages,4);assert.equal(value.items.length,7)
 const count=f.calls.find(c=>c.sql===originalAgentPendingCountSql),pageCall=f.calls.find(c=>c.sql===originalAgentPendingPageSql)
 assert.deepEqual(count.params,[owner,'all',ownSearchPattern(query.q)]);assert.deepEqual(pageCall.params,[...count.params,10,30])
})
test('missing identity, revoked epoch, guard drift and malformed counts never become zero success',async()=>{
 const foreign=mockedRepository();await assert.rejects(()=>foreign.repository.originalAgentWorkspace({issuer:'foreign',subject:'x'}));assert.equal(foreign.calls.length,0)
 for(const respond of [sql=>sql===ownOperationsGuardSql?[{ok:false}]:undefined,sql=>sql.includes('agent_memory_outcome_epoch() AS epoch')?[{epoch:null}]:undefined,sql=>sql===originalAgentWorkspaceCountSql?[{total:'99',pending:'9007199254740992'}]:undefined,sql=>sql===originalAgentPendingCountSql?[]:undefined]){
  const f=mockedRepository({respond});await assert.rejects(()=>f.repository.originalAgentWorkspace(identity).then(()=>f.repository.originalAgentPending(identity,q())));assert.equal(f.released()>0,true);assert.ok(f.calls.some(c=>c.sql==='ROLLBACK'))
 }
})
function request(url,extra={}){const req=Readable.from([]);Object.assign(req,{url,method:'GET',headers:{cookie:'__Host-agentstudio_session='+'a'.repeat(43),origin:'https://localhost:17443','sec-fetch-site':'same-origin'},...extra});return req}
function response(){return{status:0,headers:null,body:null,writeHead(status,headers){this.status=status;this.headers=headers},end(body){this.body=JSON.parse(body)}}}
test('HTTP uses Native Cookie identity and strict GET routes without forwarded-owner authentication',async()=>{
 const calls=[],handler=createOriginalAgentInboxHttp({allowedOrigin:'https://localhost:17443',authenticateRequest:async()=>identity,repository:{workspace:async who=>{calls.push(who);return workspace()},pending:async(who,query)=>page(query)}})
 const res=response();assert.equal(await handler(request('/api/v2/original-ui/agent-workspace?limit=12'),res),true);assert.equal(res.status,200);assert.equal(res.headers['Cache-Control'],'no-store');assert.deepEqual(calls,[identity])
 for(const [req,status] of [[request('/api/v2/original-ui/agent-workspace',{headers:{'x-rh-user-id':owner}}),401],[request('/api/v2/original-ui/agent-workspace',{method:'POST'}),405],[request('/api/v2/original-ui/agent-workspace?owner_id='+owner),400],[request('/api/v2/original-ui/agent-workspace',{headers:{cookie:'__Host-agentstudio_session='+'a'.repeat(43),authorization:'Bearer x'}}),401],[request('/api/v2/original-ui/agent-workspace',{headers:{origin:'https://foreign.invalid'}}),403]]){const out=response();await handler(req,out);assert.equal(out.status,status)}
 assert.equal(calls.length,1);assert.equal(await handler(request('/api/v2/original-ui/monitor-inbox'),response()),false)
})
test('real absent monitor route and missing owner repository are refused rather than synthesized',async()=>{
 assert.equal(permitNativePg18BusinessUatRequest('/api/v2/original-ui/agent-workspace','GET',{}),true)
 assert.equal(permitNativePg18BusinessUatRequest('/api/v2/original-ui/agent-pending','POST',{}),false)
 assert.equal(permitNativePg18BusinessUatRequest('/api/v2/original-ui/monitor-inbox','GET',{}),false)
 let fallback=0;const handler=createNativeOwnOperationsBusinessHandler({allowedOrigin:'https://localhost:17443',authenticateRequest:async()=>identity,policy:{},businessHandler:()=>{fallback++}})
 const one=response();await handler(request('/api/v2/original-ui/agent-workspace'),one);assert.equal(one.status,409);assert.equal(one.body.error,'own_overview_unavailable')
 const two=response();await handler(request('/api/v2/original-ui/monitor-inbox'),two);assert.equal(two.status,405);assert.equal(fallback,0)
})
