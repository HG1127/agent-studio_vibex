// Separate design pools and proof domain. Source transactions end before the
// provider wait, so cancellation/erasure do not wait behind a network effect.
import type {request as HttpsRequest} from "node:https"
import {HttpError, type Identity, type SqlPool} from "./contracts.ts"
import {withActor} from "./repository.ts"
import {withModelBrokerActor} from "./model-broker-actor.ts"
import {decryptModelSecret} from "./model-connection-crypto.ts"
import {canonicalMcpJson} from "./mcp-catalog.ts"
import type {ProviderResolver} from "./model-connection-probe.ts"
import {AgentDesignSourceRepository} from "./agent-design-source.ts"
import {AgentDesignLedgerRepository} from "./agent-design-ledger.ts"
import {parseAgentDesignChoice} from "./agent-design-contract.ts"
import {agentDesignObject as O} from "./agent-design-value-contract.ts"
import {normalizeAgentDesignCompletion, agentDesignResultHash} from "./agent-design-result.ts"
import {designId, designSha, designVersion, parseAgentDesignProof, parseAgentDesignReply, type AgentDesignProof, type AgentDesignReply} from "./agent-design-rpc-contract.ts"
import {agentDesignExecutionEnabled, assertAgentDesignSession, type AgentDesignActivation, type AgentDesignAuditVerifier} from "./agent-design-runtime-policy.ts"
import {createAgentDesignProviderExecutor, type AgentDesignExecutor, type AgentDesignProviderInput, type AgentDesignModelMaterial} from "./agent-design-provider.ts"

