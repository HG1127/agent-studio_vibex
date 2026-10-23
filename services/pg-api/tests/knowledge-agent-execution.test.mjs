import test from "node:test"
import assert from "node:assert/strict"
import {randomUUID} from "node:crypto"
import {knowledgeAgentFixture} from "./helpers/knowledge-agent-fixture.mjs"
import {alice,bob} from "./helpers/workflow-v2-agent-fixture.mjs"
import {KnowledgeBaseRepository} from "../src/knowledge-repository.ts"
import {verifyKnowledgeExecutionCredentials} from "../src/knowledge-execution-audit.ts"
import {verifyKnowledgeAgentCredentials} from "../src/knowledge-agent-audit.ts"
import {AgentModelWorker} from "../src/model-worker.ts"
import {scopedKnowledgePool} from "../src/knowledge-scope-policy.ts"
import {verifyKnowledgeAgentSchema} from "../src/knowledge-content-privileges.ts"
import {requireCurrentSingleAgentInput,currentSingleAgentOutputs} from "../src/knowledge-agent-execution.ts"
import {withActor} from "../src/repository.ts"
import {knowledgeKeywordFixture} from "./helpers/knowledge-keyword-fixture.mjs"

test("single-shot Agent atomically seals actual evidence, calls only its reader model and retains no private text in the ledger",async()=>{
  const f=await knowledgeAgentFixture();let calls=0
  try{
    assert.equal(await verifyKnowledgeExecutionCredentials(f.db),true)
    const {runs,run}=await f.approved()
    assert.equal((await runs.get(bob,run.id)).knowledge_outputs_available,true)
    await f.withBound(async(material,input)=>{
      calls++;assert.equal(material.api_key,"synthetic-bob-model-key-never-network")
      assert.match(JSON.stringify(input.knowledgeEvidence),/OWN_CITATION/)
      return "Synthetic single-shot result"
    },async worker=>{
      assert.equal((await worker.tick()).status,"succeeded");assert.equal((await worker.tick()).status,"idle")
    })
    assert.equal(calls,1)
    const ledger=(await f.db.query("SELECT * FROM agentstudio.knowledge_agent_observations WHERE run_id=$1",[run.id])).rows[0]
    assert.equal(ledger.reader_user_id,f.users.bob);assert.equal(ledger.result_refs.length,1);assert.match(ledger.input_sha256,/^[a-f0-9]{64}$/)
    assert.doesNotMatch(JSON.stringify(ledger),/OWN_CITATION|synthetic evidence|Search KB|lease_token|api_key|ciphertext/)
    assert.equal((await runs.get(bob,run.id)).result_text,"Synthetic single-shot result")
    await f.db.exec("SET TIME ZONE 'Asia/Shanghai'")
    assert.equal((await runs.get(bob,run.id)).knowledge_outputs_available,true)
    assert.equal((await runs.steps(bob,run.id)).find(s=>s.step_key==="model").metadata.citations.length,1)
    assert.equal((await f.db.query("SELECT count(*)::integer AS count FROM agentstudio.knowledge_query_jobs")).rows[0].count,0)
  }finally{await f.close()}
})

test("completed single-shot result, list, step citations and idempotent replay hide after revoke/regrant",async()=>{
  const f=await knowledgeAgentFixture()
  try{
    const {runs,run,spec}=await f.approved()
    const job=(await f.db.query("SELECT dedupe_key FROM agentstudio.jobs WHERE run_id=$1 AND payload->>'phase'='prepare'",[run.id])).rows[0]
    await f.withBound(async()=>"Original retained result",async worker=>assert.equal((await worker.tick()).status,"succeeded"))
    await f.access.change(alice,f.base,{action:"revoke",recipient_id:f.users.bob,expected_revision:1,request_id:randomUUID()})
    await f.access.change(alice,f.base,{action:"grant_existing",recipient_id:f.users.bob,role:"viewer",semantic_allowed:false,expected_revision:2,request_id:randomUUID()})
    for(const row of [await runs.get(bob,run.id),(await runs.list(bob)).find(r=>r.id===run.id),
      (await runs.submit(bob,spec.id,{instruction:run.instruction,idempotency_key:job.dedupe_key})).run,
      (await runs.decideModel(bob,run.id,{decision:"approved"})).run]){
      assert.equal(row.result_text,"");assert.equal(row.knowledge_outputs_available,false)
    }
    assert.ok((await runs.steps(bob,run.id)).every(step=>Object.keys(step.metadata).length===0))
  }finally{await f.close()}
})

