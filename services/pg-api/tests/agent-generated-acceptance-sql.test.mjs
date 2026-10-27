// HOSTED ONLY. No local execution: the original exact disposable GitHub
// approval guard runs BEFORE any dynamic DB-fixture import. These tests use
// isolated embedded SQL only; genuinePG18/races belong to the separate suite.
import test from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {requireEphemeralPg18Ci} from '../src/pg18-ephemeral-ci-guard.mjs'
import {withActor} from '../src/repository.ts'
import {verifyAgentGeneratedCore} from '../src/agent-generated-audit-core.ts'
import {verifyAgentGeneratedCredentials,inspectAgentGeneratedSchema} from '../src/agent-generated-audit.ts'
import {verifyAgentOpinionCredentials} from '../src/agent-opinion-audit.ts'
import {parseAgentGeneratedAcceptance,parseAgentGeneratedReceipt,agentGeneratedRequestHash,agentGeneratedPreviewHash,
  agentGeneratedFeedbackHash,agentGeneratedCandidateHash,agentGeneratedChangedKeys,agentGeneratedAcknowledgement,agentGeneratedDescriptiveKeys as D} from '../src/agent-generated-acceptance-contract.ts'
import {agentReviewRoleCandidate,agentReviewFees} from '../src/agent-review-contract.ts'
import {safeAgentSpec} from '../src/contracts.ts'
import {AgentOptimizationRepository} from '../src/agent-optimization-repository.ts'

