// Hosted serial synthetic SQL only. Every successful opinion below is made
// by actual protected057 claim/reserve/finish, never an inserted success row.
import test from 'node:test'
import assert from 'node:assert/strict'
import {createHash,randomUUID} from 'node:crypto'
import {agentAssessmentFixture,assessmentRequest,assessmentClaim,assessmentProof,assessmentReserve,assessmentFinish,assessmentPause,assessmentCancel,assessmentErase,
  assessmentFeedbackErase,assessmentRole,assessmentRows,assessmentCounts,assessmentOutputHash,assessmentEvaluation,assessmentOptimization} from './helpers/agent-assessment-fixture.mjs'
import {withActor} from '../src/repository.ts'
import {canonicalMcpJson} from '../src/mcp-catalog.ts'
import {verifyAgentOpinionCredentials} from '../src/agent-opinion-audit.ts'
import {verifyAgentAssessmentCredentials} from '../src/agent-assessment-audit.ts'
import {verifyAgentReviewCredentials} from '../src/agent-review-audit.ts'
import {reviewLedgerCounts} from './helpers/agent-review-ledger-fixture.mjs'
import {agentDescriptiveLimits as limits} from '../../../shared/agent-role-limits.mjs'

const serial={concurrency:false},invalid=/agent_opinion_source_unavailable/
const anchorKeys=['protocol','request_id','spec_id','run_id','purpose','request_sha256','input_sha256','content_sha256','owner_epoch','source_protocol','created_at','job_state','lease_state','outcome','body_erased','choice']
const sha=v=>createHash('sha256').update(canonicalMcpJson(v)).digest('hex')
const privateFields=/"messages"|"identity"|"owner_user_id"|"lease_token"|"worker_id"|api_key|syntheticReviewLedgerTask|syntheticReviewLedgerFeedback|private_checkpoint/
async function fixture({installed=true}={}){
  const f=await agentAssessmentFixture()
  try{if(installed)await f.db.exec(f.sql('migrations/pg_v9_058_agent_opinion_read.sql'));return f}
  catch(error){await f.close();throw error}
}
const anchor=(f,p,identity=p.identity)=>withActor(f.pool,identity,async db=>(await db.query('SELECT agentstudio.agent_opinion_anchor($1::uuid) AS value',[p.raw.request_id])).rows[0].value)
const body=(f,p,input=p.prepared.input_sha256,result=assessmentOutputHash(p,p.result),identity=p.identity)=>withActor(f.pool,identity,async db=>(await db.query('SELECT agentstudio.agent_opinion_body($1::uuid,$2::text,$3::text) AS value',[p.raw.request_id,input,result])).rows[0].value)
async function claim(f,p){const lease=await assessmentClaim(f);assert.ok(lease);assert.equal(lease.request_id,p.raw.request_id);return assessmentProof(lease)}
async function completed(f,options={}){
  const p=await assessmentRequest(f,options),proof=await claim(f,p),result=p.raw.purpose==='evaluate'?assessmentEvaluation():assessmentOptimization()
  if(options.fullCapacity)for(const [key,char] of [['deliverables','交'],['task_plan','计'],['done_criteria','验']])result.descriptive[key]=Array(limits.list_items).fill(char.repeat(limits.list_item))
  await assessmentReserve(f,proof);await assessmentFinish(f,proof,{status:'succeeded',result})
  return {...p,proof,result}
}
const counts=async f=>({review:await reviewLedgerCounts(f),assessment:await assessmentCounts(f)})
async function readonly(f,operation){const before=await counts(f);try{return await operation()}finally{assert.deepEqual(await counts(f),before)}}
function sealed(a,p,{lease=null,status=null,job='pending',erased=false,offered=false}={}){
  assert.deepEqual(Object.keys(a).sort(),anchorKeys.toSorted());assert.equal(a.protocol,'agent_paid_review_read_anchor_v1')
  for(const key of ['request_id','spec_id','run_id','purpose','request_sha256','input_sha256','content_sha256','owner_epoch','source_protocol'])assert.equal(a[key],p.receipt[key])
  assert.equal(new Date(a.created_at).toISOString(),p.receipt.created_at)
  assert.equal(a.job_state,job);assert.equal(a.lease_state,lease);assert.equal(a.body_erased,erased)
  if(status===null)assert.equal(a.outcome,null)
  else{
    assert.deepEqual(Object.keys(a.outcome).sort(),['status','completion_sha256','result_sha256','failure_code','created_at'].sort())
    assert.equal(a.outcome.status,status);assert.match(a.outcome.completion_sha256,/^[a-f0-9]{64}$/)
    if(status==='succeeded'){assert.equal(a.outcome.result_sha256,assessmentOutputHash(p,p.result));assert.equal(a.outcome.failure_code,null)}
    else{assert.equal(a.outcome.result_sha256,null);assert.equal(a.outcome.failure_code,'synthetic_'+status)}
  }
  assert.deepEqual(a.choice,offered?p.choice:null);assert.doesNotMatch(JSON.stringify(a),privateFields)
}
async function tamper(f,label,sql){
  await f.db.exec('BEGIN')
  try{await f.db.exec(sql);await assert.rejects(verifyAgentOpinionCredentials(f.db),/unsafe_agent_opinion_privileges/,label)}
  finally{await f.db.exec('ROLLBACK')}
  assert.equal(await verifyAgentOpinionCredentials(f.db),true,'rollback restores '+label)
}

