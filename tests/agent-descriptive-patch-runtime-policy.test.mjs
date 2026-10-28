// Pure independent opt-in policy: no SQL, listener, provider or Worker startup.
// Native config-UAT dependencies and recovery routing are verified separately.
import test from 'node:test'
import assert from 'node:assert/strict'
import {selectAgentDescriptivePatchAcceptance} from '../services/pg-api/src/agent-descriptive-patch-runtime-policy.ts'
import {selectAgentGeneratedAcceptance} from '../services/pg-api/src/agent-generated-runtime-policy.ts'
import {selectAgentOptimizationAcceptance} from '../services/pg-api/src/agent-optimization-runtime-policy.ts'
import {selectAgentReviewSubmission} from '../services/pg-api/src/agent-review-runtime-policy.ts'
import {agentAssessmentExecutionEnabled} from '../services/pg-api/src/agent-assessment-contract.ts'

const enabled='AGENT_STUDIO_PG18_DESCRIPTIVE_PATCH_ENABLED'
const approved='AGENT_STUDIO_PG18_DESCRIPTIVE_PATCH_APPROVED'
const marker='APPROVE_DISPOSABLE_PG18_DESCRIPTIVE_PATCH_ACCEPTANCE_ONLY'
const scope=Object.freeze({[enabled]:'true',[approved]:marker})
const unrelated=Object.freeze({
  generated:{AGENT_STUDIO_PG18_GENERATED_ACCEPTANCE_ENABLED:'true',AGENT_STUDIO_PG18_GENERATED_ACCEPTANCE_APPROVED:'APPROVE_DISPOSABLE_PG18_GENERATED_ROLE_ACCEPTANCE_ONLY'},
  manual055:{AGENT_STUDIO_PG_AGENT_OPTIMIZATION_ACCEPT_ENABLED:'true',AGENT_STUDIO_PG_AGENT_OPTIMIZATION_ACCEPT_APPROVED:'APPROVE_DISPOSABLE_PG18_FEEDBACK_ROLE_ACCEPTANCE_ONLY'},
  paidSubmission:{AGENT_STUDIO_PG18_REVIEW_SUBMISSION_ENABLED:'true',AGENT_STUDIO_PG18_REVIEW_SUBMISSION_APPROVED:'APPROVE_DISPOSABLE_PG18_PAID_REVIEW_SUBMISSION_ONLY'},
  paidExecution:{AGENT_STUDIO_PG18_REVIEW_EXECUTION_ENABLED:'true',AGENT_STUDIO_PG18_REVIEW_EXECUTION_APPROVED:'APPROVE_DISPOSABLE_PG18_PAID_REVIEW_EXECUTION_ONLY'},
  config:{AGENT_STUDIO_PG18_CONFIG_WRITE_UAT_ENABLED:'true',AGENT_STUDIO_PG18_UAT_APPROVAL:'APPROVE_ISOLATED_PG18_CONFIG_UAT_ONLY'},
})
const allOtherScopes=Object.assign({},...Object.values(unrelated))
const unsafe=env=>assert.throws(()=>selectAgentDescriptivePatchAcceptance(env),{name:'Error',message:'unsafe_agent_descriptive_patch_config'})

test('fresh descriptive acceptance defaults closed and never inherits any other grant',()=>{
  for(const env of [{},{[enabled]:undefined,[approved]:undefined},...Object.values(unrelated),allOtherScopes])
    assert.equal(selectAgentDescriptivePatchAcceptance(env),false)
})

test('only the independent exact pair selects fresh acceptance without mutating the environment',()=>{
  for(const env of [scope,Object.freeze({...allOtherScopes,...scope})]){
    const before={...env}
    assert.equal(selectAgentDescriptivePatchAcceptance(env),true)
    assert.deepEqual({...env},before)
  }
  // The outer Native selector owns config-UAT/listen/HTTPS dependencies.
  assert.equal(Object.hasOwn(scope,'AGENT_STUDIO_PG18_CONFIG_WRITE_UAT_ENABLED'),false)
})

test('single-sided or explicitly false settings throw instead of downgrading to closed',()=>{
  for(const env of [
    {[enabled]:'true'},
    {[approved]:marker},
    {[enabled]:'false'},
    {[approved]:'false'},
    {[enabled]:'false',[approved]:marker},
    {[enabled]:'false',[approved]:'false'},
    {[enabled]:'',[approved]:''},
  ])for(const other of [{},allOtherScopes])unsafe({...other,...env})
})

test('enabled requires the exact lowercase string true and rejects empty or nonstring values',()=>{
  for(const value of ['', 'false', 'False', 'FALSE', 'TRUE', 'True', ' true', 'true ', 'true\n', '1', 'yes', '0', undefined, null, true, false])
    unsafe({...scope,[enabled]:value})
})

test('approval is exact and cannot use generated, manual055, fee or config markers',()=>{
  const foreignMarkers=Object.values(allOtherScopes).filter(value=>value!=='true')
  for(const value of [undefined,'','false','TRUE',marker.toLowerCase(),' '+marker,marker+' ',marker+'\n','APPROVE_EXACT_GENERATED_DESCRIPTIVE_PATCH_V1',null,true,...foreignMarkers]){
    unsafe({...scope,[approved]:value})
    unsafe({...allOtherScopes,...scope,[approved]:value})
  }
})

test('descriptive authorization grants no generated, manual055, paid submission or execution permission',()=>{
  assert.equal(selectAgentDescriptivePatchAcceptance(scope),true)
  assert.equal(selectAgentGeneratedAcceptance(scope),false)
  assert.equal(selectAgentOptimizationAcceptance(scope),false)
  assert.equal(selectAgentReviewSubmission(scope),false)
  assert.equal(agentAssessmentExecutionEnabled(scope),false)
  // It remains a stateless fresh-write boolean, not a recovery/read gate.
  assert.equal(selectAgentDescriptivePatchAcceptance({}),false)
  assert.deepEqual(scope,{[enabled]:'true',[approved]:marker})
})
