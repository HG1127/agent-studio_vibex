// Pure S1 contract tests. All records below are synthetic in-memory values,
// including receipt-shaped metadata. No SQL, DB fixture, server or provider.
import test from 'node:test'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {safeAgentSpec} from '../src/contracts.ts'
import {agentReviewFees,parseAgentReviewPreview,parseAgentReviewSubmission,agentReviewRoleCandidate} from '../src/agent-review-contract.ts'
import {agentAssessmentOutputHash} from '../src/agent-assessment-contract.ts'
import {parseAgentGeneratedAcceptance,agentGeneratedCandidateHash} from '../src/agent-generated-acceptance-contract.ts'
import {agentDescriptivePatchKeys as D,agentDescriptivePatchFamily,agentDescriptivePatchAcknowledgement,
  deriveAgentDescriptivePatchCandidate,createAgentDescriptivePatchPreview,parseAgentDescriptivePatchPreviewInput,
  parseAgentDescriptivePatchPreview,parseAgentDescriptivePatchAcceptance,freezeAgentDescriptivePatchOriginal,
  parseAgentDescriptivePatchReceipt,agentDescriptivePatchModelHash,agentDescriptivePatchCandidateHash,
  agentDescriptivePatchFeedbackHash,agentDescriptivePatchPreviewHash,agentDescriptivePatchRequestHash,
  agentDescriptivePatchReceiptHash} from '../src/agent-descriptive-patch-contract.ts'

const clone=v=>structuredClone(v),id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0'),h=c=>c.repeat(64)
// Independent canonical JSON/SHA, not the contract's canonical/hash helpers.
const canonical=v=>Array.isArray(v)?'['+v.map(canonical).join(',')+']':v&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}':JSON.stringify(v)
const hash=v=>createHash('sha256').update(canonical(v),'utf8').digest('hex')
const equal=(actual,expected,message)=>assert.equal(canonical(actual),canonical(expected),message)
const invalid=e=>e.status===400&&e.code==='invalid_agent_descriptive_patch_request'
const unavailable=e=>e.status===409&&e.code==='agent_descriptive_patch_unavailable'
const noChange=e=>e.status===409&&e.code==='agent_descriptive_patch_change_required'
const name='Synthetic retained name'
const before=()=>safeAgentSpec({goal:'旧目标😀',task_scope:'原范围',deliverables:['既有交付'],task_plan:['原计划'],done_criteria:['原验收'],
  tools:['summarize','knowledge_search','http_review','mcp_review'],knowledge_base_ids:[id(7)],
  knowledge_retrieval:{mode:'hybrid',profile_id:id(8),profile_revision:2,consent_revision:3},
  http_tools:[{name:'http_review',description:'synthetic binding reference only',connection_id:id(5),connection_revision:6}],
  mcp_tools:[{name:'mcp_review',connection_id:id(6),connection_revision:7,tool_name:'synthetic_review',catalog_sha256:h('d')}],
  model_binding:{connection_id:id(40),connection_revision:7,model_id:'synthetic'},require_plan_review:true})
const full={goal:'新目标😀',task_scope:'边界:只改描述',deliverables:['核对'],task_plan:['实施'],done_criteria:['验收']}
const output=descriptive=>({descriptive:clone(descriptive),tools_note:'工具绑定保持原值',rationale:'依据实际反馈改进描述'})
const refs=()=>[20,21].map((n,i)=>({run_id:id(n),feedback_id:id(n+10),feedback_sha256:h(String(i+2)),feedback_revision:i+2,feedback_source_sha256:h(String(i+3)),statement_sha256:h(String(i+4))}))

