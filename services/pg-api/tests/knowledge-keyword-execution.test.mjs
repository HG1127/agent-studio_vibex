import test from "node:test"
import assert from "node:assert/strict"
import {randomUUID} from "node:crypto"
import {knowledgeKeywordFixture,createKeywordRun,approveKeywordStep} from "./helpers/knowledge-keyword-fixture.mjs"
import {alice,bob} from "./helpers/workflow-v2-agent-fixture.mjs"
import {verifyKnowledgeExecutionCredentials} from "../src/knowledge-execution-audit.ts"
import {verifyKnowledgeKeywordCredentials} from "../src/knowledge-keyword-audit.ts"
import {WorkflowRepository} from "../src/workflow-repository.ts"
import {WorkflowV2RunRepository} from "../src/workflow-v2-run-repository.ts"
import {scopedKnowledgePool} from "../src/knowledge-scope-policy.ts"
import {verifyKnowledgeRuntimeSchema} from "../src/knowledge-content-privileges.ts"
import {knowledgeQueryFixture} from "./helpers/knowledge-query-fixture.mjs"
import {KnowledgeBaseRepository} from "../src/knowledge-repository.ts"
import {KnowledgeQueryWorker} from "../src/knowledge-query-worker.ts"
import {createKnowledgeQueryPrivateClient,createKnowledgeQueryPrivateHandler} from "../src/knowledge-query-private-tls.ts"
import {withDisposableBoundModelTls} from "./helpers/bound-model-loopback-tls.mjs"
import {workflowKnowledgeQueryId} from "../src/knowledge-execution-source.ts"
import {KNOWLEDGE_TOOL_CHARGE_ACKNOWLEDGEMENT} from "../src/knowledge-retrieval-binding.ts"
import {setTimeout as delay} from "node:timers/promises"

test("free keyword Workflow/Agent/autonomous effects retain private source hashes without embedding profiles, consent or fee acknowledgement",async()=>{
  for(const kind of ["tool","agent","autonomous"]){
    const f=await knowledgeKeywordFixture();let models=0
    try{
      assert.equal(await verifyKnowledgeExecutionCredentials(f.db),true)
      assert.equal((await f.db.query("SELECT count(*)::integer AS count FROM agentstudio.knowledge_embedding_profiles")).rows[0].count,0)
      const {runs,queued}=await createKeywordRun(f,kind)
      await f.privateTls(async(material,prompt)=>{
        models++;assert.equal(material.api_key,"synthetic-bob-model-key-never-network")
        if(models===1)return '{"action":"tool","tool":"knowledge_search","params":{"query":"OWN_CITATION"}}'
        assert.match(prompt,/OWN_CITATION/);return '{"action":"answer","answer":"Synthetic keyword answer"}'
      },async makeWorker=>{
        for(let i=0;i<40;i++){
          await makeWorker().tick();const view=await runs.get(bob,queued.run.id)
          if(view.run.status==="awaiting_approval")await approveKeywordStep(runs,queued.run.id)
          else if(view.run.status==="succeeded")return
          else assert.ok(!["paused","failed","cancelled"].includes(view.run.status),JSON.stringify(view))
        }
        throw Error("keyword run did not settle")
      },{autonomousExecution:kind==="autonomous",directModel:async(material,prompt)=>{
        models++;assert.equal(material.api_key,"synthetic-bob-model-key-never-network");assert.match(prompt,/OWN_CITATION/);return "Synthetic keyword answer"
      }})
      assert.equal(models,kind==="tool"?1:2)
      const ledger=(await f.db.query("SELECT * FROM agentstudio.knowledge_keyword_observations WHERE run_id=$1",[queued.run.id])).rows
      assert.equal(ledger.length,1);assert.equal(ledger[0].reader_user_id,f.users.bob);assert.equal(ledger[0].result_refs.length,1)
      assert.doesNotMatch(JSON.stringify(ledger),/OWN_CITATION|synthetic evidence|Synthetic keyword task|nonce|ciphertext|lease_token/)
      assert.equal((await f.db.query("SELECT count(*)::integer AS count FROM agentstudio.knowledge_query_jobs")).rows[0].count,0)
      await f.db.exec("SET TIME ZONE 'Asia/Shanghai'")
      assert.equal((await runs.get(bob,queued.run.id)).knowledge_outputs_available,true)
      await f.access.change(alice,f.base,{action:"revoke",recipient_id:f.users.bob,expected_revision:1,request_id:randomUUID()})
      const hidden=await runs.get(bob,queued.run.id)
      assert.equal(hidden.run.result_text,"");assert.equal(hidden.knowledge_outputs_available,false)
      assert.equal((await runs.list(bob)).find(row=>row.id===queued.run.id).result_preview,"")
      if(kind!=="autonomous")await assert.rejects(runs.outputs(bob,queued.run.id),e=>e.code==="knowledge_observations_unavailable")
    }finally{await f.close()}
  }
})

