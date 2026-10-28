// Browser-only Native transport. Display hashes are not server authorization.
import {agentTemplateMarketObject as O, agentTemplateMarketArray as A, agentTemplateMarketText as T,
  agentTemplateMarketInteger as N, agentTemplateMarketId as ID, agentTemplateMarketSha as SHA,
  agentTemplateMarketCanonicalJson, agentTemplateMarketDigest,
  parseAgentTemplateMarketSourcePin, parseAgentTemplateMarketPin, parseAgentTemplateMarketSnapshot,
  parseAgentTemplateMarketQuery, parseAgentTemplateMarketPublishChoice, parseAgentTemplateMarketUseChoice,
  parseAgentTemplateMarketPublishIntent, parseAgentTemplateMarketUseIntent, parseAgentTemplateMarketLifecycleIntent,
  agentTemplateMarketPublishAcknowledgement, type AgentTemplateMarketSourcePin, type AgentTemplateMarketPin,
  type AgentTemplateMarketSnapshot, type AgentTemplateMarketPublishIntent, type AgentTemplateMarketUseIntent,
  type AgentTemplateMarketLifecycleIntent, type AgentTemplateMarketCategory} from "../../services/pg-api/src/agent-template-market-contract.ts"
import {parseAgentTemplateMarketPage, parseAgentTemplateMarketMinePage, parseAgentTemplateMarketMineRow,
  parseAgentTemplateMarketRow, parseAgentTemplateMarketReceipt, parseAgentTemplateMarketRecoveryResult,
  agentTemplateMarketCopyDigest, type AgentTemplateMarketMineRow, type AgentTemplateMarketReceipt,
  type AgentTemplateMarketRemovalSummary} from "../../services/pg-api/src/agent-template-market-result.ts"

export type TemplateMarketIntent = AgentTemplateMarketPublishIntent | AgentTemplateMarketUseIntent | AgentTemplateMarketLifecycleIntent
export type TemplateMarketSource = {source: AgentTemplateMarketSourcePin; name: string}
export type TemplateMarketSourceOption = {spec_id: string; name: string; revision: number}
export type TemplateMarketDetail = {item: AgentTemplateMarketMineRow; snapshot: AgentTemplateMarketSnapshot; is_mine: boolean; author_tail: string}
export type TemplateMarketPublishPreview = {source: AgentTemplateMarketSourcePin; name: string; description: string; category: AgentTemplateMarketCategory;
  snapshot: AgentTemplateMarketSnapshot; snapshot_sha256: string; removed: AgentTemplateMarketRemovalSummary; public_text_review_required: true; authority: false}
