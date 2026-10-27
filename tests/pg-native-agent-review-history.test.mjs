import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {agentReviewHistoryCursor,agentReviewHistoryQuery,agentReviewHistoryItem,agentReviewHistoryPage} from '../src/lib/pgNativeAgentReviewHistory.ts'
import {createPgNativePilotApi,PgNativePilotError} from '../src/lib/pgNativePilotApi.ts'
const uuid=n=>n.toString(16).padStart(8,'0')+'-0000-0000-0000-000000000000'
const target={spec_id:uuid(100),run_id:uuid(200),purpose:'evaluate'},at='2026-10-27T01:02:03.000Z'
const cursor=(created_at,request_id)=>'v1.'+Buffer.from(JSON.stringify({created_at,request_id})).toString('base64url')
const item=(n=1,patch={})=>({request:{request_id:uuid(n),...target,request_sha256:'a'.repeat(64),input_sha256:'b'.repeat(64),content_sha256:'c'.repeat(64),owner_epoch:3,source_protocol:'current_task_delivery_v1',created_at:new Date(Date.parse(at)-n*1000).toISOString()},control:{job_state:'pending',body_erased:false},...patch})
function page(items=[item()],limit=20,more=false){const last=items.at(-1);return {protocol:'agent_paid_review_history_v1',...target,items,limit,has_more:more,next_cursor:more?cursor(last.request.created_at.replace('Z','123Z'),last.request.request_id):null}}
const invalid=fn=>assert.throws(fn,/invalid_agent_review_history/)

