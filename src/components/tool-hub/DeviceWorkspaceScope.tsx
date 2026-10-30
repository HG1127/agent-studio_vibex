import {useCallback,useEffect,useLayoutEffect,useRef,useState} from 'react'
import {FileText,FolderOpen,Globe2,Loader2,RefreshCw,ShieldCheck,Plus,Trash2,Save,CheckCircle2,Clock3} from 'lucide-react'
import {deviceTools,localApi,LocalApiError,type LocalDevice} from '@/lib/localDevices'
import {decodeRhToken} from '@/lib/studioAuth'
import {devicePermissionSurface,type PermissionPanel} from '@/lib/devicePermissionSurface'
import {readPermissions,parsePicked,isPermissionsReady,emptyFileCapabilities,fileCapabilityLabels,fileGrantLabel,matchesGrantEdit,type FileCapabilities,type Permissions,type PickedGrant,type Control} from '@/lib/workbenchPermissions'
import {prepareWebsiteBatch,reconcileWebsiteDraft,websiteChanges,sameWebsiteSet,selectionRemaining,formatRemaining,type WebsiteDraft} from '@/lib/permissionEditor'
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from '@/components/ui/dialog'
import {ConnectorDownload} from './ConnectorDownload'
import type {PermissionHealth} from '@/lib/connectorExperience'
const action='inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-border bg-card px-3 text-xs font-semibold text-primary hover:bg-secondary disabled:opacity-40'
const primary=action+' border-primary bg-primary text-primary-foreground hover:bg-primary/90'
function FilePermissionControls({fileOnly,readOnly,capabilities,disabled,onChange}:{fileOnly:boolean;readOnly:boolean;capabilities:FileCapabilities;disabled:boolean;onChange:(readOnly:boolean,capabilities:FileCapabilities)=>void}){
 return <div className="space-y-2 text-sm">
  {fileOnly?<p className="text-xs text-muted-foreground">只读此文件，不开放父目录或相邻文件。可单独允许在连接电脑打开。</p>:<label className="flex items-center gap-2"><input type="checkbox" checked={!readOnly} disabled={disabled} onChange={e=>{const ro=!e.target.checked;onChange(ro,ro?{...emptyFileCapabilities(),open:capabilities.open}:{...capabilities})}}/>允许新建文件 / 文件夹、复制文件（不覆盖）</label>}
  {(Object.keys(fileCapabilityLabels) as (keyof FileCapabilities)[]).map(k=><label key={k} className="flex items-center gap-2"><input type="checkbox" checked={capabilities[k]} disabled={disabled||k!=='open'&&(readOnly||fileOnly)} onChange={e=>onChange(readOnly,{...capabilities,[k]:e.target.checked})}/>{fileCapabilityLabels[k]}</label>)}
  <p className="text-xs leading-5 text-muted-foreground">编辑会保留恢复副本；移动和删除仅支持单个文件。打开操作发生在连接电脑，工作台不渲染文件。保存需本机确认。</p>
 </div>
}
type ScopeProps={device:LocalDevice;statusVerified?:boolean;onRefresh?:()=>void;refreshing?:boolean;onHealthChange?:(health:PermissionHealth)=>void;onBusyChange?:(busy:boolean)=>void;refreshToken?:number}
export function DeviceWorkspaceScope(props:ScopeProps){
 const account=decodeRhToken()?.sub||''
 return <PermissionScope key={account+':'+props.device.id} {...props} account={account}/>
}
function PermissionScope({device,statusVerified=true,onRefresh,refreshing=false,account,onHealthChange,onBusyChange,refreshToken=0}:ScopeProps&{account:string}){
 const [open,setOpen]=useState(false),[panel,setPanel]=useState<PermissionPanel>('sites')
 const [meta,setMeta]=useState<Permissions|null>(null),[loading,setLoading]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[channelError,setChannelError]=useState(false)
 const [sites,setSites]=useState<string[]>([]),[siteInput,setSiteInput]=useState(''),[draftRevision,setDraftRevision]=useState('')
 const [picked,setPicked]=useState<PickedGrant|null>(null),[readOnly,setReadOnly]=useState(true)
 const [pickedCapabilities,setPickedCapabilities]=useState<FileCapabilities>(emptyFileCapabilities)
 const [grantDraft,setGrantDraft]=useState<{id:string;readOnly:boolean;capabilities:FileCapabilities;revision:string}|null>(null)
 const [busy,setBusy]=useState(false),[phase,setPhase]=useState(''),[applied,setApplied]=useState(false)
  const [baseSites,setBaseSites]=useState<string[]>([]),[now,setNow]=useState(()=>Date.now()),[canRecheck,setCanRecheck]=useState(false),[startedAt,setStartedAt]=useState(0),[requestDeadline,setRequestDeadline]=useState(0),[submittedView,setSubmittedView]=useState<{id:string;name:string}|null>(null),[pendingStatus,setPendingStatus]=useState('')
  const draft=useRef<WebsiteDraft>({base:[],sites:[],input:'',revision:''})
  useLayoutEffect(()=>{draft.current={base:baseSites,sites,input:siteInput,revision:draftRevision}},[baseSites,sites,siteInput,draftRevision])
  const submitted=useRef<{id:string;requestId:string;name:string;payload:Record<string,unknown>;revision:string}|null>(null),operation=useRef(0)
  const life=useRef(0),mutex=useRef(false),pending=useRef<Control|null>(null),request=useRef<AbortController|null>(null)
 const current=useRef({id:device.id,account,statusVerified})
  useLayoutEffect(()=>{current.current={id:device.id,account,statusVerified}},[device.id,account,statusVerified])
 const fallback=devicePermissionSurface(deviceTools(device))
 const sameTarget=useCallback(()=>!!account&&decodeRhToken()?.sub===account&&current.current.account===account&&current.current.id===device.id,[account,device.id])
 const active=()=>sameTarget()&&current.current.statusVerified
 const ready=!!account&&decodeRhToken()?.sub===account&&statusVerified&&isPermissionsReady(meta,now)
 const stale=!!meta?.protocol&&reconcileWebsiteDraft({base:baseSites,sites,input:siteInput,revision:draftRevision},meta).conflict
 let candidate:string[]=sites,inputError=''
 try{candidate=prepareWebsiteBatch(siteInput,sites).sites}catch(e){inputError=(e as Error).message}
 const sameSites=sameWebsiteSet(candidate,meta?.sites||[]),delta=websiteChanges(baseSites,candidate)
 const dirty=!sameWebsiteSet(sites,baseSites)||!!siteInput.trim(),blocked=busy||canRecheck
 const hasUnsettledWork=blocked||dirty||!!picked||!!grantDraft
 useEffect(()=>{onHealthChange?.({owner:account,deviceId:device.id,permissions:meta,error:channelError})},[onHealthChange,account,device.id,meta,channelError])
 useEffect(()=>{onBusyChange?.(hasUnsettledWork);return()=>onBusyChange?.(false)},[hasUnsettledWork,onBusyChange])
 const remaining=picked?selectionRemaining(picked.expires_at,now):0
 const selectionInvalid=!!picked&&(!remaining||picked.permission_revision!==meta?.revision)
 const adoptMeta=useCallback((value:Permissions,siteSaved=false)=>{
  setMeta(value);setNow(Date.now());setChannelError(false)
  if(!value.protocol)return
  const next=siteSaved?{revision:value.revision||'',base:[...value.sites],sites:[...value.sites],input:''}:reconcileWebsiteDraft(draft.current,value).draft
  draft.current=next;setBaseSites(next.base);setSites(next.sites);setSiteInput(next.input);setDraftRevision(next.revision)
 },[])
 useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),open?1000:10000);return()=>clearInterval(timer)},[open])
 useEffect(()=>{
  life.current++;operation.current++;request.current?.abort();pending.current=null;submitted.current=null;mutex.current=false;draft.current={base:[],sites:[],input:'',revision:''}
  const epoch=life.current,ctrl=new AbortController()
  void readPermissions(device.id,ctrl.signal).then(v=>{if(epoch===life.current&&sameTarget())adoptMeta(v)}).catch(()=>{if(!ctrl.signal.aborted&&epoch===life.current&&sameTarget())setChannelError(true)})
  return()=>{life.current=epoch+1;ctrl.abort();request.current?.abort();const p=pending.current;if(p&&decodeRhToken()?.sub===account)void localApi('/api/local-controls/'+p.id+'/cancel',{}).catch(()=>{})}
 },[device.id,account,sameTarget,adoptMeta])
 useEffect(()=>{
  if(!refreshToken)return
  const epoch=life.current,controller=new AbortController()
  void readPermissions(device.id,controller.signal).then(value=>{if(epoch===life.current&&sameTarget())adoptMeta(value)}).catch(()=>{if(!controller.signal.aborted&&epoch===life.current&&sameTarget())setChannelError(true)})
  return()=>controller.abort()
 },[refreshToken,device.id,sameTarget,adoptMeta])
 const refresh=async()=>{
  if(!sameTarget())return
  const epoch=life.current;setLoading(true)
  try{const v=await readPermissions(device.id);if(epoch===life.current&&sameTarget())adoptMeta(v)}catch(e){if(epoch===life.current&&sameTarget()){setChannelError(true);setError((e as Error).message)}}finally{if(epoch===life.current)setLoading(false)}
 }
 const show=async(next:PermissionPanel)=>{
  setPanel(next);if(open)return
  setOpen(true);setError('');setLoading(true);setNow(Date.now())
  const epoch=life.current
  try{const v=await readPermissions(device.id);if(epoch!==life.current||!sameTarget())return;adoptMeta(v)}catch(e){if(epoch===life.current&&sameTarget()){setChannelError(true);setError((e as Error).message)}}finally{if(epoch===life.current)setLoading(false)}
 }
 useEffect(()=>{const epoch=life.current;let reading=false;const timer=setInterval(()=>{if(!reading&&sameTarget()&&document.visibilityState!=='hidden'){reading=true;void readPermissions(device.id).then(v=>{if(epoch===life.current&&sameTarget())adoptMeta(v)}).catch(()=>{if(epoch===life.current&&sameTarget())setChannelError(true)}).finally(()=>{reading=false})}},open?5000:15000);return()=>clearInterval(timer)},[open,device.id,account,sameTarget,adoptMeta])
 const addSite=()=>{try{const batch=prepareWebsiteBatch(siteInput,sites);setSites(batch.sites);setSiteInput('');setError('');setApplied(false);setNotice(batch.duplicates?'已忽略'+batch.duplicates+'个重复网站。修改尚未保存。':'')}catch(e){setError((e as Error).message)}}
 const discardDraft=()=>{setSites(meta?.sites||[]);setBaseSites(meta?.sites||[]);setSiteInput('');setDraftRevision(meta?.revision||'');setPicked(null);setGrantDraft(null);setReadOnly(true);setPickedCapabilities(emptyFileCapabilities());setApplied(false);setNotice('已放弃当前页面草稿，电脑上的授权没有变化。');setError('')}
 const saveSites=()=>{try{const batch=prepareWebsiteBatch(siteInput,sites);if(sameWebsiteSet(batch.sites,meta?.sites||[])){setSiteInput('');return}setSites(batch.sites);setSiteInput('');void submit('sites-save',{origins:batch.sites},draftRevision)}catch(e){setError((e as Error).message)}}
 const submit=async(name:string,payload:Record<string,unknown>,revision=name==='sites-save'?draftRevision:meta?.revision||'',resuming=false)=>{
  const resume=resuming?submitted.current:null
  if(mutex.current||!sameTarget()||resuming&&!resume||(!resume&&(!active()||!!submitted.current||!!pending.current||!isPermissionsReady(meta)||revision!==meta?.revision))){setError('设备状态或授权版本变化。请刷新核实；已有请求请重新检查结果，不要重复提交。');return}
  mutex.current=true;setBusy(true);setCanRecheck(false);setRequestDeadline(0);setError('');setApplied(false);if(!resume)setStartedAt(Date.now());setNow(Date.now())
  setPhase(resume?(resume.id?'重新检查原请求':'恢复原请求回执'):'正在提交请求')
  setNotice(resume?(resume.id?'只查询原请求结果，不会重新执行或弹出确认。':'使用原请求编号恢复回执；已接收的请求不会重复执行。'):name==='file-pick'?'请在「'+device.name+'」的系统窗口选择；无需打开另一个管理网页。':'请在「'+device.name+'」确认本次范围；此时尚未保存。')
  const epoch=life.current,run=++operation.current,ctrl=new AbortController();request.current=ctrl
  const valid=()=>epoch===life.current&&run===operation.current&&sameTarget()&&!ctrl.signal.aborted
  let createdId=resume?.id||''
  const settled=()=>{pending.current=null;submitted.current=null;setCanRecheck(false);setRequestDeadline(0);setSubmittedView(null);setPendingStatus('');setPhase('')}
  try{
   // Keep the complete intent before sending: a lost POST receipt must not create a new operation.
   const intent=resume||{id:'',requestId:crypto.randomUUID(),name,payload:structuredClone(payload),revision}
   submitted.current=intent;setSubmittedView({id:intent.id,name:intent.name})
   const created=intent.id?{id:intent.id}:await localApi<{id:string}>('/api/local-devices/'+device.id+'/controls',{action:intent.name,request_id:intent.requestId,permission_revision:intent.revision,confirm:true,...intent.payload},ctrl.signal)
   if(!/^[A-Za-z0-9]{24}$/.test(created.id))throw Error('授权请求编号无法核实。')
   createdId=created.id
   if(!valid()){if(decodeRhToken()?.sub===account)void localApi('/api/local-controls/'+created.id+'/cancel',{}).catch(()=>{});return}
   submitted.current={...intent,id:created.id};setSubmittedView({id:created.id,name:name})
   if(!pending.current)pending.current={id:created.id,device_id:device.id,action:name,status:'queued',result:'',error:'',deadline_ms:0};setPendingStatus(pending.current.status)
   for(let i=0;i<250;i++){
    if(!valid())return
    const r=await localApi<Control>('/api/local-controls/'+created.id,undefined,ctrl.signal)
    if(!valid())return
    if(r.id!==created.id||r.device_id!==device.id||r.action!==name)throw Error('授权请求与当前设备不一致。')
     pending.current=r;setPendingStatus(r.status);setRequestDeadline(Number(r.deadline_ms)||0)
     if(r.status==='queued')setPhase('等待设备接收')
     if(r.status==='running')setPhase(name==='file-pick'?'等待本机选择':'等待本机确认')
     if(r.status==='committing')setPhase('本机正在应用')
    if(r.status==='succeeded'){
     if(name==='file-pick'){
      try{setPicked(parsePicked(r.result,revision));setReadOnly(true);setPickedCapabilities(emptyFileCapabilities());setGrantDraft(null);settled();setNotice('文件已选好，尚未授权。核对下方范围后保存。')}
      catch{setPicked(null);settled();setError('本机选择结果已过期或无法核实，请重新选择。');setNotice('原文件选择已过期或无法核实，尚未授权访问。请重新选择。')}
      return
     }
     const result=JSON.parse(r.result) as {revision?:string}
     if(!/^[a-f0-9]{24}$/.test(result.revision||''))throw Error('保存回执已返回，但生效版本无法核实。请重新检查，不要重复提交。')
     setPhase('已保存，确认生效');setNotice('本机已保存，正在核对执行器使用的新权限。')
     for(let n=0;n<30;n++){
      if(!valid())return
      const v=await readPermissions(device.id,ctrl.signal)
      if(!valid())return
      adoptMeta(v)
      if(v.revision===result.revision&&v.applied_revision===result.revision&&isPermissionsReady(v)){
       adoptMeta(v,name==='sites-save');if(name==='grant-save')setPicked(null);if(name==='grant-edit')setGrantDraft(null);settled();setApplied(true);setNotice('新授权已生效，设备保持原绑定。');onRefresh?.();return
      }
      await new Promise(resolve=>setTimeout(resolve,750))
     }
     setNotice('本机已保存，暂未确认执行器已应用。点击“重新检查结果”继续核实，不会再次保存。');return
    }
    if(r.status==='unknown'){
     const v=await readPermissions(device.id,ctrl.signal)
     if(!valid())return
     adoptMeta(v)
     // Reconcile exact website sets/root IDs only. A display name is never proof
     // that a particular opaque file selection was authorized successfully.
     const desired=name==='sites-save'&&Array.isArray(payload.origins)&&sameWebsiteSet(v.sites,payload.origins as string[])
      ||name==='grant-edit'&&matchesGrantEdit(v.grants,payload)
     if(v.revision!==revision&&isPermissionsReady(v)&&desired){adoptMeta(v,name==='sites-save');if(name==='grant-edit')setGrantDraft(null);settled();setApplied(true);setNotice('最终回执未返回，但已核实当前生效的网站或目录权限符合本次设置。');onRefresh?.();return}
     setPhase('结果待核实');throw Error('应用结果仍待核实。原请求已保留，请重新检查结果，不要重复保存。')
    }
    if(['cancelled','expired','failed'].includes(r.status)){
     settled()
     if(r.status==='cancelled'){setNotice('已取消，未保存本次授权。草稿仍在当前页面。');return}
     let message=r.result||(r.status==='expired'?'授权请求已过期，未保存本次修改。草稿已保留，请恢复连接后重新确认。':'本次授权未完成，请核对设备状态后重新发起。')
     try{const receipt=JSON.parse(r.result);if(receipt.saved===false&&receipt.revision===revision)message='本次授权未保存，电脑仍使用原授权范围。请检查连接后重试。'}catch{/* Keep the original receipt or error when verification is inconclusive. */}
     throw Error(message)
    }
    await new Promise(resolve=>setTimeout(resolve,800))
   }
   setNotice('请求结果尚未确认。可取消或重新检查同一请求，不会自动重复提交。')
  }catch(e){if(valid()){
   setError((e as Error).message)
   // These server codes are emitted only after looking up the original request.
   // Generic 409/5xx, malformed replies and transport failures remain uncertain.
   const absent=e instanceof LocalApiError&&e.status===409&&['connector_update_or_offline','permission_revision_changed','device_busy'].includes(e.code)
   const initialRejection=!resume&&e instanceof LocalApiError&&(e.status===401&&e.code==='studio_login_required'||e.status===409&&['invalid_control_request','invalid_origins','invalid_origin'].includes(e.code))
   if(!createdId&&(absent||initialRejection)){settled();setNotice('服务端已拒绝本次请求，未创建授权操作。草稿仍在当前页面，请核对状态后再保存。')}
   else if(createdId&&submitted.current)setNotice('请求已保留。重新检查只查询结果，不会重复执行。')
   else if(submitted.current){setPhase('请求回执待恢复');setNotice('尚未确认请求是否送达。请恢复同一请求；不要再次保存、刷新页面或把关闭页面当作取消。')}
   else setNotice('本次请求已结束，请核对提示后重新发起。')
  }}
  finally{if(epoch===life.current&&run===operation.current){mutex.current=false;setBusy(false);setCanRecheck(!!submitted.current);if(!submitted.current)setPhase('')}}
 }
 const cancel=async()=>{
  if(!sameTarget())return
  const epoch=life.current,p=pending.current
  if(p&&['committing','succeeded','unknown'].includes(p.status)||phase==='本机正在应用'||phase==='已保存，确认生效'){
   setNotice('本机已进入应用或结果核实阶段，不能安全取消。请等待或重新检查原请求，不要重复提交。');return
  }
  if(p){
   try{
    const r=await localApi<Control>('/api/local-controls/'+p.id+'/cancel',{})
    if(epoch!==life.current||!sameTarget()||pending.current?.id!==p.id)return
    if(r.id!==p.id||r.device_id!==device.id)throw Error('取消结果与当前设备不一致。')
    if(r.status!=='cancelled'){pending.current=r;setPendingStatus(r.status);setNotice('请求已进入应用阶段或已结束，请重新检查结果。');return}
    operation.current++;request.current?.abort();pending.current=null;submitted.current=null;setSubmittedView(null);setPendingStatus('');mutex.current=false;setBusy(false);setCanRecheck(false);setRequestDeadline(0);setPhase('');setNotice('请求已取消，未保存本次授权。草稿仍保留在当前页面。')
   }catch(e){
    if(epoch!==life.current||!sameTarget())return
    try{const latest=await localApi<Control>('/api/local-controls/'+p.id);if(epoch!==life.current||!sameTarget())return;if(latest.id===p.id&&latest.device_id===device.id&&['committing','succeeded','unknown'].includes(latest.status)){pending.current=latest;setPendingStatus(latest.status);setPhase(latest.status==='committing'?'本机正在应用':'已保存，确认生效');setNotice('本机已开始应用，无法取消。请等待核实或重新检查结果。');return}}catch{/* Keep the original receipt or error when verification is inconclusive. */}
    setError((e as Error).message);return
   }
  }else if(busy||submitted.current){setNotice('尚未确认请求是否送达，请先恢复同一请求，再核对是否可以取消。当前不能确认已取消。');return}
  setOpen(false)
 }
 if(!/^[A-Za-z0-9]{24}$/.test(device.id))return null
 const shownSites=meta?.protocol?meta.sites:fallback.sites
 const shownGrants=meta?.protocol?meta.grants:fallback.roots.map(r=>({id:r.id,label:r.label,kind:'folder' as const,read_only:!r.writable,capabilities:emptyFileCapabilities()}))
 const awaitingReceipt=!!submittedView&&!submittedView.id
 const cannotCancel=awaitingReceipt||['committing','succeeded','unknown'].includes(pendingStatus)
 const waitingForPerson=busy&&phase==='等待本机确认'
 const channelFresh=!channelError&&meta?.available===true&&now-meta.seen_ms<45000
 const statusText=ready?'当前授权已生效':meta?.protocol&&!meta.available?'电脑离线或状态待核实':meta?.available?'正在同步授权':'等待连接器上线'
 const editInput=(text:string)=>{setSiteInput(text);setApplied(false);setNotice('');setError('')}
 return <section aria-label="工作目录授权" className="min-w-0 rounded-xl border border-border bg-card">
  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
   <div><h3 className="flex items-center gap-2 text-sm font-semibold"><ShieldCheck className="h-4 w-4 text-primary"/>授权管理</h3><p className="mt-1 text-xs text-muted-foreground">网站与文件集中管理，权限变化由本机确认</p></div>
   <button type="button" className={action} onClick={()=>void show('sites')}>管理网站与文件授权</button>
  </div>
  <div className="grid min-w-0 gap-4 p-4 md:grid-cols-2">
   <div className="min-w-0"><div className="mb-3 flex items-center justify-between gap-2"><h4 className="text-xs font-semibold">已授权网站 · {shownSites.length}</h4><button type="button" className={action} disabled={!statusVerified} onClick={()=>void show('sites')}>编辑网站</button></div>{shownSites.map(s=><p key={s} className="mb-2 break-all text-sm">{s}</p>)}{!shownSites.length&&<p className="text-xs text-muted-foreground">没有授权网站，不代表允许任意访问。</p>}</div>
   <div className="min-w-0 md:border-l md:border-border md:pl-4"><div className="mb-3 flex items-center justify-between gap-2"><h4 className="text-xs font-semibold">已授权文件 / 目录 · {shownGrants.length}</h4><button type="button" className={action} disabled={!statusVerified} onClick={()=>void show('files')}>管理文件授权</button></div>{shownGrants.map(g=><p key={g.id} className="mb-2 break-words text-sm">{g.label}<span className="ml-2 text-xs text-muted-foreground">{fileGrantLabel(g)}</span></p>)}{!shownGrants.length&&<p className="text-xs text-muted-foreground">尚未授权文件，可以只选择一个文件。</p>}</div>
  </div>
  {!open&&(dirty||picked||grantDraft)&&<div className="mx-4 mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs"><span>当前页面保留了未保存的草稿</span><button type="button" className="min-h-8 font-semibold text-primary" onClick={()=>void show(dirty?'sites':'files')}>继续编辑</button></div>}
  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-2 text-xs text-muted-foreground"><span className="flex items-center gap-2"><span className={'h-1.5 w-1.5 rounded-full '+(ready?'bg-emerald-500':'bg-amber-500')}/>{statusText}{meta?.version?' · '+meta.version:''}</span><button type="button" className={action} disabled={loading||refreshing||busy} onClick={()=>{void refresh();onRefresh?.()}}><RefreshCw className={'h-3.5 w-3.5 '+(loading?'animate-spin':'')}/>刷新授权状态</button></div>
  <Dialog open={open} onOpenChange={value=>{if(!value){if(blocked)setNotice('请求尚未结束，请使用取消或重新检查结果；关闭页面不代表撤销授权。');else void cancel()}}}>
   <DialogContent aria-label="工作台授权管理" className="flex max-h-[90dvh] w-[calc(100%-1.5rem)] max-w-2xl flex-col gap-0 overflow-hidden p-0" onInteractOutside={e=>{if(blocked)e.preventDefault()}}>
    <DialogHeader className="border-b border-border p-5 pr-12 text-left"><DialogTitle>工作台授权管理</DialogTitle><DialogDescription>{device.name} · #{device.id.slice(-6)}。无需切换管理网页；文件选择和最终确认在被连接电脑出现。</DialogDescription></DialogHeader>
    <div role="tablist" aria-label="授权分类" className="flex gap-2 border-b border-border px-5 py-3">{(['sites','files'] as const).map(t=><button type="button" key={t} role="tab" aria-label={t==='sites'?'网站':'文件与文件夹'} aria-selected={panel===t} className={action+(panel===t?' border-primary bg-primary/5':'')} onClick={()=>setPanel(t)}>{t==='sites'?<Globe2 className="h-4 w-4"/>:<FolderOpen className="h-4 w-4"/>}{t==='sites'?'网站':'文件与文件夹'}<span aria-hidden="true" className="text-muted-foreground">{t==='sites'?sites.length:shownGrants.length}</span>{t==='sites'&&dirty&&<span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-primary"/>}</button>)}</div>
    <div className="min-h-0 space-y-4 overflow-y-auto p-5">
     {loading&&<p className="text-xs text-muted-foreground">正在核实设备和授权版本…</p>}
     {!meta?.protocol&&!loading&&<div className="space-y-3 rounded-xl border border-border p-4"><p className="text-sm">当前连接器尚未上报内嵌管理能力。升级后恢复原连接，无需重新配对。</p><ConnectorDownload purpose="update"/></div>}
     {stale&&panel==='sites'&&<div role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">网站授权已在其他窗口更新，你的草稿未被覆盖。<details className="mt-2"><summary className="cursor-pointer text-xs">查看当前已生效的网站</summary><p className="mt-2 break-all text-xs">{meta?.sites.join('、')||'无'}</p></details><button type="button" className={action+' mt-2'} disabled={blocked} onClick={discardDraft}>放弃草稿并加载最新授权</button></div>}
     {panel==='sites'?<div className="space-y-3">
      <p className="text-sm font-medium">添加授权网站</p>
      <div className="flex items-start gap-2"><textarea aria-label="添加授权网站" rows={2} value={siteInput} disabled={blocked||stale} onChange={e=>editInput(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();addSite()}}} placeholder={'example.com\n可粘贴多个网站，以换行或逗号分隔'} className="min-w-0 flex-1 resize-y rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20"/><button type="button" className={action} disabled={blocked||stale||!siteInput.trim()} onClick={addSite}><Plus className="h-4 w-4"/>添加</button></div>
      <p className="text-xs leading-5 text-muted-foreground">域名自动补全 https，页面路径归一到网站来源。可直接保存，无需逐个添加；Shift+Enter 换行。</p>
      {inputError&&<p className="text-xs leading-5 text-destructive">{inputError}</p>}
      {sites.map(s=><div key={s} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm"><Globe2 className="h-4 w-4 shrink-0 text-primary"/><span className="min-w-0 flex-1 break-all">{s}</span>{!baseSites.includes(s)&&<span className="rounded bg-primary/10 px-2 py-1 text-[11px] text-primary">待新增</span>}<button type="button" className="min-h-10 min-w-10 rounded-lg text-destructive hover:bg-destructive/10 disabled:opacity-40" aria-label={'移除 '+s} disabled={blocked||stale} onClick={()=>{setSites(v=>v.filter(x=>x!==s));setApplied(false);setNotice('')}}><Trash2 className="mx-auto h-4 w-4"/></button></div>)}
      {!sites.length&&!siteInput&&<p className="rounded-lg border border-dashed border-border px-3 py-4 text-xs text-muted-foreground">尚无网站。添加后，只有明确授权的来源可以访问。</p>}
      {(delta.added.length>0||delta.removed.length>0)&&<div aria-label="网站变更摘要" className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs leading-6">待保存：新增 {delta.added.length} 个，移除 {delta.removed.length} 个。{candidate.length===0?' 保存后关闭网站访问，但不会断开电脑连接。':''}</div>}
      <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-muted-foreground">按协议、域名和端口授权，最多12个网站。</p><button type="button" className={primary} disabled={!ready||blocked||stale||sameSites||!!inputError} onClick={saveSites}><Save className="h-4 w-4"/>保存网站授权</button></div>
     </div>:<div className="space-y-3">
      <div className="flex flex-wrap gap-2"><button type="button" className={action} disabled={!ready||blocked} onClick={()=>void submit('file-pick',{kind:'file'})}><FileText className="h-4 w-4"/>选择单个文件</button><button type="button" className={action} disabled={!ready||blocked} onClick={()=>void submit('file-pick',{kind:'folder'})}><FolderOpen className="h-4 w-4"/>选择文件夹</button></div>
      {shownGrants.map(g=><div key={g.id} className="space-y-3 rounded-lg border border-border p-3"><div className="flex items-center gap-2">{g.kind==='folder'?<FolderOpen className="h-4 w-4 shrink-0 text-primary"/>:<FileText className="h-4 w-4 shrink-0 text-primary"/>}<span className="min-w-0 flex-1 break-words text-sm font-medium">{g.label}</span><span className="text-xs text-muted-foreground">{fileGrantLabel(g)}</span></div>
       {grantDraft?.id===g.id?<><FilePermissionControls fileOnly={g.kind==='file'} readOnly={grantDraft.readOnly} capabilities={grantDraft.capabilities} disabled={blocked||grantDraft.revision!==meta?.revision} onChange={(ro,c)=>{setGrantDraft({...grantDraft,readOnly:ro,capabilities:c});setApplied(false)}}/>{grantDraft.revision!==meta?.revision&&<p role="alert" className="text-xs text-destructive">授权版本已变化。请取消草稿后重新编辑最新权限。</p>}<div className="flex flex-wrap gap-2"><button type="button" className={primary} disabled={!ready||blocked||grantDraft.revision!==meta?.revision} onClick={()=>void submit('grant-edit',{root_id:g.id,read_only:grantDraft.readOnly,capabilities:grantDraft.capabilities},grantDraft.revision)}>保存此授权</button><button type="button" className={action} disabled={blocked} onClick={()=>setGrantDraft(null)}>取消权限草稿</button></div></>:<div className="flex flex-wrap gap-2"><button type="button" className={action} disabled={!ready||blocked} onClick={()=>{setGrantDraft({id:g.id,readOnly:g.read_only,capabilities:{...g.capabilities},revision:meta?.revision||''});setPicked(null);setPickedCapabilities(emptyFileCapabilities());setReadOnly(true)}}>编辑细分权限</button><button type="button" className={action+' text-destructive'} disabled={!ready||blocked} onClick={()=>void submit('grant-edit',{root_id:g.id,remove:true})}>移除此授权</button></div>}
      </div>)}

      {!shownGrants.length&&<p className="rounded-lg border border-dashed border-border px-3 py-4 text-xs text-muted-foreground">尚未授权文件。选择单个文件即可，不必开放整个文件夹。</p>}
      {picked&&<div className="space-y-3 rounded-lg border border-primary/30 bg-primary/5 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><p className="break-words text-sm font-medium">已选择：{picked.label}</p><span className="flex items-center gap-1 text-xs text-muted-foreground"><Clock3 className="h-3.5 w-3.5"/>{formatRemaining(remaining)}</span></div>{selectionInvalid?<p className="text-xs text-destructive">{!remaining?'选择已过期，未授权访问。请重新选择，不需要重新配对。':'授权范围已变化，旧选择不能直接保存。请重新选择并核对。'}</p>:<>{picked.covered_by_folder&&<p className="text-xs leading-6">已有整文件夹授权覆盖此位置。新增单文件不会自动缩小旧权限，请移除不需要的目录授权。</p>}<FilePermissionControls fileOnly={picked.kind==='file'} readOnly={readOnly} capabilities={pickedCapabilities} disabled={blocked} onChange={(ro,c)=>{setReadOnly(ro);setPickedCapabilities(c)}}/></>}<div className="flex flex-wrap gap-2">{selectionInvalid?<button type="button" className={primary} disabled={!ready||blocked} onClick={()=>void submit('file-pick',{kind:picked.kind})}>重新选择{picked.kind==='file'?'文件':'文件夹'}</button>:<button type="button" className={primary} disabled={!ready||blocked} onClick={()=>void submit('grant-save',{grant_id:picked.grant_id,read_only:readOnly,capabilities:pickedCapabilities},picked.permission_revision)}>确认并保存授权</button>}<button type="button" className={action} disabled={blocked} onClick={()=>{setPicked(null);setReadOnly(true);setPickedCapabilities(emptyFileCapabilities())}}>取消选择</button></div></div>}
      <p className="text-xs leading-6 text-muted-foreground">移除授权不会删除文件。本机完整路径不上传，最终确认时显示准确位置。</p>
     </div>}
     {error&&<p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm leading-6 text-destructive">{error}</p>}
    </div>
    <div className="space-y-3 border-t border-border bg-card p-4">
      {notice&&<p role="status" className="flex items-start gap-2 rounded-lg bg-secondary px-3 py-2 text-sm leading-6">{waitingForPerson?<Clock3 className="mt-1 h-4 w-4 shrink-0"/>:busy?<Loader2 className="mt-1 h-4 w-4 shrink-0 animate-spin"/>:applied?<CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-emerald-600"/>:null}<span>{phase&&<strong>{phase}{busy?' · 已等待 '+Math.max(0,Math.floor((now-startedAt)/1000))+' 秒':''}{busy&&requestDeadline?' · 请求剩余约 '+Math.max(0,Math.ceil((requestDeadline-now)/1000))+' 秒':''}<br/></strong>}{notice}</span></p>}
      {busy&&submittedView&&<div role="note" aria-label="本机确认窗口提示" className="rounded-lg border border-primary/25 bg-primary/5 px-3 py-3 text-xs leading-5"><strong>{!channelFresh?'连接状态待核实，授权结果尚未确认':waitingForPerson?'正在等您确认，不是在加载网页':phase==='等待设备接收'?'请求已提交，等待连接器接收':'正在核实本次授权请求'}</strong><p className="mt-1">{waitingForPerson?'在「'+device.name+'」查看“Agent Studio · 本机授权确认”窗口；核对范围后点“确认并保存”。':'未收到生效回执前不会显示保存成功；刷新状态只查询，不会重新提交。'}</p>{waitingForPerson&&<details className="mt-1" open={now-startedAt>=8000}><summary className="cursor-pointer font-semibold text-primary">没有看到确认窗口？</summary><p>按 Alt+Tab 或检查任务栏。新版确认窗置顶、默认拒绝，90秒未确认会自动关闭；旧版连接器需更新后恢复同一连接。取消会保留当前页面草稿。</p></details>}{!channelFresh&&<p className="mt-1">请核实连接器仍在运行；网络恢复后检查同一请求，不要重复保存。</p>}</div>}
      <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-xs text-muted-foreground">{submittedView?'本次请求尚待核实，刷新或离开页面不会撤销授权。':dirty||picked||grantDraft?'草稿仅保留在当前页面，刷新或离开页面将清除。':statusText}</span><div className="flex flex-wrap gap-2">{(dirty||picked||grantDraft)&&!blocked&&<button type="button" className={action} onClick={discardDraft}>放弃未保存修改</button>}{canRecheck&&!busy&&submittedView&&<button type="button" className={primary} onClick={()=>{const s=submitted.current;if(s)void submit(s.name,s.payload,s.revision,true)}}>{submittedView.id?'重新检查结果':'恢复同一请求'}</button>}<button type="button" className={action} disabled={loading} onClick={()=>void refresh()}><RefreshCw className={'h-3.5 w-3.5 '+(loading?'animate-spin':'')}/>刷新状态</button><button type="button" className={action} disabled={cannotCancel} onClick={()=>void cancel()}>{awaitingReceipt?'请先恢复请求回执':cannotCancel?'正在核实应用结果':blocked?'取消本次请求':'返回工作台'}</button></div></div>
     </div>
   </DialogContent>
  </Dialog>
 </section>
}
