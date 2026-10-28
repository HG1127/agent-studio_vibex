// Native browser transport. One request per explicit action; no fee retry loop.
import {agentDesignObject as O, agentDesignJsonValue, parseAgentDesignEditableFields, parseAgentDesignTransportJson} from "../../services/pg-api/src/agent-design-value-contract.ts"
import {designChoice, designId, designSha, parseAgentDesignSource, parseAgentDesignPreview, parseAgentDesignReceipt, parseAgentDesignView, parseAgentDesignControlReceipt, parseAgentDesignSavePreview, parseAgentDesignSaveReceipt,
  type AgentDesignPreview, type AgentDesignSavePreview} from "../../services/pg-api/src/agent-design-rpc-contract.ts"
export * from "../../services/pg-api/src/agent-design-rpc-contract.ts"
const fees = {generate: "APPROVE_EXPLICIT_PAID_AGENT_DESIGN_GENERATE_V1", revise: "APPROVE_EXPLICIT_PAID_AGENT_DESIGN_REVISE_V1"}
export class PgNativeAgentDesignError extends Error {
  readonly status: number; readonly code: string
  constructor(status: number, code: string) {super(code); this.name = "PgNativeAgentDesignError"; this.status = status; this.code = code}
}
const invalid = (): never => {throw new PgNativeAgentDesignError(503, "invalid_agent_design_response")}
export function agentDesignSubmitBody(preview: AgentDesignPreview, requestId: string) {
  const p = parseAgentDesignPreview(preview), {action: _a, ...choice} = p.choice
  return {...choice, action: "submit", request_id: designId(requestId), expected_input_sha256: p.input_sha256, confirm: true, fee_acknowledgement: fees[p.choice.purpose]}
}
export function agentDesignSaveBody(preview: AgentDesignSavePreview, requestId: string) {
  const p = parseAgentDesignSavePreview(preview)
  return {intent: {action: "save", request_id: designId(requestId), design_request_id: p.design_request_id, expected_preview_sha256: p.preview_sha256,
    expected_result_sha256: p.result_sha256, expected_source_sha256: p.source_sha256, expected_candidate_sha256: p.candidate.candidate_sha256, confirm: true, save_acknowledgement: "APPROVE_EXACT_AGENT_DESIGN_SAVE_ONLY_V1"},
    preview: {action: "preview_save", design_request_id: p.design_request_id, expected_result_sha256: p.result_sha256, fields: p.fields}}
}
function submit(raw: unknown) {
  const v = O(raw, ["action", "purpose", "instruction", "model_binding", "output_token_limit", "source", "request_id", "expected_input_sha256", "confirm", "fee_acknowledgement"])
  const {action: _a, request_id, expected_input_sha256, confirm, fee_acknowledgement, ...rest} = v, c = designChoice({action: "preview", ...rest})
  if (v.action !== "submit" || confirm !== true || fee_acknowledgement !== fees[c.purpose]) throw Error("invalid_agent_design_request")
  return {...v, purpose: c.purpose, request_id: designId(request_id), expected_input_sha256: designSha(expected_input_sha256)}
}
function control(raw: unknown) {const v = O(raw, ["action", "request_id", "design_request_id", "confirm"]); if (v.action !== "cancel" && v.action !== "erase" || v.confirm !== true || v.request_id === v.design_request_id) throw Error(); return {...v, action: v.action as "cancel" | "erase", request_id: designId(v.request_id), design_request_id: designId(v.design_request_id)}}
function saveIntent(raw: unknown) {
  const v = O(raw, ["action", "request_id", "design_request_id", "expected_preview_sha256", "expected_result_sha256", "expected_source_sha256", "expected_candidate_sha256", "confirm", "save_acknowledgement"])
  if (v.action !== "save" || v.confirm !== true || v.save_acknowledgement !== "APPROVE_EXACT_AGENT_DESIGN_SAVE_ONLY_V1" || v.request_id === v.design_request_id) throw Error()
  return {...v, request_id: designId(v.request_id), design_request_id: designId(v.design_request_id), expected_preview_sha256: designSha(v.expected_preview_sha256), expected_result_sha256: designSha(v.expected_result_sha256), expected_source_sha256: designSha(v.expected_source_sha256), expected_candidate_sha256: designSha(v.expected_candidate_sha256)}
}
function savePreview(raw: unknown) {const v = O(raw, ["action", "design_request_id", "expected_result_sha256", "fields"]); if (v.action !== "preview_save") throw Error(); return {...v, design_request_id: designId(v.design_request_id), expected_result_sha256: designSha(v.expected_result_sha256), fields: parseAgentDesignEditableFields(v.fields)}}
export function createPgNativeAgentDesignApi(config: {transport?: typeof fetch; rootPath?: "" | "/__pg_native"; timeoutMs?: number} = {}) {
  const options = O(config), names = Object.keys(options)
  if (names.some(n => !["transport", "rootPath", "timeoutMs"].includes(n))) throw Error("invalid_agent_design_transport")
  const send = config.transport ?? fetch, root = config.rootPath ?? "/__pg_native", budget = config.timeoutMs ?? 8000
  if (typeof send !== "function" || root !== "" && root !== "/__pg_native" || !Number.isSafeInteger(budget) || budget < 1 || budget > 8000) throw Error("invalid_agent_design_transport")
  async function request<T>(path: string, method: "GET" | "POST", body: unknown, parse: (raw: unknown) => T, signal?: AbortSignal): Promise<T> {
    const data = body === undefined ? undefined : JSON.stringify(agentDesignJsonValue(body))
    if (data !== undefined && new TextEncoder().encode(data).length > 524288) throw Error("invalid_agent_design_request")
    const timeout = new AbortController(), active = signal ? AbortSignal.any([signal, timeout.signal]) : timeout.signal
    let reader: ReadableStreamDefaultReader<Uint8Array> | null = null, responseBody: ReadableStream<Uint8Array> | null = null
    let rejectAbort: (v: Error) => void = () => {}
    const unknown = () => new PgNativeAgentDesignError(0, "agent_design_outcome_unknown"), aborted = new Promise<never>((_, reject) => {rejectAbort = reject})
    const onAbort = () => rejectAbort(unknown()), timer = setTimeout(() => timeout.abort(), budget)
    active.addEventListener("abort", onAbort, {once: true})
    try {
      if (active.aborted) throw unknown()
      const res = await Promise.race([send(root + "/api/v2/agent-design/" + path, {method, body: data, credentials: "same-origin", redirect: "error", cache: "no-store", referrerPolicy: "no-referrer", signal: active, headers: {Accept: "application/json", ...(method === "POST" ? {"Content-Type": "application/json", "X-AgentStudio-Request": "1"} : {})}}), aborted])
      if (!(res instanceof Response) || res.redirected) return invalid()
      responseBody = res.body
      if (res.status === 401 || res.status === 403) throw new PgNativeAgentDesignError(res.status, res.status === 401 ? "session_required" : "agent_design_access_denied")
      if (!/^application\/json(?:;\s*charset=utf-8)?$/i.test(res.headers.get("content-type") ?? "") || !res.body) return invalid()
      const length = res.headers.get("content-length")
      if (length !== null && (!/^(0|[1-9][0-9]*)$/.test(length) || Number(length) > 524288)) return invalid()
      const selected = res.body.getReader(); reader = selected
      const read = async () => {
        let size = 0; const chunks: Uint8Array[] = []
        for (;;) {const c = await selected.read(); if (active.aborted) throw unknown(); if (c.done) break; size += c.value.byteLength; if (size > 524288) return invalid(); chunks.push(c.value)}
        if (length !== null && size !== Number(length)) return invalid()
        const bytes = new Uint8Array(size); let at = 0; for (const b of chunks) {bytes.set(b, at); at += b.byteLength}
        let raw: unknown
        try {raw = parseAgentDesignTransportJson(new TextDecoder("utf-8", {fatal: true}).decode(bytes))} catch {return invalid()}
        if (res.status !== 200) throw new PgNativeAgentDesignError(res.status, res.status >= 500 ? "agent_design_outcome_unknown" : "agent_design_request_refused")
        try {return parse(raw)} catch {return invalid()}
      }
      return await Promise.race([read(), aborted])
    } catch (e) {if (e instanceof PgNativeAgentDesignError) throw e; throw unknown()}
    finally {clearTimeout(timer); active.removeEventListener("abort", onAbort); if (reader) {void reader.cancel().catch(() => {}); try {reader.releaseLock()} catch {}} else if (responseBody) void responseBody.cancel().catch(() => {})}
  }
  return Object.freeze({
    source(id: string, signal?: AbortSignal) {const key = designId(id); return request("sources/" + key, "GET", undefined, raw => {const r = parseAgentDesignSource(raw); if (r.source.spec_id !== key) return invalid(); return r}, signal)},
    preview(raw: unknown, signal?: AbortSignal) {const c = designChoice(raw); return request("preview", "POST", c, value => {const p = parseAgentDesignPreview(value); if (JSON.stringify(p.choice) !== JSON.stringify(c)) return invalid(); return p}, signal)},
    submit(raw: unknown, signal?: AbortSignal, confirm = false) {const v = submit(raw); return request(confirm ? "confirm" : "submit", "POST", v, raw => {const r = parseAgentDesignReceipt(raw); if (r.request_id !== v.request_id || r.input_sha256 !== v.expected_input_sha256 || r.purpose !== v.purpose || confirm && !r.replayed) return invalid(); return r}, signal)},
    view(id: string, signal?: AbortSignal) {const key = designId(id); return request("requests/" + key, "GET", undefined, raw => {const r = parseAgentDesignView(raw); if (r.receipt.request_id !== key) return invalid(); return r}, signal)},
    control(raw: unknown, signal?: AbortSignal, confirm = false) {const v = control(raw); return request(confirm ? "confirm-control" : "control", "POST", v, raw => {const r = parseAgentDesignControlReceipt(raw); if (r.request_id !== v.request_id || r.design_request_id !== v.design_request_id || r.action !== v.action || confirm && !r.replayed) return invalid(); return r}, signal)},
    previewSave(raw: unknown, signal?: AbortSignal) {const v = savePreview(raw); return request("preview-save", "POST", v, raw => {const p = parseAgentDesignSavePreview(raw); if (p.design_request_id !== v.design_request_id || p.result_sha256 !== v.expected_result_sha256 || JSON.stringify(p.fields) !== JSON.stringify(v.fields)) return invalid(); return p}, signal)},
    save(raw: unknown, signal?: AbortSignal, confirm = false) {const w = confirm ? {intent: raw, preview: null} : O(raw, ["intent", "preview"]), v = saveIntent(w.intent); if (!confirm) savePreview(w.preview); return request(confirm ? "confirm-save" : "save", "POST", confirm ? v : {intent: v, preview: w.preview}, raw => {const r = parseAgentDesignSaveReceipt(raw); if (r.request_id !== v.request_id || r.design_request_id !== v.design_request_id || r.preview_sha256 !== v.expected_preview_sha256 || r.result_sha256 !== v.expected_result_sha256 || r.source_sha256 !== v.expected_source_sha256 || r.candidate_sha256 !== v.expected_candidate_sha256 || confirm && !r.replayed) return invalid(); return r}, signal)},
  })
}
export type PgNativeAgentDesignApi = ReturnType<typeof createPgNativeAgentDesignApi>