test('optional058 accepts only the exact two owner-read functions and stamp; ACL/prosrc/role/partial drift refuses without widening057/056 grants',serial,async()=>{
  const f=await fixture({installed:false})
  try{
    assert.equal(await verifyAgentOpinionCredentials(f.db),false)
    for(const sql of ['CREATE TABLE agentstudio.agent_opinion_orphan(id integer)',"CREATE FUNCTION agentstudio.agent_opinion_orphan() RETURNS integer LANGUAGE sql AS $$SELECT 1$$"]){
      await f.db.exec('BEGIN');try{await f.db.exec(sql);await assert.rejects(verifyAgentOpinionCredentials(f.db),/unsafe_agent_opinion_privileges/)}finally{await f.db.exec('ROLLBACK')}
      assert.equal(await verifyAgentOpinionCredentials(f.db),false)
    }
    await f.db.exec(f.sql('migrations/pg_v9_058_agent_opinion_read.sql'))
    assert.equal(await withActor(f.pool,f.identities.alice,verifyAgentOpinionCredentials),true)
    assert.equal(await withActor(f.pool,f.identities.alice,verifyAgentAssessmentCredentials),true)
    assert.equal(await withActor(f.pool,f.identities.alice,verifyAgentReviewCredentials),true)
    for(const [label,sql] of [
      ['PUBLIC EXECUTE','GRANT EXECUTE ON FUNCTION agentstudio.agent_opinion_anchor(uuid) TO PUBLIC'],
      ['old Worker EXECUTE','GRANT EXECUTE ON FUNCTION agentstudio.agent_opinion_body(uuid,text,text) TO agentstudio_worker'],
      ['review Worker EXECUTE','GRANT EXECUTE ON FUNCTION agentstudio.agent_opinion_anchor(uuid) TO agentstudio_review_worker'],
      ['dispatch EXECUTE','GRANT EXECUTE ON FUNCTION agentstudio.agent_opinion_body(uuid,text,text) TO agentstudio_review_dispatch'],
      ['secret broker EXECUTE','GRANT EXECUTE ON FUNCTION agentstudio.agent_opinion_body(uuid,text,text) TO agentstudio_model_broker'],
      ['Native auth EXECUTE','GRANT EXECUTE ON FUNCTION agentstudio.agent_opinion_anchor(uuid) TO agentstudio_native_auth'],
      ['API grant option','GRANT EXECUTE ON FUNCTION agentstudio.agent_opinion_anchor(uuid) TO agentstudio_api WITH GRANT OPTION'],
      ['API input field read','GRANT SELECT(body) ON agentstudio.agent_review_inputs TO agentstudio_api'],
      ['API private result read','GRANT SELECT(result) ON agentstudio.agent_assessment_outputs TO agentstudio_api'],
      ['anchor security','ALTER FUNCTION agentstudio.agent_opinion_anchor(uuid) SECURITY INVOKER'],
      ['body path','ALTER FUNCTION agentstudio.agent_opinion_body(uuid,text,text) SET search_path=public'],
      ['body volatility','ALTER FUNCTION agentstudio.agent_opinion_body(uuid,text,text) IMMUTABLE'],
      ['function source',"CREATE OR REPLACE FUNCTION agentstudio.agent_opinion_anchor(uuid) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$BEGIN RETURN '{}'::jsonb; END$$"],
      ['unexpected overload',"CREATE FUNCTION agentstudio.agent_opinion_anchor(text) RETURNS jsonb LANGUAGE sql AS $$SELECT '{}'::jsonb$$"],
      ['API inheritance','ALTER ROLE agentstudio_api INHERIT'],
      ['missing stamp',"DELETE FROM agentstudio.schema_migrations WHERE version='pg_v9_058'"],
      ['partial functions','DROP FUNCTION agentstudio.agent_opinion_body(uuid,text,text)'],
      ['unexpected table','CREATE TABLE agentstudio.agent_opinion_orphan(id integer)']
    ])await tamper(f,label,sql)
    for(const role of ['agentstudio_worker','agentstudio_review_worker','agentstudio_review_dispatch','agentstudio_model_broker','agentstudio_native_auth','agentstudio_bound_dispatch'])
      for(const sql of ["SELECT agentstudio.agent_opinion_anchor('"+randomUUID()+"'::uuid)","SELECT agentstudio.agent_opinion_body('"+randomUUID()+"'::uuid,repeat('a',64),repeat('b',64))"])
        await assert.rejects(assessmentRole(f,role,db=>db.query(sql)),/permission denied/)
    for(const sql of ['SELECT body FROM agentstudio.agent_review_inputs','SELECT result FROM agentstudio.agent_assessment_outputs'])
      await assert.rejects(withActor(f.pool,f.identities.alice,db=>db.query(sql)),/permission denied/)
  }finally{await f.close()}
})

