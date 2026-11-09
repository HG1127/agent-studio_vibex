import {HttpError,type SqlPool} from './contracts.ts'
import {ownId} from './own-operations-contract.ts'
import {monitorCanonical,monitorHash} from './native-monitor-source-contract.ts'
import {parseOrdinaryCaseRunBinding,type OrdinaryCaseRunBinding} from '../../../shared/ordinary-case-run-contract.ts'
import type {WorkflowV2ModelRequest} from './workflow-v2-model-contract.ts'
import type {createWorkflowToolNetwork} from './workflow-v2-tool-network.ts'
import {ordinaryCaseTransaction} from './native-ordinary-case-effect.ts'
export type OrdinaryCaseCapturedResponse=Awaited<ReturnType<ReturnType<typeof createWorkflowToolNetwork>['monitorHttp']>>
export type OrdinaryCaseCaptureSlot=Readonly<{slot_id:string;binding:OrdinaryCaseRunBinding;source_metadata:Record<string,unknown>;data_space:'LIVE'|'DEMO'}>
export interface OrdinaryCaseCapturePort{
 begin(request:WorkflowV2ModelRequest,proof:string):Promise<OrdinaryCaseCaptureSlot|null>
 finish(slot:OrdinaryCaseCaptureSlot,request:WorkflowV2ModelRequest,proof:string,payload:OrdinaryCaseCapturedResponse):Promise<string>
 fail(slot:OrdinaryCaseCaptureSlot,request:WorkflowV2ModelRequest):Promise<void>
}
export class NativeOrdinaryCaseCapture implements OrdinaryCaseCapturePort{
 declare private readonly pool:SqlPool
 constructor(pool:SqlPool){this.pool=pool}
 async begin(request:WorkflowV2ModelRequest,proof:string){return ordinaryCaseTransaction(this.pool,'agentstudio_bound_dispatch',async db=>{
  const rows=(await db.query<{value:unknown}>('SELECT agentstudio.ordinary_case_source_begin($1::jsonb,$2::text) AS value',[JSON.stringify(request),proof])).rows
  if(rows.length!==1)throw new HttpError(503,'ordinary_case_capture_unconfirmed')
  if(rows[0]!.value===null)return null
  const v=rows[0]!.value as OrdinaryCaseCaptureSlot,binding=parseOrdinaryCaseRunBinding(v?.binding)
  if(!v||Object.keys(v).sort().join(',')!=='binding,data_space,slot_id,source_metadata'||binding.run_id!==request.claim.run_id||binding.job_id!==request.claim.job_id||!['LIVE','DEMO'].includes(v.data_space)||!v.source_metadata||!['http','web_fetch'].includes(String(v.source_metadata.kind)))throw new HttpError(503,'ordinary_case_capture_unconfirmed')
  return Object.freeze({slot_id:ownId(v.slot_id),binding,source_metadata:v.source_metadata,data_space:v.data_space})
 })}
 async finish(slot:OrdinaryCaseCaptureSlot,request:WorkflowV2ModelRequest,proof:string,payload:OrdinaryCaseCapturedResponse){
  const actual={...payload,data_space:slot.data_space},canonical=monitorCanonical(actual),hash=monitorHash(actual)
  return ordinaryCaseTransaction(this.pool,'agentstudio_bound_dispatch',async db=>{
   const rows=(await db.query<{value:{result_id:string;content_hash:string;replayed:boolean}}>('SELECT agentstudio.ordinary_case_source_finish($1::uuid,$2::jsonb,$3::text,$4::text,$5::text) AS value',[slot.slot_id,JSON.stringify(request),proof,canonical,hash])).rows
   const value=rows[0]?.value
   if(rows.length!==1||!value||value.content_hash!==hash||typeof value.replayed!=='boolean')throw new HttpError(503,'ordinary_case_capture_unconfirmed')
   return monitorCanonical({run_id:slot.binding.run_id,result_id:ownId(value.result_id),content_hash:hash,stored_complete:true,usable_as_evidence:actual.usable_as_evidence,redacted:actual.redacted,reader_tool:'result_read',text_preview:actual.text.slice(0,500)})
  })
 }
 async fail(slot:OrdinaryCaseCaptureSlot,request:WorkflowV2ModelRequest){await ordinaryCaseTransaction(this.pool,'agentstudio_bound_dispatch',async db=>{await db.query('SELECT agentstudio.ordinary_case_source_fail($1::uuid,$2::jsonb)',[slot.slot_id,JSON.stringify(request)])})}
}
