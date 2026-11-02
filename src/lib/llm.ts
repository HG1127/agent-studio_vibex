import { pb, getPocketBaseUrl } from "./pb"
import { getAuthHeaders } from "./auth"

export type LlmContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } }

export interface LlmMessage {
  role: "system" | "user" | "assistant"
  content: string | LlmContentPart[]
}

export interface LlmCallOptions {
  messages: LlmMessage[]
  page?: string
  max_tokens?: number
  temperature?: number
  signal?: AbortSignal
  request_id?: string
  /** Account-owned saved connection; required when the user selects a model. */
  connection_id?: string
  /** Fail closed if the selected model disappears; never silently fall back. */
  strict_model?: boolean
}

export interface LlmCallResult {
  ok: boolean
  status: "success" | "failed" | "running" | "pending" | "not_found"
  text: string
  error?: string
  model?: string
  usage?: unknown
  needsLogin?: boolean
}

export interface LlmModelInfo {
  model: string
  rh_model_id: string
  max_tokens: number
  timeout_s: number
  supports_temperature: boolean
}

// The synchronous backend permits two 120s provider attempts. Keep the
// renderer's deadline outside that budget; proxies can still disconnect early,
// in which case we query the SAME job without resubmitting a paid request.
const CHAT_ABORT_MS = 255000
const POLL_ABORT_MS = 12000
const POLL_INTERVAL_MS = 3000
const POLL_ATTEMPTS = 200

// 老代际后端兼容 (发布刷新契约, rh_vc_deploy 依赖 "legacyLlmRoutes" 这个标记判断
// 本模板可以安全刷进老 app):
// 2026-07-01 aa25af8 之前的 llm.pb.js 注册的是按模型分路由
// (/api/llm/<model>/chat|poll), 没有扁平路由 /api/llm/chat|poll。
// 发布刷新只换前端 lib、不动 app 已装的 pb_hooks, 所以扁平路由 404 时自动降级
// 到按模型路由并记住结果 (同一个后端只有一种代际)。新后端永远不会命中 404,
// 这个分支零开销。
let legacyLlmRoutes: boolean | null = null

function llmUrl(kind: "chat" | "poll", modelName: string, strict = false): string {
  const base = getPocketBaseUrl()
  // Explicit connection + model bindings require the modern flat routes;
  // legacy routes cannot prove the requested employee-owned connection.
  if (strict) return `${base}/api/llm/${kind}`
  return legacyLlmRoutes === true
    ? `${base}/api/llm/${encodeURIComponent(modelName)}/${kind}`
    : `${base}/api/llm/${kind}`
}

function uuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID()
  }
  return "req-" + Date.now().toString(16) + "-" + Math.random().toString(16).slice(2, 10)
}

function buildHeaders(): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json", ...getAuthHeaders() }
  if (pb.authStore.token) headers.Authorization = pb.authStore.token
  return headers
}

async function pollOnce(modelName: string, requestId: string, strict = false, signal?: AbortSignal): Promise<LlmCallResult> {
  const ctrl = new AbortController()
  const abort = () => ctrl.abort()
  const timeoutId = window.setTimeout(abort, POLL_ABORT_MS)
  signal?.addEventListener("abort", abort, { once: true })
  if (signal?.aborted) ctrl.abort()
  let res: Response
  try {
    res = await fetch(llmUrl("poll", modelName, strict), {
      method: "POST",
      credentials: "include",
      headers: buildHeaders(),
      body: JSON.stringify({ request_id: requestId }),
      signal: ctrl.signal,
    })
    if (res.status === 401 || res.status === 412) {
      return { ok: false, status: "failed", text: "", error: "rh_login_required", needsLogin: true }
    }
    // Missing routes/jobs fail quickly rather than polling for ten minutes.
    if (res.status === 404) return { ok: false, status: "not_found", text: "", error: "" }
    if (!res.ok) return { ok: false, status: "running", text: "", error: "" }
    const data = await res.json()
    return {
      ok: !!data.ok,
      status: data.status || "running",
      text: data.text || "",
      error: data.error || "",
      model: data.model,
    }
  } catch {
    return { ok: false, status: "running", text: "", error: "" }
  } finally {
    window.clearTimeout(timeoutId)
    signal?.removeEventListener("abort", abort)
  }
}