test("zero-hit keyword snapshots still fence the corpus and grant versions",async()=>{
  for(const change of ["new_document","regrant"]){
    const f=await knowledgeKeywordFixture()
    try{
      const {runs,queued}=await createKeywordRun(f,"tool",{query:"INITIAL_EMPTY_QUERY"})
      await f.privateTls(async()=>{throw Error("unexpected Agent")},async makeWorker=>{
        await makeWorker().tick();await approveKeywordStep(runs,queued.run.id);await makeWorker().tick();await makeWorker().tick()
        const record=(await f.db.query("SELECT result_refs,corpus_sha256 FROM agentstudio.knowledge_keyword_observations WHERE run_id=$1",[queued.run.id])).rows[0]
        assert.deepEqual(record.result_refs,[]);assert.match(record.corpus_sha256,/^[a-f0-9]{64}$/)
        assert.equal((await runs.get(bob,queued.run.id)).knowledge_outputs_available,true)
        if(change==="new_document")await new KnowledgeBaseRepository(f.pool).createTextDocument(alice,f.base,{filename:"new.txt",text:"INITIAL_EMPTY_QUERY now has synthetic evidence"})
        else{
          await f.access.change(alice,f.base,{action:"revoke",recipient_id:f.users.bob,expected_revision:1,request_id:randomUUID()})
          await f.access.change(alice,f.base,{action:"grant_existing",recipient_id:f.users.bob,role:"viewer",semantic_allowed:false,expected_revision:2,request_id:randomUUID()})
        }
        assert.equal((await runs.get(bob,queued.run.id)).knowledge_outputs_available,false)
      })
    }finally{await f.close()}
  }
})

test("keyword evidence is rechecked after credential loading and after a provider response without another POST",async()=>{
  for(const stage of ["credentials","response"]){
    const f=await knowledgeKeywordFixture();let models=0,changed=false
    try{
      const edit=async()=>{changed=true;await f.db.query("UPDATE agentstudio.knowledge_chunks SET text_content='changed during dispatch' WHERE document_id IN(SELECT id FROM agentstudio.knowledge_documents WHERE base_id=$1)",[f.base])}
      const brokerPool={async connect(){const client=await f.pool.connect();let secret=false
        return {async query(statement,values=[]){const result=await client.query(statement,values)
          if(statement.startsWith("SELECT revision,enabled,status,provider")&&statement.includes("api_key_ciphertext"))secret=true
          if(stage==="credentials"&&secret&&statement==="COMMIT"&&!changed)await edit()
          return result},release:()=>client.release()}
      }}
      const {runs,queued}=await createKeywordRun(f)
      await f.privateTls(async()=>{throw Error("unexpected Agent")},async makeWorker=>{
        await makeWorker().tick();await approveKeywordStep(runs,queued.run.id);await makeWorker().tick();await makeWorker().tick();await approveKeywordStep(runs,queued.run.id)
        await makeWorker().tick();await makeWorker().tick();await makeWorker().tick()
        assert.equal(changed,true);assert.equal(models,stage==="credentials"?0:1)
        const view=await runs.get(bob,queued.run.id)
        assert.equal(view.knowledge_outputs_available,false);assert.equal(view.run.result_text,"");assert.notEqual(view.run.status,"succeeded")
      },{brokerPool,directModel:async()=>{models++;if(stage==="response")await edit();return "MUST NOT PUBLISH"}})
    }finally{await f.close()}
  }
})

