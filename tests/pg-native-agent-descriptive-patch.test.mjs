// Pure browser/server DTO interoperability. Synthetic metadata is not an SQL
// receipt, authenticated provenance or evidence that an employee accepted it.
import test from 'node:test'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import * as browser from '../src/lib/pgNativeAgentDescriptivePatch.ts'
import * as server from '../services/pg-api/src/agent-descriptive-patch-contract.ts'
import {safeAgentSpec} from '../services/pg-api/src/contracts.ts'
import {agentGeneratedPreview,agentGeneratedReceipt} from '../src/lib/pgNativeAgentGeneratedAcceptance.ts'

const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0'),h=c=>c.repeat(64),copy=v=>structuredClone(v)
const D=server.agentDescriptivePatchKeys,full={goal:'新目标😀',task_scope:'新范围',deliverables:['新交付'],task_plan:['新计划'],done_criteria:['新验收']}
const canonical=v=>Array.isArray(v)?'['+v.map(canonical).join(',')+']':v&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}':JSON.stringify(v)
const hash=v=>createHash('sha256').update(canonical(v)).digest('hex')
const equivalent=(a,b)=>assert.equal(canonical(a),canonical(b))
function fixture(patch={goal:full.goal},{inherited=false}={}){
 const role=safeAgentSpec({goal:'原目标😀',task_scope:inherited?'Keep api_key=synthetic_private_marker in inherited source':'原范围',deliverables:['原交付'],task_plan:['原计划'],done_criteria:['原验收'],tools:[],knowledge_base_ids:[]})
 const derived=server.deriveAgentDescriptivePatchCandidate('Synthetic retained name',role,{descriptive:patch,tools_note:'',rationale:'Synthetic DTO vector'})
 const feedback_sources=[{run_id:id(20),feedback_id:id(30),feedback_sha256:h('a'),feedback_revision:2,feedback_source_sha256:h('b'),statement_sha256:h('c')},{run_id:id(21),feedback_id:id(31),feedback_sha256:h('b'),feedback_revision:3,feedback_source_sha256:h('c'),statement_sha256:h('d')}]
 const descriptive=spec=>Object.fromEntries(D.map(k=>[k,copy(spec[k])]))
 const binding={source_kind:'feedback_generated_descriptive_patch',mode:'provided_fields',source:{purpose:'optimize',review_id:id(1),spec_id:id(2),target_run_id:id(10),review_request_sha256:h('1'),input_sha256:h('2'),content_sha256:h('3'),result_sha256:h('4'),completion_sha256:h('5'),source_owner_epoch:5,source_protocol:'employee_statement_anchor_v1'},
  feedback_sources,feedback_sources_sha256:server.agentDescriptivePatchFeedbackHash(feedback_sources),anchor:{run_id:id(20),feedback_id:id(30)},before:{revision:41,source_sha256:h('6'),descriptive:descriptive(role)},model_patch:derived.model_patch,candidate:{descriptive:descriptive(derived.spec),candidate_sha256:derived.candidate_sha256},changed_keys:derived.changed_keys}
 const preview=server.parseAgentDescriptivePatchPreview({protocol:'agent_descriptive_patch_preview_v1',...binding,preview_sha256:server.agentDescriptivePatchPreviewHash(binding),recorded:false})
 const original=server.parseAgentDescriptivePatchAcceptance({action:'accept',request_id:id(99),review_id:id(1),spec_id:id(2),target_run_id:id(10),anchor_run_id:id(20),anchor_feedback_id:id(30),expected_preview_sha256:preview.preview_sha256,expected_result_sha256:preview.source.result_sha256,expected_patch_sha256:preview.model_patch.patch_sha256,expected_spec_revision:41,expected_spec_sha256:h('6'),expected_candidate_sha256:preview.candidate.candidate_sha256,confirm:true,acceptance_acknowledgement:server.agentDescriptivePatchAcknowledgement})
 const core={protocol:'agent_descriptive_patch_receipt_v1',source_kind:binding.source_kind,mode:binding.mode,request_id:original.request_id,request_sha256:server.agentDescriptivePatchRequestHash(original),source:binding.source,feedback_sources,feedback_sources_sha256:binding.feedback_sources_sha256,anchor:binding.anchor,before:{revision:41,source_sha256:h('6'),revision_id:id(90)},after:{revision:42,source_sha256:h('7'),revision_id:id(91)},provided_keys:binding.model_patch.provided_keys,patch_sha256:binding.model_patch.patch_sha256,candidate_sha256:binding.candidate.candidate_sha256,changed_keys:binding.changed_keys,preview_sha256:preview.preview_sha256,acceptance_owner_epoch:5,created_at:'2026-10-28T01:02:03.123Z'}
 const receipt=server.parseAgentDescriptivePatchReceipt({...core,receipt_sha256:server.agentDescriptivePatchReceiptHash(core),recorded:true,replayed:false},original)
 return {preview,original,receipt,derived,target:{review_id:id(1),spec_id:id(2),target_run_id:id(10)}}
}
const resealPreview=value=>{const p=copy(value),{protocol,preview_sha256,recorded,...binding}=p;return {...p,preview_sha256:hash({protocol:'agent_descriptive_patch_preview_binding_v1',...binding})}}
const resealReceipt=value=>{const p=copy(value),{receipt_sha256,recorded,replayed,...core}=p;return {...p,receipt_sha256:hash(core)}}