function fixture(descriptive={goal:full.goal,deliverables:[]}){
  const spec=before(),feedback_sources=refs(),result=output(descriptive),input_sha256=h('b'),content_sha256=h('c'),review=id(1)
  const choice=parseAgentReviewPreview({action:'preview',purpose:'optimize',spec_id:id(2),run_id:id(10),expected_source_sha256:h('a'),expected_spec_revision:41,expected_spec_sha256:h('6'),model_binding:spec.model_binding,output_token_limit:2048,
    feedback_sources:feedback_sources.map(({run_id,feedback_id,feedback_sha256})=>({run_id,feedback_id,feedback_sha256})),evaluation_sources:[]})
  const submission=parseAgentReviewSubmission({...choice,action:'submit',request_id:review,expected_input_sha256:input_sha256,confirm:true,fee_acknowledgement:agentReviewFees.optimize})
  const result_sha256=agentAssessmentOutputHash(review,'optimize',input_sha256,result)
  const completion_sha256=hash({protocol:'agent_paid_review_completion_v1',request_id:review,effect_id:id(70),completion:{status:'succeeded',result}})
  return {anchor:{protocol:'agent_paid_review_read_anchor_v1',request_id:review,spec_id:id(2),run_id:id(10),purpose:'optimize',request_sha256:submission.request_sha256,input_sha256,content_sha256,owner_epoch:5,source_protocol:'employee_statement_anchor_v1',created_at:'2026-10-27T01:00:00.000Z',job_state:'pending',lease_state:'succeeded',outcome:{status:'succeeded',completion_sha256,result_sha256,failure_code:null,created_at:'2026-10-27T01:01:00.000Z'},body_erased:false,choice},
    body:{request_id:review,purpose:'optimize',input_sha256,result_sha256,result},
    role:{id:id(2),name,spec,revision:41,source_sha256:h('6'),requires_approval:true},feedback_sources,
    current:{owner_epoch:5,source_protocol:'employee_statement_anchor_v1',input_sha256,content_sha256,choice:clone(choice)}}
}
const input=()=>({action:'preview',review_id:id(1),spec_id:id(2),target_run_id:id(10)})
const binding=p=>{const {protocol,preview_sha256,recorded,...value}=clone(p);return value}
const reseal=p=>({...p,preview_sha256:agentDescriptivePatchPreviewHash(binding(p))})
function original(p=createAgentDescriptivePatchPreview(fixture())){
  return {action:'accept',request_id:id(99),review_id:p.source.review_id,spec_id:p.source.spec_id,target_run_id:p.source.target_run_id,anchor_run_id:p.anchor.run_id,anchor_feedback_id:p.anchor.feedback_id,
    expected_preview_sha256:p.preview_sha256,expected_result_sha256:p.source.result_sha256,expected_patch_sha256:p.model_patch.patch_sha256,expected_spec_revision:p.before.revision,expected_spec_sha256:p.before.source_sha256,expected_candidate_sha256:p.candidate.candidate_sha256,confirm:true,acceptance_acknowledgement:agentDescriptivePatchAcknowledgement}
}
function receiptCore(p=createAgentDescriptivePatchPreview(fixture()),q=original(p)){
  return {protocol:'agent_descriptive_patch_receipt_v1',source_kind:p.source_kind,mode:p.mode,request_id:q.request_id,request_sha256:agentDescriptivePatchRequestHash(q),source:clone(p.source),feedback_sources:clone(p.feedback_sources),feedback_sources_sha256:p.feedback_sources_sha256,anchor:clone(p.anchor),
    before:{revision:p.before.revision,source_sha256:p.before.source_sha256,revision_id:id(90)},after:{revision:p.before.revision+1,source_sha256:h('7'),revision_id:id(91)},provided_keys:clone(p.model_patch.provided_keys),patch_sha256:p.model_patch.patch_sha256,candidate_sha256:p.candidate.candidate_sha256,changed_keys:clone(p.changed_keys),preview_sha256:p.preview_sha256,acceptance_owner_epoch:p.source.source_owner_epoch,created_at:'2026-10-27T01:02:03.123Z'}
}
const receipt=(core=receiptCore(),replayed=false)=>({...clone(core),receipt_sha256:agentDescriptivePatchReceiptHash(core),recorded:true,replayed})

