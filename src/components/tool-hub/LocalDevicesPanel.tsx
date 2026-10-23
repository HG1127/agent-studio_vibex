import { useCallback, useEffect, useRef, useState } from 'react'
import { deviceTools, localApi, type LocalDevice, type LocalJob } from '@/lib/localDevices'

const field = 'rounded-lg border border-border bg-background px-3 py-2 text-sm'
const button = 'rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-50'
export function LocalDevicesPanel() {
  const [devices, setDevices] = useState<LocalDevice[]>([])
  const [name, setName] = useState('我的电脑')
  const [pairing, setPairing] = useState<{ pairing_code: string; expires_ms: number } | null>(null)
  const [selected, setSelected] = useState('')
  const [tool, setTool] = useState('')
  const [args, setArgs] = useState('{"root":"work","path":"."}')
  const [confirmed, setConfirmed] = useState(false)
  const [job, setJob] = useState<LocalJob | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const inFlight = useRef(false)
  const refresh = useCallback(async (signal?: AbortSignal) => {
    const result = await localApi<{ items: LocalDevice[] }>('/api/local-devices', undefined, signal)
    setDevices(result.items)
  }, [])
  useEffect(() => {
    const controller = new AbortController()
    void refresh(controller.signal).catch(e => { if (!controller.signal.aborted) setError(String(e.message)) })
    return () => controller.abort()
  }, [refresh])
  const jobId = job?.id
  const pending = job?.status === 'queued' || job?.status === 'running'
  useEffect(() => {
    if (!jobId || !pending) return
    const controller = new AbortController()
    const timer = window.setInterval(() => {
      void localApi<LocalJob>('/api/local-jobs/' + jobId, undefined, controller.signal).then(setJob)
        .catch(e => { if (!controller.signal.aborted) setError(String(e.message)) })
    }, 1500)
    return () => { controller.abort(); window.clearInterval(timer) }
  }, [jobId, pending])
  const act = async (operation: () => Promise<void>) => {
    if (inFlight.current) return
    inFlight.current = true; setBusy(true); setError('')
    try { await operation() } catch (e) { setError(e instanceof Error ? e.message : '操作失败') }
    finally { inFlight.current = false; setBusy(false) }
  }
  const selectedDevice = devices.find(d => d.id === selected && !d.revoked)
  const tools = deviceTools(selectedDevice)
  const online = !!selectedDevice && Date.now() - selectedDevice.seen_ms < 45000
  return <section className="space-y-4 rounded-2xl border border-border bg-card p-5" aria-labelledby="local-devices-heading">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 id="local-devices-heading" className="font-semibold">我的电脑</h2>
        <p className="mt-1 text-sm text-muted-foreground">连接本地执行器后，助手可在你批准后操作文件、浏览器和已配置的软件。</p></div>
      <button className={button} disabled={busy} onClick={() => void act(() => refresh())}>刷新设备</button>
    </div>
    <details><summary className="cursor-pointer text-sm font-medium">绑定一台电脑</summary>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <label className="grid gap-1 text-sm">电脑名称<input className={field} maxLength={80} value={name} onChange={e => setName(e.target.value)} /></label>
        <button className={button} disabled={busy || !name.trim()} onClick={() => void act(async () => {
          setPairing(await localApi('/api/local-devices', { name })); await refresh()
        })}>生成配对码</button>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">在这台电脑上配置并运行本地执行器。项目内的 docs/LOCAL_COMPUTER.md 提供安装与启动步骤。</p>
      {pairing && <div className="mt-3 rounded-lg bg-secondary p-3 text-sm">
        <p>配对码（有效至 {new Date(pairing.expires_ms).toLocaleTimeString()}，仅在自己的电脑上输入）：</p>
        <code className="block break-all select-all py-2">{pairing.pairing_code}</code>
        <button className={button} onClick={() => setPairing(null)}>隐藏配对码</button>
      </div>}
    </details>
    <div className="space-y-2">{devices.length === 0 && <p className="text-sm text-muted-foreground">还没有绑定电脑。</p>}
      {devices.map(d => <div key={d.id} className="flex items-center justify-between gap-3 rounded-lg border border-border p-3 text-sm">
        <span>{d.name} · {d.revoked ? '已撤销' : Date.now() - d.seen_ms < 45000 ? '在线' : d.seen_ms ? '离线' : '等待连接'}</span>
        {!d.revoked && <button className="text-destructive" disabled={busy} onClick={() => void act(async () => {
          await localApi('/api/local-devices/' + d.id + '/revoke', {}); await refresh()
        })}>撤销连接</button>}
      </div>)}
    </div>
    <details><summary className="cursor-pointer text-sm font-medium">测试一次本地操作</summary>
      <div className="mt-3 grid gap-3">
        <label className="grid gap-1 text-sm">选择电脑<select className={field} value={selected} onChange={e => { setSelected(e.target.value); setTool(''); setConfirmed(false) }}>
          <option value="">请选择</option>{devices.filter(d => !d.revoked).map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select></label>
        <label className="grid gap-1 text-sm">操作<select aria-label="操作" className={field} value={tool} onChange={e => { setTool(e.target.value); setConfirmed(false) }}>
          <option value="">请选择</option>{tools.map(t => <option key={t.name} value={t.name}>{t.name}</option>)}
        </select></label>
        <p className="text-sm text-muted-foreground">{tools.find(t => t.name === tool)?.description}</p>
        <label className="grid gap-1 text-sm">操作参数（JSON）<textarea className={field + ' font-mono'} rows={4} value={args} onChange={e => { setArgs(e.target.value); setConfirmed(false) }} /></label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />我批准在所选电脑上执行这次操作</label>
        <button className={button} disabled={busy || pending || !confirmed || !tool || !online} onClick={() => void act(async () => {
          const input: unknown = JSON.parse(args)
          if (!input || typeof input !== 'object' || Array.isArray(input)) throw Error('参数必须是 JSON 对象')
          setConfirmed(false)
          const created = await localApi<{ id: string }>('/api/local-devices/' + selected + '/jobs', { tool, arguments: input, confirm: true, request_id: crypto.randomUUID() })
          setJob({ id: created.id, status: 'queued', result: '', error: '' })
        })}>批准并执行</button>
        {job && <div role="status" className="rounded-lg bg-secondary p-3 text-sm"><p>任务状态：{({queued:'等待电脑领取',running:'正在执行',succeeded:'已完成',failed:'执行失败',cancelled:'已取消',expired:'等待超时',unknown:'结果未确认，请检查电脑'} as Record<string,string>)[job.status] || job.status}</p>
          <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-words">{job.result || job.error}</pre>
          {job.images?.map((image, index) => <img key={index} alt="本地操作返回的截图" className="mt-2 max-h-96 max-w-full rounded-lg object-contain"
            src={'data:' + image.mimeType + ';base64,' + image.data} />)}
          {pending && <button className="mt-2 text-destructive" disabled={busy} onClick={() => void act(async () => {
            await localApi('/api/local-jobs/' + job.id + '/cancel', {}); setJob({ ...job, status: 'cancelled' })
          })}>停止任务</button>}
        </div>}
      </div>
    </details>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </section>
}
