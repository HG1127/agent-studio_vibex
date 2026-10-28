// Composable family only; Root must mount behind real Native auth and the
// actual063-audited repository. Importing this file opens no listener or DB.
import type {IncomingMessage, ServerResponse} from "node:http"
import {HttpError, type Identity} from "./contracts.ts"
import {nativeSessionToken, verifyNativeOrigin} from "./native-auth-http.mjs"
import {parseAgentDesignTransportJson} from "./agent-design-value-contract.ts"
import {agentTemplateMarketObject as O, agentTemplateMarketArray as A, agentTemplateMarketId as ID, agentTemplateMarketText as T,
  agentTemplateMarketInteger as N, agentTemplateMarketCanonicalJson, parseAgentTemplateMarketSourcePin, parseAgentTemplateMarketQuery, parseAgentTemplateMarketPublishChoice, parseAgentTemplateMarketUseChoice,
  parseAgentTemplateMarketSnapshot} from "./agent-template-market-contract.ts"
import {parseAgentTemplateMarketPage, parseAgentTemplateMarketMinePage, parseAgentTemplateMarketRecoveryResult} from "./agent-template-market-result.ts"
import {requireAgentTemplateMarketNative} from "./agent-template-market-runtime-policy.ts"
import {parseAgentTemplateMarketIntent, matchAgentTemplateMarketReceipt, projectAgentTemplateMarketDetail,
  projectAgentTemplateMarketPublishPreview, projectAgentTemplateMarketUsePreview, type AgentTemplateMarketRepository} from "./agent-template-market-repository.ts"

