# Agent Studio preview23 · WorkBuddy 5.9.3 验收检查点

日期：2026-11-04。源码分支：codex/desktop-release（preview21 统一基线上的未发布候选）。

## 目标
在 preview23 EXE 内执行：启动 WorkBuddy → 开始新对话 → 输入“调研 AI 工作台设计” → 本机确认发送 → 等待真实回复 → 读取并保存可核查结果。窗口 ready、截图或动作 accepted 不代表业务完成。

## 已证实
- pnpm check 通过（单元、类型、前端构建与 PG bundle isolation）。
- 应用控制回归最新 34/34 通过，覆盖后台窗口、禁止盲点、授权截图、激活审批、独立输入审批和只读授权。
- Windows 原生窗口 fixture 通过；Electron GUI fixture 最新通过 ELECTRON_FOCUS_ACCEPTANCE PASS，真实编辑框获得焦点并回读中文文本成功（两次独立审批）。
- 42 项 E2E 每项均在独立或分段执行中通过；尚无同一次完整 42/42 连续绿灯。隔离 PocketBase 启动偶发失败的 local-executor-agent 用例已单独复测通过，包含真实 Chromium/PDF/XLSX/审批回执。
- 最终 preview23 隔离 EXE 冒烟通过；真实 Electron 冷启动和控件观察通过。最终 NSIS 安装器在项目内临时安装目录运行冒烟也通过，未触碰现有安装或生产数据。
- C# 原生观察器源码策略摘要、编译产物、打包文件和 SHA-256 清单匹配。最终安装器 SHA-256：226e1d9801197a1a07ae89a78fa27c600f0723b3f87fdc5243ba733e5c6a89c1。
- WorkBuddy 5.9.3 的实际应用启动与同一次受控执行窗口内的前台观察曾成功，识别到“新建任务”和文本输入框。输入框仅显示默认占位提示；发送箭头未作为独立有名称的 UIA Button 暴露。

## 尚未通过的 WorkBuddy 业务验收
- 后台 WorkBuddy 的 UI Automation 树会退化为 D3D 容器；此前反复观察不可用。
- 最新真实操作尝试中，本机确认对话框在当前 WebCodex 项目执行会话内未取得可见确认，90 秒后超时；脚本退出后 WorkBuddy 进程也未保留。该 Runner 路径不能替代长驻的 Agent Studio 本机连接器。
- 尚无创建新会话、写入并发送“AI工作台设计”调研消息及研究回复的真实回执；没有重复未知结果的输入或发送。
- 本机逐操作授权不可绕过。

## 已修复的控制策略
- 后台只读观察快速返回 window_background；已授权截图仍可返回，但不深度扫描控件，也不提供动作凭据。
- 明确请求 activate:true 时必须经过本人本机确认，在同次原生调用中激活并观察；激活授权不等于后续点击或输入授权。
- apps.act 现在先恢复并验证目标窗口前台，再执行 UIA 控件枚举；枚举期间如发生用户接管或窗口失焦即停止。对目标控件焦点、敏感控件和过期凭据做失败关闭校验。
- 优先返回 Edit/Button/TabItem；不能把内部 file URL 当作点击目标。
- 对可实际输入的 Edit/Document 允许受审批的 Enter key 动作，用于无发送按钮的情况；结果不确定不能重试。

## 交付与后续
- 最终本地未发布候选：.tmp/desktop-output/AgentStudio-Setup-0.1.0-preview.23-win-x64.exe（275,918,166 bytes）；不是 preview21 的正式签名更新。
- 当前环境不存在可用于原有信任链的更新私钥；不生成替代密钥、不发布未经签名的更新、不覆盖现有安装。
- 最新源码已重新执行 pnpm check、node desktop/build.mjs；packaged-smoke 已分别指向 win-unpacked/Agent Studio.exe 与 NSIS Setup 临时安装目录并通过。
- 最终 WorkBuddy 验收须从 Agent Studio preview23 的长驻本机 local_computer 连接器执行，并由本人批准激活观察、输入、发送三个独立操作；优先使用新的空白任务页，输入后回读，发送后验证真实回复。
