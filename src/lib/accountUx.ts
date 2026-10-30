export type EmployeeProfile={id:string;email:string;display_name:string;role:"admin"|"employee";active:boolean;share_enabled:boolean;updated?:string;created?:string}
export const PASSWORD_MAX_LENGTH=71
export function passwordInputError(value:string):string{
  if(!value.trim())return "密码不能为空或仅包含空格。"
  if(new TextEncoder().encode(value).length>PASSWORD_MAX_LENGTH)return "密码过长，当前认证服务最多支持 71 字节；中文通常每字占 3 字节。"
  return ""
}
export function passwordAdvice(value:string):{label:string;level:0|1|2|3}{
  if(!value)return {label:"不强制最少位数；建议使用不重复的长密码或密码短语。",level:0}
  const kinds=[/[a-z]/,/[A-Z]/,/\d/,/[^A-Za-z0-9]/].filter(rule=>rule.test(value)).length
  if(value.length<8||/^(.)\1+$/.test(value)||/^(123456|password|qwerty)/i.test(value))return {label:"较易猜测，建议换成更长且不重复的密码；此建议不阻止保存。",level:1}
  if(value.length>=14||(value.length>=10&&kinds>=3))return {label:"长度与组合较好；仍请避免与其他账号重复使用。",level:3}
  return {label:"可以使用；增加长度或使用密码短语会更稳妥。",level:2}
}
const messages:Record<string,string>={
  studio_login_required:"登录已失效，请重新登录。",admin_required:"只有管理员可以管理成员。",
  email_already_used:"该邮箱已被其他成员使用，请换一个邮箱。",invalid_email:"请输入有效的工作邮箱。",
  invalid_display_name:"姓名不能为空，最多填写 80 个字符。",invalid_studio_user:"请检查姓名、邮箱和密码是否已正确填写。",
  cannot_disable_self_admin:"不能停用自己的管理员账号或降低自己的角色，以免无法继续管理系统。",
  employee_changed:"该成员已被其他页面修改。请关闭弹窗并刷新列表后重新编辑。",
  employee_create_failed:"创建失败，请检查邮箱是否重复或稍后重试。",employee_update_failed:"保存失败，请刷新后重试。",
  employee_list_failed:"成员列表暂时无法加载，请重试。",invalid_password:"当前密码不正确，请重新输入。",
  invalid_new_password:"新密码不能为空或仅包含空格，长度须在认证服务支持的范围内。",
  password_reset_failed:"密码重置失败，请重试。",password_change_failed:"密码修改失败，请重试。",
  use_own_password_change:"请在“账号安全”中验证当前密码后修改自己的密码。",
  reset_confirmation_required:"请确认重置操作后再提交。",request_failed:"操作没有完成，请检查网络后重试。",
}
export function accountError(error:unknown):string{
  const key=error instanceof Error?error.message:String(error||"")
  return messages[key]||(/timeout|abort/i.test(key)?"请求超时，请重试；保存结果不确定时请先刷新核对。":"操作未完成，请检查网络连接后重试。")
}
export function safeLoginReturn(value:string|null):string{
  if(!value||!value.startsWith("/")||value.startsWith("//")||/[\\\r\n]/.test(value)||value.startsWith("/login"))return "/"
  try{const u=new URL(value,"https://studio.invalid");return u.origin==="https://studio.invalid"?u.pathname+u.search+u.hash:"/"}catch{return "/"}
}
