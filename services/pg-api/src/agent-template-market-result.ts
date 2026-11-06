// Pure projections/candidates/DTO values. No DB authorization or owner rebinding
// happens here; the actual transaction must derive recipient from its actor.
import {agentTemplateMarketArray as array, agentTemplateMarketObject as object, agentTemplateMarketText as text,
  agentTemplateMarketInteger as integer, agentTemplateMarketBoolean as boolean, agentTemplateMarketId as id,
  agentTemplateMarketSha as sha, agentTemplateMarketCategory as category, agentTemplateMarketDescriptionKeys,
  agentTemplateMarketProtocol, agentTemplateMarketDigest, parseAgentTemplateMarketDescriptions,
  parseAgentTemplateMarketSnapshot, parseAgentTemplateMarketPublishChoice, parseAgentTemplateMarketPublishIntent,
  parseAgentTemplateMarketUseIntent, parseAgentTemplateMarketLifecycleIntent, invalidAgentTemplateMarketValue as invalid,
  type AgentTemplateMarketSpec, type AgentTemplateMarketSnapshot, type AgentTemplateMarketBuiltinTool,
  type AgentTemplateMarketCategory, type AgentTemplateMarketOperation} from "./agent-template-market-contract.ts"

const builtinAliases: Readonly<Record<string, AgentTemplateMarketBuiltinTool>> = Object.freeze({
  calculate: "calculate", summarize: "summarize", knowledge_search: "knowledge_search", web_search: "web_search", web_fetch: "web_fetch",
  "计算器": "calculate", "数学计算": "calculate", "统计计算": "calculate", "文本摘要": "summarize", "内容摘要": "summarize",
  "知识库检索": "knowledge_search", "网络搜索": "web_search", "网页搜索": "web_search", "联网搜索": "web_search",
  "网页内容提取": "web_fetch", "网页抓取": "web_fetch",
})
const knownSourceKeys = [...agentTemplateMarketDescriptionKeys, "tools", "knowledge_base_ids", "quality_checks", "require_approval",
  "require_plan_review", "model_binding", "http_tools", "mcp_tools", "knowledge_retrieval"]
function builtinFor(raw: string): AgentTemplateMarketBuiltinTool | undefined {
  const name = /^[A-Za-z_]+$/.test(raw) ? raw.toLowerCase() : raw
  return Object.hasOwn(builtinAliases, name) ? builtinAliases[name] : undefined
}
function sourceObject(raw: unknown) {
  if (!raw || typeof raw !== "object") return invalid()
  const keys = Reflect.ownKeys(raw)
  if (keys.some(key => typeof key !== "string")) return invalid()
  return object(raw, [...agentTemplateMarketDescriptionKeys, "tools"], (keys as string[]).filter(key => ![...agentTemplateMarketDescriptionKeys, "tools"].includes(key)))
}
export type AgentTemplateMarketRemovalSummary = {model_binding: boolean; http_tools: number; mcp_tools: number; knowledge_bases: number;
  knowledge_retrieval: boolean; quality_checks: number; unknown_tools: number; unknown_fields: number}

/** Whitelist projection, including on re-read of an older stored snapshot.
 * Protected binding fields and assertion payloads are never serialized.
 * Human review still must check the intentionally public prose for secrets. */
export function deriveAgentTemplateMarketSnapshot(rawSpec: unknown): {snapshot: AgentTemplateMarketSnapshot; removed: AgentTemplateMarketRemovalSummary; authority: false} {
  const v = sourceObject(rawSpec)
  const descriptions = parseAgentTemplateMarketDescriptions(Object.fromEntries(agentTemplateMarketDescriptionKeys.map(key => [key, v[key]])))
  const count = (value: unknown, max: number) => value === undefined ? 0 : array(value, max).length
  const tools: AgentTemplateMarketBuiltinTool[] = [], shadowed = new Set<string>(), shadowedBuiltins = new Set<AgentTemplateMarketBuiltinTool>()
  for (const field of ["http_tools", "mcp_tools"]) for (const raw of v[field] === undefined ? [] : array(v[field], 10)) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return invalid()
    const binding = object(raw, [], Reflect.ownKeys(raw).filter((key): key is string => typeof key === "string"))
    if (typeof binding.name !== "string") return invalid()
    const name = binding.name.trim(), builtin = builtinFor(name)
    shadowed.add(name)
    if (builtin) shadowedBuiltins.add(builtin)
  }
  let unknownTools = 0
  for (const raw of array(v.tools, 50)) {
    const name = text(raw, 300), builtin = builtinFor(name)
    if (shadowed.has(name) || !builtin || shadowedBuiltins.has(builtin)) {unknownTools++; continue}
    if (!tools.includes(builtin)) tools.push(builtin)
  }
  if (v.require_approval !== undefined) boolean(v.require_approval)
  const snapshot: AgentTemplateMarketSnapshot = {protocol: agentTemplateMarketProtocol, spec: {...descriptions, tools,
    knowledge_base_ids: [], quality_checks: [], require_approval: true,
    require_plan_review: v.require_plan_review === undefined ? false : boolean(v.require_plan_review)}}
  return {snapshot, removed: {model_binding: v.model_binding !== undefined && v.model_binding !== null,
    http_tools: count(v.http_tools, 10), mcp_tools: count(v.mcp_tools, 10), knowledge_bases: count(v.knowledge_base_ids, 10),
    knowledge_retrieval: v.knowledge_retrieval !== undefined && v.knowledge_retrieval !== null,
    quality_checks: count(v.quality_checks, 12), unknown_tools: unknownTools,
    unknown_fields: Object.keys(v).filter(key => !knownSourceKeys.includes(key)).length}, authority: false}
}

