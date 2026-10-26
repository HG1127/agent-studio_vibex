import test from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {agentFixture} from './helpers/workflow-v2-agent-fixture.mjs'
import {AutonomousAgentRunRepository} from '../src/autonomous-agent-run-repository.ts'
import {AgentHumanInputRepository} from '../src/agent-human-input-repository.ts'
import {verifyAgentHumanInputCredentials} from '../src/agent-human-input-audit.ts'
import {safeAgentSpec} from '../src/contracts.ts'
import {RunRepository} from '../src/run-repository.ts'
import {withActor} from '../src/repository.ts'

async function fixture(){
  const f=await agentFixture({autonomous:true,sharing:true,nativeEmployees:true})
  try{await f.db.exec(f.sql('migrations/pg_v9_048_agent_human_input.sql'))
    return {...f,owned:new AutonomousAgentRunRepository(f.pool,{allowHumanInput:true}),responses:new AgentHumanInputRepository(f.pool,'agent_native_v2',{allowResponses:true})}
  }catch(e){await f.close();throw e}
}
const request=detail=>({request_id:randomUUID(),pending_step_key:detail.human_input.pending_step_key,pending_sha256:detail.human_input.pending_sha256,
  source_sha256:detail.human_input.source_sha256,decision:'reply',answer:'The owner clarified the acceptance date.',confirm:true})
async function until(f,id,makeWorker,status){
  for(let i=0;i<50;i++){
    const detail=await f.owned.get(f.identities.alice,id)
    if(detail.run.status===status)return detail
    if(['succeeded','failed','paused','cancelled'].includes(detail.run.status))throw Error('unexpected synthetic status '+detail.run.status+' '+detail.run.last_error_code)
    if(detail.run.status==='awaiting_approval')await f.owned.decide(f.identities.alice,id,{decision:'approved',step_key:detail.pending_effect.step_key,input_sha256:detail.pending_effect.input_sha256})
    await makeWorker({humanInputApproved:true}).tick()
  }throw Error('human input synthetic transition bound exceeded')
}
async function submit(f,role=f.resources.alice.spec,max=3){return f.owned.submit(f.identities.alice,role.id,{expected_revision:role.revision,max_steps:max,idempotency_key:'synthetic-human-'+randomUUID(),instruction:'Synthetic owner task with a possible clarification.'})}

test('Native human clarification: private mTLS, durable wait, atomic original response, owner isolation and no automatic model or tool approval',async()=>{
  const f=await fixture(),{alice,bob}=f.identities
  let calls=0
  try{
    assert.equal(await verifyAgentHumanInputCredentials(f.db),true)
    const admitted=await submit(f),id=admitted.run.id
    await f.privateTls(async()=>{calls++;return JSON.stringify(calls===1?{action:'ask_user',question:'Which deadline should I use?',note:'PRIVATE_PROVIDER_NOTE'}:{action:'answer',answer:'Delivered after the actual owner response.'})},async makeWorker=>{
      const pending=await until(f,id,makeWorker,'awaiting_input')
      assert.equal(pending.pending_effect,null);assert.equal(pending.human_input_current,true);assert.equal(pending.human_input.kind,'clarification')
      assert.equal(JSON.stringify(pending).includes('PRIVATE_PROVIDER_NOTE'),false);assert.equal(calls,1)
      assert.equal((await makeWorker({humanInputApproved:true}).tick()).status,'idle')
      const choice=request(pending),readonly=new AgentHumanInputRepository(f.pool)
      await assert.rejects(f.responses.change(bob,id,choice),e=>e.status===404)
      await assert.rejects(readonly.change(alice,id,choice),e=>e.code==='agent_human_responses_disabled')
      await assert.rejects(readonly.confirm(alice,id,choice),e=>e.code==='agent_human_response_not_found')
      assert.equal((await f.db.query('SELECT count(*)::integer AS n FROM agentstudio.agent_human_input_responses')).rows[0].n,0)
      f.setFault((sql,values)=>{if(sql.startsWith('INSERT INTO agentstudio.audit_events')&&values.includes('workflow.v2_human_response'))throw Error('synthetic_human_audit_rollback')})
      try{await assert.rejects(f.responses.change(alice,id,choice),/synthetic_human_audit_rollback/)}finally{f.setFault(undefined)}
      assert.equal((await f.owned.get(alice,id)).run.status,'awaiting_input')
      assert.equal((await f.db.query('SELECT count(*)::integer AS n FROM agentstudio.agent_human_input_responses')).rows[0].n,0)
      const accepted=await f.responses.change(alice,id,choice);assert.equal(accepted.recorded,true);assert.equal(accepted.replayed,false)
      assert.equal((await readonly.confirm(alice,id,choice)).replayed,true)
      assert.equal((await readonly.change(alice,id,choice)).replayed,true)
      await assert.rejects(f.responses.change(alice,id,{...choice,answer:'Different intent on the same request'}),e=>e.code==='agent_human_response_request_conflict')
      assert.equal((await f.owned.get(alice,id)).run.status,'queued');assert.equal(calls,1)
      assert.equal((await makeWorker({humanInputApproved:true}).tick()).status,'awaiting_approval')
      const model=await f.owned.get(alice,id);assert.equal(model.pending_effect.kind,'model')
      await readonly.confirm(alice,id,choice);assert.equal((await f.owned.get(alice,id)).run.status,'awaiting_approval')
      const done=await until(f,id,makeWorker,'succeeded');assert.match(done.run.result_text,/actual owner response/);assert.equal(calls,2)
      const rows=(await f.db.query('SELECT * FROM agentstudio.agent_human_input_responses')).rows
      assert.equal(rows.length,1);assert.equal(JSON.stringify(rows).includes(choice.answer),false)
      await withActor(f.pool,bob,async db=>{assert.equal((await db.query('SELECT * FROM agentstudio.agent_human_input_responses')).rows.length,0)})
      const count=(await f.db.query("SELECT count(*)::integer AS n FROM agentstudio.audit_events WHERE action='agent.v2_human_response' AND run_id=$1",[id])).rows[0].n
      assert.equal(count,1)
    })
    for(const drift of ['GRANT UPDATE ON agentstudio.agent_human_input_responses TO agentstudio_api','GRANT SELECT ON agentstudio.agent_human_input_responses TO agentstudio_worker',
      'ALTER TABLE agentstudio.agent_human_input_responses NO FORCE ROW LEVEL SECURITY']){
      await f.db.exec('BEGIN');try{await f.db.exec(drift);await assert.rejects(verifyAgentHumanInputCredentials(f.db),/unsafe_agent_human_input_privileges/)}finally{await f.db.exec('ROLLBACK')}
    }
  }finally{await f.close()}
})

