// Admission/refusal only. This test never obtains a real permit or target.
import test from'node:test'
import assert from'node:assert/strict'
import{complete069PlanWorkflowCiStageEnabled,collectComplete069PlanWorkflowCiStage,verifyComplete069PlanWorkflowCiStage}from'./helpers/pg18-complete-plan-workflow-ci-stage.mjs'
import{verifyComplete069PlanWorkflowCi}from'./helpers/pg18-complete-plan-workflow-ci.mjs'
test('new F05 stage refuses cloned permits before source, manifest or filesystem arguments',async()=>{
 let touched=false;const poison=new Proxy({},{get(){touched=true;throw Error('source_access_before_permit')}}),refused=/complete_install_ci_refused:unsealed_ci_permit/
 assert.throws(()=>complete069PlanWorkflowCiStageEnabled({}),refused);await assert.rejects(collectComplete069PlanWorkflowCiStage({},poison),refused);await assert.rejects(verifyComplete069PlanWorkflowCiStage({},poison,poison,poison,poison),refused);assert.equal(touched,false)
})
test('actual F05 CI continuation refuses before unsealed stage, target or predecessor credential access',async()=>{
 let touched=false;const poison=new Proxy({},{get(){touched=true;throw Error('target_or_secret_access_before_admission')}})
 await assert.rejects(verifyComplete069PlanWorkflowCi(poison,poison,poison),/complete_install_(?:ci|stage)_refused:|refuse_non_ephemeral_pg18_ci|complete_plan_workflow_ci_new_purpose_required/);assert.equal(touched,false)
})
