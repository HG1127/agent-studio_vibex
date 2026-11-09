/**
 * Compares the *content* of an Agent plan at test time with the current saved
 * plan. Object insertion order is irrelevant; array order is meaningful.
 * Unknown/missing run snapshots fail closed: never call an old run "passed".
 */
function normalized(value: unknown, depth = 0): unknown {
  if (depth > 30) throw new Error("AgentSpec nesting limit exceeded")
  if (Array.isArray(value)) return value.map(item => normalized(item, depth + 1))
  if (value !== null && typeof value === "object") {
    const row=value as Record<string,unknown>
    const next: Record<string,unknown>={}
    for (const key of Object.keys(row).sort()) {
      if (key==="__proto__" || key==="constructor" || key==="prototype") throw new Error("Unsafe property in AgentSpec")
      if (row[key] !== undefined) next[key]=normalized(row[key], depth + 1)
    }
    return next
  }
  if (value === null || ["string","boolean","number"].includes(typeof value)) return value
  throw new Error("Unsupported AgentSpec value")
}
export function matchesAgentSpecSnapshot(current: unknown, runSnapshot: unknown): boolean {
  if (!current || !runSnapshot ||
      Array.isArray(current) || Array.isArray(runSnapshot) ||
      typeof current!=="object" || typeof runSnapshot!=="object") return false
  try {return JSON.stringify(normalized(current))===JSON.stringify(normalized(runSnapshot))}
  catch {return false}
}
