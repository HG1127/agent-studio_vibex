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
import {AgentReleaseRepository} from '../src/agent-release-repository.ts'
import {WorkflowV2RunRepository} from '../src/workflow-v2-run-repository.ts'
import {ScheduleDraftRepository} from '../src/schedule-draft-repository.ts'
import {ScheduleRuntimeRepository} from '../src/schedule-runtime-repository.ts'
import {ScheduleRuntimeWorker} from '../src/schedule-runtime-worker.ts'
import {SCHEDULE_BACKGROUND_ACK} from '../src/schedule-runtime-contract.ts'

async function fixture(){
  const f=await agentFixture({autonomous:true,sharing:true,nativeEmployees:true})
  try{await f.db.exec(f.sql('migrations/pg_v9_048_agent_human_input.sql'))
    try{await verifyAgentHumanInputCredentials(f.db)}catch(error){
      const constraints=(await f.db.query("SELECT conname,regexp_replace(pg_get_expr(conbin,conrelid),'[[:space:]]','','g') AS expression FROM pg_catalog.pg_constraint WHERE conrelid='agentstudio.agent_release_versions'::regclass AND conname IN('agent_release_human_spec_required','agent_release_human_spec_fields','agent_release_plan_review_boolean') ORDER BY conname")).rows
      throw Error('synthetic_human_schema_audit_failed '+JSON.stringify(constraints),{cause:error})
    }
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
      'ALTER TABLE agentstudio.agent_human_input_responses NO FORCE ROW LEVEL SECURITY',
      'ALTER TABLE agentstudio.agent_release_versions DROP CONSTRAINT agent_release_plan_review_boolean',
      'ALTER TABLE agentstudio.agent_release_versions DROP CONSTRAINT agent_release_human_spec_fields']){
      await f.db.exec('BEGIN');try{await f.db.exec(drift);await assert.rejects(verifyAgentHumanInputCredentials(f.db),/unsafe_agent_human_input_privileges/)}finally{await f.db.exec('ROLLBACK')}
    }
  }finally{await f.close()}
})

