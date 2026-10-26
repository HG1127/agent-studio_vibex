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
    result = ({ browser_output_path_denied: '浏览器不接受 filename 输出路径参数；请使用工具返回的截图或快照。此调用未执行。',
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
