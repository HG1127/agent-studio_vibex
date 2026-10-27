import test from 'node:test'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {createPgNativeAgentReviewSession} from '../src/lib/pgNativeAgentReviewSession.ts'
import {PgNativePilotError} from '../src/lib/pgNativePilotApi.ts'
import {agentReviewScoreDimensions} from '../src/lib/pgNativeAgentReview.ts'
const uuid=n=>n.toString(16).padStart(8,'0')+'-0000-0000-0000-000000000000',clone=v=>structuredClone(v),turn=()=>new Promise(done=>setImmediate(done))
const target={purpose:'evaluate',spec_id:uuid(100),run_id:uuid(200)},at='2026-10-27T01:02:03.000Z'
const order=v=>Array.isArray(v)?v.map(order):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,order(v[k])])):v,sha=v=>createHash('sha256').update(JSON.stringify(order(v))).digest('hex')
const cursor=row=>'v1.'+Buffer.from(JSON.stringify({created_at:row.request.created_at.replace('Z','123Z'),request_id:row.request.request_id})).toString('base64url')
const row=(n=1)=>({request:{request_id:uuid(n),...target,request_sha256:'a'.repeat(64),input_sha256:'b'.repeat(64),content_sha256:'c'.repeat(64),owner_epoch:3,source_protocol:'current_task_delivery_v1',created_at:new Date(Date.parse(at)-n*1000).toISOString()},control:{job_state:'pending',body_erased:false}})
function page(rows,query){const start=query.before?rows.findIndex(r=>r.request.request_id===JSON.parse(Buffer.from(query.before.slice(3),'base64url')).request_id)+1:0,items=rows.slice(start,start+query.limit),more=rows.length>start+items.length;return {protocol:'agent_paid_review_history_v1',purpose:query.purpose,spec_id:query.spec_id,run_id:query.run_id,items:clone(items),limit:query.limit,has_more:more,next_cursor:more?cursor(items.at(-1)):null}}
const cr=(body,replayed=false)=>({protocol:'agent_paid_review_control_receipt_v1',request_id:body.request_id,review_id:body.review_id,action:body.action,request_sha256:sha({protocol:'agent_paid_review_control_v1',...body}),created_at:at,recorded:true,replayed})
function current(item){const result={score:0,dimensions:agentReviewScoreDimensions.map(name=>({name,score:0,comment:'待核对'})),suggestions:[]},r=item.request;return {protocol:'agent_paid_review_view_v1',request:clone(r),execution:{job_state:item.control.job_state,lease_state:'succeeded',outcome:{status:'succeeded',completion_sha256:'e'.repeat(64),result_sha256:sha({protocol:'agent_paid_review_output_v1',request_id:r.request_id,purpose:r.purpose,input_sha256:r.input_sha256,result}),failure_code:null,created_at:at}},body_erased:item.control.body_erased,available:item.control.job_state==='pending',result:item.control.job_state==='pending'?result:null}}
async function fixture(count=1,enable=true){
  let rows=Array.from({length:count},(_,i)=>row(i+1)),keys=0,expired=0;const calls=[]
  const apply=body=>{rows=rows.map(r=>r.request.request_id===body.review_id?{...r,control:{job_state:body.action==='erase'?'erased':r.control.job_state==='erased'?'erased':'cancelled',body_erased:body.action==='erase'||r.control.body_erased}}:r)}
  const api={getAgentReviewSource:async t=>{calls.push(['source',clone(t)]);throw new PgNativePilotError(409,'agent_review_source_unavailable')},previewAgentReview:async c=>{calls.push(['preview',clone(c)]);return {protocol:'agent_paid_review_preview_v1',choice:clone(c),input_sha256:'b'.repeat(64),content_sha256:'c'.repeat(64),owner_epoch:3,source_protocol:'current_task_delivery_v1',byte_length:1000,output_token_limit:c.output_token_limit,recorded:false}},submitAgentReview:async s=>{calls.push(['submit',clone(s)]);throw new PgNativePilotError(0,'lost')},confirmAgentReview:async s=>{calls.push(['confirm',clone(s)]);return {protocol:'agent_paid_review_receipt_v1',request_id:s.request_id,spec_id:s.spec_id,run_id:s.run_id,purpose:s.purpose,request_sha256:sha({protocol:'agent_paid_review_intent_v1',...s}),input_sha256:s.expected_input_sha256,content_sha256:'c'.repeat(64),owner_epoch:3,source_protocol:'current_task_delivery_v1',created_at:at,state:'pending',body_erased:false,recorded:true,replayed:true}},changeAgentReviewControl:async body=>{calls.push(['control',clone(body)]);apply(body);return cr(body)},confirmAgentReviewControl:async body=>{calls.push(['control-confirm',clone(body)]);apply(body);return cr(body,true)},getAgentReview:async id=>{calls.push(['body',id]);throw new PgNativePilotError(409,'agent_opinion_source_unavailable')},listAgentReviewHistory:async query=>{calls.push(['history',clone(query)]);return page(rows,query)}}
  const model=createPgNativeAgentReviewSession(api,{key:()=>{keys++;return uuid(9000+keys)},onExpired:()=>expired++});model.setScopes({available:true,submit:false,...(enable?{history:true}:{})});model.setActive(true);await model.select(target)
  return {api,model,calls,keys:()=>keys,expired:()=>expired,rows:()=>clone(rows),setRows:v=>rows=clone(v)}
}
test('history defaults off and discovery is independent of failed source, model selection and fresh admission',async()=>{
  const f=await fixture(1,false);try{
    await f.model.refreshHistory();assert.equal(f.calls.filter(v=>v[0]==='history').length,0);assert.equal(f.model.snapshot().history,null)
    f.model.setScopes({available:true,submit:false,history:true});await f.model.refreshHistory();const v=f.model.snapshot();assert.equal(v.history.items.length,1);assert.equal(v.source,null);assert.equal(v.canSubmit,false);assert.equal(v.receipt,null);assert.equal(v.selectedMetadata,null);assert.equal(f.keys(),0)
  }finally{f.model.dispose()}
})
test('selected immutable metadata survives058 source409 and permits exact explicit cancel without any fake receipt',async()=>{
  const f=await fixture();try{
    await f.model.refreshHistory();await f.model.selectHistory(uuid(1));let v=f.model.snapshot();assert.equal(v.review,null);assert.ok(v.selectedMetadata);assert.equal(v.receipt,null)
    await f.model.cancel(false);assert.equal(f.keys(),0);await f.model.cancel(true);v=f.model.snapshot()
    const body=f.calls.find(v=>v[0]==='control')[1];assert.equal(body.review_id,uuid(1));assert.equal(body.expected_request_sha256,'a'.repeat(64));assert.equal(body.action,'cancel');assert.notEqual(body.request_id,body.review_id)
    assert.equal(v.selectedMetadata.control.job_state,'cancelled');assert.equal(v.receipt,null);assert.equal(v.review,null);assert.equal(f.calls.filter(v=>v[0]==='submit'||v[0]==='preview').length,0)
    assert.equal(v.history.items[0].recorded,undefined);assert.equal(v.selectedMetadata.replayed,undefined)
  }finally{f.model.dispose()}
})
test('metadata-only erase keeps one frozen ambiguous control until exact confirm, independent of history state',async()=>{
  const f=await fixture();try{
    await f.model.refreshHistory();await f.model.selectHistory(uuid(1));f.api.changeAgentReviewControl=async body=>{assert.ok(Object.isFrozen(body));f.calls.push(['control',clone(body)]);throw new PgNativePilotError(0,'lost')}
    await f.model.erase(true);const body=f.calls.find(v=>v[0]==='control')[1];assert.equal(f.model.snapshot().pending.kind,'control')
    const erased=row();erased.control={job_state:'erased',body_erased:true};f.setRows([erased]);await f.model.refreshHistory();assert.ok(f.model.snapshot().pending);assert.equal(f.calls.filter(v=>v[0]==='control-confirm').length,0)
    await f.model.selectHistory(uuid(1));assert.ok(f.model.snapshot().pending);assert.equal(f.keys(),1)
    await f.model.confirm();assert.equal(f.model.snapshot().pending,null);assert.equal(f.model.snapshot().selectedMetadata.control.body_erased,true);assert.deepEqual(f.calls.find(v=>v[0]==='control-confirm')[1],body)
  }finally{f.model.dispose()}
})
test('history selection reads actual zero result only through058 and pins all immutable request fields',async()=>{
  const f=await fixture();try{
    f.api.getAgentReview=async id=>{f.calls.push(['body',id]);return current(row())};await f.model.refreshHistory();await f.model.selectHistory(uuid(1));assert.equal(f.model.snapshot().review.result.score,0);assert.equal(f.model.snapshot().receipt,null)
    f.api.getAgentReview=async()=>{const v=current(row());v.request.request_sha256='f'.repeat(64);return v};await f.model.selectHistory(uuid(1));assert.equal(f.model.snapshot().review,null);assert.equal(f.model.snapshot().selectedMetadata.request.request_sha256,'a'.repeat(64))
    await f.model.selectHistory(uuid(999));assert.equal(f.keys(),0);assert.equal(f.model.snapshot().reviewId,uuid(1))
  }finally{f.model.dispose()}
})
test('one page is replaced by older page and refresh resets first page without accumulating rows',async()=>{
  const f=await fixture(41);try{
    await f.model.refreshHistory();assert.equal(f.model.snapshot().history.items.length,20);assert.equal(f.model.snapshot().history.items[0].request.request_id,uuid(1))
    await f.model.loadMoreHistory();assert.equal(f.model.snapshot().history.items.length,20);assert.equal(f.model.snapshot().history.items[0].request.request_id,uuid(21))
    await f.model.loadMoreHistory();assert.equal(f.model.snapshot().history.items.length,1);assert.equal(f.model.snapshot().history.items[0].request.request_id,uuid(41));assert.equal(f.model.snapshot().history.has_more,false)
    await f.model.refreshHistory();assert.equal(f.model.snapshot().history.items[0].request.request_id,uuid(1));assert.equal(f.model.snapshot().history.items.length,20)
    assert.equal(f.calls.filter(v=>v[0]==='history').at(-1)[1].before,null)
  }finally{f.model.dispose()}
})
test('preview/source invalidation does not cancel independent pending history ticket',async()=>{
  const f=await fixture();try{
    let resolve;f.api.listAgentReviewHistory=q=>new Promise(done=>resolve=()=>done(page(f.rows(),q)));const work=f.model.refreshHistory();assert.equal(f.model.snapshot().historyLoading,true)
    f.model.invalidatePreview();await f.model.refresh();resolve();await work;assert.equal(f.model.snapshot().history.items.length,1);assert.equal(f.model.snapshot().source,null)
  }finally{f.model.dispose()}
})
test('target/purpose/navigation/capability changes fence old pages without replacing pending employee state',async()=>{
  const f=await fixture();try{
    let resolve;f.api.listAgentReviewHistory=q=>new Promise(done=>resolve=()=>done(page(f.rows(),q)));const a=f.model.refreshHistory();await f.model.select({...target,run_id:uuid(201)});resolve();await a;assert.equal(f.model.snapshot().history,null)
    await f.model.select(target);const b=f.model.refreshHistory();f.model.setActive(false);resolve();await b;f.model.setActive(true);assert.equal(f.model.snapshot().history,null)
    const c=f.model.refreshHistory();f.model.setScopes({available:true,submit:false,history:false});resolve();await c;assert.equal(f.model.snapshot().history,null)
    f.model.setScopes({available:true,submit:false,history:true});assert.equal(f.model.snapshot().historyLoading,false)
  }finally{f.model.dispose()}
})
test('new first page wins over a delayed older-page response; page overlap is rejected',async()=>{
  const f=await fixture(41);try{
    await f.model.refreshHistory();const original=f.api.listAgentReviewHistory;let resolve
    f.api.listAgentReviewHistory=q=>q.before?new Promise(done=>resolve=()=>done(page(f.rows(),q))):original(q)
    const old=f.model.loadMoreHistory();await f.model.refreshHistory();resolve();await old;assert.equal(f.model.snapshot().history.items[0].request.request_id,uuid(1))
    f.api.listAgentReviewHistory=async q=>{const p=page(f.rows(),q);p.items[0]=row(1);return p};await f.model.loadMoreHistory();assert.ok(f.model.snapshot().historyError);assert.equal(f.model.snapshot().history.items[0].request.request_id,uuid(1))
  }finally{f.model.dispose()}
})
test('a history privacy update fences an older body read and never confirms or resurrects control data',async()=>{
  const f=await fixture();try{
    await f.model.refreshHistory();await f.model.selectHistory(uuid(1));let resolve;f.api.getAgentReview=()=>new Promise(done=>resolve=done)
    const body=f.model.read(uuid(1));await turn();const erased=row();erased.control={job_state:'erased',body_erased:true};f.setRows([erased]);await f.model.refreshHistory();resolve(current(row()));await body
    assert.equal(f.model.snapshot().review,null);assert.equal(f.model.snapshot().selectedMetadata.control.body_erased,true)
    f.setRows([row()]);await f.model.refreshHistory();assert.ok(f.model.snapshot().historyError);assert.equal(f.model.snapshot().selectedMetadata.control.body_erased,true);assert.equal(f.model.snapshot().history,null)
  }finally{f.model.dispose()}
})
test('snapshot edits cannot change metadata control hash and history-only selection cannot create paid submission',async()=>{
  const f=await fixture();try{
    await f.model.refreshHistory();const snapshot=f.model.snapshot();snapshot.history.items[0].request.request_sha256='f'.repeat(64);await f.model.selectHistory(uuid(1));const selected=f.model.snapshot();selected.selectedMetadata.request.request_sha256='e'.repeat(64)
    await f.model.submit(true);assert.equal(f.keys(),0);assert.equal(f.model.snapshot().receipt,null);await f.model.erase(true);assert.equal(f.calls.find(v=>v[0]==='control')[1].expected_request_sha256,'a'.repeat(64));assert.equal(f.calls.filter(v=>v[0]==='submit').length,0)
  }finally{f.model.dispose()}
})
test('metadata list does not overwrite or confirm a frozen original paid submission',async()=>{
  const f=await fixture();try{
    f.api.getAgentReviewSource=async t=>({protocol:'agent_review_source_v1',...t,expected_source_sha256:'d'.repeat(64),expected_spec_revision:2,expected_spec_sha256:'e'.repeat(64),source_protocol:'current_task_delivery_v1',recorded:false})
    f.model.setScopes({available:true,submit:true,history:true});await f.model.refresh();await f.model.prepare({model_binding:{connection_id:uuid(300),connection_revision:1,model_id:'synthetic'},output_token_limit:2048,feedback_sources:[]});await f.model.submit(true)
    const pending=f.model.snapshot().pending,original=f.calls.find(v=>v[0]==='submit')[1];assert.ok(pending)
    await f.model.refreshHistory();await f.model.selectHistory(uuid(1));assert.deepEqual(f.model.snapshot().pending,pending);assert.equal(f.model.snapshot().selectedMetadata,null);assert.equal(f.calls.filter(v=>v[0]==='confirm').length,0)
    await f.model.confirm();assert.equal(f.model.snapshot().pending,null);assert.deepEqual(f.calls.find(v=>v[0]==='confirm')[1],original);assert.equal(f.keys(),1)
  }finally{f.model.dispose()}
})
test('401/dispose destroys metadata and exact originals; capability outage hides but does not forge receipts',async()=>{
  const f=await fixture();try{
    await f.model.refreshHistory();await f.model.selectHistory(uuid(1));f.model.setScopes({available:true,submit:false});assert.ok(f.model.snapshot().selectedMetadata);f.model.setScopes({available:true,submit:false,history:true});assert.ok(f.model.snapshot().selectedMetadata)
    f.api.listAgentReviewHistory=async()=>{throw new PgNativePilotError(401,'expired')};await f.model.refreshHistory();assert.equal(f.expired(),1);assert.equal(f.model.snapshot().selectedMetadata,null);assert.equal(f.model.snapshot().history,null);await f.model.erase(true);assert.equal(f.keys(),0)
  }finally{f.model.dispose()}
  const g=await fixture();let resolve;g.api.listAgentReviewHistory=q=>new Promise(done=>resolve=()=>done(page(g.rows(),q)));const work=g.model.refreshHistory();g.model.dispose();resolve();await work;assert.equal(g.model.snapshot().history,null)
})
test('history failure is distinct from a valid empty page and retains selected control metadata',async()=>{
  const f=await fixture();try{
    await f.model.refreshHistory();await f.model.selectHistory(uuid(1));f.api.listAgentReviewHistory=async()=>({items:[]});await f.model.refreshHistory();assert.equal(f.model.snapshot().history,null);assert.ok(f.model.snapshot().historyError);assert.ok(f.model.snapshot().selectedMetadata)
    f.api.listAgentReviewHistory=async q=>page([],q);await f.model.refreshHistory();assert.deepEqual(f.model.snapshot().history.items,[]);assert.equal(f.model.snapshot().historyError,'');assert.ok(f.model.snapshot().selectedMetadata)
  }finally{f.model.dispose()}
})
test('a disposed employee history401 cannot expire a later employee session',async()=>{
  const f=await fixture();let reject;f.api.listAgentReviewHistory=()=>new Promise((_,fail)=>reject=fail);const work=f.model.refreshHistory();f.model.dispose();reject(new PgNativePilotError(401,'expired'));await work;assert.equal(f.expired(),0);assert.equal(f.model.snapshot().history,null)
})
test('HRC01 closing discovery preserves same-target metadata, immutable read binding and explicit privacy controls',async()=>{
  for(const scopes of [{available:true,submit:false,history:false},{available:true,submit:false}]){
    const f=await fixture();try{
      await f.model.refreshHistory();await f.model.selectHistory(uuid(1));const selected=f.model.snapshot().selectedMetadata,calls=f.calls.filter(v=>v[0]==='history').length
      f.model.setScopes(scopes);assert.deepEqual(f.model.snapshot().selectedMetadata,selected);assert.equal(f.model.snapshot().receipt,null);assert.equal(f.model.snapshot().history,null)
      await f.model.refreshHistory();await f.model.loadMoreHistory();await f.model.selectHistory(uuid(1));assert.equal(f.calls.filter(v=>v[0]==='history').length,calls)
      f.api.getAgentReview=async()=>{const value=current(row());value.request.request_sha256='f'.repeat(64);return value};await f.model.read(uuid(1));assert.equal(f.model.snapshot().review,null);assert.deepEqual(f.model.snapshot().selectedMetadata,selected)
      f.api.getAgentReview=async()=>{throw new PgNativePilotError(409,'agent_opinion_source_unavailable')};await f.model.erase(false);assert.equal(f.keys(),0);await f.model.erase(true)
      const control=f.calls.find(v=>v[0]==='control')[1];assert.equal(control.expected_request_sha256,selected.request.request_sha256);assert.equal(control.review_id,selected.request.request_id);assert.notEqual(control.request_id,control.review_id);assert.equal(f.keys(),1)
      assert.equal(f.calls.filter(v=>v[0]==='history').length,calls);assert.equal(f.calls.filter(v=>v[0]==='submit'||v[0]==='preview').length,0);assert.equal(f.model.snapshot().receipt,null)
    }finally{f.model.dispose()}
  }
})
test('HRC01 retained metadata stays hidden on navigation and is destroyed by target change or current401',async()=>{
  const f=await fixture();try{
    await f.model.refreshHistory();await f.model.selectHistory(uuid(1));f.model.setScopes({available:true,submit:false});f.model.setActive(false);assert.equal(f.model.snapshot().selectedMetadata,null);f.model.setActive(true);assert.ok(f.model.snapshot().selectedMetadata)
    await f.model.select({...target,run_id:uuid(201)});assert.equal(f.model.snapshot().selectedMetadata,null);await f.model.erase(true);assert.equal(f.keys(),0)
  }finally{f.model.dispose()}
  const g=await fixture();try{
    await g.model.refreshHistory();await g.model.selectHistory(uuid(1));g.model.setScopes({available:true,submit:false});g.api.getAgentReview=async()=>{throw new PgNativePilotError(401,'expired')};await g.model.read(uuid(1));assert.equal(g.expired(),1);assert.equal(g.model.snapshot().selectedMetadata,null);await g.model.erase(true);assert.equal(g.keys(),0)
  }finally{g.model.dispose()}
})
test('HRC02 accepted unselected cancelled/erased rows establish monotonic privacy before any selection',async()=>{
  for(const state of ['cancelled','erased']){
    const f=await fixture();try{
      const observed=row();observed.control={job_state:state,body_erased:state==='erased'};f.setRows([observed]);await f.model.refreshHistory();assert.equal(f.model.snapshot().selectedMetadata,null)
      f.setRows([row()]);await f.model.refreshHistory();assert.ok(f.model.snapshot().historyError);assert.equal(f.model.snapshot().history,null);await f.model.selectHistory(uuid(1));assert.equal(f.model.snapshot().selectedMetadata,null)
      f.api.getAgentReview=async()=>current(row());await f.model.read(uuid(1));assert.equal(f.model.snapshot().review,null)
    }finally{f.model.dispose()}
  }
  const g=await fixture();try{
    const cancelled=row();cancelled.control={job_state:'cancelled',body_erased:false};g.setRows([cancelled]);await g.model.refreshHistory()
    const erased=row();erased.control={job_state:'erased',body_erased:true};g.setRows([erased]);await g.model.refreshHistory();assert.equal(g.model.snapshot().history.items[0].control.body_erased,true)
    g.setRows([cancelled]);await g.model.refreshHistory();assert.ok(g.model.snapshot().historyError);assert.equal(g.model.snapshot().history,null)
  }finally{g.model.dispose()}
})
test('HRC02 an invalid later row cannot commit privacy observations from the earlier part of a page',async()=>{
  const f=await fixture(2);try{
    await f.model.refreshHistory();await f.model.selectHistory(uuid(2));const selected=f.model.snapshot().selectedMetadata
    const invalid=f.rows();invalid[0].control={job_state:'erased',body_erased:true};invalid[1].request.request_sha256='f'.repeat(64);f.setRows(invalid)
    await f.model.refreshHistory();assert.ok(f.model.snapshot().historyError);assert.equal(f.model.snapshot().history,null);assert.deepEqual(f.model.snapshot().selectedMetadata,selected)
    f.setRows([row(1),row(2)]);await f.model.refreshHistory();assert.equal(f.model.snapshot().historyError,'');assert.equal(f.model.snapshot().history.items[0].control.job_state,'pending')
    await f.model.selectHistory(uuid(1));assert.equal(f.model.snapshot().selectedMetadata.control.job_state,'pending');assert.equal(f.keys(),0)
  }finally{f.model.dispose()}
})
