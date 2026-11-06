import test from 'node:test'
import assert from 'node:assert/strict'
import {diagnoseAgentDesignFixture} from './helpers/agent-design-catalog-diagnostics.mjs'
test('ordinary diagnostic request refuses before any fixture/client/driver access',async()=>{
  let accessed=false
  const fixture=new Proxy({}, {get(){accessed=true;throw Error('fixture access before guard')}})
  await assert.rejects(()=>diagnoseAgentDesignFixture(fixture,{}),/refuse_non_ephemeral/)
  assert.equal(accessed,false)
})
