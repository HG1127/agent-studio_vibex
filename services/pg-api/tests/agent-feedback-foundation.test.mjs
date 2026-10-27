// Synthetic embedded SQL and the existing private mTLS fixture only.
import test from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {agentMemoryFixture} from './helpers/agent-memory-fixture.mjs'
import {AgentFeedbackRepository} from '../src/agent-feedback-repository.ts'
import {inspectAgentFeedbackSchema,verifyAgentFeedbackCredentials} from '../src/agent-feedback-audit.ts'
import {parseAgentFeedbackChange} from '../src/agent-feedback-contract.ts'
import {AutonomousAgentRunRepository} from '../src/autonomous-agent-run-repository.ts'
import {KnowledgeAccessRepository} from '../src/knowledge-access-repository.ts'
import {HttpError,safeAgentSpec} from '../src/contracts.ts'
import {withActor} from '../src/repository.ts'
async function fixture({installed=true}={}){
  const f=await agentMemoryFixture()
  try{
    for(const migration of ['051_agent_memory_derived','052_agent_memory_outcome','053_agent_memory_failure_source'])await f.db.exec(f.sql('migrations/pg_v9_'+migration+'.sql'))
    if(installed){await f.db.exec(f.sql('migrations/pg_v9_054_agent_feedback.sql'));assert.equal(await inspectAgentFeedbackSchema(f.pool),true)}
    return {...f,feedback:new AgentFeedbackRepository(f.pool,{allowSubmit:true,allowLessonStorage:true}),closed:new AgentFeedbackRepository(f.pool),owned:new AutonomousAgentRunRepository(f.pool,{allowHumanInput:true}),calls:{model:0}}
  }catch(error){await f.close();throw error}
}
async function submitTask(f){const role=f.resources.alice.spec;return f.owned.submit(f.identities.alice,role.id,{expected_revision:role.revision,max_steps:1,require_plan_review:false,idempotency_key:'synthetic-feedback-task-'+randomUUID(),instruction:'Synthetic owner task token=syntheticFeedbackTaskPrivate'})}
async function terminal(f,status='cancelled'){
  const started=await submitTask(f),id=started.run.id
  if(status==='cancelled')await f.owned.cancel(f.identities.alice,id)
  else await f.privateTls(async()=>{f.calls.model++;return JSON.stringify({action:'answer',answer:'Synthetic original result token=syntheticFeedbackPrivateResult'})},async make=>{
    if(status==='failed'){
      const worker=make({humanInputApproved:true}),job=await worker.claim();assert.equal(job.run_id,id);let once=true
      f.setFault(sql=>{if(once&&sql==='SELECT status FROM agentstudio.users WHERE id=$1::uuid'){once=false;throw new HttpError(409,'synthetic_feedback_preparation_failed')}})
      try{assert.equal((await worker.execute(job)).status,'failed')}finally{f.setFault(undefined)}
    }else assert.equal((await f.drive(()=>make({humanInputApproved:true}),id,()=> 'approved',30)).run.status,'succeeded')
  })
  assert.equal((await f.owned.get(f.identities.alice,id)).run.status,status);return id
}
async function choice(f,id,patch={}){
  const state=await f.feedback.status(f.identities.alice,id)
  return {action:'submit',request_id:randomUUID(),spec_id:state.spec_id,run_id:id,expected_revision:state.revision,expected_source_sha256:state.source?.source_sha256??'0'.repeat(64),rating:'down',tags:['证据不足'],comment:'Synthetic comment token=syntheticFeedbackOnlySecret',remember_lesson:true,confirm:true,...patch}
}
async function counts(f){return (await f.db.query('SELECT (SELECT count(*) FROM agentstudio.agent_feedback_receipts)::integer AS receipts,(SELECT count(*) FROM agentstudio.agent_feedback_bodies)::integer AS bodies,(SELECT count(*) FROM agentstudio.agent_feedback_lesson_results)::integer AS results,(SELECT count(*) FROM agentstudio.agent_feedback_lessons)::integer AS lessons,(SELECT count(*) FROM agentstudio.external_effects)::integer AS effects')).rows[0]}
const erase=(state)=>({action:'erase_feedback',request_id:randomUUID(),run_id:state.run_id,spec_id:state.spec_id,expected_revision:state.revision,expected_feedback_sha256:state.current.feedback_sha256,confirm:true})
const forget=(state,item)=>({action:'forget_lesson',request_id:randomUUID(),run_id:state.run_id,spec_id:state.spec_id,feedback_id:item.feedback_id,expected_content_sha256:item.content_sha256,confirm:true})

