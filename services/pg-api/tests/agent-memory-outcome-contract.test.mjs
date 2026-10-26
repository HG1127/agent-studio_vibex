import test from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {outcomeMemoryOption,outcomeMemoryConsent,outcomeMemoryId,outcomeMemoryStop,outcomeMemoryStopHash} from '../src/agent-memory-outcome-contract.ts'
const admission=()=>({owner_user_id:randomUUID(),run_id:randomUUID(),spec_id:randomUUID(),spec_revision:3,owner_epoch:4,instruction:'Private original task token=syntheticOutcomeSecret',graph_sha256:'a'.repeat(64)})

test('outcome storage choice defaults off, accepts only explicit booleans and carries no model or fee authority',()=>{
  assert.equal(outcomeMemoryOption(undefined,false),false);assert.equal(outcomeMemoryOption(false,true),false);assert.equal(outcomeMemoryOption(true,true),true)
  for(const value of [undefined,null,'true',1,{},[],{paid:true}])assert.throws(()=>outcomeMemoryOption(value,true),e=>e.code==='invalid_agent_memory_outcome_intent')
  const a=admission()
  for(const change of [{paid:true},{fact:'invented'},{source_sha256:'f'.repeat(64)},{spec_revision:NaN},{owner_epoch:0},{instruction:'\ud800'},{graph_sha256:'not-a-hash'},{instruction:'x'.repeat(2001)}])assert.throws(()=>outcomeMemoryConsent({...a,...change}))
})

test('one deterministic memory slot binds the original owner/run/admission and governance epoch without exposing private text',()=>{
  const a=admission(),intent=outcomeMemoryConsent(a),again=outcomeMemoryConsent({...a,owner_user_id:a.owner_user_id.toUpperCase()})
  assert.deepEqual(intent,again);assert.equal(outcomeMemoryId(a.owner_user_id,a.run_id,intent.intent_sha256),intent.memory_id)
  assert.match(intent.memory_id,/^[a-f0-9]{8}-[a-f0-9]{4}-8[a-f0-9]{3}-8[a-f0-9]{3}-[a-f0-9]{12}$/)
  assert.equal(Object.hasOwn(intent,'instruction'),false);assert.equal(JSON.stringify(intent).includes('syntheticOutcomeSecret'),false)
  for(const change of [{owner_user_id:randomUUID()},{run_id:randomUUID()},{spec_id:randomUUID()},{owner_epoch:a.owner_epoch+1},{spec_revision:a.spec_revision+1},{instruction:'Changed task'},{graph_sha256:'b'.repeat(64)}]){
    const changed=outcomeMemoryConsent({...a,...change});assert.notEqual(changed.intent_sha256,intent.intent_sha256);assert.notEqual(changed.memory_id,intent.memory_id)
  }
  assert.throws(()=>outcomeMemoryConsent(Object.assign(Object.create({forged:true}),a)))
})

test('stop requests bind the exact immutable consent and original request; browser text, actors and authority are refused',()=>{
  const a=admission(),intent=outcomeMemoryConsent(a),choice={request_id:randomUUID(),run_id:a.run_id,expected_intent_sha256:intent.intent_sha256,confirm:true}
  assert.deepEqual(outcomeMemoryStop(choice),choice);const hash=outcomeMemoryStopHash(a.owner_user_id,choice);assert.match(hash,/^[a-f0-9]{64}$/)
  for(const change of [{request_id:randomUUID()},{run_id:randomUUID()},{expected_intent_sha256:'b'.repeat(64)}])assert.notEqual(outcomeMemoryStopHash(a.owner_user_id,{...choice,...change}),hash)
  for(const change of [{confirm:false},{owner_user_id:randomUUID()},{request_sha256:hash},{fact:'injected'},{paid:true},{execute:true}])assert.throws(()=>outcomeMemoryStop({...choice,...change}))
})
