import test from "node:test"
import assert from "node:assert/strict"
import {randomUUID} from "node:crypto"
import {agentCollaborationFixture} from "./helpers/agent-collaboration-fixture.mjs"
import {AgentCollaborationRepository} from "../src/agent-collaboration-repository.ts"
import {AgentSpecRepository} from "../src/repository.ts"
import {safeAgentSpec} from "../src/contracts.ts"
test("collaboration repository recovers exact owner intent without another directory lookup and keeps read/stop after write opt-out",async()=>{
  const f=await agentCollaborationFixture();let lookups=0,failLookup=false
  try{
    const resolve=async(identity,email)=>{lookups++;assert.deepEqual(identity,f.alice);if(failLookup)throw Error("must not resolve a replayed email");return email==="collaborator@example.test"?{id:f.recipient.id,display_name:"Synthetic collaborator"}:null}
    const repo=new AgentCollaborationRepository(f.pool,resolve,{enabled:true}),readonly=new AgentCollaborationRepository(f.pool,resolve)
    const role=await new AgentSpecRepository(f.pool).create(f.alice,"Safe shared role",safeAgentSpec({goal:"Owner description",task_scope:"Owner scope",tools:["calculate"]}))
    const original=await repo.detail(f.alice,role.id),edit={action:"edit",request_id:randomUUID(),expected_spec_revision:original.revision,source_sha256:original.source_sha256,
      safe:{...original.safe,task_scope:"Owner edited scope",task_plan:["Review the owner-approved task plan"]}}
    await assert.rejects(readonly.change(f.alice,role.id,edit),e=>e.status===403)
    const edited=await repo.change(f.alice,role.id,edit);assert.equal(edited.revision,2)
    assert.equal((await readonly.change(f.alice,role.id,edit)).replayed,true);assert.equal((await repo.revisions(f.alice,role.id)).length,2)
    const grant={action:"grant",recipient_email:" Collaborator@Example.test ",role:"editor",expected_access_revision:0,request_id:randomUUID()}
    await assert.rejects(repo.change(f.bob,role.id,grant),e=>e.status===404);assert.equal(lookups,0)
    await assert.rejects(readonly.change(f.alice,role.id,grant),e=>e.code==="agent_collaboration_writes_disabled");assert.equal(lookups,0)
    const [first,second]=await Promise.all([repo.change(f.alice,role.id,grant),repo.change(f.alice,role.id,grant)])
    assert.equal(first.revision,1);assert.equal(second.revision,1);assert.equal([first,second].filter(r=>r.replayed).length,1)
    const priorLookups=lookups;failLookup=true
    assert.equal((await readonly.change(f.alice,role.id,grant)).replayed,true);assert.equal(lookups,priorLookups)
    await assert.rejects(repo.change(f.alice,role.id,{...grant,role:"viewer"}),e=>e.status===409);assert.equal(lookups,priorLookups)
    const shared=await repo.detail(f.bob,role.id);assert.equal(shared.role,"editor");assert.deepEqual(shared.grants,[]);assert.equal(shared.safe.goal,"Owner description")
    await assert.rejects(repo.revisions(f.bob,role.id),e=>e.status===404)
    assert.equal((await repo.list(f.bob)).length,1)
    const proposal={action:"propose",request_id:randomUUID(),expected_spec_revision:shared.revision,source_sha256:shared.source_sha256,
      proposed:{...shared.safe,goal:"A collaborative safe description"},comment:"Improve the descriptive instructions"}
    const saved=await repo.change(f.bob,role.id,proposal);assert.equal(saved.status,"pending")
    const ownerView=await repo.detail(f.alice,role.id),pending=ownerView.proposals.find(p=>p.id===saved.proposal_id)
    const review={action:"review",request_id:randomUUID(),expected_spec_revision:ownerView.revision,source_sha256:ownerView.source_sha256,proposal_id:pending.id,proposal_sha256:pending.proposal_sha256,decision:"accept",confirm:true}
    await assert.rejects(readonly.change(f.alice,role.id,review),e=>e.status===403)
    const accepted=await repo.change(f.alice,role.id,review);assert.equal(accepted.status,"accepted")
    assert.equal((await readonly.change(f.alice,role.id,review)).replayed,true)
    const history=await repo.revisions(f.alice,role.id);assert.equal(history.length,4)
    const current=await repo.detail(f.alice,role.id),restore={action:"restore",request_id:randomUUID(),expected_spec_revision:current.revision,source_sha256:current.source_sha256,
      revision_id:history.find(h=>h.kind==="before_accept").id,reason:"Restore the earlier owner description",confirm:true}
    await repo.change(f.alice,role.id,restore);assert.equal((await repo.detail(f.alice,role.id)).safe.goal,"Owner description")
    assert.equal((await readonly.change(f.alice,role.id,restore)).replayed,true);assert.equal((await repo.revisions(f.alice,role.id)).length,6)
    await readonly.change(f.alice,role.id,{action:"revoke",recipient_id:f.recipient.id,expected_access_revision:1,request_id:randomUUID()})
    await assert.rejects(repo.detail(f.bob,role.id),e=>e.status===404);assert.deepEqual(await repo.list(f.bob),[])
    assert.equal((await readonly.change(f.alice,role.id,grant)).replayed,true)
    await assert.rejects(repo.detail(f.bob,role.id),e=>e.status===404);assert.equal(lookups,priorLookups)
  }finally{await f.close()}
})
