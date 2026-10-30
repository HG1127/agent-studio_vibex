/**
 * Converts server-verified MCP marketplace connections into selectors for an Agent.
 * A marketplace selection is not itself a grant: the Agent executor rechecks
 * owner, enabled status, last_probe_status and the exact tool snapshot.
 */
export type VerifiedMarketTool = {
  id: string
  name: string
  label: string
  description: string
  connectionTitle: string
  readOnly: boolean
  destructive: boolean
}

type MarketConnectionItem = {
  id?: string
  title?: string
  server_name?: string
  enabled?: boolean
  last_probe_status?: string
  tool_count?: number
  tools?: { name?: string; description?: string; read_only?: boolean; destructive?: boolean }[]
}

export function toMarketToolId(connectionId: string, name: string): string {
  return `mkt__${connectionId}__${name}`
}

export function getVerifiedMarketTools(input: unknown): VerifiedMarketTool[] {
  if (!Array.isArray(input)) return []
  const result: VerifiedMarketTool[] = []
  const seen=new Set<string>()
  for (const row of input.slice(0,50) as MarketConnectionItem[]) {
    if (!row || row.enabled!==true || row.last_probe_status!=="ok" || Number(row.tool_count||0)<=0) continue
    const connectionId=String(row.id||"").trim()
    if (!/^[a-zA-Z0-9]{15}$/.test(connectionId)) continue
    const title=String(row.title||row.server_name||"市场插件").trim().slice(0,70)
    const tools=Array.isArray(row.tools)?row.tools:[]
    for (const tool of tools) {
      const name=String(tool?.name||"").trim()
      if (!name || name.length>120 || !/^[a-zA-Z0-9_./:-]+$/.test(name)) continue
      const id=toMarketToolId(connectionId,name)
      if(seen.has(id))continue
      seen.add(id)
      result.push({
        id,name,connectionTitle:title,label:`${title} · ${name}`,
        description:String(tool?.description||"已验证的插件工具").slice(0,280),
        readOnly:tool?.read_only===true,
        destructive:tool?.destructive===true,
      })
      if(result.length>=60)return result
    }
  }
  return result
}
