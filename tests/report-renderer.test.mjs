import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import fs from 'node:fs'
import mammoth from 'mammoth'
import ExcelJS from 'exceljs'
import JSZip from 'jszip'
import {renderReport} from '../worker/report-renderer.mjs'
import {reportFixture,reportInput,sha} from './fixtures/research-report.mjs'
test('office files preserve Chinese facts, identity, evidence and immutable fact-set metadata',async()=>{
  const input=reportFixture()
  const file=await renderReport(input),bytes=Buffer.from(file.base64,'base64')
  assert.equal(file.byte_count,bytes.length);assert.equal(file.binary_sha256,sha(bytes))
  const text=(await mammoth.extractRawText({buffer:bytes})).value
  for(const value of ['陈明','星河研究院','任期结束时间','事实集：'+input.snapshot.fact_set_id,'segment-1','UTF-16'])assert.ok(text.includes(value),value)
  const zip=await JSZip.loadAsync(bytes);assert.ok(zip.file('word/document.xml'));assert.equal(Object.keys(zip.files).some(k=>/vbaProject|embeddings/.test(k)),false)
  const workbook=new ExcelJS.Workbook(),xlsx=await renderReport({...input,format:'xlsx'});await workbook.xlsx.load(Buffer.from(xlsx.base64,'base64'))
  assert.deepEqual(workbook.worksheets.map(s=>s.name),['问题与答案','事实与关系','证据定位'])
  assert.equal(workbook.worksheets[0].getCell('B3').text,input.snapshot.content_hash)
  assert.equal(workbook.worksheets[0].getCell('A6').text,'问题记录质量')
  for(const sheet of workbook.worksheets)sheet.eachRow(row=>row.eachCell(cell=>assert.notEqual(cell.type,ExcelJS.ValueType.Formula)))
  const xzip=await JSZip.loadAsync(Buffer.from(xlsx.base64,'base64'));assert.equal(Object.keys(xzip.files).some(k=>/externalLinks|vbaProject/.test(k)),false)
  const pdf=await renderReport({...input,format:'pdf'}),pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs')
  const task=pdfjs.getDocument({data:new Uint8Array(Buffer.from(pdf.base64,'base64')),useSystemFonts:false,isEvalSupported:false})
  const parsed=await task.promise;let pdfText=''
  for(let n=1;n<=parsed.numPages;n++)pdfText+=(await (await parsed.getPage(n)).getTextContent()).items.map(v=>v.str).join('')
  await task.destroy()
  for(const value of ['陈明','星河研究院',input.snapshot.fact_set_id,'segment-1'])assert.ok(pdfText.includes(value),value)
  assert.equal(pdf.details.font_embedded,true)
})
test('XLSX long text uses bounded continuation rows without lost Unicode or formula injection',async()=>{
  const input=reportFixture(),p=input.snapshot.payload
  p.records[4].payload.answer='=HYPERLINK("https://invalid.test") '+('中文𠮷'.repeat(1500))+'终点标记'
  const file=await renderReport(reportInput(p,'research.full.v1','xlsx')),workbook=new ExcelJS.Workbook()
  await workbook.xlsx.load(Buffer.from(file.base64,'base64'));const sheet=workbook.worksheets[0],parts=[]
  sheet.eachRow((row,n)=>{if(n>=8){parts.push(row.getCell(3).text);assert.ok(row.height<=400);assert.notEqual(row.getCell(3).type,ExcelJS.ValueType.Formula)}})
  assert.equal(parts.join(''),p.records[4].payload.answer);assert.ok(parts.length>5)
})
test('renderer refuses altered models, unknown formats, missing fonts and unsupported glyphs',async()=>{
  await assert.rejects(()=>renderReport({...reportFixture(),document_hash:'0'.repeat(64)}),{code:'report_content_model_changed'})
  await assert.rejects(()=>renderReport({...reportFixture(),format:'exe'}),{code:'invalid_report_input'})
  const badUnicode=reportFixture();badUnicode.snapshot.payload.records[4].payload.answer='invalid \ud800'
  await assert.rejects(()=>renderReport(reportInput(badUnicode.snapshot.payload,'research.full.v1','docx')),{code:'report_unicode_invalid'})
  const missingGlyph=reportFixture();missingGlyph.snapshot.payload.records[4].payload.answer='unassigned '+String.fromCodePoint(0x10ffff)
  await assert.rejects(()=>renderReport(reportInput(missingGlyph.snapshot.payload,'research.full.v1','pdf')),{code:'report_pdf_glyph_missing'})
  const prior=process.env.AGENT_STUDIO_REPORT_FONT;process.env.AGENT_STUDIO_REPORT_FONT='Z:/not-a-real-font.ttf'
  try{await assert.rejects(()=>renderReport(reportFixture('research.brief.v1','pdf')),{code:'report_pdf_font_missing'})}finally{if(prior===undefined)delete process.env.AGENT_STUDIO_REPORT_FONT;else process.env.AGENT_STUDIO_REPORT_FONT=prior}
})
test('binary download decoding rejects malformed base64 and preserves arbitrary bytes',()=>{
  const module={exports:{}};vm.runInNewContext(fs.readFileSync(new URL('../pocketbase/pb_hooks/modules/report_jobs.js',import.meta.url),'utf8'),{module})
  const bytes=Buffer.from(Array.from({length:256},(_,n)=>n)),raw=bytes.toString('base64')
  assert.deepEqual(Buffer.from(module.exports.decode(raw)),bytes)
  for(const value of ['Zg=','Zh==','Zm9=','====','Zg==\n'])assert.throws(()=>module.exports.decode(value))
})
