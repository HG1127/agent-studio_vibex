import test from 'node:test'
import assert from 'node:assert/strict'
import {selectAgentFeedbackScopes} from '../src/agent-feedback-runtime-policy.ts'
import {selectNativePg18UatCapabilities,permitNativePg18BusinessUatRequest} from '../src/native-config-uat-policy.ts'
const submit={AGENT_STUDIO_PG_AGENT_FEEDBACK_ENABLED:'true',AGENT_STUDIO_PG_AGENT_FEEDBACK_APPROVED:'APPROVE_DISPOSABLE_PG18_OWNER_FEEDBACK_ONLY'}
const lessons={AGENT_STUDIO_PG_AGENT_FEEDBACK_LESSONS_ENABLED:'true',AGENT_STUDIO_PG_AGENT_FEEDBACK_LESSONS_APPROVED:'APPROVE_DISPOSABLE_PG18_FEEDBACK_LESSON_STORAGE_ONLY'}
const config={AGENT_STUDIO_PG18_CONFIG_WRITE_UAT_ENABLED:'true',AGENT_STUDIO_PG18_UAT_APPROVAL:'APPROVE_ISOLATED_PG18_CONFIG_UAT_ONLY'}
test('feedback and lesson storage have distinct closed operator scopes and inherit no provider or memory grants',()=>{
  assert.deepEqual(selectAgentFeedbackScopes({}),{submit:false,lessons:false})
  assert.deepEqual(selectAgentFeedbackScopes({...config,AGENT_STUDIO_PG_AGENT_DERIVED_MEMORY_ENABLED:'true'}),{submit:false,lessons:false})
  assert.deepEqual(selectAgentFeedbackScopes(submit),{submit:true,lessons:false})
  assert.deepEqual(selectAgentFeedbackScopes({...submit,...lessons}),{submit:true,lessons:true})
  for(const key of Object.keys({...submit,...lessons})){
    const missing={...submit,...lessons};delete missing[key];assert.throws(()=>selectAgentFeedbackScopes(missing),/unsafe_agent_feedback_config/)
    assert.throws(()=>selectAgentFeedbackScopes({...submit,...lessons,[key]:'true '}),/unsafe_agent_feedback_config/)
  }
  assert.throws(()=>selectAgentFeedbackScopes(lessons),/unsafe_agent_feedback_config/)
  assert.throws(()=>selectAgentFeedbackScopes({...submit,...lessons,AGENT_STUDIO_PG_AGENT_FEEDBACK_LESSONS_APPROVED:submit.AGENT_STUDIO_PG_AGENT_FEEDBACK_APPROVED}),/unsafe_agent_feedback_config/)
})
test('Native feedback admission requires config, isolated HTTPS listener and non-root scope without autonomous execution',()=>{
  const env={...config,...submit,...lessons},policy=selectNativePg18UatCapabilities(env,true,'https://127.0.0.1:7443',1100)
  assert.equal(policy.agentFeedbackUat,true);assert.equal(policy.agentFeedbackLessonsUat,true)
  for(const key of ['autonomousAgentUat','boundModelExecutionUat','agentMemoryUat','agentDerivedMemoryUat','agentOutcomeMemoryUat'])assert.equal(policy[key],undefined)
  assert.equal(selectNativePg18UatCapabilities({...config,...submit},true,'https://127.0.0.1:7443',1100).agentFeedbackLessonsUat,undefined)
  for(const args of [[submit,true,'https://127.0.0.1',1100],[env,false,'https://127.0.0.1',1100],[env,true,'http://127.0.0.1',1100],[env,true,'https://127.0.0.1',0]])assert.throws(()=>selectNativePg18UatCapabilities(...args))
})
test('feedback status, privacy changes and immutable original recovery remain routable after new submission is disabled',()=>{
  const closed=selectNativePg18UatCapabilities({},true,'https://127.0.0.1',1100),base='/api/v2/agent-feedback/7210c09e-80b4-4153-834f-976d42d28799'
  for(const mode of [closed,{...closed,configurationWrites:true,agentFeedbackUat:true}]){
    assert.equal(permitNativePg18BusinessUatRequest(base,'GET',mode),true)
    for(const path of ['/change','/confirm'])assert.equal(permitNativePg18BusinessUatRequest(base+path,'POST',mode),true)
    for(const path of [base,base+'/change',base+'/confirm'])for(const method of ['PUT','PATCH','DELETE','HEAD'])assert.equal(permitNativePg18BusinessUatRequest(path,method,mode),false)
    assert.equal(permitNativePg18BusinessUatRequest(base+'/change','GET',mode),false)
    assert.equal(permitNativePg18BusinessUatRequest(base+'/unknown','POST',mode),false)
    assert.equal(permitNativePg18BusinessUatRequest('/api/v2/agent-feedback/not-uuid/change','POST',mode),false)
  }
})
