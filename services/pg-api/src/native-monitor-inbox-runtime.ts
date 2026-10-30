import type {IncomingMessage} from 'node:http'
import type {Identity,SqlPool} from './contracts.ts'
import {inspectOptionalNativeMonitorInbox} from './native-monitor-inbox-audit.ts'
import {NativeMonitorInboxRepository} from './native-monitor-inbox-repository.ts'
import {createNativeMonitorInboxHttp} from './native-monitor-inbox-http.ts'
export function selectNativeMonitorInbox(env:NodeJS.ProcessEnv,listen:boolean,origin:string){
 const marker=env.AGENT_STUDIO_PG18_ORIGINAL_MONITOR_INBOX_ENABLED
 if(marker===undefined)return false
 let valid=false;try{const u=new URL(origin);valid=u.protocol==='https:'&&u.origin===origin}catch{}
 if(marker!=='true'||listen!==true||!valid)throw Error('unsafe_native_monitor_inbox_config')
 return true
}
export async function prepareNativeMonitorInbox(input:{pool:SqlPool;env:NodeJS.ProcessEnv;listen:boolean;allowedOrigin:string}){
 const enabled=selectNativeMonitorInbox(input.env,input.listen,input.allowedOrigin),schema=await inspectOptionalNativeMonitorInbox(input.pool)
 if(!enabled)return null
 if(schema!=='installed')throw Error('native_monitor_inbox_schema_required')
 return Object.freeze({createHandler(authenticateRequest:(req:IncomingMessage)=>Promise<Identity>){
  return createNativeMonitorInboxHttp({repository:new NativeMonitorInboxRepository(input.pool),allowedOrigin:input.allowedOrigin,authenticateRequest})
 }})
}
