import {roleObject,roleText} from './original-role-execution-contract.mjs'
import {SKILL_AB_SCENARIO,SKILL_AB_OUTPUT_MAX_TOKENS,SKILL_AB_TOTAL_TOKEN_STOP,SKILL_AB_MAX_INSTRUCTION} from './skill-ab-compare.ts'
export type OriginalSkillAbSelection={skill_ref:{id:string;version:number;hash:string};model_binding:{connection_id:string;connection_revision:number;model_id:string}}
export type OriginalSkillAbPreview={protocol:'original_skill_ab_preview_v1';owner_user_id:string;owner_epoch:number;skill:{id:string;version:number;hash:string;name:string};model_binding:OriginalSkillAbSelection['model_binding'];scenario:string;input_characters:{baseline:number;with_skill:number};source_sha256:string;input_sha256:string;sample_count:2;output_token_limit:900;total_reported_token_stop:40000;possible_charges:true;price_estimate:null;requires_model_fee_ack:true;execution_available:boolean;recorded:false;preview_sha256:string}
function bad():never{throw Error('invalid_original_skill_ab_contract')}
function id(v:unknown):string{if(typeof v!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v))bad();return v}
function hash(v:unknown):string{if(typeof v!=='string'||!/^[a-f0-9]{64}$/.test(v))bad();return v}
function integer(v:unknown,max=Number.MAX_SAFE_INTEGER):number{if(typeof v!=='number'||!Number.isSafeInteger(v)||v<1||v>max)bad();return v}
export function originalSkillAbSelection(raw:unknown):OriginalSkillAbSelection{
 const v=roleObject(raw,['skill_ref','model_binding']),s=roleObject(v.skill_ref,['id','version','hash']),m=roleObject(v.model_binding,['connection_id','connection_revision','model_id'])
 if(typeof s.id!=='string'||!/^[A-Za-z0-9]{15}$/.test(s.id)||typeof m.model_id!=='string'||!/^[A-Za-z0-9._:/-]{1,120}$/.test(m.model_id))bad()
 return {skill_ref:{id:s.id,version:integer(s.version,100),hash:hash(s.hash)},model_binding:{connection_id:id(m.connection_id),connection_revision:integer(m.connection_revision),model_id:m.model_id}}
}
export function originalSkillAbPreview(raw:unknown,expected:{owner:string;selection:OriginalSkillAbSelection;executionAvailable?:boolean}):OriginalSkillAbPreview{
 const v=roleObject(raw,['protocol','owner_user_id','owner_epoch','skill','model_binding','scenario','input_characters','source_sha256','input_sha256','sample_count','output_token_limit','total_reported_token_stop','possible_charges','price_estimate','requires_model_fee_ack','execution_available','recorded','preview_sha256'])
 const s=roleObject(v.skill,['id','version','hash','name']),counts=roleObject(v.input_characters,['baseline','with_skill']),selection=originalSkillAbSelection({skill_ref:{id:s.id,version:s.version,hash:s.hash},model_binding:v.model_binding}),chosen=originalSkillAbSelection(expected.selection)
 if(id(v.owner_user_id)!==expected.owner||selection.skill_ref.id!==chosen.skill_ref.id||selection.skill_ref.version!==chosen.skill_ref.version||selection.skill_ref.hash!==chosen.skill_ref.hash||selection.model_binding.connection_id!==chosen.model_binding.connection_id||selection.model_binding.connection_revision!==chosen.model_binding.connection_revision||selection.model_binding.model_id!==chosen.model_binding.model_id)bad()
 if(v.protocol!=='original_skill_ab_preview_v1'||v.scenario!==SKILL_AB_SCENARIO||v.sample_count!==2||v.output_token_limit!==SKILL_AB_OUTPUT_MAX_TOKENS||v.total_reported_token_stop!==SKILL_AB_TOTAL_TOKEN_STOP||v.possible_charges!==true||v.price_estimate!==null||v.requires_model_fee_ack!==true||typeof v.execution_available!=='boolean'||expected.executionAvailable!==undefined&&v.execution_available!==expected.executionAvailable||v.recorded!==false)bad()
 const name=roleText(s.name,64,true)
 const baseline=integer(counts.baseline,SKILL_AB_MAX_INSTRUCTION),with_skill=integer(counts.with_skill,SKILL_AB_MAX_INSTRUCTION)
 if(with_skill<=baseline)bad()
 return {protocol:'original_skill_ab_preview_v1',owner_user_id:expected.owner,owner_epoch:integer(v.owner_epoch),skill:{...selection.skill_ref,name},model_binding:selection.model_binding,scenario:SKILL_AB_SCENARIO,input_characters:{baseline,with_skill},source_sha256:hash(v.source_sha256),input_sha256:hash(v.input_sha256),sample_count:2,output_token_limit:900,total_reported_token_stop:40000,possible_charges:true,price_estimate:null,requires_model_fee_ack:true,execution_available:v.execution_available,recorded:false,preview_sha256:hash(v.preview_sha256)}
}
