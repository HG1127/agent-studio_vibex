import type { AgentSpec } from '../pages/Home/presets'
import type { AgentCapabilityRequirement } from './agentCapabilityPlan'

import { localDeviceToolNames, type ReadyLocalDevice } from './localDeviceConnection.ts'
export type { ReadyLocalDevice } from './localDeviceConnection.ts'

/** A selected live device can supply a local capability, never grant a role new tools. */
export function localDeviceSupports(spec: AgentSpec, need: AgentCapabilityRequirement,
  device: ReadyLocalDevice | null | undefined, now = Date.now()): boolean {
  const names = new Set(localDeviceToolNames(device, now))
  if (!names.size) return false
  const roles = spec.roles || []
  if (roles.length) {
    const responsible = need.role_ids.length ? roles.filter(role => need.role_ids.includes(role.id)) : roles
    if (!spec.tools.includes('local_computer') || !responsible.length ||
        (need.role_ids.length && responsible.length !== need.role_ids.length) ||
        (need.role_ids.length ? responsible.some(role => !role.tools.includes('local_computer'))
          : !responsible.some(role => role.tools.includes('local_computer')))) return false
  } else if (need.role_ids.length) return false
  const has = (...tools: string[]) => tools.every(tool => names.has(tool))
  if (need.kind === 'browser') {
    // DOM/text browsing does not require screenshot permission. Visual tasks
    // must explicitly have screenshot support; role grants above still apply.
    const visual = /截图|视觉|图像|画面|screenshot|\bvisual\b|\bvision\b|\bimage\b/i.test(
      [need.title,need.purpose,...(need.search_terms||[]),...(need.suggested_tool_ids||[])].join(' '))
    return has('browser.browser_navigate','browser.browser_snapshot') &&
      (!visual || has('browser.browser_take_screenshot')) &&
      (need.access === 'read' || has('browser.browser_click','browser.browser_type'))
  }
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
