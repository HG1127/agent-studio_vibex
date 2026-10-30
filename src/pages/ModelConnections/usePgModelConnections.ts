import {useEffect,useMemo,useRef,useState} from 'react'
import {getStudioAccountInfo,verifyStudioSession,redirectToRhLogin} from '@/lib/studioAuth'
import {createOriginalModelConnectionsApi,OriginalModelConnectionsError} from '@/lib/originalModelConnectionsApi'
import {createOriginalModelConnectionsController,emptyOriginalModelConnectionsView,originalModelUncertaintyKey} from '@/lib/originalModelConnections'
type Controller=ReturnType<typeof createOriginalModelConnectionsController>
/** Build-time PG branch for the same original ModelConnections page. */
export function usePgModelConnections(statusMeta:Record<string,{label:string;badge:string}>){
 const [view,setView]=useState(emptyOriginalModelConnectionsView),owned=useRef<Controller|null>(null)
 useEffect(()=>{
  const employee=getStudioAccountInfo()
  if(!employee?.active){setView({...emptyOriginalModelConnectionsView(),isLoadingList:false,needsRhLogin:true});return}
  let controller:Controller
  const key=originalModelUncertaintyKey(employee.id)
  controller=createOriginalModelConnectionsController({employeeId:employee.id,api:createOriginalModelConnectionsApi({employeeId:employee.id}),currentEmployee:()=>getStudioAccountInfo()?.id??null,
   verifyEmployee:async()=>{const status=await verifyStudioSession(),current=getStudioAccountInfo();if(status!=='authenticated'||!current?.active)throw new OriginalModelConnectionsError(status==='signed_out'?401:503,'original_model_identity_unavailable');return current.id},
   storage:{read:()=>sessionStorage.getItem(key),write:value=>sessionStorage.setItem(key,value),remove:()=>sessionStorage.removeItem(key)},
   onChange:value=>{if(owned.current===controller)setView(value)},
  })
  owned.current=controller;setView(controller.getView());void controller.start()
  const check=()=>{void controller.checkScope()},visible=()=>{if(document.visibilityState==='visible')check()}
  window.addEventListener('focus',check);window.addEventListener('pageshow',check);window.addEventListener('storage',check);document.addEventListener('visibilitychange',visible)
  return()=>{window.removeEventListener('focus',check);window.removeEventListener('pageshow',check);window.removeEventListener('storage',check);document.removeEventListener('visibilitychange',visible);if(owned.current===controller)owned.current=null;controller.dispose()}
 },[])
 const actions=useMemo(()=>({
  loadList:()=>owned.current?.loadList(),dismissError:()=>owned.current?.dismissError(),dismissNotice:()=>owned.current?.dismissNotice(),openAddForm:()=>owned.current?.openAddForm(),startEdit:(...args:Parameters<Controller['startEdit']>)=>owned.current?.startEdit(...args),closeForm:()=>owned.current?.closeForm(),
  setFormName:(value:string)=>owned.current?.setFormName(value),setFormProvider:(...args:Parameters<Controller['setFormProvider']>)=>owned.current?.setFormProvider(...args),setFormBaseUrl:(value:string)=>owned.current?.setFormBaseUrl(value),setFormApiKey:(value:string)=>owned.current?.setFormApiKey(value),setFormManualModels:(value:string)=>owned.current?.setFormManualModels(value),
  handleTestForm:()=>owned.current?.handleTestForm(),handleSave:()=>owned.current?.handleSave(),handleRetest:(...args:Parameters<Controller['handleRetest']>)=>owned.current?.handleRetest(...args),handleToggleEnabled:(...args:Parameters<Controller['handleToggleEnabled']>)=>owned.current?.handleToggleEnabled(...args),requestDelete:(id:string)=>owned.current?.requestDelete(id),cancelDelete:()=>owned.current?.cancelDelete(),confirmDelete:()=>owned.current?.confirmDelete(),toggleExpand:(id:string)=>owned.current?.toggleExpand(id),
 }),[])
 return{...view,...actions,onLoginClick:redirectToRhLogin,statusMeta}
}
