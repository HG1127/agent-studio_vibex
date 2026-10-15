# Agent Studio VibeX V7.4｜工具治理、追踪保留与禁止自动打开浏览器

V7.4 基于现有 V7.3 源码迭代。保留 React/TypeScript/Vite、VibeX 身份计费、App ID、PocketBase SQLite、独立 Worker 和原有业务 API。禁止自动打开 PocketBase 管理后台及任何浏览器预览，所有回归测试通过命令行、临时 SQLite 和 localhost API 执行。没有触碰生产数据。

## 1. 已落实禁止浏览器自动打开

修复 Windows 本地启动脚本 start-windows.ps1，移除延迟 Start-Job / Start-Process 网页启动；Linux、macOS 启动脚本移除 open_local_app 和 open/xdg-open。脚本保留后台 PocketBase 与 Vite 的启动，但只输出地址，不主动打开页面。

新增 tests/no-admin-browser.test.mjs 检查上述三套启动入口和 Vite 代理，防止以后恢复自动启动浏览器或打开 PocketBase 管理路径 /_/。

原脚本打开的是本地前端 127.0.0.1:8000，不是直接访问 PocketBase 管理页。若外部 IDE 或平台自身跳转到管理登录页，这些代码改动不能确保关闭第三方弹窗；我们本轮未通过任何浏览器打开过该页面。RunningHub 用户主动点击登录所触发的正常授权窗口仍保留。

## 2. 共享工具安全策略

新增 pocketbase/pb_hooks/modules/tool_policy.js，提供 classify / allowAutomaticRetry 纯函数。Agent 与 Workflow 调用前判定内置工具、外部只读、潜在非幂等写入、审批要求与安全重试边界。

- 内置 calculate/summarize/knowledge_search/web_fetch/web_search 不会被当作外部写入。
- 外部 GET 视为只读；外部非 GET（如 POST/PUT/PATCH/DELETE）与市场工具均视为潜在写入。
- require_approval 开启时潜在写入必须进入原有审批流程，已批准的同一步不会再次请求批准。
- 任何潜在写入结果不明确时，仍按原 side_effects journal 阻断自动重放；即使外部返回可重试标记也不自动再次发送写请求。
- 工具归属、enabled、参数和实际 HTTP 调用授权仍在后端原执行引擎验证，不由模型建议自行授权。

本轮只抽出风险策略，没有宣称所有 ToolExecutor 与外部工具协议全部合并。

## 3. 元数据级工具追踪和性能摘要

在已有 agent_studio_execution_spans 表中新增工具操作（operation=tool）记录，保留已有模型调用（operation=model）追踪。保存运行 ID、步骤、类型、成功失败、错误码、耗时和创建时间；不存储密钥、提示词、工具输入、响应正文、请求 URL 或 HTTP Headers。

新增 modules/trace_metrics.js，从 GET /api/execution-traces 已授权的最多 100 条数据中计算成功/失败、模型/工具数量、平均耗时及 p50/p95 近似百分位数（nearest-rank）。RunTraceCard 更新为“模型与工具执行诊断”，展示两类操作和当前样本统计。注意 p50/p95 基于本次最近 100 条跨度，不代表平台完整时延 SLA 或全量用户指标。

## 4. 追踪数据保留和手动清理

新增 ops/trace-retention.mjs，运维命令行工具，默认 dry-run、不修改数据库。

仅可按明确的 owner 与 30—3650 天保留期限选择终结运行的旧 Span，不删除其他用户、未终结运行、孤立引用和最近数据。真正删除必须显式 apply、用户关联确认标记、存在最近 24 小时内的完整 SHA-256 验证备份，并且备份与当前符合清理条件的数据量一致。每次最多删除 1000 条，事务化执行；数据快照不一致或条件失效则失败关闭。

预览示例：
    node ops/trace-retention.mjs --db /safe-copy/data.db --owner example-user --days 90

显式删除示例（仅隔离演练环境，须先做快照及恢复测试）：
    node ops/trace-retention.mjs --db /safe-copy/data.db --owner example-user --days 90 --backup /secure/snapshot/data.db --max-rows 100 --confirm DELETE_TRACE_SPANS:example-user --apply

注意：此工具不会因为项目升级自动删除任何数据；没有通过前端提供删除入口。此版本没有配置生产定期清理任务。

## 5. 自动化验证

- pnpm test：包含禁止管理页自动弹窗的检查、工具安全策略、追踪摘要、保留策略与数据库备份，以及既有权限/密钥/模型协议和时区单测。
- pnpm test:tool-executor：真实临时 PocketBase 中运行 Agent/Workflow 共享计算器并验证模型/工具追踪元数据。
- pnpm test:agent-effects、pnpm test:concurrency：外部 POST 写入日志、幂等/模糊失败及高并发租约。
- pnpm test:model-provider：OpenAI/Anthropic/Gemini 模拟 Provider 的 Agent 与 Workflow。
- pnpm test:knowledge、pnpm test:schedules、pnpm test:migrations、pnpm test:worker、pnpm test:integration：其余业务回归。
- pnpm build 和修改文件专项 ESLint：TypeScript/Vite 生产构建与静态检查。

测试只使用命令行与本地 API。没有打开网页、没有使用 PocketBase 管理后台、没有登录生产数据库。模拟 Provider 验收不能代表真实付费模型质量和网络故障表现。

## 6. 回传限制与下一阶段

VibeX Source 选择 app/ 时上传应用累计 ZIP 并 Extract，选择 pb_hooks/ 时上传后端累计 ZIP 并 Extract。ZIP 内不能嵌套多余一级目录。完整源码仅用于开发、备份和版本管理，不能直接作为 VibeX Source 的一个目标目录上传。

注意：修改的本地 Windows/Linux/macOS 启动脚本位于项目根路径 vibex-local，不属于 app/ 或 pb_hooks/，因此仅回传这两个补丁不会替换另一台机器的本地启动文件；需使用完整源码包中对应新版脚本单独更新。

尚未完成：完整工具注册与执行器服务化、分布式 trace 树和全局 p95 报表、自动数据保留调度、生产多 Worker 严格 fencing、向量和混合检索、PostgreSQL 实际迁移及真实上线验收。SQLite 在本阶段继续保留，避免无数据支撑的技术栈重建。
