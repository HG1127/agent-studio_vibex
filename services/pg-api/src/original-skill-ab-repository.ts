import {HttpError,type Identity,type SqlClient,type SqlPool} from './contracts.ts'
import {OriginalRoleUiRepository} from './original-role-ui-repository.ts'
import {auditSkillAbClient} from './original-skill-ab-runtime.ts'
import {originalSkillAbMaterialOnClient} from './original-skill-ab-source.ts'
import {originalRoleHash} from './original-role-execution.mjs'
import {originalSkillAbPreview,originalSkillAbSelection} from '../../../shared/original-skill-ab-contract.ts'
import {abId,abSha,skillAbFeeAcknowledgement,skillAbIntent,skillAbIntentHashData,skillAbReceipt,skillAbView,skillAbResultHashData,skillAbProof,skillAbDispatchReply,skillAbControl,skillAbControlHashData,skillAbControlReceipt} from '../../../shared/original-skill-ab-execution-contract.ts'
import {roleObject} from '../../../shared/original-role-execution-contract.mjs'
import {isSkillAbMutualTlsClient,type SkillAbMutualTlsClient} from './original-skill-ab-client.ts'
export class OriginalSkillAbRepository{
 readonly pool:SqlPool
 readonly enabled:boolean;private readonly roles:OriginalRoleUiRepository;private readonly client:SkillAbMutualTlsClient|undefined
 constructor(pool:SqlPool,options:{allowSubmissions?:boolean;client?:SkillAbMutualTlsClient}={}){
  this.pool=pool
  this.enabled=options.allowSubmissions===true;this.client=options.client;this.roles=new OriginalRoleUiRepository(pool,false)
  if(this.enabled&&!isSkillAbMutualTlsClient(this.client))throw Error('original_skill_ab_actual_private_client_required')
 }
 private actor<T>(identity:Identity,owner:string,body:(db:SqlClient,actual:string)=>Promise<T>){return this.roles.actor(identity,owner,false,async(db,actual)=>{await auditSkillAbClient(db,this.pool,'agentstudio_api');return body(db,actual)})}
 private checkedReceipt(raw:unknown,expected:Parameters<typeof skillAbReceipt>[1]){
  const r=skillAbReceipt(raw,expected),intent={...r.selection,request_id:r.request_id,expected_input_sha256:r.input_sha256,confirm:true,fee_acknowledgement:skillAbFeeAcknowledgement}
  if(originalRoleHash(skillAbIntentHashData(intent))!==r.request_sha256)throw new HttpError(503,'original_skill_ab_receipt_unconfirmed')
  return r
 }
 authorize(identity:Identity,owner:string){return this.actor(identity,owner,async()=>undefined)}
 meta(identity:Identity,owner:string){return this.actor(identity,owner,async()=>({skill_ab:this.enabled,skill_ab_preview:true}))}
 async preview(identity:Identity,owner:string,raw:unknown){return this.actor(identity,owner,async(db,actual)=>{
  const m=await originalSkillAbMaterialOnClient(db,actual,raw),{preview_sha256:_hash,...core}=m.preview,changed={...core,execution_available:this.enabled}
  return {employee_id:actual,preview:originalSkillAbPreview({...changed,preview_sha256:originalRoleHash(changed)},{owner:actual,selection:originalSkillAbSelection(raw),executionAvailable:this.enabled})}
 })}
 async submit(identity:Identity,owner:string,raw:unknown){const intent=skillAbIntent(raw),requestSha=originalRoleHash(skillAbIntentHashData(intent));return this.actor(identity,owner,async(db,actual)=>{
  const old=(await db.query<{value:unknown}>('SELECT agentstudio_skill_ab.receipt($1::uuid) AS value',[intent.request_id])).rows[0]?.value
  if(old!==null&&old!==undefined)return {employee_id:actual,receipt:this.checkedReceipt(old,{owner:actual,requestId:intent.request_id,requestSha,inputSha:intent.expected_input_sha256})}
  if(!this.enabled)throw new HttpError(403,'original_skill_ab_submission_disabled')
  const receipt=(await db.query<{value:unknown}>('SELECT agentstudio_skill_ab.record($1::jsonb) AS value',[JSON.stringify(intent)])).rows[0]?.value
  return {employee_id:actual,receipt:this.checkedReceipt(receipt,{owner:actual,requestId:intent.request_id,requestSha,inputSha:intent.expected_input_sha256})}
 })}
 async receipt(identity:Identity,owner:string,rawId:string,expectedSha:string){const id=abId(rawId),sha=abSha(expectedSha);return this.actor(identity,owner,async(db,actual)=>{
  const raw=(await db.query<{value:unknown}>('SELECT agentstudio_skill_ab.receipt($1::uuid) AS value',[id])).rows[0]?.value;if(raw===null)throw new HttpError(404,'original_skill_ab_receipt_not_found')
  return {employee_id:actual,receipt:this.checkedReceipt(raw,{owner:actual,requestId:id,requestSha:sha})}
 })}
 async view(identity:Identity,owner:string,rawId:string,expectedSha:string){const id=abId(rawId),sha=abSha(expectedSha);return this.actor(identity,owner,async(db,actual)=>{
  const raw=(await db.query<{value:unknown}>('SELECT agentstudio_skill_ab.view($1::uuid) AS value',[id])).rows[0]?.value;if(raw===null)throw new HttpError(404,'original_skill_ab_receipt_not_found')
  const view=skillAbView(raw,{owner:actual,requestId:id,requestSha:sha})
  this.checkedReceipt(view.receipt,{owner:actual,requestId:id,requestSha:sha})
  for(const result of view.results??[])if(originalRoleHash(skillAbResultHashData(view.receipt,result))!==result.result_sha256)throw new HttpError(503,'original_skill_ab_result_unconfirmed')
  return {employee_id:actual,view}
 })}
 async startTrial(identity:Identity,owner:string,rawId:string,ordinal:unknown,raw:unknown){
  const id=abId(rawId),r=roleObject(raw,['request_sha256']),requestSha=abSha(r.request_sha256);if(ordinal!==0&&ordinal!==1)throw new HttpError(400,'invalid_original_skill_ab_execution_contract')
  const claimed=await this.actor(identity,owner,async(db,actual)=>{
   if(!this.enabled)throw new HttpError(403,'original_skill_ab_submission_disabled')
   const v=roleObject((await db.query<{value:unknown}>('SELECT agentstudio_skill_ab.claim($1::uuid,$2::integer,$3::text) AS value',[id,ordinal,requestSha])).rows[0]?.value,['recorded','receipt'],['proof'])
   const receipt=this.checkedReceipt(v.receipt,{owner:actual,requestId:id,requestSha})
   if(v.recorded===true){if(Object.hasOwn(v,'proof'))throw Error('original_skill_ab_claim_unconfirmed');return {receipt,proof:null}}
   if(v.recorded!==false)throw Error('original_skill_ab_claim_unconfirmed');const proof=skillAbProof(v.proof)
   if(proof.request_id!==id||proof.ordinal!==ordinal||receipt.trials[ordinal].state!=='claimed')throw Error('original_skill_ab_claim_unconfirmed')
   return {receipt,proof}
  })
  if(!claimed.proof)return this.view(identity,owner,id,requestSha)
  // Reaching here proves the original claim transaction COMMIT was confirmed.
  // A lost private/API acknowledgment is only polled; it never resends proof.
  try{skillAbDispatchReply(await this.client!(claimed.proof),claimed.proof)}catch{throw new HttpError(503,'original_skill_ab_outcome_unknown')}
  return this.view(identity,owner,id,requestSha)
 }
 async control(identity:Identity,owner:string,raw:unknown,confirmOnly=false){const choice=skillAbControl(raw),hash=originalRoleHash(skillAbControlHashData(choice));return this.actor(identity,owner,async(db,actual)=>{
  let value=(await db.query<{value:unknown}>('SELECT agentstudio_skill_ab.control_receipt($1::uuid) AS value',[choice.operation_id])).rows[0]?.value
  if(value===null){if(confirmOnly)throw new HttpError(404,'original_skill_ab_control_receipt_not_found');value=(await db.query<{value:unknown}>('SELECT agentstudio_skill_ab.control($1::uuid,$2::uuid,$3::text) AS value',[choice.operation_id,choice.request_id,choice.action])).rows[0]?.value}
  return {employee_id:actual,receipt:skillAbControlReceipt(value,actual,choice,hash)}
 })}
}
