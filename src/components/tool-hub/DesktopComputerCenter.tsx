import {useCallback,useEffect,useRef,useState} from 'react'
import {Monitor,ShieldCheck,RefreshCw} from 'lucide-react'
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from '@/components/ui/dialog'
import {desktopConnectionBridge,type DesktopComputerState} from '@/lib/desktopConnectionBridge'
import {desktopComputerRequest,syncDesktopSession} from '@/lib/desktopComputer'
import {pb} from '@/lib/pb'
import {decodeRhToken} from '@/lib/studioAuth'
import {ConnectComputerButton} from './ConnectComputerButton'
import {DesktopPermissions} from './DesktopPermissions'
import {DesktopPairingReview} from './DesktopPairingReview'
const button='min-h-10 rounded-lg border border-border bg-background px-3 text-sm font-medium hover:bg-secondary disabled:opacity-40'
const stateLabel:Record<string,string>={online:'已在线',starting:'正在连接',stopping:'正在暂停',stopped:'已暂停',failed:'连接失败','needs-check':'需要检查'}
export function DesktopComputerCenter(){
 const desktop=desktopConnectionBridge()
 const [open,setOpen]=useState(false),[state,setState]=useState<DesktopComputerState|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[consent,setConsent]=useState(false)
 const [verified,setVerified]=useState(false)
 const alive=useRef(true),generation=useRef(0),locked=useRef(false),polling=useRef(false),mutation=useRef(0)
 const owner=decodeRhToken()?.sub||''
 const refresh=useCallback(async()=>{
  if(polling.current||locked.current||!pb.authStore.isValid)return
  polling.current=true;const n=generation.current,m=mutation.current,account=decodeRhToken()?.sub
  try{const value=await desktopComputerRequest('state');if(alive.current&&n===generation.current&&m===mutation.current&&account===decodeRhToken()?.sub){setState(value);setVerified(true);setError('')}}catch(e){if(alive.current&&n===generation.current&&m===mutation.current){setVerified(false);setError((e as Error).message)}}finally{polling.current=false}
 },[])
 useEffect(()=>{
  if(!desktop)return
  alive.current=true
  const sessionChanged=()=>{const n=++generation.current;setState(null);setVerified(false);setConsent(false);void syncDesktopSession().then(value=>{if(alive.current&&generation.current===n){setState(value);setVerified(true);setError('');void refresh()}},e=>{if(alive.current&&generation.current===n)setError(e.message)})}
  const unsubscribe=pb.authStore.onChange(sessionChanged)
  const off=desktop.onConnectionRequested(()=>{setOpen(true);void refresh()})
  sessionChanged();const timer=setInterval(()=>void refresh(),5000)
  return()=>{alive.current=false;generation.current++;unsubscribe();off();clearInterval(timer)}
 },[desktop,refresh])
 const act=async(action:string,input?:Record<string,unknown>)=>{
  if(locked.current)return;locked.current=true;mutation.current++;setBusy(true);setError('');setConsent(false)
  const n=generation.current
  try{const value=await desktopComputerRequest(action,input);if(alive.current&&n===generation.current){setState(value);setVerified(true)}}catch(e){if(alive.current&&n===generation.current){setVerified(false);setError((e as Error).message)}}finally{locked.current=false;if(alive.current)setBusy(false)}
 }
 const confirmation=state?.confirmations[0]
 useEffect(()=>setConsent(false),[confirmation?.id])
 const connectionStatus=state?.profiles.map(p=>p.id+':'+p.state+':'+p.running).join(',')||''
 useEffect(()=>{if(desktop&&verified)window.dispatchEvent(new Event('studio-desktop-devices-changed'))},[desktop,verified,connectionStatus])
 if(!desktop)return null
 const online=verified&&state?.profiles.some(p=>p.state==='online'&&p.running)
 return <>{owner&&<button type="button" data-desktop-computer-launcher className="fixed bottom-4 right-5 z-30 inline-flex min-h-11 items-center gap-2 rounded-full border border-border bg-card px-4 text-xs font-semibold shadow-md hover:bg-secondary" onClick={()=>{setOpen(true);void refresh()}}><Monitor className="h-4 w-4"/><span className={'h-2 w-2 rounded-full '+(online?'bg-emerald-500':'bg-muted-foreground/50')}/>{online?'本机已连接':'本机电脑'}</button>}
  <Dialog open={open} onOpenChange={setOpen}><DialogContent data-desktop-computer-center className="max-h-[90dvh] max-w-3xl overflow-y-auto rounded-2xl"><DialogHeader><DialogTitle className="flex items-center gap-2"><Monitor className="h-5 w-5"/>本机电脑与授权</DialogTitle><DialogDescription>本机组件已内置并随软件启动。连接状态与授权都在此管理。</DialogDescription></DialogHeader>
   {!owner?<p className="rounded-xl bg-secondary p-4 text-sm">请先在本软件登录员工账号，再连接自己的电脑。</p>:<>
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-secondary/20 p-4"><div><p className="text-sm font-semibold">{verified?'本机组件已就绪':'正在核实本机连接'}</p><p className="mt-1 text-xs text-muted-foreground">只显示当前工作台、当前账号的本机连接。已授权的首选连接会自动恢复。</p></div><button type="button" className={button} disabled={busy} onClick={()=>void refresh()}><RefreshCw className="mr-1 inline h-4 w-4"/>刷新状态</button></div>
    {confirmation&&<section key={confirmation.id} className="space-y-3 rounded-xl border border-primary/40 bg-primary/5 p-4"><h3 className="flex items-center gap-2 font-semibold"><ShieldCheck className="h-5 w-5"/>请确认本机授权变更</h3><p className="whitespace-pre-wrap break-all text-sm leading-6">{confirmation.message}</p><p className="text-xs text-muted-foreground">此请求会超时失效；关闭窗口不会自动同意。</p><label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/>我已核对并同意本次变更。</label><div className="flex gap-2"><button type="button" className={button} disabled={busy||!verified} onClick={()=>void act('confirm',{id:confirmation.id,consent:false})}>拒绝</button><button type="button" className={button+' bg-primary text-primary-foreground'} disabled={busy||!verified||!consent} onClick={()=>void act('confirm',{id:confirmation.id,consent:true})}>确认应用</button></div></section>}
    {state?.profiles.map(profile=><article key={profile.id} className="space-y-3 rounded-xl border border-border p-4"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">{profile.name}</h3><span className={'rounded-full px-3 py-1 text-xs '+(verified&&profile.state==='online'?'bg-emerald-500/10 text-emerald-700':'bg-secondary text-muted-foreground')}>{verified?(stateLabel[profile.state]||'待核实'):'状态待核实'}</span></div><p className="break-all text-xs text-muted-foreground">{profile.server} · #{profile.id.slice(-6)}</p>{profile.message&&<p role="status" className="text-sm">{profile.message}</p>}<details className="text-sm"><summary className="cursor-pointer text-primary">查看当前授权范围</summary><div className="mt-2 space-y-1 break-all text-xs text-muted-foreground">{profile.roots.map(root=><p key={root.path}>{root.path}（{root.readOnly?'只读':'读取与新建'}）</p>)}{profile.origins.map(origin=><p key={origin}>{origin}</p>)}</div></details><div className="flex flex-wrap gap-2">{profile.running?<button type="button" className={button} disabled={busy||!verified} onClick={()=>void act('stop',{id:profile.id,consent:true})}>暂停连接</button>:<button type="button" className={button} disabled={busy||!verified} onClick={()=>void act('resume',{id:profile.id,fingerprint:profile.fingerprint,consent:true})}>恢复连接并设为自动连接</button>}<button type="button" className={button} disabled={busy||!verified} onClick={()=>void act('permissions.open',{id:profile.id,fingerprint:profile.fingerprint})}>管理授权</button></div></article>)}
    {state&&!state.profiles.length&&<p className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground">此账号尚无可用的本机连接。点击下方按钮，选择用途并确认范围即可。</p>}
    {state?.review&&<DesktopPairingReview/>}
    {state?.permissions&&<DesktopPermissions key={state.permissions.id} state={state} busy={busy||state.busy||!verified} act={act}/>}
    {state?.selection&&<button type="button" className={button} onClick={()=>void desktopComputerRequest('picker.cancel',{id:state.selection!.id}).then(setState,e=>setError(e.message))}>取消系统选择</button>}
    {state?.notice&&<p role="status" className="text-sm text-primary">{state.notice}</p>}
    <ConnectComputerButton label="连接这台电脑" onConnected={()=>{void refresh()}}/>
    <p className="text-xs leading-6 text-muted-foreground">暂停会保留账号绑定和授权。退出软件会停止本机连接；关闭主窗口后可从托盘恢复。Agent 执行操作仍需在任务中审批。</p>
   </>}
   {error&&<p role="alert" className="rounded-xl bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}
  </DialogContent></Dialog>
 </>
}
