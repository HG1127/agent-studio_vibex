// Cross-runtime wire compatibility only. Synthetic opaque DB fingerprints are
// not evidence of a committed role update, provider completion or SQL execution.
import test from 'node:test'
import assert from 'node:assert/strict'
import {safeAgentSpec} from '../services/pg-api/src/contracts.ts'
import {parseAgentGeneratedPreview,parseAgentGeneratedReceipt,parseAgentGeneratedAcceptance,
  agentGeneratedCandidateHash,agentGeneratedChangedKeys,agentGeneratedFeedbackHash,
  agentGeneratedPreviewHash,agentGeneratedRequestHash,agentGeneratedReceiptHash} from '../services/pg-api/src/agent-generated-acceptance-contract.ts'
import * as browser from '../src/lib/pgNativeAgentGeneratedAcceptance.ts'
import {createPgNativeAgentGeneratedAcceptanceSession} from '../src/lib/pgNativeAgentGeneratedAcceptanceSession.ts'

const uuid=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0')
const digest=letter=>letter.repeat(64)
const empty=()=>({goal:'原始目标',task_scope:'',deliverables:[],task_plan:[],done_criteria:[]})
function fixture(after={goal:'生成目标😀',task_scope:'边界与证据',deliverables:['实际核对'],task_plan:['一次执行'],done_criteria:['完整记录']}){
  const before=empty(),full=safeAgentSpec({...before,tools:['calculate'],knowledge_base_ids:[],require_plan_review:true,
    model_binding:{connection_id:uuid(80),connection_revision:7,model_id:'synthetic'}})
  const {require_approval:_,...candidateBase}=full
  const source={review_id:uuid(1),spec_id:uuid(2),target_run_id:uuid(3),review_request_sha256:digest('a'),input_sha256:digest('b'),
    content_sha256:digest('c'),result_sha256:digest('d'),completion_sha256:digest('e'),source_owner_epoch:7,source_protocol:'employee_statement_anchor_v1'}
  const feedback=[{run_id:uuid(4),feedback_id:uuid(5),feedback_sha256:digest('f'),feedback_revision:9,feedback_source_sha256:digest('a'),statement_sha256:digest('b')},
    {run_id:uuid(6),feedback_id:uuid(7),feedback_sha256:digest('c'),feedback_revision:10,feedback_source_sha256:digest('d'),statement_sha256:digest('e')}]
  const binding={source,feedback_sources:feedback,feedback_sources_sha256:agentGeneratedFeedbackHash(feedback),anchor:{run_id:feedback[0].run_id,feedback_id:feedback[0].feedback_id},
    before:{revision:11,source_sha256:digest('f'),descriptive:before},candidate:{descriptive:after,candidate_sha256:agentGeneratedCandidateHash('合成角色',safeAgentSpec({...candidateBase,...after}))},
    changed_keys:agentGeneratedChangedKeys(before,after)}
  const preview=parseAgentGeneratedPreview({protocol:'agent_generated_preview_v1',...binding,preview_sha256:agentGeneratedPreviewHash(binding),recorded:false})
  const target={review_id:source.review_id,spec_id:source.spec_id,target_run_id:source.target_run_id}
  return {preview,target}
}
function receipt(preview,original,replayed=true){
  const core={protocol:'agent_generated_acceptance_receipt_v1',source_kind:'generated_opinion',request_id:original.request_id,
    request_sha256:agentGeneratedRequestHash(original),source:preview.source,feedback_sources:preview.feedback_sources,
    feedback_sources_sha256:preview.feedback_sources_sha256,anchor:preview.anchor,
    before:{revision:preview.before.revision,source_sha256:preview.before.source_sha256,revision_id:uuid(20)},
    after:{revision:preview.before.revision+1,source_sha256:digest('a'),revision_id:uuid(21)},candidate_sha256:preview.candidate.candidate_sha256,
    changed_keys:preview.changed_keys,preview_sha256:preview.preview_sha256,acceptance_owner_epoch:7,created_at:'2026-10-27T00:00:00.123Z'}
  assert.equal(Object.keys(core).length,15)
  return {...core,receipt_sha256:agentGeneratedReceiptHash(core),recorded:true,replayed}
}

test('real Node and browser codecs agree on preview, exact14 original and exact18 permanent receipt bindings',async()=>{
  const {preview,target}=fixture(),wire=structuredClone(preview)
  const decoded=await browser.agentGeneratedPreview(wire,target)
  assert.deepEqual(decoded,preview);assert.equal(await browser.agentGeneratedPreviewHash(decoded),preview.preview_sha256)
  assert.equal(await browser.agentGeneratedFeedbackHash(decoded.feedback_sources),preview.feedback_sources_sha256)
  const original=browser.agentGeneratedOriginal(decoded,uuid(30))
  assert.equal(Object.keys(original).length,14);assert.equal(Object.hasOwn(original,'request_sha256'),false)
  assert.deepEqual(parseAgentGeneratedAcceptance(original),original)
  assert.equal(await browser.agentGeneratedRequestHash(original),agentGeneratedRequestHash(original))
  const committed=receipt(preview,original)
  assert.equal(Object.keys(committed).length,18)
  assert.deepEqual(parseAgentGeneratedReceipt(committed,original),committed)
  assert.deepEqual(await browser.agentGeneratedReceipt(committed,{target,original,replayed:true}),committed)
  assert.equal(await browser.agentGeneratedReceiptHash(committed),committed.receipt_sha256)
  wire.candidate.descriptive.goal='外部改动';assert.equal(decoded.candidate.descriptive.goal,preview.candidate.descriptive.goal)
})

