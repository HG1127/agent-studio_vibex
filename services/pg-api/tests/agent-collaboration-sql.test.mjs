import test from "node:test"
import assert from "node:assert/strict"
import {randomUUID,createHash} from "node:crypto"
import {agentCollaborationFixture} from "./helpers/agent-collaboration-fixture.mjs"
import {AgentSpecRepository,withActor} from "../src/repository.ts"
import {safeAgentSpec} from "../src/contracts.ts"
import {verifyAgentCollaborationCredentials} from "../src/agent-collaboration-audit.ts"
test("native collaboration foundation exposes safe text without granting raw roles, credentials or private ledgers",async()=>{
  const f=await agentCollaborationFixture()
  try{
    const {owner,recipient,alice,bob,pool}=f
    assert.equal(await verifyAgentCollaborationCredentials(f.api),true)
    for(const drift of ["ALTER ROLE agentstudio_collaboration LOGIN","GRANT SELECT ON agentstudio.agent_collaboration_revisions TO agentstudio_api",
      "GRANT SELECT(password_record) ON agentstudio_auth.accounts TO agentstudio_collaboration","GRANT EXECUTE ON FUNCTION agentstudio.collaboration_source_sha(uuid) TO agentstudio_worker",
      "GRANT EXECUTE ON FUNCTION agentstudio.collaboration_record_spec_edit() TO agentstudio_api","ALTER TABLE agentstudio.agent_collaboration_grants NO FORCE ROW LEVEL SECURITY",
      "ALTER TABLE agentstudio.agent_specs DISABLE TRIGGER native_agent_collaboration_history","DROP TRIGGER native_agent_collaboration_history ON agentstudio.agent_specs",
      "CREATE FUNCTION agentstudio.collaboration_unreviewed() RETURNS boolean LANGUAGE sql AS 'SELECT true'" ]){
      await f.rollback(async db=>{await db.query(drift);await assert.rejects(verifyAgentCollaborationCredentials(db),/unsafe_agent_collaboration_privileges/)})
    }
    const role=await new AgentSpecRepository(pool).create(alice,"Synthetic shared role",safeAgentSpec({goal:"Safe goal",task_scope:"Safe scope",deliverables:["Report"]}))
    await f.db.query("UPDATE agentstudio.agent_specs SET spec=spec||$2::jsonb WHERE id=$1",[role.id,JSON.stringify({model_binding:{connection_id:"PRIVATE_MODEL",api_key:"PRIVATE_SECRET"},knowledge_base_ids:["PRIVATE_KB"],http_tools:[{url:"PRIVATE_URL"}]})])
    const detail=who=>withActor(pool,who,async db=>(await db.query("SELECT agentstudio.agent_collaboration_detail($1) AS view",[role.id])).rows[0].view)
    assert.equal(await detail(bob),null)
    const request=randomUUID(),intent=(recipientId,access,revision)=>createHash("sha256").update(JSON.stringify({recipientId,access,revision})).digest("hex")
    const grant=(who,recipientId,access,revision,requestId=randomUUID())=>withActor(pool,who,async db=>(await db.query("SELECT agentstudio.agent_collaboration_grant($1,$2,$3,$4,$5,$6) AS result",[role.id,recipientId,access,revision,requestId,intent(recipientId,access,revision)])).rows[0].result)
    await assert.rejects(grant(bob,owner.id,"editor",0),/agent_collaboration_not_found/)
    const saved=await grant(alice,recipient.id,"viewer",0,request);assert.equal(saved.revision,1);assert.equal(saved.replayed,false)
    assert.equal((await grant(alice,recipient.id,"viewer",0,request)).replayed,true)
    const receipt=await withActor(pool,alice,async db=>(await db.query("SELECT agentstudio.agent_collaboration_receipt($1,$2) AS receipt",[role.id,request])).rows[0].receipt)
    assert.equal(receipt.request_sha256,intent(recipient.id,"viewer",0));assert.equal(receipt.result.replayed,true)
    assert.equal(await withActor(pool,bob,async db=>(await db.query("SELECT agentstudio.agent_collaboration_receipt($1,$2) AS receipt",[role.id,request])).rows[0].receipt),null)
    await assert.rejects(grant(alice,recipient.id,"editor",0,request),/agent_collaboration_request_conflict/)
    const shared=await detail(bob);assert.equal(shared.role,"viewer");assert.equal(shared.safe.goal,"Safe goal");assert.deepEqual(shared.grants,[]);assert.deepEqual(shared.proposals,[])
    assert.equal(JSON.stringify(shared).includes("PRIVATE"),false);assert.match(shared.source_sha256,/^[a-f0-9]{64}$/)
    await withActor(pool,bob,async db=>{assert.equal((await db.query("SELECT id FROM agentstudio.agent_specs WHERE id=$1",[role.id])).rows.length,0)
      assert.equal((await db.query("SELECT agentstudio.agent_collaboration_list() AS items")).rows[0].items.length,1)})
    const before=shared.source_sha256
    await f.db.query("UPDATE agentstudio.agent_specs SET revision=revision+1 WHERE id=$1",[role.id])
    assert.notEqual((await detail(bob)).source_sha256,before)
    for(const table of ["agent_collaboration_grants","agent_collaboration_proposals","agent_collaboration_revisions","agent_collaboration_receipts"]){
      assert.equal((await f.db.query("SELECT relrowsecurity AND relforcerowsecurity AS forced FROM pg_class WHERE oid=('agentstudio.'||$1)::regclass",[table])).rows[0].forced,true)
      for(const service of ["agentstudio_api","agentstudio_worker","agentstudio_model_broker","agentstudio_bound_dispatch","agentstudio_native_auth"])
        assert.equal((await f.db.query("SELECT has_any_column_privilege($1,('agentstudio.'||$2),'SELECT,INSERT,UPDATE,REFERENCES') AS visible",[service,table])).rows[0].visible,false)
    }
    const safe=(await f.db.query("SELECT NOT rolcanlogin AND NOT rolinherit AND NOT rolsuper AND NOT rolbypassrls AND NOT rolcreaterole AND NOT rolcreatedb AND NOT rolreplication AND NOT EXISTS(SELECT 1 FROM pg_auth_members WHERE roleid=r.oid OR member=r.oid) AS safe FROM pg_roles r WHERE rolname='agentstudio_collaboration'")).rows[0].safe
    assert.equal(safe,true)
    assert.equal((await f.db.query("SELECT has_column_privilege('agentstudio_collaboration','agentstudio_auth.accounts','password_record','SELECT') AS leaked")).rows[0].leaked,false)
    assert.equal((await f.db.query("SELECT has_function_privilege('agentstudio_api','agentstudio.collaboration_source_sha(uuid)','EXECUTE') AS leaked")).rows[0].leaked,false)
    assert.equal((await grant(alice,recipient.id,null,1)).revision,2);assert.equal(await detail(bob),null)
    assert.equal((await grant(alice,recipient.id,"viewer",0,request)).replayed,true);assert.equal(await detail(bob),null)
    await assert.rejects(grant(alice,recipient.id,"editor",1),/agent_collaboration_grant_changed/)
    assert.equal((await grant(alice,recipient.id,"editor",2)).revision,3)
    const current=await detail(bob),proposalRequest=randomUUID(),draft={goal:"Proposed safe goal",task_scope:"Safe quoted \"scope\"\n🚀",deliverables:["Report"],task_plan:[],done_criteria:[]}
    const propose=(who,proposed=draft,requestId=proposalRequest,source=current)=>withActor(pool,who,async db=>(await db.query("SELECT agentstudio.agent_collaboration_propose($1,$2,$3,$4::jsonb,$5,$6,$7) AS result",
      [role.id,source.revision,source.source_sha256,JSON.stringify(proposed),"Explain the safe proposed change",requestId,createHash("sha256").update(JSON.stringify({proposed,requestId,source:source.source_sha256})).digest("hex")])).rows[0].result)
    await assert.rejects(propose(alice),/agent_collaboration_editor_required/)
    await assert.rejects(propose(bob,{...draft,model_binding:{connection_id:"FORBIDDEN"}}),/agent_collaboration_protected_field/)
    await assert.rejects(propose(bob,draft,randomUUID(),{...current,source_sha256:"f".repeat(64)}),/agent_collaboration_source_changed/)
    const submitted=await propose(bob);assert.equal(submitted.status,"pending");assert.equal(submitted.replayed,false)
    assert.equal((await propose(bob)).proposal_id,submitted.proposal_id)
    await assert.rejects(propose(bob,draft,randomUUID()),/agent_collaboration_pending_exists/)
    const ownerDetail=await detail(alice);assert.match(ownerDetail.proposals[0].proposal_sha256,/^[a-f0-9]{64}$/);assert.equal(JSON.stringify(ownerDetail.proposals).includes("PRIVATE"),false)
    assert.equal((await f.db.query("SELECT agentstudio.collaboration_utf16_length(agentstudio.collaboration_compact_json($1::jsonb)) AS length",[JSON.stringify(draft)])).rows[0].length,JSON.stringify(draft).length)
    assert.equal((await grant(alice,recipient.id,"editor",3)).revision,4)
    assert.equal((await detail(alice)).proposals[0].status,"invalidated")
    assert.equal((await propose(bob)).replayed,true);assert.equal((await detail(alice)).proposals[0].status,"invalidated")
    await propose(bob,draft,randomUUID())
    const sourceBeforeEdit=(await detail(alice)).source_sha256
    const edit=goal=>withActor(pool,alice,async db=>(await db.query("UPDATE agentstudio.agent_specs SET spec=jsonb_set(spec,'{goal}',to_jsonb($2::text)),revision=revision+1,updated_at=clock_timestamp() WHERE id=$1 RETURNING revision",[role.id,goal])).rows[0])
    await edit("Owner changed safe description")
    assert.equal((await detail(alice)).proposals.every(p=>p.status==="invalidated"),true)
    await edit("Safe goal")
    assert.notEqual((await detail(alice)).source_sha256,sourceBeforeEdit)
    const versions=who=>withActor(pool,who,async db=>(await db.query("SELECT agentstudio.agent_collaboration_revisions($1) AS versions",[role.id])).rows[0].versions)
    const history=await versions(alice);assert.equal(history.length,4);assert.equal(JSON.stringify(history).includes("PRIVATE"),false)
    assert.equal(history.filter(h=>h.kind==="before_edit").length,2);assert.equal(history.filter(h=>h.kind==="edited").length,2);assert.equal(await versions(bob),null)
    await assert.rejects(withActor(pool,alice,async db=>db.query("UPDATE agentstudio.agent_specs SET spec=jsonb_set(spec,'{goal}','\"Invalid edit\"'::jsonb) WHERE id=$1",[role.id])),/agent_collaboration_unsafe_owner_edit/)
    assert.equal((await versions(alice)).length,4)
    await propose(bob,draft,randomUUID(),await detail(bob))
    const reviewState=await detail(alice),pendingProposal=reviewState.proposals.find(p=>p.status==="pending"),reviewRequest=randomUUID()
    const review=(who=alice,proposal=pendingProposal,source=reviewState,decision="accept",requestId=reviewRequest,confirm=true)=>withActor(pool,who,async db=>(await db.query(
      "SELECT agentstudio.agent_collaboration_review($1,$2,$3,$4,$5,$6,$7,$8,$9) AS result",
      [role.id,proposal.id,source.revision,source.source_sha256,proposal.proposal_sha256,decision,confirm,requestId,createHash("sha256").update(JSON.stringify({proposal,source,decision,confirm})).digest("hex")])).rows[0].result)
    await assert.rejects(review(bob),/agent_collaboration_not_found/)
    await assert.rejects(review(alice,pendingProposal,reviewState,"accept",randomUUID(),false),/invalid_agent_collaboration_review/)
    await assert.rejects(review(alice,{...pendingProposal,proposal_sha256:"f".repeat(64)}),/agent_collaboration_proposal_changed/)
    const privateBefore=(await f.db.query("SELECT spec FROM agentstudio.agent_specs WHERE id=$1",[role.id])).rows[0].spec
    const accepted=await review();assert.equal(accepted.status,"accepted");assert.equal(accepted.revision,reviewState.revision+1)
    assert.equal((await detail(alice)).source_sha256,accepted.source_sha256)
    const privateAccepted=(await f.db.query("SELECT spec FROM agentstudio.agent_specs WHERE id=$1",[role.id])).rows[0].spec
    for(const key of ["model_binding","knowledge_base_ids","http_tools","tools","require_approval"])assert.deepEqual(privateAccepted[key],privateBefore[key])
    assert.equal(privateAccepted.goal,draft.goal);assert.equal((await versions(alice)).length,6)
    assert.equal((await review()).replayed,true);assert.equal((await versions(alice)).length,6)
    await assert.rejects(review(alice,pendingProposal,await detail(alice),"accept",randomUUID()),/agent_collaboration_proposal_changed/)
    const restoreVersion=(await versions(alice)).find(h=>h.kind==="before_accept")
    const currentBinding={connection_id:"CURRENT_PRIVATE_MODEL",api_key:"CURRENT_PRIVATE_SECRET"}
    await withActor(pool,alice,async db=>db.query("UPDATE agentstudio.agent_specs SET spec=jsonb_set(spec,'{model_binding}',$2::jsonb),revision=revision+1,updated_at=clock_timestamp() WHERE id=$1",[role.id,JSON.stringify(currentBinding)]))
    await propose(bob,draft,randomUUID(),await detail(bob))
    const restoreState=await detail(alice),restoreRequest=randomUUID()
    const restore=(who=alice,source=restoreState,version=restoreVersion.id,confirm=true,requestId=restoreRequest)=>withActor(pool,who,async db=>(await db.query(
      "SELECT agentstudio.agent_collaboration_restore($1,$2,$3,$4,$5,$6,$7,$8) AS result",
      [role.id,version,source.revision,source.source_sha256,"Restore a reviewed safe description",confirm,requestId,createHash("sha256").update(JSON.stringify({source,version,confirm})).digest("hex")])).rows[0].result)
    await assert.rejects(restore(bob),/agent_collaboration_not_found/)
    await assert.rejects(restore(alice,restoreState,restoreVersion.id,false),/invalid_agent_collaboration_restore/)
    await assert.rejects(restore(alice,reviewState,restoreVersion.id),/agent_collaboration_source_changed/)
    await assert.rejects(restore(alice,restoreState,randomUUID()),/agent_collaboration_revision_not_found/)
    const restored=await restore();assert.equal(restored.revision,restoreState.revision+1)
    assert.equal((await detail(alice)).safe.goal,"Safe goal");assert.equal((await detail(alice)).source_sha256,restored.source_sha256)
    assert.equal((await detail(alice)).proposals.some(p=>p.status==="pending"),false)
    assert.deepEqual((await f.db.query("SELECT spec->'model_binding' AS binding FROM agentstudio.agent_specs WHERE id=$1",[role.id])).rows[0].binding,currentBinding)
    assert.equal((await versions(alice)).length,10);assert.equal(JSON.stringify(await versions(alice)).includes("PRIVATE"),false)
    assert.equal((await restore()).replayed,true);assert.equal((await review()).replayed,true)
    assert.equal((await detail(alice)).revision,restored.revision);assert.equal((await versions(alice)).length,10)
    // A disabled author's proposal remains rejectable but can never be accepted.
    await propose(bob,draft,randomUUID(),await detail(bob))
    const disabledSource=await detail(alice),disabledProposal=disabledSource.proposals.find(p=>p.status==="pending")
    await f.db.query("UPDATE agentstudio_auth.accounts SET enabled=false WHERE user_id=$1",[recipient.id])
    await assert.rejects(review(alice,disabledProposal,disabledSource,"accept",randomUUID()),/agent_collaboration_author_revoked/)
    assert.equal((await review(alice,disabledProposal,disabledSource,"reject",randomUUID())).status,"rejected")
    await f.db.query("UPDATE agentstudio_auth.accounts SET enabled=true WHERE user_id=$1",[recipient.id])
    await propose(bob,draft,randomUUID(),await detail(bob))
    const faultSource=await detail(alice),faultProposal=faultSource.proposals.find(p=>p.status==="pending"),faultRequest=randomUUID()
    const historyBeforeFault=await versions(alice)
    await f.db.query("ALTER TABLE agentstudio.agent_collaboration_receipts ADD CONSTRAINT synthetic_collaboration_receipt_fault CHECK(false) NOT VALID")
    try{
      await assert.rejects(review(alice,faultProposal,faultSource,"accept",faultRequest),/synthetic_collaboration_receipt_fault/)
      assert.equal((await detail(alice)).source_sha256,faultSource.source_sha256)
      assert.equal((await detail(alice)).revision,faultSource.revision)
      assert.equal((await detail(alice)).proposals.find(p=>p.id===faultProposal.id).status,"pending")
      assert.deepEqual(await versions(alice),historyBeforeFault)
      assert.equal((await f.db.query("SELECT count(*)::int AS n FROM agentstudio.agent_collaboration_receipts WHERE request_id=$1",[faultRequest])).rows[0].n,0)
    }finally{await f.db.query("ALTER TABLE agentstudio.agent_collaboration_receipts DROP CONSTRAINT synthetic_collaboration_receipt_fault")}
    assert.equal((await review(alice,faultProposal,faultSource,"accept",faultRequest)).status,"accepted")
    assert.equal((await review(alice,faultProposal,faultSource,"accept",faultRequest)).replayed,true)
    assert.equal((await versions(alice)).length,historyBeforeFault.length+2)
    await f.db.query("UPDATE agentstudio_auth.accounts SET enabled=false WHERE user_id=$1",[owner.id]);assert.equal(await detail(bob),null)
    const astral="x".repeat(2998)+"🚀"
    assert.equal((await f.db.query("SELECT agentstudio.collaboration_utf16_length($1) AS length",[astral])).rows[0].length,3000)
    assert.equal((await f.db.query("SELECT agentstudio.collaboration_safe_text($1::jsonb) AS safe",[JSON.stringify({goal:astral+"x"})])).rows[0].safe,null)
  }finally{await f.close()}
})