export type TemplateMarketUsePreview = {template: AgentTemplateMarketPin; name: string; snapshot: AgentTemplateMarketSnapshot; copy_sha256: string; resource_selection_required: true; starts_run: false}
export class PgNativeTemplateMarketError extends Error {
  readonly status: number; readonly code: string; readonly definitive: boolean
  constructor(status: number, code: string, definitive = false) {super(code); this.name = "PgNativeTemplateMarketError"; this.status = status; this.code = code; this.definitive = definitive}
}
const invalid = (): never => {throw new PgNativeTemplateMarketError(503, "invalid_template_market_response")}
const same = (a: unknown, b: unknown) => agentTemplateMarketCanonicalJson(a) === agentTemplateMarketCanonicalJson(b)
export function templateMarketIntent(raw: unknown): TemplateMarketIntent {
  const descriptor = raw && typeof raw === "object" ? Object.getOwnPropertyDescriptor(raw, "action") : undefined
  const action = descriptor && Object.hasOwn(descriptor, "value") ? descriptor.value : undefined
  return action === "publish" ? parseAgentTemplateMarketPublishIntent(raw) : action === "use" ? parseAgentTemplateMarketUseIntent(raw) : parseAgentTemplateMarketLifecycleIntent(raw)
}
export function templateMarketPin(item: AgentTemplateMarketMineRow): AgentTemplateMarketPin {
  return parseAgentTemplateMarketPin({template_id: item.id, revision: item.revision, snapshot_sha256: item.snapshot_sha256})
}
export function parseTemplateMarketSource(raw: unknown): TemplateMarketSource {
  const v = O(raw, ["source", "name"])
  return {source: parseAgentTemplateMarketSourcePin(v.source), name: T(v.name, 120, true)}
}
/** Display options are not private source proofs. Fetch source(id) on selection. */
export function parseTemplateMarketSourceOption(raw: unknown): TemplateMarketSourceOption {
  const v = O(raw, ["spec_id", "name", "revision"])
  return {spec_id: ID(v.spec_id), name: T(v.name, 120, true), revision: N(v.revision, 1)}
}
export async function parseTemplateMarketDetail(raw: unknown): Promise<TemplateMarketDetail> {
  const v = O(raw, ["item", "snapshot", "is_mine", "author_tail"]), snapshot = parseAgentTemplateMarketSnapshot(v.snapshot)
  if (typeof v.is_mine !== "boolean") return invalid()
  const itemObject = v.item && typeof v.item === "object" ? Object.getOwnPropertyDescriptor(v.item, "public") : undefined
  const publicValue = itemObject && Object.hasOwn(itemObject, "value") ? itemObject.value : undefined
  let item: AgentTemplateMarketMineRow
  if (publicValue === false) {
    if (!v.is_mine) return invalid()
    item = parseAgentTemplateMarketMineRow(v.item)
    if (!/^[A-Za-z0-9_-]{0,4}$/.test(T(v.author_tail, 4))) return invalid()
  } else {
    const names = v.item && typeof v.item === "object" ? Reflect.ownKeys(v.item) : []
    if (names.some(k => typeof k !== "string")) return invalid()
    const metadata = O(v.item, names as string[])
    const {spec: _spec, is_mine: _mine, author_tail: _tail, ...row} = parseAgentTemplateMarketRow({...metadata, spec: snapshot.spec, is_mine: v.is_mine, author_tail: v.author_tail})
    item = row
  }
  if (await agentTemplateMarketDigest(snapshot) !== item.snapshot_sha256) return invalid()
  return {item, snapshot, is_mine: v.is_mine, author_tail: T(v.author_tail, 4)}
}
export async function parseTemplateMarketPublishPreview(raw: unknown): Promise<TemplateMarketPublishPreview> {
  const v = O(raw, ["source", "name", "description", "category", "snapshot", "snapshot_sha256", "removed", "public_text_review_required", "authority"])
  if (v.public_text_review_required !== true || v.authority !== false) return invalid()
  const choice = parseAgentTemplateMarketPublishChoice({action: "preview_publish", source: v.source, name: v.name, description: v.description, category: v.category})
  const r = O(v.removed, ["model_binding", "http_tools", "mcp_tools", "knowledge_bases", "knowledge_retrieval", "quality_checks", "unknown_tools", "unknown_fields"])
  if (typeof r.model_binding !== "boolean" || typeof r.knowledge_retrieval !== "boolean") return invalid()
  const removed: AgentTemplateMarketRemovalSummary = {model_binding: r.model_binding, knowledge_retrieval: r.knowledge_retrieval,
    http_tools: N(r.http_tools), mcp_tools: N(r.mcp_tools), knowledge_bases: N(r.knowledge_bases), quality_checks: N(r.quality_checks), unknown_tools: N(r.unknown_tools), unknown_fields: N(r.unknown_fields)}
  const snapshot = parseAgentTemplateMarketSnapshot(v.snapshot), snapshot_sha256 = SHA(v.snapshot_sha256)
  if (await agentTemplateMarketDigest(snapshot) !== snapshot_sha256) return invalid()
  return {source: choice.source, name: T(choice.name, 120, true), description: choice.description, category: choice.category, snapshot, snapshot_sha256,
    removed, public_text_review_required: true, authority: false}
}
export async function parseTemplateMarketUsePreview(raw: unknown): Promise<TemplateMarketUsePreview> {
  const v = O(raw, ["template", "name", "snapshot", "copy_sha256", "resource_selection_required", "starts_run"])
  if (v.resource_selection_required !== true || v.starts_run !== false) return invalid()
  const template = parseAgentTemplateMarketPin(v.template), snapshot = parseAgentTemplateMarketSnapshot(v.snapshot), name = T(v.name, 120, true), copy_sha256 = SHA(v.copy_sha256)
  if (await agentTemplateMarketDigest(snapshot) !== template.snapshot_sha256 || await agentTemplateMarketCopyDigest(snapshot, name) !== copy_sha256) return invalid()
  return {template, name, snapshot, copy_sha256, resource_selection_required: true, starts_run: false}
}
export function templateMarketPublishBody(raw: TemplateMarketPublishPreview, requestId: string): AgentTemplateMarketPublishIntent {
  return parseAgentTemplateMarketPublishIntent({action: "publish", request_id: ID(requestId), source: raw.source, name: raw.name, description: raw.description,
    category: raw.category, expected_snapshot_sha256: raw.snapshot_sha256, confirm: true, acknowledgement: agentTemplateMarketPublishAcknowledgement})
}
export function templateMarketUseBody(raw: TemplateMarketUsePreview, requestId: string): AgentTemplateMarketUseIntent {
  return parseAgentTemplateMarketUseIntent({action: "use", request_id: ID(requestId), template: raw.template, copy_name: raw.name, expected_copy_sha256: raw.copy_sha256, confirm: true})
}
export function templateMarketReceipt(raw: unknown, rawIntent: unknown): AgentTemplateMarketReceipt {
  const receipt = parseAgentTemplateMarketReceipt(raw), intent = templateMarketIntent(rawIntent)
  if (receipt.operation !== intent.action || receipt.request_id !== intent.request_id) return invalid()
  if (receipt.operation === "publish" && intent.action === "publish") {
    const item = receipt.item
    if (item.snapshot_sha256 !== intent.expected_snapshot_sha256 || item.source_spec_id !== intent.source.spec_id || item.name !== intent.name || item.description !== intent.description || item.category !== intent.category) return invalid()
  } else if (receipt.operation === "use" && intent.action === "use") {
    if (receipt.template_id !== intent.template.template_id || receipt.revision !== intent.template.revision || receipt.snapshot_sha256 !== intent.template.snapshot_sha256) return invalid()
  } else if (receipt.operation !== "publish" && receipt.operation !== "use" && intent.action !== "publish" && intent.action !== "use") {
    if (receipt.template_id !== intent.template.template_id || receipt.revision !== intent.template.revision + 1 || receipt.snapshot_sha256 !== intent.template.snapshot_sha256) return invalid()
  } else return invalid()
  return receipt
}

