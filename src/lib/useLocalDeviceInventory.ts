import {useCallback,useEffect,useRef,useState} from 'react'
import {localApi,type LocalDevice} from './localDevices'
import {parseLocalDeviceInventory} from './localDeviceInventory'
import {ORIGINAL_PG_UI_ENABLED} from './studioBackend'
import {getLocalDeviceSessionScope,sameLocalDeviceSessionScope,subscribeLocalDeviceSessionPrivacy,type LocalDeviceSessionScope} from './nativeLocalEmployeeApi'
type Snapshot={scope:LocalDeviceSessionScope;items:LocalDevice[];error:string;loaded:boolean;updatedAt:number}
/** Read-only discovery. Selection and execution remain explicit UI actions. */
export function useLocalDeviceInventory(){
  const [,setPrivacyRevision]=useState(0),scope=getLocalDeviceSessionScope(),{owner,epoch}=scope
  const [snapshot,setSnapshot]=useState<Snapshot>({scope:{owner:'',epoch:-1},items:[],error:'',loaded:false,updatedAt:0})
  const [pending,setPending]=useState<{scope:LocalDeviceSessionScope;request:number}|null>(null),[now,setNow]=useState(Date.now())
  const sequence=useRef(0),alive=useRef(true)
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;sequence.current++}},[])
  useEffect(()=>{if(!ORIGINAL_PG_UI_ENABLED)return;return subscribeLocalDeviceSessionPrivacy(()=>{const invalidation=++sequence.current;setSnapshot(previous=>{const current=getLocalDeviceSessionScope();if(!alive.current||sequence.current!==invalidation||previous.scope.owner===current.owner&&previous.scope.epoch===current.epoch)return previous;return {scope:current,items:[],error:'',loaded:false,updatedAt:0}});setPending(previous=>{const now=getLocalDeviceSessionScope();return alive.current&&previous&&(previous.scope.owner!==now.owner||previous.scope.epoch!==now.epoch)?null:previous});setPrivacyRevision(n=>n+1)})},[])
  useEffect(()=>{if(!ORIGINAL_PG_UI_ENABLED)return;const timer=window.setInterval(()=>setNow(()=>Date.now()),1000);return()=>window.clearInterval(timer)},[])
  const refresh=useCallback(async(signal?:AbortSignal)=>{
    const expected={owner,epoch};if(!sameLocalDeviceSessionScope(expected))return
    const request=++sequence.current,current=()=>alive.current&&!signal?.aborted&&request===sequence.current&&sameLocalDeviceSessionScope(expected)
    setPending(previous=>current()?{scope:expected,request}:previous);setNow(previous=>current()?Date.now():previous)
    try{
      const result=await localApi<unknown>('/api/local-devices',undefined,signal,expected),items=parseLocalDeviceInventory(result)
      if(current()){
        const observed=Date.now();setNow(previous=>current()?Date.now():previous);setSnapshot(previous=>current()?{scope:expected,items,error:'',loaded:true,updatedAt:observed}:previous)
      }
    }catch(e){if(current())setSnapshot(previous=>current()?{scope:expected,items:previous.scope.owner===owner&&previous.scope.epoch===epoch?previous.items:[],error:e instanceof Error?e.message:'暂时无法核实设备状态',loaded:true,updatedAt:0}:previous)}
    finally{setPending(previous=>current()&&previous?.request===request?null:previous)}
  },[owner,epoch])
  useEffect(()=>{
    if(!owner)return
    const controller=new AbortController();let running=false
    const poll=async()=>{if(running||document.visibilityState==='hidden')return;running=true;try{await refresh(controller.signal)}finally{running=false}}
    void poll();const timer=window.setInterval(()=>void poll(),15000),focus=()=>void poll()
    window.addEventListener('focus',focus);window.addEventListener('studio-desktop-devices-changed',focus);document.addEventListener('visibilitychange',focus)
    return()=>{controller.abort();sequence.current++;window.clearInterval(timer);window.removeEventListener('focus',focus);window.removeEventListener('studio-desktop-devices-changed',focus);document.removeEventListener('visibilitychange',focus)}
  },[owner,epoch,refresh])
  const scoped=owner&&snapshot.scope.owner===owner&&snapshot.scope.epoch===epoch?snapshot:null
  const refreshing=!!pending&&pending.scope.owner===owner&&pending.scope.epoch===epoch
  return {devices:scoped&&!scoped.error?scoped.items:[],lastKnownDevices:scoped?.items||[],loaded:scoped?.loaded||false,error:!owner?'请先登录，再查看本人设备':scoped?.error||'',updatedAt:scoped?.updatedAt||0,refreshing,now,refresh}
}
