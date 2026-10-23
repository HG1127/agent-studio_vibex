# Agent Studio V23｜可信 Worker 归属与租约接管诊断（2026-10-23）

开发分支：`feat/harness-design-workspace-20261021`  
发布状态：**隔离开发环境，未提交、未推送、未部署**

## 1. 真实问题

V22 的 Worker 独立进程心跳证明“最近谁在上报”，但无法证明“当前哪个实例持有特定 Agent/Workflow 的执行权”。单靠心跳推断任务所有权既不准确，也可能误导操作人员在仍有效的租约下强制接管。

## 2. 非破坏性租约归属迁移

`pocketbase/pb_hooks/modules/runtime_schema.js` 新增 `execution_0004_worker_lease_attribution`：

- 在现有 `agent_studio_run_leases` 表上新增 `owner_instance TEXT NOT NULL DEFAULT ''`，原执行记录和随机租约令牌均保持原状；支持已有列时重新跑版本日志的恢复场景。
- 新增索引 `(owner_instance,expires_ms)`，不删除任何历史租约。
- 浏览器/旧版不带 Worker Token 的直接 Tick 归属为留空；有正确服务端 Token 的旧 Worker 归属 `main`；有正确 Token 且提供 `w-<24位十六进制>` 实例 ID 的新 Worker 会得到明确归属。
- 跟随 CAS 原子领取更新 `owner_instance`：领取失败不能改写，租约到期后新的胜出者接管才会更新。普通进程心跳不能写此字段、不能对任意任务续租。

## 3. 可信归属传递链

独立 Worker `worker/run.mjs` 随机生成临时进程 ID → `POST /api/internal/worker/step` 校验 Worker Token 并读取实例 ID → 后端内部转发到 Agent 或 Workflow tick，同时传递 Token 和实例 ID → `harness_worker_identity.js` 在 tick 中使用服务端密钥常量时间核验后才允许归属到该实例 → `harness_execution_guard.js` 通过原子 CAS 写入 `owner_instance`。

**绝不以浏览器传入的 X-Worker-Instance 单独建立信任。** 客户端伪造 header 不能把执行标为 Worker；仅运行 Token 与既有 owner+lease fence 决定是否能提交检查点。

## 4. 员工工作台可见性

`GET /api/worker/status` 新增仅对已验证员工归属的任务可见的 `active_claims`：

- **最早到期的 20 项**有效租约（超过则返回 `active_claims_sampled=true`）；
- 任务类型、任务 ID、受限实例别名和租约剩余毫秒；
- 是否属于已验证 Worker 实例。直接 Tick 或旧历史空值明确显示未归属 Worker；
- **不返回租约 Token、外部工具输入、用户凭证及其他员工任务**。实例 ID 是经过共享 Worker Token 授权者提供的声明，并非对主机或进程身份的独立硬件/密码学证明；数据库中的执行租约胜出者与其 CAS fencing 才是可信的执行权证据。

工具中心“当前有效租约”默认折叠展示，Agent 可点击打开运行详情。归属信息源自数据库且是一个查询时刻的快照，并不证明对应 Worker 当前进程仍在线。

## 5. 专项验证

- `tests/harness-worker-identity.test.mjs`：无 Token、错误 Token、禁用 Worker、非法实例及正确旧/新 Worker 请求头，均有隔离单元测试。
- `tests/harness-execution-guard.test.mjs`：验证失败竞争不改写归属、接管成功才能更新、旧租约不能续期或覆盖新租约。
- `tests/schema-migrations.integration.mjs`：原有存量 SQLite 版本可添加字段，重复启动及模拟版本日志恢复后不会删除历史租约。
- `tests/worker-crash-recovery.integration.mjs`：真正运行 PocketBase 和两个独立 Worker 子进程，验证租约实例归属、浏览器伪造实例不生效、员工之间无法访问彼此任务以及未知外部写入禁止重放。
- `pnpm check`：全量单元、TypeScript、Vite 生产构建及资源隔离验证通过。
- `node ops/e2e-parallel.mjs --workers=2`：V23 当前代码下 **27/27 项隔离 PocketBase/SQLite E2E 通过，0 失败**，覆盖租约归属、故障接管、员工权限、外部写操作与本机执行器。
- `pnpm test:design-workspace`：Chrome 真实页面、独立员工测试登录、四模块 Agent、复杂五角色、MCP 工具与审批的隔离验收 **1/1 通过**；浏览器控制台错误 0、HTTP 400 响应 0。
- 本机依赖说明：当前 Git worktree 的 `node_modules` 为指向上级项目的 junction，pnpm 拒绝在它上面运行安装，且顶层缺少 `exceljs` / `playwright` 链接；这并非依赖未安装。此次测试仅在进程环境中使用临时 Node ESM 解析器从锁定的 pnpm `.pnpm` 目录解析 `exceljs@4.4.0`、`playwright@1.64.1`，Chrome 测试另使用其已有的 `AGENT_STUDIO_PLAYWRIGHT_MODULE` 配置。**没有修改共享 node_modules、没有更新依赖版本或锁文件**。以后应为工作树建立真正隔离的测试依赖安装目录，而不能默认让 pnpm 改写共享 junction。
- 本阶段的完成意味着开发及隔离环境验收通过，不构成真实企业账户、跨机器租约保活或生产上线许可。

## 6. 仍未实施的高风险部分

**本阶段没有开放跨请求的连续租约续期。** 原有短步骤在内部可信执行器操作边界可以继续使用持租约令牌的原有续期方法，普通 Worker 进程心跳只能证明最近活动，不能将租约从任意旧执行器处“续活”。

在单次调用极长、超过正常 TTL 或发生网络分区时，旧执行器的任何持久化必须仍由 lease token fence 拒绝，外部写入结果不明须保留人工核查。实现真正独立续租需要一个与执行 Token 绑定、不可被其他 Worker 代用的专用代理，跨进程故障注入、租约吊销、长达 TTL 的压测以及第三方写入幂等契约。本阶段不以降低栅栏安全换取“看似任务始终在线”。

生产上线仍为 **NO-GO**，需真实员工验收和运维备份/告警演练。
