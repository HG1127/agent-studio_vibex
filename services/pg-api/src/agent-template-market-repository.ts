// Fixed063 RPC adapter. SQL owns source/owner proofs, locks, atomic copy/history
// and immutable receipts. Pure DTO hashes never substitute for its live audit.
import {HttpError, type Identity, type SqlClient, type SqlPool} from "./contracts.ts"
import {withActor, assertOwnedAdmissionContext} from "./repository.ts"
import {requireAgentTemplateMarketNative, requireAgentTemplateMarketAudit, type AgentTemplateMarketAuditVerifier} from "./agent-template-market-runtime-policy.ts"
import {agentTemplateMarketObject as O, agentTemplateMarketArray as A, agentTemplateMarketText as T, agentTemplateMarketInteger as N,
  agentTemplateMarketId as ID, agentTemplateMarketSha as SHA, agentTemplateMarketProtocol, agentTemplateMarketDescriptionKeys,
  agentTemplateMarketCanonicalJson, agentTemplateMarketDigest, parseAgentTemplateMarketSnapshot, parseAgentTemplateMarketSourcePin,
  parseAgentTemplateMarketPin, parseAgentTemplateMarketQuery, parseAgentTemplateMarketPublishChoice, parseAgentTemplateMarketUseChoice,
  parseAgentTemplateMarketPublishIntent, parseAgentTemplateMarketUseIntent, parseAgentTemplateMarketLifecycleIntent,
  type AgentTemplateMarketPublishIntent, type AgentTemplateMarketUseIntent, type AgentTemplateMarketLifecycleIntent} from "./agent-template-market-contract.ts"
import {parseAgentTemplateMarketRow, parseAgentTemplateMarketPage, parseAgentTemplateMarketMinePage, parseAgentTemplateMarketMineRow,
  parseAgentTemplateMarketReceipt, parseAgentTemplateMarketRecoveryResult, agentTemplateMarketCopyDigest,
  type AgentTemplateMarketReceipt, type AgentTemplateMarketRemovalSummary} from "./agent-template-market-result.ts"

export type AgentTemplateMarketIntent = AgentTemplateMarketPublishIntent | AgentTemplateMarketUseIntent | AgentTemplateMarketLifecycleIntent
const projection = (): never => {throw Error("agent_template_market_projection_unavailable")}
const same = (a: unknown, b: unknown) => agentTemplateMarketCanonicalJson(a) === agentTemplateMarketCanonicalJson(b)
export function parseAgentTemplateMarketIntent(raw: unknown): AgentTemplateMarketIntent {
  const descriptor = raw && typeof raw === "object" ? Object.getOwnPropertyDescriptor(raw, "action") : undefined
  const action = descriptor && Object.hasOwn(descriptor, "value") ? descriptor.value : undefined
  return action === "publish" ? parseAgentTemplateMarketPublishIntent(raw) : action === "use" ? parseAgentTemplateMarketUseIntent(raw) : parseAgentTemplateMarketLifecycleIntent(raw)
}
function removed(raw: unknown): AgentTemplateMarketRemovalSummary {
  const v = O(raw, ["model_binding", "http_tools", "mcp_tools", "knowledge_bases", "knowledge_retrieval", "quality_checks", "unknown_tools", "unknown_fields"])
  if (typeof v.model_binding !== "boolean" || typeof v.knowledge_retrieval !== "boolean") return projection()
  return {model_binding: v.model_binding, knowledge_retrieval: v.knowledge_retrieval, http_tools: N(v.http_tools), mcp_tools: N(v.mcp_tools),
    knowledge_bases: N(v.knowledge_bases), quality_checks: N(v.quality_checks), unknown_tools: N(v.unknown_tools), unknown_fields: N(v.unknown_fields)}
}
function sourceRpc(raw: unknown) {
  const v = O(raw, ["source", "name", "snapshot", "removed", "authority"])
  if (v.authority !== false) return projection()
  return {source: parseAgentTemplateMarketSourcePin(v.source), name: T(v.name, 120, true), snapshot: parseAgentTemplateMarketSnapshot(v.snapshot), removed: removed(v.removed), authority: false as const}
}
export async function projectAgentTemplateMarketPublishPreview(raw: unknown) {
  const v = O(raw, ["source", "name", "description", "category", "snapshot", "snapshot_sha256", "removed", "public_text_review_required", "authority"])
  if (v.public_text_review_required !== true) return projection()
  const source = sourceRpc({source: v.source, name: v.name, snapshot: v.snapshot, removed: v.removed, authority: v.authority})
  const choice = parseAgentTemplateMarketPublishChoice({action: "preview_publish", source: source.source, name: source.name, description: v.description, category: v.category})
  const snapshot_sha256 = SHA(v.snapshot_sha256)
  if (await agentTemplateMarketDigest(source.snapshot) !== snapshot_sha256) return projection()
  return {...source, description: choice.description, category: choice.category, snapshot_sha256, public_text_review_required: true as const}
}
export async function projectAgentTemplateMarketUsePreview(raw: unknown) {
  const v = O(raw, ["template", "name", "spec", "copy_sha256", "resource_selection_required", "starts_run", "authority"])
  if (v.resource_selection_required !== true || v.starts_run !== false || v.authority !== false) return projection()
  const copySpec = O(v.spec, [...agentTemplateMarketDescriptionKeys, "tools", "knowledge_base_ids", "require_approval", "require_plan_review"])
  const snapshot = parseAgentTemplateMarketSnapshot({protocol: agentTemplateMarketProtocol, spec: {...copySpec, quality_checks: []}})
  const template = parseAgentTemplateMarketPin(v.template), name = T(v.name, 120, true), copy_sha256 = SHA(v.copy_sha256)
  if (await agentTemplateMarketDigest(snapshot) !== template.snapshot_sha256 || await agentTemplateMarketCopyDigest(snapshot, name) !== copy_sha256) return projection()
  return {template, name, snapshot, copy_sha256, resource_selection_required: true as const, starts_run: false as const}
}
/** The same audited detail RPC must supply owner-only unlisted content. Never
 * bypass its private tables or rebuild an old snapshot from today's Agent. */