test('all31 provided subsets interoperate with actual server DTOs and exact15-field originals',async()=>{
 for(let mask=1;mask<32;mask++){
  const patch=Object.fromEntries(D.filter((_,i)=>mask&(1<<i)).map(k=>[k,full[k]])),f=fixture(patch),saved=copy(f.preview)
  const p=await browser.agentDescriptivePatchPreview(f.preview,f.target),original=browser.agentDescriptivePatchOriginal(p,id(99))
  equivalent(p,f.preview);equivalent(original,f.original);assert.equal(Object.keys(original).length,15);assert.equal(Object.isFrozen(original),true)
  equivalent(server.parseAgentDescriptivePatchAcceptance(original),original)
  equivalent(await browser.agentDescriptivePatchReceipt(f.receipt,{original,target:f.target,replayed:false}),f.receipt)
  assert.equal(await browser.agentDescriptivePatchModelHash(p.model_patch.descriptive),p.model_patch.patch_sha256)
  assert.equal(await browser.agentDescriptivePatchPreviewHash(p),p.preview_sha256)
  assert.equal(await browser.agentDescriptivePatchRequestHash(original),server.agentDescriptivePatchRequestHash(original))
  assert.equal(await browser.agentDescriptivePatchReceiptHash(f.receipt),f.receipt.receipt_sha256)
  assert.notEqual(f.derived.candidate_sha256,f.derived.optimization_candidate_sha256)
  p.before.descriptive.deliverables.push('local change');equivalent(f.preview,saved)
 }
})

test('provided is distinct from changed, inherited text is preserved, and explicit empty values remain present',async()=>{
 const f=fixture({goal:'原目标😀',deliverables:[],task_plan:[''],task_scope:''},{inherited:false}),p=await browser.agentDescriptivePatchPreview(f.preview)
 equivalent(p.model_patch.provided_keys,['goal','task_scope','deliverables','task_plan']);equivalent(p.changed_keys,['task_scope','deliverables','task_plan']);assert.equal(p.model_patch.descriptive.task_scope,'');equivalent(p.candidate.descriptive.deliverables,[]);equivalent(p.candidate.descriptive.task_plan,[''])
 const inherited=fixture({goal:full.goal},{inherited:true}),v=await browser.agentDescriptivePatchPreview(inherited.preview)
 assert.equal(v.before.descriptive.task_scope,inherited.preview.before.descriptive.task_scope);assert.equal(v.candidate.descriptive.task_scope,v.before.descriptive.task_scope);assert.equal(Object.hasOwn(v.model_patch.descriptive,'task_scope'),false)
 const bad=copy(inherited.preview);bad.model_patch.descriptive.task_scope=v.before.descriptive.task_scope;bad.model_patch.provided_keys=['goal','task_scope']
 await assert.rejects(browser.agentDescriptivePatchPreview(resealPreview(bad)))
})

