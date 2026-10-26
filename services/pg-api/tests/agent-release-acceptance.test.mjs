import test from "node:test"
import assert from "node:assert/strict"
import {readFileSync} from "node:fs"
import {randomUUID} from "node:crypto"
import {agentFixture} from "./helpers/workflow-v2-agent-fixture.mjs"
import {freshRuntimeSqlBody} from "../src/pg18-fresh-runtime-source.mjs"
import {AgentReleaseRepository} from "../src/agent-release-repository.ts"
import {verifyAgentReleaseCredentials} from "../src/agent-release-audit.ts"

test("dedicated acceptance atomically admits the selected owned model and cannot certify generic, skipped or expired-evidence runs",async()=>{
  const f=await agentFixture({autonomous:true,sharing:true,nativeEmployees:true})
  const {alice,bob}=f.identities
  let genericCalls=0,acceptanceCalls=0
  try{
    await f.db.exec(freshRuntimeSqlBody(readFileSync(new URL("../../../db/postgres/migrations/pg_v9_046_agent_releases.sql",import.meta.url),"utf8")))
    assert.equal(await verifyAgentReleaseCredentials(f.db),true)
    await f.db.query("INSERT INTO agentstudio.schema_migrations(version,description) VALUES('pg_v9_046','SYNTHETIC TEST ONLY; incomplete candidate')")
    const repo=new AgentReleaseRepository(f.pool,{enabled:true}),disabled=new AgentReleaseRepository(f.pool),role=f.resources.alice.spec
    const workspace=()=>repo.workspace(alice,role.id),source=await workspace()
    const save=run=>({action:"snapshot",request_id:randomUUID(),expected_spec_revision:source.spec_revision,source_sha256:source.source_sha256,
      note:"Version with explicit acceptance provenance",test_run_id:run})
    const generic=await f.make({maxSteps:1,input:"Ordinary execution has no acceptance purpose"})
    await f.privateTls(async()=>{genericCalls++;return JSON.stringify({action:"answer",answer:"Generic run finished"})},async makeWorker=>{
      assert.equal((await f.drive(makeWorker,generic.run.id)).run.status,"succeeded")
    })
    assert.equal(genericCalls,1)
    await assert.rejects(repo.change(alice,role.id,save(generic.run.id)),e=>e.code==="agent_release_acceptance_unavailable")
    const model=await f.models.create(alice,{name:"Acceptance model B",provider:"openai",base_url:"https://api.openai.com/v1",api_key:"SyntheticAcceptanceModelBKey",models:["synthetic-b"],enabled:true})
    const ready=await f.models.testConnection(alice,model.id,model.revision,async()=>({status:"ok",latency_ms:1,error_code:""}))
    const binding={connection_id:ready.id,connection_revision:ready.revision,model_id:"synthetic-b"}
    const choice={action:"acceptance",request_id:randomUUID(),expected_spec_revision:source.spec_revision,source_sha256:source.source_sha256,
      instruction:"Use OWN_CITATION in a synthetic acceptance report",max_steps:2,model_binding:binding,confirm:true}
    await assert.rejects(disabled.change(alice,role.id,choice),e=>e.code==="agent_release_writes_disabled")
    await assert.rejects(repo.change(bob,role.id,choice),e=>e.status===404)
    await assert.rejects(repo.change(alice,role.id,{...choice,request_id:randomUUID(),model_binding:f.resources.bob.binding}),e=>e.status===404)
    await assert.rejects(repo.change(alice,role.id,{...choice,request_id:randomUUID(),source_sha256:"f".repeat(64)}),e=>e.code==="agent_release_source_changed")
    const counts=async()=>(await f.db.query("SELECT (SELECT count(*)::int FROM agentstudio.runs) AS runs,(SELECT count(*)::int FROM agentstudio.jobs) AS jobs,"+
      "(SELECT count(*)::int FROM agentstudio.agent_release_acceptance_runs) AS acceptances")).rows[0]
    const before=await counts()
    await f.db.query("ALTER TABLE agentstudio.agent_release_receipts ADD CONSTRAINT synthetic_acceptance_receipt_failure CHECK(false) NOT VALID")
    try{await assert.rejects(repo.change(alice,role.id,choice),/synthetic_acceptance_receipt_failure/);assert.deepEqual(await counts(),before)}
    finally{await f.db.query("ALTER TABLE agentstudio.agent_release_receipts DROP CONSTRAINT synthetic_acceptance_receipt_failure")}
    const admitted=await repo.change(alice,role.id,choice)
    assert.equal(admitted.status,"queued");assert.equal((await repo.change(alice,role.id,choice)).run_id,admitted.run_id)
    assert.deepEqual(await counts(),{runs:before.runs+1,jobs:before.jobs+1,acceptances:1})
    assert.equal((await disabled.confirm(alice,role.id,choice)).replayed,true)
    await assert.rejects(repo.change(alice,role.id,{...choice,instruction:"Changed intent on same request"}),e=>e.code==="agent_release_request_conflict")
    await assert.rejects(repo.change(alice,role.id,save(admitted.run_id)),e=>e.code==="agent_release_acceptance_unavailable")
    await assert.rejects(repo.acceptanceStatus(bob,role.id,admitted.run_id),e=>e.status===404)
    await f.db.query("UPDATE agentstudio.model_connections SET enabled=false,revision=revision+1 WHERE id=$1",[f.resources.alice.model.id])
    await f.privateTls(async(material,prompt)=>{
      acceptanceCalls++;assert.equal(material.api_key,"SyntheticAcceptanceModelBKey");assert.equal(material.model_id,"synthetic-b")
      const input=JSON.parse(prompt)
      if(input.round===1)return JSON.stringify({action:"tool",tool:"knowledge_search",params:{query:"OWN_CITATION"}})
      assert.match(input.history[0].observation,/OWN_CITATION/)
      return JSON.stringify({action:"answer",answer:"Accepted with current owned evidence"})
    },async makeWorker=>{
      const finished=await f.drive(makeWorker,admitted.run_id)
      assert.equal(finished.run.status,"succeeded",finished.run.last_error_code)
      assert.equal(finished.run.result_text,"Accepted with current owned evidence")
    })
    assert.equal(acceptanceCalls,2)
    const status=await repo.acceptanceStatus(alice,role.id,admitted.run_id)
    assert.equal(status.test_current,true);assert.equal(status.execution.knowledge_outputs_available,true)
    assert.equal((await f.db.query("SELECT count(*)::int AS n FROM agentstudio.knowledge_keyword_observations WHERE run_id=$1",[admitted.run_id])).rows[0].n,1)
    const snapshotChoice=save(admitted.run_id),saved=await repo.change(alice,role.id,snapshotChoice)
    assert.equal(saved.test_passed,true)
    const detail=await repo.detail(alice,role.id,saved.version_id)
    assert.equal(detail.test_current,true);assert.deepEqual(detail.test_model_binding,binding)
    const version=(await workspace()).versions.find(v=>v.id===saved.version_id),publish={action:"publish",request_id:randomUUID(),
      expected_spec_revision:source.spec_revision,source_sha256:source.source_sha256,version_id:version.id,version_sha256:version.version_sha256,
      expected_version_revision:version.revision,expected_release_revision:(await workspace()).release_revision,confirm:true,acknowledge_untested:false}
    assert.equal((await repo.change(alice,role.id,publish)).status,"published")
    await f.db.query("UPDATE agentstudio.knowledge_chunks SET text_content='Changed synthetic original evidence' WHERE document_id IN(SELECT id FROM agentstudio.knowledge_documents WHERE base_id=$1)",[f.resources.alice.kb.id])
    const expired=await repo.acceptanceStatus(alice,role.id,admitted.run_id)
    assert.equal(expired.test_current,false);assert.equal(expired.execution.knowledge_outputs_available,false);assert.equal(expired.execution.run.result_text,"")
    const expiredVersion=(await workspace()).versions.find(v=>v.id===saved.version_id)
    assert.equal(expiredVersion.test_passed,true);assert.equal(expiredVersion.test_current,false)
    await assert.rejects(repo.change(alice,role.id,save(admitted.run_id)),e=>e.code==="agent_release_acceptance_unavailable")
    const republish={...publish,request_id:randomUUID(),expected_version_revision:expiredVersion.revision,expected_release_revision:(await workspace()).release_revision}
    await assert.rejects(repo.change(alice,role.id,republish),e=>e.code==="agent_release_untested_ack_required")
    assert.equal((await repo.change(alice,role.id,{...republish,acknowledge_untested:true})).already_published,true)
    assert.equal((await repo.change(alice,role.id,snapshotChoice)).version_id,saved.version_id)
    assert.equal((await workspace()).versions.length,1)
    assert.equal((await disabled.change(alice,role.id,choice)).run_id,admitted.run_id)
    const skipped=await repo.change(alice,role.id,{...choice,request_id:randomUUID()})
    await f.privateTls(async()=>{throw Error("rejected acceptance must not send a model request")},async makeWorker=>{
      assert.equal((await f.drive(makeWorker,skipped.run_id,()=>"rejected")).run.status,"succeeded")
    })
    assert.equal((await repo.acceptanceStatus(alice,role.id,skipped.run_id)).test_current,false)
    await assert.rejects(repo.change(alice,role.id,save(skipped.run_id)),e=>e.code==="agent_release_acceptance_unavailable")
    assert.equal(await verifyAgentReleaseCredentials(f.db),true)
    const audit=JSON.stringify((await f.db.query("SELECT metadata FROM agentstudio.audit_events WHERE action LIKE 'agent.release.%'")).rows)
    assert.doesNotMatch(audit,/SyntheticAcceptanceModelBKey|OWN_CITATION|Accepted with current owned evidence|Changed synthetic original evidence/)
  }finally{await f.close()}
})
