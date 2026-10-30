import {useEffect,useId,useLayoutEffect,useRef,useState} from 'react'
import {ArrowUp,Copy,FileText,FolderOpen,Globe2,Loader2,Plus,Search,Square} from 'lucide-react'
import {confirmInStudio} from '@/lib/studioDialogs'
import {decodeRhToken} from '@/lib/studioAuth'
import {localApi,deviceTools,type LocalDevice,type LocalJob} from '@/lib/localDevices'
import {deviceConnectionState} from '@/lib/localConnectionSetup'
import {localActionName,localRelativePath,localChildPath,localParentPath,localWebAddress,localRootOptions,localTextPreviewable} from '@/lib/localDeviceActions'
import {localDirectorySnapshot,visibleLocalFiles,type LocalDirectorySnapshot} from '@/lib/localFileBrowser'
import {browserJobPresentation,browserResultText,localTestAddress} from '@/lib/browserNavigationFeedback'
type Action={tool:string;args:Record<string,string>;explanation:string}
const field='mt-1 min-h-10 w-full min-w-0 rounded-lg border border-input bg-background px-3 py-2 text-sm'
const button='inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-primary/30 bg-card px-3 text-xs font-semibold text-primary hover:bg-primary/5 disabled:opacity-40'
/** All effects require fresh approval. Filtering, cached back navigation and tab
 * changes are local views; they never enqueue work or claim a new result. */
