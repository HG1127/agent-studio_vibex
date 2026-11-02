import {ordinaryCaseTransaction} from './native-ordinary-case-effect.ts'
import {HttpError,type Identity,type SqlPool,type SqlClient,type AgentSpecInput} from './contracts.ts'
import type {WorkflowV2RunRow} from './workflow-v2-run-repository.ts'
import {withActorClient,assertOwnedAdmissionContext} from './repository.ts'
import {assertOriginalUiEmployee} from './native-original-ui-preconditions.ts'
import {AutonomousAgentRunRepository} from './autonomous-agent-run-repository.ts'
import {parseOrdinaryCaseRunInput,type OrdinaryCaseRunInput,requireOrdinaryCaseRunBinding} from '../../../shared/ordinary-case-run-contract.ts'
import {NativeMonitorBusinessData,type MonitorBusinessCase} from './native-monitor-business-data.ts'
import {monitorCanonical,monitorHash} from './native-monitor-source-contract.ts'
import {optionalOrdinaryCaseAgentBinding} from './native-ordinary-case-binding.ts'
type Options=NonNullable<ConstructorParameters<typeof AutonomousAgentRunRepository>[1]>
type Context={owner:string;input:OrdinaryCaseRunInput;caseInfo:MonitorBusinessCase}
export function ordinaryCaseEnvelope(raw:unknown):{input:OrdinaryCaseRunInput|null;root:Record<string,unknown>}{
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new HttpError(400,'invalid_agent_run_request')
 const source=raw as Record<string,unknown>,{business_case,...root}=source
 if(!Object.hasOwn(source,'business_case'))return{input:null,root}
 try{return{input:parseOrdinaryCaseRunInput(business_case),root}}catch{throw new HttpError(400,'invalid_ordinary_case_run_binding')}
}
/** Compound admission uses the real inherited run+job+audit transaction. */
export class NativeOrdinaryCaseRunRepository extends AutonomousAgentRunRepository{
 private readonly ready:(db:SqlClient)=>Promise<void>
 private readonly ordinaryEnabled:boolean
 private readonly ordinaryContexts=new WeakMap<SqlClient,Context>()
 private readonly cases=new NativeMonitorBusinessData(async()=>{throw new HttpError(403,'ordinary_case_worker_claim_required')})
 constructor(pool:SqlPool,options:Options,ordinary:{enabled?:boolean;assertReady?:(db:SqlClient)=>Promise<void>}={}){
  super(pool,{...options,allowMonitorBusiness:options.allowMonitorBusiness===true||ordinary.enabled===true})
  this.ordinaryEnabled=ordinary.enabled===true
  if(this.ordinaryEnabled&&typeof ordinary.assertReady!=='function')throw Error('ordinary_case_catalog_verifier_required')
  this.ready=ordinary.assertReady??(async()=>{throw new HttpError(503,'ordinary_case_runtime_required')})
 }
 override async submit(identity:Identity,id:string,raw:unknown,expectedEmployee?:string){
  const envelope=ordinaryCaseEnvelope(raw)
  if(!envelope.input)return super.submit(identity,id,raw,expectedEmployee)
  if(!this.ordinaryEnabled)throw new HttpError(403,'ordinary_case_run_disabled')
  if(identity?.issuer!=='urn:agentstudio:local:v1')throw new HttpError(403,'native_employee_identity_required')
  if(!expectedEmployee)throw new HttpError(400,'expected_employee_required')
  return ordinaryCaseTransaction(this.pool,'agentstudio_api',db=>withActorClient(db,this.pool,identity,async(client,owner)=>{assertOriginalUiEmployee(owner,expectedEmployee);return this.admitOwned(client,owner,id,raw)}))
 }
 protected override async assertBusinessAdmission(db:SqlClient,owner:string,spec:unknown,plannedRunId?:string){
  const context=this.ordinaryContexts.get(db)
  if(!context)return super.assertBusinessAdmission(db,owner,spec,plannedRunId)
  if(!this.ordinaryEnabled||context.owner!==owner||plannedRunId!==undefined)throw new HttpError(403,'ordinary_case_admission_context_required')
  await assertOwnedAdmissionContext(db,owner)
  const actual=await this.cases.caseGet(db,owner,context.input.case_id,true)
  if(monitorHash(actual)!==monitorHash(context.caseInfo))throw new HttpError(409,'ordinary_case_binding_changed')
 }
 override async admitOwned(db:SqlClient,owner:string,id:string,raw:unknown,plannedRunId?:string,modelBinding?:AgentSpecInput['model_binding']){
  const envelope=ordinaryCaseEnvelope(raw)
  if(!envelope.input)return super.admitOwned(db,owner,id,raw,plannedRunId,modelBinding)
  if(!this.ordinaryEnabled||plannedRunId!==undefined||modelBinding!==undefined||this.ordinaryContexts.has(db))throw new HttpError(403,'ordinary_case_admission_context_required')
  await assertOwnedAdmissionContext(db,owner);await this.ready(db)
  const caseInfo=await this.cases.caseGet(db,owner,envelope.input.case_id,true)
  if(envelope.input.question_id&&!caseInfo.questions.some(q=>q.question_id===envelope.input!.question_id))throw new HttpError(409,'ordinary_case_question_changed')
  this.ordinaryContexts.set(db,{owner,input:envelope.input,caseInfo})
  try{
   const result=await super.admitOwned(db,owner,id,envelope.root)
   const canonical=monitorCanonical({...envelope.root,business_case:envelope.input})
   const rows=(await db.query<{value:unknown}>('SELECT agentstudio.ordinary_case_bind($1::uuid,$2::uuid,$3::uuid,$4::text,$5::text,$6::boolean) AS value',[result.run.id,envelope.input.case_id,envelope.input.question_id??null,canonical,monitorHash(JSON.parse(canonical)),result.replayed])).rows
   if(rows.length!==1)throw new HttpError(503,'ordinary_case_admission_unconfirmed')
   let binding;try{binding=requireOrdinaryCaseRunBinding(rows[0]?.value,{employee_id:owner,run_id:result.run.id,spec_id:id,spec_revision:Number(envelope.root.expected_revision),input:envelope.input})}catch{throw new HttpError(503,'ordinary_case_admission_unconfirmed')}
   return{...result,ordinary_case_binding:binding}
  }finally{this.ordinaryContexts.delete(db)}
 }
 protected override async assemble(db:SqlClient,owner:string,row:WorkflowV2RunRow,replayed:boolean){
  const result=await super.assemble(db,owner,row,replayed)
  if(!this.ordinaryEnabled)return result
  await this.ready(db);const binding=await optionalOrdinaryCaseAgentBinding(db,owner,row.id,true)
  return{...result,...(binding?{ordinary_case_binding:binding}:{})}
 }
}
