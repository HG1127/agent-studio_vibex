import { pb } from "./pb"
import { getStudioApiRoot, ORIGINAL_PG_UI_ENABLED } from "./studioBackend"
import { createPgEmployeeSession, PgNativeSessionError } from "./pgNativeSession"
import { createStudioPgAuthAdapter } from "./studioPgAuthAdapter"

const pgAuth = ORIGINAL_PG_UI_ENABLED
  ? createStudioPgAuthAdapter(createPgEmployeeSession((input, init) => {
      if (typeof input !== "string" || !input.startsWith("/api/native-auth/"))
        return Promise.reject(new Error("invalid_studio_session_route"))
      return fetch(getStudioApiRoot() + input, init)
    }))
  : null

export type StudioProfile = {
  id: string
  email: string
  display_name: string
  role: "admin" | "employee"
  active: boolean
  share_enabled: boolean
}

export function vibexAuthHeaders(): Record<string, string> {
  if (pgAuth) return {}
  return pb.authStore.token ? { Authorization: pb.authStore.token } : {}
}

// Compatibility names used by the existing Agent/Workflow pages, but the
// implementation follows the explicit, server-verified employee backend.
export function decodeRhToken(): { sub: string; nickName?: string } | null {
  if (pgAuth) return pgAuth.identity()
  const record = pb.authStore.record
  return pb.authStore.isValid && record && record.active === true
    ? { sub: record.id, nickName: String(record.display_name || record.email || "") }
    : null
}

export function redirectToRhLogin(): void {
  if (typeof window === "undefined") return
  if (window.location.pathname === "/login") return
  const next = window.location.pathname + window.location.search
  window.location.assign("/login?next=" + encodeURIComponent(next))
}

// Coalesce all authenticated-session validation into ONE PocketBase refresh.
// React StrictMode, login redirect, and account menu must not race/auto-cancel
// duplicate auth-refresh requests and accidentally clear a valid JWT.
export type StudioSessionStatus = "authenticated" | "signed_out" | "unavailable"
let refreshInFlight: Promise<StudioSessionStatus> | null = null

export function verifyStudioSession(): Promise<StudioSessionStatus> {
  if (pgAuth) return pgAuth.verify()
  if (!pb.authStore.isValid) {
    pb.authStore.clear()
    return Promise.resolve("signed_out")
  }
  if (refreshInFlight) return refreshInFlight

  const startingToken = pb.authStore.token
  const pending: Promise<StudioSessionStatus> = (async () => {
    try {
      // requestKey:null disables SDK cancellation if an external caller also
      // makes an authentication call. The shared promise prevents duplicates here.
      const result = await pb.collection("studio_users").authRefresh({ requestKey: null })
      if (result.record.active !== true) {
        pb.authStore.clear()
        return "signed_out"
      }
      return "authenticated"
    } catch (error) {
      const status = typeof error === "object" && error !== null && "status" in error
        ? Number((error as { status?: number }).status ?? 0) : 0
      // Only a verified authorization rejection invalidates the local session.
      // Aborted requests and temporary network/5xx errors are NOT logout.
      if (status === 401 || status === 403) {
        if (pb.authStore.token === startingToken) pb.authStore.clear()
        return "signed_out"
      }
      return "unavailable"
    }
  })()
  refreshInFlight = pending
  void pending.then(
    () => { if (refreshInFlight === pending) refreshInFlight = null },
    () => { if (refreshInFlight === pending) refreshInFlight = null },
  )
  return pending
}

/** Read only: the route guard has already verified the employee session. */
export function getStudioAccountInfo(): StudioProfile | null {
  if (pgAuth) return pgAuth.account()
  const record = pb.authStore.record
  if (!pb.authStore.isValid || !record || record.active !== true) return null
  return {
    id: record.id,
    email: String(record.email || ""),
    display_name: String(record.display_name || record.email || ""),
    role: record.role === "admin" ? "admin" : "employee",
    active: true,
    share_enabled: record.share_enabled === true,
  }
}

export function logoutStudioAccount(): Promise<void> {
  if (pgAuth) {
    return pgAuth.signOut().then(() => {
      if (typeof window !== "undefined") window.location.assign("/login")
    })
  }
  pb.authStore.clear()
  if (typeof window !== "undefined") window.location.assign("/login")
  return Promise.resolve()
}

export type StudioLoginSetup = { initialized: boolean; can_setup: boolean }

/** Cookie existence is intentionally unreadable to JavaScript. */
export function shouldCheckStudioSession(): boolean {
  return pgAuth !== null || pb.authStore.isValid
}

export async function readStudioLoginSetup(verifiedStatus?: StudioSessionStatus): Promise<StudioLoginSetup> {
  if (pgAuth) {
    const status = verifiedStatus ?? await pgAuth.verify()
    if (status === "unavailable") throw new Error("studio_status_unavailable")
    // Existing form view state only: normal employee login, no public setup.
    // This is not a database-initialization assertion or an enrollment receipt.
    return { initialized: true, can_setup: false }
  }
  const response = await fetch(getStudioApiRoot() + "/api/studio/bootstrap/status")
  if (!response.ok) throw new Error("studio_status_unavailable")
  const value: unknown = await response.json()
  if (!value || typeof value !== "object" ||
      !("initialized" in value) || typeof value.initialized !== "boolean" ||
      !("can_setup" in value) || typeof value.can_setup !== "boolean")
    throw new Error("studio_status_unavailable")
  return { initialized: value.initialized, can_setup: value.can_setup }
}

export async function initializeStudioAdmin(input: {
  email: string; password: string; display_name: string; setup_key: string
}): Promise<void> {
  if (pgAuth) throw new Error("PG 首位管理员须由部署人员通过现有运维流程初始化。")
  const response = await fetch(getStudioApiRoot() + "/api/studio/bootstrap", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Agent-Studio-Setup-Key": input.setup_key },
    body: JSON.stringify({ email: input.email, password: input.password, display_name: input.display_name }),
  })
  if (!response.ok) {
    const data = await response.json().catch(() => ({})) as { error?: string }
    throw new Error(data.error === "already_initialized"
      ? "已经有管理员账号，请返回登录。" : "初始化失败，请核对初始化密钥、邮箱和密码。")
  }
}

export async function signInStudioAccount(email: string, password: string): Promise<void> {
  if (pgAuth) { await pgAuth.signIn(email, password); return }
  await pb.collection("studio_users").authWithPassword(email.trim(), password)
}

export function studioLoginErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : ""
  if (message.includes("初始化失败") || message.includes("已经有")) return message
  if (ORIGINAL_PG_UI_ENABLED && error instanceof PgNativeSessionError) {
    if (error.status === 429) return "登录尝试过于频繁，请稍后重试。"
    if (error.status === 0 || error.status === 403 || error.status >= 500 || error.code === "invalid_native_response")
      return "账号服务暂时无法验证登录，请稍后重试或重新连接。"
  }
  return "登录失败，请检查邮箱、密码或账号是否已被停用。"
}

/** Compatibility for the unchanged account menu, after AuthGate verified it. */
export async function fetchStudioAccountInfo(): Promise<StudioProfile | null> {
  return getStudioAccountInfo()
}
