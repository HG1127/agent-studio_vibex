import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { localApi, type LocalDevice } from '@/lib/localDevices'

export function LocalDeviceSelector({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const [devices, setDevices] = useState<LocalDevice[]>([])
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    let running = false
    const poll = async () => {
      if (running) return
      running = true
      try {
        const data = await localApi<{ items: LocalDevice[] }>('/api/local-devices', undefined, controller.signal)
        if (!controller.signal.aborted) { setDevices(data.items.filter(d => !d.revoked)); setError('') }
      } catch { if (!controller.signal.aborted) { setDevices([]); setError('设备列表加载失败，请刷新重试') } }
      finally { running = false }
    }
    void poll()
    const timer = window.setInterval(() => void poll(), 15000)
    return () => { controller.abort(); window.clearInterval(timer) }
  }, [revision])
  return <div className="mt-3 space-y-2 text-sm">
    <label className="flex flex-wrap items-center gap-2">本次可操作的电脑
      <select className="rounded-lg border border-border bg-background px-3 py-2" value={value} onChange={e => onChange(e.target.value)}>
        <option value="">不使用本地电脑</option>
        {devices.map(d => <option key={d.id} value={d.id}>{d.name}{Date.now() - d.seen_ms > 45000 ? '（离线）' : ''}</option>)}
      </select>
    </label>
    <p className="text-xs text-muted-foreground">每次本地操作都需要批准。<Link to="/tool-hub" className="ml-2 text-primary">绑定和测试电脑</Link>
      <button type="button" className="ml-3 text-primary" onClick={() => setRevision(v => v + 1)}>刷新</button></p>
    {error && <p role="alert" className="text-destructive">{error}</p>}
  </div>
}