test("single-shot original content is checked after separate credential loading and after provider response without another charge",async()=>{
  for(const stage of ["credentials","response"]){
    const f=await knowledgeAgentFixture();let calls=0,pending=Promise.resolve(),changed=false
    try{
      const mutate=async()=>{changed=true;await f.db.query("UPDATE agentstudio.knowledge_chunks SET text_content='changed original content' WHERE document_id IN(SELECT id FROM agentstudio.knowledge_documents WHERE base_id=$1)",[f.base])}
      const businessPool={knowledgeSharing:true,async connect(){await pending;return f.pool.connect()}}
      const brokerPool={async connect(){const client=await f.pool.connect();let secret=false;return {
        async query(sql,args=[]){const result=await client.query(sql,args);if(sql.includes("FROM agentstudio.model_connections")&&sql.includes("api_key_ciphertext"))secret=true;return result},
        release(){client.release();if(stage==="credentials"&&secret&&!changed)pending=mutate()},
      }}}
      const {runs,run}=await f.approved()
      await f.withBound(async()=>{calls++;if(stage==="response")await mutate();return "MUST NOT PUBLISH"},async worker=>{
        assert.equal((await worker.tick()).status,"quarantined");assert.equal((await worker.tick()).status,"idle")
      },{businessPool,brokerPool})
      await pending;assert.equal(changed,true);assert.equal(calls,stage==="credentials"?0:1)
      const hidden=await runs.get(bob,run.id);assert.equal(hidden.result_text,"");assert.equal(hidden.knowledge_outputs_available,false)
    }finally{await f.close()}
  }
})

test("zero-hit original lookup is invalidated when a new indexed document changes its corpus",async()=>{
  const f=await knowledgeAgentFixture();let calls=0
  try{
    const {runs,run}=await f.approved({instruction:"Search KB: EMPTY_AT_FIRST"})
    await f.withBound(async()=>{calls++;return "must not call"},async worker=>{
      assert.equal((await worker.tick()).status,"quarantined")
    },{beforeDispatch:async()=>{
      await new KnowledgeBaseRepository(f.pool).createTextDocument(alice,f.base,{filename:"new.txt",text:"EMPTY_AT_FIRST new evidence"})
    }})
    assert.equal(calls,0);assert.equal((await runs.get(bob,run.id)).knowledge_outputs_available,false)
    assert.deepEqual((await f.db.query("SELECT result_refs FROM agentstudio.knowledge_agent_observations WHERE run_id=$1",[run.id])).rows[0].result_refs,[])
  }finally{await f.close()}
})

test("private and empty-scope single-shot generation work with every sharing/semantic gate off",async()=>{
  const f=await knowledgeAgentFixture();let calls=0
  try{
    const pool=scopedKnowledgePool(f.pool,false)
    for(const bases of [[],[f.resources.bob.kb.id]]){
      const {runs,run}=await f.approved({pool,bases,bound:false,instruction:bases.length?"Search KB: FOREIGN_SECRET":"Private task"})
      const worker=new AgentModelWorker(pool,"private-single-model",{async generate(input){calls++;assert.equal(input.knowledgeEvidence?.length??0,bases.length);return "Private result"}})
      assert.equal((await worker.tick()).status,"succeeded");assert.equal((await runs.get(bob,run.id)).knowledge_outputs_available,true)
    }
    assert.equal(calls,2)
    const changed=await f.approved({pool,bases:[f.resources.bob.kb.id],bound:false,instruction:"Search KB: FOREIGN_SECRET"})
    const worker=new AgentModelWorker(pool,"private-single-response",{async generate(){
      calls++;await f.db.query("UPDATE agentstudio.knowledge_chunks SET text_content='private source changed' WHERE document_id IN(SELECT id FROM agentstudio.knowledge_documents WHERE base_id=$1)",[f.resources.bob.kb.id])
      return "MUST NOT PUBLISH"
    }})
    assert.equal((await worker.tick()).status,"quarantined");assert.equal((await worker.tick()).status,"idle")
    assert.equal((await changed.runs.get(bob,changed.run.id)).knowledge_outputs_available,false);assert.equal(calls,3)
  }finally{await f.close()}
})

test("the seal binds the exact original excerpts; missing sealed evidence cannot restore a completed result",async()=>{
  const f=await knowledgeAgentFixture()
  try{
    const {runs,run}=await f.approved()
    await f.withBound(async()=>"Retained result",async worker=>{
      const job=await worker.claim(),stage=await worker.begin(job)
      assert.equal(stage.status,"ready")
      const changed={...stage.input,knowledgeEvidence:[{citation:"forged.txt#chunk-0",snippet:"Replacement evidence"}]}
      await assert.rejects(withActor(f.pool,bob,db=>requireCurrentSingleAgentInput(db,run.id,stage.inputSha256,changed)),/agent_observation_source_changed/)
      assert.equal((await worker.succeed(job,"Retained result",stage.input,stage.inputSha256)).status,"succeeded")
    })
    assert.equal((await runs.get(bob,run.id)).knowledge_outputs_available,true)
    await f.db.query("DELETE FROM agentstudio.knowledge_agent_observations WHERE run_id=$1",[run.id])
    assert.equal((await runs.get(bob,run.id)).knowledge_outputs_available,false)
    assert.equal((await runs.get(bob,run.id)).result_text,"")
    assert.equal(await withActor(f.pool,alice,db=>currentSingleAgentOutputs(db,run.id)),false)
    // Imported/completed records with a low historical counter are not a
    // pre-model exemption, even if their original effect marker is absent.
    await f.db.query("DELETE FROM agentstudio.external_effects WHERE run_id=$1",[run.id])
    await f.db.query("UPDATE agentstudio.runs SET step_count=0 WHERE id=$1",[run.id])
    assert.equal((await runs.get(bob,run.id)).knowledge_outputs_available,false)
    assert.equal((await runs.get(bob,run.id)).result_text,"")
  }finally{await f.close()}
})

