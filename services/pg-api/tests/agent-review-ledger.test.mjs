// Hosted, serial synthetic SQL admission/privacy tests. Never run against a
// company database. This suite neither executes a Worker nor calls a provider.
import test from 'node:test'
import assert from 'node:assert/strict'
import {createHash,randomUUID} from 'node:crypto'
import {agentReviewLedgerFixture,reviewLedgerSource,reviewLedgerSubmission,reviewLedgerCounts,reviewLedgerRow,reviewLedgerFeedbackErase} from './helpers/agent-review-ledger-fixture.mjs'
import {verifyAgentReviewCredentials} from '../src/agent-review-audit.ts'
import {verifyAgentFeedbackCredentials} from '../src/agent-feedback-audit.ts'
import {verifyAgentOptimizationCredentials} from '../src/agent-optimization-audit.ts'
import {agentReviewFees} from '../src/agent-review-contract.ts'
import {canonicalMcpJson} from '../src/mcp-catalog.ts'
import {safeAgentSpec} from '../src/contracts.ts'
import {withActor} from '../src/repository.ts'

const serial={concurrency:false}
const sha=value=>createHash('sha256').update(canonicalMcpJson(value)).digest('hex')
const iso=value=>new Date(value).toISOString()
const control=(p,action='cancel')=>({action,request_id:randomUUID(),review_id:p.raw.request_id,expected_request_sha256:p.parsed.request_sha256,confirm:true})
const nativeDenied=e=>e.status===403
const conflict=e=>e.status===409
const notFound=e=>e.status===404

function assertReceipt(receipt,p,row,{state='pending',replayed=false}={}){
  assert.equal(receipt.protocol,'agent_paid_review_receipt_v1')
  for(const name of ['request_id','spec_id','run_id','purpose'])assert.equal(receipt[name],p.raw[name])
  for(const name of ['request_sha256','input_sha256','content_sha256','source_protocol'])assert.equal(receipt[name],row[name])
  assert.equal(receipt.request_sha256,p.parsed.request_sha256)
  assert.equal(receipt.input_sha256,p.prepared.input_sha256)
  assert.equal(receipt.content_sha256,p.prepared.content_sha256)
  assert.equal(receipt.owner_epoch,p.prepared.owner_epoch)
  assert.equal(Number(row.owner_epoch),receipt.owner_epoch)
  assert.equal(iso(receipt.created_at),iso(row.created_at))
  assert.equal(receipt.state,state);assert.equal(receipt.body_erased,state==='erased')
  assert.equal(receipt.recorded,true);assert.equal(receipt.replayed,replayed)
  assert.doesNotMatch(JSON.stringify(receipt),/messages|model_binding|choice|api_key|syntheticReviewLedgerTask|syntheticReviewLedgerFeedback|ROLE_PRIVATE/)
}
async function assertControlReceipt(f,s,raw,receipt,{replayed=false}={}){
  const row=(await f.db.query('SELECT * FROM agentstudio.agent_review_controls WHERE owner_user_id=$1 AND control_id=$2',[s.owner,raw.request_id])).rows[0]
  assert.ok(row)
  assert.equal(receipt.protocol,'agent_paid_review_control_receipt_v1')
  assert.equal(receipt.request_id,raw.request_id);assert.equal(receipt.review_id,raw.review_id);assert.equal(receipt.action,raw.action)
  assert.equal(row.request_id,raw.review_id);assert.equal(row.action,raw.action)
  assert.equal(receipt.request_sha256,sha({protocol:'agent_paid_review_control_v1',...raw}))
  assert.equal(row.request_sha256,receipt.request_sha256);assert.equal(iso(row.created_at),iso(receipt.created_at))
  assert.equal(receipt.recorded,true);assert.equal(receipt.replayed,replayed)
  assert.doesNotMatch(JSON.stringify(receipt),/messages|model_binding|syntheticReviewLedgerFeedback|ROLE_PRIVATE/)
}
async function roleQuery(f,role,body){
  assert.ok(['agentstudio_worker','agentstudio_api'].includes(role))
  const db=await f.pool.connect()
  try{await db.query('BEGIN');await db.query('SET LOCAL ROLE '+role);return await body(db)}
  finally{await db.query('ROLLBACK').catch(()=>{});db.release()}
}
async function refuseTamper(f,label,mutation){
  await f.db.exec('BEGIN')
  try{await f.db.exec(mutation);await assert.rejects(verifyAgentReviewCredentials(f.db),/unsafe_agent_review_privileges/,label)}
  finally{await f.db.exec('ROLLBACK')}
  assert.equal(await verifyAgentReviewCredentials(f.db),true,'rollback restores '+label)
}
async function assertErased(f,s,p){
  const row=await reviewLedgerRow(f,s,p.raw.request_id)
  assert.equal(row.body,null);assert.equal(row.state,'erased');assert.ok(row.tombstone_reason)
  assert.equal(row.source_count,p.raw.feedback_sources.length)
  const before=await reviewLedgerCounts(f)
  assertReceipt(await f.closed.confirm(s.identity,p.raw),p,row,{state:'erased',replayed:true})
  assertReceipt(await f.closed.submit(s.identity,p.raw),p,row,{state:'erased',replayed:true})
  assertReceipt(await f.ledger.submit(s.identity,p.raw),p,row,{state:'erased',replayed:true})
  const direct=await withActor(f.pool,s.identity,db=>db.query('SELECT agentstudio.agent_review_record($1::jsonb,NULL::jsonb) AS id',[JSON.stringify(p.raw)]))
  assert.equal(direct.rows[0].id,p.raw.request_id,'SQL original replay does not require or reconstruct private input')
  assert.deepEqual(await reviewLedgerCounts(f),before,'original replay cannot recreate input, queue or audit')
  assert.equal((await reviewLedgerRow(f,s,p.raw.request_id)).body,null)
}

