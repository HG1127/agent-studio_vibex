import { getPocketBaseUrl } from './pb'
import { vibexAuthHeaders } from './studioAuth'

export type LocalTool = { name: string; description: string; inputSchema: Record<string, unknown> }
export type LocalDevice = { id: string; name: string; revoked: boolean; seen_ms: number; catalog: string }
export type LocalJob = { id: string; status: string; result: string; error: string; images?: { mimeType: 'image/png' | 'image/jpeg'; data: string }[] }
export async function localApi<T>(route: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(getPocketBaseUrl() + route, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json', ...vibexAuthHeaders() },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal,
  })
  if (!response.ok) throw Error(response.status === 401 ? '登录已失效，请重新登录' : '请求未完成，请检查设备状态、权限和输入后重试')
  return response.json() as Promise<T>
}
export function deviceTools(device?: LocalDevice): LocalTool[] {
  try { return JSON.parse(device?.catalog || '[]') as LocalTool[] } catch { return [] }
}