test("a failure between initial lookup and sealing rolls back the ledger and started effect together",async()=>{
  const f=await knowledgeAgentFixture();let calls=0
  try{
    const {run}=await f.approved()
    f.setFault(sql=>{if(sql.includes("SELECT agentstudio.knowledge_agent_seal"))throw Error("synthetic_before_seal_failure")})
    await f.withBound(async()=>{calls++;return "must not call"},async worker=>assert.equal((await worker.tick()).status,"failed"))
    f.setFault(undefined);assert.equal(calls,0)
    assert.equal((await f.db.query("SELECT count(*)::integer AS count FROM agentstudio.knowledge_agent_observations WHERE run_id=$1",[run.id])).rows[0].count,0)
    assert.equal((await f.db.query("SELECT count(*)::integer AS count FROM agentstudio.external_effects WHERE run_id=$1",[run.id])).rows[0].count,0)
  }finally{await f.close()}
})

test("Agent catalog inspection works for six restricted roles and rejects data, mutation, ownership and function drift",async()=>{
  const f=await knowledgeAgentFixture()
  try{
    await verifyKnowledgeAgentSchema(f.pool)
    for(const role of ["agentstudio_api","agentstudio_worker","agentstudio_model_broker","agentstudio_bound_dispatch","agentstudio_knowledge_index_worker","agentstudio_knowledge_index_broker"]){
      await f.db.exec("BEGIN READ ONLY")
      try{await f.db.exec("SET LOCAL ROLE "+role);assert.equal(await verifyKnowledgeExecutionCredentials(f.db),true)}finally{await f.db.exec("ROLLBACK")}
    }
    for(const mutation of [
      "GRANT SELECT(api_key_ciphertext) ON agentstudio.model_connections TO agentstudio_knowledge_agent",
      "GRANT SELECT(text_content) ON agentstudio.knowledge_chunks TO agentstudio_knowledge_agent",
      "GRANT UPDATE(corpus_sha256) ON agentstudio.knowledge_agent_observations TO agentstudio_knowledge_agent",
      "GRANT SELECT ON agentstudio.knowledge_agent_observations TO agentstudio_api",
      "GRANT EXECUTE ON FUNCTION agentstudio.knowledge_agent_source(uuid,jsonb,uuid[],boolean) TO agentstudio_api",
      "GRANT EXECUTE ON FUNCTION agentstudio.knowledge_agent_prepare(jsonb,uuid[],text) TO PUBLIC",
      "GRANT EXECUTE ON FUNCTION agentstudio.knowledge_keyword_snapshot(uuid[],text) TO agentstudio_api",
      "GRANT agentstudio_knowledge_agent TO agentstudio_api",
      "ALTER ROLE agentstudio_knowledge_agent LOGIN",
      "ALTER TABLE agentstudio.knowledge_agent_observations NO FORCE ROW LEVEL SECURITY",
      "ALTER TABLE agentstudio.knowledge_agent_observations OWNER TO agentstudio_api",
      "ALTER TABLE agentstudio.knowledge_agent_observations DROP CONSTRAINT knowledge_agent_observations_pkey",
    ]){
      await f.db.exec("BEGIN")
      try{await f.db.exec(mutation);await assert.rejects(verifyKnowledgeExecutionCredentials(f.db),/unsafe_knowledge_(?:agent|keyword)_privileges/)}finally{await f.db.exec("ROLLBACK")}
    }
    await f.db.query("DELETE FROM agentstudio.schema_migrations WHERE version='pg_v9_042'")
    assert.equal(await verifyKnowledgeAgentCredentials(f.db),true)
    await assert.rejects(verifyKnowledgeAgentSchema(f.pool),/agent_observation_schema_required/)
  }finally{await f.close()}
})

test("an absent old isolated stage remains compatible; partial Agent schema never falls back",async()=>{
  const f=await knowledgeKeywordFixture()
  try{
    assert.equal(await verifyKnowledgeAgentCredentials(f.db),false)
    await assert.rejects(verifyKnowledgeAgentSchema(f.pool),/agent_observation_schema_required/)
    await f.db.exec("CREATE ROLE agentstudio_knowledge_agent NOLOGIN NOINHERIT")
    await assert.rejects(verifyKnowledgeAgentCredentials(f.db),/unsafe_knowledge_agent_privileges/)
    await assert.rejects(withActor(f.pool,bob,db=>currentSingleAgentOutputs(db,randomUUID())),/agent_observation_schema_incomplete/)
  }finally{await f.close()}
})
