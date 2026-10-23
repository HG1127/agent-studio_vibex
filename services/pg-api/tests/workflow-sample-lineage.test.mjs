import test from "node:test"
import assert from "node:assert/strict"
import {randomUUID} from "node:crypto"
import {knowledgeAgentFixture} from "./helpers/knowledge-agent-fixture.mjs"
import {createKeywordRun,approveKeywordStep} from "./helpers/knowledge-keyword-fixture.mjs"
import {alice,bob} from "./helpers/workflow-v2-agent-fixture.mjs"
import {verifyKnowledgeExecutionCredentials} from "../src/knowledge-execution-audit.ts"
import {verifyKnowledgeLineageCredentials} from "../src/knowledge-lineage-audit.ts"
import {verifyWorkflowSampleLineageSchema} from "../src/knowledge-content-privileges.ts"
import {safeWorkflowSampleProvenance} from "../src/workflow-sample-provenance.ts"

async function fixture(){
  const f=await knowledgeAgentFixture()
  try{await f.db.exec(f.sql("migrations/pg_v9_043_workflow_sample_lineage.sql"));return f}catch(e){await f.close();throw e}
}
async function settle(f,worker,id){
  for(let i=0;i<30;i++){
    await worker().tick();const view=await f.runs.get(bob,id)
    if(view.run.status==="awaiting_approval")await approveKeywordStep(f.runs,id)
    else if(view.run.status==="succeeded")return view
    else assert.ok(!["failed","paused","cancelled"].includes(view.run.status),JSON.stringify(view))
  }throw Error("synthetic_lineage_run_did_not_settle")
}
async function source(f){
  const {queued}=await createKeywordRun(f)
  await f.privateTls(async()=>{throw Error("no Agent")},worker=>settle(f,worker,queued.run.id),{directModel:async()=>"Synthetic original model result"})
  return f.runs.outputs(bob,queued.run.id)
}
function request(outputs,{manual=false,input=true,nodes=["search"]}={}){
  return {node_id:"model",expected_revision:outputs.run.workflow_revision,idempotency_key:randomUUID(),samples:{
    input:input?outputs.run.instruction:"Manual instruction",outputs:{search:manual||!nodes.includes("search")?"Manual output":outputs.nodes.find(n=>n.node_id==="search").output_text},
    provenance:manual?{kind:"manual"}:{kind:"history",run_id:outputs.run.run_id,workflow_id:outputs.run.workflow_id,workflow_revision:outputs.run.workflow_revision,
      output_version:outputs.run.output_version,input,nodes}}}
}
const revoke=f=>f.access.change(alice,f.base,{action:"revoke",recipient_id:f.users.bob,expected_revision:1,request_id:randomUUID()})

test("historical debug seals exact owned output version, runs one reader model and redacts every public surface after revoke/regrant",async()=>{
  const f=await fixture();let calls=0
  try{
    assert.equal(await verifyKnowledgeExecutionCredentials(f.db),true);await verifyWorkflowSampleLineageSchema(f.pool)
    const output=await source(f),body=request(output),target=await f.runs.submitNodeDebug(bob,output.run.workflow_id,body)
    await f.privateTls(async()=>{throw Error("no Agent")},worker=>settle(f,worker,target.run.id),{nodeDebugExecutor:async(material,prompt)=>{
      calls++;assert.equal(material.api_key,"synthetic-bob-model-key-never-network");assert.match(prompt,/OWN_CITATION/);return "Synthetic inherited result"
    }})
    assert.equal(calls,1);assert.equal((await f.runs.get(bob,target.run.id)).knowledge_outputs_available,true)
    const ledger=(await f.db.query("SELECT * FROM agentstudio.workflow_sample_lineage WHERE run_id=$1",[target.run.id])).rows[0]
    assert.equal(ledger.reader_user_id,f.users.bob);assert.equal(ledger.source_run_id,output.run.run_id)
    assert.doesNotMatch(JSON.stringify(ledger),/OWN_CITATION|Synthetic keyword task|Synthetic inherited result|api_key|lease_token/)
    await revoke(f);await f.access.change(alice,f.base,{action:"grant_existing",recipient_id:f.users.bob,role:"viewer",semantic_allowed:false,expected_revision:2,request_id:randomUUID()})
    for(const value of [await f.runs.get(bob,target.run.id),await f.runs.submitNodeDebug(bob,output.run.workflow_id,body)]){
      assert.equal(value.knowledge_outputs_available,false);assert.equal(value.run.instruction,"");assert.equal(value.run.result_text,"");assert.equal(value.pending_effect,null)
      assert.doesNotMatch(JSON.stringify(value.steps),/OWN_CITATION|Synthetic inherited result|Synthetic keyword task|output_text|citations/)
    }
    const listed=(await f.runs.list(bob)).find(r=>r.id===target.run.id)
    assert.equal(listed.instruction_preview,"");assert.equal(listed.result_preview,"")
    await assert.rejects(f.runs.outputs(bob,target.run.id),e=>e.code==="knowledge_observations_unavailable")
    await assert.rejects(f.runs.outputHistory(bob,target.run.id),e=>e.code==="knowledge_observations_unavailable")
    assert.equal(calls,1)
  }finally{await f.close()}
})