test('optional056 auditor rejects orphans, partial schema, extra triggers, source/ACL/privacy tampering and accepts the exact predecessor extension',serial,async()=>{
  const f=await agentReviewLedgerFixture({installed:false})
  try{
    assert.equal(await verifyAgentReviewCredentials(f.db),false)
    for(const mutation of [
      'CREATE TABLE agentstudio.agent_review_orphan(id integer)',
      'CREATE FUNCTION agentstudio.agent_review_orphan() RETURNS integer LANGUAGE sql AS $$SELECT 1$$',
      `CREATE FUNCTION agentstudio.synthetic_review_orphan_trigger() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RETURN OLD; END$$;
       CREATE TRIGGER agent_review_feedback_privacy AFTER DELETE ON agentstudio.agent_feedback_bodies FOR EACH ROW EXECUTE FUNCTION agentstudio.synthetic_review_orphan_trigger()`
    ]){
      await f.db.exec('BEGIN')
      try{await f.db.exec(mutation);await assert.rejects(verifyAgentReviewCredentials(f.db),/unsafe_agent_review_privileges/)}
      finally{await f.db.exec('ROLLBACK')}
      assert.equal(await verifyAgentReviewCredentials(f.db),false)
    }
    await f.db.exec(f.sql('migrations/pg_v9_056_agent_review_ledger.sql'))
    assert.equal(await withActor(f.pool,f.identities.alice,verifyAgentReviewCredentials),true)
    assert.equal(await withActor(f.pool,f.identities.alice,verifyAgentFeedbackCredentials),true)
    assert.equal(await withActor(f.pool,f.identities.alice,verifyAgentOptimizationCredentials),true)
    for(const [label,mutation] of [
      ['API table write','GRANT INSERT ON agentstudio.agent_review_requests TO agentstudio_api'],
      ['field grant','GRANT UPDATE(body) ON agentstudio.agent_review_inputs TO agentstudio_api'],
      ['API input SELECT','GRANT SELECT ON agentstudio.agent_review_inputs TO agentstudio_api'],
      ['API input field SELECT','GRANT SELECT(body) ON agentstudio.agent_review_inputs TO agentstudio_api'],
      ['old Worker read','GRANT SELECT ON agentstudio.agent_review_requests TO agentstudio_worker'],
      ['grant option','GRANT SELECT ON agentstudio.agent_review_requests TO agentstudio_api WITH GRANT OPTION'],
      ['private routine grant','GRANT EXECUTE ON FUNCTION agentstudio.agent_review_digest(jsonb) TO agentstudio_api'],
      ['old Worker admission grant','GRANT EXECUTE ON FUNCTION agentstudio.agent_review_record(jsonb,jsonb) TO agentstudio_worker'],
      ['function source',`CREATE OR REPLACE FUNCTION agentstudio.agent_review_digest(jsonb) RETURNS text LANGUAGE sql IMMUTABLE STRICT SECURITY INVOKER SET search_path=pg_catalog AS $$SELECT repeat('f',64)$$`],
      ['function search path','ALTER FUNCTION agentstudio.agent_review_record(jsonb,jsonb) SET search_path=public'],
      ['function security','ALTER FUNCTION agentstudio.agent_review_control(jsonb) SECURITY INVOKER'],
      ['disabled privacy trigger','ALTER TABLE agentstudio.agent_feedback_bodies DISABLE TRIGGER agent_review_feedback_privacy'],
      ['extra input trigger',`CREATE FUNCTION agentstudio.synthetic_review_extra_trigger() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RETURN NEW; END$$;
        CREATE TRIGGER synthetic_review_extra BEFORE INSERT ON agentstudio.agent_review_inputs FOR EACH ROW EXECUTE FUNCTION agentstudio.synthetic_review_extra_trigger()`],
      ['privacy routine mounted twice','CREATE TRIGGER synthetic_review_privacy_copy AFTER DELETE ON agentstudio.agent_feedback_lessons FOR EACH ROW EXECUTE FUNCTION agentstudio.agent_review_feedback_erasure()'],
      ['RLS force','ALTER TABLE agentstudio.agent_review_requests NO FORCE ROW LEVEL SECURITY'],
      ['owner policy','ALTER POLICY agent_review_requests_read ON agentstudio.agent_review_requests USING(true)'],
      ['column contract','ALTER TABLE agentstudio.agent_review_inputs ALTER body DROP NOT NULL'],
      ['extra index','CREATE INDEX synthetic_review_extra_index ON agentstudio.agent_review_requests(spec_id)'],
      ['missing stamp',"DELETE FROM agentstudio.schema_migrations WHERE version='pg_v9_056'"],
      ['partial schema','DROP TABLE agentstudio.agent_review_inputs'],
      ['installed orphan','CREATE TABLE agentstudio.agent_review_orphan(id integer)']
    ])await refuseTamper(f,label,mutation)
  }finally{await f.close()}
})

