import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import ExcelJS from 'exceljs'
import JSZip from 'jszip'
import { createRuntime } from '../local-executor/runtime.mjs'
import { summarize, parseCsv, checkZip } from '../local-executor/office-table.mjs'
import { buildOfficeInstruction, officeTaskDefaults, officeRunHandoff, officeAgentSpec } from '../src/lib/localOfficeWorkflow.ts'

const source = '\uFEFF编号,部门,金额\r\nA001,销售,1200.10\r\nA002,运营,800.20\r\nA003,销售,99.90\r\nA004,运营,-50.20\r\nA005,研发,450.00\r\n'
const input = { root: 'work', source_path: 'ledger.csv', group_by: '部门', amount_column: '金额' }
test('exact decimal aggregation, negative adjustments and quoted CSV records', async () => {
  const result = await summarize(Buffer.from(source), input)
  assert.equal(result.row_count, 5); assert.equal(result.total, '2500.00')
  assert.deepEqual(result.groups, [{ group: '销售', row_count: 2, total: '1300.00' }, { group: '运营', row_count: 2, total: '750.00' }, { group: '研发', row_count: 1, total: '450.00' }])
  assert.deepEqual(parseCsv(Buffer.from('a,b\r\n"a,b","line1\n""line2"""')), [['a', 'b'], ['a,b', 'line1\n"line2"']])
  assert.equal((await summarize(Buffer.from('部门,金额\nA,0.10\nA,0.20'), input)).total, '0.30')
})
test('ambiguous, malformed and oversized inputs fail explicitly', async () => {
  for (const [text, error] of [['部门,金额\nA,1.001', 'office_invalid_amount'], ['部门,金额\nA,NaN', 'office_invalid_amount'],
    ['部门,金额\nA,1,2', 'office_inconsistent_columns'], ['部门,部门\nA,1', 'office_invalid_headers'], ['部门,金额\n,1', 'office_invalid_group'],
    ['部门,金额', 'office_empty_table'], ['部门,金额\nA,10000000000.01', 'office_table_limit']]) {
    await assert.rejects(() => summarize(Buffer.from(text), input), new RegExp(error))
  }
  assert.throws(() => parseCsv(Buffer.from('a,b\n"unterminated')), /invalid_csv/)
  assert.throws(() => parseCsv(Buffer.from([0xff])), /encoded data/)
  await assert.rejects(() => summarize(Buffer.from('部门,金额\n' + Array.from({ length: 51 }, (_, n) => '组' + n + ',1').join('\n')), input), /table_limit/)
  await assert.rejects(() => summarize(Buffer.from('部门,金额\n' + 'A,1\n'.repeat(5001)), input), /table_limit/)
})
test('XLSX rejects cached formulas, hidden rows, merged or ambiguous sheets, malformed archives', async () => {
  const book = new ExcelJS.Workbook(), sheet = book.addWorksheet('明细')
  sheet.addRows([['部门', '金额'], ['销售', { formula: '1+1', result: 2 }]])
  const excelInput = { ...input, source_path: 'ledger.xlsx' }
  await assert.rejects(async () => summarize(Buffer.from(await book.xlsx.writeBuffer()), excelInput), /formula_requires_values/)
  sheet.getCell('B2').value = 2
  assert.equal((await summarize(Buffer.from(await book.xlsx.writeBuffer()), excelInput)).total, '2.00')
  sheet.getRow(2).hidden = true
  await assert.rejects(async () => summarize(Buffer.from(await book.xlsx.writeBuffer()), excelInput), /hidden_rows/)
  sheet.getRow(2).hidden = false; book.addWorksheet('其他')
  await assert.rejects(async () => summarize(Buffer.from(await book.xlsx.writeBuffer()), excelInput), /sheet_required/)
  assert.equal((await summarize(Buffer.from(await book.xlsx.writeBuffer()), { ...excelInput, sheet: '明细' })).total, '2.00')
  sheet.mergeCells('A3:B3')
  await assert.rejects(async () => summarize(Buffer.from(await book.xlsx.writeBuffer()), { ...excelInput, sheet: '明细' }), /sheet_not_plain_table/)
  assert.throws(() => checkZip(Buffer.from('invalid')), /invalid_archive/)
  const bomb = new JSZip(); bomb.file('huge', Buffer.alloc(17 * 1024 * 1024))
  const compressed = Buffer.from(await bomb.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }))
  assert.throws(() => checkZip(compressed), /archive_limit/)
})
test('real Office bundle round trip, source binding, no overwrite, confinement and cancellation', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-office-test-'))
  let runtime
  try {
    await fs.writeFile(path.join(dir, 'ledger.csv'), source)
    runtime = await createRuntime({ roots: [{ name: 'work', path: dir }], office: { enabled: true } })
    const execute = (tool, args, signal) => runtime.execute({ tool, arguments: args }, signal)
    const summary = JSON.parse(await execute('office.table_summary', input))
    const report = { ...input, expected_sha256: summary.source_sha256, output_directory: 'report-001', title: '部门业务汇总报告', period: '样例验收' }
    const result = JSON.parse(await execute('office.create_report', report))
    assert.equal(result.total, '2500.00'); assert.equal(result.status, 'complete')
    const manifest = JSON.parse(await fs.readFile(path.join(dir, 'report-001/summary.json'), 'utf8'))
    assert.equal(manifest.source_sha256, summary.source_sha256)
    const book = new ExcelJS.Workbook(); await book.xlsx.readFile(path.join(dir, 'report-001/summary.xlsx'))
    assert.equal(book.getWorksheet('汇总').getCell('C8').result, 2500)
    const zip = await JSZip.loadAsync(await fs.readFile(path.join(dir, 'report-001/report.docx')))
    const xml = await zip.file('word/document.xml').async('string')
    assert.match(xml, /2500\.00/); assert.match(xml, /部门业务汇总报告/); assert.match(xml, new RegExp(summary.source_sha256))
    await assert.rejects(() => execute('office.create_report', report), /office_output_exists/)
    await assert.rejects(() => execute('office.table_summary', { ...input, source_path: '../ledger.csv' }), /path_denied/)
    await assert.rejects(() => execute('office.table_summary', { ...input, command: 'ignored' }), /invalid_arguments/)
    await assert.rejects(() => execute('office.create_report', { ...report, output_directory: '../escape' }), /path_denied/)
    await fs.link(path.join(dir, 'ledger.csv'), path.join(dir, 'linked.csv'))
    await assert.rejects(() => execute('office.table_summary', { ...input, source_path: 'linked.csv' }), /linked_path/)
    await fs.unlink(path.join(dir, 'linked.csv'))
    await fs.writeFile(path.join(dir, 'ledger.csv'), source + 'A006,研发,1.00\r\n')
    await assert.rejects(() => execute('office.create_report', { ...report, output_directory: 'changed' }), /source_changed/)
    await assert.rejects(() => fs.access(path.join(dir, 'changed')), { code: 'ENOENT' })
    const aborted = new AbortController(); aborted.abort()
    await assert.rejects(() => execute('office.create_report', { ...report, output_directory: 'cancelled' }, aborted.signal))
    await assert.rejects(() => fs.access(path.join(dir, 'cancelled')), { code: 'ENOENT' })
    const disabled = await createRuntime({ roots: [{ name: 'work', path: dir }] })
    assert.ok(!disabled.tools.some(t => t.name.startsWith('office.'))); await disabled.close()
  } finally {
    await runtime?.close()
    const real = await fs.realpath(dir), parent = await fs.realpath(os.tmpdir())
    if (path.dirname(real).toLowerCase() === parent.toLowerCase() && path.basename(real).startsWith('studio-office-test-')) await fs.rm(real, { recursive: true })
  }
})
test('office task has a separate submission approval and scoped, non-executing route handoff', () => {
  const instruction = buildOfficeInstruction({ ...officeTaskDefaults, formUrl: 'http://127.0.0.1:18763/office' })
  assert.match(instruction, /expected_sha256/); assert.match(instruction, /不重复提交/)
  assert.match(instruction, /单独.*browser\.browser_click/)
  assert.equal(officeAgentSpec.require_approval, true)
  const state = { officeTask: { specId: 'testspec12345678', deviceId: 'device1234567890', instruction } }
  assert.equal(officeRunHandoff(state, 'testspec12345678', '')?.instruction, instruction)
  assert.equal(officeRunHandoff(state, 'other', ''), null)
  assert.equal(officeRunHandoff(state, 'testspec12345678', 'history-run'), null)
  assert.throws(() => buildOfficeInstruction({ ...officeTaskDefaults, formUrl: 'javascript:alert(1)' }), /HTTP/)
})
