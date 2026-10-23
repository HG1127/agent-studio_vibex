// Shared timeout policy for the standalone Worker HTTP boundary.
// The inner synchronous model request is capped at 240 seconds. Keep this
// proxy request longer than the model window so it can return a durable result
// instead of aborting the outer worker while the PocketBase tick is still live.
export const MODEL_HTTP_TIMEOUT_SECONDS = 240
export const WORKER_PROXY_MARGIN_MS = 60_000
export const DEFAULT_WORKER_REQUEST_TIMEOUT_MS =
  MODEL_HTTP_TIMEOUT_SECONDS * 1000 + WORKER_PROXY_MARGIN_MS + 15_000
export const MAX_WORKER_REQUEST_TIMEOUT_MS = 330_000

export function resolveWorkerRequestTimeout(value) {
  const n = Number(value)
  if (!Number.isFinite(n) || n < 5000 || n > MAX_WORKER_REQUEST_TIMEOUT_MS) {
    return DEFAULT_WORKER_REQUEST_TIMEOUT_MS
  }
  return Math.floor(n)
}
