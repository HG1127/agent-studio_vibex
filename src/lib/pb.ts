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
export const studioAuthStore=new StudioAuthStore()
export const pb = new PocketBase(getPocketBaseUrl(),studioAuthStore)
export function pbAuthHeader(token?: string | null): Record<string, string> {
  return token ? { Authorization: token } : {}
}
