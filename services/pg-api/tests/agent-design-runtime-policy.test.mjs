// Synthetic query rows test fail-closed branching, not actual database grants.
import test from 'node:test'
import assert from 'node:assert/strict'
import {agentDesignExecutionEnabled as enabled,agentDesignExecutionApproval as approval,assertAgentDesignSession} from '../src/agent-design-runtime-policy.ts'
test('execution is default-off and review activation cannot enable design',()=>{assert.equal(enabled(),false);assert.equal(enabled({executionEnabled:false,executionApproval:approval}),false);assert.throws(()=>enabled({executionEnabled:true}));assert.throws(()=>enabled({executionEnabled:true,executionApproval:'APPROVE_DISPOSABLE_PG18_AGENT_ASSESSMENT_EXECUTION_ONLY'}));assert.equal(enabled({executionEnabled:true,executionApproval:approval}),true)})
test('authenticated privileged login is refused before SET ROLE can hide it',async()=>{
  let calls=0;await assert.rejects(()=>assertAgentDesignSession({query:async()=>{calls++;return {rows:[{login:true,initial_role:true,inherit:false,superuser:true,bypassrls:false,createdb:false,createrole:false,replication:false}]}}},'agentstudio_design_worker'))
  assert.equal(calls,1)
})
test('transitive membership in review or extra roles is refused',async()=>{
  let i=0;const rows=[[{login:true,initial_role:true,inherit:false,superuser:false,bypassrls:false,createdb:false,createrole:false,replication:false}],[{name:'agentstudio_design_worker'},{name:'agentstudio_review_worker'}]]
  await assert.rejects(()=>assertAgentDesignSession({query:async()=>({rows:rows[i++]})},'agentstudio_design_worker'));assert.equal(i,2)
})