test('explicit purpose/cost consent records exactly one request, private prepared body, selected feedback, queue and mandatory audit without changing the role or effects',serial,async()=>{
  const f=await agentReviewLedgerFixture()
  try{
    const s=await reviewLedgerSource(f),p=await reviewLedgerSubmission(f,s),before=await reviewLedgerCounts(f),role=await f.agents.get(s.identity,s.role.id)
    assert.equal(p.prepared.recorded,false)
    await assert.rejects(f.closed.submit(s.identity,p.raw),nativeDenied)
    await assert.rejects(f.closed.confirm(s.identity,p.raw),notFound)
    const invalid=[{confirm:false},{confirm:'true'},{fee_acknowledgement:agentReviewFees.evaluate},{fee_acknowledgement:true},
      {request_sha256:p.parsed.request_sha256},{owner_user_id:s.owner},{paid:true},{messages:p.prepared.messages}]
    for(const patch of invalid)await assert.rejects(f.ledger.submit(s.identity,{...p.raw,...patch}),e=>e.status===400)
    const {fee_acknowledgement:_,...noFee}=p.raw
    await assert.rejects(f.ledger.submit(s.identity,noFee),e=>e.status===400)
    assert.deepEqual(await reviewLedgerCounts(f),before)
    const connect=f.pool.connect.bind(f.pool);let admissionClients=0,receipt
    f.pool.connect=async()=>{assert.equal(++admissionClients,1,'source preparation and record must share the verified admission transaction');return connect()}
    try{receipt=await f.ledger.submit(s.identity,p.raw)}finally{f.pool.connect=connect}
    assert.equal(admissionClients,1)
    const row=await reviewLedgerRow(f,s,p.raw.request_id)
    assertReceipt(receipt,p,row)
    assert.deepEqual(row.body,{choice:p.choice,messages:p.prepared.messages})
    const payload=JSON.parse(row.body.messages[1].content)
    assert.equal(payload.task,null)
    assert.equal(payload.employee_statements[0].comment,'合成😀核对：a:b\nSynthetic review statement token=***')
    assert.doesNotMatch(JSON.stringify(row.body.messages),/api_key_ciphertext|syntheticReviewLedgerTask|syntheticReviewLedgerFeedback|checkpoint/)
    assert.equal(row.owner_user_id,s.owner);assert.equal(row.source_count,1);assert.equal(row.tombstone_reason,null)
    const refs=(await f.db.query('SELECT feedback_id FROM agentstudio.agent_review_feedback_sources WHERE owner_user_id=$1 AND request_id=$2',[s.owner,p.raw.request_id])).rows
    assert.deepEqual(refs,[{feedback_id:s.feedback.feedback_id}])
    const audit=(await f.db.query("SELECT owner_user_id,actor_user_id,run_id,target_id,result,metadata FROM agentstudio.audit_events WHERE action='agent_review.submitted' AND target_id=$1",[p.raw.request_id])).rows
    assert.equal(audit.length,1);assert.equal(audit[0].owner_user_id,s.owner);assert.equal(audit[0].actor_user_id,s.owner)
    assert.equal(audit[0].run_id,s.runId);assert.equal(audit[0].target_id,p.raw.request_id);assert.equal(audit[0].result,'succeeded')
    assert.equal(audit[0].metadata.request_sha256,p.parsed.request_sha256);assert.equal(audit[0].metadata.input_sha256,p.prepared.input_sha256)
    assert.doesNotMatch(JSON.stringify(audit),/Synthetic review statement|model_binding|messages|ROLE_PRIVATE|syntheticReviewLedger/)
    const metadata=(await f.db.query('SELECT to_jsonb(r)::text AS text FROM agentstudio.agent_review_requests r WHERE request_id=$1',[p.raw.request_id])).rows[0].text
    assert.doesNotMatch(metadata,/choice|messages|model_binding|fee_acknowledgement|ROLE_PRIVATE|Synthetic review statement/)
    assert.deepEqual(await f.agents.get(s.identity,s.role.id),role)
    const after=await reviewLedgerCounts(f)
    assert.deepEqual(after,{...before,requests:before.requests+1,inputs:before.inputs+1,sources:before.sources+1,review_jobs:before.review_jobs+1,review_audits:before.review_audits+1,audits:before.audits+1})
    const evaluation=await reviewLedgerSubmission(f,s,'evaluate')
    await assert.rejects(f.ledger.submit(s.identity,{...evaluation.raw,fee_acknowledgement:agentReviewFees.optimize}),e=>e.status===400)
    const evaluated=await f.ledger.submit(s.identity,evaluation.raw),evaluationRow=await reviewLedgerRow(f,s,evaluation.raw.request_id)
    assertReceipt(evaluated,evaluation,evaluationRow);assert.equal(evaluated.source_protocol,'current_task_delivery_v1')
    assert.equal(evaluationRow.source_count,0);assert.equal(JSON.parse(evaluationRow.body.messages[1].content).task.status,'cancelled')
    assert.equal((await reviewLedgerCounts(f)).effects,before.effects);assert.equal((await reviewLedgerCounts(f)).jobs,before.jobs)
  }finally{await f.close()}
})

