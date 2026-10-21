import type { AgentSpec, ConnectedToolOption } from "../pages/Home/presets"
import type { ToolResolution } from "./agentToolMatcher"
import type { VerifiedMarketTool } from "./marketToolSelection"
import { safeMarketplaceQuery } from "./toolSearchPrivacy.ts"

export type CapabilityKind = "web_search" | "web_fetch" | "knowledge" | "calculate" |
  "text" | "document" | "browser" | "desktop" | "integration" | "custom"
export type AgentCapabilityRequirement = {
  id: string
  title: string
  purpose: string
  kind: CapabilityKind
  access: "read" | "write"
  required: boolean
  role_ids: string[]
  search_terms: string[]
  /** A model's catalog suggestions are evidence for a choice, never authorization. */
  suggested_tool_ids: string[]
}
export type CapabilityCandidate = {
  id: string
  label: string
  source: "builtin" | "http" | "market"
  tested: boolean
  selected: boolean
  readOnly: boolean
  description?: string
  /** A real, compatible connection that still needs an explicit capability mapping. */
  needsMapping?: boolean
}
export type CapabilityPlanRow = AgentCapabilityRequirement & {
  candidates: CapabilityCandidate[]
  state: "selected" | "available" | "needs_test" | "missing"
  searchTerm: string
  roleNames: string[]
}

const KINDS: CapabilityKind[] = ["web_search", "web_fetch", "knowledge", "calculate",
  "text", "document", "browser", "desktop", "integration", "custom"]
const string = (value: unknown, limit = 300): string =>
  typeof value === "string" ? value.trim().slice(0, limit) : ""
const strings = (value: unknown, limit = 12): string[] => Array.isArray(value)
  ? [...new Set(value.slice(0, limit).map(item => string(item, 180)).filter(Boolean))] : []

/** Bounded allowlist, also used by tab recovery. Unknown prompt fields are discarded. */
export function normalizeCapabilityRequirements(value: unknown): AgentCapabilityRequirement[] {
  if (!Array.isArray(value)) return []
  const ids = new Set<string>()
  return value.slice(0, 20).flatMap((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return []
    const raw = item as Record<string, unknown>
    const title = string(raw.title, 100)
    if (!title) return []
    const proposedId = string(raw.id, 60)
    const id = /^[a-zA-Z0-9_-]{1,60}$/.test(proposedId) ? proposedId : `capability_${index + 1}`
    if (ids.has(id)) return []
    ids.add(id)
    return [{
      id, title, purpose: string(raw.purpose, 600),
      kind: KINDS.includes(raw.kind as CapabilityKind) ? raw.kind as CapabilityKind : "custom",
      access: raw.access === "write" ? "write" as const : "read" as const,
      required: raw.required !== false,
      role_ids: strings(raw.role_ids, 12),
      search_terms: strings(raw.search_terms, 4).map(safeMarketplaceQuery).filter(Boolean),
      suggested_tool_ids: strings(raw.suggested_tool_ids, 8),
    }]
  })
}

const BUILTINS: Record<string, { title: string; kind: CapabilityKind }> = {
  web_search: {title: "检索公开资料", kind: "web_search"},
  web_fetch: {title: "读取网页正文", kind: "web_fetch"},
  knowledge_search: {title: "检索授权知识库", kind: "knowledge"},
  calculate: {title: "数值计算", kind: "calculate"},
  summarize: {title: "整理与总结文本", kind: "text"},
}
const fold = (text: string) => text.normalize("NFKC").toLowerCase().replace(/[\s_.:、—\-]+/g, "")
const deny = (text: string, topic: RegExp) => text.split(/[。；;\n]/).some(part =>
  /(?:不需要|无需|禁止|不要|不能|不使用|无须|不允许)/.test(part) && topic.test(part))

