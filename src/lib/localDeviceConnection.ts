export type ReadyLocalDevice = { id: string; revoked: boolean; seen_ms: number; catalog: string; backend?:'native_pg'; paired?:boolean }
export type LocalCapabilityTool={name:string;inputSchema?:Record<string,unknown>}

/** Connection display uses the same heartbeat window as capability preflight. */
export function localDeviceCatalog(device: ReadyLocalDevice | null | undefined, now = Date.now()): LocalCapabilityTool[] {
  if(device?.backend==='native_pg'&&device.paired!==true)return []
  if (!device?.id || device.revoked || !Number.isFinite(device.seen_ms) ||
      device.seen_ms <= 0 || now - device.seen_ms >= 45000 || device.seen_ms > now) return []
  try {
    const catalog: unknown = JSON.parse(device.catalog)
    return Array.isArray(catalog) ? catalog.slice(0,100).flatMap(tool =>
      tool && typeof tool.name === 'string' && tool.name.trim() ? [{name:tool.name,...(tool.inputSchema&&typeof tool.inputSchema==='object'&&!Array.isArray(tool.inputSchema)?{inputSchema:tool.inputSchema}:{})}] : []) : []
  } catch { return [] }
}
export function localDeviceToolNames(device: ReadyLocalDevice | null | undefined, now = Date.now()): string[] {return localDeviceCatalog(device,now).map(tool=>tool.name)}

