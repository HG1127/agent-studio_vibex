/**
 * Narrow, explicit contract for testing ONE model node with the employee's
 * existing, owner-scoped model connection. This payload never allows tools,
 * arbitrary endpoints, or a default-model fallback.
 *
 * This helper is pure so it can be audited/tested without making API calls.
 */
export const WORKFLOW_MODEL_DEBUG_MAX_PROMPT = 8000
export const WORKFLOW_MODEL_DEBUG_MAX_TOKENS = 512

export type WorkflowModelDebugPayload = {
  connection_id: string
  model: string
  messages: [{ role: "user"; content: string }]
  page: "workflow_node_debug"
  max_tokens: number
  request_id: string
  strict_model: true
}

/** Parse a model choice only from the explicit custom-connection format. */
export function parseWorkflowDebugModel(value: string): { connectionId: string; modelId: string } | null {
  if (!value.startsWith("custom:")) return null
  const raw = value.slice("custom:".length)
  const index = raw.indexOf(":")
  if (index < 0) return null
  const connectionId = raw.slice(0, index)
  const modelId = raw.slice(index + 1)
  if (!/^[a-z0-9]{10,32}$/i.test(connectionId) ||
      !modelId || modelId.length > 150 ||
      Array.from(modelId).some(char => char.charCodeAt(0) < 32)) return null
  return { connectionId, modelId }
}

export function createWorkflowModelDebugPayload(
  selectedModel: string,
  employeeModels: readonly string[],
  previewPrompt: string,
  requestId: string,
): WorkflowModelDebugPayload {
  const selection = parseWorkflowDebugModel(selectedModel)
  if (!selection || !employeeModels.includes(selectedModel))
    throw new Error("此模型不在当前账号已启用的连接列表中，请先重新选择")
  if (!/^[a-zA-Z0-9-]{12,120}$/.test(requestId))
    throw new Error("请求编号格式无效")
  const content = previewPrompt.trim()
  if (!content) throw new Error("模型提示词为空，无法执行")
  if (content.length > WORKFLOW_MODEL_DEBUG_MAX_PROMPT)
    throw new Error("节点调试提示词超过 8000 字符上限")
  return {
    connection_id: selection.connectionId,
    model: selection.modelId,
    messages: [{ role: "user", content }],
    page: "workflow_node_debug",
    max_tokens: WORKFLOW_MODEL_DEBUG_MAX_TOKENS,
    request_id: requestId,
    strict_model: true,
  }
}
