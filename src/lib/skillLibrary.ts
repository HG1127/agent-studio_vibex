import {getPocketBaseUrl} from "@/lib/pb"
import {vibexAuthHeaders,getStudioAccountInfo,verifyStudioSession} from "@/lib/studioAuth"
import {createOriginalRoleApi} from './originalRoleApi.ts'
import {readOriginalRoleGithub} from './originalRoleGithub.ts'
const nativeMode=import.meta.env.VITE_AGENT_STUDIO_ORIGINAL_PG_UI_ENABLED==='true'
const nativeRoles=import.meta.env.VITE_AGENT_STUDIO_ORIGINAL_ROLES_UI_ENABLED==='true'
let nativeClient:ReturnType<typeof createOriginalRoleApi>|null=null,nativeOwner=''
async function nativeSkills(expectedEmployee?:string){
 if(!nativeRoles)throw Error('原 Skills 的 Native 合同尚未启用。')
 const status=await verifyStudioSession(),employee=getStudioAccountInfo()
 if(status!=='authenticated'||!employee?.active){nativeClient=null;nativeOwner='';throw Error('当前员工身份尚未核实，已隐藏 Skills。')}
 if(expectedEmployee!==undefined&&employee.id!==expectedEmployee)throw Error('员工身份已变化，请重新打开 Skills。')
 if(!nativeClient||nativeOwner!==employee.id){nativeOwner=employee.id;nativeClient=createOriginalRoleApi({employeeId:employee.id,currentEmployee:()=>getStudioAccountInfo()?.id??''})}
 return nativeClient
}
/** Same accepted page API; Native mode has no PocketBase fallback. */
async function nativeSkillRoute(route:string,data?:unknown,expectedEmployee?:string):Promise<unknown>{
 const api=await nativeSkills(expectedEmployee)
 if(data===undefined){if(route==='')return {items:await api.list()};if(route==='/meta')return api.meta();const match=/^\/detail\?id=([A-Za-z0-9]{15})&version=([1-9][0-9]{0,2})$/.exec(route);if(match)return api.detail(match[1]!,Number(match[2]));throw Error('original_role_route_invalid')}
 if(!data||typeof data!=='object'||Array.isArray(data))throw Error('original_role_data_invalid')
 const v=data as Record<string,unknown>
 if(route==='/import'){
  if(Object.keys(v).length===1&&typeof v.github_url==='string'){const source=await readOriginalRoleGithub(v.github_url);return api.import(source.source,source.source_url)}
  if(Object.keys(v).length===1&&typeof v.source==='string')return api.import(v.source)
 }else if(route==='/approve'&&Object.keys(v).sort().join(',')==='confirm_review,hash,id,version'&&v.confirm_review===true&&typeof v.id==='string'&&typeof v.version==='number'&&typeof v.hash==='string')return api.approve(v.id,v.version,v.hash)
 else if(route==='/active'&&Object.keys(v).sort().join(',')==='active,id'&&typeof v.id==='string'&&typeof v.active==='boolean')return api.active(v.id,v.active)
 throw Error('original_role_data_invalid')
}
export type SkillRef = {id:string;version:number;hash:string}
export type SkillSummary = {
  id:string;name:string;description:string;source_url:string
  active:boolean;latest_version:number;approved_version:number
  approved_hash:string;updated_ms:number
}
export type SkillDetail = {
  id:string;name:string;description:string;version:number;hash:string
  approved:boolean;active:boolean;content:string;source_url:string
}
type ApiError = Error & {code?:string}
const ERRORS:Record<string,string>={
  skill_frontmatter_missing:"SKILL.md 需要以 --- YAML 信息块开头",
  skill_frontmatter_invalid:"SKILL.md 的 YAML 信息块格式有误",
  skill_name_invalid:"Skill 名称只能包含小写字母、数字和连字符",
  skill_description_invalid:"Skill 的 description 必须填写并在 1024 字以内",
  skill_instructions_invalid:"Skill 正文需要 15 至 16000 字符的有效指令",
  skill_size_invalid:"Skill 文件超过安全大小限制",
  skill_source_url_invalid:"请填写公开 GitHub 的 SKILL.md 链接；目前只支持 GitHub Raw 或文件页链接",
  skill_github_fetch_failed:"GitHub Skill 下载失败，可直接粘贴 SKILL.md 正文导入",
  skill_count_limit:"每位员工最多保存 50 个 Skills",
  skill_reference_unavailable:"Skill 已撤销、尚未审核或版本不匹配",
  skill_review_confirmation_required:"请先查看内容并明确确认完成审核",
  skill_request_failed:"Skill 服务暂时不可用，请稍后重试",
  original_role_outcome_unknown:"提交结果尚未确认。保留原内容，再次操作只会核对原回执。",
  original_role_confirmation_pending:"原请求仍待确认，未重复提交；请稍后核对。",
  original_role_response_invalid:"返回内容未能核实，原请求仍保留，未重复提交。",
  original_role_receipt_mismatch:"返回回执与原请求不符，尚未确认提交结果。",
  original_role_pending_storage_unavailable:"当前标签无法保留请求定位，尚未提交；请恢复浏览器存储后重试。",
  original_role_ui_profile_required:"当前实例尚未启用原角色与 Skills 的后台合同。",
  employee_session_changed:"员工身份已变化，请重新打开 Skills。",
}
export function skillErrorMessage(code:string):string {
  return ERRORS[code] || "Skill 操作失败；请核对权限、内容或网络状态"
}
export async function skillApi<T=unknown>(route:string, data?:unknown,expectedEmployee?:string):Promise<T> {
  if(nativeMode)try{return await nativeSkillRoute(route,data,expectedEmployee) as T}catch(cause){if(cause&&typeof cause==='object'&&'code'in cause&&typeof cause.code==='string'){const error=new Error(skillErrorMessage(cause.code)) as ApiError;error.code=cause.code;throw error}throw cause}
  const res=await fetch(getPocketBaseUrl()+"/api/skills"+route,{
    method:data===undefined?"GET":"POST",credentials:"include",
    headers:{"Content-Type":"application/json",...vibexAuthHeaders()},
    ...(data===undefined?{}:{body:JSON.stringify(data)}),
  })
  const payload=await res.json().catch(()=>({})) as {error?:string}&T
  if(!res.ok){
    const err=new Error(skillErrorMessage(payload.error||"skill_request_failed")) as ApiError
    err.code=payload.error
    throw err
  }
  return payload
}
export async function loadSkillSummaries(expectedEmployee?:string):Promise<SkillSummary[]> {
  const response=await skillApi<{items:SkillSummary[]}>("",undefined,expectedEmployee)
  if(!Array.isArray(response.items))throw Error("Skill 列表返回格式有误")
  return response.items
}
export function skillBindingOf(skill:SkillSummary):SkillRef|null {
  if(!skill.active||!skill.approved_version||!/^[a-f0-9]{64}$/.test(skill.approved_hash))return null
  return {id:skill.id,version:skill.approved_version,hash:skill.approved_hash}
}
