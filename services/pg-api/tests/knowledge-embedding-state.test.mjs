import test from "node:test"
import assert from "node:assert/strict"
import {randomUUID} from "node:crypto"
import {agentFixture,alice,bob} from "./helpers/workflow-v2-agent-fixture.mjs"
import {KnowledgeEmbeddingRepository} from "../src/knowledge-embedding-repository.ts"
import {embeddingEndpointPolicy,approvedEmbeddingEndpoint,selectKnowledgeEmbeddingSettings} from "../src/knowledge-embedding-policy.ts"
import {scopedEmbeddingSettingsPool} from "../src/knowledge-scope-policy.ts"
import {withActor} from "../src/repository.ts"
import {KnowledgeBaseRepository} from "../src/knowledge-repository.ts"
import {KnowledgeContentRepository} from "../src/knowledge-content-repository.ts"
import {verifyKnowledgeEmbeddingSchema,verifyKnowledgeEmbeddingCredentials} from "../src/knowledge-embedding-privileges.ts"
async function fixture(){
  const f=await agentFixture({mcp:true,smithery:true,sharing:true})
  try{await f.db.exec(f.sql("migrations/pg_v9_035_knowledge_embedding_state.sql"))}catch(error){await f.close();throw error}
  const pool=scopedEmbeddingSettingsPool(f.pool,true)
  return {...f,embeddingPool:pool,embedding:new KnowledgeEmbeddingRepository(pool,embeddingEndpointPolicy({})),content:new KnowledgeContentRepository(f.pool)}
}
const configure=(f,expected=0,more={})=>({action:"configure",request_id:randomUUID(),expected_revision:expected,
  connection_id:f.resources.alice.model.id,connection_revision:f.resources.alice.model.revision,model_name:"synthetic",base_url:"https://api.openai.com/v1",...more})
