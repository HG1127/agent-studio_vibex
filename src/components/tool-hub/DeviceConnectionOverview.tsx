import {useState} from 'react'
import {ArrowDownToLine,CheckCircle2,Info,RefreshCw} from 'lucide-react'
import type {LocalDevice} from '@/lib/localDevices'
import {decodeRhToken} from '@/lib/studioAuth'
import {describeConnectorExperience,type PermissionHealth} from '@/lib/connectorExperience'
import {useConnectorRelease} from '@/lib/useConnectorRelease'

export function DeviceConnectionOverview({device,health,verified,now,busy,onRefresh}:{device:LocalDevice;health:PermissionHealth|null;verified:boolean;now:number;busy:boolean;onRefresh:()=>void}){
 const owner=decodeRhToken()?.sub||'',download=useConnectorRelease(),[showUpdate,setShowUpdate]=useState(false)
 const status=describeConnectorExperience({device,owner,health,verified,now,release:download.release})
 const updateText=status.update?(status.fresh?'运行中的旧版尚未切换':'上次上报的版本较旧，恢复后再核实'):status.relation===0&&status.fresh?'运行版本与本站发布版一致':status.relation!==null&&status.relation>0?'运行版本高于本站发布版，无需降级':'版本尚待核实'
 return <section aria-label="当前电脑运行状态" className="border-b border-border bg-secondary/15 px-4 py-3">
  <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0 flex-1"><p className="flex items-center gap-2 text-sm font-semibold">{status.applied?<CheckCircle2 className="h-4 w-4 text-emerald-600"/>:<Info className="h-4 w-4 text-amber-600"/>}{status.label}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{status.next}</p></div><button type="button" className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-border bg-card px-3 text-xs text-primary disabled:opacity-40" disabled={download.loading} onClick={()=>{download.refresh();onRefresh()}}><RefreshCw className="h-3.5 w-3.5"/>核实版本与连接</button></div>
  <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2"><div className="min-w-0 rounded-lg bg-card px-3 py-2"><dt className="text-muted-foreground">{status.versionLabel}</dt><dd className="mt-1 break-all font-semibold" data-testid="running-connector-version">{status.version||'尚未上报可核实版本'}</dd></div><div className="min-w-0 rounded-lg bg-card px-3 py-2"><dt className="text-muted-foreground">本站可下载版本（不代表已安装）</dt><dd className="mt-1 break-all font-semibold" data-testid="download-connector-version">{download.loading?'正在核实…':download.release?.version||'暂时无法核实'}</dd></div></dl>
  <div className="mt-2 flex flex-wrap items-center justify-between gap-2"><p className={'text-xs '+(status.update?'text-amber-700':'text-muted-foreground')}>{updateText}</p><button type="button" aria-expanded={showUpdate} className="min-h-8 text-xs font-semibold text-primary" onClick={()=>setShowUpdate(v=>!v)}>{showUpdate?'收起升级说明':status.update?'查看安全升级步骤':'查看连接器使用说明'}</button></div>
  {download.error&&<p className="mt-2 text-xs text-muted-foreground">{download.error}</p>}
  {showUpdate&&<section aria-label="保留连接的升级步骤" className="mt-3 space-y-3 rounded-xl border border-border bg-card p-3 text-xs leading-6">
   <p className="break-words font-semibold">当前连接：{device.name} · #{device.id.slice(-6)}。保留原设备、账号和授权，不重新配对。</p>
   {busy&&<p role="status" className="rounded-lg bg-amber-50 px-3 py-2 text-amber-950">当前有草稿、审批或未核实的操作。请先保存、放弃草稿或核实请求结果，再退出旧连接器；不要中断正在应用的授权。</p>}
   {status.relation===1?<p>当前运行版高于本站下载版，请继续使用现有程序，不要用较旧的下载包覆盖。核实电脑身份即可，无需降级或重新配对。</p>:<ol className="list-decimal space-y-1 pl-5"><li>下载完整连接器包并解压到新目录，不覆盖正在运行的旧目录。</li><li>确认任务与授权请求已结束后，正常退出旧连接器进程。只关闭管理网页不会停止旧执行器。</li><li>从新目录双击 Start-Connector.cmd，按电脑名称、工作台地址和原授权范围核对并恢复已有连接，再回本页核对标识尾号。不要重新下载配对 JSON。</li><li>返回本页核实实际上报版本；只有新版本的心跳到达，才会显示运行版本已经切换。</li></ol>}
   {download.release&&status.relation!==1&&<a href={download.release.url} download className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-primary px-3 font-semibold text-primary-foreground"><ArrowDownToLine className="h-4 w-4"/>下载本站连接器 {download.release.version}</a>}
   <p className="text-muted-foreground">有多个同名连接时，请核对标识尾号与当前工作台地址。新版不会自动开启更多权限；预览包未完成公司终端验收，系统安全提示应按公司 IT 流程处理。</p>
  </section>}
 </section>
}
