// Design-only bounded single POST with the established provider request shape;
// never the review executor, purpose, approval or generic Agent token budget.
import {resolve4, resolve6} from "node:dns/promises"
import {request as httpsRequest, type RequestOptions} from "node:https"
import {exactProviderEndpoint, resolveSafeProviderAddress, type ProviderResolver} from "./model-connection-probe.ts"
import {agentDesignExecutionEnabled, type AgentDesignActivation} from "./agent-design-runtime-policy.ts"
import {agentDesignObject as O, parseAgentDesignModelJson, parseAgentDesignTransportJson} from "./agent-design-value-contract.ts"
export type AgentDesignProviderInput = {messages: [{role: "system"; content: string}, {role: "user"; content: string}]; output_token_limit: 4096 | 8192 | 16384}
export type AgentDesignModelMaterial = {provider: "openai" | "anthropic" | "gemini"; base_url: string; model_id: string; api_key: string}
export type AgentDesignPreparedProviderRequest = {host: string; path: string; headers: Record<string, string>; body: Buffer}
export type AgentDesignExecutor = (material: AgentDesignModelMaterial, input: AgentDesignProviderInput, signal: AbortSignal, beforePost: () => Promise<void>) => Promise<string>
export function prepareAgentDesignProviderRequest(material: AgentDesignModelMaterial, input: AgentDesignProviderInput): AgentDesignPreparedProviderRequest {
  const endpoint = exactProviderEndpoint(material), cap = input.output_token_limit
  if (![4096, 8192, 16384].includes(cap) || typeof material.api_key !== "string" || material.api_key.length < 8 || material.api_key.length > 4096 || /[\s\u0000-\u001f\u007f]/u.test(material.api_key) || typeof material.model_id !== "string" || !/^[A-Za-z0-9._:/-]{1,120}$/.test(material.model_id)) throw Error("agent_design_provider_material_refused")
  if (!Array.isArray(input.messages) || input.messages.length !== 2) throw Error("agent_design_provider_messages_refused")
  const messages = input.messages.map((m, i) => {const v = O(m, ["role", "content"]); if (v.role !== (i === 0 ? "system" : "user") || typeof v.content !== "string" || !v.content.length || v.content.includes("\0")) throw Error("agent_design_provider_messages_refused"); return {role: v.role, content: v.content}})
  if (Buffer.byteLength(JSON.stringify(messages)) > 262144) throw Error("agent_design_provider_messages_refused")
  const headers: Record<string, string> = {Accept: "application/json", "Content-Type": "application/json", "User-Agent": "agentstudio-pg18-private-design/1"}
  let path: string, payload: unknown
  if (material.provider === "openai") {path = "/v1/chat/completions"; headers.Authorization = "Bearer " + material.api_key; payload = {model: material.model_id, messages, max_completion_tokens: cap, response_format: {type: "json_object"}}}
  else if (material.provider === "anthropic") {path = "/v1/messages"; headers["x-api-key"] = material.api_key; headers["anthropic-version"] = "2023-06-01"; payload = {model: material.model_id, system: messages[0]!.content, messages: [messages[1]], max_tokens: cap}}
  else {const model = material.model_id.startsWith("models/") ? material.model_id.slice(7) : material.model_id; if (!/^[A-Za-z0-9._-]{1,100}$/.test(model)) throw Error("agent_design_provider_model_refused"); path = "/v1beta/models/" + model + ":generateContent"; headers["x-goog-api-key"] = material.api_key; payload = {systemInstruction: {parts: [{text: messages[0]!.content}]}, contents: [{role: "user", parts: [{text: messages[1]!.content}]}], generationConfig: {maxOutputTokens: cap, responseMimeType: "application/json"}}}
  const body = Buffer.from(JSON.stringify(payload)); if (body.length > 524288) throw Error("agent_design_provider_input_too_large")
  headers["Content-Length"] = String(body.length)
  return {host: endpoint.host, path, headers, body}
}
export function extractAgentDesignProviderText(provider: AgentDesignModelMaterial["provider"], raw: unknown): string {
  const v = O(raw); let value: unknown
  if (provider === "openai") {
    if (!Array.isArray(v.choices) || v.choices.length !== 1) throw Error()
    const c = O(v.choices[0]), m = O(c.message)
    if (c.finish_reason !== "stop" || m.tool_calls !== undefined || m.function_call !== undefined || m.refusal !== undefined && m.refusal !== null) throw Error()
    value = m.content
  } else if (provider === "anthropic") {
    if (v.stop_reason !== "end_turn" || !Array.isArray(v.content) || v.content.length !== 1) throw Error()
    const c = O(v.content[0]); if (c.type !== "text") throw Error(); value = c.text
  } else {
    if (!Array.isArray(v.candidates) || v.candidates.length !== 1) throw Error()
    const c = O(v.candidates[0]), content = O(c.content)
    if (c.finishReason !== "STOP" || !Array.isArray(content.parts) || content.parts.length !== 1) throw Error()
    const p = O(content.parts[0]); if (p.functionCall !== undefined || p.thought !== undefined) throw Error(); value = p.text
  }
  parseAgentDesignModelJson(value)
  return value as string
}
export function createAgentDesignProviderExecutor(options: AgentDesignActivation = {}, resolver: ProviderResolver = {resolve4, resolve6}, request: typeof httpsRequest = httpsRequest): AgentDesignExecutor {
  if (!agentDesignExecutionEnabled(options)) throw Error("agent_design_provider_disabled")
  return async (material, input, signal, beforePost) => {
    signal.throwIfAborted()
    const prepared = prepareAgentDesignProviderRequest(material, input)
    const address = await resolveSafeProviderAddress(resolver, prepared.host)
    await beforePost(); signal.throwIfAborted()
    return new Promise<string>((resolve, reject) => {
      let settled = false
      const fail = () => {if (!settled) {settled = true; reject(Error("agent_design_provider_unknown"))}}
      const opts: RequestOptions = {protocol: "https:", hostname: prepared.host, servername: prepared.host, port: 443, path: prepared.path, method: "POST", headers: prepared.headers,
        rejectUnauthorized: true, minVersion: "TLSv1.2", agent: false, family: address.family, lookup: (_host, _opts, cb) => cb(null, address.address, address.family), signal: AbortSignal.any([signal, AbortSignal.timeout(25000)])}
      try {
        const req = request(opts, res => {
          if (res.statusCode !== 200 || !/^application\/json(?:\s*;|$)/i.test(String(res.headers["content-type"] ?? "")) || res.headers["content-encoding"] !== undefined && res.headers["content-encoding"] !== "identity") {fail(); res.destroy(); return}
          let size = 0; const chunks: Buffer[] = []
          res.on("data", piece => {if (settled) return; const bytes = Buffer.isBuffer(piece) ? piece : Buffer.from(piece); size += bytes.length; if (size > 524288) {fail(); res.destroy(); return}; chunks.push(bytes)})
          res.once("error", fail); res.once("aborted", fail)
          res.once("end", () => {if (settled) return; try {const value = extractAgentDesignProviderText(material.provider, parseAgentDesignTransportJson(new TextDecoder("utf-8", {fatal: true}).decode(Buffer.concat(chunks)))); settled = true; resolve(value)} catch {fail()} finally {for (const b of chunks) b.fill(0)}})
        })
        req.once("error", fail); req.end(prepared.body)
      } catch {fail()}
    })
  }
}
