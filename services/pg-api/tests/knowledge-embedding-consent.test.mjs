import test from "node:test"
import assert from "node:assert/strict"
import {randomUUID} from "node:crypto"
import {agentFixture,alice,bob} from "./helpers/workflow-v2-agent-fixture.mjs"
import {KnowledgeEmbeddingRepository} from "../src/knowledge-embedding-repository.ts"
import {KnowledgeEmbeddingConsentRepository} from "../src/knowledge-embedding-consent-repository.ts"
import {EMBEDDING_CHARGE_ACKNOWLEDGEMENT} from "../src/knowledge-embedding-consent-contracts.ts"
import {embeddingEndpointPolicy} from "../src/knowledge-embedding-policy.ts"
import {scopedEmbeddingSettingsPool,scopedEmbeddingConsentPool} from "../src/knowledge-scope-policy.ts"
import {verifyKnowledgeEmbeddingConsentSchema} from "../src/knowledge-embedding-consent-privileges.ts"
import {withActor} from "../src/repository.ts"
async function fixture(){
  const f=await agentFixture({mcp:true,smithery:true,sharing:true})
  try{
    await f.db.exec(f.sql("migrations/pg_v9_035_knowledge_embedding_state.sql"))
    const settingsPool=scopedEmbeddingSettingsPool(f.pool,true),settings=new KnowledgeEmbeddingRepository(settingsPool,embeddingEndpointPolicy({}))
    const configure=(revision=0,extra={})=>({action:"configure",request_id:randomUUID(),expected_revision:revision,
      connection_id:f.resources.alice.model.id,connection_revision:f.resources.alice.model.revision,model_name:"synthetic",base_url:"https://api.openai.com/v1",...extra})
    await settings.change(alice,configure()) // A pre-existing SETTINGS-ONLY profile.
    await f.db.exec(f.sql("migrations/pg_v9_036_knowledge_embedding_consent.sql"))
    const pool=scopedEmbeddingConsentPool(settingsPool,true),consent=new KnowledgeEmbeddingConsentRepository(pool)
    return {...f,pool,settingsPool,settings,configure,consent}
  }catch(error){await f.close();throw error}
}
const grant=(current,extra={})=>({action:"grant",request_id:randomUUID(),expected_revision:current.revision,profile_id:current.profile_id,
  profile_revision:current.profile_revision,index_enabled:true,query_enabled:false,acknowledgement:EMBEDDING_CHARGE_ACKNOWLEDGEMENT,...extra})