export async function callLlmWithFallback(modelName: string, opts: LlmCallOptions): Promise<LlmCallResult> {
  const cancelled = (): LlmCallResult => ({ok:false,status:"failed",text:"",error:"cancelled"})
  if (opts.signal?.aborted) return cancelled()
  const requestId = opts.request_id || uuid()
  const payload: Record<string, unknown> = {
    model: modelName,
    messages: opts.messages,
    page: opts.page || "",
    max_tokens: opts.max_tokens,
    request_id: requestId,
    ...(opts.connection_id ? {connection_id: opts.connection_id} : {}),
    ...(opts.strict_model === true ? {strict_model: true} : {}),
  }
  if (opts.temperature !== undefined && opts.temperature !== null && !/gpt-?5/i.test(modelName)) {
    payload.temperature = opts.temperature
  }

  const ctrl = new AbortController()
  const abort = () => ctrl.abort()
  const timeoutId = window.setTimeout(abort, CHAT_ABORT_MS)
  opts.signal?.addEventListener("abort", abort, { once: true })

  let initialFailed = false
  try {
    let res = await fetch(llmUrl("chat", modelName, opts.strict_model === true), {
      method: "POST",
      credentials: "include",
      headers: buildHeaders(),
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    })
    if (res.status === 404 && opts.strict_model === true) {
      return {ok:false,status:"failed",text:"",error:"strict_model_route_unavailable"}
    }
    if (res.status === 404 && legacyLlmRoutes === null) {
      // 扁平路由不存在 → 老代际后端, 降级重试按模型路由。
      legacyLlmRoutes = true
      res = await fetch(llmUrl("chat", modelName), {
        method: "POST",
        credentials: "include",
        headers: buildHeaders(),
        body: JSON.stringify(payload),
        signal: ctrl.signal,
      })
      if (res.status === 404) {
        // 两种代际都 404: 后端根本没装这个模型的 llm 路由, 快速失败, 不进 poll。
        legacyLlmRoutes = null
        return { ok: false, status: "failed", text: "", error: "not_found" }
      }
    }
    if (res.status === 401 || res.status === 412) {
      return { ok: false, status: "failed", text: "", error: "rh_login_required", needsLogin: true }
    }
    // Invalid/removed employee model bindings are rejected before a provider
    // request. Polling them for ten minutes cannot help and looks like a hang.
    if (res.status >= 400 && res.status < 500) {
      const denied = await res.json().catch(() => ({})) as {error?:unknown}
      const code = typeof denied.error === "string" && /^[a-z_]{1,60}$/.test(denied.error)
        ? denied.error : `provider_http_${res.status}`
      return {ok:false,status:"failed",text:"",error:code}
    }
    if (res.ok) {
      const data = await res.json()
      const result: LlmCallResult = {
        ok: !!data.ok,
        status: data.status || "success",
        text: data.text || "",
        error: data.error || "",
        model: data.model,
        usage: data.usage,
      }
      // A duplicate submission may return a pending/running job. Resume
      // polling it instead of treating acceptance as a generation failure.
      if (result.status !== "running" && result.status !== "pending") return result
    }
    initialFailed = true
  } catch {
    initialFailed = true
  } finally {
    window.clearTimeout(timeoutId)
    opts.signal?.removeEventListener("abort", abort)
  }

  if (opts.signal?.aborted) return cancelled()
  if (!initialFailed) return { ok: false, status: "failed", text: "", error: "unknown" }

  let notFoundCount = 0
  const pollDeadline = Date.now() + POLL_ATTEMPTS * POLL_INTERVAL_MS
  for (let i = 0; i < POLL_ATTEMPTS && Date.now() < pollDeadline; i++) {
    await new Promise<void>((resolve) => {
      const done = () => {
        window.clearTimeout(timer)
        opts.signal?.removeEventListener("abort", done)
        resolve()
      }
      const timer = window.setTimeout(done, POLL_INTERVAL_MS)
      opts.signal?.addEventListener("abort", done, { once: true })
      if (opts.signal?.aborted) done()
    })
    if (opts.signal?.aborted) return cancelled()
    const r = await pollOnce(modelName, requestId, opts.strict_model === true, opts.signal)
    if (opts.signal?.aborted) return cancelled()
    if (r.needsLogin) return r
    if (r.status === "success") return r
    if (r.status === "failed") return r
    if (r.status === "not_found") {
      notFoundCount++
      if (notFoundCount >= 3) return { ok: false, status: "failed", text: "", error: "not_found" }
    } else {
      notFoundCount = 0
    }
  }
  return { ok: false, status: "failed", text: "", error: "timeout" }
}

export async function listLlmModels(): Promise<LlmModelInfo[]> {
  const res = await fetch(`${getPocketBaseUrl()}/api/llm/models`, {
    method: "GET",
    credentials: "include",
    headers: buildHeaders(),
  })
  if (!res.ok) return []
  const data = (await res.json().catch(() => ({}))) as { models?: LlmModelInfo[] }
  return Array.isArray(data.models) ? data.models : []
}
