import type {AgentRole} from "./agentRoles.ts"
import type {SkillDetail,SkillRef} from "./skillLibrary.ts"

/** Client preflight is UX only: agent-runs/start must always recheck owner,
 * approval, version and SHA before any model or tool request.
 */
export type RoleSkillBinding={roleName:string;ref:SkillRef}
export function collectRoleSkills(roles:AgentRole[]|undefined):RoleSkillBinding[]{
  if(!Array.isArray(roles))return []
  return roles.flatMap(role=>(Array.isArray(role?.skill_refs)?role.skill_refs:[])
    .map(ref=>({roleName:String(role?.name||"未命名角色"),ref})))
}
export async function verifyRoleSkillBindings(
  bindings:readonly RoleSkillBinding[],
  read:(ref:SkillRef)=>Promise<SkillDetail>,
):Promise<string[]>{
  const checks=await Promise.all(bindings.map(async binding=>{
    const {ref,roleName}=binding
    if(!ref || !/^[A-Za-z0-9]{15}$/.test(String(ref.id||""))||
        !Number.isSafeInteger(ref.version)||ref.version<1||ref.version>100||
        !/^[0-9a-f]{64}$/.test(String(ref.hash||"")))
      return "角色「"+roleName+"」的 Skill 引用无效"
    try{
      const detail=await read(ref)
      if(!detail || detail.id!==ref.id || detail.version!==ref.version||
          detail.hash!==ref.hash||!detail.approved||!detail.active)
        return "角色「"+roleName+"」的 Skill 版本未审核、已停用或已变化，请重新绑定"
      return ""
    }catch{
      return "角色「"+roleName+"」的 Skill 状态无法核验，请检查连接或刷新"
    }
  }))
  return [...new Set(checks.filter(Boolean))]
}