test("existing settings/queue never imply paid consent; owner scopes, explicit acknowledgement, independent purposes, CAS and receipts",async()=>{
  const f=await fixture()
  try{
    await verifyKnowledgeEmbeddingConsentSchema(f.pool)
    const initial=await f.consent.get(alice)
    assert.equal(initial.profile_valid,true);assert.equal(initial.revision,0);assert.equal(initial.index_enabled,false);assert.equal(initial.query_enabled,false)
    assert.equal((await f.settings.status(alice,f.resources.alice.kb.id)).queued,true)
    for(const extra of [{acknowledgement:undefined},{acknowledgement:"yes"},{index_enabled:"true"},{index_enabled:false,query_enabled:false},
      {actor_user_id:f.users.bob},{api_key:"never accepted"},{embedding:[1,0]}])assert.throws(()=>f.consent.change(alice,grant(initial,extra)),error=>error.status===400)
    const request=grant(initial),saved=await f.consent.change(alice,request)
    assert.equal(saved.item.revision,1);assert.equal(saved.item.index_enabled,true);assert.equal(saved.item.query_enabled,false)
    assert.equal((await f.consent.change(alice,request)).replayed,true)
    assert.deepEqual(await f.consent.receipt(alice,request.request_id),saved.item)
    assert.equal(await f.consent.receipt(bob,request.request_id),null)
    assert.equal((await f.consent.get(bob)).index_enabled,false)
    await assert.rejects(f.consent.change(bob,grant(initial)),error=>error.code==="embedding_profile_changed")
    await assert.rejects(f.consent.change(alice,{...request,query_enabled:true}),error=>error.code==="request_id_conflict")
    await assert.rejects(f.consent.change(alice,grant(initial)),error=>error.code==="revision_conflict")
    await assert.rejects(withActor(f.pool,alice,db=>db.query("SELECT agentstudio.knowledge_embedding_consent_change($1,1,'grant',$2,1,true,false,NULL)",[randomUUID(),initial.profile_id])),error=>error.code==="P0400")
    const queryOnly=await f.consent.change(alice,grant(await f.consent.get(alice),{index_enabled:false,query_enabled:true}))
    assert.equal(queryOnly.item.revision,2);assert.equal((await f.consent.get(alice)).index_enabled,false);assert.equal((await f.consent.get(alice)).query_enabled,true)
    await f.consent.change(alice,{action:"revoke",request_id:randomUUID(),expected_revision:2})
    const revoked=await f.consent.get(alice)
    assert.equal(revoked.revision,3);assert.equal(revoked.index_enabled,false);assert.equal(revoked.query_enabled,false)
    const disabled=new KnowledgeEmbeddingConsentRepository(f.settingsPool)
    await assert.rejects(disabled.get(alice),error=>error.code==="knowledge_embedding_consent_disabled")
    assert.equal((await f.consent.get(alice)).revision,3)
    await f.db.query("UPDATE agentstudio.users SET status='disabled' WHERE id=$1",[f.users.alice])
    await assert.rejects(f.consent.get(alice),error=>error.status===403)
  }finally{await f.close()}
})
test("consent cannot resurrect across rotation, disabling, stale credentials, or deleting/recreating an identical profile",async()=>{
  const f=await fixture()
  try{
    const original=await f.consent.get(alice),request=grant(original,{query_enabled:true})
    await f.consent.change(alice,request)
    await f.settings.change(alice,f.configure(1))
    assert.equal((await f.consent.get(alice)).index_enabled,true)
    await f.db.query("UPDATE agentstudio.knowledge_embedding_profiles SET dimensions=2 WHERE owner_user_id=$1",[f.users.alice])
    assert.equal((await f.consent.get(alice)).profile_id,original.profile_id)
    await f.settings.change(alice,f.configure(1,{base_url:"https://api.openai.com/v2"}))
    assert.equal((await f.consent.get(alice)).index_enabled,false)
    await f.settings.change(alice,f.configure(2))
    const restored=await f.consent.get(alice)
    assert.notEqual(restored.profile_id,original.profile_id);assert.equal(restored.query_enabled,false)
    await assert.rejects(f.consent.change(alice,grant(original,{expected_revision:1})),error=>error.code==="embedding_profile_changed")
    await f.consent.change(alice,grant(restored))
    await f.settings.change(alice,{action:"disable",request_id:randomUUID(),expected_revision:3})
    assert.equal((await f.consent.get(alice)).index_enabled,false)
    await f.settings.change(alice,f.configure(4))
    const reenabled=await f.consent.get(alice)
    assert.equal(reenabled.index_enabled,false);await f.consent.change(alice,grant(reenabled))
    await f.db.query("UPDATE agentstudio.model_connections SET enabled=false WHERE id=$1",[f.resources.alice.model.id])
    assert.equal((await f.consent.get(alice)).index_enabled,false)
    await assert.rejects(f.consent.change(alice,grant(await f.consent.get(alice))),error=>error.code==="embedding_connection_unavailable")
    // A real credential rotation increments the model revision. Even after
    // enabling again it cannot match the original approved binding.
    await f.db.query("UPDATE agentstudio.model_connections SET enabled=true,revision=revision+1 WHERE id=$1",[f.resources.alice.model.id])
    assert.equal((await f.consent.get(alice)).index_enabled,false)
    await f.db.query("DELETE FROM agentstudio.knowledge_embedding_profiles WHERE owner_user_id=$1",[f.users.alice])
    await f.settings.change(alice,f.configure(0,{connection_revision:f.resources.alice.model.revision+1}))
    const recreated=await f.consent.get(alice)
    assert.equal(recreated.profile_revision,1);assert.notEqual(recreated.profile_id,original.profile_id)
    assert.equal(recreated.index_enabled,false);assert.equal(recreated.query_enabled,false);assert.equal(recreated.revision,3)
    assert.equal((await f.consent.change(alice,request)).replayed,true)
    assert.equal((await f.consent.get(alice)).index_enabled,false)
    assert.equal((await f.consent.receipt(alice,request.request_id)).index_enabled,true) // Historical receipt, not current permission.
    await f.consent.change(alice,{action:"revoke",request_id:randomUUID(),expected_revision:3})
    assert.equal((await f.consent.get(alice)).revision,4)
  }finally{await f.close()}
})
test("consent preflight rejects direct vector/consent access, old pilot vector drift, mutable receipts and epoch/function drift",async()=>{
  const f=await fixture()
  try{
    for(const table of ["knowledge_embedding_consents","knowledge_embedding_consent_receipts"])
      await assert.rejects(withActor(f.pool,alice,db=>db.query("SELECT * FROM agentstudio."+table)),error=>error.code==="42501")
    for(const [bad,restore] of [
      ["GRANT SELECT ON agentstudio.knowledge_embedding_consents TO agentstudio_worker","REVOKE SELECT ON agentstudio.knowledge_embedding_consents FROM agentstudio_worker"],
      ["GRANT SELECT(embedding) ON agentstudio.knowledge_chunks TO agentstudio_knowledge_embedding","REVOKE SELECT(embedding) ON agentstudio.knowledge_chunks FROM agentstudio_knowledge_embedding"],
      ["GRANT UPDATE ON agentstudio.knowledge_embedding_consent_receipts TO agentstudio_knowledge_embedding","REVOKE UPDATE ON agentstudio.knowledge_embedding_consent_receipts FROM agentstudio_knowledge_embedding"],
      ["ALTER TABLE agentstudio.knowledge_embedding_profiles DISABLE TRIGGER knowledge_embedding_profile_epoch","ALTER TABLE agentstudio.knowledge_embedding_profiles ENABLE TRIGGER knowledge_embedding_profile_epoch"],
      ["GRANT EXECUTE ON FUNCTION agentstudio.knowledge_embedding_consent() TO PUBLIC","REVOKE EXECUTE ON FUNCTION agentstudio.knowledge_embedding_consent() FROM PUBLIC"],
    ]){
      await f.db.query(bad);await assert.rejects(verifyKnowledgeEmbeddingConsentSchema(f.pool),/unsafe_knowledge_embedding_(?:consent_)?privileges/)
      await f.db.query(restore)
    }
    await verifyKnowledgeEmbeddingConsentSchema(f.pool)
  }finally{await f.close()}
})

test("identical profile recreation with the same numeric revision cannot reuse the old consent epoch",async()=>{
  const f=await fixture()
  try{
    const original=await f.consent.get(alice),request=grant(original,{query_enabled:true})
    await f.consent.change(alice,request)
    await f.db.query("DELETE FROM agentstudio.knowledge_embedding_profiles WHERE owner_user_id=$1",[f.users.alice])
    await f.settings.change(alice,f.configure())
    const recreated=await f.consent.get(alice)
    assert.equal(recreated.profile_revision,original.profile_revision)
    assert.notEqual(recreated.profile_id,original.profile_id)
    assert.equal(recreated.revision,1);assert.equal(recreated.index_enabled,false);assert.equal(recreated.query_enabled,false)
    assert.equal((await f.consent.change(alice,request)).replayed,true)
    assert.equal((await f.consent.get(alice)).index_enabled,false)
    await assert.rejects(f.consent.change(alice,{...request,request_id:randomUUID(),expected_revision:1}),error=>error.code==="embedding_profile_changed")
    await f.consent.change(alice,grant(recreated))
    assert.equal((await f.consent.get(alice)).index_enabled,true)
  }finally{await f.close()}
})