export function inferCapabilityKind(title: string): CapabilityKind {
  if (/(?:browser|playwright|puppeteer|浏览器|点击网页|填写表单)/i.test(title)) return "browser"
  if (/(?:desktop|computer.?use|本地软件|电脑软件|桌面软件|操作电脑)/i.test(title)) return "desktop"
  if (/(?:网络搜索|网页搜索|web.?search|公开资料)/i.test(title)) return "web_search"
  if (/(?:网页正文|web.?fetch|网页抓取|网页内容提取)/i.test(title)) return "web_fetch"
  if (/(?:knowledge.?search|知识库|内部资料)/i.test(title)) return "knowledge"
  if (/(?:calculate|计算器|数值计算)/i.test(title)) return "calculate"
  if (/(?:summarize|摘要|长文写作|多轮对话|文本整理)/i.test(title)) return "text"
  if (/(?:pdf|excel|xlsx|word|文档|文件|电子表格)/i.test(title)) return "document"
  return "custom"
}

/** Old saved Agents remain usable; new structured needs come from the design model. */
export function agentCapabilityRequirements(spec: AgentSpec, resolution?: ToolResolution | null): AgentCapabilityRequirement[] {
  const defined = normalizeCapabilityRequirements(spec.capability_requirements)
  const needs = [...defined]
  const add = (title: string, kind: CapabilityKind, tools: string[] = [], purpose = "由当前方案中的任务和工具整理", access: "read"|"write" = writing.test(title)?"write":"read") => {
    if (needs.some(need => fold(need.title) === fold(title) ||
      tools.some(id => need.suggested_tool_ids.includes(id)) ||
      (kind !== "custom" && kind !== "integration" && need.kind === kind))) return
    needs.push({id: `inferred_${needs.length + 1}`, title, kind, purpose, access, required: true,
      role_ids: [], search_terms: [safeMarketplaceQuery(title)].filter(Boolean), suggested_tool_ids: tools})
  }
  if (!defined.length) {
    for (const rec of resolution?.recommendations || []) {
      const builtin = BUILTINS[rec.id]
      add(builtin?.title || rec.label, builtin?.kind || inferCapabilityKind(rec.label), [rec.id])
    }
  }
  for (const gap of resolution?.gaps || []) add(gap.name, inferCapabilityKind(gap.name))
  const context = [spec.goal, spec.task_scope, ...spec.task_plan,
    ...(spec.roles || []).flatMap(role => [role.responsibility, ...role.tasks])].join("；")
  if (/(?:浏览器|browser|playwright|点击网页|填写表单)/i.test(context) &&
    !deny(context, /浏览器|browser|网页操作/i)) add("浏览器操作", "browser", [], "任务需要打开、读取或操作页面，请连接真实浏览器执行工具", writing.test(context)?"write":"read")
  if (/(?:本地软件|电脑软件|桌面软件|操作电脑|desktop|computer.?use)/i.test(context) &&
    !deny(context, /电脑|软件|desktop/i)) add("电脑软件操作", "desktop", [], "任务需要本地执行器或软件接口；网页本身无法直接调度电脑", writing.test(context)?"write":"read")
  return needs.slice(0, 20)
}

const domainMatch = (kind: CapabilityKind, text: string): boolean => {
  if (kind === "browser") return /browser|playwright|puppeteer|浏览器/i.test(text)
  if (kind === "desktop") return /desktop|computer.?use|本地软件|桌面|电脑操作/i.test(text)
  if (kind === "document") return /document|pdf|spreadsheet|excel|xlsx|docx|文档|电子表格/i.test(text)
  return false
}
const writing = /(?:\b(?:write|create|update|delete|send|submit|fill|click|type|press|upload|remove|edit|execute|export)\b|(?:^|_)(?:write|create|update|delete|send|submit|fill|click|type|press|upload|remove|edit|execute|export)(?:_|$)|写入|创建|修改|删除|发送|提交|填写|点击|上传|生成文件|导出)/i

