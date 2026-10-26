import test from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {parseAgentMemoryChange,agentMemoryHash} from '../src/agent-memory-contract.ts'
const input=()=>({action:'remember',request_id:randomUUID(),spec_id:randomUUID(),expected_revision:1,fact:'报告使用中文。',confirm:true})
test('memory write consent is closed, exact and hashes the original request without retaining its secret text',()=>{
  const raw={...input(),fact:'report token=syntheticMemorySecret'}
  const saved=parseAgentMemoryChange(raw)
  assert.equal(saved.fact,'report token=***');assert.equal(saved.content_sha256,agentMemoryHash(saved.fact))
  assert.equal(JSON.stringify(saved).includes('syntheticMemorySecret'),false)
  assert.notEqual(parseAgentMemoryChange({...raw,fact:'report token=changedSyntheticSecret'}).request_sha256,saved.request_sha256)
  for(const invalid of [{...raw,owner_user_id:randomUUID()},{...raw,confirm:false},{...raw,kind:'fact'}, {...raw,expected_revision:0}, {...raw,fact:' '}, {...raw,fact:'😀'.repeat(251)}, {...raw,fact:'\0'}])
    assert.throws(()=>parseAgentMemoryChange(invalid),/invalid_agent_memory_request/)
})
test('forget binds the exact memory and content, and never takes a client supplied owner or replacement fact',()=>{
  const raw={action:'forget',request_id:randomUUID(),spec_id:randomUUID(),memory_id:randomUUID(),expected_sha256:agentMemoryHash('old fact'),confirm:true}
  const parsed=parseAgentMemoryChange(raw)
  assert.equal(parsed.memory_id,raw.memory_id);assert.equal(parsed.action,'forget')
  assert.notEqual(parseAgentMemoryChange({...raw,memory_id:randomUUID()}).request_sha256,parsed.request_sha256)
  assert.notEqual(parseAgentMemoryChange({...raw,expected_sha256:agentMemoryHash('new fact')}).request_sha256,parsed.request_sha256)
  for(const invalid of [{...raw,confirm:'true'},{...raw,expected_sha256:'bad'},{...raw,fact:'replacement'},{...raw,memory_id:null},null,[]])
    assert.throws(()=>parseAgentMemoryChange(invalid),/invalid_agent_memory_request/)
})
