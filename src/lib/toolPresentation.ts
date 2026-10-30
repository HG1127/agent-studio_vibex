export const TOOL_STATUS_META: Record<string, { label: string; badge: string }> = {
  ok: { label: "正常", badge: "bg-primary/10 text-primary" },
  error: { label: "异常", badge: "bg-destructive/10 text-destructive" },
  untested: { label: "未测试", badge: "bg-muted text-muted-foreground" },
}

// 卡片上只展示脱敏域名，不展示完整 URL 路径
export function maskToolDomain(rawUrl: string): string {
  const cleaned = String(rawUrl || "").replace(/^https?:\/\//i, "")
  return cleaned.split("/")[0] || cleaned
}