test('maximum UTF16 descriptions and escaped Unicode survive both actual codecs without the old proposal-size cap',async()=>{
  const after={goal:'界'.repeat(2998)+'😀',task_scope:'证'.repeat(3994)+'😀\\"\nX',
    deliverables:Array(30).fill('交'.repeat(498)+'😀'),task_plan:Array(30).fill('计'.repeat(500)),done_criteria:Array(30).fill('验'.repeat(500))}
  const {preview,target}=fixture(after)
  assert.ok(JSON.stringify(preview).length>23000)
  assert.deepEqual((await browser.agentGeneratedPreview(preview,target)).candidate.descriptive,after)
  assert.deepEqual(parseAgentGeneratedPreview(preview).candidate.descriptive,after)
  const original=browser.agentGeneratedOriginal(preview,uuid(31)),committed=receipt(preview,original)
  assert.deepEqual(await browser.agentGeneratedReceipt(committed,{target,original}),parseAgentGeneratedReceipt(committed,original))
})

test('both codecs reject altered source/candidate/feedback bindings and forbidden private or extra receipt fields',async()=>{
  const {preview,target}=fixture()
  const edits=[v=>{v.source.content_sha256=digest('f')},v=>{v.candidate.descriptive.goal='已变更'},v=>{v.anchor.run_id=uuid(90)},
    v=>{v.feedback_sources.reverse()},v=>{v.changed_keys=['goal']},v=>{v.source.owner_user_id=uuid(99)}]
  for(const edit of edits){
    const changed=structuredClone(preview);edit(changed)
    assert.throws(()=>parseAgentGeneratedPreview(changed))
    await assert.rejects(browser.agentGeneratedPreview(changed,target))
  }
  const original=browser.agentGeneratedOriginal(preview,uuid(32)),committed=receipt(preview,original)
  for(const extra of [{messages:[]},{fee_acknowledgement:'paid-is-not-config-consent'},{owner_user_id:uuid(99)},{extra:1}]){
    assert.throws(()=>parseAgentGeneratedReceipt({...committed,...extra},original))
    await assert.rejects(browser.agentGeneratedReceipt({...committed,...extra},{target,original}))
  }
})

test('original identity and intent stay bound even when another validly shaped same-ID acceptance would hash differently',async()=>{
  const {preview,target}=fixture({goal:'只修改目标😀',task_scope:'',deliverables:[],task_plan:[],done_criteria:[]})
  assert.deepEqual(preview.changed_keys,['goal'])
  const original=browser.agentGeneratedOriginal(preview,uuid(33)),changed={...original,expected_candidate_sha256:digest('b')}
  assert.deepEqual(parseAgentGeneratedAcceptance(changed),changed)
  assert.notEqual(agentGeneratedRequestHash(changed),agentGeneratedRequestHash(original))
  assert.equal(await browser.agentGeneratedRequestHash(changed),agentGeneratedRequestHash(changed))
  const committed=receipt(preview,original)
  assert.throws(()=>parseAgentGeneratedReceipt(committed,changed))
  await assert.rejects(browser.agentGeneratedReceipt(committed,{target,original:changed,replayed:true}))
  await assert.rejects(browser.agentGeneratedReceipt(committed,{target:{...target,review_id:uuid(91)},original}))
  assert.deepEqual(await browser.agentGeneratedReceipt(receipt(preview,original,false),{target,original,replayed:false}),parseAgentGeneratedReceipt(receipt(preview,original,false),original))
})

test('transient HTTP408 or429 cannot discard the original config request before actual matching confirmation',async()=>{
  const failures=[]
  for(const transient of [408,429]){
    const {preview,target}=fixture(),sent=[],confirmed=[];let ids=0
    const api={
      async getAgentGeneratedAcceptance(){throw {status:404}},
      async previewAgentGeneratedAcceptance(){return structuredClone(preview)},
      async acceptAgentGeneratedAcceptance(original){sent.push(original);throw {status:transient}},
      async confirmAgentGeneratedAcceptance(original){confirmed.push(original);return receipt(preview,original,true)}
    }
    const controller=createPgNativeAgentGeneratedAcceptanceSession(api,{key(){ids++;return uuid(40+transient)}})
    try{
      controller.setActive(true);controller.setScopes({available:true,acceptance:true});await controller.select(target);await controller.prepare();await controller.accept(true)
      const pending=controller.snapshot().pending
      if(!pending?.unknown){failures.push({status:transient,preserved:pending!==null});continue}
      assert.equal(ids,1);assert.equal(sent.length,1);assert.equal(pending.original.request_id,sent[0].request_id)
      controller.setScopes({available:true,acceptance:false});await controller.confirm()
      assert.equal(confirmed.length,1);assert.equal(confirmed[0],sent[0],'confirmation must carry the same frozen original object')
      assert.equal(controller.snapshot().pending,null);assert.equal(controller.snapshot().receipt.request_id,sent[0].request_id)
      assert.equal(ids,1);assert.equal(sent.length,1)
    }finally{controller.dispose()}
  }
  assert.deepEqual(failures,[],'transient status is not proof that a configuration change did not commit')
})
