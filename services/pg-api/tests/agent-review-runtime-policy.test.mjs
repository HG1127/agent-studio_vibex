// Pure policy only: no SQL, socket, credentials or Worker startup.
import test from 'node:test'
import assert from 'node:assert/strict'
import {selectAgentReviewSubmission} from '../src/agent-review-runtime-policy.ts'
import {selectNativePg18UatCapabilities,permitNativePg18BusinessUatRequest} from '../src/native-config-uat-policy.ts'

const scope={AGENT_STUDIO_PG18_REVIEW_SUBMISSION_ENABLED:'true',AGENT_STUDIO_PG18_REVIEW_SUBMISSION_APPROVED:'APPROVE_DISPOSABLE_PG18_PAID_REVIEW_SUBMISSION_ONLY'}
const config={AGENT_STUDIO_PG18_CONFIG_WRITE_UAT_ENABLED:'true',AGENT_STUDIO_PG18_UAT_APPROVAL:'APPROVE_ISOLATED_PG18_CONFIG_UAT_ONLY'}
const origin='https://127.0.0.1:7443',id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',base='/api/v2/agent-reviews'

test('new paid submission is absent by default and never inherited from config, schema or execution consent',()=>{
  assert.equal(selectAgentReviewSubmission({}),false)
  assert.equal(selectAgentReviewSubmission({...config,AGENT_STUDIO_PG18_REVIEW_EXECUTION_ENABLED:'true',AGENT_STUDIO_PG18_REVIEW_EXECUTION_APPROVED:'APPROVE_DISPOSABLE_PG18_PAID_REVIEW_EXECUTION_ONLY',agent_review_available:'true'}),false)
  assert.equal(selectAgentReviewSubmission(scope),true)
  const selected=selectNativePg18UatCapabilities({...config,...scope},true,origin,1100)
  assert.equal(selected.configurationWrites,true);assert.equal(selected.agentReviewSubmissionUat,true)
  for(const key of ['autonomousAgentUat','boundModelExecutionUat','agentOptimizationUat','agentFeedbackUat','modelProbeUat'])assert.notEqual(selected[key],true)
})
test('half, false, alternate or malformed markers fail closed without downgrading to an ordinary server',()=>{
  for(const patch of [{AGENT_STUDIO_PG18_REVIEW_SUBMISSION_ENABLED:undefined},{AGENT_STUDIO_PG18_REVIEW_SUBMISSION_APPROVED:undefined},{AGENT_STUDIO_PG18_REVIEW_SUBMISSION_ENABLED:'false'},{AGENT_STUDIO_PG18_REVIEW_SUBMISSION_ENABLED:'TRUE'},{AGENT_STUDIO_PG18_REVIEW_SUBMISSION_APPROVED:'APPROVE_DISPOSABLE_PG18_PAID_REVIEW_EXECUTION_ONLY'},{AGENT_STUDIO_PG18_REVIEW_SUBMISSION_APPROVED:''}])assert.throws(()=>selectAgentReviewSubmission({...scope,...patch}),/unsafe_agent_review_config/)
})
test('new admission requires Native configuration writes and reviewed nonroot HTTPS listen context',()=>{
  for(const args of [[scope,true,origin,1100],[{...scope,...config},false,origin,1100],[{...scope,...config},true,'http://127.0.0.1:7443',1100],[{...scope,...config},true,origin,0],[{...scope,...config,AGENT_STUDIO_PG18_UAT_APPROVAL:'other'},true,origin,1100]])assert.throws(()=>selectNativePg18UatCapabilities(...args))
  assert.equal(selectNativePg18UatCapabilities({},true,origin,1100).agentReviewSubmissionUat,undefined)
})
test('source, preview, original submit replay, confirmation, privacy and current reads stay routable with new admission off',()=>{
  const closed=selectNativePg18UatCapabilities({},true,origin,1100)
  for(const action of ['source','preview','submit','confirm',id+'/control',id+'/control-confirm']){
    assert.equal(permitNativePg18BusinessUatRequest(base+'/'+action,'POST',closed),true)
    for(const method of ['GET','PATCH','DELETE','PUT','HEAD'])assert.equal(permitNativePg18BusinessUatRequest(base+'/'+action,method,closed),false)
  }
  assert.equal(permitNativePg18BusinessUatRequest(base+'/'+id,'GET',closed),true)
  for(const method of ['POST','PATCH','DELETE','HEAD'])assert.equal(permitNativePg18BusinessUatRequest(base+'/'+id,method,closed),false)
  for(const path of [base,base+'/source?owner_user_id='+id,base+'/prior',base+'/'+id+'/accept',base+'/'+id+'/control/',base+'/invalid/control'])assert.equal(permitNativePg18BusinessUatRequest(path,'POST',closed),false)
})
