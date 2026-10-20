import { adaptHarnessData, HARNESS_SOURCES, isHarnessAuthFailure, type SourceKey } from "./harnessData.ts"

export class HarnessAuthError extends Error {}

/** Inject transport for tests; never accept a caller-supplied owner identity. */
export async function requestHarnessSource(key: SourceKey, base: string, headers: Record<string, string>, signal: AbortSignal, transport: typeof fetch = fetch) {
  const response = await transport(base + HARNESS_SOURCES[key].path, { headers, signal, cache: "no-store" })
  signal.throwIfAborted()
  if (isHarnessAuthFailure(response.status)) throw new HarnessAuthError("employee_session_required")
  if (!response.ok) throw Error(`HTTP ${response.status}`)
  const data = adaptHarnessData(key, await response.json())
  signal.throwIfAborted()
  return data
}
