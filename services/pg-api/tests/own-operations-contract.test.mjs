// Pure only: no SQL, listener, provider, fixture import or application mount.
import test from 'node:test'
import assert from 'node:assert/strict'
import {ownCountKeys,ownCategoryRanks,ownCanonical,ownQueryHash,ownCursor,parseOwnCursor,parseOwnTodoQuery,parseOwnOperationsUrl,parseOwnOverview,parseOwnTodoItem,parseOwnTodoPage,ownStamp,ownCount,ownDatabaseCount,compareOwnPositions} from '../src/own-operations-contract.ts'
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`,us='2026-10-27T01:02:03.123456Z',ms='2026-10-27T01:02:03.123Z'
const query=()=>parseOwnTodoQuery(),position=()=>({observed_at:us,id:id(1),category_rank:1,step_key:null})
const item=()=>({category:'approval',kind:'agent_single',id:id(1),resource_id:id(2),resource_name:'角色甲',step_key:null,status:'awaiting_approval',observed_at:ms})
const overview=()=>({protocol:'native_own_overview_v1',scope:'current_user',as_of:ms,window_days:7,counts:Object.fromEntries(ownCountKeys.map(k=>[k,0])),recent:[],delegated_approvals:'unavailable'})
const page=()=>({protocol:'native_own_todos_v1',scope:'current_user',as_of:ms,category:'all',kind:'all',q:'',limit:20,items:[],has_more:false,next_cursor:null})
const error=code=>e=>e.status===(code.startsWith('invalid_')?400:409)&&e.code===code&&e.message===code
const invalid=f=>assert.throws(f,error('own_overview_unavailable')),invalidQuery=f=>assert.throws(f,error('invalid_own_todo_query')),invalidCursor=f=>assert.throws(f,error('invalid_own_todo_cursor'))
test('closed query defaults, trim only, UTF16 limit and valid empty intersections',()=>{
 assert.deepEqual(query(),{category:'all',kind:'all',q:'',limit:20,before:null})
 assert.equal(parseOwnTodoQuery({q:'  A\ne\u0301  '}).q,'A\ne\u0301')
 assert.equal(parseOwnTodoQuery({q:'😀'.repeat(50)}).q.length,100)
 assert.equal(parseOwnTodoQuery({category:'failed',kind:'schedule'}).category,'failed')
 for(const bad of [null,[],{category:null},{kind:'workflow'},{limit:'20'},{limit:0},{limit:21},{q:'x'.repeat(101)},{q:'a\0b'},{q:'\ud800'},{owner_user_id:id(2)}])invalidQuery(()=>parseOwnTodoQuery(bad))
})
test('URL parser rejects aliases, duplicate/unknown keys and nonliteral limits',()=>{
 assert.deepEqual(parseOwnOperationsUrl('/api/v2/own-overview'),{route:'overview'})
 assert.equal(parseOwnOperationsUrl('/api/v2/own-todos?q=%25_%5C&limit=1').query.q,'%_\\')
 for(const path of ['/api/v2/own-overview?','/api/v2/own-overview?q=x','/api/v2/own-todos?q=x&q=y','/api/v2/own-todos?owner=x','/api/v2/own-todos?%71=x','/api/v2/own-todos?limit=01','/api/v2/own-todos?limit=%32','/api/v2/own-todos?q=%FF','/api/v2/own-todos?q=中','/api/v2/own-todos#x','https://other.test/api/v2/own-todos'])invalidQuery(()=>parseOwnOperationsUrl(path))
})
test('safe counts and strict UTC calendars refuse rather than coerce',()=>{
 assert.equal(ownDatabaseCount('9007199254740991'),Number.MAX_SAFE_INTEGER)
 for(const value of ['01','-1','1e2','9007199254740992',1,null])invalid(()=>ownDatabaseCount(value))
 for(const value of [-0,-1,NaN,Infinity,1.5,Number.MAX_SAFE_INTEGER+1,'0'])invalid(()=>ownCount(value))
 assert.equal(ownStamp('2024-02-29T23:59:59.999999Z',true),'2024-02-29T23:59:59.999999Z')
 for(const value of ['2026-02-29T01:02:03.123Z','0000-01-01T00:00:00.000Z',ms+'\n',ms.replace('Z','+00:00'),'\ufeff'+ms,'2026-10-27T24:00:00.000Z'])invalid(()=>ownStamp(value))
})
test('canonical SHA/cursor binds filters and exact microseconds without a public-date roundtrip',()=>{
 const q=parseOwnTodoQuery({q:'e\u0301'}),cursor=ownCursor(q,us,position()),decoded=parseOwnCursor(cursor,q)
 assert.equal(decoded.observed_at,us);assert.equal(decoded.as_of,us);assert.equal(decoded.step_key,null)
 assert.equal(ownCanonical({z:[{z:1,a:2}],a:0}),'{'+'"a":0,"z":[{"a":2,"z":1}]}')
 assert.notEqual(ownQueryHash(q),ownQueryHash({...q,q:'é'}))
 for(const changed of [{...q,category:'approval'},{...q,kind:'agent_single'},{...q,q:'é'}])invalidCursor(()=>parseOwnCursor(cursor,changed))
})
test('noncanonical UTF8/JSON/base64, duplicate keys, malformed dates and extra fields refuse',()=>{
 const q=query(),valid=ownCursor(q,us,position()),v=parseOwnCursor(valid,q),encode=s=>'v1.'+Buffer.from(s).toString('base64url')
 const malformed=[valid+'=',valid.replace('v1.','v2.'),'v1._w',encode('\ufeff'+ownCanonical(v)),encode(JSON.stringify(v)),encode(ownCanonical({...v,extra:true})),encode(ownCanonical({...v,as_of:'2026-02-30T00:00:00.000001Z'})),encode(ownCanonical({...v,category_rank:0})),encode(ownCanonical({...v,step_key:''})),encode(ownCanonical(v).replace('"category":"all"','"category":"all","category":"all"')),'v1.'+'A'.repeat(2046)]
 for(const raw of malformed)invalidCursor(()=>parseOwnCursor(raw,q))
})
test('category ranks and nullable cursor steps follow frozen addendum for all run modes',()=>{
 assert.deepEqual(ownCategoryRanks,{approval:1,human_input:2,paused:3,effect_review:4,schedule_overdue:5,failed:6})
 for(const kind of ['agent_single','agent_autonomous','workflow_v2','workflow_safe'])for(const [category,status] of [['approval','awaiting_approval'],['human_input','awaiting_input'],['paused','paused'],['failed','failed'],['effect_review','unknown']]){
  const value={...item(),kind,category,status,step_key:category==='effect_review'?'步骤😀':null};assert.deepEqual(parseOwnTodoItem(value),value)
  const p={...position(),category_rank:ownCategoryRanks[category],step_key:value.step_key};assert.equal(parseOwnCursor(ownCursor(query(),us,p),query()).step_key,value.step_key)
 }
 assert.equal(parseOwnTodoItem({...item(),category:'schedule_overdue',kind:'schedule',status:'overdue'}).kind,'schedule')
 for(const bad of [{...item(),kind:'schedule'},{...item(),status:'paused'},{...item(),step_key:''},{...item(),category:'effect_review',status:'unknown',step_key:null},{...item(),category:'schedule_overdue',status:'overdue'}])invalid(()=>parseOwnTodoItem(bad))
})
test('tuple comparator preserves microseconds, rank and PostgreSQL C Unicode ordering',()=>{
 assert.ok(compareOwnPositions({...position(),observed_at:us.replace('456','455')},position())<0)
 assert.ok(compareOwnPositions({...position(),category_rank:6},position())>0)
 assert.ok(compareOwnPositions({...position(),category_rank:4,step_key:'😀'},{...position(),category_rank:4,step_key:'\ue000'})>0)
})
test('blank/C0 metadata names remain valid; malformed/oversize names and six-digit as_of drift refuse',()=>{
 for(const resource_name of ['', '\t\n\u007f','😀'.repeat(60)])assert.equal(parseOwnTodoItem({...item(),resource_name}).resource_name,resource_name)
 for(const resource_name of ['x'.repeat(121),'\ud800','a\0b'])invalid(()=>parseOwnTodoItem({...item(),resource_name}))
 const q=parseOwnTodoQuery({limit:1}),before=ownCursor(q,us,{...position(),id:id(3)}),requested={...q,before}
 const valid={...page(),limit:1,items:[item()],has_more:true,next_cursor:ownCursor(q,us,position())}
 assert.equal(parseOwnTodoPage(valid,requested).next_cursor,valid.next_cursor)
 invalid(()=>parseOwnTodoPage({...valid,next_cursor:ownCursor(q,us.replace('456','457'),position())},requested))
})
test('overview closes every nested field and distinguishes complete zero from invalid count',()=>{
 const valid=overview();assert.deepEqual(parseOwnOverview(valid),valid)
 for(const bad of [{...valid,body:'private'},{...valid,counts:{...valid.counts,pending_total:0}},{...valid,counts:{...valid.counts,queued:null}},{...valid,recent:new Array(1)},{...valid,delegated_approvals:0}])invalid(()=>parseOwnOverview(bad))
 const getter={...valid};Object.defineProperty(getter,'as_of',{enumerable:true,get(){throw Error('must not invoke')}});invalid(()=>parseOwnOverview(getter))
 const sym={...valid,[Symbol('private')]:1};invalid(()=>parseOwnOverview(sym))
})
test('page is filter-bound and cursor iff full page with a valid microsecond last tuple',()=>{
 const q=parseOwnTodoQuery({limit:1}),valid={...page(),limit:1,items:[item()],has_more:true,next_cursor:ownCursor(q,us,position())}
 assert.deepEqual(parseOwnTodoPage(valid,q),valid)
 assert.deepEqual(parseOwnTodoPage({...page(),category:'failed',kind:'schedule'},parseOwnTodoQuery({category:'failed',kind:'schedule'})).items,[])
 for(const bad of [{...valid,next_cursor:null},{...valid,items:[]},{...valid,has_more:false},{...valid,q:'other'},{...valid,next_cursor:ownCursor(q,us,{...position(),id:id(2)})},{...page(),items:[item(),item()]},{...page(),items:[{...item(),question:'private'}]}])invalid(()=>parseOwnTodoPage(bad,bad.limit===1?q:query()))
})
