/**
 * Workflow node preview, intentionally pure and side-effect free.
 *
 * This module NEVER invokes an LLM, HTTP endpoint, tool, Agent, workflow run,
 * or charged provider. It mirrors selected render/condition/loop behavior in
 * PocketBase's workflow_api.pb.js for a safe local debugging workbench.
 */
import type { WfEdge, WfNode, WfNodeType } from "../pages/WorkflowCanvas/useWorkflowCanvas"

export type PreviewGraph = { nodes: WfNode[]; edges: WfEdge[] }
export type PreviewSamples = {
  input: string
  /** Keys are current-graph node IDs, not titles from an imported workflow. */
  outputs: Record<string, string>
  loop?: { item: string; index: number }
}
export type PreviewResult = {
  nodeType: string
  source: string
  renderedInput: string
  output: string
  branch?: "true" | "false"
  missing: string[]
  errors: string[]
  warnings: string[]
  parsedToolParams?: unknown
  estimatedRounds?: number
  sampleItems?: string[]
  /** True for steps whose real execution requires a model, Agent or tool. */
  requiresRealExecution: boolean
}
const RENDER_LIMIT = 8000
const SAMPLE_LIMIT = 4000
export const NODE_PREVIEW_MAX_INPUT = 2000
export const WORKFLOW_NODE_IO_CONTRACTS: Record<WfNodeType, {input: string; output: string}> = {
  start: {input: "本次任务指令（文本）", output: "原任务文本"},
  model: {input: "渲染后的提示词（文本）", output: "模型回复文本"},
  agent: {input: "渲染后的任务文本", output: "Agent 最终回复文本"},
  tool: {input: "JSON 对象参数", output: "工具返回文本/序列化内容"},
  condition: {input: "上游输出文本", output: "判断说明文本 + true/false 分支"},
  loop: {input: "循环次数或列表文本/JSON 数组", output: "循环状态与轮次摘要"},
  end: {input: "输出模板或已完成上游文本", output: "工作流结果文本"},
}

function safeSamples(samples: PreviewSamples): PreviewSamples {
  const outputs: Record<string, string> = Object.create(null)
  for (const [id, value] of Object.entries(samples.outputs || {}).slice(0, 120)) {
    if (typeof value === "string") outputs[id] = value.slice(0, SAMPLE_LIMIT)
  }
  return {
    input: String(samples.input || "").slice(0, NODE_PREVIEW_MAX_INPUT),
    outputs,
    loop: samples.loop && Number.isInteger(samples.loop.index) && samples.loop.index >= 1
      ? {item: String(samples.loop.item || "").slice(0, SAMPLE_LIMIT), index: samples.loop.index} : undefined,
  }
}

/** Check membership in an active loop body; do not traverse the loop's done edge. */
export function isWorkflowNodeInLoopBody(graph: PreviewGraph, nodeId: string): boolean {
  if (!graph.nodes.some(n => n.id === nodeId)) return false
  for (const loop of graph.nodes.filter(n => n.type === "loop")) {
    const queue = graph.edges
      .filter(e => e.source === loop.id && e.sourceHandle !== "done")
      .map(e => e.target)
    const visited = new Set<string>()
    while (queue.length) {
      const next = queue.pop()!
      if (next === loop.id || visited.has(next)) continue
      if (next === nodeId) return true
      visited.add(next)
      for (const edge of graph.edges) if (edge.source === next) queue.push(edge.target)
    }
  }
  return false
}

/**
 * Limit click-to-insert variable chips to possible upstream outputs.
 * The full graph still validates explicit references separately.
 */
export function suggestedVariablesForNode(graph: PreviewGraph, nodeId: string): string[] {
  const upstream = new Set<string>()
  const queue = graph.edges.filter(e => e.target === nodeId).map(e => e.source)
  while (queue.length) {
    const id = queue.pop()!
    if (id === nodeId || upstream.has(id)) continue
    upstream.add(id)
    for (const edge of graph.edges) if (edge.target === id) queue.push(edge.source)
  }
  const values = graph.nodes.filter(n => upstream.has(n.id) &&
    n.type !== "start" && n.type !== "end" && String(n.data?.title || "").trim())
    .map(n => String(n.data.title).trim() + ".output")
  if (isWorkflowNodeInLoopBody(graph, nodeId))
    values.push("loop.item", "loop.index")
  return ["input", ...values]
}