test('original request replay is hash exact, metadata only and works after submissions close and current role/model/epoch no longer match',serial,async()=>{
  const f=await agentReviewLedgerFixture()
  try{
    const s=await reviewLedgerSource(f),p=await reviewLedgerSubmission(f,s)
    await f.ledger.submit(s.identity,p.raw)
    const row=await reviewLedgerRow(f,s,p.raw.request_id),before=await reviewLedgerCounts(f)
    assertReceipt(await f.ledger.submit(s.identity,p.raw),p,row,{replayed:true})
    assertReceipt(await f.closed.confirm(s.identity,p.raw),p,row,{replayed:true})
    assertReceipt(await f.closed.submit(s.identity,{...p.raw,request_id:p.raw.request_id.toUpperCase()}),p,row,{replayed:true})
    for(const patch of [{output_token_limit:4096},{expected_input_sha256:'e'.repeat(64)},{expected_spec_sha256:'d'.repeat(64)}]){
      await assert.rejects(f.ledger.submit(s.identity,{...p.raw,...patch}),conflict)
      await assert.rejects(f.closed.confirm(s.identity,{...p.raw,...patch}),conflict)
    }
    assert.deepEqual(await reviewLedgerCounts(f),before)
    const oldRole=await f.agents.get(s.identity,s.role.id),{require_approval:_,...spec}=oldRole.spec
    await f.agents.update(s.identity,oldRole.id,oldRole.name,safeAgentSpec({...spec,goal:'Later ordinary role, unrelated to original receipt'}),oldRole.revision)
    await f.db.query('UPDATE agentstudio.model_connections SET enabled=false,revision=revision+1 WHERE id=$1',[p.choice.model_binding.connection_id])
    await f.db.query('UPDATE agentstudio_auth.accounts SET governance_revision=governance_revision+2 WHERE user_id=$1',[s.owner])
    await f.db.query("UPDATE agentstudio.runs SET checkpoint='{}'::jsonb WHERE id=$1",[s.runId])
    const staleBefore=await reviewLedgerCounts(f)
    f.setFault(sql=>{if(/\b(?:FROM|JOIN)\s+agentstudio\.agent_review_inputs\b/i.test(sql))throw Error('original_confirmation_read_private_input')})
    try{
      assertReceipt(await f.closed.confirm(s.identity,p.raw),p,row,{replayed:true})
      assertReceipt(await f.closed.submit(s.identity,p.raw),p,row,{replayed:true})
      assertReceipt(await f.ledger.submit(s.identity,p.raw),p,row,{replayed:true})
    }finally{f.setFault(undefined)}
    await assert.rejects(f.closed.confirm(s.identity,{...p.raw,request_id:randomUUID()}),notFound)
    await assert.rejects(f.closed.submit(s.identity,{...p.raw,request_id:randomUUID()}),nativeDenied)
    await assert.rejects(f.ledger.submit(s.identity,{...p.raw,request_id:randomUUID()}),conflict)
    assert.deepEqual(await reviewLedgerCounts(f),staleBefore)
    assert.deepEqual((await reviewLedgerRow(f,s,p.raw.request_id)).body,row.body)
  }finally{await f.close()}
})

test('forgetting a lesson preserves inputs; identical-text correction and feedback erasure atomically erase every selected dependent without allowing original replay to resurrect it',serial,async()=>{
  const f=await agentReviewLedgerFixture()
  try{
    const s=await reviewLedgerSource(f,{remember:true}),one=await reviewLedgerSubmission(f,s),two=await reviewLedgerSubmission(f,s)
    assert.equal(s.feedback.lesson_result.decision,'stored')
    await f.ledger.submit(s.identity,one.raw);await f.ledger.submit(s.identity,two.raw)
    const oneRow=await reviewLedgerRow(f,s,one.raw.request_id),twoRow=await reviewLedgerRow(f,s,two.raw.request_id),before=await reviewLedgerCounts(f)
    await f.feedback.change(s.identity,{action:'forget_lesson',request_id:randomUUID(),spec_id:s.role.id,run_id:s.runId,
      feedback_id:s.feedback.feedback_id,expected_content_sha256:s.feedback.lesson_result.content_sha256,confirm:true})
    assert.deepEqual((await reviewLedgerRow(f,s,one.raw.request_id)).body,oneRow.body)
    assert.deepEqual((await reviewLedgerRow(f,s,two.raw.request_id)).body,twoRow.body)
    const forgotten=await reviewLedgerCounts(f)
    assert.equal(forgotten.inputs,before.inputs);assert.equal(forgotten.tombstones,0);assert.equal(forgotten.feedback_bodies,1)
    assert.equal(forgotten.feedback_lessons,0);assert.equal(forgotten.review_audits,before.review_audits)
    assert.equal((await f.review.preview(s.identity,one.choice)).input_sha256,one.prepared.input_sha256)
    const state=await f.feedback.status(s.identity,s.runId)
    const replacement=await f.feedback.change(s.identity,{...s.feedbackRaw,request_id:randomUUID(),expected_revision:state.revision,remember_lesson:false})
    assert.equal(replacement.statement_sha256,s.feedback.statement_sha256)
    assert.notEqual(replacement.feedback_sha256,s.feedback.feedback_sha256)
    assert.notEqual(replacement.feedback_id,s.feedback.feedback_id)
    await assert.rejects(f.review.preview(s.identity,one.choice),e=>e.code==='agent_review_feedback_changed')
    await assertErased(f,s,one);await assertErased(f,s,two)
    assert.equal((await reviewLedgerCounts(f)).tombstones,2)
    const corrected={...s,feedback:replacement},three=await reviewLedgerSubmission(f,corrected)
    assert.notEqual(three.prepared.input_sha256,one.prepared.input_sha256)
    await f.ledger.submit(s.identity,three.raw)
    const correctedBefore=await reviewLedgerCounts(f)
    assert.equal(correctedBefore.inputs,1);assert.equal(correctedBefore.feedback_bodies,1)
    await f.feedback.change(s.identity,await reviewLedgerFeedbackErase(f,corrected))
    await assertErased(f,s,one);await assertErased(f,s,two);await assertErased(f,corrected,three)
    const after=await reviewLedgerCounts(f)
    assert.equal(after.requests,3);assert.equal(after.inputs,0);assert.equal(after.sources,3);assert.equal(after.tombstones,3)
    assert.equal(after.review_jobs,3);assert.equal(after.controls,0);assert.equal(after.feedback_bodies,0)
    assert.equal(after.effects,before.effects);assert.equal(after.jobs,before.jobs);assert.equal(after.optimization_links,before.optimization_links)
    assert.deepEqual((await f.db.query('SELECT DISTINCT state FROM agentstudio.agent_review_jobs')).rows,[{state:'erased'}])
    assert.equal((await f.db.query("SELECT count(*)::integer AS n FROM agentstudio.audit_events WHERE action='agent_review.source_erased'")).rows[0].n,3)
    assert.equal((await f.owned.get(s.identity,s.runId)).run.status,'cancelled')
    assert.equal((await f.agents.get(s.identity,s.role.id)).revision,s.role.revision)
  }finally{await f.close()}
})

