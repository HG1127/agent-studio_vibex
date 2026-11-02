import {HttpError,type SqlClient,type SqlPool} from './contracts.ts'
import type {WorkflowV2EffectExecutor} from './workflow-v2-worker.ts'
import type {WorkflowEffectRequest} from './workflow-v2-machine.ts'
import {safeWorkflowV2ModelRequest} from './workflow-v2-model-contract.ts'
import {verifyWorkflowEffectLease,reserveWorkflowEffectDispatch} from './workflow-v2-dispatch-guard.ts'
import {monitorBusinessTools,parseMonitorBusinessEffect,type MonitorBusinessTool} from './native-monitor-business-contract.ts'
import {NativeMonitorBusinessData} from './native-monitor-business-data.ts'
import {readMonitorReceiptFragment} from './native-monitor-source-access.ts'
import {readOrdinaryCaseReceipt,ordinaryCaseEvidenceAccess} from './native-ordinary-case-source-access.ts'
import {monitorCanonical} from './native-monitor-source-contract.ts'
import {parseOrdinaryCaseRunBinding} from '../../../shared/ordinary-case-run-contract.ts'
import {ordinaryCaseTransaction,readOrdinaryCaseEffectProof} from './native-ordinary-case-effect.ts'
type Lease=Parameters<WorkflowV2EffectExecutor['execute']>[1]
const changed=():never=>{throw new HttpError(409,'ordinary_case_effect_binding_changed')}
export class NativeOrdinaryCaseExecutor implements WorkflowV2EffectExecutor{
 declare private readonly pool:SqlPool
 declare private readonly delegate:WorkflowV2EffectExecutor
 declare private readonly approved:boolean
 declare private readonly flags:{allowMemory?:boolean;allowLocalDevices?:boolean;allowCallers?:boolean}
 constructor(pool:SqlPool,delegate:WorkflowV2EffectExecutor,approved=false,flags:{allowMemory?:boolean;allowLocalDevices?:boolean;allowCallers?:boolean}={}){this.pool=pool;this.delegate=delegate;this.approved=approved;this.flags=flags}
 supports(request:WorkflowEffectRequest){return this.approved&&request.kind==='tool'&&monitorBusinessTools.includes(request.configuration.tool as MonitorBusinessTool)||!this.delegate.supports||this.delegate.supports(request)}
 async execute(request:WorkflowEffectRequest,lease:Lease):Promise<string>{
  if(!this.approved||lease.execution_mode!=='agent_native_v2'||request.kind!=='tool'||!monitorBusinessTools.includes(request.configuration.tool as MonitorBusinessTool))return this.delegate.execute(request,lease)
  lease.signal.throwIfAborted()
  const r=safeWorkflowV2ModelRequest({claim:{job_id:lease.job_id,run_id:lease.run_id,lease_token:lease.lease_token,lease_version:lease.lease_version,lease_owner:lease.worker_id},step_key:request.step_key,input_sha256:request.input_sha256,parent_step_key:request.agent_context?.parent_step_key,execution_mode:'agent_native_v2'})
  const selected=await ordinaryCaseTransaction(this.pool,'agentstudio_worker',async db=>{
   const rows=(await db.query<{value:unknown}>('SELECT agentstudio.ordinary_case_worker_probe($1::jsonb) AS value',[JSON.stringify(r)])).rows
   if(rows.length!==1)changed()
   if(rows[0]!.value===null)return null
   const binding=parseOrdinaryCaseRunBinding(rows[0]!.value),owner=binding.owner_user_id,caseId=binding.case_id
   if(binding.run_id!==lease.run_id||binding.job_id!==lease.job_id)changed()
   const actor=async(client:SqlClient)=>{await client.query('SET LOCAL ROLE agentstudio_api');await client.query("SELECT set_config('agentstudio.actor_id',$1::text,true)",[owner])}
   await actor(db)
   const check=async(client:SqlClient)=>verifyWorkflowEffectLease(client,owner,r,'tool',false,true,this.flags.allowMemory===true,this.flags.allowLocalDevices===true,this.flags.allowCallers===true,false,true)
   const pending=await check(db)
   if(monitorCanonical(pending.configuration)!==monitorCanonical(request.configuration))changed()
   const effect=parseMonitorBusinessEffect(pending.configuration),args=JSON.parse(effect.params_template) as Record<string,unknown>
   const proof=await readOrdinaryCaseEffectProof(db,owner,r,pending)
   await reserveWorkflowEffectDispatch(db,owner,r,'tool')
   const data=new NativeMonitorBusinessData(async(client,actualOwner,c,run)=>{if(actualOwner!==owner||c!==caseId||run!==lease.run_id)changed();await check(client)},async(client,actualOwner,c,run,prepared)=>{
    if(actualOwner!==owner||c!==caseId||run!==lease.run_id)changed()
    await check(client);await client.query('SET LOCAL ROLE agentstudio_worker')
    const saved=(await client.query<{value:{record_id:string;version:number}}>('SELECT agentstudio.ordinary_case_record_write($1::jsonb,$2::text,$3::jsonb) AS value',[JSON.stringify(r),proof,JSON.stringify(prepared)])).rows
    await actor(client);if(saved.length!==1||!saved[0]?.value)changed();return saved[0]!.value
   },ordinaryCaseEvidenceAccess)
   let value:unknown
   if(effect.tool==='business_case_get')value=await data.caseGet(db,owner,caseId)
   else if(effect.tool==='business_record_query'){
    const result=await data.query(db,owner,caseId,{...args,limit:args.limit??5})
    for(const item of result.items)for(const ref of item.source_refs){await db.query('SET LOCAL ROLE agentstudio_worker');await db.query('SELECT agentstudio.ordinary_case_dependency($1::jsonb,$2::text,$3::uuid,$4::uuid)',[JSON.stringify(r),proof,ref.run_id,ref.result_id]);await actor(db)}
    value=result
   }
   else if(effect.tool==='business_record_write'){const saved=await data.write(db,owner,caseId,args,lease.run_id);value={record_id:saved.record_id,version:saved.version,schema_id:saved.schema_id}}
   else{
    const sourceRun=args.run_id===undefined?lease.run_id:String(args.run_id),receipt=await readOrdinaryCaseReceipt(db,owner,caseId,sourceRun,String(args.result_id))
    await db.query('SET LOCAL ROLE agentstudio_worker');await db.query('SELECT agentstudio.ordinary_case_dependency($1::jsonb,$2::text,$3::uuid,$4::uuid)',[JSON.stringify(r),proof,sourceRun,receipt.id]);await actor(db)
    value=readMonitorReceiptFragment(receipt,{field:args.field??'text',offset:args.offset??0,limit:args.limit??4000})
   }
   await check(db);const text=monitorCanonical(value)
   if(text.length>11500)throw new HttpError(413,'ordinary_case_business_output_limit')
   const finished=await db.query("UPDATE agentstudio.external_effects SET status='succeeded',updated_at=clock_timestamp() WHERE run_id=$1::uuid AND owner_user_id=$2::uuid AND step_key=$3::text AND arguments_sha256=$4::text AND status='started' RETURNING step_key",[lease.run_id,owner,'wf2_tool:'+r.step_key,r.input_sha256])
   if(finished.rows.length!==1)throw new HttpError(503,'ordinary_case_dispatch_unconfirmed')
   return text
  })
  return selected===null?this.delegate.execute(request,lease):selected
 }
}
