import { parentPort, workerData } from 'node:worker_threads'
import ExcelJS from 'exceljs'
import { Document, Paragraph, Table, TableCell, TableRow, TextRun, Packer, HeadingLevel, WidthType } from 'docx'
import { summarize } from './office-table.mjs'

async function build() {
  const { bytes, input, action } = workerData
  const summary = await summarize(bytes, input)
  if (action === 'summary') return { summary }
  if (summary.source_sha256 !== input.expected_sha256) throw Error('office_source_changed')
  const book = new ExcelJS.Workbook()
  book.creator = 'Agent Studio'; book.calcProperties.fullCalcOnLoad = true
  const ws = book.addWorksheet('汇总', { views: [{ state: 'frozen', ySplit: 4 }] })
  ws.columns = [{ width: 32 }, { width: 14 }, { width: 22 }]
  ws.mergeCells('A1:C1'); ws.getCell('A1').value = input.title
  ws.getCell('A1').font = { size: 18, bold: true, color: { argb: 'FF172554' } }; ws.getRow(1).height = 32
  ws.mergeCells('A2:C2'); ws.getCell('A2').value = '统计标签：' + input.period + '（全表汇总，未按日期筛选）'
  ws.addRow(['来源', input.source_path, summary.sheet])
  ws.addRow([summary.group_by, '记录数', summary.amount_column])
  for (const group of summary.groups) ws.addRow([group.group, group.row_count, Number(group.total)])
  const last = 5 + summary.groups.length
  ws.addRow(['合计', { formula: `SUM(B5:B${last - 1})`, result: summary.row_count },
    { formula: `SUM(C5:C${last - 1})`, result: Number(summary.total) }])
  for (const r of [4, last]) {
    ws.getRow(r).font = { bold: true, color: { argb: 'FFFFFFFF' } }
    ws.getRow(r).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } }
  }
  const format = summary.decimal_places ? '#,##0.' + '0'.repeat(summary.decimal_places) : '#,##0'
  for (let row = 5; row <= last; row++) ws.getCell(row, 3).numFmt = format
  ws.autoFilter = { from: 'A4', to: `C${last - 1}` }
  ws.addRow([]); ws.addRow(['源文件 SHA256', summary.source_sha256]); ws.addRow(['口径', summary.calculation])
  ws.pageSetup = { orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0 }
  const paragraph = (text, options = {}) => new Paragraph({ spacing: { after: 160 }, children: [new TextRun(text)], ...options })
  const tableRow = (values, header = false) => new TableRow({ tableHeader: header,
    children: values.map(text => new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: String(text), bold: header })] })] })) })
  const doc = new Document({ creator: 'Agent Studio', title: input.title,
    styles: { default: { document: { run: { font: 'Microsoft YaHei', size: 22, color: '111827' }, paragraph: { spacing: { line: 300 } } } } },
    sections: [{ properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 } } }, children: [
      paragraph(input.title, { heading: HeadingLevel.TITLE }),
      paragraph('统计标签 ' + input.period),
      paragraph(`本报告依据 ${input.source_path}${summary.sheet ? ' 的“' + summary.sheet + '”工作表' : ''}，对全部 ${summary.row_count} 条有效记录按“${summary.group_by}”分组，汇总“${summary.amount_column}”合计 ${summary.total}。统计标签仅用于标识报告，不自动筛选日期。`),
      paragraph('分组汇总', { heading: HeadingLevel.HEADING_1 }),
      new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [
        tableRow([summary.group_by, '记录数', summary.amount_column], true),
        ...summary.groups.map(g => tableRow([g.group, g.row_count, g.total])), tableRow(['合计', summary.row_count, summary.total], true) ] }),
      paragraph('数据来源与核对', { heading: HeadingLevel.HEADING_1 }),
      paragraph(summary.calculation), paragraph('源文件 SHA256 ' + summary.source_sha256),
      ...(input.notes ? [paragraph('补充说明', { heading: HeadingLevel.HEADING_1 }), paragraph(input.notes)] : []),
    ] }] })
  return { summary, workbook: await book.xlsx.writeBuffer(), document: await Packer.toBuffer(doc) }
}
try { parentPort.postMessage({ ok: true, value: await build() }) }
catch (error) { parentPort.postMessage({ ok: false, error: /^office_[a-z_]+$/.test(error.message) ? error.message : 'office_parse_failed' }) }
