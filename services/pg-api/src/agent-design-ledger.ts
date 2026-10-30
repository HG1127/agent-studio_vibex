// Optional062 API ledger. SQL owns atomic persistence/history/audit and repeats
// actual source checks; this module uses only its fixed RPCs for private data.
import {HttpError, type Identity, type SqlClient, type SqlPool} from "./contracts.ts"
import {withActor, recordAgentDesignSaveOnClient} from "./repository.ts"
import {AgentDesignSourceRepository, requireAgentDesignNative} from "./agent-design-source.ts"
import {agentDesignHash, agentDesignId, parseAgentDesignChoice, parseAgentDesignControl, parseAgentDesignSaveIntent, parseAgentDesignSavePreviewInput, parseAgentDesignSubmission, type AgentDesignSubmission} from "./agent-design-contract.ts"
import {deriveAgentDesignCandidate, agentDesignResultHash} from "./agent-design-result.ts"
import {parseAgentDesignReceipt, parseAgentDesignResultData, parseAgentDesignControlReceipt, parseAgentDesignSaveReceipt, parseAgentDesignSavePreview,
  type AgentDesignReceipt, type AgentDesignSavePreview, type AgentDesignView} from "./agent-design-rpc-contract.ts"
import type {AgentDesignAuditVerifier} from "./agent-design-runtime-policy.ts"

