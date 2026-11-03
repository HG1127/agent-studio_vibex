import {createRequire} from 'node:module'
import ExcelJS from 'exceljs'
const require=createRequire(new URL('../../services/pg-api/package.json',import.meta.url))
const {PDFDocument,StandardFonts}=require('pdf-lib')
export async function pdfFixture(){
  const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Helvetica)
  pdf.addPage([500,500]).drawText('TEXT_PDF_EVIDENCE',{x:40,y:400,font,size:12})
  // Real image-only page, deliberately no text layer; no OCR-quality claim.
  const png=await pdf.embedPng(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64'))
  pdf.addPage([500,500]).drawImage(png,{x:10,y:10,width:100,height:100})
  return Buffer.from(await pdf.save())
}
export async function xlsxFixture(){
  const book=new ExcelJS.Workbook(),sheet=book.addWorksheet('People List')
  sheet.addRow(['Name','Count','Uncached formula'])
  sheet.addRow(['XLSX_PERSON_EVIDENCE',0,{formula:'1+2'}])
  sheet.getCell('D2').value={formula:'2+3',result:5}
  return Buffer.from(await book.xlsx.writeBuffer())
}