test('Native required plan: revise/approve survive restart, simple generation cannot bypass it and model dispatch rechecks immutable owner receipts',async()=>{
  const f=await fixture(),{alice}=f.identities
  let calls=0
  try{
    const {require_approval,...raw}=f.resources.alice.spec.spec
    const role=await f.agents.create(alice,'Owner reviewed plan',safeAgentSpec({...raw,require_plan_review:true}))
    const body={expected_revision:role.revision,max_steps:3,idempotency_key:'synthetic-human-disabled',instruction:'Owned plan'}
    await assert.rejects(f.runs.submit(alice,role.id,body),e=>e.code==='agent_human_input_runtime_required')
    await assert.rejects(new RunRepository(f.pool,{allowBoundModelRuns:true}).submit(alice,role.id,{instruction:'No single-call bypass',idempotency_key:'synthetic-human-single-shot'}),e=>e.code==='agent_plan_review_requires_autonomous_runtime')
    const admitted=await submit(f,role),id=admitted.run.id
    await f.privateTls(async()=>{calls++;return JSON.stringify({action:'answer',answer:calls===1?'First draft':calls===2?'Revised draft':'Final after owner plan approval'})},async makeWorker=>{
      let pending=await until(f,id,makeWorker,'awaiting_input');assert.equal(pending.human_input.kind,'plan_review');assert.equal(pending.human_input.draft,'First draft')
      await assert.rejects(f.responses.change(alice,id,request(pending)),e=>e.code==='invalid_agent_human_response_decision')
      const revise={...request(pending),decision:'revise',answer:'Narrow the acceptance scope.'}
      await f.responses.change(alice,id,revise)
      pending=await until(f,id,makeWorker,'awaiting_input');assert.equal(pending.human_input.draft,'Revised draft')
      const approve={...request(pending),decision:'approve',answer:''}
      await f.responses.change(alice,id,approve)
      const done=await until(f,id,makeWorker,'succeeded');assert.equal(done.run.result_text,'Final after owner plan approval');assert.equal(calls,3)
      const saved=(await f.db.query("SELECT result_reference FROM agentstudio.external_effects WHERE run_id=$1 AND tool_name='workflow:agent'",[id])).rows[0]
      assert.equal(JSON.parse(saved.result_reference).agent_snapshot.human_responses.length,2)
    })
    const another=await submit(f,role),id2=another.run.id
    let secondCalls=0
    await f.privateTls(async()=>{secondCalls++;return JSON.stringify({action:'answer',answer:'A plan awaiting actual owner approval'})},async makeWorker=>{
      const pending=await until(f,id2,makeWorker,'awaiting_input'),approve={...request(pending),decision:'approve',answer:''}
      await f.responses.change(alice,id2,approve)
      assert.equal((await makeWorker({humanInputApproved:true}).tick()).status,'awaiting_approval')
      const model=await f.owned.get(alice,id2)
      await f.owned.decide(alice,id2,{decision:'approved',step_key:model.pending_effect.step_key,input_sha256:model.pending_effect.input_sha256})
      f.setBeforeDispatch(async()=>{await f.db.query('DELETE FROM agentstudio.agent_human_input_responses WHERE run_id=$1',[id2])})
      try{assert.equal((await makeWorker({humanInputApproved:true}).tick()).status,'paused')}finally{f.setBeforeDispatch(undefined)}
      assert.equal(secondCalls,1)
      assert.equal((await makeWorker({humanInputApproved:true}).tick()).status,'idle')
      assert.equal(secondCalls,1)
    })
  }finally{await f.close()}
})
