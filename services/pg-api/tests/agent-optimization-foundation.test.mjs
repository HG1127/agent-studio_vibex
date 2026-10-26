// Actual synthetic SQL only in hosted isolation; no model/provider transport.
import test from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID,createHash} from 'node:crypto'
import {agentMemoryFixture} from './helpers/agent-memory-fixture.mjs'
import {AgentFeedbackRepository} from '../src/agent-feedback-repository.ts'
import {AutonomousAgentRunRepository} from '../src/autonomous-agent-run-repository.ts'
import {AgentOptimizationRepository} from '../src/agent-optimization-repository.ts'
import {inspectAgentOptimizationSchema,verifyAgentOptimizationCredentials} from '../src/agent-optimization-audit.ts'
import {verifyAgentFeedbackCredentials} from '../src/agent-feedback-audit.ts'
import {verifyAgentCollaborationCredentials} from '../src/agent-collaboration-audit.ts'
import {parseFeedbackOptimizationAcceptance} from '../src/agent-feedback-optimization-contract.ts'
import {canonicalMcpJson} from '../src/mcp-catalog.ts'
import {withActor} from '../src/repository.ts'
import {safeAgentSpec} from '../src/contracts.ts'
import {KnowledgeAccessRepository} from '../src/knowledge-access-repository.ts'
const sha=value=>createHash('sha256').update(value).digest('hex')
async function fixture({installed=true}={}){
  const f=await agentMemoryFixture()
  try{
    for(const migration of ['051_agent_memory_derived','052_agent_memory_outcome','053_agent_memory_failure_source','054_agent_feedback'])await f.db.exec(f.sql('migrations/pg_v9_'+migration+'.sql'))
    if(installed){await f.db.exec(f.sql('migrations/pg_v9_055_agent_optimization.sql'));assert.equal(await inspectAgentOptimizationSchema(f.pool),true)}
    return {...f,owned:new AutonomousAgentRunRepository(f.pool,{allowHumanInput:true}),feedback:new AgentFeedbackRepository(f.pool,{allowSubmit:true,allowLessonStorage:true}),opt:new AgentOptimizationRepository(f.pool,{allowAcceptance:true}),closed:new AgentOptimizationRepository(f.pool)}
  }catch(error){await f.close();throw error}
}
async function source(f,{rating='down',remember=true}={}){
  const role=await f.agents.get(f.identities.alice,f.resources.alice.spec.id)
  const run=await f.owned.submit(f.identities.alice,role.id,{expected_revision:role.revision,max_steps:1,require_plan_review:false,idempotency_key:'synthetic-optimization-'+randomUUID(),instruction:'Synthetic cancelled source token=syntheticOptimizationTaskPrivate'})
  await f.owned.cancel(f.identities.alice,run.run.id)
  const initial=await f.feedback.status(f.identities.alice,run.run.id)
  const raw={action:'submit',request_id:randomUUID(),spec_id:role.id,run_id:run.run.id,expected_revision:0,expected_source_sha256:initial.source.source_sha256,rating,tags:['核对😀'],comment:'Synthetic author statement token=syntheticOptimizationFeedbackPrivate',remember_lesson:rating==='down'&&remember,confirm:true}
  const feedback=await f.feedback.change(f.identities.alice,raw)
  return {runId:run.run.id,specId:role.id,feedback,raw}
}
async function draft(f,s,patch={}){
  const role=await f.agents.get(f.identities.alice,s.specId),{require_approval:_,...input}=role.spec
  const current=await f.feedback.status(f.identities.alice,s.runId)
  const hash=(await withActor(f.pool,f.identities.alice,db=>db.query('SELECT agentstudio.agent_optimization_role_sha(id,owner_user_id,name,revision,spec) AS sha FROM agentstudio.agent_specs WHERE id=$1',[s.specId]))).rows[0].sha
  return {action:'preview',spec_id:s.specId,run_id:s.runId,feedback_id:current.current.feedback_id,expected_feedback_sha256:current.current.feedback_sha256,expected_spec_revision:role.revision,expected_spec_sha256:hash,name:role.name,spec:{...input,goal:'Synthetic source-guided role revision '+(role.revision+1)+' token=syntheticOptimizationProposedPrivate'},...patch}
}
const acceptance=(v,patch={})=>({...v,action:'accept',request_id:randomUUID(),confirm:true,...patch})
const counts=async f=>(await f.db.query('SELECT (SELECT count(*) FROM agentstudio.agent_optimization_intents)::integer AS intents,(SELECT count(*) FROM agentstudio.agent_optimization_links)::integer AS links,(SELECT count(*) FROM agentstudio.agent_collaboration_revisions)::integer AS history,(SELECT count(*) FROM agentstudio.jobs)::integer AS jobs,(SELECT count(*) FROM agentstudio.external_effects)::integer AS effects')).rows[0]
async function erase(f,s){const state=await f.feedback.status(f.identities.alice,s.runId);return f.feedback.change(f.identities.alice,{action:'erase_feedback',request_id:randomUUID(),spec_id:s.specId,run_id:s.runId,expected_revision:state.revision,expected_feedback_sha256:state.current.feedback_sha256,confirm:true})}

