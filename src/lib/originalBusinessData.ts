import {vibexAuthHeaders} from './studioAuth'
import {getPocketBaseUrl} from './pb'
import {localApi} from './localDevices'
import {createOriginalBusinessApi} from './originalBusinessApi'
import {originalBusinessIdentity} from './originalBusinessScope'
export async function originalBusinessApi<T>(route:string,body?:unknown,signal?:AbortSignal):Promise<T>{
 if(import.meta.env.VITE_AGENT_STUDIO_ORIGINAL_PG_UI_ENABLED!=='true')return localApi<T>(route,body,signal)
 return originalBusinessIdentity.request((employee,scopedSignal)=>createOriginalBusinessApi(employee)<T>(route,body,scopedSignal),signal)
}

export async function originalBusinessDownload(route:string):Promise<Response>{if(import.meta.env.VITE_AGENT_STUDIO_ORIGINAL_PG_UI_ENABLED==='true')throw Error('original_business_artifact_contract_missing');return fetch(getPocketBaseUrl()+route,{headers:vibexAuthHeaders()})}
