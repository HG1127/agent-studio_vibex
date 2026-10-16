import type { WfNode, WfEdge } from "../pages/WorkflowCanvas/useWorkflowCanvas"
import { MAX_WORKFLOW_NODES, MAX_WORKFLOW_EDGES } from "./workflowGraphTransfer.ts"

export type WorkflowIssue = {
  severity: "error" | "warning"
  code: string
  message: string
  nodeId?: string
}

/** Read-only diagnostics. Drafts can be saved; hard errors must be resolved before running. */
export function inspectWorkflowGraph(nodes: WfNode[], edges: WfEdge[]): WorkflowIssue[] {
  const issues: WorkflowIssue[] = []
  const report = (severity: WorkflowIssue["severity"], code: string, message: string, nodeId?: string) =>
    issues.push({ severity, code, message, ...(nodeId ? {nodeId} : {}) })
  if (nodes.length > MAX_WORKFLOW_NODES || edges.length > MAX_WORKFLOW_EDGES)
    report("error", "graph_size", "工作流超过40个节点或240条连线，请拆分流程")
  const starts = nodes.filter(n => n.type === "start")
  const ends = nodes.filter(n => n.type === "end")
  if (starts.length !== 1) report("error", "start_count", "必须有且只有一个开始节点")
  if (!ends.length) report("error", "end_missing", "至少需要一个结束节点")
  const ids = new Map(nodes.map(n => [n.id, n]))
  const titles = new Set<string>()
  for (const n of nodes) {
    const title = String(n.data?.title || "").trim()
    if (!title) report("error", "title_empty", "节点标题不能为空", n.id)
    else if (titles.has(title)) report("error", "title_duplicate", `节点标题「${title}」重复`, n.id)
    titles.add(title)
    if (n.type === "model") {
      if (!String(n.data?.model || "").trim())
        report("error", "model_missing", `模型节点「${title}」尚未选择模型`, n.id)
      if (!String(n.data?.prompt || "").trim())
        report("error", "prompt_empty", `模型节点「${title}」没有提示词，真实运行会失败`, n.id)
    }
    if (n.type === "tool" && !String(n.data?.tool || "").trim())
      report("error", "tool_missing", `工具节点「${title}」尚未选择工具`, n.id)
    if (n.type === "agent" && !String(n.data?.spec_id || "").trim())
      report("error", "agent_missing", `Agent 节点「${title}」尚未绑定助手`, n.id)
    const refTitle = String(n.data?.ref_title || "").trim()
    if (refTitle && !nodes.some(other => String(other.data?.title || "").trim() === refTitle))
      report("error", "ref_title_invalid", `节点「${title}」引用的节点「${refTitle}」不存在`, n.id)
  }
  const edgeFingerprints = new Set<string>()
  const outgoing = new Map(nodes.map(n => [n.id, [] as WfEdge[]]))
  for (const edge of edges) {
    const source = ids.get(edge.source)
    const target = ids.get(edge.target)
    if (!source || !target) {
      report("error", "edge_orphan", "有连线引用了不存在的节点")
      continue
    }
    if (source.id === target.id || source.type === "end" || target.type === "start") {
      report("error", "edge_direction", "发现错误的连线方向或自环", source.id)
      continue
    }
    const handle = edge.sourceHandle || ""
    if (source.type === "condition" && handle !== "true" && handle !== "false")
      report("error", "condition_port", `条件节点「${source.data.title}」的出口类型无效`, source.id)
    if (source.type === "loop" && handle !== "body" && handle !== "done")
      report("error", "loop_port", `循环节点「${source.data.title}」的出口类型无效`, source.id)
    if (source.type !== "condition" && source.type !== "loop" && handle)
      report("error", "normal_port", `节点「${source.data.title}」存在不支持的出口`, source.id)
    const fingerprint = [edge.source, edge.target, handle].join("|")
    if (edgeFingerprints.has(fingerprint))
      report("error", "edge_duplicate", "有重复连线", source.id)
    edgeFingerprints.add(fingerprint)
    outgoing.get(source.id)?.push(edge)
  }
  for (const n of nodes) {
    const outs = outgoing.get(n.id) || []
    if (n.type === "condition") {
      for (const port of ["true", "false"]) {
        const matching = outs.filter(e => e.sourceHandle === port)
        if (matching.length !== 1)
          report("error", `condition_${port}`,
            `条件节点「${n.data.title}」的${port === "true" ? "满足" : "不满足"}出口必须连接一个节点`, n.id)
      }
      if (!String(n.data?.value || "").trim())
        report("warning", "condition_empty", `条件节点「${n.data.title}」的比较值为空`, n.id)
    }
    if (n.type === "loop") {
      const body = outs.filter(e => e.sourceHandle === "body")
      const done = outs.filter(e => e.sourceHandle === "done")
      if (body.length !== 1 || done.length !== 1)
        report("error", "loop_ports", `循环节点「${n.data.title}」需连接循环体和退出出口`, n.id)
      if (body.length) {
        const seen = new Set<string>()
        const stack = body.map(e => e.target)
        let returned = false
        while (stack.length) {
          const id = stack.pop()!
          if (id === n.id) { returned = true; continue }
          if (seen.has(id)) continue
          seen.add(id)
          for (const e of outgoing.get(id) || []) stack.push(e.target)
        }
        if (!returned)
          report("error", "loop_return", `循环节点「${n.data.title}」的循环体缺少回边`, n.id)
        if ([...seen].some(id => ids.get(id)?.type === "end"))
          report("error", "loop_contains_end", `循环节点「${n.data.title}」的循环体不能直接包含结束节点`, n.id)
      }
    }
  }
  if (starts.length === 1) {
    const reachable = new Set<string>()
    const stack = [starts[0].id]
    while (stack.length) {
      const id = stack.pop()!
      if (reachable.has(id)) continue
      reachable.add(id)
      for (const e of outgoing.get(id) || []) stack.push(e.target)
    }
    for (const node of nodes) {
      if (!reachable.has(node.id))
        report("warning", "unreachable", `节点「${node.data?.title || node.id}」无法从开始节点到达`, node.id)
    }
    if (ends.length && !ends.some(e => reachable.has(e.id)))
      report("error", "end_unreachable", "所有结束节点均无法从开始节点到达")
  }
  // Dependencies are resolved by node title at runtime. A syntactically valid
  // reference can still point to a node that cannot have executed yet.
  const ancestors = new Map<string, Set<string>>()
  for (const n of nodes) {
    const seen = new Set<string>()
    const queue = edges.filter(e => e.target === n.id).map(e => e.source)
    while (queue.length) {
      const prev = queue.pop()!
      if (seen.has(prev)) continue
      seen.add(prev)
      for (const edge of edges) if (edge.target === prev) queue.push(edge.source)
    }
    ancestors.set(n.id, seen)
  }
  const loopBodyNodes = new Set<string>()
  for (const loop of nodes.filter(n => n.type === "loop")) {
    const seen = new Set<string>()
    const queue = edges.filter(e => e.source === loop.id && e.sourceHandle !== "done").map(e => e.target)
    while (queue.length) {
      const id = queue.pop()!
      if (seen.has(id) || id === loop.id) continue
      seen.add(id)
      loopBodyNodes.add(id)
      for (const edge of edges) if (edge.source === id) queue.push(edge.target)
    }
  }
  const titleToId = new Map(nodes.map(n => [String(n.data.title || "").trim(), n.id]))
  for (const n of nodes) {
    const fields = ["input_hint", "prompt", "params_template", "output_template", "list_source"]
    const content = fields.map(key => n.data?.[key]).filter((v): v is string => typeof v === "string")
    const unknown = new Set<string>()
    const nonUpstream = new Set<string>()
    const loopOutOfScope = new Set<string>()
    for (const value of content) {
      for (const match of value.matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g)) {
        const ref = match[1].trim()
        if (ref === "input") continue
        if (ref === "loop.item" || ref === "loop.index") {
          if (!loopBodyNodes.has(n.id)) loopOutOfScope.add(ref)
          continue
        }
        if (!ref.endsWith(".output") || !titles.has(ref.slice(0, -7))) {
          unknown.add(ref)
        } else {
          const sourceId = titleToId.get(ref.slice(0, -7))
          if (sourceId && (sourceId === n.id || !ancestors.get(n.id)?.has(sourceId)))
            nonUpstream.add(ref)
        }
      }
    }
    if (unknown.size)
      report("error", "variable_unknown",
        `节点「${n.data.title}」引用了不存在的变量：${[...unknown].slice(0, 3).join("、")}`, n.id)
    if (loopOutOfScope.size)
      report("error", "loop_variable_scope",
        `节点「${n.data.title}」在循环体外使用循环变量：${[...loopOutOfScope].join("、")}`, n.id)
    if (nonUpstream.size)
      report("warning", "variable_not_upstream",
        `节点「${n.data.title}」引用的变量不是确定的上游输出：${[...nonUpstream].slice(0, 3).join("、")}；执行时可能为空`, n.id)
    const refTitle = String(n.data.ref_title || "").trim()
    const refId = titleToId.get(refTitle)
    if (refId && !ancestors.get(n.id)?.has(refId))
      report("warning", "condition_ref_not_upstream",
        `判定来源「${refTitle}」不在当前节点的上游路径，运行时可能退回最近上游输出`, n.id)
  }
  const seen = new Set<string>()
  const active = new Set<string>()
  const dfs = (id: string): boolean => {
    if (active.has(id)) return true
    if (seen.has(id)) return false
    seen.add(id)
    active.add(id)
    for (const edge of outgoing.get(id) || []) {
      if (ids.get(edge.target)?.type === "loop") continue // legal loop return
      if (dfs(edge.target)) return true
    }
    active.delete(id)
    return false
  }
  if (nodes.some(n => dfs(n.id)))
    report("error", "illegal_cycle", "发现未经过循环节点的非法环路")
  return issues
}
