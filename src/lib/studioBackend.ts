/** Explicit opt-in for an isolated original-page build. The normal build leaves
 * this flag absent. Selection grants no server capability or PB fallback. */
export const ORIGINAL_PG_UI_ENABLED =
  import.meta.env.VITE_AGENT_STUDIO_ORIGINAL_PG_UI_ENABLED === "true"
const backend = ORIGINAL_PG_UI_ENABLED ? "native_pg" : "pocketbase"

export function getStudioBackend(): "pocketbase" | "native_pg" { return backend }
export function getStudioApiRoot(): "/__pb" | "/__pg_native" {
  return ORIGINAL_PG_UI_ENABLED ? "/__pg_native" : "/__pb"
}
export function getStudioBasename(): string { return "/" }