test('optional054 audits exact Native-only statements, triggers, computed metadata and erasure privileges; schema/ACL drift refuses',async()=>{
  const f=await fixture({installed:false})
  try{
    assert.equal(await inspectAgentFeedbackSchema(f.pool),false);await f.db.exec(f.sql('migrations/pg_v9_054_agent_feedback.sql'));assert.equal(await inspectAgentFeedbackSchema(f.pool),true)
    const functions=(await f.db.query("SELECT proname,encode(sha256(convert_to(prosrc,'UTF8')),'hex') AS sha FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='agentstudio' AND left(proname,15)='agent_feedback_' ORDER BY proname")).rows
    assert.equal(functions.length,7);process.stdout.write('SYNTHETIC_FEEDBACK_FUNCTIONS '+JSON.stringify(functions)+'\n')
    for(const mutation of [
      'GRANT DELETE ON agentstudio.agent_feedback_receipts TO agentstudio_api',
      'GRANT UPDATE(comment) ON agentstudio.agent_feedback_bodies TO agentstudio_api',
      'GRANT INSERT(owner_epoch) ON agentstudio.agent_feedback_receipts TO agentstudio_api',
      'GRANT INSERT(feedback_sha256) ON agentstudio.agent_feedback_receipts TO agentstudio_api',
      'GRANT SELECT ON agentstudio.agent_feedback_lessons TO agentstudio_worker',
      'GRANT SELECT ON agentstudio.agent_feedback_bodies TO agentstudio_api WITH GRANT OPTION',
      'GRANT INSERT(comment) ON agentstudio.agent_feedback_bodies TO agentstudio_api WITH GRANT OPTION',
      'GRANT EXECUTE ON FUNCTION agentstudio.agent_feedback_digest(text[]) TO agentstudio_worker',
      'GRANT EXECUTE ON FUNCTION agentstudio.agent_feedback_body_guard() TO agentstudio_api',
      'ALTER FUNCTION agentstudio.agent_feedback_digest(text[]) SECURITY DEFINER',
      'ALTER FUNCTION agentstudio.agent_feedback_digest(text[]) SET search_path=public',
      'ALTER TABLE agentstudio.agent_feedback_receipts NO FORCE ROW LEVEL SECURITY',
      'ALTER POLICY agent_feedback_bodies_read ON agentstudio.agent_feedback_bodies USING(true)',
      'ALTER TABLE agentstudio.agent_feedback_lessons DISABLE TRIGGER agent_feedback_lesson',
      'ALTER TABLE agentstudio.agent_feedback_bodies ALTER tags DROP NOT NULL',
      'ALTER TABLE agentstudio.agent_feedback_bodies ADD CHECK(length(comment)<10)',
      'ALTER TABLE agentstudio.agent_feedback_lesson_results ALTER created_at SET DEFAULT now()',
      'CREATE INDEX synthetic_extra_feedback_body ON agentstudio.agent_feedback_bodies(comment)',
      "DROP INDEX agentstudio.agent_feedback_revision; CREATE UNIQUE INDEX agent_feedback_revision ON agentstudio.agent_feedback_receipts(owner_user_id,run_id,revision) WHERE action<>'forget_lesson::text'",
      "CREATE FUNCTION agentstudio.agent_feedback_digest(text) RETURNS text LANGUAGE sql AS 'SELECT $1'",
      "DELETE FROM agentstudio.schema_migrations WHERE version='pg_v9_054'",
      'DROP TABLE agentstudio.agent_feedback_lessons'
    ]){await f.db.exec('BEGIN');try{await f.db.exec(mutation);await assert.rejects(verifyAgentFeedbackCredentials(f.db),/unsafe_agent_feedback_privileges/)}finally{await f.db.exec('ROLLBACK')}}
  }finally{await f.close()}
})

