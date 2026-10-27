// Hosted synthetic SQL only. Internal readonly preparation, no provider.
import test from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {agentMemoryFixture} from './helpers/agent-memory-fixture.mjs'
import {AgentReviewSourceRepository} from '../src/agent-review-source.ts'
import {AgentFeedbackRepository} from '../src/agent-feedback-repository.ts'
import {AutonomousAgentRunRepository} from '../src/autonomous-agent-run-repository.ts'
import {KnowledgeAccessRepository} from '../src/knowledge-access-repository.ts'
import {safeAgentSpec} from '../src/contracts.ts'
import {withActor} from '../src/repository.ts'
async function fixture(){
  const f=await agentMemoryFixture()
  try{
    for(const part of ['051_agent_memory_derived','052_agent_memory_outcome','053_agent_memory_failure_source','054_agent_feedback','055_agent_optimization'])await f.db.exec(f.sql('migrations/pg_v9_'+part+'.sql'))
    return {...f,review:new AgentReviewSourceRepository(f.pool),owned:new AutonomousAgentRunRepository(f.pool,{allowHumanInput:true}),feedback:new AgentFeedbackRepository(f.pool,{allowSubmit:true,allowLessonStorage:true})}
  }catch(error){await f.close();throw error}
}
async function source(f,{cancel=true,remember=false,comment='Synthetic review statement token=syntheticReviewSourceFeedback'}={}){
  const role=await f.agents.get(f.identities.alice,f.resources.alice.spec.id)
  const result=await f.owned.submit(f.identities.alice,role.id,{expected_revision:role.revision,max_steps:1,require_plan_review:false,idempotency_key:'synthetic-review-source-'+randomUUID(),instruction:'Synthetic selected private task token=syntheticReviewSourceTask'})
  if(!cancel)return {role,runId:result.run.id}
  await f.owned.cancel(f.identities.alice,result.run.id)
  const state=await f.feedback.status(f.identities.alice,result.run.id)
  const body={action:'submit',request_id:randomUUID(),spec_id:role.id,run_id:result.run.id,expected_revision:0,expected_source_sha256:state.source.source_sha256,rating:'down',tags:['核对😀'],comment,remember_lesson:remember,confirm:true}
  const receipt=await f.feedback.change(f.identities.alice,body)
  return {role,runId:result.run.id,body,receipt}
}
async function choice(f,s,purpose='optimize'){
  const state=await f.review.source(f.identities.alice,{purpose,spec_id:s.role.id,run_id:s.runId})
  return {action:'preview',purpose,spec_id:s.role.id,run_id:s.runId,expected_spec_revision:state.expected_spec_revision,expected_spec_sha256:state.expected_spec_sha256,expected_source_sha256:state.expected_source_sha256,model_binding:s.role.spec.model_binding,output_token_limit:2048,feedback_sources:purpose==='optimize'?[{run_id:s.runId,feedback_id:s.receipt.feedback_id,feedback_sha256:s.receipt.feedback_sha256}]:[],evaluation_sources:[]}
}
const counts=async f=>(await f.db.query('SELECT (SELECT count(*) FROM agentstudio.jobs)::integer AS jobs,(SELECT count(*) FROM agentstudio.external_effects)::integer AS effects,(SELECT count(*) FROM agentstudio.agent_optimization_links)::integer AS accepted,(SELECT count(*) FROM agentstudio.audit_events)::integer AS audits')).rows[0]
test('readonly review source derives actual Native owner/role/terminal guards and seals the selected current statement without a fee receipt, effect or role edit',async()=>{
  const f=await fixture();try{
    const s=await source(f),v=await choice(f,s),before=await counts(f),result=await f.review.preview(f.identities.alice,v),data=JSON.parse(result.messages[1].content)
    assert.equal(result.recorded,false);assert.equal(result.source_protocol,'employee_statement_anchor_v1');assert.match(result.input_sha256,/^[a-f0-9]{64}$/);assert.equal(data.task,null);assert.equal(data.employee_statements[0].comment,'Synthetic review statement token=***');assert.notEqual(result.input_sha256,result.content_sha256)
    assert.doesNotMatch(JSON.stringify(result.messages),/syntheticReviewSourceTask|syntheticReviewSourceFeedback|checkpoint|model_binding|api_key_ciphertext/);assert.deepEqual(await counts(f),before)
    assert.equal((await f.agents.get(f.identities.alice,s.role.id)).revision,s.role.revision)
  }finally{await f.close()}
})
test('evaluation has a separate current-task protocol, includes only final/task text and treats cancellation as cancellation rather than successful VM evidence',async()=>{
  const f=await fixture();try{
    const s=await source(f),v=await choice(f,s,'evaluate'),result=await f.review.preview(f.identities.alice,v),data=JSON.parse(result.messages[1].content)
    assert.equal(result.source_protocol,'current_task_delivery_v1');assert.equal(data.task.status,'cancelled');assert.equal(data.task.instruction,'Synthetic selected private task token=***');assert.equal(data.task.delivery,'');assert.equal(data.employee_statements.length,0)
    assert.doesNotMatch(result.messages[1].content,/thinking|pending_effect|graph|model_binding/)
    const other=await choice(f,s);assert.notEqual(v.expected_source_sha256,other.expected_source_sha256)
    await assert.rejects(f.review.preview(f.identities.alice,{...v,expected_source_sha256:other.expected_source_sha256}),e=>e.status===409)
    await f.db.query("INSERT INTO agentstudio.external_effects(run_id,owner_user_id,step_key,tool_name,arguments_sha256,idempotency_key,status) VALUES($1,$2,'synthetic-review-uncertain','synthetic:model',repeat('a',64),$3,'started')",[s.runId,f.users.alice,'synthetic-review-uncertain-'+randomUUID()])
    await assert.rejects(f.review.preview(f.identities.alice,v),e=>e.status===409)
    await f.db.query("UPDATE agentstudio.external_effects SET status='unknown' WHERE run_id=$1",[s.runId]);await assert.rejects(f.review.source(f.identities.alice,{purpose:'evaluate',spec_id:s.role.id,run_id:s.runId}),e=>e.status===409)
    const quotes=await f.review.preview(f.identities.alice,other);assert.equal(JSON.parse(quotes.messages[1].content).task,null);assert.equal((await counts(f)).effects,1)
  }finally{await f.close()}
})
test('actual completed Worker delivery remains complete in evaluation input, with exactly the original synthetic model call and no new review effect',async()=>{
  const f=await fixture();try{
    const s=await source(f,{cancel:false}),answer='完整核对结果。'.repeat(1000);let originalCalls=0
    await f.privateTls(async()=>{originalCalls++;return JSON.stringify({action:'answer',answer})},async make=>{assert.equal((await f.drive(()=>make({humanInputApproved:true}),s.runId,()=> 'approved',30)).run.status,'succeeded')})
    const v=await choice(f,s,'evaluate'),before=await counts(f),prepared=await f.review.preview(f.identities.alice,v),data=JSON.parse(prepared.messages[1].content)
    assert.equal(data.task.status,'succeeded');assert.equal(data.task.delivery,answer);assert.ok(data.task.delivery.length>4000);assert.equal(originalCalls,1);assert.deepEqual(await counts(f),before)
  }finally{await f.close()}
})
test('foreign employees, non-Native identities, mismatched role/run, ongoing tasks and forged source/provenance fields cannot prepare review input',async()=>{
  const f=await fixture();try{
    const s=await source(f),v=await choice(f,s)
    await assert.rejects(f.review.preview(f.identities.bob,v),e=>e.status===404)
    await assert.rejects(f.review.preview({issuer:'https://foreign.invalid',subject:'arbitrary-owner'},v),e=>e.status===403)
    await assert.rejects(f.review.source(f.identities.alice,{purpose:'evaluate',spec_id:f.resources.bob.spec.id,run_id:s.runId}),e=>e.status===404)
    const waiting=await source(f,{cancel:false});await assert.rejects(f.review.source(f.identities.alice,{purpose:'evaluate',spec_id:waiting.role.id,run_id:waiting.runId}),e=>e.status===409)
    for(const patch of [{expected_spec_revision:v.expected_spec_revision+1},{expected_spec_sha256:'f'.repeat(64)},{expected_source_sha256:'e'.repeat(64)}])await assert.rejects(f.review.preview(f.identities.alice,{...v,...patch}),e=>e.status===409)
    for(const patch of [{owner_user_id:f.users.alice},{fee_acknowledgement:'APPROVE_ONE_PAID_AGENT_OPTIMIZATION_V1'},{recorded:true},{private_checkpoint:{}},{accepted_revision_id:randomUUID()}])await assert.rejects(f.review.preview(f.identities.alice,{...v,...patch}),e=>e.status===400)
  }finally{await f.close()}
})
test('identical-text feedback correction binds the new immutable generation; erased or forged body text cannot be reused as optimization material',async()=>{
  const f=await fixture();try{
    const s=await source(f),v=await choice(f,s),before=await f.review.preview(f.identities.alice,v)
    const next=await f.feedback.change(f.identities.alice,{...s.body,request_id:randomUUID(),expected_revision:1})
    assert.equal(next.statement_sha256,s.receipt.statement_sha256);assert.notEqual(next.feedback_sha256,s.receipt.feedback_sha256)
    await assert.rejects(f.review.preview(f.identities.alice,v),e=>e.code==='agent_review_feedback_changed')
    const fresh={...v,feedback_sources:[{run_id:s.runId,feedback_id:next.feedback_id,feedback_sha256:next.feedback_sha256}]};assert.notEqual((await f.review.preview(f.identities.alice,fresh)).input_sha256,before.input_sha256)
    await f.db.query("UPDATE agentstudio.agent_feedback_bodies SET comment='synthetic tampered body' WHERE owner_user_id=$1 AND feedback_id=$2",[f.users.alice,next.feedback_id]);await assert.rejects(f.review.preview(f.identities.alice,fresh),e=>e.code==='agent_review_feedback_changed')
  }finally{await f.close()}
})
test('feedback erasure and forget-only receipts are distinguished: forgetting a lesson preserves a statement but erasure invalidates future paid input preparation',async()=>{
  const f=await fixture();try{
    const s=await source(f,{remember:true}),v=await choice(f,s),prepared=await f.review.preview(f.identities.alice,v)
    assert.equal(s.receipt.lesson_result.decision,'stored')
    await new AgentFeedbackRepository(f.pool).change(f.identities.alice,{action:'forget_lesson',request_id:randomUUID(),spec_id:s.role.id,run_id:s.runId,feedback_id:s.receipt.feedback_id,expected_content_sha256:s.receipt.lesson_result.content_sha256,confirm:true})
    assert.equal((await f.review.preview(f.identities.alice,v)).input_sha256,prepared.input_sha256)
    const state=await f.feedback.status(f.identities.alice,s.runId)
    await f.feedback.change(f.identities.alice,{action:'erase_feedback',request_id:randomUUID(),spec_id:s.role.id,run_id:s.runId,expected_revision:state.revision,expected_feedback_sha256:state.current.feedback_sha256,confirm:true})
    await assert.rejects(f.review.preview(f.identities.alice,v),e=>e.code==='agent_review_feedback_changed')
    assert.equal((await f.db.query('SELECT count(*)::integer AS n FROM agentstudio.agent_feedback_bodies')).rows[0].n,0)
  }finally{await f.close()}
})
test('the separately selected review model is owner/version/status/model constrained and no credentials are read or implicitly inherited from the role',async()=>{
  const f=await fixture();try{
    const s=await source(f),v=await choice(f,s)
    for(const model of [{...v.model_binding,connection_id:f.resources.bob.model.id},{...v.model_binding,connection_revision:v.model_binding.connection_revision+1},{...v.model_binding,model_id:'not-selected'}])await assert.rejects(f.review.preview(f.identities.alice,{...v,model_binding:model}),e=>e.status===409)
    const id=v.model_binding.connection_id;await f.db.query('UPDATE agentstudio.model_connections SET enabled=false,revision=revision+1 WHERE id=$1',[id]);await assert.rejects(f.review.preview(f.identities.alice,v),e=>e.status===409)
  }finally{await f.close()}
})
test('pruned checkpoints and revoked original KB prevent task-content evaluation, while explicit statement-only optimization after current-role repair discloses no old task or KB content',async()=>{
  const f=await fixture();try{
    const access=new KnowledgeAccessRepository(f.pool,async()=>({id:f.users.alice,display_name:'Synthetic Alice'})),kb=f.resources.bob.kb.id
    const grant=await access.change(f.identities.bob,kb,{action:'grant',request_id:randomUUID(),expected_revision:0,recipient_email:'alice@example.test',role:'viewer',semantic_allowed:false})
    let role=await f.agents.get(f.identities.alice,f.resources.alice.spec.id);const {require_approval:_,...spec}=role.spec
    await f.agents.update(f.identities.alice,role.id,role.name,safeAgentSpec({...spec,knowledge_base_ids:[kb]}),role.revision)
    const s=await source(f),evaluation=await choice(f,s,'evaluate'),optimization=await choice(f,s)
    await access.change(f.identities.bob,kb,{action:'revoke',request_id:randomUUID(),recipient_id:f.users.alice,expected_revision:grant.item.revision})
    await assert.rejects(f.review.preview(f.identities.alice,evaluation),e=>e.status===404||e.status===409)
    await f.db.query("UPDATE agentstudio.runs SET checkpoint='{}'::jsonb,result_text='Private revoked original delivery' WHERE id=$1",[s.runId])
    role=await f.agents.get(f.identities.alice,role.id);const {require_approval:approval,...current}=role.spec
    await f.agents.update(f.identities.alice,role.id,role.name,safeAgentSpec({...current,knowledge_base_ids:[]}),role.revision)
    const fresh=await choice(f,s),prepared=await f.review.preview(f.identities.alice,fresh);assert.equal(prepared.source_protocol,'employee_statement_anchor_v1');assert.equal(JSON.parse(prepared.messages[1].content).task,null);assert.doesNotMatch(prepared.messages[1].content,/Private revoked original delivery|checkpoint/)
    await assert.rejects(f.review.source(f.identities.alice,{purpose:'evaluate',spec_id:role.id,run_id:s.runId}),e=>e.status===409)
    await assert.rejects(f.review.preview(f.identities.alice,optimization),e=>e.status===409)
  }finally{await f.close()}
})
test('Native governance ABA changes the prepared input digest even when message content and selected sources remain identical; disabled identity cannot prepare',async()=>{
  const f=await fixture();try{
    const s=await source(f),v=await choice(f,s),before=await f.review.preview(f.identities.alice,v)
    await f.db.query('UPDATE agentstudio_auth.accounts SET governance_revision=governance_revision+2 WHERE user_id=$1',[f.users.alice])
    const after=await f.review.preview(f.identities.alice,v);assert.equal(before.content_sha256,after.content_sha256);assert.notEqual(before.input_sha256,after.input_sha256);assert.equal(after.owner_epoch,before.owner_epoch+2)
    await f.db.query('UPDATE agentstudio_auth.accounts SET enabled=false WHERE user_id=$1',[f.users.alice]);await assert.rejects(f.review.preview(f.identities.alice,v),e=>e.status===403)
  }finally{await f.close()}
})
test('previous model opinions require an installed protected ledger reader; unknown DB errors and schema drift never manufacture a prepared result',async()=>{
  const f=await fixture();try{
    const s=await source(f),v=await choice(f,s),before=await counts(f)
    await assert.rejects(f.review.preview(f.identities.alice,{...v,evaluation_sources:[{run_id:s.runId,review_id:randomUUID(),result_sha256:'f'.repeat(64)}]}),e=>e.code==='agent_review_evaluation_source_unavailable')
    f.setFault(sql=>{if(sql.startsWith('SELECT revision,enabled,status,models,provider,base_url FROM agentstudio.model_connections'))throw Error('synthetic_review_source_read_failure')})
    try{await assert.rejects(f.review.preview(f.identities.alice,v),/synthetic_review_source_read_failure/)}finally{f.setFault(undefined)}
    assert.equal((await f.review.preview(f.identities.alice,v)).recorded,false)
    await f.db.exec('GRANT INSERT ON agentstudio.agent_optimization_links TO agentstudio_api');await assert.rejects(f.review.preview(f.identities.alice,v),/unsafe_agent_optimization_privileges/)
    assert.deepEqual(await counts(f),before)
  }finally{await f.close()}
})
