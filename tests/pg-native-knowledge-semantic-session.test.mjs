import test from "node:test"
import assert from "node:assert/strict"
import {randomUUID} from "node:crypto"
import {createKnowledgeEmbeddingMutationSession} from "../src/lib/pgNativeKnowledgeEmbeddingSession.ts"
import {createKnowledgeQuerySession} from "../src/lib/pgNativeKnowledgeQuerySession.ts"
import {QUERY_CHARGE_ACKNOWLEDGEMENT} from "../services/pg-api/src/knowledge-query-contracts.ts"
const base=randomUUID(),profile=randomUUID(),connection=randomUUID(),document=randomUUID(),chunk=randomUUID()
const network=()=>Object.assign(Error("synthetic response loss"),{status:0})
const deferred=()=>{let resolve;const promise=new Promise(done=>resolve=done);return {resolve,promise}}
const request=(extra={})=>({request_id:randomUUID(),base_ids:[base],query:"only synthetic query",mode:"lexical",limit:8,...extra})
const receipt=(q,extra={})=>({request_id:q.request_id,status:"succeeded",error_code:"",billing_may_have_occurred:false,result:{retrieval:"lexical",total_matches:1,scanned_candidates:1,candidate_limit_reached:false,semantic_status:"skipped",semantic_indexed:0,semantic_total:1,shared_semantic_used:false,shared_lexical_only:false,
  items:[{base_id:base,document_id:document,chunk_id:chunk,filename:"evidence.txt",chunk_index:0,citation:"evidence.txt#chunk-0",text:"synthetic document evidence",score:5}]},...extra})

test("embedding settings loss freezes exact configuration and recovers through GET without an automatic write",async()=>{
  const posts=[];let current=null
  const payload={action:"configure",request_id:randomUUID(),expected_revision:0,connection_id:connection,connection_revision:1,model_name:"synthetic",base_url:"https://api.openai.com/v1"}
  const original=structuredClone(payload),saved={request_id:payload.request_id,action:"configure",revision:1,base_id:null,configured:true,queued_bases:1}
  const s=createKnowledgeEmbeddingMutationSession({async changeKnowledgeEmbeddingSettings(x){posts.push(structuredClone(x));throw network()},async getKnowledgeEmbeddingReceipt(){return current}})
  await assert.rejects(s.start({kind:"settings",payload}))
  payload.model_name="must not replace the frozen model"
  assert.throws(()=>s.start({kind:"settings",payload}),/pending/)
  assert.equal((await s.recover()).confirmed,false);assert.equal(posts.length,1)
  await assert.rejects(s.retry());assert.deepEqual(posts,[original,original])
  current=saved;assert.equal((await s.recover()).confirmed,true);assert.equal(s.snapshot().pending,null)
})

test("ambiguous index start retains its profile epoch, rejects forged receipts and never automatically reauthorizes",async()=>{
  let posts=0,current=null
  const payload={request_id:randomUUID(),expected_consent_revision:3,profile_id:profile,profile_revision:2,acknowledgement:"START_OWNER_EMBEDDING_INDEX_AND_ACCEPT_PROVIDER_CHARGES"}
  const s=createKnowledgeEmbeddingMutationSession({async authorizeKnowledgeIndex(){posts++;throw network()},async getKnowledgeIndexAuthorizationReceipt(){return current}})
  await assert.rejects(s.start({kind:"start",payload}));assert.equal(posts,1)
  current={request_id:payload.request_id,profile_id:randomUUID(),profile_revision:2,consent_revision:3,authorized:true}
  await assert.rejects(s.recover(),/invalid_embedding/);assert.ok(s.snapshot().pending)
  current={...current,profile_id:profile};assert.equal((await s.recover()).confirmed,true);assert.equal(posts,1)
})

test("embedding session reset fences late receipts and an initial definitive CAS failure permits refreshing the form",async()=>{
  const late=deferred(),payload={action:"disable",request_id:randomUUID(),expected_revision:1}
  const s=createKnowledgeEmbeddingMutationSession({changeKnowledgeEmbeddingSettings:()=>late.promise})
  const task=s.start({kind:"settings",payload});s.reset();late.resolve({item:{request_id:payload.request_id,action:"disable",revision:2,base_id:null,configured:false,queued_bases:0}})
  assert.equal((await task).stale,true);assert.equal(s.snapshot().pending,null)
  const conflict=createKnowledgeEmbeddingMutationSession({async changeKnowledgeEmbeddingSettings(){throw Object.assign(Error("stale"),{status:409})}})
  await assert.rejects(conflict.start({kind:"settings",payload}));assert.equal(conflict.snapshot().pending,null)
})

test("lost query submit is recovered read-only; running and completed requests never incur a second automatic POST",async()=>{
  const q=request({mode:"semantic",profile_id:profile,profile_revision:1,consent_revision:2,acknowledgement:QUERY_CHARGE_ACKNOWLEDGEMENT}),sent=[]
  let state={request_id:q.request_id,status:"prepared",error_code:"",billing_may_have_occurred:false,result:null}
  const s=createKnowledgeQuerySession({async submitKnowledgeQuery(x){sent.push(structuredClone(x));throw network()},async getKnowledgeQueryReceipt(){return state}})
  await assert.rejects(s.start(q));assert.throws(()=>s.retry(),/recovery_required/)
  assert.equal((await s.recover()).found,true);assert.equal(s.snapshot().locked,true)
  assert.throws(()=>s.start(request()),/pending/)
  state=receipt(q,{billing_may_have_occurred:true});state.result.retrieval="semantic";state.result.semantic_status="ok"
  await s.recover();await s.recover();assert.equal(sent.length,1);assert.equal(s.snapshot().locked,false)
  assert.throws(()=>s.retry(),/recovery_required/)
})

