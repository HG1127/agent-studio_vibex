import {useCallback,useEffect,useRef,useState} from 'react'
import {Link,useSearchParams} from 'react-router-dom'
import {useLocalDeviceInventory} from '@/lib/useLocalDeviceInventory'
import {visibleLocalDevices,deviceConnectionGuidance} from '@/lib/localDeviceInventory'
import {deviceTools,localApi} from '@/lib/localDevices'
import {confirmInStudio} from '@/lib/studioDialogs'
import {decodeRhToken} from '@/lib/studioAuth'
import {continueAgentResourceSetupUrl} from '@/lib/toolSearchPrivacy'
import {DeviceRecoveryHint} from './DeviceRecoveryHint'
import {ComputerWorkspace} from './ComputerWorkspace'
import {ConnectComputerButton} from './ConnectComputerButton'
import {LocalConnectorEntry} from './LocalConnectorEntry'

/** End-user device workspace. Raw tool arguments and manual pairing codes are
 * deliberately absent, not merely collapsed. Binding remains in the ticket. */
export function LocalDevicesPanel(){return <OwnedLocalDevices key={decodeRhToken()?.sub||''}/>}
function OwnedLocalDevices(){
  const [params]=useSearchParams()
  const requestedDevice=params.get('device')||'',chosenFromUrl=/^[A-Za-z0-9]{24}$/.test(requestedDevice)?requestedDevice:''
  const {devices,lastKnownDevices,loaded,error:inventoryError,refreshing,now,refresh,updatedAt}=useLocalDeviceInventory()
  const [deviceQuery,setDeviceQuery]=useState(''),[showRevoked,setShowRevoked]=useState(false)
  const [selected,setSelected]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false)
  const [commonBusy,setCommonBusy]=useState(false),[showDeviceList,setShowDeviceList]=useState(!chosenFromUrl)
  const [owner]=useState(()=>decodeRhToken()?.sub||'')
  const lock=useRef(false),alive=useRef(true)
  useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[])
  const authorized=useCallback(()=>!!owner&&decodeRhToken()?.sub===owner,[owner])
  const visibleDevices=visibleLocalDevices(devices,deviceQuery,showRevoked,now)
  // URL selection is a read-only choice among the current owner's returned inventory.
  const selectedId=selected||chosenFromUrl
  const selectedDevice=(inventoryError?lastKnownDevices:devices).find(d=>d.id===selectedId&&!d.revoked)
  const duplicateNames=new Set(devices.filter((d,i)=>!d.revoked&&devices.some((other,j)=>i!==j&&!other.revoked&&other.name===d.name)).map(d=>d.name))
  const revoke=async(id:string,name:string)=>{
    if(lock.current||!authorized())return
    lock.current=true;setBusy(true);setError('')
    try{
      if(!await confirmInStudio('确认撤销「'+name+'」？之后不能再使用这条连接，已发生的操作不会回滚。',{title:'撤销设备连接',confirmLabel:'确认撤销',destructive:true}))return
      if(!alive.current||!authorized())return
      await localApi('/api/local-devices/'+id+'/revoke',{})
      if(alive.current&&authorized())await refresh()
    }catch(e){if(alive.current&&authorized())setError(e instanceof Error?e.message:'请求未确认，请先核对状态。')}
    finally{lock.current=false;if(alive.current)setBusy(false)}
  }
  return <section className="space-y-4 rounded-2xl border border-border bg-card p-5" aria-labelledby="local-devices-heading">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 id="local-devices-heading" className="font-semibold">我的电脑与浏览器</h2><p className="mt-1 text-sm text-muted-foreground">选择电脑，在系统内浏览、编辑和管理文件，使用浏览器并核对执行结果。</p></div>
      <div className="flex flex-wrap gap-2"><ConnectComputerButton label="连接新电脑 / 浏览器" onConnected={d=>{if(!authorized())return;setSelected(d.id);setShowDeviceList(false);void refresh()}}/><button type="button" className="min-h-10 rounded-xl border border-border px-3 text-xs" disabled={busy||refreshing} onClick={()=>void refresh()}>刷新设备</button></div>
    </div>
    <p className="rounded-xl bg-primary/5 px-4 py-3 text-xs leading-5 text-muted-foreground">日常入口就在这里：选择设备 → 文件 / 浏览器 → 查看结果。连接器只需在电脑上保持运行，不必来回打开外部管理页。</p>
    {selectedDevice&&<div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-background px-4 py-3"><p className="text-sm"><strong>{selectedDevice.name}</strong><span className="ml-2 text-xs text-muted-foreground">#{selectedDevice.id.slice(-6)} · {inventoryError?'状态未核实':deviceConnectionGuidance(selectedDevice,now).label}</span></p><button type="button" className="min-h-9 rounded-lg border border-border px-3 text-xs text-primary" disabled={commonBusy||busy} onClick={()=>setShowDeviceList(v=>!v)}>{showDeviceList?'收起设备清单':'切换 / 管理设备'}</button></div>}
    {selectedDevice&&inventoryError&&<div role="alert" aria-label="当前设备状态异常" className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm"><p className="font-semibold text-destructive">当前设备状态尚未核实，操作已暂停。</p><p className="mt-1 text-xs text-muted-foreground">{inventoryError} 原设备、已保存授权和页面草稿没有因此被删除；不要重复配对。</p><button type="button" disabled={refreshing} className="mt-2 min-h-9 text-xs font-semibold text-primary" onClick={()=>void refresh()}>重新核实当前设备</button></div>}
    <section aria-label="本人设备清单" hidden={!!selectedDevice&&!showDeviceList} className="space-y-2">
      {(devices.length>3||duplicateNames.size>0||devices.some(d=>d.revoked))&&<div className="flex flex-wrap items-center gap-3">
        {(devices.length>3||duplicateNames.size>0)&&<input aria-label="搜索本人设备" value={deviceQuery} onChange={e=>setDeviceQuery(e.target.value)} placeholder="按名称或连接标识尾号查找" className="min-h-10 min-w-0 flex-1 rounded-lg border border-border bg-background px-3 text-sm"/>}
        {devices.some(d=>d.revoked)&&<label className="inline-flex min-h-9 items-center gap-2 text-xs text-muted-foreground"><input type="checkbox" checked={showRevoked} onChange={e=>setShowRevoked(e.target.checked)}/>显示已撤销设备（{devices.filter(d=>d.revoked).length}）</label>}
      </div>}
      {duplicateNames.size>0&&<p className="text-xs leading-5 text-muted-foreground">存在同名连接，请按名称旁的 # 标识尾号区分。进入工作区不会自动执行任务。</p>}
      {!loaded&&!inventoryError&&<p role="status" className="py-4 text-sm text-muted-foreground">正在读取本人设备…</p>}
      {inventoryError&&!selectedDevice&&<div role="alert" className="rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-sm"><p className="text-destructive">{inventoryError}</p><p className="mt-1 text-xs text-muted-foreground">当前无法核实设备清单，不代表原连接已删除。请先刷新，避免重复创建配对。</p><button type="button" disabled={refreshing} onClick={()=>void refresh()} className="mt-2 min-h-9 text-xs font-semibold text-primary">重新读取设备</button></div>}
      {loaded&&!inventoryError&&!visibleDevices.length&&<p className="rounded-xl border border-dashed border-border p-5 text-sm text-muted-foreground">{deviceQuery?'没有匹配的设备，请修改搜索。':devices.length?'没有未撤销设备，可重新连接并确认授权范围。':'还没有连接电脑，点击上方连接入口即可开始。'}</p>}
      {visibleDevices.map(d=><div key={d.id} data-device-id={d.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-background p-3 text-sm">
        <div className="min-w-[140px] flex-1"><strong className="break-words">{d.name}</strong><span className="ml-2 font-mono text-[10px] text-muted-foreground" title="连接标识，用于区分同名设备">#{d.id.slice(-6)}</span><span className="ml-2 text-xs">{deviceConnectionGuidance(d,now).label}</span><p className="mt-1 text-xs text-muted-foreground">{deviceTools(d).some(t=>t.name.startsWith('browser.'))?'浏览器已登记 · ':''}{deviceTools(d).some(t=>t.name.startsWith('files.'))?'文件工具已登记':'以本机实际开放能力为准'}</p></div>
        {!d.revoked&&<button type="button" className="min-h-10 rounded-lg border border-border px-3 text-xs font-semibold text-primary" disabled={commonBusy||busy} onClick={()=>{if(d.id!==selected){setSelected(d.id);setError('')}setShowDeviceList(false)}}>{selectedId===d.id?'当前检查设备':deviceConnectionGuidance(d,now).action}</button>}
        {!d.revoked&&<button type="button" className="min-h-10 text-xs text-destructive" disabled={busy||commonBusy||!!inventoryError} onClick={()=>void revoke(d.id,d.name)}>撤销连接</button>}
      </div>)}
    </section>
    {selectedDevice&&!inventoryError&&<DeviceRecoveryHint key={selectedDevice.id} device={selectedDevice} now={now} onRefresh={()=>void refresh()}/>}
    {selectedDevice&&<ComputerWorkspace key={owner+':'+selectedDevice.id} device={selectedDevice} statusVerified={!inventoryError} onRefresh={()=>void refresh()} refreshing={refreshing} onBusyChange={setCommonBusy} inventoryObservedAt={updatedAt}/>}
    {!selectedDevice&&loaded&&!inventoryError&&visibleDevices.some(d=>!d.revoked)&&<p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">先点一台设备右侧的按钮，再通过中文表单浏览文件或打开网页；无需填写 JSON。</p>}
    <details className="rounded-xl border border-border p-4 text-xs leading-6 text-muted-foreground"><summary className="cursor-pointer font-semibold text-foreground">找不到启动文件，或只想分析资料？</summary><div className="mt-3"><LocalConnectorEntry/></div><div className="mt-3 flex flex-wrap gap-3"><Link className="text-primary underline" to={continueAgentResourceSetupUrl('/knowledge-bases',params)}>直接上传资料，不连接电脑</Link><Link className="text-primary underline" to={continueAgentResourceSetupUrl('/plugin-market?tool=browser',params)}>查找远程浏览器服务（需另行配置）</Link></div><p className="mt-2">手工配对码入口已移除。连接文件内部仍含短期一次性绑定凭证，用于确认设备属于当前账号；它不是密码，不需要另外复制。</p></details>
    {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
  </section>
}
