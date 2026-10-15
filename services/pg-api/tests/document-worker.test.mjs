// Real child-process parser regression. All binary documents are generated
// in memory; no browser, Docker, external URL, PocketBase, or production data.
import test from "node:test"
import assert from "node:assert/strict"
import {setTimeout as sleep} from "node:timers/promises"
import {PDFDocument,StandardFonts} from "pdf-lib"
import JSZip from "jszip"
import {parseDocumentIsolated,parserProcessCount}
  from "../src/document-worker.ts"

async function pdfRequest() {
  const pdf=await PDFDocument.create()
  const page=pdf.addPage([400,300])
  const font=await pdf.embedFont(StandardFonts.Helvetica)
  page.drawText("Internal synthetic PDF token",{
    x:30,y:200,font,size:15,
  })
  return {filename:"synthetic.pdf",
    content_base64:Buffer.from(await pdf.save()).toString("base64")}
}
async function docxRequest() {
  const zip=new JSZip()
  zip.file("[Content_Types].xml",
    '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'+
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'+
    '<Default Extension="xml" ContentType="application/xml"/>'+
    '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>')
  zip.file("_rels/.rels",
    '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>')
  zip.file("word/document.xml",
    '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'+
    '<w:body><w:p><w:r><w:t>Private synthetic DOCX test</w:t></w:r></w:p></w:body></w:document>')
  return {filename:"synthetic.docx",
    content_base64:(await zip.generateAsync({
      type:"nodebuffer",compression:"DEFLATE"})).toString("base64")}
}
async function assertNoChildren(){
  for(let i=0;i<120;i++){
    if(parserProcessCount()===0)return
    await sleep(25)
  }
  assert.equal(parserProcessCount(),0,"every parser child must be reaped")
}
test("real PDF + DOCX extraction in separate bounded child processes",async()=>{
  const pdf=await parseDocumentIsolated(await pdfRequest())
  assert.match(pdf.text,/Internal synthetic PDF token/)
  assert.match(pdf.text,/PDF 第1页/)
  const docx=await parseDocumentIsolated(await docxRequest())
  assert.match(docx.text,/Private synthetic DOCX test/)
  await assertNoChildren()
})
test("parser subprocess propagates sanitized errors and no binary leaks",async()=>{
  await assert.rejects(parseDocumentIsolated({
    filename:"malformed.pdf",
    content_base64:Buffer.from("NOT_PDF").toString("base64"),
  }),error=>error.status===422&&error.code==="invalid_pdf_header")
  await assert.rejects(parseDocumentIsolated({
    filename:"private.docx",
    content_base64:Buffer.from("INVALID").toString("base64"),
  }),error=>error.status===422&&error.code==="invalid_docx_header")
  await assert.rejects(parseDocumentIsolated({filename:"broken.pdf",
    content_base64:"?".repeat(730000)}),error=>
    error.status===400&&error.code==="invalid_document_base64")
  await assertNoChildren()
})
test("child parser enforces timeout and releases worker slot",async()=>{
  const request=await pdfRequest()
  await assert.rejects(
    parseDocumentIsolated(request,1),
    error=>error.status===422&&error.code==="document_parse_timeout",
  )
  await assertNoChildren()
  // A timeout never disables later uploads.
  assert.match((await parseDocumentIsolated(request)).text,/synthetic PDF token/)
  await assertNoChildren()
})
test("excess concurrent parsers fail closed without spawning a third child",async()=>{
  const request=await pdfRequest()
  const a=parseDocumentIsolated(request)
  const b=parseDocumentIsolated(request)
  assert.equal(parserProcessCount(),2)
  await assert.rejects(
    parseDocumentIsolated(request),
    error=>error.status===429&&error.code==="document_parser_busy",
  )
  const [first,second]=await Promise.all([a,b])
  assert.equal(first.filename,"synthetic.pdf")
  assert.equal(second.filename,"synthetic.pdf")
  await assertNoChildren()
})
