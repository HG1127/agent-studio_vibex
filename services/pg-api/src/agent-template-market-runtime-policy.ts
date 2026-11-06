// Trusted service policy only. No provider, fee, Worker or execution capability.
import {HttpError, type Identity, type SqlClient, type SqlPool} from "./contracts.ts"
export const agentTemplateMarketNativeApproval = "APPROVE_DISPOSABLE_PG18_NATIVE_AGENT_TEMPLATE_MARKET_ONLY" as const
/** Root must import actual verifyAgentTemplateMarketCredentials from the fixed
 * DB-author module once delivered. Never derive this from HTTP, use a scalar
 * permission flag, or substitute a callback returning true in a real service. */
export type AgentTemplateMarketAuditVerifier = (db: SqlClient) => Promise<boolean>
export async function loadAgentTemplateMarketAuditVerifier(): Promise<AgentTemplateMarketAuditVerifier> {
  const verifier: unknown = (await import("./agent-template-market-audit.ts")).verifyAgentTemplateMarketCredentials
  if (typeof verifier !== "function") throw Error("agent_template_market_actual_auditor_required")
  return verifier as AgentTemplateMarketAuditVerifier
}
export type AgentTemplateMarketCapabilities = Readonly<{available: boolean; writes: boolean}>
export function selectNativeAgentTemplateMarketCapabilities(env: Record<string, string | undefined>, listen: boolean, allowedOrigin: string, configurationWrites: boolean): AgentTemplateMarketCapabilities {
  const available = env.AGENT_STUDIO_PG18_AGENT_TEMPLATE_MARKET_AVAILABLE, writes = env.AGENT_STUDIO_PG18_AGENT_TEMPLATE_MARKET_WRITES_ENABLED
  const approval = env.AGENT_STUDIO_PG18_AGENT_TEMPLATE_MARKET_APPROVED
  if (available === undefined && writes === undefined && approval === undefined) return Object.freeze({available: false, writes: false})
  let secure = false
  try {const origin = new URL(allowedOrigin); secure = origin.protocol === "https:" && origin.origin === allowedOrigin} catch {}
  if (!listen || !secure || available !== "true" || writes !== undefined && writes !== "true" || approval !== agentTemplateMarketNativeApproval || writes === "true" && configurationWrites !== true) throw Error("agent_template_market_native_opt_in_refused")
  return Object.freeze({available: true, writes: writes === "true"})
}
export function requireAgentTemplateMarketNative(identity: Identity): void {
  if (identity?.issuer !== "urn:agentstudio:local:v1" || typeof identity.subject !== "string" || !identity.subject || identity.subject.length > 200) throw new HttpError(403, "native_employee_identity_required")
}
export async function requireAgentTemplateMarketAudit(db: SqlClient, verifier: AgentTemplateMarketAuditVerifier | undefined): Promise<void> {
  if (typeof verifier !== "function") throw Error("agent_template_market_actual_auditor_required")
  if (await verifier(db) !== true) throw new HttpError(503, "agent_template_market_schema_required")
}
/** Catalog inspection only. Normal RPC operations must use ordinary withActor
 * transactions because the real source/preview/receipt functions take locks. */
export async function inspectAgentTemplateMarketApiPool(pool: SqlPool, verifier: AgentTemplateMarketAuditVerifier): Promise<void> {
  if (typeof verifier !== "function") throw Error("agent_template_market_actual_auditor_required")
  const db = await pool.connect(); let begun = false
  try {
    await db.query("BEGIN READ ONLY"); begun = true
    await db.query("SET LOCAL ROLE agentstudio_api"); await db.query("SET LOCAL lock_timeout='3s'"); await db.query("SET LOCAL statement_timeout='8s'")
    if ((await db.query<{role: string}>("SELECT current_user AS role")).rows[0]?.role !== "agentstudio_api") throw Error("agent_template_market_api_role_required")
    await requireAgentTemplateMarketAudit(db, verifier)
  } finally {try {if (begun) await db.query("ROLLBACK")} finally {db.release()}}
}
