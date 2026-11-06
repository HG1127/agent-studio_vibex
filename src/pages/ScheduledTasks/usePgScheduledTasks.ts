import {createOriginalSchedulesRunReader} from '@/lib/originalSchedulesRunReader'
import {useEffect,useMemo,useRef,useState,type FormEvent,type SetStateAction} from 'react'
import {getStudioAccountInfo,verifyStudioSession} from '@/lib/studioAuth'
import {createOriginalSchedulesIdentity} from '@/lib/originalSchedulesIdentity'
import {createOriginalSchedulesApi} from '@/lib/originalSchedulesApi'
import {createOriginalSchedulesController,emptyOriginalSchedulesView,type OriginalSchedulesController,type ScheduleAuthorizationDraft} from '@/lib/originalSchedules'
import {createOriginalHomeAgentApi} from '@/lib/originalHomeAgentApi'
import {createOriginalModelConnectionsApi} from '@/lib/originalModelConnectionsApi'
import {nextScheduleTime,zonedDateTimeToEpoch} from '@/lib/scheduleTime.js'
import type {ScheduleForm,ScheduleTask,ScheduleHistory,ScheduleRunPreview} from './types'
export function usePgScheduledTasks(){
 const [view,setView]=useState(emptyOriginalSchedulesView),owned=useRef<OriginalSchedulesController|null>(null),initializeRef=useRef<(()=>void)|null>(null)
 useEffect(()=>{let closed=false,initializing=false,controller:OriginalSchedulesController|null=null
  const initialize=async()=>{if(closed||initializing||controller)return;initializing=true
   try{const status=await verifyStudioSession(),account=getStudioAccountInfo();if(closed)return;if(status!=='authenticated'||!account?.active){setView({...emptyOriginalSchedulesView(),initialLoading:false,nativeSignedOut:status==='signed_out',error:status==='signed_out'?'员工会话已确认退出，请登录。':'员工身份暂时无法核实，请刷新。'});return}
    const employee=account.id,identity=createOriginalSchedulesIdentity({account:getStudioAccountInfo,verify:verifyStudioSession}),home=createOriginalHomeAgentApi({employeeId:employee}),models=createOriginalModelConnectionsApi({employeeId:employee}),key='agentstudio.original.schedules078.pending.'+employee
    let next:OriginalSchedulesController
    next=createOriginalSchedulesController({employeeId:employee,api:createOriginalSchedulesApi({employeeId:employee}),...identity,catalog:(page,signal)=>home.catalog({page,perPage:50,sort:'updated_desc'},signal),getAgent:(id,signal)=>home.get(id,signal),models:signal=>models.listSnapshot(signal),getModel:(id,signal)=>models.get(id,signal),copy:text=>navigator.clipboard.writeText(text),
     readRun:createOriginalSchedulesRunReader({employeeId:employee,verifyEmployee:identity.verifyEmployee}),
     storage:{read:()=>sessionStorage.getItem(key),write:value=>sessionStorage.setItem(key,value),remove:()=>sessionStorage.removeItem(key)},onChange:value=>{if(!closed&&owned.current===next)setView(value)}})
    if(closed){next.dispose();return}controller=next;owned.current=next;setView(next.getView());await next.start()
   }catch{if(!closed)setView({...emptyOriginalSchedulesView(),initialLoading:false,error:'员工身份或页面服务尚未核实，请刷新重试。'})}finally{initializing=false}}
  const retry=()=>{void initialize()};initializeRef.current=retry
  const check=()=>{if(controller)void controller.checkScope();else retry()},visible=()=>{if(!document.hidden)check()},saved=()=>{if(controller)void controller.refresh()}
  window.addEventListener('focus',check);window.addEventListener('pageshow',check);window.addEventListener('storage',check);window.addEventListener('online',check);document.addEventListener('visibilitychange',visible);window.addEventListener('studio:agent-spec-saved',saved);retry()
  return()=>{closed=true;window.removeEventListener('focus',check);window.removeEventListener('pageshow',check);window.removeEventListener('storage',check);window.removeEventListener('online',check);document.removeEventListener('visibilitychange',visible);window.removeEventListener('studio:agent-spec-saved',saved);if(initializeRef.current===retry)initializeRef.current=null;if(owned.current===controller)owned.current=null;controller?.dispose()}
 },[])
 useEffect(()=>{const timer=window.setInterval(()=>{const current=owned.current?.getView();if(!document.hidden&&current?.nativeReady&&!current.saving&&!current.busyId)void owned.current?.refresh()},20000);return()=>window.clearInterval(timer)},[])
 const account=getStudioAccountInfo();useEffect(()=>{void owned.current?.checkScope()},[account?.id,account?.active])
 const safe=view.nativeEmployeeId&&account?.active&&view.nativeEmployeeId===account.id?view:{...emptyOriginalSchedulesView(),initialLoading:false,nativeEmployeeId:view.nativeEmployeeId,nativePending:view.nativePending,nativeSignedOut:view.nativeSignedOut,error:view.error||'员工身份尚未核实，私有内容已隐藏。'}
 const preview=useMemo(()=>{try{const f=safe.form,rule={recurrence_kind:f.recurrence_kind,start_at_ms:zonedDateTimeToEpoch(f.start_date,f.local_time,f.time_zone),time_zone:f.time_zone,local_time:f.local_time,weekday:f.weekday,interval_minutes:f.interval_minutes},nextAt=nextScheduleTime(rule,Date.now());return{rule,nextAt,error:nextAt===null?'当前时间规则没有未来运行；仍可保存为暂停计划。':''}}catch{return{rule:null,nextAt:null,error:'时间规则无效，请核对日期、时区和本地时间。'}}},[safe.form])
 const nextOccurrences=useMemo(()=>{const result:number[]=[];if(!preview.rule||preview.nextAt===null)return result;let next:number|null=preview.nextAt;while(next!==null&&result.length<5){result.push(next);const previous=next;next=nextScheduleTime(preview.rule,next+1000);if(next!==null&&next<=previous)break}return result},[preview])
 const actions=useMemo(()=>({setForm:(update:SetStateAction<ScheduleForm>)=>owned.current?.setForm(update),setField:<K extends keyof ScheduleForm>(key:K,value:ScheduleForm[K])=>owned.current?.setField(key,value),resetForm:()=>owned.current?.resetForm(),edit:(task:ScheduleTask)=>{owned.current?.edit(task);document.getElementById('schedule-editor')?.scrollIntoView({behavior:'smooth',block:'start'});window.requestAnimationFrame(()=>document.getElementById('schedule-plan-name')?.focus({preventScroll:true}))},
  save:async(event:FormEvent<HTMLFormElement>)=>{event.preventDefault();await owned.current?.save()},action:async(task:ScheduleTask,kind:'toggle'|'run_now'|'delete')=>{if(kind==='delete'&&!window.confirm('确认删除计划「'+task.name+'」？历史记录将保留。'))return;await owned.current?.action(task,kind);if(kind==='toggle'&&!task.enabled){document.getElementById('schedule-editor')?.scrollIntoView({behavior:'smooth',block:'start'});window.requestAnimationFrame(()=>document.getElementById('schedule-plan-name')?.focus({preventScroll:true}))}},retryFailedLaunch:async(row:ScheduleHistory)=>{if(!window.confirm('仅重试尚未创建运行实例且此前没有外部副作用的启动。请确认后继续。'))return;await owned.current?.retry(row)},
  refresh:async()=>{if(owned.current)await owned.current.refresh();else initializeRef.current?.()},setError:(text:string)=>owned.current?.setError(text),setNotice:(text:string)=>owned.current?.setNotice(text),setFilter:(value:'all'|'active'|'disabled')=>owned.current?.setFilter(value),setHistoryFilter:(value:string)=>owned.current?.setHistoryFilter(value),viewRun:async(row:ScheduleHistory)=>{await owned.current?.viewRun(row)},setRunPreview:(_value:SetStateAction<ScheduleRunPreview|null>)=>owned.current?.closeRun(),
  nativeSetAuthorization:<K extends keyof ScheduleAuthorizationDraft>(key:K,value:ScheduleAuthorizationDraft[K])=>owned.current?.setAuthorization(key,value),nativeRecheck:async()=>{await owned.current?.recheck()},nativeQueryReceipt:async()=>{await owned.current?.queryReceipt()},nativeMore:async(kind:'plans'|'history'|'workflows')=>{await owned.current?.more(kind)},nativeCopyRun:async(row:ScheduleHistory)=>{await owned.current?.copyRun(row)},nativeCopyResult:async()=>{await owned.current?.copyResult()},
 }),[])
 return{...safe,...actions,preview,nextOccurrences,targetOptions:safe.form.target_kind==='agent'?safe.agents:safe.workflows,modelOptions:safe.models.find(m=>m.id===safe.form.model_connection_id)?.models??[]}
}
