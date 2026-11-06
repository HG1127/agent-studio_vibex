import {useEffect,useState} from 'react'
import {Link,useLocation,useNavigate} from 'react-router-dom'
import {Monitor,ShieldCheck,ChevronDown,RefreshCw} from 'lucide-react'
import {useDesktopComputer} from './DesktopComputerContext'
import {ConnectComputerButton} from './ConnectComputerButton'
import {DesktopApplications} from './DesktopApplications'
import {DesktopPermissions} from './DesktopPermissions'
import {DesktopPairingReview} from './DesktopPairingReview'
import {deviceConnectionState} from '@/lib/localConnectionSetup'
const button='min-h-9 rounded-lg border border-border bg-background px-3 text-xs font-medium hover:bg-secondary disabled:opacity-40'
const labels:Record<string,string>={online:'已连接',starting:'正在连接',stopping:'正在断开',stopped:'已暂停',failed:'连接失败','needs-check':'需要检查'}
/** A persistent workbench section, never a separate manager dialog. */
export function DesktopComputerCenter(){
 const computer=useDesktopComputer()
 const location=useLocation(),navigate=useNavigate()
 const [consent,setConsent]=useState(false)
 const state=computer?.state,confirmation=state?.confirmations[0]
 useEffect(()=>setConsent(false),[confirmation?.id])
 if(!computer)return null
 const {verified,busy,error,expanded,setExpanded,refresh,act}=computer
 const profile=state?.profiles.find(p=>p.id===state.selectedId)
 const device=state?.devices?.find(d=>d.id===state.selectedId)
 const online=verified&&(profile?profile.state==='online'&&profile.running:!!device&&deviceConnectionState(device)==='online')
 const blocked=busy||!verified,selectionBlocked=blocked||computer.selectionBlocked||!!state?.permissions||!!state?.applicationPermissions||!!state?.review||!!state?.confirmations.length
 const run=async(action:string,input?:Record<string,unknown>)=>{setConsent(false);await act(action,input)}
 const choose=async(id:string)=>{
  const before=window.location.pathname+window.location.search
  if(!await act('select',{id,consent:true}))return
  if(location.pathname==='/tool-hub'&&before===window.location.pathname+window.location.search){const params=new URLSearchParams(location.search);params.set('device',id);navigate({pathname:location.pathname,search:params.toString()},{replace:true})}
 }
 return <section data-desktop-computer-center data-desktop-computer-toolbar aria-label="当前电脑连接" className="border-b border-border bg-card px-4 py-3 lg:px-6">
  <div className="flex flex-wrap items-center gap-3">
   <Monitor className="h-5 w-5 shrink-0 text-primary"/>
   <label className="flex min-w-0 flex-1 items-center gap-2 text-sm font-medium"><span className="shrink-0">当前电脑</span><select aria-label="选择电脑" className="min-h-10 min-w-0 flex-1 rounded-lg border border-border bg-background px-3 text-sm sm:max-w-xs" value={device?.id||''} disabled={selectionBlocked||!state?.devices?.length} onChange={e=>void choose(e.target.value)}>{!device&&<option value="">{state?.devices?.length?'选择已连接的电脑':'尚未连接本机'}</option>}{state?.devices?.map(d=><option key={d.id} value={d.id}>{state.profiles.some(p=>p.id===d.id)?'本机 · ':''}{d.name} · #{d.id.slice(-6)}</option>)}</select></label>
   <span role="status" aria-label="电脑连接状态" className={'inline-flex items-center gap-2 text-xs '+(online?'text-emerald-700':'text-muted-foreground')}><span className={'h-2 w-2 rounded-full '+(online?'bg-emerald-500':'bg-muted-foreground/40')}/>{!verified?'正在核实':online?'已连接':profile?(labels[profile.state]||'待连接'):device?'离线':'未连接'}</span>
   {profile&&(profile.running?<button type="button" className={button} disabled={blocked} onClick={()=>void run('stop',{id:profile.id,consent:true})}>暂停连接</button>:<button type="button" className={button} disabled={blocked} onClick={()=>void run('resume',{id:profile.id,fingerprint:profile.fingerprint,consent:true})}>连接电脑</button>)}
   {profile&&<Link className={button+' inline-flex items-center text-primary'} to={'/tool-hub?view=devices&device='+profile.id}>使用电脑</Link>}
   {!!state?.profiles.length&&<button type="button" className={button} aria-expanded={expanded} onClick={()=>setExpanded(!expanded)}>管理连接<ChevronDown className="ml-1 inline h-3 w-3"/></button>}
   <span hidden={!!state?.profiles.length}><ConnectComputerButton label="连接本机" onConnected={d=>{void choose(d.id)}}/></span>
   <span className="text-[10px] text-muted-foreground" data-desktop-version>{state?.appVersion?'桌面版 '+state.appVersion:'内置连接组件'}</span>
  </div>
  {computer.selectionBlocked&&<p className="mt-2 text-xs text-muted-foreground">请先处理当前文件或授权草稿，再切换电脑。</p>}
  {expanded&&<div data-desktop-connection-management className="mt-4 space-y-4 rounded-xl border border-border bg-secondary/15 p-4">
   <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-sm font-semibold">{device?.name||'本机'} · 连接与授权</h2><div className="flex gap-2"><button type="button" className={button} disabled={busy} onClick={()=>void refresh()}><RefreshCw className="mr-1 inline h-3 w-3"/>刷新</button>{profile&&<button type="button" className={button} disabled={blocked||!!state?.permissions||!!state?.applicationPermissions} onClick={()=>void run('permissions.open',{id:profile.id,fingerprint:profile.fingerprint})}>管理授权</button>}{profile&&<button type="button" className={button} disabled={blocked||!!state?.permissions||!!state?.applicationPermissions} onClick={()=>void run('applications.open',{id:profile.id,fingerprint:profile.fingerprint})}>应用授权</button>}</div></div>
   {profile?.message&&<p role="status" className="text-sm">{profile.message}</p>}
   {profile&&<div className="space-y-1 break-all text-xs text-muted-foreground">{profile.roots.map(root=><p key={root.path}>{root.path}（{root.readOnly?'只读':'读取与新建'}）</p>)}<p>{profile.origins.length?'允许的网站：'+profile.origins.join('、'):'尚未授权网站，可在管理授权中按需添加。'}</p></div>}
   {confirmation&&<section key={confirmation.id} className="space-y-3 rounded-xl border border-primary/40 bg-primary/5 p-4"><h3 className="flex items-center gap-2 font-semibold"><ShieldCheck className="h-4 w-4"/>{confirmation.kind==='application'?'请确认本次应用操作':'请确认本机授权变更'}</h3><p className="whitespace-pre-wrap break-all text-sm leading-6">{confirmation.message}</p><label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/>我已核对目标、内容，并同意本次操作。</label><div className="flex gap-2"><button type="button" className={button} disabled={blocked} onClick={()=>void run('confirm',{id:confirmation.id,consent:false})}>拒绝</button><button type="button" className={button+' bg-primary text-primary-foreground'} disabled={blocked||!consent} onClick={()=>void run('confirm',{id:confirmation.id,consent:true})}>确认应用</button></div></section>}
   {state?.review&&<DesktopPairingReview/>}
   {state?.permissions&&<DesktopPermissions key={state.permissions.id} state={state} busy={blocked||state.busy} act={run}/>}
   {state?.applicationPermissions&&<DesktopApplications key={state.applicationPermissions.reviewId} draft={state.applicationPermissions} state={state} busy={blocked||state.busy} act={run}/>}
   {state?.selection&&<button type="button" className={button} onClick={()=>void act('picker.cancel',{id:state.selection!.id})}>取消系统选择</button>}
   {state?.notice&&<p role="status" className="text-sm text-primary">{state.notice}</p>}
   {!!state?.profiles.length&&<ConnectComputerButton label="连接其他电脑" onConnected={d=>{void choose(d.id)}}/>}
   <p className="text-xs leading-6 text-muted-foreground">打开软件会恢复最近选择的电脑。连接本机无需单独开启连接器；网站可以以后添加。任务操作继续使用原有审批。</p>
  </div>}
  {error&&<p role="alert" className="mt-2 rounded-lg bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}
 </section>
}