test('cancel preserves the original body; explicit erase after cancel is irreversible, and control receipts are exact and independently replayable',serial,async()=>{
  const f=await agentReviewLedgerFixture()
  try{
    const s=await reviewLedgerSource(f),p=await reviewLedgerSubmission(f,s)
    await f.ledger.submit(s.identity,p.raw)
    const original=await reviewLedgerRow(f,s,p.raw.request_id),cancel=control(p),before=await reviewLedgerCounts(f)
    const cancelled=await f.closed.change(s.identity,cancel)
    await assertControlReceipt(f,s,cancel,cancelled)
    const cancelledRow=await reviewLedgerRow(f,s,p.raw.request_id)
    assert.equal(cancelledRow.state,'cancelled');assert.equal(cancelledRow.tombstone_reason,null);assert.deepEqual(cancelledRow.body,original.body)
    assertReceipt(await f.closed.confirm(s.identity,p.raw),p,cancelledRow,{state:'cancelled',replayed:true})
    const cancelledBefore=await reviewLedgerCounts(f)
    await assertControlReceipt(f,s,cancel,await f.closed.change(s.identity,cancel),{replayed:true})
    await assertControlReceipt(f,s,cancel,await f.closed.confirmControl(s.identity,cancel),{replayed:true})
    await assert.rejects(f.closed.change(s.identity,{...cancel,action:'erase'}),conflict)
    await assert.rejects(f.closed.confirmControl(s.identity,{...cancel,action:'erase'}),conflict)
    await assert.rejects(f.closed.confirmControl(s.identity,{...cancel,request_id:randomUUID()}),notFound)
    await assert.rejects(f.closed.change(s.identity,{...control(p),expected_request_sha256:'f'.repeat(64)}),notFound)
    for(const patch of [{confirm:false},{confirm:'true'},{action:'stop'},{owner_user_id:s.owner},{request_id:p.raw.request_id},{provider_refund:true}])
      await assert.rejects(f.closed.change(s.identity,{...control(p),...patch}),e=>e.status===400)
    const {confirm:_,...unconfirmed}=control(p)
    await assert.rejects(f.closed.change(s.identity,unconfirmed),e=>e.status===400)
    assert.deepEqual(await reviewLedgerCounts(f),cancelledBefore)
    const erase=control(p,'erase')
    await assertControlReceipt(f,s,erase,await f.closed.change(s.identity,erase))
    await assertErased(f,s,p)
    const erasedBefore=await reviewLedgerCounts(f)
    await assertControlReceipt(f,s,erase,await f.closed.change(s.identity,erase),{replayed:true})
    await assertControlReceipt(f,s,erase,await f.closed.confirmControl(s.identity,erase),{replayed:true})
    assert.deepEqual(await reviewLedgerCounts(f),erasedBefore)
    await f.db.query('UPDATE agentstudio_auth.accounts SET governance_revision=governance_revision+2 WHERE user_id=$1',[s.owner])
    await f.db.query("UPDATE agentstudio.runs SET checkpoint='{}'::jsonb WHERE id=$1",[s.runId])
    await assertControlReceipt(f,s,cancel,await f.closed.confirmControl(s.identity,cancel),{replayed:true})
    await assertControlReceipt(f,s,erase,await f.closed.change(s.identity,erase),{replayed:true})
    const laterCancel=control(p)
    await assertControlReceipt(f,s,laterCancel,await f.closed.change(s.identity,laterCancel))
    await assertErased(f,s,p)
    const after=await reviewLedgerCounts(f)
    assert.equal(after.controls,3);assert.equal(after.tombstones,1);assert.equal(after.inputs,0);assert.equal(after.feedback_bodies,1)
    assert.equal(after.effects,before.effects);assert.equal(after.jobs,before.jobs)
  }finally{await f.close()}
})