export async function projectAgentTemplateMarketDetail(raw: unknown) {
  if (raw === null) throw new HttpError(404, "agent_template_market_unavailable")
  const keys = ["id", "name", "description", "category", "source_spec_id", "built_in", "public", "use_count", "created", "revision", "snapshot_sha256", "spec", "author_tail", "is_mine"]
  const v = O(raw, keys), {spec, author_tail, is_mine, ...metadata} = v
  if (typeof is_mine !== "boolean" || !/^[A-Za-z0-9_-]{0,4}$/.test(T(author_tail, 4))) return projection()
  let item
  if (v.public === false) {if (!is_mine) throw new HttpError(404, "agent_template_market_unavailable"); item = parseAgentTemplateMarketMineRow(metadata)}
  else {const {spec: _s, author_tail: _tail, is_mine: _mine, ...row} = parseAgentTemplateMarketRow(v); item = row}
  const snapshot = parseAgentTemplateMarketSnapshot({protocol: agentTemplateMarketProtocol, spec})
  if (await agentTemplateMarketDigest(snapshot) !== item.snapshot_sha256) return projection()
  return {item, snapshot, is_mine, author_tail: T(author_tail, 4)}
}
export function matchAgentTemplateMarketReceipt(raw: unknown, rawIntent: unknown): AgentTemplateMarketReceipt {
  const r = parseAgentTemplateMarketReceipt(raw), v = parseAgentTemplateMarketIntent(rawIntent)
  if (r.request_id !== v.request_id || r.operation !== v.action) return projection()
  if (r.operation === "publish" && v.action === "publish") {
    if (r.item.snapshot_sha256 !== v.expected_snapshot_sha256 || r.item.source_spec_id !== v.source.spec_id || v.name && r.item.name !== v.name || r.item.description !== v.description || r.item.category !== v.category) return projection()
  } else if (r.operation === "use" && v.action === "use") {
    if (r.template_id !== v.template.template_id || r.revision !== v.template.revision || r.snapshot_sha256 !== v.template.snapshot_sha256) return projection()
  } else if (r.operation !== "publish" && r.operation !== "use" && v.action !== "publish" && v.action !== "use") {
    if (r.template_id !== v.template.template_id || r.revision !== v.template.revision + 1 || r.snapshot_sha256 !== v.template.snapshot_sha256) return projection()
  } else return projection()
  return r
}
const rpcSql = Object.freeze({
  source: "SELECT agentstudio.agent_template_market_source($1::uuid) AS value",
  previewPublish: "SELECT agentstudio.agent_template_market_publish_preview($1::jsonb) AS value",
  previewUse: "SELECT agentstudio.agent_template_market_use_preview($1::jsonb) AS value",
  market: "SELECT agentstudio.agent_template_market_market($1::jsonb) AS value",
  mine: "SELECT agentstudio.agent_template_market_mine() AS value",
  detail: "SELECT agentstudio.agent_template_market_detail($1::uuid) AS value",
  recover: "SELECT agentstudio.agent_template_market_receipt($1::uuid) AS value",
  record: "SELECT agentstudio.agent_template_market_record($1::jsonb) AS value",
})
/** Only fixed SQL business refusals from a query are known rollbacks. Never
 * classify audit, transport, projection or COMMIT failures by their message. */
