import {useEffect,useState} from 'react'
import {localApi} from '@/lib/localDevices'

export type MonitorCursor={after_ms:number;after_id:string}
export type MonitorPage<T>={items:T[];has_more:boolean;next_cursor:MonitorCursor|null}
export type MonitorCheck={check_id:string;monitor_id:string;revision:number;run_id:string;run_available:boolean;status:string;error:string;fact_set_id?:string;created_ms:number;receipts:{source_id:string;run_id:string;result_id:string}[];assessment:{collection_complete?:boolean;semantic_state?:string;baseline_advanced?:boolean}}
export type MonitorEvent={event_id:string;check_id:string;revision:number;kind:string;read_ms:number;created_ms:number;payload:{fact:{from_id:string;to_id:string;relation_type:string;valid_from:string|null;valid_to:string|null};record_id:string;record_version:number}}
type Response<T>={key:string;data:T|null;error:boolean;loading:boolean}

function usePage<T>(active:boolean,monitorId:string,kind:'checks'|'events',version:number){
  const [navigation,setNavigation]=useState<{monitorId:string;stack:MonitorCursor[]}>({monitorId,stack:[]})
  const stack=navigation.monitorId===monitorId?navigation.stack:[],cursor=stack[stack.length-1]
  const ms=cursor?.after_ms||0,id=cursor?.after_id||'',key=monitorId+':'+kind+':'+ms+':'+id
  const [response,setResponse]=useState<Response<MonitorPage<T>>>({key:'',data:null,error:false,loading:false})
  useEffect(()=>{
    if(!active||!monitorId)return
    const abort=new AbortController(),params=new URLSearchParams({limit:'20'})
    if(id){params.set('after_ms',String(ms));params.set('after_id',id)}
    setResponse(previous=>({key,data:previous.key===key?previous.data:null,error:false,loading:true}))
    void localApi<MonitorPage<T>>(`/api/business/monitors/${encodeURIComponent(monitorId)}/${kind}?${params}`,undefined,abort.signal)
      .then(data=>{if(!abort.signal.aborted)setResponse({key,data,error:false,loading:false})})
      .catch(()=>{if(!abort.signal.aborted)setResponse({key,data:null,error:true,loading:false})})
    return ()=>abort.abort()
  },[active,monitorId,kind,ms,id,key,version])
  const current=active&&response.key===key?response:null,page=current?.data||null
  return {page,loading:active&&(!current||current.loading),error:current?.error||false,index:stack.length+1,
    previous:()=>setNavigation(previous=>({monitorId,stack:previous.monitorId===monitorId?previous.stack.slice(0,-1):[]})),
    first:()=>setNavigation({monitorId,stack:[]}),
    next:()=>{const next=page?.next_cursor;if(next&&!current?.loading)setNavigation(previous=>({monitorId,stack:[...(previous.monitorId===monitorId?previous.stack:[]),next]}))}}
}
function useDetail<T>(active:boolean,monitorId:string,kind:'checks'|'events',id:string,version:number){
  const key=monitorId+':'+kind+':'+id,[response,setResponse]=useState<Response<T>>({key:'',data:null,error:false,loading:false})
  useEffect(()=>{
    if(!active||!monitorId||!id)return
    const abort=new AbortController()
    setResponse(previous=>({key,data:previous.key===key?previous.data:null,error:false,loading:true}))
    void localApi<T>(`/api/business/monitors/${encodeURIComponent(monitorId)}/${kind}/${encodeURIComponent(id)}`,undefined,abort.signal)
      .then(data=>{if(!abort.signal.aborted)setResponse({key,data,error:false,loading:false})})
      .catch(()=>{if(!abort.signal.aborted)setResponse({key,data:null,error:true,loading:false})})
    return ()=>abort.abort()
  },[active,monitorId,kind,id,key,version])
  return active&&id&&response.key===key?response:{data:null,error:false,loading:Boolean(active&&id)}
}
export function useMonitorHistory(active:boolean,monitorId:string,version:number,checkId:string,eventId:string){
  const checks=usePage<MonitorCheck>(active,monitorId,'checks',version),events=usePage<MonitorEvent>(active,monitorId,'events',version)
  const focusedEvent=useDetail<MonitorEvent>(active,monitorId,'events',eventId,version)
  // The event owns its check binding; a mixed URL must never pair its facts
  // with a different check's evidence, even when both belong to this employee.
  const focusedCheck=useDetail<MonitorCheck>(active,monitorId,'checks',eventId?focusedEvent.data?.check_id||'':checkId,version)
  return {checks,events,focusedCheck,focusedEvent}
}