test('resealed previews cannot forge provided attribution, omission inheritance, actual changes, sources or family',async()=>{
 const f=fixture({goal:full.goal}),vectors=[
  p=>{p.candidate.descriptive.task_scope='forged omitted field'},p=>{p.model_patch.provided_keys=['goal','task_scope']},p=>{p.changed_keys=['goal','task_scope']},p=>{p.changed_keys=[]},p=>{p.model_patch.descriptive={}},p=>{p.model_patch.patch_sha256=h('0')},
  p=>{p.source.purpose='evaluate'},p=>{p.source.source_protocol='other'},p=>{p.mode='selected_fields'},p=>{p.source_kind='generated_opinion'},p=>{p.protocol='agent_generated_preview_v1'},p=>{p.recorded=true},p=>{p.anchor.feedback_id=id(31)},p=>{p.feedback_sources.reverse()},p=>{p.feedback_sources.push(copy(p.feedback_sources[0]))},p=>{p.feedback_sources_sha256=h('0')}
 ]
 for(const change of vectors){const p=copy(f.preview);change(p);await assert.rejects(browser.agentDescriptivePatchPreview(resealPreview(p)))}
 await assert.rejects(browser.agentDescriptivePatchPreview(f.preview,{...f.target,spec_id:id(9)}))
 const unchanged=copy(f.preview);unchanged.candidate.descriptive=copy(unchanged.before.descriptive);unchanged.model_patch.descriptive={goal:unchanged.before.descriptive.goal};unchanged.model_patch.patch_sha256=await browser.agentDescriptivePatchModelHash(unchanged.model_patch.descriptive);unchanged.changed_keys=[]
 await assert.rejects(browser.agentDescriptivePatchPreview(resealPreview(unchanged)))
})

test('closed projections reject private metadata and hostile JavaScript objects without invoking getters',async()=>{
 const f=fixture(),vectors=[p=>{p.owner_user_id=id(7)},p=>{p.source.model_binding={}},p=>{p.before.descriptive.tools=[]},p=>{p.model_patch.descriptive.human_patch={goal:'x'}},p=>{p.candidate.api_key='synthetic'},p=>{p.feedback_sources[0].comment='private'},p=>{p.mode='provided_fields';Object.defineProperty(p,'private',{value:'secret',enumerable:false})},p=>{p[Symbol('private')]=1}]
 for(const change of vectors){const p=copy(f.preview);change(p);await assert.rejects(browser.agentDescriptivePatchPreview(p))}
 let reads=0;const getter=copy(f.preview);Object.defineProperty(getter.before.descriptive,'goal',{enumerable:true,get(){reads++;throw Error('getter must not execute')}});await assert.rejects(browser.agentDescriptivePatchPreview(getter));assert.equal(reads,0)
 const sparse=copy(f.preview);delete sparse.feedback_sources[0];await assert.rejects(browser.agentDescriptivePatchPreview(sparse))
 const extraArray=copy(f.preview);extraArray.feedback_sources.extra='secret';await assert.rejects(browser.agentDescriptivePatchPreview(extraArray))
 const cyclic=copy(f.preview);cyclic.source.extra=cyclic;await assert.rejects(browser.agentDescriptivePatchPreview(cyclic))
 await assert.rejects(browser.agentDescriptivePatchPreview(new Date()))
 const withPrototype=Object.assign(Object.create({private:'x'}),copy(f.preview));await assert.rejects(browser.agentDescriptivePatchPreview(withPrototype))
})

