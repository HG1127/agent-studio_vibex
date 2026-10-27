// Hosted synthetic SQL only. No network, Worker execution or provider calls.
import {randomUUID} from 'node:crypto'
import {agentMemoryFixture} from './agent-memory-fixture.mjs'
import {AgentReviewSourceRepository} from '../../src/agent-review-source.ts'
import {AgentReviewLedgerRepository} from '../../src/agent-review-ledger.ts'
import {AgentFeedbackRepository} from '../../src/agent-feedback-repository.ts'
import {AutonomousAgentRunRepository} from '../../src/autonomous-agent-run-repository.ts'
import {agentReviewFees,parseAgentReviewSubmission} from '../../src/agent-review-contract.ts'

export async function agentReviewLedgerFixture({installed=true}={}){
  const f=await agentMemoryFixture()
  try{
    for(const part of ['051_agent_memory_derived','052_agent_memory_outcome','053_agent_memory_failure_source','054_agent_feedback','055_agent_optimization'])
      await f.db.exec(f.sql('migrations/pg_v9_'+part+'.sql'))
    if(installed)await f.db.exec(f.sql('migrations/pg_v9_056_agent_review_ledger.sql'))
    return {...f,review:new AgentReviewSourceRepository(f.pool),ledger:new AgentReviewLedgerRepository(f.pool,{allowSubmissions:true}),closed:new AgentReviewLedgerRepository(f.pool),
      feedback:new AgentFeedbackRepository(f.pool,{allowSubmit:true,allowLessonStorage:true}),owned:new AutonomousAgentRunRepository(f.pool,{allowHumanInput:true})}
  }catch(error){await f.close();throw error}
}

export async function reviewLedgerSource(f,{who='alice',remember=false}={}){
  const identity=f.identities[who],owner=f.users[who],role=await f.agents.get(identity,f.resources[who].spec.id)
  const started=await f.owned.submit(identity,role.id,{expected_revision:role.revision,max_steps:1,require_plan_review:false,
    idempotency_key:'synthetic-review-ledger-'+randomUUID(),instruction:'Synthetic selected private task token=syntheticReviewLedgerTask'})
  const runId=started.run.id
  await f.owned.cancel(identity,runId)
  const state=await f.feedback.status(identity,runId)
  const feedbackRaw={action:'submit',request_id:randomUUID(),spec_id:role.id,run_id:runId,expected_revision:0,expected_source_sha256:state.source.source_sha256,
    rating:'down',tags:['核对😀','证据:边界'],comment:'合成😀核对：a:b\nSynthetic review statement token=syntheticReviewLedgerFeedback',remember_lesson:remember,confirm:true}
  const feedback=await f.feedback.change(identity,feedbackRaw)
  return {identity,owner,role,runId,feedbackRaw,feedback}
}

export async function reviewLedgerSubmission(f,s,purpose='optimize'){
  const state=await f.review.source(s.identity,{purpose,spec_id:s.role.id,run_id:s.runId})
  const current=await f.agents.get(s.identity,s.role.id)
  const choice={action:'preview',purpose,spec_id:s.role.id,run_id:s.runId,expected_spec_revision:state.expected_spec_revision,
    expected_spec_sha256:state.expected_spec_sha256,expected_source_sha256:state.expected_source_sha256,model_binding:current.spec.model_binding,output_token_limit:2048,
    feedback_sources:purpose==='optimize'?[{run_id:s.runId,feedback_id:s.feedback.feedback_id,feedback_sha256:s.feedback.feedback_sha256}]:[],evaluation_sources:[]}
  const prepared=await f.review.preview(s.identity,choice)
  const raw={...choice,action:'submit',request_id:randomUUID(),expected_input_sha256:prepared.input_sha256,confirm:true,fee_acknowledgement:agentReviewFees[purpose]}
  return {choice,prepared,raw,parsed:parseAgentReviewSubmission(raw)}
}

export async function reviewLedgerCounts(f){
  return (await f.db.query(`SELECT
    (SELECT count(*) FROM agentstudio.agent_review_requests)::integer AS requests,
    (SELECT count(*) FROM agentstudio.agent_review_inputs)::integer AS inputs,
    (SELECT count(*) FROM agentstudio.agent_review_feedback_sources)::integer AS sources,
    (SELECT count(*) FROM agentstudio.agent_review_jobs)::integer AS review_jobs,
    (SELECT count(*) FROM agentstudio.agent_review_controls)::integer AS controls,
    (SELECT count(*) FROM agentstudio.agent_review_tombstones)::integer AS tombstones,
    (SELECT count(*) FROM agentstudio.audit_events WHERE target_kind='agent_review')::integer AS review_audits,
    (SELECT count(*) FROM agentstudio.agent_feedback_receipts)::integer AS feedback_receipts,
    (SELECT count(*) FROM agentstudio.agent_feedback_bodies)::integer AS feedback_bodies,
    (SELECT count(*) FROM agentstudio.agent_feedback_lessons)::integer AS feedback_lessons,
    (SELECT count(*) FROM agentstudio.jobs)::integer AS jobs,
    (SELECT count(*) FROM agentstudio.external_effects)::integer AS effects,
    (SELECT count(*) FROM agentstudio.agent_optimization_links)::integer AS optimization_links,
    (SELECT count(*) FROM agentstudio.agent_collaboration_revisions)::integer AS role_history,
    (SELECT count(*) FROM agentstudio.audit_events)::integer AS audits`)).rows[0]
}

export async function reviewLedgerRow(f,s,requestId){
  return (await f.db.query(`SELECT r.*,i.body,j.state,t.reason AS tombstone_reason,
    (SELECT count(*)::integer FROM agentstudio.agent_review_feedback_sources fs WHERE fs.owner_user_id=r.owner_user_id AND fs.request_id=r.request_id) AS source_count
    FROM agentstudio.agent_review_requests r
    LEFT JOIN agentstudio.agent_review_inputs i USING(owner_user_id,request_id)
    LEFT JOIN agentstudio.agent_review_jobs j USING(owner_user_id,request_id)
    LEFT JOIN agentstudio.agent_review_tombstones t USING(owner_user_id,request_id)
    WHERE r.owner_user_id=$1 AND r.request_id=$2`,[s.owner,requestId])).rows[0]
}

export async function reviewLedgerFeedbackErase(f,s){
  const state=await f.feedback.status(s.identity,s.runId)
  return {action:'erase_feedback',request_id:randomUUID(),spec_id:s.role.id,run_id:s.runId,expected_revision:state.revision,
    expected_feedback_sha256:state.current.feedback_sha256,confirm:true}
}