test('every nonempty provided subset including full5 overlays only actual keys and preserves every protected byte',()=>{
  for(let mask=1;mask<32;mask++){
    const supplied=Object.fromEntries(D.filter((_,i)=>mask&(1<<i)).map(k=>[k,full[k]])),current=before(),saved=clone(current),result=output(supplied)
    const derived=deriveAgentDescriptivePatchCandidate(name,current,result),keys=D.filter(k=>Object.hasOwn(supplied,k))
    equal(derived.model_patch.provided_keys,keys);equal(derived.changed_keys,keys)
    equal(derived.model_patch.descriptive,supplied);equal(derived.spec,{...current,...supplied});equal(current,saved)
    equal(derived.spec,agentReviewRoleCandidate(current,result))
    for(const k of Object.keys(current))if(!D.includes(k))equal(derived.spec[k],current[k],k)
    for(const k of D)if(!Object.hasOwn(supplied,k))equal(derived.spec[k],current[k],'omitted '+k)
    assert.equal(derived.optimization_candidate_sha256,hash({protocol:'agent_feedback_role_candidate_v1',name,spec:derived.spec}))
    assert.notEqual(derived.candidate_sha256,derived.optimization_candidate_sha256)
    const preview=createAgentDescriptivePatchPreview(fixture(supplied))
    equal(preview.model_patch.provided_keys,keys);equal(preview.model_patch.descriptive,supplied)
    assert.equal(preview.recorded,false);assert.equal(preview.source.purpose,'optimize')
  }
})

test('provided and changed are distinct; inherited text is never redacted or attributed as generated',()=>{
  const current=before();current.task_scope='Keep api_key=synthetic_private_marker in inherited source'
  const derived=deriveAgentDescriptivePatchCandidate(name,current,output({goal:current.goal,done_criteria:[]}))
  equal(derived.model_patch.provided_keys,['goal','done_criteria']);equal(derived.changed_keys,['done_criteria'])
  assert.equal(derived.spec.task_scope,current.task_scope)
  assert.equal(Object.hasOwn(derived.model_patch.descriptive,'task_scope'),false)
  const cleared=deriveAgentDescriptivePatchCandidate(name,before(),output({task_scope:'',deliverables:[],task_plan:[''],done_criteria:[]}))
  assert.equal(cleared.spec.task_scope,'');equal(cleared.spec.deliverables,[]);equal(cleared.spec.task_plan,[''])
  assert.throws(()=>deriveAgentDescriptivePatchCandidate(name,before(),output({goal:before().goal})),noChange)
  assert.throws(()=>deriveAgentDescriptivePatchCandidate(name,before(),output({goal:''})),invalid)
  assert.throws(()=>deriveAgentDescriptivePatchCandidate(name,before(),output({})),invalid)
})

test('existing UTF16 and list limits include capacity boundaries and reject lossy normalization',()=>{
  const capacity={goal:'界'.repeat(3000),task_scope:'😀'.repeat(2000),deliverables:Array(30).fill('交'.repeat(500)),task_plan:Array(30).fill('计'.repeat(500)),done_criteria:Array(30).fill('验'.repeat(500))}
  equal(deriveAgentDescriptivePatchCandidate(name,before(),output(capacity)).model_patch.descriptive,capacity)
  const p=createAgentDescriptivePatchPreview(fixture(capacity));equal(parseAgentDescriptivePatchPreview(p).candidate.descriptive,capacity)
  for(const patch of [{goal:capacity.goal+'x'},{task_scope:capacity.task_scope+'x'},{deliverables:Array(31).fill('x')},{task_plan:['x'.repeat(501)]},{done_criteria:[null]},{goal:null},{goal:42},{task_scope:false},
    {goal:' trimmed'},{goal:'trimmed '},{goal:'a\0b'},{goal:'a\u0001b'},{goal:'a\u007fb'},{goal:'\ud800'},{deliverables:['\udfff']}])assert.throws(()=>deriveAgentDescriptivePatchCandidate(name,before(),output(patch)),invalid)
  for(const result of [{...output({goal:'new'}),rationale:''},{...output({goal:'new'}),tools_note:' x '},{...output({goal:'new'}),rationale:'x'.repeat(401)}])assert.throws(()=>deriveAgentDescriptivePatchCandidate(name,before(),result),invalid)
  for(const invalidName of [' renamed ','','x'.repeat(121),null])assert.throws(()=>deriveAgentDescriptivePatchCandidate(invalidName,before(),output({goal:'new'})),invalid)
})