test('anchor preserves pending/claimed/reserved/paused/failed/unknown and cancelled/erased truth without inventing completion, refund or read audits',serial,async()=>{
  const f=await fixture()
  try{
    const p=await assessmentRequest(f)
    sealed(await readonly(f,()=>anchor(f,p)),p)
    const proof=await claim(f,p)
    sealed(await readonly(f,()=>anchor(f,p)),p,{lease:'claimed'})
    await assessmentReserve(f,proof);sealed(await readonly(f,()=>anchor(f,p)),p,{lease:'reserved'})
    await assessmentPause(f,proof);sealed(await readonly(f,()=>anchor(f,p)),p,{lease:'paused'})
    await assert.rejects(body(f,{...p,result:assessmentEvaluation()}),invalid)
    for(const status of ['failed','unknown']){
      const next=await assessmentRequest(f),lease=await claim(f,next)
      await assessmentReserve(f,lease);await assessmentFinish(f,lease,{status,failure_code:'synthetic_'+status})
      sealed(await readonly(f,()=>anchor(f,next)),next,{lease:status,status})
      await assert.rejects(body(f,{...next,result:assessmentEvaluation()}),invalid)
    }
    const done=await completed(f)
    sealed(await readonly(f,()=>anchor(f,done)),done,{lease:'succeeded',status:'succeeded',offered:true})
    await assessmentCancel(f,done)
    sealed(await readonly(f,()=>anchor(f,done)),done,{lease:'succeeded',status:'succeeded',job:'cancelled'})
    assert.equal((await assessmentRows(f,done.raw.request_id,done.owner)).outputs.length,1,'cancel retains private result but cannot offer it')
    await assert.rejects(body(f,done),invalid)
    await assessmentErase(f,done)
    sealed(await readonly(f,()=>anchor(f,done)),done,{lease:'succeeded',status:'succeeded',job:'erased',erased:true})
    assert.equal((await assessmentRows(f,done.raw.request_id,done.owner)).outputs.length,0)
    await assert.rejects(body(f,done),invalid)
  }finally{await f.close()}
})

