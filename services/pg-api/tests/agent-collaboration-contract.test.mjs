import test from "node:test"
import assert from "node:assert/strict"
import {parseAgentCollaborationChoice} from "../src/agent-collaboration-contract.ts"
const id="ABCDEFAB-1234-4234-8234-ABCDEFABCDEF",sha="a".repeat(64)
const request={request_id:id},source={expected_spec_revision:2,source_sha256:sha}
test("collaboration changes bind exact version, proposal, recipient and explicit owner confirmation",()=>{
  const grant={...request,action:"grant",recipient_email:" Bob@Example.test ",role:"editor",expected_access_revision:0}
  assert.equal(parseAgentCollaborationChoice(grant).recipient_email,"bob@example.test")
  assert.equal(parseAgentCollaborationChoice(grant).request_id,id.toLowerCase())
  const propose={...request,...source,action:"propose",proposed:{goal:"Safe revised goal"},comment:"Explain the proposed safe change"}
  assert.equal(parseAgentCollaborationChoice(propose).proposed.task_scope,"")
  const review={...request,...source,action:"review",proposal_id:id,proposal_sha256:sha,decision:"accept",confirm:true}
  assert.equal(parseAgentCollaborationChoice(review).confirm,true)
  const restore={...request,...source,action:"restore",revision_id:id,reason:"Restore a reviewed descriptive revision",confirm:true}
  const edit={...request,...source,action:"edit",safe:{goal:"An owner safe edit"}}
  assert.equal(parseAgentCollaborationChoice(edit).safe.goal,"An owner safe edit")
  assert.equal(parseAgentCollaborationChoice(restore).revision_id,id.toLowerCase())
  for(const body of [grant,edit,propose,review,restore]){
    assert.throws(()=>parseAgentCollaborationChoice({...body,owner_user_id:id}))
    assert.throws(()=>parseAgentCollaborationChoice({...body,request_id:"not-a-uuid"}))
  }
  for(const body of [review,restore])assert.throws(()=>parseAgentCollaborationChoice({...body,confirm:false}))
  for(const body of [edit,propose,review,restore]){
    assert.throws(()=>parseAgentCollaborationChoice({...body,expected_spec_revision:0}))
    assert.throws(()=>parseAgentCollaborationChoice({...body,source_sha256:"invalid"}))
  }
  assert.throws(()=>parseAgentCollaborationChoice({...propose,proposed:{goal:"Safe",model_binding:{connection_id:id}}}),e=>e.code==="agent_collaboration_protected_field")
  assert.throws(()=>parseAgentCollaborationChoice({...review,proposal_sha256:undefined}))
  assert.throws(()=>parseAgentCollaborationChoice({...restore,reason:"short"}))
  assert.throws(()=>parseAgentCollaborationChoice({...grant,expected_access_revision:Number.MAX_SAFE_INTEGER}))
  assert.throws(()=>parseAgentCollaborationChoice({...grant,recipient_email:"wrong@second@example.test"}))
  assert.throws(()=>parseAgentCollaborationChoice({...request,action:"revoke",recipient_id:id,expected_access_revision:0}))
})
