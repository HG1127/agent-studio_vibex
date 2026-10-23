import test from "node:test"
import assert from "node:assert/strict"
import {randomUUID} from "node:crypto"
import {setTimeout as delay} from "node:timers/promises"
import {knowledgeQueryFixture} from "./helpers/knowledge-query-fixture.mjs"
import {alice,bob} from "./helpers/workflow-v2-agent-fixture.mjs"
import {withDisposableBoundModelTls} from "./helpers/bound-model-loopback-tls.mjs"
import {KnowledgeQueryWorker} from "../src/knowledge-query-worker.ts"
import {createKnowledgeQueryPrivateClient,createKnowledgeQueryPrivateHandler} from "../src/knowledge-query-private-tls.ts"
import {KNOWLEDGE_TOOL_CHARGE_ACKNOWLEDGEMENT,parseKnowledgeRetrievalBinding} from "../src/knowledge-retrieval-binding.ts"
import {safeAgentSpec} from "../src/contracts.ts"
import {AutonomousAgentRunRepository} from "../src/autonomous-agent-run-repository.ts"
import {WorkflowV2RunRepository} from "../src/workflow-v2-run-repository.ts"
import {verifyKnowledgeToolSchema,scopedKnowledgeToolPool,selectKnowledgeToolRuntime} from "../src/knowledge-tool-policy.ts"
import {verifyKnowledgeQuerySchema} from "../src/knowledge-query-audit.ts"
import {workflowKnowledgeQueryId} from "../src/knowledge-execution-source.ts"
import {knowledgeToolEvidence} from "../src/knowledge-tool-execution.ts"
import {KnowledgeBaseRepository} from "../src/knowledge-repository.ts"

