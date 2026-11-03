import {useEffect,useRef,useState} from 'react'
import {deviceTools,localApi,type LocalDevice,type LocalJob} from '@/lib/localDevices'
import {deviceConnectionState} from '@/lib/localConnectionSetup'
import {decodeRhToken} from '@/lib/studioAuth'
import {useDesktopComputer} from './DesktopComputerContext'
import {ApplicationTaskLauncher} from './ApplicationTaskLauncher'
import {applicationFailure} from '../../../local-executor/application-feedback.mjs'
type App={id:string;name:string;adapter:'desktop'|'codex';control:boolean;allowWrite?:boolean}
type AppWindow={id:string;title:string}
type Observation={diagnostic?:string;imageDiagnostic?:{message:string};observation:string;window:AppWindow;controls:{id:number;name:string;type:string;enabled:boolean;password:boolean;actions?:string[];value?:string}[];truncated?:boolean}
type Task={id:string;status:string;result:string;error:string|null}
const button='min-h-10 rounded-lg border border-border bg-card px-3 text-sm disabled:opacity-40',field='min-h-10 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm'
function ApplicationSession({device,statusVerified,onBusyChange}:{device:LocalDevice;statusVerified:boolean;onBusyChange:(busy:boolean)=>void}){
 const computer=useDesktopComputer(),tools=deviceTools(device),profile=computer?.state?.profiles.find(p=>p.id===device.id)
 const candidates=tools.flatMap(t=>Array.isArray(t.inputSchema['x-studio-applications'])?t.inputSchema['x-studio-applications']:[])
 const apps:App[]=[...new Map(candidates.filter((g):g is App=>!!g&&typeof g==='object'&&typeof g.id==='string'&&/^[a-f0-9]{24}$/.test(g.id)&&typeof g.name==='string'&&['desktop','codex'].includes(g.adapter)).map(g=>[g.id,g])).values()]
 const [app,setApp]=useState(''),[windows,setWindows]=useState<AppWindow[]>([]),[windowId,setWindowId]=useState(''),[observation,setObservation]=useState<Observation|null>(null),[element,setElement]=useState(''),[text,setText]=useState(''),[key,setKey]=useState('Enter')
 const [prompt,setPrompt]=useState(''),[root,setRoot]=useState(''),[write,setWrite]=useState(false),[task,setTask]=useState<Task|null>(null),[taskList,setTaskList]=useState<{id:string;status:string;workspace:string}[]>([]),[job,setJob]=useState<LocalJob|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[receipt,setReceipt]=useState(''),[launchState,setLaunchState]=useState(''),[observedAt,setObservedAt]=useState(0),[now,setNow]=useState(Date.now()),[taskPreparing,setTaskPreparing]=useState(false)
 const alive=useRef(true),owner=useRef(decodeRhToken()?.sub),locked=useRef(false),action=useRef(''),active=useRef({device,statusVerified})
 active.current={device,statusVerified}
 const appId=apps.some(g=>g.id===app)?app:apps[0]?.id||'',selected=apps.find(g=>g.id===appId),pending=!!job&&['queued','running'].includes(job.status)
 const chosenControl=observation?.controls.find(c=>String(c.id)===element)
 const observationExpired=!!observation&&now-observedAt>=30000
 const supports=(kind:string)=>!!chosenControl&&(!chosenControl.actions||chosenControl.actions.includes(kind))
 useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer)},[])
 const valid=()=>alive.current&&!!owner.current&&decodeRhToken()?.sub===owner.current
 const available=statusVerified&&deviceConnectionState(device)==='online',blocked=busy||pending||taskPreparing||!available
 const can=(name:string)=>{const t=tools.find(t=>t.name===name);return !!t&&Array.isArray((t.inputSchema.properties as Record<string,{enum?:unknown[]}>|undefined)?.app?.enum)&&(t.inputSchema.properties as Record<string,{enum:unknown[]}>).app.enum.includes(appId)}
 const rootSchema=(tools.find(t=>t.name==='apps.task_start')?.inputSchema.properties as Record<string,{enum?:string[]}>|undefined)?.root
 const roots=rootSchema?.enum||[],rootId=roots.includes(root)?root:roots[0]||''
 const taskWriteAllowed=selected?.allowWrite===true&&tools.find(t=>t.name==='apps.task_start')?.inputSchema['x-studio-app-workspace-write']===true
 useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[])
 useEffect(()=>{onBusyChange(busy||pending||taskPreparing);return()=>onBusyChange(false)},[busy,pending,taskPreparing,onBusyChange])
 useEffect(()=>{
  if(!job?.id||!pending)return
  const controller=new AbortController();let reading=false
  const poll=async()=>{if(reading||!valid())return;reading=true;try{const next=await localApi<LocalJob>('/api/local-jobs/'+job.id,undefined,controller.signal);if(controller.signal.aborted||!valid())return;setJob(next)
   if(next.status==='succeeded'){setError('');let value:unknown;try{value=JSON.parse(next.result)}catch{throw Error('回执格式无法核验，请查看原始回执。')}
    const data=value as {status?:string;message?:string;windows?:AppWindow[];observation?:string;id?:string;tasks?:{id:string;status:string;workspace:string}[]}
    if(action.current==='apps.windows'||action.current==='apps.launch'){const rows=(data.windows||[]).filter(w=>typeof w.id==='string'&&typeof w.title==='string');setWindows(rows);setWindowId(rows[0]?.id||'');setLaunchState(rows.length?'已发现 '+rows.length+' 个窗口，可继续观察或创建应用任务。':data.status==='waiting_window'?'应用启动已受理，但窗口尚未就绪。请检查启动弹窗后刷新窗口；不会重复启动。':'未发现可用窗口。应用可能尚未启动、正在启动或窗口版本不匹配。')}
    if(action.current==='apps.observe'&&data.observation){const o=value as Observation;setObservation(o);setObservedAt(Date.now());setNow(Date.now());setElement(String(o.controls.find(c=>c.enabled&&!c.password)?.id??''))}
    if(action.current==='apps.observe'&&!data.observation&&data.message){setObservation(null);const rows=(data.windows||[]).filter(w=>typeof w.id==='string'&&typeof w.title==='string');setWindows(rows);setWindowId(rows[0]?.id||'');setLaunchState(data.message)}
    if(action.current.startsWith('apps.task_')&&data.id)setTask(value as Task)
    if(action.current==='apps.task_list')setTaskList(data.tasks||[])
    setReceipt(action.current==='apps.act'?'应用已接收操作。请重新观察窗口，核对应用中的实际结果。':action.current==='apps.launch'?'系统已接收启动请求。可见窗口列在下方，尚未验证应用内任务。':next.result)
   }else if(!['queued','running'].includes(next.status)){
    const failure=applicationFailure(next);setError(failure.message);setReceipt(failure.receipt);setObservation(null)
    if(action.current==='apps.launch'||action.current==='apps.windows'){setWindows([]);setWindowId('');setLaunchState('')}
   }
  }catch(e){if(!controller.signal.aborted&&valid())setError((e as Error).message+'；不会自动重新执行。')}finally{reading=false}}
  const timer=setInterval(()=>void poll(),800);void poll();return()=>{controller.abort();clearInterval(timer)}
 },[job?.id,pending])
 const perform=async(tool:string,args:Record<string,unknown>)=>{
  if(locked.current||pending||!valid()||!active.current.statusVerified||deviceConnectionState(active.current.device)!=='online'||!can(tool))return
  locked.current=true;setBusy(true);setError('');setReceipt('');action.current=tool;if(tool!=='apps.act')setObservation(null)
  try{const next=await localApi<{id:string}>('/api/local-devices/'+device.id+'/jobs',{tool,arguments:{app:appId,...args},confirm:true,request_id:crypto.randomUUID()});if(valid())setJob({id:next.id,status:'queued',result:'',error:''})}catch(e){if(valid())setError((e as Error).message+'；提交状态未确认时，请先检查调用记录，避免重复操作。')}finally{locked.current=false;if(valid())setBusy(false)}
 }
 const changeApp=(id:string)=>{setApp(id);setWindows([]);setWindowId('');setObservation(null);setTask(null);setTaskList([]);setJob(null);setReceipt('');setError('');setText('');setWrite(false);setLaunchState('')}
 const act=(kind:string)=>{if(!observation||observationExpired||!supports(kind))return;const token=observation.observation;setObservation(null);void perform('apps.act',{observation:token,element:Number(element),action:kind,...(kind==='type'?{text}:kind==='key'?{key}:{})})}
 const authorize=()=>{if(!profile||!computer)return;computer.setExpanded(true);void computer.act('applications.open',{id:profile.id,fingerprint:profile.fingerprint})}
 return <section aria-label="本地应用工作区" className="space-y-4">
  <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-semibold">本地应用</h3><p className="mt-1 text-xs leading-6 text-muted-foreground">已授权应用可供当前电脑的 Agent 调用；也可在这里直接检查。发送信息、删除等操作需核对目标和内容后确认。</p></div>{profile&&<button type="button" className={button} disabled={busy||pending||taskPreparing||computer?.busy||!computer?.verified||!!computer?.state?.permissions||!!computer?.state?.applicationPermissions} onClick={authorize}>管理应用授权</button>}</div>
  {!apps.length?<p className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground">尚未开放应用能力。在主界面的“应用授权”勾选应用并保存，恢复连接后刷新设备即可。网页版不能代替本人创建本机应用授权。</p>:<>
   <label className="block text-sm">选择已授权应用<select aria-label="选择已授权应用" className={field} value={appId} disabled={busy||pending||taskPreparing} onChange={e=>changeApp(e.target.value)}>{apps.map(g=><option key={g.id} value={g.id}>{g.name} · {g.adapter==='codex'?'任务接口':'窗口操作'}</option>)}</select></label>
   {selected?.adapter==='desktop'?<>
    <ApplicationTaskLauncher key={appId} app={selected} deviceId={device.id} disabled={blocked} onPreparing={setTaskPreparing}/>
    <p className="text-xs text-muted-foreground">下方为手动检查工具；仅点击启动应用不会执行上面填写的任务。冷启动会等待窗口就绪。</p>
    <div className="flex flex-wrap gap-2"><button type="button" className={button} disabled={blocked||!can('apps.launch')} onClick={()=>void perform('apps.launch',{})}>启动应用</button><button type="button" className={button} disabled={blocked||!can('apps.windows')} onClick={()=>void perform('apps.windows',{})}>刷新应用窗口</button></div>
    {launchState&&<p role="status" className="rounded-lg bg-secondary p-3 text-sm">{launchState}</p>}
    <label className="block text-sm">应用窗口<select aria-label="应用窗口" className={field} value={windowId} disabled={blocked} onChange={e=>{setWindowId(e.target.value);setObservation(null)}}><option value="">选择窗口</option>{windows.map(w=><option key={w.id} value={w.id}>{w.title}</option>)}</select></label>
    <button type="button" className={button} disabled={blocked||!windowId||!can('apps.observe')} onClick={()=>void perform('apps.observe',{window:windowId})}>观察窗口与控件</button>
    {observation&&<div className="space-y-3 rounded-xl border p-4"><p className="text-xs text-muted-foreground">{observationExpired?'观察已过期，请重新点击“观察窗口与控件”。':'观察剩余 '+Math.max(0,30-Math.floor((now-observedAt)/1000))+' 秒，只可执行一次。'}操作会在主界面请求确认，确认后核对控件身份再执行。</p>{!!job?.images?.length&&<img className="max-h-96 max-w-full rounded-lg border object-contain" alt="已授权应用窗口截图" src={'data:'+job.images[0].mimeType+';base64,'+job.images[0].data}/>}
     <label className="block text-sm">目标控件<select className={field} aria-label="目标控件" value={element} disabled={blocked} onChange={e=>setElement(e.target.value)}><option value="">选择控件</option>{observation.controls.filter(c=>c.enabled&&!c.password).map(c=><option key={c.id} value={c.id}>{c.id} · {c.name||c.type}</option>)}</select></label>
     {chosenControl?.value&&<div aria-label="当前控件内容" className="rounded-lg bg-secondary p-3 text-sm"><p className="text-xs text-muted-foreground">观察时的控件内容（操作后需重新观察核对）</p><pre className="whitespace-pre-wrap break-all">{chosenControl.value}</pre></div>}
     {!observation.controls.some(c=>c.enabled&&!c.password)&&<p role="status" className="text-sm">该界面没有提供可操作的 Windows 控件，当前不能可靠调度。可使用该软件提供的任务接口或专用适配器。</p>}
     {observation.diagnostic&&<p role="status" className="text-sm text-amber-700">{observation.diagnostic}</p>}{observation.imageDiagnostic&&<p role="status" className="text-sm text-amber-700">{observation.imageDiagnostic.message}</p>}{observation.truncated&&<p className="text-xs text-muted-foreground">控件过多，本次显示部分控件。切换到具体界面后重新观察。</p>}
     {can('apps.act')?<><label className="block text-sm">输入内容<textarea className={field} maxLength={4000} value={text} disabled={blocked} onChange={e=>setText(e.target.value)}/></label><div className="flex flex-wrap gap-2"><button type="button" className={button} disabled={blocked||!element||observationExpired||!supports('click')} onClick={()=>act('click')}>点击控件</button><button type="button" className={button} disabled={blocked||!element||!text||observationExpired||!supports('type')} onClick={()=>act('type')}>输入到控件</button><select aria-label="应用按键" className={button} value={key} disabled={blocked} onChange={e=>setKey(e.target.value)}>{['Enter','Tab','Escape','Backspace','Delete','Up','Down','Left','Right','Home','End','PageUp','PageDown'].map(k=><option key={k}>{k}</option>)}</select><button type="button" className={button} disabled={blocked||!element||observationExpired||!supports('key')} onClick={()=>act('key')}>向控件按键</button></div></>:<p className="text-sm text-muted-foreground">该应用仅授权启动和观察；点击、输入需要在应用授权中开启。</p>}
    </div>}
   </>:<div className="space-y-3 rounded-xl border p-4"><h4 className="font-medium">Codex 任务</h4><label className="block text-sm">已授权工作目录<select className={field} value={rootId} disabled={blocked} onChange={e=>setRoot(e.target.value)}>{roots.map(r=><option key={r}>{r}</option>)}</select></label><label className="block text-sm">任务内容<textarea className={field} rows={4} value={prompt} maxLength={8000} disabled={blocked} onChange={e=>setPrompt(e.target.value)} placeholder="描述希望 Codex 在所选目录完成的任务"/></label><label className="flex gap-2 text-sm"><input type="checkbox" checked={write} disabled={blocked||!taskWriteAllowed&&!write} onChange={e=>setWrite(e.target.checked)}/>申请修改此工作目录（需要相应授权）</label>{!taskWriteAllowed&&<p className="text-xs text-muted-foreground">当前仅可提交只读任务；修改项目需在应用授权中开启 Codex 写入，并授权可写工作目录。</p>}<p className="text-xs text-muted-foreground">使用本机 Codex CLI 的已有登录，可能消耗模型额度；默认只读，不开放完全访问模式。工作目录需满足 Codex 的 Git 检查。</p><div className="flex flex-wrap gap-2"><button type="button" className={button} disabled={blocked||!can('apps.task_start')||!rootId||!prompt.trim()||write&&!taskWriteAllowed} onClick={()=>void perform('apps.task_start',{root:rootId,prompt,write})}>提交 Codex 任务</button><button type="button" className={button} disabled={blocked||!can('apps.task_list')} onClick={()=>void perform('apps.task_list',{})}>查看本机任务</button>{task&&<><button type="button" className={button} disabled={blocked} onClick={()=>void perform('apps.task_status',{task:task.id})}>刷新任务结果</button><button type="button" className={button} disabled={blocked||task.status!=='running'} onClick={()=>void perform('apps.task_cancel',{task:task.id})}>停止此任务</button></>}</div>{taskList.length>0&&<div className="space-y-2"><p className="text-xs text-muted-foreground">此连接启动的任务（断开后不自动重交）</p>{taskList.map(t=><button type="button" key={t.id} className={button+' mr-2 break-all'} disabled={blocked} onClick={()=>void perform('apps.task_status',{task:t.id})}>{t.id.slice(-8)} · {t.workspace} · {t.status}</button>)}</div>}{task&&<div role="status" className="space-y-2 text-sm"><p>任务 {task.id} · {task.status}</p><pre className="max-h-96 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-secondary p-3">{task.result||task.error||'等待软件返回结果'}</pre></div>}</div>}
  </>}
  {(busy||pending)&&<p role="status" aria-label="应用操作进行中" className="text-sm text-primary">正在处理。若需要确认，请在主界面展开的“本次应用操作”中核对并批准。</p>}
  {job&&pending&&<button type="button" className={button} onClick={()=>void localApi('/api/local-jobs/'+job.id+'/cancel',{}).catch(()=>setError('停止请求未确认，请核对本机。'))}>停止等待本次操作</button>}
  {error&&<p role="alert" className="rounded-lg bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}
  {receipt&&<details className="rounded-lg border p-3"><summary className="cursor-pointer text-sm">本次操作回执</summary><pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-all text-xs">{receipt}</pre></details>}
 </section>
}
export function ApplicationWorkspace(props:{device:LocalDevice;statusVerified:boolean;onBusyChange:(busy:boolean)=>void}){return <ApplicationSession key={(decodeRhToken()?.sub||'')+':'+props.device.id} {...props}/>}
