import test from 'node:test'
import assert from 'node:assert/strict'
import {parseAgentMemoryDerivedChange as parse} from '../src/agent-memory-derived-contract.ts'
const request_id='11111111-1111-4111-8111-111111111111',spec_id='22222222-2222-4222-8222-222222222222',source_run_id='33333333-3333-4333-8333-333333333333',memory_id='44444444-4444-4444-8444-444444444444'
const save={action:'save_success',request_id,spec_id,source_run_id,expected_source_sha256:'a'.repeat(64),confirm:true}
test('derived source intent binds original request, source and purpose; browser cannot submit text or authority',()=>{
  const choice=parse(save);assert.match(choice.request_sha256,/^[a-f0-9]{64}$/);assert.deepEqual(parse(structuredClone(save)),choice)
  assert.notEqual(parse({...save,action:'save_failure'}).request_sha256,choice.request_sha256)
  assert.notEqual(parse({...save,expected_source_sha256:'b'.repeat(64)}).request_sha256,choice.request_sha256)
  assert.notEqual(parse({...save,source_run_id:memory_id}).request_sha256,choice.request_sha256)
  for(const name of ['fact','kind','tools_used','owner_user_id','checkpoint','source_proof','paid_execution_approved','execute'])
    assert.throws(()=>parse({...save,[name]:'forged'}),e=>e.code==='invalid_agent_memory_derived_change')
  for(const v of [{...save,confirm:'true'},{...save,confirm:false},{...save,expected_source_sha256:'A'.repeat(64)},
    {...save,action:'save_refined'},{...save,source_run_id:'not-an-id'},Object.assign(Object.create({}),save)])
    assert.throws(()=>parse(v),e=>e.code==='invalid_agent_memory_derived_change')
})
test('forget binds both physical text hashes and forbids reusing the creation request id',()=>{
  const raw={action:'forget',request_id,spec_id,memory_id,expected_content_sha256:'a'.repeat(64),expected_tools_sha256:'b'.repeat(64),confirm:true},choice=parse(raw)
  assert.notEqual(parse({...raw,expected_tools_sha256:'c'.repeat(64)}).request_sha256,choice.request_sha256)
  assert.notEqual(parse({...raw,expected_content_sha256:'c'.repeat(64)}).request_sha256,choice.request_sha256)
  for(const v of [{...raw,memory_id:request_id},{...raw,expected_tools_sha256:''},{...raw,source_run_id},
    {...raw,expected_content_sha256:'g'.repeat(64)}])assert.throws(()=>parse(v),e=>e.code==='invalid_agent_memory_derived_change')
  assert.equal(Object.hasOwn(choice,'fact'),false)
})