const unavailable = (): never => {throw new HttpError(409, "agent_design_context_unavailable")}
type Completion = ReturnType<typeof normalizeAgentDesignCompletion>
type Context = {protocol: "agent_design_context_v1"; identity: Identity; owner_user_id: string; owner_governance_revision: number; owner_epoch: number; request_id: string; request_sha256: string; choice: ReturnType<typeof parseAgentDesignChoice>; prepared: Record<string, unknown>}
type Model = {revision: unknown; provider: AgentDesignModelMaterial["provider"]; base_url: string; enabled: boolean; status: string; models: unknown}
type Secret = Model & {api_key_ciphertext: Uint8Array; api_key_nonce: Uint8Array; api_key_tag: Uint8Array}
function version(v: unknown) {return designVersion(typeof v === "string" && /^[1-9][0-9]*$/.test(v) ? Number(v) : v)}
function modelIds(v: unknown): string[] {if (!Array.isArray(v) || v.some(i => typeof i !== "string")) return unavailable(); return v as string[]}
function context(raw: unknown, proof: AgentDesignProof): Context {
  const v = O(raw, ["protocol", "identity", "owner_user_id", "owner_governance_revision", "owner_epoch", "request_id", "request_sha256", "choice", "prepared"])
  const identity = O(v.identity, ["issuer", "subject"]), choice = parseAgentDesignChoice(v.choice)
  if (v.protocol !== "agent_design_context_v1" || identity.issuer !== "urn:agentstudio:local:v1" || typeof identity.subject !== "string" || !identity.subject || identity.subject.length > 1000 || /[\u0000-\u001f\u007f]/u.test(identity.subject) || v.request_id !== proof.request_id || canonicalMcpJson(choice) !== canonicalMcpJson(v.choice)) return unavailable()
  const p = O(v.prepared, ["protocol", "purpose", "messages", "source_sha256", "resources_sha256", "content_sha256", "input_sha256", "output_token_limit", "byte_length", "authority", "choice", "owner_user_id", "owner_governance_revision", "owner_epoch"])
  if (p.protocol !== "agent_design_prepared_input_v1" || p.authority !== false || canonicalMcpJson(p.choice) !== canonicalMcpJson(choice) || p.owner_user_id !== v.owner_user_id || p.owner_governance_revision !== v.owner_governance_revision || p.owner_epoch !== v.owner_epoch) return unavailable()
  designSha(p.input_sha256); designSha(p.source_sha256); designSha(p.content_sha256); designSha(p.resources_sha256)
  return {protocol: "agent_design_context_v1", identity: {issuer: identity.issuer, subject: identity.subject}, owner_user_id: designId(v.owner_user_id), owner_governance_revision: designVersion(v.owner_governance_revision), owner_epoch: designVersion(v.owner_epoch), request_id: proof.request_id, request_sha256: designSha(v.request_sha256), choice, prepared: p}
}
export class AgentDesignBroker {
  readonly businessPool: SqlPool; readonly dispatchPool: SqlPool; readonly secretPool: SqlPool
  readonly options: AgentDesignActivation & {audit?: AgentDesignAuditVerifier; executor?: AgentDesignExecutor; resolver?: ProviderResolver; request?: typeof HttpsRequest}
  readonly enabled: boolean
  private readonly key: Buffer
  private readonly execute: AgentDesignExecutor
  private closed = false
  private readonly active = new Set<AbortController>()
  readonly source: AgentDesignSourceRepository
  constructor(businessPool: SqlPool, dispatchPool: SqlPool, secretPool: SqlPool, key: Buffer,
    options: AgentDesignActivation & {audit?: AgentDesignAuditVerifier; executor?: AgentDesignExecutor; resolver?: ProviderResolver; request?: typeof HttpsRequest} = {}) {
    this.businessPool = businessPool; this.dispatchPool = dispatchPool; this.secretPool = secretPool; this.options = options
    this.enabled = agentDesignExecutionEnabled(options)
    if (!businessPool || !dispatchPool || !secretPool || businessPool === dispatchPool || businessPool === secretPool || dispatchPool === secretPool || !Buffer.isBuffer(key) || key.length !== 32 || this.enabled && typeof options.audit !== "function") throw Error("agent_design_independent_pools_and_audit_required")
    this.key = Buffer.from(key); this.source = new AgentDesignSourceRepository(businessPool, options.audit)
    this.execute = options.executor ?? (this.enabled ? createAgentDesignProviderExecutor(options, options.resolver, options.request) : async () => {throw Error("agent_design_execution_disabled")})
  }
  close() {if (this.closed) return; this.closed = true; for (const c of this.active) c.abort(); this.key.fill(0)}
  private async call(name: "context" | "reserve" | "finish", proof: AgentDesignProof, completion?: Completion): Promise<unknown> {
    const db = await this.dispatchPool.connect(); let begun = false
    try {
      await db.query("BEGIN"); begun = true; await assertAgentDesignSession(db, "agentstudio_design_dispatch")
      await db.query("SET LOCAL ROLE agentstudio_design_dispatch"); await db.query("SET LOCAL lock_timeout='3s'"); await db.query("SET LOCAL statement_timeout='5s'")
      if ((await db.query<{role: string}>("SELECT current_user AS role")).rows[0]?.role !== "agentstudio_design_dispatch" || !this.options.audit || !await this.options.audit(db)) return unavailable()
      const args: unknown[] = [proof.request_id, proof.lease_token, proof.lease_version, proof.worker_id]
      if (name === "finish") args.push(JSON.stringify(completion))
      const value = (await db.query<{value: unknown}>("SELECT agentstudio.agent_design_" + name + "($1::uuid,$2::uuid,$3::bigint,$4::uuid" + (name === "finish" ? ",$5::jsonb" : "") + ") AS value", args)).rows[0]?.value
      if (value === undefined) return unavailable()
      await db.query("COMMIT"); begun = false; return value
    } catch (e) {if (begun) await db.query("ROLLBACK").catch(() => undefined); throw e} finally {db.release()}
  }
  private async check(selected: Context): Promise<Model> {
    if (this.closed) return unavailable()
    return withActor(this.businessPool, selected.identity, async (db, owner) => {
      if (owner !== selected.owner_user_id) return unavailable()
      const p = await this.source.prepareOnClient(selected.identity, db, owner, selected.choice)
      if (canonicalMcpJson(p) !== canonicalMcpJson(selected.prepared) || p.owner_governance_revision !== selected.owner_governance_revision || p.owner_epoch !== selected.owner_epoch) return unavailable()
      const b = selected.choice.model_binding
      const row = (await db.query<Model>("SELECT revision,provider,base_url,enabled,status,models FROM agentstudio.model_connections WHERE id=$1::uuid AND owner_user_id=$2::uuid FOR SHARE", [b.connection_id, owner])).rows[0]
      if (!row || !row.enabled || row.status !== "ok" || version(row.revision) !== b.connection_revision || !modelIds(row.models).includes(b.model_id)) return unavailable()
      return row
    })
  }
  private async credential(selected: Context, expected: Model): Promise<AgentDesignModelMaterial> {
    if (this.closed) return unavailable()
    return withModelBrokerActor(this.secretPool, selected.identity, async (db, owner) => {
      if (owner !== selected.owner_user_id) return unavailable()
      const b = selected.choice.model_binding
      const row = (await db.query<Secret>("SELECT revision,provider,base_url,enabled,status,models,api_key_ciphertext,api_key_nonce,api_key_tag FROM agentstudio.model_connections WHERE id=$1::uuid AND owner_user_id=$2::uuid FOR SHARE", [b.connection_id, owner])).rows[0]
      if (!row || row.enabled !== true || row.status !== "ok" || version(row.revision) !== b.connection_revision || row.provider !== expected.provider || row.base_url !== expected.base_url || canonicalMcpJson(row.models) !== canonicalMcpJson(expected.models) || !modelIds(row.models).includes(b.model_id) || this.closed) return unavailable()
      return {provider: row.provider, base_url: row.base_url, model_id: b.model_id, api_key: decryptModelSecret({ciphertext: Buffer.from(row.api_key_ciphertext), nonce: Buffer.from(row.api_key_nonce), tag: Buffer.from(row.api_key_tag)}, this.key)}
    })
  }
  private async recover(selected: Context): Promise<AgentDesignReply> {
    try {
      const view = await new AgentDesignLedgerRepository(this.businessPool, {audit: this.options.audit}).view(selected.identity, selected.request_id)
      if (view.result_status === "available" && view.result) return {protocol: "agent_design_dispatch_reply_v1", request_id: selected.request_id, state: "succeeded", result_sha256: view.result.result_sha256}
      if (view.receipt.state === "failed") return {protocol: "agent_design_dispatch_reply_v1", request_id: selected.request_id, state: "failed"}
    } catch {}
    return {protocol: "agent_design_dispatch_reply_v1", request_id: selected.request_id, state: "unknown"}
  }
  async dispatch(raw: unknown): Promise<AgentDesignReply> {
    if (!this.enabled || this.closed) throw Error("agent_design_execution_disabled")
    const proof = parseAgentDesignProof(raw), selected = context(await this.call("context", proof), proof)
    let reserved = false, attempted = false, finishAttempted = false
    const controller = new AbortController(); this.active.add(controller)
    try {
      const metadata = await this.check(selected)
      const reservation = O(await this.call("reserve", proof), ["protocol", "request_id", "effect_id", "state", "request_sha256", "input_sha256", "content_sha256", "source_sha256"])
      reserved = true
      if (reservation.protocol !== "agent_design_reservation_v1" || reservation.request_id !== proof.request_id || reservation.state !== "reserved" || reservation.request_sha256 !== selected.request_sha256 || reservation.input_sha256 !== selected.prepared.input_sha256 || reservation.content_sha256 !== selected.prepared.content_sha256 || reservation.source_sha256 !== selected.prepared.source_sha256) return unavailable()
      designId(reservation.effect_id)
      // SQL context validates its private actual resource/model snapshots,
      // Native governance and lease again; the business guard repeats actual
      // Owner/resource queries. Pure selection digests never stand in for ACLs.
      const recheck = async () => {controller.signal.throwIfAborted(); const fresh = context(await this.call("context", proof), proof); if (canonicalMcpJson(fresh) !== canonicalMcpJson(selected)) return unavailable(); await this.check(selected); controller.signal.throwIfAborted()}
      await recheck()
      const material = await this.credential(selected, metadata)
      let timer: ReturnType<typeof setTimeout> | undefined, text: string
      try {
        await recheck()
        // Message tuple was compared with an actually regenerated server tuple.
        const input = {messages: selected.prepared.messages, output_token_limit: selected.choice.output_token_limit} as AgentDesignProviderInput
        attempted = true
        text = await Promise.race([this.execute(material, input, controller.signal, recheck), new Promise<never>((_, reject) => {timer = setTimeout(() => {controller.abort(); reject(Error("agent_design_provider_unknown"))}, 30000)})])
      } finally {if (timer) clearTimeout(timer); material.api_key = ""}
      const completion = normalizeAgentDesignCompletion({status: "succeeded", model_json: text})
      if (completion.status !== "succeeded") return unavailable()
      await recheck(); finishAttempted = true
      const reply = parseAgentDesignReply(await this.call("finish", proof, completion))
      if (reply.request_id !== proof.request_id || reply.state !== "succeeded" || reply.result_sha256 !== agentDesignResultHash(proof.request_id, selected.choice.purpose, designSha(selected.prepared.input_sha256), designSha(selected.prepared.source_sha256), completion.result)) return unavailable()
      return reply
    } catch {
      if (finishAttempted) return this.recover(selected)
      if (!reserved) return {protocol: "agent_design_dispatch_reply_v1", request_id: proof.request_id, state: "paused"}
      try {
        const reply = parseAgentDesignReply(await this.call("finish", proof, normalizeAgentDesignCompletion({status: attempted ? "unknown" : "failed", failure_code: attempted ? "provider_outcome_unknown" : "source_or_credential_unavailable"})))
        if (reply.request_id !== proof.request_id) return unavailable(); return reply
      } catch {return {protocol: "agent_design_dispatch_reply_v1", request_id: proof.request_id, state: "unknown"}}
    } finally {controller.abort(); this.active.delete(controller)}
  }
}
