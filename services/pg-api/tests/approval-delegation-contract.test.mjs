import test from "node:test"
import assert from "node:assert/strict"
import {parseApprovalDelegationChoice} from "../src/approval-delegation-contract.ts"
import {KNOWLEDGE_TOOL_CHARGE_ACKNOWLEDGEMENT as charge} from "../src/knowledge-retrieval-binding.ts"
const request="11111111-1111-4111-8111-111111111111",run="22222222-2222-4222-8222-222222222222",reviewer="33333333-3333-4333-8333-333333333333"
const common={request_id:request,run_id:run,expected_grant_revision:0,step_key:"wf2_00002_agent_a01m",input_sha256:"a".repeat(64),run_source_sha256:"b".repeat(64)}

test("owner delegation choices freeze the exact operation, bounded purpose/expiry and independent charge acknowledgement",()=>{
  const choice={...common,action:"grant",reviewer_id:reviewer,review_note:"  Review one exact pending step  ",expires_hours:24,knowledge_query_charge:null,confirm:true}
  assert.equal(parseApprovalDelegationChoice(choice).review_note,"Review one exact pending step")
  assert.equal(parseApprovalDelegationChoice({...choice,step_key:"model"}).step_key,"model")
  assert.equal(parseApprovalDelegationChoice({...choice,knowledge_query_charge:charge}).knowledge_query_charge,charge)
  for(const extra of [{expires_hours:0},{expires_hours:73},{expires_hours:1.5},{review_note:"short"},{review_note:"x".repeat(501)},{review_note:"contains\0value"},
    {confirm:false},{reviewer_id:""},{step_key:"arbitrary"},{step_key:"wf2_00002_"+"a".repeat(101)},{input_sha256:"A".repeat(64)},{run_source_sha256:""},
    {owner_user_id:reviewer},{actor_user_id:reviewer},{input:{password:"not accepted"}},{api_key:"not accepted"},{auto_approve:true},{knowledge_query_charge:true}])
    assert.throws(()=>parseApprovalDelegationChoice({...choice,...extra}),e=>e.status===400)
  assert.throws(()=>parseApprovalDelegationChoice({...choice,expected_grant_revision:Number.MAX_SAFE_INTEGER}))
})

test("revocation cannot become a grant and manager review cannot carry execution data or fees on rejection",()=>{
  const stop={action:"revoke",request_id:request,run_id:run,expected_grant_revision:2}
  assert.deepEqual(parseApprovalDelegationChoice(stop),stop)
  for(const extra of [{expected_grant_revision:0},{reviewer_id:reviewer},{step_key:common.step_key},{confirm:true},{decision:"approved"}])assert.throws(()=>parseApprovalDelegationChoice({...stop,...extra}))
  const review={...common,expected_grant_revision:2,action:"review",decision:"approved",knowledge_query_charge:charge,confirm:true}
  assert.deepEqual(parseApprovalDelegationChoice(review),review)
  assert.equal(parseApprovalDelegationChoice({...review,decision:"rejected",knowledge_query_charge:null}).decision,"rejected")
  for(const extra of [{expected_grant_revision:0},{decision:"approve"},{decision:"rejected"},{confirm:false},{owner_user_id:run},{run:{checkpoint:{}}},{instruction:"forbidden"},{model_binding:{connection_id:reviewer}}])
    assert.throws(()=>parseApprovalDelegationChoice({...review,...extra}))
  assert.throws(()=>parseApprovalDelegationChoice(Object.assign(Object.create({hidden:true}),review)))
  assert.throws(()=>parseApprovalDelegationChoice({...review,[Symbol("unknown")]:true}))
})