function specificDomainMatches(need:AgentCapabilityRequirement,text:string):boolean {
  if(need.kind!=="document")return domainMatch(need.kind,text)
  const request=[need.title,need.purpose,...need.search_terms].join(" ")
  const groups=[/pdf/i,/(?:excel|xlsx|电子表格|spreadsheet)/i,/(?:word|docx|文字文档)/i,/(?:pptx|powerpoint|幻灯片)/i]
  const requested=groups.filter(group=>group.test(request))
  return domainMatch(need.kind,text) && (!requested.length || requested.every(group=>group.test(text)))
}

function compatibleCandidate(need:AgentCapabilityRequirement,tool:CapabilityCandidate,text:string):boolean {
  if(need.access==="write" && (tool.readOnly || !writing.test(text)))return false
  if(need.access==="read" && !tool.readOnly && writing.test(text))return false
  if(tool.source==="builtin")return BUILTINS[tool.id].kind===need.kind && need.access==="read"
  const domainSpecific=["document","browser","desktop"].includes(need.kind)
  const explicitIntegration=need.kind==="integration"||need.kind==="custom"
  if(domainSpecific || explicitIntegration) {
    if(domainSpecific && !specificDomainMatches(need,text))return false
    // A click action cannot stand in for uploading a file, nor can a writer
    // automatically fulfil an export task. Match declared operation metadata.
    const actions:readonly [RegExp,RegExp][]=[
      [/(?:上传|upload|attach.*file)/i,/(?:上传|upload|attach.*file|file.*attach)/i],
      [/(?:下载|download)/i,/(?:下载|download)/i],
      [/(?:点击|click)/i,/(?:点击|click)/i],
      [/(?:填写|填入|fill.*form|type.*text)/i,/(?:填写|填入|fill|type|input|form)/i],
      [/(?:导出|export)/i,/(?:导出|export|generate|create|生成|创建)/i],
      [/(?:删除|delete|remove)/i,/(?:删除|delete|remove)/i],
      [/(?:发送|发邮件|send)/i,/(?:发送|发邮件|send)/i],
      [/(?:更新|修改|update|edit)/i,/(?:更新|修改|update|edit)/i],
      [/(?:创建|新增|create)/i,/(?:创建|新增|create)/i],
    ]
    const requestedAction = `${need.title} ${need.purpose}`
    if(!actions.every(([request,capability])=>!request.test(requestedAction)||capability.test(text)))return false
    if(explicitIntegration) {
      // Known domains narrow the manual picker too: sending a chat message is
      // not evidence that a connection can send email. Unrecognized business
      // operations remain an explicit employee mapping, never an auto match.
      const domains=[/(?:mail|outlook|邮件|邮箱)/i,
        /(?:calendar|日历|日程)/i,/(?:slack)/i,/(?:salesforce)/i,/(?:notion)/i]
      if(!domains.every(domain=>!domain.test(need.title)||domain.test(text)))return false
    }
    return true
  }
  // For an integration, a real catalog id is only a visible candidate. The
  // employee still selects it; suggestions never mutate global/role grants.
  return need.suggested_tool_ids.includes(tool.id)
}

