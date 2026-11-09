// Dedicated metadata-only design Worker. No prompt, result or credential read.
import type {SqlClient, SqlPool} from "./contracts.ts"
import {designId, parseAgentDesignClaim, parseAgentDesignReply, type AgentDesignClaim, type AgentDesignProof, type AgentDesignReply} from "./agent-design-rpc-contract.ts"
import {agentDesignExecutionEnabled, assertAgentDesignSession, type AgentDesignActivation, type AgentDesignAuditVerifier} from "./agent-design-runtime-policy.ts"
import {createWorkerClaimAdmission, type WorkerClaimPermit} from "./worker-claim-admission.ts"

type TransactionEvent = "before_commit" | "commit_confirmed" | "failure" | "rollback_confirmed"
export class AgentDesignWorker {
  readonly pool: SqlPool; readonly dispatch: (proof: AgentDesignProof) => Promise<AgentDesignReply>
  readonly options: AgentDesignActivation & {audit?: AgentDesignAuditVerifier; dispatchTimeoutMs?: number}
  readonly enabled: boolean; readonly workerId: string
  private running = false
  private readonly timeoutMs: number
  readonly #admission = createWorkerClaimAdmission({lanes: ["assessment"]})
  constructor(pool: SqlPool, workerId: string, dispatch: (proof: AgentDesignProof) => Promise<AgentDesignReply>, options: AgentDesignActivation & {audit?: AgentDesignAuditVerifier; dispatchTimeoutMs?: number} = {}) {
    this.pool = pool; this.dispatch = dispatch; this.options = options
    this.workerId = designId(workerId); this.enabled = agentDesignExecutionEnabled(options)
    this.timeoutMs = options.dispatchTimeoutMs ?? 50000
    if (!pool || typeof dispatch !== "function" || this.enabled && typeof options.audit !== "function" || !Number.isSafeInteger(this.timeoutMs) || this.timeoutMs < 1 || this.timeoutMs > 50000) throw Error("agent_design_worker_dependencies_required")
  }
  closeNewClaims() {this.#admission.close()}
  claimAdmissionSnapshot() {return this.#admission.snapshot()}
  private async transaction<T>(body: (db: SqlClient) => Promise<T>, observe?: (event: TransactionEvent) => void): Promise<T> {
    const db = await this.pool.connect(); let begun = false
    try {
      await db.query("BEGIN"); begun = true
      await assertAgentDesignSession(db, "agentstudio_design_worker")
      await db.query("SET LOCAL ROLE agentstudio_design_worker")
      await db.query("SET LOCAL lock_timeout='3s'"); await db.query("SET LOCAL statement_timeout='5s'")
      if ((await db.query<{role: string}>("SELECT current_user AS role")).rows[0]?.role !== "agentstudio_design_worker" || !this.options.audit || !await this.options.audit(db)) throw Error("agent_design_worker_role_or_schema_required")
      const value = await body(db); observe?.("before_commit"); await db.query("COMMIT"); begun = false; observe?.("commit_confirmed"); return value
    } catch (error) {
      try {observe?.("failure")} finally {if (begun) try {await db.query("ROLLBACK"); observe?.("rollback_confirmed")} catch {}}
      throw error
    } finally {db.release()}
  }
  private async claim(): Promise<AgentDesignClaim | null> {
    if (!this.enabled || this.#admission.snapshot().closed) return null
    const admission = this.#admission
    let permit: WorkerClaimPermit | null = null, sent = false, commitAttempted = false
    return this.transaction(async db => {
      permit = admission.tryEnter("assessment"); if (!permit) return null
      const request = admission.dispatch(permit, () => {sent = true; return db.query<{value: unknown}>("SELECT agentstudio.agent_design_claim($1::uuid) AS value", [this.workerId])})
      if (!request.started) {permit = null; return null}
      const raw = (await request.value).rows[0]?.value
      if (raw === null) return null
      const claim = parseAgentDesignClaim(raw)
      if (claim.worker_id !== this.workerId) throw Error("agent_design_claim_refused")
      return claim
    }, event => {
      if (event === "before_commit") commitAttempted = true
      if (!permit) return
      if (event === "failure" && sent) admission.markUncertain(permit)
      if (event === "commit_confirmed") {admission.confirm(permit, {outcome: "commit_confirmed"}); permit = null}
      if (event === "rollback_confirmed") {
        if (!sent) {admission.discardUndispatched(permit); permit = null}
        else if (!commitAttempted) {admission.confirm(permit, {outcome: "rollback_confirmed"}); permit = null}
      }
    })
  }
  async tick(): Promise<AgentDesignReply | {state: "disabled" | "idle" | "busy"}> {
    if (!this.enabled) return {state: "disabled"}
    if (this.running) return {state: "busy"}
    this.running = true
    try {
      const claim = await this.claim(); if (!claim) return {state: "idle"}
      const {lease_expires_at, ...proof} = claim
      try {
        if (Date.parse(lease_expires_at) <= Date.now()) throw Error("agent_design_claim_expired")
        let timer: ReturnType<typeof setTimeout> | undefined
        try {
          const reply = parseAgentDesignReply(await Promise.race([this.dispatch(proof), new Promise<never>((_, reject) => {timer = setTimeout(() => reject(Error("agent_design_transport_unknown")), this.timeoutMs)})]))
          if (reply.request_id !== proof.request_id) throw Error("agent_design_reply_mismatch")
          return reply
        } finally {if (timer) clearTimeout(timer)}
      } catch {
        // A timeout/ACK loss never grants a second reservation or a resend.
        try {
          const raw = await this.transaction(async db => (await db.query<{value: unknown}>("SELECT agentstudio.agent_design_pause($1::uuid,$2::uuid,$3::bigint,$4::uuid) AS value", [proof.request_id, proof.lease_token, proof.lease_version, proof.worker_id])).rows[0]?.value)
          const reply = parseAgentDesignReply(raw); if (reply.request_id !== proof.request_id) throw Error(); return reply
        } catch {return {protocol: "agent_design_dispatch_reply_v1", request_id: proof.request_id, state: "unknown"}}
      }
    } finally {this.running = false}
  }
}