test('success, actual early failure and cancellation all accept employee feedback without fabricating an engine result or extra provider call',async()=>{
  for(const status of ['succeeded','failed','cancelled']){
    const f=await fixture()
    try{
      const id=await terminal(f,status),before=f.calls.model,raw=await choice(f,id),receipt=await f.feedback.change(f.identities.alice,raw)
      assert.equal(receipt.lesson_result.decision,'stored');assert.equal(receipt.revision,1);assert.equal(receipt.remember_lesson,true)
      assert.doesNotMatch(JSON.stringify(receipt),/syntheticFeedbackOnlySecret|syntheticFeedbackPrivateResult|Synthetic owner task/)
      const state=await f.feedback.status(f.identities.alice,id);assert.equal(state.state,'active');assert.equal(state.source.status,status);assert.equal(state.current.body.rating,'down');assert.equal(state.current.body.comment,'Synthetic comment token=***')
      assert.equal(state.lessons.length,1);assert.equal(state.lessons[0].source_current,true);assert.match(state.lessons[0].fact,/^用户反馈：/);assert.equal(state.lessons[0].tools_used,'');assert.doesNotMatch(state.lessons[0].fact,/syntheticFeedbackTaskPrivate|syntheticFeedbackOnlySecret|syntheticFeedbackPrivateResult/)
      assert.equal((await f.db.query('SELECT count(*)::integer AS n FROM agentstudio.agent_memory_derived_entries')).rows[0].n,0)
      for(const name of ['receipts','bodies','lesson_results','lessons'])assert.equal((await withActor(f.pool,f.identities.bob,db=>db.query('SELECT count(*)::integer AS n FROM agentstudio.agent_feedback_'+name))).rows[0].n,0)
      await assert.rejects(f.feedback.status(f.identities.bob,id),e=>e.status===404);await assert.rejects(f.closed.confirm(f.identities.bob,raw),e=>e.status===404)
      assert.equal(f.calls.model,before);assert.equal(before,status==='succeeded'?1:0);assert.equal((await f.owned.get(f.identities.alice,id)).run.status,status)
    }finally{await f.close()}
  }
})

test('statement framing matches actual SQL for Unicode and delimiters; no lesson opt-in, positive feedback and disabled lesson scope never store',async()=>{
  const f=await fixture()
  try{
    const id=await terminal(f),raw=await choice(f,id,{tags:['证据:不足','😀'],comment:'多行\n已核对：😀',remember_lesson:false}),parsed=parseAgentFeedbackChange(raw)
    const sql=(await withActor(f.pool,f.identities.alice,db=>db.query('SELECT agentstudio.agent_feedback_statement_sha256($1::uuid,$2::uuid,$3,$4,$5::jsonb,$6) AS hash',[parsed.spec_id,parsed.run_id,parsed.expected_source_sha256,parsed.rating,JSON.stringify(parsed.tags),parsed.comment]))).rows[0].hash
    assert.equal(sql,parsed.statement_sha256);assert.equal((await f.feedback.change(f.identities.alice,raw)).lesson_result.decision,'not_requested')
    const up=await choice(f,id,{rating:'up',remember_lesson:false});assert.equal((await f.feedback.change(f.identities.alice,up)).lesson_result.decision,'not_requested')
    const disabled=new AgentFeedbackRepository(f.pool,{allowSubmit:true}),last=await choice(f,id)
    assert.equal((await disabled.change(f.identities.alice,last)).lesson_result.decision,'writes_disabled')
    assert.deepEqual(await counts(f),{receipts:3,bodies:1,results:3,lessons:0,effects:0});assert.equal(f.calls.model,0)
  }finally{await f.close()}
})

