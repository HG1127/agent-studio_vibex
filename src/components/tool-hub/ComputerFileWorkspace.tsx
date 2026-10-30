import {useEffect,useLayoutEffect,useRef,useState} from 'react'
import {ArrowUp,Check,Copy,FilePlus2,FolderOpen,FolderPlus,History,Loader2,RefreshCw,RotateCcw,Save,Search,ShieldCheck,Square,Trash2} from 'lucide-react'
import {confirmInStudio} from '@/lib/studioDialogs'
import {decodeRhToken} from '@/lib/studioAuth'
import {deviceConnectionState} from '@/lib/localConnectionSetup'
import {localApi,deviceTools,type LocalDevice,type LocalJob} from '@/lib/localDevices'
import {localChildPath,localRelativePath,localParentPath,localRootOptions,localTextPreviewable,localToolCatalogKey} from '@/lib/localDeviceActions'
import {localDirectorySnapshot,visibleLocalFiles,type LocalDirectorySnapshot} from '@/lib/localFileBrowser'
import {WORKSPACE_ACTIONS,WORKSPACE_EDIT_BYTES,workspaceActionAvailability,workspaceAllows,workspaceError,workspaceStat,workspaceTextPayload,workspaceTextVerified,workspaceTrash,type WorkspaceStat,type WorkspaceTrash} from '@/lib/computerWorkspace'

type Intent={requestId:string;jobId:string;tool:string;args:Record<string,string>;root:string;catalog:string;apply?:(result:string)=>Promise<void>|void}
type DocumentState={path:string;original:string;stat:WorkspaceStat|null;verified:boolean;catalog:string}
type RecordItem={id:string;name:string;path:string;status:string;at:number}
const btn='inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-medium hover:bg-secondary disabled:opacity-40'
const field='min-h-10 w-full min-w-0 rounded-lg border border-input bg-background px-3 py-2 text-sm'
const statusNames:Record<string,string>={queued:'等待电脑接收',running:'电脑正在执行',succeeded:'已完成',failed:'执行失败',cancelled:'已取消或停止',unknown:'结果待核实',expired:'等待超时'}
const textFile=(name:string)=>localTextPreviewable(name)||/\.(tsx?|jsx?|py|sh|ps1|toml|ini|sql|rs|go|java|c|cpp|h|svelte|vue)$/i.test(name)

/** The workbench owns interaction; the connected PC only performs scoped jobs.
 * Receipt loss retains the SAME request ID. Tab switches and filtering are
 * local views; an unverifiable/truncated preview can never be saved. */