/** Bounded duplicate-key-aware decoder. JSON.parse alone accepts escaped aliases. */
export function decodeTemplateMarketJson(source: string): unknown {
  if (source.charCodeAt(0) === 0xfeff) return invalid()
  let at = 0, nodes = 0
  const space = () => {while (/[\x20\t\r\n]/.test(source[at] ?? "!")) at++}
  const string = (): string => {
    const start = at++
    while (at < source.length) {
      const c = source[at++]
      if (c === "\\") {at++; continue}
      if (c === '"') {try {return JSON.parse(source.slice(start, at)) as string} catch {return invalid()}}
    }
    return invalid()
  }
  const value = (depth: number): unknown => {
    space(); if (depth > 24 || ++nodes > 100000) return invalid()
    if (source[at] === '"') return string()
    if (source[at] === "{") {
      at++; space(); const out: Record<string, unknown> = Object.create(null)
      if (source[at] === "}") {at++; return out}
      for (;;) {space(); if (source[at] !== '"') return invalid(); const key = string(); if (Object.hasOwn(out, key)) return invalid(); space(); if (source[at++] !== ":") return invalid(); out[key] = value(depth + 1); space(); const c = source[at++]; if (c === "}") return out; if (c !== ",") return invalid()}
    }
    if (source[at] === "[") {
      at++; space(); const out: unknown[] = []
      if (source[at] === "]") {at++; return out}
      for (;;) {out.push(value(depth + 1)); space(); const c = source[at++]; if (c === "]") return out; if (c !== ",") return invalid()}
    }
    for (const [token, literal] of [["true", true], ["false", false], ["null", null]] as const) if (source.startsWith(token, at)) {at += token.length; return literal}
    const match = source.slice(at).match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/)
    if (!match) return invalid()
    at += match[0].length; const n = Number(match[0]); if (!Number.isFinite(n) || Object.is(n, -0)) return invalid(); return n
  }
  const result = value(0); space(); if (at !== source.length) return invalid(); return result
}