export async function deriveAgentTemplateMarketPublishPreview(rawChoice: unknown, sourceName: unknown, sourceSpec: unknown) {
  const choice = parseAgentTemplateMarketPublishChoice(rawChoice)
  const name = choice.name || text(sourceName, 120, true), {snapshot, removed} = deriveAgentTemplateMarketSnapshot(sourceSpec)
  const snapshot_sha256 = await agentTemplateMarketDigest(snapshot)
  return {source: choice.source, name, description: choice.description, category: choice.category, snapshot, snapshot_sha256,
    removed, public_text_review_required: true as const, authority: false as const}
}

export type AgentTemplateMarketCopySpec = Omit<AgentTemplateMarketSpec, "quality_checks">
export type AgentTemplateMarketCreateInput = Omit<AgentTemplateMarketCopySpec, "require_approval">
/** No owner argument exists. The server must create a fresh Agent for the
 * verified recipient and revalidate newly selected resources separately. */
export function deriveAgentTemplateMarketCopy(rawSnapshot: unknown, templateName: unknown, copyName: unknown = "") {
  const {spec} = parseAgentTemplateMarketSnapshot(rawSnapshot)
  const requested = text(copyName, 120), name = requested || text(templateName, 120, true)
  const {quality_checks: _checks, ...candidate} = spec
  return {name, spec: candidate, resource_selection_required: true as const, starts_run: false as const, authority: false as const}
}
/** Exact input for existing safeAgentSpec: approval is server-controlled and
 * Native has no quality_checks field. No model/HTTP/MCP/KB scope can enter. */
export function agentTemplateMarketCreateInput(rawSnapshot: unknown): AgentTemplateMarketCreateInput {
  const {spec} = deriveAgentTemplateMarketCopy(rawSnapshot, "模板")
  const {require_approval: _approval, ...input} = spec
  return input
}
export async function agentTemplateMarketCopyDigest(rawSnapshot: unknown, templateName: unknown, copyName: unknown = ""): Promise<string> {
  const {name, spec} = deriveAgentTemplateMarketCopy(rawSnapshot, templateName, copyName)
  return agentTemplateMarketDigest({protocol: "agent_template_market_copy_candidate_v1", name, spec})
}

export type AgentTemplateMarketMineRow = {id: string; name: string; description: string; category: AgentTemplateMarketCategory;
  source_spec_id: string; built_in: boolean; public: boolean; use_count: number; created: string; revision: number; snapshot_sha256: string}
export type AgentTemplateMarketRow = AgentTemplateMarketMineRow & {spec: AgentTemplateMarketSpec; author_tail: string; is_mine: boolean}
const mineKeys = ["id", "name", "description", "category", "source_spec_id", "built_in", "public", "use_count", "created", "revision", "snapshot_sha256"]
function created(raw: unknown): string {
  const value = text(raw, 40, true)
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) return invalid()
  return value
}
function mineRow(v: Record<string, unknown>): AgentTemplateMarketMineRow {
  return {id: id(v.id), name: text(v.name, 120, true), description: text(v.description, 120, true), category: category(v.category),
    source_spec_id: v.source_spec_id === "" ? "" : id(v.source_spec_id), built_in: boolean(v.built_in), public: boolean(v.public),
    use_count: integer(v.use_count), created: created(v.created), revision: integer(v.revision, 1), snapshot_sha256: sha(v.snapshot_sha256)}
}
export function parseAgentTemplateMarketMineRow(raw: unknown): AgentTemplateMarketMineRow {
  const row = mineRow(object(raw, mineKeys))
  if (row.built_in) return invalid()
  return row
}
/** DTO validation only; is_mine/author_tail do not authenticate a publisher. */
export function parseAgentTemplateMarketRow(raw: unknown): AgentTemplateMarketRow {
  const v = object(raw, [...mineKeys, "spec", "author_tail", "is_mine"]), row = mineRow(v)
  const is_mine = boolean(v.is_mine), author_tail = text(v.author_tail, 4)
  if (!/^[A-Za-z0-9_-]{0,4}$/.test(author_tail) || !row.built_in && !row.public || !is_mine && row.source_spec_id !== "" ||
    row.built_in && (!row.public || is_mine || author_tail !== "" || row.source_spec_id !== "")) return invalid()
  const {spec} = parseAgentTemplateMarketSnapshot({protocol: agentTemplateMarketProtocol, spec: v.spec})
  return {...row, spec, author_tail, is_mine}
}
export function parseAgentTemplateMarketPage(raw: unknown) {
  const v = object(raw, ["ok", "items"])
  if (v.ok !== true) return invalid()
  const items = array(v.items, 200).map(parseAgentTemplateMarketRow)
  if (new Set(items.map(row => row.id)).size !== items.length) return invalid()
  return {ok: true as const, items}
}
export function parseAgentTemplateMarketMinePage(raw: unknown) {
  const v = object(raw, ["ok", "items"])
  if (v.ok !== true) return invalid()
  const items = array(v.items, 200).map(parseAgentTemplateMarketMineRow)
  if (new Set(items.map(row => row.id)).size !== items.length) return invalid()
  return {ok: true as const, items}
}

