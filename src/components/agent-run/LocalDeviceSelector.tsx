import {Link} from 'react-router-dom'
import {ConnectComputerButton} from '@/components/tool-hub/ConnectComputerButton'
import {DeviceRecoveryHint} from '@/components/tool-hub/DeviceRecoveryHint'
import {deviceConnectionState} from '@/lib/localConnectionSetup'
import {useLocalDeviceInventory} from '@/lib/useLocalDeviceInventory'
import {visibleLocalDevices} from '@/lib/localDeviceInventory'

export function LocalDeviceSelector({value,onChange}:{value:string;onChange:(id:string)=>void}){
  const {devices,loaded,error,refreshing,now,refresh}=useLocalDeviceInventory()
  const available=visibleLocalDevices(devices,'',false,now)
  const selected=devices.find(d=>d.id===value)
  const online=available.filter(d=>deviceConnectionState(d,now)==='online')
  return <section aria-label="本次任务设备选择" className="mt-3 min-w-0 space-y-2 rounded-xl border border-border bg-secondary/20 p-3 text-sm">
    <label className="grid min-w-0 gap-2 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center">本次可操作的电脑
      <select className="min-h-10 w-full min-w-0 rounded-lg border border-border bg-background px-3 py-2" value={value} onChange={e=>onChange(e.target.value)}>
        <option value="">不使用本地电脑</option>
        {value&&!available.some(d=>d.id===value)&&<option value={value} disabled>{!loaded?'正在核验所选设备…':error?'所选设备状态未知':selected?.revoked?'原设备已撤销':'所选设备已不可访问'}</option>}
        {available.map(d=><option key={d.id} value={d.id}>{d.name} · {deviceConnectionState(d,now)==='online'?'在线':deviceConnectionState(d,now)==='waiting'?'等待启动':'离线'}</option>)}
      </select>
    </label>
    {!loaded&&!error&&<p role="status" className="text-xs text-muted-foreground">正在核验本人设备…</p>}
    {error?<p role="alert" className="text-xs text-destructive">{error}。暂时不能确认可用设备，不会自动换成其他电脑。</p>:
      loaded&&!available.length&&!value?<p className="text-xs text-muted-foreground">尚未连接可用设备，可直接在此连接，无需离开或重新填写任务。</p>:null}
    {!value&&online.length===1&&<button type="button" onClick={()=>onChange(online[0].id)} className="min-h-9 text-left text-xs font-semibold text-primary">使用这台在线电脑：{online[0].name}</button>}
    {selected&&<DeviceRecoveryHint key={selected.id} device={selected} now={now} onRefresh={()=>void refresh()}/>}
    {value&&loaded&&!selected&&!error&&<p className="text-xs text-muted-foreground">请明确选择另一台本人设备，或选择“不使用本地电脑”；系统不会自动替换任务设备。</p>}
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
      <ConnectComputerButton label="连接新设备，不离开任务" className="inline-flex min-h-9 items-center gap-2 font-semibold text-primary" successLabel="在本次任务中使用" onConnected={d=>{onChange(d.id);void refresh()}}/>
      <button type="button" disabled={refreshing} className="min-h-9 text-primary disabled:opacity-50" onClick={()=>void refresh()}>{refreshing?'正在刷新…':'刷新设备'}</button>
      <Link to="/tool-hub?view=devices" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-9 items-center text-muted-foreground hover:text-primary">管理已有设备 ↗</Link>
    </div>
    <p className="text-[11px] leading-5 text-muted-foreground">只指定本次使用的设备，不启动任何操作，也不增加 Agent 角色权限；每项本地操作仍需批准。</p>
  </section>
}
