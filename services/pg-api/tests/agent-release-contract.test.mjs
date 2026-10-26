import test from "node:test"
import assert from "node:assert/strict"
import {parseAgentReleaseChoice,parseAgentReleaseStoredSpec} from "../src/agent-release-contract.ts"
import {safeAgentSpec} from "../src/contracts.ts"
const id="11111111-1111-4111-8111-111111111111",version="22222222-2222-4222-8222-222222222222",hash="a".repeat(64)
const base={request_id:id,expected_spec_revision:3,source_sha256:hash}
test("full version choices never accept client snapshots or test results and bind exact current/selected versions",()=>{
  const snapshot={action:"snapshot",...base,note:"  Reviewed source  ",test_run_id:null}
  assert.equal(parseAgentReleaseChoice(snapshot).note,"Reviewed source")
  assert.equal(parseAgentReleaseChoice({...snapshot,test_run_id:version}).test_run_id,version)
  for(const extra of [{spec_snapshot:{}},{test_passed:true},{owner_user_id:id},{note:"x".repeat(501)},{note:"x\0y"},{test_run_id:""},{expected_spec_revision:2.5},{source_sha256:hash.toUpperCase()}])
    assert.throws(()=>parseAgentReleaseChoice({...snapshot,...extra}),e=>e.status===400)
  const publish={action:"publish",...base,version_id:version,version_sha256:hash,expected_version_revision:1,expected_release_revision:2,confirm:true,acknowledge_untested:false}
  assert.deepEqual(parseAgentReleaseChoice(publish),publish)
  for(const extra of [{confirm:false},{acknowledge_untested:"true"},{expected_version_revision:0},{expected_release_revision:0},{version_sha256:""},{version_id:id+"x"}])assert.throws(()=>parseAgentReleaseChoice({...publish,...extra}))
  const {acknowledge_untested,expected_release_revision,...rest}=publish
  assert.throws(()=>parseAgentReleaseChoice(rest))
  assert.equal(parseAgentReleaseChoice({...rest,action:"restore",reason:"Restore the reviewed full configuration"}).action,"restore")
  assert.throws(()=>parseAgentReleaseChoice({...rest,action:"restore",reason:"short"}))
  const drop={action:"delete_draft",request_id:id,version_id:version,version_sha256:hash,expected_version_revision:1,confirm:true}
  assert.deepEqual(parseAgentReleaseChoice(drop),drop)
  assert.throws(()=>parseAgentReleaseChoice({...drop,source_sha256:hash}))
  const acceptance={action:"acceptance",...base,instruction:"Synthetic acceptance task",max_steps:8,model_binding:null,confirm:true}
  assert.deepEqual(parseAgentReleaseChoice(acceptance),acceptance)
  for(const extra of [{max_steps:31},{max_steps:0},{instruction:"x".repeat(2001)},{confirm:false},{model_binding:{api_key:"never accepted"}},{test_passed:true},{spec_snapshot:{}}])
    assert.throws(()=>parseAgentReleaseChoice({...acceptance,...extra}))
  assert.deepEqual(parseAgentReleaseChoice({...acceptance,model_binding:{connection_id:version,connection_revision:2,model_id:"synthetic-b"}}).model_binding,
    {connection_id:version,connection_revision:2,model_id:"synthetic-b"})
})
test("owned historical snapshots retain exact text and bindings while rejecting credentials, disabled approval and overflow",()=>{
  const original={...safeAgentSpec({goal:"Reviewed role",tools:["calculate"]}),goal:"  Exact historical wording  ",model_binding:null}
  const parsed=parseAgentReleaseStoredSpec(original)
  assert.deepEqual(parsed.snapshot,original);assert.notEqual(parsed.snapshot,original)
  assert.equal(parsed.validated.goal,"Exact historical wording");assert.equal(parsed.validated.model_binding,undefined)
  original.goal="Caller changed after validation";assert.equal(parsed.snapshot.goal,"  Exact historical wording  ")
  for(const extra of [{api_key:"Never accepted"},{require_approval:false},{goal:"x".repeat(3001)},{deliverables:["bad\0text"]},{knowledge_base_ids:[id]}])
    assert.throws(()=>parseAgentReleaseStoredSpec({...original,...extra}),e=>e.status===400&&e.code==="invalid_agent_release_snapshot")
  assert.throws(()=>parseAgentReleaseStoredSpec({goal:"Missing explicit native approval"}))
  const wide={...safeAgentSpec({goal:"x"}),goal:"\u0001".repeat(3000),task_scope:"\u0001".repeat(4000),deliverables:Array(30).fill("\u0001".repeat(500)),
    task_plan:Array(30).fill("\u0001".repeat(500)),done_criteria:Array(30).fill("\u0001".repeat(500))}
  assert.throws(()=>parseAgentReleaseStoredSpec(wide),e=>e.code==="invalid_agent_release_snapshot")
})