test("owner-private keyword lookup still works with sharing, embedding, query and semantic Tool gates all disabled",async()=>{
  const f=await knowledgeKeywordFixture();let models=0
  try{
    const pool=scopedKnowledgePool(f.pool,false),local={...f,pool,base:f.resources.bob.kb.id,flows:new WorkflowRepository(pool),runs:new WorkflowV2RunRepository(pool)}
    const {runs,queued}=await createKeywordRun(local,"tool",{query:"FOREIGN_SECRET"})
    await f.privateTls(async()=>{throw Error("unexpected Agent")},async makeWorker=>{
      for(let i=0;i<15;i++){
        await makeWorker().tick();const view=await runs.get(bob,queued.run.id)
        if(view.run.status==="awaiting_approval")await approveKeywordStep(runs,queued.run.id)
        else if(view.run.status==="succeeded")return
        else assert.ok(!["paused","failed"].includes(view.run.status),JSON.stringify(view))
      }
      throw Error("private keyword run did not settle")
    },{businessPool:pool,workerPool:pool,directModel:async(_,prompt)=>{models++;assert.match(prompt,/FOREIGN_SECRET/);return "Own private answer"}})
    assert.equal(models,1)
    assert.equal((await f.db.query("SELECT count(*)::integer AS count FROM agentstudio.knowledge_embedding_profiles")).rows[0].count,0)
  }finally{await f.close()}
})

test("a queued semantic query rechecks earlier keyword evidence before paying for a different knowledge base",async()=>{
  const f=await knowledgeQueryFixture({semanticTools:true})
  try{
    const bases=new KnowledgeBaseRepository(f.pool),second=await bases.create(alice,"Second synthetic base","Independent source")
    await bases.createTextDocument(alice,second.id,{filename:"second.txt",text:"Independent second synthetic evidence"})
    await f.access.change(alice,second.id,{action:"grant",recipient_email:"bob@example.test",role:"viewer",semantic_allowed:true,expected_revision:0,request_id:randomUUID()})
    for(let i=0;i<5;i++)if((await f.worker().tick()).status==="idle")break
    const p=await f.consents.get(bob),binding={mode:"semantic",profile_id:p.profile_id,profile_revision:p.profile_revision,consent_revision:p.revision}
    const flow=await f.flows.create(bob,"Keyword then semantic",{version:2,nodes:[
      {id:"start",type:"start",data:{title:"Start"},position:{x:0,y:0}},
      {id:"first",type:"tool",data:{title:"First",tool:"knowledge_search",knowledge_base_ids:[f.base],params_template:'{"query":"OWN_CITATION"}'},position:{x:100,y:0}},
      {id:"second",type:"tool",data:{title:"Second",tool:"knowledge_search",knowledge_base_ids:[second.id],knowledge_retrieval:binding,params_template:'{"query":"second different wording"}'},position:{x:200,y:0}},
      {id:"end",type:"end",data:{title:"End",output_template:"{{Second.output}}"},position:{x:300,y:0}}],edges:[{id:"a",source:"start",target:"first"},{id:"b",source:"first",target:"second"},{id:"c",source:"second",target:"end"}]})
    const queued=await f.runs.submit(bob,flow.id,{expected_revision:flow.revision,idempotency_key:randomUUID(),instruction:"Synthetic keyword then semantic"})
    await withDisposableBoundModelTls(claim=>f.queryBroker.dispatch(claim),async config=>{
      const queryWorker=new KnowledgeQueryWorker(f.pool,createKnowledgeQueryPrivateClient(config),{approvedForIsolatedUat:true})
      await f.privateTls(async()=>{throw Error("unexpected Agent")},async makeWorker=>{
        await makeWorker().tick();await approveKeywordStep(f.runs,queued.run.id);await makeWorker().tick();await makeWorker().tick()
        const pending=(await f.runs.get(bob,queued.run.id)).pending_effect
        assert.ok(pending.configuration.knowledge_retrieval)
        await f.runs.decide(bob,queued.run.id,{decision:"approved",step_key:pending.step_key,input_sha256:pending.input_sha256,knowledge_query_charge:KNOWLEDGE_TOOL_CHARGE_ACKNOWLEDGEMENT})
        const request=workflowKnowledgeQueryId(f.users.bob,queued.run.id,pending.step_key),running=makeWorker().tick()
        try{
          let receipt
          for(let i=0;i<80;i++){receipt=await f.queries.get(bob,request);if(receipt?.status==="prepared")break;await delay(15)}
          assert.equal(receipt?.status,"prepared")
          const db=await f.pool.connect()
          try{await db.query("BEGIN");await db.query("UPDATE agentstudio.knowledge_chunks SET text_content='changed initial keyword evidence' WHERE document_id IN(SELECT id FROM agentstudio.knowledge_documents WHERE base_id=$1)",[f.base]);await db.query("COMMIT")}finally{db.release()}
          assert.equal((await queryWorker.tick()).status,"idle")
          await running;assert.equal((await f.queries.get(bob,request)).status,"rejected")
        }finally{await running}
      },{businessPool:f.pool,workerPool:f.pool,allowKnowledge:true})
    },{handlerFactory:createKnowledgeQueryPrivateHandler})
    assert.equal(f.queryCalls.length,0)
  }finally{await f.close()}
})