test('scheduled Agent holds its overlap slot while awaiting the owner and standing execution consent never manufactures a human plan approval',async()=>{
  const f=await fixture(),{alice}=f.identities
  let calls=0
  try{
    const {require_approval,...raw}=f.resources.alice.spec.spec
    const role=await f.agents.create(alice,'Scheduled owner plan',safeAgentSpec({...raw,require_plan_review:true}))
    const drafts=new ScheduleDraftRepository(f.pool),schedules=new ScheduleRuntimeRepository(f.pool,{enabled:true,allowHumanInput:true}),scheduler=new ScheduleRuntimeWorker(f.pool,'synthetic-human-schedule',{allowHumanInput:true})
    const draft=await drafts.create(alice,{name:'Scheduled human question',kind:'agent',target_id:role.id,time_zone:'UTC',rule:{kind:'interval',interval_minutes:15}})
    const activation=await schedules.activate(alice,draft.id,{expected_revision:draft.revision,expected_target_revision:role.revision,instruction:'Scheduled synthetic owner review',max_steps:3,anchor_at:new Date().toISOString(),
      expires_at:new Date(Date.now()+3600000).toISOString(),max_occurrences:3,max_auto_effects:10,background_ack:SCHEDULE_BACKGROUND_ACK,knowledge_charge_ack:null,request_id:randomUUID()})
    const first=await schedules.runNow(alice,draft.id,Number(activation.revision))
    assert.equal((await scheduler.tick()).run_id,first.run_id)
    await f.privateTls(async(material,prompt)=>{calls++;return JSON.stringify({action:'answer',answer:JSON.parse(prompt).round===1?'Scheduled plan for the actual owner':'Scheduled final after owner approval'})},async makeWorker=>{
      const scheduled=options=>makeWorker({...options,scheduleExecutionApproved:true})
      const pending=await until(f,first.run_id,scheduled,'awaiting_input');assert.equal(calls,1)
      assert.equal((await scheduled({humanInputApproved:true}).tick()).status,'idle')
      assert.equal((await f.db.query('SELECT count(*)::integer AS n FROM agentstudio.agent_human_input_responses WHERE run_id=$1',[first.run_id])).rows[0].n,0)
      // Advance a distinct synthetic due occurrence, preserving the original
      // scheduled_for / deterministic planned_run_id binding of the live run.
      await f.db.query("UPDATE agentstudio.schedules SET next_at=clock_timestamp()-interval '1 second' WHERE id=$1",[draft.id])
      const skipped=await scheduler.tick();assert.equal(skipped.status,'skipped_overlap')
      const overlap=(await f.db.query("SELECT status,error_code,run_id FROM agentstudio.schedule_occurrences WHERE id=$1",[skipped.occurrence_id])).rows[0]
      assert.deepEqual(overlap,{status:'skipped_overlap',error_code:'previous_run_incomplete',run_id:null})
      assert.equal((await f.db.query('SELECT count(*)::integer AS n FROM agentstudio.runs')).rows[0].n,1);assert.equal(calls,1)
      await f.responses.change(alice,first.run_id,{...request(pending),decision:'approve',answer:''})
      const completed=await until(f,first.run_id,scheduled,'succeeded');assert.equal(completed.run.result_text,'Scheduled final after owner approval');assert.equal(calls,2)
      assert.equal((await f.responses.history(alice,first.run_id)).items[0].decision,'approve')
    })
    for(const body of ["BEGIN RETURN NULL; END","BEGIN RETURN jsonb_build_object('skipped',true); END"]){
      await f.db.exec('BEGIN')
      try{await f.db.exec("CREATE OR REPLACE FUNCTION agentstudio.schedule_reserve(p_schedule uuid,p_revision bigint,p_due timestamptz,p_next timestamptz,p_worker text) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $drift$"+body+"$drift$");await assert.rejects(verifyAgentHumanInputCredentials(f.db),/unsafe_agent_human_input_privileges/)}
      finally{await f.db.exec('ROLLBACK')}
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
    for(const require_plan_review of ['true',null,0])await assert.rejects(f.owned.submit(alice,role.id,{...body,require_plan_review}),e=>e.code==='invalid_agent_plan_review')
    const bypass=await f.runs.submit(alice,role.id,{...body,require_plan_review:false})
    assert.equal(bypass.run.checkpoint.require_plan_review,false)
    await assert.rejects(f.owned.submit(alice,role.id,{...body,require_plan_review:true}),e=>e.code==='idempotency_key_conflict')
    await f.owned.cancel(alice,bypass.run.id)
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
      const first=await f.responses.history(alice,id,'',1);assert.equal(first.available,true);assert.equal(first.items.length,1);assert.equal(first.items[0].decision,'revise')
      assert.equal(first.items[0].answer,revise.answer);assert.equal(first.next_after,first.items[0].step_key)
      const last=await f.responses.history(alice,id,first.next_after,1);assert.equal(last.items[0].decision,'approve');assert.equal(last.next_after,null)
      await assert.rejects(f.responses.history(f.identities.bob,id),e=>e.status===404)
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

test('dedicated version acceptance needs completed human VM and real immutable receipts; removed, forged or rejected evidence cannot certify or expose completed output',async()=>{
  const f=await fixture(),{alice}=f.identities
  try{
    const {require_approval,...raw}=f.resources.alice.spec.spec
    const role=await f.agents.create(alice,'Reviewed acceptance role',safeAgentSpec({...raw,require_plan_review:true}))
    const releases=new AgentReleaseRepository(f.pool,{enabled:true,allowAcceptance:true,allowHumanInput:true})
    const source=await releases.workspace(alice,role.id)
    const admission={action:'acceptance',request_id:randomUUID(),expected_spec_revision:role.revision,source_sha256:source.source_sha256,
      instruction:'Human reviewed synthetic acceptance',max_steps:3,model_binding:null,confirm:true}
    const admitted=await releases.change(alice,role.id,admission),id=admitted.run_id
    const fullDelivery='已核对本人方案的完整成果段落。\n'.repeat(500)
    assert.ok(fullDelivery.length>4000&&fullDelivery.length<11000)
    const save=()=>({action:'snapshot',request_id:randomUUID(),expected_spec_revision:role.revision,source_sha256:source.source_sha256,note:'Verified human acceptance',test_run_id:id})
    await f.privateTls(async(material,prompt)=>JSON.stringify({action:'answer',answer:JSON.parse(prompt).round===1?'A complete owner plan':fullDelivery}),async makeWorker=>{
      const pending=await until(f,id,makeWorker,'awaiting_input')
      assert.equal((await releases.acceptanceStatus(alice,role.id,id)).test_current,false)
      await assert.rejects(releases.change(alice,role.id,save()),e=>e.code==='agent_release_acceptance_unavailable')
      await f.responses.change(alice,id,{...request(pending),decision:'approve',answer:''})
      const done=await until(f,id,makeWorker,'succeeded');assert.equal(done.human_input_evidence_current,true);assert.equal(done.run.result_text,fullDelivery)
      assert.equal((await f.db.query('SELECT checkpoint FROM agentstudio.runs WHERE id=$1',[id])).rows[0].checkpoint.machine.effects[0].output.length,4000)
    })
    assert.equal((await releases.acceptanceStatus(alice,role.id,id)).test_current,true)
    const version=await releases.change(alice,role.id,save());assert.equal(version.test_passed,true)
    const savedVersion=(await f.db.query('SELECT * FROM agentstudio.agent_release_versions WHERE id=$1',[version.version_id])).rows[0]
    for(const spec of [{...savedVersion.spec_snapshot,require_plan_review:'true'},{...savedVersion.spec_snapshot,require_plan_review:null},{...savedVersion.spec_snapshot,provider_secret:'forbidden_test_field'}]){
      const invalid={...savedVersion,id:randomUUID(),version_no:Number(savedVersion.version_no)+1,spec_snapshot:spec}
      await assert.rejects(f.db.query('INSERT INTO agentstudio.agent_release_versions SELECT * FROM jsonb_populate_record(null::agentstudio.agent_release_versions,$1::jsonb)',[JSON.stringify(invalid)]),e=>e.code==='23514')
    }
    const ledger=(await f.db.query('SELECT * FROM agentstudio.agent_human_input_responses WHERE run_id=$1',[id])).rows
    const archived=(await f.db.query("SELECT result_reference FROM agentstudio.external_effects WHERE run_id=$1 AND tool_name='workflow:agent'",[id])).rows[0].result_reference
    const checkpoint=(await f.db.query('SELECT checkpoint FROM agentstudio.runs WHERE id=$1',[id])).rows[0].checkpoint
    const drift=[
      'DELETE FROM agentstudio.agent_human_input_responses WHERE run_id=$1',
      "UPDATE agentstudio.external_effects SET result_reference=(result_reference::jsonb #- '{agent_snapshot,human_state}')::text WHERE run_id=$1 AND tool_name='workflow:agent'",
      "UPDATE agentstudio.external_effects SET result_reference=jsonb_set(result_reference::jsonb,'{agent_snapshot,human_state,human_responses,0,answer}','\"Forged owner note\"'::jsonb)::text WHERE run_id=$1 AND tool_name='workflow:agent'",
      "UPDATE agentstudio.runs SET checkpoint=checkpoint-'human_agent_keys' WHERE id=$1",
      "UPDATE agentstudio.runs SET result_text='Forged final content' WHERE id=$1"
    ]
    for(const sql of drift){
      try{
        await f.db.query(sql,[id])
        assert.equal((await releases.acceptanceStatus(alice,role.id,id)).test_current,false)
        const detail=await f.owned.get(alice,id);assert.equal(detail.run.result_text,'');assert.equal(detail.human_input_evidence_current,false)
        const history=await f.responses.history(alice,id);assert.deepEqual(history.items,[]);assert.equal(history.available,false)
        await assert.rejects(releases.change(alice,role.id,save()),e=>e.code==='agent_release_acceptance_unavailable')
      }finally{
        await f.db.query('DELETE FROM agentstudio.agent_human_input_responses WHERE run_id=$1',[id])
        await f.db.query('INSERT INTO agentstudio.agent_human_input_responses SELECT * FROM jsonb_populate_recordset(null::agentstudio.agent_human_input_responses,$1::jsonb)',[JSON.stringify(ledger)])
        await f.db.query("UPDATE agentstudio.external_effects SET result_reference=$2 WHERE run_id=$1 AND tool_name='workflow:agent'",[id,archived])
        await f.db.query('UPDATE agentstudio.runs SET checkpoint=$2::jsonb WHERE id=$1',[id,JSON.stringify(checkpoint)])
        await f.db.query('UPDATE agentstudio.runs SET result_text=$2 WHERE id=$1',[id,fullDelivery])
      }
    }
    assert.equal((await releases.acceptanceStatus(alice,role.id,id)).test_current,true)
    const refused=await releases.change(alice,role.id,{...admission,request_id:randomUUID()})
    await f.privateTls(async()=>JSON.stringify({action:'answer',answer:'A real draft before a rejected model'}),async makeWorker=>{
      const pending=await until(f,refused.run_id,makeWorker,'awaiting_input')
      await f.responses.change(alice,refused.run_id,{...request(pending),decision:'approve',answer:''})
      await makeWorker({humanInputApproved:true}).tick()
      const next=await f.owned.get(alice,refused.run_id)
      await f.owned.decide(alice,refused.run_id,{decision:'rejected',step_key:next.pending_effect.step_key,input_sha256:next.pending_effect.input_sha256})
      await until(f,refused.run_id,makeWorker,'succeeded')
    })
    assert.equal((await releases.acceptanceStatus(alice,role.id,refused.run_id)).test_current,false)
  }finally{await f.close()}
})

test('nested Workflow asks the actual owner, cancellation never revives a late reply, and source edits hide stale questions before any resume',async()=>{
  const f=await fixture(),{alice,bob}=f.identities
  try{
    const role=f.resources.alice.spec
    const graph={version:2,nodes:[{id:'start',type:'start',data:{title:'Start'},position:{x:0,y:0}},
      {id:'agent',type:'agent',data:{title:'Nested role',agent_binding:{spec_id:role.id,spec_revision:role.revision},max_steps:3,require_plan_review:true},position:{x:100,y:0}},
      {id:'summary',type:'model',data:{title:'Final summary',model_binding:f.resources.alice.binding,prompt:'{{Nested role.output}}'},position:{x:200,y:0}},
      {id:'end',type:'end',data:{title:'End',output_template:'{{Final summary.output}}'},position:{x:300,y:0}}],edges:[{id:'a',source:'start',target:'agent'},{id:'b',source:'agent',target:'summary'},{id:'c',source:'summary',target:'end'}]}
    const flow=await f.flows.create(alice,'Nested human workflow',graph),owned=new WorkflowV2RunRepository(f.pool,'workflow_native_v2',{allowHumanInput:true})
    const responses=new AgentHumanInputRepository(f.pool,'workflow_native_v2',{allowResponses:true}),nested={...f,owned,responses}
    const body={expected_revision:flow.revision,idempotency_key:'synthetic-nested-human-'+randomUUID(),instruction:'Nested owner-reviewed task'}
    const admitted=await owned.submit(alice,flow.id,body),id=admitted.run.id
    let debugCalls=0
    await f.privateTls(async(material,prompt)=>JSON.stringify({action:'answer',answer:JSON.parse(prompt).round===1?'Nested plan':'Nested delivery after review'}),async makeWorker=>{
      const pending=await until(nested,id,makeWorker,'awaiting_input')
      await assert.rejects(responses.change(bob,id,{...request(pending),decision:'approve',answer:''}),e=>e.status===404)
      await responses.change(alice,id,{...request(pending),decision:'approve',answer:''})
      const done=await until(nested,id,makeWorker,'succeeded');assert.equal(done.run.result_text,'Nested delivery after review')
      assert.equal((await owned.outputs(alice,id)).nodes.find(node=>node.node_id==='agent').output_text,'Nested delivery after review')
      assert.equal((await responses.history(alice,id)).items[0].node_title,'Nested role')
      const ledger=(await f.db.query('SELECT * FROM agentstudio.agent_human_input_responses WHERE run_id=$1',[id])).rows
      try{await f.db.query('DELETE FROM agentstudio.agent_human_input_responses WHERE run_id=$1',[id]);await assert.rejects(owned.outputs(alice,id),e=>e.status===409)}
      finally{await f.db.query('INSERT INTO agentstudio.agent_human_input_responses SELECT * FROM jsonb_populate_recordset(null::agentstudio.agent_human_input_responses,$1::jsonb)',[JSON.stringify(ledger)])}
      const output=await owned.outputs(alice,id)
      const sample={expected_revision:flow.revision,node_id:'summary',idempotency_key:'synthetic-human-lineage-'+randomUUID(),
        samples:{input:'Manual debug input',outputs:{agent:'Nested delivery after review'},provenance:{kind:'history',run_id:id,workflow_id:flow.id,workflow_revision:flow.revision,output_version:output.run.output_version,input:false,nodes:['agent']}}}
      const debug=await owned.submitNodeDebug(alice,flow.id,sample)
      await makeWorker({humanInputApproved:true}).tick()
      const approval=await owned.get(alice,debug.run.id)
      await owned.decide(alice,debug.run.id,{decision:'approved',step_key:approval.pending_effect.step_key,input_sha256:approval.pending_effect.input_sha256})
      let originalReceiptRemoved=false
      f.setBeforeDispatch(async request=>{if(request.claim.run_id===debug.run.id){await f.db.query('DELETE FROM agentstudio.agent_human_input_responses WHERE run_id=$1',[id]);originalReceiptRemoved=true}})
      try{assert.equal((await makeWorker({humanInputApproved:true}).tick()).status,'paused');assert.equal(originalReceiptRemoved,true);assert.equal(debugCalls,0)}
      finally{f.setBeforeDispatch(undefined);if(originalReceiptRemoved)await f.db.query('INSERT INTO agentstudio.agent_human_input_responses SELECT * FROM jsonb_populate_recordset(null::agentstudio.agent_human_input_responses,$1::jsonb)',[JSON.stringify(ledger)])}
      assert.equal((await makeWorker({humanInputApproved:true}).tick()).status,'idle');assert.equal(debugCalls,0)
      const cancelled=await owned.submit(alice,flow.id,{...body,idempotency_key:'synthetic-nested-cancel-'+randomUUID()})
      const waiting=await until(nested,cancelled.run.id,makeWorker,'awaiting_input'),late={...request(waiting),decision:'approve',answer:''}
      await owned.cancel(alice,cancelled.run.id);await assert.rejects(responses.change(alice,cancelled.run.id,late),e=>e.code==='agent_human_input_changed')
      const stale=await owned.submit(alice,flow.id,{...body,idempotency_key:'synthetic-nested-stale-'+randomUUID()})
      const old=await until(nested,stale.run.id,makeWorker,'awaiting_input'),choice={...request(old),decision:'approve',answer:''}
      await f.db.query('UPDATE agentstudio.agent_specs SET revision=revision+1 WHERE id=$1',[role.id])
      await assert.rejects(responses.change(alice,stale.run.id,choice),e=>e.status===409)
      const hidden=await owned.get(alice,stale.run.id);assert.equal(hidden.human_input,null);assert.equal(hidden.human_input_evidence_current,false)
      assert.equal((await owned.cancel(alice,stale.run.id)).run.status,'cancelled')
    },{autonomousExecution:false,directModel:async()=> 'Nested delivery after review',nodeDebugExecutor:async()=>{debugCalls++;return 'Historical debug must not execute after lost original human evidence'}})
  }finally{await f.close()}
})