test("historical provenance refuses foreign/stale versions, changed samples, missing origin and source content edits before admission",async()=>{
  const f=await fixture()
  try{
    const output=await source(f),body=request(output)
    await assert.rejects(f.runs.submitNodeDebug(alice,output.run.workflow_id,body),e=>e.status===404)
    for(const mutate of [b=>delete b.samples.provenance,b=>b.samples.provenance.output_version="f".repeat(64),
      b=>b.samples.input="forged input",b=>b.samples.outputs.search="forged output",b=>b.samples.provenance.workflow_revision++,b=>b.samples.provenance.run_id=randomUUID()]){
      const wrong=structuredClone(body);wrong.idempotency_key=randomUUID();mutate(wrong)
      await assert.rejects(f.runs.submitNodeDebug(bob,output.run.workflow_id,wrong),e=>[400,409].includes(e.status))
    }
    assert.equal((await f.db.query("SELECT count(*)::int AS n FROM agentstudio.workflow_sample_lineage")).rows[0].n,0)
    await f.db.query("UPDATE agentstudio.knowledge_chunks SET text_content='changed evidence' WHERE document_id IN(SELECT id FROM agentstudio.knowledge_documents WHERE base_id=$1)",[f.base])
    await assert.rejects(f.runs.submitNodeDebug(bob,output.run.workflow_id,body),e=>e.code==="workflow_sample_source_unavailable")
  }finally{await f.close()}
})

test("manual overrides retain their independent provenance; target sample tampering and stripped ledger cannot revive inherited text",async()=>{
  const f=await fixture()
  try{
    const output=await source(f),manual=request(output,{manual:true}),target=await f.runs.submitNodeDebug(bob,output.run.workflow_id,manual)
    const auto=await f.runs.submitNodeDebug(bob,output.run.workflow_id,request(output))
    await revoke(f)
    assert.equal((await f.runs.get(bob,target.run.id)).knowledge_outputs_available,true)
    assert.equal((await f.runs.get(bob,auto.run.id)).knowledge_outputs_available,false)
    const before=(await f.db.query("SELECT checkpoint FROM agentstudio.runs WHERE id=$1",[target.run.id])).rows[0].checkpoint
    await f.db.query("UPDATE agentstudio.runs SET checkpoint=jsonb_set(checkpoint,'{node_debug,samples,input}','\"forged manual\"') WHERE id=$1",[target.run.id])
    assert.equal((await f.runs.get(bob,target.run.id)).knowledge_outputs_available,false)
    await f.db.query("UPDATE agentstudio.runs SET checkpoint=$2::jsonb WHERE id=$1",[target.run.id,JSON.stringify(before)])
    await f.db.query("DELETE FROM agentstudio.workflow_sample_lineage WHERE run_id=$1",[target.run.id])
    assert.equal((await f.runs.get(bob,target.run.id)).knowledge_outputs_available,false)
  }finally{await f.close()}
})

test("historical input-only reuse propagates original source transitively and refuses cycles, depth overflow and progress changes",async()=>{
  const f=await fixture()
  try{
    let output=await source(f),first
    for(let depth=0;depth<7;depth++){
      const body=request(output,{nodes:[]});body.samples.outputs.search="Manual override"
      const target=await f.runs.submitNodeDebug(bob,output.run.workflow_id,body);first??=target
      await f.privateTls(async()=>{throw Error("no Agent")},worker=>settle(f,worker,target.run.id),{nodeDebugExecutor:async()=>"Synthetic chain output"})
      output=await f.runs.outputs(bob,target.run.id)
    }
    const run=output.run.run_id
    assert.equal((await f.runs.get(bob,run)).knowledge_outputs_available,true)
    await assert.rejects(f.runs.submitNodeDebug(bob,output.run.workflow_id,request(output,{nodes:[]})),e=>e.code==="workflow_sample_source_unavailable")
    await f.db.query("UPDATE agentstudio.workflow_sample_lineage SET source_run_id=run_id WHERE run_id=$1",[first.run.id]).then(()=>assert.fail("self cycle accepted"),()=>{})
    await f.db.query("UPDATE agentstudio.runs SET instruction='changed source input' WHERE id=(SELECT source_run_id FROM agentstudio.workflow_sample_lineage WHERE run_id=$1)",[first.run.id])
    assert.equal((await f.runs.get(bob,run)).knowledge_outputs_available,false)
    await assert.rejects(f.runs.submitNodeDebug(bob,output.run.workflow_id,request(output,{nodes:[]})),e=>e.code==="workflow_sample_source_unavailable")
  }finally{await f.close()}
})

