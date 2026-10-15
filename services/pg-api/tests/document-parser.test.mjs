import test from "node:test"
import assert from "node:assert/strict"
import {PDFDocument,StandardFonts} from "pdf-lib"
import JSZip from "jszip"
import {parseUploadedDocument,strictBase64Document}
  from "../src/document-parser.ts"

export async function syntheticPdf(text="Agent Studio document PDF evidence") {
  const pdf=await PDFDocument.create()
  const page=pdf.addPage([400,300])
  const font=await pdf.embedFont(StandardFonts.Helvetica)
  page.drawText(text,{x:40,y:240,font,size:14})
  return Buffer.from(await pdf.save())
}
export async function syntheticDocx(text="Agent Studio DOCX evidence") {
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
    '<w:body><w:p><w:r><w:t>'+text+'</w:t></w:r></w:p></w:body></w:document>')
  return zip.generateAsync({type:"nodebuffer",compression:"DEFLATE"})
}

test("standalone server extracts real PDF text with page citation",async()=>{
  const bytes=await syntheticPdf()
  const parsed=await parseUploadedDocument({
    filename:"internal.pdf",content_base64:bytes.toString("base64"),
  })
  assert.equal(parsed.mime_type,"application/pdf")
  assert.match(parsed.text,/Agent Studio document PDF evidence/)
  assert.match(parsed.text,/PDF 第1页/)
  assert.ok(parsed.text.length<12000)
})
test("standalone server extracts real DOCX text, not markup",async()=>{
  const bytes=await syntheticDocx()
  const parsed=await parseUploadedDocument({
    filename:"internal.docx",content_base64:bytes.toString("base64"),
  })
  assert.equal(parsed.mime_type,"application/vnd.openxmlformats-officedocument.wordprocessingml.document")
  assert.match(parsed.text,/Agent Studio DOCX evidence/)
  assert.doesNotMatch(parsed.text,/<w:document|<w:t>/)
})
test("binary source enforces strict magic, size, format and input whitelist",async()=>{
  const pdf=await syntheticPdf()
  await assert.rejects(parseUploadedDocument({
    filename:"internal.pdf",content_base64:pdf.toString("base64"),object_key:"private",
  }),error=>error.code==="unknown_request_field")
  await assert.rejects(parseUploadedDocument({
    filename:"../../secrets.pdf",content_base64:pdf.toString("base64"),
  }),error=>error.code==="invalid_document_filename")
  await assert.rejects(parseUploadedDocument({
    filename:"file.exe",content_base64:pdf.toString("base64"),
  }),error=>error.code==="unsupported_document_format")
  await assert.rejects(parseUploadedDocument({
    filename:"bad.pdf",content_base64:Buffer.from("not PDF").toString("base64"),
  }),error=>error.code==="invalid_pdf_header")
  await assert.rejects(parseUploadedDocument({
    filename:"bad.docx",content_base64:Buffer.from("not DOCX").toString("base64"),
  }),error=>error.code==="invalid_docx_header")
  assert.throws(()=>strictBase64Document("YQ== "),error=>error.code==="invalid_document_base64")
  assert.throws(()=>strictBase64Document("Zm9v===="),error=>error.code==="invalid_document_base64")
  assert.throws(()=>strictBase64Document(Buffer.alloc(540_000).toString("base64")),
    error=>error.code==="invalid_document_base64")
})
test("empty scanned PDF has no OCR text, empty DOCX must fail closed",async()=>{
  const empty=await PDFDocument.create()
  empty.addPage([300,300])
  await assert.rejects(parseUploadedDocument({
    filename:"scan.pdf",content_base64:Buffer.from(await empty.save()).toString("base64"),
  }),error=>error.code==="no_extractable_text_ocr_required")
  const docx=await syntheticDocx("")
  await assert.rejects(parseUploadedDocument({
    filename:"empty.docx",content_base64:docx.toString("base64"),
  }),error=>error.code==="no_extractable_text_ocr_required")
})
test("DOCX expansion limit rejects excessively large uncompressed XML",async()=>{
  const zip=new JSZip()
  zip.file("[Content_Types].xml",'<Types/>')
  zip.file("_rels/.rels",'<Relationships/>')
  zip.file("word/document.xml","z".repeat(4_200_000))
  const bytes=await zip.generateAsync({type:"nodebuffer",compression:"DEFLATE"})
  assert.ok(bytes.length<512*1024)
  await assert.rejects(parseUploadedDocument({
    filename:"bomb.docx",content_base64:bytes.toString("base64"),
  }),error=>error.code==="docx_expansion_limit")
})
