import {createOriginalVersionReleaseIdentity} from '@/lib/originalVersionReleaseIdentity'
import {useEffect,useMemo,useRef,useState} from 'react'
import {useSearchParams} from 'react-router-dom'
import {getStudioAccountInfo,verifyStudioSession,redirectToRhLogin} from '@/lib/studioAuth'
import {createOriginalVersionReleaseApi} from '@/lib/originalVersionReleaseApi'
import {createOriginalVersionReleaseController,emptyOriginalVersionReleaseView,type OriginalVersionReleaseController} from '@/lib/originalVersionRelease'
import {releaseStorageKey} from '@/lib/originalVersionReleaseData'
import {createOriginalHomeAgentApi} from '@/lib/originalHomeAgentApi'
import {createOriginalModelConnectionsApi} from '@/lib/originalModelConnectionsApi'
import {VERSION_STATUS_META,formatVersionTime} from './useVersionRelease'
/** Same original route and components; selected only by the existing build flag. */
export function usePgVersionRelease(){
 const [params,setParams]=useSearchParams(),wanted=params.get('spec')??'',recovered=params.get('testRun')??'',[view,setView]=useState(emptyOriginalVersionReleaseView),owned=useRef<OriginalVersionReleaseController|null>(null)
 const initializeRef=useRef<(()=>void)|null>(null)
 const recoveredRef=useRef(recovered);recoveredRef.current=recovered
 useEffect(()=>{
  let controller:OriginalVersionReleaseController|null=null,closed=false,initializing=false
  const initialize=async()=>{
   if(closed||controller||initializing)return;initializing=true
   try{
    let employee=getStudioAccountInfo()
    if(!employee?.active){const status=await verifyStudioSession();if(closed)return;employee=getStudioAccountInfo();if(status!=='authenticated'||!employee?.active){setView({...emptyOriginalVersionReleaseView(),needsRhLogin:status==='signed_out',errorMsg:status==='signed_out'?'员工会话已确认退出。':'员工身份暂时无法核验，请刷新重试。'});return}}
    const identity=createOriginalVersionReleaseIdentity({account:getStudioAccountInfo,verify:verifyStudioSession}),home=createOriginalHomeAgentApi({employeeId:employee.id}),models=createOriginalModelConnectionsApi({employeeId:employee.id}),key=releaseStorageKey(employee.id)
    let next:OriginalVersionReleaseController
    next=createOriginalVersionReleaseController({employeeId:employee.id,api:createOriginalVersionReleaseApi({employeeId:employee.id}),...identity,
     catalog:(page,signal)=>home.catalog({page,perPage:50,sort:'updated_desc'},signal),getAgent:(id,signal)=>home.get(id,signal),models:signal=>models.listSnapshot(signal),
     storage:{read:()=>sessionStorage.getItem(key),write:value=>sessionStorage.setItem(key,value),remove:()=>sessionStorage.removeItem(key)},onChange:value=>{if(!closed&&owned.current===next)setView(value)},
    });if(closed){next.dispose();return}controller=next;owned.current=next;setView(next.getView());void next.start(wanted,recoveredRef.current)
   }catch{if(!closed)setView({...emptyOriginalVersionReleaseView(),needsRhLogin:false,errorMsg:'员工身份或页面服务暂时无法核验，请刷新重试。'})}finally{initializing=false}
  }
  const retry=()=>{void initialize()};initializeRef.current=retry
  const check=()=>{if(controller)void controller.checkScope();else retry()},visible=()=>{if(document.visibilityState==='visible')check()}
  const saved=(event:Event)=>{const id=String((event as CustomEvent<{specId?:string}>).detail?.specId??'');if(id&&controller?.getView().selectedSpecId===id)void controller.handleRefreshNative()}
  window.addEventListener('studio:agent-spec-saved',saved);window.addEventListener('focus',check);window.addEventListener('pageshow',check);window.addEventListener('storage',check);window.addEventListener('online',check);document.addEventListener('visibilitychange',visible);retry()
  return()=>{closed=true;window.removeEventListener('studio:agent-spec-saved',saved);window.removeEventListener('focus',check);window.removeEventListener('pageshow',check);window.removeEventListener('storage',check);window.removeEventListener('online',check);document.removeEventListener('visibilitychange',visible);if(initializeRef.current===retry)initializeRef.current=null;if(owned.current===controller)owned.current=null;if(controller)controller.dispose()}
 },[wanted])
 useEffect(()=>{if(!view.testRun||!view.isTestLive)return;const timer=window.setInterval(()=>{if(!document.hidden)void owned.current?.pollTest()},3000);return()=>window.clearInterval(timer)},[view.testRun?.id,view.isTestLive])
 useEffect(()=>{if(recovered && view.selectedSpecId===wanted && view.testRun?.id!==recovered)void owned.current?.recoverTest(recovered)},[recovered,wanted,view.selectedSpecId,view.testRun?.id])
 useEffect(()=>{if(!view.testRun || view.selectedSpecId!==wanted)return;const id=view.testRun.id;setParams(previous=>{if(previous.get('testRun')===id)return previous;const next=new URLSearchParams(previous);next.set('testRun',id);return next},{replace:true})},[view.testRun?.id,view.selectedSpecId,wanted,setParams])
 const actions=useMemo(()=>({
  handleSelectSpec:(id:string)=>{const controller=owned.current;if(!controller)return;const current=controller.getView();if(!current.isLoggedIn||current.nativePending||current.isConfirmBusy||current.isStartingTest||current.isSavingVersion)return;void controller.handleSelectSpec(id);setParams(previous=>{const next=new URLSearchParams(previous);if(id)next.set('spec',id);else next.delete('spec');next.delete('testRun');return next},{replace:true})},toggleVersionExpand:(id:string)=>owned.current?.toggleVersionExpand(id),
  setTestInstruction:(v:string)=>owned.current?.setTestInstruction(v),setTestModel:(v:string)=>owned.current?.setTestModel(v),setVersionNote:(v:string)=>owned.current?.setVersionNote(v),
  handleRunTest:()=>{void owned.current?.handleRunTest()},handleSaveVersion:()=>{void owned.current?.handleSaveVersion()},
  requestPublish:(...a:Parameters<OriginalVersionReleaseController['requestPublish']>)=>{void owned.current?.requestPublish(...a)},requestRestore:(...a:Parameters<OriginalVersionReleaseController['requestRestore']>)=>{void owned.current?.requestRestore(...a)},requestDelete:(...a:Parameters<OriginalVersionReleaseController['requestDelete']>)=>{void owned.current?.requestDelete(...a)},
  handleConfirm:()=>{void owned.current?.handleConfirm()},cancelConfirm:()=>owned.current?.cancelConfirm(),handlePublishPick:(id:string)=>{void owned.current?.handlePublishPick(id)},
  dismissError:()=>owned.current?.dismissError(),dismissNotice:()=>owned.current?.dismissNotice(),
  handleRefreshNative:()=>{if(owned.current)void owned.current.handleRefreshNative();else initializeRef.current?.()},handleQueryNative:()=>{void owned.current?.handleQueryNative()},requireVersionDetails:(ids:string[])=>{void owned.current?.requireVersionDetails(ids)},
  setNativeAcceptanceConfirmed:(v:boolean)=>owned.current?.setNativeAcceptanceConfirmed(v),setNativeConfirmChecked:(v:boolean)=>owned.current?.setNativeConfirmChecked(v),setNativeRestoreReason:(v:string)=>owned.current?.setNativeRestoreReason(v),
 }),[setParams])
 const current=getStudioAccountInfo()
 useEffect(()=>{void owned.current?.checkScope()},[current?.id,current?.active])
 const safe=view.nativeEmployeeId&&current?.active&&current.id===view.nativeEmployeeId?view:{...emptyOriginalVersionReleaseView(),nativeEmployeeId:view.nativeEmployeeId,nativePending:view.nativePending,needsRhLogin:view.needsRhLogin,errorMsg:view.errorMsg||'员工身份尚未核实，私有内容已隐藏。'}
 return{...safe,...actions,onLoginClick:redirectToRhLogin,versionStatusMeta:VERSION_STATUS_META,formatVersionTime}
}