export function previewDependencies(graph: PreviewGraph, nodeId: string): WfNode[] {
  const node = graph.nodes.find(n => n.id === nodeId)
  if (!node) return []
  const required = new Set<string>(graph.edges.filter(e => e.target === nodeId).map(e => e.source))
  const references = [
    node.data.prompt, node.data.params_template, node.data.output_template,
    node.data.list_source,
  ].filter((s): s is string => typeof s === "string")
  const byTitle = new Map(graph.nodes.map(n => [String(n.data.title), n.id]))
  for (const str of references) {
    for (const match of str.matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g)) {
      const ref = match[1].trim()
      if (ref.endsWith(".output")) {
        const targetId = byTitle.get(ref.slice(0, -7))
        if (targetId) required.add(targetId)
      }
    }
  }
  const refTitle = String(node.data.ref_title || "").trim()
  if (refTitle && byTitle.has(refTitle)) required.add(byTitle.get(refTitle)!)
  required.delete(nodeId)
  return graph.nodes.filter(n => required.has(n.id)).slice(0, 14)
}

export function previewWorkflowNode(
  graph: PreviewGraph,
  nodeId: string,
  inputSamples: PreviewSamples,
): PreviewResult {
  const node = graph.nodes.find(n => n.id === nodeId)
  const type = String(node?.type || "")
  const result: PreviewResult = {
    nodeType: type, source: "", renderedInput: "", output: "",
    missing: [], errors: [], warnings: [],
    requiresRealExecution: type === "model" || type === "agent" || type === "tool",
  }
  if (!node) {
    result.errors.push("当前节点不存在，无法预览")
    return result
  }
  const samples = safeSamples(inputSamples)
  const byTitle = new Map(graph.nodes.map(n => [String(n.data.title), n.id]))
  const hasOutput = (id: string) => Object.prototype.hasOwnProperty.call(samples.outputs, id)
  const rawOutput = (id: string) => hasOutput(id) ? samples.outputs[id] : undefined
  const missing = new Set<string>()
  const render = (template: string) => {
    const rendered = String(template || "").replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (_, raw: string) => {
      const key = raw.trim()
      if (key === "input") return samples.input
      if (key === "loop.item" && samples.loop) return samples.loop.item
      if (key === "loop.index" && samples.loop) return String(samples.loop.index)
      if (key.endsWith(".output")) {
        const id = byTitle.get(key.slice(0, -7))
        if (id && hasOutput(id)) return rawOutput(id) || ""
      }
      missing.add(key)
      return ""
    })
    if (rendered.length > RENDER_LIMIT) {
      result.warnings.push("实际执行时输入超过 8000 字符会截断；本地预览显示截断内容")
      return rendered.slice(0, RENDER_LIMIT) + "\n…已截断"
    }
    return rendered
  }
  const ins = graph.edges.filter(e => e.target === node.id)
  const firstReady = () => {
    for (const edge of ins) {
      const output = rawOutput(edge.source)
      if (output !== undefined) {
        const source = graph.nodes.find(n => n.id === edge.source)
        return { text: output, label: String(source?.data.title || edge.source) }
      }
    }
    return null
  }
  const noSample = () => result.warnings.push("尚未提供上游样本输出；预览不会推断模型或工具的真实结果")

  if (type === "start") {
    result.source = "当前模拟任务指令"
    result.renderedInput = samples.input
    result.output = samples.input
  } else if (type === "model" || type === "agent") {
    result.source = "提示词变量渲染"
    result.renderedInput = render(String(node.data.prompt || (type === "agent" ? "{{input}}" : "")))
    if (!result.renderedInput.trim()) result.errors.push("渲染后的提示词为空，真实执行会失败")
    if (type === "model" && !String(node.data.model || "").trim())
      result.errors.push("模型节点尚未配置模型连接")
    if (type === "agent" && !String(node.data.spec_id || "").trim())
      result.errors.push("Agent 节点尚未关联助手")
    result.warnings.push("只预览提示词；不调用大模型或 Agent，也不生成最终回答")
  } else if (type === "tool") {
    result.source = "工具入参 JSON 变量渲染"
    result.renderedInput = render(String(node.data.params_template || ""))
    if (!String(node.data.tool || "").trim()) result.errors.push("请先选择已授权的工具")
    if (result.renderedInput.trim()) {
      try {
        const parsed: unknown = JSON.parse(result.renderedInput)
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          result.errors.push("渲染后的工具入参必须是 JSON 对象")
        } else result.parsedToolParams = parsed
      } catch {
        result.errors.push("工具入参渲染后不是合法 JSON，请检查变量中是否包含未转义的引号或换行")
      }
    } else result.parsedToolParams = {}
    result.warnings.push("只校验参数 JSON；不会调用外部工具、修改数据或产生费用")
  } else if (type === "condition") {
    const refTitle = String(node.data.ref_title || "").trim()
    const refId = refTitle ? byTitle.get(refTitle) : undefined
    const explicit = refId ? rawOutput(refId) : undefined
    const fallback = firstReady()
    const value = explicit !== undefined ? explicit : fallback?.text
    result.source = explicit !== undefined ? "指定节点：" + refTitle
      : fallback ? "可用入边：" + fallback.label : "无可用上游样本"
    result.renderedInput = value || ""
    if (value === undefined) noSample()
    else {
      const op = String(node.data.op || "contains")
      const cmp = String(node.data.value || "")
      let met = false
      if (op === "contains") met = Boolean(cmp) && value.includes(cmp)
      else if (op === "not_contains") met = Boolean(cmp) && !value.includes(cmp)
      else if (["gt","lt","eq"].includes(op)) {
        const match = value.match(/-?\d+(?:\.\d+)?/)
        const left = match ? Number.parseFloat(match[0]) : NaN
        const right = Number.parseFloat(cmp)
        if (Number.isNaN(left) || Number.isNaN(right)) {
          if (op === "eq") met = value === cmp
          result.warnings.push("无法比较有效数值：运行时等于规则会回退到文本比较，大于/小于为不满足")
        } else {
          met = op === "gt" ? left > right : op === "lt" ? left < right : left === right
        }
      } else result.errors.push("条件规则未被支持：" + op)
      if (!result.errors.length) {
        result.branch = met ? "true" : "false"
        result.output = (met ? "条件满足" : "条件不满足") + "（规则：" + op + " " + cmp + "）"
      }
    }
  } else if (type === "end") {
    const template = String(node.data.output_template || "")
    if (template) {
      result.source = "输出模板变量渲染"
      result.renderedInput = render(template)
      result.output = result.renderedInput
    } else {
      const fallback = firstReady()
      result.source = fallback ? "可用入边：" + fallback.label : "无可用上游样本"
      if (fallback) result.output = fallback.text
      else noSample()
    }
  } else if (type === "loop") {
    const mode = String(node.data.mode || "count")
    const maxRaw = String(node.data.max_iterations ?? "")
    const maxParsed = maxRaw.trim() === "" ? 10 : Number.parseInt(maxRaw, 10)
    const maxRounds = Number.isInteger(maxParsed) && maxParsed >= 1 && maxParsed <= 20
      ? maxParsed : 0
    if (!maxRounds) result.errors.push("最大循环轮数需在 1–20 之间")
    let items: string[] = []
    if (mode === "count") {
      const count = Number.parseInt(String(node.data.count || ""), 10)
      if (!Number.isInteger(count) || count < 1) result.errors.push("循环次数必须为正整数")
      else items = Array.from({ length: Math.min(count,1000) }, (_, i) => String(i + 1))
      result.source = "按次数循环"
      result.renderedInput = String(node.data.count || "")
    } else if (mode === "list") {
      result.source = "列表变量渲染"
      const value = render(String(node.data.list_source || ""))
      result.renderedInput = value
      const delimiter = String(node.data.delimiter || "line")
      if (delimiter === "json_array") {
        try {
          const raw: unknown = JSON.parse(value)
          if (!Array.isArray(raw)) result.errors.push("列表来源必须解析为 JSON 数组")
          else items = raw.map(item => typeof item === "object" && item !== null ? JSON.stringify(item) : String(item ?? ""))
            .map(item => item.trim()).filter(Boolean)
        } catch { result.errors.push("列表来源不是合法的 JSON 数组") }
      } else if (delimiter === "comma") items = value.split(/[,，]/).map(s => s.trim()).filter(Boolean)
      else if (delimiter === "line") items = value.split(/\r?\n/).map(s => s.trim()).filter(Boolean)
      else result.errors.push("列表分隔方式无效")
      items = items.slice(0,50)
    } else result.errors.push("不支持的循环模式")
    if (!result.errors.length) {
      result.estimatedRounds = Math.min(maxRounds, items.length)
      result.sampleItems = items.slice(0, Math.min(5, result.estimatedRounds))
      result.output = "预计执行 " + result.estimatedRounds + " 轮（本地不实际运行循环体）"
    }
  } else result.errors.push("未知节点类型：" + type)

  result.missing = [...missing]
  if (result.missing.length) {
    result.warnings.push("以下变量无样本或不可用，预览中替换为空串：" + result.missing.slice(0, 5).join("、"))
  }
  return result
}
