import test from "node:test"
import assert from "node:assert/strict"
import {randomUUID} from "node:crypto"
import {knowledgeQueryFixture} from "./helpers/knowledge-query-fixture.mjs"
import {KnowledgeQueryRepository} from "../src/knowledge-query-repository.ts"
import {bob} from "./helpers/workflow-v2-agent-fixture.mjs"

test("query receipts expire without paid replay, purge payloads on cleanup, and cap queued requests per reader",async()=>{
  const f=await knowledgeQueryFixture()
  try{
    const requests=[]
    for(let n=0;n<4;n++){const q=await f.queryRequest();requests.push(q);await f.queries.submit(bob,q)}
    await assert.rejects(f.queries.submit(bob,await f.queryRequest()),error=>error.status===429)
    const first=requests[0]
    await f.db.query("UPDATE agentstudio.knowledge_query_jobs SET expires_at=now()-interval '1 second' WHERE request_id=$1",[first.request_id])
    assert.equal((await f.queries.get(bob,first.request_id)).status,"expired")
    assert.equal((await f.queries.submit(bob,first)).replayed,true)
    await f.queryWorker().tick()
    const row=(await f.db.query("SELECT query_text,scope_fence,result_refs,status FROM agentstudio.knowledge_query_jobs WHERE request_id=$1",[first.request_id])).rows[0]
    assert.deepEqual(row,{query_text:null,scope_fence:null,result_refs:null,status:"expired"})
    assert.equal(f.queryCalls.length,1)
    assert.equal((await f.queries.submit(bob,first)).item.status,"expired");assert.equal(f.queryCalls.length,1)
  }finally{await f.close()}
})

test("lexical and hybrid return bounded current citations; changed text or missing sharing approval invalidates receipts",async()=>{
  const f=await knowledgeQueryFixture()
  try{
    const lexical=await f.queries.submit(bob,{request_id:randomUUID(),base_ids:[f.base],query:"synthetic",mode:"lexical",limit:1})
    assert.equal(lexical.item.result.items.length,1);assert.equal(lexical.item.billing_may_have_occurred,false)
    const q=await f.queryRequest({mode:"hybrid",query:"synthetic",limit:1});await f.queries.submit(bob,q);await f.queryWorker().tick()
    assert.equal((await f.queries.get(bob,q.request_id)).result.retrieval,"hybrid")
    await assert.rejects(new KnowledgeQueryRepository({...f.pool,knowledgeSharing:false}).get(bob,q.request_id),error=>error.status===403&&error.code==="knowledge_embedding_settings_disabled")
    await f.db.query("UPDATE agentstudio.knowledge_chunks SET text_content=text_content||' changed' WHERE id=$1",[lexical.item.result.items[0].chunk_id])
    for(const id of [lexical.item.request_id,q.request_id])assert.equal((await f.queries.get(bob,id)).status,"unavailable")
    assert.equal(f.queryCalls.length,1)
  }finally{await f.close()}
})

test("query ranking guards mixed vector dimensions and supports normalized 1536/3072 query vectors",async()=>{
  const f=await knowledgeQueryFixture()
  try{
    for(const dimensions of [1536,3072]){
      const v=Array.from({length:dimensions},(_,i)=>i===0?1:0)
      await f.db.query("UPDATE agentstudio.knowledge_embedding_profiles SET dimensions=$2 WHERE owner_user_id=$1",[f.users.alice,dimensions])
      await f.db.query("UPDATE agentstudio.knowledge_embedding_vectors SET embedding=$2::public.vector WHERE owner_user_id=$1",[f.users.alice,JSON.stringify(v)])
      f.setQueryProvider(async()=>[v])
      const q=await f.queryRequest();await f.queries.submit(bob,q)
      assert.equal((await f.queryWorker().tick()).status,"retrieved")
      const receipt=await f.queries.get(bob,q.request_id)
      assert.equal(receipt.result.items.length,1);assert.equal(receipt.result.items[0].semantic_score,1)
    }
    await f.db.query("UPDATE agentstudio.knowledge_embedding_vectors SET embedding='[1,0]'::public.vector WHERE owner_user_id=$1",[f.users.alice])
    const noIndex=await f.queries.submit(bob,{request_id:randomUUID(),base_ids:[f.base],query:"synthetic",mode:"auto"})
    assert.equal(noIndex.item.result.semantic_status,"not_indexed");assert.equal(f.queryCalls.length,2)
  }finally{await f.close()}
})
