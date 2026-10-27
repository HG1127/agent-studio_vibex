// Optional050 runtime slice; real embedded SQL and disposable private mTLS.
// No production configuration, paid model, target database or Worker daemon.
import test from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {agentMemoryFixture} from './helpers/agent-memory-fixture.mjs'
import {AutonomousAgentRunRepository} from '../src/autonomous-agent-run-repository.ts'
import {AgentMemoryRepository} from '../src/agent-memory-repository.ts'
import {AgentHumanInputRepository} from '../src/agent-human-input-repository.ts'
import {ScheduleDraftRepository} from '../src/schedule-draft-repository.ts'
import {ScheduleRuntimeRepository} from '../src/schedule-runtime-repository.ts'
import {ScheduleRuntimeWorker} from '../src/schedule-runtime-worker.ts'
import {SCHEDULE_BACKGROUND_ACK} from '../src/schedule-runtime-contract.ts'
async function fixture(){const f=await agentMemoryFixture();try{
  return {...f,owned:new AutonomousAgentRunRepository(f.pool,{allowHumanInput:true,allowMemory:true}),memory:new AgentMemoryRepository(f.pool,{allowWrites:true})}
}catch(error){await f.close();throw error}}
const raw=f=>({expected_revision:f.resources.alice.spec.revision,max_steps:3,idempotency_key:'synthetic-memory-'+randomUUID(),instruction:'记住：财务报告使用中文。整理财务报告'})
async function advance(f,id,worker,wanted,kind){for(let i=0;i<36;i++){
  const d=await f.owned.get(f.identities.alice,id)
  if(d.run.status===wanted&&(!kind||d.pending_effect?.kind===kind))return d
  if(['succeeded','failed','paused','cancelled'].includes(d.run.status))throw Error('unexpected_memory_status '+d.run.status+' '+d.run.last_error_code)
  if(d.run.status==='awaiting_approval')await f.owned.decide(f.identities.alice,id,{decision:'approved',step_key:d.pending_effect.step_key,input_sha256:d.pending_effect.input_sha256})
  await worker().tick()
}throw Error('synthetic_memory_transition_limit')}
const worker=make=>()=>make({humanInputApproved:true,memoryExecutionApproved:true})
const count=async(f,table)=>(await f.db.query('SELECT count(*)::integer AS n FROM agentstudio.'+table)).rows[0].n

test('standalone memory admission/receipt/VM and full result use original source; forget fences history and exact submit replay cannot recreate text',async()=>{
  const f=await fixture(),request=raw(f),role=f.resources.alice.spec
  let calls=0
  try{
    await assert.rejects(f.owned.submit(f.identities.bob,role.id,request),e=>e.status===404)
    const first=await f.owned.submit(f.identities.alice,role.id,request),id=first.run.id
    assert.equal((await f.memory.list(f.identities.alice,role.id)).items[0].id,id)
    assert.equal(await count(f,'agent_memory_run_contexts'),1)
    assert.equal(JSON.stringify(first.run.checkpoint).includes('memory_context'),false)
    const report='已按本人中文约定完成财务报告。\n'.repeat(300)
    await f.privateTls(async(_material,prompt)=>{
      calls++;const p=JSON.parse(prompt);assert.equal(p.task,'整理财务报告')
      assert.deepEqual(p.memory_context.saved_user_instructions,['【用户指令】财务报告使用中文'])
      return JSON.stringify(calls===1?{action:'tool',tool:'calculate',params:{expression:'2+2'}}:{action:'answer',answer:report})
    },async make=>{
      const done=await advance(f,id,worker(make),'succeeded')
      assert.equal(done.run.result_text,report);assert.equal(done.human_input_evidence_current,true);assert.equal(calls,2)
    },{allowMemory:true})
    const memory=(await f.memory.list(f.identities.alice,role.id)).items[0]
    await f.memory.change(f.identities.alice,{action:'forget',request_id:randomUUID(),spec_id:role.id,memory_id:memory.id,expected_sha256:memory.content_sha256,confirm:true})
    const hidden=await f.owned.get(f.identities.alice,id)
    assert.equal(hidden.run.result_text,'');assert.equal(hidden.knowledge_outputs_available,false)
    const history=await new AgentHumanInputRepository(f.pool).history(f.identities.alice,id);assert.equal(history.available,false)
    const replay=await f.owned.submit(f.identities.alice,role.id,request)
    assert.equal(replay.replayed,true);assert.equal(replay.run.id,id);assert.equal(replay.run.result_text,'')
    const writeOff=new AutonomousAgentRunRepository(f.pool,{allowHumanInput:true})
    assert.equal((await writeOff.submit(f.identities.alice,role.id,request)).replayed,true)
    assert.equal(await count(f,'agent_memory_entries'),0);assert.equal(await count(f,'agent_memory_receipts'),2);assert.equal(await count(f,'agent_memory_run_contexts'),1);assert.equal(calls,2)
  }finally{await f.close()}
})