async function queryDaemon(f,run){
  return withDisposableBoundModelTls(claim=>f.queryBroker.dispatch(claim),async config=>{
    const controller=new AbortController(),worker=new KnowledgeQueryWorker(f.pool,createKnowledgeQueryPrivateClient(config),{approvedForIsolatedUat:true})
    const loop=(async()=>{while(!controller.signal.aborted){await worker.tick(controller.signal);await delay(15)}})()
    const stop=async()=>{controller.abort();await loop}
    try{return await run(stop)}finally{await stop()}
  },{handlerFactory:createKnowledgeQueryPrivateHandler})
}
async function create(f,kind="tool",modelBinding=f.resources.bob.binding){
  const p=await f.consents.get(bob),binding={mode:"semantic",profile_id:p.profile_id,profile_revision:p.profile_revision,consent_revision:p.revision}
  let data={title:"Search",tool:"knowledge_search",knowledge_base_ids:[f.base],knowledge_retrieval:binding,params_template:'{"query":"different wording"}'},spec
  if(kind!=="tool"){
    spec=await f.agents.create(bob,"Semantic role",safeAgentSpec({goal:"Synthetic evidence only",tools:["knowledge_search"],knowledge_base_ids:[f.base],knowledge_retrieval:binding,model_binding:f.resources.bob.binding}))
    data={title:"Search",agent_binding:{spec_id:spec.id,spec_revision:spec.revision},max_steps:2}
  }
  const runs=kind==="autonomous"?new AutonomousAgentRunRepository(f.pool,{allowKnowledgeExecution:true}):f.runs
  if(kind==="autonomous")return {runs,queued:await runs.submit(bob,spec.id,{expected_revision:spec.revision,max_steps:2,idempotency_key:randomUUID(),instruction:"PRIVATE_TASK_NOT_FOR_EMBEDDING"}),binding}
  const graph={version:2,nodes:[{id:"start",type:"start",data:{title:"Start"},position:{x:0,y:0}},
    {id:"search",type:kind==="tool"?"tool":"agent",data,position:{x:100,y:0}},
    ...(kind==="tool"?[{id:"model",type:"model",data:{title:"Answer",model_binding:modelBinding,prompt:"Use approved observations: {{Search.output}}"},position:{x:200,y:0}}]:[]),
    {id:"end",type:"end",data:{title:"End",output_template:kind==="tool"?"{{Answer.output}}":"{{Search.output}}"},position:{x:300,y:0}}],
    edges:kind==="tool"?[{id:"a",source:"start",target:"search"},{id:"b",source:"search",target:"model"},{id:"c",source:"model",target:"end"}]:[{id:"a",source:"start",target:"search"},{id:"b",source:"search",target:"end"}]}
  const flow=await f.flows.create(bob,"Synthetic semantic flow",graph)
  return {runs,queued:await runs.submit(bob,flow.id,{expected_revision:flow.revision,idempotency_key:randomUUID(),instruction:"PRIVATE_TASK_NOT_FOR_EMBEDDING"}),binding,flow}
}
async function approve(runs,id,{checkMissing=false}={}){
  const p=(await runs.get(bob,id)).pending_effect
  const body={decision:"approved",step_key:p.step_key,input_sha256:p.input_sha256}
  if(p.kind==="tool"&&p.configuration.knowledge_retrieval){
    if(checkMissing)await assert.rejects(runs.decide(bob,id,body),e=>e.code==="knowledge_query_charge_confirmation_required")
    body.knowledge_query_charge=KNOWLEDGE_TOOL_CHARGE_ACKNOWLEDGEMENT
  }
  await runs.decide(bob,id,body)
  if(body.knowledge_query_charge){
    assert.equal((await runs.decide(bob,id,body)).replayed,true)
    const {knowledge_query_charge:_,...lost}=body
    await assert.rejects(runs.decide(bob,id,lost),e=>e.code==="knowledge_query_charge_confirmation_changed")
  }
  return p
}
test("closed semantic declarations reject provider/identity overrides and execution stays independently disabled",async()=>{
  assert.equal(selectKnowledgeToolRuntime({}),false)
  const ready={AGENT_STUDIO_PG18_KNOWLEDGE_TOOL_UAT_ENABLED:"true",AGENT_STUDIO_PG18_KNOWLEDGE_TOOL_UAT_APPROVED:"APPROVE_DISPOSABLE_PG18_APPROVED_SEMANTIC_TOOLS",
    AGENT_STUDIO_PG18_KNOWLEDGE_QUERY_UAT_ENABLED:"true",AGENT_STUDIO_PG18_KNOWLEDGE_QUERY_UAT_APPROVED:"APPROVE_DISPOSABLE_PG18_READER_EMBEDDING_QUERY_UAT",
    AGENT_STUDIO_PG18_KNOWLEDGE_SHARING_UAT_ENABLED:"true",AGENT_STUDIO_PG18_KNOWLEDGE_SHARING_UAT_APPROVED:"APPROVE_DISPOSABLE_PG18_KNOWLEDGE_SHARING_ONLY"}
  assert.equal(selectKnowledgeToolRuntime(ready),true)
  for(const key of Object.keys(ready))assert.throws(()=>selectKnowledgeToolRuntime({...ready,[key]:"unapproved"}))
  const f=await knowledgeQueryFixture({semanticTools:true})
  try{
    for(const kind of ["api","worker","broker"])await verifyKnowledgeToolSchema(f.pool,kind)
    const {flow,binding}=await create(f)
    assert.throws(()=>parseKnowledgeRetrievalBinding({...binding,api_key:"synthetic-forbidden"}))
    assert.throws(()=>parseKnowledgeRetrievalBinding({...binding,mode:"auto"}))
    assert.throws(()=>parseKnowledgeRetrievalBinding({...binding,mode:{toString:()=>"semantic"}}))
    await assert.rejects(new WorkflowV2RunRepository(f.pool).submit(bob,flow.id,{expected_revision:flow.revision,idempotency_key:randomUUID(),instruction:"disabled"}),e=>e.code==="knowledge_execution_not_enabled")
    await assert.rejects(f.agents.create(alice,"Foreign fee profile",safeAgentSpec({goal:"Synthetic",tools:["knowledge_search"],knowledge_base_ids:[f.base],knowledge_retrieval:binding})),e=>e.code==="knowledge_retrieval_profile_changed")
    assert.equal(f.queryCalls.length,0)
  }finally{await f.close()}
})
test("changed cached content and revoke/regrant hide old outputs and stop a separately approved next model",async()=>{
  for(const change of ["content","regrant"]){
    const f=await knowledgeQueryFixture({semanticTools:true});let models=0
    try{
      const {runs,queued}=await create(f)
      await queryDaemon(f,stop=>f.privateTls(async()=>{throw Error("unexpected Agent model")},async makeWorker=>{
        await makeWorker().tick();await approve(runs,queued.run.id,{checkMissing:true})
        await makeWorker().tick();await makeWorker().tick()
        const pending=(await runs.get(bob,queued.run.id)).pending_effect
        assert.equal(pending.kind,"model");assert.match(pending.input,/OWN_CITATION/)
        await approve(runs,queued.run.id);await stop()
        if(change==="content")await f.db.query("UPDATE agentstudio.knowledge_chunks SET text_content='synthetic changed current evidence' WHERE document_id IN (SELECT id FROM agentstudio.knowledge_documents WHERE base_id=$1)",[f.base])
        else{
          await f.access.change(alice,f.base,{action:"revoke",recipient_id:f.users.bob,expected_revision:1,request_id:randomUUID()})
          await f.access.change(alice,f.base,{action:"grant_existing",recipient_id:f.users.bob,role:"viewer",semantic_allowed:true,expected_revision:2,request_id:randomUUID()})
        }
        assert.equal((await runs.get(bob,queued.run.id)).pending_effect,null)
        await assert.rejects(runs.outputHistory(bob,queued.run.id),e=>e.code==="knowledge_observations_unavailable")
        await makeWorker().tick();await makeWorker().tick();assert.equal(models,0)
        assert.notEqual((await runs.get(bob,queued.run.id)).run.status,"succeeded")
      },{businessPool:f.pool,workerPool:f.pool,allowKnowledge:true,directModel:async()=>{models++;return "MUST NOT GENERATE"}}))
      assert.equal(f.queryCalls.length,1)
    }finally{await f.close()}
  }
})
test("source resource metadata changes before dispatch or during the provider prevent use and never replay the query",async()=>{
  for(const inFlight of [false,true]){
    const f=await knowledgeQueryFixture({semanticTools:true});let models=0
    try{
      const input={name:"Future model",provider:"openai",base_url:"https://api.openai.com/v1",models:["synthetic"],enabled:true}
      const saved=await f.models.create(bob,{...input,api_key:"synthetic-future-model-never-network"}),spare=await f.models.testConnection(bob,saved.id,saved.revision,async()=>({status:"ok",latency_ms:1,error_code:""}))
      const {runs,queued}=await create(f,"tool",{connection_id:spare.id,connection_revision:spare.revision,model_id:"synthetic"})
      if(inFlight)f.setQueryProvider(async()=>{await f.models.update(bob,spare.id,{...input,enabled:false},spare.revision);return [[3,4]]})
      await withDisposableBoundModelTls(claim=>f.queryBroker.dispatch(claim),async config=>{
        const queryWorker=new KnowledgeQueryWorker(f.pool,createKnowledgeQueryPrivateClient(config),{approvedForIsolatedUat:true})
        await f.privateTls(async()=>{throw Error("unexpected Agent")},async makeWorker=>{
          await makeWorker().tick();const pending=await approve(runs,queued.run.id,{checkMissing:true})
          const request=workflowKnowledgeQueryId(f.users.bob,queued.run.id,pending.step_key),running=makeWorker().tick()
          try{
            let receipt
            for(let i=0;i<80;i++){receipt=await f.queries.get(bob,request);if(receipt?.status==="prepared")break;await delay(15)}
            assert.equal(receipt?.status,"prepared")
            if(!inFlight)await f.models.update(bob,spare.id,{...input,enabled:false},spare.revision)
            assert.equal((await queryWorker.tick()).status,inFlight?"uncertain":"idle")
            await running
            const outcome=await f.queries.get(bob,request)
            assert.equal(outcome.status,inFlight?"unknown":"rejected");assert.equal(outcome.billing_may_have_occurred,inFlight)
            assert.equal((await queryWorker.tick()).status,"idle");assert.equal(models,0)
          }finally{await running}
        },{businessPool:f.pool,workerPool:f.pool,allowKnowledge:true,directModel:async()=>{models++;return "MUST NOT GENERATE"}})
      },{handlerFactory:createKnowledgeQueryPrivateHandler})
      assert.equal(f.queryCalls.length,inFlight?1:0)
    }finally{await f.close()}
  }
})
test("Unicode evidence is bounded for replay checkpoints and escaped private wire; undeclared response fields cannot enter a prompt",()=>{
  const base=randomUUID(),items=Array.from({length:6},(_,i)=>({base_id:base,document_id:randomUUID(),chunk_id:randomUUID(),chunk_index:i,
    text:'😀"\\'.repeat(1200),citation:"🧭".repeat(180)+"#chunk-"+i,api_key:"synthetic-MUST-NOT-BE-FORWARDED"}))
  const output=knowledgeToolEvidence({request_id:randomUUID(),status:"succeeded",result:{retrieval:"hybrid",items}},[base],"hybrid"),parsed=JSON.parse(output)
  assert.ok(output.length<=4000);assert.ok(Buffer.byteLength(output)<=14336)
  assert.ok(Buffer.byteLength(JSON.stringify({status:"succeeded",text:output}))<=16384)
  assert.ok(parsed.hits.length>0&&parsed.hits.length<=6)
  for(const hit of parsed.hits){assert.ok(Array.from(hit.snippet).length<=320);assert.ok(Array.from(hit.citation).length<=200);assert.equal(hit.snippet.isWellFormed(),true)}
  assert.equal(output.includes("MUST-NOT-BE-FORWARDED"),false)
})
test("human approval can resume after query payload expiry using durable current references, without retaining text or paying again",async()=>{
  const f=await knowledgeQueryFixture({semanticTools:true});let models=0
  try{
    const {runs,queued}=await create(f)
    await queryDaemon(f,stop=>f.privateTls(async()=>{throw Error("unexpected Agent")},async makeWorker=>{
      await makeWorker().tick();const paid=await approve(runs,queued.run.id)
      await makeWorker().tick();await makeWorker().tick();await stop()
      const request=workflowKnowledgeQueryId(f.users.bob,queued.run.id,paid.step_key)
      await f.db.query("UPDATE agentstudio.knowledge_query_jobs SET expires_at=now()-interval '1 second' WHERE source_run_id=$1",[queued.run.id])
      assert.equal((await f.queryWorker().tick()).status,"idle")
      const job=(await f.db.query("SELECT query_text,result_refs,scope_fence,execution_evidence FROM agentstudio.knowledge_query_jobs WHERE request_id=$1",[request])).rows[0]
      assert.equal(job.query_text,null);assert.equal(job.result_refs,null);assert.equal(job.scope_fence,null)
      assert.ok(job.execution_evidence);assert.equal(JSON.stringify(job.execution_evidence).includes("OWN_CITATION"),false)
      assert.equal(JSON.stringify(job.execution_evidence).includes("different wording"),false)
      assert.equal((await f.queries.get(bob,request)).status,"expired")
      assert.equal((await runs.get(bob,queued.run.id)).knowledge_outputs_available,true)
      assert.equal((await runs.get(bob,queued.run.id)).pending_effect.kind,"model")
      await approve(runs,queued.run.id);await makeWorker().tick();await makeWorker().tick()
      assert.equal((await runs.get(bob,queued.run.id)).run.status,"succeeded");assert.equal(models,1)
      await f.access.change(alice,f.base,{action:"revoke",recipient_id:f.users.bob,expected_revision:1,request_id:randomUUID()})
      assert.equal((await runs.get(bob,queued.run.id)).knowledge_outputs_available,false)
      assert.equal((await runs.get(bob,queued.run.id)).run.result_text,"")
      assert.equal((await runs.list(bob)).find(x=>x.id===queued.run.id).result_preview,"")
      await assert.rejects(runs.outputs(bob,queued.run.id),e=>e.code==="knowledge_observations_unavailable")
    },{businessPool:f.pool,workerPool:f.pool,allowKnowledge:true,directModel:async()=>{models++;return "Answer derived from OWN_CITATION"}}))
    assert.equal(f.queryCalls.length,1)
  }finally{await f.close()}
})
test("semantic helper aliases, retained evidence trigger and metadata grants remain fail-closed even with the feature off",async()=>{
  const f=await knowledgeQueryFixture({semanticTools:true})
  try{
    const changes=[
      ["GRANT EXECUTE ON FUNCTION agentstudio.knowledge_query_execution_submit_before_semantic(uuid,uuid[],text,text,integer,uuid,bigint,bigint,text,jsonb) TO agentstudio_api","REVOKE EXECUTE ON FUNCTION agentstudio.knowledge_query_execution_submit_before_semantic(uuid,uuid[],text,text,integer,uuid,bigint,bigint,text,jsonb) FROM agentstudio_api"],
      ["GRANT SELECT(value_ciphertext) ON agentstudio.tool_connection_headers TO agentstudio_knowledge_execution","REVOKE SELECT(value_ciphertext) ON agentstudio.tool_connection_headers FROM agentstudio_knowledge_execution"],
      ["GRANT EXECUTE ON FUNCTION agentstudio.knowledge_query_execution_validate_run(uuid,text) TO PUBLIC","REVOKE EXECUTE ON FUNCTION agentstudio.knowledge_query_execution_validate_run(uuid,text) FROM PUBLIC"],
      ["ALTER TABLE agentstudio.knowledge_query_jobs DISABLE TRIGGER knowledge_query_execution_evidence","ALTER TABLE agentstudio.knowledge_query_jobs ENABLE TRIGGER knowledge_query_execution_evidence"],
    ]
    for(const [bad,restore] of changes){await f.db.exec(bad);await assert.rejects(verifyKnowledgeQuerySchema(scopedKnowledgeToolPool(f.pool,false)),/unsafe_knowledge_execution_privileges/);await f.db.exec(restore)}
    await verifyKnowledgeToolSchema(f.pool)
  }finally{await f.close()}
})
test("any partial semantic metadata footprint fails the audit on the prior schema",async()=>{
  const f=await knowledgeQueryFixture({executionSource:true})
  try{
    await verifyKnowledgeQuerySchema(f.pool)
    for(const column of ["execution_evidence","execution_resource_sha256","execution_fee_binding"]){
      await f.db.exec(`ALTER TABLE agentstudio.knowledge_query_jobs ADD COLUMN ${column} text`)
      await assert.rejects(verifyKnowledgeQuerySchema(f.pool),/unsafe_knowledge_execution_privileges/)
      await f.db.exec(`ALTER TABLE agentstudio.knowledge_query_jobs DROP COLUMN ${column}`)
    }
    await verifyKnowledgeQuerySchema(f.pool)
  }finally{await f.close()}
})

