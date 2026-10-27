// Pure boundary tests only. No SQL/PGlite fixture, listener or provider import.
import test from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {AgentGeneratedSourceRepository,agentGeneratedCandidate,agentGeneratedDescriptions,agentGeneratedEpoch,agentGeneratedNative,agentGeneratedSourceRuns} from '../src/agent-generated-source.ts'
import {safeAgentSpec} from '../src/contracts.ts'
import {canonicalMcpJson} from '../src/mcp-catalog.ts'
import {agentDescriptiveLimits as limits} from '../../../shared/agent-role-limits.mjs'
import {generatedAcceptanceTarget,generatedManualRoleInput,generatedRecoverySourceRead} from './helpers/agent-generated-acceptance-fixture.mjs'
import {generatedAcceptanceChoice} from './helpers/agent-generated-acceptance-fixture.mjs'
import {agentGeneratedCandidateHash,agentGeneratedChangedKeys,agentGeneratedFeedbackHash,agentGeneratedPreviewHash,agentGeneratedRequestHash,agentGeneratedReceiptHash} from '../src/agent-generated-acceptance-contract.ts'
import {agentGeneratedExpectedPreview,agentGeneratedOriginalReceipt} from '../src/agent-generated-acceptance-repository.ts'
import {parseFeedbackOptimizationDraft,parseFeedbackOptimizationAcceptance,feedbackOptimizationChangedFields} from '../src/agent-feedback-optimization-contract.ts'
import {verifyAgentGeneratedCredentials} from '../src/agent-generated-audit.ts'

const identity={issuer:'urn:agentstudio:local:v1',subject:'native-generated-synthetic'}
const before=()=>safeAgentSpec({goal:'原目标😀',task_scope:'范围',deliverables:['原交付'],task_plan:[],done_criteria:[],tools:['calculate'],knowledge_base_ids:[],
  require_plan_review:true,model_binding:{connection_id:'00000000-0000-4000-8000-000000000040',connection_revision:7,model_id:'synthetic'}})
const result=()=>({descriptive:{goal:'新目标😀',task_scope:'边界：只改描述',deliverables:['核对'],task_plan:['执行'],done_criteria:['留证']},tools_note:'No grants',rationale:'Synthetic boundary evidence'})
const closed=code=>error=>error.status===409&&error.code===code&&error.message===code

test('the exact original hosted target guard rejects local/ambient target before dynamic database fixture imports',()=>{
  for(const env of [{},{DATABASE_URL:'postgres://must-never-connect'}, {...process.env,AGENT_STUDIO_PG18_CI_HOST:'10.0.0.1'},
    {...process.env,AGENT_STUDIO_PG18_CI_PORT:'5333'}, {...process.env,PGHOST:'127.0.0.1'}])
    assert.throws(()=>generatedAcceptanceTarget(env),/refuse_non_ephemeral_pg18_ci/)
})

test('source discovery pre-acquires every lower and higher run540 without mutating the stored unsorted choice',()=>{
  const run=tail=>'00000000-0000-4000-8000-'+tail.padStart(12,'0')
  const choice={purpose:'optimize',run_id:run('20'),feedback_sources:[{run_id:run('30')},{run_id:run('10')},{run_id:run('20')}],evaluation_sources:[]}
  const original=structuredClone(choice)
  assert.deepEqual(agentGeneratedSourceRuns(choice),[run('10'),run('20'),run('30')]);assert.deepEqual(choice,original)
  for(const invalid of [{...choice,purpose:'evaluate'},{...choice,evaluation_sources:[{review_id:randomUUID()}]}, {...choice,feedback_sources:[]},
    {...choice,feedback_sources:Array(9).fill({run_id:run('10')})}, {...choice,feedback_sources:[{run_id:'unsafe'}]}])
    assert.throws(()=>agentGeneratedSourceRuns(invalid),closed('agent_generated_source_unavailable'))
})

test('generated application requires the actual complete five fields; partial output cannot inherit values from before',()=>{
  for(const key of ['goal','task_scope','deliverables','task_plan','done_criteria']){
    const output=result();delete output.descriptive[key]
    assert.throws(()=>agentGeneratedCandidate(before(),output),closed('agent_generated_complete_output_required'))
  }
  for(const d of [null,[],{...result().descriptive,tools:['calculate']},Object.assign(Object.create({hidden:true}),result().descriptive)])
    assert.throws(()=>agentGeneratedCandidate(before(),{...result(),descriptive:d}),closed('agent_generated_complete_output_required'))
  let reads=0;const d=result().descriptive
  Object.defineProperty(d,'goal',{get(){reads++;throw Error('must_not_read_accessor')},enumerable:true})
  assert.throws(()=>agentGeneratedCandidate(before(),{...result(),descriptive:d}),closed('agent_generated_complete_output_required'));assert.equal(reads,0)
})

