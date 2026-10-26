import test from 'node:test'
import assert from 'node:assert/strict'
import {createPgNativeFeedbackSession} from '../src/lib/pgNativeAgentFeedbackSession.ts'
import {PgNativePilotError} from '../src/lib/pgNativePilotApi.ts'
import {choice,run,request,other,contentHash,feedbackHash,receiptFor,statusFor,emptyStatus} from './helpers/pg-native-feedback-fixture.mjs'
const turn=()=>new Promise(resolve=>setImmediate(resolve))
const input={rating:choice.rating,tags:choice.tags,comment:choice.comment,remember_lesson:choice.remember_lesson}
async function fixture(){
  const calls=[];let keys=0,value=emptyStatus()
  const api={getAgentFeedback:async id=>({...value,run_id:id}),changeAgentFeedback:async body=>{calls.push(['change',structuredClone(body)]);throw new PgNativePilotError(0,'lost')},confirmAgentFeedback:async body=>{calls.push(['confirm',structuredClone(body)]);value=statusFor(body);return receiptFor(body,{replayed:true})}}
  const model=createPgNativeFeedbackSession(api,{key:()=>{keys++;return keys===1?request:other}})
  model.setScopes({available:true,submit:true,lessons:true});model.setActive(true);await model.select(run)
  return {model,api,calls,keys:()=>keys,setStatus:next=>{value=next}}
}
test('feedback submission requires explicit statement and lesson choices and coalesces one frozen ambiguous original without exposing raw pending text',async()=>{
  const f=await fixture()
  try{
    await f.model.submit(input,false);assert.equal(f.calls.length,0)
    f.model.setScopes({available:true,submit:true,lessons:false});await f.model.submit(input,true);assert.equal(f.calls.length,0)
    f.model.setScopes({available:true,submit:true,lessons:true})
    let resolve;f.api.changeAgentFeedback=body=>{f.calls.push(['change',structuredClone(body)]);assert.ok(Object.isFrozen(body));assert.ok(Object.isFrozen(body.tags));return new Promise(done=>{resolve=done})}
    const first=f.model.submit(input,true),second=f.model.submit({...input,comment:'replacement'},true);assert.equal(first,second);assert.equal(f.keys(),1)
    await turn();assert.equal(f.calls.length,1);assert.deepEqual(f.calls[0][1],choice)
    assert.doesNotMatch(JSON.stringify(f.model.snapshot()),/syntheticFixturePrivate/)
    resolve({...receiptFor(),feedback_sha256:'invalid'});await first;assert.ok(f.model.snapshot().pending)
    await f.model.submit({...input,comment:'another replacement'},true);assert.equal(f.keys(),1);assert.equal(f.calls.length,1)
    f.setStatus(statusFor());await f.model.confirm();assert.equal(f.model.snapshot().pending,null);assert.equal(f.model.snapshot().status.state,'active')
  }finally{f.model.dispose()}
})
test('navigation, capability outage and disabled new submission retain the exact original body for readonly confirmation and same-request recovery',async()=>{
  const f=await fixture()
  try{
    await f.model.submit(input,true);const original=f.calls[0][1]
    f.model.setActive(false);assert.equal(f.model.snapshot().pending,null)
    f.model.setScopes({available:false,submit:false,lessons:false});f.model.setActive(true);await f.model.confirm();assert.equal(f.calls.length,1)
    f.model.setScopes({available:true,submit:false,lessons:false});await turn();assert.equal(f.model.snapshot().pending.request_id,request)
    await f.model.select(other);assert.equal(f.model.snapshot().runId,run);assert.match(f.model.snapshot().error,/原任务/)
    f.api.confirmAgentFeedback=async body=>{f.calls.push(['confirm',structuredClone(body)]);throw new PgNativePilotError(404,'not_found')};await f.model.confirm();assert.ok(f.model.snapshot().pending)
    await f.model.retrySameRequest();assert.deepEqual(f.calls.at(-1)[1],original);assert.equal(f.keys(),1)
    f.api.confirmAgentFeedback=async body=>{f.calls.push(['confirm',structuredClone(body)]);f.setStatus(statusFor(body));return receiptFor(body,{replayed:true})}
    await f.model.confirm();assert.deepEqual(f.calls.at(-1)[1],original);assert.equal(f.model.snapshot().pending,null);assert.equal(f.model.snapshot().canSubmit,false)
  }finally{f.model.dispose()}
})
test('a definitive initial rejection permits a fresh explicit choice but a later rejection cannot replace an already ambiguous original',async()=>{
  const f=await fixture()
  try{
    f.api.changeAgentFeedback=async body=>{f.calls.push(['change',structuredClone(body)]);throw new PgNativePilotError(409,'source_changed')}
    await f.model.submit(input,true);assert.equal(f.model.snapshot().pending,null);assert.equal(f.keys(),1)
    f.api.changeAgentFeedback=async body=>{f.calls.push(['change',structuredClone(body)]);throw new PgNativePilotError(0,'lost')}
    await f.model.submit(input,true);assert.equal(f.keys(),2);const original=f.calls.at(-1)[1]
    f.api.changeAgentFeedback=async body=>{f.calls.push(['change',structuredClone(body)]);throw new PgNativePilotError(409,'source_changed')}
    await f.model.retrySameRequest();assert.deepEqual(f.calls.at(-1)[1],original);assert.ok(f.model.snapshot().pending)
    await f.model.submit({...input,remember_lesson:false},true);assert.equal(f.keys(),2)
  }finally{f.model.dispose()}
})
test('older reads and late committed feedback replies cannot repaint another selection, hidden navigation or a disposed employee session',async()=>{
  const f=await fixture()
  try{
    let resolve;f.api.getAgentFeedback=()=>new Promise(done=>{resolve=done});const old=f.model.refresh();await turn()
    f.api.getAgentFeedback=async id=>({...emptyStatus(),run_id:id});await f.model.select(other);resolve(emptyStatus());await old;assert.equal(f.model.snapshot().status.run_id,other)
    await f.model.select(run);f.api.changeAgentFeedback=body=>{f.calls.push(['change',structuredClone(body)]);return new Promise(done=>{resolve=done})}
    const work=f.model.submit(input,true);await turn();f.model.setActive(false);resolve(receiptFor());await work;assert.equal(f.model.snapshot().status,null)
    f.model.setActive(true);assert.ok(f.model.snapshot().pending);f.model.dispose();await f.model.confirm();assert.equal(f.calls.length,1);assert.equal(f.model.snapshot().pending,null)
  }finally{f.model.dispose()}
})
test('privacy erasure and forgetting a stale lesson stay explicit and available after admission closes, including unchanged original retry bodies',async()=>{
  const f=await fixture()
  try{
    f.setStatus(statusFor(choice,{hidden:true}));await f.model.refresh();f.model.setScopes({available:true,submit:false,lessons:false})
    await f.model.forget(request,false);assert.equal(f.calls.length,0)
    await f.model.forget(request,true);assert.equal(f.calls.length,0);assert.equal(f.model.snapshot().pending,null);assert.match(f.model.snapshot().error,/核对/)
  }finally{f.model.dispose()}
  // A request ID must differ from the lesson ID. Use a fresh employee session
  // with a distinct key to exercise the actual privacy mutation and recovery.
  let state=statusFor(choice,{hidden:true}),last
  const api={getAgentFeedback:async()=>state,changeAgentFeedback:async body=>{last=structuredClone(body);throw new PgNativePilotError(0,'lost')},confirmAgentFeedback:async body=>receiptFor(body,{replayed:true})}
  let keys=0;const model=createPgNativeFeedbackSession(api,{key:()=>keys++===0?other:'66666666-6666-4666-8666-666666666666'});model.setScopes({available:true,submit:false,lessons:false});model.setActive(true);await model.select(run)
  try{
    await model.forget(request,true);assert.equal(last.action,'forget_lesson');assert.equal(last.expected_content_sha256,contentHash);state={...state,lessons:[]};await model.confirm();assert.match(model.snapshot().notice,/反馈仍保留/)
    await model.erase(false);assert.equal(last.action,'forget_lesson');await model.erase(true);const erase=structuredClone(last);assert.equal(erase.expected_feedback_sha256,feedbackHash)
    await model.retrySameRequest();assert.deepEqual(last,erase)
    state={...emptyStatus(),revision:2,state:'erased',source:null};await model.confirm();assert.equal(model.snapshot().status.state,'erased');assert.match(model.snapshot().notice,/全部/)
  }finally{model.dispose()}
})
test('feedback statement success with failed or unconfirmed lesson storage clears only the statement request and performs readonly refresh',async()=>{
  for(const decision of ['write_failed','source_unavailable','writes_disabled',null]){
    const f=await fixture()
    try{
      let changes=0;f.api.changeAgentFeedback=async body=>{changes++;f.setStatus(statusFor(body,{decision}));return receiptFor(body,{decision})}
      await f.model.submit(input,true);assert.equal(f.model.snapshot().pending,null);assert.equal(f.model.snapshot().status.state,'active');assert.equal(f.model.snapshot().status.lessons.length,0);assert.match(f.model.snapshot().notice,/反馈已记录/)
      await f.model.confirm();await f.model.retrySameRequest();assert.equal(changes,1)
    }finally{f.model.dispose()}
  }
})
test('expired Cookie clears private original intent and logout fences a late feedback reply without retrying any task',async()=>{
  let expired=0,changes=0
  const api={getAgentFeedback:async()=>emptyStatus(),changeAgentFeedback:async()=>{changes++;throw new PgNativePilotError(401,'expired')},confirmAgentFeedback:async()=>{throw Error('unexpected confirmation')}}
  const model=createPgNativeFeedbackSession(api,{key:()=>request,onExpired:()=>{expired++}});model.setScopes({available:true,submit:true,lessons:true});model.setActive(true);await model.select(run)
  await model.submit(input,true);assert.equal(expired,1);assert.equal(model.snapshot().pending,null);await model.retrySameRequest();assert.equal(changes,1)
  const f=await fixture();let resolve;f.api.changeAgentFeedback=body=>{f.calls.push(['change',body]);return new Promise(done=>{resolve=done})};const work=f.model.submit(input,true);await turn();f.model.dispose();resolve(receiptFor());await work;assert.equal(f.model.snapshot().runId,null);assert.equal(f.model.snapshot().status,null)
})
