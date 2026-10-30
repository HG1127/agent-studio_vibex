import test from 'node:test'
import assert from 'node:assert/strict'
import {requireEphemeralPg18Ci} from '../src/pg18-ephemeral-ci-guard.mjs'
import {requireAgentRunControlGenuineCi} from './helpers/agent-run-control-genuine-guard.mjs'
requireEphemeralPg18Ci();requireAgentRunControlGenuineCi() // Original guard plus dedicated F31 binding before effects.
const {agentRunControlGenuineFixture}=await import('./helpers/agent-run-control-genuine-fixture.mjs')
test('F31 actual Native Cookie + minimal-login Worker + real PG18 pause/resume same run',{concurrency:false,timeout:300000},async t=>{
 const f=await agentRunControlGenuineFixture();let phase='setup'
 const cancel=async id=>{const result=await f.request('alice','/api/v2/agent-autonomous-runs/'+id+'/cancel',{});assert.equal(result.status,200)}
 try{
  await t.test('actual minimal Worker authenticates independently, new operations default closed and only current owner cookie is accepted',async()=>{
   phase='identity';const db=await f.workerPool.connect();try{const r=(await db.query('SELECT session_user AS login,current_user AS actor,r.rolsuper,r.rolbypassrls,r.rolinherit FROM pg_roles r WHERE rolname=session_user')).rows[0];assert.equal(r.login,'synthetic_f31_worker');assert.equal(r.actor,r.login);assert.deepEqual([r.rolsuper,r.rolbypassrls,r.rolinherit],[false,false,false])}finally{db.release()}
   const run=await f.submit(),id=run.run.id,body=await f.intent(id),path='/api/v2/agent-autonomous-runs/'+id+'/pause';f.setEnabled(false);assert.equal((await f.request('alice',path,body)).status,405);f.setEnabled(true)
   assert.equal((await f.request('bob',path,body)).status,404);assert.equal((await f.request('none',path,body,{headers:{'X-Rh-User-Id':f.users.alice}})).status,401);assert.equal((await f.request('alice',path,body,{headers:{Origin:'https://foreign.invalid'}})).status,403);await cancel(id)
  })
  await t.test('actual concurrent same UUID pause writes one receipt, prevents009 claim and resumes same queued run without duplicating submission',async()=>{
   phase='queued';const id=(await f.submit()).run.id,body=await f.intent(id),reply=await Promise.all([f.control(id,'pause',body),f.control(id,'pause',body)]);assert.deepEqual(reply.map(r=>r.status),[200,200]);assert.equal(await f.countReceipt(id),1);assert.equal((await f.tick()).status,'idle');assert.equal((await f.get(id)).run.status,'paused');const resumed=await f.control(id,'resume');assert.equal(resumed.status,200);assert.equal(resumed.body.run.id,id);assert.equal(resumed.body.run.status,'queued');await cancel(id)
  })
  await t.test('started call keeps original actual lease, records one known result while paused and continues without replay only after owner resume',async()=>{
   phase='inflight_known';const id=(await f.submit()).run.id;await f.modelReady(id);const held=f.holdCall(),work=f.tick();await held.entered();const original=await f.lease(id),count=f.calls();assert.equal(original.effect_status,'started');assert.equal((await f.control(id,'pause')).status,200);assert.deepEqual(await f.lease(id),original);assert.equal((await f.control(id,'resume')).status,409);held.release();assert.equal((await work).status,'paused');const saved=(await f.db.query("SELECT status,result_reference FROM agentstudio.external_effects WHERE run_id=$1 AND tool_name='workflow:model'",[id])).rows;assert.equal(saved.length,1);assert.equal(saved[0].status,'succeeded');assert.ok(saved[0].result_reference.includes('F31 original completed result'));assert.equal((await f.tick()).status,'idle');assert.equal(f.calls(),count);assert.equal((await f.control(id,'resume')).status,200)
   for(let i=0;i<8&&(await f.get(id)).run.status!=='succeeded';i++){const result=await f.tick();assert.notEqual(result.status,'awaiting_approval')}
   assert.equal((await f.get(id)).run.status,'succeeded');assert.equal(f.calls(),count)
  })
  await t.test('expired original lease is reconciled to unknown while manually paused; no retry, result overwrite or resume is allowed',async()=>{
   phase='expired_unknown';const id=(await f.submit()).run.id;await f.modelReady(id);const held=f.holdCall(),work=f.tick();await held.entered();assert.equal((await f.control(id,'pause')).status,200);const calls=f.calls();await f.expire(id);assert.equal((await f.tick()).status,'paused');held.release();assert.equal((await work).status,'stale');assert.equal((await f.get(id)).run.status,'paused');assert.equal((await f.control(id,'resume')).status,409);assert.equal((await f.tick()).status,'idle');assert.equal(f.calls(),calls);const effects=(await f.db.query("SELECT status FROM agentstudio.external_effects WHERE run_id=$1 AND tool_name='workflow:model'",[id])).rows;assert.deepEqual(effects,[{status:'unknown'}])
  })
  await t.test('lost actual HTTP acknowledgement recovers only exact receipt and source drift blocks same-run resume',async()=>{
   phase='lost_ack';const id=(await f.submit()).run.id,body=await f.intent(id);f.dropControl();await assert.rejects(f.control(id,'pause',body));assert.equal((await f.get(id)).run.status,'paused');const proof=await f.control(id,'pause-confirm',body);assert.equal(proof.status,200);assert.equal(proof.body.run_control_confirmation.operation_id,body.operation_id);assert.equal(await f.countReceipt(id),1)
   phase='source_drift';const role=await f.agents.get(f.identities.alice,f.resources.alice.spec.id),{require_approval:_,...spec}=role.spec;await f.agents.update(f.identities.alice,role.id,role.name,{...spec,goal:'Synthetic changed source'},role.revision);assert.equal((await f.control(id,'resume')).status,409);assert.equal((await f.get(id)).run.status,'paused')
  })
 }catch(error){const code=Object.getOwnPropertyDescriptor(error??{},'code')?.value;throw Error('F31_actual_'+phase+'_'+(typeof code==='string'&&/^[A-Z0-9]{5}$/.test(code)?code:'check_failed'))}
 finally{await f.close()}
})
