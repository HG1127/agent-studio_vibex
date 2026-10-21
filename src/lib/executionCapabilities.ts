/**
 * Describe observed execution connections without promoting an HTTP probe or
 * MCP tools/list into a claim that a desktop is online or an action is allowed.
 * The actual executors still enforce connection ownership and per-call policy.
 */
export type ExecutionCapabilityKind = "browser" | "desktop" | "api"
export type ExecutionConnectionState = "tested" | "discovered" | "untested" | "failed" | "disabled"
export type ExecutionCapability = {
  id: string
  title: string
  description: string
  kind: ExecutionCapabilityKind
  source: "http" | "mcp"
  state: ExecutionConnectionState
  stateLabel: string
  detail: string
  toolNames: string[]
  checkedAt: string
  method: string
}

export type ExecutionConnectionPreset = {
  id: "browser-read" | "browser-action" | "desktop-document"
  kind: "browser" | "desktop"
  title: string
  name: string
  description: string
  method: "POST"
  bodyTemplate: string
  exampleInput: string
  contract: string
}

/** Contract examples for the operator's own adapter, never preconfigured live services. */
export const EXECUTION_CONNECTION_PRESETS: readonly ExecutionConnectionPreset[] = [
  {
    id: "browser-read", kind: "browser", title: "读取浏览器页面",
    name: "browser_read_page",
    description: "通过已配置的浏览器执行器读取指定网页，返回页面标题、正文与来源 URL。输入为 JSON 对象，必填 url；需要执行器提供对应接口及页面访问权限。",
    method: "POST", bodyTemplate: "{{input}}",
    exampleInput: '{\n  "url": "https://example.com"\n}',
    contract: "请求体接收 { url }；执行器返回标题、正文和最终 URL。登录页面还需要执行器持有已授权的浏览器会话。",
  },
  {
    id: "browser-action", kind: "browser", title: "浏览器指定操作",
    name: "browser_registered_action",
    description: "调用浏览器执行器中已登记的动作。输入为 JSON 对象，必填 action_id 与 arguments；执行器只接受授权动作和目标域名，不接收任意脚本。",
    method: "POST", bodyTemplate: "{{input}}",
    exampleInput: '{\n  "action_id": "填写执行器中已登记的动作 ID",\n  "arguments": {}\n}',
    contract: "请求体接收 { action_id, arguments }；动作 ID、参数、可访问网站和会话由执行器定义。提交表单等写入沿用现有审批。",
  },
  {
    id: "desktop-document", kind: "desktop", title: "本地软件处理文档",
    name: "desktop_document_export",
    description: "调用已授权电脑上的文档处理执行器。输入为 JSON 对象，包含 application、input_path、output_format；文件路径相对于该执行器允许的目录。",
    method: "POST", bodyTemplate: "{{input}}",
    exampleInput: '{\n  "application": "填写执行器已登记的软件 ID",\n  "input_path": "填写允许目录中的文件路径",\n  "output_format": "pdf"\n}',
    contract: "请求体接收 { application, input_path, output_format }；软件与文件目录由电脑侧执行器授权。返回任务状态和产物位置，不能只返回请求已接收。",
  },
]

export function executionConnectionPreset(value: unknown): ExecutionConnectionPreset | undefined {
  return typeof value === "string" ? EXECUTION_CONNECTION_PRESETS.find(preset => preset.id === value) : undefined
}

const text = (value: unknown, limit = 300): string => typeof value === "string" ? value.trim().slice(0, limit) : ""
const record = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null

/** A category is a display aid; it never grants an execution capability. */
export function classifyExecutionCapability(name: string, description: string): ExecutionCapabilityKind {
  const content = `${name} ${description}`
  if (/(?:desktop|computer[_\s.-]?(?:use|control)|桌面(?:控制|操作|软件)|电脑(?:操作|控制|软件)|本地软件|办公软件|libreoffice|office[_\s.-]?(?:export|automation)|osascript|pyautogui)/i.test(content)) return "desktop"
  if (/(?:browser|playwright|puppeteer|selenium|浏览器|网页(?:操作|交互|点击|表单))/i.test(content)) return "browser"
  return "api"
}

function connectionState(enabled: unknown, status: unknown, source: "http" | "mcp", hasTools = true): Pick<ExecutionCapability, "state" | "stateLabel" | "detail"> {
  if (enabled === false) return { state: "disabled", stateLabel: "已停用", detail: "此连接目前不会被助手调用。" }
  if (enabled !== true) return { state: "untested", stateLabel: "连接信息待核验", detail: "缺少明确的启用状态，请到连接详情重新检查。" }
  if (status === "ok" && hasTools) return source === "http"
    ? { state: "tested", stateLabel: "最近测试通过", detail: "接口曾返回成功；当前网络、账号权限与动作结果仍以本次调用为准。" }
    : { state: "discovered", stateLabel: "工具发现通过", detail: "已取得工具清单；尚不能据此判断电脑在线或某个操作能执行成功。" }
  if (status === "error" || status === "failed") return { state: "failed", stateLabel: "需要检查连接", detail: "最近检测失败，请到连接详情检查地址、凭据与执行器状态。" }
  return { state: "untested", stateLabel: "待检测", detail: source === "http" ? "连接已登记，尚无成功测试记录。" : "需要重新发现工具，确认当前连接实际提供哪些动作。" }
}

export function collectExecutionCapabilities(httpInput: unknown, marketInput: unknown): ExecutionCapability[] {
  const result: ExecutionCapability[] = []
  const seen = new Set<string>()
  for (const raw of (Array.isArray(httpInput) ? httpInput : []).slice(0, 200)) {
    const row = record(raw)
    if (!row) continue
    const id = text(row.id, 100), title = text(row.name, 100)
    if (!id || !title || seen.has(`http:${id}`)) continue
    seen.add(`http:${id}`)
    const description = text(row.description, 500)
    result.push({
      id, title, description, kind: classifyExecutionCapability(title, description), source: "http",
      ...connectionState(row.enabled, row.status, "http"), toolNames: [title],
      checkedAt: text(row.last_checked_at, 80), method: text(row.method, 8).toUpperCase(),
    })
  }
  for (const raw of (Array.isArray(marketInput) ? marketInput : []).slice(0, 100)) {
    const row = record(raw)
    if (!row) continue
    const id = text(row.id, 100)
    if (!id || seen.has(`mcp:${id}`)) continue
    seen.add(`mcp:${id}`)
    const title = text(row.title, 100) || text(row.server_name, 100) || "MCP 连接"
    const tools = (Array.isArray(row.tools) ? row.tools : []).slice(0, 100).map(record).filter((tool): tool is Record<string, unknown> => !!tool)
    const toolNames = tools.map(tool => text(tool.name, 120)).filter(Boolean)
    const description = tools.slice(0, 5).map(tool => text(tool.description, 120)).filter(Boolean).join("；")
    const categoryText = tools.map(tool => `${text(tool.name, 120)} ${text(tool.description, 180)}`).join(" ")
    result.push({
      id, title, description, kind: classifyExecutionCapability(title, categoryText), source: "mcp",
      ...connectionState(row.enabled, row.last_probe_status, "mcp", toolNames.length > 0 && Number(row.tool_count) > 0),
      toolNames, checkedAt: "", method: "MCP",
    })
  }
  return result
}

export function formatExecutionCheckTime(value: string): string {
  if (!value) return "检测时间未提供"
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? "检测时间无法识别" : date.toLocaleString("zh-CN", { hour12: false })
}
