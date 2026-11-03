import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
const context={module:{exports:{}}}
vm.runInNewContext(fs.readFileSync('pocketbase/pb_hooks/modules/capability_plan.js','utf8'),context)
const derive=context.module.exports.derive

test('original employee text remains a compiler input when the generated draft omits its requirements',()=>{
  const plan=derive({goal:'Only calculate',tools:['calculate'],task_plan:['Calculate']},'需要 OCR、关系图、持续监测和逐字引文。')
  for(const id of ['ocr','relation_graph','monitoring','evidence_validation'])assert.ok(plan.requirements.some(row=>row.id===id))
  assert.equal(plan.requirements.find(row=>row.id==='ocr').state,'development_required');assert.ok(plan.input_contract.required.includes('case_id'))
})

test('requirements become truthful inputs, objects, templates and validators with explicit unbuilt dependencies',()=>{
  const plan=derive({goal:'People Intelligence，OCR 扫描材料、关系图、持续监测；冻结事实集输出 PDF。',tools:['business_record_write','business_material_read','business_job_submit','business_report_render'],task_plan:['收集','核验','交付']})
  for(const id of ['ocr','relation_graph'])assert.equal(plan.requirements.find(r=>r.id===id).state,'development_required')
  assert.equal(plan.requirements.find(r=>r.id==='monitoring').state,'configuration_required')
  assert.equal(plan.requirements.find(r=>r.id==='office_reports').state,'configuration_required')
  assert.ok(plan.input_contract.required.includes('case_id'))
  assert.ok(plan.data_objects.includes('research.claim.v1'))
  assert.ok(plan.artifacts.includes('research.fact_set.v1'))
  assert.equal(plan.validators[0].free_text_quality,'unverified')
  assert.equal(plan.task_stages[0].execution_support,'unstructured_plan_only')
})

test('native capability without the saved tool binding remains configuration required',()=>{
  const plan=derive({goal:'正式事实与同一事实集报告',tools:[]})
  assert.equal(plan.requirements.find(r=>r.id==='case_records').state,'configuration_required')
  assert.ok(plan.requirements.find(r=>r.id==='immutable_reports').missing_tools.includes('business_report_render'))
})
test('workflow research execution does not turn a textual AgentSpec plan into a runnable DAG',()=>{
  const plan=derive({goal:'阶段依赖与分问题预算',tools:['business_record_write']})
  assert.equal(plan.requirements.find(r=>r.id==='stage_dag').state,'configuration_required')
  assert.ok(plan.input_contract.required.includes('case_id'))
})

test('negated OCR is not falsely required and explicit unknown/prototype IDs cannot become supported',()=>{
  assert.equal(derive({goal:'无需 OCR；只读取 PDF 文字。',tools:['business_material_read','business_record_write']}).requirements.some(r=>r.id==='ocr'),false)
  const plan=derive({goal:'Simple task',capability_requirements:['__proto__','unknown_feature']})
  assert.equal(plan.requirements.find(r=>r.id==='__proto__').state,'development_required')
  assert.equal(plan.requirements.find(r=>r.id==='unknown_feature').state,'development_required')
})
