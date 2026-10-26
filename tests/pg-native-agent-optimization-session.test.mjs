import test from 'node:test'
import assert from 'node:assert/strict'
import {createPgNativeOptimizationSession} from '../src/lib/pgNativeAgentOptimizationSession.ts'
import {PgNativePilotError} from '../src/lib/pgNativePilotApi.ts'
import {draft,choice,before,run,spec,request,feedbackId,previewFor,receiptFor,historyFor,feedbackStatus,collaboration} from './helpers/pg-native-optimization-fixture.mjs'
const turn=()=>new Promise(resolve=>setImmediate(resolve)),input=()=>({name:draft.name,spec:structuredClone(draft.spec)})
async function fixture(){
  const calls=[];let keys=0,changed=0,expired=0
  const api={getAgentFeedback:async()=>feedbackStatus(),getAgent:async()=>structuredClone(before),getAgentCollaboration:async()=>collaboration(),getAgentOptimizations:async()=>historyFor(),previewAgentOptimization:async body=>{calls.push(['preview',structuredClone(body)]);return previewFor(body)},acceptAgentOptimization:async body=>{calls.push(['accept',structuredClone(body)]);throw new PgNativePilotError(0,'lost')},confirmAgentOptimization:async body=>{calls.push(['confirm',structuredClone(body)]);return receiptFor(body,{replayed:true})}}
  const model=createPgNativeOptimizationSession(api,{key:()=>{keys++;return request},onChanged:()=>{changed++},onExpired:()=>{expired++}})
  model.setScopes({available:true,accept:true});model.setActive(true);await model.select(run)
  return {api,model,calls,keys:()=>keys,changed:()=>changed,expired:()=>expired}
}
test('manual acceptance needs a checked current feedback/owner role, readonly preview and explicit confirmation; full ambiguous original is frozen and coalesced',async()=>{
  const f=await fixture();try{
    await f.model.accept(true);assert.equal(f.calls.length,0);await f.model.prepare(input());assert.equal(f.calls.length,1);assert.equal(f.model.snapshot().preview.recorded,false)
    await f.model.accept(false);assert.equal(f.keys(),0)
    let resolve;f.api.acceptAgentOptimization=body=>{f.calls.push(['accept',structuredClone(body)]);assert.ok(Object.isFrozen(body));assert.ok(Object.isFrozen(body.spec.model_binding));assert.ok(Object.isFrozen(body.spec.task_plan));return new Promise(done=>{resolve=done})}
    const one=f.model.accept(true),two=f.model.accept(true);assert.equal(one,two);assert.equal(f.keys(),1);await turn();resolve({...receiptFor(),candidate_sha256:'bad'});await one
    const view=f.model.snapshot();assert.ok(view.pending);assert.equal(view.pending.request_id,request);assert.equal(view.pending.spec,undefined)
    await f.model.prepare({name:'replacement',spec:{goal:'replacement'}});assert.equal(f.calls.length,2)
    await f.model.confirm();assert.equal(f.model.snapshot().pending,null);assert.equal(f.changed(),1);assert.deepEqual(f.calls.at(-1)[1],choice)
  }finally{f.model.dispose()}
})
test('closed new acceptance, unavailable capabilities and navigation preserve one original for readonly recovery without changing the candidate or source run',async()=>{
  const f=await fixture();try{
    await f.model.prepare(input());await f.model.accept(true);const original=f.calls.at(-1)[1]
    f.model.setActive(false);assert.equal(f.model.snapshot().pending,null);f.model.setScopes({available:false,accept:false});f.model.setActive(true);await f.model.confirm();assert.equal(f.calls.length,2)
    f.model.setScopes({available:true,accept:false});await f.model.select(spec);assert.equal(f.model.snapshot().runId,run)
    f.api.confirmAgentOptimization=async body=>{f.calls.push(['confirm',structuredClone(body)]);throw new PgNativePilotError(404,'missing')};await f.model.confirm();assert.ok(f.model.snapshot().pending)
    f.api.acceptAgentOptimization=async body=>{f.calls.push(['accept',structuredClone(body)]);throw new PgNativePilotError(409,'changed')};await f.model.retrySameRequest();assert.ok(f.model.snapshot().pending);assert.deepEqual(f.calls.at(-1)[1],original);assert.equal(f.keys(),1)
    f.api.confirmAgentOptimization=async body=>{f.calls.push(['confirm',structuredClone(body)]);return receiptFor(body,{replayed:true})};await f.model.confirm();assert.equal(f.model.snapshot().pending,null);assert.equal(f.model.snapshot().canAccept,false)
  }finally{f.model.dispose()}
})
test('a first definitive rejection invalidates the preview, while later rejection after uncertain submission cannot clear the original',async()=>{
  const f=await fixture();try{
    await f.model.prepare(input());f.api.acceptAgentOptimization=async()=>{throw new PgNativePilotError(409,'role_changed')};await f.model.accept(true);assert.equal(f.model.snapshot().pending,null);assert.equal(f.model.snapshot().preview,null)
    f.api.acceptAgentOptimization=async()=>{throw new PgNativePilotError(500,'audit_failed')};await f.model.prepare(input());await f.model.accept(true);assert.ok(f.model.snapshot().pending)
    f.api.acceptAgentOptimization=async()=>{throw new PgNativePilotError(403,'closed')};await f.model.retrySameRequest();assert.ok(f.model.snapshot().pending)
  }finally{f.model.dispose()}
})
test('source/version mismatch, shared editor role and erased feedback cannot produce an acceptance preview',async()=>{
  const f=await fixture();try{
    f.api.getAgentCollaboration=async()=>({...collaboration(),revision:8});await f.model.refresh();assert.equal(f.model.snapshot().role,null);await f.model.prepare(input());assert.equal(f.calls.length,0)
    f.api.getAgentCollaboration=async()=>({...collaboration(),role:'editor'});await f.model.refresh();assert.equal(f.model.snapshot().role,null)
    f.api.getAgentCollaboration=async()=>collaboration();f.api.getAgentFeedback=async()=>({...feedbackStatus(),state:'erased',current:null});await f.model.refresh();await f.model.prepare(input());assert.equal(f.calls.length,0)
  }finally{f.model.dispose()}
})
test('changing a candidate invalidates confirmation, disabled fresh acceptance keeps preview readable, and neither event calls a provider',async()=>{
  const f=await fixture();try{
    await f.model.prepare(input());f.model.invalidatePreview();await f.model.accept(true);assert.equal(f.keys(),0)
    f.model.setScopes({available:true,accept:false});await f.model.prepare(input());assert.ok(f.model.snapshot().preview);await f.model.accept(true);assert.equal(f.keys(),0);assert.deepEqual(f.calls.map(v=>v[0]),['preview','preview'])
  }finally{f.model.dispose()}
})
test('late reads, preview replies and committed acceptance cannot repaint another tab or employee; logout destroys the private pending body',async()=>{
  const f=await fixture();try{
    let resolve;f.api.previewAgentOptimization=()=>new Promise(done=>{resolve=done});const work=f.model.prepare(input());await turn();f.model.setActive(false);resolve(previewFor());await work;assert.equal(f.model.snapshot().preview,null)
    f.model.setActive(true);await f.model.select(run)
    const changing=f.model.prepare(input());await turn();await f.model.select(spec);assert.equal(f.model.snapshot().busy,false);resolve(previewFor());await changing;assert.equal(f.model.snapshot().preview,null)
    await f.model.select(run);f.api.previewAgentOptimization=async body=>previewFor(body);await f.model.prepare(input())
    f.api.acceptAgentOptimization=()=>new Promise(done=>{resolve=done});const acceptance=f.model.accept(true);await turn();f.model.dispose();resolve(receiptFor());await acceptance;assert.equal(f.model.snapshot().pending,null);assert.equal(f.changed(),0);await f.model.confirm()
  }finally{f.model.dispose()}
})
test('expired Native employee Cookie clears original acceptance and fences any further retry',async()=>{
  const f=await fixture();try{
    await f.model.prepare(input());f.api.acceptAgentOptimization=async()=>{throw new PgNativePilotError(401,'expired')};await f.model.accept(true);assert.equal(f.expired(),1);assert.equal(f.model.snapshot().pending,null);await f.model.retrySameRequest();assert.equal(f.changed(),0)
  }finally{f.model.dispose()}
})
