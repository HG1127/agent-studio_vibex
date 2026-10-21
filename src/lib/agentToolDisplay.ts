import type { ConnectedToolOption } from "../pages/Home/presets"
import type { VerifiedMarketTool } from "./marketToolSelection"

export type AgentToolCatalog = {
  builtinTools?: readonly { id: string; title: string; desc: string }[]
  connectedTools?: readonly ConnectedToolOption[]
  connectedMarketTools?: readonly VerifiedMarketTool[]
}

export type AgentToolDisplay = {
  id: string
  label: string
  description: string
  sourceLabel: string
  accessLabel: string
}

/** Display metadata only. Exact catalog IDs remain the authority for a selection. */
export function agentToolDisplay(id: string, catalog: AgentToolCatalog): AgentToolDisplay {
  const builtin = catalog.builtinTools?.find(tool => tool.id === id)
  if (builtin) return { id, label: builtin.title, description: builtin.desc,
    sourceLabel: "内置工具", accessLabel: "读取 / 分析" }
  const market = catalog.connectedMarketTools?.find(tool => tool.id === id)
  if (market) return { id, label: market.label, description: market.description,
    sourceLabel: "市场插件", accessLabel: market.destructive ? "含破坏性操作" : market.readOnly ? "只读" : "可能写入" }
  const http = catalog.connectedTools?.find(tool => tool.name === id)
  if (http) {
    const method = String(http.method || "").toUpperCase()
    return { id, label: http.name, description: http.description,
      sourceLabel: "HTTP 连接", accessLabel: method === "GET" ? "只读" :
        ["POST", "PUT", "PATCH", "DELETE"].includes(method) ? "操作 / 写入" : "读写类型未确认" }
  }
  const marketName = /^mkt__[A-Za-z0-9]{15}__(.+)$/.exec(id)?.[1]
  return { id, label: marketName || id, sourceLabel: "连接待核验", accessLabel: "读写类型未确认",
    description: "当前工具目录中未找到此工具，请核对连接状态。" }
}
