/** A selectable, employee-owned design-model binding; never contains an API key. */
export type AgentDesignModelOption = {
  key: string
  connectionId: string
  connectionName: string
  modelId: string
}

export function availableAgentDesignModels(items: unknown): AgentDesignModelOption[] {
  if (!Array.isArray(items)) return []
  const options: AgentDesignModelOption[] = []
  const seen = new Set<string>()
  for (const value of items.slice(0, 100)) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue
    const row = value as Record<string, unknown>
    if (row.enabled !== true || typeof row.id !== "string" || !row.id.trim() ||
        !Array.isArray(row.models)) continue
    const connectionId = row.id.trim().slice(0, 128)
    const connectionName = typeof row.name === "string"
      ? row.name.trim().slice(0, 120) : "已授权模型连接"
    for (const model of row.models.slice(0, 80)) {
      if (typeof model !== "string" || !model.trim() || model.trim().length > 160) continue
      const modelId = model.trim()
      const key = JSON.stringify([connectionId, modelId])
      if (seen.has(key)) continue
      seen.add(key)
      options.push({key, connectionId, connectionName, modelId})
    }
  }
  return options
}

/** Explicitly selected models never silently fall back if the connection changes. */
export function chooseAgentDesignModel(
  options: readonly AgentDesignModelOption[],
  selectedKey: string,
): AgentDesignModelOption | null {
  // One available model is unambiguous. With multiple models require an
  // explicit choice, so a mock/secondary provider cannot silently win.
  if (!selectedKey) return options.length === 1 ? options[0] : null
  return options.find(item => item.key === selectedKey) || null
}
