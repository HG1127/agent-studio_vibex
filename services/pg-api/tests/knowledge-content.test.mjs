import test from "node:test"
import assert from "node:assert/strict"
import {randomUUID,createHash} from "node:crypto"
import {agentFixture,alice,bob} from "./helpers/workflow-v2-agent-fixture.mjs"
import {KnowledgeAccessRepository} from "../src/knowledge-access-repository.ts"
import {KnowledgeContentRepository} from "../src/knowledge-content-repository.ts"
import {verifyKnowledgeContentSchema,verifyKnowledgeHelperCredentials} from "../src/knowledge-content-privileges.ts"
async function fixture(){
  const f=await agentFixture({mcp:true,smithery:true})
  for(const file of ["pg_v9_032_knowledge_access.sql","pg_v9_033_knowledge_content.sql"])await f.db.exec(f.sql("migrations/"+file))
  const access=new KnowledgeAccessRepository(f.pool,async()=>({id:f.users.bob,display_name:"Bob"})),content=new KnowledgeContentRepository(f.pool)
  return {...f,access,content,base:f.resources.alice.kb.id,async share(role="viewer",revision=0){
    return access.change(alice,f.resources.alice.kb.id,{action:"grant",recipient_email:"bob@example.test",role,semantic_allowed:false,expected_revision:revision,request_id:randomUUID()})
  }}
}
const source={filename:"共享说明.md",mime_type:"text/markdown",text:"共享检索内容与权限说明，关键词 cedar。"}
test("sharing startup rejects credential, vector, membership and function-policy drift; generic startup inspects helper credentials with the UI off",async()=>{
  const f=await fixture()
  try{
    await verifyKnowledgeContentSchema(f.pool)
    for(const [grant,revoke] of [
      ["GRANT SELECT(api_key_nonce) ON agentstudio.model_connections TO agentstudio_knowledge_acl","REVOKE SELECT(api_key_nonce) ON agentstudio.model_connections FROM agentstudio_knowledge_acl"],
      ["GRANT SELECT(embedding) ON agentstudio.knowledge_chunks TO agentstudio_knowledge_content","REVOKE SELECT(embedding) ON agentstudio.knowledge_chunks FROM agentstudio_knowledge_content"],
      ["GRANT agentstudio_knowledge_content TO agentstudio_api","REVOKE agentstudio_knowledge_content FROM agentstudio_api"],
      ["GRANT agentstudio_api TO agentstudio_knowledge_acl","REVOKE agentstudio_api FROM agentstudio_knowledge_acl"],
      ["ALTER FUNCTION agentstudio.knowledge_content_documents(uuid) SET search_path=public","ALTER FUNCTION agentstudio.knowledge_content_documents(uuid) SET search_path=pg_catalog"],
    ]){
      await f.db.query(grant)
      await assert.rejects(verifyKnowledgeContentSchema(f.pool),/unsafe_knowledge_content_privileges/)
      await f.db.query(revoke);await verifyKnowledgeContentSchema(f.pool)
    }
    await f.db.query("GRANT SELECT(value_tag) ON agentstudio.mcp_connection_headers TO agentstudio_knowledge_content")
    await assert.rejects(verifyKnowledgeHelperCredentials(f.db),/unsafe_knowledge_content_privileges/)
    await f.db.query("REVOKE SELECT(value_tag) ON agentstudio.mcp_connection_headers FROM agentstudio_knowledge_content")
  }finally{await f.close()}
})
test("shared viewer reads bounded literal citations and metadata without document/vector/credential column privileges",async()=>{
  const f=await fixture()
  try{
    await f.share()
    const created=await f.content.importParsed(alice,f.base,randomUUID(),source)
    assert.equal((await f.content.get(bob,f.base)).access_role,"viewer")
    const docs=await f.content.documents(bob,f.base);assert.ok(docs.some(row=>row.id===created.item.document_id))
    assert.equal(JSON.stringify(docs).includes("inline-db:"),false);assert.equal(JSON.stringify(docs).includes(source.text),false)
    const hits=await f.content.search(bob,f.base,"cedar");assert.equal(hits.length,1);assert.equal(hits[0].citation,source.filename+"#chunk-0")
    assert.equal((await f.content.search(bob,f.base,"%_")).length,0)
    assert.ok(Object.keys(hits[0]).every(key=>["document_id","filename","chunk_index","snippet","citation"].includes(key)))
    for(const column of ["embedding","embedding_model"])
      assert.equal((await f.db.query("SELECT has_column_privilege('agentstudio_knowledge_content','agentstudio.knowledge_chunks',$1::text,'SELECT') AS access",[column])).rows[0].access,false)
    assert.equal((await f.db.query("SELECT has_column_privilege('agentstudio_knowledge_content','agentstudio.knowledge_documents','object_key','SELECT') AS access")).rows[0].access,false)
    assert.equal((await f.db.query("SELECT has_any_column_privilege('agentstudio_knowledge_acl','agentstudio.knowledge_chunks','SELECT') AS access")).rows[0].access,false)
    for(const table of ["model_connections","tool_connection_headers","mcp_connection_headers","smithery_credentials"])
      assert.equal((await f.db.query("SELECT has_any_column_privilege('agentstudio_knowledge_content',$1::text,'SELECT,INSERT,UPDATE,REFERENCES') AS access",["agentstudio."+table])).rows[0].access,false)
  }finally{await f.close()}
})
test("existing-recipient grants adjust or restore only the reviewed recipient revision and current activity",async()=>{
  const f=await fixture()
  try{
    await f.share()
    const choice={action:"grant_existing",recipient_id:f.users.bob,role:"editor",semantic_allowed:false,expected_revision:1,request_id:randomUUID()}
    assert.equal((await f.access.change(alice,f.base,choice)).item.role,"editor")
    await assert.rejects(f.access.change(bob,f.base,{...choice,request_id:randomUUID()}),error=>error.status===404)
    await f.access.change(alice,f.base,{action:"revoke",recipient_id:f.users.bob,expected_revision:2,request_id:randomUUID()})
    await assert.rejects(f.access.change(alice,f.base,{...choice,request_id:randomUUID()}),error=>error.status===409)
    const restored=await f.access.change(alice,f.base,{...choice,expected_revision:3,request_id:randomUUID()})
    assert.equal(restored.item.revoked,false);assert.equal(restored.item.revision,4)
    await f.db.query("UPDATE agentstudio.users SET status='disabled' WHERE id=$1",[f.users.bob])
    await assert.rejects(f.access.change(alice,f.base,{...choice,expected_revision:4,request_id:randomUUID()}),error=>error.status===404)
  }finally{await f.close()}
})
test("editor imports under original owner, with durable receipts, safe duplicate rejection and owner-visible actor audit",async()=>{
  const f=await fixture()
  try{
    await f.share()
    const request=randomUUID()
    await assert.rejects(f.content.importParsed(bob,f.base,request,source),error=>error.status===403)
    await f.share("editor",1)
    const created=await f.content.importParsed(bob,f.base,request,source)
    assert.equal(created.replayed,false);assert.equal(created.item.sha256,createHash("sha256").update(source.text).digest("hex"))
    assert.deepEqual((await f.content.importParsed(bob,f.base,request,source)).item,created.item)
    assert.equal((await f.content.importParsed(bob,f.base,request,source)).replayed,true)
    assert.deepEqual(await f.content.receipt(bob,f.base,request),created.item)
    assert.equal(await f.content.receipt(alice,f.base,request),null)
    await assert.rejects(f.content.importParsed(bob,f.base,request,{...source,text:"changed"}),error=>error.status===409)
    await assert.rejects(f.content.importParsed(bob,f.base,randomUUID(),source),error=>error.status===409&&error.code==="duplicate_document")
    const row=(await f.db.query("SELECT owner_user_id FROM agentstudio.knowledge_documents WHERE id=$1",[created.item.document_id])).rows[0]
    assert.equal(row.owner_user_id,f.users.alice)
    const audits=(await f.db.query("SELECT owner_user_id,actor_user_id,metadata FROM agentstudio.audit_events WHERE action='knowledge.document_import'")).rows
    assert.equal(audits.length,1);assert.equal(audits[0].actor_user_id,f.users.bob);assert.equal(audits[0].owner_user_id,f.users.alice)
    assert.equal(JSON.stringify(audits).includes(source.text),false)
  }finally{await f.close()}
})
test("delete requires current editor authority and reviewed document hash; retries never delete another document",async()=>{
  const f=await fixture()
  try{
    await f.share("editor")
    const doc=(await f.content.importParsed(bob,f.base,randomUUID(),source)).item,request=randomUUID()
    await assert.rejects(f.content.delete(bob,f.base,request,doc.document_id,"0".repeat(64)),error=>error.status===409)
    const deleted=await f.content.delete(bob,f.base,request,doc.document_id,doc.sha256)
    assert.equal(deleted.item.action,"delete");assert.equal((await f.content.search(bob,f.base,"cedar")).length,0)
    assert.equal((await f.db.query("SELECT count(*)::int AS n FROM agentstudio.knowledge_chunks WHERE document_id=$1",[doc.document_id])).rows[0].n,0)
    const replacement=(await f.content.importParsed(alice,f.base,randomUUID(),source)).item
    assert.equal((await f.content.delete(bob,f.base,request,doc.document_id,doc.sha256)).replayed,true)
    assert.ok((await f.content.documents(bob,f.base)).some(row=>row.id===replacement.document_id))
    await assert.rejects(f.content.delete(bob,f.base,request,replacement.document_id,replacement.sha256),error=>error.status===409)
  }finally{await f.close()}
})
test("revocation and deactivation fence metadata, search, receipts and writes without enabling generic private repositories",async()=>{
  const f=await fixture()
  try{
    await f.share("editor")
    const request=randomUUID();await f.content.importParsed(bob,f.base,request,source)
    await f.access.change(alice,f.base,{action:"revoke",recipient_id:f.users.bob,expected_revision:1,request_id:randomUUID()})
    for(const action of [()=>f.content.get(bob,f.base),()=>f.content.documents(bob,f.base),()=>f.content.search(bob,f.base,"cedar"),()=>f.content.receipt(bob,f.base,request),()=>f.content.importParsed(bob,f.base,request,source)])
      await assert.rejects(action(),error=>error.status===404)
    await f.share("viewer",2)
    assert.equal((await f.content.search(bob,f.base,"cedar")).length,1)
    await assert.rejects(f.content.importParsed(bob,f.base,request,source),error=>error.status===403)
    await f.db.query("UPDATE agentstudio.users SET status='disabled' WHERE id=$1",[f.users.alice])
    await assert.rejects(f.content.get(bob,f.base),error=>error.status===404)
  }finally{await f.close()}
})
test("Unicode chunking is lossless; malformed paths, mismatched MIME, foreign document and body limits fail atomically",async()=>{
  const f=await fixture()
  try{
    const text="😀中文".repeat(700),created=(await f.content.importParsed(alice,f.base,randomUUID(),{...source,text})).item
    const chunks=(await f.db.query("SELECT text_content FROM agentstudio.knowledge_chunks WHERE document_id=$1 ORDER BY chunk_index",[created.document_id])).rows
    assert.equal(chunks.map(row=>row.text_content).join(""),text);assert.equal(chunks.length,3)
    for(const bad of [{filename:"../evil.txt"},{filename:"safe.txt",mime_type:"application/pdf"},{text:"x".repeat(160001)},{filename:".hide.txt"}])
      await assert.rejects(f.content.importParsed(alice,f.base,randomUUID(),{...source,...bad}),error=>error.status===400)
    await assert.rejects(f.content.delete(alice,f.base,randomUUID(),f.resources.bob.kb.id,"a".repeat(64)),error=>error.status===404)
    for(const role of ["agentstudio_worker","agentstudio_model_broker","agentstudio_bound_dispatch"])
      assert.equal((await f.db.query("SELECT has_function_privilege($1::text,'agentstudio.knowledge_content_import(uuid,uuid,text,text,text)','EXECUTE') AS access",[role])).rows[0].access,false)
    assert.equal((await f.db.query("SELECT count(*)::int AS n FROM pg_auth_members WHERE roleid='agentstudio_knowledge_content'::regrole")).rows[0].n,0)
  }finally{await f.close()}
})
test("employee text ingestion retains the old 160k-character capacity and all plain-text formats without executing HTML",async()=>{
  const f=await fixture()
  try{
    const text="文".repeat(159990)+" cedar文文文文",name="文".repeat(176)+".txt"
    const large=(await f.content.importParsed(alice,f.base,randomUUID(),{filename:name,mime_type:"text/plain",text})).item
    const chunks=(await f.db.query("SELECT text_content FROM agentstudio.knowledge_chunks WHERE document_id=$1 ORDER BY chunk_index",[large.document_id])).rows
    assert.equal(chunks.map(row=>row.text_content).join(""),text);assert.equal(large.chunk_count,200)
    for(const [ext,mime] of [["csv","text/csv"],["tsv","text/tab-separated-values"],["json","application/json"],["html","text/html"],["htm","text/html"],["markdown","text/markdown"]]){
      const body='<script>foreign()</script> cedar '+ext
      await f.content.importParsed(alice,f.base,randomUUID(),{filename:"format."+ext,mime_type:mime,text:body})
      const hits=await f.content.search(alice,f.base,"cedar "+ext)
      assert.ok(hits.some(hit=>hit.snippet===body))
    }
  }finally{await f.close()}
})
