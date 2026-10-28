// Composable Native-auth HTTP family; importing this file mounts no route.
import type {IncomingMessage, ServerResponse} from "node:http"
import {HttpError, type Identity} from "./contracts.ts"
import {nativeSessionToken, verifyNativeOrigin} from "./native-auth-http.mjs"
import {requireAgentDesignNative} from "./agent-design-source.ts"
import type {AgentDesignLedgerRepository} from "./agent-design-ledger.ts"
import {agentDesignObject as O, parseAgentDesignTransportJson} from "./agent-design-value-contract.ts"
import {parseAgentDesignChoice, parseAgentDesignSubmission, parseAgentDesignControl, parseAgentDesignSaveIntent, parseAgentDesignSavePreviewInput} from "./agent-design-contract.ts"
import {designId, parseAgentDesignSource, parseAgentDesignPreview, parseAgentDesignReceipt, parseAgentDesignView, parseAgentDesignControlReceipt, parseAgentDesignSavePreview, parseAgentDesignSaveReceipt} from "./agent-design-rpc-contract.ts"
export const agentDesignHttpBase = "/api/v2/agent-design" as const
type Repository = Pick<AgentDesignLedgerRepository, "preview" | "submit" | "confirm" | "view" | "control" | "previewSave" | "save"> & {source: Pick<AgentDesignLedgerRepository["source"], "reference">}
type Dependencies = {repository: Repository; authenticateRequest: (req: IncomingMessage) => Promise<Identity>; allowedOrigin: string}
const invalid = (): never => {throw new HttpError(400, "invalid_agent_design_request")}
function response(res: ServerResponse, status: number, body: unknown, allow?: string) {
  res.writeHead(status, {"Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", Pragma: "no-cache", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer", "Cross-Origin-Resource-Policy": "same-origin", ...(allow ? {Allow: allow} : {})}); res.end(JSON.stringify(body))
}
function projection<T>(fn: () => T): T {try {const v = fn(); if (Buffer.byteLength(JSON.stringify(v)) > 524288) throw Error(); return v} catch {throw Error("agent_design_uncertain_response")}}
async function read(req: IncomingMessage, max: number) {
  if (!/^application\/json(?:;\s*charset=utf-8)?$/i.test(String(req.headers["content-type"] ?? "")) || req.headers["content-encoding"] !== undefined) throw new HttpError(415, "json_content_type_required")
  const rawLength = req.headers["content-length"], transfer = req.headers["transfer-encoding"]
  if (rawLength !== undefined && (typeof rawLength !== "string" || !/^(0|[1-9][0-9]*)$/.test(rawLength))) return invalid()
  if (rawLength !== undefined && (!Number.isSafeInteger(Number(rawLength)) || Number(rawLength) > max)) throw new HttpError(413, "request_too_large")
  if (transfer !== undefined && (transfer !== "chunked" || rawLength !== undefined)) return invalid()
  const timer = setTimeout(() => req.destroy(Error("agent_design_read_timeout")), 5000)
  try {
    let used = 0; const chunks: Buffer[] = []
    for await (const piece of req) {const b = Buffer.isBuffer(piece) ? piece : Buffer.from(piece); used += b.length; if (used > max) throw new HttpError(413, "request_too_large"); chunks.push(b)}
    if (rawLength !== undefined && Number(rawLength) !== used) return invalid()
    try {return parseAgentDesignTransportJson(new TextDecoder("utf-8", {fatal: true}).decode(Buffer.concat(chunks)))} catch {return invalid()}
  } finally {clearTimeout(timer)}
}
async function empty(req: IncomingMessage) {if (req.headers["transfer-encoding"] !== undefined || req.headers["content-length"] !== undefined && req.headers["content-length"] !== "0") return invalid(); for await (const b of req) if (Buffer.byteLength(b) > 0) return invalid()}
function parseInput<T>(fn: () => T): T {try {return fn()} catch {return invalid()}}
/** false means another route family; the authenticated server composes it. */
export function createAgentDesignHttpHandler({repository: r, authenticateRequest, allowedOrigin}: Dependencies) {
  if (!r || typeof authenticateRequest !== "function") throw Error("agent_design_http_dependencies_required")
  verifyNativeOrigin({headers: {}} as IncomingMessage, allowedOrigin, false)
  return async (req: IncomingMessage, res: ServerResponse): Promise<boolean> => {
    const raw = req.url ?? "", prefix = (v: string) => v === agentDesignHttpBase || v.startsWith(agentDesignHttpBase + "/")
    let path = "", decoded = ""
    try {path = new URL(raw, "http://127.0.0.1").pathname; decoded = decodeURIComponent(path)} catch {}
    if (![raw.split(/[?#]/, 1)[0] ?? "", path, decoded].some(prefix)) return false
    let allow: string | undefined
    try {
      try {verifyNativeOrigin(req, allowedOrigin, req.method !== "GET")} catch {throw new HttpError(403, "native_request_origin_denied")}
      if (req.headers.authorization !== undefined || !nativeSessionToken(req)) throw new HttpError(401, "session_required")
      if (req.headers["x-rh-user-id"] !== undefined) throw new HttpError(403, "native_employee_identity_required")
      if (raw !== path || raw.includes("%")) return invalid()
      const action = /^\/api\/v2\/agent-design\/(preview|submit|confirm|control|confirm-control|preview-save|save|confirm-save)$/.exec(path)
      const item = /^\/api\/v2\/agent-design\/(sources|requests)\/([a-f0-9-]{36})$/.exec(path)
      if (!action && !item) return invalid()
      allow = action ? "POST" : "GET"; if (req.method !== allow) throw new HttpError(405, "method_not_allowed")
      let identity: Identity
      try {identity = await authenticateRequest(req)} catch (error) {
        // The actual Native closure uses Error + status, rather than HttpError.
        // Only its fixed authentication refusals become a public401; a backend
        // or post-write projection failure must remain an uncertain500.
        if (error instanceof Error && Object.getOwnPropertyDescriptor(error, "status")?.value === 401 &&
          ["session_required", "native_cookie_only"].includes(error.message)) throw new HttpError(401, "session_required")
        throw error
      }
      requireAgentDesignNative(identity)
      if (item) {
        await empty(req); const id = parseInput(() => designId(item[2]))
        const itemValue = item[1] === "sources" ? await r.source.reference(identity, id) : await r.view(identity, id)
        if (item[1] === "sources") response(res, 200, projection(() => {const v = parseAgentDesignSource(itemValue); if (v.source.spec_id !== id) throw Error(); return v}))
        else response(res, 200, projection(() => {const v = parseAgentDesignView(itemValue); if (v.receipt.request_id !== id) throw Error(); return v}))
      } else {
        const name = action![1]!, body = await read(req, ["preview-save", "save"].includes(name) ? 524288 : 32768)
        let value: unknown, decode: () => unknown
        if (name === "preview") {const v = parseInput(() => parseAgentDesignChoice(body)); value = await r.preview(identity, v); decode = () => parseAgentDesignPreview(value)}
        else if (name === "submit" || name === "confirm") {
          const v = parseInput(() => parseAgentDesignSubmission(body)), {request_sha256: _h, ...intent} = v
          value = await r[name](identity, intent); decode = () => {const result = parseAgentDesignReceipt(value); if (result.request_id !== v.request_id || result.request_sha256 !== v.request_sha256 || result.input_sha256 !== v.expected_input_sha256 || name === "confirm" && result.replayed !== true) throw Error(); return result}
        } else if (name === "control" || name === "confirm-control") {
          const v = parseInput(() => parseAgentDesignControl(body)), {request_sha256: _h, ...intent} = v
          value = await r.control(identity, intent, name === "confirm-control"); decode = () => {const result = parseAgentDesignControlReceipt(value); if (result.request_id !== v.request_id || result.design_request_id !== v.design_request_id || result.request_sha256 !== v.request_sha256 || result.action !== v.action || name === "confirm-control" && !result.replayed) throw Error(); return result}
        } else if (name === "preview-save") {const v = parseInput(() => parseAgentDesignSavePreviewInput(body)); value = await r.previewSave(identity, v); decode = () => {const result = parseAgentDesignSavePreview(value); if (result.design_request_id !== v.design_request_id || result.result_sha256 !== v.expected_result_sha256) throw Error(); return result}}
        else {
          const wrapper = name === "save" ? parseInput(() => O(body, ["intent", "preview"])) : {intent: body, preview: null}
          const v = parseInput(() => parseAgentDesignSaveIntent(wrapper.intent)), {request_sha256: _h, ...intent} = v
          if (name === "save") parseInput(() => parseAgentDesignSavePreviewInput(wrapper.preview))
          value = await r.save(identity, intent, wrapper.preview, name === "confirm-save"); decode = () => {const result = parseAgentDesignSaveReceipt(value); if (result.request_id !== v.request_id || result.design_request_id !== v.design_request_id || result.request_sha256 !== v.request_sha256 || result.preview_sha256 !== v.expected_preview_sha256 || result.result_sha256 !== v.expected_result_sha256 || result.source_sha256 !== v.expected_source_sha256 || result.candidate_sha256 !== v.expected_candidate_sha256 || name === "confirm-save" && !result.replayed) throw Error(); return result}
        }
        response(res, 200, projection(decode))
      }
    } catch (error) {
      // Only fixed public business codes are exposed. Projection failures after
      // fulfilled writes remain uncertain500; original confirmation is read-only.
      const known = error instanceof HttpError && /^(?:agent_design_[a-z_]+|invalid_agent_design_request|native_employee_identity_required|native_request_origin_denied|session_required|method_not_allowed|request_too_large|json_content_type_required|agent_spec_not_found)$/.test(error.code)
      response(res, known ? error.status : 500, {error: known ? error.code : "internal_error"}, allow)
    }
    return true
  }
}
