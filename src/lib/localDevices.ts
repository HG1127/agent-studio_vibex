import { getPocketBaseUrl } from './pb'
import { vibexAuthHeaders } from './studioAuth'

export type LocalTool = { name: string; description: string; inputSchema: Record<string, unknown> }
export type LocalDevice = { id: string; name: string; revoked: boolean; seen_ms: number; catalog: string;
  /** Optional for older preview APIs. Never derive pairing success from a name. */
  paired?:boolean; pairing_expires_ms?:number; setup_stage?:string; setup_seen_ms?:number }
export type LocalJob = { id: string; status: string; result: string; error: string; images?: { mimeType: 'image/png' | 'image/jpeg'; data: string }[] }
export class LocalApiError extends Error {
  status: number
  code: string
  constructor(message: string, status: number, code: string) {
    super(message)
    this.name = 'LocalApiError'
    this.status = status
    this.code = code
  }
}
export async function localApi<T>(route: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(getPocketBaseUrl() + route, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json', ...vibexAuthHeaders() },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal:AbortSignal.any([AbortSignal.timeout(12000),...(signal?[signal]:[])]),
  })
  if (!response.ok) {
    const data=await response.json().catch(()=>({}))
    const hints:Record<string,string>={connector_update_or_offline:'连接器离线或尚未升级到内嵌管理版本。请恢复原连接，不要重新配对。',device_busy:'这台电脑正在处理任务或另一项授权请求，请结束后再操作。',permission_revision_changed:'授权已在其他窗口变更，请加载最新范围后重新确认。',control_already_applying:'本机已开始应用，不能再撤销此请求。请核对生效结果。',request_identity_conflict:'重复请求内容不一致，已拒绝执行。',invalid_control_request:'授权请求不受支持，未执行修改。',control_not_found:'无法读取这条授权请求，请核对当前账号。',invalid_origin:'网站地址格式不正确，请使用明确的 http 或 https 来源。'}
    throw new LocalApiError(response.status===401?'登录已失效，请重新登录':hints[data.error]||(data.error==='pairing_not_renewable'?'这条连接已配对、已撤销或不属于当前账号，不能重新生成凭证。已配对设备请在本机恢复启动。':'请求未完成，请检查设备状态、权限和输入后重试'),response.status,typeof data.error==='string'?data.error:'')
  }
  return response.json() as Promise<T>
}
export function deviceTools(device?: LocalDevice): LocalTool[] {
  try {
    const rows:unknown=JSON.parse(device?.catalog||'[]')
    return Array.isArray(rows)?rows.filter((row):row is LocalTool=>!!row&&typeof row==='object'&&
      typeof row.name==='string'&&typeof row.description==='string'&&!!row.inputSchema&&typeof row.inputSchema==='object').slice(0,100):[]
  }catch{return []}
}