const unit=n=>"["+Array.from({length:n},(_,i)=>i===0?1:0).join(",")+"]"
test("embedding settings are independently opt-in and permit only operator-approved compatible endpoints",()=>{
  assert.equal(selectKnowledgeEmbeddingSettings({}),false)
  assert.throws(()=>selectKnowledgeEmbeddingSettings({AGENT_STUDIO_PG18_EMBEDDING_SETTINGS_UAT_ENABLED:"true"}))
  const policy=embeddingEndpointPolicy({AGENT_STUDIO_EMBEDDING_ALLOWED_HOSTS:"api.openai.com,models.example.com",AGENT_STUDIO_EMBEDDING_ALLOW_LOOPBACK:"true",AGENT_STUDIO_EMBEDDING_LOOPBACK_PORTS:"80,11434"})
  for(const endpoint of ["https://api.openai.com/v1","https://models.example.com/api","http://127.0.0.1:11434/v1","http://localhost:80/v1"])
    assert.equal(approvedEmbeddingEndpoint(endpoint,policy),endpoint)
  for(const endpoint of ["https://foreign.example/v1","https://models.example.com:8443/v1","https://u:p@api.openai.com/v1","https://api.openai.com/v1?key=bad",
    "http://127.0.0.1:9999/v1","http://2130706433:11434/v1","https://127.0.0.1/v1","http://localhost:11434\\secret","https://api.openai.com/v1#fragment"])
    assert.throws(()=>approvedEmbeddingEndpoint(endpoint,policy),error=>error.code==="embedding_endpoint_unapproved")
  for(const env of [{AGENT_STUDIO_EMBEDDING_ALLOWED_HOSTS:"localhost"},{AGENT_STUDIO_EMBEDDING_ALLOWED_HOSTS:"*.example.com"},{AGENT_STUDIO_EMBEDDING_ALLOW_LOOPBACK:"true"}])assert.throws(()=>embeddingEndpointPolicy(env))
  assert.deepEqual(embeddingEndpointPolicy({AGENT_STUDIO_EMBEDDING_ALLOWED_HOSTS:""}).allowedHosts,["api.openai.com"])
  assert.deepEqual(embeddingEndpointPolicy({AGENT_STUDIO_EMBEDDING_ALLOW_LOOPBACK:"false",AGENT_STUDIO_EMBEDDING_LOOPBACK_PORTS:"11434"}).loopbackPorts,[])
  const hosts=Array.from({length:40},(_,i)=>"model"+i+".example.com"),ports=Array.from({length:40},(_,i)=>11000+i)
  assert.deepEqual(embeddingEndpointPolicy({AGENT_STUDIO_EMBEDDING_ALLOWED_HOSTS:hosts.join(",")}).allowedHosts,hosts)
  assert.deepEqual(embeddingEndpointPolicy({AGENT_STUDIO_EMBEDDING_ALLOW_LOOPBACK:"true",AGENT_STUDIO_EMBEDDING_LOOPBACK_PORTS:ports.join(",")}).loopbackPorts,ports)
})
test("native profile configuration has owner CAS, exact replay receipts and no credential or vector grants",async()=>{
  const f=await fixture()
  try{
    await verifyKnowledgeEmbeddingSchema(f.pool)
    assert.equal((await f.embedding.settings(alice)).revision,0)
    const request=configure(f),saved=await f.embedding.change(alice,request)
    assert.equal(saved.item.revision,1);assert.equal(saved.item.queued_bases,1)
    assert.equal((await f.embedding.change(alice,request)).replayed,true)
    assert.deepEqual(await f.embedding.receipt(alice,request.request_id),saved.item)
    assert.equal(await f.embedding.receipt(bob,request.request_id),null)
    await assert.rejects(f.embedding.change(alice,{...request,model_name:"changed"}),error=>error.code==="request_id_conflict")
    await assert.rejects(f.embedding.change(alice,configure(f)),error=>error.code==="revision_conflict")
    await assert.rejects(f.embedding.change(alice,configure(f,1,{connection_id:f.resources.bob.model.id})),error=>error.code==="embedding_connection_unavailable")
    const privateRepo=new KnowledgeEmbeddingRepository(f.pool,embeddingEndpointPolicy({}))
    await assert.rejects(privateRepo.settings(alice),error=>error.code==="knowledge_embedding_settings_disabled")
    for(const table of ["knowledge_embedding_profiles","knowledge_embedding_vectors","knowledge_embedding_queue","knowledge_embedding_receipts"])
      await assert.rejects(withActor(f.embeddingPool,alice,db=>db.query("SELECT * FROM agentstudio."+table)),error=>error.code==="42501")
    const helper=(await f.db.query("SELECT has_column_privilege('agentstudio_knowledge_embedding','agentstudio.model_connections','api_key_ciphertext','SELECT') AS secret,has_column_privilege('agentstudio_knowledge_embedding','agentstudio.knowledge_chunks','embedding','SELECT') AS pilot")).rows[0]
    assert.deepEqual(helper,{secret:false,pilot:false})
    for(const [bad,restore] of [
      ["ALTER TABLE agentstudio.knowledge_embedding_vectors ALTER COLUMN embedding TYPE public.vector(1536)","ALTER TABLE agentstudio.knowledge_embedding_vectors ALTER COLUMN embedding TYPE public.vector"],
      ["GRANT EXECUTE ON FUNCTION agentstudio.knowledge_embedding_settings() TO PUBLIC","REVOKE ALL ON FUNCTION agentstudio.knowledge_embedding_settings() FROM PUBLIC"],
      ["ALTER TABLE agentstudio.knowledge_chunks DISABLE TRIGGER knowledge_embedding_chunk_change","ALTER TABLE agentstudio.knowledge_chunks ENABLE TRIGGER knowledge_embedding_chunk_change"],
      ["GRANT SELECT ON agentstudio.knowledge_embedding_vectors TO agentstudio_api","REVOKE SELECT ON agentstudio.knowledge_embedding_vectors FROM agentstudio_api"],
    ]){await f.db.query(bad);await assert.rejects(verifyKnowledgeEmbeddingSchema(f.pool),/unsafe_knowledge_embedding_privileges/);await f.db.query(restore)}
    await verifyKnowledgeEmbeddingSchema(f.pool)
    await f.db.query("GRANT SELECT(api_key_ciphertext) ON agentstudio.model_connections TO agentstudio_knowledge_embedding")
    const db=await f.pool.connect();try{await assert.rejects(verifyKnowledgeEmbeddingCredentials(db),/unsafe_knowledge_embedding_privileges/)}finally{db.release()}
  }finally{await f.close()}
})
test("variable-dimension vectors preserve 2/1536/3072, same configuration keeps its index and rotation/disable clear it atomically",async()=>{
  const f=await fixture()
  try{
    await f.embedding.change(alice,configure(f))
    const base=f.resources.alice.kb.id,chunk=(await f.db.query("SELECT id FROM agentstudio.knowledge_chunks WHERE owner_user_id=$1",[f.users.alice])).rows[0].id
    for(const dimensions of [2,1536,3072]){
      await f.db.query("DELETE FROM agentstudio.knowledge_embedding_vectors WHERE owner_user_id=$1",[f.users.alice])
      await f.db.query("UPDATE agentstudio.knowledge_embedding_profiles SET dimensions=$1 WHERE owner_user_id=$2",[dimensions,f.users.alice])
      await f.db.query("INSERT INTO agentstudio.knowledge_embedding_vectors(chunk_id,owner_user_id,profile_revision,chunk_sha256,embedding) SELECT id,owner_user_id,1,encode(sha256(convert_to(text_content,'UTF8')),'hex'),$2::vector FROM agentstudio.knowledge_chunks WHERE id=$1",[chunk,unit(dimensions)])
      const status=await f.embedding.status(alice,base)
      assert.equal(status.dimensions,dimensions);assert.equal(status.ready,true);assert.equal(status.indexed,1);assert.equal(status.pending,0)
    }
    await assert.rejects(f.db.query("UPDATE agentstudio.knowledge_embedding_vectors SET embedding=$1::vector WHERE chunk_id=$2",[unit(3073),chunk]),error=>error.code==="23514")
    assert.equal((await f.embedding.change(alice,configure(f,1))).item.revision,1)
    assert.equal((await f.embedding.status(alice,base)).ready,true)
    const rotated=await f.embedding.change(alice,configure(f,1,{base_url:"https://api.openai.com/v2"}))
    assert.equal(rotated.item.revision,2);assert.equal((await f.embedding.status(alice,base)).pending,1)
    assert.equal((await f.embedding.settings(alice)).dimensions,null)
    const disabled=await f.embedding.change(alice,{action:"disable",request_id:randomUUID(),expected_revision:2})
    assert.equal(disabled.item.revision,3);assert.equal(disabled.item.queued_bases,0);assert.equal((await f.embedding.settings(alice)).configured,false)
  }finally{await f.close()}
})
test("owner-consented queues follow both direct indexed imports and processing-to-indexed pilot ingestion; rebuild/status stay owner-only",async()=>{
  const f=await fixture()
  try{
    await f.embedding.change(alice,configure(f))
    const bases=new KnowledgeBaseRepository(f.pool),base=await bases.create(alice,"new","Synthetic")
    assert.equal((await f.embedding.status(alice,base.id)).queued,false)
    await bases.createTextDocument(alice,base.id,{filename:"pilot.txt",text:"pending lifecycle"})
    assert.equal((await f.embedding.status(alice,base.id)).queued,true)
    await f.content.importParsed(alice,base.id,randomUUID(),{filename:"unicode.txt",mime_type:"text/plain",text:"😀".repeat(1200)})
    const status=await f.embedding.status(alice,base.id)
    assert.equal(status.total,3);assert.equal(status.pending,3)
    const request={action:"rebuild",request_id:randomUUID(),expected_revision:1,base_id:base.id}
    assert.equal((await f.embedding.change(alice,request)).replayed,false)
    assert.equal((await f.embedding.change(alice,request)).replayed,true)
    await assert.rejects(f.embedding.status(bob,base.id),error=>error.status===404)
    await assert.rejects(f.embedding.change(alice,{...request,request_id:randomUUID(),base_id:f.resources.bob.kb.id}),error=>error.status===404)
    await f.db.query("UPDATE agentstudio.model_connections SET enabled=false,revision=revision+1 WHERE id=$1",[f.resources.alice.model.id])
    assert.equal((await f.embedding.settings(alice)).connection_valid,false)
    assert.equal((await f.embedding.status(alice,base.id)).queued,false)
    await assert.rejects(f.embedding.change(alice,{...request,request_id:randomUUID()}),error=>error.code==="embedding_connection_unavailable")
    await f.db.query("UPDATE agentstudio.users SET status='disabled' WHERE id=$1",[f.users.alice])
    await assert.rejects(f.embedding.settings(alice))
  }finally{await f.close()}
})
