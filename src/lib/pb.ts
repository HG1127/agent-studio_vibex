import PocketBase, { BaseAuthStore, LocalAuthStore } from "pocketbase"
import {ORIGINAL_PG_UI_ENABLED} from './studioBackend'

function legacyBackendBlocked():never{
  if(typeof window!=='undefined')window.dispatchEvent(new CustomEvent('studio:legacy-backend-blocked',{detail:{code:'pocketbase_unavailable_in_pg_runtime'}}))
  throw Error('pocketbase_unavailable_in_pg_runtime')
}

// Completely independent PocketBase backend behind same-origin /__pb.
// Tokens are issued and validated by our own studio_users auth collection.
export function getPocketBaseUrl(): string {
  if(ORIGINAL_PG_UI_ENABLED)return legacyBackendBlocked()
  return "/__pb"
}
export function getBasename(): string {
  return "/"
}
// PG mode must not load or mutate the recoverable PB browser credential store.
export const pb = new PocketBase('/__pb',ORIGINAL_PG_UI_ENABLED?new BaseAuthStore():new LocalAuthStore("agent_studio_employee_auth"))
if(ORIGINAL_PG_UI_ENABLED)pb.beforeSend=()=>legacyBackendBlocked()
export function pbAuthHeader(token?: string | null): Record<string, string> {
  if(ORIGINAL_PG_UI_ENABLED)return legacyBackendBlocked()
  return token ? { Authorization: token } : {}
}
