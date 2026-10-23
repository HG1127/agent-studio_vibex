import test from "node:test"
import assert from "node:assert/strict"
import {randomUUID} from "node:crypto"
import {knowledgeQueryFixture} from "./helpers/knowledge-query-fixture.mjs"
import {alice,bob} from "./helpers/workflow-v2-agent-fixture.mjs"
import {WorkflowV2Worker} from "../src/workflow-v2-worker.ts"
import {AutonomousAgentRunRepository} from "../src/autonomous-agent-run-repository.ts"
import {withActor} from "../src/repository.ts"
import {verifyWorkflowEffectLease,reserveWorkflowEffectDispatch} from "../src/workflow-v2-dispatch-guard.ts"
import {workflowKnowledgeQueryId,knowledgeExecutionSource} from "../src/knowledge-execution-source.ts"
import {verifyKnowledgeQuerySchema} from "../src/knowledge-query-audit.ts"
import {verifyKnowledgeIndexSchema} from "../src/knowledge-index-privileges.ts"
import {EMBEDDING_CHARGE_ACKNOWLEDGEMENT} from "../src/knowledge-embedding-consent-contracts.ts"
import {scopedKnowledgeQueryPool} from "../src/knowledge-query-policy.ts"
import {KnowledgeQueryRepository} from "../src/knowledge-query-repository.ts"

// Real run preparation, employee decisions, Worker claims and Broker fence.
// Only the eventual paid provider is synthetic. Hold the tool before dispatch
// so the query Worker can observe actual originating lease/approval changes.
async function heldKnowledgeTool(f,{agent=false,autonomous=false}={}){
  const identity=agent?alice:bob,owner=f.users[agent?"alice":"bob"]
  let runs=f.runs,queued
  const data=agent?{title:"Role",agent_binding:{spec_id:f.resources.alice.spec.id,spec_revision:f.resources.alice.spec.revision},max_steps:2}:
    {title:"Search",tool:"knowledge_search",knowledge_base_ids:[f.base],params_template:'{"query":"different wording"}'}
  if(autonomous){
    runs=new AutonomousAgentRunRepository(f.pool)
    queued=await runs.submit(identity,f.resources.alice.spec.id,{expected_revision:f.resources.alice.spec.revision,max_steps:2,idempotency_key:randomUUID(),instruction:"synthetic task"})
  }else{
    const flow=await f.flows.create(identity,"Synthetic knowledge source",{version:2,nodes:[
      {id:"start",type:"start",data:{title:"Start"},position:{x:0,y:0}},
      {id:"search",type:agent?"agent":"tool",data,position:{x:100,y:0}},
      {id:"end",type:"end",data:{title:"End"},position:{x:200,y:0}}],
      edges:[{id:"a",source:"start",target:"search"},{id:"b",source:"search",target:"end"}]})
    queued=await runs.submit(identity,flow.id,{expected_revision:flow.revision,idempotency_key:randomUUID(),instruction:"synthetic task"})
  }
  if(agent){const p=await f.consents.get(alice);await f.consents.change(alice,{action:"grant",request_id:randomUUID(),expected_revision:p.revision,
    profile_id:p.profile_id,profile_revision:p.profile_revision,index_enabled:true,query_enabled:true,acknowledgement:EMBEDDING_CHARGE_ACKNOWLEDGEMENT})}
  let enter,release,running
  const ready=new Promise(resolve=>{enter=resolve}),result=new Promise(resolve=>{release=resolve})
  const worker=new WorkflowV2Worker(f.pool,"synthetic-source-worker",{executionMode:autonomous?"agent_native_v2":"workflow_native_v2",agentExecutionApproved:true,
    executor:{supports:()=>true,execute(request,lease){
      if(request.kind==="model")return Promise.resolve('{"action":"tool","tool":"knowledge_search","params":{"query":"different wording"}}')
      enter({request,lease});return result
    }}})
  for(let i=0;i<12;i++){
    running=worker.tick()
    const step=await Promise.race([ready.then(value=>({held:value})),running.then(()=>({held:null}))])
    if(step.held){
      const {request,lease}=step.held
      const wire={claim:{run_id:lease.run_id,job_id:lease.job_id,lease_token:lease.lease_token,lease_version:lease.lease_version,lease_owner:lease.worker_id},
        step_key:request.step_key,input_sha256:request.input_sha256,...(request.agent_context?{parent_step_key:request.agent_context.parent_step_key}:{}),
        ...(autonomous?{execution_mode:"agent_native_v2"}:{})}
      await withActor(f.pool,identity,async(db,actor)=>{
        await verifyWorkflowEffectLease(db,actor,wire,"tool",agent&&!autonomous,autonomous)
        await reserveWorkflowEffectDispatch(db,actor,wire,"tool")
      })
      const p=await f.consents.get(identity),q=await f.queryRequest({request_id:workflowKnowledgeQueryId(owner,wire.claim.run_id,wire.step_key),limit:6,
        profile_id:p.profile_id,profile_revision:p.profile_revision,consent_revision:p.revision})
      return {wire,q,identity,owner,run:queued.run.id,async finish(){release("synthetic held tool result");await running}}
    }
    const view=await runs.get(identity,queued.run.id)
    if(view.run.status==="awaiting_approval")await runs.decide(identity,queued.run.id,{decision:"approved",step_key:view.pending_effect.step_key,input_sha256:view.pending_effect.input_sha256})
    else if(["failed","paused","cancelled","succeeded"].includes(view.run.status))throw Error("source tool never started: "+JSON.stringify(view))
  }
  throw Error("source tool did not reach an approved dispatch")
}

