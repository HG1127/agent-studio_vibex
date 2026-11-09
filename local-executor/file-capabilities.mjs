export const capabilityNames = ['edit', 'move', 'delete', 'open']
export function fileCapabilities(value) {
  if (value === undefined) return {edit:false,move:false,delete:false,open:false}
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).length !== 4 || Object.keys(value).some(k => !capabilityNames.includes(k)) ||
      capabilityNames.some(k => typeof value[k] !== 'boolean')) throw Error('invalid_file_capabilities')
  return Object.fromEntries(capabilityNames.map(k => [k, value[k]]))
}
export function grantCapabilities(value, readOnly, fileOnly = false) {
  const c = fileCapabilities(value)
  if ((readOnly || fileOnly) && (c.edit || c.move || c.delete)) throw Error('readonly_capabilities_denied')
  return c
}
export function capabilityDescription(readOnly, capabilities) {
  const c = fileCapabilities(capabilities)
  return (readOnly ? '读取' : '读取、新建文件/文件夹、复制文件（不覆盖）') +
    '；编辑已有文件：' + (c.edit?'允许':'关闭') + '；移动：' + (c.move?'允许':'关闭') +
    '；可恢复删除/恢复：' + (c.delete?'允许':'关闭') + '；在连接电脑打开/定位：' + (c.open?'允许':'关闭')
}
