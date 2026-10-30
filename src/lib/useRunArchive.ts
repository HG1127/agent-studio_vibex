import {useCallback,useEffect,useRef,useState} from 'react'
import {useSearchParams} from 'react-router-dom'
import {getPocketBaseUrl} from './pb'
import {decodeRhToken,vibexAuthHeaders} from './studioAuth'
import {archiveQuery,archiveParams,archiveRequest,fetchRunArchive,type ArchiveData,type ArchiveQuery} from './runArchive'
export function useRunArchive(owner:string,enabled:boolean){
 const [params,setParams]=useSearchParams(),query=archiveQuery(params)
 const serialized=JSON.stringify(query),key=owner+':'+archiveRequest(query)
 const [snapshot,setSnapshot]=useState<{key:string;data:ArchiveData|null;error:string}>({key:'',data:null,error:''})
 const [busyKey,setBusyKey]=useState(''),sequence=useRef(0)
 const refresh=useCallback(async(signal?:AbortSignal)=>{
  if(!owner||!enabled)return
  const attempt=++sequence.current;setBusyKey(key)
  try{
   const data=await fetchRunArchive({base:getPocketBaseUrl(),query:JSON.parse(serialized) as ArchiveQuery,headers:{...vibexAuthHeaders()},signal:signal?AbortSignal.any([signal,AbortSignal.timeout(12000)]):AbortSignal.timeout(12000)})
   if(attempt===sequence.current&&!signal?.aborted&&decodeRhToken()?.sub===owner)setSnapshot({key,data,error:''})
  }catch(e){if(attempt===sequence.current&&!signal?.aborted&&decodeRhToken()?.sub===owner)setSnapshot(old=>({key,data:old.key===key?old.data:null,error:e instanceof Error?e.message:'运行记录读取失败，请重试'}))}
  finally{if(attempt===sequence.current)setBusyKey('')}
 },[owner,enabled,key,serialized])
 useEffect(()=>{
  if(!owner||!enabled)return
  const controller=new AbortController();let reading=false
  const load=async()=>{if(reading||document.visibilityState==='hidden')return;reading=true;try{await refresh(controller.signal)}finally{reading=false}}
  void load();const timer=window.setInterval(()=>void load(),15000)
  const focus=()=>void load();window.addEventListener('focus',focus);document.addEventListener('visibilitychange',focus)
  return()=>{controller.abort();sequence.current++;window.clearInterval(timer);window.removeEventListener('focus',focus);document.removeEventListener('visibilitychange',focus)}
 },[owner,enabled,refresh])
 const current=snapshot.key===key?snapshot:null
 return {query,data:current?.data||null,error:current?.error||'',loading:!!owner&&enabled&&!current,refreshing:busyKey===key,
  refresh:()=>refresh(),change:(patch:Partial<ArchiveQuery>)=>setParams(archiveParams(params,patch)),reset:()=>setParams(archiveParams(params,{q:'',status:'all',days:'all',page:1}))}
}