test('closed model output rejects protected/client attribution fields, unsafe descriptors and non-JSON shapes without invoking getters',()=>{
  for(const key of ['name','tools','knowledge_base_ids','model_binding','http_tools','mcp_tools','require_approval','require_plan_review','selected_keys','human_patch','source_kind','mode']){
    assert.throws(()=>deriveAgentDescriptivePatchCandidate(name,before(),{...output({goal:'new'}),[key]:true}),invalid)
    assert.throws(()=>deriveAgentDescriptivePatchCandidate(name,before(),output({goal:'new',[key]:true})),invalid)
  }
  let invoked=0;const accessor={};Object.defineProperty(accessor,'goal',{enumerable:true,get(){invoked++;return 'new'}})
  const hidden={goal:'new'};Object.defineProperty(hidden,'hidden',{value:'x'})
  const arrayGetter=[];Object.defineProperty(arrayGetter,'0',{enumerable:true,get(){invoked++;return 'new'}})
  const extraArray=['new'];extraArray.extra=true
  for(const raw of [accessor,hidden,{goal:'new',[Symbol('hidden')]:1},Object.create({goal:'new'}),new Date(),{goal:undefined},{goal:()=>1},{deliverables:new Array(1)},{deliverables:arrayGetter},{deliverables:extraArray}])assert.throws(()=>agentDescriptivePatchModelHash(raw),invalid)
  assert.equal(invoked,0)
  const np=Object.assign(Object.create(null),{goal:'new'});assert.equal(agentDescriptivePatchModelHash(np),agentDescriptivePatchModelHash({goal:'new'}))
})

test('current full spec is already canonical and protected fields cannot be silently repaired or dropped',()=>{
  for(const mutate of [s=>{s.require_approval=false},s=>{delete s.require_approval},s=>{delete s.deliverables},s=>{s.goal=' old '},s=>{s.tools.push('summarize')},s=>{s.tools=['unsupported']},s=>{s.unknown=true},s=>{s.model_binding.api_key='forbidden'},s=>{s.http_tools[0].connection_revision=-0},s=>{s.mcp_tools[0].catalog_sha256='bad'},s=>{s.knowledge_base_ids=[]}]){
    const current=before();mutate(current);assert.throws(()=>deriveAgentDescriptivePatchCandidate(name,current,output({goal:'new'})),invalid)
  }
  const current=before(),result=deriveAgentDescriptivePatchCandidate(name,current,output({deliverables:['new']}))
  result.spec.http_tools[0].description='caller mutation';result.spec.mcp_tools[0].tool_name='changed';result.spec.knowledge_base_ids[0]=id(999)
  assert.equal(current.http_tools[0].description,'synthetic binding reference only');assert.equal(current.mcp_tools[0].tool_name,'synthetic_review');assert.equal(current.knowledge_base_ids[0],id(7))
})

