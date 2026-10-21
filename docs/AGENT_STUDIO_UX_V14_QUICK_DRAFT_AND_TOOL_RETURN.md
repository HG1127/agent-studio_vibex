# Agent Studio V14｜跨工作空间连接回跳与快捷编辑草稿恢复

> 项目：独立运行的 `agent_studio_vibex版本`。本文件仅记录源码变更与隔离验收，不代表生产发布许可。正式 PocketBase/SQLite 与 PostgreSQL staging 迁移互不替换；后者仍为 NO-GO。

## 用户闭环

`需求 → AgentSpec → 自动匹配内置/已验证只读工具 → 发现缺失的市场工具 → 用户完成真实第三方授权 → 返回原 Agent → 刷新并明确选择工具 → 保存版本 → 试跑 → 审批/运行/反馈迭代`。

任意工作空间还可用「调整 Agent 方案」打开快捷编辑：`编辑 → 当前标签页草稿暂存 → 浏览器刷新/关闭 → 明确恢复或舍弃 → 服务器版本冲突检查 → 保存原版本或另存副本 → 试跑新版本`。不会修改正在运行中的 AgentRun 检查点或配置快照。

## V14 实施

| 断点 | 已编码修复 | 安全边界 |
|---|---|---|
| 快捷编辑窗口关掉或刷新丢失尚未保存修改 | `src/lib/quickAgentDraft.ts` + `SavedAgentQuickEditor.tsx`；450–500ms 节流、本标签页 pagehide 尝试暂存、每次重新进入提示恢复/舍弃 | 仅当前员工与具体 Agent ID；12小时、48KB，上限字段白名单；不作为服务器备份，不应输入密码/API Key |
| 旧草稿恢复后可能无意覆盖团队新版本 | 草稿保存 `expectedUpdated`；恢复时与服务器当前更新时间比较；正常 PATCH 使用旧更新时间，409 或本地版本不符即禁止覆盖，提供另存为副本 | 服务端已有 owner-scope + transaction optimistic CAS；不允许前端跳过验证 |
| 连接插件后找不到刚才创建的 Agent | `safeAgentSpecId` + `addReturnAgentToUrl`，从编辑器工具提示和插件候选生成安全的 `returnSpec` 参数；插件市场提供「返回原 Agent 配置」 | 只允许 15 位 PocketBase 记录 ID，不接受任意重定向 URL、不泄露用户需求全文；无已保存 Agent ID 的临时草稿仍需回原标签页 |
| 编辑/试跑切换期间等待条件和当前运行混淆 | Chrome 测试确保「保存并进入试跑」完成原弹窗关闭和 URL 切换之后再进行后续编辑 | 防止把测试工具竞争当成真实用户错误；活动运行中引导新标签启动新版本 |

## 核验方式

- `node --experimental-strip-types --test tests/quick-agent-draft.test.mjs tests/tool-search-privacy.test.mjs`：员工隔离、跨 Agent 隔离、TTL、旧版本及凭据未知字段丢弃、安全 URL 返回上下文。
- `node --test tests/agent-review.chrome.mjs`：**1/1 PASS**，临时员工账号 + 真实 Chrome + 独立 PocketBase 和模拟模型；刷新恢复、同步协作版本冲突、另存新 Agent 副本、插件市场回跳、390px 移动端 19 路由无横向溢出、人工审批/运行评估原有链路。所有操作使用隔离临时账号及数据库。
- `pnpm build`：**PASS**（TypeScript、Vite、生产 PG pilot 资源隔离 96 资源检查）。
- `pnpm test:e2e:parallel`：**20/20 PASS**（2 个并行 Worker，耗时 90.3s，隔离 PocketBase/SQLite；包含 Agent 运行、工具、Smithery、并发、身份隔离、知识库和计划调度）。
- 关键功能定向回归：**25/25 PASS**（草稿恢复、用户和 Agent 隔离、隐私过滤、可执行工具匹配、审批、运行）。
- `pnpm check` 仍有独立的 PostgreSQL staging 测试契约断言过期：此项属于并行 PG 分支，V14 未修改，不能称所有检查都通过。

## P0/P1 仍待真实环境验证

1. **第三方真实身份与 OAuth**：离线模拟供应商测试不等于可用于实际各插件供应商的工作账号；需要授权真实供应商、撤销、权限变更与配额错误的员工 UAT。
2. **实时长任务和多人编辑**：需要公司内网真实 Worker 7×24 运行、断线恢复、审批通知与跨设备冲突实测。快捷编辑暂存不是加密多设备草稿仓库。
3. **复杂移动端交互**：390px Chrome 的屏宽/交互检查不等于 iOS、Android 实机软键盘、手势、多指 Canvas、屏幕阅读器可用性。
4. **全模块深度业务回归**：V13 的 19 个移动路由加载/无横向溢出不等于每模块每操作 UAT；后续以员工高频任务分模块验收。
5. **独立 PG staging**：`pnpm check` 的已知断点来自 PG 迁移测试契约。V14 不修改并行迁移，不切生产数据库。

本阶段继续保留其它大量未提交改动。未擅自 git reset、commit、push 或部署生产。
