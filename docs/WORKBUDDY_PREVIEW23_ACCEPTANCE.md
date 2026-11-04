# Agent Studio preview23 · WorkBuddy 5.9.3 验收检查点

日期：2026-11-04。源码分支：codex/desktop-release。修复代码提交：bf3d3cb4f630a526fe980948923fb88aca66b309；构建元数据提交：f49064d455b9311b39533d455bc7944814c387f7。

## 目标
在 preview23 EXE 内执行：启动 WorkBuddy → 开始新对话 → 输入“调研 AI 工作台设计” → 本机确认发送 → 等待真实回复 → 读取并保存可核查结果。窗口 ready、截图或动作 accepted 不代表业务完成。

## 已证实
- pnpm check 通过（单元、类型、前端构建与 PG bundle isolation）。
- 应用控制回归 34/34 通过，覆盖后台窗口、禁止盲点、授权截图、激活审批、独立输入审批和只读授权。
- Windows 原生窗口 fixture 通过；Electron GUI fixture 通过 ELECTRON_FOCUS_ACCEPTANCE PASS，真实编辑框获得焦点并回读中文文本成功（两次独立审批）。
- 42 项 E2E 每项均在独立或分段执行中通过；尚无同一次完整 42/42 连续绿灯。隔离 PocketBase 启动偶发失败的 local-executor-agent 用例已单独复测通过。
- 桌面更新专项测试 46/46 通过；桌面发布审计 DESKTOP_RELEASE_AUDIT PASS；最终源码差异检查通过。
- preview23 安装器：275,918,178 bytes；SHA-256 06055f893b2a25da5d7db5a5a16fd942cd0ccb7a633770bbdd1d21137708c9f7。已用原有 Ed25519 发布私钥签名，且以 EXE 内置原公钥验证 staging 清单签名、包长度及 SHA-256。
- 通过 Agent Studio preview21 的内置“版本更新”功能，真实完成 preview21 → preview23 升级。事务 be0aba03-8725-4417-bc0a-7e17f4dc9776 返回 phase=succeeded，previousVersion=0.1.0-preview.21，version=0.1.0-preview.23。
- 更新后新版启动健康检查通过；安装目录 9,870 个文件完整性验证，failed=[]；.studio-install-complete 与 install-verification.json 均记录 preview23。
- staging 地址为 https://192.168.1.133:8443/desktop-updates/preview23-validation/stable/latest.json。stable 清单未修改，仍为 preview21，未向其他用户发布。
- %APPDATA%/agent-studio-desktop/desktop.json 已逐字节恢复为升级前备份（SHA-256 b77d73ea0fdbf2116314660af012ec3b440159fa8e5e93598c64297a701f13c），服务器与端口配置保留，updateFeed 字段已恢复为缺省。当前运行进程的内存设置可能仍保留临时 staging 地址；下次重启会从已恢复配置读取默认 stable 地址。

## 尚未通过的 WorkBuddy 业务验收
- WorkBuddy 5.9.3 的 apps.launch 已在 preview23 更新后的桌面环境返回 status=ready，曾识别前台窗口；但关闭短生命周期 Runner 注册上下文后，WorkBuddy 窗口随之结束，不能作为持续桌面会话。
- 持续操作尝试遇到 application_user_takeover：Windows 最近输入时间持续为 0 秒，说明当前桌面仍有鼠标/键盘活动。系统按设计拒绝继续扫描、输入或发送。
- 尚无创建新会话、写入并发送“AI工作台设计”调研消息及研究回复的真实回执；本轮没有向 WorkBuddy 输入或发送该调研任务。
- 本机逐操作授权与焦点保护不可绕过；需要在一个不被其他键鼠操作打断的窗口内运行长驻操作会话，并由本人批准激活、输入、发送。

## 已修复的控制策略
- 后台只读观察快速返回 window_background；已授权截图仍可返回，但不深度扫描控件，也不提供动作凭据。
- 明确请求 activate:true 时必须经过本人本机确认，在同次原生调用中激活并观察；激活授权不等于后续点击或输入授权。
- apps.act 现在先恢复并验证目标窗口前台，再执行 UIA 控件枚举；枚举期间如发生用户接管或窗口失焦即停止。对目标控件焦点、敏感控件和过期凭据做失败关闭校验。
- 优先返回 Edit/Button/TabItem；不能把内部 file URL 当作点击目标。
- 对可实际输入的 Edit/Document 允许受审批的 Enter key 动作，用于无可访问发送按钮的情况；结果不确定不能重试。

## 下一步
1. 在同一长驻操作会话中保持 registerApplications runtime 存活，避免关闭注册上下文时结束 WorkBuddy。
2. 用户暂时停止这台电脑上的鼠标/键盘操作；每个本机授权弹窗出现时单独批准。
3. 在新的空白 WorkBuddy 对话中输入并回读任务文本，审批后发送；观察真实消息与回复，读取并保存研究结果。
4. 完成后确认 WorkBuddy 已返回结果、恢复默认 stable 更新配置，并再次核对 preview23 安装版本。
