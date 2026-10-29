import {setTimeout as delay} from 'node:timers/promises'
import {HttpError,type Identity,type SqlClient,type SqlPool} from './contracts.ts'
import {withActor} from './repository.ts'
import {verifyWorkflowEffectLease} from './workflow-v2-dispatch-guard.ts'
import type {WorkflowV2ToolRequest} from './workflow-v2-tool-contract.ts'
import {localDigest,parseLocalBinding,parseLocalInput,parseLocalResult,parseLocalJob,type LocalInput,type LocalBinding} from '../../../shared/native-local-device-contract.mjs'
import {localValue} from './native-local-device-repository.ts'
import {validateNativeLocalArguments} from './native-local-device-validation.ts'
export type NativeLocalBinding=LocalBinding
export const parseNativeLocalBinding=parseLocalBinding
export async function ownedNativeLocalBinding(db:SqlClient,run:string){const raw=await localValue(db,'SELECT agentstudio.native_local_run_binding($1::uuid) AS value',[run]);if(raw===null)return null;const v=parseNativeLocalBinding(raw);if(await localDigest(v.catalog)!==v.catalog_sha256)throw Error('native_local_invalid_binding');return v}
export async function enqueueNativeLocalTool(db:SqlClient,request:WorkflowV2ToolRequest,input:LocalInput){
 // Called in the SAME actual owner/lease/approval transaction immediately
 // after reserveWorkflowEffectDispatch; failure rolls back both reservations.
 const binding=await ownedNativeLocalBinding(db,request.claim.run_id);if(!binding)throw new HttpError(409,'native_local_device_binding_required')
 await validateNativeLocalArguments(db,binding.device_id,input)
 return parseLocalJob(await localValue(db,'SELECT agentstudio.native_local_agent_enqueue($1::jsonb,$2::jsonb) AS value',[JSON.stringify(request),JSON.stringify(parseLocalInput(input))]))
}
export async function waitNativeLocalTool(pool:SqlPool,identity:Identity,request:WorkflowV2ToolRequest,id:string,signal:AbortSignal,allowMemory:boolean){
 while(true){signal.throwIfAborted();const job=await withActor(pool,identity,async(db,owner)=>{
  await verifyWorkflowEffectLease(db,owner,request,'tool',false,true,allowMemory,true)
  const current=parseLocalJob(await localValue(db,'SELECT agentstudio.native_local_get($1::uuid) AS value',[id]))
  if(current.id!==id||current.run_id!==request.claim.run_id||current.step_key!==request.step_key||current.input_sha256!==request.input_sha256)throw Error('native_local_job_changed')
  return current
 })
 if(job.status==='succeeded')return parseLocalResult(job.result).text||'本机操作已完成。'
 if(!['queued','running'].includes(job.status))throw new HttpError(503,'native_local_outcome_unknown')
 await delay(350,undefined,{signal})
 }
}
export async function ownedNativeLocalImages(db:SqlClient,run:string){const raw=await localValue(db,'SELECT agentstudio.native_local_images($1::uuid) AS value',[run]);return parseLocalResult({text:'',images:raw}).images}
