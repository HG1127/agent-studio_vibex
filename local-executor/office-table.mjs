// Deterministic tabular calculations. No formulas, cached results or model arithmetic.
import { createHash } from 'node:crypto'
import ExcelJS from 'exceljs'

export const LIMITS = { bytes: 2 * 1024 * 1024, expanded: 16 * 1024 * 1024, rows: 5000, columns: 50, groups: 50 }
export function checkZip(bytes) {
  const b = Buffer.from(bytes)
  let end = -1
  for (let i = b.length - 22; i >= Math.max(0, b.length - 65557); i--) {
    if (b.readUInt32LE(i) === 0x06054b50 && i + 22 + b.readUInt16LE(i + 20) === b.length) { end = i; break }
  }
  if (end < 0 || b.readUInt16LE(end + 4) || b.readUInt16LE(end + 6)) throw Error('office_invalid_archive')
  const count = b.readUInt16LE(end + 10), size = b.readUInt32LE(end + 12), start = b.readUInt32LE(end + 16)
  if (count > 500 || count === 65535 || start + size !== end) throw Error('office_archive_limit')
  let offset = start, total = 0
  for (let n = 0; n < count; n++) {
    if (offset + 46 > end || b.readUInt32LE(offset) !== 0x02014b50 || (b.readUInt16LE(offset + 8) & 1)) throw Error('office_invalid_archive')
    total += b.readUInt32LE(offset + 24)
    if (total > LIMITS.expanded) throw Error('office_archive_limit')
    offset += 46 + b.readUInt16LE(offset + 28) + b.readUInt16LE(offset + 30) + b.readUInt16LE(offset + 32)
  }
  if (offset !== end) throw Error('office_invalid_archive')
}
export function parseCsv(bytes) {
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^\uFEFF/, '')
  const rows = [], row = []; let value = '', state = 'plain'
  const cell = () => { row.push(value); value = ''; if (row.length > LIMITS.columns) throw Error('office_table_limit') }
  const line = () => { cell(); rows.push([...row]); row.length = 0; if (rows.length > LIMITS.rows + 1) throw Error('office_table_limit') }
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (state === 'quoted') {
      if (c === '"') { if (text[i + 1] === '"') { value += '"'; i++ } else state = 'closed' }
      else value += c
    } else if (c === ',') { cell(); state = 'plain' }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; line(); state = 'plain' }
    else if (c === '"' && state === 'plain' && value === '') state = 'quoted'
    else { if (state === 'closed' || c === '"') throw Error('office_invalid_csv'); value += c }
    if (value.length > 10000) throw Error('office_cell_limit')
  }
  if (state === 'quoted') throw Error('office_invalid_csv')
  if (value || row.length || state === 'closed') line()
  return rows
}
function scalar(value) {
  if (value == null) return ''
  if (typeof value === 'string' || typeof value === 'number') return String(value)
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (value instanceof Date) return value.toISOString()
  if ('formula' in value || 'sharedFormula' in value) throw Error('office_formula_requires_values')
  if ('error' in value) throw Error('office_cell_error')
  if (Array.isArray(value.richText)) return value.richText.map(run => run.text).join('')
  if (typeof value.text === 'string') return value.text
  throw Error('office_cell_type')
}
function units(value, places) {
  const m = /^(-?)(\d{1,15})(?:\.(\d+))?$/.exec(String(value).trim())
  if (!m || (m[3] || '').length > places) throw Error('office_invalid_amount')
  return (m[1] ? -1n : 1n) * (BigInt(m[2]) * 10n ** BigInt(places) + BigInt((m[3] || '').padEnd(places, '0') || '0'))
}
export function decimal(value, places) {
  const n = value < 0n ? -value : value, raw = String(n).padStart(places + 1, '0')
  return (value < 0n ? '-' : '') + (places ? raw.slice(0, -places) + '.' + raw.slice(-places) : raw)
}
export async function summarize(bytes, input) {
  let rows, sheet = ''
  if (input.source_path.toLowerCase().endsWith('.csv')) {
    if (input.sheet) throw Error('office_csv_has_no_sheet')
    rows = parseCsv(bytes)
  } else {
    checkZip(bytes)
    const book = new ExcelJS.Workbook()
    await book.xlsx.load(Buffer.from(bytes))
    if (!input.sheet && book.worksheets.length !== 1) throw Error('office_sheet_required')
    const ws = input.sheet ? book.getWorksheet(input.sheet) : book.worksheets[0]
    if (!ws || ws.state !== 'visible' || ws.hasMerges) throw Error('office_sheet_not_plain_table')
    if (ws.rowCount > LIMITS.rows + 1 || ws.columnCount > LIMITS.columns) throw Error('office_table_limit')
    sheet = ws.name; rows = []
    for (let i = 1; i <= ws.rowCount; i++) {
      const row = ws.getRow(i)
      if (row.hidden) throw Error('office_hidden_rows')
      rows.push(Array.from({ length: ws.columnCount }, (_, c) => scalar(row.getCell(c + 1).value)))
    }
  }
  const headers = (rows.shift() || []).map(v => v.trim())
  if (!headers.length || headers.some(v => !v || v.length > 100) || new Set(headers).size !== headers.length) throw Error('office_invalid_headers')
  const groupIndex = headers.indexOf(input.group_by), amountIndex = headers.indexOf(input.amount_column)
  if (groupIndex < 0 || amountIndex < 0 || groupIndex === amountIndex) throw Error('office_columns_not_found')
  const places = input.decimal_places ?? 2, groups = new Map()
  let total = 0n, count = 0
  for (const row of rows) {
    if (row.every(v => !v.trim())) continue
    if (row.length !== headers.length) throw Error('office_inconsistent_columns')
    const group = row[groupIndex].trim()
    if (!group || group.length > 80) throw Error('office_invalid_group')
    const amount = units(row[amountIndex], places)
    if (amount > 1000000000000n || amount < -1000000000000n) throw Error('office_table_limit')
    const old = groups.get(group) || { count: 0, total: 0n }
    old.count++; old.total += amount; groups.set(group, old); total += amount; count++
    if (groups.size > LIMITS.groups || total > 1000000000000n || total < -1000000000000n || old.total > 1000000000000n || old.total < -1000000000000n) throw Error('office_table_limit')
  }
  if (!count) throw Error('office_empty_table')
  return { source_path: input.source_path, source_sha256: createHash('sha256').update(bytes).digest('hex'), sheet,
    group_by: input.group_by, amount_column: input.amount_column, decimal_places: places, row_count: count,
    total: decimal(total, places), groups: [...groups].map(([group, v]) => ({ group, row_count: v.count, total: decimal(v.total, places) })),
    calculation: '逐行按指定小数位转整数精确求和；不执行公式、不读取缓存结果、不自动筛选日期。' }
}