export type AgentTemplateMarketReceipt =
  | {operation: "publish"; request_id: string; item: AgentTemplateMarketMineRow}
  | {operation: "use"; request_id: string; template_id: string; revision: number; snapshot_sha256: string; spec_id: string; spec_revision: number; use_count: number}
  | {operation: "unpublish" | "republish" | "delete"; request_id: string; template_id: string; revision: number; snapshot_sha256: string; public: boolean; deleted: boolean}
/** This parser validates receipt shape, never proves a transaction committed. */
export function parseAgentTemplateMarketReceipt(raw: unknown): AgentTemplateMarketReceipt {
  const keys = raw && typeof raw === "object" ? Reflect.ownKeys(raw) : []
  if (keys.some(key => typeof key !== "string")) return invalid()
  const v = object(raw, ["operation", "request_id"], (keys as string[]).filter(key => key !== "operation" && key !== "request_id"))
  const request_id = id(v.request_id)
  if (v.operation === "publish") {
    object(raw, ["operation", "request_id", "item"])
    const item = parseAgentTemplateMarketMineRow(v.item)
    if (!item.public || item.use_count !== 0 || item.revision !== 1) return invalid()
    return {operation: "publish", request_id, item}
  }
  if (v.operation === "use") {
    object(raw, ["operation", "request_id", "template_id", "revision", "snapshot_sha256", "spec_id", "spec_revision", "use_count"])
    const spec_revision = integer(v.spec_revision, 1)
    if (spec_revision !== 1) return invalid()
    return {operation: "use", request_id, template_id: id(v.template_id), revision: integer(v.revision, 1), snapshot_sha256: sha(v.snapshot_sha256),
      spec_id: id(v.spec_id), spec_revision, use_count: integer(v.use_count, 1)}
  }
  if (v.operation !== "unpublish" && v.operation !== "republish" && v.operation !== "delete") return invalid()
  object(raw, ["operation", "request_id", "template_id", "revision", "snapshot_sha256", "public", "deleted"])
  const isPublic = boolean(v.public), deleted = boolean(v.deleted)
  if (isPublic !== (v.operation === "republish") || deleted !== (v.operation === "delete")) return invalid()
  return {operation: v.operation, request_id, template_id: id(v.template_id), revision: integer(v.revision, 2),
    snapshot_sha256: sha(v.snapshot_sha256), public: isPublic, deleted}
}
export type AgentTemplateMarketRecoveryResult = {status: "recorded"; receipt: AgentTemplateMarketReceipt} | {status: "not_recorded"; request_id: string}
/** not_recorded is a server observation, not permission to mint a new UUID or
 * retry a potentially committed operation without a server idempotency check. */
export function parseAgentTemplateMarketRecoveryResult(raw: unknown): AgentTemplateMarketRecoveryResult {
  const keys = raw && typeof raw === "object" ? Reflect.ownKeys(raw) : []
  if (keys.some(key => typeof key !== "string")) return invalid()
  const v = object(raw, ["status"], (keys as string[]).filter(key => key !== "status"))
  if (v.status === "recorded") {
    object(raw, ["status", "receipt"])
    return {status: "recorded", receipt: parseAgentTemplateMarketReceipt(v.receipt)}
  }
  object(raw, ["status", "request_id"])
  if (v.status !== "not_recorded") return invalid()
  return {status: "not_recorded", request_id: id(v.request_id)}
}
/** Binds the entire normalized intent for later owner-scoped DB receipts.
 * No authority is conferred by the hash. */
export async function agentTemplateMarketIntentDigest(operation: AgentTemplateMarketOperation, intent: unknown) {
  if (!["publish", "use", "unpublish", "republish", "delete"].includes(operation)) return invalid()
  const value = operation === "publish" ? parseAgentTemplateMarketPublishIntent(intent) : operation === "use" ? parseAgentTemplateMarketUseIntent(intent) : parseAgentTemplateMarketLifecycleIntent(intent)
  if (value.action !== operation) return invalid()
  return agentTemplateMarketDigest({protocol: "agent_template_market_intent_v1", operation, intent: value})
}
