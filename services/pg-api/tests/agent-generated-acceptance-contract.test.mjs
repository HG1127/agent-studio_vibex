// Pure contract/protocol and offline literal-prosrc pin checks only.
// No SQL engine, connection, listener, provider or mutable user state.
import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {parseAgentGeneratedPreviewInput,parseAgentGeneratedAcceptance,parseAgentGeneratedPreview,parseAgentGeneratedReceipt,
  agentGeneratedRequestHash,agentGeneratedPreviewHash,agentGeneratedReceiptHash,agentGeneratedFeedbackHash,agentGeneratedCandidateHash,agentGeneratedChangedKeys,
  agentGeneratedDescriptiveKeys as D,agentGeneratedAcknowledgement} from '../src/agent-generated-acceptance-contract.ts'
import {verifyAgentGeneratedCore,agentGeneratedCheckExpression} from '../src/agent-generated-audit-core.ts'
import {verifyAgentGeneratedCredentials,inspectAgentGeneratedSchema} from '../src/agent-generated-audit.ts'
const clone=v=>structuredClone(v),id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0')
const binding={"protocol":"agent_generated_preview_binding_v1","source":{"review_id":"00000000-0000-4000-8000-000000000001","spec_id":"00000000-0000-4000-8000-000000000002","target_run_id":"00000000-0000-4000-8000-000000000010","review_request_sha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","input_sha256":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","content_sha256":"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc","result_sha256":"970398afce4e1a4d8a75370ca122eeaa8f97c1b4738dccf97f67f140eafb9ffe","completion_sha256":"131316f32a2847821db3060415c354d0d86659adebfc27339bf70fa059812032","source_owner_epoch":5,"source_protocol":"employee_statement_anchor_v1"},"feedback_sources":[{"run_id":"00000000-0000-4000-8000-000000000020","feedback_id":"00000000-0000-4000-8000-000000000030","feedback_sha256":"2222222222222222222222222222222222222222222222222222222222222222","feedback_revision":2,"feedback_source_sha256":"3333333333333333333333333333333333333333333333333333333333333333","statement_sha256":"4444444444444444444444444444444444444444444444444444444444444444"},{"run_id":"00000000-0000-4000-8000-000000000021","feedback_id":"00000000-0000-4000-8000-000000000031","feedback_sha256":"3333333333333333333333333333333333333333333333333333333333333333","feedback_revision":3,"feedback_source_sha256":"4444444444444444444444444444444444444444444444444444444444444444","statement_sha256":"5555555555555555555555555555555555555555555555555555555555555555"}],"feedback_sources_sha256":"4b3f320b0735d977b047e928dee11c6a24530fb3f34922413e5dbb9efb6c4882","anchor":{"run_id":"00000000-0000-4000-8000-000000000020","feedback_id":"00000000-0000-4000-8000-000000000030"},"before":{"revision":41,"source_sha256":"6666666666666666666666666666666666666666666666666666666666666666","descriptive":{"goal":"旧目标😀","task_scope":"范围","deliverables":["现有"],"task_plan":[],"done_criteria":[]}},"candidate":{"descriptive":{"goal":"新目标😀","task_scope":"边界:只改描述","deliverables":["核对"],"task_plan":["实施"],"done_criteria":["验收"]},"candidate_sha256":"4346238ecc429d9014e822a8aea5e70fc8a41027ead2cb096a4a853762c5eec5"},"changed_keys":["goal","task_scope","deliverables","task_plan","done_criteria"]}
const original={"action":"accept","request_id":"00000000-0000-4000-8000-000000000099","review_id":"00000000-0000-4000-8000-000000000001","spec_id":"00000000-0000-4000-8000-000000000002","target_run_id":"00000000-0000-4000-8000-000000000010","anchor_run_id":"00000000-0000-4000-8000-000000000020","anchor_feedback_id":"00000000-0000-4000-8000-000000000030","expected_preview_sha256":"8f4aa4b5aafcb31dff37e4398c47881adeedd0e117b3b41f65035410d5b9dcfc","expected_result_sha256":"970398afce4e1a4d8a75370ca122eeaa8f97c1b4738dccf97f67f140eafb9ffe","expected_spec_revision":41,"expected_spec_sha256":"6666666666666666666666666666666666666666666666666666666666666666","expected_candidate_sha256":"4346238ecc429d9014e822a8aea5e70fc8a41027ead2cb096a4a853762c5eec5","confirm":true,"acceptance_acknowledgement":"APPROVE_EXACT_GENERATED_DESCRIPTIVE_ROLE_CHANGE_V1"}
const core={"protocol":"agent_generated_acceptance_receipt_v1","source_kind":"generated_opinion","request_id":"00000000-0000-4000-8000-000000000099","request_sha256":"9ef887bfb3cc9ce0f19c83a5fae0bc34560acc6103b3daaa545fb96c8a49692f","source":{"review_id":"00000000-0000-4000-8000-000000000001","spec_id":"00000000-0000-4000-8000-000000000002","target_run_id":"00000000-0000-4000-8000-000000000010","review_request_sha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","input_sha256":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","content_sha256":"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc","result_sha256":"970398afce4e1a4d8a75370ca122eeaa8f97c1b4738dccf97f67f140eafb9ffe","completion_sha256":"131316f32a2847821db3060415c354d0d86659adebfc27339bf70fa059812032","source_owner_epoch":5,"source_protocol":"employee_statement_anchor_v1"},"feedback_sources":[{"run_id":"00000000-0000-4000-8000-000000000020","feedback_id":"00000000-0000-4000-8000-000000000030","feedback_sha256":"2222222222222222222222222222222222222222222222222222222222222222","feedback_revision":2,"feedback_source_sha256":"3333333333333333333333333333333333333333333333333333333333333333","statement_sha256":"4444444444444444444444444444444444444444444444444444444444444444"},{"run_id":"00000000-0000-4000-8000-000000000021","feedback_id":"00000000-0000-4000-8000-000000000031","feedback_sha256":"3333333333333333333333333333333333333333333333333333333333333333","feedback_revision":3,"feedback_source_sha256":"4444444444444444444444444444444444444444444444444444444444444444","statement_sha256":"5555555555555555555555555555555555555555555555555555555555555555"}],"feedback_sources_sha256":"4b3f320b0735d977b047e928dee11c6a24530fb3f34922413e5dbb9efb6c4882","anchor":{"run_id":"00000000-0000-4000-8000-000000000020","feedback_id":"00000000-0000-4000-8000-000000000030"},"before":{"revision":41,"source_sha256":"6666666666666666666666666666666666666666666666666666666666666666","revision_id":"00000000-0000-4000-8000-000000000090"},"after":{"revision":42,"source_sha256":"7777777777777777777777777777777777777777777777777777777777777777","revision_id":"00000000-0000-4000-8000-000000000091"},"candidate_sha256":"4346238ecc429d9014e822a8aea5e70fc8a41027ead2cb096a4a853762c5eec5","changed_keys":["goal","task_scope","deliverables","task_plan","done_criteria"],"preview_sha256":"8f4aa4b5aafcb31dff37e4398c47881adeedd0e117b3b41f65035410d5b9dcfc","acceptance_owner_epoch":5,"created_at":"2026-10-27T01:02:03.123Z"}
const beforeSpec={"goal":"旧目标😀","task_scope":"范围","deliverables":["现有"],"task_plan":[],"done_criteria":[],"tools":[],"knowledge_base_ids":[],"model_binding":{"connection_id":"00000000-0000-4000-8000-000000000040","connection_revision":7,"model_id":"synthetic"},"require_approval":true,"require_plan_review":true}
const candidateSpec={"goal":"新目标😀","task_scope":"边界:只改描述","deliverables":["核对"],"task_plan":["实施"],"done_criteria":["验收"],"tools":[],"knowledge_base_ids":[],"model_binding":{"connection_id":"00000000-0000-4000-8000-000000000040","connection_revision":7,"model_id":"synthetic"},"require_approval":true,"require_plan_review":true}
const hashes={"candidate":"4346238ecc429d9014e822a8aea5e70fc8a41027ead2cb096a4a853762c5eec5","feedback":"4b3f320b0735d977b047e928dee11c6a24530fb3f34922413e5dbb9efb6c4882","preview":"8f4aa4b5aafcb31dff37e4398c47881adeedd0e117b3b41f65035410d5b9dcfc","request":"9ef887bfb3cc9ce0f19c83a5fae0bc34560acc6103b3daaa545fb96c8a49692f","receipt":"d8c7bb9fef3352c106383ebb63c1dec67654491d94f8b539eed69fe0dddd3db7"}
delete binding.protocol // Golden hash input includes its domain; helper accepts exact7.
const preview=()=>({protocol:'agent_generated_preview_v1',...clone(binding),preview_sha256:hashes.preview,recorded:false})
const receipt=(replayed=false)=>({...clone(core),receipt_sha256:hashes.receipt,recorded:true,replayed})
const input={action:'preview',review_id:original.review_id,spec_id:original.spec_id,target_run_id:original.target_run_id}
const invalid=e=>e.status===400&&e.code==='invalid_agent_generated_request'
const unavailable=e=>e.status===409&&e.code==='agent_generated_unavailable'
test('stable exact4 and14 inputs return detached originals without adding a computed hash or paid intent',()=>{
  assert.deepEqual(parseAgentGeneratedPreviewInput(input),input);assert.deepEqual(parseAgentGeneratedAcceptance(original),original)
  assert.equal(Object.keys(parseAgentGeneratedAcceptance(original)).length,14);assert.equal(parseAgentGeneratedAcceptance(original).request_sha256,undefined)
  for(const raw of [null,[],{}, {...input,owner_user_id:id(1)},{...input,action:'accept'},{...input,review_id:'INVALID'}])assert.throws(()=>parseAgentGeneratedPreviewInput(raw),invalid)
  for(const patch of [{owner:id(1)},{request_sha256:hashes.request},{name:'edited'},{spec:candidateSpec},{descriptive:{}},{result:{}},{confirm:false},{action:'confirm'},{acceptance_acknowledgement:'APPROVE_ONE_PAID_AGENT_OPTIMIZATION_V1'},{request_id:original.review_id},{request_id:original.anchor_feedback_id},{expected_spec_revision:'41'},{expected_spec_revision:0},{expected_spec_revision:Number.MAX_SAFE_INTEGER},{expected_candidate_sha256:'A'.repeat(64)}])assert.throws(()=>parseAgentGeneratedAcceptance({...original,...patch}),invalid)
})
test('five canonical SHA families match frozen independent golden vectors including Unicode and target/anchor separation',()=>{
  assert.equal(agentGeneratedCandidateHash('Synthetic retained name',candidateSpec),hashes.candidate)
  assert.equal(agentGeneratedFeedbackHash(binding.feedback_sources),hashes.feedback)
  assert.equal(agentGeneratedPreviewHash(binding),hashes.preview)
  assert.equal(agentGeneratedRequestHash(original),hashes.request)
  assert.equal(agentGeneratedReceiptHash(core),hashes.receipt)
  assert.equal(binding.before.descriptive.goal,'旧目标😀')
  assert.notEqual(binding.source.target_run_id,binding.anchor.run_id)
  assert.notEqual(agentGeneratedRequestHash({...original,request_id:id(98)}),hashes.request)
  assert.throws(()=>agentGeneratedPreviewHash(preview()),invalid,'binding helper takes exact7 rather than public10')
  assert.throws(()=>agentGeneratedReceiptHash(receipt()),invalid,'receipt helper takes exact15 rather than public18')
})
test('preview visible hashes, canonical refs, complete descriptions, D-order changes and requested scope must all agree',()=>{
  assert.deepEqual(parseAgentGeneratedPreview(preview(),input),preview())
  for(const patch of [{recorded:true},{available:true},{messages:[]},{protocol:'agent_feedback_optimization_v1'},{preview_sha256:'f'.repeat(64)},{feedback_sources_sha256:'e'.repeat(64)},{anchor:{run_id:id(21),feedback_id:id(31)}},{changed_keys:['task_scope','goal']},{changed_keys:[]},{changed_keys:['goal','tools']},{changed_keys:['goal','goal']}])assert.throws(()=>parseAgentGeneratedPreview({...preview(),...patch}),unavailable)
  assert.throws(()=>parseAgentGeneratedPreview(preview(),{...input,target_run_id:id(11)}),unavailable)
  assert.throws(()=>parseAgentGeneratedPreview({...preview(),candidate:{...binding.candidate,descriptive:{goal:'partial'}}}),unavailable)
  const p=parseAgentGeneratedPreview(preview());p.candidate.descriptive.deliverables[0]='changed';p.feedback_sources[0].feedback_sha256='0'.repeat(64)
  assert.equal(parseAgentGeneratedPreview(preview()).candidate.descriptive.deliverables[0],'核对');assert.equal(binding.feedback_sources[0].feedback_sha256,'2'.repeat(64))
})
test('feedback metadata is immutable canonical1..8 actual-ref shape; parser never silently sorts, truncates or accepts duplicate runs',()=>{
  const refs=binding.feedback_sources
  for(const bad of [[],[...refs].reverse(),[refs[0],refs[0]],Array(9).fill(refs[0]),[{...refs[0],owner:id(1)}],[{...refs[0],feedback_revision:1.1}],[{...refs[0],feedback_source_sha256:'bad'}]])assert.throws(()=>agentGeneratedFeedbackHash(bad),invalid)
  const result=parseAgentGeneratedReceipt(receipt());result.feedback_sources[0].run_id=id(999)
  assert.equal(core.feedback_sources[0].run_id,id(20));assert.equal(result.recorded,true);assert.equal(result.source_kind,'generated_opinion')
})
test('full-capacity complete-five preserves all text and resource candidate hashing without the old proposal-size cap',()=>{
  const full={goal:'界'.repeat(3000),task_scope:'😀'.repeat(2000),deliverables:Array(30).fill('交'.repeat(500)),task_plan:Array(30).fill('计'.repeat(500)),done_criteria:Array(30).fill('验'.repeat(500))}
  const b=clone(binding);b.candidate.descriptive=full;b.changed_keys=agentGeneratedChangedKeys(b.before.descriptive,full)
  const p=parseAgentGeneratedPreview({protocol:'agent_generated_preview_v1',...b,preview_sha256:agentGeneratedPreviewHash(b),recorded:false})
  assert.deepEqual(p.candidate.descriptive,full);assert.ok(JSON.stringify(p).length>23000)
  for(const key of Object.keys(beforeSpec))if(!D.includes(key))assert.deepEqual(beforeSpec[key],candidateSpec[key])
  assert.throws(()=>agentGeneratedChangedKeys(full,full),e=>e.status===409&&e.code==='agent_generated_change_required')
  for(const value of [full.goal+'x','\ud800','bad\0value']){
    const invalidBinding=clone(b);invalidBinding.candidate.descriptive.goal=value
    assert.throws(()=>agentGeneratedPreviewHash(invalidBinding))
  }
})
test('closed records and dense descriptive arrays reject getters/symbols/prototypes before evaluating private values',()=>{
  let gets=0
  const body={...original};Object.defineProperty(body,'expected_spec_revision',{get(){gets++;return 41}})
  assert.throws(()=>parseAgentGeneratedAcceptance(body),invalid)
  assert.throws(()=>parseAgentGeneratedAcceptance({...original,[Symbol('owner')]:id(1)}),invalid)
  assert.throws(()=>parseAgentGeneratedAcceptance(Object.assign(Object.create({owner:id(1)}),original)),invalid)
  const unsafe=preview();Object.defineProperty(unsafe.source,'input_sha256',{get(){gets++;return 'b'.repeat(64)}})
  assert.throws(()=>parseAgentGeneratedPreview(unsafe),unavailable)
  const b=clone(binding),list=['private'];Object.defineProperty(list,'0',{get(){gets++;return 'private'}});b.candidate.descriptive.deliverables=list
  assert.throws(()=>agentGeneratedPreviewHash(b),invalid);assert.equal(gets,0)
  const sparse=clone(binding);sparse.candidate.descriptive.deliverables=new Array(1);assert.throws(()=>agentGeneratedPreviewHash(sparse),invalid)
})
test('permanent receipt is a detached exact18 configuration witness with genuine original intent binding, no private result/cache/fee fields',()=>{
  for(const replayed of [true,false])assert.deepEqual(parseAgentGeneratedReceipt(receipt(replayed),original),receipt(replayed))
  for(const patch of [{result:{score:0}},{available:false},{owner:id(1)},{recorded:false},{replayed:1},{protocol:'agent_paid_review_receipt_v1'},{source_kind:'manual'},{receipt_sha256:'f'.repeat(64)},{created_at:'2026-02-30T01:02:03.000Z'},{created_at:'0000-01-01T00:00:00.000Z'}])assert.throws(()=>parseAgentGeneratedReceipt({...receipt(),...patch}),unavailable)
  assert.throws(()=>parseAgentGeneratedReceipt(receipt(),{...original,request_id:id(98)}),unavailable)
  assert.throws(()=>parseAgentGeneratedReceipt(receipt(),{...original,expected_candidate_sha256:'f'.repeat(64)}),unavailable)
  const sealed=parseAgentGeneratedReceipt(receipt());sealed.before.revision=0;assert.equal(core.before.revision,41)
  assert.doesNotMatch(JSON.stringify(receipt()),/"(?:result|messages|choice|model_binding|worker_id|lease_token|fee_acknowledgement|descriptive|owner_user_id)"/)
})
test('receipt rejects epoch/revision/anchor/feedback contradictions even if a caller tries to reseal metadata',()=>{
  for(const patch of [{acceptance_owner_epoch:6},{after:{...core.after,revision:43}},{before:{...core.before,revision:Number.MAX_SAFE_INTEGER}},{after:{...core.after,revision_id:core.before.revision_id}},{request_id:core.source.review_id},{request_id:core.feedback_sources[0].feedback_id},{anchor:{run_id:id(21),feedback_id:id(31)}},{changed_keys:['tools']}])assert.throws(()=>agentGeneratedReceiptHash({...clone(core),...patch}),invalid)
  const bad=receipt();bad.source.source_protocol='current_task_delivery_v1';assert.throws(()=>parseAgentGeneratedReceipt(bad),unavailable)
})
test('safe positive integer edge and real calendar remain exact rather than numeric/string coercion',()=>{
  const c=clone(core);c.source.source_owner_epoch=Number.MAX_SAFE_INTEGER-2;c.acceptance_owner_epoch=c.source.source_owner_epoch;c.before.revision=Number.MAX_SAFE_INTEGER-2;c.after.revision=Number.MAX_SAFE_INTEGER-1;c.created_at='0001-01-01T00:00:00.000Z'
  const r={...c,receipt_sha256:agentGeneratedReceiptHash(c),recorded:true,replayed:true};assert.equal(parseAgentGeneratedReceipt(r).after.revision,Number.MAX_SAFE_INTEGER-1)
  assert.throws(()=>agentGeneratedReceiptHash({...c,created_at:'1900-02-29T00:00:00.000Z'}),invalid)
  assert.equal(original.acceptance_acknowledgement,agentGeneratedAcknowledgement)
})
test('actual authored059 raw UTF8 prosrc bytes match only the two literal core pins; no source execution or newline normalization',()=>{
  const sql=readFileSync(new URL('../../../db/postgres/migrations/pg_v9_059_agent_generated_acceptance.sql',import.meta.url),'utf8'),audit=readFileSync(new URL('../src/agent-generated-audit-core.ts',import.meta.url),'utf8'),found=[]
  for(const m of sql.matchAll(/CREATE FUNCTION agentstudio\.(agent_generated_\w+)\([^]*?AS \$fn\$([^]*?)\$fn\$;/g)){
    const digest=createHash('sha256').update(m[2],'utf8').digest('hex');found.push(m[1]);assert.ok(audit.includes('sha:"'+digest+'"'),m[1]+' raw prosrc pin')
  }
  assert.deepEqual(found.toSorted(),['agent_generated_accept','agent_generated_receipt'])
  assert.equal((sql.match(/CREATE TABLE agentstudio\.agent_generated_/g)||[]).length,2)
  assert.doesNotMatch(audit,/from ["'][^"']*agent-(?:opinion|assessment|review|optimization)-audit/)
})
test('standalone audit absence differs from partial/drift and full audit fails closed; synthetic query doubles open no SQL connection',async()=>{
  const absence={async query(sql){
    if(sql.includes('has_column_privilege'))return {rows:[{ok:true}]}
    if(sql.includes("version='pg_v9_059'"))return {rows:[{installed:false,predecessor:true}]}
    if(sql.startsWith('SELECT NOT EXISTS'))return {rows:[{ok:true}]}
    return {rows:[]}
  }}
  assert.equal(await verifyAgentGeneratedCore(absence),false);assert.equal(await verifyAgentGeneratedCredentials(absence),false)
  const partial={async query(sql,args){if(sql.includes('oidvectortypes'))return {rows:[{name:'agent_generated_accept',args:'jsonb',sha:'0'.repeat(64),ok:true}]};return absence.query(sql,args)}}
  await assert.rejects(verifyAgentGeneratedCore(partial),/unsafe_agent_generated_privileges/)
  await assert.rejects(verifyAgentGeneratedCredentials({async query(){throw Error('private driver diagnostic')}}),/unsafe_agent_generated_privileges/)
})
test('startup inspector uses only readonly catalog transaction and always rollback/releases without actor or body authority',async()=>{
  const trace=[];let released=0
  const pool={async connect(){return {release(){released++},async query(sql){
    trace.push(sql)
    if(sql.includes('has_column_privilege'))return {rows:[{ok:true}]}
    if(sql.includes("version='pg_v9_059'"))return {rows:[{installed:false,predecessor:true}]}
    if(sql.startsWith('SELECT NOT EXISTS'))return {rows:[{ok:true}]}
    return {rows:[]}
  }}}}
  assert.equal(await inspectAgentGeneratedSchema(pool),false)
  assert.deepEqual(trace.slice(0,2),['BEGIN READ ONLY','SET LOCAL ROLE agentstudio_api']);assert.equal(trace.at(-1),'ROLLBACK');assert.equal(released,1)
  assert.ok(!trace.some(sql=>/set_config|identity_user_id|agent_memory_outcome_epoch|^\s*(?:INSERT|UPDATE|DELETE|MERGE)\b/.test(sql)))
  let failureRelease=0;const broken={async connect(){return {release(){failureRelease++},async query(sql){if(sql==='ROLLBACK')return {rows:[]};throw Error('synthetic catalog failure')}}}}
  await assert.rejects(inspectAgentGeneratedSchema(broken),/unsafe_agent_generated_privileges/);assert.equal(failureRelease,1)
})
test('CHECK expression comparison tolerates only redundant fixed conjunction syntax and typed literal rendering, never column casts or changed values',()=>{
  const normalize=agentGeneratedCheckExpression,expected='source_owner_epoch >= 1 AND source_owner_epoch <= 9007199254740989 AND acceptance_owner_epoch = source_owner_epoch'
  assert.equal(normalize("(((source_owner_epoch >= 1) AND (source_owner_epoch <= '9007199254740989'::bigint)) AND (acceptance_owner_epoch = source_owner_epoch))"),normalize(expected))
  assert.equal(normalize("source_kind='generated_opinion'::text"),normalize("(source_kind = 'generated_opinion')"))
  assert.equal(normalize("changed_keys <@ '[\"goal\", \"task_scope\"]'::jsonb"),normalize("changed_keys <@ '[\"goal\",\"task_scope\"]'::jsonb"))
  for(const changed of [expected.replace('AND','OR'),expected.replace('source_owner_epoch >=','source_owner_epoch::integer >='),expected.replace('9007199254740989','9007199254740990')])assert.notEqual(normalize(changed),normalize(expected))
  assert.notEqual(normalize("source_kind='generated _opinion'"),normalize("source_kind='generated_opinion'"))
  assert.notEqual(normalize("public.jsonb_typeof(changed_keys)='array'"),normalize("jsonb_typeof(changed_keys)='array'"))
})
test('foreign-schema generated inventory is refused before optional absence can return false',async()=>{
  const trace=[]
  const foreign={async query(sql){
    trace.push(sql)
    if(sql.startsWith('SELECT NOT EXISTS'))return {rows:[{ok:false}]}
    return {rows:[]}
  }}
  await assert.rejects(verifyAgentGeneratedCore(foreign),/unsafe_agent_generated_privileges/)
  const inventory=trace.find(sql=>sql.startsWith('SELECT NOT EXISTS'))
  for(const catalog of ['pg_class c','pg_proc p','pg_type t','pg_constraint x'])assert.ok(inventory.includes(catalog))
  assert.equal((inventory.match(/n\.nspname<>'agentstudio'/g)||[]).length,4)
  assert.ok(!trace.some(sql=>sql.includes('has_column_privilege')),'unsafe foreign inventory cannot be downgraded to absent schema')
})