test('the actual candidate helper changes only descriptive values and preserves every hidden full-spec authority field',()=>{
  const source=before(),original=structuredClone(source),output=result(),candidate=agentGeneratedCandidate(source,output)
  assert.deepEqual(candidate.changed_keys,['goal','task_scope','deliverables','task_plan','done_criteria'])
  const omit=spec=>Object.fromEntries(Object.entries(spec).filter(([key])=>!candidate.changed_keys.includes(key)))
  assert.deepEqual(omit(candidate.spec),omit(source));assert.deepEqual(agentGeneratedDescriptions(candidate.spec),output.descriptive)
  assert.deepEqual(source,original);assert.equal(candidate.spec.require_approval,true);assert.equal(candidate.spec.require_plan_review,true)
  assert.deepEqual(candidate.spec.model_binding,source.model_binding)
  assert.throws(()=>agentGeneratedCandidate(source,{...output,descriptive:agentGeneratedDescriptions(source)}),closed('agent_generated_change_required'))
})

test('maximum UTF16 descriptions/emoji/escaping and empty optional values are preserved without the legacy proposal cap',()=>{
  const output=result()
  output.descriptive={goal:'😀'.repeat(limits.goal/2),task_scope:'界'.repeat(limits.task_scope),
    deliverables:Array(limits.list_items).fill('交'.repeat(limits.list_item)),task_plan:Array(limits.list_items).fill('计'.repeat(limits.list_item)),done_criteria:Array(limits.list_items).fill('验'.repeat(limits.list_item))}
  assert.ok(Buffer.byteLength(JSON.stringify(output))>23000)
  const accepted=agentGeneratedCandidate(before(),output)
  assert.equal(canonicalMcpJson(agentGeneratedDescriptions(accepted.spec)),canonicalMcpJson(output.descriptive))
  const empty={...result(),descriptive:{goal:'边界 "引号" \\ 换行\n😀',task_scope:'',deliverables:[''],task_plan:[],done_criteria:[]}}
  assert.deepEqual(agentGeneratedDescriptions(agentGeneratedCandidate(before(),empty).spec),empty.descriptive)
  const oversized=result();oversized.descriptive.goal='😀'.repeat(limits.goal/2+1)
  assert.throws(()=>agentGeneratedCandidate(before(),oversized),closed('agent_generated_source_unavailable'))
})

test('Native context and safe current epoch reject absent/untrusted identity without coercion',()=>{
  agentGeneratedNative(identity)
  for(const value of [null,{}, {...identity,issuer:'https://untrusted.test'}, {...identity,subject:''}, {...identity,subject:7}])
    assert.throws(()=>agentGeneratedNative(value),e=>e.status===403&&e.code==='native_employee_identity_required')
  assert.equal(agentGeneratedEpoch('5'),5);assert.equal(agentGeneratedEpoch(7),7)
  for(const value of [0,-1,'01','1.0',' 1',true,{},1.5,Number.MAX_SAFE_INTEGER,'9007199254740991'])
    assert.throws(()=>agentGeneratedEpoch(value),closed('agent_generated_source_unavailable'))
  for(const value of [null,undefined])assert.throws(()=>agentGeneratedEpoch(value),e=>e.status===403)
})

test('same-client source refuses malformed targets and foreign identities before reading a DB or opening a pool',async()=>{
  let connections=0,queries=0
  const pool={async connect(){connections++;throw Error('must_not_open_pool')}}
  const db={async query(){queries++;throw Error('must_not_query')},release(){throw Error('must_not_release_callers_client')}}
  const kernel=new AgentGeneratedSourceRepository(pool),owner=randomUUID(),valid={review_id:randomUUID(),spec_id:randomUUID(),target_run_id:randomUUID()}
  for(const raw of [null,{}, {...valid,owner_user_id:owner}, {...valid,review_id:'bad'}, {...valid,[Symbol('extra')]:true}])
    await assert.rejects(kernel.prepareOnClient(identity,db,owner,raw),e=>e.status===400)
  const accessor={...valid};Object.defineProperty(accessor,'review_id',{get(){throw Error('must_not_get')},enumerable:true})
  await assert.rejects(kernel.prepareOnClient(identity,db,owner,accessor),e=>e.status===400)
  await assert.rejects(kernel.prepareOnClient({...identity,issuer:'foreign'},db,owner,valid),e=>e.status===403)
  assert.equal(connections,0);assert.equal(queries,0)
})