test('real057 zero-score/full-capacity results with the same UUID remain owner exact; protected body is closed, digest exact and never selects private tables for API',serial,async()=>{
  const f=await fixture()
  try{
    const id=randomUUID(),alice=await completed(f,{purpose:'evaluate',requestId:id}),bob=await completed(f,{purpose:'optimize',who:'bob',requestId:id,outputTokenLimit:16384,fullCapacity:true})
    assert.notEqual(alice.owner,bob.owner)
    for(const p of [alice,bob]){
      sealed(await readonly(f,()=>anchor(f,p)),p,{lease:'succeeded',status:'succeeded',offered:true})
      const value=await readonly(f,()=>body(f,p))
      assert.deepEqual(value,{request_id:id,purpose:p.raw.purpose,input_sha256:p.prepared.input_sha256,result_sha256:assessmentOutputHash(p,p.result),result:p.result})
      assert.deepEqual(Object.keys(value).sort(),['request_id','purpose','input_sha256','result_sha256','result'].sort())
      if(p.raw.purpose==='optimize')for(const key of ['deliverables','task_plan','done_criteria']){assert.equal(value.result.descriptive[key].length,limits.list_items);assert.ok(value.result.descriptive[key].every(item=>item.length===limits.list_item))}
      assert.doesNotMatch(JSON.stringify(value),privateFields);assert.equal(Object.hasOwn(value,'choice'),false)
      await assert.rejects(body(f,p,'a'.repeat(64)),invalid)
      await assert.rejects(body(f,p,p.prepared.input_sha256,'b'.repeat(64)),invalid)
      await assert.rejects(body(f,p,'invalid'),/agent_opinion_invalid_read/)
    }
    const unique=await completed(f)
    await assert.rejects(anchor(f,unique,f.identities.bob),/agent_opinion_not_found/)
    await assert.rejects(body(f,unique,unique.prepared.input_sha256,assessmentOutputHash(unique,unique.result),f.identities.bob),/agent_opinion_not_found/)
    await assert.rejects(body(f,alice,alice.prepared.input_sha256,assessmentOutputHash(bob,bob.result)),invalid,'another owner result hash is not accepted even when UUIDs collide')
    await assert.rejects(assessmentRole(f,'agentstudio_api',db=>db.query('SELECT agentstudio.agent_opinion_anchor($1::uuid)',[id])),/agent_opinion_native_employee_required/)
    await assessmentErase(f,alice)
    assert.equal((await anchor(f,alice)).choice,null)
    assert.deepEqual((await body(f,bob)).result,bob.result,'Alice erasure does not affect Bob same-UUID output')
  }finally{await f.close()}
})

test('feedback correction/erasure and Native governance ABA deny old body hashes while preserving immutable receipts and preventing original replay resurrection',serial,async()=>{
  const f=await fixture()
  try{
    for(const action of ['correction','feedback_erase','explicit_erase']){
      const p=await completed(f,{purpose:'optimize'}),original=await assessmentRows(f,p.raw.request_id,p.owner)
      if(action==='correction'){
        const state=await f.feedback.status(p.identity,p.runId)
        const corrected=await f.feedback.change(p.identity,{...p.feedbackRaw,request_id:randomUUID(),expected_revision:state.revision})
        assert.equal(corrected.statement_sha256,p.feedback.statement_sha256);assert.notEqual(corrected.feedback_sha256,p.feedback.feedback_sha256)
      }else if(action==='feedback_erase')await assessmentFeedbackErase(f,p)
      else await assessmentErase(f,p)
      const before=await assessmentCounts(f)
      sealed(await anchor(f,p),p,{lease:'succeeded',status:'succeeded',job:'erased',erased:true})
      await assert.rejects(body(f,p),invalid)
      await assessmentFinish(f,p.proof,{status:'succeeded',result:p.result})
      assert.equal((await f.closed.submit(p.identity,p.raw)).body_erased,true)
      const erased=await assessmentRows(f,p.raw.request_id,p.owner)
      assert.equal(erased.outputs.length,0);assert.deepEqual(erased.effects,original.effects);assert.deepEqual(erased.outcomes,original.outcomes)
      assert.deepEqual(await assessmentCounts(f),before,'read/confirmation cannot restore an erased input/output/effect or audit')
    }
    const p=await completed(f)
    await f.db.query('UPDATE agentstudio_auth.accounts SET governance_revision=governance_revision+2 WHERE user_id=$1',[p.owner])
    sealed(await readonly(f,()=>anchor(f,p)),p,{lease:'succeeded',status:'succeeded'})
    await assert.rejects(body(f,p),invalid)
    await f.db.query('UPDATE agentstudio_auth.accounts SET enabled=false WHERE user_id=$1',[p.owner])
    await assert.rejects(anchor(f,p),/agent_opinion_native_employee_required/)
    await assert.rejects(body(f,p),/agent_opinion_native_employee_required/)
  }finally{await f.close()}
})

