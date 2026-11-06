import { safeMarketplaceQuery } from "./toolSearchPrivacy.ts"

export type SmitheryCandidate = { slug: string; title: string; desc: string; query: string }
export type SmitheryDiscoveryState = "idle" | "needs_key" | "ok" | "unavailable"
export type SmitheryDiscoveryResult = { state: SmitheryDiscoveryState; items: SmitheryCandidate[] }

type Params = {
  baseUrl: string
  searchTerms: string[]
  headers: Record<string, string>
  signal?: AbortSignal
  fetcher?: typeof fetch
}

/**
 * Resolve account-scoped Smithery availability before searching the remote
 * catalog. Missing credentials are a normal setup state, not eight failed
 * discovery requests. No raw Agent goal or private instructions are sent.
 */
export async function discoverSmitheryCandidates({
  baseUrl, searchTerms, headers, signal, fetcher = fetch,
}: Params): Promise<SmitheryDiscoveryResult> {
  const queries = [...new Set(searchTerms.map(term => safeMarketplaceQuery(term)).filter(Boolean))].slice(0, 3)
  if (!queries.length) return { state: "idle", items: [] }

  const requestSignal = () => signal
    ? AbortSignal.any([signal, AbortSignal.timeout(12_000)])
    : AbortSignal.timeout(12_000)

  try {
    const statusResponse = await fetcher(baseUrl + "/api/market/smithery/status", {
      headers, signal: requestSignal(),
    })
    if (!statusResponse.ok) return { state: "unavailable", items: [] }
    const status = await statusResponse.json().catch(() => null) as { ok?: unknown; has_key?: unknown } | null
    if (!status || status.ok !== true || typeof status.has_key !== "boolean")
      return { state: "unavailable", items: [] }
    if (!status.has_key) return { state: "needs_key", items: [] }
  } catch {
    return { state: "unavailable", items: [] }
  }

  const responses = await Promise.all(queries.map(async query => {
    try {
      const response = await fetcher(baseUrl +
        "/api/market/smithery/v2/catalog?q=" + encodeURIComponent(query.slice(0, 90)), {
        headers, signal: requestSignal(),
      })
      if (response.status === 400) {
        const data = await response.json().catch(() => null) as { error?: unknown } | null
        return { state: data?.error === "smithery_key_required" ? "needs_key" : "unavailable", items: [] as SmitheryCandidate[] }
      }
      if (!response.ok) return { state: "unavailable", items: [] as SmitheryCandidate[] }
      const data = await response.json().catch(() => null) as { items?: unknown } | null
      const rows = Array.isArray(data?.items) ? data.items : []
      const items = rows.filter((item: {slug?: unknown; verified?: unknown}) =>
        item && item.verified === true && typeof item.slug === "string" &&
        /^[a-zA-Z0-9@_/-]{1,120}$/.test(item.slug)).slice(0, 3)
        .map((row: {slug: string; title?: string; desc?: string}) => ({
          slug: row.slug, title: String(row.title || row.slug).slice(0, 100),
          desc: String(row.desc || "").slice(0, 180), query,
        }))
      return { state: "ok", items }
    } catch {
      return { state: "unavailable", items: [] as SmitheryCandidate[] }
    }
  }))

  // A revoked credential wins over any earlier successful request: do not
  // offer results from a partially invalidated authorization context.
  if (responses.some(row => row.state === "needs_key")) return { state: "needs_key", items: [] }
  const state: SmitheryDiscoveryState = responses.some(row => row.state === "ok") ? "ok" : "unavailable"
  const seen = new Set<string>()
  const items = responses.flatMap(row => row.items).filter(row => {
    if (seen.has(row.slug)) return false
    seen.add(row.slug)
    return true
  }).slice(0, 6)
  return { state, items }
}
