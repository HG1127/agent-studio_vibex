export type AuthoringRequestStage = "capture" | "preview"

type ApiErrorShape = {
  name?: unknown
  status?: unknown
  code?: unknown
}

/** Convert transport/API failures into actionable authoring guidance without exposing server internals. */
export function authoringRequestErrorText(error: unknown, stage: AuthoringRequestStage): string {
  const value = error && typeof error === "object" ? error as ApiErrorShape : {}
  const name = typeof value.name === "string" ? value.name : ""
  const code = typeof value.code === "string" ? value.code : ""
  const status = Number(value.status || 0)
  const suffix = code ? `（错误码：${code}）` : ""

  if (name === "AbortError") return ""
  if (name === "TimeoutError") {
    return "需求服务响应超时。原始输入仍保留；可以稍后重试，系统会复用本次请求编号，避免重复保存。"
  }
  if (status === 401) return "登录状态已失效，请重新登录后再预览需求。"
  if (status === 403) return "当前账号没有需求预览权限，请联系管理员检查账号状态。"
  if (status === 404) {
    return stage === "preview"
      ? "原始需求已保存，但当前服务端未部署「需求能力预览」接口（HTTP 404）。请管理员更新配套 PocketBase Hooks；无需重复登录，当前需求已保留。"
      : "当前服务端未部署「原始需求保存」接口（HTTP 404）。请管理员更新配套 PocketBase Hooks；本次尚未调用模型。"
  }
  if (status === 413 || code === "authoring_requirement_size_limit") {
    return "原始需求内容超过服务端允许的长度，请缩短需求后重试。"
  }
  if (status === 409) {
    return code === "authoring_idempotency_conflict"
      ? "本次需求编号与已有内容冲突。原始输入已保留，请修改需求后重新预览。"
      : `需求记录发生版本或归属冲突${suffix}，请刷新后重新预览。`
  }
  if (status >= 500) {
    return `服务端需求${stage === "capture" ? "保存" : "能力预览"}处理失败（HTTP ${status}${suffix}）。请管理员检查 PocketBase Hooks 日志；没有调用模型。`
  }
  if (status >= 400) {
    return `需求${stage === "capture" ? "保存" : "能力预览"}未通过服务端校验（HTTP ${status}${suffix}），请检查输入后重试。`
  }
  if (name === "TypeError") {
    return "无法连接 Agent Studio 业务服务。请检查本机服务连接和 PocketBase 服务状态；原始输入仍保留。"
  }
  return "需求预览暂时未完成。原始输入仍保留，请检查服务连接后重试。"
}