test('public repository methods reject invalid identity/closed intent before any connection and independently default fresh acceptance off',async()=>{
  const {AgentGeneratedAcceptanceRepository}=await import('../src/agent-generated-acceptance-repository.ts')
  let connected=0;const pool={async connect(){connected++;throw Error('invalid_caller_reached_db')}}
  const repository=new AgentGeneratedAcceptanceRepository(pool)
  assert.equal(repository.accepting,false)
  for(const method of ['preview','accept','confirm','receipt']){
    await assert.rejects(repository[method]({issuer:'untrusted',subject:'alias'},{}),e=>e.status===403)
    await assert.rejects(repository[method](identity,{}),e=>e.status===400)
  }
  assert.equal(connected,0)
})

// Arithmetic/closed-binding fixture only: opaque source/full-role hashes do
// not claim real protected output, schema/source validation or DB acceptance.
function arithmeticBinding(){
  const source={review_id:randomUUID(),spec_id:randomUUID(),target_run_id:randomUUID(),review_request_sha256:'a'.repeat(64),input_sha256:'b'.repeat(64),content_sha256:'c'.repeat(64),
    result_sha256:'d'.repeat(64),completion_sha256:'e'.repeat(64),source_owner_epoch:5,source_protocol:'employee_statement_anchor_v1'}
  const refs=[{run_id:randomUUID(),feedback_id:randomUUID(),feedback_sha256:'1'.repeat(64),feedback_revision:2,feedback_source_sha256:'2'.repeat(64),statement_sha256:'3'.repeat(64)}]
  const old=before(),candidate=agentGeneratedCandidate(old,result())
  const binding={source,feedback_sources:refs,feedback_sources_sha256:agentGeneratedFeedbackHash(refs),anchor:{run_id:refs[0].run_id,feedback_id:refs[0].feedback_id},
    before:{revision:41,source_sha256:'6'.repeat(64),descriptive:agentGeneratedDescriptions(old)},candidate:{descriptive:agentGeneratedDescriptions(candidate.spec),candidate_sha256:agentGeneratedCandidateHash('Retained synthetic name',candidate.spec)},
    changed_keys:agentGeneratedChangedKeys(agentGeneratedDescriptions(old),agentGeneratedDescriptions(candidate.spec))}
  const preview={protocol:'agent_generated_preview_v1',...binding,preview_sha256:agentGeneratedPreviewHash(binding),recorded:false},original=generatedAcceptanceChoice(preview)
  const core={protocol:'agent_generated_acceptance_receipt_v1',source_kind:'generated_opinion',request_id:original.request_id,request_sha256:agentGeneratedRequestHash(original),source,feedback_sources:refs,
    feedback_sources_sha256:binding.feedback_sources_sha256,anchor:binding.anchor,before:{revision:41,source_sha256:'6'.repeat(64),revision_id:randomUUID()},
    after:{revision:42,source_sha256:'7'.repeat(64),revision_id:randomUUID()},candidate_sha256:binding.candidate.candidate_sha256,changed_keys:binding.changed_keys,
    preview_sha256:preview.preview_sha256,acceptance_owner_epoch:5,created_at:'2026-10-27T00:00:00.000Z'}
  return {preview,original,receipt:{...core,receipt_sha256:agentGeneratedReceiptHash(core),recorded:true,replayed:true}}
}

test('the actual recovery matcher binds every original field and accepts historical epochs without body/current-source dependencies',()=>{
  const {original,receipt}=arithmeticBinding(),snapshot=structuredClone(receipt)
  assert.deepEqual(agentGeneratedOriginalReceipt(receipt,original),receipt)
  for(const key of ['request_id','review_id','spec_id','target_run_id','anchor_run_id','anchor_feedback_id'])
    assert.throws(()=>agentGeneratedOriginalReceipt(receipt,{...original,[key]:randomUUID()}),closed('agent_generated_request_conflict'))
  for(const key of ['expected_preview_sha256','expected_result_sha256','expected_spec_sha256','expected_candidate_sha256'])
    assert.throws(()=>agentGeneratedOriginalReceipt(receipt,{...original,[key]:'0'.repeat(64)}),closed('agent_generated_request_conflict'))
  assert.throws(()=>agentGeneratedOriginalReceipt(receipt,{...original,expected_spec_revision:42}),closed('agent_generated_request_conflict'))
  assert.deepEqual(receipt,snapshot)
  assert.equal(receipt.source.source_owner_epoch,5);assert.equal(receipt.acceptance_owner_epoch,5)
  assert.equal(Object.hasOwn(receipt,'body'),false);assert.equal(Object.hasOwn(receipt,'descriptive'),false)
})