test('correction invalidates old lesson provenance; readonly original recovery, separate forgetting and complete erasure never resurrect bodies',async()=>{
  const f=await fixture()
  try{
    const id=await terminal(f),first=await choice(f,id),one=await f.feedback.change(f.identities.alice,first),second=await choice(f,id),two=await f.feedback.change(f.identities.alice,second)
    assert.equal(one.statement_sha256,two.statement_sha256);assert.notEqual(one.feedback_sha256,two.feedback_sha256)
    let state=await f.feedback.status(f.identities.alice,id);assert.equal(state.revision,2);assert.equal(state.lessons.length,2)
    const old=state.lessons.find(v=>v.feedback_id===one.feedback_id);assert.equal(old.source_current,false);assert.equal(old.fact,null)
    assert.equal((await f.closed.change(f.identities.alice,first)).replayed,true)
    await assert.rejects(f.feedback.change(f.identities.alice,{...first,comment:first.comment.replace('OnlySecret','DifferentSecret')}),e=>e.code==='agent_feedback_request_conflict')
    const forgotten=forget(state,old);await f.closed.change(f.identities.alice,forgotten);assert.equal((await f.closed.confirm(f.identities.alice,forgotten)).replayed,true)
    state=await f.feedback.status(f.identities.alice,id);assert.equal(state.current.body.rating,'down');assert.equal(state.revision,2);assert.equal(state.lessons.length,1)
    const erased=erase(state);await f.closed.change(f.identities.alice,erased)
    assert.deepEqual(await counts(f),{receipts:4,bodies:0,results:2,lessons:0,effects:0})
    assert.equal((await f.closed.change(f.identities.alice,second)).replayed,true);assert.equal((await f.closed.confirm(f.identities.alice,erased)).revision,3)
    state=await f.feedback.status(f.identities.alice,id);assert.equal(state.state,'erased');assert.equal(state.current,null)
    await assert.rejects(f.closed.change(f.identities.alice,await choice(f,id)),e=>e.code==='agent_feedback_submission_disabled')
    const fresh=await choice(f,id),newer=await f.feedback.change(f.identities.alice,fresh);assert.equal(newer.revision,4)
    assert.equal((await f.closed.change(f.identities.alice,erased)).replayed,true);assert.equal((await f.feedback.status(f.identities.alice,id)).lessons.length,1)
    const immutable=(await f.db.query('SELECT jsonb_agg(to_jsonb(r))::text AS text FROM agentstudio.agent_feedback_receipts r')).rows[0].text;assert.doesNotMatch(immutable,/Synthetic comment|OnlySecret|owner task/)
  }finally{await f.close()}
})

test('revoked shared KB and changed role still preserve employee statements but independently refuse derived lesson storage',async()=>{
  for(const scenario of ['role','shared_kb']){
    const f=await fixture()
    try{
      let revoke
      if(scenario==='shared_kb'){
        const access=new KnowledgeAccessRepository(f.pool,async()=>({id:f.users.alice,display_name:'Synthetic Alice'})),base=f.resources.bob.kb.id
        const grant=await access.change(f.identities.bob,base,{action:'grant',request_id:randomUUID(),expected_revision:0,recipient_email:'alice@example.test',role:'viewer',semantic_allowed:false})
        const role=f.resources.alice.spec,{require_approval:_,...stored}=role.spec
        f.resources.alice.spec=await f.agents.update(f.identities.alice,role.id,role.name,safeAgentSpec({...stored,knowledge_base_ids:[base]}),role.revision)
        revoke=()=>access.change(f.identities.bob,base,{action:'revoke',request_id:randomUUID(),recipient_id:f.users.alice,expected_revision:grant.item.revision})
      }else revoke=()=>f.db.query('UPDATE agentstudio.agent_specs SET revision=revision+1 WHERE id=$1',[f.resources.alice.spec.id])
      const id=await terminal(f);await revoke()
      const response=await f.feedback.change(f.identities.alice,await choice(f,id));assert.equal(response.lesson_result.decision,'source_unavailable')
      const state=await f.feedback.status(f.identities.alice,id);assert.equal(state.state,'active');assert.equal(state.current.body.rating,'down');assert.equal(state.lessons.length,0);assert.equal(f.calls.model,0)
    }finally{await f.close()}
  }
})

test('privacy deletion and original confirmation survive removed private checkpoints and disabled new submission',async()=>{
  const f=await fixture()
  try{
    const id=await terminal(f),raw=await choice(f,id);await f.feedback.change(f.identities.alice,raw)
    await f.db.query("UPDATE agentstudio.runs SET checkpoint='{}'::jsonb WHERE id=$1",[id])
    let state=await f.closed.status(f.identities.alice,id);assert.equal(state.source,null);assert.equal(state.current.body.rating,'down');assert.equal(state.lessons[0].source_current,false);assert.equal(state.lessons[0].fact,null)
    await f.closed.change(f.identities.alice,forget(state,state.lessons[0]));assert.equal((await f.closed.confirm(f.identities.alice,raw)).replayed,true)
    state=await f.closed.status(f.identities.alice,id);await f.closed.change(f.identities.alice,erase(state))
    assert.equal((await f.closed.status(f.identities.alice,id)).state,'erased');assert.equal((await counts(f)).bodies,0);assert.equal((await counts(f)).lessons,0)
    assert.equal((await f.closed.change(f.identities.alice,raw)).replayed,true);assert.equal((await counts(f)).bodies,0)
  }finally{await f.close()}
})