test("execution queries require a real approved tool; logical-step identity survives Worker replacement without paid replay",async()=>{
  const f=await knowledgeQueryFixture({executionSource:true});let held
  try{
    for(const kind of ["api","worker","broker"])await verifyKnowledgeQuerySchema(f.pool,kind)
    held=await heldKnowledgeTool(f)
    const {q,wire}=held
    assert.equal((await f.queries.submitExecution(bob,q,wire)).item.status,"prepared");assert.equal(f.queryCalls.length,0)
    const source=(await f.db.query("SELECT execution_source FROM agentstudio.knowledge_query_jobs WHERE request_id=$1",[q.request_id])).rows[0].execution_source
    assert.equal(JSON.stringify(source).includes(wire.claim.lease_token),false)
    assert.throws(()=>new KnowledgeQueryRepository(f.pool).submitExecution(bob,q,wire),e=>e.code==="knowledge_execution_source_disabled")
    await assert.rejects(f.queries.submitExecution(alice,q,wire),e=>e.status===409)
    await assert.rejects(f.queries.submitExecution(bob,{...q,request_id:randomUUID()},wire),e=>e.code==="knowledge_execution_request_id_changed")
    await assert.rejects(f.queries.submitExecution(bob,{...q,base_ids:[f.resources.bob.kb.id]},wire),e=>e.code==="knowledge_execution_request_changed")
    await assert.rejects(f.queries.submitExecution(bob,{...q,query:"unapproved query"},wire),e=>e.code==="knowledge_execution_request_changed")
    assert.equal((await f.queryWorker().tick()).status,"retrieved");assert.equal(f.queryCalls.length,1)
    assert.equal((await f.queries.get(bob,q.request_id)).result.retrieval,"semantic")
    assert.equal((await f.queries.submitExecution(bob,q,wire)).replayed,true)
    assert.equal((await f.queryWorker().tick()).status,"idle");assert.equal(f.queryCalls.length,1)
    assert.equal(workflowKnowledgeQueryId(held.owner.toUpperCase(),wire.claim.run_id.toUpperCase(),wire.step_key),q.request_id)
    const newToken=randomUUID();await f.db.query("UPDATE agentstudio.jobs SET lease_token=$2,lease_version=lease_version+1 WHERE id=$1",[wire.claim.job_id,newToken])
    const next={...wire,claim:{...wire.claim,lease_token:newToken,lease_version:wire.claim.lease_version+1}}
    assert.equal((await f.queries.submitExecution(bob,q,next)).replayed,true)
    assert.deepEqual((await f.db.query("SELECT execution_source FROM agentstudio.knowledge_query_jobs WHERE request_id=$1",[q.request_id])).rows[0].execution_source,source)
    assert.equal((await f.queryWorker().tick()).status,"idle");assert.equal(f.queryCalls.length,1)
  }finally{await held?.finish();await f.close()}
})