test('foreign and non-Native actors cannot submit or confirm owner requests/controls; API metadata RLS and private input/old Worker privileges hold in actual SQL',serial,async()=>{
  const f=await agentReviewLedgerFixture()
  try{
    const alice=await reviewLedgerSource(f),ap=await reviewLedgerSubmission(f,alice),bob=await reviewLedgerSource(f,{who:'bob'}),bp=await reviewLedgerSubmission(f,bob)
    await f.ledger.submit(alice.identity,ap.raw);await f.ledger.submit(bob.identity,bp.raw)
    const ac=control(ap,'erase'),bc=control(bp,'erase')
    await f.closed.change(alice.identity,ac);await f.closed.change(bob.identity,bc)
    const before=await reviewLedgerCounts(f)
    await assert.rejects(f.ledger.submit(bob.identity,ap.raw),notFound)
    await assert.rejects(f.closed.confirm(bob.identity,ap.raw),notFound)
    await assert.rejects(f.closed.change(bob.identity,control(ap)),notFound)
    await assert.rejects(f.closed.confirmControl(bob.identity,ac),notFound)
    const foreign={issuer:'https://foreign.invalid',subject:alice.identity.subject}
    for(const operation of [()=>f.ledger.submit(foreign,ap.raw),()=>f.closed.confirm(foreign,ap.raw),()=>f.closed.change(foreign,ac),()=>f.closed.confirmControl(foreign,ac)])
      await assert.rejects(operation(),nativeDenied)
    const metadataTables=['requests','feedback_sources','jobs','controls','tombstones']
    for(const [s,other] of [[alice,bob],[bob,alice]])for(const suffix of metadataTables){
      const rows=(await withActor(f.pool,s.identity,db=>db.query('SELECT owner_user_id FROM agentstudio.agent_review_'+suffix))).rows
      assert.equal(rows.length,1,suffix+' has exactly the owner row');assert.equal(rows[0].owner_user_id,s.owner)
      assert.equal((await withActor(f.pool,s.identity,db=>db.query('SELECT count(*)::integer AS n FROM agentstudio.agent_review_'+suffix+' WHERE owner_user_id=$1',[other.owner]))).rows[0].n,0)
    }
    for(const suffix of [...metadataTables,'inputs']){
      const table='agentstudio.agent_review_'+suffix
      for(const sql of ['INSERT INTO '+table+' DEFAULT VALUES','UPDATE '+table+' SET request_id=request_id','DELETE FROM '+table,'TRUNCATE '+table]){
        await assert.rejects(withActor(f.pool,alice.identity,db=>db.query(sql)),/permission denied/,'API '+sql)
        await assert.rejects(roleQuery(f,'agentstudio_worker',db=>db.query(sql)),/permission denied/,'old Worker '+sql)
      }
      await assert.rejects(roleQuery(f,'agentstudio_worker',db=>db.query('SELECT count(*) FROM '+table)),/permission denied/)
    }
    for(const identity of [alice.identity,bob.identity])for(const select of ['SELECT * FROM agentstudio.agent_review_inputs','SELECT body FROM agentstudio.agent_review_inputs','SELECT count(*) FROM agentstudio.agent_review_inputs'])
      await assert.rejects(withActor(f.pool,identity,db=>db.query(select)),/permission denied/)
    for(const sql of ["SELECT agentstudio.agent_review_digest('{}'::jsonb)",'SELECT agentstudio.agent_review_feedback_erasure()'])
      await assert.rejects(withActor(f.pool,alice.identity,db=>db.query(sql)),/permission denied/)
    for(const sql of ["SELECT agentstudio.agent_review_record('{}'::jsonb,'{}'::jsonb)","SELECT agentstudio.agent_review_control('{}'::jsonb)","SELECT agentstudio.agent_review_digest('{}'::jsonb)"])
      await assert.rejects(roleQuery(f,'agentstudio_worker',db=>db.query(sql)),/permission denied/)
    assert.deepEqual(await reviewLedgerCounts(f),before)
  }finally{await f.close()}
})

