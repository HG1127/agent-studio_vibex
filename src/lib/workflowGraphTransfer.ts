/**
 * Pure, untrusted-data-safe helpers for Workflow Canvas.
 * No model credentials, owner IDs or runtime permissions are transferred.
 * Keep clipboard/import transactions independent of React's render timing.
 */
import type { WfNode, WfEdge, WfNodeData, WfNodeType } from "../pages/WorkflowCanvas/useWorkflowCanvas"

export type GraphFragment = { nodes: WfNode[]; edges: WfEdge[] }
export type AlignMode = "left" | "centerX" | "right" | "top" | "centerY" | "bottom" | "distributeX" | "distributeY"
export const WORKFLOW_TRANSFER_MAX_BYTES = 512 * 1024
export const MAX_WORKFLOW_NODES = 40 // matched to workflow_api.pb.js create/update limits
export const MAX_WORKFLOW_EDGES = 240
const TYPES = new Set(["start", "model", "tool", "agent", "condition", "loop", "end"])
const FIELDS = new Set([
  "title", "input_hint", "prompt", "params_template", "op", "value", "output_template",
  "ref_title", "mode", "count", "list_source", "delimiter", "stop_keyword",
  "max_iterations", "max_steps",
])
const safeRecord = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : {}

const textField = (value: unknown, max = 12000): string => {
  if (typeof value !== "string" || value.length > max) throw new Error("工作流包含无效或过长的配置字段")
  return value
}
const numField = (value: unknown, field: string): number => {
  if (typeof value !== "number" || !Number.isFinite(value) || Math.abs(value) > 100000)
    throw new Error("工作流节点的" + field + "坐标无效")
  return value
}
function transferData(node: WfNode): Record<string, unknown> {
  const output: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(safeRecord(node.data))) {
    if (!FIELDS.has(key) || value === null || value === undefined) continue
    if (typeof value === "string") output[key] = textField(value)
    else if (typeof value === "number" && Number.isFinite(value)) output[key] = value
  }
  return output
}
/** Sanitized portable format: explicitly omits model bindings, tools, secret-bearing unknown fields and tenant IDs. */
export function exportWorkflowJson(name: string, description: string, graph: GraphFragment): string {
  if (graph.nodes.length > MAX_WORKFLOW_NODES || graph.edges.length > MAX_WORKFLOW_EDGES)
    throw new Error("工作流超出导入导出大小限制（40节点、240连线）")
  const json = JSON.stringify({
    kind: "agent-studio-workflow", version: 1,
    name: name.slice(0, 80), description: description.slice(0, 500),
    graph: {
      nodes: graph.nodes.map(n => ({
        id: n.id, type: n.type, position: { x: n.position.x, y: n.position.y },
        data: transferData(n),
      })),
      edges: graph.edges.map(e => ({
        id: e.id, source: e.source, target: e.target,
        sourceHandle: e.sourceHandle || null, targetHandle: e.targetHandle || null,
      })),
    },
  }, null, 2)
  if (new TextEncoder().encode(json).length > WORKFLOW_TRANSFER_MAX_BYTES)
    throw new Error("工作流导出文件超出512KB限制")
  return json
}
export function parseWorkflowJson(raw: string): { name: string; description: string; graph: GraphFragment } {
  if (new TextEncoder().encode(raw).length > WORKFLOW_TRANSFER_MAX_BYTES)
    throw new Error("文件超过 512KB 上限")
  let parsed: Record<string, unknown>
  try { parsed = safeRecord(JSON.parse(raw)) } catch { throw new Error("文件不是有效的 JSON") }
  if (parsed.kind !== "agent-studio-workflow" || parsed.version !== 1)
    throw new Error("不支持的工作流格式或版本，请导入本系统导出的 v1 文件")
  const g = safeRecord(parsed.graph)
  if (!Array.isArray(g.nodes) || !Array.isArray(g.edges))
    throw new Error("文件缺少节点或连线")
  if (g.nodes.length < 1 || g.nodes.length > MAX_WORKFLOW_NODES || g.edges.length > MAX_WORKFLOW_EDGES)
    throw new Error("节点或连线数量超出安全范围（最多40节点、240连线）")
  const ids = new Set<string>()
  const titles = new Set<string>()
  const nodes: WfNode[] = []
  for (const rawNode of g.nodes) {
    const n = safeRecord(rawNode)
    const id = n.id, type = n.type
    if (typeof id !== "string" || !/^[a-zA-Z0-9_-]{1,90}$/.test(id) || ids.has(id))
      throw new Error("存在无效或重复的节点 ID")
    if (typeof type !== "string" || !TYPES.has(type))
      throw new Error("存在不支持的节点类型")
    ids.add(id)
    const p = safeRecord(n.position)
    const d = safeRecord(n.data)
    const title = textField(d.title, 80).trim()
    if (!title || title.length > 30 || titles.has(title))
      throw new Error("节点标题不能为空、超过30字或重复；变量依赖唯一标题")
    titles.add(title)
    const data: Record<string, unknown> = { title }
    for (const [key, value] of Object.entries(d)) {
      if (key === "title" || !FIELDS.has(key)) continue
      if (typeof value === "string") data[key] = textField(value)
      else if (typeof value === "number" && Number.isFinite(value) && Math.abs(value) < 100000) data[key] = value
      else throw new Error("节点配置字段格式不正确")
    }
    // Do not carry privileged model, tool, agent-spec or knowledge binding across employees.
    if (type === "model") data.model = ""
    if (type === "tool") data.tool = "" // force explicit rebinding, never silently switch to calculator
    if (type === "agent") data.spec_id = ""
    nodes.push({
      id, type: type as WfNodeType,
      position: { x: numField(p.x, "X"), y: numField(p.y, "Y") },
      data: data as WfNodeData,
    })
  }
  if (nodes.filter(n => n.type === "start").length !== 1)
    throw new Error("工作流必须且只能有一个开始节点")
  const types = new Map(nodes.map(n => [n.id, n.type]))
  const handles = new Set<string>()
  const pairs = new Set<string>()
  const edges: WfEdge[] = []
  for (const rawEdge of g.edges) {
    const e = safeRecord(rawEdge)
    const source = e.source, target = e.target
    if (typeof source !== "string" || typeof target !== "string" || !ids.has(source) || !ids.has(target))
      throw new Error("连线引用了不存在的节点")
    if (source === target || types.get(source) === "end" || types.get(target) === "start")
      throw new Error("连线存在自环或不合法的起止节点")
    const handle = e.sourceHandle == null ? null : e.sourceHandle
    const t = types.get(source)
    if (t === "condition" && !["true", "false"].includes(String(handle)))
      throw new Error("条件节点的出口无效")
    if (t === "loop" && !["body", "done"].includes(String(handle)))
      throw new Error("循环节点的出口无效")
    if (t !== "condition" && t !== "loop" && handle !== null)
      throw new Error("节点出口类型无效")
    const pair = [source, target, handle || ""].join("|")
    if (pairs.has(pair)) throw new Error("存在重复连线")
    pairs.add(pair)
    if (t === "condition" || t === "loop") {
      const slot = source + "|" + String(handle)
      if (handles.has(slot)) throw new Error("条件或循环节点的出口被重复占用")
      handles.add(slot)
    }
    edges.push({ id: "e-import-" + edges.length, source, target, sourceHandle: handle as string | null })
  }
  // Import never executes automatically, but invalid cycles or an end node inside
  // loop body must not survive into a runnable graph.
  const adj = new Map(nodes.map(n => [n.id, [] as string[]]))
  for (const e of edges) {
    if (types.get(e.target) !== "loop") adj.get(e.source)?.push(e.target)
  }
  const visited = new Set<string>()
  const active = new Set<string>()
  function visit(id: string) {
    if (active.has(id)) throw new Error("工作流含有非法循环，请使用循环节点作为回边终点")
    if (visited.has(id)) return
    active.add(id)
    for (const next of adj.get(id) || []) visit(next)
    active.delete(id)
    visited.add(id)
  }
  for (const n of nodes) visit(n.id)
  for (const loop of nodes.filter(n => n.type === "loop")) {
    const body = new Set<string>()
    const queue = edges.filter(e => e.source === loop.id && e.sourceHandle !== "done").map(e => e.target)
    while (queue.length) {
      const current = queue.pop()!
      if (current === loop.id || body.has(current)) continue
      body.add(current)
      for (const e of edges.filter(e => e.source === current)) queue.push(e.target)
    }
    if (Array.from(body).some(id => types.get(id) === "end"))
      throw new Error("循环体内不能直接连接结束节点，请使用循环退出出口")
  }
  return {
    name: textField(parsed.name ?? "导入工作流", 80).trim() || "导入工作流",
    description: textField(parsed.description ?? "", 500),
    graph: { nodes, edges },
  }
}

