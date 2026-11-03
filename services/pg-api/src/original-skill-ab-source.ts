import {HttpError,type SqlClient} from './contracts.ts'
import {assertOwnedAdmissionContext} from './repository.ts'
import {requireOriginalRoleUi} from './original-role-ui-policy.ts'
import {originalRoleHash,originalSkillHash} from './original-role-execution.mjs'
import {parseOriginalSkillSource} from './original-role-skill-policy.ts'
import {exactProviderEndpoint} from './model-connection-probe.ts'
import {originalSkillAbSelection,originalSkillAbPreview} from '../../../shared/original-skill-ab-contract.ts'
import {skillAbMessages,SKILL_AB_SCENARIO} from '../../../shared/skill-ab-compare.ts'
function deny(code:string):never{throw new HttpError(409,code)}
function version(v:unknown):number{const n=typeof v==='string'&&/^[1-9][0-9]*$/.test(v)?Number(v):v;if(typeof n!=='number'||!Number.isSafeInteger(n)||n<1)deny('original_skill_ab_source_unavailable');return n}
/** Reads only real owned rows. No execution, credential read, reservation,
 * provider transport or manufactured approval is reachable from this module. */
export async function originalSkillAbMaterialOnClient(db:SqlClient,owner:string,raw:unknown){
 requireOriginalRoleUi(db);const selection=originalSkillAbSelection(raw)
 await assertOwnedAdmissionContext(db,owner)
 const epoch=version((await db.query<{epoch:string|number|null}>('SELECT agentstudio.agent_memory_outcome_epoch() AS epoch')).rows[0]?.epoch)
 const ref=selection.skill_ref,rows=(await db.query<{owner_user_id:string;id:string;version:string|number;name:string;description:string;content:string;content_sha256:string}>(
  'SELECT s.owner_user_id,s.id,v.version,v.name,v.description,v.content,v.content_sha256 FROM agentstudio_roles.original_skills s JOIN agentstudio_roles.original_skill_versions v ON v.owner_user_id=s.owner_user_id AND v.skill_id=s.id JOIN agentstudio_roles.original_skill_reviews r ON r.owner_user_id=v.owner_user_id AND r.skill_id=v.skill_id AND r.version=v.version AND r.content_sha256=v.content_sha256 WHERE s.owner_user_id=$1::uuid AND s.id=$2::text AND s.active AND v.version=$3::integer AND v.content_sha256=$4::text FOR SHARE OF s,v,r',[owner,ref.id,ref.version,ref.hash])).rows
 if(rows.length!==1)deny('original_skill_ab_skill_unavailable')
 const skill=rows[0]!
 if(skill.owner_user_id!==owner||skill.id!==ref.id||version(skill.version)!==ref.version||skill.content_sha256!==ref.hash||originalSkillHash(skill.content)!==ref.hash)deny('original_skill_ab_skill_unavailable')
 const parsed=parseOriginalSkillSource(skill.content)
 if(parsed.hash!==ref.hash||parsed.name!==skill.name||parsed.description!==skill.description)deny('original_skill_ab_skill_unavailable')
 const binding=selection.model_binding,models=(await db.query<{owner_user_id:string;revision:string|number;enabled:boolean;status:string;provider:'openai'|'anthropic'|'gemini';base_url:string;models:unknown}>(
  'SELECT owner_user_id,revision,enabled,status,provider,base_url,models FROM agentstudio.model_connections WHERE id=$1::uuid AND owner_user_id=$2::uuid FOR SHARE',[binding.connection_id,owner])).rows
 const model=models[0]
 if(models.length!==1||!model||model.owner_user_id!==owner||version(model.revision)!==binding.connection_revision||model.enabled!==true||model.status!=='ok'||!Array.isArray(model.models)||model.models.some(v=>typeof v!=='string')||!model.models.includes(binding.model_id))deny('original_skill_ab_model_unavailable')
 try{exactProviderEndpoint(model)}catch{deny('original_skill_ab_model_unavailable')}
 const messages={baseline:skillAbMessages('baseline',skill.content),with_skill:skillAbMessages('with_skill',skill.content)}
 const source_sha256=originalRoleHash({protocol:'original_skill_ab_source_v1',owner_user_id:owner,owner_epoch:epoch,selection,model:{provider:model.provider,base_url:model.base_url},skill_name:parsed.name,skill_description:parsed.description})
 const input_sha256=originalRoleHash({protocol:'original_skill_ab_input_v1',source_sha256,messages,sample_count:2,output_token_limit:900,total_reported_token_stop:40000})
 const core={protocol:'original_skill_ab_preview_v1',owner_user_id:owner,owner_epoch:epoch,skill:{...ref,name:parsed.name},model_binding:binding,scenario:SKILL_AB_SCENARIO,input_characters:{baseline:messages.baseline[1]!.content.length,with_skill:messages.with_skill[1]!.content.length},source_sha256,input_sha256,sample_count:2,output_token_limit:900,total_reported_token_stop:40000,possible_charges:true,price_estimate:null,requires_model_fee_ack:true,execution_available:false,recorded:false}
 const preview=originalSkillAbPreview({...core,preview_sha256:originalRoleHash(core)},{owner,selection,executionAvailable:false})
 return {preview,messages,provider:model.provider,base_url:model.base_url}
}
export async function prepareOriginalSkillAbOnClient(db:SqlClient,owner:string,raw:unknown){return (await originalSkillAbMaterialOnClient(db,owner,raw)).preview}
