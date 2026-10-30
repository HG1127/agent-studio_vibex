export type ReadyLocalDevice = { id: string; revoked: boolean; seen_ms: number; catalog: string }

/** Connection display uses the same heartbeat window as capability preflight. */
export function localDeviceToolNames(device: ReadyLocalDevice | null | undefined, now = Date.now()): string[] {
  if (!device?.id || device.revoked || !Number.isFinite(device.seen_ms) ||
      device.seen_ms <= 0 || now - device.seen_ms >= 45000 || device.seen_ms > now) return []
  try {
    const catalog: unknown = JSON.parse(device.catalog)
    return Array.isArray(catalog) ? catalog.flatMap(tool =>
      tool && typeof tool.name === 'string' && tool.name.trim() ? [tool.name] : []) : []
  } catch { return [] }
}

