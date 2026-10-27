import test from 'node:test'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {agentAssessmentApproval,agentAssessmentExecutionEnabled,parseAgentAssessmentProof,parseAgentAssessmentClaim,agentAssessmentProofFromClaim,parseAgentAssessmentReply,normalizeAgentAssessmentCompletion,agentAssessmentOutputHash} from '../src/agent-assessment-contract.ts'
import {agentReviewDimensions} from '../src/agent-review-contract.ts'
import {canonicalMcpJson} from '../src/mcp-catalog.ts'
const proof={request_id:'abcdef01-abcd-4abc-8def-123456789abc',lease_token:'fedcba01-fedc-4fed-8cba-abcdef012345',lease_version:1,worker_id:'11111111-1111-4111-8111-111111111111'}
const output={score:0,dimensions:agentReviewDimensions.map(name=>({name,score:0,comment:'需要验证'})),suggestions:[]}
test('review execution has a separate explicit default-off approval',()=>{
  for(const value of [{},{executionEnabled:false},{AGENT_STUDIO_PG18_BOUND_GENERATION_UAT_ENABLED:'true'},{allowAutonomousExecution:true},{executionApproval:agentAssessmentApproval}])assert.equal(agentAssessmentExecutionEnabled(value),false)
  assert.equal(agentAssessmentExecutionEnabled({executionEnabled:true,executionApproval:agentAssessmentApproval}),true)
  for(const executionApproval of [undefined,true,'APPROVE_DISPOSABLE_PG18_OWNER_BOUND_GENERATION_UAT_ONLY'])assert.throws(()=>agentAssessmentExecutionEnabled({executionEnabled:true,executionApproval}))
})
test('private proof is an exact lowercase normalized4-field lease, with no owner/prompt/model/fee authority',()=>{
  assert.deepEqual(parseAgentAssessmentProof({...proof,request_id:proof.request_id.toUpperCase()}),proof)
  for(const patch of [{owner_user_id:proof.worker_id},{identity:{}},{messages:[]},{model_binding:{}},{fee_acknowledgement:'approved'},{lease_version:'1'},{lease_version:0},{lease_version:Number.MAX_SAFE_INTEGER},{lease_version:1.5},{worker_id:'old-worker'}])assert.throws(()=>parseAgentAssessmentProof({...proof,...patch}))
  for(const key of Object.keys(proof)){const value={...proof};delete value[key];assert.throws(()=>parseAgentAssessmentProof(value))}
  for(const raw of [null,[],Object.assign(Object.create({}),proof),{...proof,[Symbol('hidden')]:true}])assert.throws(()=>parseAgentAssessmentProof(raw))
  for(const key of Object.keys(proof)){let calls=0;const raw={...proof};Object.defineProperty(raw,key,{get(){calls++;throw Error('getter')},enumerable:true});assert.throws(()=>parseAgentAssessmentProof(raw));assert.equal(calls,0)}
})
test('claim expiry is private transport metadata and is stripped from the outgoing proof',()=>{
  const claim=parseAgentAssessmentClaim({...proof,lease_expires_at:'2030-01-01T00:00:00Z'})
  assert.equal(claim.lease_expires_at,'2030-01-01T00:00:00.000Z');assert.deepEqual(agentAssessmentProofFromClaim(claim),proof)
  for(const patch of [{lease_expires_at:'invalid'},{lease_expires_at:123},{owner_user_id:proof.worker_id}])assert.throws(()=>parseAgentAssessmentClaim({...claim,...patch}))
})
test('Worker replies contain only request state and durable hashes; private generated content never crosses RPC',()=>{
  const success={request_id:proof.request_id,state:'succeeded',result_sha256:'a'.repeat(64),completion_sha256:'b'.repeat(64)}
  assert.deepEqual(parseAgentAssessmentReply(success),success)
  assert.deepEqual(parseAgentAssessmentReply({request_id:proof.request_id,state:'unknown',completion_sha256:'b'.repeat(64),result_sha256:null}),{request_id:proof.request_id,state:'unknown',completion_sha256:'b'.repeat(64)})
  for(const patch of [{result:{}},{messages:[]},{api_key:'secret'},{state:'completed'},{result_sha256:null},{result_sha256:'A'.repeat(64)},{provider_executed:true},{paid:false}])assert.throws(()=>parseAgentAssessmentReply({...success,...patch}))
  assert.throws(()=>parseAgentAssessmentReply({request_id:proof.request_id,state:'succeeded'}))
  assert.throws(()=>parseAgentAssessmentReply({request_id:proof.request_id,state:'paused',completion_sha256:'a'.repeat(64)}))
})
test('strict completion keeps actual zero scores, rejects authority fields, and computes exact normalized output digest',()=>{
  assert.deepEqual(normalizeAgentAssessmentCompletion('evaluate',{status:'succeeded',result:output}),{status:'succeeded',result:output})
  const expected=createHash('sha256').update(canonicalMcpJson({protocol:'agent_paid_review_output_v1',request_id:proof.request_id,purpose:'evaluate',input_sha256:'a'.repeat(64),result:output})).digest('hex')
  assert.equal(agentAssessmentOutputHash(proof.request_id,'evaluate','a'.repeat(64),output),expected)
  for(const result of [{...output,score:'0'},{...output,owner_user_id:proof.worker_id},{...output,engine_succeeded:true},{...output,suggestions:new Array(1)}])assert.throws(()=>normalizeAgentAssessmentCompletion('evaluate',{status:'succeeded',result}))
  for(const raw of [{status:'unknown',failure_code:'private key=secret'},{status:'failed',failure_code:'x'.repeat(65)},{status:'succeeded',result:output,paid:false},{status:'unknown',failure_code:'transport_unknown',result:output}])assert.throws(()=>normalizeAgentAssessmentCompletion('evaluate',raw))
  assert.deepEqual(normalizeAgentAssessmentCompletion('evaluate',{status:'unknown',failure_code:'provider_outcome_unknown'}),{status:'unknown',failure_code:'provider_outcome_unknown'})
})
test('optimization retains the full Native descriptive capacity but cannot accept a tool or approval edit',()=>{
  const result={descriptive:{goal:'合'.repeat(3000),task_scope:'范'.repeat(4000),deliverables:Array(30).fill('交'.repeat(500)),task_plan:Array(30).fill('计'.repeat(500)),done_criteria:Array(30).fill('验'.repeat(500))},tools_note:'仅由本人决定',rationale:'依据明确选择的反馈'}
  assert.deepEqual(normalizeAgentAssessmentCompletion('optimize',{status:'succeeded',result}).result,result)
  for(const patch of [{model_binding:{}},{tools:['http_review']},{require_approval:false},{owner_user_id:proof.worker_id}])assert.throws(()=>normalizeAgentAssessmentCompletion('optimize',{status:'succeeded',result:{...result,descriptive:{...result.descriptive,...patch}}}))
})
