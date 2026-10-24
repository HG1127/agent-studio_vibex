// Standalone PostgreSQL API pilot: tightly bounded PDF/DOCX TEXT extraction.
// Incoming bytes are never persisted; only capped extracted text is passed to
// the owner's PostgreSQL transaction. Scanned PDFs deliberately require OCR.
// No URL fetches, images, HTML execution, external object storage or model calls.
import {HttpError} from "./contracts.ts"
import JSZip from "jszip"

export interface ParsedDocument {
  filename:string
  text:string
  mime_type:"application/pdf"|
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
}
export const MAX_FILE_BYTES=512*1024
export const MAX_TEXT_CHARACTERS=12000
const MAX_PDF_PAGES=25
const MAX_ZIP_ENTRIES=200
const MAX_ZIP_UNCOMPRESSED=4*1024*1024

function invalid(code:string):never {throw new HttpError(422,code)}
function hasControl(value:string):boolean {
  return Array.from(value).some(char=>char.charCodeAt(0)<32 || char.charCodeAt(0)===127)
}
export function strictBase64Document(input:unknown):Uint8Array {
  if(typeof input!=="string" || !input ||
     input.length>Math.ceil(MAX_FILE_BYTES/3)*4+8 ||
     !/^[A-Za-z0-9+/]+={0,2}$/.test(input) ||
     input.length%4!==0)
    throw new HttpError(400,"invalid_document_base64")
  const bytes=Buffer.from(input,"base64")
  if(bytes.length===0 || bytes.length>MAX_FILE_BYTES ||
     bytes.toString("base64")!==input)
    throw new HttpError(400,"invalid_document_base64")
  return new Uint8Array(bytes)
}
function safeFilename(raw:unknown,maxLength=120):{filename:string;kind:"pdf"|"docx"} {
  if(typeof raw!=="string" || raw.length<5 || raw.length>maxLength ||
     raw.startsWith(".") || raw.trim()!==raw ||
     /[/\\]/.test(raw) || hasControl(raw))
    throw new HttpError(400,"invalid_document_filename")
  const extension=/\.pdf$/i.test(raw)?"pdf":/\.docx$/i.test(raw)?"docx":null
  if(!extension)throw new HttpError(400,"unsupported_document_format")
  return {filename:raw,kind:extension}
}
function boundedText(raw:string,maxCharacters=MAX_TEXT_CHARACTERS):string {
  const text=raw.replace(/\r\n?/g,"\n").trim()
  if(!text)invalid("no_extractable_text_ocr_required")
  if(Array.from(text).length>maxCharacters)
    invalid("extracted_text_too_long")
  return text
}
async function extractPdf(bytes:Uint8Array,maxCharacters:number):Promise<string> {
  if(Buffer.from(bytes.subarray(0,5)).toString("ascii")!=="%PDF-")
    invalid("invalid_pdf_header")
  let task:ReturnType<(typeof import("pdfjs-dist/legacy/build/pdf.mjs"))["getDocument"]>|null=null
  try {
    const pdfjs=await import("pdfjs-dist/legacy/build/pdf.mjs")
    task=pdfjs.getDocument({
      data:bytes,
      useSystemFonts:false,
      useWorkerFetch:false,
      disableAutoFetch:true,
      disableStream:true,
      stopAtErrors:true,
    })
    const pdf=await task.promise
    if(pdf.numPages<1 || pdf.numPages>MAX_PDF_PAGES)
      invalid("pdf_page_limit")
    const pages:string[]=[]
    let total=0
    for(let n=1;n<=pdf.numPages;n++){
      const page=await pdf.getPage(n)
      const content=await page.getTextContent()
      if(content.items.length>12000)invalid("pdf_page_complexity_limit")
      const text=content.items.map(item=>"str" in item?String(item.str||""):"")
        .filter(Boolean).join(" ").trim()
      if(text){
        const block="【PDF 第"+n+"页】\n"+text
        total+=Array.from(block).length
        if(total>maxCharacters)invalid("extracted_text_too_long")
        pages.push(block)
      }
      page.cleanup()
    }
    return boundedText(pages.join("\n\n"),maxCharacters)
  } catch(error) {
    if(error instanceof HttpError)throw error
    const msg=error instanceof Error?error.message:""
    if(/password|encrypted/i.test(msg))invalid("encrypted_pdf_not_supported")
    return invalid("pdf_text_extraction_failed")
  } finally {
    if(task)await task.destroy().catch(()=>undefined)
  }
}
async function extractDocx(bytes:Uint8Array,maxCharacters:number):Promise<string> {
  if(bytes[0]!==0x50 || bytes[1]!==0x4b ||
     ![3,5,7].includes(bytes[2]??0))
    invalid("invalid_docx_header")
  try {
    const zip=await JSZip.loadAsync(Buffer.from(bytes),{
      // Do NOT eagerly decompress all entries before validating expansion.
      checkCRC32:false,
      createFolders:false,
    })
    const entries=Object.values(zip.files)
    if(entries.length<3 || entries.length>MAX_ZIP_ENTRIES ||
       !zip.file("word/document.xml") ||
       !zip.file("[Content_Types].xml"))
      invalid("invalid_docx_structure")
    let totalUncompressed=0
    for(const entry of entries) {
      if(entry.dir)continue
      const declared=Number((entry as unknown as {
        _data?:{uncompressedSize?:number}
      })._data?.uncompressedSize)
      // Unknown or implausible declarations are rejected, not trusted.
      if(!Number.isSafeInteger(declared) || declared<0 ||
         declared>MAX_ZIP_UNCOMPRESSED)invalid("docx_expansion_limit")
      totalUncompressed+=declared
      if(totalUncompressed>MAX_ZIP_UNCOMPRESSED)
        invalid("docx_expansion_limit")
    }
    const mammoth=await import("mammoth")
    const parsed=await mammoth.extractRawText({buffer:Buffer.from(bytes)})
    return boundedText(parsed.value||"",maxCharacters)
  } catch(error){
    if(error instanceof HttpError)throw error
    invalid("docx_text_extraction_failed")
  }
}
export async function parseUploadedDocument(raw:unknown,profile:"pilot"|"employee"="pilot"):Promise<ParsedDocument> {
  if(profile!=="pilot"&&profile!=="employee")throw new HttpError(400,"invalid_parser_profile")
  if(!raw || typeof raw!=="object" || Array.isArray(raw))
    throw new HttpError(400,"invalid_document_request")
  const body=raw as Record<string,unknown>
  if(Object.keys(body).some(key=>!["filename","content_base64"].includes(key)))
    throw new HttpError(400,"unknown_request_field")
  const {filename,kind}=safeFilename(body.filename,profile==="employee"?180:120)
  const bytes=strictBase64Document(body.content_base64)
  const maxCharacters=profile==="employee"?160000:MAX_TEXT_CHARACTERS
  const text=kind==="pdf"?await extractPdf(bytes,maxCharacters):await extractDocx(bytes,maxCharacters)
  return {filename,text,mime_type:kind==="pdf"?"application/pdf":
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"}
}