test('feedback audit is atomic; lesson storage/final audit and outcome failures preserve the statement without retrying storage',async()=>{
  for(const scenario of ['feedback_body','feedback_audit','lesson_body','lesson_final_audit','all_results']){
    const f=await fixture()
    try{
      const id=await terminal(f),raw=await choice(f,id)
      f.setFault((sql,values)=>{
        if(scenario==='feedback_body'&&sql.startsWith('INSERT INTO agentstudio.agent_feedback_bodies')||scenario==='feedback_audit'&&sql.startsWith('INSERT INTO agentstudio.audit_events')&&values.includes('agent.feedback_submit')||scenario==='lesson_body'&&sql.startsWith('INSERT INTO agentstudio.agent_feedback_lessons')||scenario==='lesson_final_audit'&&sql.startsWith('INSERT INTO agentstudio.audit_events')&&values.includes('agent.feedback_lesson_result')&&values.some(v=>typeof v==='string'&&v.includes('"decision":"stored"'))||scenario==='all_results'&&sql.startsWith('INSERT INTO agentstudio.agent_feedback_lesson_results'))throw Error('synthetic_feedback_fault')
      })
      let response
      try{if(scenario.startsWith('feedback_'))await assert.rejects(f.feedback.change(f.identities.alice,raw),/synthetic_feedback_fault/);else response=await f.feedback.change(f.identities.alice,raw)}finally{f.setFault(undefined)}
      const data=await counts(f);assert.equal(data.effects,0);assert.equal(data.lessons,0);assert.equal(f.calls.model,0)
      if(scenario.startsWith('feedback_')){assert.equal(data.receipts,0);assert.equal(data.bodies,0)}
      else{
        assert.equal(data.receipts,1);assert.equal(data.bodies,1);assert.equal(response.lesson_result?.decision??null,scenario==='all_results'?null:'write_failed')
        assert.equal((await f.closed.change(f.identities.alice,raw)).replayed,true);assert.equal((await counts(f)).lessons,0)
        assert.equal((await f.closed.status(f.identities.alice,id)).current.body.rating,'down')
      }
      assert.equal((await f.owned.get(f.identities.alice,id)).run.status,'cancelled')
    }finally{await f.close()}
  }
})

test('API cannot alter receipts, inject computed epochs, fake stored outcomes or restore erased text; live tasks and foreign/non-Native actors refuse',async()=>{
  const f=await fixture()
  try{
    const live=await submitTask(f),liveId=live.run.id;await assert.rejects(f.feedback.change(f.identities.alice,await choice(f,liveId)),e=>e.status===409)
    await f.owned.cancel(f.identities.alice,liveId)
    const raw=await choice(f,liveId);f.setFault(sql=>{if(sql.startsWith('INSERT INTO agentstudio.agent_feedback_lesson_results'))throw Error('synthetic_no_result')})
    let saved;try{saved=await f.feedback.change(f.identities.alice,raw)}finally{f.setFault(undefined)}
    const actor=fn=>withActor(f.pool,f.identities.alice,fn)
    for(const sql of ['UPDATE agentstudio.agent_feedback_receipts SET remember_lesson=false','DELETE FROM agentstudio.agent_feedback_receipts','TRUNCATE agentstudio.agent_feedback_receipts','UPDATE agentstudio.agent_feedback_bodies SET comment=\'forged\'','DELETE FROM agentstudio.agent_feedback_lesson_results','INSERT INTO agentstudio.agent_feedback_receipts(owner_epoch) VALUES(1)'])await assert.rejects(actor(db=>db.query(sql)),/permission denied/)
    await assert.rejects(actor(db=>db.query("INSERT INTO agentstudio.agent_feedback_lesson_results(owner_user_id,feedback_id,decision,content_sha256) VALUES(agentstudio.actor_id(),$1,'stored',$2)",[saved.feedback_id,'a'.repeat(64)])),/agent_feedback_lesson_result_receipt_required/)
    await assert.rejects(f.feedback.status({issuer:'https://synthetic-foreign.invalid',subject:'alice'},liveId),e=>e.status===403)
    const state=await f.closed.status(f.identities.alice,liveId);await f.closed.change(f.identities.alice,erase(state))
    const parsed=parseAgentFeedbackChange(raw)
    await assert.rejects(actor(db=>db.query('INSERT INTO agentstudio.agent_feedback_bodies(owner_user_id,feedback_id,rating,tags,comment) VALUES(agentstudio.actor_id(),$1,$2,$3::jsonb,$4)',[saved.feedback_id,parsed.rating,JSON.stringify(parsed.tags),parsed.comment])),/agent_feedback_body_receipt_required/)
    assert.deepEqual(await counts(f),{receipts:2,bodies:0,results:0,lessons:0,effects:0})
  }finally{await f.close()}
})