test('explicit remember, run, queue, context receipt and final admission audit roll back together; legacy admissions keep their original protocol',async()=>{
  const f=await fixture(),request=raw(f),role=f.resources.alice.spec
  try{
    for(const target of ['context','queue','audit']){
      f.setFault((sql,values)=>{if(target==='context'&&sql.startsWith('INSERT INTO agentstudio.agent_memory_run_contexts')||target==='queue'&&sql.startsWith('INSERT INTO agentstudio.jobs')||target==='audit'&&sql.startsWith('INSERT INTO agentstudio.audit_events')&&values.includes('workflow.v2_submit'))throw Error('synthetic_memory_admission_rollback')})
      try{await assert.rejects(f.owned.submit(f.identities.alice,role.id,request),/synthetic_memory_admission_rollback/)}finally{f.setFault(undefined)}
      for(const table of ['runs','jobs','agent_memory_entries','agent_memory_receipts','agent_memory_run_contexts'])assert.equal(await count(f,table),0,table)
    }
    const accepted=await f.owned.submit(f.identities.alice,role.id,request);assert.equal(accepted.replayed,false)
    const legacy=new AutonomousAgentRunRepository(f.pool,{allowHumanInput:true}),oldRequest={...request,idempotency_key:'synthetic-legacy-'+randomUUID(),instruction:'An ordinary legacy task'}
    const old=await legacy.submit(f.identities.alice,role.id,oldRequest)
    const checkpoint=(await f.db.query('SELECT checkpoint FROM agentstudio.runs WHERE id=$1',[old.run.id])).rows[0].checkpoint
    assert.equal(Object.hasOwn(checkpoint,'memory_context'),false)
    assert.equal((await f.owned.submit(f.identities.alice,role.id,oldRequest)).replayed,true)
    assert.equal(await count(f,'agent_memory_run_contexts'),1);assert.equal(await count(f,'agent_memory_entries'),1)
  }finally{await f.close()}
})

test('forget between Worker preparation and private mTLS dispatch refuses before a model call; uncertain result remains non-retryable',async()=>{
  const f=await fixture(),request=raw(f),role=f.resources.alice.spec;let calls=0,forgot=false
  try{
    const admitted=await f.owned.submit(f.identities.alice,role.id,request),id=admitted.run.id
    await f.privateTls(async()=>{calls++;return '{"action":"answer","answer":"must not send"}'},async make=>{
      const ready=await advance(f,id,worker(make),'awaiting_approval','model')
      await f.owned.decide(f.identities.alice,id,{decision:'approved',step_key:ready.pending_effect.step_key,input_sha256:ready.pending_effect.input_sha256})
      f.setBeforeDispatch(async(_request,kind)=>{if(kind==='model'&&!forgot){forgot=true
        const entry=(await f.memory.list(f.identities.alice,role.id)).items[0]
        await f.memory.change(f.identities.alice,{action:'forget',request_id:randomUUID(),spec_id:role.id,memory_id:entry.id,expected_sha256:entry.content_sha256,confirm:true})
      }})
      assert.equal((await worker(make)().tick()).status,'paused');assert.equal(calls,0);assert.equal(forgot,true)
      assert.equal((await worker(make)().tick()).status,'idle');assert.equal(calls,0)
      const d=await f.owned.get(f.identities.alice,id);assert.equal(d.pending_effect,null);assert.equal(d.run.last_error_code,'workflow_v2_effect_outcome_unknown')
      const effects=(await f.db.query('SELECT tool_name,status FROM agentstudio.external_effects WHERE run_id=$1',[id])).rows
      assert.equal(effects.some(e=>e.tool_name==='workflow.model_bound_dispatch'),false)
      assert.equal(effects.some(e=>e.tool_name==='workflow:model'&&e.status==='unknown'),true)
    },{allowMemory:true})
  }finally{await f.close()}
})

