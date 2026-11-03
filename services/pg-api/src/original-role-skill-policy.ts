// Optional source candidate: no default registration, pool, HTTP or provider I/O.
import {randomBytes} from 'node:crypto'
import {HttpError,type SqlClient} from './contracts.ts'
import {assertOwnedAdmissionContext} from './repository.ts'
import {workflowAgentSpec} from './workflow-v2-agent-machine.ts'
import {parseOriginalRoleExtension,roleObject,roleText,type OriginalRolePin} from '../../../shared/original-role-execution-contract.mjs'
import {checkedOriginalRolePin,originalRoleHash,originalSkillHash,originalRoleCanonical} from './original-role-execution.mjs'
import {requireOriginalRoleProfile,originalRoleProfileEnabled} from './original-role-profile.ts'
import {requireOriginalRoleUi,originalRoleUiEnabled} from './original-role-ui-policy.ts'
import {originalRoleCapabilitiesOnClient} from './original-role-capabilities.ts'
function deny(code:string):never{throw new HttpError(409,code)}
const prepared=new WeakMap<object,{db:SqlClient;owner:string;transaction:string;pin:OriginalRolePin}>()
async function transaction(db:SqlClient){const value=(await db.query<{transaction_id:string}>('SELECT pg_current_xact_id()::text AS transaction_id')).rows[0]?.transaction_id;if(typeof value!=='string'||!/^\d+$/.test(value))deny('original_role_transaction_required');return value}
async function audit(db:SqlClient,owner:string,action:string,target:string,metadata:Record<string,unknown>,runId?:string){
  const result=await db.query("INSERT INTO agentstudio.audit_events(owner_user_id,actor_user_id,run_id,action,target_kind,target_id,result,metadata) VALUES($1::uuid,$1::uuid,$2::uuid,$3::text,$4::text,$5::text,'succeeded',$6::jsonb) RETURNING id",[owner,runId??null,action,runId?'agent_run':'agent_skill',target,JSON.stringify(metadata)])
  if(result.rows.length!==1)deny('original_role_audit_unconfirmed')
}
export function parseOriginalSkillSource(source:unknown){
  roleText(source,16100,true)
  const text=(source as string).replace(/\r\n?/g,'\n').trim(),lines=text.split('\n')
  if(lines[0]!=='---')deny('skill_frontmatter_missing')
  const end=lines.findIndex((l,i)=>i>0&&i<75&&l==='---')
  if(end<2)deny('skill_frontmatter_invalid')
  const meta:Record<string,string>={};let pending=''
  for(const line of lines.slice(1,end)){
    if(/^\s/.test(line)&&pending){if(line.trim())meta[pending]+=' '+line.trim();continue}
    const m=/^([a-z][a-z0-9-]*):[ \t]*(.*)$/.exec(line)
    if(!m||!['name','description'].includes(m[1]!)){pending='';continue}
    let value=m[2]!.trim();if(value==='>'||value==='|')value=''
    if(value.length>=2&&(value.startsWith('"')&&value.endsWith('"')||value.startsWith("'")&&value.endsWith("'")))value=value.slice(1,-1)
    // Duplicates are ambiguous: the review and execution must see one meaning.
    if(Object.hasOwn(meta,m[1]!))deny('skill_frontmatter_invalid')
    meta[m[1]!]=value;pending=m[1]!
  }
  const name=(meta.name??'').trim(),description=(meta.description??'').trim(),body=lines.slice(end+1).join('\n').trim()
  if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)||name.length>64)deny('skill_name_invalid')
  if(!description||description.length>1024)deny('skill_description_invalid')
  if(body.length<15||body.length>16000||body.split('\n').length>500||text.length>16000)deny('skill_instructions_invalid')
  return {name,description,content:text,hash:originalSkillHash(text),warnings:/(?:scripts\/|allowed-tools:|bash\s|pip\s+install|curl\s)/i.test(text)?['text_only_no_tool_grants']:[]}
}
export async function importOriginalSkillOnClient(db:SqlClient,owner:string,source:unknown){
  requireOriginalRoleProfile(db)
  const skill=parseOriginalSkillSource(source);await assertOwnedAdmissionContext(db,owner)
  await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1::text,0))',[owner+':original-skill:'+skill.name])
  const prior=(await db.query<{id:string;latest_version:number}>('SELECT id,latest_version FROM agentstudio_roles.original_skills WHERE owner_user_id=$1::uuid AND name=$2::text FOR UPDATE',[owner,skill.name])).rows[0]
  const version=prior?Number(prior.latest_version)+1:1
  if(!Number.isSafeInteger(version)||version<1||version>100)deny('skill_version_limit')
  const id=prior?.id??randomBytes(15).toString('hex').slice(0,15)
  if(prior)await db.query('UPDATE agentstudio_roles.original_skills SET latest_version=$3::integer,updated_at=clock_timestamp() WHERE owner_user_id=$1::uuid AND id=$2::text',[owner,id,version])
  else await db.query('INSERT INTO agentstudio_roles.original_skills(owner_user_id,id,name,latest_version) VALUES($1::uuid,$2::text,$3::text,1)',[owner,id,skill.name])
  const stored=await db.query('INSERT INTO agentstudio_roles.original_skill_versions(owner_user_id,skill_id,version,name,description,content,content_sha256) VALUES($1::uuid,$2::text,$3::integer,$4::text,$5::text,$6::text,$7::text) RETURNING skill_id',[owner,id,version,skill.name,skill.description,skill.content,skill.hash])
  if(stored.rows.length!==1)deny('skill_import_unconfirmed')
  await audit(db,owner,'agent.skill_import',id,{version,content_sha256:skill.hash})
  // No review row is created on import, including a new version of an approved Skill.
  return {id,version,hash:skill.hash,name:skill.name,description:skill.description,approved:false,warnings:skill.warnings}
}
export async function reviewOriginalSkillOnClient(db:SqlClient,owner:string,raw:unknown){
  requireOriginalRoleProfile(db)
  const r=roleObject(raw,['id','version','hash','confirm_review'])
  if(r.confirm_review!==true||typeof r.id!=='string'||!/^[A-Za-z0-9]{15}$/.test(r.id)||!Number.isSafeInteger(r.version)||Number(r.version)<1||Number(r.version)>100||typeof r.hash!=='string'||!/^[a-f0-9]{64}$/.test(r.hash))deny('skill_review_invalid')
  await assertOwnedAdmissionContext(db,owner)
  const rows=(await db.query<{content:string;content_sha256:string}>('SELECT content,content_sha256 FROM agentstudio_roles.original_skill_versions WHERE owner_user_id=$1::uuid AND skill_id=$2::text AND version=$3::integer FOR SHARE',[owner,r.id,r.version])).rows
  if(rows.length!==1||rows[0]!.content_sha256!==r.hash||originalSkillHash(rows[0]!.content)!==r.hash)deny('skill_version_unavailable')
  await db.query('INSERT INTO agentstudio_roles.original_skill_reviews(owner_user_id,skill_id,version,content_sha256,reviewed_by) VALUES($1::uuid,$2::text,$3::integer,$4::text,$1::uuid) ON CONFLICT DO NOTHING',[owner,r.id,r.version,r.hash])
  await audit(db,owner,'agent.skill_review',r.id as string,{version:r.version,content_sha256:r.hash})
  return {id:r.id,version:r.version,hash:r.hash,approved:true}
}
export async function activateOriginalSkillOnClient(db:SqlClient,owner:string,id:string,active:boolean){
  requireOriginalRoleProfile(db)
  if(!/^[A-Za-z0-9]{15}$/.test(id)||typeof active!=='boolean')deny('skill_activation_invalid')
  await assertOwnedAdmissionContext(db,owner)
  const result=await db.query('UPDATE agentstudio_roles.original_skills SET active=$3::boolean,updated_at=clock_timestamp() WHERE owner_user_id=$1::uuid AND id=$2::text RETURNING id',[owner,id,active])
  if(result.rows.length!==1)deny('skill_not_found')
  await audit(db,owner,'agent.skill_active',id,{active})
  return {id,active}
}
export async function prepareOriginalRolePinOnClient(db:SqlClient,owner:string,scope:{run_id:string;spec_id:string;spec_revision:number},options:{taskPlanning?:'reviewed_v1';localDeviceId?:string}={}){
  requireOriginalRoleProfile(db)
  await assertOwnedAdmissionContext(db,owner,scope.run_id)
  const tx=await transaction(db)
  const row=(await db.query<{revision:string|number;spec:unknown;extension:unknown;base_spec_sha256:string}>('SELECT s.revision,s.spec,e.extension,e.base_spec_sha256 FROM agentstudio.agent_specs s JOIN agentstudio_roles.original_role_extensions e ON e.spec_id=s.id AND e.owner_user_id=s.owner_user_id AND e.spec_revision=s.revision WHERE s.owner_user_id=$1::uuid AND s.id=$2::uuid FOR SHARE OF s,e',[owner,scope.spec_id])).rows
  if(row.length!==1||Number(row[0]!.revision)!==scope.spec_revision)deny('original_role_extension_unavailable')
  // The base remains the existing strict validator; extensions live in a sidecar.
  if(options.taskPlanning||options.localDeviceId)requireOriginalRoleUi(db)
  const spec=workflowAgentSpec(row[0]!.spec,originalRoleUiEnabled(db)&&!!options.localDeviceId),baseHash=originalRoleHash(spec)
  if(row[0]!.base_spec_sha256!==baseHash)deny('original_role_base_changed')
  const extension=parseOriginalRoleExtension(row[0]!.extension,spec.tools),skills:OriginalRolePin['skills']=[]
  if(extension.capability_requirements.length&&(!originalRoleUiEnabled(db)||options.taskPlanning!=='reviewed_v1'))deny('original_role_capability_requires_reviewed_plan')
  const capabilityBindings=options.taskPlanning?await originalRoleCapabilitiesOnClient(db,owner,spec,extension,options.localDeviceId):undefined
  await recordOriginalRoleSpecSnapshot(db,owner,scope.spec_id,scope.spec_revision,spec)
  for(const role of extension.roles)for(const ref of role.skill_refs){
    const rows=(await db.query<{name:string;description:string;content:string;content_sha256:string}>('SELECT v.name,v.description,v.content,v.content_sha256 FROM agentstudio_roles.original_skills s JOIN agentstudio_roles.original_skill_versions v ON v.owner_user_id=s.owner_user_id AND v.skill_id=s.id JOIN agentstudio_roles.original_skill_reviews r ON r.owner_user_id=v.owner_user_id AND r.skill_id=v.skill_id AND r.version=v.version AND r.content_sha256=v.content_sha256 WHERE s.owner_user_id=$1::uuid AND s.id=$2::text AND s.active AND v.version=$3::integer AND v.content_sha256=$4::text FOR SHARE OF s,v,r',[owner,ref.id,ref.version,ref.hash])).rows
    if(rows.length!==1||rows[0]!.content_sha256!==ref.hash||originalSkillHash(rows[0]!.content)!==ref.hash)deny('original_role_skill_unavailable')
    const s=rows[0]!;skills.push({role_id:role.id,...ref,name:s.name,description:s.description,content:s.content})
  }
  const pin=checkedOriginalRolePin({protocol:extension.protocol,owner_user_id:owner,...scope,base_spec:spec,base_spec_sha256:baseHash,extension,skills,...(options.taskPlanning?{planning_mode:options.taskPlanning,capability_bindings:capabilityBindings}:{})},spec,{owner_user_id:owner,...scope})
  const handle=Object.freeze({protocol:extension.protocol,payload_sha256:originalRoleHash(pin)})
  prepared.set(handle,{db,owner,transaction:tx,pin});return handle
}
export async function insertPreparedOriginalRolePinOnClient(db:SqlClient,owner:string,handle:object){
  const value=prepared.get(handle);if(!value||value.db!==db||value.owner!==owner)deny('original_role_prepared_handle_required')
  await assertOwnedAdmissionContext(db,owner,value.pin.run_id)
  if(await transaction(db)!==value.transaction){prepared.delete(handle);deny('original_role_transaction_changed')}
  prepared.delete(handle)
  // Insert only after the actual run row, in its creating admitOwned transaction.
  const result=await db.query('INSERT INTO agentstudio_roles.original_role_run_pins(owner_user_id,run_id,spec_id,spec_revision,payload,payload_sha256) SELECT $1::uuid,$2::uuid,$3::uuid,$4::bigint,$5::jsonb,$6::text FROM agentstudio.runs r WHERE r.id=$2::uuid AND r.owner_user_id=$1::uuid AND r.agent_spec_id=$3::uuid AND r.kind=\'agent\' AND r.status=\'queued\' AND (r.checkpoint->>\'spec_revision\')::bigint=$4::bigint RETURNING run_id',[owner,value.pin.run_id,value.pin.spec_id,value.pin.spec_revision,originalRoleCanonical(value.pin),originalRoleHash(value.pin)])
  if(result.rows.length!==1)deny('original_role_pin_unconfirmed')
  await audit(db,owner,'agent.role_pin',value.pin.run_id,{payload_sha256:originalRoleHash(value.pin),spec_revision:value.pin.spec_revision},value.pin.run_id)
  return {run_id:value.pin.run_id,payload_sha256:originalRoleHash(value.pin)}
}
// Replay reads only the admitted immutable payload, NEVER Skill latest/active/review.
export async function readOriginalRolePinOnClient(db:SqlClient,owner:string,runId:string,spec:unknown){
  requireOriginalRoleProfile(db)
  await assertOwnedAdmissionContext(db,owner,runId)
  const rows=(await db.query<{payload:OriginalRolePin;payload_sha256:string}>('SELECT payload,payload_sha256 FROM agentstudio_roles.original_role_run_pins WHERE owner_user_id=$1::uuid AND run_id=$2::uuid FOR SHARE',[owner,runId])).rows
  if(rows.length!==1)deny('original_role_pin_unavailable')
  const pin=checkedOriginalRolePin(rows[0]!.payload,spec,{owner_user_id:owner,run_id:runId,spec_id:rows[0]!.payload.spec_id,spec_revision:rows[0]!.payload.spec_revision})
  if(originalRoleHash(pin)!==rows[0]!.payload_sha256)deny('original_role_pin_changed')
  return pin
}
export async function verifyOriginalRoleReplayOnClient(db:SqlClient,owner:string,runId:string,state:{spec:unknown;spec_id:string;spec_revision:number;role_pin?:OriginalRolePin}|undefined,enabled=false){
  enabled=originalRoleProfileEnabled(db)
  if(!state?.role_pin){
    if(!enabled)return
    await assertOwnedAdmissionContext(db,owner,runId)
    // In the independently selected role profile a mutable checkpoint marker
    // cannot hide an already admitted immutable pin from the Broker.
    const rows=(await db.query('SELECT payload_sha256 FROM agentstudio_roles.original_role_run_pins WHERE owner_user_id=$1::uuid AND run_id=$2::uuid FOR SHARE',[owner,runId])).rows
    if(rows.length)deny('original_role_pin_marker_missing')
    return
  }
  if(!enabled)deny('original_role_execution_disabled')
  const pin=await readOriginalRolePinOnClient(db,owner,runId,state.spec)
  if(pin.spec_id!==state.spec_id||pin.spec_revision!==state.spec_revision||originalRoleCanonical(pin)!==originalRoleCanonical(state.role_pin))deny('original_role_pin_changed')
}

