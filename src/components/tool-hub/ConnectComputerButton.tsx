import {useEffect,useRef,useState} from 'react'
import {CheckCircle2,Download,FolderOpen,Globe2,Loader2,Monitor,ShieldCheck} from 'lucide-react'
import {Dialog,DialogContent,DialogDescription,DialogHeader,DialogTitle} from '@/components/ui/dialog'
import {confirmInStudio} from '@/lib/studioDialogs'
import {localApi,deviceTools,type LocalDevice} from '@/lib/localDevices'
import {decodeRhToken} from '@/lib/studioAuth'
import {getPocketBaseUrl} from '@/lib/pb'
import {parseLocalDeviceInventory} from '@/lib/localDeviceInventory'
import {connectionSetupProgress} from '@/lib/localConnectionProgress'
import {ConnectorDownload} from './ConnectorDownload'
import {connectionOrigins,connectionServer,validateConnectionTicket,deviceConnectionState,connectionCapabilitiesReady,type LocalConnectionMode,type LocalConnectionTicket} from '@/lib/localConnectionSetup'

const primary='inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50'
const secondary='inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-border bg-background px-3 text-sm hover:bg-secondary disabled:opacity-50'
const field='mt-2 min-h-11 w-full min-w-0 rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20'
type Props={mode?:LocalConnectionMode;label?:string;className?:string;successLabel?:string;onConnected?:(device:LocalDevice)=>void;continueDevice?:LocalDevice}
export function ConnectComputerButton({mode='both',label='连接电脑 / 浏览器',className=primary,successLabel='完成，返回设备列表',onConnected,continueDevice}:Props){
  const [open,setOpen]=useState(false)
  return <><button type="button" className={className} onClick={()=>setOpen(true)}><Monitor className="h-4 w-4 shrink-0"/>{label}</button>
    {open&&<ConnectionWizard mode={mode} continueDevice={continueDevice} successLabel={successLabel} onConnected={device=>{onConnected?.(device);setOpen(false)}} onClose={()=>setOpen(false)}/>}</>
}
function ConnectionWizard({mode:initialMode,successLabel,onConnected,onClose,continueDevice}:Required<Pick<Props,'successLabel'|'onConnected'>>&{mode:LocalConnectionMode;onClose:()=>void;continueDevice?:LocalDevice}){
  const owner=decodeRhToken()?.sub||''
  const originalOwner=useRef(owner)
  const [mode,setMode]=useState<LocalConnectionMode>(initialMode)
  const continueTarget=useRef(continueDevice).current
  const [name,setName]=useState(continueTarget?.name||'我的电脑'),[websites,setWebsites]=useState('')
  const [bindingObserved,setBindingObserved]=useState(false)
  const [consent,setConsent]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('')
  const [componentReady,setComponentReady]=useState(false)
  const [ticket,setTicket]=useState<LocalConnectionTicket|null>(null)
  const [device,setDevice]=useState<LocalDevice|null>(null),[pollError,setPollError]=useState('')
  const [now,setNow]=useState(Date.now())
  const alive=useRef(true),requestBusy=useRef(false)
  useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[])
  let origins:string[]=[],inputError='',server=''
  try{server=connectionServer(new URL(getPocketBaseUrl(),window.location.origin).href);origins=mode==='files'?[]:connectionOrigins(websites)}catch(e){inputError=String((e as Error).message)}
  const activeOwner=!!owner&&owner===originalOwner.current
  const ready=activeOwner&&!!device&&deviceConnectionState(device,now)==='online'&&!!ticket&&connectionCapabilitiesReady(ticket,deviceTools(device).map(t=>t.name))
  const expired=!!ticket&&now>=ticket.pairing.expiresAt
  const paired=activeOwner&&(bindingObserved||device?.paired===true||Number(device?.seen_ms)>0)
  const preparation=activeOwner&&!pollError&&!paired&&!expired?connectionSetupProgress(device,now):null
  useEffect(()=>{
    if(!ticket||!activeOwner)return
    const controller=new AbortController();let pending=false
    const poll=async()=>{
      setNow(Date.now())
      if(pending||document.visibilityState==='hidden')return
      pending=true
      try{
        const rows=parseLocalDeviceInventory(await localApi<unknown>('/api/local-devices',undefined,controller.signal))
        const found=rows.find(row=>row.id===ticket.pairing.id)
        if(!found)throw Error('当前账号无法确认这条设备记录；请关闭向导后重新读取设备，勿重复配对。')
        if(!controller.signal.aborted&&decodeRhToken()?.sub===originalOwner.current){
          setDevice(found);setPollError('')
          if(found.paired===true||found.seen_ms>0)setBindingObserved(true)
        }
      }catch(e){if(!controller.signal.aborted){setDevice(null);setPollError(String((e as Error).message||'无法确认设备状态'))}}
      finally{pending=false}
    }
    void poll();const timer=window.setInterval(()=>void poll(),2500)
    window.addEventListener('focus',poll)
    return()=>{controller.abort();window.clearInterval(timer);window.removeEventListener('focus',poll)}
  },[ticket,activeOwner])
  const download=(value:LocalConnectionTicket)=>{
    const blob=new Blob([JSON.stringify(value,null,2)],{type:'application/json'})
    const url=URL.createObjectURL(blob),a=document.createElement('a')
    a.href=url;a.download='agent-studio-connect.json';a.click();window.setTimeout(()=>URL.revokeObjectURL(url),1000)
  }
  const generate=async()=>{
    if(requestBusy.current||!activeOwner||paired||device?.revoked||pollError)return
    requestBusy.current=true;setBusy(true);setError('')
    try{
      if(inputError||!componentReady||!consent||!name.trim()||(mode!=='files'&&!origins.length))throw Error(inputError||'请确认用途和授权范围。')
      if(continueTarget&&(!/^[A-Za-z0-9]{24}$/.test(continueTarget.id)||continueTarget.paired!==false||continueTarget.revoked||continueTarget.seen_ms>0))
        throw Error('这条记录不能作为未配对设备继续，请先重新核对设备状态。')
      const targetId=ticket?.pairing.id||continueTarget?.id
      const pairing=await localApi<{id:string;pairing_code:string;expires_ms:number}>(targetId?'/api/local-devices/'+targetId+'/renew-pairing':'/api/local-devices',{name:name.trim()})
      if(!alive.current||decodeRhToken()?.sub!==originalOwner.current)return
      const next=validateConnectionTicket({format:'agent-studio-connect-v1',server,name:name.trim(),mode,origins,
        pairing:{id:pairing.id,code:pairing.pairing_code,expiresAt:pairing.expires_ms}})
      setTicket(next);setDevice(null);setBindingObserved(false);setNow(Date.now());download(next)
    }catch(e){if(alive.current)setError(String((e as Error).message||'连接文件未生成，请重试'))}
    finally{requestBusy.current=false;if(alive.current)setBusy(false)}
  }
  const close=async()=>{
    if(busy)return
    if(activeOwner&&ticket&&!ready&&!paired&&!expired&&!await confirmInStudio('关闭后停止自动检测。已下载连接文件仍在五分钟有效期内；不要发送给其他人。确认关闭？'))return
    onClose()
  }
  return <Dialog open onOpenChange={open=>{if(!open)void close()}}><DialogContent aria-label="连接电脑与浏览器向导" className="flex max-h-[92dvh] w-[calc(100vw-1.5rem)] max-w-2xl min-w-0 flex-col gap-0 overflow-hidden rounded-2xl p-0">
    <DialogHeader className="shrink-0 border-b border-border px-5 py-5 pr-12 sm:px-6"><DialogTitle>连接电脑与浏览器</DialogTitle><DialogDescription>默认 Google Chrome 独立浏览器；连接文件自动绑定账号，无需填写参数或配对码。</DialogDescription></DialogHeader>
    <div className="min-h-0 space-y-5 overflow-y-auto p-5 sm:p-6">
      <ol aria-label="连接进度" className="grid grid-cols-3 gap-2 text-xs"><li className="rounded-lg bg-secondary p-2">1 · 选择用途</li><li className={'rounded-lg p-2 '+(ticket&&!paired&&!ready?'bg-primary/10 text-primary':'bg-secondary')}>2 · 本机确认启动</li><li className={'rounded-lg p-2 '+(paired||ready?'bg-primary/10 text-primary':'bg-secondary')}>3 · 自动确认上线</li></ol>
      {!activeOwner&&<p role="alert" className="text-sm text-destructive">账号状态发生变化，请关闭向导并重新登录。</p>}
      {!activeOwner?<p className="text-sm text-muted-foreground">为保护原账号的设备凭证，请关闭后重新打开连接向导。</p>:!ticket?<>
        <ConnectorDownload/>
        <label className="flex items-start gap-2 rounded-xl border border-border p-3 text-sm"><input type="checkbox" className="mt-1" checked={componentReady} onChange={e=>setComponentReady(e.target.checked)}/><span>我已解压连接器并打开本机管理窗口（已有可用组件也可）</span></label>
        {continueTarget&&<p role="status" className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-sm leading-6">继续「{continueTarget.name}」原有登记，不新增同名设备。请重新核对本次用途和网站；下载新文件后，之前未使用的配对文件将失效。</p>}
        <div role="group" aria-label="连接用途" className="grid gap-2 sm:grid-cols-3">{([{id:'browser',name:'仅浏览器',desc:'打开授权网站',icon:Globe2},{id:'files',name:'文件与表格',desc:'选择具体工作文件夹',icon:FolderOpen},{id:'both',name:'浏览器 + 文件',desc:'一次接入两类能力',icon:Monitor}] as const).map(item=><button type="button" key={item.id} aria-pressed={mode===item.id} onClick={()=>{setMode(item.id);setConsent(false)}} className={'min-w-0 rounded-xl border p-3 text-left '+(mode===item.id?'border-primary bg-primary/5':'border-border hover:bg-secondary')}><item.icon className="h-5 w-5 text-primary"/><strong className="mt-2 block text-sm">{item.name}</strong><span className="mt-1 block text-xs text-muted-foreground">{item.desc}</span></button>)}</div>
        <label className="block text-sm font-medium">电脑名称<input className={field} value={name} maxLength={80} readOnly={!!continueTarget} onChange={e=>setName(e.target.value)}/></label>
        {mode!=='files'&&<label className="block text-sm font-medium">允许浏览器访问的网站<textarea className={field} rows={2} value={websites} maxLength={6000} onChange={e=>{setWebsites(e.target.value);setConsent(false)}} placeholder={'例如 https://example.com\n每行一个网站'}/><span className="mt-1 block text-xs font-normal text-muted-foreground">授权整站来源（协议、域名和端口）。连接后可直接在工作台「授权管理 → 网站」中随时增删，无需重新配对。</span></label>}
        {origins.length>0&&<p className="break-all rounded-lg bg-secondary/40 p-3 text-xs">将授权：{origins.join('、')}</p>}
        <div className="rounded-xl border border-border bg-secondary/25 p-4 text-xs leading-6"><p className="flex items-center gap-2 font-semibold"><ShieldCheck className="h-4 w-4"/>授权范围</p><p>{mode==='browser'?'只启用独立浏览器；不开放本地文件工具。':'在本机界面可选择一个文件或工作文件夹；单文件仅只读该文件，不开放父目录。文件夹默认只读，允许新建须明确选择；后续可在「管理授权」中变更。'}</p><p>不接管日常浏览器登录、不开放整桌面、不安装后台服务。实际操作仍需批准。</p></div>
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={consent} onChange={e=>setConsent(e.target.checked)}/><span>我在自己的电脑上操作，并同意以上访问范围。</span></label>
        {inputError&&<p role="alert" className="text-xs text-destructive">{inputError}</p>}
      </>:ready?<div role="status" className="rounded-2xl border border-primary/30 bg-primary/5 p-6"><CheckCircle2 className="h-8 w-8 text-primary"/><h3 className="mt-3 font-semibold">{device?.name} 已在线</h3><p className="mt-2 text-sm text-muted-foreground">已收到本机心跳与所选能力清单。连接成功不等于任务已经执行；接下来选择任务并批准具体操作。</p><p className="mt-3 text-xs text-muted-foreground">以后无需重新配对，在本地恢复连接即可。</p></div>:<>
        <section className="space-y-3 rounded-xl border border-border p-4"><h3 className="font-semibold">在本机导入连接文件并确认</h3><p className="text-sm leading-6 text-muted-foreground">双击独立便携包中的 <strong>Start-Connector.cmd</strong>，应打开“Agent Studio · 电脑连接器”本机窗口。在顶部选择刚下载的 <strong>JSON 连接文件</strong>，核对账号、授权网站和文件夹，再勾选本人确认并点击“确认连接并启动”。CMD 仅代表程序已启动，必须完成此步骤才会绑定新设备。</p><p className="text-xs text-muted-foreground">如果本机窗口没有出现，请先检查任务栏 Chrome；重新下载更新版连接器即可修复旧版可能只打开工作台、不显示连接文件入口的问题。保持 CMD 进程运行；关闭后连接会离线。</p></section>        <div role="status" className="flex items-start gap-3 rounded-xl bg-secondary/40 p-4">
          {device?.revoked||pollError||expired&&!paired?<ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground"/>:<Loader2 className="mt-0.5 h-5 w-5 shrink-0 animate-spin text-primary"/>}
          <div className="min-w-0"><p className="text-sm font-semibold">{device?.revoked?'此设备连接已撤销':pollError?'当前无法核实上线状态':device&&deviceConnectionState(device,now)==='online'?'已收到心跳，等待所选能力就绪':paired?'配对已完成，等待连接器启动':expired?'连接文件已过期，尚未核实上线':preparation?.label||'等待本机导入连接文件并确认授权'}</p>
          <p className="mt-2 text-xs leading-6 text-muted-foreground">{device?.revoked?'请返回设备列表核对，不能恢复已撤销授权。':paired?'一次性凭证已使用，不需要重新下载或配对。请保留本机终端；已保存连接可从双击入口恢复，网页仍在等待真实心跳。':!expired?'连接文件剩余 '+Math.max(0,Math.ceil((ticket.pairing.expiresAt-now)/1000))+' 秒有效；仅限本人，勿转发。':'仅为尚未配对的当前记录更新凭证，不会新建重复设备；若本机显示已配对，请先核实状态。'}</p>
          {preparation&&<p data-setup-progress role="status" className="mt-2 text-xs leading-6 text-muted-foreground">{preparation.detail}</p>}
          {paired&&!device?.revoked&&<details className="mt-2 text-xs"><summary className="cursor-pointer font-semibold text-primary">已有本机配置？恢复原连接</summary><p className="mt-2 leading-6">在便携连接器本机窗口的“我的已保存连接”中选择此设备并点击“恢复连接”。已绑定设备不用重新导入连接文件，不需要任何开发命令。</p></details>}
          </div></div>
        {pollError&&<p role="alert" className="text-sm text-destructive">{pollError}。未将未知状态标为已连接。</p>}
        <details className="text-xs leading-6 text-muted-foreground"><summary className="cursor-pointer">没有上线？检查这里</summary><p>请确认已经完整解压便携包、Chrome 已打开本机连接器窗口、连接文件尚未过期，且已经在本机选择 JSON 文件、核对授权范围并点击确认。新连接默认 Google Chrome；未安装时请先安装，系统不会自动退回 Edge。</p><p className="break-all">当前服务器：{ticket.server}</p>{/localhost|127\.0\.0\.1|\[::1\]/.test(new URL(ticket.server).hostname)&&<p>这是本机预览地址，只能在同一台电脑使用。另一台电脑需通过可达的 HTTPS 系统地址重新生成连接文件。</p>}<p>需要登录网站时，在连接器的独立浏览器中登录；不会读取你日常浏览器的密码和 Cookie。</p><p>旧设备已在线时直接返回列表使用。便携包自带运行环境，不需要安装 Node.js、pnpm 或项目源码；首次连接必须在本机确认。仅有 CMD 启动提示不代表配对成功。</p></details>
      </>}
      {error&&<p role="alert" className="rounded-xl bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}
    </div>
    <footer className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-border bg-card p-4"><button type="button" className={secondary} disabled={busy} onClick={()=>void close()}>{ready?'关闭':'稍后继续'}</button>
      {ready&&device?<button type="button" className={primary} onClick={()=>onConnected(device)}>{successLabel}</button>:!ticket?<button type="button" className={primary} disabled={busy||!activeOwner||!componentReady||!consent||!name.trim()||!!inputError||(mode!=='files'&&!origins.length)} onClick={()=>void generate()}>{busy?<Loader2 className="h-4 w-4 animate-spin"/>:<Download className="h-4 w-4"/>}{continueTarget?'更新此设备的连接文件':'生成并下载连接文件'}</button>:paired||device?.revoked?null:expired?<button type="button" className={primary} disabled={busy||!activeOwner||!!pollError} onClick={()=>void generate()}>重新生成连接文件</button>:<button type="button" disabled={!activeOwner||busy||!!pollError} className={secondary} onClick={()=>download(ticket)}><Download className="h-4 w-4"/>重新下载</button>}
    </footer>
  </DialogContent></Dialog>
}