test('receipt recovery binds every original field without requiring private bodies or current resources',async()=>{
 const f=fixture({goal:'原目标😀',done_criteria:[]},{inherited:true}),p=await browser.agentDescriptivePatchPreview(f.preview),original=browser.agentDescriptivePatchOriginal(p,id(99)),replay={...f.receipt,replayed:true}
 equivalent(await browser.agentDescriptivePatchReceipt(replay,{target:f.target,original,replayed:true}),replay)
 equivalent(await browser.agentDescriptivePatchReceipt(replay,{target:f.target}),replay)
 const changes=[{request_id:id(98)},{review_id:id(8)},{spec_id:id(8)},{target_run_id:id(8)},{anchor_run_id:id(8)},{anchor_feedback_id:id(8)},{expected_preview_sha256:h('0')},{expected_result_sha256:h('0')},{expected_patch_sha256:h('0')},{expected_spec_revision:40},{expected_spec_sha256:h('0')},{expected_candidate_sha256:h('0')}]
 for(const change of changes)await assert.rejects(browser.agentDescriptivePatchReceipt(replay,{original:{...original,...change}}))
 await assert.rejects(browser.agentDescriptivePatchReceipt(replay,{replayed:false}))
 assert.equal(Object.hasOwn(replay,'model_binding'),false);assert.equal(Object.hasOwn(replay,'descriptive'),false)
})

test('resealed receipt metadata still refuses wrong membership, revision, epoch, originals and protocols',async()=>{
 const f=fixture({goal:full.goal}),vectors=[r=>{r.provided_keys=['done_criteria']},r=>{r.provided_keys=['goal','goal']},r=>{r.changed_keys=['task_scope']},r=>{r.after.revision=r.before.revision},r=>{r.after.revision_id=r.before.revision_id},r=>{r.after.source_sha256=r.before.source_sha256},r=>{r.acceptance_owner_epoch++},r=>{r.request_sha256=h('0')},r=>{r.created_at='2026-02-30T01:02:03.123Z'},r=>{r.protocol='agent_generated_acceptance_receipt_v1'},r=>{r.mode='human_patch'},r=>{r.patch_sha256=h('0')},r=>{r.request_id=id(30)}]
 for(const change of vectors){const r=copy(f.receipt);change(r);await assert.rejects(browser.agentDescriptivePatchReceipt(resealReceipt(r)))}
 for(const field of ['descriptive','model_binding','comment','identity','optimization_candidate_sha256']){const r=copy(f.receipt);r[field]='private';await assert.rejects(browser.agentDescriptivePatchReceipt(r))}
})

test('expected original and received metadata are snapshotted before asynchronous hashing',async()=>{
 const f=fixture(),mutable=copy(f.original),wire=copy(f.receipt),pending=browser.agentDescriptivePatchReceipt(wire,{original:mutable})
 mutable.expected_patch_sha256=h('0');wire.source.review_id=id(77)
 equivalent(await pending,f.receipt)
 const initiallyWrong={...f.original,expected_patch_sha256:h('0')},refused=browser.agentDescriptivePatchReceipt(f.receipt,{original:initiallyWrong})
 initiallyWrong.expected_patch_sha256=f.original.expected_patch_sha256
 await assert.rejects(refused)
})

test('public hash helpers reject root getters and hidden properties before reading selected fields',async()=>{
 const f=fixture()
 for(const [raw,helper] of [[f.preview,browser.agentDescriptivePatchPreviewHash],[f.receipt,browser.agentDescriptivePatchReceiptHash]]){
  let reads=0;const getter=copy(raw)
  Object.defineProperty(getter,'source',{enumerable:true,get(){reads++;return raw.source}})
  await assert.rejects(helper(getter));assert.equal(reads,0)
  const hidden=copy(raw);Object.defineProperty(hidden,'private',{value:'private',enumerable:false})
  await assert.rejects(helper(hidden))
 }
})

