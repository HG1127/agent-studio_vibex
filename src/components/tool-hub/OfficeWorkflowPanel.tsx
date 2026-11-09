import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { deviceTools, localApi, type LocalDevice } from '@/lib/localDevices'
import { buildOfficeInstruction, officeAgentSpec, officeSampleCsv, officeTaskDefaults, type OfficeTask } from '@/lib/localOfficeWorkflow'

const field = 'rounded-lg border border-border bg-background px-3 py-2 text-sm'
export function OfficeWorkflowPanel({ devices }: { devices: LocalDevice[] }) {
  const navigate = useNavigate()
  const [deviceId, setDeviceId] = useState('')
  const [task, setTask] = useState<OfficeTask>(officeTaskDefaults)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const inFlight = useRef(false)
  const device = devices.find(d => d.id === deviceId && !d.revoked)
  const tools = deviceTools(device)
  const ready = !!device && Date.now() - device.seen_ms < 45000 && ['office.table_summary', 'office.create_report'].every(name => tools.some(t => t.name === name))
  const roots = tools.find(t => t.name === 'office.table_summary')?.inputSchema as { properties?: { root?: { enum?: string[] } } } | undefined
  const edit = (key: keyof OfficeTask, value: string) => { setTask(old => ({ ...old, [key]: value })); setError('') }
  async function create() {
    if (inFlight.current || !ready) return
    inFlight.current = true; setBusy(true); setError('')
    try {
      const instruction = buildOfficeInstruction(task)
      if (!roots?.properties?.root?.enum?.includes(task.root)) throw Error('请选择此电脑已授权的工作目录')
      if (task.formUrl && !tools.some(t => t.name === 'browser.browser_navigate')) throw Error('此电脑尚未启用浏览器')
      const row = await localApi<{ id: string }>('/api/agent_specs', { name: task.title, spec: officeAgentSpec, source: 'template', template_key: 'local-office' })
      if (!row.id) throw Error('无法确认助手已保存，请检查我的助手列表')
      navigate('/agent-run?spec=' + encodeURIComponent(row.id), { state: { officeTask: { specId: row.id, deviceId, instruction } } })
    } catch (e) { setError(e instanceof Error ? e.message : '创建失败') }
    finally { inFlight.current = false; setBusy(false) }
  }
  function downloadSample() {
    const url = URL.createObjectURL(new Blob([officeSampleCsv], { type: 'text/csv;charset=utf-8' }))
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'sample-ledger.csv'; anchor.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  return <details>
    <summary className="cursor-pointer text-sm font-medium">办公流程：表格汇总 → 文档报告 → 网页录入</summary>
    <div className="mt-3 grid gap-3" aria-label="办公流程配置">
      <p className="text-sm text-muted-foreground">选择电脑，填写台账位置与列名，创建助手后选择模型试跑。输出包含 Excel 汇总表、Word 报告及核对清单。</p>
      <label className="grid gap-1 text-sm">办公电脑<select className={field} value={deviceId} onChange={e => setDeviceId(e.target.value)}>
        <option value="">请选择</option>{devices.filter(d => !d.revoked).map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
      </select></label>
      {deviceId && !ready && <p role="status" className="text-sm text-muted-foreground">需要在线电脑并在本机配置 office.enabled 为 true 后重启执行器。</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm">授权工作目录<select className={field} value={task.root} onChange={e => edit('root', e.target.value)}>
          <option value="">请选择</option>{(roots?.properties?.root?.enum || ['work']).map(name => <option key={name} value={name}>{name}</option>)}
        </select></label>
        {([['sourcePath', '源表相对路径'], ['sheet', '工作表名称（CSV 留空）'], ['groupBy', '分组列名'], ['amountColumn', '金额列名'], ['outputDirectory', '新输出目录'], ['title', '报告标题'], ['period', '统计标签（全表汇总）'], ['formUrl', '表单网址（选填）']] as const).map(([key, label]) =>
          <label key={key} className="grid gap-1 text-sm">{label}<input className={field} value={task[key]} maxLength={key === 'sourcePath' || key === 'outputDirectory' || key === 'formUrl' ? 1000 : 100} onChange={e => edit(key, e.target.value)} /></label>)}
      </div>
      <p className="text-sm text-muted-foreground">全表按两位小数求和；先在源文件副本中完成日期筛选和公式转值。网页先填表核对，再单独批准提交。每次使用新的输出目录。</p>
      <div className="flex flex-wrap gap-3">
        <button className="rounded-lg border border-border px-3 py-2 text-sm" onClick={downloadSample}>下载样例台账</button>
        <button className="rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-50" disabled={!ready || busy} onClick={() => void create()}>{busy ? '正在创建…' : '创建办公助手并试跑'}</button>
      </div>
      <p className="text-xs text-muted-foreground">将下载的样例放入所选授权目录后使用。来源最多 2 MiB、5000 行、50 组；网页须已加入本机允许列表。</p>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </div>
  </details>
}
