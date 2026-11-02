/** Employee-facing messages never include provider bodies or local sockets. */
export function llmErrorText(raw: string, fallback = "生成失败，请稍后重试"): string {
  const code = String(raw || "").trim()
  const messages: Record<string, string> = {
    timeout: "模型响应超时，需求已保留。请稍后重试，或在模型连接页检查服务状态。",
    cancelled: "本次等待已取消，需求已保留。",
    not_found: "未找到这次生成记录，需求已保留。请检查网络后重新生成。",
    rh_login_required: "请先登录后再生成",
    insufficient_balance: "账户余额不足，请充值后重试",
    model_connection_required: "没有可用模型连接：请先在「模型连接」页添加并启用一个模型连接",
    model_not_permitted: "所选模型已不在当前账号的授权列表中，请刷新并重新选择",
    strict_model_route_unavailable: "当前服务端不支持模型的严格授权绑定，请升级后端或切换到兼容工作台；不会自动使用备用模型。",
    custom_connection_missing: "模型连接已失效或当前账号无权访问，请刷新模型列表",
    custom_connection_invalid: "模型连接配置不完整，请在「模型连接」页检查服务地址和密钥。",
    llm_empty_content: "模型未返回可用内容，需求已保留。请重试或手动选择其他已授权模型。",
  }
  if (Object.hasOwn(messages, code)) return messages[code]
  if (/broken pipe|connection reset|socket hang up|jsontext:|unexpected eof/i.test(code))
    return "生成结果传输中断，需求已保留。请检查网络后重试；如持续出现，请联系管理员检查服务连接。"
  if (/timeout|deadline exceeded/i.test(code)) return messages.timeout
  if (/llm_http_(401|403)|provider_http_(401|403)/i.test(code))
    return "模型服务拒绝访问，请在「模型连接」页检查密钥及模型权限。"
  if (/llm_http_429|provider_http_429/i.test(code))
    return "模型服务请求过多，请稍后重试。"
  if (/llm_request_failed/i.test(code))
    return "暂时无法连接模型服务，需求已保留。请检查网络和模型连接后重试。"
  return fallback
}