test("approval, run, snapshot, resource and lease changes prevent a prepared execution query from charging",async()=>{
  const f=await knowledgeQueryFixture({executionSource:true})
  try{
    const changes=[
      h=>f.db.query("UPDATE agentstudio.approvals SET status='rejected' WHERE run_id=$1 AND step_key=$2",[h.run,h.wire.step_key]),
      h=>f.db.query("UPDATE agentstudio.runs SET status='cancelled' WHERE id=$1",[h.run]),
      h=>f.db.query("UPDATE agentstudio.runs SET checkpoint=checkpoint||'{\"source_changed\":true}'::jsonb WHERE id=$1",[h.run]),
      h=>f.db.query("UPDATE agentstudio.jobs SET lease_until=now()-interval '1 second' WHERE id=$1",[h.wire.claim.job_id]),
      h=>f.db.query("UPDATE agentstudio.jobs SET lease_version=lease_version+1 WHERE id=$1",[h.wire.claim.job_id]),
      h=>f.db.query("UPDATE agentstudio.jobs SET lease_token=gen_random_uuid() WHERE id=$1",[h.wire.claim.job_id]),
      h=>f.db.query("UPDATE agentstudio.workflows SET revision=revision+1 WHERE id=(SELECT workflow_id FROM agentstudio.runs WHERE id=$1)",[h.run]),
      h=>f.db.query("UPDATE agentstudio.external_effects SET status='unknown' WHERE run_id=$1 AND step_key=$2",[h.run,"wf2_tool:"+h.wire.step_key]),
    ]
    for(const change of changes){const h=await heldKnowledgeTool(f),checkpoint=(await f.db.query("SELECT checkpoint FROM agentstudio.runs WHERE id=$1",[h.run])).rows[0].checkpoint;try{
      await f.queries.submitExecution(h.identity,h.q,h.wire);await change(h)
      assert.equal((await f.queryWorker().tick()).status,"idle");assert.equal(f.queryCalls.length,0)
      assert.equal((await f.queries.get(h.identity,h.q.request_id)).status,"rejected")
      assert.equal((await f.queryWorker().tick()).status,"idle")
    }finally{await f.db.query("UPDATE agentstudio.runs SET checkpoint=$2::jsonb WHERE id=$1",[h.run,JSON.stringify(checkpoint)]);await h.finish()}}
  }finally{await f.close()}
})

test("source changes while provider is in flight discard results and keep the paid attempt unreplayable",async()=>{
  const f=await knowledgeQueryFixture({executionSource:true});let h
  try{
    h=await heldKnowledgeTool(f);await f.queries.submitExecution(h.identity,h.q,h.wire)
    f.setQueryProvider(async()=>{await f.db.query("UPDATE agentstudio.approvals SET status='rejected' WHERE run_id=$1 AND step_key=$2",[h.run,h.wire.step_key]);return [[3,4]]})
    assert.equal((await f.queryWorker().tick()).status,"uncertain")
    const receipt=await f.queries.get(h.identity,h.q.request_id)
    assert.equal(receipt.status,"unknown");assert.equal(receipt.result,null);assert.equal(receipt.billing_may_have_occurred,true)
    assert.equal((await f.queryWorker().tick()).status,"idle");assert.equal(f.queryCalls.length,1)
  }finally{await h?.finish();await f.close()}
})