test('new submissions revalidate current role, model, source/input hashes and Native epoch, reject prior evaluation sources, and never create partial ledger state',serial,async()=>{
  const f=await agentReviewLedgerFixture()
  try{
    const s=await reviewLedgerSource(f),p=await reviewLedgerSubmission(f,s),before=await reviewLedgerCounts(f)
    for(const patch of [
      {expected_spec_revision:p.raw.expected_spec_revision+1},{expected_spec_sha256:'a'.repeat(64)},{expected_source_sha256:'b'.repeat(64)},
      {expected_input_sha256:'c'.repeat(64)},{output_token_limit:4096},
      {model_binding:{...p.raw.model_binding,connection_revision:p.raw.model_binding.connection_revision+1}},
      {model_binding:{...p.raw.model_binding,connection_id:f.resources.bob.model.id}},
      {model_binding:{...p.raw.model_binding,model_id:'not-selected'}}
    ])await assert.rejects(f.ledger.submit(s.identity,{...p.raw,request_id:randomUUID(),...patch}),conflict)
    const prior={run_id:s.runId,review_id:randomUUID(),result_sha256:'d'.repeat(64)}
    await assert.rejects(f.ledger.submit(s.identity,{...p.raw,request_id:randomUUID(),evaluation_sources:[prior]}),e=>e.code==='agent_review_evaluation_source_unavailable')
    assert.deepEqual(await reviewLedgerCounts(f),before)
    const role=await f.agents.get(s.identity,s.role.id),{require_approval:_,...spec}=role.spec
    await f.agents.update(s.identity,role.id,role.name,safeAgentSpec({...spec,goal:'Changed current role source must be selected again'}),role.revision)
    const changedRole=await reviewLedgerCounts(f)
    await assert.rejects(f.ledger.submit(s.identity,{...p.raw,request_id:randomUUID()}),conflict)
    assert.deepEqual(await reviewLedgerCounts(f),changedRole)
    const fresh=await reviewLedgerSubmission(f,s)
    await f.db.query('UPDATE agentstudio_auth.accounts SET governance_revision=governance_revision+2 WHERE user_id=$1',[s.owner])
    const epochBefore=await reviewLedgerCounts(f)
    await assert.rejects(f.ledger.submit(s.identity,fresh.raw),conflict)
    assert.deepEqual(await reviewLedgerCounts(f),epochBefore)
    const current=await reviewLedgerSubmission(f,s)
    assert.equal(current.prepared.content_sha256,fresh.prepared.content_sha256)
    assert.notEqual(current.prepared.input_sha256,fresh.prepared.input_sha256)
    assert.equal(current.prepared.owner_epoch,fresh.prepared.owner_epoch+2)
    const recorded=await f.ledger.submit(s.identity,current.raw)
    assertReceipt(recorded,current,await reviewLedgerRow(f,s,current.raw.request_id))
    await f.db.query('UPDATE agentstudio.model_connections SET enabled=false,revision=revision+1 WHERE id=$1',[current.raw.model_binding.connection_id])
    const modelBefore=await reviewLedgerCounts(f)
    await assert.rejects(f.ledger.submit(s.identity,{...current.raw,request_id:randomUUID()}),conflict)
    assert.deepEqual(await reviewLedgerCounts(f),modelBefore)
    await f.db.query('UPDATE agentstudio_auth.accounts SET enabled=false WHERE user_id=$1',[s.owner])
    const disabledBefore=await reviewLedgerCounts(f)
    await assert.rejects(f.ledger.submit(s.identity,{...current.raw,request_id:randomUUID()}),nativeDenied)
    await assert.rejects(f.closed.confirm(s.identity,current.raw),nativeDenied)
    assert.deepEqual(await reviewLedgerCounts(f),disabledBefore)
    assert.equal(disabledBefore.requests,1);assert.equal(disabledBefore.effects,before.effects);assert.equal(disabledBefore.jobs,before.jobs)
  }finally{await f.close()}
})

test('mandatory SQL audit failure rolls back submission, explicit erase, same-text feedback correction and feedback deletion with all dependent private bodies intact',serial,async()=>{
  const f=await agentReviewLedgerFixture()
  const installFault=()=>f.db.exec(`CREATE FUNCTION agentstudio.synthetic_reject_review_audit() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN IF NEW.target_kind='agent_review' THEN RAISE EXCEPTION 'synthetic_review_audit_failed'; END IF; RETURN NEW; END$$;
    CREATE TRIGGER synthetic_review_audit BEFORE INSERT ON agentstudio.audit_events FOR EACH ROW EXECUTE FUNCTION agentstudio.synthetic_reject_review_audit()`)
  const removeFault=()=>f.db.exec('DROP TRIGGER synthetic_review_audit ON agentstudio.audit_events; DROP FUNCTION agentstudio.synthetic_reject_review_audit()')
  try{
    const s=await reviewLedgerSource(f),p=await reviewLedgerSubmission(f,s),before=await reviewLedgerCounts(f),role=await f.agents.get(s.identity,s.role.id)
    await installFault()
    try{await assert.rejects(f.ledger.submit(s.identity,p.raw),/synthetic_review_audit_failed/)}finally{await removeFault()}
    assert.deepEqual(await reviewLedgerCounts(f),before)
    assert.equal(await reviewLedgerRow(f,s,p.raw.request_id),undefined)
    await assert.rejects(f.closed.confirm(s.identity,p.raw),notFound)
    await f.ledger.submit(s.identity,p.raw)
    const row=await reviewLedgerRow(f,s,p.raw.request_id),savedBefore=await reviewLedgerCounts(f),erase=control(p,'erase')
    const state=await f.feedback.status(s.identity,s.runId),correction={...s.feedbackRaw,request_id:randomUUID(),expected_revision:state.revision},feedbackErase=await reviewLedgerFeedbackErase(f,s)
    await installFault()
    try{
      await assert.rejects(f.closed.change(s.identity,erase),/synthetic_review_audit_failed/)
      assert.deepEqual(await reviewLedgerCounts(f),savedBefore)
      assert.deepEqual(await reviewLedgerRow(f,s,p.raw.request_id),row)
      await assert.rejects(f.closed.confirmControl(s.identity,erase),notFound)
      await assert.rejects(f.feedback.change(s.identity,correction),/synthetic_review_audit_failed/)
      assert.deepEqual(await reviewLedgerCounts(f),savedBefore)
      assert.deepEqual(await reviewLedgerRow(f,s,p.raw.request_id),row)
      assert.equal((await f.feedback.status(s.identity,s.runId)).current.feedback_id,s.feedback.feedback_id)
      await assert.rejects(f.feedback.change(s.identity,feedbackErase),/synthetic_review_audit_failed/)
      assert.deepEqual(await reviewLedgerCounts(f),savedBefore)
      assert.deepEqual(await reviewLedgerRow(f,s,p.raw.request_id),row)
      assert.equal((await f.feedback.status(s.identity,s.runId)).current.body.comment,'合成😀核对：a:b\nSynthetic review statement token=***')
    }finally{await removeFault()}
    assert.deepEqual(await f.agents.get(s.identity,s.role.id),role)
    await f.feedback.change(s.identity,feedbackErase)
    await assertErased(f,s,p)
    await assertControlReceipt(f,s,erase,await f.closed.change(s.identity,erase))
    await assertErased(f,s,p)
    const after=await reviewLedgerCounts(f)
    assert.equal(after.feedback_receipts,savedBefore.feedback_receipts+1,'failed correction and erasure left no receipt')
    assert.equal(after.inputs,0);assert.equal(after.feedback_bodies,0);assert.equal(after.tombstones,1);assert.equal(after.controls,1)
    assert.equal(after.effects,before.effects);assert.equal(after.jobs,before.jobs)
  }finally{await f.close()}
})