test('the exact preview matcher refuses changed role/source/result/anchor/candidate instead of silently rebasing consent',()=>{
  const {original,preview}=arithmeticBinding()
  assert.deepEqual(agentGeneratedExpectedPreview(preview,original),preview)
  for(const key of ['expected_spec_revision','expected_spec_sha256'])
    assert.throws(()=>agentGeneratedExpectedPreview(preview,{...original,[key]:key==='expected_spec_revision'?42:'0'.repeat(64)}),closed('agent_generated_role_changed'))
  for(const key of ['expected_preview_sha256','expected_result_sha256','expected_candidate_sha256','anchor_run_id','anchor_feedback_id'])
    assert.throws(()=>agentGeneratedExpectedPreview(preview,{...original,[key]:key.endsWith('_id')?randomUUID():'0'.repeat(64)}),closed('agent_generated_source_unavailable'))
  assert.throws(()=>agentGeneratedOriginalReceipt({...arithmeticBinding().receipt,private_body:'never accepted'},original),closed('agent_generated_unavailable'))
})

test('real frozen055 preview/accept parsers accept fixture wire specs while retaining server-forced approval and every authority field',()=>{
  const prior=before(),{require_approval:_,...input}=prior,candidate=safeAgentSpec({...input,goal:'Real manual055 collision'})
  const draft={action:'preview',spec_id:randomUUID(),run_id:randomUUID(),feedback_id:randomUUID(),expected_feedback_sha256:'1'.repeat(64),
    expected_spec_revision:7,expected_spec_sha256:'2'.repeat(64),name:'Synthetic retained role',spec:candidate}
  assert.throws(()=>parseFeedbackOptimizationDraft(draft),error=>error.status===400&&error.code==='unsafe_agent_spec_field')
  const originalCandidate=structuredClone(candidate),wire=generatedManualRoleInput(candidate)
  assert.equal(Object.hasOwn(wire,'require_approval'),false)
  assert.deepEqual(parseFeedbackOptimizationDraft({...draft,spec:wire}).spec,candidate)
  const parsedPreview=parseFeedbackOptimizationDraft({...draft,spec:wire})
  const accepted=parseFeedbackOptimizationAcceptance({...draft,action:'accept',request_id:randomUUID(),spec:generatedManualRoleInput(parsedPreview.spec),confirm:true})
  assert.equal(accepted.spec.require_approval,true);assert.deepEqual(accepted.spec,candidate)
  assert.deepEqual(feedbackOptimizationChangedFields({name:draft.name,spec:prior},{name:draft.name,spec:accepted.spec}),['goal'])
  assert.deepEqual(accepted.spec.model_binding,prior.model_binding);assert.deepEqual(accepted.spec.tools,prior.tools)
  assert.equal(accepted.spec.require_plan_review,prior.require_plan_review);assert.deepEqual(candidate,originalCandidate)
  wire.tools.push('summarize');assert.deepEqual(candidate,originalCandidate,'fixture wire copy must not mutate the normalized candidate')
  assert.throws(()=>generatedManualRoleInput({...candidate,require_approval:false}))
})

test('recovery trace permits the actual full059 catalog query but catches genuine source/private/current-resource SQL',async()=>{
  // Pure query generation probe, not a simulated successful audit or SQL run.
  // The unmodified full auditor emits this exact second catalog statement.
  const queries=[]
  await assert.rejects(verifyAgentGeneratedCredentials({async query(sql){queries.push(sql);if(queries.length===2)throw Error('stop_after_second_catalog_query');return {rows:[]}}}),/unsafe_agent_generated_privileges/)
  assert.equal(queries.length,2);assert.match(queries[1],/pg_catalog/)
  assert.match(queries[1],/to_regprocedure\('agentstudio\.agent_opinion_body\(uuid,text,text\)'\)/)
  assert.equal(/agent_opinion_(?:anchor|body)\(/.test(queries[1]),true,'old whole-query predicate misclassified this exact real audit statement')
  assert.equal(generatedRecoverySourceRead(queries[1]),false)
  for(const sql of [
    'SELECT agentstudio.agent_opinion_anchor($1::uuid) AS value',
    'SELECT agentstudio.agent_opinion_body($1::uuid,$2::text,$3::text) AS value',
    'SELECT name,spec,revision FROM agentstudio.agent_specs WHERE id=$1::uuid FOR SHARE',
    'SELECT revision,enabled,status,models,provider,base_url FROM agentstudio.model_connections WHERE id=$1 FOR SHARE',
    'SELECT * FROM agentstudio.agent_review_inputs WHERE request_id=$1',
    'SELECT * FROM agentstudio.agent_assessment_outputs WHERE request_id=$1'
  ])assert.equal(generatedRecoverySourceRead(sql),true,sql)
  assert.equal(generatedRecoverySourceRead("SELECT pg_get_functiondef(to_regprocedure('agentstudio.agent_opinion_body(uuid,text,text)'))"),false)
  assert.equal(generatedRecoverySourceRead("SELECT 'FROM agentstudio.agent_specs', 'agent_opinion_body(' FROM pg_catalog.pg_class"),false)
})
