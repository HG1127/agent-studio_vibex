import fs from 'node:fs/promises'
import path from 'node:path'
import { Worker } from 'node:worker_threads'

const string = (maxLength = 100) => ({ type: 'string', minLength: 1, maxLength })
function validate(input, report) {
  const keys = ['root', 'source_path', 'sheet', 'group_by', 'amount_column', 'decimal_places', ...(report ? ['expected_sha256', 'output_directory', 'title', 'period', 'notes'] : [])]
  if (Object.keys(input).some(k => !keys.includes(k))) throw Error('office_invalid_arguments')
  for (const key of ['root', 'source_path', 'group_by', 'amount_column', ...(report ? ['expected_sha256', 'output_directory', 'title', 'period'] : [])]) {
    if (typeof input[key] !== 'string' || !input[key].trim() || input[key].length > (['source_path', 'output_directory'].includes(key) ? 1000 : 100)) throw Error('office_invalid_arguments')
  }
  if (!/\.(xlsx|csv)$/i.test(input.source_path) || input.sheet !== undefined && (typeof input.sheet !== 'string' || input.sheet.length > 100) ||
      input.decimal_places !== undefined && (!Number.isInteger(input.decimal_places) || input.decimal_places < 0 || input.decimal_places > 6) ||
      report && (!/^[a-f0-9]{64}$/.test(input.expected_sha256) || input.notes !== undefined && (typeof input.notes !== 'string' || input.notes.length > 1200))) throw Error('office_invalid_arguments')
}
async function processTable(bytes, input, report, signal) {
  signal?.throwIfAborted()
  const worker = new Worker(new URL('./office-worker.mjs', import.meta.url), {
    workerData: { bytes, input, action: report ? 'report' : 'summary' },
    resourceLimits: { maxOldGenerationSizeMb: 128, maxYoungGenerationSizeMb: 32 },
  })
  try {
    return await new Promise((resolve, reject) => {
      const abort = () => reject(Error('office_cancelled'))
      const timer = setTimeout(() => reject(Error('office_processing_timeout')), 20000)
      const clean = () => { clearTimeout(timer); signal?.removeEventListener('abort', abort) }
      signal?.addEventListener('abort', abort, { once: true })
      worker.once('message', message => { clean(); message.ok ? resolve(message.value) : reject(Error(message.error)) })
      worker.once('error', () => { clean(); reject(Error('office_processing_failed')) })
      worker.once('exit', code => { clean(); if (code) reject(Error('office_processing_failed')) })
      if (signal?.aborted) { clean(); abort() }
    })
  } finally { await worker.terminate() }
}
export function registerOffice(add, resolveFile, rootNames, writableRoots=rootNames) {
  const properties = { root: { type: 'string', enum: rootNames }, source_path: string(1000), sheet: string(), group_by: string(), amount_column: string(),
    decimal_places: { type: 'integer', minimum: 0, maximum: 6, default: 2 } }
  const schema = extra => ({ type: 'object', additionalProperties: false, properties: { ...properties, ...extra },
    required: ['root', 'source_path', 'group_by', 'amount_column', ...Object.keys(extra).filter(k => k !== 'notes')] })
  async function execute(input, report, signal) {
    validate(input, report)
    const source = await resolveFile({ root: input.root, path: input.source_path })
    const file = await fs.open(source, 'r')
    let bytes
    try {
      const stat = await file.stat()
      if (!stat.isFile() || stat.nlink > 1 || stat.size > 2 * 1024 * 1024) throw Error('office_source_limit')
      const buffer = Buffer.alloc(2 * 1024 * 1024 + 1)
      let length = 0
      while (length < buffer.length) {
        const read = await file.read(buffer, length, buffer.length - length, null)
        if (!read.bytesRead) break
        length += read.bytesRead
      }
      if (length > 2 * 1024 * 1024) throw Error('office_source_limit')
      bytes = buffer.subarray(0, length)
    } finally { await file.close() }
    const output = await processTable(bytes, input, report, signal)
    if (!report) return JSON.stringify(output.summary)
    // Build first; only create a fresh directory after parsing and digest validation.
    const directory = await resolveFile({ root: input.root, path: input.output_directory }, true)
    signal?.throwIfAborted()
    try { await fs.mkdir(directory, { mode: 0o700 }) }
    catch (e) { if (e.code === 'EEXIST') throw Error('office_output_exists'); throw e }
    const manifest = { version: 1, status: 'complete', title: input.title, period: input.period, ...output.summary,
      files: ['summary.xlsx', 'report.docx', 'summary.json'] }
    const artifacts = [['summary.xlsx', output.workbook], ['report.docx', output.document], ['summary.json', JSON.stringify(manifest, null, 2)]]
    for (const [name, value] of artifacts) {
      signal?.throwIfAborted()
      // Revalidate parents before each write, including newly created links.
      const destination = await resolveFile({ root: input.root, path: path.join(input.output_directory, name) }, true)
      await fs.writeFile(destination, value, { flag: 'wx', mode: 0o600 })
    }
    return JSON.stringify({ ...manifest, output_directory: input.output_directory,
      message: '已创建汇总表、Word 报告和核对清单。网页录入应使用本次精确汇总值，先观察、填表核对，再单独批准提交；成功需有网页回执。' })
  }
  add('office.table_summary', '读取授权目录的 XLSX/UTF-8 CSV，全表按列分组精确求和，返回源文件 SHA256、记录数、各组及合计。最多5000行/50组/2MiB；不运行公式，不按日期筛选。先获取此结果，再创建报告。',
    schema({}), (input, signal) => execute(input, false, signal))
  if(writableRoots.length)add('office.create_report', '根据同一源表生成 summary.xlsx、report.docx、summary.json 到新的输出目录。expected_sha256 必须取刚返回的汇总结果；拒绝覆盖或源文件变更。统计标签 period 不筛选日期。',
    {...schema({ expected_sha256: string(64), output_directory: string(1000), title: string(), period: string(), notes: { type: 'string', maxLength: 1200 } }),properties:{...properties,root:{type:'string',enum:writableRoots},expected_sha256:string(64),output_directory:string(1000),title:string(),period:string(),notes:{type:'string',maxLength:1200}}},
    (input, signal) => execute(input, true, signal))
}
