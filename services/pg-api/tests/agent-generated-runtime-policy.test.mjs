// Pure operator selection and request policy only: no DB/listener/provider.
import test from 'node:test'
import assert from 'node:assert/strict'
import {selectAgentGeneratedAcceptance} from '../src/agent-generated-runtime-policy.ts'
import {selectNativePg18UatCapabilities,permitNativePg18BusinessUatRequest} from '../src/native-config-uat-policy.ts'

const origin='https://studio.example.test',config={AGENT_STUDIO_PG18_CONFIG_WRITE_UAT_ENABLED:'true',AGENT_STUDIO_PG18_UAT_APPROVAL:'APPROVE_ISOLATED_PG18_CONFIG_UAT_ONLY'}
const generated={AGENT_STUDIO_PG18_GENERATED_ACCEPTANCE_ENABLED:'true',AGENT_STUDIO_PG18_GENERATED_ACCEPTANCE_APPROVED:'APPROVE_DISPOSABLE_PG18_GENERATED_ROLE_ACCEPTANCE_ONLY'}
const readOnly={configurationWrites:false,employeeProvisioning:false,runApprovalUat:false,knowledgeIngestUat:false,modelProbeUat:false}
const base='/api/v2/agent-generated-acceptances',review='00000000-0000-4000-8000-000000000001'

test('generated configuration acceptance is defaultfalse and independent from old055/paid review/execution flags',()=>{
  assert.equal(selectAgentGeneratedAcceptance({}),false)
  assert.equal(selectAgentGeneratedAcceptance({AGENT_STUDIO_PG_AGENT_OPTIMIZATION_ACCEPT_ENABLED:'true',AGENT_STUDIO_PG_AGENT_OPTIMIZATION_ACCEPT_APPROVED:'APPROVE_DISPOSABLE_PG18_FEEDBACK_ROLE_ACCEPTANCE_ONLY',AGENT_STUDIO_PG18_REVIEW_SUBMISSION_ENABLED:'true',AGENT_STUDIO_PG18_REVIEW_SUBMISSION_APPROVED:'APPROVE_DISPOSABLE_PG18_PAID_REVIEW_SUBMISSION_ONLY'}),false)
  assert.equal(selectAgentGeneratedAcceptance(generated),true)
  const selected=selectNativePg18UatCapabilities({...config,...generated},true,origin,1100)
  assert.equal(selected.agentGeneratedAcceptanceUat,true);assert.equal(selected.configurationWrites,true)
  for(const name of ['agentOptimizationUat','agentReviewSubmissionUat','boundModelExecutionUat','autonomousAgentUat','agentFeedbackUat'])assert.equal(selected[name],undefined)
})

test('both exact markers are mandatory; malformed/half/false/alternate markers refuse',()=>{
  for(const env of [
    {AGENT_STUDIO_PG18_GENERATED_ACCEPTANCE_ENABLED:'true'},
    {AGENT_STUDIO_PG18_GENERATED_ACCEPTANCE_APPROVED:generated.AGENT_STUDIO_PG18_GENERATED_ACCEPTANCE_APPROVED},
    {...generated,AGENT_STUDIO_PG18_GENERATED_ACCEPTANCE_ENABLED:'false'},
    {...generated,AGENT_STUDIO_PG18_GENERATED_ACCEPTANCE_ENABLED:''},
    {...generated,AGENT_STUDIO_PG18_GENERATED_ACCEPTANCE_ENABLED:'TRUE'},
    {...generated,AGENT_STUDIO_PG18_GENERATED_ACCEPTANCE_APPROVED:'APPROVE_DISPOSABLE_PG18_FEEDBACK_ROLE_ACCEPTANCE_ONLY'},
    {...generated,AGENT_STUDIO_PG18_GENERATED_ACCEPTANCE_APPROVED:''}
  ])assert.throws(()=>selectAgentGeneratedAcceptance(env),/unsafe_agent_generated_config/)
})

test('fresh generated acceptance requires reviewed config, real serve mode, nonroot UID and HTTPS',()=>{
  assert.throws(()=>selectNativePg18UatCapabilities(generated,true,origin,1100),/unsafe_native_pg18_uat_config/)
  for(const [listen,url,uid] of [[false,origin,1100],[true,origin,0],[true,origin,undefined],[true,'http://127.0.0.1:7403',1100]])
    assert.throws(()=>selectNativePg18UatCapabilities({...config,...generated},listen,url,uid),/unsafe_native_pg18_uat_config/)
  assert.deepEqual(selectNativePg18UatCapabilities({},false,'http://127.0.0.1:7403',0),readOnly)
  assert.equal(selectNativePg18UatCapabilities(config,true,origin,1100).agentGeneratedAcceptanceUat,undefined)
})

test('all four exact routes remain reachable closed so the real repository can recover originals before its fresh gate',()=>{
  for(const policy of [readOnly,{...readOnly,configurationWrites:true}, {...readOnly,configurationWrites:true,agentGeneratedAcceptanceUat:true}]){
    for(const action of ['preview','accept','confirm']){
      assert.equal(permitNativePg18BusinessUatRequest(base+'/'+action,'POST',policy),true)
      for(const method of ['GET','PATCH','DELETE','PUT','HEAD'])assert.equal(permitNativePg18BusinessUatRequest(base+'/'+action,method,policy),false)
    }
    assert.equal(permitNativePg18BusinessUatRequest(base+'/reviews/'+review,'GET',policy),true)
    for(const method of ['POST','PATCH','DELETE','PUT','HEAD'])assert.equal(permitNativePg18BusinessUatRequest(base+'/reviews/'+review,method,policy),false)
  }
})

test('generated permission does not create aliases, collection/list access, unrelated configuration or paid execution authority',()=>{
  for(const path of [base,base+'/list',base+'/accept/',base+'/accept?confirm=true',base+'/accept#fragment',base+'/reviews/bad',base+'/reviews/'+review+'/accept'])
    for(const method of ['GET','POST'])assert.equal(permitNativePg18BusinessUatRequest(path,method,readOnly),false,path)
  const isolated={...readOnly,agentGeneratedAcceptanceUat:true}
  assert.equal(permitNativePg18BusinessUatRequest('/api/v2/agent-specs','POST',isolated),false)
  assert.equal(permitNativePg18BusinessUatRequest('/api/v2/runs','POST',isolated),false)
})
