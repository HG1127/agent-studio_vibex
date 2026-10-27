import test from "node:test"
import assert from "node:assert/strict"
import {randomUUID} from "node:crypto"
import {agentCollaborationFixture} from "./helpers/agent-collaboration-fixture.mjs"
import {AgentSpecRepository,withActor} from "../src/repository.ts"
import {AgentReleaseRepository} from "../src/agent-release-repository.ts"
import {safeAgentSpec} from "../src/contracts.ts"
import {extractAgentSafeText} from "../src/agent-safe-text.ts"
import {verifyAgentReleaseCredentials} from "../src/agent-release-audit.ts"

test("full restoration revalidates owner resources, retains exact snapshots and atomically journals configuration/history/receipts",async()=>{
  const f=await agentCollaborationFixture()
  try{
    assert.equal(await verifyAgentReleaseCredentials(f.api),true)
    const repo=new AgentReleaseRepository(f.pool,{enabled:true}),disabled=new AgentReleaseRepository(f.pool),specs=new AgentSpecRepository(f.pool)
    const role=await specs.create(f.alice,"Exact historical name",safeAgentSpec({goal:"Initial owned role"}))
    const receipt=(await f.db.query("SELECT description FROM agentstudio.schema_migrations WHERE version='pg_v9_046'")).rows[0]
    await f.db.query("DELETE FROM agentstudio.schema_migrations WHERE version='pg_v9_046'")
    try{await assert.rejects(repo.workspace(f.alice,role.id),e=>e.code==="agent_release_not_installed")}
    finally{await f.db.query("INSERT INTO agentstudio.schema_migrations(version,description) VALUES('pg_v9_046',$1)",[receipt.description])}
    const exact={...safeAgentSpec({goal:"Reviewed goal",tools:["calculate"]}),goal:"  Preserve historical whitespace  ",model_binding:null}
    await withActor(f.pool,f.alice,db=>db.query("UPDATE agentstudio.agent_specs SET spec=$2::jsonb,revision=revision+1 WHERE id=$1",[role.id,JSON.stringify(exact)]))
    const workspace=()=>repo.workspace(f.alice,role.id)
    const source=await workspace(),save={action:"snapshot",request_id:randomUUID(),expected_spec_revision:source.spec_revision,source_sha256:source.source_sha256,note:"Exact full configuration",test_run_id:null}
    await assert.rejects(disabled.change(f.alice,role.id,save),e=>e.code==="agent_release_writes_disabled")
    await assert.rejects(repo.confirm(f.alice,role.id,save),e=>e.code==="agent_release_receipt_not_found")
    const saved=await repo.change(f.alice,role.id,save),version=(await workspace()).versions.find(v=>v.id===saved.version_id)
    assert.deepEqual((await repo.detail(f.alice,role.id,version.id)).spec_snapshot,exact)
    await assert.rejects(repo.workspace(f.bob,role.id),e=>e.status===404)
    await assert.rejects(repo.detail(f.bob,role.id,version.id),e=>e.status===404)
    await specs.update(f.alice,role.id,"Current working name",safeAgentSpec({goal:"Current working goal"}),source.spec_revision)
    const before=await workspace(),choice={action:"restore",request_id:randomUUID(),expected_spec_revision:before.spec_revision,source_sha256:before.source_sha256,
      version_id:version.id,version_sha256:version.version_sha256,expected_version_revision:version.revision,confirm:true,reason:"Restore reviewed owner configuration"}
    await assert.rejects(repo.change(f.bob,role.id,choice),e=>e.status===404)
    await assert.rejects(repo.change(f.alice,role.id,{...choice,version_sha256:"f".repeat(64),request_id:randomUUID()}),e=>e.code==="agent_release_version_changed")
    await assert.rejects(repo.change(f.alice,role.id,{...choice,source_sha256:"f".repeat(64),request_id:randomUUID()}),e=>e.code==="agent_release_source_changed")
    await assert.rejects(withActor(f.pool,f.alice,db=>db.query("SELECT agentstudio.agent_release_restore_finish($1,$2,$3)",[role.id,randomUUID(),"a".repeat(64)])),/agent_release_restore_not_prepared/)
    const grantRequest=randomUUID()
    await withActor(f.pool,f.alice,db=>db.query("SELECT agentstudio.agent_collaboration_grant($1,$2,'editor',0,$3,$4)",[role.id,f.recipient.id,grantRequest,"a".repeat(64)]))
    const proposed={...extractAgentSafeText((await specs.get(f.alice,role.id)).spec),goal:"Pending collaborator suggestion"}
    const proposal=await withActor(f.pool,f.bob,async db=>(await db.query("SELECT agentstudio.agent_collaboration_propose($1,$2,$3,$4::jsonb,$5,$6,$7) AS item",
      [role.id,before.spec_revision,before.source_sha256,JSON.stringify(proposed),"Review pending proposal",randomUUID(),"b".repeat(64)])).rows[0].item)
    const historyCount=async()=>Number((await f.db.query("SELECT count(*) AS n FROM agentstudio.agent_collaboration_revisions WHERE spec_id=$1",[role.id])).rows[0].n)
    const oldHistory=await historyCount()
    await f.db.query("ALTER TABLE agentstudio.agent_release_receipts ADD CONSTRAINT synthetic_restore_receipt_failure CHECK(false) NOT VALID")
    try{
      await assert.rejects(repo.change(f.alice,role.id,choice),/synthetic_restore_receipt_failure/)
      assert.deepEqual(await workspace(),before)
      assert.equal((await specs.get(f.alice,role.id)).name,"Current working name")
      assert.equal(await historyCount(),oldHistory)
      assert.equal((await f.db.query("SELECT status FROM agentstudio.agent_collaboration_proposals WHERE id=$1",[proposal.proposal_id])).rows[0].status,"pending")
      assert.equal(Number((await f.db.query("SELECT count(*) AS n FROM agentstudio.audit_events WHERE action='agent.release.restore' AND target_id=$1",[role.id])).rows[0].n),0)
    }finally{await f.db.query("ALTER TABLE agentstudio.agent_release_receipts DROP CONSTRAINT synthetic_restore_receipt_failure")}
    const restored=await repo.change(f.alice,role.id,choice),restoredRole=await specs.get(f.alice,role.id)
    assert.equal(restored.restored,true);assert.equal(restored.spec_revision,before.spec_revision+1)
    assert.equal(restoredRole.name,"Exact historical name");assert.deepEqual(restoredRole.spec,exact)
    assert.equal(await historyCount(),oldHistory+2)
    assert.equal((await f.db.query("SELECT status FROM agentstudio.agent_collaboration_proposals WHERE id=$1",[proposal.proposal_id])).rows[0].status,"invalidated")
    assert.equal((await disabled.confirm(f.alice,role.id,choice)).replayed,true)
    assert.equal((await disabled.change(f.alice,role.id,choice)).replayed,true)
    await assert.rejects(repo.change(f.alice,role.id,{...choice,reason:"Different restore intent with same request"}),e=>e.code==="agent_release_request_conflict")
    await specs.update(f.alice,role.id,"Later owner edit",safeAgentSpec({goal:"Later owner edit"}),restored.spec_revision)
    assert.equal((await repo.change(f.alice,role.id,choice)).replayed,true)
    assert.equal((await specs.get(f.alice,role.id)).name,"Later owner edit")
    await assert.rejects(repo.change(f.alice,role.id,{...choice,request_id:randomUUID()}),e=>e.code==="agent_release_source_changed")
    // A structurally valid historical reference is not proof that a current
    // owned, enabled and tested connection still exists.
    const current=await specs.get(f.alice,role.id),missing={...current.spec,model_binding:{connection_id:randomUUID(),connection_revision:1,model_id:"synthetic-missing-model"}}
    await withActor(f.pool,f.alice,db=>db.query("UPDATE agentstudio.agent_specs SET spec=$2::jsonb,revision=revision+1 WHERE id=$1",[role.id,JSON.stringify(missing)]))
    const missingSource=await workspace(),missingSave=await repo.change(f.alice,role.id,{...save,request_id:randomUUID(),expected_spec_revision:missingSource.spec_revision,source_sha256:missingSource.source_sha256})
    await specs.update(f.alice,role.id,"Unbound current owner role",safeAgentSpec({goal:"Current safe role"}),missingSource.spec_revision)
    const safeCurrent=await workspace(),missingVersion=safeCurrent.versions.find(v=>v.id===missingSave.version_id)
    await assert.rejects(repo.change(f.alice,role.id,{...choice,request_id:randomUUID(),expected_spec_revision:safeCurrent.spec_revision,source_sha256:safeCurrent.source_sha256,
      version_id:missingVersion.id,version_sha256:missingVersion.version_sha256,expected_version_revision:missingVersion.revision}),e=>e.code==="model_connection_not_found")
    assert.deepEqual(await workspace(),safeCurrent)
    assert.equal(Number((await f.db.query("SELECT count(*) AS n FROM agentstudio.runs")).rows[0].n),0)
    assert.equal((await f.db.query("SELECT has_column_privilege('agentstudio_releases','agentstudio.agent_specs','spec','UPDATE') AS leaked")).rows[0].leaked,false)
    assert.equal(await verifyAgentReleaseCredentials(f.api),true)
  }finally{await f.close()}
})
