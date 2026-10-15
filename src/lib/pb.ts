import PocketBase, { LocalAuthStore } from "pocketbase"

// Completely independent PocketBase backend behind same-origin /__pb.
// Tokens are issued and validated by our own studio_users auth collection.
export function getPocketBaseUrl(): string {
  return "/__pb"
}
export function getBasename(): string {
  return "/"
}
export const pb = new PocketBase(getPocketBaseUrl(), new LocalAuthStore("agent_studio_employee_auth"))
export function pbAuthHeader(token?: string | null): Record<string, string> {
  return token ? { Authorization: token } : {}
}