function rpcRefusal(error: unknown): unknown {
  const own = (key: string) => error && typeof error === "object" ? Object.getOwnPropertyDescriptor(error, key)?.value : undefined
  if (own("code") !== "P0001") return error
  const code = own("message")
  if (typeof code !== "string") return error
  const statuses: Record<string, number> = {
    agent_template_market_invalid_copy: 400, agent_template_market_invalid_id: 400, agent_template_market_invalid_intent: 400,
    agent_template_market_invalid_name: 400, agent_template_market_invalid_preview: 400, agent_template_market_invalid_query: 400,
    agent_template_market_invalid_request: 400, agent_template_market_invalid_source: 400,
    agent_template_market_unavailable: 404, agent_template_market_source_unavailable: 404, agent_template_market_owner_required: 404,
    agent_template_market_copy_changed: 409, agent_template_market_request_conflict: 409, agent_template_market_source_changed: 409,
    agent_template_market_source_resource_changed: 409, agent_template_market_state_changed: 409, agent_template_market_template_changed: 409,
  }
  return Object.hasOwn(statuses, code) ? new HttpError(statuses[code]!, code) : error
}
type Options = {available?: boolean; allowWrites?: boolean; verifyCredentials?: AgentTemplateMarketAuditVerifier}
export class AgentTemplateMarketRepository {
  readonly pool: SqlPool; readonly available: boolean; readonly writing: boolean; readonly verifyCredentials?: AgentTemplateMarketAuditVerifier
  constructor(pool: SqlPool, options: Options = {}) {
    if (!pool || typeof pool.connect !== "function" || options.available !== undefined && typeof options.available !== "boolean" || options.allowWrites !== undefined && typeof options.allowWrites !== "boolean" || options.allowWrites === true && options.available !== true) throw Error("invalid_agent_template_market_repository_policy")
    if (options.available === true && typeof options.verifyCredentials !== "function") throw Error("agent_template_market_actual_auditor_required")
    this.pool = pool; this.available = options.available === true; this.writing = options.allowWrites === true; this.verifyCredentials = options.verifyCredentials
  }
  private async actor<T>(identity: Identity, work: (db: SqlClient, owner: string) => Promise<T>): Promise<T> {
    requireAgentTemplateMarketNative(identity)
    if (!this.available) throw new HttpError(503, "agent_template_market_unavailable")
    return withActor(this.pool, identity, async (db, owner) => {await assertOwnedAdmissionContext(db, owner); await requireAgentTemplateMarketAudit(db, this.verifyCredentials); return work(db, owner)})
  }
  private async rpc(db: SqlClient, name: keyof typeof rpcSql, values: unknown[] = []): Promise<unknown> {
    let rows
    try {rows = (await db.query<{value: unknown}>(rpcSql[name], values)).rows} catch (error) {throw rpcRefusal(error)}
    if (rows.length !== 1 || !Object.hasOwn(rows[0]!, "value")) return projection()
    return rows[0]!.value
  }
  async sources(identity: Identity) {
    return this.actor(identity, async (db, owner) => {
      // Lightweight existing Agent inventory only; no source RPC loop or pin.
      const rows = (await db.query<{spec_id: string; name: string; revision: unknown}>("SELECT id AS spec_id,name,revision FROM agentstudio.agent_specs WHERE owner_user_id=$1::uuid ORDER BY updated_at DESC,id LIMIT 200", [owner])).rows
      const items = A(rows, 200).map(raw => {const v = O(raw, ["spec_id", "name", "revision"]); const revision = typeof v.revision === "string" && /^[1-9][0-9]*$/.test(v.revision) ? Number(v.revision) : v.revision; return {spec_id: ID(v.spec_id), name: T(v.name, 120, true), revision: N(revision, 1)}})
      if (new Set(items.map(item => item.spec_id)).size !== items.length) return projection()
      return {ok: true as const, items}
    })
  }
  async source(identity: Identity, key: string) {
    const specId = ID(key)
    return this.actor(identity, async db => {const s = sourceRpc(await this.rpc(db, "source", [specId])); if (s.source.spec_id !== specId) return projection(); return {source: s.source, name: s.name}})
  }
  async market(identity: Identity, raw: unknown = {}) {
    const query = parseAgentTemplateMarketQuery(raw)
    return this.actor(identity, async db => {const page = parseAgentTemplateMarketPage(await this.rpc(db, "market", [JSON.stringify(query)])); for (const row of page.items) if (await agentTemplateMarketDigest({protocol: agentTemplateMarketProtocol, spec: row.spec}) !== row.snapshot_sha256) return projection(); return page})
  }
  async mine(identity: Identity) {return this.actor(identity, async db => parseAgentTemplateMarketMinePage(await this.rpc(db, "mine")))}
  async detail(identity: Identity, key: string) {
    const templateId = ID(key)
    return this.actor(identity, async db => {const value = await projectAgentTemplateMarketDetail(await this.rpc(db, "detail", [templateId])); if (value.item.id !== templateId) return projection(); return value})
  }
  async previewPublish(identity: Identity, raw: unknown) {
    const choice = parseAgentTemplateMarketPublishChoice(raw)
    return this.actor(identity, async db => {const value = await projectAgentTemplateMarketPublishPreview(await this.rpc(db, "previewPublish", [JSON.stringify(choice)])); if (!same(value.source, choice.source) || choice.name && value.name !== choice.name || value.description !== choice.description || value.category !== choice.category) return projection(); return value})
  }
  async previewUse(identity: Identity, raw: unknown) {
    const choice = parseAgentTemplateMarketUseChoice(raw)
    return this.actor(identity, async db => {const value = await projectAgentTemplateMarketUsePreview(await this.rpc(db, "previewUse", [JSON.stringify(choice)])); if (!same(value.template, choice.template) || choice.copy_name && value.name !== choice.copy_name) return projection(); return value})
  }
  async recover(identity: Identity, key: string) {
    const requestId = ID(key)
    return this.actor(identity, async db => {const value = parseAgentTemplateMarketRecoveryResult(await this.rpc(db, "recover", [requestId])); if ((value.status === "recorded" ? value.receipt.request_id : value.request_id) !== requestId) return projection(); return value})
  }
  async record(identity: Identity, raw: unknown) {
    const intent = parseAgentTemplateMarketIntent(raw)
    return this.actor(identity, async db => {
      const old = parseAgentTemplateMarketRecoveryResult(await this.rpc(db, "recover", [intent.request_id]))
      if ((old.status === "recorded" ? old.receipt.request_id : old.request_id) !== intent.request_id) return projection()
      if (old.status === "recorded") {
        // Receipt RPC holds631 until this original transaction completes. Record
        // re-entry checks full stored intent digest before any new-write flag.
        const original = matchAgentTemplateMarketReceipt(await this.rpc(db, "record", [JSON.stringify(intent)]), intent)
        if (!same(original, old.receipt)) return projection()
        return original
      }
      if (!this.writing) throw new HttpError(409, "agent_template_market_writes_disabled")
      return matchAgentTemplateMarketReceipt(await this.rpc(db, "record", [JSON.stringify(intent)]), intent)
    })
  }
}
