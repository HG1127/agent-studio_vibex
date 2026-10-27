// Pure DTO/cursor checks: no SQL, listener, provider or filesystem state.
import test from 'node:test'
import assert from 'node:assert/strict'
import {parseAgentReviewHistoryQuery as query,parseAgentReviewHistoryUrl as url,parseAgentReviewHistoryCursor as cursor,agentReviewHistoryCursor as encode,parseAgentReviewHistoryPage as page,parseAgentReviewHistoryCandidate as candidate,compareAgentReviewHistoryPositions as compare} from '../src/agent-review-history-contract.ts'

const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const target={spec_id:id(1),run_id:id(2),purpose:'evaluate'},q=query(target)
const position=(n=3,created_at='2026-10-27T01:02:03.123456Z')=>({created_at,request_id:id(n)})
const rawCursor=text=>'v1.'+Buffer.from(text).toString('base64url')
const item=(n=3,created_at='2026-10-27T01:02:03.123Z')=>({request:{...target,request_id:id(n),request_sha256:'a'.repeat(64),input_sha256:'b'.repeat(64),content_sha256:'c'.repeat(64),owner_epoch:1,source_protocol:'current_task_delivery_v1',created_at},control:{job_state:'pending',body_erased:false}})
const wire=(patch={})=>({protocol:'agent_paid_review_history_v1',...target,items:[item()],limit:20,has_more:false,next_cursor:null,...patch})
const badQuery=e=>e.status===400&&e.code==='invalid_agent_review_history_query'
const badCursor=e=>e.status===400&&e.code==='invalid_agent_review_history_cursor'
const unavailable=e=>e.status===409&&e.code==='agent_review_history_unavailable'