test('the protected SQL admission/control routines independently reject malformed consent, stale provenance and forged prepared hashes before recording, and replay exact originals read only',serial,async()=>{
  const f=await agentReviewLedgerFixture()
  try{
    const s=await reviewLedgerSource(f),p=await reviewLedgerSubmission(f,s),before=await reviewLedgerCounts(f)
    const record=(raw,prepared)=>withActor(f.pool,s.identity,db=>db.query('SELECT agentstudio.agent_review_record($1::jsonb,$2::jsonb) AS id',[JSON.stringify(raw),JSON.stringify(prepared)]))
    for(const patch of [{confirm:false},{fee_acknowledgement:agentReviewFees.evaluate},{request_sha256:p.parsed.request_sha256},
      {expected_spec_sha256:'a'.repeat(64)},{expected_source_sha256:'b'.repeat(64)},{expected_input_sha256:'c'.repeat(64)},
      {model_binding:{...p.raw.model_binding,connection_id:f.resources.bob.model.id}},
      {feedback_sources:[{...p.raw.feedback_sources[0],feedback_sha256:'d'.repeat(64)}]},
      {evaluation_sources:[{run_id:s.runId,review_id:randomUUID(),result_sha256:'e'.repeat(64)}]}
    ])await assert.rejects(record({...p.raw,...patch},p.prepared),/agent_review_(?:invalid_intent|input_changed|source_unavailable|model_unavailable|feedback_changed|evaluation_source_unavailable)/)
    for(const patch of [{recorded:true},{owner_epoch:p.prepared.owner_epoch+1},{content_sha256:'a'.repeat(64)},{input_sha256:'b'.repeat(64)},
      {byte_length:p.prepared.byte_length+1},{source_protocol:'current_task_delivery_v1'},
      {messages:[{role:'user',content:'Forged system role'},p.prepared.messages[1]]},
      {choice:{...p.choice,output_token_limit:4096}},{unexpected:'forged'}
    ])await assert.rejects(record(p.raw,{...p.prepared,...patch}),/agent_review_input_changed/)
    assert.deepEqual(await reviewLedgerCounts(f),before)
    assert.equal((await record(p.raw,p.prepared)).rows[0].id,p.raw.request_id)
    const row=await reviewLedgerRow(f,s,p.raw.request_id)
    assertReceipt(await f.closed.confirm(s.identity,p.raw),p,row,{replayed:true})
    const recordedBefore=await reviewLedgerCounts(f)
    assert.equal((await record(p.raw,null)).rows[0].id,p.raw.request_id)
    assert.equal((await record(p.raw,{invalid:'ignored on original replay'})).rows[0].id,p.raw.request_id)
    await assert.rejects(record({...p.raw,output_token_limit:4096},null),/agent_review_request_conflict/)
    const change=raw=>withActor(f.pool,s.identity,db=>db.query('SELECT agentstudio.agent_review_control($1::jsonb) AS id',[JSON.stringify(raw)]))
    for(const patch of [{confirm:false},{action:'stop'},{request_id:p.raw.request_id},{unexpected:'forged'}])
      await assert.rejects(change({...control(p),...patch}),/agent_review_invalid_control/)
    await assert.rejects(change({...control(p),expected_request_sha256:'f'.repeat(64)}),/agent_review_receipt_not_found/)
    assert.deepEqual(await reviewLedgerCounts(f),recordedBefore)
    const erase=control(p,'erase')
    assert.equal((await change(erase)).rows[0].id,erase.request_id)
    await assertControlReceipt(f,s,erase,await f.closed.confirmControl(s.identity,erase),{replayed:true})
    await assertErased(f,s,p)
    const erasedBefore=await reviewLedgerCounts(f)
    assert.equal((await change(erase)).rows[0].id,erase.request_id)
    assert.deepEqual(await reviewLedgerCounts(f),erasedBefore)
  }finally{await f.close()}
})
