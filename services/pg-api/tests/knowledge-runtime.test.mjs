import test from "node:test"
import assert from "node:assert/strict"
import {randomUUID} from "node:crypto"
import {agentFixture,alice,bob} from "./helpers/workflow-v2-agent-fixture.mjs"
import {KnowledgeAccessRepository} from "../src/knowledge-access-repository.ts"
import {KnowledgeContentRepository} from "../src/knowledge-content-repository.ts"
import {AgentSpecRepository,withActor} from "../src/repository.ts"
import {verifyWorkflowGraphResources} from "../src/workflow-repository.ts"
import {RunRepository} from "../src/run-repository.ts"
import {scopedKnowledgePool,sharedKnowledgeScopeEnabled} from "../src/knowledge-scope-policy.ts"
import {requireKnowledgeScope} from "../src/knowledge-runtime-scope.ts"
import {gatherAuthorizedKnowledgeEvidence,gatherPrivateKnowledgeEvidence} from "../src/agent-knowledge-grounding.ts"
import {verifyKnowledgeRuntimeSchema} from "../src/knowledge-content-privileges.ts"
async function fixture(){
  const f=await agentFixture({mcp:true,smithery:true,sharing:true})
  const access=new KnowledgeAccessRepository(f.pool,async()=>({id:f.users.alice,display_name:"Alice"}))
  const base=f.resources.bob.kb.id
  await access.change(bob,base,{action:"grant",recipient_email:"alice@example.test",role:"viewer",semantic_allowed:false,expected_revision:0,request_id:randomUUID()})
  return {...f,access,base,content:new KnowledgeContentRepository(f.pool),async revoke(){
    return access.change(bob,base,{action:"revoke",recipient_id:f.users.alice,expected_revision:1,request_id:randomUUID()})
  }}
}
test("runtime schema fails closed on missing SQL, PUBLIC execute or search-path drift, without credential/vector grants",async()=>{
  const f=await fixture()
  try{
    await verifyKnowledgeRuntimeSchema(f.pool)
    for(const [bad,restore] of [
      ["GRANT EXECUTE ON FUNCTION agentstudio.knowledge_runtime_scope(uuid[]) TO PUBLIC","REVOKE ALL ON FUNCTION agentstudio.knowledge_runtime_scope(uuid[]) FROM PUBLIC"],
      ["ALTER FUNCTION agentstudio.knowledge_runtime_search(uuid,text) SET search_path=public","ALTER FUNCTION agentstudio.knowledge_runtime_search(uuid,text) SET search_path=pg_catalog"],
    ]){await f.db.query(bad);await assert.rejects(verifyKnowledgeRuntimeSchema(f.pool),/unsafe_knowledge_content_privileges/);await f.db.query(restore)}
    await verifyKnowledgeRuntimeSchema(f.pool)
    await f.db.query("DROP FUNCTION agentstudio.knowledge_runtime_search(uuid,text)")
    await assert.rejects(verifyKnowledgeRuntimeSchema(f.pool),/unsafe_knowledge_content_privileges/)
  }finally{await f.close()}
})
test("transaction-local sharing never leaks to a reused private pool or a different principal, and revoke fences every read",async()=>{
  const f=await fixture(),privatePool=scopedKnowledgePool(f.pool,false)
  try{
    const scope=await withActor(f.pool,alice,(db,id)=>requireKnowledgeScope(db,id,[f.base]))
    assert.deepEqual(scope,[{base_id:f.base,owner_user_id:f.users.bob,access_role:"viewer"}])
    await assert.rejects(withActor(privatePool,alice,(db,id)=>requireKnowledgeScope(db,id,[f.base])),e=>e.status===404)
    assert.equal(await withActor(privatePool,alice,db=>sharedKnowledgeScopeEnabled(db)),false)
    await assert.rejects(withActor(f.pool,alice,db=>requireKnowledgeScope(db,f.users.bob,[f.base])),e=>e.status===403)
    assert.equal((await withActor(f.pool,alice,(db,id)=>gatherAuthorizedKnowledgeEvidence(db,id,[f.base],"FOREIGN_SECRET"))).length,1)
    await assert.rejects(withActor(f.pool,alice,(db,id)=>gatherPrivateKnowledgeEvidence(db,id,[f.base],"FOREIGN_SECRET")),/scope_revoked/)
    await f.revoke()
    await assert.rejects(withActor(f.pool,alice,(db,id)=>gatherAuthorizedKnowledgeEvidence(db,id,[f.base],"FOREIGN_SECRET")),e=>e.status===404)
    assert.equal((await f.db.query("SELECT current_setting('agentstudio.knowledge_sharing_enabled',true) AS value")).rows[0].value,"")
  }finally{await f.close()}
})
test("Agent and Workflow binding use current shared grants and the reader's model; unbound legacy generation is refused",async()=>{
  const f=await fixture()
  try{
    const saved=f.resources.alice.spec
    const agent=await f.agents.update(alice,saved.id,"reader",{...saved.spec,knowledge_base_ids:[f.base]},saved.revision)
    assert.equal(agent.spec.model_binding.connection_id,f.resources.alice.model.id)
    const graph={version:2,nodes:[{id:"s",type:"start",data:{title:"Start"},position:{x:0,y:0}},{id:"a",type:"agent",data:{title:"Agent",agent_binding:{spec_id:agent.id,spec_revision:agent.revision},max_steps:2},position:{x:100,y:0}},{id:"e",type:"end",data:{title:"End"},position:{x:200,y:0}}],edges:[{id:"sa",source:"s",target:"a"},{id:"ae",source:"a",target:"e"}]}
    const flow=await f.flows.create(alice,"shared reader graph",graph)
    const unbound={...agent.spec};delete unbound.model_binding
    const unboundAgent=await f.agents.create(alice,"unbound",unbound)
    await assert.rejects(new RunRepository(f.pool).submit(alice,unboundAgent.id,{instruction:"检索词：FOREIGN_SECRET",idempotency_key:"shared-unbound-refused"}),e=>e.status===409&&e.code==="shared_knowledge_requires_owner_model_binding")
    await f.revoke()
    await assert.rejects(withActor(f.pool,alice,(db,id)=>verifyWorkflowGraphResources(db,id,flow.graph)),e=>e.status===404)
    await assert.rejects(f.agents.update(alice,agent.id,"revoked",agent.spec,agent.revision),e=>e.status===404)
    assert.ok(await f.flows.get(alice,flow.id))
    await assert.rejects(new AgentSpecRepository(scopedKnowledgePool(f.pool,false)).create(alice,"private",agent.spec),e=>e.status===404)
  }finally{await f.close()}
})
test("300-codepoint emoji evidence and 180-codepoint filenames work for both the owner and shared reader",async()=>{
  const f=await fixture()
  try{
    const filename="😀".repeat(176)+".txt",text="cedar "+"😀".repeat(400)
    await f.content.importParsed(bob,f.base,randomUUID(),{filename,mime_type:"text/plain",text})
    for(const [identity,pool,reader] of [[bob,scopedKnowledgePool(f.pool,false),gatherPrivateKnowledgeEvidence],[alice,f.pool,gatherAuthorizedKnowledgeEvidence]]){
      const hits=await withActor(pool,identity,(db,id)=>reader(db,id,[f.base],"cedar"))
      assert.equal(hits.length,1);assert.equal(hits[0].citation,filename+"#chunk-0")
      assert.equal(Array.from(hits[0].snippet).length,300);assert.ok(hits[0].snippet.length>320)
    }
    await f.db.query("UPDATE agentstudio.users SET status='disabled' WHERE id=$1",[f.users.bob])
    await assert.rejects(withActor(f.pool,alice,(db,id)=>requireKnowledgeScope(db,id,[f.base])),e=>e.status===404)
  }finally{await f.close()}
})
test("shared citations pass through approved Agent steps over private mTLS, billed only to the reader's own model",async()=>{
  const f=await fixture()
  try{
    const saved=f.resources.alice.spec,agent=await f.agents.update(alice,saved.id,"shared reader",{...saved.spec,knowledge_base_ids:[f.base]},saved.revision)
    const queued=await f.make({spec:agent});let calls=0,decisions=0
    await f.privateTls(async(material,prompt)=>{
      calls++;assert.equal(material.api_key,"synthetic-alice-model-key-never-network")
      assert.notEqual(material.api_key,"synthetic-bob-model-key-never-network")
      const input=JSON.parse(prompt)
      if(input.round===1)return JSON.stringify({action:"tool",tool:"knowledge_search",params:{query:"FOREIGN_SECRET"}})
      assert.match(JSON.stringify(input.history),/FOREIGN_SECRET/)
      assert.match(JSON.stringify(input.history),/authorized_keyword/)
      return JSON.stringify({action:"answer",answer:"Shared citation reviewed"})
    },async makeWorker=>{
      const done=await f.drive(makeWorker,queued.run.id,()=>{decisions++;return "approved"})
      assert.equal(done.run.status,"succeeded");assert.equal(done.run.result_text,"Shared citation reviewed")
    })
    assert.equal(calls,2);assert.equal(decisions,4)
  }finally{await f.close()}
})
test("a revoke committed after credential loading prevents the paid model executor and leaves no automatic replay",async()=>{
  const f=await fixture()
  try{
    const saved=f.resources.alice.spec,agent=await f.agents.update(alice,saved.id,"shared reader",{...saved.spec,knowledge_base_ids:[f.base]},saved.revision)
    const queued=await f.make({spec:agent});let pending=Promise.resolve(),hooked=false,calls=0
    const businessPool={knowledgeSharing:true,async connect(){await pending;return f.pool.connect()}}
    const brokerPool={async connect(){const db=await f.pool.connect();let mutate=false;return {
      async query(sql,args=[]){const value=await db.query(sql,args);if(!hooked&&sql.includes("FROM agentstudio.model_connections")&&sql.includes("api_key_ciphertext")){hooked=true;mutate=true}return value},
      release(){db.release();if(mutate)pending=f.revoke()},
    }}}
    await f.privateTls(async()=>{calls++;return JSON.stringify({action:"answer",answer:"must not execute"})},async makeWorker=>{
      const done=await f.drive(makeWorker,queued.run.id)
      assert.equal(done.run.status,"paused")
      assert.equal((await makeWorker().tick()).status,"idle")
    },{businessPool,brokerPool})
    await pending;assert.equal(hooked,true);assert.equal(calls,0)
    assert.equal((await f.db.query("SELECT count(*)::int AS n FROM agentstudio.external_effects WHERE run_id=$1 AND status='unknown'",[queued.run.id])).rows[0].n>=1,true)
  }finally{await f.close()}
})
