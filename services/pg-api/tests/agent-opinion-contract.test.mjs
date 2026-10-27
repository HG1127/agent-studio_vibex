import test from 'node:test'
import assert from 'node:assert/strict'
import {parseAgentOpinionReviewId,parseAgentOpinionAnchor,parseAgentOpinionBody,parseAgentOpinionView} from '../src/agent-opinion-contract.ts'
import {parseAgentReviewSubmission,agentReviewFees,agentReviewDimensions} from '../src/agent-review-contract.ts'
import {agentAssessmentOutputHash} from '../src/agent-assessment-contract.ts'

const id=n=>`${String(n).repeat(8)}-${String(n).repeat(4)}-4${String(n).repeat(3)}-8${String(n).repeat(3)}-${String(n).repeat(12)}`
const evaluation=()=>({score:0,dimensions:agentReviewDimensions.map(name=>({name,score:0,comment:'需要核对'})),suggestions:[]})
const optimization=()=>({descriptive:{goal:'核'.repeat(3000),task_scope:'界'.repeat(4000),deliverables:Array(30).fill('交'.repeat(500)),task_plan:Array(30).fill('计'.repeat(500)),done_criteria:Array(30).fill('验'.repeat(500))},tools_note:'工具建议由本人另行判断',rationale:'仅针对所选反馈的未接受建议'})
function fixture(purpose='evaluate'){
  const result=purpose==='evaluate'?evaluation():optimization(),choice={action:'preview',purpose,spec_id:id(1),run_id:id(2),expected_source_sha256:'a'.repeat(64),expected_spec_revision:2,expected_spec_sha256:'b'.repeat(64),model_binding:{connection_id:id(3),connection_revision:3,model_id:'synthetic'},output_token_limit:purpose==='evaluate'?2048:16384,feedback_sources:purpose==='evaluate'?[]:[{run_id:id(2),feedback_id:id(5),feedback_sha256:'f'.repeat(64)}],evaluation_sources:[]}
  const intent=parseAgentReviewSubmission({...choice,action:'submit',request_id:id(4),expected_input_sha256:'c'.repeat(64),confirm:true,fee_acknowledgement:agentReviewFees[purpose]})
  const body={request_id:id(4),purpose,input_sha256:intent.expected_input_sha256,result_sha256:agentAssessmentOutputHash(id(4),purpose,intent.expected_input_sha256,result),result}
  const anchor={protocol:'agent_paid_review_read_anchor_v1',request_id:id(4),spec_id:id(1),run_id:id(2),purpose,request_sha256:intent.request_sha256,input_sha256:intent.expected_input_sha256,content_sha256:'d'.repeat(64),owner_epoch:4,source_protocol:purpose==='evaluate'?'current_task_delivery_v1':'employee_statement_anchor_v1',created_at:'2026-10-27T01:02:03.000Z',job_state:'pending',lease_state:'succeeded',outcome:{status:'succeeded',completion_sha256:'e'.repeat(64),result_sha256:body.result_sha256,failure_code:null,created_at:'2026-10-27T01:03:03.000Z'},body_erased:false,choice}
  return {anchor,body,result}
}
function view(anchor,result=null){const {protocol:_protocol,job_state,lease_state,outcome,body_erased,choice:_choice,...request}=anchor;return {protocol:'agent_paid_review_view_v1',request,execution:{job_state,lease_state,outcome},body_erased,available:result!==null,result}}
const invalid=fn=>assert.throws(fn,error=>error.status===400&&error.code==='agent_opinion_invalid_read')

