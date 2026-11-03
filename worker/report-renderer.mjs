import fs from 'node:fs'
import {createHash} from 'node:crypto'
import {Document,Packer,Paragraph,TextRun,HeadingLevel,Footer,PageNumber,AlignmentType} from 'docx'
import ExcelJS from 'exceljs'
import {PDFDocument,rgb} from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'

export const OFFICE_FORMATS={docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',pdf:'application/pdf',xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}
const MAX_BYTES=12582912
function fail(code){const e=new Error(code);e.code=code;throw e}
const digest=value=>createHash('sha256').update(value).digest('hex')
function fontFile(){
  const candidates=process.env.AGENT_STUDIO_REPORT_FONT?[process.env.AGENT_STUDIO_REPORT_FONT]:[
    'C:/Windows/Fonts/msyh.ttc','/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc','/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc','/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf']
  for(const file of candidates){try{const s=fs.statSync(file);if(s.isFile()&&s.size>0&&s.size<=33554432)return file}catch{}}
  fail('report_pdf_font_missing')
}
function paragraphs(text){return text.split(/\r\n?|\n/).map((text,i)=>({text:text.replace(/\t/g,'    '),title:i===0,heading:i>0&&/^(对象及固定版本事实|关系专题|证据定位|事实集：|事实集哈希：|数据空间：|问题记录质量：|关系记录质量：|快照时间：)/.test(text)}))}
async function docx(input){
  const blocks=paragraphs(input.document.text)
  const doc=new Document({creator:'Agent Studio',title:input.snapshot.payload.case.title,description:'Frozen fact set '+input.snapshot.fact_set_id,
    styles:{default:{document:{run:{font:{ascii:'Calibri',hAnsi:'Calibri',eastAsia:'Microsoft YaHei'},size:22,color:'111111'},paragraph:{spacing:{after:100,line:288},widowControl:true}}},
      paragraphStyles:[{id:'Title',name:'Title',basedOn:'Normal',next:'Normal',run:{size:36,bold:true,color:'000000'},paragraph:{spacing:{after:180},keepNext:true}}]},
    sections:[{properties:{page:{size:{width:12240,height:15840},margin:{top:1008,bottom:1008,left:1008,right:1008}}},footers:{default:new Footer({children:[new Paragraph({alignment:AlignmentType.RIGHT,children:[new TextRun({text:'Agent Studio  ',size:18}),new TextRun({children:[PageNumber.CURRENT],size:18})]})]})},
      children:blocks.map(p=>new Paragraph({...(p.title?{style:'Title'}:p.heading?{heading:HeadingLevel.HEADING_2}:{}),keepNext:p.title||p.heading,children:[new TextRun({text:p.text,bold:p.title,color:'111111'})]}))}]})
  return {bytes:Buffer.from(await Packer.toBuffer(doc)),details:{page_size:'Letter',layout:'flowing_paragraphs',text_embedded:true}}
}
async function pdf(input){
  const path=fontFile(),raw=fs.readFileSync(path),collection=fontkit.create(raw),selected=collection.fonts?collection.fonts.find(f=>/MicrosoftYaHei|NotoSansCJKsc/i.test(f.postscriptName))||collection.fonts[0]:collection
  const doc=await PDFDocument.create();doc.registerFontkit({create:()=>selected})
  const embedded=await doc.embedFont(raw,{subset:true}),points=new Set(Array.from(input.document.text).map(c=>c.codePointAt(0)))
  for(const point of points)if(point>32&&!selected.hasGlyphForCodePoint(point))fail('report_pdf_glyph_missing')
  // RTL layout requires a separate reviewed shaping/bidi adapter. Do not emit
  // apparently successful but reversed source text.
  if(/[\u0590-\u08ff\u202a-\u202e\u2066-\u2069]/u.test(input.document.text))fail('report_pdf_text_direction_unsupported')
  doc.setTitle(input.snapshot.payload.case.title);doc.setAuthor('Agent Studio');doc.setSubject('Frozen fact set '+input.snapshot.fact_set_id)
  const when=new Date(input.snapshot.payload.created_ms);doc.setCreationDate(when);doc.setModificationDate(when)
  const W=612,H=792,M=48,width=W-2*M,cache=new Map();let page,y,totalLines=0
  function fresh(){if(doc.getPageCount()>=1000)fail('report_pdf_page_limit');page=doc.addPage([W,H]);y=H-M}
  function glyphWidth(c,size){const key=size+':'+c;if(!cache.has(key))cache.set(key,embedded.widthOfTextAtSize(c,size));return cache.get(key)}
  function lines(text,size){const output=[];let line='',used=0
    for(const c of Array.from(text)){const w=glyphWidth(c,size);if(line&&used+w>width){const split=line.lastIndexOf(' ');if(split>Math.floor(line.length/2)){output.push(line.slice(0,split));line=line.slice(split+1);used=Array.from(line).reduce((n,ch)=>n+glyphWidth(ch,size),0)}else{output.push(line);line='';used=0}}
      line+=c;used+=w
    }output.push(line);return output
  }
  fresh()
  const blocks=[];let block=[]
  for(const p of paragraphs(input.document.text)){if(!p.text){if(block.length)blocks.push(block);block=[]}else block.push(p)}
  if(block.length)blocks.push(block)
  for(const group of blocks){
    const prepared=group.map(p=>{const size=p.title?18:p.heading?11:10;return {...p,size,lineHeight:size*1.5,wrapped:lines(p.text,size)}})
    const height=prepared.reduce((n,p)=>n+p.wrapped.length*p.lineHeight+(p.title||p.heading?5:0),0)
    // Keep short fact/citation blocks together, including their source locator.
    // Long original quotes continue naturally rather than shrinking the font.
    if(height<=H-2*M&&height>y-M)fresh()
    for(const p of prepared){
      if((p.title||p.heading)&&y-M<p.lineHeight*3)fresh()
      for(const line of p.wrapped){if(++totalLines>50000)fail('report_pdf_line_limit');if(y-p.lineHeight<M)fresh();y-=p.lineHeight;page.drawText(line,{x:M,y,size:p.size,font:embedded,color:rgb(.07,.07,.07)})}
      if(p.title||p.heading)y-=5
    }
    y-=6
  }
  const pages=doc.getPages();pages.forEach((p,i)=>p.drawText(`${i+1} / ${pages.length}`,{x:W-M-50,y:27,size:8,font:embedded,color:rgb(.35,.35,.35)}))
  return {bytes:Buffer.from(await doc.save()),details:{page_size:'Letter',pages:pages.length,font_family:selected.familyName,font_sha256:digest(raw),font_embedded:true,layout:'horizontal_ltr'}}
}
function chunks(text,max=900){const chars=Array.from(String(text)),result=[];let part='';for(const c of chars){if((part+c).length>max){result.push(part);part=''}part+=c}result.push(part);return result}
function excerpt(text,max,label){return text.length>max?chunks(text,max)[0]+'… ['+label+']':text}
function readable(record){return record.payload.canonical_name||record.payload.question_id||record.payload.predicate||record.payload.description||record.schema_id}
async function xlsx(input){
  const book=new ExcelJS.Workbook(),p=input.snapshot.payload,brief=input.template_id==='research.brief.v1';book.creator='Agent Studio';book.created=new Date(p.created_ms);book.modified=new Date(p.created_ms)
  function sheet(name,widths,headers){const s=book.addWorksheet(name,{views:[{state:'frozen',ySplit:7,showGridLines:false}],pageSetup:{paperSize:1,orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:0}})
    s.columns=widths.map(width=>({width}));s.addRow([p.case.title]);s.mergeCells(1,1,1,widths.length);s.getRow(1).font={name:'Microsoft YaHei',size:16,bold:true};s.getRow(1).height=32
    s.getRow(1).alignment={vertical:'middle',wrapText:true};s.getRow(1).height=Math.max(32,Math.ceil(Array.from(p.case.title).length*2/widths.reduce((a,b)=>a+b,0))*24)
    s.addRow(['事实集',input.snapshot.fact_set_id]);s.addRow(['事实集哈希',input.snapshot.content_hash]);s.addRow(['数据空间',p.case.data_space]);s.addRow(['快照时间',new Date(p.created_ms).toISOString()]);s.addRow([input.template_id==='research.relationships.v1'?'关系记录质量':'问题记录质量',(input.template_id==='research.relationships.v1'?p.relation_quality?.business_quality||'unverified':p.quality.business_quality)+'；自由文本报告未验证'])
    for(let n=2;n<=6;n++){s.mergeCells(n,2,n,widths.length);s.getRow(n).font={name:'Microsoft YaHei',size:10};s.getRow(n).alignment={vertical:'middle',wrapText:true};s.getRow(n).height=24}
    s.addRow(headers);s.getRow(7).font={bold:true,name:'Microsoft YaHei',color:{argb:'FFFFFFFF'},size:10};s.getRow(7).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF245071'}};s.getRow(7).height=30
    s.getRow(7).alignment={vertical:'middle',horizontal:'center',wrapText:true}
    s.autoFilter={from:{row:7,column:1},to:{row:7,column:headers.length}};s.pageSetup.printTitlesRow='7:7';return s
  }
  function logical(s,values){
    const cells=values.map((v,i)=>typeof v==='string'?chunks(v,Math.max(60,Math.floor((s.getColumn(i+1).width-2)*10))):[v]),count=Math.max(...cells.map(c=>c.length))
    for(let n=0;n<count;n++)add(s,cells.map(c=>c.length===1?c[0]:c[n]??''))
  }
  function add(s,values){if(s.rowCount>15000)fail('report_xlsx_row_limit');const row=s.addRow(values);row.font={name:'Microsoft YaHei',size:10};row.alignment={vertical:'top',wrapText:true};row.height=Math.min(400,Math.max(30,...values.map((v,i)=>{const width=s.getColumn(i+1).width||14;return String(v??'').split('\n').reduce((n,line)=>n+Math.max(1,Math.ceil(Array.from(line).reduce((a,c)=>a+(c.codePointAt(0)>255?2:1),0)/Math.max(6,width-2))),0)*15+10})))
    if(row.number%2===0)row.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFF3F6F8'}}
  }
  const qsheet=sheet('问题与答案',[24,17,60,18,18,24,30],['问题','状态','答案及续行','记录 ID','版本','截至','缺口'])
  for(const q of p.case.questions){const matches=p.records.filter(r=>r.schema_id==='research.answer.v1'&&r.payload.question_id===q.question_id)
    if(matches.length!==1){logical(qsheet,[q.question,matches.length?'需复核':'未知','尚无唯一正式答案','','','','']);continue}
    const r=matches[0],text=brief?excerpt(r.payload.answer,1200,'摘要节选'):r.payload.answer
    logical(qsheet,[q.question,r.payload.status,text,r.record_id,r.version,r.payload.as_of,r.payload.missing.join('；')])
  }
  const facts=sheet('事实与关系',[15,20,9,13,30,80],['记录类型','记录 ID','版本','版本角色','名称或事实','固定版本字段 JSON'])
  for(const r of p.records.concat(p.reference_records||[])){const current=p.records.some(v=>v.record_id===r.record_id&&v.version===r.version);logical(facts,[r.schema_id,r.record_id,r.version,current?'当前':'历史引用',String(readable(r)),JSON.stringify(r.payload)])}
  const evidence=sheet('证据定位',[20,20,25,15,15,12,75],['材料或 Run','结果或片段','原文字符范围 UTF16','引用记录','记录版本','引文分段','原文引文'])
  const seen=new Set();for(const r of p.records.concat(p.reference_records||[]))for(const ref of r.source_refs){const key=JSON.stringify([r.record_id,r.version,ref.material_id||'',ref.segment_id||'',ref.run_id||'',ref.result_id||'',ref.start,ref.end,ref.quote]);if(seen.has(key))continue;seen.add(key)
    const quote=brief?excerpt(ref.quote,300,'引文节选'):ref.quote,parts=chunks(quote,700)
    parts.forEach((part,i)=>logical(evidence,[ref.material_id||ref.run_id,ref.segment_id||ref.result_id,`${ref.start}:${ref.end}`,r.record_id,r.version,`${i+1}/${parts.length}`,part]))
  }
  if(!seen.size)add(evidence,['未声明','','','','','','没有已锚定的证据，不得作为已验证研究结论。'])
  return {bytes:Buffer.from(await book.xlsx.writeBuffer()),details:{sheets:book.worksheets.map(s=>s.name),formula_count:0,external_links:0,long_text:'explicit_continuation_rows',sheet_text_role:'frozen_values'}}
}
export async function renderReport(input){
  if(!input||!Object.hasOwn(OFFICE_FORMATS,input.format)||!input.snapshot?.payload||typeof input.document?.text!=='string'||input.document.text.length>2000000)fail('invalid_report_input')
  if(!/^[a-f0-9]{64}$/.test(input.snapshot.content_hash)||!/^research\.(brief|full|relationships)\.v1$/.test(input.template_id))fail('invalid_report_input')
  if(digest(input.document.text)!==input.document_hash)fail('report_content_model_changed')
  if(/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(input.document.text))fail('report_control_character')
  function check(value){if(typeof value==='string'){if(!value.isWellFormed())fail('report_unicode_invalid');if(/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value))fail('report_control_character')}else if(value&&typeof value==='object')Object.values(value).forEach(check)}
  check(input.snapshot.payload)
  const rendered=await ({docx,pdf,xlsx}[input.format])(input)
  if(!rendered.bytes.length||rendered.bytes.length>MAX_BYTES)fail('report_binary_size_limit')
  return {base64:rendered.bytes.toString('base64'),byte_count:rendered.bytes.length,binary_sha256:digest(rendered.bytes),mime_type:OFFICE_FORMATS[input.format],renderer:'studio.research-office.v1',details:rendered.details}
}