async function recordOriginalRoleSpecSnapshot(db:SqlClient,owner:string,id:string,revision:number,spec:ReturnType<typeof workflowAgentSpec>){
 const hash=originalRoleHash(spec)
 await db.query('INSERT INTO agentstudio_roles.original_role_specs(owner_user_id,spec_id,spec_revision,spec,spec_sha256) VALUES($1::uuid,$2::uuid,$3::bigint,$4::jsonb,$5::text) ON CONFLICT DO NOTHING',[owner,id,revision,originalRoleCanonical(spec),hash])
 const rows=(await db.query<{spec:unknown;spec_sha256:string}>('SELECT spec,spec_sha256 FROM agentstudio_roles.original_role_specs WHERE owner_user_id=$1::uuid AND spec_id=$2::uuid AND spec_revision=$3::bigint FOR SHARE',[owner,id,revision])).rows
 if(rows.length!==1||rows[0]!.spec_sha256!==hash||originalRoleCanonical(workflowAgentSpec(rows[0]!.spec,spec.tools.includes('local_computer')))!==originalRoleCanonical(spec))deny('original_role_spec_snapshot_conflict')
}
export async function saveOriginalRoleExtensionOnClient(db:SqlClient,owner:string,id:string,revision:number,raw:unknown){
 requireOriginalRoleProfile(db);await assertOwnedAdmissionContext(db,owner)
 const row=(await db.query<{revision:number|string;spec:unknown}>('SELECT revision,spec FROM agentstudio.agent_specs WHERE owner_user_id=$1::uuid AND id=$2::uuid FOR SHARE',[owner,id])).rows
 if(row.length!==1||Number(row[0]!.revision)!==revision)deny('original_role_base_changed')
 const spec=workflowAgentSpec(row[0]!.spec,originalRoleUiEnabled(db)),extension=parseOriginalRoleExtension(raw,spec.tools)
 if(extension.capability_requirements.length&&!originalRoleUiEnabled(db))deny('original_role_capability_mapping_not_connected')
 await recordOriginalRoleSpecSnapshot(db,owner,id,revision,spec)
 const result=await db.query('INSERT INTO agentstudio_roles.original_role_extensions(owner_user_id,spec_id,spec_revision,base_spec_sha256,extension) VALUES($1::uuid,$2::uuid,$3::bigint,$4::text,$5::jsonb) RETURNING spec_id',[owner,id,revision,originalRoleHash(spec),originalRoleCanonical(extension)])
 if(result.rows.length!==1)deny('original_role_extension_unconfirmed')
 await audit(db,owner,'agent.role_extension',id,{spec_revision:revision,extension_sha256:originalRoleHash(extension)})
 return {spec_id:id,spec_revision:revision,extension_sha256:originalRoleHash(extension)}
}
