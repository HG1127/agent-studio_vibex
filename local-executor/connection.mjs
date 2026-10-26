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
    result = ({ office_source_changed: '源文件已变化，未创建报告。请重新汇总并核对新的源文件摘要，再单独审批。',
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
      || '本地工具执行失败或已停止，请检查权限、参数和电脑状态；已经发生的操作不会自动撤销。'
  }
  finally { clearInterval(timer) }
  // Never repeat the side effect when the completion acknowledgement is lost.
  if (!combined.aborted) await api('/jobs/' + job.id + '/complete', { claim: job.claim, ok, result })
}
