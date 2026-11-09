import type { AgentSpec } from "../pages/Home/presets"
import { sanitizeAgentRoles } from "./agentRoles.ts"
import { normalizeCapabilityRequirements } from "./agentCapabilityPlan.ts"

/**
 * One source of truth for both the actual Agent Studio creation UI and V28
 * real-provider blind evaluation. The expected schema is the product's schema,
 * NOT an easier benchmark-only prompt.
 */
export const AGENT_DESIGN_SYSTEM_PROMPT = [
  "你是「Agent Studio」的助手方案设计器，把用户的一句自然语言需求转成结构化的助手方案。",
  "只输出一个 JSON 对象，不要 markdown 代码块，不要任何额外文字。JSON 字段如下：",
  'name：助手名称，不超过 12 个汉字',
  'goal：一句话说明这个助手帮用户解决什么问题',
  'task_scope：助手负责的任务范围与明确不负责的事，2-3 句话',
  'deliverables：字符串数组，助手最终交付的具体产物（2-5 项）',
  'tools：字符串数组，完成任务所需的通用工具能力名（如「网络搜索」「文档解析」「数据图表」），2-6 项，不写具体产品名',
  'task_plan：字符串数组，按执行顺序拆解的任务步骤（3-12 步）',
  'done_criteria：字符串数组，判断任务完成的标准（2-7 条）',
  'require_plan_review：布尔值；明确要求先由人确认草案、确认后才进入落地计划/下一阶段时为 true，否则为 false',
  'capability_requirements：数组，每项含 id/title/purpose/kind/access/required/role_ids/search_terms/suggested_tool_ids。解释为什么需要、哪个角色使用。kind 只能为 web_search/web_fetch/knowledge/calculate/text/document/browser/desktop/integration/custom；access 为 read 或 write。search_terms 只写通用能力类别，不写业务主体或机密。',
  'suggested_tool_ids 只能从用户消息所附实际工具目录中选择，找不到就留空，不得编造工具、授权或在线状态。读工具不能满足写入或网页点击任务。浏览器工具与网页正文抓取是不同能力。',
  'roles：简单任务用空数组；用户明确要求多角色或任务确有独立交接时，按需求输出 2-8 个有必要的角色阶段，不要为了凑数量增加冗余角色。每项含 id/name/responsibility/tasks/inputs/deliverables/depends_on/tools/done_criteria/skill_refs。id 英文，depends_on 只能引用已有角色且不能成环。tools 初始留空，skill_refs 也必须初始留空，待用户按角色绑定真实工具与已审核 Skill。不得虚构已安装、已审核或已授权的 Skill。此系统为单次运行的分阶段角色执行，不是并行独立 Agent。',
  '如需要外部写入、发送、删除、修改或发布，设相应 capability_requirements.access 为 write，并开启 require_approval；没有真实连接不代表具备该权限。遵守用户明确声明的禁止事项。',
  "所有内容使用简体中文，贴合用户的真实需求，不空泛。",
].join("\n")

/** Max output is raised only for genuinely large 6-8 stage requirements. */
export function agentDesignTokenBudget(requirement: string): number {
  return /(?:[6-8](?:\s*(?:个|位|阶段|角色))|六(?:个|位|阶段|角色)|七(?:个|位|阶段|角色)|八(?:个|位|阶段|角色)|eight[ -]stage|eight roles)/i.test(requirement)
    ? 9500 : 6500
}

/** Same tolerant JSON extraction used by the actual editor; no auto-permissions. */
export function parseAgentDesignResponse(raw: string): { displayName: string; spec: AgentSpec } | null {
  let text = (raw || "").trim()
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fence) text = fence[1].trim()
  const start = text.indexOf("{")
  const end = text.lastIndexOf("}")
  if (start < 0 || end <= start) return null
  try {
    const obj = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) return null
    const toStr = (v: unknown): string => (typeof v === "string" ? v : v == null ? "" : String(v))
    const toStrArr = (v: unknown): string[] =>
      Array.isArray(v) ? v.map((x) => toStr(x)).filter((x) => x.trim() !== "") : []
    return {
      displayName: toStr(obj.name).slice(0, 24) || "未命名助手",
      spec: {
        goal: toStr(obj.goal),
        task_scope: toStr(obj.task_scope),
        deliverables: toStrArr(obj.deliverables),
        tools: toStrArr(obj.tools),
        task_plan: toStrArr(obj.task_plan),
        done_criteria: toStrArr(obj.done_criteria),
        require_plan_review: obj.require_plan_review === true,
        require_approval: obj.require_approval === true,
        ...(Array.isArray(obj.roles) ? { roles: sanitizeAgentRoles(obj.roles) } : {}),
        ...(Array.isArray(obj.capability_requirements)
          ? { capability_requirements: normalizeCapabilityRequirements(obj.capability_requirements) } : {}),
      },
    }
  } catch {
    return null
  }
}
