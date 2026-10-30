import {useEffect,useRef,useState} from 'react'
import {useSearchParams} from 'react-router-dom'
import {createPgNativePilotApi} from '../../lib/pgNativePilotApi.ts'
import {createOriginalRunDetailSession} from '../../lib/originalRunDetailSession.ts'
import {createOriginalRunDetailTransport} from '../../lib/originalRunDetailTransport.ts'
import {originalRunDetailTarget,originalRunId,type OriginalRunKind} from '../../lib/originalRunDetailRoute.ts'
import {originalRunDetailReport} from '../../lib/originalRunDetailProjection.ts'
import {getStudioAccountInfo,verifyStudioSession,redirectToRhLogin} from '../../lib/studioAuth.ts'
import {getStudioBackend} from '../../lib/studioBackend.ts'
import {registerUnsavedWorkCheck} from '../../lib/unsavedNavigation.ts'
import {RUN_STATE_META,formatRunDetailTime} from '../../lib/runPresentation.ts'
import type {RunEventRow} from '../AgentRun/useAgentRun.ts'
import type {usePocketBaseRunDetail,RunDetailRow} from './useRunDetail.ts'
type Controller=ReturnType<typeof createOriginalRunDetailSession>
type View=ReturnType<Controller['snapshot']>
export function usePgOriginalRunDetail():ReturnType<typeof usePocketBaseRunDetail>&{nativeMode:true;nativeState:View|null;handleRefreshNative:()=>Promise<void>;handleMoreNativeSteps:()=>Promise<void>;handleConfirmNative:()=>Promise<void>}{
 const [params,setParams]=useSearchParams(),[view,setView]=useState<View|null>(null),[initialError,setInitialError]=useState(''),[liveEnabled,setLiveEnabled]=useState(true),[copiedFlag,setCopied]=useState(false)
 const sessions=useRef(new Map<string,{controller:Controller;transport:ReturnType<typeof createOriginalRunDetailTransport>}>()),current=useRef<Controller|null>(null),mounted=useRef(false),routeKey=useRef(''),copyTimer=useRef<ReturnType<typeof setTimeout>|null>(null)
 const account=getStudioAccountInfo(),employee=account?.active?account.id:'',nativeBackend=getStudioBackend()==='native_pg'
 let target:ReturnType<typeof originalRunDetailTarget>=null,routeError='';try{target=originalRunDetailTarget(params)}catch{routeError='运行链接参数有歧义或不受支持；未读取其他运行。'}
 const requestedId=target?.id??'',requestedKind=target?.kind??'',key=params.toString()
 const safeView=view&&view.employee===employee&&view.active&&nativeBackend&&!routeError?view:null
 const visibleRun=safeView?.run&&safeView.run.id===requestedId&&(!requestedKind||safeView.run.native?.kind===requestedKind)?safeView.run:null
 useEffect(()=>{
  mounted.current=true;let cancelled=false,checking=false,unsubscribe:(()=>void)|undefined,unregister:(()=>void)|undefined
  async function verify(){const status=await verifyStudioSession(),who=getStudioAccountInfo();if(status==='unavailable')throw Error('original_detail_session_unavailable');return status==='authenticated'&&who?.active?who.id:''}
  async function bind(){if(cancelled||checking||!mounted.current)return;checking=true
   try{
    const who=await verify();if(cancelled||!mounted.current)return
    if(!who||getStudioBackend()!=='native_pg'){current.current?.suspend();current.current=null;setView(null);setInitialError('请先核实当前员工 Native 会话。');return}
    let entry=sessions.current.get(who)
    if(!entry){
     const transport=createOriginalRunDetailTransport({employeeId:who,verifyEmployee:verify}),storageKey='agentstudio.original.run-detail.control.v1.'+who
     const controller=createOriginalRunDetailSession({employee:who,api:createPgNativePilotApi(transport.transport),verifyEmployee:verify,recovery:{load(){const raw=sessionStorage.getItem(storageKey);if(raw===null)return null;if(raw.length>2048)throw Error('invalid_control_recovery');return JSON.parse(raw)},save(value){if(value===null)sessionStorage.removeItem(storageKey);else sessionStorage.setItem(storageKey,JSON.stringify(value))}}})
     entry={controller,transport};sessions.current.set(who,entry)
    }
    if(current.current!==entry.controller){current.current?.suspend();unsubscribe?.();unregister?.();current.current=entry.controller;routeKey.current='';const c=entry.controller;unsubscribe=c.subscribe(()=>{if(!cancelled&&mounted.current&&current.current===c)setView(c.snapshot())});unregister=registerUnsavedWorkCheck(()=>c.navigationBlocked());setView(c.snapshot());setInitialError('');await c.resume()}
    else if(!entry.controller.snapshot().active){setInitialError('');await entry.controller.resume()}else {await entry.controller.verifyIdentity();setInitialError('')}
   }catch{if(cancelled||!mounted.current)return;current.current?.suspend();setView(current.current?.snapshot()??null);setInitialError('员工会话或原详情接口尚未核实，私有正文已隐藏，原未确认控制仍保留。')}
   finally{checking=false}
  }
  const focus=()=>{void bind()},hidden=()=>{if(document.hidden){current.current?.suspend()}else void bind()},unload=(event:BeforeUnloadEvent)=>{if([...sessions.current.values()].some(v=>v.controller.navigationBlocked())){event.preventDefault();event.returnValue=''}}
  void bind();window.addEventListener('focus',focus);document.addEventListener('visibilitychange',hidden);window.addEventListener('beforeunload',unload);const timer=window.setInterval(()=>{if(!document.hidden)void bind()},3000)
  return()=>{cancelled=true;mounted.current=false;unsubscribe?.();unregister?.();window.clearInterval(timer);window.removeEventListener('focus',focus);document.removeEventListener('visibilitychange',hidden);window.removeEventListener('beforeunload',unload);for(const entry of sessions.current.values()){entry.controller.dispose();entry.transport.close()}sessions.current.clear();current.current=null;if(copyTimer.current)clearTimeout(copyTimer.current)}
 },[])
 useEffect(()=>{const c=current.current;if(!c||!safeView||safeView.loading||safeView.busy||safeView.pending||routeKey.current===key)return;routeKey.current=key;if(routeError)return;void c.select(target)},[key,safeView,routeError])
 useEffect(()=>{if(!visibleRun||!liveEnabled||!['queued','running','paused','awaiting_approval','awaiting_input'].includes(visibleRun.status))return;const timer=window.setInterval(()=>{if(!document.hidden)void current.current?.refresh()},3000);return()=>window.clearInterval(timer)},[visibleRun?.id,visibleRun?.native?.kind,liveEnabled])
 const act=async(work:(c:Controller)=>Promise<unknown>)=>{const c=current.current;if(c)await work(c)}
 const handleSelectRecent=(value:string)=>{const split=value.indexOf(':'),kind=value.slice(0,split) as OriginalRunKind,id=value.slice(split+1);if(split<0||!originalRunId(id))return;setParams(previous=>{const next=new URLSearchParams(previous);next.set('run',id);next.set('kind',kind);next.delete('run_id');next.delete('engine_kind');return next});setLiveEnabled(true)}
 const handleBackToRecent=()=>setParams(previous=>{const next=new URLSearchParams(previous);for(const k of ['run','run_id','kind','engine_kind'])next.delete(k);return next})
 async function verifiedRun():Promise<RunDetailRow|null>{const c=current.current;if(!c||!visibleRun)return null;await c.refresh();const latest=c.snapshot().run;return latest?.id===visibleRun.id&&latest.native?.kind===visibleRun.native?.kind?latest:null}
 const handleCopyResult=()=>{void verifiedRun().then(async run=>{if(!run?.result||getStudioAccountInfo()?.id!==current.current?.snapshot().employee||current.current?.snapshot().run?.id!==run.id)return;await navigator.clipboard.writeText(run.result);if(current.current?.snapshot().run?.id===run.id){setCopied(true);copyTimer.current=setTimeout(()=>setCopied(false),2000)}}).catch(()=>setInitialError('当前权限或剪贴板不可用，未复制正文。'))}
 const handleExportReport=()=>{void verifiedRun().then(run=>{if(!run||getStudioAccountInfo()?.id!==current.current?.snapshot().employee||current.current?.snapshot().run?.id!==run.id)return;const blob=new Blob([originalRunDetailReport(run)],{type:'text/markdown;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='run-report-'+run.id+'.md';document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url)}).catch(()=>setInitialError('当前运行或权限尚未核实，未导出正文。'))}
 return{nativeMode:true,nativeState:safeView,isLoggedIn:Boolean(employee)&&nativeBackend,needsRhLogin:!employee,onLoginClick:redirectToRhLogin,errorMsg:[initialError,routeError,safeView?.error,safeView?.notice].filter(Boolean).join(' '),dismissError:()=>{setInitialError('');current.current?.dismiss()},runIdParam:requestedId,runDetail:visibleRun,runEvents:[] as RunEventRow[],specSnapshot:null,loadState:routeError?'error':safeView?.loading?'loading':visibleRun?'ready':safeView?.error.includes('不存在')?'not_found':requestedId?'error':'idle',recentRuns:safeView?.recent??[],isLive:Boolean(visibleRun&&['queued','running','paused','awaiting_approval','awaiting_input'].includes(visibleRun.status)),liveEnabled,handleToggleLive:()=>setLiveEnabled(v=>!v),controlBusy:safeView?.busy?(safeView.pending?.action??'cancel'):'',handleControl:action=>act(c=>c.control(action)),handleSelectRecent,handleBackToRecent,handleCopyResult,copiedFlag,handleExportReport,modelLabel:visibleRun?.model||'历史模型未提供',isAcceptanceTest:false,isCustomModel:Boolean(visibleRun?.model),harnessLine:null,runStateMeta:RUN_STATE_META,stepGroups:[],formatRunDetailTime,handleRefreshNative:()=>act(c=>c.refresh()),handleMoreNativeSteps:()=>act(c=>c.loadMoreSteps()),handleConfirmNative:()=>act(c=>c.confirmPending())}
}