export const agentTemplateMarketHttpBase = "/api/v2/template-market" as const
type Repository = Pick<AgentTemplateMarketRepository, "sources" | "source" | "market" | "mine" | "detail" | "previewPublish" | "previewUse" | "record" | "recover">
type Dependencies = {repository: Repository; authenticateRequest: (req: IncomingMessage) => Promise<Identity>; allowedOrigin: string}
const invalid = (): never => {throw new HttpError(400, "invalid_agent_template_market_request")}
function input<T>(parse: () => T): T {try {return parse()} catch {return invalid()}}
async function projected<T>(parse: () => T | Promise<T>, limit = 524288): Promise<T> {
  try {const value = await parse(); if (Buffer.byteLength(JSON.stringify(value)) > limit) throw Error(); return value} catch {throw Error("agent_template_market_uncertain_response")}
}
function respond(res: ServerResponse, status: number, value: unknown, allow?: string) {
  const text = JSON.stringify(value)
  res.writeHead(status, {"Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", Pragma: "no-cache", "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer", "Cross-Origin-Resource-Policy": "same-origin", "X-Frame-Options": "DENY", ...(allow ? {Allow: allow} : {})}); res.end(text)
}
async function read(req: IncomingMessage) {
  if (!/^application\/json(?:;\s*charset=utf-8)?$/i.test(String(req.headers["content-type"] ?? "")) || req.headers["content-encoding"] !== undefined) throw new HttpError(415, "json_content_type_required")
  const length = req.headers["content-length"], transfer = req.headers["transfer-encoding"], max = 32768
  if (length !== undefined && (typeof length !== "string" || !/^(0|[1-9][0-9]*)$/.test(length))) return invalid()
  if (length !== undefined && (!Number.isSafeInteger(Number(length)) || Number(length) > max)) throw new HttpError(413, "request_too_large")
  if (transfer !== undefined && (transfer !== "chunked" || length !== undefined)) return invalid()
  const timer = setTimeout(() => req.destroy(Error("agent_template_market_read_timeout")), 5000)
  try {
    const chunks: Buffer[] = []; let used = 0
    for await (const piece of req) {const bytes = Buffer.isBuffer(piece) ? piece : Buffer.from(piece); used += bytes.length; if (used > max) throw new HttpError(413, "request_too_large"); chunks.push(bytes)}
    if (length !== undefined && Number(length) !== used) return invalid()
    try {return parseAgentDesignTransportJson(new TextDecoder("utf-8", {fatal: true}).decode(Buffer.concat(chunks)))} catch {return invalid()}
  } finally {clearTimeout(timer)}
}
async function empty(req: IncomingMessage) {
  if (req.headers["transfer-encoding"] !== undefined || req.headers["content-length"] !== undefined && req.headers["content-length"] !== "0") return invalid()
  for await (const value of req) if (Buffer.byteLength(value) > 0) return invalid()
}
function sourceSummary(raw: unknown) {const v = O(raw, ["source", "name"]); return {source: parseAgentTemplateMarketSourcePin(v.source), name: T(v.name, 120, true)}}
const same = (a: unknown, b: unknown) => agentTemplateMarketCanonicalJson(a) === agentTemplateMarketCanonicalJson(b)
/** false leaves unrelated route families untouched. No fake identity fallback. */
export function createAgentTemplateMarketHttpHandler({repository: r, authenticateRequest, allowedOrigin}: Dependencies) {
  if (!r || typeof authenticateRequest !== "function") throw Error("agent_template_market_http_dependencies_required")
  verifyNativeOrigin({headers: {}} as IncomingMessage, allowedOrigin, false)
  async function authenticate(req: IncomingMessage): Promise<Identity> {
    let identity: Identity
    try {identity = await authenticateRequest(req)} catch (error) {
      if (error instanceof Error && Object.getOwnPropertyDescriptor(error, "status")?.value === 401 && ["session_required", "native_cookie_only"].includes(error.message)) throw new HttpError(401, "session_required")
      throw error
    }
    requireAgentTemplateMarketNative(identity)
    return identity
  }
  return async (req: IncomingMessage, res: ServerResponse): Promise<boolean> => {
    const raw = req.url ?? "", prefix = (value: string) => value === agentTemplateMarketHttpBase || value.startsWith(agentTemplateMarketHttpBase + "/")
    let url: URL | undefined, decoded = ""
    try {url = new URL(raw, "http://127.0.0.1"); decoded = decodeURIComponent(url.pathname)} catch {}
    if (![raw.split(/[?#]/, 1)[0] ?? "", url?.pathname ?? "", decoded].some(prefix)) return false
    let allow: string | undefined
    try {
      try {verifyNativeOrigin(req, allowedOrigin, req.method !== "GET")} catch {throw new HttpError(403, "native_request_origin_denied")}
      if (req.headers.authorization !== undefined || !nativeSessionToken(req)) throw new HttpError(401, "session_required")
      if (["x-rh-user-id", "x_rh_user_id", "x-rh-user_id"].some(key => req.headers[key] !== undefined)) throw new HttpError(403, "native_employee_identity_required")
      if (!url || raw !== url.pathname + url.search || raw.includes("#") || url.pathname.includes("%")) return invalid()
      const suffix = url.pathname.slice(agentTemplateMarketHttpBase.length)
      const record = /^\/([a-f0-9-]{36})(?:\/(use|unpublish|republish))?$/.exec(suffix)
      const source = /^\/sources\/([a-f0-9-]{36})$/.exec(suffix), request = /^\/requests\/([a-f0-9-]{36})$/.exec(suffix)
      const named = ["/market", "/mine", "/sources", "/preview-publish", "/preview-use", "/publish"].includes(suffix)
      if (!record && !source && !request && !named) return invalid()
      const market = suffix === "/market"
      if (!market && url.search) return invalid()
      let query: ReturnType<typeof parseAgentTemplateMarketQuery> | undefined
      if (market) {
        const values = [...url.searchParams.entries()]
        if (values.some(([key]) => key !== "category" && key !== "search") || new Set(values.map(([key]) => key)).size !== values.length) return invalid()
        query = input(() => parseAgentTemplateMarketQuery(Object.fromEntries(values)))
      }
      const reading = market || suffix === "/mine" || suffix === "/sources" || Boolean(source) || Boolean(request) || record && !record[2] && req.method === "GET"
      allow = reading ? "GET" : record && !record[2] ? "GET, DELETE" : "POST"
      if (reading ? req.method !== "GET" : record && !record[2] ? req.method !== "DELETE" : req.method !== "POST") throw new HttpError(405, "method_not_allowed")
      const verified = await authenticate(req), identity: Identity = {issuer: verified.issuer, subject: verified.subject}
      let output: unknown
      if (reading) {
        await empty(req)
        if (market) {const value = await r.market(identity, query); output = await projected(() => parseAgentTemplateMarketPage(value), 33554432)}
        else if (suffix === "/mine") {const value = await r.mine(identity); output = await projected(() => parseAgentTemplateMarketMinePage(value))}
        else if (suffix === "/sources") {
          const value = await r.sources(identity)
          output = await projected(() => {const v = O(value, ["ok", "items"]); if (v.ok !== true) throw Error(); const items = A(v.items, 200).map(raw => {const item = O(raw, ["spec_id", "name", "revision"]); return {spec_id: ID(item.spec_id), name: T(item.name, 120, true), revision: N(item.revision, 1)}}); if (new Set(items.map(item => item.spec_id)).size !== items.length) throw Error(); return {ok: true as const, items}})
        } else if (source) {
          const key = input(() => ID(source[1])), value = await r.source(identity, key)
          output = await projected(() => {const result = sourceSummary(value); if (result.source.spec_id !== key) throw Error(); return result})
        } else if (request) {
          const key = input(() => ID(request[1])), value = await r.recover(identity, key)
          output = await projected(() => {const result = parseAgentTemplateMarketRecoveryResult(value); if ((result.status === "recorded" ? result.receipt.request_id : result.request_id) !== key) throw Error(); return result})
        } else {
          const key = input(() => ID(record![1])), value = await r.detail(identity, key)
          output = await projected(async () => {const v = O(value, ["item", "snapshot", "is_mine", "author_tail"]), snapshot = parseAgentTemplateMarketSnapshot(v.snapshot); const item = O(v.item, ["id", "name", "description", "category", "source_spec_id", "built_in", "public", "use_count", "created", "revision", "snapshot_sha256"]); const result = await projectAgentTemplateMarketDetail({...item, spec: snapshot.spec, is_mine: v.is_mine, author_tail: v.author_tail}); if (result.item.id !== key) throw Error(); return result})
        }
      } else {
        const rawBody = await read(req)
        if (suffix === "/preview-publish") {
          const choice = input(() => parseAgentTemplateMarketPublishChoice(rawBody)), value = await r.previewPublish(identity, choice)
          output = await projected(async () => {const result = await projectAgentTemplateMarketPublishPreview(value); if (!same(result.source, choice.source) || choice.name && result.name !== choice.name || result.description !== choice.description || result.category !== choice.category) throw Error(); return result})
        } else if (suffix === "/preview-use") {
          const choice = input(() => parseAgentTemplateMarketUseChoice(rawBody)), value = await r.previewUse(identity, choice)
          output = await projected(async () => {const v = O(value, ["template", "name", "snapshot", "copy_sha256", "resource_selection_required", "starts_run"]), snapshot = parseAgentTemplateMarketSnapshot(v.snapshot); const {quality_checks: _checks, ...spec} = snapshot.spec; const result = await projectAgentTemplateMarketUsePreview({template: v.template, name: v.name, spec, copy_sha256: v.copy_sha256, resource_selection_required: v.resource_selection_required, starts_run: v.starts_run, authority: false}); if (!same(result.template, choice.template) || choice.copy_name && result.name !== choice.copy_name) throw Error(); return result})
        } else {
          const intent = input(() => parseAgentTemplateMarketIntent(rawBody))
          const expected = suffix === "/publish" ? "publish" : record?.[2] ?? "delete"
          if (intent.action !== expected || intent.action !== "publish" && intent.template.template_id !== input(() => ID(record?.[1]))) return invalid()
          const value = await r.record(identity, intent)
          output = await projected(() => matchAgentTemplateMarketReceipt(value, intent))
        }
      }
      // Actual opaque session can expire or change while the original DB work
      // is pending. Never release that old result under a replacement identity.
      const after = await authenticate(req)
      if (after.issuer !== identity.issuer || after.subject !== identity.subject) throw new HttpError(401, "session_required")
      respond(res, 200, output)
    } catch (error) {
      const known = error instanceof HttpError && /^(?:agent_template_market_[a-z_]+|invalid_agent_template_market_request|native_employee_identity_required|native_request_origin_denied|employee_not_provisioned|session_required|method_not_allowed|request_too_large|json_content_type_required)$/.test(error.code)
      respond(res, known ? error.status : 500, {error: known ? error.code : "internal_error"}, allow)
    }
    return true
  }
}
