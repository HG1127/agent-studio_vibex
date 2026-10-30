import {getStudioAccountInfo,vibexAuthHeaders} from './studioAuth'
import {getPocketBaseUrl} from './pb'
import {localApi} from './localDevices'
import {createOriginalHomeInboxApi,type OriginalPendingInput,type OriginalMonitorCursor,type OriginalMonitorPage} from './originalHomeInboxApi'

async function pgRead<T>(work:(api:ReturnType<typeof createOriginalHomeInboxApi>)=>Promise<T>):Promise<T>{
 const employee=getStudioAccountInfo()?.id
 if(!employee)throw Error('original_home_session_unavailable')
 const result=await work(createOriginalHomeInboxApi(employee))
 if(getStudioAccountInfo()?.id!==employee)throw Error('original_home_session_changed')
 return result
}
export async function readOriginalWorkspace(signal?:AbortSignal){
  if(import.meta.env.VITE_AGENT_STUDIO_ORIGINAL_PG_UI_ENABLED==='true')return pgRead(api=>api.workspace(signal))
 const response=await fetch(getPocketBaseUrl()+'/api/agent-runs/recent?limit=12',{headers:{...vibexAuthHeaders()},signal})
 if(!response.ok)throw Error('recent-runs-unavailable')
 return response.json()
}
export async function readOriginalAgentPending(query:OriginalPendingInput,signal?:AbortSignal){
  if(import.meta.env.VITE_AGENT_STUDIO_ORIGINAL_PG_UI_ENABLED==='true')return pgRead(api=>api.pending(query,signal))
 const params=new URLSearchParams({page:String(query.page),perPage:String(query.perPage),status:query.status,...(query.q?{q:query.q}:{})})
 const response=await fetch(getPocketBaseUrl()+'/api/agent-runs/pending?'+params,{headers:{...vibexAuthHeaders()},signal})
 if(!response.ok)throw Error('fetch_failed')
 return response.json()
}
export async function readOriginalMonitorInbox(cursor:OriginalMonitorCursor|null,signal?:AbortSignal):Promise<OriginalMonitorPage>{
  if(import.meta.env.VITE_AGENT_STUDIO_ORIGINAL_PG_UI_ENABLED==='true')return pgRead(api=>api.monitors(cursor,signal))
 const params=new URLSearchParams({limit:'10'});if(cursor){params.set('after_ms',String(cursor.after_ms));params.set('after_id',cursor.after_id)}
 return localApi<OriginalMonitorPage>('/api/business/monitor-inbox?'+params,undefined,signal)
}
export async function markOriginalMonitorRead(eventId:string):Promise<void>{
  if(import.meta.env.VITE_AGENT_STUDIO_ORIGINAL_PG_UI_ENABLED==='true'){await pgRead(api=>api.markMonitorRead(eventId));return}
 await localApi('/api/business/monitor-events/'+encodeURIComponent(eventId)+'/read',{})
}