test('an immutable receipt detects a stripped queued context before planning or charge',async()=>{
  const f=await fixture();let calls=0
  try{
    const admitted=await f.owned.submit(f.identities.alice,f.resources.alice.spec.id,raw(f)),id=admitted.run.id
    await f.db.query("UPDATE agentstudio.runs SET checkpoint=checkpoint-'memory_context' WHERE id=$1",[id])
    await f.privateTls(async()=>{calls++;return '{"action":"answer","answer":"never"}'},async make=>{
      const result=await worker(make)().tick();assert.equal(result.status,'failed');assert.equal(calls,0)
      assert.equal((await f.owned.get(f.identities.alice,id)).run.last_error_code,'agent_memory_context_unavailable')
      assert.equal(await count(f,'external_effects'),0)
    },{allowMemory:true})
  }finally{await f.close()}
})

test('memory Worker and private dispatch require independent opt-ins; scheduled admission does not inherit memory writes or context',async()=>{
  const f=await fixture(),role=f.resources.alice.spec;let calls=0
  try{
    const a=await f.owned.submit(f.identities.alice,role.id,raw(f))
    await f.privateTls(async()=>{calls++;return '{"action":"answer","answer":"not enabled"}'},async make=>{
      assert.equal((await make({humanInputApproved:true}).tick()).status,'paused');assert.equal(calls,0)
      assert.equal((await f.owned.get(f.identities.alice,a.run.id)).run.last_error_code,'agent_memory_execution_disabled')
    },{allowMemory:true})
    const b=await f.owned.submit(f.identities.alice,role.id,raw(f))
    await f.privateTls(async()=>{calls++;return '{"action":"answer","answer":"Broker disabled"}'},async make=>{
      const ready=await advance(f,b.run.id,worker(make),'awaiting_approval','model')
      await f.owned.decide(f.identities.alice,b.run.id,{decision:'approved',step_key:ready.pending_effect.step_key,input_sha256:ready.pending_effect.input_sha256})
      assert.equal((await worker(make)().tick()).status,'paused');assert.equal(calls,0)
    }) // Private memory capability intentionally omitted.
    const before=await count(f,'agent_memory_entries'),drafts=new ScheduleDraftRepository(f.pool),schedules=new ScheduleRuntimeRepository(f.pool,{enabled:true,allowHumanInput:true})
    const draft=await drafts.create(f.identities.alice,{name:'No silent scheduled memory',kind:'agent',target_id:role.id,time_zone:'UTC',rule:{kind:'interval',interval_minutes:15}})
    const activation=await schedules.activate(f.identities.alice,draft.id,{expected_revision:draft.revision,expected_target_revision:role.revision,instruction:'记住：不要后台写新记忆。整理财务报告',max_steps:2,
      anchor_at:new Date().toISOString(),expires_at:new Date(Date.now()+3600000).toISOString(),max_occurrences:2,max_auto_effects:10,background_ack:SCHEDULE_BACKGROUND_ACK,knowledge_charge_ack:null,request_id:randomUUID()})
    const planned=await schedules.runNow(f.identities.alice,draft.id,Number(activation.revision))
    assert.equal((await new ScheduleRuntimeWorker(f.pool,'synthetic-memory-schedule',{allowHumanInput:true}).tick()).run_id,planned.run_id)
    const checkpoint=(await f.db.query('SELECT checkpoint FROM agentstudio.runs WHERE id=$1',[planned.run_id])).rows[0].checkpoint
    assert.equal(Object.hasOwn(checkpoint,'memory_context'),false);assert.equal(await count(f,'agent_memory_entries'),before);assert.equal(calls,0)
  }finally{await f.close()}
})