/**
 * Atomic graph mutation for drag-to-empty then choose node type. Validate
 * the complete graph BEFORE publishing either new nodes or new edges.
 */
export function insertConnectedNode(graph: GraphFragment, node: WfNode, edge: WfEdge): GraphFragment {
  const src = graph.nodes.find(n => n.id === edge.source)
  if (!src || src.type === "end" || node.type === "start" || edge.target !== node.id ||
      graph.nodes.some(n => n.id === node.id) || graph.nodes.length >= MAX_WORKFLOW_NODES)
    throw new Error("无法从该出口创建节点（源节点无效、节点已存在或超过40个）")
  const handle = edge.sourceHandle ?? null
  if (src.type === "condition" && handle !== "true" && handle !== "false")
    throw new Error("条件节点出口必须选择满足或不满足")
  if (src.type === "loop" && handle !== "body" && handle !== "done")
    throw new Error("循环节点出口必须选择循环体或退出")
  if (src.type !== "condition" && src.type !== "loop" && handle !== null)
    throw new Error("普通节点的出口无效")
  if ((src.type === "condition" || src.type === "loop") &&
      graph.edges.some(e => e.source === src.id && (e.sourceHandle ?? null) === handle))
    throw new Error("该条件或循环出口已被使用")
  if (node.type === "end") {
    if (src.type === "loop" && handle === "body")
      throw new Error("请从循环退出出口连接结束节点")
    for (const loop of graph.nodes.filter(n => n.type === "loop")) {
      const seen = new Set<string>()
      const stack = graph.edges.filter(e => e.source === loop.id && e.sourceHandle !== "done")
        .map(e => e.target)
      while (stack.length) {
        const id = stack.pop()!
        if (id === loop.id || seen.has(id)) continue
        seen.add(id)
        for (const e of graph.edges.filter(e => e.source === id)) stack.push(e.target)
      }
      if (seen.has(src.id)) throw new Error("不能在循环体中直接创建结束节点")
    }
  }
  return { nodes: [...graph.nodes.map(n => ({...n, selected: false})), node],
    edges: [...graph.edges, edge] }
}

