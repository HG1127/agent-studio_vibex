import {getPocketBaseUrl} from "@/lib/pb"
import {vibexAuthHeaders} from "@/lib/studioAuth"
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
}
export function skillErrorMessage(code:string):string {
  return ERRORS[code] || "Skill 操作失败；请核对权限、内容或网络状态"
}
export async function skillApi<T=unknown>(route:string, data?:unknown):Promise<T> {
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
export async function loadSkillSummaries():Promise<SkillSummary[]> {
  const response=await skillApi<{items:SkillSummary[]}>("")
  if(!Array.isArray(response.items))throw Error("Skill 列表返回格式有误")
  return response.items
}
export function skillBindingOf(skill:SkillSummary):SkillRef|null {
  if(!skill.active||!skill.approved_version||!/^[a-f0-9]{64}$/.test(skill.approved_hash))return null
  return {id:skill.id,version:skill.approved_version,hash:skill.approved_hash}
}
