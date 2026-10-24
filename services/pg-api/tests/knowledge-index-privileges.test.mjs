import test from "node:test"
import assert from "node:assert/strict"
import {knowledgeIndexFixture} from "./helpers/knowledge-index-fixture.mjs"
import {verifyKnowledgeIndexSchema} from "../src/knowledge-index-privileges.ts"
test("all index runtime preflights deny ciphertext/vector/ledger leaks, mutable receipts and missing replay fences",async()=>{
  const f=await knowledgeIndexFixture()
  try{
    for(const kind of ["api","worker","broker"])await verifyKnowledgeIndexSchema(f.pool,kind)
    for(const [bad,restore] of [
      ["GRANT SELECT(api_key_ciphertext) ON agentstudio.model_connections TO agentstudio_knowledge_index","REVOKE SELECT(api_key_ciphertext) ON agentstudio.model_connections FROM agentstudio_knowledge_index"],
      ["GRANT SELECT(embedding) ON agentstudio.knowledge_chunks TO agentstudio_knowledge_index","REVOKE SELECT(embedding) ON agentstudio.knowledge_chunks FROM agentstudio_knowledge_index"],
      ["GRANT SELECT ON agentstudio.knowledge_index_attempts TO agentstudio_api","REVOKE SELECT ON agentstudio.knowledge_index_attempts FROM agentstudio_api"],
      ["GRANT UPDATE ON agentstudio.knowledge_index_activation_receipts TO agentstudio_knowledge_index","REVOKE UPDATE ON agentstudio.knowledge_index_activation_receipts FROM agentstudio_knowledge_index"],
      ["GRANT EXECUTE ON FUNCTION agentstudio.knowledge_index_reserve(uuid,uuid,text) TO agentstudio_knowledge_index_worker","REVOKE EXECUTE ON FUNCTION agentstudio.knowledge_index_reserve(uuid,uuid,text) FROM agentstudio_knowledge_index_worker"],
      ["DROP INDEX agentstudio.knowledge_index_no_replay","CREATE UNIQUE INDEX knowledge_index_no_replay ON agentstudio.knowledge_index_attempt_chunks(profile_id,consent_revision,chunk_id,chunk_sha256) WHERE reserved"],
    ]){await f.db.query(bad);await assert.rejects(verifyKnowledgeIndexSchema(f.pool),/unsafe_knowledge_index_privileges/);await f.db.query(restore)}
    await verifyKnowledgeIndexSchema(f.pool)
  }finally{await f.close()}
})
