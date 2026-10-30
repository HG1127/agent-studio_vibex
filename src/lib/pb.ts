import PocketBase from "pocketbase"
import {StudioAuthStore} from "./studioAuthStore"

// Completely independent PocketBase backend behind same-origin /__pb.
// Tokens are issued and validated by our own studio_users auth collection.
export function getPocketBaseUrl(): string {
  return "/__pb"
}
export function getBasename(): string {
  return "/"
}

/** Public server address in pairing tickets; API requests stay on the local desktop proxy. */
export function getConnectionServerUrl(): string {
  const desktop = (window as Window & {__STUDIO_DESKTOP_SERVER_ORIGIN__?: string}).__STUDIO_DESKTOP_SERVER_ORIGIN__
  return new URL(getPocketBaseUrl(), desktop || window.location.origin).href
}
export const studioAuthStore=new StudioAuthStore()
export const pb = new PocketBase(getPocketBaseUrl(),studioAuthStore)
export function pbAuthHeader(token?: string | null): Record<string, string> {
  return token ? { Authorization: token } : {}
}
