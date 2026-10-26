import type { AgentSpec } from '../pages/Home/presets'
import type { AgentCapabilityRequirement } from './agentCapabilityPlan'

export type ReadyLocalDevice = { id: string; revoked: boolean; seen_ms: number; catalog: string }

/** A selected live device can supply a local capability, never grant a role new tools. */
export function localDeviceSupports(spec: AgentSpec, need: AgentCapabilityRequirement,
  device: ReadyLocalDevice | null | undefined, now = Date.now()): boolean {
  if (!device?.id || device.revoked || !Number.isFinite(device.seen_ms) ||
      now - device.seen_ms > 45000 || device.seen_ms > now + 5000) return false
  const roles = spec.roles || []
  if (roles.length) {
    const responsible = need.role_ids.length ? roles.filter(role => need.role_ids.includes(role.id)) : roles
    if (!spec.tools.includes('local_computer') || !responsible.length ||
        (need.role_ids.length && responsible.length !== need.role_ids.length) ||
        (need.role_ids.length ? responsible.some(role => !role.tools.includes('local_computer'))
          : !responsible.some(role => role.tools.includes('local_computer')))) return false
  } else if (need.role_ids.length) return false
  let names: Set<string>
  try {
    const catalog: unknown = JSON.parse(device.catalog)
    if (!Array.isArray(catalog)) return false
    names = new Set(catalog.flatMap(tool => tool && typeof tool.name === 'string' ? [tool.name] : []))
  } catch { return false }
  const has = (...tools: string[]) => tools.every(tool => names.has(tool))
  if (need.kind === 'browser') return has('browser.browser_navigate', 'browser.browser_snapshot',
    'browser.browser_take_screenshot') && (need.access === 'read' || has('browser.browser_click', 'browser.browser_type'))
  if (need.kind !== 'desktop') return false
  const description = need.title + ' ' + need.purpose
  const files = /文件|目录|\bfiles?\b|directory/i.test(description)
  const launch = /启动|\blaunch/i.test(description)
  const screen = /桌面|截图|鼠标|键盘|窗口|点击|输入|desktop|screen|click|typing/i.test(description)
  if (files && (!has('files.list', 'files.read') || need.access === 'write' && !has('files.write'))) return false
  if (launch && !has('apps.launch')) return false
  if (screen || !files && !launch) return has('desktop.Screenshot') &&
    (need.access === 'read' || has('desktop.Click', 'desktop.Type'))
  return true
}
