# Windows 文件软件调度修复 — preview.7 / connector preview.17

旧实现将隐藏启动 explorer.exe 的 spawn 事件作为成功依据，没有 Windows
文件关联或文件定位的接收回执。之前的文件动作测试注入了启动适配器，没有验证
实际的软件窗口。此处的成功信号不足，现已更换实现并补充真实调用验收。

- 使用固定系统 PowerShell 承载固定的 Win32 代码：ShellExecuteExW 打开文档，
  SHParseDisplayName / SHOpenFolderAndSelectItems 定位并选中文件。仅隐藏辅助进程，
  文档以 SW_SHOWNORMAL 打开；检查原生返回值，失败不能返回成功。
- 文件名通过 Base64 编码的 JSON 数据传递，不拼接到脚本或命令。远端不能指定
  可执行文件。系统组件路径固定，文件白名单、目录授权、版本校验和逐项审批保留。
- 普通文本使用固定系统记事本，按钮明确标示“用记事本打开”；其他允许的文档和
  图片交给默认软件。不会修改用户文件关联，也不会执行脚本、快捷方式或程序。
- 保留服务器已支持的 files.open / files.reveal `{root,path}` 协议，无需为此发布服务器。
  已知的创建前拒绝会释放当前操作锁；网络回执丢失仍保留原请求，禁止自动重做。
- 将执行状态与错误放到文件操作按钮旁，区分本人确认、排队、执行和 Windows 回执。
  旧连接器只有“已请求”文本时，不把它当作已核实的 Windows 调度成功。
- 授权更新后若原目录标识失效，且没有未保存草稿或未完成任务，改为采用新授权目录，
  清除旧列表并要求重新读取，不自动读取或扩大权限。

原生系统接收成功不代表文档内容已被读取，也不能保证第三方软件不会自行报错或退出。
默认软件不存在、访问被拒、文件不存在、超时和无效回执均有明确提示。

验收入口：`desktop/tests/file-application.windows.mjs --keep-open`；
`desktop/tests/connection-flow.integration.mjs --native-file-actions --keep-open`。
前者验证实际 Win32 调度及缺失文件拒绝，后者使用真实生产前端、隔离 PB、真实连接器
子进程和 Windows 软件。Windows 窗口、文档正文与资源管理器选中状态通过 computer-use
技能读取确认；不运行旧测试中的 PowerShell UIAutomation 探针。

API 依据：[ShellExecuteExW](https://learn.microsoft.com/en-us/windows/win32/api/shellapi/nf-shellapi-shellexecuteexw)、
[SHOpenFolderAndSelectItems](https://learn.microsoft.com/en-us/windows/win32/api/shlobj_core/nf-shlobj_core-shopenfolderandselectitems)。