test('source preview binds actual review choice/output, feedback refs, epoch and current revision without accepting priors',()=>{
  const f=fixture(),saved=clone(f),p=createAgentDescriptivePatchPreview(f)
  equal(f,saved);equal(p.source,{purpose:'optimize',review_id:f.anchor.request_id,spec_id:f.anchor.spec_id,target_run_id:f.anchor.run_id,review_request_sha256:f.anchor.request_sha256,input_sha256:f.body.input_sha256,content_sha256:f.anchor.content_sha256,result_sha256:f.body.result_sha256,completion_sha256:f.anchor.outcome.completion_sha256,source_owner_epoch:5,source_protocol:'employee_statement_anchor_v1'})
  assert.notEqual(p.source.target_run_id,p.anchor.run_id);equal(p.anchor,{run_id:id(20),feedback_id:id(30)})
  assert.equal(p.candidate.descriptive.task_scope,f.role.spec.task_scope);assert.equal(Object.hasOwn(p.model_patch.descriptive,'task_scope'),false)
  for(const mutate of [
    v=>{v.current.owner_epoch++},v=>{v.current.source_protocol='current_task_delivery_v1'},v=>{v.current.input_sha256=h('f')},v=>{v.current.content_sha256=h('f')},v=>{v.current.choice.expected_source_sha256=h('f')},v=>{v.current.choice.model_binding.connection_revision++},
    v=>{v.role.id=id(999)},v=>{v.role.revision++},v=>{v.role.source_sha256=h('f')},v=>{v.role.requires_approval=false},v=>{v.role.spec.require_approval=false},
    v=>{v.body.request_id=id(999)},v=>{v.body.purpose='evaluate'},v=>{v.body.input_sha256=h('f')},v=>{v.body.result.descriptive.goal='tampered'},v=>{v.body.result_sha256=h('f')},v=>{v.anchor.outcome.result_sha256=h('f')},
    v=>{v.anchor.request_sha256=h('f')},v=>{v.anchor.source_protocol='current_task_delivery_v1'},v=>{v.anchor.purpose='evaluate'},v=>{v.anchor.job_state='cancelled';v.anchor.choice=null},v=>{v.anchor.job_state='erased';v.anchor.body_erased=true;v.anchor.choice=null},v=>{v.anchor.lease_state='reserved'},v=>{v.anchor.outcome=null;v.anchor.choice=null},
    v=>{v.anchor.choice.evaluation_sources=[{run_id:id(80),review_id:id(81),result_sha256:h('e')}]},v=>{v.anchor.choice.feedback_sources=[]},
    v=>{v.feedback_sources[0].feedback_sha256=h('f')},v=>{v.feedback_sources[0].feedback_id=id(999)},v=>{v.feedback_sources.reverse()},v=>{v.feedback_sources=[]},v=>{v.feedback_sources.push(clone(v.feedback_sources[0]))},v=>{v.feedback_sources[0].owner=id(999)},
    v=>{v.owner_user_id=id(999)},v=>{v.selected_keys=['goal']},v=>{v.result=output({goal:'client'})}
  ]){const value=fixture();mutate(value);assert.throws(()=>createAgentDescriptivePatchPreview(value),unavailable)}
  assert.throws(()=>createAgentDescriptivePatchPreview(fixture({goal:before().goal})),noChange)
})

test('public preview is closed, internally rederives the exact partial merge and never silently seals tampered origin keys',()=>{
  const p=createAgentDescriptivePatchPreview(fixture({goal:full.goal,task_plan:before().task_plan}))
  equal(parseAgentDescriptivePatchPreviewInput(input()),input());equal(parseAgentDescriptivePatchPreview(p,input()),p)
  equal(p.model_patch.provided_keys,['goal','task_plan']);equal(p.changed_keys,['goal'])
  for(const patch of [{recorded:true},{available:true},{messages:[]},{protocol:'agent_generated_preview_v1'},{source_kind:'generated_opinion'},{mode:'selected_fields'},{preview_sha256:h('f')},{feedback_sources_sha256:h('f')},{changed_keys:['goal','task_plan']},{changed_keys:[]},{changed_keys:['task_plan','goal']},{changed_keys:['goal','goal']},{anchor:{run_id:id(21),feedback_id:id(31)}}])assert.throws(()=>parseAgentDescriptivePatchPreview({...clone(p),...patch}),unavailable)
  for(const mutate of [
    v=>{v.model_patch.provided_keys=['goal']},v=>{v.model_patch.provided_keys=['task_plan','goal']},v=>{v.model_patch.descriptive.task_scope='invented'},v=>{v.model_patch.patch_sha256=h('f')},v=>{v.candidate.descriptive.task_scope='edited inherited'},v=>{delete v.candidate.descriptive.deliverables},v=>{v.before.descriptive.tools=[]},v=>{v.source.purpose='evaluate'},v=>{v.source.owner=id(999)}
  ]){const value=clone(p);mutate(value);assert.throws(()=>parseAgentDescriptivePatchPreview(value),unavailable);assert.throws(()=>reseal(value),invalid)}
  assert.throws(()=>parseAgentDescriptivePatchPreview(p,{...input(),target_run_id:id(999)}),unavailable)
  for(const extra of [{owner:id(1)},{selected_keys:['goal']},{result:{}}])assert.throws(()=>parseAgentDescriptivePatchPreviewInput({...input(),...extra}),invalid)
  const detached=parseAgentDescriptivePatchPreview(p);detached.candidate.descriptive.deliverables.push('caller');detached.feedback_sources[0].statement_sha256=h('f')
  assert.equal(p.candidate.descriptive.deliverables.length,1);assert.notEqual(p.feedback_sources[0].statement_sha256,h('f'))
})

