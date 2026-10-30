// AgentSpec 数据类型与可复用内置模板（需求落地 / 研究 / 知识库 / 数据分析）

import type { AgentQualityCheck } from "../../lib/agentQualityChecks"
import type { AgentCapabilityRequirement } from "../../lib/agentCapabilityPlan"
import type { AgentRole } from "../../lib/agentRoles"

export type AgentSpec = {
  goal: string
  task_scope: string
  deliverables: string[]
  tools: string[]
  task_plan: string[]
  done_criteria: string[]
  /** Task-level capability requirements; suggestions do not grant tool access. */
  capability_requirements?: AgentCapabilityRequirement[]
  /** 同一 Agent 运行按依赖顺序执行的角色阶段；省略或空列表为单助手。 */
  roles?: AgentRole[]
  /** 人工定义并可机器验证的文本断言；不等同于事实准确性认证。 */
  quality_checks?: AgentQualityCheck[]
  /** 服务端仅检索当前账号拥有的知识库（最多 10 个） */
  knowledge_base_ids?: string[]
  /** 写操作审批门：开启后运行中调用外部写工具/市场插件前暂停等待用户批准（默认 false） */
  require_approval?: boolean
  /** 阶段方案确认关卡：需求草案必须经用户确认后才能继续执行落地计划。 */
  require_plan_review?: boolean
}

export type ListField = "deliverables" | "tools" | "task_plan" | "done_criteria"

export type TemplatePreset = {
  key: string
  title: string
  tagline: string
  description: string
  icon: "delivery" | "research" | "knowledge" | "data"
  defaultName: string
  spec: AgentSpec
}

// 平台已接入的工具能力清单：只有出现在这里的工具才显示「可用」，
// 其余一律显示「待连接」，绝不伪装成可用状态。
export const CONFIGURED_TOOLS: string[] = []

// 内置五件套：执行引擎真实实现，所有助手始终可用，无需接入
export const BUILTIN_TOOL_OPTIONS: { id: string; title: string; desc: string }[] = [
  { id: "calculate", title: "计算器", desc: "对算术表达式真实求值，支持 + - * / % 与括号" },
  { id: "summarize", title: "文本整理摘要", desc: "调用模型对给定文本做整理、摘要与提炼" },
  { id: "knowledge_search", title: "知识库检索", desc: "在关联知识库中检索带引用的资料片段，未关联时搜索方案文本" },
  { id: "web_fetch", title: "网页抓取", desc: "抓取指定 http(s) 网页并提取正文文本" },
  { id: "web_search", title: "网页搜索", desc: "按关键词搜索网页，返回标题、链接与摘要" },
]

// 已连接外部工具（由 useHome 登录态拉取）与内置三件套一起决定「可用」，
// 两边都命不中的工具名维持「待连接」展示。
export type ConnectedToolOption = { name: string; description: string; method?: string; status?: string; /** Owner-scoped connection ID, used only for exact setup deep links. */ id?: string }

export function toolConnectionStatus(
  toolName: string,
  connectedTools: ConnectedToolOption[] = [],
): "ready" | "pending" {
  const trimmed = toolName.trim()
  if (BUILTIN_TOOL_OPTIONS.some((tool) => tool.id === trimmed)) return "ready"
  if (CONFIGURED_TOOLS.includes(trimmed)) return "ready"
  return connectedTools.some((tool) => tool.name === trimmed &&
    // Older callers only pass names. When a caller supplies a health result,
    // an unavailable/unknown test must not be promoted to a ready connection.
    (tool.status === undefined || ["ok", "success", "connected"].includes(String(tool.status || "").toLowerCase())))
    ? "ready" : "pending"
}