test('an old unconfirmed lesson consent cannot resume after Native governance ABA; a fresh explicit statement gets a new record hash',async()=>{
  const f=await fixture()
  try{
    const id=await terminal(f),raw=await choice(f,id);f.setFault(sql=>{if(sql.startsWith('INSERT INTO agentstudio.agent_feedback_lesson_results'))throw Error('synthetic_outcome_failure')})
    let original;try{original=await f.feedback.change(f.identities.alice,raw)}finally{f.setFault(undefined)}
    assert.equal(original.lesson_result,null)
    await f.db.query('UPDATE agentstudio_auth.accounts SET governance_revision=governance_revision+2 WHERE user_id=$1',[f.users.alice])
    await assert.rejects(withActor(f.pool,f.identities.alice,db=>db.query("INSERT INTO agentstudio.agent_feedback_lessons(owner_user_id,feedback_id,fact,content_sha256) VALUES(agentstudio.actor_id(),$1,'stale',$2)",[original.feedback_id,'a'.repeat(64)])),/agent_feedback_lesson_receipt_required/)
    assert.equal((await f.closed.change(f.identities.alice,raw)).replayed,true);assert.equal((await counts(f)).lessons,0)
    const fresh=await f.feedback.change(f.identities.alice,await choice(f,id));assert.equal(fresh.revision,2);assert.notEqual(fresh.feedback_sha256,original.feedback_sha256);assert.equal(fresh.lesson_result.decision,'stored')
    assert.equal((await f.closed.confirm(f.identities.alice,raw)).lesson_result,null);assert.equal((await counts(f)).lessons,1);assert.equal(f.calls.model,0)
  }finally{await f.close()}
})

test('one feedback revision admits one of two distinct original choices, and erase audit failure rolls deletion back atomically',async()=>{
  const f=await fixture()
  try{
    const id=await terminal(f),a=await choice(f,id),b=await choice(f,id,{comment:'A different original statement'})
    const attempts=await Promise.allSettled([f.feedback.change(f.identities.alice,a),f.feedback.change(f.identities.alice,b)])
    assert.equal(attempts.filter(v=>v.status==='fulfilled').length,1);assert.equal(attempts.find(v=>v.status==='rejected').reason.code,'agent_feedback_revision_changed')
    let state=await f.feedback.status(f.identities.alice,id);const request=erase(state)
    f.setFault((sql,values)=>{if(sql.startsWith('INSERT INTO agentstudio.audit_events')&&values.includes('agent.feedback_erase_feedback'))throw Error('synthetic_erase_audit')})
    try{await assert.rejects(f.closed.change(f.identities.alice,request),/synthetic_erase_audit/)}finally{f.setFault(undefined)}
    state=await f.closed.status(f.identities.alice,id);assert.equal(state.revision,1);assert.equal(state.state,'active');assert.equal(state.lessons.length,1)
    await f.closed.change(f.identities.alice,request);assert.equal((await f.closed.status(f.identities.alice,id)).revision,2);assert.equal((await counts(f)).lessons,0)
  }finally{await f.close()}
})
