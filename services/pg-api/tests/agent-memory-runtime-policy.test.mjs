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
