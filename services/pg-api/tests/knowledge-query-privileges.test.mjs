import test from "node:test"
import assert from "node:assert/strict"
import {knowledgeQueryFixture} from "./helpers/knowledge-query-fixture.mjs"
import {verifyKnowledgeQuerySchema} from "../src/knowledge-query-audit.ts"
import {verifyKnowledgeIndexSchema} from "../src/knowledge-index-privileges.ts"

test("query preflights reject raw data grants, PUBLIC dispatch, missing RLS and mutable replay fences",async()=>{
  const f=await knowledgeQueryFixture()
  try{
    for(const kind of ["api","worker","broker"]){await verifyKnowledgeQuerySchema(f.pool,kind);await verifyKnowledgeIndexSchema(f.pool,kind)}
    const mutations=[
      ["ALTER ROLE agentstudio_knowledge_query RENAME TO agentstudio_query_missing_fixture","ALTER ROLE agentstudio_query_missing_fixture RENAME TO agentstudio_knowledge_query"],
      ["GRANT SELECT(api_key_ciphertext) ON agentstudio.model_connections TO agentstudio_knowledge_query","REVOKE SELECT(api_key_ciphertext) ON agentstudio.model_connections FROM agentstudio_knowledge_query"],
      ["GRANT SELECT(embedding) ON agentstudio.knowledge_chunks TO agentstudio_knowledge_query","REVOKE SELECT(embedding) ON agentstudio.knowledge_chunks FROM agentstudio_knowledge_query"],
      ["GRANT SELECT ON agentstudio.knowledge_query_jobs TO agentstudio_api","REVOKE SELECT ON agentstudio.knowledge_query_jobs FROM agentstudio_api"],
      ["GRANT EXECUTE ON FUNCTION agentstudio.knowledge_query_reserve(uuid,uuid,text) TO PUBLIC","REVOKE EXECUTE ON FUNCTION agentstudio.knowledge_query_reserve(uuid,uuid,text) FROM PUBLIC"],
      ["ALTER TABLE agentstudio.knowledge_query_jobs NO FORCE ROW LEVEL SECURITY","ALTER TABLE agentstudio.knowledge_query_jobs FORCE ROW LEVEL SECURITY"],
      ["ALTER TABLE agentstudio.knowledge_query_jobs DROP CONSTRAINT knowledge_query_jobs_reader_user_id_request_id_key","ALTER TABLE agentstudio.knowledge_query_jobs ADD UNIQUE(reader_user_id,request_id)"],
    ]
    for(const [bad,restore] of mutations){
      await f.db.query(bad)
      await assert.rejects(verifyKnowledgeQuerySchema(f.pool),/unsafe_knowledge_query_privileges/)
      await assert.rejects(verifyKnowledgeIndexSchema(f.pool),/unsafe_knowledge_query_privileges/)
      await f.db.query(restore)
    }
    await verifyKnowledgeQuerySchema(f.pool)
    for(const role of ["agentstudio_api","agentstudio_knowledge_index_worker","agentstudio_knowledge_index_broker"]){
      await f.db.exec("BEGIN; SET LOCAL ROLE "+role)
      try{await assert.rejects(f.db.query("SELECT query_text FROM agentstudio.knowledge_query_jobs"),/permission denied/)}finally{await f.db.exec("ROLLBACK")}
    }
  }finally{await f.close()}
})