export function buildAgentCapabilityPlan(spec: AgentSpec, resolution: ToolResolution | null,
  connections: ConnectedToolOption[] = [], market: VerifiedMarketTool[] = []): CapabilityPlanRow[] {
  const selected = new Set(spec.tools || [])
  const catalog: CapabilityCandidate[] = [
    ...Object.entries(BUILTINS).map(([id, item]) => ({id, label: item.title,
      source: "builtin" as const, tested: true, selected: selected.has(id), readOnly: true})),
    ...connections.map(item => ({id: item.name, label: item.name, description: item.description, source: "http" as const,
      tested: ["ok", "success", "connected"].includes(String(item.status || "").toLowerCase()),
      selected: selected.has(item.name), readOnly: item.method === "GET"})),
    ...market.map(item => ({id: item.id, label: item.label, description: item.description, source: "market" as const,
      tested: true, selected: selected.has(item.id), readOnly: item.readOnly && !item.destructive})),
  ]
  const metadata = new Map<string, string>([
    ...connections.map(item => [item.name, item.name + " " + item.description] as const),
    ...market.map(item => [item.id, item.name + " " + item.description] as const),
  ])
  return agentCapabilityRequirements(spec, resolution).map(need => {
    const candidates = catalog.filter(tool => compatibleCandidate(need,tool,metadata.get(tool.id)||""))
      .map(tool=>({...tool,needsMapping:(need.kind==="integration"||need.kind==="custom") && !need.suggested_tool_ids.includes(tool.id)}))
    const roleAssignmentsValid = (toolId:string) => need.role_ids.length
      ? need.role_ids.every(id => spec.roles?.some(role => role.id===id && role.tools.includes(toolId)))
      : !spec.roles?.length || spec.roles.some(role=>role.tools.includes(toolId))
    const isBound = (tool:CapabilityCandidate) => tool.selected && !tool.needsMapping && roleAssignmentsValid(tool.id)
    const chosen = candidates.filter(isBound)
    const state = chosen.some(tool => tool.tested) ? "selected" : chosen.length ? "needs_test"
      : candidates.some(tool => tool.tested) ? "available" : candidates.length ? "needs_test" : "missing"
    return {...need, candidates:candidates.map(tool=>({...tool,selected:isBound(tool)})), state,
      searchTerm: need.search_terms.map(safeMarketplaceQuery).find(Boolean) ||
        safeMarketplaceQuery(need.kind + " " + need.title),
      roleNames: (spec.roles || []).filter(role => need.role_ids.includes(role.id)).map(role => role.name),
    }
  })
}

export function agentCapabilityReadiness(spec:AgentSpec, resolution:ToolResolution|null,
  connections:ConnectedToolOption[]=[],market:VerifiedMarketTool[]=[]):string[] {
  return buildAgentCapabilityPlan(spec,resolution,connections,market)
    .filter(row=>row.required&&row.state!=="selected")
    .map(row=>`${row.title}：${row.state==="needs_test"?"请先测试连接":
      row.state==="available"?spec.roles?.length?"请选用工具并分配给负责角色":"请选择已连接工具":"请连接工具或调整能力需求"}`)
}

/** Exact human choice, used by UI and regression tests. No broad role grants. */
export function bindAgentCapability(spec:AgentSpec, needId:string, toolId:string,
  resolution:ToolResolution|null, connections:ConnectedToolOption[]=[], market:VerifiedMarketTool[]=[]):AgentSpec {
  const need=buildAgentCapabilityPlan(spec,resolution,connections,market).find(row=>row.id===needId)
  if(!need || !need.candidates.some(candidate=>candidate.id===toolId))return spec
  const otherRoleUsesAlias=spec.roles?.some(role=>!need.role_ids.includes(role.id)&&role.tools.includes(need.title))
  return {...spec,
    capability_requirements:agentCapabilityRequirements(spec,resolution)
      .map(row=>row.id===needId?{...row,suggested_tool_ids:[toolId]}:row),
    tools:[...new Set([...spec.tools.filter(tool=>tool!==need.title||otherRoleUsesAlias),toolId])],
    roles:spec.roles?.map(role=>need.role_ids.includes(role.id)
      ? {...role,tools:[...new Set([...role.tools.filter(tool=>tool!==need.title),toolId])]}:role),
  }
}

/** Catalog metadata only: credentials, URLs and employee records never enter the prompt. */
export function toolCatalogForDesign(connections: ConnectedToolOption[], market: VerifiedMarketTool[]) {
  return [
    ...Object.entries(BUILTINS).map(([id, item]) => ({id, description: item.title, readOnly: true, source: "builtin"})),
    ...connections.slice(0, 30).map(item => ({id: item.name, description: item.description.slice(0, 220),
      readOnly: item.method === "GET", tested: ["ok", "success", "connected"].includes(item.status || ""), source: "http"})),
    ...market.slice(0, 45).map(item => ({id: item.id, description: item.description.slice(0, 220),
      readOnly: item.readOnly && !item.destructive, tested: true, source: "market"})),
  ]
}