test("source revocation blocks approval and is rechecked after credentials and after provider response without another call",async()=>{
  for(const stage of ["approval","credentials","response"]){
    const f=await fixture();let calls=0,changed=false
    try{
      const output=await source(f),target=await f.runs.submitNodeDebug(bob,output.run.workflow_id,request(output))
      const change=async()=>{changed=true;await f.db.query("UPDATE agentstudio.knowledge_chunks SET text_content='changed during inherited dispatch' WHERE document_id IN(SELECT id FROM agentstudio.knowledge_documents WHERE base_id=$1)",[f.base])}
      const brokerPool={async connect(){const c=await f.pool.connect();let secret=false;return {async query(sql,args=[]){const result=await c.query(sql,args)
        if(sql.startsWith("SELECT revision,enabled,status,provider")&&sql.includes("api_key_ciphertext"))secret=true
        if(stage==="credentials"&&secret&&sql==="COMMIT"&&!changed)await change();return result},release:()=>c.release()}}}
      await f.privateTls(async()=>{throw Error("no Agent")},async worker=>{
        assert.equal((await worker().tick()).status,"awaiting_approval")
        const pending=(await f.runs.get(bob,target.run.id)).pending_effect
        if(stage==="approval"){
          await change();await assert.rejects(f.runs.decide(bob,target.run.id,{decision:"approved",step_key:pending.step_key,input_sha256:pending.input_sha256}),e=>e.code==="knowledge_observations_unavailable")
          return
        }
        await approveKeywordStep(f.runs,target.run.id)
        for(let i=0;i<4;i++)await worker().tick()
      },{brokerPool,nodeDebugExecutor:async()=>{calls++;if(stage==="response")await change();return "MUST NOT PUBLISH"}})
      assert.equal(changed,true);assert.equal(calls,stage==="response"?1:0)
      const result=await f.runs.get(bob,target.run.id);assert.equal(result.knowledge_outputs_available,false);assert.equal(result.run.result_text,"");assert.equal(result.pending_effect,null)
    }finally{await f.close()}
  }
})

test("catalog-only lineage audit detects partial installs and privilege drift while six restricted role groups cannot read/write provenance",async()=>{
  const f=await fixture()
  try{
    await f.db.exec("CREATE ROLE agentstudio_native_auth NOLOGIN NOINHERIT; GRANT USAGE ON SCHEMA agentstudio TO agentstudio_native_auth")
    for(const role of ["agentstudio_api","agentstudio_worker","agentstudio_model_broker","agentstudio_bound_dispatch","agentstudio_native_auth","agentstudio_knowledge_execution"]){
      await f.db.exec("BEGIN; SET LOCAL ROLE "+role)
      try{assert.equal(await verifyKnowledgeLineageCredentials(f.db),true)}finally{await f.db.exec("ROLLBACK")}
      for(const sql of ["SELECT * FROM agentstudio.workflow_sample_lineage","DELETE FROM agentstudio.workflow_sample_lineage","UPDATE agentstudio.workflow_sample_lineage SET source_sha256='x'"]){
        await f.db.exec("BEGIN; SET LOCAL ROLE "+role)
        try{await assert.rejects(f.db.query(sql),e=>e.code==="42501")}finally{await f.db.exec("ROLLBACK")}
      }
    }
    for(const sql of ["GRANT SELECT ON agentstudio.runs TO agentstudio_knowledge_lineage","GRANT SELECT ON agentstudio.workflow_sample_lineage TO agentstudio_api",
      "GRANT EXECUTE ON FUNCTION agentstudio.knowledge_lineage_walk(uuid,uuid,uuid[]) TO agentstudio_api","ALTER TABLE agentstudio.workflow_sample_lineage NO FORCE ROW LEVEL SECURITY"]){
      await f.db.exec("BEGIN");try{await f.db.exec(sql);await assert.rejects(verifyKnowledgeLineageCredentials(f.db),/unsafe_workflow_sample_lineage_privileges/)}finally{await f.db.exec("ROLLBACK")}
    }
    await f.db.query("DELETE FROM agentstudio.schema_migrations WHERE version='pg_v9_043'")
    await assert.rejects(verifyWorkflowSampleLineageSchema(f.pool),/workflow_sample_lineage_schema_required/)
  }finally{await f.close()}
})

test("provenance parser is exact, bounded and canonical without accepting client credentials or duplicate fields",()=>{
  const origin={kind:"history",run_id:randomUUID(),workflow_id:randomUUID(),workflow_revision:1,output_version:"a".repeat(64),input:false,nodes:["z","a"]}
  assert.deepEqual(safeWorkflowSampleProvenance(origin).nodes,["a","z"])
  for(const wrong of [{kind:"manual",run_id:origin.run_id},{...origin,input:false,nodes:[]},{...origin,nodes:["a","a"]},{...origin,credential:"x"},{...origin,workflow_revision:0},{...origin,nodes:["__proto__.x"]}])assert.throws(()=>safeWorkflowSampleProvenance(wrong))
})