const conflict = (): never => {throw new HttpError(409, "agent_design_request_conflict")}
const projection = (): never => {throw Error("agent_design_projection_unavailable")}
const selection = (r: AgentDesignReceipt) => ({purpose: r.purpose, model_binding: r.model_binding, source: r.source})
type Options = {allowSubmissions?: boolean; allowSaves?: boolean; audit?: AgentDesignAuditVerifier}
export class AgentDesignLedgerRepository {
  readonly pool: SqlPool
  readonly source: AgentDesignSourceRepository
  readonly submitting: boolean; readonly saving: boolean
  constructor(pool: SqlPool, options: Options = {}) {
    this.pool = pool
    this.source = new AgentDesignSourceRepository(pool, options.audit)
    this.submitting = options.allowSubmissions === true; this.saving = options.allowSaves === true
  }
  private async actor<T>(identity: Identity, body: (db: SqlClient, owner: string) => Promise<T>, expectedEmployee?: string): Promise<T> {
    requireAgentDesignNative(identity)
    return withActor(this.pool, identity, async (db, owner) => {
      await this.source.contextOnClient(identity, db, owner)
      // A concurrency condition only. Native Cookie plus withActor still owns identity.
      if (expectedEmployee !== undefined && agentDesignId(expectedEmployee) !== owner) throw new HttpError(409, "agent_design_employee_changed")
      return body(db, owner)
    })
  }
  private async lock(db: SqlClient, owner: string, requestId: string) {
    await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1::text,620))", [owner + ":design:" + requestId])
  }
  private async receiptLock(db: SqlClient, owner: string, family: "control" | "save", requestId: string) {
    await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1::text,621))", [owner + ":" + family + ":" + requestId])
  }
  private async receipt(db: SqlClient, requestId: string): Promise<AgentDesignReceipt | null> {
    const raw = (await db.query<{value: unknown}>("SELECT agentstudio.agent_design_receipt($1::uuid) AS value", [requestId])).rows[0]?.value
    if (raw === null) return null
    const value = parseAgentDesignReceipt(raw)
    if (value.request_id !== requestId) return projection()
    return value
  }
  private matches(row: AgentDesignReceipt, value: AgentDesignSubmission) {
    if (row.request_id !== value.request_id || row.request_sha256 !== value.request_sha256 || row.input_sha256 !== value.expected_input_sha256 || row.purpose !== value.purpose) return conflict()
  }
  async preview(identity: Identity, rawChoice: unknown) {
    const choice = parseAgentDesignChoice(rawChoice)
    return this.actor(identity, async (db, owner) => {
      const p = await this.source.prepareOnClient(identity, db, owner, choice)
      return {protocol: "agent_design_preview_v1" as const, choice, input_sha256: p.input_sha256, content_sha256: p.content_sha256,
        source_sha256: p.source_sha256, resources_sha256: p.resources_sha256, byte_length: p.byte_length, output_token_limit: p.output_token_limit,
        fields_sent: JSON.parse(p.messages[1]!.content) as unknown, recorded: false as const}
    })
  }
  async confirm(identity: Identity, raw: unknown, expectedEmployee?: string) {
    const value = parseAgentDesignSubmission(raw)
    return this.actor(identity, async db => {const old = await this.receipt(db, value.request_id); if (!old) throw new HttpError(404, "agent_design_receipt_not_found"); this.matches(old, value); return {...old, replayed: true}}, expectedEmployee)
  }
  async submit(identity: Identity, raw: unknown, expectedEmployee?: string) {
    const value = parseAgentDesignSubmission(raw)
    return this.actor(identity, async (db, owner) => {
      await this.lock(db, owner, value.request_id)
      const old = await this.receipt(db, value.request_id)
      if (old) {this.matches(old, value); return {...old, replayed: true}}
      if (!this.submitting) throw new HttpError(403, "agent_design_submission_disabled")
      const {request_id: _id, expected_input_sha256: _input, confirm: _confirm, fee_acknowledgement: _fee, request_sha256: _hash, ...fields} = value
      const p = await this.source.prepareOnClient(identity, db, owner, {...fields, action: "preview"})
      if (p.input_sha256 !== value.expected_input_sha256) throw new HttpError(409, "agent_design_input_changed")
      const {request_sha256: _internal, ...intent} = value
      const id = (await db.query<{value: unknown}>("SELECT agentstudio.agent_design_record($1::jsonb,$2::jsonb) AS value", [JSON.stringify(intent), JSON.stringify(p)])).rows[0]?.value
      if (id !== value.request_id) return projection()
      const row = await this.receipt(db, value.request_id); if (!row) return projection()
      this.matches(row, value)
      if (row.content_sha256 !== p.content_sha256 || row.source_sha256 !== p.source_sha256 || row.resources_sha256 !== p.resources_sha256 || row.owner_epoch !== p.owner_epoch || row.owner_governance_revision !== p.owner_governance_revision) return projection()
      return {...row, replayed: false}
    }, expectedEmployee)
  }
  private async result(db: SqlClient, r: AgentDesignReceipt) {
    const raw = (await db.query<{value: unknown}>("SELECT agentstudio.agent_design_read_result($1::uuid) AS value", [r.request_id])).rows[0]?.value
    if (raw === null) return null
    const result = parseAgentDesignResultData(raw)
    if (result.request_id !== r.request_id || result.result_sha256 !== agentDesignResultHash(r.request_id, r.purpose, r.input_sha256, r.source_sha256, result.result)) return projection()
    return result
  }
  private async current(identity: Identity, db: SqlClient, owner: string, r: AgentDesignReceipt, mode: "share" | "update" = "share") {
    const c = await this.source.currentOnClient(identity, db, owner, selection(r), mode)
    if (c.owner.governance_revision !== r.owner_governance_revision || c.owner.epoch !== r.owner_epoch || c.source_sha256 !== r.source_sha256 || c.resources_sha256 !== r.resources_sha256) throw new HttpError(409, "agent_design_source_changed")
    return c
  }
  async view(identity: Identity, rawId: unknown): Promise<AgentDesignView> {
    const id = agentDesignId(rawId)
    return this.actor(identity, async (db, owner) => {
      await this.lock(db, owner, id)
      const receipt = await this.receipt(db, id); if (!receipt) throw new HttpError(404, "agent_design_receipt_not_found")
      const base = {protocol: "agent_design_view_v1" as const, receipt, result: null}
      if (receipt.body_erased) return {...base, result_status: "erased"}
      if (["queued", "claimed", "reserved"].includes(receipt.state)) return {...base, result_status: "pending"}
      if (["paused", "unknown"].includes(receipt.state)) return {...base, result_status: "unknown"}
      if (receipt.state !== "succeeded") return {...base, result_status: "unavailable"}
      try {await this.current(identity, db, owner, receipt)} catch (error) {
        if (error instanceof HttpError && [400, 404, 409].includes(error.status) && error.code !== "agent_design_schema_required") return {...base, result_status: "stale"}
        throw error
      }
      const result = await this.result(db, receipt)
      return result ? {...base, result_status: "available", result} : {...base, result_status: "unavailable"}
    })
  }
  private async controlReceipt(db: SqlClient, id: string) {
    const raw = (await db.query<{value: unknown}>("SELECT agentstudio.agent_design_control_receipt($1::uuid) AS value", [id])).rows[0]?.value
    if (raw === null) return null
    const r = parseAgentDesignControlReceipt(raw); if (r.request_id !== id) return projection(); return r
  }
  async control(identity: Identity, raw: unknown, confirmOnly = false, expectedEmployee?: string) {
    const value = parseAgentDesignControl(raw)
    return this.actor(identity, async (db, owner) => {
      await this.receiptLock(db, owner, "control", value.request_id)
      const old = await this.controlReceipt(db, value.request_id)
      const matches = (r: NonNullable<typeof old>) => {if (r.request_sha256 !== value.request_sha256 || r.design_request_id !== value.design_request_id || r.action !== value.action) return conflict()}
      if (old) {matches(old); return {...old, replayed: true}}
      if (confirmOnly) throw new HttpError(404, "agent_design_control_receipt_not_found")
      await this.lock(db, owner, value.design_request_id)
      const {request_sha256: _hash, ...intent} = value
      if ((await db.query<{value: unknown}>("SELECT agentstudio.agent_design_control($1::jsonb) AS value", [JSON.stringify(intent)])).rows[0]?.value !== value.request_id) return projection()
      const row = await this.controlReceipt(db, value.request_id); if (!row) return projection(); matches(row); return {...row, replayed: false}
    }, expectedEmployee)
  }
  private async savePreviewOnClient(identity: Identity, db: SqlClient, owner: string, raw: unknown, mode: "share" | "update" = "share"): Promise<AgentDesignSavePreview> {
    const v = parseAgentDesignSavePreviewInput(raw)
    await this.lock(db, owner, v.design_request_id)
    const r = await this.receipt(db, v.design_request_id)
    if (!r || r.state !== "succeeded" || r.body_erased) throw new HttpError(409, "agent_design_result_unavailable")
    const c = await this.current(identity, db, owner, r, mode), result = await this.result(db, r)
    if (!result || result.result_sha256 !== v.expected_result_sha256) throw new HttpError(409, "agent_design_result_changed")
    const before = c.before ? {name: c.before.name, spec: c.before.spec} : null
    const candidate = deriveAgentDesignCandidate(before, result.result, v.fields)
    const binding = {design_request_id: r.request_id, purpose: r.purpose, result_sha256: result.result_sha256, input_sha256: r.input_sha256,
      source_sha256: r.source_sha256, resources_sha256: r.resources_sha256, fields: v.fields, candidate_sha256: candidate.candidate_sha256}
    const {candidate_sha256: _candidate, ...publicBinding} = binding
    return parseAgentDesignSavePreview({protocol: "agent_design_save_preview_v1", ...publicBinding, candidate,
      preview_sha256: agentDesignHash({protocol: "agent_design_save_preview_binding_v1", ...binding}), recorded: false})
  }
  async previewSave(identity: Identity, raw: unknown) {return this.actor(identity, (db, owner) => this.savePreviewOnClient(identity, db, owner, raw))}
  private async saveReceipt(db: SqlClient, id: string) {
    const raw = (await db.query<{value: unknown}>("SELECT agentstudio.agent_design_save_receipt($1::uuid) AS value", [id])).rows[0]?.value
    if (raw === null) return null
    const r = parseAgentDesignSaveReceipt(raw); if (r.request_id !== id) return projection(); return r
  }
  async save(identity: Identity, rawIntent: unknown, rawPreview: unknown, confirmOnly = false, expectedEmployee?: string) {
    const value = parseAgentDesignSaveIntent(rawIntent)
    return this.actor(identity, async (db, owner) => {
      await this.receiptLock(db, owner, "save", value.request_id)
      const old = await this.saveReceipt(db, value.request_id)
      const matches = (r: NonNullable<typeof old>) => {if (r.request_sha256 !== value.request_sha256 || r.design_request_id !== value.design_request_id || r.preview_sha256 !== value.expected_preview_sha256 || r.result_sha256 !== value.expected_result_sha256 || r.source_sha256 !== value.expected_source_sha256 || r.candidate_sha256 !== value.expected_candidate_sha256) return conflict()}
      if (old) {matches(old); return {...old, replayed: true}}
      if (confirmOnly) throw new HttpError(404, "agent_design_save_receipt_not_found")
      if (!this.saving) throw new HttpError(403, "agent_design_save_disabled")
      await this.lock(db, owner, value.design_request_id)
      const p = await this.savePreviewOnClient(identity, db, owner, rawPreview, "update")
      if (p.design_request_id !== value.design_request_id || p.preview_sha256 !== value.expected_preview_sha256 || p.result_sha256 !== value.expected_result_sha256 || p.source_sha256 !== value.expected_source_sha256 || p.candidate.candidate_sha256 !== value.expected_candidate_sha256) return conflict()
      const {request_sha256: _hash, ...intent} = value
      // SQL writes only six descriptive fields and the immutable receipt plus
      // 045 history/audit in THIS original transaction; no nested pooled actor.
      const id = await recordAgentDesignSaveOnClient(db, owner, intent, p)
      if (id !== value.request_id) return projection()
      const row = await this.saveReceipt(db, value.request_id); if (!row) return projection(); matches(row); return {...row, replayed: false}
    }, expectedEmployee)
  }
}