/** Keep variable references intact when a title is edited in the node inspector. */
export function renameNodeReferences(nodes: WfNode[], oldTitle: string, newTitle: string): WfNode[] {
  if (!oldTitle || oldTitle === newTitle) return nodes
  const from = "{{" + oldTitle + ".output}}"
  const to = "{{" + newTitle + ".output}}"
  return nodes.map(n => {
    const data: Record<string, unknown> = { ...n.data }
    let changed = false
    for (const [key, value] of Object.entries(data)) {
      if (key === "title" || typeof value !== "string") continue
      const updated = key === "ref_title" && value === oldTitle
        ? newTitle : value.split(from).join(to)
      if (updated !== value) { data[key] = updated; changed = true }
    }
    return changed ? { ...n, data: data as WfNodeData } : n
  })
}

/** Copy selected subgraph; start nodes are never duplicated. */
export function selectedFragment(nodes: WfNode[], edges: WfEdge[], onlyId?: string): GraphFragment {
  const picked = nodes.filter(n => n.type !== "start" && (onlyId ? n.id === onlyId : n.selected))
  const ids = new Set(picked.map(n => n.id))
  return {
    nodes: picked.map(n => ({ ...n, data: { ...n.data }, position: { ...n.position }, selected: false })),
    edges: edges.filter(e => ids.has(e.source) && ids.has(e.target)).map(e => ({ ...e })),
  }
}
const replaceInternalRefs = (value: string, renames: Map<string, string>): string =>
  value.replace(/\{\{([^{}]+)\.output\}\}/g, (token, title: string) =>
    renames.has(title) ? "{{" + renames.get(title) + ".output}}" : token)
