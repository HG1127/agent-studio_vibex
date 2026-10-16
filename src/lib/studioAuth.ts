import { pb } from "./pb"

export type StudioProfile = {
  id: string
  email: string
  display_name: string
  role: "admin" | "employee"
  active: boolean
  share_enabled: boolean
}

export function vibexAuthHeaders(): Record<string, string> {
  return pb.authStore.token ? { Authorization: pb.authStore.token } : {}
}

// Compatibility names used by the existing Agent/Workflow pages, but the
// implementation uses first-party PocketBase authentication only.
export function decodeRhToken(): { sub: string; nickName?: string } | null {
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

export function logoutStudioAccount(): void {
  pb.authStore.clear()
  if (typeof window !== "undefined") window.location.assign("/login")
}