test('closed numeric query defaults one bounded page and never admits owner, offset or loose coercion',()=>{
  assert.deepEqual(agentReviewHistoryQuery(target),{...target,limit:20,before:null})
  assert.equal(agentReviewHistoryQuery({...target,limit:1}).limit,1)
  for(const patch of [{limit:'20'},{limit:0},{limit:21},{limit:1.1},{limit:undefined},{owner_id:uuid(1)},{offset:0},{sort:'created'},{before:''},{before:undefined},{purpose:'both'}])invalid(()=>agentReviewHistoryQuery({...target,...patch}))
  assert.equal(agentReviewHistoryQuery({...target,spec_id:'ABCDEFAB-0000-0000-0000-000000000000'}).spec_id,'abcdefab-0000-0000-0000-000000000000')
})
test('cursor keeps exact database microseconds and strictly canonical JSON/UTF8/base64 bits',()=>{
  const value={created_at:'2026-10-27T01:02:03.000123Z',request_id:uuid(1)},good=cursor(value.created_at,value.request_id)
  assert.deepEqual(agentReviewHistoryCursor(good),value)
  const raw=json=>'v1.'+Buffer.from(json).toString('base64url')
  for(const bad of [good+'=',good+' ',good.replace('v1.','v2.'),'v1.','v1.'+'a'.repeat(254),raw(JSON.stringify({request_id:value.request_id,created_at:value.created_at})),raw(' '+JSON.stringify(value)),raw(JSON.stringify({...value,owner:uuid(4)})),raw(JSON.stringify({...value,request_id:'ABCDEFAB-0000-0000-0000-000000000000'})),raw(JSON.stringify({...value,created_at:at})),raw(JSON.stringify({...value,created_at:'2026-02-30T01:02:03.000123Z'})),raw(JSON.stringify({...value,created_at:'0000-01-01T01:02:03.000123Z'})),'v1.'+Buffer.from([0xff,0xfe]).toString('base64url'),raw('\ufeff'+JSON.stringify(value))])invalid(()=>agentReviewHistoryCursor(bad))
  const chars='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_',encoded=good.slice(3),last=chars.indexOf(encoded.at(-1))
  if(encoded.length%4!==0)invalid(()=>agentReviewHistoryCursor('v1.'+encoded.slice(0,-1)+chars[last^1]))
})
test('zero/20 rows and limit+1 indication obey exact page/cursor invariants with no receipt or body claim',()=>{
  assert.deepEqual(agentReviewHistoryPage(page([]),target),page([]))
  const full=page(Array.from({length:20},(_,i)=>item(i+1)),20,true),parsed=agentReviewHistoryPage(full,target)
  assert.equal(parsed.items.length,20);assert.equal(parsed.has_more,true);assert.equal(parsed.items[0].request.owner_epoch,3)
  assert.doesNotMatch(JSON.stringify(parsed),/recorded|replayed|available|result|messages|choice|owner_user_id|lease|outcome/)
  for(const bad of [{...page([]),has_more:true,next_cursor:full.next_cursor},{...page(),has_more:true},{...full,items:full.items.slice(1)},{...full,items:[...full.items,item(21)]},{...page(),next_cursor:full.next_cursor},{...full,next_cursor:null},{...full,next_cursor:cursor('2026-10-27T01:02:03.000123Z',uuid(99))}])invalid(()=>agentReviewHistoryPage(bad,target))
})
test('different microseconds in one public millisecond do not cause false UUID ordering rejection',()=>{
  const first=item(1),second=item(9);first.request.created_at=at;second.request.created_at=at
  const p=page([first,second],2,true);p.next_cursor=cursor('2026-10-27T01:02:03.000100Z',uuid(9))
  const before=cursor('2026-10-27T01:02:03.000900Z',uuid(0))
  assert.deepEqual(agentReviewHistoryPage(p,{...target,limit:2,before}).items,[first,second])
  invalid(()=>agentReviewHistoryPage({...p,next_cursor:cursor('2026-10-27T01:02:03.000999Z',uuid(9))},{...target,limit:2,before}))
  invalid(()=>agentReviewHistoryPage(page([first,second],2),{...target,limit:2,before:cursor('2026-10-27T01:02:02.999999Z',uuid(0))}))
})
test('cross-scope, duplicate, boundary replay and out-of-order metadata fail closed',()=>{
  for(const mutate of [p=>p.spec_id=uuid(999),p=>p.purpose='optimize',p=>p.items[0].request.run_id=uuid(999),p=>p.items.push(structuredClone(p.items[0])),p=>p.items=[item(2),item(1)],p=>p.limit=1,p=>p.items[0].request.source_protocol='employee_statement_anchor_v1']){const p=page();mutate(p);invalid(()=>agentReviewHistoryPage(p,target))}
  invalid(()=>agentReviewHistoryPage(page(),{...target,before:cursor('2026-10-27T01:02:03.000999Z',uuid(1))}))
})
test('metadata control snapshots preserve erase/cancel and reject forged available/recorded/privacy states',()=>{
  for(const job_state of ['pending','cancelled','erased']){
    const row=item(1,{control:{job_state,body_erased:job_state==='erased'}});assert.deepEqual(agentReviewHistoryItem(row,target),row)
  }
  for(const patch of [{recorded:true},{replayed:true},{available:false},{result:null},{execution:{}},{choice:{}},{messages:[]}])invalid(()=>agentReviewHistoryPage(page([Object.assign(item(),patch)]),target))
  for(const control of [{job_state:'pending',body_erased:true},{job_state:'erased',body_erased:false},{job_state:'succeeded',body_erased:false},{job_state:'pending',body_erased:false,lease_state:'succeeded'}])invalid(()=>agentReviewHistoryItem(item(1,{control}),target))
  for(const patch of [{owner_user_id:uuid(3)},{owner_epoch:'3'},{owner_epoch:0},{owner_epoch:Number.MAX_SAFE_INTEGER},{created_at:'2026-10-27T01:02:03.000123Z'},{request_sha256:'A'.repeat(64)}]){const row=item();Object.assign(row.request,patch);invalid(()=>agentReviewHistoryItem(row,target))}
})
test('nested getters, symbols, prototypes and sparse arrays cannot execute through history parsing',()=>{
  for(const section of ['request','control'])for(const key of Object.keys(item()[section])){
    let calls=0;const row=item();Object.defineProperty(row[section],key,{enumerable:true,get(){calls++;throw Error('getter')}});invalid(()=>agentReviewHistoryItem(row,target));assert.equal(calls,0)
  }
  for(const rows of [Array(1),Object.assign([item()],{[Symbol('body')]:true})])invalid(()=>agentReviewHistoryPage(page(rows),target))
  invalid(()=>agentReviewHistoryItem(Object.assign(Object.create({}),item()),target))
  invalid(()=>agentReviewHistoryPage({...page(),[Symbol('owner')]:1},target))
  let coerced=0;invalid(()=>agentReviewHistoryQuery({...target,limit:{valueOf(){coerced++;return 20}}}));assert.equal(coerced,0)
})
test('page snapshots detach all nested data, and no Node/backend runtime is imported',()=>{
  const raw=page(),parsed=agentReviewHistoryPage(raw,target);raw.items[0].request.request_sha256='f'.repeat(64);raw.items[0].control.job_state='erased';assert.equal(parsed.items[0].control.job_state,'pending');assert.equal(parsed.items[0].request.request_sha256,'a'.repeat(64))
  const source=readFileSync(new URL('../src/lib/pgNativeAgentReviewHistory.ts',import.meta.url),'utf8');assert.doesNotMatch(source,/node:|services\/pg-api|localStorage|sessionStorage|Buffer\./)
})
test('history SDK uses fixed bounded Cookie GET with exact canonical query and no body/credentials/retries',async()=>{
  const calls=[],api=createPgNativePilotApi(async(url,opts)=>{calls.push([url,opts]);return new Response(JSON.stringify(page()),{status:200})})
  assert.deepEqual(await api.listAgentReviewHistory(target),page())
  assert.equal(calls[0][0],'/__pg_native/api/v2/agent-reviews?spec_id='+target.spec_id+'&run_id='+target.run_id+'&purpose=evaluate&limit=20')
  const opts=calls[0][1];assert.equal(opts.method,'GET');assert.equal(opts.body,undefined);assert.equal(opts.credentials,'same-origin');assert.equal(opts.redirect,'error');assert.equal(opts.cache,'no-store');assert.equal(opts.headers.Authorization,undefined)
  await assert.rejects(()=>api.listAgentReviewHistory({...target,owner_id:uuid(1)}),e=>e.status===400);assert.equal(calls.length,1)
  let tries=0;const lost=createPgNativePilotApi(async()=>{tries++;throw Error('lost')});await assert.rejects(()=>lost.listAgentReviewHistory(target),e=>e instanceof PgNativePilotError&&e.status===0);assert.equal(tries,1)
})
test('SDK refuses wrong/wrapped metadata and validates read capability independent of submission scope',async()=>{
  for(const bad of [{item:page()},{...page(),recorded:true},{...page(),run_id:uuid(999)}]){const api=createPgNativePilotApi(async()=>new Response(JSON.stringify(bad)));await assert.rejects(()=>api.listAgentReviewHistory(target),e=>e.status===503)}
  const base={mode:'native_pg18',config_writes_enabled:false,model_probe_enabled:false,run_execution_enabled:false,agent_review_available:true,agent_review_submission_enabled:false}
  const good=createPgNativePilotApi(async()=>new Response(JSON.stringify({...base,agent_review_history_available:true})));assert.equal((await good.getConfigCapabilities()).agent_review_history_available,true)
  for(const patch of [{agent_review_history_available:'true'},{agent_review_available:false,agent_review_history_available:true},{agent_review_available:undefined,agent_review_history_available:true}]){const api=createPgNativePilotApi(async()=>new Response(JSON.stringify({...base,...patch})));await assert.rejects(()=>api.getConfigCapabilities(),e=>e.status===503)}
})
