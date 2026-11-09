import {HttpError,type SqlClient} from './contracts.ts'
import {parseOriginalRoleExtension,parseOriginalRoleUiExtension,roleObject,type OriginalRoleExtension} from '../../../shared/original-role-execution-contract.mjs'
import {requireOriginalRoleUi} from './original-role-ui-policy.ts'
import {originalRoleHash,originalRoleCanonical} from './original-role-execution.mjs'
import type {OriginalHomeAgentRow} from './native-home-agent-specs-repository.ts'
export function splitOriginalRoleHomeInput(raw:unknown){
 const input=roleObject(raw,[],['goal','task_scope','deliverables','task_plan','done_criteria','tools','knowledge_base_ids','knowledge_retrieval','model_binding','http_tools','mcp_tools','require_plan_review','roles','capability_requirements'])
 const {roles,capability_requirements,...base}=input
 return {base,hasRoles:Object.hasOwn(input,'roles'),hasCapabilities:Object.hasOwn(input,'capability_requirements'),roles,capability_requirements}
}
export async function saveOriginalRoleHomeOnClient(db:SqlClient,owner:string,row:OriginalHomeAgentRow,raw:unknown,priorRevision?:number){
 requireOriginalRoleUi(db)
 const input=splitOriginalRoleHomeInput(raw),history=priorRevision?(await db.query<{spec_revision:string|number;extension:OriginalRoleExtension}>('SELECT spec_revision,extension FROM agentstudio_roles.original_role_extensions WHERE owner_user_id=$1::uuid AND spec_id=$2::uuid FOR SHARE',[owner,row.id])).rows:[]
 const prior=history.find(e=>Number(e.spec_revision)===priorRevision)?.extension
 if(history.length&&!prior)throw new HttpError(409,'original_role_revision_metadata_missing')
 const extension=parseOriginalRoleUiExtension({roles:input.hasRoles?input.roles:prior?.roles??[],capability_requirements:input.hasCapabilities?input.capability_requirements:prior?.capability_requirements??[]},row.spec.tools)
 const spec=originalRoleCanonical(row.spec),hash=originalRoleHash(row.spec)
 await db.query('INSERT INTO agentstudio_roles.original_role_specs(owner_user_id,spec_id,spec_revision,spec,spec_sha256) VALUES($1::uuid,$2::uuid,$3::bigint,$4::jsonb,$5::text)',[owner,row.id,row.revision,spec,hash])
 await db.query('INSERT INTO agentstudio_roles.original_role_extensions(owner_user_id,spec_id,spec_revision,base_spec_sha256,extension) VALUES($1::uuid,$2::uuid,$3::bigint,$4::text,$5::jsonb)',[owner,row.id,row.revision,hash,originalRoleCanonical(extension)])
 await db.query("INSERT INTO agentstudio.audit_events(owner_user_id,actor_user_id,action,target_kind,target_id,result,metadata) VALUES($1::uuid,$1::uuid,'agent.role_extension','agent_spec',$2::text,'succeeded',$3::jsonb)",[owner,row.id,JSON.stringify({spec_revision:row.revision,extension_sha256:originalRoleHash(extension)})])
 return {...row,spec:{...row.spec,roles:extension.roles,capability_requirements:extension.capability_requirements}}
}
export async function originalRoleHomeRowsOnClient(db:SqlClient,owner:string,rows:OriginalHomeAgentRow[]){
 requireOriginalRoleUi(db);if(!rows.length)return rows
 const extensions=(await db.query<{spec_id:string;spec_revision:string|number;base_spec_sha256:string;extension:OriginalRoleExtension}>('SELECT spec_id,spec_revision,base_spec_sha256,extension FROM agentstudio_roles.original_role_extensions WHERE owner_user_id=$1::uuid AND spec_id=ANY($2::uuid[])',[owner,rows.map(r=>r.id)])).rows
 return rows.map(row=>{
  const history=extensions.filter(e=>e.spec_id===row.id),e=history.find(e=>Number(e.spec_revision)===row.revision)
  if(history.length&&!e)throw new HttpError(409,'original_role_revision_metadata_missing')
  if(e&&e.base_spec_sha256!==originalRoleHash(row.spec))throw new HttpError(409,'original_role_base_changed')
  const parsed=e?parseOriginalRoleExtension(e.extension,row.spec.tools):{roles:[],capability_requirements:[]}
  return {...row,spec:{...row.spec,roles:parsed.roles,capability_requirements:parsed.capability_requirements}}
 })
}
