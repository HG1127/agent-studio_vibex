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

export async function fetchStudioAccountInfo(): Promise<StudioProfile | null> {
  if (!pb.authStore.isValid) {
    pb.authStore.clear()
    return null
  }
  try {
    const result = await pb.collection("studio_users").authRefresh()
    const record = result.record
    if (record.active !== true) throw new Error("account_disabled")
    return {
      id: record.id,
      email: String(record.email || ""),
      display_name: String(record.display_name || record.email || ""),
      role: record.role === "admin" ? "admin" : "employee",
      active: true,
      share_enabled: record.share_enabled === true,
    }
  } catch {
    pb.authStore.clear()
    return null
  }
}

export function logoutStudioAccount(): void {
  pb.authStore.clear()
  if (typeof window !== "undefined") window.location.assign("/login")
}
