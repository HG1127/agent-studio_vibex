// Independent optional contract. Never relax the frozen base Agent validator.
import {parseLocalTransportJson} from './native-local-device-contract.mjs'
export const ORIGINAL_ROLE_PROTOCOL='original_roles_pinned_v1'
export function roleContractError(){const error=new Error('invalid_original_role_contract');error.code='invalid_original_role_contract';throw error}
const bad=roleContractError
export function roleObject(raw,keys,optional=[]){
  if(!raw||typeof raw!=='object'||Array.isArray(raw)||![null,Object.prototype].includes(Object.getPrototypeOf(raw)))bad()
  const own=Reflect.ownKeys(raw)
  if(own.some(k=>typeof k!=='string'||!keys.includes(k)&&!optional.includes(k))||keys.some(k=>!own.includes(k)))bad()
  for(const key of own){const d=Object.getOwnPropertyDescriptor(raw,key);if(!d?.enumerable||!Object.hasOwn(d,'value'))bad()}
  return raw
}
export function roleText(raw,max,nonempty=false){if(typeof raw!=='string'||raw.length>max||raw.includes('\0')||/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:^|[^\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(raw)||nonempty&&!raw.trim())bad();return raw}
const list=(raw,max,length)=>{const items=dataArray(raw,max).map(v=>roleText(v,length,true));if(new Set(items).size!==items.length)bad();return items}
const uuid=raw=>{if(typeof raw!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(raw))bad();return raw}
const integer=(v,max=Number.MAX_SAFE_INTEGER)=>{if(!Number.isSafeInteger(v)||v<1||v>max)bad();return v}
const dataArray=(raw,max)=>{
 if(!Array.isArray(raw)||Object.getPrototypeOf(raw)!==Array.prototype||raw.length>max||Reflect.ownKeys(raw).length!==raw.length+1)bad()
 const values=[]
 for(let i=0;i<raw.length;i++){const d=Object.getOwnPropertyDescriptor(raw,String(i));if(!d?.enumerable||!Object.hasOwn(d,'value'))bad();values.push(d.value)}
 return values
}
/** UI roles may omit an empty Skill list; every persisted/pinned role has one. */
export function parseOriginalRoleUiExtension(raw,grants){
 const v=roleObject(raw,['roles','capability_requirements'])
 const roles=dataArray(v.roles,8).map(role=>{const r=roleObject(role,['id','name','responsibility','tasks','inputs','deliverables','depends_on','tools','done_criteria'],['skill_refs']);return {...r,skill_refs:Object.hasOwn(r,'skill_refs')?r.skill_refs:[]}})
 return parseOriginalRoleExtension({protocol:ORIGINAL_ROLE_PROTOCOL,roles,capability_requirements:v.capability_requirements},grants)
}
export function roleSha(raw){if(typeof raw!=='string'||!/^[a-f0-9]{64}$/.test(raw))bad();return raw}
export function roleSkillRef(raw){const v=roleObject(raw,['id','version','hash']);if(typeof v.id!=='string'||!/^[A-Za-z0-9]{15}$/.test(v.id))bad();return {id:v.id,version:integer(v.version,100),hash:roleSha(v.hash)}}
export function parseOriginalRoleExtension(raw,grants){
  const v=roleObject(raw,['protocol','roles','capability_requirements'])
  if(v.protocol!==ORIGINAL_ROLE_PROTOCOL||!Array.isArray(grants)||new Set(grants).size!==grants.length||!Array.isArray(v.roles)||v.roles.length>8||!Array.isArray(v.capability_requirements)||v.capability_requirements.length>20)bad()
  const roles=dataArray(v.roles,8).map(rawRole=>{
    const r=roleObject(rawRole,['id','name','responsibility','tasks','inputs','deliverables','depends_on','tools','done_criteria','skill_refs'])
    if(typeof r.id!=='string'||!/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(r.id)||!Array.isArray(r.skill_refs)||r.skill_refs.length>2)bad()
    const refs=dataArray(r.skill_refs,2).map(roleSkillRef);if(new Set(refs.map(s=>s.id)).size!==refs.length)bad()
    const result={id:r.id,name:roleText(r.name,100,true),responsibility:roleText(r.responsibility,2000,true),tasks:list(r.tasks,32,1600),inputs:list(r.inputs,32,1600),deliverables:list(r.deliverables,32,1600),depends_on:list(r.depends_on,32,64),tools:list(r.tools,32,220),done_criteria:list(r.done_criteria,32,1600),skill_refs:refs}
    if(!result.tasks.length||!result.deliverables.length||!result.done_criteria.length||result.tools.some(t=>!grants.includes(t)))bad()
    return result
  })
  const ids=new Set(roles.map(r=>r.id));if(ids.size!==roles.length||roles.some(r=>r.depends_on.some(d=>d===r.id||!ids.has(d))))bad()
  const ordered=[],seen=new Set()
  while(ordered.length<roles.length){let moved=false;for(const r of roles)if(!seen.has(r.id)&&r.depends_on.every(id=>seen.has(id))){ordered.push(r);seen.add(r.id);moved=true}if(!moved)bad()}
  const kinds=['web_search','web_fetch','knowledge','calculate','text','document','browser','desktop','integration','custom']
  const capabilities=dataArray(v.capability_requirements,20).map(rawCap=>{
    const c=roleObject(rawCap,['id','title','purpose','kind','access','required','role_ids','search_terms','suggested_tool_ids'])
    if(typeof c.id!=='string'||!/^[A-Za-z0-9_-]{1,60}$/.test(c.id)||!kinds.includes(c.kind)||!['read','write'].includes(c.access)||typeof c.required!=='boolean')bad()
    const result={id:c.id,title:roleText(c.title,100,true),purpose:roleText(c.purpose,600),kind:c.kind,access:c.access,required:c.required,role_ids:list(c.role_ids,12,64),search_terms:list(c.search_terms,4,180),suggested_tool_ids:list(c.suggested_tool_ids,8,220)}
    if(result.role_ids.some(id=>!ids.has(id)))bad()
    return result
  })
  if(new Set(capabilities.map(c=>c.id)).size!==capabilities.length)bad()
  // Suggestions and capability labels never become execution grants.
  return {protocol:ORIGINAL_ROLE_PROTOCOL,roles:ordered,capability_requirements:capabilities}
}
export function parseOriginalRolePin(raw,grants,scope){
  const v=roleObject(raw,['protocol','owner_user_id','run_id','spec_id','spec_revision','base_spec','base_spec_sha256','extension','skills'],['planning_mode','capability_bindings'])
  if(v.protocol!==ORIGINAL_ROLE_PROTOCOL)bad()
  const identity={owner_user_id:uuid(v.owner_user_id),run_id:uuid(v.run_id),spec_id:uuid(v.spec_id),spec_revision:integer(v.spec_revision)}
  if(scope&&Object.keys(identity).some(k=>identity[k]!==scope[k]))bad()
  if(v.planning_mode!==undefined&&v.planning_mode!=='reviewed_v1')bad()
  const extension=parseOriginalRoleExtension(v.extension,grants),expected=extension.roles.flatMap(r=>r.skill_refs.map(ref=>({role_id:r.id,...ref})))
  if(!Array.isArray(v.skills)||v.skills.length!==expected.length)bad()
  let total=0
  const skills=v.skills.map((rawSkill,i)=>{
    const s=roleObject(rawSkill,['role_id','id','version','hash','name','description','content']),ref=expected[i]
    if(['role_id','id','version','hash'].some(k=>s[k]!==ref[k]))bad()
    const content=roleText(s.content,16000,true);total+=content.length
    if(total>100000)bad()
    return {...ref,name:roleText(s.name,64,true),description:roleText(s.description,1024,true),content}
  })
  return {protocol:ORIGINAL_ROLE_PROTOCOL,...identity,base_spec:v.base_spec,base_spec_sha256:roleSha(v.base_spec_sha256),extension,skills,...(v.planning_mode?{planning_mode:v.planning_mode}:{}),...(v.capability_bindings!==undefined?{capability_bindings:parseRoleCapabilityBindings(v.capability_bindings,extension,grants)}:{})}
}
export function parseRoleCapabilityBindings(raw,extension,grants){
 if(!Array.isArray(raw)||raw.length>160)bad()
 const seen=new Set()
 return dataArray(raw,160).map(item=>{const v=roleObject(item,['capability_id','role_id','tool','signature','local_tools']),key=v.capability_id+':'+v.role_id+':'+v.tool,need=extension.capability_requirements.find(c=>c.id===v.capability_id)
  if(seen.has(key)||!need||!(need.role_ids.length?need.role_ids:['']).includes(v.role_id)||!grants.includes(v.tool)||v.role_id!==''&&!extension.roles.some(r=>r.id===v.role_id&&r.tools.includes(v.tool)))bad()
  seen.add(key);return {capability_id:roleText(v.capability_id,60,true),role_id:roleText(v.role_id,64),tool:roleText(v.tool,220,true),signature:roleSha(v.signature),local_tools:list(v.local_tools,16,120)}
 })
}
// Stage completion is deliberately strict JSON. Plain text must not mean success.
export function parseOriginalRoleDecision(raw){
  let v;try{v=parseLocalTransportJson(roleText(raw,12000,true),48000)}catch{bad()}
  if(v?.action==='role_complete'){roleObject(v,['action','role_id','role_output']);return {action:v.action,role_id:roleText(v.role_id,64,true),role_output:roleText(v.role_output,12000,true)}}
  if(v?.action==='answer'){roleObject(v,['action','answer']);return {action:'answer',answer:roleText(v.answer,12000,true)}}
  if(v?.action==='ask_user'){roleObject(v,['action','question']);return {action:v.action,question:roleText(v.question,8000,true)}}
  if(v?.action==='tool'){roleObject(v,['action','tool','params']);roleObject(v.params,[],Object.keys(v.params??{}));return {action:v.action,tool:roleText(v.tool,80,true),params:v.params}}
  bad()
}
