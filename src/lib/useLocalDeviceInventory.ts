import {useCallback,useEffect,useRef,useState} from 'react'
import {decodeRhToken} from './studioAuth'
import {localApi,type LocalDevice} from './localDevices'
import {parseLocalDeviceInventory} from './localDeviceInventory'

type Snapshot={owner:string;items:LocalDevice[];error:string;loaded:boolean;updatedAt:number}
/** Read-only discovery. Never selects, pairs, approves or operates a device. */
export function useLocalDeviceInventory(){
  const owner=decodeRhToken()?.sub||''
  const [snapshot,setSnapshot]=useState<Snapshot>({owner:'',items:[],error:'',loaded:false,updatedAt:0})
  const [refreshing,setRefreshing]=useState(false),[now,setNow]=useState(Date.now())
  const sequence=useRef(0),alive=useRef(true)
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;sequence.current++}},[])
  const refresh=useCallback(async(signal?:AbortSignal)=>{
    if(!owner)return
    const request=++sequence.current
    setRefreshing(true);setNow(Date.now())
    try{
      const result=await localApi<unknown>('/api/local-devices',undefined,signal)
      const items=parseLocalDeviceInventory(result)
      if(alive.current&&!signal?.aborted&&request===sequence.current&&decodeRhToken()?.sub===owner){
        const observed=Date.now();setNow(observed)
        setSnapshot({owner,items,error:'',loaded:true,updatedAt:observed})
      }
    }catch(e){
      if(alive.current&&!signal?.aborted&&request===sequence.current&&decodeRhToken()?.sub===owner)
        setSnapshot(previous=>({owner,items:previous.owner===owner?previous.items:[],error:e instanceof Error?e.message:'暂时无法核实设备状态',loaded:true,updatedAt:0}))
    }finally{if(alive.current&&request===sequence.current)setRefreshing(false)}
  },[owner])
  useEffect(()=>{
    if(!owner)return
    const controller=new AbortController();let running=false
    const poll=async()=>{
      if(running||document.visibilityState==='hidden')return
      running=true
      try{await refresh(controller.signal)}finally{running=false}
    }
    void poll()
    const timer=window.setInterval(()=>void poll(),15000)
    const focus=()=>void poll()
    window.addEventListener('focus',focus);document.addEventListener('visibilitychange',focus)
    return()=>{controller.abort();sequence.current++;window.clearInterval(timer);window.removeEventListener('focus',focus);document.removeEventListener('visibilitychange',focus)}
  },[owner,refresh])
  const scoped=owner&&snapshot.owner===owner?snapshot:null
  return {devices:scoped&&!scoped.error?scoped.items:[],lastKnownDevices:scoped?.items||[],loaded:scoped?.loaded||false,error:!owner?'请先登录，再查看本人设备':scoped?.error||'',
    updatedAt:scoped?.updatedAt||0,refreshing,now,refresh}
}