test('canonical refs require unique sorted actual run/feedback1..8 metadata; new hash domain is independent',()=>{
  const rows=refs();assert.equal(agentDescriptivePatchFeedbackHash(rows),hash({protocol:'agent_descriptive_patch_feedback_v1',sources:rows}))
  for(const value of [[],rows.toReversed(),[rows[0],rows[0]],Array(9).fill(rows[0]),[{...rows[0],feedback_revision:1.5}],[{...rows[0],feedback_source_sha256:'bad'}],[{...rows[0],feedback_revision:Number.MAX_SAFE_INTEGER}], [{...rows[0],statement:'private'}], [rows[0],{...rows[1],feedback_id:rows[0].feedback_id}]])assert.throws(()=>agentDescriptivePatchFeedbackHash(value),invalid)
  const eight=Array.from({length:8},(_,i)=>({...rows[0],run_id:id(100+i),feedback_id:id(200+i)}));assert.match(agentDescriptivePatchFeedbackHash(eight),/^[a-f0-9]{64}$/)
})

test('exact15 acceptance uses independent configuration consent and freezes one detached immutable original',()=>{
  const raw=original(),frozen=freezeAgentDescriptivePatchOriginal(raw);equal(parseAgentDescriptivePatchAcceptance(raw),raw)
  assert.equal(Object.keys(frozen).length,15);assert.equal(Object.isFrozen(frozen),true);assert.equal(Object.hasOwn(frozen,'request_sha256'),false)
  raw.request_id=id(98);assert.equal(frozen.request_id,id(99));assert.throws(()=>{frozen.request_id=id(97)},TypeError)
  for(const patch of [{action:'submit'},{confirm:false},{confirm:'true'},{acceptance_acknowledgement:agentReviewFees.optimize},{acceptance_acknowledgement:'APPROVE_EXACT_GENERATED_DESCRIPTIVE_ROLE_CHANGE_V1'},
    {request_id:id(1)},{request_id:id(30)},{expected_patch_sha256:'A'.repeat(64)},{expected_spec_revision:'41'},{expected_spec_revision:0},{expected_spec_revision:1.5},{expected_spec_revision:Number.MAX_SAFE_INTEGER},
    {owner_user_id:id(99)},{selected_keys:['goal']},{human_patch:{goal:'x'}},{result:{}},{name:'x'},{spec:before()},{request_sha256:h('f')},{mode:'provided_fields'},{fee_acknowledgement:agentReviewFees.optimize}])assert.throws(()=>parseAgentDescriptivePatchAcceptance({...original(),...patch}),invalid)
  const uppercase={...original(),request_id:'ffffffff-ffff-4fff-8fff-ffffffffffff'.toUpperCase()};assert.throws(()=>parseAgentDescriptivePatchAcceptance(uppercase),invalid)
  const max={...original(),expected_spec_revision:Number.MAX_SAFE_INTEGER-2};assert.equal(parseAgentDescriptivePatchAcceptance(max).expected_spec_revision,Number.MAX_SAFE_INTEGER-2)
  for(const field of ['request_id','review_id','spec_id','target_run_id','anchor_run_id','anchor_feedback_id','expected_preview_sha256','expected_result_sha256','expected_patch_sha256','expected_spec_revision','expected_spec_sha256','expected_candidate_sha256']){
    const value=original();value[field]=field==='expected_spec_revision'?42:field.endsWith('_id')?id(888):h('f');assert.notEqual(agentDescriptivePatchRequestHash(value),agentDescriptivePatchRequestHash(original()),field)
  }
})