test("a queued later query rechecks earlier semantic observations immediately before paying, even when its own KB is unchanged",async()=>{
  const f=await knowledgeQueryFixture({semanticTools:true})
  try{
    const bases=new KnowledgeBaseRepository(f.pool),second=await bases.create(alice,"Second synthetic base","Independent unchanged knowledge")
    await bases.createTextDocument(alice,second.id,{filename:"second.txt",text:"Independent second synthetic evidence"})
    await f.access.change(alice,second.id,{action:"grant",recipient_email:"bob@example.test",role:"viewer",semantic_allowed:true,expected_revision:0,request_id:randomUUID()})
    for(let i=0;i<5;i++)if((await f.worker().tick()).status==="idle")break
    const p=await f.consents.get(bob),binding={mode:"semantic",profile_id:p.profile_id,profile_revision:p.profile_revision,consent_revision:p.revision}
    const flow=await f.flows.create(bob,"Two semantic steps",{version:2,nodes:[
      {id:"start",type:"start",data:{title:"Start"},position:{x:0,y:0}},
      ...[["first",f.base],["second",second.id]].map(([id,base],i)=>({id,type:"tool",data:{title:id,tool:"knowledge_search",knowledge_base_ids:[base],knowledge_retrieval:binding,params_template:JSON.stringify({query:id==="second"?"second different wording":"different wording"})},position:{x:100+i*100,y:0}})),
      {id:"end",type:"end",data:{title:"End",output_template:"{{second.output}}"},position:{x:300,y:0}}],edges:[{id:"a",source:"start",target:"first"},{id:"b",source:"first",target:"second"},{id:"c",source:"second",target:"end"}]})
    const queued=await f.runs.submit(bob,flow.id,{expected_revision:flow.revision,idempotency_key:randomUUID(),instruction:"Synthetic two-stage task"})
    await withDisposableBoundModelTls(claim=>f.queryBroker.dispatch(claim),async config=>{
      const queryWorker=new KnowledgeQueryWorker(f.pool,createKnowledgeQueryPrivateClient(config),{approvedForIsolatedUat:true})
      await f.privateTls(async()=>{throw Error("unexpected model")},async makeWorker=>{
        for(let step=0;step<2;step++){
          await makeWorker().tick();const pending=await approve(f.runs,queued.run.id),request=workflowKnowledgeQueryId(f.users.bob,queued.run.id,pending.step_key),running=makeWorker().tick()
          try{
            let receipt
            for(let i=0;i<80;i++){receipt=await f.queries.get(bob,request);if(receipt?.status==="prepared")break;await delay(15)}
            assert.equal(receipt?.status,"prepared")
            if(step){
              const db=await f.pool.connect();try{await db.query("BEGIN");await db.query("UPDATE agentstudio.knowledge_chunks SET text_content='changed first evidence' WHERE document_id IN (SELECT id FROM agentstudio.knowledge_documents WHERE base_id=$1)",[f.base]);await db.query("COMMIT")}finally{db.release()}
              assert.equal((await f.queries.get(bob,request)).status,"prepared")
            }
            assert.equal((await queryWorker.tick()).status,step?"idle":"retrieved")
            await running
            assert.equal((await f.queries.get(bob,request)).status,step?"rejected":"succeeded")
          }finally{await running}
        }
      },{businessPool:f.pool,workerPool:f.pool,allowKnowledge:true})
    },{handlerFactory:createKnowledgeQueryPrivateHandler})
    assert.equal(f.queryCalls.length,1)
  }finally{await f.close()}
})
test("approved Workflow/Agent/autonomous semantic tools cross both private mTLS paths and use only the reader query/key",async()=>{
  for(const kind of ["tool","agent","autonomous"]){
    const f=await knowledgeQueryFixture({semanticTools:true});let models=0
    try{
      const {runs,queued}=await create(f,kind)
      await queryDaemon(f,()=>f.privateTls(async(material,prompt)=>{
        models++;assert.equal(material.api_key,"synthetic-bob-model-key-never-network")
        if(models===1)return '{"action":"tool","tool":"knowledge_search","params":{"query":"different wording"}}'
        assert.match(prompt,/OWN_CITATION/);return '{"action":"answer","answer":"Approved synthetic answer"}'
      },async makeWorker=>{
        for(let i=0;i<40;i++){
          await makeWorker().tick();const view=await runs.get(bob,queued.run.id)
          if(view.run.status==="awaiting_approval"){assert.ok(view.pending_effect);await approve(runs,queued.run.id,{checkMissing:true})}
          else if(view.run.status==="succeeded")return
          else assert.ok(!["paused","failed","cancelled"].includes(view.run.status),JSON.stringify(view))
        }
        throw Error("semantic run did not settle")
      },{businessPool:f.pool,workerPool:f.pool,allowKnowledge:true,autonomousExecution:kind==="autonomous",directModel:async(material,prompt)=>{
        models++;assert.equal(material.api_key,"synthetic-bob-model-key-never-network");assert.match(prompt,/OWN_CITATION/);return "Approved synthetic answer"
      }}))
      assert.equal(f.queryCalls.length,1);assert.deepEqual(f.queryCalls[0].input,["different wording"])
      assert.equal(f.queryCalls[0].api_key,"synthetic-bob-model-key-never-network");assert.equal(models,kind==="tool"?1:2)
      assert.equal((await f.queryWorker().tick()).status,"idle")
      const ledger=(await f.db.query("SELECT execution_fee_binding,execution_resource_sha256,status FROM agentstudio.knowledge_query_jobs WHERE source_run_id=$1",[queued.run.id])).rows
      assert.equal(ledger.length,1);assert.equal(ledger[0].status,"succeeded");assert.match(ledger[0].execution_resource_sha256,/^[a-f0-9]{64}$/)
    }finally{await f.close()}
  }
})
