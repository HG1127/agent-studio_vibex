import {useEffect,useRef,useState} from 'react'
import {getStudioAccountInfo,verifyStudioSession} from './studioAuth.ts'
import {subscribeStudioSessionPrivacy} from './studioSessionPrivacy.ts'
import {EMPTY_RESOURCE_INVENTORY} from './resourceInventory.ts'
import {createOriginalResourceInventorySession} from './originalResourceInventorySession.ts'
import {createOriginalStudioReadTransport} from './originalStudioReadTransport.ts'
import {createOriginalToolConnectionsApi} from './originalToolConnectionsApi.ts'
import {createOriginalMcpInventoryApi} from './originalMcpInventoryApi.ts'
import {nativeLocalEmployeeApi,getLocalDeviceSessionScope} from './nativeLocalEmployeeApi.ts'
import {parseLocalDeviceInventory} from './localDeviceInventory.ts'
type Session=ReturnType<typeof createOriginalResourceInventorySession>
export function usePgResourceInventory(){
 const owner=getStudioAccountInfo()?.id??'',[stored,setStored]=useState<ReturnType<Session['snapshot']>|null>(null),[now,setNow]=useState(()=>Date.now()),session=useRef<Session|null>(null),started=useRef(0)
 useEffect(()=>{
  if(!owner)return
  let alive=true
  const verify=async()=>{const state=await verifyStudioSession(),account=getStudioAccountInfo();if(state!=='authenticated'||!account?.active)throw Object.assign(Error('original_resource_identity_unavailable'),{status:state==='signed_out'?401:503});return account.id}
  const transport=createOriginalStudioReadTransport({employeeId:owner,verifyEmployee:verify}),controller=createOriginalResourceInventorySession({employeeId:owner,verifyEmployee:verify,ports:(current,signal)=>{
   const scoped:typeof fetch=(input,init)=>transport.forScope(current)(input,{...init,signal:AbortSignal.any([signal,...(init?.signal?[init.signal]:[])])}),market=createOriginalMcpInventoryApi({employeeId:owner,transport:scoped}),tools=createOriginalToolConnectionsApi({employeeId:owner,transport:scoped})
   return{http:abort=>tools.listSnapshot(abort),market:()=>market.listSnapshot(signal),devices:async abort=>{const selected=getLocalDeviceSessionScope();if(selected.owner!==owner||!current())throw Object.assign(Error('native_local_inventory_session_changed'),{status:401});const raw=await nativeLocalEmployeeApi('/api/local-devices',undefined,abort,selected);if(!current())throw Error('original_resource_scope_changed');return parseLocalDeviceInventory(raw)}}
  }})
  session.current=controller
  const publish=()=>{if(alive){setStored(controller.snapshot());setNow(Date.now())}},unsubscribe=controller.subscribe(publish),privacy=subscribeStudioSessionPrivacy(()=>{controller.hidePrivate();publish()}),refresh=()=>{started.current=Date.now();void controller.refresh()},poll=()=>{if(document.visibilityState!=='hidden'&&Date.now()-started.current>=1500)refresh()}
  publish();refresh();const timer=window.setInterval(poll,15000),clock=window.setInterval(()=>{if(document.visibilityState!=='hidden')setNow(Date.now())},5000)
  window.addEventListener('focus',poll);document.addEventListener('visibilitychange',poll)
  return()=>{alive=false;unsubscribe();privacy();window.clearInterval(timer);window.clearInterval(clock);window.removeEventListener('focus',poll);document.removeEventListener('visibilitychange',poll);controller.dispose();transport.close();if(session.current===controller)session.current=null}
 },[owner])
 const current=Boolean(owner&&stored?.employeeId===owner&&!stored.closed),visible=Boolean(current&&stored?.visible),inventory=visible?stored!.inventory:current&&stored?.problem?{...EMPTY_RESOURCE_INVENTORY,owner,errors:[stored.problem]}:EMPTY_RESOURCE_INVENTORY
 return{nativeBackend:true,inventory,isLoggedIn:!!owner&&!(current&&stored?.authRequired),inventoryLoading:!!owner&&!inventory.checkedAt&&!inventory.errors.length,refreshing:visible&&Boolean(stored?.refreshing),now,refresh:async()=>{started.current=Date.now();await session.current?.refresh()}}
}
