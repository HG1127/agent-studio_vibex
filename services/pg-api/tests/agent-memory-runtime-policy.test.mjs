import test from 'node:test'
import assert from 'node:assert/strict'
import {selectAgentMemoryRuntime} from '../src/agent-memory-runtime-policy.ts'
test('memory runtime requires its exact independent operator marker and cannot inherit configuration or human approval',()=>{
  assert.equal(selectAgentMemoryRuntime({}),false)
  assert.equal(selectAgentMemoryRuntime({AGENT_STUDIO_PG18_CONFIG_WRITE_UAT_ENABLED:'true',AGENT_STUDIO_PG_AUTONOMOUS_AGENT_ENABLED:'true'}),false)
  const valid={AGENT_STUDIO_PG_AGENT_MEMORY_ENABLED:'true',AGENT_STUDIO_PG_AGENT_MEMORY_APPROVED:'APPROVE_DISPOSABLE_PG18_OWNER_MEMORY_ONLY'}
  assert.equal(selectAgentMemoryRuntime(valid),true)
  for(const invalid of [{...valid,AGENT_STUDIO_PG_AGENT_MEMORY_ENABLED:'false'},{...valid,AGENT_STUDIO_PG_AGENT_MEMORY_ENABLED:'TRUE'},
    {...valid,AGENT_STUDIO_PG_AGENT_MEMORY_APPROVED:'APPROVE_ISOLATED_PG18_CONFIG_UAT_ONLY'},
    {AGENT_STUDIO_PG_AGENT_MEMORY_ENABLED:'true'},{AGENT_STUDIO_PG_AGENT_MEMORY_APPROVED:valid.AGENT_STUDIO_PG_AGENT_MEMORY_APPROVED}])
    assert.throws(()=>selectAgentMemoryRuntime(invalid),/unsafe_agent_memory_runtime_config/)
})

test('terminal storage has its own strict operator acknowledgement and never inherits model, manual memory or config scope',async()=>{
  const {selectAgentOutcomeMemoryWrites}=await import('../src/agent-memory-runtime-policy.ts')
  const valid={AGENT_STUDIO_PG_AGENT_OUTCOME_MEMORY_ENABLED:'true',AGENT_STUDIO_PG_AGENT_OUTCOME_MEMORY_APPROVED:'APPROVE_DISPOSABLE_PG18_OWNER_OUTCOME_MEMORY_ONLY'}
  assert.equal(selectAgentOutcomeMemoryWrites({}),false)
  assert.equal(selectAgentOutcomeMemoryWrites({AGENT_STUDIO_PG_AGENT_MEMORY_ENABLED:'true',AGENT_STUDIO_PG_AGENT_DERIVED_MEMORY_ENABLED:'true',AGENT_STUDIO_PG18_CONFIG_WRITE_UAT_ENABLED:'true'}),false)
  assert.equal(selectAgentOutcomeMemoryWrites(valid),true)
  for(const value of [{...valid,AGENT_STUDIO_PG_AGENT_OUTCOME_MEMORY_ENABLED:'false'},{...valid,AGENT_STUDIO_PG_AGENT_OUTCOME_MEMORY_ENABLED:'TRUE'},
    {...valid,AGENT_STUDIO_PG_AGENT_OUTCOME_MEMORY_APPROVED:'APPROVE_DISPOSABLE_PG18_SOURCE_BOUND_MEMORY_ONLY'},
    {AGENT_STUDIO_PG_AGENT_OUTCOME_MEMORY_ENABLED:'true'},{AGENT_STUDIO_PG_AGENT_OUTCOME_MEMORY_APPROVED:valid.AGENT_STUDIO_PG_AGENT_OUTCOME_MEMORY_APPROVED}])
    assert.throws(()=>selectAgentOutcomeMemoryWrites(value),/unsafe_agent_outcome_memory_config/)
})