export function createPgNativeTemplateMarketApi(config: {transport?: typeof fetch; rootPath?: "" | "/__pg_native"; timeoutMs?: number} = {}) {
  O(config, [], ["transport", "rootPath", "timeoutMs"])
  const send = config.transport ?? fetch, root = config.rootPath ?? "/__pg_native", budget = config.timeoutMs ?? 8000
  if (typeof send !== "function" || root !== "" && root !== "/__pg_native" || !Number.isSafeInteger(budget) || budget < 1 || budget > 8000) throw Error("invalid_template_market_transport")
  async function request<T>(path: string, method: "GET" | "POST" | "DELETE", body: unknown, parse: (raw: unknown) => T | Promise<T>, signal?: AbortSignal, maxBytes = 524288): Promise<T> {
    const data = body === undefined ? undefined : agentTemplateMarketCanonicalJson(body), timeout = new AbortController()
    const active = signal ? AbortSignal.any([signal, timeout.signal]) : timeout.signal
    let reader: ReadableStreamDefaultReader<Uint8Array> | null = null, responseBody: ReadableStream<Uint8Array> | null = null
    const unknown = () => new PgNativeTemplateMarketError(0, "template_market_outcome_unknown")
    let rejectAbort: (error: Error) => void = () => {}
    const aborted = new Promise<never>((_, reject) => {rejectAbort = reject}), onAbort = () => rejectAbort(unknown()), timer = setTimeout(() => timeout.abort(), budget)
    active.addEventListener("abort", onAbort, {once: true})
    try {
      if (active.aborted) throw unknown()
      const res = await Promise.race([send(root + "/api/v2/template-market" + path, {method, body: data, credentials: "same-origin", redirect: "error", cache: "no-store",
        referrerPolicy: "no-referrer", signal: active, headers: {Accept: "application/json", ...(method !== "GET" ? {"Content-Type": "application/json", "X-AgentStudio-Request": "1"} : {})}}), aborted])
      if (!(res instanceof Response) || res.redirected) return invalid()
      responseBody = res.body
      if (res.status === 401 || res.status === 403) throw new PgNativeTemplateMarketError(res.status, res.status === 401 ? "session_required" : "template_market_access_denied", true)
      if (!/^application\/json(?:;\s*charset=utf-8)?$/i.test(res.headers.get("content-type") ?? "") || !res.body) return invalid()
      const length = res.headers.get("content-length")
      if (length !== null && (!/^(0|[1-9][0-9]*)$/.test(length) || Number(length) > maxBytes)) return invalid()
      reader = res.body.getReader(); const selected = reader
      const read = async () => {
        const chunks: Uint8Array[] = []; let size = 0
        for (;;) {const part = await selected.read(); if (active.aborted) throw unknown(); if (part.done) break; size += part.value.byteLength; if (size > maxBytes) return invalid(); chunks.push(part.value)}
        if (length !== null && size !== Number(length)) return invalid()
        const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) {bytes.set(chunk, offset); offset += chunk.byteLength}
        let raw: unknown
        try {raw = decodeTemplateMarketJson(new TextDecoder("utf-8", {fatal: true}).decode(bytes))} catch {return invalid()}
        if (res.status !== 200) {
          if (res.status >= 400 && res.status < 500) {
            const v = O(raw, ["error"])
            if (typeof v.error !== "string" || !/^[a-z][a-z0-9_]{0,80}$/.test(v.error)) return invalid()
            throw new PgNativeTemplateMarketError(res.status, v.error, true)
          }
          throw new PgNativeTemplateMarketError(res.status, "template_market_outcome_unknown")
        }
        try {return await parse(raw)} catch {return invalid()}
      }
      return await Promise.race([read(), aborted])
    } catch (error) {if (error instanceof PgNativeTemplateMarketError) throw error; throw unknown()}
    finally {clearTimeout(timer); active.removeEventListener("abort", onAbort); if (reader) {void reader.cancel().catch(() => {}); try {reader.releaseLock()} catch {}} else if (responseBody) void responseBody.cancel().catch(() => {})}
  }
  const receipt = (intent: TemplateMarketIntent, signal?: AbortSignal) => {
    const path = intent.action === "publish" ? "/publish" : "/" + intent.template.template_id + (intent.action === "delete" ? "" : "/" + intent.action)
    return request(path, intent.action === "delete" ? "DELETE" : "POST", intent, raw => templateMarketReceipt(raw, intent), signal)
  }
  return Object.freeze({
    market(raw: unknown = {}, signal?: AbortSignal) {const q = parseAgentTemplateMarketQuery(raw); return request("/market?" + new URLSearchParams(q).toString(), "GET", undefined, parseAgentTemplateMarketPage, signal, 33554432)},
    mine(signal?: AbortSignal) {return request("/mine", "GET", undefined, parseAgentTemplateMarketMinePage, signal)},
    sources(signal?: AbortSignal) {return request("/sources", "GET", undefined, raw => {const v = O(raw, ["ok", "items"]); if (v.ok !== true) return invalid(); const items = A(v.items, 200).map(parseTemplateMarketSourceOption); if (new Set(items.map(item => item.spec_id)).size !== items.length) return invalid(); return {ok: true as const, items}}, signal)},
    source(key: string, signal?: AbortSignal) {const specId = ID(key); return request("/sources/" + specId, "GET", undefined, raw => {const source = parseTemplateMarketSource(raw); if (source.source.spec_id !== specId) return invalid(); return source}, signal)},
    detail(key: string, signal?: AbortSignal) {const templateId = ID(key); return request("/" + templateId, "GET", undefined, async raw => {const detail = await parseTemplateMarketDetail(raw); if (detail.item.id !== templateId) return invalid(); return detail}, signal)},
    previewPublish(raw: unknown, signal?: AbortSignal) {const choice = parseAgentTemplateMarketPublishChoice(raw); return request("/preview-publish", "POST", choice, async raw => {const p = await parseTemplateMarketPublishPreview(raw); if (!same(p.source, choice.source) || p.description !== choice.description || p.category !== choice.category || choice.name && p.name !== choice.name) return invalid(); return p}, signal)},
    previewUse(raw: unknown, signal?: AbortSignal) {const choice = parseAgentTemplateMarketUseChoice(raw); return request("/preview-use", "POST", choice, async raw => {const p = await parseTemplateMarketUsePreview(raw); if (!same(p.template, choice.template) || choice.copy_name && p.name !== choice.copy_name) return invalid(); return p}, signal)},
    mutate(raw: unknown, signal?: AbortSignal) {return receipt(templateMarketIntent(raw), signal)},
    recover(rawIntent: unknown, signal?: AbortSignal) {
      const intent = templateMarketIntent(rawIntent)
      return request("/requests/" + intent.request_id, "GET", undefined, raw => {const r = parseAgentTemplateMarketRecoveryResult(raw); if (r.status === "recorded") return {...r, receipt: templateMarketReceipt(r.receipt, intent)}; if (r.request_id !== intent.request_id) return invalid(); return r}, signal)
    },
  })
}
export type PgNativeTemplateMarketApi = ReturnType<typeof createPgNativeTemplateMarketApi>
