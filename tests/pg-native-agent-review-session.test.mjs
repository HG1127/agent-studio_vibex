import test from 'node:test'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {createPgNativeAgentReviewSession} from '../src/lib/pgNativeAgentReviewSession.ts'
import {createPgNativePilotApi,PgNativePilotError} from '../src/lib/pgNativePilotApi.ts'
import {agentReviewFeeAcknowledgements,agentReviewScoreDimensions} from '../src/lib/pgNativeAgentReview.ts'
const id=n=>`${n.repeat(8)}-${n.repeat(4)}-${n.repeat(4)}-${n.repeat(4)}-${n.repeat(12)}`
const turn=()=>new Promise(done=>setImmediate(done)),clone=v=>structuredClone(v),at='2026-10-27T01:02:03.000Z'
const order=v=>Array.isArray(v)?v.map(order):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,order(v[k])])):v
const sha=v=>createHash('sha256').update(JSON.stringify(order(v))).digest('hex')
const target={purpose:'evaluate',spec_id:id('1'),run_id:id('2')},selection={model_binding:{connection_id:id('3'),connection_revision:3,model_id:'synthetic'},output_token_limit:2048,feedback_sources:[]}
const source=t=>({protocol:'agent_review_source_v1',...t,expected_source_sha256:'a'.repeat(64),expected_spec_revision:2,expected_spec_sha256:'b'.repeat(64),source_protocol:t.purpose==='evaluate'?'current_task_delivery_v1':'employee_statement_anchor_v1',recorded:false})
const preview=c=>({protocol:'agent_paid_review_preview_v1',choice:clone(c),input_sha256:'c'.repeat(64),content_sha256:'d'.repeat(64),owner_epoch:4,source_protocol:c.purpose==='evaluate'?'current_task_delivery_v1':'employee_statement_anchor_v1',byte_length:1024,output_token_limit:c.output_token_limit,recorded:false})
const original=()=>({action:'submit',...target,expected_source_sha256:'a'.repeat(64),expected_spec_revision:2,expected_spec_sha256:'b'.repeat(64),...clone(selection),evaluation_sources:[],request_id:id('4'),expected_input_sha256:'c'.repeat(64),confirm:true,fee_acknowledgement:agentReviewFeeAcknowledgements.evaluate})
const receipt=(s=original(),patch={})=>({protocol:'agent_paid_review_receipt_v1',request_id:s.request_id,spec_id:s.spec_id,run_id:s.run_id,purpose:s.purpose,request_sha256:sha({protocol:'agent_paid_review_intent_v1',...s}),input_sha256:s.expected_input_sha256,content_sha256:'d'.repeat(64),owner_epoch:4,source_protocol:s.purpose==='evaluate'?'current_task_delivery_v1':'employee_statement_anchor_v1',created_at:at,state:'pending',body_erased:false,recorded:true,replayed:false,...patch})
const cr=(c,patch={})=>({protocol:'agent_paid_review_control_receipt_v1',request_id:c.request_id,review_id:c.review_id,action:c.action,request_sha256:sha({protocol:'agent_paid_review_control_v1',...c}),created_at:at,recorded:true,replayed:true,...patch})
function view(s=original(),state='pending',withResult=false){
  const {protocol:_p,state:_s,body_erased,recorded:_r,replayed:_re,...request}=receipt(s,{state,body_erased:state==='erased'}),result={score:0,dimensions:agentReviewScoreDimensions.map(name=>({name,score:0,comment:'待核对'})),suggestions:[]}
  return {protocol:'agent_paid_review_view_v1',request,execution:{job_state:state,lease_state:withResult?'succeeded':null,outcome:withResult?{status:'succeeded',completion_sha256:'e'.repeat(64),result_sha256:sha({protocol:'agent_paid_review_output_v1',request_id:s.request_id,purpose:s.purpose,input_sha256:s.expected_input_sha256,result}),failure_code:null,created_at:at}:null},body_erased,available:withResult&&state==='pending',result:withResult&&state==='pending'?result:null}
}
async function fixture(){
  const calls=[];let keys=0,expired=0,stored=original(),state='pending'
  const api={
    getAgentReviewSource:async t=>{calls.push(['source',clone(t)]);return source(t)},
    previewAgentReview:async c=>{calls.push(['preview',clone(c)]);return preview(c)},
    submitAgentReview:async s=>{calls.push(['submit',clone(s)]);stored=clone(s);throw new PgNativePilotError(0,'lost')},
    confirmAgentReview:async s=>{calls.push(['confirm',clone(s)]);stored=clone(s);return receipt(s,{replayed:true})},
    changeAgentReviewControl:async c=>{calls.push(['control',clone(c)]);throw new PgNativePilotError(0,'lost')},
    confirmAgentReviewControl:async c=>{calls.push(['control-confirm',clone(c)]);state=c.action==='erase'?'erased':'cancelled';return cr(c)},
    getAgentReview:async reviewId=>{calls.push(['current',reviewId]);return view(stored,state)},
  }
  const model=createPgNativeAgentReviewSession(api,{key:()=>{keys++;return id(keys===1&&!model.snapshot().reviewId?'4':'7')},onExpired:()=>expired++})
  model.setScopes({available:true,submit:true});model.setActive(true);await model.select(target)
  return {api,model,calls,keys:()=>keys,expired:()=>expired}
}
test('source and safe preview precede explicit fee consent; one frozen single-flight intent survives invalid success',async()=>{
  const f=await fixture();try{
    await f.model.submit(true);assert.equal(f.keys(),0);await f.model.prepare(selection);assert.equal(f.model.snapshot().preview.recorded,false)
    await f.model.submit(false);assert.equal(f.keys(),0)
    let resolve;f.api.submitAgentReview=s=>{assert.ok(Object.isFrozen(s));assert.ok(Object.isFrozen(s.model_binding));assert.ok(Object.isFrozen(s.feedback_sources));f.calls.push(['submit',clone(s)]);return new Promise(done=>resolve=done)}
    const a=f.model.submit(true),b=f.model.submit(true);assert.equal(a,b);assert.equal(f.keys(),1);await turn();resolve({...receipt(),request_sha256:'f'.repeat(64)});await a
    const pending=f.model.snapshot().pending;assert.equal(pending.kind,'submit');assert.equal(pending.review_id,id('4'));assert.equal(pending.body,undefined)
    await f.model.prepare({...selection,output_token_limit:4096});await f.model.submit(true);assert.equal(f.keys(),1)
    await f.model.confirm();assert.equal(f.model.snapshot().pending,null);assert.equal(f.model.snapshot().review.available,false);assert.deepEqual(f.calls.find(v=>v[0]==='submit')[1],f.calls.find(v=>v[0]==='confirm')[1])
  }finally{f.model.dispose()}
})
test('hidden capabilities/navigation preserve original metadata and exact recovery after admission closes',async()=>{
  const f=await fixture();try{
    await f.model.prepare(selection);await f.model.submit(true);const body=f.calls.find(v=>v[0]==='submit')[1]
    f.model.setActive(false);assert.equal(f.model.snapshot().pending,null);f.model.setScopes({available:false,submit:false});f.model.setActive(true);await f.model.confirm();assert.equal(f.calls.filter(v=>v[0]==='confirm').length,0)
    f.model.setScopes({available:true,submit:false});await f.model.select({...target,run_id:id('8')});assert.deepEqual(f.model.snapshot().target,target)
    f.api.confirmAgentReview=async s=>{f.calls.push(['confirm',clone(s)]);throw new PgNativePilotError(404,'missing')};await f.model.confirm();assert.ok(f.model.snapshot().pending)
    f.api.submitAgentReview=async s=>{f.calls.push(['submit',clone(s)]);throw new PgNativePilotError(403,'closed')};await f.model.retrySameRequest();assert.ok(f.model.snapshot().pending);assert.deepEqual(f.calls.at(-1)[1],body);assert.equal(f.keys(),1)
    f.api.confirmAgentReview=async s=>receipt(s,{replayed:true});await f.model.confirm();assert.equal(f.model.snapshot().pending,null);assert.equal(f.model.snapshot().canSubmit,false)
  }finally{f.model.dispose()}
})
test('first definitive source conflict releases intent; rejection after unknown or readonly not-found cannot discard it',async()=>{
  const f=await fixture();try{
    await f.model.prepare(selection);f.api.submitAgentReview=async()=>{throw new PgNativePilotError(409,'changed')};await f.model.submit(true);assert.equal(f.model.snapshot().pending,null);assert.equal(f.model.snapshot().preview,null)
    await f.model.refresh();await f.model.prepare(selection);f.api.submitAgentReview=async()=>{throw new PgNativePilotError(500,'failed')};await f.model.submit(true);assert.ok(f.model.snapshot().pending)
    f.api.confirmAgentReview=async()=>{throw new PgNativePilotError(404,'missing')};await f.model.confirm();assert.ok(f.model.snapshot().pending)
    f.api.submitAgentReview=async()=>{throw new PgNativePilotError(409,'changed')};await f.model.retrySameRequest();assert.ok(f.model.snapshot().pending)
  }finally{f.model.dispose()}
})
test('source/selection mismatch and unsupported prior choices never enter preview or silently become empty parents',async()=>{
  const f=await fixture();try{
    await f.model.prepare({...selection,evaluation_sources:[{review_id:id('9')}]});assert.equal(f.calls.filter(v=>v[0]==='preview').length,0)
    await f.model.select({...target,purpose:'optimize'});await f.model.prepare(selection);assert.equal(f.model.snapshot().preview,null)
    const refs=[{run_id:target.run_id,feedback_id:id('5'),feedback_sha256:'f'.repeat(64)}];await f.model.prepare({...selection,feedback_sources:refs});assert.equal(f.model.snapshot().preview.choice.feedback_sources[0].feedback_id,id('5'))
    f.api.getAgentReviewSource=async t=>({...source(t),spec_id:id('8')});await f.model.refresh();assert.equal(f.model.snapshot().source,null);await f.model.prepare({...selection,feedback_sources:refs});assert.equal(f.model.snapshot().preview,null)
  }finally{f.model.dispose()}
})
test('source, target, model edits and submit capability changes fence late previews and clear fee prerequisites',async()=>{
  const f=await fixture();try{
    let resolve;f.api.previewAgentReview=c=>new Promise(done=>resolve=()=>done(preview(c)))
    const a=f.model.prepare(selection);await turn();f.model.invalidatePreview();resolve();await a;assert.equal(f.model.snapshot().preview,null)
    const b=f.model.prepare(selection);await turn();await f.model.select({...target,run_id:id('8')});resolve();await b;assert.equal(f.model.snapshot().preview,null)
    const c=f.model.prepare(selection);await turn();f.model.setScopes({available:true,submit:false});resolve();await c;assert.equal(f.model.snapshot().preview,null);assert.equal(f.model.snapshot().canSubmit,false)
    await f.model.submit(true);assert.equal(f.keys(),0)
  }finally{f.model.dispose()}
})
test('privacy controls remain reachable without fresh admission, hide output immediately and recover exact original',async()=>{
  const f=await fixture();try{
    await f.model.read(id('4'));f.model.setScopes({available:true,submit:false});await f.model.read(id('4'));assert.ok(f.model.snapshot().review)
    await f.model.erase(false);assert.equal(f.keys(),0)
    f.api.getAgentReview=async()=>view(original(),'pending',true);await f.model.read(id('4'));assert.equal(f.model.snapshot().review.result.score,0)
    let resolve;f.api.changeAgentReviewControl=c=>{f.calls.push(['control',clone(c)]);assert.ok(Object.isFrozen(c));return new Promise(done=>resolve=done)}
    const work=f.model.erase(true);assert.equal(f.model.snapshot().review,null);await turn();resolve({...cr(f.calls.at(-1)[1]),request_sha256:'f'.repeat(64)});await work
    assert.equal(f.model.snapshot().pending.kind,'control');const body=f.calls.find(v=>v[0]==='control')[1];assert.equal(body.review_id,id('4'));assert.notEqual(body.request_id,body.review_id)
    f.api.getAgentReview=async()=>view(original(),'erased',true);await f.model.confirm();assert.equal(f.model.snapshot().review.available,false);assert.equal(f.model.snapshot().review.execution.outcome.status,'succeeded');assert.equal(f.model.snapshot().pending,null)
    assert.deepEqual(f.calls.find(v=>v[0]==='control-confirm')[1],body)
  }finally{f.model.dispose()}
})
test('cancel uses separate control intent and never rewrites succeeded execution as no-charge',async()=>{
  const f=await fixture();try{
    f.api.getAgentReview=async()=>view(original(),'pending',true);await f.model.read(id('4'))
    await f.model.cancel(true);const body=f.calls.find(v=>v[0]==='control')[1];assert.equal(body.action,'cancel');assert.equal(body.expected_request_sha256,receipt().request_sha256)
    f.api.getAgentReview=async()=>view(original(),'cancelled',true);await f.model.confirm();assert.equal(f.model.snapshot().review.execution.outcome.status,'succeeded');assert.equal(f.model.snapshot().review.available,false);assert.doesNotMatch(f.model.snapshot().notice,/未收费|已退款/)
  }finally{f.model.dispose()}
})
test('old reads cannot refill another target or a privacy operation; forged current digest clears output',async()=>{
  const f=await fixture();try{
    let resolve;f.api.getAgentReview=()=>new Promise(done=>resolve=done);const a=f.model.read(id('4'));await turn();await f.model.select({...target,run_id:id('8')});resolve(view());await a;assert.equal(f.model.snapshot().review,null)
    await f.model.select(target);f.api.getAgentReview=async()=>view(original(),'pending',true);await f.model.read(id('4'));assert.equal(f.model.snapshot().review.result.score,0)
    f.api.getAgentReview=async()=>({...view(original(),'pending',true),result:{...view(original(),'pending',true).result,score:1}});await f.model.read(id('4'));assert.equal(f.model.snapshot().review,null)
  }finally{f.model.dispose()}
})
test('late mutation after hide is retained for explicit confirm; single flight cannot be replaced by new intent',async()=>{
  const f=await fixture();try{
    await f.model.prepare(selection);let resolve;f.api.submitAgentReview=s=>new Promise(done=>resolve=()=>done(receipt(s)))
    const a=f.model.submit(true);await turn();f.model.setActive(false);f.model.setActive(true);const b=f.model.retrySameRequest();assert.equal(a,b);assert.equal(f.keys(),1);resolve();await a
    assert.ok(f.model.snapshot().pending);await f.model.confirm();assert.equal(f.model.snapshot().pending,null);assert.equal(f.keys(),1)
  }finally{f.model.dispose()}
})
test('session disposal/401 destroys originals and fences source, preview and mutation continuations',async()=>{
  const f=await fixture();try{
    await f.model.prepare(selection);f.api.submitAgentReview=async()=>{throw new PgNativePilotError(401,'expired')};await f.model.submit(true);assert.equal(f.expired(),1);assert.equal(f.model.snapshot().pending,null);await f.model.retrySameRequest();assert.equal(f.keys(),1)
  }finally{f.model.dispose()}
  const g=await fixture();let resolve;g.api.previewAgentReview=c=>new Promise(done=>resolve=()=>done(preview(c)));const work=g.model.prepare(selection);await turn();g.model.dispose();resolve();await work;assert.equal(g.model.snapshot().preview,null)
})
test('snapshot mutations cannot alter private source or original body and known receipt binds current read identity',async()=>{
  const f=await fixture();try{
    await f.model.prepare(selection);const snapshot=f.model.snapshot();snapshot.preview.choice.model_binding.model_id='changed';await f.model.submit(true);assert.equal(f.calls.find(v=>v[0]==='submit')[1].model_binding.model_id,'synthetic')
    await f.model.confirm();f.api.getAgentReview=async()=>{const v=view();v.request.content_sha256='f'.repeat(64);return v};await f.model.read(id('4'));assert.equal(f.model.snapshot().review,null)
  }finally{f.model.dispose()}
})
test('SDK plus controller transport failure issues no hidden retries or ID replacement',async()=>{
  const seen=[];const api=createPgNativePilotApi(async(url,opts)=>{
    seen.push(url);if(url.endsWith('/source'))return new Response(JSON.stringify(source(target)))
    if(url.endsWith('/preview'))return new Response(JSON.stringify(preview(JSON.parse(opts.body))))
    throw Error('lost')
  })
  let keys=0;const model=createPgNativeAgentReviewSession(api,{key:()=>{keys++;return id('4')}});try{
    model.setScopes({available:true,submit:true});model.setActive(true);await model.select(target);await model.prepare(selection);await model.submit(true);await turn()
    assert.equal(keys,1);assert.equal(seen.filter(v=>v.endsWith('/submit')).length,1);assert.ok(model.snapshot().pending)
  }finally{model.dispose()}
})
test('logout or visibility loss before dispatch microtask prevents a queued send and retains only same-session recovery',async()=>{
  const f=await fixture();await f.model.prepare(selection);const work=f.model.submit(true);f.model.dispose();await work;assert.equal(f.calls.filter(v=>v[0]==='submit').length,0);assert.equal(f.model.snapshot().pending,null)
  const g=await fixture();try{await g.model.prepare(selection);const hidden=g.model.submit(true);g.model.setActive(false);await hidden;assert.equal(g.calls.filter(v=>v[0]==='submit').length,0);g.model.setActive(true);assert.ok(g.model.snapshot().pending);await g.model.confirm();assert.equal(g.calls.filter(v=>v[0]==='confirm').length,1)}finally{g.model.dispose()}
})
test('confirmed erasure/cancellation cannot be overwritten by a valid but earlier succeeded DTO',async()=>{
  const f=await fixture();try{
    f.api.getAgentReview=async()=>view(original(),'pending',true);await f.model.read(id('4'));await f.model.erase(true)
    await f.model.confirm();assert.equal(f.model.snapshot().pending,null);assert.equal(f.model.snapshot().review,null)
    await f.model.read(id('4'));assert.equal(f.model.snapshot().review,null)
    f.api.getAgentReview=async()=>view(original(),'erased',true);await f.model.read(id('4'));assert.equal(f.model.snapshot().review.body_erased,true)
  }finally{f.model.dispose()}
})
