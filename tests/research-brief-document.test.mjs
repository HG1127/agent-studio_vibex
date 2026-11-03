// Lightweight document-contract checks. No PB, parser, browser or PDF process.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import path from 'node:path'
import {pathToFileURL} from 'node:url'
const module={exports:{}}
vm.runInNewContext(fs.readFileSync(new URL('../pocketbase/pb_hooks/modules/business_artifacts.js',import.meta.url),'utf8'),{module})
const {renderText}=module.exports
const {reportFixture}=await import(pathToFileURL(path.join(process.cwd(),'tests/fixtures/research-report.mjs')).href)

test('compact brief preserves frozen IDs, quality boundary, question gaps and exact per-record evidence',()=>{
  const snapshot=reportFixture().snapshot
  const document=renderText(snapshot,'research.brief.v1')
  assert.ok(document.text.includes(snapshot.fact_set_id))
  assert.ok(document.text.includes(snapshot.content_hash))
  assert.ok(document.text.includes('DEMO'))
  assert.ok(document.text.includes('自由文本报告质量：未验证'))
  assert.ok(document.text.includes(snapshot.payload.quality.business_quality))
  assert.ok(document.text.includes(new Date(snapshot.payload.created_ms).toISOString()))
  for(const question of snapshot.payload.case.questions){
    assert.ok(document.text.includes(question.question));assert.ok(document.text.includes(question.question_id))
  }
  const refs=new Set()
  for(const record of snapshot.payload.records){
    if(record.schema_id==='research.answer.v1'){
      for(const value of [record.payload.answer,record.payload.status,record.payload.as_of,...record.payload.missing])assert.ok(document.text.includes(value))
    }
    for(const ref of record.source_refs){
      refs.add(JSON.stringify([ref.material_id||'',ref.segment_id||'',ref.run_id||'',ref.result_id||'',ref.start,ref.end,ref.quote]))
      assert.ok(document.text.includes(ref.quote));assert.ok(document.text.includes(record.record_id+' v'+record.version))
      assert.ok(document.text.includes('UTF-16 '+ref.start+':'+ref.end))
      for(const value of [ref.material_id,ref.segment_id,ref.run_id,ref.result_id].filter(Boolean))assert.ok(document.text.includes(value))
    }
  }
  assert.equal(document.source_count,refs.size)
  assert.equal(document.excerpted_fields.length,0)
})

test('brief preserves honest missing answers and labels any long excerpts instead of hiding truncation',()=>{
  const snapshot=reportFixture().snapshot
  const answer=snapshot.payload.records.find(r=>r.schema_id==='research.answer.v1')
  answer.payload.answer='Long synthetic answer. '.repeat(100)
  const ref=snapshot.payload.records.flatMap(r=>r.source_refs)[0]
  ref.quote='Long synthetic quote. '.repeat(100)
  const document=renderText(snapshot,'research.brief.v1')
  assert.ok(document.text.includes('摘要节选'))
  assert.ok(document.text.includes('引文节选'))
  assert.ok(document.excerpted_fields.includes(answer.record_id))
  assert.ok(document.text.includes(answer.payload.missing[0]))
  snapshot.payload.records=snapshot.payload.records.filter(r=>r!==answer)
  assert.ok(renderText(snapshot,'research.brief.v1').text.includes('未知：尚无正式答案。'))
})