test('closed query defaults, numeric bounds and strict own data descriptors',()=>{
  assert.deepEqual(q,{...target,limit:20,before:null})
  for(const n of [1,20])assert.equal(query({...target,limit:n,before:encode(position())}).limit,n)
  for(const raw of [null,[],{}, {...target,owner:id(4)},{...target,issuer:'native'},{...target,offset:0},{...target,sort:'desc'},{...target,purpose:'all'},{...target,spec_id:id(1).toUpperCase().replace('4000','A000')},...['20',0,21,NaN,Infinity,1.5,undefined].map(limit=>({...target,limit}))])assert.throws(()=>query(raw),badQuery)
  let reads=0;const accessor={...target};Object.defineProperty(accessor,'limit',{get(){reads++;return 20}})
  assert.throws(()=>query(accessor),badQuery);assert.equal(reads,0)
  assert.throws(()=>query({...target,[Symbol('owner')]:id(4)}),badQuery)
  assert.throws(()=>query({...target,before:''}),badCursor)
})
test('HTTP query rejects aliases, duplicate/unknown keys, malformed limits and fragments',()=>{
  const path=`/api/v2/agent-reviews?spec_id=${id(1)}&run_id=${id(2)}&purpose=evaluate`
  assert.deepEqual(url(path),q);assert.deepEqual(url(path+'&limit=1&before='+encode(position())),{...q,limit:1,before:encode(position())})
  for(const raw of [path+'&owner='+id(4),path+'&run_id='+id(2),path+'&before=x&before=y',path+'&%6cimit=1',path+'&limit=%31',path.replace('&purpose=evaluate',''),path+'#private','https://native.invalid'+path,path.replace('/agent-reviews','/agent-%72eviews'),'/api/v2/x/../'+path.slice(8),...['0','01','20.0','+1',' 1','21','1e1',''].map(n=>path+'&limit='+n)])assert.throws(()=>url(raw),badQuery)
})
test('cursor is canonical unpadded base64url and exact UTF8 JSON with real microsecond UTC calendar',()=>{
  for(const date of ['0001-01-01T00:00:00.000001Z','2000-02-29T23:59:59.999999Z','9999-12-31T23:59:59.999999Z'])assert.deepEqual(cursor(encode(position(3,date))),position(3,date))
  const good=encode(position())
  for(const raw of ['',good+'=',good+'\n','v2.'+good.slice(3),good.replace('v1.','v1.+'), 'x'.repeat(257),rawCursor('{"request_id":"'+id(3)+'","created_at":"2026-10-27T01:02:03.123456Z"}'),rawCursor(' '+JSON.stringify(position())),rawCursor(JSON.stringify({...position(),owner:id(4)})),rawCursor('{"created_at":"2026-10-27T01:02:03.123456Z","request_id":"'+id(3)+'","request_id":"'+id(3)+'"}'),'v1.'+Buffer.from([0xff]).toString('base64url')])assert.throws(()=>cursor(raw),badCursor)
  for(const date of ['0000-01-01T00:00:00.000000Z','1900-02-29T01:00:00.000000Z','2026-02-30T01:00:00.000000Z','2026-01-01T24:00:00.000000Z','2026-01-01T00:00:60.000000Z','2026-01-01T00:00:00.123Z','2026-01-01T00:00:00.123456+00:00'])assert.throws(()=>cursor(rawCursor(JSON.stringify(position(3,date)))),badCursor)
  // Valid fixed-size positions happen to need no pad bits. Also reject
  // alternate low bits on a noncanonical payload that does need padding.
  const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
  const bitCursor=rawCursor(JSON.stringify(position())+' '),remainder=bitCursor.slice(3).length%4
  assert.notEqual(remainder,0)
  const mask=remainder===2?15:3,index=alphabet.indexOf(bitCursor.at(-1)),stem=bitCursor.slice(0,-1)
  for(let low=1;low<=mask;low++)assert.throws(()=>cursor(stem+alphabet[(index&~mask)|low]),badCursor)
})
test('cursor rejects a UTF8 BOM prefix rather than silently normalizing noncanonical bytes',()=>{
  const expected=position(),canonical=Buffer.from(JSON.stringify(expected),'utf8')
  assert.deepEqual(cursor('v1.'+canonical.toString('base64url')),expected)
  const prefixed='v1.'+Buffer.concat([Buffer.from([0xef,0xbb,0xbf]),canonical]).toString('base64url')
  assert.throws(()=>cursor(prefixed),badCursor)
  assert.throws(()=>query({...target,before:prefixed}),badCursor)
  assert.throws(()=>url(`/api/v2/agent-reviews?spec_id=${id(1)}&run_id=${id(2)}&purpose=evaluate&before=${prefixed}`),badCursor)
})
test('closed pages copy immutable snapshots and permit genuine microsecond ties without inventing UUID order',()=>{
  const raw=wire({items:[item(3),item(9)]}),parsed=page(raw,q)
  assert.deepEqual(parsed,raw);raw.items[0].request.request_sha256='d'.repeat(64);assert.equal(parsed.items[0].request.request_sha256,'a'.repeat(64))
  for(const job of ['pending','cancelled','erased'])assert.equal(page(wire({items:[{...item(),control:{job_state:job,body_erased:job==='erased'}}]}),q).items[0].control.job_state,job)
  assert.equal(page(wire({items:[]}),q).items.length,0)
  const selected=query({...target,limit:1}),next=encode(position())
  assert.equal(page(wire({limit:1,has_more:true,next_cursor:next}),selected).next_cursor,next)
  const before=encode(position(8,'2026-10-27T01:02:03.123999Z'))
  assert.equal(page(wire({limit:1,has_more:true,next_cursor:next}),query({...target,limit:1,before})).items[0].request.request_id,id(3))
})
test('page invariant violations and forbidden receipt/private fields fail closed',()=>{
  for(const patch of [{recorded:true},{available:false},{execution:{}},{items:[item(),item()]},{items:[item(3),item(4,'2026-10-27T01:02:03.124Z')]},{items:Array.from({length:21},(_,i)=>item(i+3))},{limit:1},{has_more:true},{has_more:true,items:[],next_cursor:encode(position())},{next_cursor:encode(position())},{purpose:'optimize'},{items:[{...item(),choice:{}}]},{items:[{...item(),control:{job_state:'pending',body_erased:true}}]},{items:[{...item(),control:{job_state:null,body_erased:false}}]},{items:[{...item(),request:{...item().request,owner_epoch:0}}]},{items:[{...item(),request:{...item().request,created_at:'2026-02-30T01:00:00.000Z'}}]}])assert.throws(()=>page(wire(patch),q),unavailable)
  const one=query({...target,limit:1})
  for(const next of [encode(position(4)),encode(position(3,'2026-10-27T01:02:03.124000Z'))])assert.throws(()=>page(wire({limit:1,has_more:true,next_cursor:next}),one),unavailable)
  assert.throws(()=>page(wire(),query({...target,before:encode(position())})),unavailable)
  let gets=0;const unsafe=[item()];Object.defineProperty(unsafe,'0',{get(){gets++;return item()}})
  assert.throws(()=>page(wire({items:unsafe}),q),unavailable);assert.equal(gets,0)
})
test('SQL candidate preserves exact microseconds, validates historical epoch and refuses missing jobs/corrupt lookahead',()=>{
  const {created_at,...request}=item().request,raw={...request,owner_epoch:'1',created_at_us:position().created_at,job_state:'pending',body_erased:false},parsed=candidate(raw,q)
  assert.deepEqual(parsed.position,position());assert.equal(parsed.item.request.created_at,created_at)
  for(const patch of [{owner_epoch:1},{owner_epoch:'01'},{owner_epoch:'9007199254740990'},{job_state:null},{job_state:'erased'},{created_at_us:new Date()},{created_at_us:'2026-02-30T00:00:00.000001Z'},{owner_user_id:id(4)},{spec_id:id(9)}])assert.throws(()=>candidate({...raw,...patch},q),unavailable)
  assert.ok(compare(position(3,'2026-10-27T01:02:03.123457Z'),position(9))>0)
  assert.ok(compare(position(9),position(3))>0)
})