test('new family does not widen old059 acceptance or relabel full5 as its old candidate domain',()=>{
  const q=original();assert.throws(()=>parseAgentGeneratedAcceptance(q),e=>e.status===400)
  const {expected_patch_sha256,...old}=q;old.acceptance_acknowledgement='APPROVE_EXACT_GENERATED_DESCRIPTIVE_ROLE_CHANGE_V1';assert.equal(Object.keys(parseAgentGeneratedAcceptance(old)).length,14)
  assert.throws(()=>parseAgentDescriptivePatchAcceptance(old),invalid)
  const candidate=deriveAgentDescriptivePatchCandidate(name,before(),output(full))
  assert.notEqual(candidate.candidate_sha256,agentGeneratedCandidateHash(name,candidate.spec))
  assert.equal(agentDescriptivePatchFamily,'agent_descriptive_patch_v1')
})

test('receipt DTO validates historical metadata only, survives detached source erasure and hashes replay independently of observation',()=>{
  const f=fixture(),p=createAgentDescriptivePatchPreview(f),q=freezeAgentDescriptivePatchOriginal(original(p)),core=receiptCore(p,q)
  equal(parseAgentDescriptivePatchReceipt(receipt(core),q),receipt(core));equal(parseAgentDescriptivePatchReceipt(receipt(core,true),q),receipt(core,true))
  assert.equal(receipt(core).receipt_sha256,receipt(core,true).receipt_sha256)
  f.body=null;f.anchor.choice=null;f.feedback_sources=[];f.role.spec.goal='a later role';f.current.owner_epoch=999
  // In-memory coherence only: no database event is proven by these hashes.
  assert.equal(parseAgentDescriptivePatchReceipt(receipt(core,true),q).after.revision,42)
  assert.equal(Object.keys(core).length,18);assert.equal(Object.keys(receipt(core)).length,21)
  for(const key of ['result','body','descriptive','spec','messages','feedback_text','input','tools_note','rationale'])assert.equal(Object.hasOwn(core,key),false)
  assert.throws(()=>agentDescriptivePatchReceiptHash(receipt(core)),invalid)
  const parsed=parseAgentDescriptivePatchReceipt(receipt(core));parsed.feedback_sources[0].feedback_revision=99;parsed.provided_keys.push('task_scope')
  assert.equal(core.feedback_sources[0].feedback_revision,2);equal(core.provided_keys,['goal','deliverables'])
})

