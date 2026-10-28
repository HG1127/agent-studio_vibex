import type {SqlClient, SqlPool} from "./contracts.ts"
export const agentDesignExecutionApproval = "APPROVE_DISPOSABLE_PG18_AGENT_DESIGN_EXECUTION_ONLY" as const
export const agentDesignPrivateRoute = "/__internal/v1/agent-design/dispatch" as const
export const agentDesignPrivateRequestBytes = 2048
export const agentDesignPrivateReplyBytes = 2048
export type AgentDesignActivation = {executionEnabled?: boolean; executionApproval?: string}
/** Root must wire the real DB author's auditor against the original client.
 * This trusted-server dependency is never accepted from HTTP/SDK payloads. */
export type AgentDesignAuditVerifier = (db: SqlClient) => Promise<boolean>
export const agentDesignNativeApproval = "APPROVE_DISPOSABLE_PG18_NATIVE_AGENT_DESIGN_ONLY" as const
export function selectNativeAgentDesignCapabilities(env: Record<string, string | undefined>, listen: boolean, allowedOrigin: string, configurationWrites: boolean) {
  const keys = ["AGENT_STUDIO_PG18_AGENT_DESIGN_AVAILABLE", "AGENT_STUDIO_PG18_AGENT_DESIGN_SUBMISSIONS_ENABLED", "AGENT_STUDIO_PG18_AGENT_DESIGN_SAVES_ENABLED"] as const
  const values = keys.map(key => env[key]), approval = env.AGENT_STUDIO_PG18_AGENT_DESIGN_APPROVED
  if (values.every(v => v === undefined) && approval === undefined) return {available: false, submissions: false, saves: false}
  let originValid = false
  try {const origin = new URL(allowedOrigin); originValid = origin.protocol === "https:" && origin.origin === allowedOrigin} catch {}
  if (!listen || !originValid || values.some(v => v !== undefined && v !== "true") || values[0] !== "true" || approval !== agentDesignNativeApproval || (values[1] === "true" || values[2] === "true") && configurationWrites !== true) throw Error("agent_design_native_opt_in_refused")
  return {available: true, submissions: values[1] === "true", saves: values[2] === "true"}
}
// A fixed runtime dependency, resolved only after explicit feature opt-in. This
// loads the DB author's actual auditor; no fallback accepts a missing module.
export async function loadAgentDesignAuditVerifier(): Promise<AgentDesignAuditVerifier> {
  const modulePath = "./agent-design-audit.ts"
  const value: unknown = (await import(modulePath)).verifyAgentDesignCredentials
  if (typeof value !== "function") throw Error("agent_design_actual_auditor_required")
  return value as AgentDesignAuditVerifier
}
export async function inspectAgentDesignApiPool(pool: SqlPool, audit: AgentDesignAuditVerifier): Promise<void> {
  const db = await pool.connect(); let begun = false
  try {
    await db.query("BEGIN READ ONLY"); begun = true
    await db.query("SET LOCAL ROLE agentstudio_api"); await db.query("SET LOCAL lock_timeout='3s'"); await db.query("SET LOCAL statement_timeout='8s'")
    if ((await db.query<{role: string}>("SELECT current_user AS role")).rows[0]?.role !== "agentstudio_api" || !await audit(db)) throw Error("agent_design_schema_required")
  } finally {try {if (begun) await db.query("ROLLBACK")} finally {db.release()}}
}
export function selectAgentDesignServiceOptIn(env: Record<string, string | undefined>): boolean {
  const enabled = env.AGENT_STUDIO_PG18_DESIGN_EXECUTION_ENABLED, approval = env.AGENT_STUDIO_PG18_DESIGN_EXECUTION_APPROVED
  if (enabled === undefined && approval === undefined) return false
  if (enabled !== "true" || approval !== agentDesignExecutionApproval) throw Error("agent_design_service_not_approved")
  return true
}
export function agentDesignExecutionEnabled(options: AgentDesignActivation = {}): boolean {
  if (options.executionEnabled === undefined || options.executionEnabled === false) return false
  if (options.executionEnabled !== true || options.executionApproval !== agentDesignExecutionApproval) throw Error("agent_design_execution_disabled")
  return true
}
export type AgentDesignDatabaseRole = "agentstudio_design_worker" | "agentstudio_design_dispatch"
/** Inspect the authenticated login before SET ROLE can hide its privileges. */
export async function assertAgentDesignSession(db: SqlClient, expected: AgentDesignDatabaseRole): Promise<void> {
  const refuse = (): never => {throw Error("agent_design_session_role_refused")}
  if (expected !== "agentstudio_design_worker" && expected !== "agentstudio_design_dispatch") return refuse()
  const logins = (await db.query<Record<string, unknown>>("SELECT rolcanlogin AS login,rolinherit AS inherit,rolsuper AS superuser,rolbypassrls AS bypassrls,rolcreatedb AS createdb,rolcreaterole AS createrole,rolreplication AS replication,current_user=session_user AS initial_role FROM pg_catalog.pg_roles WHERE rolname=session_user")).rows
  const login = logins[0]
  if (logins.length !== 1 || !login || login.login !== true || login.initial_role !== true || [login.inherit, login.superuser, login.bypassrls, login.createdb, login.createrole, login.replication].some(v => v !== false)) return refuse()
  const reachable = (await db.query<{name: string}>("SELECT r.rolname AS name FROM pg_catalog.pg_roles r WHERE r.rolname<>session_user AND pg_catalog.pg_has_role(session_user,r.oid,'MEMBER') ORDER BY r.rolname")).rows
  if (reachable.length !== 1 || reachable[0]?.name !== expected) return refuse()
  const direct = (await db.query<{name: string; admin: boolean; inherit: boolean; set: boolean}>("SELECT r.rolname AS name,m.admin_option AS admin,m.inherit_option AS inherit,m.set_option AS \"set\" FROM pg_catalog.pg_auth_members m JOIN pg_catalog.pg_roles member ON member.oid=m.member JOIN pg_catalog.pg_roles r ON r.oid=m.roleid WHERE member.rolname=session_user ORDER BY r.rolname,m.grantor")).rows
  const grant = direct[0]
  if (direct.length !== 1 || !grant || grant.name !== expected || grant.admin !== false || grant.inherit !== false || grant.set !== true) return refuse()
}
