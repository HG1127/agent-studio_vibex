import {HttpError,type SqlClient,type SqlPool} from './contracts.ts'
import {ownId} from './own-operations-contract.ts'
import {applyKnowledgeScope} from './knowledge-scope-policy.ts'
import type {WorkflowV2EffectExecutor} from './workflow-v2-worker.ts'
import type {WorkflowEffectRequest} from './workflow-v2-machine.ts'
import {verifyWorkflowEffectLease,reserveWorkflowEffectDispatch} from './workflow-v2-dispatch-guard.ts'
import {safeWorkflowV2ModelRequest,type WorkflowV2ModelRequest} from './workflow-v2-model-contract.ts'
import {parseLocalTransportJson} from '../../../shared/native-local-device-contract.mjs'
import {monitorCanonical,monitorHash,type MonitorBoundSourceDefinition} from './native-monitor-source-contract.ts'
import {parseMonitorBusinessEffect,monitorBusinessTools,type MonitorBusinessTool} from './native-monitor-business-contract.ts'
import {createMonitorOriginalWorkerData} from './native-monitor-worker-data.ts'
import {readMonitorStoredReceipt,readMonitorReceiptFragment} from './native-monitor-source-access.ts'
import {NativeMonitorCaptureDispatcher} from './native-monitor-live-capture.ts'
type ExecuteLease=Parameters<WorkflowV2EffectExecutor['execute']>[1]
const changed=():never=>{throw new HttpError(409,'monitor_effect_binding_changed')}
const output=(v:unknown)=>{const text=monitorCanonical(v);if(text.length>11500)throw new HttpError(413,'monitor_business_tool_output_limit');return text}
function requestOf(request:WorkflowEffectRequest,lease:ExecuteLease):WorkflowV2ModelRequest{
 return safeWorkflowV2ModelRequest({claim:{job_id:lease.job_id,run_id:lease.run_id,lease_token:lease.lease_token,lease_version:lease.lease_version,lease_owner:lease.worker_id},step_key:request.step_key,input_sha256:request.input_sha256,parent_step_key:request.agent_context?.parent_step_key,execution_mode:'agent_native_v2'})
}
export class NativeMonitorOriginalExecutor implements WorkflowV2EffectExecutor{
 private closed=false
 private readonly pool:SqlPool
 private readonly delegate:WorkflowV2EffectExecutor
 private readonly dispatcher:NativeMonitorCaptureDispatcher
 private readonly approved:boolean
 constructor(pool:SqlPool,delegate:WorkflowV2EffectExecutor,dispatcher:NativeMonitorCaptureDispatcher,options:{executionApproved?:boolean}={}){
  if(!pool||typeof delegate?.execute!=='function'||typeof dispatcher?.capture!=='function')throw Error('monitor_original_executor_dependencies_required')
  this.pool=pool;this.delegate=delegate;this.dispatcher=dispatcher;this.approved=options.executionApproved===true
 }
 close(){if(this.closed)return;this.closed=true;this.dispatcher.close()}
 supports(request:WorkflowEffectRequest){return this.approved&&['model','tool'].includes(request.kind)||!this.delegate.supports||this.delegate.supports(request)}
 private async transaction<T>(body:(db:SqlClient)=>Promise<T>):Promise<T>{
  const db=await this.pool.connect();let begun=false,committing=false,discard=false
  try{
   await db.query('BEGIN');begun=true;await applyKnowledgeScope(db,this.pool);await db.query('SET LOCAL search_path=pg_catalog')
   const value=await body(db);committing=true;await db.query('COMMIT');begun=false;return value
  }catch(error){if(committing){discard=true;throw new HttpError(503,'monitor_effect_commit_unconfirmed')}throw error}
  finally{if(begun)try{await db.query('ROLLBACK')}catch{discard=true};if(discard)Reflect.apply(db.release,db,[true]);else db.release()}
 }
 private async actor(db:SqlClient,owner:string){await db.query('SET LOCAL ROLE agentstudio_api');await db.query("SELECT set_config('agentstudio.actor_id',$1::text,true)",[ownId(owner)])}
 private async finish(db:SqlClient,owner:string,r:WorkflowV2ModelRequest){
  const rows=await db.query("UPDATE agentstudio.external_effects SET status='succeeded',updated_at=clock_timestamp() WHERE run_id=$1::uuid AND owner_user_id=$2::uuid AND step_key=$3::text AND arguments_sha256=$4::text AND status='started' RETURNING step_key",[r.claim.run_id,owner,'wf2_tool:'+r.step_key,r.input_sha256])
  if(rows.rows.length!==1)throw new HttpError(503,'monitor_effect_dispatch_unconfirmed')
 }
 async execute(request:WorkflowEffectRequest,lease:ExecuteLease):Promise<string>{
  if(this.closed)throw new HttpError(503,'monitor_original_executor_closed')
  if(!this.approved||lease.execution_mode!=='agent_native_v2')return this.delegate.execute(request,lease)
  lease.signal.throwIfAborted()
  const r=requestOf(request,lease)
  const selected=await this.transaction(async db=>{
   await db.query('SET LOCAL ROLE agentstudio_worker')
   const probed=(await db.query<{value:Record<string,unknown>|null}>('SELECT agentstudio.monitor_live_worker_probe($1::jsonb) AS value',[JSON.stringify(r.claim)])).rows
   if(probed.length!==1)changed()
   const binding=probed[0]?.value
   if(binding===null)return{kind:'ordinary' as const}
   if(!binding||typeof binding.definition!=='object'||monitorHash(binding.definition)!==binding.definition_hash||binding.run_id!==lease.run_id)changed()
   const owner=ownId(binding!.owner_user_id),caseId=ownId(binding!.case_id),checkId=ownId(binding!.check_id)
   await this.actor(db,owner)
   const pending=await verifyWorkflowEffectLease(db,owner,r,request.kind==='model'?'model':'tool',false,true,false,false,false,true)
   if(pending.input_sha256!==request.input_sha256||pending.kind!==request.kind||monitorCanonical(pending.configuration)!==monitorCanonical(request.configuration))changed()
   const definition=binding!.definition as {sources:MonitorBoundSourceDefinition[]}
   let tool='model',args:Record<string,unknown>={},source:MonitorBoundSourceDefinition|undefined
   if(request.kind!=='model'){
    if(request.kind!=='tool'||typeof pending.configuration.params_template!=='string')changed()
    const parsed=parseLocalTransportJson(pending.configuration.params_template!,12000)
    if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))changed()
    args=parsed as Record<string,unknown>
    const configured=String(pending.configuration.tool??'')
    source=definition.sources.find(s=>monitorHash(s.input)===monitorHash(args)&&(s.tool===configured||s.tool===pending.configuration.title&&s.connection_id===pending.configuration.tool_binding?.connection_id&&s.config_hash&&pending.configuration.tool_binding?.connection_revision!==undefined))
    tool=source?.tool??configured
    if(!source)parseMonitorBusinessEffect({title:pending.configuration.title,tool,params_template:monitorCanonical(args)})
   }
   if(request.kind!=='model')await reserveWorkflowEffectDispatch(db,owner,r,'tool')
   await db.query('SET LOCAL ROLE agentstudio_worker')
   const authorized=(await db.query<{value:{slot_id:string;check_id:string;owner_user_id:string;case_id:string;run_id:string;lease_token:string;lease_version:number;source_id:string|null;kind:string}}>('SELECT agentstudio.monitor_live_effect_authorize($1::jsonb,$2::text,$3::jsonb,$4::text,$5::text) AS value',[JSON.stringify(r),tool,JSON.stringify(args),monitorCanonical(args),source?.source_id??null])).rows
   if(authorized.length!==1)changed()
   const auth=authorized[0]?.value
   if(!auth||auth.owner_user_id!==owner||auth.case_id!==caseId||auth.run_id!==lease.run_id||auth.check_id!==checkId||auth.source_id!==(source?.source_id??null))changed()
   ownId(auth!.slot_id);ownId(auth!.lease_token)
   if(!Number.isSafeInteger(auth!.lease_version)||auth!.lease_version<1)changed()
   await this.actor(db,owner)
   if(request.kind==='model')return{kind:'model' as const}
   if(source)return{kind:'source' as const,owner,caseId,checkId,sourceId:source.source_id,lease:{check_id:checkId,lease_token:auth!.lease_token,lease_version:auth!.lease_version}}
   if(!monitorBusinessTools.includes(tool as MonitorBusinessTool))changed()
   const actual=createMonitorOriginalWorkerData(r.claim,async(client,actualOwner,actualRun)=>{
    if(actualOwner!==owner||actualRun!==lease.run_id)changed()
    await verifyWorkflowEffectLease(client,owner,r,'tool',false,true,false,false,false,true)
   })
   await actual.requireBinding(db,owner,caseId,lease.run_id)
   let value:unknown
   if(tool==='business_case_get')value=await actual.data.caseGet(db,owner,caseId)
   else if(tool==='business_record_query')value=await actual.data.query(db,owner,caseId,{...args,limit:args.limit??5})
   else if(tool==='business_record_write'){
    const saved=await actual.data.write(db,owner,caseId,args,lease.run_id)
    value={record_id:saved.record_id,version:saved.version,schema_id:saved.schema_id}
   }else{
    const receipt=await readMonitorStoredReceipt(db,owner,caseId,args.run_id===undefined?lease.run_id:ownId(args.run_id),ownId(args.result_id))
    value=readMonitorReceiptFragment(receipt,{field:args.field??'text',offset:args.offset??0,limit:args.limit??4000})
   }
   const text=output(value);await this.finish(db,owner,r)
   return{kind:'database' as const,text}
  })
  // No provider/GET is attempted until all preceding database mutations have a
  // confirmed COMMIT. Unknown COMMIT exits above without delegated execution.
  if(selected.kind==='ordinary'||selected.kind==='model')return this.delegate.execute(request,lease)
  if(selected.kind==='database')return selected.text
  lease.signal.throwIfAborted()
  const captured=await this.dispatcher.capture(selected.lease,selected.sourceId,lease.signal)
  if(captured.state!=='captured')throw new HttpError(503,'monitor_source_capture_incomplete')
  return this.transaction(async db=>{
   await this.actor(db,selected.owner)
   await verifyWorkflowEffectLease(db,selected.owner,r,'tool',false,true,false,false,false,true)
   const receipt=await readMonitorStoredReceipt(db,selected.owner,selected.caseId,lease.run_id,captured.result_id)
   if(receipt.monitor_check_id!==selected.checkId||receipt.source_id!==selected.sourceId)changed()
   const text=output({run_id:lease.run_id,result_id:receipt.id,content_hash:receipt.content_hash,stored_complete:true,reader_tool:'result_read',text_preview:String(receipt.payload.text??'').slice(0,500)})
   await this.finish(db,selected.owner,r);return text
  })
 }
}