test("a partial keyword schema cannot silently fall back to the pre-041 adapter",async()=>{
  const f=await knowledgeKeywordFixture({applyKeyword:false})
  try{
    assert.equal(await verifyKnowledgeKeywordCredentials(f.db),false)
    await assert.rejects(verifyKnowledgeRuntimeSchema(f.pool,true),/keyword_observation_schema_required/)
    await f.db.exec("BEGIN")
    try{
      await f.db.exec("CREATE ROLE agentstudio_knowledge_keyword NOLOGIN NOINHERIT")
      await assert.rejects(verifyKnowledgeExecutionCredentials(f.db),/unsafe_knowledge_keyword_privileges/)
    }finally{await f.db.exec("ROLLBACK")}
    assert.equal(await verifyKnowledgeKeywordCredentials(f.db),false)
  }finally{await f.close()}
})

test("keyword content changes and revoke/regrant hide retained model approval and history before any model call",async()=>{
  for(const change of ["content","regrant","filename"]){
    const f=await knowledgeKeywordFixture();let models=0
    try{
      const {runs,queued}=await createKeywordRun(f)
      await f.privateTls(async()=>{throw Error("unexpected Agent model")},async makeWorker=>{
        await makeWorker().tick();await approveKeywordStep(runs,queued.run.id);await makeWorker().tick();await makeWorker().tick()
        assert.match((await runs.get(bob,queued.run.id)).pending_effect.input,/OWN_CITATION/)
        if(change==="content")await f.db.query("UPDATE agentstudio.knowledge_chunks SET text_content='changed synthetic source' WHERE document_id IN(SELECT id FROM agentstudio.knowledge_documents WHERE base_id=$1)",[f.base])
        else if(change==="filename")await f.db.query("UPDATE agentstudio.knowledge_documents SET filename='changed.txt' WHERE base_id=$1",[f.base])
        else{
          await f.access.change(alice,f.base,{action:"revoke",recipient_id:f.users.bob,expected_revision:1,request_id:randomUUID()})
          await f.access.change(alice,f.base,{action:"grant_existing",recipient_id:f.users.bob,role:"viewer",semantic_allowed:false,expected_revision:2,request_id:randomUUID()})
        }
        const after=await runs.get(bob,queued.run.id)
        assert.equal(after.pending_effect,null);assert.equal(after.knowledge_outputs_available,false)
        await assert.rejects(runs.outputHistory(bob,queued.run.id),e=>e.code==="knowledge_observations_unavailable")
        await makeWorker().tick();assert.equal(models,0)
      },{directModel:async()=>{models++;return "MUST NOT GENERATE"}})
    }finally{await f.close()}
  }
})

