/** Bounded, non-secret diagnostics. Never prints response bodies, token values,
 * local config contents or an arbitrary error message. Never retries pairing. */
export function connectionFailureHint(error){
  const message=typeof error?.message==='string'?error.message:''
  const match=/^executor_http_(\d{3})$/.exec(message)
  const status=Number.isInteger(error?.status)?error.status:match?Number(match[1]):0
  if(status===401)return '服务器未接受这次配对请求（HTTP 401）。可能是文件过期、已使用或来自另一预览；不能仅凭此错误断定原因。先回网页核对同一设备：已配对则恢复原连接，未配对则更新此设备的连接文件。不要反复使用旧码。'
  if(status===404||status===405)return '找不到当前版本的配对接口（HTTP '+status+'）。请核对网页连接地址与后端版本；先检查服务，不要重复生成配对记录。'
  if(status>=500&&status<=599)return '服务器暂时无法确认配对（HTTP '+status+'）。先回网页核对设备是否已绑定，再决定恢复或更新连接文件；本程序不会自动重试。'
  if(status>=400&&status<=499)return '服务器拒绝了本次连接请求（HTTP '+status+'）。请核对下载文件、账号状态和系统地址；不要重复提交已使用的凭证。'
  if(error?.name==='AbortError'||error?.name==='TimeoutError'||message==='fetch failed')return '连接请求没有收到可确认的响应。请检查网页和本机网络，然后核对设备绑定状态；超时不等于配对没有发生，不会自动重试。'
  return null
}

const CONNECTOR_MESSAGES=Object.freeze({
 device_identity_rejected:'工作台未接受这条已保存连接的身份（HTTP 401）。请核对工作台地址与原设备记录。本机配置和授权已保留，不会自动重新配对。',
 connection_running_or_locked:'原连接仍在运行，请使用已打开的连接器，或先停止原连接再重试。',
 credential_server_mismatch:'本机配置与凭据中的工作台地址不一致。请核对原连接文件，不要直接修改地址或重新配对。',
 local_setup_unavailable:'原连接的配置、凭据或授权目录未能读取。请检查文件是否仍在原位置，以及本机访问权限。',
 chrome_not_installed:'本机未找到 Google Chrome。请检查 Chrome 安装情况后重试原连接。',
 component_incomplete:'连接器运行组件未能加载。请重新解压完整的连接器程序包；保留本机已保存的连接配置。',
 connection_unreachable:'暂时无法连接工作台。请确认对应工作台服务已启动、地址可访问；连接器会继续尝试原连接。',
 server_unavailable:'工作台暂时无法处理连接请求。请检查服务状态；连接器会继续尝试原连接。',
 connection_needs_check:'连接尚未得到工作台确认，正在检查并重试。请核对对应工作台是否可用。',
 connector_start_failed:'连接启动未完成。请检查原工作台和本机连接器；原配置与授权已保留。',
 connector_exited_unexpectedly:'连接进程意外结束。请核对对应工作台后重试原连接；原配置与授权已保留。'
})
export const connectorReasonCode=value=>typeof value==='string'&&Object.hasOwn(CONNECTOR_MESSAGES,value)?value:null
export const connectorFailureMessage=code=>CONNECTOR_MESSAGES[connectorReasonCode(code)]||CONNECTOR_MESSAGES.connector_start_failed
export function connectorFailureCode(error){
 const direct=connectorReasonCode(error?.code)||connectorReasonCode(error?.message)
 if(direct)return direct
 if(error?.status===401)return 'device_identity_rejected'
 if(error?.status===429||error?.status>=500)return 'server_unavailable'
 if(['ERR_MODULE_NOT_FOUND','MODULE_NOT_FOUND'].includes(error?.code))return 'component_incomplete'
 if(['ENOENT','EACCES','EPERM'].includes(error?.code)||['invalid_local_config','local_credentials_unavailable'].includes(error?.message))return 'local_setup_unavailable'
 if(['ECONNREFUSED','ECONNRESET','ENOTFOUND','ETIMEDOUT','EHOSTUNREACH'].includes(error?.code)||['ECONNREFUSED','ECONNRESET','ENOTFOUND','ETIMEDOUT'].includes(error?.cause?.code)||['AbortError','TimeoutError'].includes(error?.name)||error?.message==='fetch failed')return 'connection_unreachable'
 return 'connector_start_failed'
}
export function connectorExitFailureCode(stderr){
 if(/当前服务器未接受此设备身份/.test(stderr))return 'device_identity_rejected'
 if(/ERR_MODULE_NOT_FOUND|MODULE_NOT_FOUND/.test(stderr))return 'component_incomplete'
 return null
}