test('receipt rejects impossible history, forged expectation, raw content and noncanonical metadata even when resealed',()=>{
  const core=receiptCore(),q=original()
  for(const mutate of [v=>{v.after.revision++},v=>{v.after.revision_id=v.before.revision_id},v=>{v.after.source_sha256=v.before.source_sha256},v=>{v.acceptance_owner_epoch++},v=>{v.request_id=v.source.review_id},v=>{v.request_id=v.feedback_sources[1].feedback_id},v=>{v.changed_keys=['task_scope']},v=>{v.changed_keys=[]},v=>{v.provided_keys=['deliverables','goal']},v=>{v.provided_keys=['goal','goal']},v=>{v.anchor={run_id:id(21),feedback_id:id(31)}},v=>{v.feedback_sources.reverse()},v=>{v.created_at='2026-02-30T01:02:03.123Z'},v=>{v.created_at='0000-01-01T00:00:00.000Z'},v=>{v.created_at='2026-10-27T01:02:03Z'},v=>{v.result={private:'raw'}},v=>{v.source.purpose='evaluate'}]){
    const value=clone(core);mutate(value);assert.throws(()=>agentDescriptivePatchReceiptHash(value),invalid)
    assert.throws(()=>parseAgentDescriptivePatchReceipt({...value,receipt_sha256:h('f'),recorded:true,replayed:true}),unavailable)
  }
  for(const field of ['request_id','request_sha256','candidate_sha256','patch_sha256','preview_sha256']){
    const value=clone(core);value[field]=field==='request_id'?id(98):h('f');assert.throws(()=>parseAgentDescriptivePatchReceipt(receipt(value),q),unavailable,field)
  }
  for(const mutate of [v=>{v.source.result_sha256=h('f')},v=>{v.source.review_id=id(98)},v=>{v.source.spec_id=id(98)},v=>{v.source.target_run_id=id(98)},v=>{v.before.source_sha256=h('f')},v=>{v.before.revision=40;v.after.revision=41},v=>{v.anchor.run_id=v.feedback_sources[0].run_id=id(19)}]){
    const value=clone(core);mutate(value);value.feedback_sources_sha256=agentDescriptivePatchFeedbackHash(value.feedback_sources);assert.throws(()=>parseAgentDescriptivePatchReceipt(receipt(value),q),unavailable)
  }
  for(const patch of [{recorded:false},{replayed:'true'},{receipt_sha256:h('f')},{role_current:true},{raw_output:{}}])assert.throws(()=>parseAgentDescriptivePatchReceipt({...receipt(core),...patch}),unavailable)
})

test('all six independent domains match reference hashing and are stable across property insertion order and Unicode',()=>{
  const f=fixture(),p=createAgentDescriptivePatchPreview(f),q=original(p),c=receiptCore(p,q),derived=deriveAgentDescriptivePatchCandidate(name,f.role.spec,f.body.result)
  const actual={patch:agentDescriptivePatchModelHash(f.body.result.descriptive),candidate:derived.candidate_sha256,feedback:p.feedback_sources_sha256,preview:p.preview_sha256,request:agentDescriptivePatchRequestHash(q),receipt:agentDescriptivePatchReceiptHash(c)}
  const expected={patch:hash({protocol:'agent_descriptive_patch_model_v1',provided_keys:['goal','deliverables'],descriptive:f.body.result.descriptive}),candidate:hash({protocol:'agent_descriptive_patch_candidate_v1',name,spec:derived.spec}),feedback:hash({protocol:'agent_descriptive_patch_feedback_v1',sources:p.feedback_sources}),preview:hash({protocol:'agent_descriptive_patch_preview_binding_v1',...binding(p)}),request:hash({protocol:'agent_descriptive_patch_accept_intent_v1',...q}),receipt:hash(c)}
  equal(actual,expected)
  equal(actual,{patch:'380cf5cb7a883d41f1b895a34208034224deca473196252a701141b456c74a51',candidate:'a3fce3ecd6ddcb8002b57a8d58c11b019df64a1bb5932ff7f0b69c54b4ed7a90',feedback:'1d10b4aed5d64cacce85760b826f2eb4aee9aaab9530af766761aa2ed1937eb8',preview:'3be7e2146f6394a6eb2fed0e4e31e608a1cc7e5b0c4be6a0f8282c31ee714997',request:'6599280ee5e75b096e53f8de31f6a72c275bd6ae00587f959a8542464d5c825f',receipt:'4eb3c80c53553ec8dffd79ae7b832ab250cbc841191a218c531b8583423b6cb9'})
  const reversed=Object.fromEntries(Object.entries(f.body.result.descriptive).reverse());assert.equal(agentDescriptivePatchModelHash(reversed),actual.patch)
  assert.equal(agentDescriptivePatchCandidateHash(name,Object.fromEntries(Object.entries(derived.spec).reverse())),actual.candidate)
  assert.equal(new Set(Object.values(actual)).size,6)
  assert.notEqual(agentDescriptivePatchModelHash({goal:'e\u0301'}),agentDescriptivePatchModelHash({goal:'é'}))
  assert.notEqual(actual.patch,hash({protocol:'agent_descriptive_patch_model_v2',provided_keys:['goal','deliverables'],descriptive:f.body.result.descriptive}))
})
