/** Explain a canvas connection failure without allowing a malformed graph through. */
import type { WfNode, WfEdge } from "../pages/WorkflowCanvas/useWorkflowCanvas"
import type { Connection } from "@xyflow/react"

export type WorkflowConnectionGraph = { nodes: WfNode[]; edges: WfEdge[] }

const reachable = (
  graph: WorkflowConnectionGraph,
  start: string,
  destination: string,
  ignoreLoopReturns: boolean,
): boolean => {
  const loops = new Set(graph.nodes.filter(n => n.type === "loop").map(n => n.id))
  const queue = [start]
  const visited = new Set<string>()
  while (queue.length) {
    const id = queue.pop()!
    if (id === destination) return true
    if (visited.has(id)) continue
    visited.add(id)
    for (const e of graph.edges) {
      if (e.source !== id || (ignoreLoopReturns && loops.has(e.target))) continue
      queue.push(e.target)
    }
  }
  return false
}

const inLoopBody = (graph: WorkflowConnectionGraph, source: string, loop: string): boolean => {
  const starts = graph.edges.filter(e => e.source === loop && e.sourceHandle === "body")
    .map(e => e.target)
  const queue = [...starts]
  const seen = new Set<string>()
  while (queue.length) {
    const id = queue.pop()!
    // A loop's "done" branch is outside its body even when the body
    // eventually returns to the loop header.
    if (id === loop || seen.has(id)) continue
    if (id === source) return true
    seen.add(id)
    for (const edge of graph.edges) if (edge.source === id) queue.push(edge.target)
  }
  return false
}

/**
 * null means valid. This must be the single source of truth for the canvas
 * handle validator and its rejection message. A loop return is legal only
 * from a node reachable through that loop's body outlet.
 */
export function workflowConnectionIssue(
  graph: WorkflowConnectionGraph,
  connection: Pick<Connection, "source" | "target" | "sourceHandle" | "targetHandle">,
): string | null {
  const sourceId = connection.source ?? ""
  const targetId = connection.target ?? ""
  if (!sourceId || !targetId) return "请选择两个完整的节点连接点"
  const source = graph.nodes.find(n => n.id === sourceId)
  const target = graph.nodes.find(n => n.id === targetId)
  if (!source || !target) return "节点已经被删除，请重新选择连接点"
  if (sourceId === targetId) return "不能把节点直接连接到自己；循环体需要至少一个中间节点"
  if (source.type === "end") return "结束节点没有输出接口，不能继续连线"
  if (target.type === "start") return "开始节点不接受输入，不能作为连线终点"
  const handle = connection.sourceHandle ?? null
  if (source.type === "condition" && handle !== "true" && handle !== "false")
    return "条件节点必须从「满足」或「不满足」的出口连接"
  if (source.type === "loop" && handle !== "body" && handle !== "done")
    return "循环节点必须从「循环体」或「退出」出口连接"
  if (source.type !== "condition" && source.type !== "loop" && handle)
    return "普通节点不存在此输出端口"
  if (graph.edges.some(e => e.source === sourceId && e.target === targetId &&
      (e.sourceHandle ?? null) === handle))
    return "这条连线已经存在，无需重复连接"
  if ((source.type === "condition" || source.type === "loop") &&
      graph.edges.some(e => e.source === sourceId && (e.sourceHandle ?? null) === handle))
    return "这个出口已有连线；如需修改流程，请先删除旧连线"
  if (graph.edges.length >= 240) return "工作流最多允许240条连线"
  if (target.type === "loop") {
    // Accept ordinary inbound navigation when it does not close a cycle:
    // e.g. start -> loop, model -> loop. An actual return from a body node
    // creates a cycle; no arbitrary source may jump into the loop's middle.
    if (reachable(graph, targetId, sourceId, false) &&
        !inLoopBody(graph, sourceId, targetId))
      return "只有从当前循环的「循环体」出口可到达的节点，才能连回该循环"
  } else if (reachable(graph, targetId, sourceId, true)) {
    return "这条连接会形成非法环路；需要重复执行时请使用「循环」节点"
  }
  if (target.type === "end") {
    for (const loop of graph.nodes.filter(n => n.type === "loop")) {
      if (inLoopBody(graph, sourceId, loop.id))
        return "不能从循环体直接连到结束节点；请先连回循环，再从「退出」出口结束"
    }
  }
  return null
}
