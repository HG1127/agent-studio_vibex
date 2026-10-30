import {useCallback,useEffect,useRef,useState} from 'react'
import {decodeRhToken,vibexAuthHeaders} from './studioAuth'
import {getPocketBaseUrl} from './pb'
import {EMPTY_RESOURCE_INVENTORY,readResourceInventory,type ResourceInventory} from './resourceInventory'
/** Quiet read-only refresh on return and while visible. Coalesces requests;
 * neither this hook nor its focus handler probes tools, saves or grants access. */
export function useResourceInventory(){
 const owner=decodeRhToken()?.sub||''
 const [snapshot,setSnapshot]=useState<ResourceInventory>(EMPTY_RESOURCE_INVENTORY)
 const [refreshing,setRefreshing]=useState(false),[now,setNow]=useState(Date.now())
 const sequence=useRef(0),active=useRef<{owner:string;controller:AbortController}|null>(null),lastStarted=useRef(0)
 const refresh=useCallback(async()=>{
  if(!owner||active.current?.owner===owner)return
  active.current?.controller.abort()
  const controller=new AbortController(),index=++sequence.current
  active.current={owner,controller};lastStarted.current=Date.now();setRefreshing(true)
  try{
   const result=await readResourceInventory({baseUrl:getPocketBaseUrl(),owner,ownerNow:()=>decodeRhToken()?.sub||'',headers:vibexAuthHeaders(),signal:controller.signal})
   if(!controller.signal.aborted&&index===sequence.current){setSnapshot(result);setNow(Date.now())}
  }catch{
   if(!controller.signal.aborted&&index===sequence.current&&decodeRhToken()?.sub===owner)setSnapshot({...EMPTY_RESOURCE_INVENTORY,owner,checkedAt:Date.now(),errors:['暂时无法核实资源清单，请重新读取。']})
  }finally{if(index===sequence.current){active.current=null;setRefreshing(false)}}
 },[owner])
 useEffect(()=>{
  const poll=()=>{if(document.visibilityState!=='hidden'&&Date.now()-lastStarted.current>=1500)void refresh()}
  if(owner)void refresh()
  const timer=window.setInterval(poll,15000)
  const clock=window.setInterval(()=>{if(document.visibilityState!=='hidden')setNow(Date.now())},5000)
  window.addEventListener('focus',poll);document.addEventListener('visibilitychange',poll)
  return()=>{sequence.current++;active.current?.controller.abort();active.current=null;window.clearInterval(timer);window.clearInterval(clock);window.removeEventListener('focus',poll);document.removeEventListener('visibilitychange',poll)}
 },[owner,refresh])
 const inventory=owner&&snapshot.owner===owner?snapshot:EMPTY_RESOURCE_INVENTORY
 return {inventory,isLoggedIn:!!owner,inventoryLoading:!!owner&&!inventory.checkedAt,refreshing,now,refresh}
}
