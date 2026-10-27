import test from 'node:test'
import assert from 'node:assert/strict'
import {selectAgentOptimizationAcceptance} from '../src/agent-optimization-runtime-policy.ts'
import {selectNativePg18UatCapabilities,permitNativePg18BusinessUatRequest} from '../src/native-config-uat-policy.ts'
const optimization={AGENT_STUDIO_PG_AGENT_OPTIMIZATION_ACCEPT_ENABLED:'true',AGENT_STUDIO_PG_AGENT_OPTIMIZATION_ACCEPT_APPROVED:'APPROVE_DISPOSABLE_PG18_FEEDBACK_ROLE_ACCEPTANCE_ONLY'}
const config={AGENT_STUDIO_PG18_CONFIG_WRITE_UAT_ENABLED:'true',AGENT_STUDIO_PG18_UAT_APPROVAL:'APPROVE_ISOLATED_PG18_CONFIG_UAT_ONLY'}
test('feedback-linked owner role acceptance has its own exact opt-in and never inherits feedback, config, model or lesson grants',()=>{
  assert.equal(selectAgentOptimizationAcceptance({}),false);assert.equal(selectAgentOptimizationAcceptance({...config,AGENT_STUDIO_PG_AGENT_FEEDBACK_ENABLED:'true',AGENT_STUDIO_PG_AGENT_FEEDBACK_LESSONS_ENABLED:'true'}),false)
  assert.equal(selectAgentOptimizationAcceptance(optimization),true)
  for(const patch of [{AGENT_STUDIO_PG_AGENT_OPTIMIZATION_ACCEPT_ENABLED:'false'},{AGENT_STUDIO_PG_AGENT_OPTIMIZATION_ACCEPT_ENABLED:'TRUE'},{AGENT_STUDIO_PG_AGENT_OPTIMIZATION_ACCEPT_ENABLED:undefined},{AGENT_STUDIO_PG_AGENT_OPTIMIZATION_ACCEPT_APPROVED:undefined},{AGENT_STUDIO_PG_AGENT_OPTIMIZATION_ACCEPT_APPROVED:'APPROVE_DISPOSABLE_PG18_OWNER_FEEDBACK_ONLY'}])assert.throws(()=>selectAgentOptimizationAcceptance({...optimization,...patch}),/unsafe_agent_optimization_config/)
})
test('manual acceptance requires isolated non-root HTTPS config writes without starting autonomous execution or requiring new feedback admission',()=>{
  const env={...config,...optimization},value=selectNativePg18UatCapabilities(env,true,'https://127.0.0.1:7443',1100)
  assert.equal(value.agentOptimizationUat,true)
  for(const key of ['autonomousAgentUat','boundModelExecutionUat','agentFeedbackUat','agentFeedbackLessonsUat','agentMemoryUat','agentOutcomeMemoryUat'])assert.equal(value[key],undefined)
  for(const args of [[optimization,true,'https://127.0.0.1',1100],[env,false,'https://127.0.0.1',1100],[env,true,'http://127.0.0.1',1100],[env,true,'https://127.0.0.1',0]])assert.throws(()=>selectNativePg18UatCapabilities(...args))
})
test('role previews and original acceptance confirmation stay routable with new writes off while the repository controls fresh acceptance',()=>{
  const closed=selectNativePg18UatCapabilities({},true,'https://127.0.0.1',1100),base='/api/v2/agent-optimizations'
  assert.equal(permitNativePg18BusinessUatRequest(base,'GET',closed),true)
  for(const action of ['preview','accept','confirm']){
    assert.equal(permitNativePg18BusinessUatRequest(base+'/'+action,'POST',closed),true)
    for(const method of ['GET','PATCH','DELETE','PUT'])assert.equal(permitNativePg18BusinessUatRequest(base+'/'+action,method,closed),false)
  }
  assert.equal(permitNativePg18BusinessUatRequest(base,'POST',closed),false);assert.equal(permitNativePg18BusinessUatRequest(base+'/unknown','POST',closed),false)
})