test("keyword schema preflight rejects privilege leaks, assumable roles, public helpers and erased SQL fences",async()=>{
  const f=await knowledgeKeywordFixture()
  try{
    assert.equal(await verifyKnowledgeKeywordCredentials(f.db),true)
    for(const role of ["agentstudio_api","agentstudio_bound_dispatch","agentstudio_model_broker","agentstudio_worker","agentstudio_knowledge_index_worker","agentstudio_knowledge_index_broker"]){
      await f.db.exec("BEGIN READ ONLY")
      try{await f.db.exec("SET LOCAL ROLE "+role);assert.equal(await verifyKnowledgeKeywordCredentials(f.db),true)}finally{await f.db.exec("ROLLBACK")}
    }
    await f.db.exec("BEGIN")
    try{
      await f.db.exec("CREATE ROLE agentstudio_admin NOLOGIN SUPERUSER; ALTER TABLE agentstudio.knowledge_keyword_observations OWNER TO agentstudio_admin")
      assert.equal(await verifyKnowledgeKeywordCredentials(f.db),true)
    }finally{await f.db.exec("ROLLBACK")}
    for(const mutation of [
      "GRANT SELECT(api_key_ciphertext) ON agentstudio.model_connections TO agentstudio_knowledge_keyword",
      "GRANT SELECT(text_content) ON agentstudio.knowledge_chunks TO agentstudio_knowledge_keyword",
      "GRANT SELECT ON agentstudio.knowledge_keyword_observations TO agentstudio_api",
      "GRANT EXECUTE ON FUNCTION agentstudio.knowledge_keyword_snapshot(uuid[],text) TO agentstudio_api",
      "GRANT EXECUTE ON FUNCTION agentstudio.knowledge_keyword_submit(uuid[],text,jsonb) TO PUBLIC",
      "GRANT agentstudio_knowledge_keyword TO agentstudio_api",
      "ALTER ROLE agentstudio_knowledge_keyword LOGIN",
      "ALTER TABLE agentstudio.knowledge_keyword_observations NO FORCE ROW LEVEL SECURITY",
      "ALTER TABLE agentstudio.knowledge_keyword_observations OWNER TO agentstudio_api",
      "ALTER TABLE agentstudio.knowledge_keyword_observations DROP CONSTRAINT knowledge_keyword_observations_pkey",
    ]){
      await f.db.exec("BEGIN")
      try{await f.db.exec(mutation);await assert.rejects(verifyKnowledgeKeywordCredentials(f.db),/unsafe_knowledge_keyword_privileges/)}finally{await f.db.exec("ROLLBACK")}
    }
    const marker=(await f.db.query("SELECT version,description FROM agentstudio.schema_migrations WHERE version='pg_v9_041'")).rows[0]
    await f.db.query("DELETE FROM agentstudio.schema_migrations WHERE version='pg_v9_041'")
    try{
      assert.equal(await verifyKnowledgeKeywordCredentials(f.db),true)
      await assert.rejects(verifyKnowledgeRuntimeSchema(f.pool,true),/keyword_observation_schema_required/)
    }finally{await f.db.query("INSERT INTO agentstudio.schema_migrations(version,description) VALUES($1,$2)",[marker.version,marker.description])}
    assert.equal(await verifyKnowledgeExecutionCredentials(f.db),true)
  }finally{await f.close()}
})
