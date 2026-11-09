import {ordinaryCaseEvidenceAccess,readOrdinaryCaseReceipt} from './native-ordinary-case-source-access.ts'
import {verifyOrdinaryCaseSchema} from './native-ordinary-case-audit.ts'
import type {IncomingMessage} from 'node:http'
import type {Identity,SqlPool} from './contracts.ts'
import type {WorkflowV2EffectExecutor} from './workflow-v2-worker.ts'
import {inspectOptionalMonitorLive} from './native-monitor-live-audit.ts'
import {NativeMonitorLiveRepository} from './native-monitor-live-repository.ts'
import {createNativeMonitorLiveHttp} from './native-monitor-live-http.ts'
import {NativeMonitorWorker} from './native-monitor-worker.ts'
import {NativeMonitorOriginalExecutor} from './native-monitor-original-executor.ts'
import {NativeMonitorGetTransport} from './native-monitor-live-transport.ts'
import {NativeMonitorCaptureDispatcher} from './native-monitor-live-capture.ts'
export function selectNativeMonitorLive(env:NodeJS.ProcessEnv,listen:boolean,origin:string){
 const enabled=env.AGENT_STUDIO_PG18_MONITOR_LIVE_ENABLED,approved=env.AGENT_STUDIO_PG18_MONITOR_LIVE_APPROVED,execute=env.AGENT_STUDIO_PG18_MONITOR_LIVE_EXECUTION_APPROVED
 if(enabled===undefined&&approved===undefined&&execute===undefined)return{enabled:false,execution:false}
 let valid=false;try{const u=new URL(origin);valid=u.protocol==='https:'&&u.origin===origin}catch{}
 if(enabled!=='true'||approved!=='APPROVE_DISPOSABLE_PG18_MONITOR_LIVE_ONLY'||env.AGENT_STUDIO_PG18_ORIGINAL_MONITOR_INBOX_ENABLED!=='true'||listen!==true||!valid||execute!==undefined&&execute!=='APPROVE_DISPOSABLE_PG18_MONITOR_LIVE_EXECUTION_ONLY')throw Error('unsafe_native_monitor_live_config')
 return{enabled:true,execution:execute==='APPROVE_DISPOSABLE_PG18_MONITOR_LIVE_EXECUTION_ONLY'}
}
// Preparation performs catalog reads only. It starts no server, loop,
// scheduler, source GET, provider request or worker process.
export async function prepareNativeMonitorLive(input:{pool:SqlPool;env:NodeJS.ProcessEnv;listen:boolean;allowedOrigin:string;configurationWrites?:boolean;ordinaryCaseEnabled?:boolean}){
  const schemaProfile=input.ordinaryCaseEnabled===true?'monitor074-ordinary077':'monitor074'
  const selection=selectNativeMonitorLive(input.env,input.listen,input.allowedOrigin),schema=await inspectOptionalMonitorLive(input.pool,schemaProfile)
 if(!selection.enabled)return null
 if(schema!=='installed')throw Error('native_monitor_live_schema_required')
  const repository=new NativeMonitorLiveRepository(input.pool,input.ordinaryCaseEnabled===true?{evidence:ordinaryCaseEvidenceAccess,readReceipt:readOrdinaryCaseReceipt,assertReady:verifyOrdinaryCaseSchema,schemaProfile}:{})
 return Object.freeze({
  repository,
  hostOptions:Object.freeze({allowMonitorBusinessSpecs:true,allowMonitorBusiness:true,monitorBusinessExecutionApproved:selection.execution,allowMonitorBusinessExecution:selection.execution}),
  createHandler(authenticateRequest:(req:IncomingMessage)=>Promise<Identity>){return createNativeMonitorLiveHttp({repository,allowWrites:input.configurationWrites===true,allowedOrigin:input.allowedOrigin,authenticateRequest})},
  createWorker(pool:SqlPool,workerId:string){return new NativeMonitorWorker(pool,workerId,{executionApproved:selection.execution})},
  wrapOriginalExecutor(workerPool:SqlPool,delegate:WorkflowV2EffectExecutor,dispatchPool:SqlPool,key:Buffer){
   if(!selection.execution)throw Error('native_monitor_live_execution_not_approved')
   return new NativeMonitorOriginalExecutor(workerPool,delegate,new NativeMonitorCaptureDispatcher(dispatchPool,new NativeMonitorGetTransport(dispatchPool,key)),{executionApproved:true})
  },
 })
}
