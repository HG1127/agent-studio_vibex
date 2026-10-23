import test from "node:test"
import assert from "node:assert/strict"
import {randomUUID} from "node:crypto"
import {knowledgeQueryFixture} from "./helpers/knowledge-query-fixture.mjs"
import {alice,bob} from "./helpers/workflow-v2-agent-fixture.mjs"
test("shared semantic query uses only the reader key/query, and receipts recover without paid replay",async()=>{
  const f=await knowledgeQueryFixture()
  try{
    const q=await f.queryRequest(),submitted=await f.queries.submit(bob,q)
    assert.equal(submitted.item.status,"prepared");assert.equal(f.queryCalls.length,0)
    assert.equal((await f.queryWorker().tick()).status,"retrieved")
    const receipt=await f.queries.get(bob,q.request_id)
    assert.equal(receipt.status,"succeeded");assert.equal(receipt.result.retrieval,"semantic");assert.equal(receipt.result.shared_semantic_used,true)
    assert.ok(receipt.result.items[0].text.includes("OWN_CITATION"));assert.equal(f.queryCalls.length,1)
    assert.equal(f.queryCalls[0].api_key,"synthetic-bob-model-key-never-network");assert.deepEqual(f.queryCalls[0].input,[q.query])
    assert.equal((await f.queries.submit(bob,q)).replayed,true);assert.equal((await f.queryWorker().tick()).status,"idle");assert.equal(f.queryCalls.length,1)
    assert.equal(await f.queries.get(alice,q.request_id),null)
    await assert.rejects(f.queries.submit(bob,{...q,query:"changed"}),error=>error.code==="request_id_conflict")
  }finally{await f.close()}
})
test("lexical/auto are explicit about unconfirmed and provider-error fallback; strict semantic errors never silently downgrade",async()=>{
  const f=await knowledgeQueryFixture()
  try{
    const free={request_id:randomUUID(),base_ids:[f.base],query:"synthetic",mode:"auto"}
    const fallback=await f.queries.submit(bob,free)
    assert.equal(fallback.item.result.retrieval,"lexical");assert.equal(fallback.item.result.semantic_status,"query_charge_not_confirmed");assert.equal(f.queryCalls.length,0)
    f.setQueryProvider(async()=>{throw Error("synthetic provider accepted then closed")})
    const auto=await f.queryRequest({mode:"auto",query:"synthetic"});await f.queries.submit(bob,auto)
    assert.equal((await f.queryWorker().tick()).status,"retrieved")
    const r=await f.queries.get(bob,auto.request_id)
    assert.equal(r.result.semantic_status,"provider_error");assert.equal(r.result.retrieval,"lexical");assert.equal(r.billing_may_have_occurred,true)
    const strict=await f.queryRequest();await f.queries.submit(bob,strict)
    assert.equal((await f.queryWorker().tick()).status,"uncertain");assert.equal((await f.queries.get(bob,strict.request_id)).status,"unknown")
    assert.equal((await f.queryWorker().tick()).status,"idle");assert.equal(f.queryCalls.length,2)
  }finally{await f.close()}
})
test("current sharing revision and content hashes fence paid results and never resurrect after revoke/regrant",async()=>{
  const f=await knowledgeQueryFixture()
  try{
    const q=await f.queryRequest();await f.queries.submit(bob,q);await f.queryWorker().tick()
    await f.access.change(alice,f.base,{action:"revoke",recipient_id:f.users.bob,expected_revision:1,request_id:randomUUID()})
    await assert.rejects(f.queries.get(bob,q.request_id),error=>error.status===404)
    await f.access.change(alice,f.base,{action:"grant_existing",recipient_id:f.users.bob,role:"viewer",semantic_allowed:true,expected_revision:2,request_id:randomUUID()})
    const old=await f.queries.get(bob,q.request_id)
    assert.equal(old.status,"unavailable");assert.equal(old.result,null);assert.equal(f.queryCalls.length,1)
    const next=await f.queryRequest();await f.queries.submit(bob,next)
    f.setQueryProvider(async()=>{await f.access.change(alice,f.base,{action:"semantic",recipient_id:f.users.bob,enabled:false,expected_revision:3,request_id:randomUUID()});return [[3,4]]})
    assert.equal((await f.queryWorker().tick()).status,"uncertain");assert.equal((await f.queries.get(bob,next.request_id)).result,null)
    const free=await f.queries.submit(bob,{request_id:randomUUID(),base_ids:[f.base],query:"synthetic",mode:"auto"})
    assert.equal(free.item.result.retrieval,"lexical");assert.equal(f.queryCalls.length,2)
  }finally{await f.close()}
})
