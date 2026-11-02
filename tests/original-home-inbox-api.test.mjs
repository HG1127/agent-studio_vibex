import test from 'node:test'
import assert from 'node:assert/strict'
import {createOriginalHomeInboxApi,validateOriginalPendingQuery} from '../src/lib/originalHomeInboxApi.ts'
// Mock transport only: these cases do not constitute real SQL/browser evidence.
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0'),owner=id(100),at='2026-10-27T01:02:03.123Z'
const item=n=>({id:id(n),spec_id:id(10),spec_name:'名称',engine_kind:n%2?'agent_single':'agent_autonomous',status:'awaiting_input',created:at,updated:at})
const rows=n=>Array.from({length:n},(_,i)=>item(i+1))
const workspace=(extra={})=>({protocol:'native_original_agent_workspace_v1',scope:'current_user',employee_id:owner,as_of:at,agent_run_total:80,items:rows(12),pending_count:40,pending_items:rows(20),...extra})
const query=(extra={})=>({page:1,perPage:10,status:'all',q:'',...extra})
const page=(q=query(),extra={})=>({protocol:'native_original_agent_pending_v1',scope:'current_user',employee_id:owner,as_of:at,items:rows(10),totalItems:40,totalPages:4,...q,...extra})
const fixture=(value,status=200)=>{const calls=[];const api=createOriginalHomeInboxApi(owner,async(url,init)=>{calls.push({url,init});return new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}})});return{api,calls}}
test('fixed Native transport uses same-origin Cookie GET and an expected employee concurrency precondition',async()=>{
 const f=fixture(workspace()),result=await f.api.workspace();assert.equal(result.pending_count,40);assert.equal(result.agent_run_total,80)
 assert.equal(f.calls[0].url,'/__pg_native/api/v2/original-ui/agent-workspace?limit=12')
 const init=f.calls[0].init;assert.equal(init.method,'GET');assert.equal(init.credentials,'same-origin');assert.equal(init.cache,'no-store');assert.equal(init.redirect,'error');assert.equal(init.referrerPolicy,'no-referrer');assert.deepEqual(init.headers,{Accept:'application/json','X-AgentStudio-Expected-Employee':owner});assert.equal(init.body,undefined)
 assert.throws(()=>createOriginalHomeInboxApi('legacy-pocketbase-id'));assert.throws(()=>createOriginalHomeInboxApi(owner,fetch,'https://foreign.invalid'))
})
test('wrong employee/company scope, fake bounded totals and private row fields fail closed',async()=>{
 for(const change of [{employee_id:id(200)},{scope:'company_metadata_only'},{items:[]},{pending_items:[]},{pending_count:81},{pending_count:'40'},{pending_count:-0},{items:rows(12).map(row=>({...row,instruction:'private'}))},{items:rows(12).map(row=>({...row,engine_kind:'workflow_v2'}))}])await assert.rejects(()=>fixture(workspace(change)).api.workspace(),/invalid_original_home/)
})
test('page query and real total echoes preserve all older pending pages',async()=>{
 const q=query({page:4,q:'%_\\😀'}),f=fixture(page(q)),result=await f.api.pending(q)
 assert.equal(result.totalItems,40);assert.equal(result.totalPages,4);assert.equal(result.items.length,10)
 const url=new URL(f.calls[0].url,'https://localhost');assert.equal(url.searchParams.get('q'),q.q);assert.equal(url.searchParams.get('page'),'4');assert.equal(url.searchParams.has('employee_id'),false)
 for(const change of [{items:[]},{totalPages:1},{page:3},{q:'other'},{employee_id:id(200)}])await assert.rejects(()=>fixture(page(q,change)).api.pending(q),/invalid_original_home/)
 assert.equal((await fixture(page(query({page:5}),{items:[]})).api.pending(query({page:5}))).items.length,0)
})
test('invalid status/pages/search and wrong waiting status are never sent or accepted',async()=>{
 for(const change of [{page:0},{page:10001},{perPage:31},{status:'running'},{q:' x '},{q:'\0'},{q:'a'.repeat(101)}])assert.throws(()=>validateOriginalPendingQuery(query(change)))
 await assert.rejects(()=>fixture(page(query({status:'awaiting_approval'}))).api.pending(query({status:'awaiting_approval'})),/invalid_original_home/)
})
test('monitor absence is an explicit Native refusal, never an invented empty inbox',async()=>{
 const f=fixture({error:'pilot_business_writes_disabled'},405)
 await assert.rejects(()=>f.api.monitors(null),error=>error.status===405&&error.code==='original_home_inbox_unavailable')
 assert.equal(f.calls[0].url,'/__pg_native/api/v2/original-ui/monitor-inbox?limit=10')
 await assert.rejects(()=>fixture({items:[],has_more:false,next_cursor:null}).api.monitors(null),/invalid_original_home/)
 const read=fixture({error:'pilot_business_writes_disabled'},405);await assert.rejects(()=>read.api.markMonitorRead(id(1)))
 assert.equal(read.calls[0].init.headers['X-AgentStudio-Request'],'1');assert.equal(read.calls[0].init.body,'{}')
  assert.equal(read.calls[0].init.headers['X-AgentStudio-Expected-Employee'],owner)
})
test('bounded streaming stops before reading an oversized tail and rejects malformed UTF-8 or a false length',async()=>{
 let reads=0,cancelled=0
 const stream=new ReadableStream({pull(controller){reads++;controller.enqueue(new Uint8Array(600000))},cancel(){cancelled++}})
 await assert.rejects(()=>createOriginalHomeInboxApi(owner,async()=>new Response(stream,{headers:{'Content-Type':'application/json'}})).workspace())
 assert(reads<=3);assert.equal(cancelled,1)
 for(const response of [new Response(new Uint8Array([0xff]),{headers:{'Content-Type':'application/json'}}),new Response(JSON.stringify(workspace()),{headers:{'Content-Type':'application/json','Content-Length':'1'}})])await assert.rejects(()=>createOriginalHomeInboxApi(owner,async()=>response).workspace())
})
test('caller cancellation settles an ignored transport without waiting for its response',async()=>{
 const controller=new AbortController();let started
 const ready=new Promise(resolve=>{started=resolve}),pending=createOriginalHomeInboxApi(owner,async()=>{started();return new Promise(()=>{})}).workspace(controller.signal)
 await ready;controller.abort();await assert.rejects(pending,error=>error.code==='original_home_inbox_unavailable')
})
test('transport errors, malformed/oversized JSON and cancellation cannot produce zero data',async()=>{
 for(const response of [new Response('{'),new Response('x'.repeat(1048577)),new Response('{}',{status:409})])await assert.rejects(()=>createOriginalHomeInboxApi(owner,async()=>response).workspace())
 await assert.rejects(()=>createOriginalHomeInboxApi(owner,async()=>{throw Error('network')}).workspace(),/original_home_inbox_unavailable/)
 const abort=new AbortController();abort.abort();let called=false
 await assert.rejects(()=>createOriginalHomeInboxApi(owner,async(_url,init)=>{called=true;assert.equal(init.signal.aborted,true);throw Error('abort')}).workspace(abort.signal));assert.equal(called,true)
})
test('matching expected employee cannot replace Cookie authentication or turn a401 into empty data',async()=>{
 for(const invoke of [api=>api.workspace(),api=>api.pending(query()),api=>api.monitors(null),api=>api.markMonitorRead(id(1))]){
  const f=fixture({error:'session_required'},401)
  await assert.rejects(()=>invoke(f.api),error=>error.status===401&&error.code==='original_home_inbox_unavailable')
  assert.equal(f.calls.length,1);const init=f.calls[0].init,headers=new Headers(init.headers)
  assert.equal(init.credentials,'same-origin');assert.equal(headers.get('X-AgentStudio-Expected-Employee'),owner)
  for(const key of ['Authorization','X-Rh-User-Id','X-User-Id'])assert.equal(headers.has(key),false)
  assert.equal(new URL(f.calls[0].url,'https://localhost').searchParams.has('employee_id'),false)
 }
})
test('workspace pending and monitor response owners stay bound to the original verified employee',async()=>{
 const monitor=employee=>({protocol:'native_original_monitor_inbox_v1',scope:'current_user',employee_id:employee,as_of:at,items:[],has_more:false,next_cursor:null})
 for(const [value,invoke]of [[workspace({employee_id:id(200)}),api=>api.workspace()],[page(query(),{employee_id:id(200)}),api=>api.pending(query())],[monitor(id(200)),api=>api.monitors(null)]])await assert.rejects(()=>invoke(fixture(value).api),/invalid_original_home/)
 const old=fixture(workspace({employee_id:owner}),409);await assert.rejects(()=>old.api.workspace(),error=>error.status===409)
 const currentCalls=[],current=createOriginalHomeInboxApi(id(200),async(url,init)=>{currentCalls.push({url,init});return new Response(JSON.stringify(monitor(id(200))),{headers:{'Content-Type':'application/json'}})})
 assert.deepEqual(await current.monitors(null),{items:[],has_more:false,next_cursor:null});assert.equal(currentCalls[0].init.headers['X-AgentStudio-Expected-Employee'],id(200))
})
test('late Cookie owner switch cannot relabel the old in-flight inbox client',async()=>{
 let release,started;const entered=new Promise(resolve=>{started=resolve}),reply=new Promise(resolve=>{release=resolve}),calls=[]
 const old=createOriginalHomeInboxApi(owner,async(url,init)=>{calls.push({url,init});started();return reply}),pending=old.workspace()
 await entered;const currentCalls=[],current=createOriginalHomeInboxApi(id(200),async(url,init)=>{currentCalls.push({url,init});return new Response(JSON.stringify(workspace({employee_id:id(200)})),{headers:{'Content-Type':'application/json'}})})
 assert.equal((await current.workspace()).agent_run_total,80)
 release(new Response(JSON.stringify(workspace({employee_id:id(200)})),{headers:{'Content-Type':'application/json'}}))
 await assert.rejects(pending,/invalid_original_home/);assert.equal(calls[0].init.headers['X-AgentStudio-Expected-Employee'],owner);assert.equal(currentCalls[0].init.headers['X-AgentStudio-Expected-Employee'],id(200))
})