const serial={concurrency:false},copy=v=>structuredClone(v),sqlError=message=>e=>e.code==='P0001'&&e.message===message
function guard(){
  requireEphemeralPg18Ci(process.env)
  if(process.platform!=='linux'||typeof process.getuid!=='function'||process.getuid()===0||!process.env.GITHUB_REPOSITORY)throw Error('agent_generated_hosted_linux_nonroot_only')
}
async function fixture({installed=true}={}){
  guard()
  const h=await import('./helpers/agent-assessment-fixture.mjs'),l=await import('./helpers/agent-review-ledger-fixture.mjs'),f=await h.agentAssessmentFixture()
  try{
    await f.db.exec(f.sql('migrations/pg_v9_058_agent_opinion_read.sql'))
    if(installed)await f.db.exec(f.sql('migrations/pg_v9_059_agent_generated_acceptance.sql'))
    return {...f,h,l}
  }catch(error){await f.close();throw error}
}
const actor=(f,p,fn)=>withActor(f.pool,p.identity,(db,owner)=>fn(db,owner))
const call=(f,p,body=p.original)=>actor(f,p,async db=>(await db.query('SELECT agentstudio.agent_generated_accept($1::jsonb) AS value',[JSON.stringify(body)])).rows[0].value)
const read=(f,p,selector='request',value=selector==='request'?p.original.request_id:p.raw.request_id)=>actor(f,p,async db=>(await db.query('SELECT agentstudio.agent_generated_receipt($1::uuid,$2::text) AS value',[value,selector])).rows[0].value)
const audit=(f,p,core=false)=>actor(f,p,db=>core?verifyAgentGeneratedCore(db):verifyAgentGeneratedCredentials(db))
async function ready(f,{who='alice',reviewId,acceptId=randomUUID(),extraFeedback=0,fullCapacity=false,partial=false,noop=false,purpose='optimize',status='succeeded'}={}){
  const s=await f.l.reviewLedgerSource(f,{who}),others=[]
  for(let i=0;i<extraFeedback;i++)others.push(await f.l.reviewLedgerSource(f,{who}))
  const selected=await f.l.reviewLedgerSubmission(f,s,purpose)
  if(purpose==='optimize'){
    const sources=(others.length?others:[s]).map(v=>({run_id:v.runId,feedback_id:v.feedback.feedback_id,feedback_sha256:v.feedback.feedback_sha256}))
    selected.choice.feedback_sources=sources.toSorted((a,b)=>a.run_id<b.run_id?1:a.run_id>b.run_id?-1:a.feedback_id<b.feedback_id?1:-1)
  }
  if(fullCapacity)selected.choice.output_token_limit=16384
  const prepared=await f.review.preview(s.identity,selected.choice),raw={...selected.raw,...selected.choice,action:'submit',request_id:reviewId??selected.raw.request_id,
    expected_input_sha256:prepared.input_sha256,confirm:true,fee_acknowledgement:agentReviewFees[purpose]}
  const receipt=await f.ledger.submit(s.identity,raw),lease=await f.h.assessmentClaim(f),proof=f.h.assessmentProof(lease)
  assert.equal(proof.request_id,raw.request_id);await f.h.assessmentReserve(f,proof)
  let result=purpose==='optimize'?f.h.assessmentOptimization():f.h.assessmentEvaluation()
  if(purpose==='optimize')result.descriptive.goal=fullCapacity?'核'.repeat(3000-raw.request_id.length)+raw.request_id:'合成配置建议 '+raw.request_id
  if(purpose==='optimize'&&fullCapacity)for(const k of ['deliverables','task_plan','done_criteria'])result.descriptive[k]=Array(30).fill('界'.repeat(500))
  if(purpose==='optimize'&&noop)result.descriptive=Object.fromEntries(D.map(k=>[k,copy(s.role.spec[k])]))
  if(purpose==='optimize'&&partial)delete result.descriptive.task_plan
  await f.h.assessmentFinish(f,proof,status==='succeeded'?{status,result}:{status,failure_code:'synthetic_'+status})
  const outcome=(await f.h.assessmentRows(f,raw.request_id,s.owner)).outcomes[0]
  const refs=[]
  for(const ref of selected.choice.feedback_sources)refs.push((await f.db.query('SELECT run_id,request_id AS feedback_id,feedback_sha256,revision::text AS feedback_revision,source_sha256 AS feedback_source_sha256,statement_sha256 FROM agentstudio.agent_feedback_receipts WHERE owner_user_id=$1 AND request_id=$2',[s.owner,ref.feedback_id])).rows[0])
  for(const ref of refs)ref.feedback_revision=Number(ref.feedback_revision)
  refs.sort((a,b)=>a.run_id<b.run_id?-1:a.run_id>b.run_id?1:a.feedback_id<b.feedback_id?-1:1)
  const role=await f.agents.get(s.identity,s.role.id),before=(await f.db.query('SELECT agentstudio.agent_optimization_role_sha(id,owner_user_id,name,revision,spec) AS sha FROM agentstudio.agent_specs WHERE id=$1',[role.id])).rows[0].sha
  // Negative partial/evaluate/failed fixtures use bounded syntactically valid
  // expectations solely to prove refusal, never manufacture stored outputs.
  const descriptions=purpose==='optimize'?{...Object.fromEntries(D.map(k=>[k,role.spec[k]])),...result.descriptive}:{...Object.fromEntries(D.map(k=>[k,role.spec[k]])),goal:'Synthetic denied candidate'}
  const completeResult={descriptive:descriptions,tools_note:'',rationale:'Negative fixture expectations only'}
  const candidate=agentReviewRoleCandidate(role.spec,completeResult),candidateHash=agentGeneratedCandidateHash(role.name,candidate)
  const source={review_id:raw.request_id,spec_id:role.id,target_run_id:s.runId,review_request_sha256:receipt.request_sha256,input_sha256:receipt.input_sha256,
    content_sha256:receipt.content_sha256,result_sha256:outcome.result_sha256??'a'.repeat(64),completion_sha256:outcome.completion_sha256,
    source_owner_epoch:receipt.owner_epoch,source_protocol:'employee_statement_anchor_v1'}
  const anchor=refs.length?{run_id:refs[0].run_id,feedback_id:refs[0].feedback_id}:{run_id:s.runId,feedback_id:s.feedback.feedback_id}
  const frame={source,feedback_sources:refs,feedback_sources_sha256:refs.length?agentGeneratedFeedbackHash(refs):'b'.repeat(64),anchor,
    before:{revision:role.revision,source_sha256:before,descriptive:Object.fromEntries(D.map(k=>[k,role.spec[k]]))},candidate:{descriptive:descriptions,candidate_sha256:candidateHash},changed_keys:[]}
  let previewHash='c'.repeat(64)
  if(purpose==='optimize'&&!noop){frame.changed_keys=agentGeneratedChangedKeys(frame.before.descriptive,descriptions);previewHash=agentGeneratedPreviewHash(frame)}
  const original=parseAgentGeneratedAcceptance({action:'accept',request_id:acceptId,review_id:raw.request_id,spec_id:role.id,target_run_id:s.runId,
    anchor_run_id:anchor.run_id,anchor_feedback_id:anchor.feedback_id,expected_preview_sha256:previewHash,expected_result_sha256:source.result_sha256,
    expected_spec_revision:role.revision,expected_spec_sha256:before,expected_candidate_sha256:candidateHash,confirm:true,acceptance_acknowledgement:agentGeneratedAcknowledgement})
  return {...s,...selected,raw,prepared,receipt,proof,result,outcome,refs,role,candidate,frame,original}
}
const businessTables=['agent_specs','agent_collaboration_proposals','agent_collaboration_revisions','agent_optimization_intents','agent_optimization_links','audit_events',
  'agent_review_requests','agent_review_inputs','agent_review_feedback_sources','agent_review_jobs','agent_review_controls','agent_review_tombstones',
  'agent_assessment_leases','agent_assessment_effects','agent_assessment_outcomes','agent_assessment_outputs','agent_generated_acceptances','agent_generated_feedback_refs']