export function ComputerFileWorkspace({device,statusVerified=true,onBusyChange,onRequestPermissions}:{device:LocalDevice;statusVerified?:boolean;onBusyChange?:(value:boolean)=>void;onRequestPermissions?:()=>void}){
 const tools=deviceTools(device),catalog=localToolCatalogKey(tools),roots=localRootOptions(tools.find(t=>t.name==='files.list'))
 const [root,setRoot]=useState(roots[0]?.id||''),[path,setPath]=useState('.'),[query,setQuery]=useState('')
 const [directory,setDirectory]=useState<LocalDirectorySnapshot|null>(null),[selected,setSelected]=useState<{path:string;directory:boolean}|null>(null)
 const [doc,setDoc]=useState<DocumentState|null>(null),[text,setText]=useState(''),[diff,setDiff]=useState(false)
 const [form,setForm]=useState<''|'file'|'folder'|'copy'|'move'>(''),[target,setTarget]=useState(''),[newText,setNewText]=useState('')
 const [busy,setBusy]=useState(false),[job,setJob]=useState<LocalJob|null>(null),[error,setError]=useState(''),[notice,setNotice]=useState('')
 const [recover,setRecover]=useState(false),[pane,setPane]=useState<'workspace'|'trash'|'history'>('workspace'),[history,setHistory]=useState<RecordItem[]>([])
 const [trash,setTrash]=useState<{entries:WorkspaceTrash[];truncated:boolean}|null>(null),[stale,setStale]=useState(false)
 const intent=useRef<Intent|null>(null),mutex=useRef(false),alive=useRef(true),controller=useRef<AbortController|null>(null),owner=useRef(decodeRhToken()?.sub||'')
 const live=useRef({device,statusVerified,catalog})
  useLayoutEffect(()=>{live.current={device,statusVerified,catalog}},[device,statusVerified,catalog])
 const dirty=!!doc&&text!==doc.original||form==='file'&&!!newText,blocked=busy||recover,online=statusVerified&&deviceConnectionState(device)==='online'
 const may=(tool:string)=>workspaceAllows(tools,tool,root)
  const missingPermissions=workspaceActionAvailability(tools,root).filter(action=>!action.available&&action.reason==='permission')
 const valid=()=>alive.current&&!!owner.current&&decodeRhToken()?.sub===owner.current
 const ready=()=>{if(!valid()||!live.current.statusVerified||deviceConnectionState(live.current.device)!=='online')throw Error('设备离线或身份尚未核实，未发送新操作。');if(live.current.catalog!==catalog)throw Error('授权能力已变化，请核对当前范围。')}
 const visible=visibleLocalFiles(directory,root,path,query)
 const edited=!!doc&&doc.verified&&doc.catalog===catalog&&may('files.update')&&doc.path===selected?.path
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;controller.current?.abort()}},[])
 useEffect(()=>{onBusyChange?.(busy||recover||dirty);return()=>onBusyChange?.(false)},[busy,recover,dirty,onBusyChange])
 useEffect(()=>{const warn=(e:BeforeUnloadEvent)=>{if(dirty||recover||busy){e.preventDefault();e.returnValue=''}};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn)},[dirty,recover,busy])
 const addHistory=(entry:Intent,result:LocalJob)=>setHistory(rows=>[{id:result.id,name:WORKSPACE_ACTIONS[entry.tool]||entry.tool,path:entry.args.path||entry.args.trash_id||'.',status:result.status,at:Date.now()},...rows.filter(r=>r.id!==result.id)].slice(0,20))
 const observe=async(entry:Intent,signal:AbortSignal):Promise<string>=>{
  if(!entry.jobId){
   ready()
   const reply=await localApi<{id:string}>('/api/local-devices/'+device.id+'/jobs',{tool:entry.tool,arguments:entry.args,confirm:true,request_id:entry.requestId},signal)
   if(!/^[A-Za-z0-9]{24}$/.test(reply.id))throw Error('任务编号无法核实，请恢复同一请求，避免重复操作。')
   entry.jobId=reply.id
  }
  if(!valid())throw Error('当前账号已变化，已停止显示原账号的数据。')
  setJob({id:entry.jobId,status:'queued',result:'',error:''})
  for(let n=0;n<140;n++){
   signal.throwIfAborted()
   if(!valid())throw Error('当前账号已变化。')
   const value=await localApi<LocalJob&{device_id:string}>('/api/local-jobs/'+entry.jobId,undefined,signal)
   if(!valid())throw Error('当前账号已变化。')
   if(value.id!==entry.jobId||value.device_id!==device.id||!Object.hasOwn(statusNames,value.status))throw Error('任务回执身份或状态无法核实，未采用。')
   setJob(value)
   if(!['queued','running'].includes(value.status)){
    addHistory(entry,value)
    if(value.status==='unknown')throw Error('操作结果待核实，不会自动重做。请先核查文件和原任务回执。')
    intent.current=null;setRecover(false)
    if(value.status!=='succeeded')throw Error(workspaceError(value.result||value.error||statusNames[value.status]||'本次操作未完成。'))
    if(live.current.catalog!==entry.catalog)throw Error('操作回执已返回，但授权范围随后改变。未把旧结果加载到新范围，请刷新。')
    await entry.apply?.(value.result)
    return value.result
   }
   await new Promise<void>((resolve,reject)=>{
    const done=()=>{clearTimeout(timer);signal.removeEventListener('abort',abort);resolve()}
    const abort=()=>{clearTimeout(timer);signal.removeEventListener('abort',abort);reject(Error('请求已停止等待，执行结果需重新核实。'))}
    const timer=setTimeout(done,800);signal.addEventListener('abort',abort,{once:true})
   })
  }
  throw Error('尚未收到最终回执。请核实同一操作，不要重复创建。')
 }
 const send=async(tool:string,args:Record<string,string>,apply?:Intent['apply'])=>{
  ready()
  if(!workspaceAllows(deviceTools(live.current.device),tool,args.root))throw Error('当前目录未开放此操作。请在“授权管理”中设置，更新连接器后刷新能力。')
  const entry:Intent={requestId:crypto.randomUUID(),jobId:'',tool,args:{...args},root:args.root,catalog,apply}
  intent.current=entry
  return observe(entry,controller.current!.signal)
 }
 const perform=async(explanation:string,work:()=>Promise<unknown>,destructive=false,ask=true)=>{
  if(mutex.current||intent.current||!online)return
  mutex.current=true;setBusy(true);setError('');setNotice('')
  try{
   ready()
   if(ask&&!await confirmInStudio(explanation,{title:destructive?'确认文件变更':'确认本次电脑操作',confirmLabel:destructive?'确认执行变更':'批准本次操作',destructive}))return
   ready();controller.current=new AbortController()
   await work()
  }catch(e){if(valid()){setError(workspaceError(e));setRecover(!!intent.current)}}
  finally{mutex.current=false;if(alive.current)setBusy(false)}
 }
 const recheck=async()=>{
  if(mutex.current||!intent.current||!valid())return
  mutex.current=true;setBusy(true);setError('');controller.current=new AbortController()
  try{await observe(intent.current,controller.current.signal);setNotice('原操作结果已核实，没有创建另一条任务。')}
  catch(e){if(valid()){setError(workspaceError(e));setRecover(!!intent.current)}}
  finally{mutex.current=false;if(alive.current)setBusy(false)}
 }
 const abandonDraft=async()=>!dirty||await confirmInStudio('当前文本修改尚未保存。放弃草稿继续？',{title:'保留未保存的修改',confirmLabel:'放弃草稿',cancelLabel:'继续编辑',destructive:true})
 const choose=async(value:{path:string;directory:boolean})=>{if(blocked||!await abandonDraft())return;setSelected(value);setDoc(null);setText('');setForm('');setDiff(false);setError('')}
 const list=(value:string)=>void perform('读取「'+device.name+'」授权目录 '+root+'/'+value+' 的文件名。不会修改文件。',async()=>{
  if(!await abandonDraft())return
  const targetPath=localRelativePath(value)
  await send('files.list',{root,path:targetPath},result=>{
   const snapshot=localDirectorySnapshot(result,root,targetPath)
   if(!snapshot)throw Error('目录回执无法核实，未当作空目录。')
   setDirectory(snapshot);setPath(targetPath);setSelected(null);setDoc(null);setText('');setQuery('');setStale(false)
  })
 },false,false)
 const stat=async(file:string)=>workspaceStat(await send('files.stat',{root,path:file}),root,file)
 const read=()=>{if(!selected||selected.directory)return;const file=selected.path;void perform('读取 '+root+'/'+file+' 的文本和版本摘要，显示在工作台；不会修改文件。',async()=>{
  if(!await abandonDraft())return
  const snapshot=may('files.stat')?await stat(file):null
  await send('files.read',{root,path:file},async result=>{
   const verified=!!snapshot&&await workspaceTextVerified(snapshot,result)
   if(!valid()||live.current.catalog!==catalog)throw Error('当前身份或授权范围已变化，未显示旧文件内容。')
   setDoc({path:file,original:result,stat:snapshot,verified,catalog});setText(result);setDiff(false)
   if(!verified)setNotice('仅提供只读预览：当前连接器未提供版本摘要，或正文较大、被截断、内容已变化。为避免误覆盖，不允许保存此预览。')
  })
 },false,false)}
 const changed=(message:string)=>{setStale(true);setDoc(null);setText('');setNewText('');setForm('');setNotice(message+' 文件列表仍是上次读取结果，请点“刷新目录”。')}
 const save=()=>{if(!doc||!edited||!dirty||!doc.stat)return;const loaded=doc;void perform('把修改保存到 '+root+'/'+loaded.path+'。将校验原文件版本，并保留修改前的恢复副本；若其他程序已改过文件则拒绝覆盖。',async()=>{
  await send('files.update',{root,path:loaded.path,text:workspaceTextPayload(text),expected_sha256:loaded.stat!.sha256},()=>changed('文件修改已收到成功回执。'))
 },true)}
 const openFile=(tool:'files.open'|'files.reveal')=>{if(!selected)return;const file=selected.path;void perform((tool==='files.open'?'用被连接电脑的默认软件打开 ':'在被连接电脑的资源管理器中定位 ')+root+'/'+file+'。窗口出现在「'+device.name+'」，不是打开另一套连接器管理页。',()=>send(tool,{root,path:file},()=>setNotice('已收到本机执行回执；窗口位于被连接电脑。并不代表已读取或修改其中内容。')))}
 const submitForm=()=>{
  if(!form)return
  const kind=form,source=selected?.path||''
  void perform((kind==='file'?'新建文本文件':kind==='folder'?'新建文件夹':kind==='copy'?'复制文件':'移动 / 重命名文件')+'：'+root+'/'+target+'。仅在当前授权目录内操作，不覆盖任何同名目标。',async()=>{
   if(kind!=='file'&&!await abandonDraft())return
   const dest=localRelativePath(target,true)
   if(kind==='file')await send('files.write',{root,path:dest,text:workspaceTextPayload(newText)},()=>changed('新文件已创建。'))
   else if(kind==='folder')await send('files.mkdir',{root,path:dest},()=>changed('文件夹已创建。'))
   else if(kind==='copy')await send('files.copy',{root,path:source,destination:dest},()=>changed('文件副本已创建。'))
   else{const version=await stat(source);await send('files.move',{root,path:source,destination:dest,expected_sha256:version.sha256},()=>changed('文件已移动或重命名。'))}
  },kind==='move')
 }
 const remove=()=>{if(!selected||selected.directory)return;const file=selected.path;void perform('将 '+root+'/'+file+' 移入本授权目录的“可恢复回收区”。这不是永久删除，也不是 Windows 回收站。可在本工作区恢复；不批量删除文件夹。',async()=>{
  if(!await abandonDraft())return
  const version=await stat(file)
  await send('files.trash',{root,path:file,expected_sha256:version.sha256},()=>{setSelected(null);setTrash(null);changed('文件已移入可恢复回收区。')})
 },true)}
 const loadTrash=()=>void perform('读取 '+root+' 中由本连接器保留的回收记录，不读取文件正文。',()=>send('files.trash_list',{root},result=>{setTrash(workspaceTrash(result));setPane('trash')}),false,false)
 const restore=(entry:WorkspaceTrash)=>void perform('恢复文件到 '+root+'/'+entry.path+'。若原位置已有同名文件会拒绝覆盖。',()=>send('files.restore',{root,trash_id:entry.trash_id},()=>{setTrash(null);setStale(true);setNotice('恢复已收到成功回执，请刷新目录或回收记录。')}),true)
 const make=async(kind:'file'|'folder'|'copy'|'move')=>{if(blocked||!await abandonDraft())return;setDoc(null);setText('');setForm(kind);setTarget(kind==='file'?localChildPath(path,'新文件.txt'):kind==='folder'?localChildPath(path,'新文件夹'):selected?.path||'');setNewText('');setNotice('');setError('')}
 const disable=(tool:string)=>blocked||!online||!may(tool)
 if(!roots.length)return <div className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">这台电脑尚未开放文件目录。请在“授权管理”选择要使用的文件或文件夹；不需要回到外部管理页。</div>
 return <section aria-label="系统内文件工作区" className="min-w-0 space-y-4">
  <div className="flex min-w-0 flex-wrap items-center gap-3 rounded-xl border border-border bg-secondary/20 p-3">
   <label className="min-w-[160px] flex-1 text-xs">授权目录<select aria-label="文件工作区授权目录" className={field+' mt-1'} disabled={blocked} value={root} onChange={async e=>{const next=e.target.value;if(!await abandonDraft())return;setRoot(next);setPath('.');setDirectory(null);setSelected(null);setDoc(null);setText('');setTrash(null);setForm('');setError('');setNotice('')}}>{roots.map(r=><option key={r.id} value={r.id}>{r.label}</option>)}</select></label>
   <p className="min-w-[160px] flex-1 text-xs leading-5 text-muted-foreground">读取按钮直接访问当前已授权范围，不反复弹窗。编辑、移动、删除和电脑软件打开分别授权，执行前再核对。</p>
  </div>
  {missingPermissions.length>0&&<div role="status" aria-label="未开放的文件操作" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300/40 bg-amber-50/60 p-3 text-amber-950"><div className="min-w-0 flex-1"><p className="text-sm font-semibold">当前目录有 {missingPermissions.length} 项操作尚未授权</p><p className="mt-1 text-xs leading-5">{missingPermissions.map(action=>action.label).join('、')}。这些功能由当前连接器支持，但不会自动扩大权限；可在工作台内逐项开启，保存前仍需本机确认。</p></div>{onRequestPermissions&&<button type="button" className={btn+' shrink-0'} disabled={blocked||dirty} onClick={onRequestPermissions}><ShieldCheck className="h-3.5 w-3.5"/>管理授权</button>}</div>}
   <div className="flex flex-wrap gap-2" role="tablist" aria-label="文件工作区视图">{([['workspace','文件'],['trash','可恢复回收区'],['history','本次操作记录']] as const).map(([id,label])=><button key={id} type="button" role="tab" aria-selected={pane===id} className={btn+(pane===id?' border-primary/40 bg-primary/5 text-primary':'')} onClick={()=>setPane(id)}>{id==='trash'?<Trash2 className="h-3.5 w-3.5"/>:id==='history'?<History className="h-3.5 w-3.5"/>:<FolderOpen className="h-3.5 w-3.5"/>}{label}</button>)}</div>
  <div hidden={pane!=='workspace'} className="min-w-0">
   <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(240px,0.8fr)_minmax(0,1.6fr)]">
    <section aria-label="目录浏览器" className="min-w-0 rounded-xl border border-border bg-card p-3">
     <div className="flex flex-wrap gap-2"><button type="button" className={btn} disabled={blocked||!online} onClick={()=>list(path)}><RefreshCw className="h-3.5 w-3.5"/>{directory?'刷新目录':'读取目录'}</button><button type="button" className={btn} disabled={blocked||!online||path==='.'} onClick={()=>list(localParentPath(path))}><ArrowUp className="h-3.5 w-3.5"/>上一级</button></div>
     <p className="my-3 break-all text-xs text-muted-foreground">{path==='.'?'授权目录首页':path}</p>
     <label className="flex items-center gap-2 rounded-lg border border-input px-2"><Search className="h-4 w-4 text-muted-foreground"/><input aria-label="筛选文件名" value={query} maxLength={120} onChange={e=>setQuery(e.target.value)} className="min-h-10 min-w-0 flex-1 bg-transparent text-sm outline-none" placeholder="筛选已读取的文件"/></label>
     <div className="mt-2 h-[360px] overflow-y-auto" aria-label="文件列表">{!directory?<p className="p-4 text-xs leading-6 text-muted-foreground">点“读取目录”查看文件。选择目录和切换视图不会自行读取电脑。</p>:!visible.length?<p className="p-4 text-xs text-muted-foreground">{query?'当前列表无匹配文件。':'本次读取没有可显示的文件。'}</p>:visible.map(e=>{const full=localChildPath(path,e.name);return <button key={e.name} type="button" className={'flex min-h-10 w-full min-w-0 items-center gap-2 rounded-lg px-2 text-left text-sm '+(selected?.path===full?'bg-primary/10 text-primary':'hover:bg-secondary')} disabled={blocked} onClick={()=>void choose({path:full,directory:e.directory})}>{e.directory?<FolderOpen className="h-4 w-4 shrink-0"/>:<FilePlus2 className="h-4 w-4 shrink-0"/>}<span className="min-w-0 break-all">{e.name}</span></button>})}</div>
     {directory&&<p className="mt-2 text-xs text-muted-foreground">{new Date(directory.readAt).toLocaleTimeString()} 的读取结果{directory.truncated?' · 仅前 200 项':''}{stale?' · 有变更，待刷新':''}</p>}
     <div className="mt-3 flex flex-wrap gap-2 border-t border-border pt-3"><button type="button" className={btn} disabled={disable('files.write')} onClick={()=>make('file')}><FilePlus2 className="h-3.5 w-3.5"/>新建文件</button><button type="button" className={btn} disabled={disable('files.mkdir')} onClick={()=>make('folder')}><FolderPlus className="h-3.5 w-3.5"/>新建文件夹</button></div>
    </section>
    <section aria-label="文件内容与操作" className="min-w-0 rounded-xl border border-border bg-card p-4">
     <div className="mb-3"><h4 className="break-all font-semibold">{selected?.path||'选择一个文件'}</h4><p className="mt-1 text-xs leading-5 text-muted-foreground">文件预览、编辑和变更回执都在这里。打开 Word、PDF 等会调用被连接电脑的软件。</p></div>
     {selected&&<div className="mb-4 flex flex-wrap gap-2">
      {selected.directory?<button type="button" className={btn} disabled={blocked||!online} onClick={()=>list(selected.path)}>进入文件夹</button>:<button type="button" className={btn} disabled={disable('files.read')||!textFile(selected.path)} onClick={read}>读取内容</button>}
      {!selected.directory&&<button type="button" className={btn} disabled={disable('files.open')} onClick={()=>openFile('files.open')}>用电脑软件打开</button>}
      <button type="button" className={btn} disabled={disable('files.reveal')||selected.directory} onClick={()=>openFile('files.reveal')}>在电脑中定位</button>
      {!selected.directory&&<><button type="button" className={btn} disabled={disable('files.copy')} onClick={()=>make('copy')}>复制</button><button type="button" className={btn} disabled={disable('files.move')} onClick={()=>make('move')}>移动 / 重命名</button><button type="button" className={btn+' text-destructive'} disabled={disable('files.trash')} onClick={remove}>移入回收区</button></>}
     </div>}
     {form&&<div className="mb-4 space-y-3 rounded-xl border border-primary/20 bg-primary/5 p-3"><h5 className="text-sm font-semibold">{{file:'新建文本文件',folder:'新建文件夹',copy:'复制文件',move:'移动或重命名文件'}[form]}</h5><label className="block text-xs">{form==='copy'||form==='move'?'目标位置（相对当前授权目录）':'新名称（相对授权目录）'}<input aria-label="文件操作目标位置" className={field+' mt-1'} value={target} maxLength={500} disabled={blocked} onChange={e=>setTarget(e.target.value)}/></label>{form==='file'&&<textarea aria-label="新建文本内容" className={field} rows={6} value={newText} disabled={blocked} onChange={e=>setNewText(e.target.value)}/>}<p className="text-xs text-muted-foreground">仅处理单个文件；父文件夹必须存在，不覆盖已有同名文件。</p><button type="button" className={btn} disabled={blocked||!online||!target.trim()} onClick={submitForm}>确认{form==='file'||form==='folder'?'新建':form==='copy'?'复制':'移动 / 重命名'}</button><button type="button" className={btn+' ml-2'} disabled={blocked} onClick={async()=>{if(await abandonDraft()){setForm('');setNewText('')}}}>收起</button></div>}
     {doc&&doc.path===selected?.path?<>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs"><span className="text-muted-foreground">{doc.verified&&doc.catalog===catalog?'版本已校验 · '+doc.stat?.size+' 字节':'只读预览，未获得可保存的完整版本'}{dirty?' · 有未保存修改':''}</span><button type="button" className={btn} onClick={()=>void navigator.clipboard.writeText(text).then(()=>setNotice('文本已复制。')).catch(()=>setError('复制失败，请手动选择文字。'))}><Copy className="h-3.5 w-3.5"/>复制内容</button></div>
      <textarea aria-label="文件文本编辑器" spellCheck={false} readOnly={!edited||blocked} className="h-[310px] w-full min-w-0 resize-y rounded-lg border border-input bg-background p-3 font-mono text-xs leading-6 outline-none focus:ring-2 focus:ring-primary/30" value={text} onChange={e=>setText(e.target.value)}/>
      <div className="mt-3 flex flex-wrap gap-2"><button type="button" className={btn+' border-primary/30 text-primary'} disabled={!edited||!dirty||blocked||!online} onClick={save}><Save className="h-3.5 w-3.5"/>保存修改</button><button type="button" className={btn} disabled={!dirty} onClick={()=>setDiff(!diff)}>查看修改前后</button><button type="button" className={btn} disabled={!dirty||blocked} onClick={async()=>{if(await abandonDraft()){setText(doc.original);setDiff(false)}}}>放弃草稿</button></div>
      {!may('files.update')&&<p className="mt-3 text-xs text-muted-foreground">编辑未授权。进入本工作区的“授权管理”开启；不需要修改 JSON 配置。</p>}
      {diff&&<div aria-label="修改前后对照" className="mt-3 grid min-w-0 gap-3 md:grid-cols-2"><div className="min-w-0"><p className="mb-1 text-xs font-medium">修改前</p><pre className="max-h-52 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-secondary/40 p-2 text-xs">{doc.original}</pre></div><div className="min-w-0"><p className="mb-1 text-xs font-medium">准备保存</p><pre className="max-h-52 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-primary/5 p-2 text-xs">{text}</pre></div></div>}
     </>:!form&&<div className="flex min-h-[300px] flex-col items-center justify-center rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground"><FolderOpen className="mb-3 h-8 w-8"/><p>{selected?.directory?'点“进入文件夹”读取下一层。':selected?'点“读取内容”预览；非文本文件可用电脑软件打开。':'从左侧选择文件或新建文件。'}</p><p className="mt-2 text-xs">灰色操作表示当前目录未开放该权限或连接器版本尚不支持。</p></div>}
     <p className="mt-3 text-xs leading-5 text-muted-foreground">当前网页文本编辑上限 {WORKSPACE_EDIT_BYTES.toLocaleString()} 字节。内容被截断或版本变化时禁止保存；不以预览内容覆盖原文件。</p>
    </section>
   </div>
  </div>
  <section hidden={pane!=='trash'} aria-label="可恢复回收区" className="space-y-3 rounded-xl border border-border p-4"><p className="text-sm">这是连接器在当前授权目录内保存的恢复区，不是 Windows 回收站。恢复不会覆盖同名文件。</p><button type="button" className={btn} disabled={disable('files.trash_list')} onClick={loadTrash}><RefreshCw className="h-3.5 w-3.5"/>读取回收记录</button>{!may('files.trash_list')&&<p className="text-xs text-muted-foreground">当前版本或权限尚未开放回收能力，请在授权管理核对。</p>}{trash?.entries.map(entry=><div key={entry.trash_id} className="flex min-w-0 items-center gap-3 rounded-lg border border-border p-3"><div className="min-w-0 flex-1"><p className="break-all text-sm">{entry.path}</p><p className="text-xs text-muted-foreground">{entry.size.toLocaleString()} 字节 · {String(entry.created_at)}</p></div><button type="button" className={btn} disabled={disable('files.restore')} onClick={()=>void restore(entry)}><RotateCcw className="h-3.5 w-3.5"/>恢复</button></div>)}{trash&&!trash.entries.length&&<p className="text-xs text-muted-foreground">本次读取没有回收记录。</p>}{trash?.truncated&&<p className="text-xs text-muted-foreground">仅显示部分回收记录。</p>}</section>
  <section hidden={pane!=='history'} aria-label="本次文件操作记录" className="rounded-xl border border-border p-4"><p className="mb-3 text-xs text-muted-foreground">本次打开工作区的最近 20 条回执。未知结果不代表失败，不要重复提交。</p>{history.map(row=><div key={row.id} className="grid min-w-0 grid-cols-[1fr_auto] gap-2 border-b border-border py-3 text-xs"><div className="min-w-0"><strong>{row.name}</strong><p className="mt-1 break-all text-muted-foreground">{row.path}</p><p className="mt-1 break-all font-mono text-[10px] text-muted-foreground">{row.id}</p></div><span>{statusNames[row.status]||row.status}<br/>{new Date(row.at).toLocaleTimeString()}</span></div>)}{!history.length&&<p className="text-sm text-muted-foreground">还没有本次操作记录。</p>}</section>
  {!online&&<p role="status" className="rounded-lg bg-secondary p-3 text-sm">设备离线或状态待核实。草稿和旧结果保留，但不会发送新的文件操作。</p>}
  {(busy||job)&&<div role="status" className="flex flex-wrap items-center gap-2 rounded-lg bg-secondary/40 p-3 text-xs">{busy?<Loader2 className="h-4 w-4 animate-spin"/>:job?.status==='succeeded'?<Check className="h-4 w-4"/>:null}<span>{busy&&!job?'等待本人确认':job?statusNames[job.status]||job.status:'正在核实'}</span>{job&&<code className="break-all text-[10px]">{job.id}</code>}{job&&['queued','running'].includes(job.status)&&<button type="button" className={btn} onClick={async()=>{try{if(!valid())return;await localApi('/api/local-jobs/'+job.id+'/cancel',{});if(valid())setNotice('停止请求已提交。已完成的文件变更不会因此撤销，请核对最终回执。')}catch(e){if(valid())setError(workspaceError(e))}}}><Square className="h-3.5 w-3.5"/>请求停止</button>}</div>}
  {notice&&<p role="status" className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs leading-6">{notice}</p>}
  {error&&<p role="alert" className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-xs leading-6 text-destructive">{error}</p>}
  {recover&&<div className="rounded-lg border border-amber-300/50 p-3"><p className="text-xs leading-6">保留了原操作标识，暂不允许发送另一条操作。重新核实只查询原任务；丢失接收回执时只使用原请求编号。</p><button type="button" className={btn+' mt-2'} disabled={busy||!online} onClick={()=>void recheck()}>核实同一操作</button>{job?.status==='unknown'&&<button type="button" className={btn+' ml-2 mt-2'} disabled={busy} onClick={async()=>{if(await confirmInStudio('未知结果不代表没有执行。结束等待不会重新执行或撤销原操作，记录保留在本次操作记录。请先读取目录核对实际结果。',{title:'保留未知结果，返回核对文件',confirmLabel:'我已知悉，结束等待'})){intent.current=null;setRecover(false);setStale(true);setDoc(null);setText('');setNotice('原操作仍为结果未知，没有重复执行。请先核查文件，不要直接重新提交。')}}}>保留记录并结束等待</button>}</div>}
  {job&&(job.result||job.error)&&<details className="text-xs"><summary className="cursor-pointer py-2 text-muted-foreground">查看最近原始回执</summary><pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-secondary p-3">{job.result||job.error}</pre></details>}
 </section>
}
