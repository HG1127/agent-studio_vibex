import type { ConnectionRow, SmitheryItem } from "../pages/PluginMarket/usePluginMarket"

/** Only Smithery's hosted authorization pages may be opened by an OAuth action. */
export function safeSmitherySetupUrl(url:string):string {
  try {
    const parsed=new URL(url)
    return parsed.protocol==="https:" &&
      ["auth.smithery.ai","smithery.ai"].includes(parsed.hostname) &&
      !parsed.username && !parsed.password ? parsed.toString() : ""
  }catch{return ""}
}

export type SmitheryCategory="all"|"dev"|"research"|"office"|"data"|"finance"

export const SMITHERY_CATEGORIES: {id:SmitheryCategory;label:string;query:string}[]=[
  {id:"all",label:"全部",query:""},
  {id:"dev",label:"代码研发",query:"github"},
  {id:"research",label:"搜索研究",query:"search"},
  {id:"office",label:"办公协作",query:"notion"},
  {id:"data",label:"数据分析",query:"database"},
  {id:"finance",label:"金融信息",query:"finance"},
]
export type SmitheryUiStatus="ready"|"action"|"error"|"legacy"|"revoke"|"inactive"|"none"

export function smitheryConnectionStatus(row?: ConnectionRow|null):SmitheryUiStatus {
  if(!row)return "none"
  if(row.last_probe_status==="legacy_reconnect" || row.url.includes("server.smithery.ai/"))
    return "legacy"
  if(row.last_probe_status==="needs_revoke")return "revoke"
  if(["auth_required","input_required","pending","needs_key","needs_refresh"].includes(row.last_probe_status))
    return "action"
  if(row.last_probe_status==="error" || row.last_probe_status==="connected" && row.tool_count===0)
    return "error"
  if(row.last_probe_status==="ok" && row.tool_count>0 && row.enabled)return "ready"
  return "inactive"
}
export function connectionForSmithery(item:SmitheryItem,rows:ConnectionRow[]):ConnectionRow|undefined {
  return rows.find(row=>row.server_name===item.slug &&
    (row.is_smithery===true || /^https:\/\/smithery\.run\/[-_a-zA-Z0-9]+\/[-_a-zA-Z0-9]+$/.test(row.url)))
}
export function smitheryStatusLabel(status:SmitheryUiStatus):string {
  return ({ready:"可使用",action:"继续授权",error:"需要修复",legacy:"旧版需重连",
    revoke:"远端待撤销",inactive:"已停用",none:"连接"} as const)[status]
}