export function DeviceQuickCheck({device,onBusyChange,statusVerified=true,mode='all'}:{device:LocalDevice;onBusyChange?:(busy:boolean)=>void;statusVerified?:boolean;mode?:'all'|'browser'}){
  const tools=deviceTools(device),fileTool=mode==='browser'?undefined:tools.find(t=>t.name==='files.list'),browserTool=tools.find(t=>t.name==='browser.browser_navigate')
  const rootOptions=localRootOptions(fileTool),roots=rootOptions.map(r=>r.id)
  const declaredOrigins=browserTool?.inputSchema['x-studio-allowed-origins']
  const browserChannel=browserTool?.inputSchema['x-studio-browser-channel']
  const browserLabel=browserChannel==='chrome'?'Google Chrome':browserChannel==='msedge'?'Microsoft Edge（旧连接设置）':browserChannel==='custom'?'本机自定义浏览器':'旧连接未上报浏览器类型'
  const allowedOrigins=Array.isArray(declaredOrigins)?declaredOrigins.filter((s):s is string=>{try{return typeof s==='string'&&s.length<1000&&new URL(s).origin===s}catch{return false}}).slice(0,12):[]
  const [root,setRoot]=useState(roots[0]||''),[path,setPath]=useState('.'),[url,setUrl]=useState('')
  const [filename,setFilename]=useState('新文件.txt'),[text,setText]=useState(''),[showWrite,setShowWrite]=useState(false)
  const [busy,setBusy]=useState(false),[job,setJob]=useState<LocalJob|null>(null),[error,setError]=useState('')
  const [phase,setPhase]=useState<'idle'|'approval'|'submitting'>('idle'),[elapsed,setElapsed]=useState(0),[cancelling,setCancelling]=useState(false)
  const [action,setAction]=useState<Action|null>(null),[copyNotice,setCopyNotice]=useState(''),[showResult,setShowResult]=useState(true)
  const [directory,setDirectory]=useState<LocalDirectorySnapshot|null>(null),[fileQuery,setFileQuery]=useState('')
  const [view,setView]=useState<'files'|'browser'>(fileTool?'files':'browser')
  const key=useId(),listRef=useRef<HTMLDivElement>(null)
  const lock=useRef(false),alive=useRef(true),owner=useRef(decodeRhToken()?.sub||'')
  const pending=job?.status==='queued'||job?.status==='running',online=statusVerified&&deviceConnectionState(device)==='online'
  const authorized=()=>!!owner.current&&decodeRhToken()?.sub===owner.current
  const currentConnection=useRef({device,statusVerified})
  useLayoutEffect(()=>{currentConnection.current={device,statusVerified}},[device,statusVerified])
  const canRead=tools.some(t=>t.name==='files.read'),writeRoots=localRootOptions(tools.find(t=>t.name==='files.write')).map(r=>r.id)
  const canWrite=writeRoots.includes(root),disabled=busy||pending||!online
  const listed=directory?.root===root&&directory.path===path?directory:null
  const visibleFiles=visibleLocalFiles(listed,root,path,fileQuery)
  const tabs=([fileTool?{id:'files' as const,label:'文件与目录'}:null,browserTool?{id:'browser' as const,label:'浏览器'}:null]).filter(item=>item!==null)
  const browserResult=job&&action?.tool.startsWith('browser.')?browserJobPresentation(job,action.tool,action.tool==='browser.browser_navigate'?action.args.url:url,allowedOrigins):null
  useEffect(()=>{if(!busy&&!pending)return;const timer=window.setInterval(()=>setElapsed(n=>n+1),1000);return()=>window.clearInterval(timer)},[busy,pending])
  useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[])
  useEffect(()=>{onBusyChange?.(busy||pending);return()=>onBusyChange?.(false)},[busy,pending,onBusyChange])
  useEffect(()=>{
    if(!job?.id||!pending)return
    const controller=new AbortController();let reading=false
    const poll=async()=>{
      if(reading||!authorized())return;reading=true
      try{
        const result=await localApi<LocalJob>('/api/local-jobs/'+job.id,undefined,controller.signal)
        if(!controller.signal.aborted&&alive.current&&authorized()){
          setJob(result);setError('')
          if(result.status==='succeeded'&&action?.tool==='files.list'){
            const snapshot=localDirectorySnapshot(result.result,action.args.root,action.args.path)
            if(snapshot){setDirectory(snapshot);setPath(snapshot.path);setFileQuery('')}
            else setError('已收到回执，但文件列表格式无法核验，请展开原始回执检查；未将其显示成空目录。')
          }
        }
      }catch(e){if(!controller.signal.aborted&&alive.current)setError(String((e as Error).message)+'；状态未确认，不会自动重新执行。')}
      finally{reading=false}
    }
    const timer=window.setInterval(()=>void poll(),1000)
    return()=>{controller.abort();window.clearInterval(timer)}
  },[job?.id,pending,action])
  const perform=async(build:()=>Action)=>{
    if(lock.current||pending||!online||!authorized())return
    lock.current=true;setBusy(true);setElapsed(0);setError('');setCopyNotice('')
    try{
      const next=build()
      if(!tools.some(t=>t.name===next.tool))throw Error('当前设备没有开放这项能力，请先在本机配置并刷新。')
      if(next.args.root&&!localRootOptions(tools.find(t=>t.name===next.tool)).some(r=>r.id===next.args.root))throw Error('此操作没有获得所选目录的授权。')
      setPhase('approval')
      if(!await confirmInStudio(next.explanation+' 确认执行这一次操作？',{title:'确认本次电脑操作',confirmLabel:next.tool==='files.write'?'批准新建文件':'批准这次检查'}))return
      if(!alive.current||!authorized()||!currentConnection.current.statusVerified||deviceConnectionState(currentConnection.current.device)!=='online'){
        if(alive.current)setError('等待批准时连接状态发生变化，未提交操作。请先恢复并核实设备，再重新确认。')
        return
      }
      setPhase('submitting');setJob(null);setAction(next);setShowResult(true)
      const result=await localApi<{id:string}>('/api/local-devices/'+device.id+'/jobs',{tool:next.tool,arguments:next.args,confirm:true,request_id:crypto.randomUUID()})
      if(alive.current&&authorized())setJob({id:result.id,status:'queued',result:'',error:''})
    }catch(e){if(alive.current)setError(String((e as Error).message)+'；不会自动重试。若提交状态不明，请先核查本机。')}
    finally{lock.current=false;if(alive.current){setBusy(false);setPhase('idle')}}
  }
  const list=(requested:string)=>perform(()=>({tool:'files.list',args:{root,path:localRelativePath(requested)},explanation:'列出「'+device.name+'」已授权文件夹 '+root+'/'+requested+' 的文件名，不读取正文、不修改文件。'}))
  const read=(name:string)=>perform(()=>{const target=localRelativePath(name,true);return {tool:'files.read',args:{root,path:target},explanation:'读取「'+device.name+'」中的文本文件 '+root+'/'+target+'，内容会传回当前工作台；不会修改文件。'}})
  const openUrl=(raw:string)=>perform(()=>{const target=localWebAddress(raw);if(allowedOrigins.length&&!allowedOrigins.includes(new URL(target).origin))throw Error('这个网站未在本机授权清单中，请选择下方已授权网站，或由本人在本机更新访问范围。');return {tool:'browser.browser_navigate',args:{url:target},explanation:'在「'+device.name+'」的独立浏览器打开 '+target+' 并读取页面结构；不会自动登录、填写或提交表单。'}})
  const navigate=()=>openUrl(url)
  const write=()=>perform(()=>{
    const target=localRelativePath(path==='.'?filename:path+'/'+filename,true)
    if(!/\.(txt|md|csv|json)$/i.test(target))throw Error('请使用 .txt、.md、.csv 或 .json 文件名。')
    if(new TextEncoder().encode(text).length>16000)throw Error('文字超过 16 KB，请缩短后再创建。')
    return {tool:'files.write',args:{root,path:target,text},explanation:'在「'+device.name+'」的 '+root+'/'+target+' 新建文本文件，写入 '+new TextEncoder().encode(text).length+' 字节。不会覆盖同名文件。'}
  })
  const returnToFiles=()=>{setView('files');setShowResult(false);window.requestAnimationFrame(()=>listRef.current?.focus({preventScroll:true}))}
  const cancelOperation=async()=>{
    if(!job||cancelling||!authorized())return;setCancelling(true)
    try{await localApi('/api/local-jobs/'+job.id+'/cancel',{});const actual=await localApi<LocalJob>('/api/local-jobs/'+job.id);if(alive.current&&authorized())setJob(actual)}
    catch{if(alive.current&&authorized())setError('停止请求未确认，请检查本机；不会自动重试。')}
    finally{if(alive.current)setCancelling(false)}
  }
  if(!fileTool&&!browserTool)return null
  return <section aria-label="无需 JSON 的连接检查" className="min-w-0 rounded-2xl border border-border bg-secondary/20 p-4 sm:p-5">
    <h3 className="text-base font-semibold">{mode==='browser'?'浏览器工作区':'使用这台电脑'}</h3>
    <p className="mt-1 text-xs leading-5 text-muted-foreground">选择要做的事。访问文件、打开网页仍需单次批准；切换视图不会执行操作。</p>
    <div role="tablist" aria-label="电脑常用操作分类" className="mt-4 flex gap-1 rounded-xl border border-border bg-card p-1">
      {tabs.map((tab,index)=><button key={tab.id} type="button" role="tab" id={key+'-'+tab.id+'-tab'} aria-selected={view===tab.id} aria-controls={key+'-'+tab.id} tabIndex={view===tab.id?0:-1}
        onClick={()=>setView(tab.id)} onKeyDown={e=>{const next=e.key==='ArrowRight'?(index+1)%tabs.length:e.key==='ArrowLeft'?(index-1+tabs.length)%tabs.length:e.key==='Home'?0:e.key==='End'?tabs.length-1:-1;if(next>=0){e.preventDefault();setView(tabs[next].id);document.getElementById(key+'-'+tabs[next].id+'-tab')?.focus()}}}
        className={'flex min-h-10 min-w-0 flex-1 items-center justify-center gap-2 rounded-lg px-3 text-sm font-semibold '+(view===tab.id?'bg-primary/10 text-primary':'text-muted-foreground hover:bg-secondary')}>
        {tab.id==='files'?<FolderOpen className="h-4 w-4"/>:<Globe2 className="h-4 w-4"/>}{tab.label}</button>)}
    </div>
    {fileTool&&roots.length>0&&<section role="tabpanel" id={key+'-files'} aria-labelledby={key+'-files-tab'} hidden={view!=='files'} className="mt-4 min-w-0 space-y-3 rounded-xl border border-border bg-card p-4">
      <label className="block text-xs">授权工作目录<select aria-label="快速检查工作目录" className={field} value={root} disabled={busy||pending} onChange={e=>{setRoot(e.target.value);setPath('.');setDirectory(null);setFileQuery('');setJob(null);setAction(null);setError('')}}>{rootOptions.map(r=><option key={r.id} value={r.id}>{r.label}</option>)}</select></label>
      <div className="flex min-w-0 flex-wrap items-center gap-2"><span className="min-w-0 flex-1 break-all text-xs text-muted-foreground">当前位置：{path==='.'?'授权文件夹首页':path}</span>{path!=='.'&&<button type="button" disabled={disabled} className={button} onClick={()=>void list(localParentPath(path))}><ArrowUp className="h-3.5 w-3.5"/>上一级</button>}</div>
      <button type="button" disabled={disabled} onClick={()=>void list(path)} className={button}><FolderOpen className="h-4 w-4"/>检查文件夹访问</button>
      {listed&&<div ref={listRef} tabIndex={-1} className="rounded-xl border border-border p-3 focus-visible:ring-2 focus-visible:ring-primary">
        <p className="text-xs leading-5 text-muted-foreground">上次读取：{new Date(listed.readAt).toLocaleTimeString()} · 非实时目录。搜索和返回列表不会再次读取电脑。</p>
        <label className="mt-2 flex items-center gap-2 rounded-lg border border-input px-2"><Search className="h-4 w-4 text-muted-foreground"/><input aria-label="查找当前列表文件" className="min-h-10 min-w-0 flex-1 bg-transparent text-sm outline-none" value={fileQuery} maxLength={120} onChange={e=>setFileQuery(e.target.value)} placeholder="按文件名筛选已读取的列表"/></label>
        <div aria-label="授权目录文件列表" className="mt-2 max-h-72 space-y-1 overflow-y-auto">
          {!visibleFiles.length&&<p className="p-3 text-xs text-muted-foreground">{fileQuery?'列表中没有匹配项；清空搜索或批准刷新可重新检查。':'上次读取时，这个文件夹没有可显示的文件。'}</p>}
          {visibleFiles.map(entry=><button type="button" key={entry.name} disabled={disabled||!entry.directory&&(!canRead||!localTextPreviewable(entry.name))}
            onClick={()=>{const target=localChildPath(listed.path,entry.name);void(entry.directory?list(target):read(target))}}
            className="flex min-h-10 w-full min-w-0 items-center gap-2 rounded-lg px-2 text-left text-xs hover:bg-secondary disabled:opacity-60">
            {entry.directory?<FolderOpen className="h-4 w-4 shrink-0 text-primary"/>:<FileText className="h-4 w-4 shrink-0"/>}<span className="min-w-0 flex-1 break-all">{entry.name}</span><span className="shrink-0 text-muted-foreground">{entry.directory?'打开':localTextPreviewable(entry.name)?'预览文本':'非文本文件'}</span>
          </button>)}
        </div>{listed.truncated&&<p className="mt-2 text-xs text-muted-foreground">仅展示前 200 项，请选择子文件夹缩小范围。</p>}
        {job?.status==='succeeded'&&action?.tool==='files.write'&&<p className="mt-2 text-xs text-muted-foreground">刚才创建了文件；此列表仍是此前的读取结果，需要时请重新检查。</p>}
      </div>}
      <p className="text-xs leading-5 text-muted-foreground">PDF、Word、Excel 请使用知识库导入或办公流程，不作为普通文本读取。</p>
      {canWrite?<details open={showWrite} onToggle={e=>setShowWrite(e.currentTarget.open)} className="rounded-lg border border-border p-3"><summary className="cursor-pointer text-xs font-semibold">新建文本文件（不会覆盖）</summary><div className="mt-3 space-y-3"><label className="block text-xs">新文件名<input aria-label="新文件名" className={field} maxLength={180} value={filename} disabled={busy||pending} onChange={e=>setFilename(e.target.value)}/></label><label className="block text-xs">文件内容<textarea aria-label="新文件内容" className={field} rows={4} maxLength={16000} value={text} disabled={busy||pending} onChange={e=>setText(e.target.value)}/></label><button type="button" disabled={disabled||!filename.trim()} className={button} onClick={()=>void write()}><Plus className="h-4 w-4"/>确认新建文件</button></div></details>:<p className="rounded-lg bg-secondary/50 p-2 text-xs text-muted-foreground">此目录未开放新建文件能力，可在本机明确修改授权。</p>}
    </section>}
    {browserTool&&<section role="tabpanel" id={key+'-browser'} aria-labelledby={key+'-browser-tab'} hidden={view!=='browser'} className="mt-4 min-w-0 space-y-3 rounded-xl border border-border bg-card p-4">
      <p className="rounded-lg bg-primary/5 px-3 py-2 text-xs" aria-label="当前自动化浏览器">当前连接：<strong>{browserLabel}</strong> · 独立会话</p>
      {browserChannel!=='chrome'&&<details className="text-xs leading-6 text-muted-foreground"><summary className="cursor-pointer font-semibold text-primary">将原连接改为 Google Chrome</summary><p>先在原连接器窗口 Ctrl+C 停止，再双击同版本项目的 start-connect.cmd，选中原连接并选择“3. 切换此连接为 Google Chrome”，确认后恢复原连接。不重新配对，不扩大网站或文件权限。</p></details>}
      <p className="text-xs leading-5 text-muted-foreground">先填写目标网址，点击蓝色按钮打开。读取当前页只会读取已打开的受控页面，不会跳转到输入框中的网址。</p>
      <label className="block text-xs font-semibold">目标网页地址<input aria-label="快速检查网页地址" className={field} value={url} disabled={busy||pending} onChange={e=>setUrl(e.target.value)} placeholder="例如 example.com 或完整网址" maxLength={1000}/></label>
      <div className="flex flex-wrap gap-2"><button type="button" disabled={disabled||!url.trim()} onClick={()=>void navigate()} className={button+' border-primary bg-primary text-primary-foreground hover:bg-primary/90'}><Globe2 className="h-4 w-4"/>打开目标网页</button>{tools.some(t=>t.name==='browser.browser_snapshot')&&<button type="button" disabled={disabled} className={button} onClick={()=>void perform(()=>({tool:'browser.browser_snapshot',args:{},explanation:'读取「'+device.name+'」独立浏览器的当前页面文字与结构，并传回工作台，不点击或提交表单。'}))}>读取当前网页</button>}</div>
      <p className="text-xs text-muted-foreground">“读取当前网页”不会打开网址；“查看截图”也不代表目标网页已经加载。</p>
      {localTestAddress(url)&&<p className="rounded-lg bg-secondary/60 p-2 text-xs leading-5">这是本地测试域名。只有被连接电脑已配置解析且对应站点已部署，才能访问；加入授权清单不会创建网站。</p>}
      {browserTool.inputSchema['x-studio-browser-feedback']!=='navigation-v1'&&<p className="text-xs text-muted-foreground">当前连接器尚未上报新版网页状态反馈。升级连接器可避免读取空页时弹出空白窗口；原连接无需重新配对。</p>}
      {(busy||pending)&&<p role="status" aria-label="网页操作进度" className="flex items-center gap-2 rounded-lg border border-primary/25 bg-primary/5 p-3 text-xs"><Loader2 className="h-4 w-4 shrink-0 animate-spin"/>{phase==='approval'?'等待你批准；尚未发送网页操作':phase==='submitting'?'正在提交已批准的操作':browserResult?.title||'等待本机执行回执'} · {elapsed} 秒</p>}
      {browserResult&&!pending&&<div role="status" aria-label="网页状态核验" className={'space-y-2 rounded-lg border p-3 text-xs leading-5 '+(browserResult.tone==='error'?'border-destructive/40 bg-destructive/5':'border-primary/25 bg-secondary/30')}><strong>{browserResult.title}</strong><p>{browserResult.detail}</p><p className="break-all"><span className="font-semibold">上次回执中的实际网址：</span>{browserResult.page?.url||'尚未取得可核验的页面地址'}</p>{browserResult.page?.title&&<p>页面标题：{browserResult.page.title}</p>}{browserResult.canOpenTarget&&url.trim()&&<button type="button" className={button} disabled={disabled} onClick={()=>void navigate()}>打开上方目标网址（需批准）</button>}<p className="text-[11px] text-muted-foreground">以上来自上次回执，不是实时画面。页面内容与截图会直接显示在本工作台下方；需要登录时仍在独立 Chrome 中完成。</p></div>}
      {tools.some(t=>t.name==='browser.browser_take_screenshot')&&<button type="button" disabled={disabled} className={button} onClick={()=>void perform(()=>({tool:'browser.browser_take_screenshot',args:{type:'png'},explanation:'截取「'+device.name+'」独立浏览器当前网页并传回本工作台；截图可能包含页面中的个人信息，不会截取整个桌面。'}))}>查看当前网页截图</button>}
      {allowedOrigins.length>0&&<div aria-label="已授权网站" className="space-y-1"><p className="text-xs text-muted-foreground">当前已授权（点击仅填入，不会访问）：</p>{allowedOrigins.map(origin=><button type="button" key={origin} disabled={busy||pending} onClick={()=>setUrl(origin)} className="mr-1 min-h-8 max-w-full break-all rounded-lg bg-secondary px-2 text-left text-xs text-primary">{origin}</button>)}</div>}
      <p className="text-xs leading-5 text-muted-foreground">使用独立浏览器。需要登录时，由本人在该窗口完成；不会复制日常浏览器的账号和密码。</p>
    </section>}
    {!online&&<p role="status" className="mt-3 rounded-lg bg-secondary p-3 text-xs">{statusVerified?'设备当前离线。输入和上次结果已保留，恢复原连接后再操作，无需重新配对。':'连接状态暂时无法核实。输入和上次结果已保留；重新读取设备成功前，所有操作暂停，不要重复配对。'}</p>}
    {(busy||pending)&&view!=='browser'&&<p role="status" className="mt-3 flex items-center gap-2 text-xs"><Loader2 className="h-4 w-4 animate-spin"/>{pending?(job?.status==='queued'?'已提交，等待本机连接器领取…':action?.tool.startsWith('browser.')?'浏览器正在执行；等待导航和页面内容回执…':'连接器正在执行；等待实际结果回执…'):'等待确认或提交…'}</p>}
    {error&&<p role="alert" className="mt-3 text-xs text-destructive">{error}</p>}
    {job&&showResult&&<div role="status" aria-label="连接检查结果" className="mt-4 min-w-0 rounded-xl border border-border bg-card p-4 text-sm"><div className="flex flex-wrap items-center justify-between gap-2"><strong>{browserResult?.title||({queued:'已批准，等待本机领取',running:'本机正在检查',succeeded:'真实检查完成',failed:'本次操作失败（不代表设备断开）',cancelled:'已取消',unknown:'结果未确认，请核查本机',expired:'等待超时'} as Record<string,string>)[job.status]||job.status}</strong><span className="text-xs text-muted-foreground">{action&&localActionName(action.tool)}</span></div>
      {action?.tool==='browser.browser_navigate'&&<p className="mt-2 break-all rounded-lg bg-secondary/50 p-2 text-xs" aria-label="本次导航目标">目标网址：{action.args.url}</p>}
      {browserResult&&<p className="mt-2 text-xs leading-5">{browserResult.detail}</p>}
      {job.status==='succeeded'&&action?.tool==='files.read'&&<section aria-label="文本文件预览" className="mt-3"><p className="mb-2 break-all text-xs text-muted-foreground">{action.args.path} · 文本读取上限 64 KB，回传可能按工具上限截断</p><pre className="max-h-80 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-secondary/40 p-3 text-xs leading-6">{job.result}</pre><button type="button" className={button+' mt-2'} onClick={()=>void navigator.clipboard.writeText(job.result).then(()=>setCopyNotice('内容已复制')).catch(()=>setCopyNotice('复制不可用，请手动选中文字'))}><Copy className="h-3.5 w-3.5"/>复制文字</button>{listed&&<button type="button" className={button+' ml-2 mt-2'} onClick={returnToFiles}>返回文件列表（不重新读取）</button>}</section>}
      {job.status==='succeeded'&&action?.tool==='files.write'&&<p className="mt-2 break-words text-xs">{job.result}</p>}
      {job.status==='succeeded'&&action?.tool.startsWith('browser.')&&<pre aria-label="网页内容预览" className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-secondary/40 p-3 text-xs leading-6">{browserResultText(job.result)}</pre>}
      {job.status==='succeeded'&&job.images?.map((image,index)=><img key={index} alt="本地操作返回的截图" className="mt-3 max-h-96 max-w-full rounded-lg object-contain" src={'data:'+image.mimeType+';base64,'+image.data}/>)}
      {['failed','unknown','expired'].includes(job.status)&&<p className="mt-2 break-words text-xs text-destructive">{job.result||job.error||'尚未确认执行结果，请检查本机后再决定是否重新操作。'}</p>}
      {(job.result||job.error)?<details key={job.id} className="mt-3"><summary className="cursor-pointer py-1 text-xs text-primary">查看原始执行回执</summary><pre className="mt-2 max-h-52 overflow-auto whitespace-pre-wrap break-all text-xs">{job.result||job.error}</pre></details>:<p className="mt-2 text-xs text-muted-foreground">尚未收到执行结果，不能判定检查成功。</p>}
      {pending&&<button type="button" disabled={cancelling} className={button+' mt-3'} onClick={()=>void cancelOperation()}><Square className="h-3.5 w-3.5"/>{cancelling?'正在核对停止结果…':'停止本次操作'}</button>}
      {copyNotice&&<p className="mt-2 text-xs">{copyNotice}</p>}
    </div>}
  </section>
}