test('model hash and original construction reject inherited array methods and root getters before access',async()=>{
 let maps=0,reads=0;const values=['new deliverable'],prototype=Object.create(Array.prototype,{map:{get(){maps++;return Array.prototype.map}}})
 Object.setPrototypeOf(values,prototype)
 await assert.rejects(async()=>browser.agentDescriptivePatchModelHash({deliverables:values}));assert.equal(maps,0)
 const f=fixture(),getter=copy(f.preview)
 Object.defineProperty(getter,'source',{enumerable:true,get(){reads++;return f.preview.source}})
 assert.throws(()=>browser.agentDescriptivePatchOriginal(getter,id(99)));assert.equal(reads,0)
 const nested=copy(f.preview);Object.defineProperty(nested.model_patch,'patch_sha256',{enumerable:true,get(){reads++;return f.preview.model_patch.patch_sha256}})
 assert.throws(()=>browser.agentDescriptivePatchOriginal(nested,id(99)));assert.equal(reads,0)
})

test('requests reject extra ownership, selective edits, wrong acknowledgement and unsafe values',()=>{
 const f=fixture(),vectors=[{owner_user_id:id(7)},{selected_keys:['goal']},{human_patch:{goal:'x'}},{expected_patch_sha256:undefined},{confirm:false},{acceptance_acknowledgement:'APPROVE_EXACT_GENERATED_DESCRIPTIVE_ROLE_CHANGE_V1'},{expected_spec_revision:'41'},{expected_spec_revision:Number.MAX_SAFE_INTEGER},{request_id:id(1)},{request_id:id(30)},{review_id:id(1).toUpperCase().replace('00000000','ABCDEF00')}]
 for(const change of vectors){const raw={...f.original,...change};if(change.request_id===id(30)){assert.throws(()=>browser.agentDescriptivePatchOriginal(f.preview,id(30)));continue}assert.throws(()=>browser.agentDescriptivePatchAcceptance(raw))}
 equivalent(browser.agentDescriptivePatchPreviewInput({action:'preview',...f.target}),{action:'preview',...f.target})
 assert.throws(()=>browser.agentDescriptivePatchPreviewInput({action:'preview',...f.target,owner_user_id:id(7)}))
 assert.throws(()=>browser.agentDescriptivePatchTarget({...f.target,purpose:'optimize'}))
})

test('full UTF16 capacities interoperate; overflow, unpaired surrogates and provided secrets refuse',async()=>{
 const f=fixture({goal:'😀'.repeat(1500),task_scope:'界'.repeat(4000),deliverables:Array(30).fill('交'.repeat(500)),task_plan:Array(30).fill('计'.repeat(500)),done_criteria:Array(30).fill('验'.repeat(500))})
 equivalent(await browser.agentDescriptivePatchPreview(f.preview),f.preview)
 for(const value of ['界'.repeat(3001),'\ud800',' api_key=synthetic','api_key=synthetic','Bearer synthetic','sk-synthetic123456789']){
  const p=copy(f.preview);p.model_patch.descriptive.goal=value;p.candidate.descriptive.goal=value;await assert.rejects(browser.agentDescriptivePatchPreview(resealPreview(p)))
 }
 const p=copy(f.preview);p.candidate.descriptive.deliverables.push('overflow');await assert.rejects(browser.agentDescriptivePatchPreview(resealPreview(p)))
})

test('complete-five legacy and provided-field protocols never accept one another',async()=>{
 const f=fixture(full)
 await assert.rejects(agentGeneratedPreview(f.preview));await assert.rejects(agentGeneratedReceipt(f.receipt))
 assert.notEqual(server.agentDescriptivePatchFamily,'agent_generated_acceptance_v1')
 const p=copy(f.preview);p.protocol='agent_generated_preview_v1';await assert.rejects(browser.agentDescriptivePatchPreview(p))
 const r=copy(f.receipt);r.source_kind='generated_opinion';await assert.rejects(browser.agentDescriptivePatchReceipt(r))
})