export const TEMPLATE_PRESETS: TemplatePreset[] = [
  {
    key:"delivery",
    title:"需求落地规划助手",
    tagline:"先审核需求方案，再制定实施计划",
    description:"输入原始需求，形成结构化方案并由人工审核，审核通过后继续拆解任务、资源、风险与验收标准。可按需绑定自己的知识库和 MCP 工具。",
    icon:"delivery",
    defaultName:"需求落地规划助手",
    spec:{
      goal:"将用户输入的原始需求整理成规范、可审核的需求方案，得到明确批准后再提出分阶段实施计划。",
      task_scope:"负责：需求澄清、范围与非目标、业务价值、优先级、依赖、资源估算、风险、验收标准及迭代建议。可以读取用户本人已授权的知识库和工具；不自动修改代码、上传机密、发送消息或对外发布。",
      deliverables:["待人工确认的结构化需求方案","分阶段实施计划及责任人建议","包含验收标准和风险的交付清单"],
      tools:["knowledge_search","calculate"],
      task_plan:[
        "理解需求并识别范围、前提与待确认问题",
        "如已绑定知识库，则检索术语规范并标注出处",
        "识别资源依赖、估算与主要风险",
        "提交结构化需求方案，由业务负责人明确批准或提出修改",
        "批准后生成具体实施步骤、责任人建议及里程碑",
        "给出可核查的验收清单，并根据结果反馈形成改进建议",
      ],
      done_criteria:[
        "需求草案说明目标、边界、非目标和依赖条件",
        "方案经明确人工确认后才生成正式实施计划",
        "交付计划包含里程碑、责任人建议、风险和可验证验收标准",
        "使用知识库或外部插件时须有授权和真实来源，不得编造证据",
      ],
      require_plan_review:true,
      require_approval:true,
    },
  },

  {
    key: "research",
    title: "研究助手",
    tagline: "查资料、核来源、写报告",
    description: "围绕一个主题自动搜集资料、交叉核对来源，最终产出一份带引用的结构化研究报告。",
    icon: "research",
    defaultName: "研究助手",
    spec: {
      goal: "帮用户围绕指定主题查资料、整理观点，并输出一份结构化研究报告。",
      task_scope:
        "负责任务：拆解研究主题、检索网络资料、交叉核对来源、撰写研究报告。不负责：需要专业资质的判断，以及代替用户对外发布内容。",
      deliverables: ["研究提纲", "资料清单与来源链接", "带结论与引用的研究报告"],
      tools: ["网络搜索", "网页内容提取", "长文写作", "文档导出"],
      task_plan: [
        "明确研究主题与关键问题",
        "检索并收集相关资料",
        "交叉比对来源，核实关键事实",
        "提炼观点并列出报告提纲",
        "撰写报告正文",
        "标注引用来源并交付",
      ],
      done_criteria: [
        "报告覆盖用户提出的全部关键问题",
        "关键结论至少有两个独立来源支撑",
        "交付物包含完整的引用清单",
      ],
    },
  },
  {
    key: "knowledge",
    title: "知识库问答助手",
    tagline: "基于你的资料回答问题",
    description: "解析用户上传的文档建立知识库，回答问题时附带资料来源，资料没覆盖的会如实说明。",
    icon: "knowledge",
    defaultName: "知识库问答助手",
    spec: {
      goal: "基于用户上传的资料回答问题，每个答案都能追溯到资料来源。",
      task_scope:
        "负责任务：解析文档、建立知识索引、依据资料作答与追问补充。边界：只在资料范围内回答，资料没有依据时明确说明，不编造内容。",
      deliverables: ["带来源出处的问答回复", "未覆盖问题清单", "资料要点摘要"],
      tools: ["文档解析", "知识库检索", "多轮对话"],
      task_plan: [
        "解析上传资料并建立索引",
        "理解用户问题的真实意图",
        "检索相关资料片段",
        "生成附带来源的回答",
        "信息不足时向用户追问补充",
      ],
      done_criteria: [
        "每个回答都标注资料来源",
        "资料未覆盖的问题被明确提示",
        "用户可以就同一话题连续追问",
      ],
    },
  },
  {
    key: "data",
    title: "数据分析助手",
    tagline: "读数据、出图表、给建议",
    description: "读取业务表格数据，完成清洗与统计分析，产出图表和一份带可行建议的解读报告。",
    icon: "data",
    defaultName: "数据分析助手",
    spec: {
      goal: "帮用户读懂业务数据，产出图表分析和可执行结论。",
      task_scope:
        "负责任务：数据清洗、统计分析、图表生成、解读撰写。不负责：修改源数据，以及代替用户做投资或医疗类决策。",
      deliverables: ["数据清洗结果表", "分析图表", "带建议的数据解读报告"],
      tools: ["表格解析", "统计计算", "数据图表", "报告撰写"],
      task_plan: [
        "接收数据并检查完整性",
        "清洗与标准化字段",
        "确认分析目标与指标口径",
        "统计计算并生成图表",
        "解读趋势与异常点",
        "输出结论与可行建议",
      ],
      done_criteria: [
        "图表与数据口径一致",
        "结论能追溯到具体指标",
        "报告包含至少一条可执行建议",
      ],
    },
  },
]
