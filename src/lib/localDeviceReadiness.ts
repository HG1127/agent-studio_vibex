import type {OriginalRoleUiSpec as AgentSpec} from '@/lib/originalRoleUiTypes'
import type { AgentCapabilityRequirement } from './agentCapabilityPlan'

import { localDeviceToolNames,localDeviceCatalog, type ReadyLocalDevice } from './localDeviceConnection.ts'
import {localApplicationReadiness} from './localApplicationReadiness.ts'
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
  const application=localApplicationReadiness(need,localDeviceCatalog(device,now))
  if(application.supported)return true
  const description = need.title + ' ' + need.purpose
  const files = /文件|目录|\bfiles?\b|directory/i.test(description)
  const launch = /启动|\blaunch/i.test(description)
  const screen = /桌面|截图|鼠标|键盘|窗口|点击|输入|desktop|screen|click|typing/i.test(description)
  if(application.modern&&(!files||launch||screen||/codex|应用任务|软件任务/i.test(description)))return false
  if(files){
    const required=['files.list','files.read']
    if(/定位|reveal/i.test(description))required.push('files.reveal')
    if(/打开|\bopen\b/i.test(description))required.push('files.open')
    if(need.access==='write'){
      let specific=false
      for(const [pattern,tool] of [[/编辑|修改|覆盖|写入(?:已有|现有)|\bedit\b|\bupdate\b/i,'files.update'],[/删除|移入回收|\bdelete\b|\btrash\b/i,'files.trash'],[/恢复|还原|\brestore\b/i,'files.restore'],[/移动|重命名|\bmove\b|\brename\b/i,'files.move'],[/复制|\bcopy\b/i,'files.copy'],[/新建|创建|\bcreate\b/i,'files.write']] as const){if(pattern.test(description)){specific=true;required.push(tool)}}
      if(!specific)required.push('files.write')
    }
    if(!has(...required))return false
  }
  if (launch && !has('apps.launch')) return false
  if (screen || !files && !launch) return has('desktop.Screenshot') &&
    (need.access === 'read' || has('desktop.Click', 'desktop.Type'))
  return true
}
