import test from "node:test"
import assert from "node:assert/strict"
import {randomUUID} from "node:crypto"
import {knowledgeIndexFixture} from "./helpers/knowledge-index-fixture.mjs"
import {alice,bob} from "./helpers/workflow-v2-agent-fixture.mjs"
import {withActor} from "../src/repository.ts"
import {withKnowledgeIndexRole} from "../src/knowledge-index-role.ts"
import {KnowledgeIndexBroker} from "../src/knowledge-index-broker.ts"
test("operator activation and old owner metadata consent alone never index; explicit owner start indexes through the private ledger",async()=>{
  const f=await knowledgeIndexFixture()
  try{
    assert.equal((await f.worker().tick()).status,"idle");assert.equal(f.calls.length,0)
    await f.grant();assert.equal((await f.worker().tick()).status,"idle");assert.equal(f.calls.length,0)
    const activation=await f.authorize()
    assert.equal(activation.item.authorized,true)
    assert.deepEqual(await f.index.receipt(alice,activation.item.request_id),activation.item)
    assert.equal(await f.index.receipt(bob,activation.item.request_id),null)
    assert.equal((await f.index.status(alice,f.resources.alice.kb.id)).index_authorized,true)
    assert.deepEqual(await f.worker().tick(),{status:"indexed",chunks:1})
    assert.equal(f.calls.length,1);assert.equal(f.calls[0].api_key,"synthetic-alice-model-key-never-network")
    assert.deepEqual(f.calls[0].input,["synthetic evidence OWN_CITATION"])
    assert.equal((await f.settings.status(alice,f.resources.alice.kb.id)).ready,true)
    assert.equal((await f.settings.status(alice,f.resources.alice.kb.id)).dimensions,2)
    assert.equal((await f.worker().tick()).status,"idle");assert.equal(f.calls.length,1)
    await assert.rejects(f.index.status(bob,f.resources.alice.kb.id),error=>error.status===404)
    for(const table of ["knowledge_index_attempts","knowledge_index_attempt_chunks","knowledge_index_activations","knowledge_index_activation_receipts"])
      await assert.rejects(withActor(f.pool,alice,db=>db.query("SELECT * FROM agentstudio."+table)),error=>error.code==="42501")
  }finally{await f.close()}
})
test("paid outcomes remain fenced after timeout, process restart, lease expiry, rebuild and profile deletion",async()=>{
  const f=await knowledgeIndexFixture()
  try{
    await f.grant();await f.authorize();f.setProvider(async()=>{throw Error("synthetic provider accepted then disconnected")})
    assert.equal((await f.worker().tick()).status,"uncertain");assert.equal(f.calls.length,1)
    assert.equal((await f.index.status(alice,f.resources.alice.kb.id)).unknown_attempts,1)
    await f.db.query("UPDATE agentstudio.knowledge_index_attempts SET lease_until=now()-interval '1 second'")
    assert.equal((await f.worker().tick()).status,"idle");assert.equal(f.calls.length,1)
    await f.settings.change(alice,{action:"rebuild",request_id:randomUUID(),expected_revision:1,base_id:f.resources.alice.kb.id})
    assert.equal((await f.worker().tick()).status,"idle");assert.equal(f.calls.length,1)
    await f.db.query("DELETE FROM agentstudio.knowledge_embedding_profiles WHERE owner_user_id=$1",[f.users.alice])
    assert.equal((await f.db.query("SELECT count(*)::integer AS n FROM agentstudio.knowledge_index_attempts WHERE status='unknown'")).rows[0].n,1)
  }finally{await f.close()}
})
test("expired unreserved work may be reclaimed but forged leases, duplicate private dispatch and stale results cannot publish",async()=>{
  const f=await knowledgeIndexFixture()
  try{
    await f.grant();await f.authorize()
    const claim=await f.worker().claim()
    assert.ok(claim)
    await assert.rejects(f.broker.dispatch({...claim,lease_token:"f".repeat(64)}));assert.equal(f.calls.length,0)
    await f.db.query("UPDATE agentstudio.knowledge_index_attempts SET lease_until=now()-interval '1 second' WHERE id=$1",[claim.attempt_id])
    const reclaimed=await f.worker().claim()
    assert.equal(reclaimed.attempt_id,claim.attempt_id);assert.notEqual(reclaimed.lease_token,claim.lease_token)
    await assert.rejects(f.broker.dispatch(claim));assert.equal(f.calls.length,0)
    f.setProvider(async material=>{
      const duplicate=f.broker.dispatch(reclaimed)
      await assert.rejects(duplicate);assert.equal(f.calls.length,1)
      await f.configure(1,{base_url:"https://api.openai.com/v2"})
      return material.input.map(()=>[1,0])
    })
    await assert.rejects(f.broker.dispatch(reclaimed));assert.equal(f.calls.length,1)
    assert.equal((await f.settings.status(alice,f.resources.alice.kb.id)).indexed,0)
    assert.equal((await f.db.query("SELECT status FROM agentstudio.knowledge_index_attempts WHERE id=$1",[claim.attempt_id])).rows[0].status,"unknown")
    await assert.rejects(withKnowledgeIndexRole(f.pool,"worker",db=>db.query("SELECT agentstudio.knowledge_index_reserve($1,$2,$3)",[reclaimed.attempt_id,reclaimed.worker_id,reclaimed.lease_token])),error=>error.code==="42501")
  }finally{await f.close()}
})
test("revocation after credential loading prevents egress, and content/employee changes after a response prevent stale vector publication",async()=>{
  for(const phase of ["before-egress","content-response","employee-response"]){
    const f=await knowledgeIndexFixture()
    try{
      await f.grant();await f.authorize()
      if(phase==="before-egress"){
        let cut=false,calls=0
        const secrets={async connect(){const db=await f.pool.connect();return {release:()=>db.release(),async query(text,args){
          const result=await db.query(text,args)
          if(text==="COMMIT"&&!cut){cut=true;await f.db.query("UPDATE agentstudio.users SET status='disabled' WHERE id=$1",[f.users.alice])}
          return result}}}}
        const broker=new KnowledgeIndexBroker(f.pool,secrets,f.key,async()=>{calls++;return [[1,0]]},{approvedForIsolatedUat:true})
        await assert.rejects(broker.dispatch(await f.worker().claim()));assert.equal(calls,0)
      }else{
        f.setProvider(async()=>{
          if(phase==="content-response")await f.db.query("UPDATE agentstudio.knowledge_chunks SET text_content='changed after paid response' WHERE owner_user_id=$1",[f.users.alice])
          else await f.db.query("UPDATE agentstudio.users SET status='disabled' WHERE id=$1",[f.users.alice])
          return [[1,0]]
        })
        assert.equal((await f.worker().tick()).status,"uncertain");assert.equal(f.calls.length,1)
      }
      assert.equal((await f.db.query("SELECT count(*)::integer AS n FROM agentstudio.knowledge_embedding_vectors")).rows[0].n,0)
      assert.equal((await f.db.query("SELECT status FROM agentstudio.knowledge_index_attempts")).rows[0].status,"unknown")
    }finally{await f.close()}
  }
})
