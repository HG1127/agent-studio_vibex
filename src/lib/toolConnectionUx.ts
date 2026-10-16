export type ToolHttpMethod = "GET" | "POST"
export type ToolRequestDraft = { url: string; method: ToolHttpMethod; input: string; bodyTemplate?: string; timeout?: string; headers?: {key: string; value: string}[] }
export const OPEN_METEO_EXAMPLE = {
  name: "open_meteo_weather",
  description: "按经纬度查询实时温度、湿度和天气代码；调用参数为 latitude 与 longitude。如果只有城市名，需先进行地理编码。",
  url: "https://api.open-meteo.com/v1/forecast?latitude={{latitude}}&longitude={{longitude}}&current=temperature_2m,relative_humidity_2m,weather_code&timezone=Asia%2FShanghai",
  method: "GET" as const,
  input: '{\n  "latitude": 30.2741,\n  "longitude": 120.1551\n}',
}
const token = /\{\{\s*([a-zA-Z0-9_一-龥]+)\s*\}\}/g
const keys = (s: string): string[] => [...new Set(Array.from(s.matchAll(token), m => m[1]).filter(x => x !== "input"))]
export function isOpenMeteoForecast(url: string): boolean {
  try { const u = new URL(url); return u.hostname.toLowerCase() === "api.open-meteo.com" && u.pathname === "/v1/forecast" }
  catch { return false }
}
export type ToolRequestPreview = { errors: string[]; warnings: string[]; host: string; queryKeys: string[]; placeholders: string[]; missing: string[]; inputValid: boolean; isWeatherForecast: boolean }
export function inspectToolRequest(d: ToolRequestDraft): ToolRequestPreview {
  const errors: string[] = [], warnings: string[] = []
  const rawUrl = d.url.trim(), isWeatherForecast = isOpenMeteoForecast(rawUrl)
  let host = "", queryKeys: string[] = [], uri: URL | null = null
  if (!/^https?:\/\//i.test(rawUrl)) errors.push("请求 URL 必须以 http:// 或 https:// 开头")
  else try {
    uri = new URL(rawUrl)
    host = uri.host
    queryKeys = [...new Set(uri.searchParams.keys())]
    if (uri.username || uri.password) errors.push("URL 不能携带账号密码；请使用受保护的请求头")
    if (queryKeys.some(k => /^(?:api[_-]?key|token|secret|password|access[_-]?key)$/i.test(k)))
      warnings.push("URL 中疑似包含密钥；建议改用服务端加密保存的请求头")
  } catch { errors.push("URL 格式不正确，请检查域名、路径或查询参数") }
  if (isWeatherForecast) {
    if (d.method !== "GET") errors.push("Open-Meteo /v1/forecast 应使用 GET，而不是 POST")
    if (uri && (!uri.searchParams.has("latitude") || !uri.searchParams.has("longitude")))
      errors.push("Open-Meteo Forecast 必须包含 latitude 和 longitude 查询参数，不能只传 city")
  }
  if (d.timeout !== undefined && (!Number.isInteger(Number(d.timeout)) || Number(d.timeout) < 5 || Number(d.timeout) > 60))
    errors.push("超时秒数必须是 5–60 之间的整数")
  const placeholders = [...new Set([...keys(rawUrl), ...(d.method === "POST" ? keys(d.bodyTemplate || "") : [])])]
  const input = d.input.trim() || "{}"
  let values: Record<string, unknown> = {}, inputValid = true
  try { const v: unknown = JSON.parse(input); if (!v || Array.isArray(v) || typeof v !== "object") throw Error("object_expected"); values = v as Record<string, unknown> }
  catch { inputValid = false; errors.push('测试参数不是有效 JSON 对象，参考 {"latitude":30.2741,"longitude":120.1551}') }
  const missing = inputValid ? placeholders.filter(k => !Object.prototype.hasOwnProperty.call(values,k) || values[k] === "" || values[k] === null) : []
  if (missing.length) errors.push("测试参数缺少字段：" + missing.join("、"))
  if (isWeatherForecast && inputValid && "city" in values &&
      (placeholders.includes("latitude") || placeholders.includes("longitude")) &&
      (!("latitude" in values) || !("longitude" in values)))
    errors.push("Forecast 不能直接使用 city，请先取得经纬度，或点击天气示例")
  if (d.method === "GET" && inputValid && !rawUrl.includes("{{input}}")) {
    const unused = Object.keys(values).filter(k => !placeholders.includes(k))
    if (unused.length) warnings.push("以下测试字段没有用于 GET URL，会被忽略：" + unused.join("、"))
  }
  if (d.method === "GET" && d.bodyTemplate?.trim())
    warnings.push("GET 不发送 POST 请求体模板；请在 URL 查询参数中使用占位符")
  if (d.method === "GET" && !placeholders.length && !queryKeys.length && input !== "{}")
    warnings.push("URL 未使用测试参数占位符；GET 请求不会自动把参数对象附加到 URL")
  if (d.method === "GET" && rawUrl.includes("{{input}}"))
    warnings.push("完整 {{input}} 放入 URL 可能暴露参数，请改为 ?字段={{字段名}}")
  if (d.method === "POST" && d.bodyTemplate?.trim() && inputValid && !missing.length) {
    const contentType = d.headers?.find(h=>h.key.toLowerCase().trim() === "content-type")?.value.toLowerCase().trim() || "application/json"
    if (contentType.includes("json")) {
      const rendered = d.bodyTemplate.replace(token, (_m, k: string) => k === "input" ? input :
        encodeURIComponent(typeof values[k] === "object" && values[k] !== null ? JSON.stringify(values[k]) : String(values[k] ?? "")))
      try { JSON.parse(rendered) } catch { errors.push("请求体替换参数后不是有效 JSON；请检查模板引号，或使用 {{input}} 发送完整 JSON") }
    }
  }
  return {errors:[...new Set(errors)],warnings,host,queryKeys,placeholders,missing,inputValid,isWeatherForecast}
}
export function toolFailureGuidance(result: {ok: boolean;status_code: number;response_excerpt?: string},context?:{method?:string;url?:string}): string[] {
  if (result.ok) return []
  const s: string[] = [],code=result.status_code
  if (code === 400 || code === 422) {
    s.push("服务端拒绝了参数或格式，请核对 API 文档中的方法、字段名与数据类型")
    s.push(context?.method === "GET" ? "GET 一般通过 URL 的 ?参数={{字段}} 传值，测试参数不会自动附加到 URL" : "POST 请核对 Content-Type、请求体模板和渲染后的 JSON 格式")
    if (/not valid json|invalid json|json parse/i.test(result.response_excerpt||""))
      s.push("响应提到了 JSON 无效，但仅凭这一句无法定位是哪个参数或请求体出错")
    if (context?.url && isOpenMeteoForecast(context.url))
      s.push("Open-Meteo Forecast 应使用 GET 和 latitude/longitude；城市名需先地理编码")
  } else if (code === 401 || code === 403) s.push("检查 API Key、Authorization 请求头及账户权限")
  else if (code === 404) s.push("检查 URL 路径、API 版本和接口是否存在")
  else if (code === 405) s.push("接口不接受当前方法，请按文档切换 GET / POST")
  else if (code === 429) s.push("供应商可能限制了请求速率或配额，请稍后重试")
  else if (code === 0 || code === 408 || code === 504) s.push("检查第三方网络可达性和超时设置")
  else if (code >= 500) s.push("第三方服务器出错，请查看供应商状态")
  return s
}
