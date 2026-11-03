import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
const context={module:{exports:{}}}
vm.runInNewContext(fs.readFileSync('pocketbase/pb_hooks/modules/capability_plan.js','utf8'),context)
const {derive,assignRequirements}=context.module.exports
const desktop={id:'files',title:'Read a document',purpose:'Read authorized material only',kind:'knowledge',access:'read',required:true,role_ids:['researcher'],search_terms:[],suggested_tool_ids:['knowledge_search']}

test('research IDs retain desktop capability objects and still block unimplemented OCR',()=>{
  const spec={goal:'Read sources',tools:['knowledge_search'],capability_requirements:[desktop],research_capability_requirements:['ocr']}
  const plan=derive(spec)
  assert.ok(!plan.requirements.some(r=>r.id==='invalid_requirements'))
  assert.equal(plan.requirements.find(r=>r.id==='ocr').state,'development_required')
  const copied={capability_requirements:[desktop]}
  assignRequirements(copied,plan.requirements.map(r=>r.id),spec)
  assert.deepEqual(copied.capability_requirements,[desktop])
  assert.ok(copied.research_capability_requirements.includes('ocr'))
})

test('legacy ID-only research specs remain supported while malformed objects fail closed',()=>{
  const spec={goal:'Research',tools:[],capability_requirements:['relation_graph']},copy={}
  const plan=derive(spec);assignRequirements(copy,plan.requirements.map(r=>r.id),spec)
  assert.ok(copy.capability_requirements.includes('relation_graph'))
  assert.equal(copy.research_capability_requirements,undefined)
  assert.ok(derive({goal:'Research',tools:[],capability_requirements:[{id:'ocr'}]}).requirements.some(r=>r.id==='invalid_requirements'))
})

test('desktop requirement descriptions cannot hide an unbuilt research capability',()=>{
  const plan=derive({goal:'Read sources',tools:[],capability_requirements:[{...desktop,title:'OCR 扫描材料'}]})
  assert.equal(plan.requirements.find(r=>r.id==='ocr').state,'development_required')
})


test('reviewed legacy PDF adapter remains usable only with its verified read binding',()=>{
  const {bindLegacyDesktopMaterial}=context.module.exports
  const spec={goal:'Extract sources',tools:['pdf_reader'],capability_requirements:[{...desktop,title:'提取 PDF 证据',kind:'document',suggested_tool_ids:['pdf_reader']}]}
  const make=(binding)=>{const plan=derive(spec);plan.bindings=[binding];return plan}
  const good=make({tool:'pdf_reader',state:'connected',requires_approval:false})
  bindLegacyDesktopMaterial(good,spec)
  assert.equal(good.requirements.find(r=>r.id==='material_text').state,'connected')
  assert.deepEqual(Array.from(good.input_contract.required),['instruction'])
  for(const binding of [{tool:'pdf_reader',state:'configuration_required',requires_approval:false},{tool:'pdf_reader',state:'connected',requires_approval:true}]){
    const blocked=make(binding);bindLegacyDesktopMaterial(blocked,spec)
    assert.equal(blocked.requirements.find(r=>r.id==='material_text').state,'configuration_required')
  }
  const explicit=make({tool:'pdf_reader',state:'connected',requires_approval:false})
  bindLegacyDesktopMaterial(explicit,{...spec,research_capability_requirements:['material_text']})
  assert.equal(explicit.requirements.find(r=>r.id==='material_text').state,'configuration_required')
})