async function snapshot(f){
  const out={};for(const name of businessTables)out[name]=(await f.db.query("SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY to_jsonb(r)::text),'[]'::jsonb) AS value FROM agentstudio."+name+' r')).rows[0].value
  return out
}
async function noMutation(f,fn){const before=await snapshot(f);try{return await fn()}finally{assert.deepEqual(await snapshot(f),before,'failed/read/replay operations cannot change role/history/proposals/audit/old or new ledger rows')}}

test('optional absent/full059 and readonly startup inspection preserve every unchanged predecessor audit and exact private catalog',serial,async()=>{
  const f=await fixture({installed:false})
  try{
    // Hosted scalar regression: '-' binds before '->'. The former expression
    // coerces the unquoted JSON token descriptive to jsonb before key removal,
    // raising22P02 even for otherwise valid complete/partial/noop objects.
    // Fixed synthetic constants only; do not expose any private stored body.
    const synthetic={goal:'Synthetic',task_scope:'Disposable',deliverables:[],task_plan:[],done_criteria:[]}
    await assert.rejects(f.db.query("SELECT $1::jsonb->'descriptive'-ARRAY['goal','task_scope','deliverables','task_plan','done_criteria'] AS value",[JSON.stringify({descriptive:synthetic})]),e=>e.code==='22P02')
    for(const [descriptive,expected] of [[synthetic,{}],[{...synthetic,synthetic_extra:'retained'},{synthetic_extra:'retained'}]]){
      assert.deepEqual((await f.db.query("SELECT ($1::jsonb->'descriptive')-ARRAY['goal','task_scope','deliverables','task_plan','done_criteria'] AS value",[JSON.stringify({descriptive})])).rows[0].value,expected)
    }
    const identity=f.identities.alice
    assert.equal(await withActor(f.pool,identity,db=>verifyAgentGeneratedCredentials(db)),false)
    assert.equal(await inspectAgentGeneratedSchema(f.pool),false)
    await f.db.exec(f.sql('migrations/pg_v9_059_agent_generated_acceptance.sql'))
    const p=await ready(f)
    assert.equal(await audit(f,p,true),true);assert.equal(await audit(f,p),true);assert.equal(await actor(f,p,verifyAgentOpinionCredentials),true)
    const before=await snapshot(f);assert.equal(await inspectAgentGeneratedSchema(f.pool),true);assert.deepEqual(await snapshot(f),before)
    const objects=(await f.db.query("SELECT relkind,count(*)::integer AS n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='agentstudio' AND left(c.relname,16)='agent_generated_' GROUP BY relkind ORDER BY relkind")).rows
    assert.deepEqual(objects,[{relkind:'i',n:5},{relkind:'r',n:2}])
    for(const role of ['agentstudio_api','agentstudio_worker','agentstudio_review_worker','agentstudio_review_dispatch','agentstudio_native_auth','agentstudio_bound_dispatch']){
      assert.equal((await f.db.query("SELECT has_any_column_privilege($1,'agentstudio.agent_generated_acceptances','SELECT,INSERT,UPDATE,REFERENCES') AS read_write",[role])).rows[0].read_write,false)
      const allowed=(await f.db.query("SELECT has_function_privilege($1,'agentstudio.agent_generated_accept(jsonb)','EXECUTE') AS accept,has_function_privilege($1,'agentstudio.agent_generated_receipt(uuid,text)','EXECUTE') AS receipt",[role])).rows[0]
      assert.deepEqual(allowed,{accept:role==='agentstudio_api',receipt:role==='agentstudio_api'})
    }
  }finally{await f.close()}
})
test('foreign-schema prefixed relations/routines/types/arrays/constraints prevent optional installation and cannot masquerade as clean absence',serial,async()=>{
  const f=await fixture({installed:false})
  try{
    const baseline=()=>withActor(f.pool,f.identities.alice,db=>verifyAgentGeneratedCore(db))
    for(const [up,down] of [
      ['CREATE TABLE public.agent_generated_foreign_shadow(id uuid)','DROP TABLE public.agent_generated_foreign_shadow'],
      ["CREATE FUNCTION public.agent_generated_receipt(uuid,text) RETURNS jsonb LANGUAGE sql AS 'SELECT NULL::jsonb'; REVOKE ALL ON FUNCTION public.agent_generated_receipt(uuid,text) FROM PUBLIC",'DROP FUNCTION public.agent_generated_receipt(uuid,text)'],
      ["CREATE TYPE public.agent_generated_shadow_type AS ENUM('x')",'DROP TYPE public.agent_generated_shadow_type'],
      ["CREATE TYPE public._agent_generated_array_shadow AS ENUM('x')",'DROP TYPE public._agent_generated_array_shadow'],
      ['CREATE TABLE public.synthetic_generated_other(id uuid,CONSTRAINT agent_generated_foreign_constraint CHECK(id IS NOT NULL))','DROP TABLE public.synthetic_generated_other']
    ]){
      await f.db.exec(up)
      try{
        await assert.rejects(baseline(),/unsafe_agent_generated_privileges/)
        try{await assert.rejects(f.db.exec(f.sql('migrations/pg_v9_059_agent_generated_acceptance.sql')),sqlError('agent_generated_installation_refused'))}
        finally{await f.db.exec('ROLLBACK')}
      }finally{await f.db.exec(down)}
      assert.equal(await baseline(),false)
    }
    await f.db.exec(f.sql('migrations/pg_v9_059_agent_generated_acceptance.sql'))
    assert.equal(await withActor(f.pool,f.identities.alice,verifyAgentGeneratedCredentials),true)
  }finally{await f.close()}
})
test('protected059 derives genuine full-five config, canonical multi-feedback anchor and real055/045 links atomically; original choice order is untouched',serial,async()=>{
  const f=await fixture()
  try{
    const p=await ready(f,{extraFeedback:2,fullCapacity:true}),beforeRole=copy(p.role),value=parseAgentGeneratedReceipt(await call(f,p),p.original)
    assert.equal(value.replayed,false);assert.deepEqual(value.feedback_sources,p.refs);assert.equal(value.anchor.run_id,p.refs[0].run_id)
    assert.notEqual(value.source.target_run_id,value.anchor.run_id,'real055 feedback anchor must remain distinct from paid target here')
    const actual=await f.agents.get(p.identity,p.role.id)
    assert.equal(actual.name,beforeRole.name);assert.equal(actual.revision,beforeRole.revision+1)
    for(const k of Object.keys(beforeRole.spec))assert.deepEqual(actual.spec[k],D.includes(k)?p.result.descriptive[k]:beforeRole.spec[k])
    const link=(await f.db.query('SELECT * FROM agentstudio.agent_optimization_links WHERE owner_user_id=$1 AND request_id=$2',[p.owner,p.original.request_id])).rows[0]
    assert.equal(link.run_id,p.refs[0].run_id);assert.equal(link.feedback_id,p.refs[0].feedback_id);assert.equal(link.request_sha256,agentGeneratedRequestHash(p.original))
    const input=(await f.l.reviewLedgerRow(f,p,p.raw.request_id)).body
    assert.deepEqual(input.choice.feedback_sources,p.choice.feedback_sources,'canonical receipt refs cannot reorder original paid choice/messages')
    const oldRefs=await f.db.query('SELECT count(*)::integer AS n FROM agentstudio.agent_generated_feedback_refs WHERE owner_user_id=$1 AND request_id=$2',[p.owner,p.original.request_id]);assert.equal(oldRefs.rows[0].n,2)
    assert.deepEqual((await noMutation(f,()=>call(f,p))),{...value,replayed:true})
    assert.deepEqual(await noMutation(f,()=>read(f,p,'review')),{...value,replayed:true})
    assert.deepEqual(await noMutation(f,()=>read(f,p)),{...value,replayed:true})
    await assert.rejects(noMutation(f,()=>call(f,p,{...p.original,expected_candidate_sha256:'f'.repeat(64)})),sqlError('agent_generated_request_conflict'))
    await assert.rejects(noMutation(f,()=>call(f,p,{...p.original,request_id:randomUUID()})),sqlError('agent_generated_review_already_accepted'))
    assert.equal(await audit(f,p),true)
  }finally{await f.close()}
})
test('same request UUIDs resolve by actual Native owner; foreign scope, non-API roles and original protocol collisions cannot forge witness',serial,async()=>{
  const f=await fixture()
  try{
    const paid=randomUUID(),accept=randomUUID(),a=await ready(f,{reviewId:paid,acceptId:accept}),b=await ready(f,{who:'bob',reviewId:paid,acceptId:accept})
    const av=parseAgentGeneratedReceipt(await call(f,a),a.original),bv=parseAgentGeneratedReceipt(await call(f,b),b.original)
    assert.equal(av.request_id,bv.request_id);assert.notEqual(av.request_sha256,bv.request_sha256);assert.notEqual(av.source.input_sha256,bv.source.input_sha256)
    assert.equal(await read(f,a,'request',randomUUID()),null)
    const unique=await ready(f)
    await assert.rejects(noMutation(f,()=>call(f,{...unique,identity:b.identity})),sqlError('agent_generated_review_not_found'))
    await assert.rejects(actor(f,a,async db=>db.query('SELECT agentstudio.agent_generated_receipt($1,$2)',[accept,'owner'])),sqlError('invalid_agent_generated_request'))
    await assert.rejects(f.h.assessmentRole(f,'agentstudio_review_worker',db=>db.query('SELECT agentstudio.agent_generated_accept($1::jsonb)',[JSON.stringify(unique.original)])),e=>e.code==='42501')
    await assert.rejects(f.h.assessmentRole(f,'agentstudio_worker',db=>db.query('SELECT * FROM agentstudio.agent_generated_acceptances')),e=>e.code==='42501')
    for(const body of [null,[],[unique.original],'invalid'])await assert.rejects(noMutation(f,()=>call(f,unique,body)),sqlError('invalid_agent_generated_request'))
    for(const patch of [{owner_user_id:a.owner},{candidate:unique.candidate},{action:'confirm'},{confirm:false},{expected_spec_revision:1.5},{expected_spec_revision:'1'},{expected_result_sha256:'F'.repeat(64)}])await assert.rejects(noMutation(f,()=>call(f,unique,{...unique.original,...patch})),sqlError('invalid_agent_generated_request'))
    // A real manual055 intent/link under this owner+request is not a generated
    // witness and cannot be relabeled after the fact.
    const manualId=randomUUID(),draft=unique.original
    await actor(f,unique,async db=>{
      await db.query('INSERT INTO agentstudio.agent_optimization_intents(owner_user_id,request_id,spec_id,run_id,feedback_id,feedback_sha256,before_spec_revision,before_spec_sha256,candidate_sha256,request_sha256) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[unique.owner,manualId,unique.role.id,unique.refs[0].run_id,unique.refs[0].feedback_id,unique.refs[0].feedback_sha256,unique.role.revision,draft.expected_spec_sha256,draft.expected_candidate_sha256,'d'.repeat(64)])
    })
    await assert.rejects(noMutation(f,()=>call(f,unique,{...unique.original,request_id:manualId})),sqlError('agent_generated_request_conflict'))
    const linkedId=randomUUID(),manual=new AgentOptimizationRepository(f.pool,{allowAcceptance:true})
    await manual.accept(unique.identity,{action:'accept',request_id:linkedId,spec_id:unique.role.id,run_id:unique.refs[0].run_id,feedback_id:unique.refs[0].feedback_id,
      expected_feedback_sha256:unique.refs[0].feedback_sha256,expected_spec_revision:unique.role.revision,expected_spec_sha256:unique.original.expected_spec_sha256,
      name:unique.role.name,spec:Object.fromEntries(Object.entries(unique.candidate).filter(([k])=>k!=='require_approval')),confirm:true})
    await assert.rejects(noMutation(f,()=>call(f,unique,{...unique.original,request_id:linkedId})),sqlError('agent_generated_request_conflict'))
  }finally{await f.close()}
})
test('independent accepted config and permanent055 witness survive real feedback/opinion erasure, current role/model changes and new epoch without body resurrection',serial,async()=>{
  const f=await fixture()
  try{
    const p=await ready(f),saved=parseAgentGeneratedReceipt(await call(f,p),p.original)
    // Update config first while the original model is still valid; never roll
    // model revision backward or bypass normal current-resource admission.
    const role=await f.agents.get(p.identity,p.role.id),{require_approval:_,...rest}=role.spec
    await f.agents.update(p.identity,role.id,role.name,safeAgentSpec({...rest,goal:'Synthetic later independent owner config'}),role.revision)
    await f.db.query('UPDATE agentstudio.model_connections SET enabled=false,revision=revision+1 WHERE id=$1',[p.choice.model_binding.connection_id])
    await f.h.assessmentFeedbackErase(f,p)
    await f.h.assessmentErase(f,p)
    const config=await f.agents.get(p.identity,p.role.id),rows=await f.h.assessmentRows(f,p.raw.request_id,p.owner)
    assert.equal(rows.outputs.length,0);assert.equal(rows.outcomes.length,1);assert.equal((await f.l.reviewLedgerRow(f,p,p.raw.request_id)).body,null)
    await f.db.query('UPDATE agentstudio_auth.accounts SET governance_revision=governance_revision+2 WHERE user_id=$1',[p.owner])
    const before=await snapshot(f)
    for(const op of [()=>read(f,p),()=>read(f,p,'review'),()=>call(f,p)])assert.deepEqual(await op(),{...saved,replayed:true})
    assert.deepEqual(await snapshot(f),before);assert.deepEqual(await f.agents.get(p.identity,p.role.id),config)
    assert.equal((await f.closed.submit(p.identity,p.raw)).body_erased,true)
    assert.equal((await f.closed.confirm(p.identity,p.raw)).body_erased,true)
    assert.equal(await audit(f,p),true)
    await f.db.query('UPDATE agentstudio_auth.accounts SET enabled=false WHERE user_id=$1',[p.owner])
    await assert.rejects(read(f,p),e=>e.status===403||e.message==='native_employee_identity_required')
  }finally{await f.close()}
})
test('actual partial/noop/evaluate/failed/unknown and changed current sources refuse without any055/new mutation',serial,async t=>{
  for(const [name,options,mutate,expected] of [
    ['partial',{partial:true},null,'agent_generated_complete_output_required'],
    ['noop',{noop:true},null,'agent_generated_change_required'],
    ['evaluate',{purpose:'evaluate'},null,'agent_generated_review_not_found'],
    ['failed',{status:'failed'},null,'agent_generated_source_unavailable'],
    ['unknown',{status:'unknown'},null,'agent_generated_source_unavailable'],
    ['cancel',{},(f,p)=>f.h.assessmentCancel(f,p),'agent_generated_source_unavailable'],
    ['erase',{},(f,p)=>f.h.assessmentErase(f,p),'agent_generated_source_unavailable'],
    ['epoch',{},(f,p)=>f.db.query('UPDATE agentstudio_auth.accounts SET governance_revision=governance_revision+2 WHERE user_id=$1',[p.owner]),'agent_generated_source_unavailable'],
    ['model',{},(f,p)=>f.db.query('UPDATE agentstudio.model_connections SET enabled=false,revision=revision+1 WHERE id=$1',[p.choice.model_binding.connection_id]),'agent_generated_source_unavailable'],
    ['feedback',{},(f,p)=>f.h.assessmentFeedbackErase(f,p),'agent_generated_source_unavailable']
  ])await t.test(name,async()=>{
    const f=await fixture();try{const p=await ready(f,options);if(mutate)await mutate(f,p);await assert.rejects(noMutation(f,()=>call(f,p)),sqlError(expected))}finally{await f.close()}
  })
})
test('standalone exact new catalog/prosrc/ACL/RI drift refuses; restored schema passes unchanged full058 audit',serial,async()=>{
  const f=await fixture()
  try{
    const p=await ready(f),definition=f.sql('migrations/pg_v9_059_agent_generated_acceptance.sql').match(/CREATE FUNCTION agentstudio\.agent_generated_receipt\(uuid,text\)[\s\S]*?\$fn\$;/)[0].replace('CREATE FUNCTION','CREATE OR REPLACE FUNCTION')
    for(const [up,down] of [
      ["ALTER TABLE agentstudio.agent_generated_acceptances ALTER COLUMN source_kind SET DEFAULT 'synthetic_extra'",'ALTER TABLE agentstudio.agent_generated_acceptances ALTER COLUMN source_kind DROP DEFAULT'],
      ['GRANT SELECT ON agentstudio.agent_generated_acceptances TO agentstudio_api','REVOKE SELECT ON agentstudio.agent_generated_acceptances FROM agentstudio_api'],
      ['GRANT EXECUTE ON FUNCTION agentstudio.agent_generated_accept(jsonb) TO agentstudio_review_worker','REVOKE EXECUTE ON FUNCTION agentstudio.agent_generated_accept(jsonb) FROM agentstudio_review_worker'],
      ['CREATE INDEX synthetic_extra_generated ON agentstudio.agent_generated_acceptances(created_at)','DROP INDEX agentstudio.synthetic_extra_generated'],
      ["ALTER TABLE agentstudio.agent_generated_acceptances DROP CONSTRAINT agent_generated_acceptances_kind_ck; ALTER TABLE agentstudio.agent_generated_acceptances ADD CONSTRAINT agent_generated_acceptances_kind_ck CHECK(source_kind IN('generated_opinion','manual'))","ALTER TABLE agentstudio.agent_generated_acceptances DROP CONSTRAINT agent_generated_acceptances_kind_ck; ALTER TABLE agentstudio.agent_generated_acceptances ADD CONSTRAINT agent_generated_acceptances_kind_ck CHECK(source_kind='generated_opinion')"],
      ["ALTER TABLE agentstudio.agent_generated_acceptances DROP CONSTRAINT agent_generated_acceptances_epochs_ck; ALTER TABLE agentstudio.agent_generated_acceptances ADD CONSTRAINT agent_generated_acceptances_epochs_ck CHECK(source_owner_epoch::integer>=1 AND source_owner_epoch::integer<=9007199254740989 AND acceptance_owner_epoch=source_owner_epoch)","ALTER TABLE agentstudio.agent_generated_acceptances DROP CONSTRAINT agent_generated_acceptances_epochs_ck; ALTER TABLE agentstudio.agent_generated_acceptances ADD CONSTRAINT agent_generated_acceptances_epochs_ck CHECK(source_owner_epoch BETWEEN 1 AND 9007199254740989 AND acceptance_owner_epoch=source_owner_epoch)"],
      ["CREATE OR REPLACE FUNCTION agentstudio.agent_generated_receipt(uuid,text) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $drift$BEGIN RETURN NULL; END$drift$",definition]
    ]){
      await f.db.exec(up)
      try{await assert.rejects(audit(f,p,true),/unsafe_agent_generated_privileges/);await assert.rejects(inspectAgentGeneratedSchema(f.pool),/unsafe_agent_generated_privileges/)}finally{await f.db.exec(down)}
      assert.equal(await audit(f,p,true),true);assert.equal(await audit(f,p),true)
    }
    const trigger=(await f.db.query("SELECT t.tgname FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_constraint x ON x.oid=t.tgconstraint JOIN pg_catalog.pg_proc p ON p.oid=t.tgfoid WHERE x.conname='agent_generated_feedback_refs_run_fk' AND p.proname='RI_FKey_check_ins'")).rows[0].tgname
    const quoted='"'+trigger.replaceAll('"','""')+'"'
    await f.db.exec('ALTER TABLE agentstudio.agent_generated_feedback_refs DISABLE TRIGGER '+quoted)
    try{await assert.rejects(audit(f,p,true),/unsafe_agent_generated_privileges/)}finally{await f.db.exec('ALTER TABLE agentstudio.agent_generated_feedback_refs ENABLE TRIGGER '+quoted)}
    assert.equal(await audit(f,p),true)
    for(const name of ['agent_generated_feedback_refs_acceptance_fk','synthetic_unprefixed_fk']){
      await f.db.exec('CREATE TABLE public.synthetic_generated_ref(owner_user_id uuid,request_id uuid,CONSTRAINT '+name+' FOREIGN KEY(owner_user_id,request_id) REFERENCES agentstudio.agent_generated_acceptances(owner_user_id,request_id) ON DELETE RESTRICT)')
      try{await assert.rejects(audit(f,p,true),/unsafe_agent_generated_privileges/)}finally{await f.db.exec('DROP TABLE public.synthetic_generated_ref')}
      assert.equal(await audit(f,p),true)
    }
    // Dropping an extra attribute leaves a dropped attnum, intentionally still
    // refused by exact column inventory. Keep this final drift in its isolated
    // disposable fixture rather than pretending DROP COLUMN restores it.
    await f.db.exec('ALTER TABLE agentstudio.agent_generated_acceptances ADD COLUMN synthetic_extra text')
    await assert.rejects(audit(f,p,true),/unsafe_agent_generated_privileges/)
  }finally{await f.close()}
})
test('each genuine055/045/witness/ref/mandatory-audit write failure rolls back the whole acceptance, then the same original can commit once',serial,async()=>{
  const f=await fixture()
  try{
    const p=await ready(f),points=[['agent_optimization_intents','INSERT',''],['agent_specs','UPDATE OF spec',''],['agent_optimization_links','INSERT',''],
      ['agent_generated_acceptances','INSERT',''],['agent_generated_feedback_refs','INSERT',''],['audit_events','INSERT',"WHEN (NEW.action='agent.generated_acceptance')"]]
    for(const [table,event,condition] of points){
      await f.db.exec("CREATE FUNCTION agentstudio.synthetic_generated_fault_fn() RETURNS trigger LANGUAGE plpgsql AS $fault$BEGIN RAISE EXCEPTION 'synthetic_generated_write_failure'; END$fault$; REVOKE ALL ON FUNCTION agentstudio.synthetic_generated_fault_fn() FROM PUBLIC; CREATE TRIGGER zz_synthetic_generated_fault BEFORE "+event+' ON agentstudio.'+table+' FOR EACH ROW '+condition+' EXECUTE FUNCTION agentstudio.synthetic_generated_fault_fn()')
      try{await assert.rejects(noMutation(f,()=>call(f,p)),sqlError('synthetic_generated_write_failure'))}
      finally{await f.db.exec('DROP TRIGGER zz_synthetic_generated_fault ON agentstudio.'+table+'; DROP FUNCTION agentstudio.synthetic_generated_fault_fn()')}
    }
    const saved=parseAgentGeneratedReceipt(await call(f,p),p.original);assert.equal(saved.replayed,false)
    assert.deepEqual(await noMutation(f,()=>call(f,p)),{...saved,replayed:true});assert.equal(await audit(f,p),true)
  }finally{await f.close()}
})