test('optional055 strictly audits two immutable provenance tables, computed intent metadata, actual role trigger and all predecessor guards',async()=>{
  const f=await fixture({installed:false})
  try{
    assert.equal(await inspectAgentOptimizationSchema(f.pool),false)
    await f.db.exec("BEGIN; CREATE FUNCTION agentstudio.synthetic_orphan_history() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RETURN NEW; END$$; CREATE TRIGGER native_agent_optimization_history AFTER UPDATE ON agentstudio.agent_specs FOR EACH ROW EXECUTE FUNCTION agentstudio.synthetic_orphan_history()")
    try{await assert.rejects(verifyAgentOptimizationCredentials(f.db),/unsafe_agent_optimization_privileges/)}finally{await f.db.exec('ROLLBACK')}
    await f.db.exec(f.sql('migrations/pg_v9_055_agent_optimization.sql'));assert.equal(await inspectAgentOptimizationSchema(f.pool),true)
    assert.equal(await withActor(f.pool,f.identities.alice,verifyAgentFeedbackCredentials),true);assert.equal(await withActor(f.pool,f.identities.alice,verifyAgentCollaborationCredentials),true)
    for(const mutation of [
      'GRANT INSERT ON agentstudio.agent_optimization_links TO agentstudio_api',
      'GRANT DELETE ON agentstudio.agent_optimization_intents TO agentstudio_api',
      'GRANT UPDATE(changed_keys) ON agentstudio.agent_optimization_links TO agentstudio_api',
      'GRANT INSERT(owner_epoch) ON agentstudio.agent_optimization_intents TO agentstudio_api',
      'GRANT INSERT(transaction_id) ON agentstudio.agent_optimization_intents TO agentstudio_api',
      'GRANT INSERT(feedback_revision) ON agentstudio.agent_optimization_intents TO agentstudio_api',
      'GRANT SELECT ON agentstudio.agent_optimization_links TO agentstudio_worker',
      'GRANT SELECT ON agentstudio.agent_optimization_links TO agentstudio_api WITH GRANT OPTION',
      'GRANT INSERT(candidate_sha256) ON agentstudio.agent_optimization_intents TO agentstudio_api WITH GRANT OPTION',
      'GRANT EXECUTE ON FUNCTION agentstudio.agent_optimization_role_history() TO agentstudio_api',
      'GRANT EXECUTE ON FUNCTION agentstudio.agent_optimization_candidate_sha(text,jsonb) TO agentstudio_worker',
      'ALTER FUNCTION agentstudio.agent_optimization_role_history() SECURITY INVOKER',
      'ALTER FUNCTION agentstudio.agent_optimization_compact(jsonb) SECURITY DEFINER',
      'ALTER FUNCTION agentstudio.agent_optimization_role_sha(uuid,uuid,text,bigint,jsonb) SET search_path=public',
      'ALTER TABLE agentstudio.agent_optimization_links NO FORCE ROW LEVEL SECURITY',
      'ALTER POLICY agent_optimization_links_read ON agentstudio.agent_optimization_links USING(true)',
      'ALTER TABLE agentstudio.agent_optimization_intents ALTER transaction_id DROP NOT NULL',
      'ALTER TABLE agentstudio.agent_optimization_intents ALTER owner_epoch SET DEFAULT 1',
      'ALTER TABLE agentstudio.agent_specs DISABLE TRIGGER native_agent_optimization_history',
      'ALTER TABLE agentstudio.agent_optimization_intents DISABLE TRIGGER agent_optimization_intent',
      'ALTER TABLE agentstudio.agent_optimization_links ADD CHECK(after_spec_revision>before_spec_revision)',
      'CREATE INDEX synthetic_extra_optimization ON agentstudio.agent_optimization_links(spec_id)',
      "DELETE FROM agentstudio.schema_migrations WHERE version='pg_v9_055'",
      'DROP TABLE agentstudio.agent_optimization_links'
    ]){await f.db.exec('BEGIN');try{await f.db.exec(mutation);await assert.rejects(verifyAgentOptimizationCredentials(f.db),/unsafe_agent_optimization_privileges/)}finally{await f.db.exec('ROLLBACK')}}
  }finally{await f.close()}
})
test('readonly full-role preview and explicit acceptance bind actual045 before/after history, Unicode candidate digest and zero extra jobs/effects',async()=>{
  const f=await fixture()
  try{
    const s=await source(f),v=await draft(f,s,{name:'合成角色😀',spec:{...(await draft(f,s)).spec,goal:'合成调整：核对证据😀\n保留边界'}}),before=await counts(f)
    const preview=await f.closed.preview(f.identities.alice,v);assert.equal(preview.recorded,false);assert.equal(preview.feedback.comment,'Synthetic author statement token=***');assert.deepEqual(await counts(f),before)
    assert.equal(preview.candidate.candidate_sha256,sha(canonicalMcpJson({protocol:'agent_feedback_role_candidate_v1',name:v.name,spec:safeAgentSpec(v.spec)})))
    const raw=acceptance(v);await assert.rejects(f.closed.accept(f.identities.alice,raw),e=>e.status===403)
    const receipt=await f.opt.accept(f.identities.alice,raw);assert.equal(receipt.recorded,true);assert.equal(receipt.replayed,false);assert.equal(receipt.after_spec_revision,receipt.before_spec_revision+1);assert.equal(receipt.before_spec_sha256,preview.before.source_sha256);assert.deepEqual(receipt.changed_keys,preview.changed_keys)
    assert.doesNotMatch(JSON.stringify(receipt),/syntheticOptimizationTaskPrivate|syntheticOptimizationFeedbackPrivate|syntheticOptimizationProposedPrivate|ROLE_PRIVATE/)
    const history=(await f.db.query('SELECT id,kind,spec_revision,source_sha256 FROM agentstudio.agent_collaboration_revisions WHERE id IN($1,$2)',[receipt.before_revision_id,receipt.after_revision_id])).rows
    assert.equal(history.length,2);assert.equal(history.find(r=>r.id===receipt.before_revision_id).kind,'before_edit');assert.equal(history.find(r=>r.id===receipt.after_revision_id).kind,'edited');assert.equal(history.find(r=>r.id===receipt.after_revision_id).source_sha256,receipt.after_spec_sha256)
    const after=await counts(f);assert.equal(after.intents,1);assert.equal(after.links,1);assert.equal(after.history,before.history+2);assert.equal(after.jobs,before.jobs);assert.equal(after.effects,before.effects)
    const page=await f.closed.list(f.identities.alice,s.specId);assert.equal(page.items[0].feedback_unchanged,true);assert.equal(page.items[0].role_current,true)
    const state=await f.feedback.status(f.identities.alice,s.runId);assert.equal(state.lessons[0].source_current,false);assert.equal(state.lessons[0].fact,null)
  }finally{await f.close()}
})
test('identical-text feedback correction invalidates earlier lineage; fresh explicit acceptance gets its own feedback generation and role revision',async()=>{
  const f=await fixture()
  try{
    const s=await source(f),raw=acceptance(await draft(f,s)),first=await f.opt.accept(f.identities.alice,raw)
    const current=await f.feedback.status(f.identities.alice,s.runId),replacement={...s.raw,request_id:randomUUID(),expected_revision:current.revision,remember_lesson:false}
    const next=await f.feedback.change(f.identities.alice,replacement);assert.equal(next.statement_sha256,s.feedback.statement_sha256);assert.notEqual(next.feedback_sha256,s.feedback.feedback_sha256)
    let page=await f.opt.list(f.identities.alice,s.specId);assert.equal(page.items[0].feedback_unchanged,false);assert.equal(page.items[0].role_current,true)
    const stale=acceptance({...await draft(f,s),feedback_id:s.feedback.feedback_id,expected_feedback_sha256:s.feedback.feedback_sha256});await assert.rejects(f.opt.accept(f.identities.alice,stale),e=>e.code==='agent_optimization_feedback_changed')
    assert.equal((await f.closed.confirm(f.identities.alice,raw)).replayed,true);assert.equal((await f.closed.accept(f.identities.alice,raw)).after_spec_sha256,first.after_spec_sha256)
    const fresh=await f.opt.accept(f.identities.alice,acceptance(await draft(f,s)));assert.equal(fresh.feedback_id,next.feedback_id);assert.equal(fresh.after_spec_revision,first.after_spec_revision+1)
    page=await f.opt.list(f.identities.alice,s.specId);assert.equal(page.items.length,2);assert.equal(page.items.find(i=>i.request_id===first.request_id).feedback_unchanged,false);assert.equal(page.items.find(i=>i.request_id===first.request_id).role_current,false)
  }finally{await f.close()}
})
test('foreign employees, non-Native identities, stale source/version and forged metadata cannot produce owner acceptance or provenance',async()=>{
  const f=await fixture()
  try{
    const s=await source(f),v=await draft(f,s),raw=acceptance(v),before=await counts(f)
    await assert.rejects(f.opt.preview(f.identities.bob,v),e=>e.status===404);await assert.rejects(f.opt.accept(f.identities.bob,raw),e=>e.status===404);await assert.rejects(f.opt.list(f.identities.bob,s.specId),e=>e.status===404)
    await assert.rejects(f.opt.accept({issuer:'https://foreign.invalid',subject:'alice'},raw),e=>e.status===403)
    for(const patch of [{expected_spec_revision:v.expected_spec_revision+1},{expected_spec_sha256:'e'.repeat(64)}])await assert.rejects(f.opt.accept(f.identities.alice,{...raw,...patch}),e=>e.code==='agent_optimization_role_changed')
    await assert.rejects(f.opt.accept(f.identities.alice,{...raw,changed_keys:['goal']}),e=>e.status===400)
    await assert.rejects(f.opt.accept(f.identities.alice,{...raw,paid_optimization_approved:true}),e=>e.status===400)
    await assert.rejects(f.opt.confirm(f.identities.alice,raw),e=>e.status===404);assert.deepEqual(await counts(f),before)
    const role=await f.agents.get(f.identities.alice,s.specId),{require_approval:_,...unchanged}=role.spec
    await assert.rejects(f.opt.accept(f.identities.alice,{...raw,name:'Only renamed',spec:unchanged}),e=>e.code==='feedback_optimization_change_required')
    assert.deepEqual(await counts(f),before)
  }finally{await f.close()}
})
test('feedback erasure and a later ordinary role edit do not remove immutable history or let original recovery restore either role or feedback',async()=>{
  const f=await fixture()
  try{
    const s=await source(f),raw=acceptance(await draft(f,s)),receipt=await f.opt.accept(f.identities.alice,raw);await erase(f,s)
    let role=await f.agents.get(f.identities.alice,s.specId),{require_approval:_,...spec}=role.spec
    await f.agents.update(f.identities.alice,role.id,'Later ordinary role',safeAgentSpec({...spec,goal:'Later unrelated owner change'}),role.revision)
    const before=await counts(f),confirmed=await f.closed.confirm(f.identities.alice,raw);assert.equal(confirmed.replayed,true);assert.equal(confirmed.after_revision_id,receipt.after_revision_id)
    assert.equal((await f.closed.accept(f.identities.alice,raw)).replayed,true);assert.deepEqual(await counts(f),before)
    const page=await f.closed.list(f.identities.alice,s.specId);assert.equal(page.items[0].feedback_unchanged,false);assert.equal(page.items[0].role_current,false);assert.doesNotMatch(JSON.stringify(page),/syntheticOptimizationTaskPrivate|syntheticOptimizationFeedbackPrivate|syntheticOptimizationProposedPrivate|Later unrelated/)
    assert.equal((await f.feedback.status(f.identities.alice,s.runId)).state,'erased');role=await f.agents.get(f.identities.alice,s.specId);assert.equal(role.spec.goal,'Later unrelated owner change')
    await assert.rejects(f.closed.accept(f.identities.alice,{...raw,spec:{...raw.spec,goal:'Replacement original'}}),e=>e.code==='agent_optimization_request_conflict')
  }finally{await f.close()}
})
test('proposed private model and knowledge permissions are validated; actual binding changes are included without inheriting any provider call',async()=>{
  const f=await fixture()
  try{
    const s=await source(f,{rating:'up',remember:false}),v=await draft(f,s),before=await counts(f)
    await assert.rejects(f.opt.accept(f.identities.alice,acceptance({...v,spec:{...v.spec,model_binding:f.resources.bob.binding}})),e=>e.status===404||e.status===409)
    await assert.rejects(f.opt.accept(f.identities.alice,acceptance({...v,spec:{...v.spec,knowledge_base_ids:[f.resources.bob.kb.id]}})),e=>e.status===404||e.status===409)
    assert.deepEqual(await counts(f),before)
    const saved=await f.models.create(f.identities.alice,{name:'Synthetic alternative',provider:'openai',base_url:'https://api.openai.com/v1',api_key:'synthetic-alternative-key-never-network',models:['synthetic'],enabled:true})
    const tested=await f.models.testConnection(f.identities.alice,saved.id,saved.revision,async()=>({status:'ok',latency_ms:1,error_code:''}))
    const changed={...v,spec:{...v.spec,tools:['calculate'],knowledge_base_ids:[],require_plan_review:true,model_binding:{connection_id:tested.id,connection_revision:tested.revision,model_id:'synthetic'}}}
    const preview=await f.opt.preview(f.identities.alice,changed);assert.ok(preview.changed_keys.includes('model_binding'));assert.ok(preview.changed_keys.includes('knowledge_base_ids'));assert.ok(preview.changed_keys.includes('tools'));assert.ok(preview.changed_keys.includes('require_plan_review'))
    const result=await f.opt.accept(f.identities.alice,acceptance(changed));assert.deepEqual(result.changed_keys,preview.changed_keys);assert.equal((await f.agents.get(f.identities.alice,s.specId)).spec.model_binding.connection_id,tested.id)
    assert.equal((await counts(f)).effects,before.effects);assert.equal((await counts(f)).jobs,before.jobs)
  }finally{await f.close()}
})
test('mandatory provenance audit failure rolls intent, actual role update and045 history back together; exact retry accepts once',async()=>{
  const f=await fixture()
  try{
    const s=await source(f),raw=acceptance(await draft(f,s)),before=await counts(f),old=await f.agents.get(f.identities.alice,s.specId)
    await f.db.exec("CREATE FUNCTION agentstudio.synthetic_reject_optimization_audit() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN IF NEW.action='agent.optimization_accept' THEN RAISE EXCEPTION 'synthetic_optimization_audit_failed'; END IF; RETURN NEW; END$$; CREATE TRIGGER synthetic_optimization_audit BEFORE INSERT ON agentstudio.audit_events FOR EACH ROW EXECUTE FUNCTION agentstudio.synthetic_reject_optimization_audit()")
    try{await assert.rejects(f.opt.accept(f.identities.alice,raw),/synthetic_optimization_audit_failed/)}finally{await f.db.exec('DROP TRIGGER synthetic_optimization_audit ON agentstudio.audit_events; DROP FUNCTION agentstudio.synthetic_reject_optimization_audit()')}
    assert.deepEqual(await counts(f),before);assert.deepEqual(await f.agents.get(f.identities.alice,s.specId),old)
    const result=await f.opt.accept(f.identities.alice,raw);assert.equal(result.replayed,false);assert.equal((await f.closed.confirm(f.identities.alice,raw)).replayed,true)
    const after=await counts(f);assert.equal(after.intents,before.intents+1);assert.equal(after.links,before.links+1);assert.equal(after.history,before.history+2)
  }finally{await f.close()}
})
test('a pruned source checkpoint and revoked shared KB do not invent engine proof or prevent explicit safe manual role repair',async()=>{
  const f=await fixture()
  try{
    const access=new KnowledgeAccessRepository(f.pool,async()=>({id:f.users.alice,display_name:'Synthetic Alice'})),kb=f.resources.bob.kb.id
    const granted=await access.change(f.identities.bob,kb,{action:'grant',request_id:randomUUID(),expected_revision:0,recipient_email:'alice@example.test',role:'viewer',semantic_allowed:false})
    const old=await f.agents.get(f.identities.alice,f.resources.alice.spec.id),{require_approval:_,...stored}=old.spec
    await f.agents.update(f.identities.alice,old.id,old.name,safeAgentSpec({...stored,knowledge_base_ids:[kb]}),old.revision)
    const s=await source(f,{rating:'up',remember:false}),v=await draft(f,s)
    await access.change(f.identities.bob,kb,{action:'revoke',request_id:randomUUID(),recipient_id:f.users.alice,expected_revision:granted.item.revision})
    await assert.rejects(f.opt.preview(f.identities.alice,v),e=>e.status===404||e.status===409)
    await f.db.query("UPDATE agentstudio.runs SET checkpoint='{}'::jsonb WHERE id=$1",[s.runId])
    // Removing the revoked shared KB from this proposal is a real safe edit. No
    // private task VM, lesson, provider output or current KB content is used.
    const repaired={...v,spec:{...v.spec,knowledge_base_ids:[],tools:['calculate']}}
    const preview=await f.opt.preview(f.identities.alice,repaired);assert.equal(preview.feedback.rating,'up');assert.equal(preview.recorded,false)
    const result=await f.opt.accept(f.identities.alice,acceptance(repaired));assert.equal(result.recorded,true);assert.equal((await f.feedback.status(f.identities.alice,s.runId)).source,null)
    assert.equal((await f.opt.list(f.identities.alice,s.specId)).items[0].feedback_unchanged,true);assert.equal((await counts(f)).effects,0)
  }finally{await f.close()}
})
test('an abandoned committed intent is inert across transactions and Native governance ABA; API cannot inject final links or computed metadata',async()=>{
  const f=await fixture()
  try{
    const s=await source(f),raw=acceptance(await draft(f,s)),parsed=parseFeedbackOptimizationAcceptance(raw)
    const hash=(await withActor(f.pool,f.identities.alice,db=>db.query('SELECT agentstudio.agent_optimization_candidate_sha($1,$2::jsonb) AS sha',[parsed.name,JSON.stringify(parsed.spec)]))).rows[0].sha
    await withActor(f.pool,f.identities.alice,db=>db.query('INSERT INTO agentstudio.agent_optimization_intents(owner_user_id,request_id,spec_id,run_id,feedback_id,feedback_sha256,before_spec_revision,before_spec_sha256,candidate_sha256,request_sha256) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[f.users.alice,parsed.request_id,parsed.spec_id,parsed.run_id,parsed.feedback_id,parsed.expected_feedback_sha256,parsed.expected_spec_revision,parsed.expected_spec_sha256,hash,parsed.request_sha256]))
    await f.db.query('UPDATE agentstudio_auth.accounts SET governance_revision=governance_revision+2 WHERE user_id=$1',[f.users.alice])
    await assert.rejects(f.opt.accept(f.identities.alice,raw),e=>e.code==='agent_optimization_acceptance_unconfirmed');await assert.rejects(f.closed.confirm(f.identities.alice,raw),e=>e.status===404)
    const role=await f.agents.get(f.identities.alice,s.specId);await f.agents.update(f.identities.alice,role.id,parsed.name,parsed.spec,role.revision)
    assert.equal((await counts(f)).links,0);assert.equal((await counts(f)).intents,1)
    for(const sql of ['INSERT INTO agentstudio.agent_optimization_links(owner_user_id) VALUES(agentstudio.actor_id())','UPDATE agentstudio.agent_optimization_intents SET request_sha256=repeat(\'a\',64)','DELETE FROM agentstudio.agent_optimization_links','INSERT INTO agentstudio.agent_optimization_intents(owner_epoch) VALUES(1)','INSERT INTO agentstudio.agent_optimization_intents(transaction_id) VALUES(\'1\')'])await assert.rejects(withActor(f.pool,f.identities.alice,db=>db.query(sql)),/permission denied/)
  }finally{await f.close()}
})
test('distinct original contenders serialize one role revision and same-request duplicate recovery never edits twice',async()=>{
  const f=await fixture()
  try{
    const s=await source(f),raw=acceptance(await draft(f,s)),other={...raw,request_id:randomUUID(),spec:{...raw.spec,goal:'Different explicit candidate'}}
    const results=await Promise.allSettled([f.opt.accept(f.identities.alice,raw),f.opt.accept(f.identities.alice,other)]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.find(r=>r.status==='rejected').reason.status,409)
    const winner=results[0].status==='fulfilled'?raw:other,before=await counts(f),duplicates=await Promise.all([f.closed.accept(f.identities.alice,winner),f.closed.accept(f.identities.alice,winner)])
    assert.ok(duplicates.every(r=>r.replayed));assert.deepEqual(await counts(f),before);assert.equal(before.links,1);assert.equal(before.intents,1)
    await assert.rejects(f.closed.confirm(f.identities.bob,winner),e=>e.status===404)
    for(const table of ['intents','links'])assert.equal((await withActor(f.pool,f.identities.bob,db=>db.query('SELECT count(*)::integer AS n FROM agentstudio.agent_optimization_'+table))).rows[0].n,0)
  }finally{await f.close()}
})