export function pasteFragment(
  fragment: GraphFragment,
  existing: WfNode[],
  generateId: (type: WfNodeType) => string,
  position?: { x: number; y: number },
): GraphFragment {
  if (!fragment.nodes.length || fragment.nodes.length > MAX_WORKFLOW_NODES)
    throw new Error("没有可粘贴的节点或节点数量过多")
  const minX = Math.min(...fragment.nodes.map(n => n.position.x))
  const minY = Math.min(...fragment.nodes.map(n => n.position.y))
  const ids = new Map<string, string>()
  const renames = new Map<string, string>()
  const used = new Set(existing.map(n => String(n.data.title)))
  const pasted: WfNode[] = fragment.nodes.filter(n => n.type !== "start").map(n => {
    const type = (n.type || "model") as WfNodeType
    const name = String(n.data.title || type)
    let title = name
    let count = 2
    while (used.has(title)) title = (name.slice(0, 24) + " " + count++).slice(0, 30)
    used.add(title)
    renames.set(name, title)
    const id = generateId(type)
    ids.set(n.id, id)
    return {
      id, type, selected: true,
      position: {
        x: n.position.x - minX + (position?.x ?? minX + 36),
        y: n.position.y - minY + (position?.y ?? minY + 36),
      },
      data: { ...n.data, title },
    }
  })
  for (const n of pasted) {
    const data: Record<string, unknown> = { ...n.data }
    for (const key of ["prompt", "params_template", "output_template", "list_source"]) {
      if (typeof data[key] === "string") data[key] = replaceInternalRefs(data[key], renames)
    }
    if (typeof data.ref_title === "string" && renames.has(data.ref_title))
      data.ref_title = renames.get(data.ref_title)
    n.data = data as WfNodeData
  }
  const edges = fragment.edges.filter(e => ids.has(e.source) && ids.has(e.target)).map((e, i) => ({
    id: generateId("model") + "-e-" + i,
    source: ids.get(e.source)!, target: ids.get(e.target)!,
    sourceHandle: e.sourceHandle ?? null, targetHandle: e.targetHandle ?? null,
  }))
  return { nodes: pasted, edges }
}
/** Choose the nearest available slot to avoid stacked cards on quick-add. */
export function findAvailableNodePosition(
  existing: WfNode[], desired: { x: number; y: number },
): { x: number; y: number } {
  const margin = 18
  const width = 208, height = 122
  const fits = (candidate: {x:number; y:number}) =>
    existing.every(n => {
      const w = n.measured?.width || 208
      const h = n.measured?.height || 122
      return candidate.x >= n.position.x + w + margin ||
        candidate.x + width + margin <= n.position.x ||
        candidate.y >= n.position.y + h + margin ||
        candidate.y + height + margin <= n.position.y
    })
  if (fits(desired)) return desired
  for (let ring=1; ring<=18; ring++) {
    for (const [dx,dy] of [
      [ring,0],[0,ring],[-ring,0],[0,-ring],
      [ring,ring],[-ring,ring],[ring,-ring],[-ring,-ring],
    ]) {
      const proposed = {x:desired.x+dx*260,y:desired.y+dy*170}
      if (fits(proposed)) return proposed
    }
  }
  return { x: desired.x + (existing.length+1)*260, y: desired.y }
}

export function alignNodes(nodes: WfNode[], mode: AlignMode): WfNode[] {
  const chosen = nodes.filter(n => n.selected)
  if (chosen.length < 2 || (mode.startsWith("distribute") && chosen.length < 3)) return nodes
  const width = (n: WfNode) => n.measured?.width || 208
  const height = (n: WfNode) => n.measured?.height || 96
  const left = Math.min(...chosen.map(n => n.position.x))
  const right = Math.max(...chosen.map(n => n.position.x + width(n)))
  const top = Math.min(...chosen.map(n => n.position.y))
  const bottom = Math.max(...chosen.map(n => n.position.y + height(n)))
  const centersX = chosen.map(n => n.position.x + width(n) / 2)
  const centersY = chosen.map(n => n.position.y + height(n) / 2)
  const centerX = centersX.reduce((a, b) => a + b, 0) / centersX.length
  const centerY = centersY.reduce((a, b) => a + b, 0) / centersY.length
  const distributed = new Map<string, number>()
  if (mode === "distributeX" || mode === "distributeY") {
    const xAxis = mode === "distributeX"
    const sorted = [...chosen].sort((a, b) => xAxis ? a.position.x - b.position.x : a.position.y - b.position.y)
    const spanStart = xAxis ? left : top
    const spanEnd = xAxis ? right : bottom
    const totalSize = sorted.reduce((sum, n) => sum + (xAxis ? width(n) : height(n)), 0)
    const gap = (spanEnd - spanStart - totalSize) / (sorted.length - 1)
    let cursor = spanStart
    for (const n of sorted) { distributed.set(n.id, cursor); cursor += (xAxis ? width(n) : height(n)) + gap }
  }
  return nodes.map(n => {
    if (!n.selected) return n
    let { x, y } = n.position
    if (mode === "left") x = left
    if (mode === "centerX") x = centerX - width(n) / 2
    if (mode === "right") x = right - width(n)
    if (mode === "top") y = top
    if (mode === "centerY") y = centerY - height(n) / 2
    if (mode === "bottom") y = bottom - height(n)
    if (mode === "distributeX") x = distributed.get(n.id) ?? x
    if (mode === "distributeY") y = distributed.get(n.id) ?? y
    return { ...n, position: { x, y } }
  })
}