test('body recomputes stored input/result/completion hashes and strict shape; reads still work with audit INSERT failure and never create any side effect',serial,async()=>{
  const f=await fixture()
  try{
    const p=await completed(f),rows=await assessmentRows(f,p.raw.request_id,p.owner),originalHash=assessmentOutputHash(p,p.result)
    const input=(await f.db.query('SELECT body FROM agentstudio.agent_review_inputs WHERE owner_user_id=$1 AND request_id=$2',[p.owner,p.raw.request_id])).rows[0].body
    await f.db.exec(`CREATE FUNCTION agentstudio.synthetic_reject_opinion_audit() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'synthetic_opinion_audit_insert_forbidden'; END$$;
      REVOKE ALL ON FUNCTION agentstudio.synthetic_reject_opinion_audit() FROM PUBLIC;
      CREATE TRIGGER synthetic_opinion_audit BEFORE INSERT ON agentstudio.audit_events FOR EACH ROW EXECUTE FUNCTION agentstudio.synthetic_reject_opinion_audit()`)
    try{
      assert.equal(await verifyAgentOpinionCredentials(f.db),true)
      await readonly(f,()=>anchor(f,p));assert.deepEqual((await readonly(f,()=>body(f,p))).result,p.result)
    }finally{await f.db.exec('DROP TRIGGER synthetic_opinion_audit ON agentstudio.audit_events; DROP FUNCTION agentstudio.synthetic_reject_opinion_audit()')}
    const restore=async()=>{
      await f.db.query('UPDATE agentstudio.agent_review_inputs SET body=$3::jsonb WHERE owner_user_id=$1 AND request_id=$2',[p.owner,p.raw.request_id,JSON.stringify(input)])
      await f.db.query('UPDATE agentstudio.agent_assessment_outputs SET result=$3::jsonb,result_sha256=$4 WHERE owner_user_id=$1 AND request_id=$2',[p.owner,p.raw.request_id,JSON.stringify(p.result),originalHash])
      await f.db.query('UPDATE agentstudio.agent_assessment_outcomes SET result_sha256=$3,completion_sha256=$4 WHERE owner_user_id=$1 AND request_id=$2',[p.owner,p.raw.request_id,originalHash,rows.outcomes[0].completion_sha256])
    }
    const mutations=[
      ()=>f.db.query("UPDATE agentstudio.agent_assessment_outputs SET result_sha256=repeat('f',64) WHERE owner_user_id=$1 AND request_id=$2",[p.owner,p.raw.request_id]),
      ()=>f.db.query('UPDATE agentstudio.agent_assessment_outputs SET result=$3::jsonb WHERE owner_user_id=$1 AND request_id=$2',[p.owner,p.raw.request_id,JSON.stringify({...p.result,score:9})]),
      ()=>f.db.query('UPDATE agentstudio.agent_review_inputs SET body=$3::jsonb WHERE owner_user_id=$1 AND request_id=$2',[p.owner,p.raw.request_id,JSON.stringify({...input,messages:[input.messages[0],{role:'user',content:'Forged cached private input'}]})]),
      async()=>{
        // Corrupt an existing genuinely finished row, including matching raw
        // digests, to isolate strict output validation; never insert success.
        const result={...p.result,tools:['web_fetch']},hash=assessmentOutputHash(p,result),completion=sha({protocol:'agent_paid_review_completion_v1',request_id:p.raw.request_id,effect_id:rows.effects[0].effect_id,completion:{status:'succeeded',result}})
        await f.db.query('UPDATE agentstudio.agent_assessment_outputs SET result=$3::jsonb,result_sha256=$4 WHERE owner_user_id=$1 AND request_id=$2',[p.owner,p.raw.request_id,JSON.stringify(result),hash])
        await f.db.query('UPDATE agentstudio.agent_assessment_outcomes SET result_sha256=$3,completion_sha256=$4 WHERE owner_user_id=$1 AND request_id=$2',[p.owner,p.raw.request_id,hash,completion])
        await assert.rejects(body(f,p,p.prepared.input_sha256,hash),invalid)
      }
    ]
    for(const mutate of mutations){
      try{await mutate();const before=await assessmentCounts(f);await assert.rejects(body(f,p),invalid);assert.deepEqual(await assessmentCounts(f),before)}
      finally{await restore()}
      assert.deepEqual((await body(f,p)).result,p.result)
    }
  }finally{await f.close()}
})
