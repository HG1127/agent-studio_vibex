// Actual Broker, frozen Ledger/Source, encryption and provider with query/event
// models. This is not real SQL/auditor/ownership or durable one-use fee evidence.
import test from 'node:test'
import assert from 'node:assert/strict'
import {AgentPlanWorkflowBroker,bindAgentPlanWorkflowCredential} from '../src/agent-plan-workflow-broker.ts'
import {brokerModel} from './helpers/agent-plan-workflow-broker-model.mjs'
import {id,hex} from '../../../tests/helpers/agent-plan-workflow-browser-values.mjs'
test('default-off and separate-pool/auditor requirements start no provider or secret read',async()=>{
  const x=brokerModel({disabled:true});await assert.rejects(x.broker.dispatch(x.proof),/disabled/);assert.equal(x.calls.length,0);assert.equal(x.wire.length,0)
  const pool={connect:async()=>{throw Error('unused')}};assert.throws(()=>new AgentPlanWorkflowBroker(pool,pool,{...pool},Buffer.alloc(32)));x.broker.close()
})
test('actual credential comparator binds owner/revision/model and exact encrypted envelope without mutating caller buffers',()=>{
  const x=brokerModel(),before=Buffer.from(x.secret.api_key_ciphertext),value=bindAgentPlanWorkflowCredential(x.secret,x.context,x.envelope,x.key)
  assert.equal(value.model_id,'generation-only');assert.equal(value.api_key,'synthetic_test_key_only');assert.deepEqual(x.secret.api_key_ciphertext,before)
  for(const row of [{...x.secret,owner_user_id:id(2)},{...x.secret,revision:4},{...x.secret,models:['other']},{...x.secret,enabled:false}])assert.throws(()=>bindAgentPlanWorkflowCredential(row,x.context,x.envelope,x.key))
  assert.throws(()=>bindAgentPlanWorkflowCredential(x.secret,x.context,hex(9),x.key));x.broker.close();assert.ok(x.key.every(v=>v===7))
})
test('actual successful model trace reserves before one POST, checks original secret login and ends SQL transactions before provider',async()=>{
  const x=brokerModel();const r=await x.broker.dispatch(x.proof);assert.equal(r.state,'succeeded');assert.equal(x.reservations(),1);assert.equal(x.finishes(),1);assert.equal(x.wire.length,1);assert.deepEqual(x.wire[0].openTransactions,[])
  const originalLogin=x.calls.findIndex(c=>c.kind==='secret'&&c.sql.includes('WHERE rolname=session_user')),setRole=x.calls.findIndex(c=>c.kind==='secret'&&c.sql==='SET LOCAL ROLE agentstudio_model_broker'),secretRead=x.calls.findIndex(c=>c.kind==='secret'&&c.sql.includes('FROM agentstudio.model_connections')),post=x.calls.findIndex(c=>c.kind==='provider')
  assert.ok(originalLogin>=0&&originalLogin<setRole&&setRole<secretRead&&secretRead<post);assert.ok(x.contexts()>=5);assert.equal(JSON.parse(x.wire[0].body).max_completion_tokens,8192);x.broker.close()
})
test('missing audit or unsafe original secret LOGIN stops before POST and never grants secret role',async()=>{
  for(const settings of [{auditFalse:true},{unsafeSecret:true},{wrongSecretOwner:true}]){
    const x=brokerModel(settings);try{await x.broker.dispatch(x.proof)}catch{}assert.equal(x.wire.length,0)
    if(settings.unsafeSecret)assert.equal(x.calls.some(c=>c.kind==='secret'&&c.sql==='SET LOCAL ROLE agentstudio_model_broker'),false)
    x.broker.close()
  }
})
test('rotated envelope after approved source selection is refused with spent reservation and no provider POST',async()=>{
  const x=brokerModel();x.alterEnvelope();const r=await x.broker.dispatch(x.proof);assert.ok(['failed','unknown'].includes(r.state));assert.equal(x.wire.length,0);assert.equal(x.reservations(),1);x.broker.close()
})
test('reserve acknowledgement loss sends zero provider requests and never recreates its reservation',async()=>{
  const x=brokerModel({reserveAckLost:true});assert.equal((await x.broker.dispatch(x.proof)).state,'unknown');assert.equal(x.wire.length,0);assert.equal(x.finishes(),0);assert.equal((await x.broker.dispatch(x.proof)).state,'unknown');assert.equal(x.reservations(),1);x.broker.close()
})
test('lost provider acknowledgement or source drift after model reply never becomes succeeded or sends again',async()=>{
  for(const settings of [{wireError:true},{driftAfterWire:true}]){
    const x=brokerModel(settings);assert.equal((await x.broker.dispatch(x.proof)).state,'unknown');assert.equal(x.wire.length,1)
    if(settings.driftAfterWire)await assert.rejects(x.broker.dispatch(x.proof),error=>[409,503].includes(error.status));else assert.equal((await x.broker.dispatch(x.proof)).state,'unknown')
    assert.equal(x.wire.length,1);assert.equal(x.reservations(),1);x.broker.close()
  }
})
test('lost finish acknowledgement only reads original durable result and never sends provider a second time',async()=>{
  const x=brokerModel({finishAckLost:true});assert.equal((await x.broker.dispatch(x.proof)).state,'succeeded');assert.equal(x.wire.length,1);assert.equal(x.finishes(),1);assert.ok(x.calls.some(c=>c.sql.includes('agent_plan_workflow_read_result')));x.broker.close()
})
test('close aborts the actual in-flight provider promise, blocks duplicate active dispatch and preserves caller key',async()=>{
  const x=brokerModel({wireHang:true}),flight=x.broker.dispatch(x.proof);let failure
  void flight.catch(error=>{failure=error});const until=Date.now()+2000
  while(!x.wire.length){if(failure)throw failure;if(Date.now()>until){x.broker.close();throw Error('synthetic_provider_not_entered')}await new Promise(resolve=>setImmediate(resolve))}
  await assert.rejects(x.broker.dispatch(x.proof),/busy/);x.broker.close();assert.equal((await flight).state,'unknown');assert.equal(x.wire.length,1);assert.ok(x.key.every(v=>v===7));await assert.rejects(x.broker.dispatch(x.proof),/disabled/)
})