test('read identifier is one normalized UUID, never a caller-selected owner/source/expectation object',()=>{
  const uuid='abcdef01-abcd-4abc-8def-123456789abc';assert.equal(parseAgentOpinionReviewId(uuid.toUpperCase()),uuid)
  for(const raw of [null,undefined,{},[],{request_id:uuid,owner_id:id(1)},uuid+' ',1,'invalid'])invalid(()=>parseAgentOpinionReviewId(raw))
})
test('protected anchor/body and public view retain real zero scores and match the existing output digest exactly',()=>{
  const f=fixture();assert.deepEqual(parseAgentOpinionAnchor(f.anchor),f.anchor);assert.deepEqual(parseAgentOpinionBody(f.body),f.body)
  const current=parseAgentOpinionView(view(f.anchor,f.result));assert.equal(current.available,true);assert.equal(current.result.score,0);assert.equal(current.execution.outcome.status,'succeeded')
  assert.deepEqual(Object.keys(current).sort(),['protocol','request','execution','body_erased','available','result'].sort())
  assert.doesNotMatch(JSON.stringify(current),/"choice"|messages|model_binding|lease_token|owner_user_id|provider_executed|"paid"|"refunded"|engine_succeeded/)
})
test('pending/claimed/reserved/paused/failed/unknown metadata never creates a result or completion assertion',()=>{
  const f=fixture()
  for(const lease_state of [null,'claimed','reserved','paused','failed','unknown']){
    const outcome=['failed','unknown'].includes(lease_state)?{status:lease_state,completion_sha256:'e'.repeat(64),result_sha256:null,failure_code:'provider_outcome_unknown',created_at:f.anchor.created_at}:null
    const anchor={...f.anchor,lease_state,outcome,choice:null},parsed=parseAgentOpinionAnchor(anchor),current=parseAgentOpinionView(view(parsed))
    assert.equal(current.available,false);assert.equal(current.result,null);assert.equal(current.execution.lease_state,lease_state);assert.deepEqual(current.execution.outcome,outcome)
    invalid(()=>parseAgentOpinionView({...current,available:true,result:f.result}))
  }
})
test('historical succeeded metadata remains truthful after cancel/erase and does not imply an available current body',()=>{
  const f=fixture()
  for(const job_state of ['cancelled','erased']){const anchor={...f.anchor,job_state,body_erased:job_state==='erased',choice:null},current=parseAgentOpinionView(view(parseAgentOpinionAnchor(anchor)));assert.equal(current.execution.outcome.status,'succeeded');assert.equal(current.available,false);assert.equal(current.result,null);invalid(()=>parseAgentOpinionView({...current,available:true,result:f.result}));invalid(()=>parseAgentOpinionAnchor({...anchor,choice:f.anchor.choice}))}
  const unavailable=parseAgentOpinionView(view({...f.anchor,choice:null}));assert.equal(unavailable.available,false);assert.equal(unavailable.execution.outcome.status,'succeeded')
})
test('choice must seal the exact stored intent, purpose/spec/run and supported parent selection; no fabricated empty parents',()=>{
  const f=fixture()
  for(const patch of [{request_sha256:'f'.repeat(64)},{input_sha256:'f'.repeat(64)},{spec_id:id(6)},{run_id:id(6)},{choice:{...f.anchor.choice,output_token_limit:4096}},{choice:{...f.anchor.choice,model_binding:{...f.anchor.choice.model_binding,connection_revision:4}}}])invalid(()=>parseAgentOpinionAnchor({...f.anchor,...patch}))
  const p=fixture('optimize'),choice={...p.anchor.choice,evaluation_sources:[{run_id:id(6),review_id:id(7),result_sha256:'a'.repeat(64)}]},request=parseAgentReviewSubmission({...choice,action:'submit',request_id:p.anchor.request_id,expected_input_sha256:p.anchor.input_sha256,confirm:true,fee_acknowledgement:agentReviewFees.optimize})
  invalid(()=>parseAgentOpinionAnchor({...p.anchor,choice,request_sha256:request.request_sha256}));assert.equal(choice.evaluation_sources.length,1)
})
test('strict body refuses swapped IDs/purpose/input/result hashes, authority fields and unnormalized provider output',()=>{
  const f=fixture()
  for(const patch of [{request_id:id(6)},{purpose:'optimize'},{input_sha256:'a'.repeat(64)},{result_sha256:'a'.repeat(64)},{result:{...f.result,score:'0'}},{result:{...f.result,engine_succeeded:true}},{owner_user_id:id(1)},{messages:[]},{lease_token:id(1)},{result:{...f.result,suggestions:[' trim me ']}}])invalid(()=>parseAgentOpinionBody({...f.body,...patch}))
  invalid(()=>parseAgentOpinionBody({...f.body,result:{...f.result,suggestions:['api_key=syntheticPrivateValue']}}))
})
test('full Native descriptive capacity survives read normalization; generated patches cannot carry tools/grants/approval',()=>{
  const f=fixture('optimize');assert.deepEqual(parseAgentOpinionBody(f.body).result,f.result);assert.deepEqual(parseAgentOpinionView(view(f.anchor,f.result)).result,f.result)
  for(const patch of [{tools:['calculate']},{require_approval:false},{model_binding:{}},{knowledge_base_ids:[id(1)]},{owner_user_id:id(1)}])invalid(()=>parseAgentOpinionBody({...f.body,result:{...f.result,descriptive:{...f.result.descriptive,...patch}}}))
})
test('public-safe view rejects choice/input/proof leaks, ambiguous flags and incompatible privacy/disposition fields',()=>{
  const f=fixture(),raw=view(f.anchor,f.result)
  for(const patch of [{choice:f.anchor.choice},{messages:[]},{available:'true'},{body_erased:true},{result:null},{request:{...raw.request,owner_user_id:id(6)}},{execution:{...raw.execution,lease_token:id(6)}},{execution:{...raw.execution,job_state:'completed'}}])invalid(()=>parseAgentOpinionView({...raw,...patch}))
  invalid(()=>parseAgentOpinionView({...raw,available:false}));invalid(()=>parseAgentOpinionView({...view(f.anchor),result:{private:'cached'}}))
})
test('closed DTOs reject symbols/foreign prototypes/accessors without invoking getter or coercion code',()=>{
  const f=fixture()
  for(const key of Object.keys(f.anchor)){let calls=0;const raw={...f.anchor};Object.defineProperty(raw,key,{get(){calls++;throw Error('getter')},enumerable:true});invalid(()=>parseAgentOpinionAnchor(raw));assert.equal(calls,0)}
  for(const raw of [{...f.anchor,[Symbol('hidden')]:true},Object.assign(Object.create({}),f.anchor)])invalid(()=>parseAgentOpinionAnchor(raw))
  let coerced=0;invalid(()=>parseAgentOpinionAnchor({...f.anchor,lease_state:{toString(){coerced++;return 'succeeded'}}}));assert.equal(coerced,0)
  const hidden={...f.anchor};delete hidden.choice;hidden[Symbol('choice')]=null;invalid(()=>parseAgentOpinionAnchor(hidden))
  invalid(()=>parseAgentOpinionAnchor({...f.anchor,outcome:{...f.anchor.outcome,owner_id:id(1)}}))
})
test('metadata hashes/epochs/dates/source semantics and outcome nullability are validated without loose coercion',()=>{
  const f=fixture()
  for(const patch of [{owner_epoch:'4'},{owner_epoch:0},{owner_epoch:Number.MAX_SAFE_INTEGER},{created_at:'not-a-date'},{created_at:'2026-10-27T24:00:00Z'},{request_sha256:'A'.repeat(64)},{source_protocol:'employee_statement_anchor_v1'},{outcome:{...f.anchor.outcome,failure_code:'charged_zero'}},{outcome:{...f.anchor.outcome,result_sha256:null}},{outcome:{status:'unknown',completion_sha256:'e'.repeat(64),result_sha256:null,failure_code:'private detail with spaces',created_at:f.anchor.created_at},choice:null}])invalid(()=>parseAgentOpinionAnchor({...f.anchor,...patch}))
  assert.equal(parseAgentOpinionAnchor({...f.anchor,created_at:'2026-10-27T09:02:03+08:00'}).created_at,f.anchor.created_at)
})
test('parsed result and metadata are detached from caller objects and frozen records are never mutated',()=>{
  const f=fixture(),original=structuredClone(f.anchor);Object.freeze(f.anchor);const anchor=parseAgentOpinionAnchor(f.anchor),body=parseAgentOpinionBody(f.body),current=parseAgentOpinionView(view(anchor,body.result))
  f.result.dimensions[0].comment='changed';f.anchor.choice.model_binding.model_id='changed';assert.equal(body.result.dimensions[0].comment,'需要核对');assert.equal(current.result.dimensions[0].comment,'需要核对');assert.equal(anchor.choice.model_binding.model_id,'synthetic');assert.equal(original.request_sha256,anchor.request_sha256)
})