test("Workflow Agent and autonomous Agent children require the parent approval and current spec",async()=>{
  for(const autonomous of [false,true]){
    const f=await knowledgeQueryFixture({executionSource:true});let h
    try{
      h=await heldKnowledgeTool(f,{agent:true,autonomous})
      assert.ok(h.wire.parent_step_key);assert.equal((await f.queries.submitExecution(h.identity,h.q,h.wire)).item.status,"prepared")
      if(autonomous)await f.db.query("UPDATE agentstudio.agent_specs SET revision=revision+1 WHERE id=$1",[f.resources.alice.spec.id])
      else await f.db.query("UPDATE agentstudio.approvals SET status='rejected' WHERE run_id=$1 AND step_key=$2",[h.run,h.wire.parent_step_key])
      assert.equal((await f.queryWorker().tick()).status,"idle");assert.equal(f.queryCalls.length,0)
      assert.equal((await f.queries.get(h.identity,h.q.request_id)).status,"rejected")
    }finally{await h?.finish();await f.close()}
  }
})

test("execution helper remains private even when query feature is disabled; unsafe grants and replay-index removal fail preflight",async()=>{
  const f=await knowledgeQueryFixture({executionSource:true})
  try{
    const changes=[
      ["GRANT SELECT(api_key_ciphertext) ON agentstudio.model_connections TO agentstudio_knowledge_execution","REVOKE SELECT(api_key_ciphertext) ON agentstudio.model_connections FROM agentstudio_knowledge_execution"],
      ["GRANT agentstudio_knowledge_execution TO agentstudio_api","REVOKE agentstudio_knowledge_execution FROM agentstudio_api"],
      ["GRANT EXECUTE ON FUNCTION agentstudio.knowledge_execution_source_current(uuid,jsonb) TO PUBLIC","REVOKE EXECUTE ON FUNCTION agentstudio.knowledge_execution_source_current(uuid,jsonb) FROM PUBLIC"],
      ["GRANT EXECUTE ON FUNCTION agentstudio.knowledge_query_execution_submit(uuid,uuid[],text,text,integer,uuid,bigint,bigint,text,jsonb) TO agentstudio_knowledge_index_worker","REVOKE EXECUTE ON FUNCTION agentstudio.knowledge_query_execution_submit(uuid,uuid[],text,text,integer,uuid,bigint,bigint,text,jsonb) FROM agentstudio_knowledge_index_worker"],
      ["DROP INDEX agentstudio.knowledge_query_execution_once","CREATE UNIQUE INDEX knowledge_query_execution_once ON agentstudio.knowledge_query_jobs(reader_user_id,source_run_id,source_step_key) WHERE source_run_id IS NOT NULL"],
      ["REVOKE SELECT(lease_token) ON agentstudio.jobs FROM agentstudio_knowledge_execution","GRANT SELECT(lease_token) ON agentstudio.jobs TO agentstudio_knowledge_execution"],
      ["ALTER TABLE agentstudio.runs NO FORCE ROW LEVEL SECURITY","ALTER TABLE agentstudio.runs FORCE ROW LEVEL SECURITY"],
    ]
    for(const [bad,restore] of changes){
      await f.db.exec(bad)
      await assert.rejects(verifyKnowledgeQuerySchema(scopedKnowledgeQueryPool(f.pool,false)),/unsafe_knowledge_execution_privileges/)
      await assert.rejects(verifyKnowledgeIndexSchema(f.pool),/unsafe_knowledge_execution_privileges/)
      await f.db.exec(restore)
    }
    await verifyKnowledgeQuerySchema(f.pool)
    for(const role of ["agentstudio_api","agentstudio_worker","agentstudio_model_broker","agentstudio_bound_dispatch","agentstudio_knowledge_index_worker","agentstudio_knowledge_index_broker"]){
      await f.db.exec("BEGIN; SET LOCAL ROLE "+role)
      try{await assert.rejects(f.db.query("SELECT agentstudio.knowledge_execution_source_seal($1::uuid,$2::jsonb,$3::uuid[])",[f.users.bob,knowledgeExecutionSource({claim:{run_id:randomUUID(),job_id:randomUUID(),lease_token:randomUUID(),lease_version:1,lease_owner:"synthetic"},step_key:"wf2_00000_search",input_sha256:"a".repeat(64)}),[f.base]]),/permission denied/)}finally{await f.db.exec("ROLLBACK")}
    }
  }finally{await f.close()}
})
