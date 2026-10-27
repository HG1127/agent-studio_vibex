import test from 'node:test'
import assert from 'node:assert/strict'
import {parseAgentReviewPreview,parseAgentReviewSubmission,agentReviewFees,agentReviewDimensions,parseAgentEvaluationOutput,parseAgentOptimizationOutput,agentReviewRoleCandidate} from '../src/agent-review-contract.ts'
import {safeAgentSpec} from '../src/contracts.ts'
const id=n=>`${String(n).repeat(8)}-${String(n).repeat(4)}-4${String(n).repeat(3)}-8${String(n).repeat(3)}-${String(n).repeat(12)}`
const base={action:'preview',purpose:'evaluate',spec_id:id(1),run_id:id(2),expected_source_sha256:'a'.repeat(64),expected_spec_revision:3,expected_spec_sha256:'b'.repeat(64),model_binding:{connection_id:id(3),connection_revision:4,model_id:'synthetic-review'},output_token_limit:2048,feedback_sources:[],evaluation_sources:[]}
const submission=(preview=base)=>({...preview,action:'submit',request_id:id(4),expected_input_sha256:'c'.repeat(64),confirm:true,fee_acknowledgement:agentReviewFees[preview.purpose]})
test('paid review contract separates readonly material preview from one exact purpose/model/input/fee-confirmed request',()=>{
  assert.deepEqual(parseAgentReviewPreview(base),base);const value=parseAgentReviewSubmission(submission());assert.match(value.request_sha256,/^[a-f0-9]{64}$/)
  for(const patch of [{confirm:false},{fee_acknowledgement:agentReviewFees.optimize},{model_binding:{...base.model_binding,connection_revision:5}},{expected_input_sha256:'d'.repeat(64)},{output_token_limit:4096}]){
    if(Object.hasOwn(patch,'confirm')||Object.hasOwn(patch,'fee_acknowledgement'))assert.throws(()=>parseAgentReviewSubmission({...submission(),...patch}))
    else assert.notEqual(parseAgentReviewSubmission({...submission(),...patch}).request_sha256,value.request_sha256)
  }
  for(const patch of [{owner_user_id:id(5)},{paid_approved:true},{autonomous_approved:true},{role_acceptance_approved:true},{request_sha256:'f'.repeat(64)}])assert.throws(()=>parseAgentReviewSubmission({...submission(),...patch}))
})
test('optimization requires explicitly bounded feedback or prior evaluation generations, never unfiltered history or objective self-evaluation from opinions',()=>{
  assert.throws(()=>parseAgentReviewPreview({...base,purpose:'optimize'}))
  const feedback={run_id:id(2),feedback_id:id(5),feedback_sha256:'e'.repeat(64)},evaluation={run_id:id(6),review_id:id(7),result_sha256:'f'.repeat(64)}
  const selected={...base,purpose:'optimize',feedback_sources:[feedback],evaluation_sources:[evaluation]};assert.deepEqual(parseAgentReviewPreview(selected),selected)
  const evaluationOnly={...selected,feedback_sources:[]};assert.equal(parseAgentReviewPreview(evaluationOnly).evaluation_sources.length,1)
  for(const patch of [{feedback_sources:[feedback,feedback]},{feedback_sources:[{...feedback,owner_user_id:id(8)}]},{evaluation_sources:[evaluation,evaluation]},{feedback_sources:new Array(1)},{output_token_limit:32768},{output_token_limit:'2048'}])assert.throws(()=>parseAgentReviewPreview({...selected,...patch}))
  assert.throws(()=>parseAgentReviewPreview({...base,feedback_sources:[feedback]}));assert.throws(()=>parseAgentReviewSubmission({...submission(selected),request_id:feedback.feedback_id}))
  const sparse=new Array(1);sparse.extra=feedback;assert.throws(()=>parseAgentReviewPreview({...selected,feedback_sources:sparse}))
  assert.notEqual(parseAgentReviewSubmission(submission(selected)).request_sha256,parseAgentReviewSubmission(submission({...selected,feedback_sources:[{...feedback,feedback_sha256:'a'.repeat(64)}]})).request_sha256)
})
test('review output preserves real zero scores, exact five dimensions and bounded opinion fields without loose coercion, rule blending or invented proof',()=>{
  const output={score:0,dimensions:agentReviewDimensions.map(name=>({name,score:0,comment:'尚无足够依据'})),suggestions:['补充可核对的交付物']};assert.deepEqual(parseAgentEvaluationOutput(output),output)
  for(const patch of [{score:-1},{score:101},{score:'0'},{score:0.1},{dimensions:output.dimensions.slice(1)},{dimensions:[...output.dimensions.slice(1),output.dimensions[0]]},{mode:'llm'},{engine_succeeded:true},{suggestions:['x'.repeat(201)]},{suggestions:new Array(1)}])assert.throws(()=>parseAgentEvaluationOutput({...output,...patch}))
  assert.equal(parseAgentEvaluationOutput({...output,suggestions:['token=syntheticPrivate']} ).suggestions[0],'token=***')
})
test('generated optimization is a bounded descriptive patch only; provider text cannot select identities, tools, resources, approval or lineage',()=>{
  const output={descriptive:{goal:'新的完整目标',done_criteria:['核对依据']},tools_note:'建议由本人核对工具设置。',rationale:'基于所选反馈改进。'};assert.deepEqual(parseAgentOptimizationOutput(output),output)
  for(const key of ['owner_user_id','model_binding','http_tools','mcp_tools','knowledge_base_ids','require_approval','require_plan_review','accepted_revision_id','request_id'])assert.throws(()=>parseAgentOptimizationOutput({...output,descriptive:{...output.descriptive,[key]:true}}))
  for(const patch of [{descriptive:{}},{descriptive:{goal:''}},{descriptive:{goal:'x'.repeat(3001)}},{descriptive:{task_scope:'x'.repeat(4001)}},{descriptive:{deliverables:Array(31).fill('x')}},{rationale:''},{private_result:'hidden'}])assert.throws(()=>parseAgentOptimizationOutput({...output,...patch}))
})
test('review candidates preserve complete current private resource fields and full role capacity, force approval and remain unaccepted without side effects',()=>{
  const before=safeAgentSpec({goal:'合'.repeat(3000),task_scope:'范'.repeat(4000),deliverables:Array(30).fill('交'.repeat(500)),task_plan:Array(30).fill('计'.repeat(500)),done_criteria:Array(30).fill('验'.repeat(500)),tools:['summarize','knowledge_search','http_review','mcp_review'],knowledge_base_ids:[id(7)],knowledge_retrieval:{mode:'hybrid',profile_id:id(8),profile_revision:2,consent_revision:3},http_tools:[{name:'http_review',description:'synthetic binding reference only',connection_id:id(5),connection_revision:6}],mcp_tools:[{name:'mcp_review',connection_id:id(6),connection_revision:7,tool_name:'synthetic_review',catalog_sha256:'d'.repeat(64)}],model_binding:base.model_binding,require_plan_review:true})
  const frozen=structuredClone(before),next=agentReviewRoleCandidate(before,{descriptive:{goal:'需要本人确认的建议'},tools_note:'不得直接变更工具授权。',rationale:'保留完整原角色。'})
  assert.deepEqual(before,frozen);assert.equal(next.goal,'需要本人确认的建议');for(const key of Object.keys(before).filter(k=>k!=='goal'))assert.deepEqual(next[key],before[key]);assert.equal(next.require_approval,true)
  assert.throws(()=>agentReviewRoleCandidate({...before,unrecognized:true},{descriptive:{goal:'new'},tools_note:'',rationale:'reason'}))
})
test('review contract refuses accessor fields, symbols, invalid model references, malformed Unicode and hidden confirmations before any transport exists',()=>{
  assert.throws(()=>parseAgentReviewPreview({...base,model_binding:{...base.model_binding,endpoint:'https://foreign.invalid'}}))
  assert.throws(()=>parseAgentReviewPreview({...base,model_binding:null}));assert.throws(()=>parseAgentReviewPreview({...base,[Symbol('hidden')]:true}))
  const access={...base};Object.defineProperty(access,'purpose',{get(){throw Error('getter invoked')},enumerable:true});assert.throws(()=>parseAgentReviewPreview(access),error=>error.code==='invalid_agent_review_request'||error.message==='invalid_agent_review_request')
  for(const text of ['\ud800','\u0000'])assert.throws(()=>parseAgentOptimizationOutput({descriptive:{goal:text},tools_note:'',rationale:'reason'}))
})
