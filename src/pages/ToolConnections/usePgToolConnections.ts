import {useEffect,useMemo,useRef,useState} from 'react'
import {getStudioAccountInfo,verifyStudioSession,redirectToRhLogin} from '../../lib/studioAuth.ts'
import {createOriginalToolConnectionsApi,OriginalToolConnectionsError} from '../../lib/originalToolConnectionsApi.ts'
import {createOriginalToolConnectionsController,emptyOriginalToolView,originalToolUncertaintyKey} from '../../lib/originalToolConnections.ts'
import {TOOL_STATUS_META} from '../../lib/toolPresentation.ts'
type Controller=ReturnType<typeof createOriginalToolConnectionsController>
/** Supplies existing props only; page/layout/routes stay unchanged. */
export function usePgToolConnections(){
 const [view,setView]=useState(emptyOriginalToolView),owned=useRef<Controller|null>(null)
 useEffect(()=>{
  const account=getStudioAccountInfo();if(!account?.active){setView({...emptyOriginalToolView(),isLoadingList:false,needsRhLogin:true});return}
  const key=originalToolUncertaintyKey(account.id);let controller:Controller
  controller=createOriginalToolConnectionsController({employeeId:account.id,api:createOriginalToolConnectionsApi({employeeId:account.id}),currentEmployee:()=>getStudioAccountInfo()?.id??null,
   verifyEmployee:async()=>{const status=await verifyStudioSession(),actual=getStudioAccountInfo();if(status!=='authenticated'||!actual?.active)throw new OriginalToolConnectionsError(status==='signed_out'?401:503,'original_tool_identity_unavailable');return actual.id},
   storage:{read:()=>sessionStorage.getItem(key),write:value=>sessionStorage.setItem(key,value),remove:()=>sessionStorage.removeItem(key)},onChange:value=>{if(owned.current===controller)setView(value)}})
  owned.current=controller;setView(controller.getView());void controller.start();const check=()=>{void controller.checkScope()},visible=()=>{if(document.visibilityState==='visible')check()};window.addEventListener('focus',check);window.addEventListener('pageshow',check);window.addEventListener('storage',check);document.addEventListener('visibilitychange',visible)
  return()=>{window.removeEventListener('focus',check);window.removeEventListener('pageshow',check);window.removeEventListener('storage',check);document.removeEventListener('visibilitychange',visible);if(owned.current===controller)owned.current=null;controller.dispose()}
 },[])
 const actions=useMemo(()=>({loadList:()=>owned.current?.loadList(),openAddForm:()=>owned.current?.openAddForm(),startEdit:(...args:Parameters<Controller['startEdit']>)=>owned.current?.startEdit(...args),closeForm:()=>owned.current?.closeForm(),handleSave:()=>owned.current?.handleSave(),dismissError:()=>owned.current?.dismissError(),dismissNotice:()=>owned.current?.dismissNotice(),
  setFormName:(v:string)=>owned.current?.setFormName(v),setFormDesc:(v:string)=>owned.current?.setFormDesc(v),setFormUrl:(v:string)=>owned.current?.setFormUrl(v),setFormMethod:(v:'GET'|'POST')=>owned.current?.setFormMethod(v),setFormBody:(v:string)=>owned.current?.setFormBody(v),setFormTimeout:(v:string)=>owned.current?.setFormTimeout(v),setTestInput:(v:string)=>owned.current?.setTestInput(v),setConfirmFormWrite:(v:boolean)=>owned.current?.setConfirmFormWrite(v),setConfirmCardWrite:(v:boolean)=>owned.current?.setConfirmCardWrite(v),setCardTestInput:(v:string)=>owned.current?.setCardTestInput(v),
  addHeaderRow:()=>owned.current?.addHeaderRow(),updateHeaderRow:(...args:Parameters<Controller['updateHeaderRow']>)=>owned.current?.updateHeaderRow(...args),removeHeaderRow:(i:number)=>owned.current?.removeHeaderRow(i),toggleExpand:(id:string)=>owned.current?.toggleExpand(id),handleTestForm:()=>owned.current?.handleTestForm(),handleCardTest:(...args:Parameters<Controller['handleCardTest']>)=>owned.current?.handleCardTest(...args),handleRetest:(...args:Parameters<Controller['handleRetest']>)=>owned.current?.handleRetest(...args),handleToggleEnabled:(...args:Parameters<Controller['handleToggleEnabled']>)=>owned.current?.handleToggleEnabled(...args),requestDelete:(id:string)=>owned.current?.requestDelete(id),cancelDelete:()=>owned.current?.cancelDelete(),confirmDelete:()=>owned.current?.confirmDelete(),
 }),[])
 return{...view,...actions,onLoginClick:redirectToRhLogin,statusMeta:TOOL_STATUS_META}
}
