// Shared by the connector and employee UI. Never expose native error stacks,
// executable paths or untrusted application text as a diagnostic message.
export const APPLICATION_FAILURE_MESSAGES=Object.freeze({
 application_vision_unavailable:'本机视觉操作组件尚未就绪，请更新桌面客户端并恢复连接。没有执行视觉操作。',
 application_coordinate_denied:'坐标不属于当前窗口截图，未执行。请重新观察截图并使用图片内坐标。',
 application_launcher_needs_review:'此应用的启动器与实际窗口程序需要重新核对。请打开“管理应用授权”，重新选择当前应用并保存，再恢复连接；Qoder 请选择重新发现的编辑器程序。',
 application_launch_failed:'应用启动失败或进程异常退出，未发现已授权应用的可用窗口。请检查应用是否可以手动打开；未自动重复启动。',
 application_launch_denied:'Windows 拒绝启动此应用。请检查当前账号的应用访问权限及系统提示；未自动提权或重复启动。',
 application_binary_missing:'已授权的应用文件已移动、卸载或更新。请打开“管理应用授权”，重新选择并保存当前安装的应用，再恢复连接。',
 application_binary_unreadable:'暂时无法核验已授权应用文件。请检查安装目录的读取权限，再通过“管理应用授权”核对应用；未启动未核验的程序。',
 application_path_denied:'应用启动路径无法通过安全核验。请在“管理应用授权”重新选择真实安装的应用。',
 application_denied:'此应用不在当前电脑的授权范围内。请在“管理应用授权”核对选择并保存，再恢复连接。',
 application_native_timeout:'读取应用窗口或控件超时。请检查应用是否卡住或有启动弹窗，再刷新应用窗口；未自动重复启动。',
 application_native_unavailable:'本机应用窗口接口暂不可用。请检查桌面会话、应用运行权限和本机连接状态，再刷新应用窗口。',
 application_binary_changed:'应用版本已变化，已阻止使用旧授权启动。请暂停连接，在“管理应用授权”重新保存当前应用，再恢复连接。',
  application_action_declined:'本人未批准此应用操作，未执行，不会自动重试。',
  application_control_denied:'当前应用仅授权启动或观察，尚未授权输入和点击；请在本机应用授权中核对并明确启用控制权限。未执行操作。',
  application_action_denied:'本机拒绝了不符合安全条件的应用操作，请检查当前窗口和授权参数；本次操作未获执行确认。',
  application_action_unconfirmed:'本机操作没有返回可靠确认，可能已有部分影响。请先核对应用实际界面，禁止直接重复发送或点击。',
  application_invalid_arguments:'Agent 提交的应用工具参数与授权工具定义不匹配，操作未执行。请重新观察窗口、核对控件编号和参数格式。',
  application_tool_unavailable:'当前本机连接器未提供 Agent 请求的应用工具，请检查连接器版本和应用授权并刷新工具目录；没有执行该操作。',
  application_tool_failed:'应用工具未返回可验证的成功结果，请检查窗口和本机工具日志；不得自动重复有副作用的操作。',
 application_observation_expired:'应用观察已过期，请重新观察窗口后再操作。',
 application_window_changed:'目标应用窗口发生变化，已停止操作。请刷新应用窗口后重新观察。',
 application_element_changed:'目标控件发生变化，已停止操作，请重新观察。',
 application_user_takeover:'检测到本机键鼠活动，已安全停止应用操作。请先核对目标界面，再在确认后暂时停止键鼠操作并重新观察；不会自动重复发送。',
 application_foreground_unavailable:'无法激活目标窗口，请检查是否有系统弹窗或更高权限窗口。',
 application_input_unconfirmed:'目标编辑框未能确认输入已写入。请重新观察并检查焦点，不能直接继续发送。',
 application_focus_changed:'输入框未能获得可靠焦点；本次未继续键入，请重新观察应用窗口或使用有明确控件的输入框。',
 application_point_covered:'目标控件已被其他窗口覆盖，已阻止点击；请先激活目标应用。',
 application_sensitive_control:'不能操作密码、凭证或终端控件。',
 application_task_denied:'任务的应用、工作目录或写入权限未授权。',
 application_task_busy:'已有任务运行或任务数达到上限，请先停止或恢复连接。',
 application_task_not_found:'未找到此连接启动的任务。连接重启后不会自动重交旧任务。',
 application_capture_failed:'当前应用不支持窗口截图，可关闭截图授权后使用控件观察。',
 application_capture_timeout:'窗口截图暂未返回，本次保留已经读取的控件，不重复操作应用。请恢复窗口后重新观察。',
 application_capture_too_large:'窗口截图超出大小限制，本次仅返回已经读取的控件。请缩小窗口后重新观察。',
 application_window_size_denied:'当前窗口尺寸不适合截图，本次仅返回已经读取的控件。请恢复正常大小后重新观察。',
 application_desktop_unavailable:'Windows 桌面当前不可访问。请保持电脑解锁并检查桌面会话，再重新观察。',
 application_sensitive_window:'此窗口涉及终端、凭证或受保护界面，已停止读取；未执行操作。',
 application_windows_required:'此能力需要 Windows 桌面系统。',
})

export function applicationFailure(job){
 const result=typeof job?.result==='string'?job.result.slice(0,4000):''
 const error=typeof job?.error==='string'?job.error:''
 let code=''
 for(const value of [result,error]){
  const candidate=value.trim().match(/^application_[a-z_]+$/)?.[0]||value.match(/\[code:(application_[a-z_]+)\]\s*$/)?.[1]
  if(candidate&&Object.hasOwn(APPLICATION_FAILURE_MESSAGES,candidate)){code=candidate;break}
 }
 const states={
  unknown:'本次操作的最终结果尚未确认，应用可能已经启动。请先刷新应用窗口并核对实际状态，避免重复启动或重复操作。',
  expired:'本次操作已超时，请先刷新应用窗口核对是否已经启动，再决定下一步。',
  cancelled:'已停止等待本次操作。已经发生的应用操作不会撤销，请先核对实际窗口。',
 }
 const message=Object.hasOwn(states,job?.status)?states[job.status]:code?APPLICATION_FAILURE_MESSAGES[code]:
  '应用操作未完成，连接器未返回可识别的失败原因。请先刷新应用窗口核对实际状态，再检查本机连接并查看本次操作回执。'
 const status=['failed','unknown','expired','cancelled'].includes(job?.status)?job.status:'unverified'
 const id=typeof job?.id==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(job.id)?job.id:''
 return {message,code,receipt:[message,'状态：'+status,code?'原因代码：'+code:'连接器诊断：未提供可识别的原因',id?'操作编号：'+id:''].filter(Boolean).join('\n')}
}
