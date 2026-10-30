import {useCallback,useEffect,useId,useState} from 'react'
import {Link} from 'react-router-dom'
import {Bot,FolderOpen,Globe2,ShieldCheck,Table2} from 'lucide-react'
import {deviceTools,type LocalDevice} from '@/lib/localDevices'
import {ComputerFileWorkspace} from './ComputerFileWorkspace'
import {DeviceQuickCheck} from './DeviceQuickCheck'
import {DeviceWorkspaceScope} from './DeviceWorkspaceScope'
import {OfficeWorkflowPanel} from './OfficeWorkflowPanel'
import {ConnectorDownload} from './ConnectorDownload'
import {DeviceConnectionOverview} from './DeviceConnectionOverview'
import type {PermissionHealth} from '@/lib/connectorExperience'

/** Keep inactive panels mounted so tab changes cannot discard drafts or receipt
 * identities. Permission changes invalidate file versions, not the whole editor. */
export function ComputerWorkspace({device,statusVerified,onRefresh,refreshing,onBusyChange,inventoryObservedAt=0}:{device:LocalDevice;statusVerified:boolean;onRefresh:()=>void;refreshing:boolean;onBusyChange:(busy:boolean)=>void;inventoryObservedAt?:number}){
 const tools=deviceTools(device),hasFiles=tools.some(t=>t.name==='files.list'),hasBrowser=tools.some(t=>t.name==='browser.browser_navigate')
 const [view,setView]=useState(hasFiles?'files':hasBrowser?'browser':'permissions'),[fileBusy,setFileBusy]=useState(false),[browserBusy,setBrowserBusy]=useState(false),[permissionBusy,setPermissionBusy]=useState(false)
 const [health,setHealth]=useState<PermissionHealth|null>(null),[now,setNow]=useState(()=>Date.now()),[healthCheck,setHealthCheck]=useState(0)
 // Both clocks are local observation times, never timestamps supplied by a device.
 const receiveHealth=useCallback((value:PermissionHealth)=>{setHealth(value);setNow(Date.now())},[])
 useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),5000);return()=>clearInterval(timer)},[])
 const key=useId(),busy=fileBusy||browserBusy||permissionBusy
 useEffect(()=>{onBusyChange(busy);return()=>onBusyChange(false)},[busy,onBusyChange])
 const tabs=[{id:'files',label:'文件工作区',icon:FolderOpen},{id:'browser',label:'浏览器',icon:Globe2},{id:'permissions',label:'授权管理',icon:ShieldCheck},{id:'office',label:'办公与 Agent',icon:Table2}]
 return <section aria-label="电脑工作区" className="min-w-0 overflow-hidden rounded-2xl border border-border bg-background">
  <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border p-4"><div><h3 className="font-semibold">{device.name} · 电脑工作区</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">日常操作在系统内完成。本机组件只负责执行；首次绑定、目录选择和权限提升仍由本人在被连接电脑确认。</p></div><span className="rounded-lg bg-secondary px-2 py-1 font-mono text-[10px] text-muted-foreground">#{device.id.slice(-6)}</span></div>
  <DeviceConnectionOverview device={device} health={health} verified={statusVerified} now={Math.max(now,inventoryObservedAt)} busy={busy} onRefresh={()=>{setHealthCheck(n=>n+1);onRefresh()}}/>
  <div role="tablist" aria-label="电脑工作区功能" className="flex flex-wrap gap-1 border-b border-border bg-secondary/20 p-2">{tabs.map((tab,index)=><button key={tab.id} id={key+'-'+tab.id+'-tab'} type="button" role="tab" aria-selected={view===tab.id} aria-controls={key+'-'+tab.id} tabIndex={view===tab.id?0:-1} disabled={busy&&view!==tab.id} onClick={()=>setView(tab.id)} onKeyDown={e=>{if(busy)return;const n=e.key==='ArrowRight'?(index+1)%tabs.length:e.key==='ArrowLeft'?(index+tabs.length-1)%tabs.length:e.key==='Home'?0:e.key==='End'?tabs.length-1:-1;if(n>=0){e.preventDefault();setView(tabs[n].id);document.getElementById(key+'-'+tabs[n].id+'-tab')?.focus()}}} className={'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-3 text-sm font-medium disabled:opacity-40 '+(view===tab.id?'bg-card text-primary shadow-sm':'text-muted-foreground hover:bg-card/60')}><tab.icon className="h-4 w-4"/>{tab.label}</button>)}</div>
  {busy&&<p className="border-b border-border px-4 py-2 text-xs text-muted-foreground">请先保存或放弃当前草稿、核实正在执行的操作或授权请求，再切换工作区或设备。</p>}
  <section role="tabpanel" id={key+'-files'} aria-labelledby={key+'-files-tab'} hidden={view!=='files'} className="min-w-0 space-y-4 p-3 sm:p-4">{hasFiles&&!tools.some(t=>t.name==='files.stat')&&<div className="rounded-xl border border-amber-300/40 bg-amber-50/50 p-4"><h4 className="text-sm font-semibold">已有连接可继续用，新文件能力需要更新本机组件</h4><p className="my-2 text-xs leading-6 text-muted-foreground">当前连接器支持读取和新建。更新后恢复同一条连接，再在“授权管理”分别开启编辑、移动、删除、打开；无需重新配对，也不会自动扩大权限。</p><details><summary className="cursor-pointer text-xs font-medium text-primary">查看连接器更新入口</summary><div className="mt-3"><ConnectorDownload purpose="update"/></div></details></div>}<ComputerFileWorkspace device={device} statusVerified={statusVerified} onBusyChange={setFileBusy} onRequestPermissions={()=>setView('permissions')}/></section>
  <section role="tabpanel" id={key+'-browser'} aria-labelledby={key+'-browser-tab'} hidden={view!=='browser'} className="min-w-0 p-3 sm:p-4">{hasBrowser?<DeviceQuickCheck device={device} statusVerified={statusVerified} onBusyChange={setBrowserBusy} mode="browser"/>:<div className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">当前电脑未开放浏览器。请到“授权管理”添加允许的网站，确认后自动同步能力，无需另开连接器管理页。</div>}</section>
  <section role="tabpanel" id={key+'-permissions'} aria-labelledby={key+'-permissions-tab'} hidden={view!=='permissions'} className="min-w-0 p-3 sm:p-4"><DeviceWorkspaceScope key={device.id} device={device} statusVerified={statusVerified} onRefresh={onRefresh} refreshing={refreshing} onHealthChange={receiveHealth} onBusyChange={setPermissionBusy} refreshToken={healthCheck}/></section>
  <section role="tabpanel" id={key+'-office'} aria-labelledby={key+'-office-tab'} hidden={view!=='office'} className="min-w-0 space-y-4 p-4"><div className="rounded-xl border border-primary/20 bg-primary/5 p-4"><h4 className="flex items-center gap-2 font-semibold"><Bot className="h-4 w-4"/>让 Agent 使用这些能力</h4><p className="mt-2 text-sm leading-6 text-muted-foreground">已授权的本机工具会进入设备能力清单。运行助手时选择这台电脑，并在审批中核对具体文件变更。权限没有开启的操作不会自动开放。</p><Link to="/agent-run" className="mt-3 inline-flex min-h-10 items-center rounded-lg border border-primary/30 px-3 text-sm text-primary">进入运行与验收</Link></div><OfficeWorkflowPanel devices={[device]}/><p className="text-xs leading-6 text-muted-foreground">当前没有开放任意终端命令或任意程序执行。文件打开仅支持允许的文档类型；可执行文件、脚本和快捷方式不能借此启动。</p></section>
 </section>
}
