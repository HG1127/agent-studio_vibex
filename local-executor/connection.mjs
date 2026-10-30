import {BROWSER_FAILURE_MESSAGES} from './browser-feedback.mjs'
export function connection(server, token = '') {
  const url = new URL(server)
  if (url.username || url.password || url.search || url.hash || !['/', '/__pb', '/__pb/'].includes(url.pathname) ||
      !(url.protocol === 'https:' || url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname))) throw Error('server_requires_https')
  return async (route, body = {}, signal) => {
    const response = await fetch(url.origin + url.pathname.replace(/\/$/, '') + '/api/public/local-executor' + route, { method: 'POST', redirect: 'error',
      headers: { 'Content-Type': 'application/json', ...(token ? { 'X-Studio-Device-Token': token } : {}) },
      body: JSON.stringify(body), signal: signal || AbortSignal.timeout(15000) })
    if (!response.ok) { const error = Error('executor_http_' + response.status); error.status = response.status; throw error }
    return response.json()
  }
}
export async function executeClaim(api, runtime, job, signal) {
  const remaining = job.deadline_ms - Date.now()
  if (remaining <= 0) return
  const controller = new AbortController()
  const combined = AbortSignal.any([controller.signal, AbortSignal.timeout(Math.min(remaining, 65000)), ...(signal ? [signal] : [])])
  const check = async () => {
    try { if (!(await api('/jobs/' + job.id + '/check', {}, combined)).active) controller.abort() }
    catch { controller.abort() }
  }
  await check()
  if (combined.aborted) return
  const timer = setInterval(check, 1000)
  let result, ok = true
  try { result = await runtime.execute(job.input, combined) }
  catch (e) {
    ok = false
    const browserMessage=BROWSER_FAILURE_MESSAGES[e.message]
    result = ({permission_editor_unavailable:'本机授权窗口未能打开，请在原连接器中点击管理授权。未修改任何权限，不需要重新配对。',permission_editor_request_timeout:'本机授权窗口的打开回执超时，请先检查 Chrome 窗口；不会自动重试。',permission_editor_request_cancelled:'授权窗口打开请求已停止，未修改权限。',permission_scope_changed:'设备授权已更新，本次操作基于旧授权或服务端尚未支持授权版本，未执行。请刷新设备后重新确认新操作；若仍失败，请管理员更新服务端。',file_not_authorized:'这个文件未被授权；单文件授权不会开放同目录的其他文件。请在本机管理界面明确选择。',workspace_read_only:'这个工作目录只授予了读取权限，未写入任何文件。需要新建文件时，请在本机明确修改目录授权。',file_size_or_type_denied:'请选择不超过 64 KB 的文本文件，不能把文件夹当作文件读取。PDF、Word、Excel 请使用资料导入或办公流程。',file_not_plain_text:'这不是可直接预览的 UTF-8 文本文件，请使用相应的文档或表格处理功能。',ENOENT:'未找到这个文件或子文件夹，请重新浏览授权目录后选择。',EISDIR:'选择的是文件夹，请先浏览文件夹，再点选其中的具体文件。',EEXIST:'同名文件已存在，没有覆盖。请使用新的文件名。',browser_origin_denied:'这个网站尚未获得本机授权，未执行打开操作。请在本机连接器的「管理授权 → 网站」中添加并保存，不能仅通过填写网址扩大权限。',path_denied:'文件位置不在允许的路径范围内，请从授权文件夹列表选择。',linked_path_denied:'此路径包含链接或不是当前授权的真实目录，已停止访问。',private_file_denied:'此文件属于连接凭证或私有配置，不允许通过工具读取。',office_source_changed: '源文件已变化，未创建报告。请重新汇总并核对新的源文件摘要，再单独审批。',
      office_output_exists: '输出目录已存在，未覆盖文件。请核查已有产物并使用新的输出目录。',
      office_formula_requires_values: '源表包含公式，未计算缓存值。请由用户确认公式结果并在副本中转为数值后重新执行。',
      office_columns_not_found: '未找到指定的分组列或金额列，请按源表表头检查列名。',
      office_invalid_amount: '金额不是指定精度的普通数字。请核对空值、文本、千位分隔符和小数位，未生成报告。',
      office_sheet_required: '源文件包含多个工作表，请明确指定 sheet 工作表名称。',
      office_hidden_rows: '源表有隐藏行，统计范围不明确。请在副本中明确保留需要统计的记录。',
      office_table_limit: '台账超出办公工具的记录、分组或金额范围，请拆分为明确的较小批次。',
      browser_output_path_denied: '浏览器不接受 filename 输出路径参数；请使用工具返回的截图或快照。此调用未执行。',
      desktop_user_control: '电脑当前由用户操作或已被接管，本次任务已停止。请核查实际结果，空闲后重新截图再发起操作。',
      desktop_observation_expired: '桌面观察已过期，本次操作未执行。请先重新截图。',
      desktop_coordinate_denied: '操作坐标超出本机授权范围，或使用了不允许的元素编号，本次操作未执行。',
      desktop_screenshot_missing: '未获得桌面截图。先核查电脑上的实际结果，不要直接重复操作。' })[e.message]
      || browserMessage || '本地工具执行失败或已停止，请检查权限、参数和电脑状态；已经发生的操作不会自动撤销。'
    if(browserMessage)result=browserMessage+' [code:'+e.message+']'
    if(/^file_effect_uncertain; (?:recovery_id|trash_id)=[a-f0-9]{32}; do_not_retry/.test(e.message||''))result='文件操作结果不确定，已保留恢复副本和回执。请核查实际文件，不要自动重试。 '+e.message.slice(0,250)
    else if(e.message==='file_hash_conflict')result='文件 SHA256 已变化，未修改源文件。请重新读取并核对后再确认。'
    else if(e.message==='destination_exists')result='目标文件已存在，未移动或覆盖。请使用新文件名。'
    else if(e.message==='file_open_type_denied')result='此类型不允许直接打开。仅支持授权的普通文档、图片和文本，不执行脚本、网页、宏或程序。'
  }
  finally { clearInterval(timer) }
  // Never repeat the side effect when the completion acknowledgement is lost.
  if (!combined.aborted) await api('/jobs/' + job.id + '/complete', { claim: job.claim, ok, result })
}
