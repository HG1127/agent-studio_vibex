import {roleObject,roleText} from './original-role-execution-contract.mjs'
import {originalSkillAbSelection,type OriginalSkillAbSelection} from './original-skill-ab-contract.ts'
export const skillAbFeeAcknowledgement='APPROVE_EXPLICIT_PAID_SKILL_AB_TWO_CALLS_V1' as const
function bad():never{throw Error('invalid_original_skill_ab_execution_contract')}
export function abId(v:unknown):string{if(typeof v!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v))bad();return v}
export function abSha(v:unknown):string{if(typeof v!=='string'||!/^[a-f0-9]{64}$/.test(v))bad();return v}
function count(v:unknown,max=10000000):number{if(typeof v!=='number'||!Number.isSafeInteger(v)||v<0||v>max)bad();return v}
function positive(v:unknown):number{const n=count(v,9007199254740989);if(n<1)bad();return n}
function dense(raw:unknown,max:number):unknown[]{if(!Array.isArray(raw)||raw.length>max||Reflect.ownKeys(raw).length!==raw.length+1)bad();return Array.from({length:raw.length},(_,i)=>{const d=Object.getOwnPropertyDescriptor(raw,String(i));if(!d?.enumerable||!Object.hasOwn(d,'value'))bad();return d.value})}
export type SkillAbIntent=OriginalSkillAbSelection&{request_id:string;expected_input_sha256:string;confirm:true;fee_acknowledgement:typeof skillAbFeeAcknowledgement}
export function skillAbIntent(raw:unknown):SkillAbIntent{
 const v=roleObject(raw,['request_id','expected_input_sha256','skill_ref','model_binding','confirm','fee_acknowledgement'])
 if(v.confirm!==true||v.fee_acknowledgement!==skillAbFeeAcknowledgement)bad()
 return {...originalSkillAbSelection({skill_ref:v.skill_ref,model_binding:v.model_binding}),request_id:abId(v.request_id),expected_input_sha256:abSha(v.expected_input_sha256),confirm:true,fee_acknowledgement:skillAbFeeAcknowledgement}
}
export const skillAbIntentHashData=(raw:unknown)=>({protocol:'original_skill_ab_paid_intent_v1',intent:skillAbIntent(raw)})
export type SkillAbProof={request_id:string;ordinal:0|1;dispatch_token:string}
export function skillAbProof(raw:unknown):SkillAbProof{const v=roleObject(raw,['request_id','ordinal','dispatch_token']);if(v.ordinal!==0&&v.ordinal!==1)bad();return {request_id:abId(v.request_id),ordinal:v.ordinal,dispatch_token:abId(v.dispatch_token)}}
export function skillAbDispatchReply(raw:unknown,proof:SkillAbProof){const v=roleObject(raw,['protocol','request_id','ordinal','state']);if(v.protocol!=='original_skill_ab_dispatch_reply_v1'||v.request_id!==proof.request_id||v.ordinal!==proof.ordinal||v.state!=='succeeded'&&v.state!=='unknown')bad();return {protocol:'original_skill_ab_dispatch_reply_v1' as const,request_id:proof.request_id,ordinal:proof.ordinal,state:v.state}}
export type SkillAbTrial={ordinal:0|1;label:'A'|'B';variant:'baseline'|'with_skill';state:'planned'|'claimed'|'reserved'|'succeeded'|'unknown'|'stopped';started_once:boolean;input_tokens:number|null;output_tokens:number|null;total_tokens:number|null;truncated:boolean|null;result_sha256:string|null;elapsed_ms:number|null}
export type SkillAbReceipt={protocol:'original_skill_ab_receipt_v1';owner_user_id:string;request_id:string;request_sha256:string;selection:OriginalSkillAbSelection;input_sha256:string;source_sha256:string;owner_epoch:number;state:'active'|'stopped'|'erased';trials:[SkillAbTrial,SkillAbTrial];recorded:true}
export function skillAbReceipt(raw:unknown,expected:{owner:string;requestId:string;requestSha?:string;inputSha?:string}):SkillAbReceipt{
 const v=roleObject(raw,['protocol','owner_user_id','request_id','request_sha256','selection','input_sha256','source_sha256','owner_epoch','state','trials','recorded'])
 if(v.protocol!=='original_skill_ab_receipt_v1'||v.recorded!==true||v.owner_user_id!==abId(expected.owner)||v.request_id!==abId(expected.requestId)||!['active','stopped','erased'].includes(String(v.state)))bad()
 const request_sha256=abSha(v.request_sha256),input_sha256=abSha(v.input_sha256);if(expected.requestSha!==undefined&&request_sha256!==expected.requestSha||expected.inputSha!==undefined&&input_sha256!==expected.inputSha)bad()
 const rows=dense(v.trials,2);if(rows.length!==2)bad()
 const trials=rows.map((raw,i):SkillAbTrial=>{const t=roleObject(raw,['ordinal','label','variant','state','started_once','input_tokens','output_tokens','total_tokens','truncated','result_sha256','elapsed_ms'])
  if(t.ordinal!==i||t.label!==(i===0?'A':'B')||t.variant!=='baseline'&&t.variant!=='with_skill'||!['planned','claimed','reserved','succeeded','unknown','stopped'].includes(String(t.state))||typeof t.started_once!=='boolean')bad()
  const state=t.state as SkillAbTrial['state']
  if(['reserved','succeeded','unknown'].includes(state)!==t.started_once)bad()
  if(state==='succeeded'){
   const input_tokens=count(t.input_tokens),output_tokens=count(t.output_tokens,900),total_tokens=count(t.total_tokens);if(input_tokens+output_tokens!==total_tokens||typeof t.truncated!=='boolean')bad()
   return {ordinal:i===0?0:1,label:i===0?'A':'B',variant:t.variant,state,started_once:true,input_tokens,output_tokens,total_tokens,truncated:t.truncated,result_sha256:abSha(t.result_sha256),elapsed_ms:count(t.elapsed_ms)}
  }
  if([t.input_tokens,t.output_tokens,t.total_tokens,t.truncated,t.result_sha256].some(v=>v!==null)||state==='unknown'&&t.elapsed_ms===null||state!=='unknown'&&t.elapsed_ms!==null)bad()
  return {ordinal:i===0?0:1,label:i===0?'A':'B',variant:t.variant,state,started_once:t.started_once,input_tokens:null,output_tokens:null,total_tokens:null,truncated:null,result_sha256:null,elapsed_ms:t.elapsed_ms===null?null:count(t.elapsed_ms)}
 })
 if(trials[0]!.variant===trials[1]!.variant||trials[1]!.started_once&&(trials[0]!.state!=='succeeded'||trials[0]!.total_tokens===null||trials[0]!.total_tokens>=40000))bad()
 return {protocol:'original_skill_ab_receipt_v1',owner_user_id:expected.owner,request_id:expected.requestId,request_sha256,selection:originalSkillAbSelection(v.selection),input_sha256,source_sha256:abSha(v.source_sha256),owner_epoch:positive(v.owner_epoch),state:v.state as SkillAbReceipt['state'],trials:[trials[0]!,trials[1]!],recorded:true}
}
export function skillAbView(raw:unknown,expected:Parameters<typeof skillAbReceipt>[1]){
 const v=roleObject(raw,['receipt','result_status','results']),receipt=skillAbReceipt(v.receipt,expected)
 if(!['available','pending','unknown','stale','erased'].includes(String(v.result_status)))bad()
 const result_status=v.result_status as 'available'|'pending'|'unknown'|'stale'|'erased'
 if(receipt.state==='erased'&&result_status!=='erased')bad()
 if(result_status==='stale'||result_status==='erased'){if(v.results!==null)bad();return {receipt,result_status,results:null}}
 const results=dense(v.results,2).map(raw=>{const r=roleObject(raw,['ordinal','text','result_sha256']);if(r.ordinal!==0&&r.ordinal!==1)bad();const trial=receipt.trials[r.ordinal];if(trial.state!=='succeeded'||r.result_sha256!==trial.result_sha256)bad();return {ordinal:r.ordinal,text:roleText(r.text,12000,true),result_sha256:abSha(r.result_sha256)}})
 if(new Set(results.map(r=>r.ordinal)).size!==results.length||result_status==='available'&&(results.length===0||results.length!==receipt.trials.filter(t=>t.state==='succeeded').length)||result_status!=='available'&&results.length!==0)bad()
 return {receipt,result_status,results}
}
export function skillAbResultHashData(receipt:SkillAbReceipt,result:{ordinal:number;text:string}){const t=receipt.trials[result.ordinal];if(!t||t.state!=='succeeded')bad();return {protocol:'original_skill_ab_result_v1',request_id:receipt.request_id,ordinal:t.ordinal,input_sha256:receipt.input_sha256,completion:{model_id:receipt.selection.model_binding.model_id,text:result.text,input_tokens:t.input_tokens,output_tokens:t.output_tokens,total_tokens:t.total_tokens,truncated:t.truncated}}}
export function skillAbControl(raw:unknown){const v=roleObject(raw,['operation_id','request_id','action','confirm']);if(v.confirm!==true||v.action!=='cancel'&&v.action!=='erase')bad();const operation_id=abId(v.operation_id),request_id=abId(v.request_id);if(operation_id===request_id)bad();return {operation_id,request_id,action:v.action,confirm:true as const}}
export const skillAbControlHashData=(raw:unknown)=>({protocol:'original_skill_ab_control_v1',...skillAbControl(raw)})
export function skillAbControlReceipt(raw:unknown,owner:string,choice:ReturnType<typeof skillAbControl>,requestSha:string){const v=roleObject(raw,['protocol','owner_user_id','operation_id','request_id','action','request_sha256','recorded']);if(v.protocol!=='original_skill_ab_control_receipt_v1'||v.owner_user_id!==owner||v.operation_id!==choice.operation_id||v.request_id!==choice.request_id||v.action!==choice.action||v.request_sha256!==requestSha||v.recorded!==true)bad();return {protocol:'original_skill_ab_control_receipt_v1' as const,owner_user_id:owner,operation_id:choice.operation_id,request_id:choice.request_id,action:choice.action,request_sha256:requestSha,recorded:true as const}}
