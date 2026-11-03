// Pure document extraction, executed in a bounded child process. No database,
// employee credentials, external URL fetches, macros, formulas or scripts.
import {createHash} from 'node:crypto'
import JSZip from 'jszip'

const MAX_BYTES=4*1024*1024,MAX_TEXT=200000,MAX_SEGMENTS=20000
function fail(code){const error=new Error(code);error.code=code;throw error}
export function decodeMaterial(input){
  if(typeof input?.base64!=='string'||!input.base64||input.base64.length>Math.ceil(MAX_BYTES/3)*4||input.base64.length%4||!/^[A-Za-z0-9+/]+={0,2}$/.test(input.base64))fail('invalid_material_base64')
  const bytes=Buffer.from(input.base64,'base64')
  if(!bytes.length||bytes.length>MAX_BYTES||bytes.toString('base64')!==input.base64)fail('invalid_material_base64')
  return bytes
}
async function inspectZip(bytes,required){
  const zip=await JSZip.loadAsync(bytes,{checkCRC32:false,createFolders:false})
  const entries=Object.values(zip.files)
  if(entries.length>1500||required.some(name=>!zip.file(name)))fail('invalid_material_zip')
  let total=0
  for(const entry of entries){
    if(entry.dir)continue
    const size=Number(entry._data?.uncompressedSize)
    if(!Number.isSafeInteger(size)||size<0||size>32*1024*1024)fail('material_zip_expansion_limit')
    total+=size;if(total>32*1024*1024)fail('material_zip_expansion_limit')
  }
}
export async function parseMaterial(input){
  const bytes=decodeMaterial(input),filename=input.filename
  if(typeof filename!=='string'||filename.length>160||!filename.trim()||/[/\\\x00-\x1f\x7f]/.test(filename))fail('invalid_material_filename')
  const kind=/\.pdf$/i.test(filename)?'pdf':/\.xlsx$/i.test(filename)?'xlsx':/\.docx$/i.test(filename)?'docx':/\.(txt|md|csv|tsv)$/i.test(filename)?'text':null
  if(!kind)fail('material_format_not_supported')
  const segments=[],omissions=[]
  const coverage={parser:'studio.material-text.v1',format:kind,ocr_performed:false,source_completeness:'not_claimed',omissions,formulas_recalculated:false,external_links_followed:false}
  let characters=0
  function add(id,text,locator){
    if(characters+text.length>MAX_TEXT||segments.length>=MAX_SEGMENTS){omissions.push({locator,reason:'extraction_budget_exhausted'});return false}
    characters+=text.length;segments.push({segment_id:id,text,locator});return true
  }
  if(kind==='pdf'){
    if(bytes.subarray(0,5).toString('ascii')!=='%PDF-')fail('invalid_pdf_header')
    const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs')
    const task=pdfjs.getDocument({data:new Uint8Array(bytes),useSystemFonts:false,useWorkerFetch:false,disableAutoFetch:true,disableStream:true,stopAtErrors:true,isEvalSupported:false})
    try{
      const pdf=await task.promise
      if(pdf.numPages>100)fail('material_pdf_page_limit')
      coverage.pages_total=pdf.numPages;coverage.pages_read=[];coverage.basis='embedded_text_only';coverage.visual_content_unverified=true
      for(let n=1;n<=pdf.numPages;n++){
        const page=await pdf.getPage(n),content=await page.getTextContent()
        if(content.items.length>20000)fail('material_pdf_page_complexity_limit')
        const text=content.items.map(item=>'str' in item?String(item.str||''):'').filter(Boolean).join(' ').trim()
        if(!text)omissions.push({locator:{page:n},reason:'no_extractable_text_ocr_or_blank'})
        else if(add('page:'+n,text,{page:n,offset_unit:'utf16_code_unit'}))coverage.pages_read.push(n)
        page.cleanup()
      }
    }finally{await task.destroy().catch(()=>{})}
  }else if(kind==='xlsx'){
    await inspectZip(bytes,['[Content_Types].xml','xl/workbook.xml'])
    const {default:ExcelJS}=await import('exceljs'),book=new ExcelJS.Workbook()
    await book.xlsx.load(bytes)
    if(book.worksheets.length>40)fail('material_sheet_limit')
    coverage.sheets=[]
    for(let i=0;i<book.worksheets.length;i++){
      const sheet=book.worksheets[i],meta={index:i+1,name:sheet.name,row_count:sheet.rowCount,column_count:sheet.columnCount,read_cells:0,formula_cells:[],hidden:sheet.state!=='visible'}
      coverage.sheets.push(meta)
      if(sheet.rowCount>20000||sheet.columnCount>512){omissions.push({locator:{sheet_index:i+1,sheet:sheet.name},reason:'sheet_dimension_limit'});continue}
      sheet.eachRow({includeEmpty:false},row=>row.eachCell({includeEmpty:false},cell=>{
        let text='',cached=false
        const value=cell.value
        if(value&&typeof value==='object'&&('formula' in value||'sharedFormula' in value)){
          meta.formula_cells.push(cell.address)
          if(value.result===undefined||value.result===null){omissions.push({locator:{sheet_index:i+1,sheet:sheet.name,cell:cell.address},reason:'formula_has_no_cached_result'});return}
          text=String(value.result);cached=true
        }else if(value instanceof Date)text=value.toISOString()
        else text=String(cell.text??'')
        if(!text)return
        if(add(`sheet:${i+1}:cell:${cell.address}`,text,{sheet_index:i+1,sheet:sheet.name,cell:cell.address,formula_cached_result:cached,offset_unit:'utf16_code_unit'}))meta.read_cells++
      }))
    }
  }else if(kind==='docx'){
    await inspectZip(bytes,['[Content_Types].xml','word/document.xml'])
    const mammoth=await import('mammoth'),result=await mammoth.extractRawText({buffer:bytes})
    coverage.basis='body_text_only';coverage.page_locations_available=false
    coverage.warnings=result.messages.map(item=>String(item.message).slice(0,500)).slice(0,30)
    const text=String(result.value||'').replace(/\r\n?/g,'\n')
    if(!text.trim())omissions.push({locator:{document:true},reason:'no_extractable_text'})
    for(let start=0,index=1;start<text.length;start+=8000,index++)add('block:'+index,text.slice(start,start+8000),{character_start:start,offset_unit:'utf16_code_unit'})
  }else{
    const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes).replace(/\r\n?/g,'\n')
    coverage.basis='utf8_text'
    for(let start=0,index=1;start<text.length;start+=8000,index++)add('block:'+index,text.slice(start,start+8000),{character_start:start,offset_unit:'utf16_code_unit'})
  }
  coverage.text_characters=characters;coverage.segment_count=segments.length;coverage.extraction_complete=omissions.length===0
  return {schema_id:'studio.material_parse.v1',binary_sha256:createHash('sha256').update(bytes).digest('hex'),storage_hash:createHash('sha256').update(input.base64).digest('hex'),segments,coverage}
}