test("only a GET-confirmed absent query permits manual exact replay; edits cannot replace the frozen paid intent",async()=>{
  const q=request(),original=structuredClone(q),sent=[];let missing=true
  const s=createKnowledgeQuerySession({async submitKnowledgeQuery(x){sent.push(structuredClone(x));throw network()},async getKnowledgeQueryReceipt(){return missing?null:receipt(original)}})
  await assert.rejects(s.start(q));q.query="must not replace original";q.base_ids[0]=randomUUID()
  assert.equal((await s.recover()).found,false);assert.equal(s.snapshot().canRetry,true)
  await assert.rejects(s.retry());assert.deepEqual(sent,[original,original])
  missing=false;await s.recover();assert.equal(s.snapshot().receipt.result.items[0].text,"synthetic document evidence")
  assert.equal(JSON.stringify(s.snapshot()).includes("only synthetic query"),false)
})

test("query receipt strips unrelated fields and rejects foreign scope, oversized text and malformed status",async()=>{
  for(const alter of [r=>{r.result.items[0].base_id=randomUUID()},r=>{r.result.items[0].text="x".repeat(1201)},r=>{r.status="foreign"}]){
    const q=request(),raw=receipt(q);alter(raw)
    const s=createKnowledgeQuerySession({async submitKnowledgeQuery(){return {item:raw}}})
    await assert.rejects(s.start(q),/invalid_knowledge_query_receipt/);assert.equal(s.snapshot().receipt,null);assert.equal(s.snapshot().uncertain,true)
  }
  const q=request(),raw=receipt(q);raw.result.items[0].api_key="synthetic material must not reach view";raw.result.items[0].embedding=[1,0]
  const s=createKnowledgeQuerySession({async submitKnowledgeQuery(){return {item:raw}}});await s.start(q)
  assert.equal(Object.hasOwn(s.snapshot().receipt.result.items[0],"api_key"),false);assert.equal(Object.hasOwn(s.snapshot().receipt.result.items[0],"embedding"),false)
})

test("leaving the screen suppresses late snippets; session reset suppresses old receipts entirely",async()=>{
  const q=request(),late=deferred(),s=createKnowledgeQuerySession({submitKnowledgeQuery:()=>late.promise})
  const task=s.start(q);s.hideResults();late.resolve({item:receipt(q)});await task
  assert.equal(s.snapshot().receipt.result,null)
  const next=deferred(),t=createKnowledgeQuerySession({submitKnowledgeQuery:()=>next.promise}),task2=t.start(request())
  t.reset();next.resolve({item:receipt(q)});assert.equal((await task2).stale,true);assert.equal(t.snapshot().requestId,null)
})

test("revocation hides previously served snippets, records possible charges and allows a new explicit query",async()=>{
  const q=request({mode:"semantic",profile_id:profile,profile_revision:1,consent_revision:1,acknowledgement:QUERY_CHARGE_ACKNOWLEDGEMENT}),value=receipt(q)
  value.result.retrieval="semantic";value.result.semantic_status="ok"
  const s=createKnowledgeQuerySession({async submitKnowledgeQuery(){return {item:value}},async getKnowledgeQueryReceipt(){throw Object.assign(Error("revoked"),{status:404})}})
  await s.start(q);await assert.rejects(s.recover())
  assert.equal(s.snapshot().receipt.status,"unavailable");assert.equal(s.snapshot().receipt.result,null);assert.equal(s.snapshot().receipt.billing_may_have_occurred,true)
  assert.equal(s.snapshot().locked,false);assert.equal(s.snapshot().canRetry,false)
})

test("query receipts cannot silently downgrade strict semantics or add semantic execution to an unconfirmed query",async()=>{
  const paid=request({mode:"semantic",profile_id:profile,profile_revision:1,consent_revision:1,acknowledgement:QUERY_CHARGE_ACKNOWLEDGEMENT})
  const strict=createKnowledgeQuerySession({async submitKnowledgeQuery(){return {item:receipt(paid)}}})
  await assert.rejects(strict.start(paid),/invalid_knowledge_query_receipt/)
  const free=request({mode:"auto"}),value=receipt(free);value.result.retrieval="semantic"
  const unauthorized=createKnowledgeQuerySession({async submitKnowledgeQuery(){return {item:value}}})
  await assert.rejects(unauthorized.start(free),/invalid_knowledge_query_receipt/)
})

test("unknown paid outcomes require new explicit intent and cannot be resent by the retry control",async()=>{
  const q=request(),s=createKnowledgeQuerySession({async submitKnowledgeQuery(){return {item:receipt(q,{status:"unknown",result:null,billing_may_have_occurred:true})}}})
  await s.start(q);assert.equal(s.snapshot().locked,false);assert.throws(()=>s.retry(),/recovery_required/)
  assert.throws(()=>s.start({...request(),mode:"semantic"}),error=>error.status===400)
})
