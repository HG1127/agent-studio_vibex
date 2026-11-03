import test from 'node:test'
import assert from 'node:assert/strict'
import {parseMaterial,decodeMaterial} from '../worker/material-parser.mjs'
import {pdfFixture,xlsxFixture} from './helpers/material-fixtures.mjs'

test('real PDF pages preserve text location and explicitly omit image-only page without OCR',async()=>{
  const bytes=await pdfFixture(),parsed=await parseMaterial({filename:'source.pdf',base64:bytes.toString('base64')})
  assert.equal(parsed.segments[0].segment_id,'page:1')
  assert.match(parsed.segments[0].text,/TEXT_PDF_EVIDENCE/)
  assert.equal(parsed.segments[0].locator.page,1)
  assert.deepEqual(parsed.coverage.pages_read,[1])
  assert.equal(parsed.coverage.pages_total,2);assert.equal(parsed.coverage.ocr_performed,false)
  assert.equal(parsed.coverage.extraction_complete,false)
  assert.ok(parsed.coverage.omissions.some(item=>item.locator.page===2&&item.reason==='no_extractable_text_ocr_or_blank'))
  assert.equal(parsed.coverage.visual_content_unverified,true)
})

test('real XLSX retains cell coordinates, zeroes and cached formula provenance, without recalculation',async()=>{
  const bytes=await xlsxFixture(),parsed=await parseMaterial({filename:'people.xlsx',base64:bytes.toString('base64')})
  const person=parsed.segments.find(item=>item.locator.cell==='A2')
  assert.equal(person.text,'XLSX_PERSON_EVIDENCE');assert.equal(person.locator.sheet,'People List')
  assert.equal(parsed.segments.find(item=>item.locator.cell==='B2').text,'0')
  assert.equal(parsed.segments.find(item=>item.locator.cell==='D2').text,'5')
  assert.equal(parsed.segments.find(item=>item.locator.cell==='D2').locator.formula_cached_result,true)
  assert.ok(parsed.coverage.omissions.some(item=>item.locator.cell==='C2'&&item.reason==='formula_has_no_cached_result'))
  assert.equal(parsed.coverage.formulas_recalculated,false);assert.equal(parsed.coverage.external_links_followed,false)
})

test('strict byte transport rejects noncanonical base64, unsupported types and bad magic',async()=>{
  assert.throws(()=>decodeMaterial({base64:'YR=='}),{code:'invalid_material_base64'})
  assert.throws(()=>decodeMaterial({base64:'YQ== '}),{code:'invalid_material_base64'})
  await assert.rejects(parseMaterial({filename:'bad.pdf',base64:Buffer.from('not pdf').toString('base64')}),{code:'invalid_pdf_header'})
  await assert.rejects(parseMaterial({filename:'../../file.md',base64:Buffer.from('text').toString('base64')}),{code:'invalid_material_filename'})
})
