# Agent Studio V24｜执行令牌绑定的操作边界续租与工作树测试依赖隔离

日期：2026-10-23  
开发分支：`feat/harness-design-workspace-20261021`  
生产上线状态：**NO-GO**。本阶段仅在隔离开发工作树修改代码，未提交、推送或部署。

## 1. 已识别的架构事实

PocketBase Agent/Workflow Tick 在服务端生成高强度租约 Token，外部 Node Worker 只持有独立 Worker Token 和最近进程心跳。普通进程心跳不是任务的执行租约凭据，不能据此对特定任务续租。

将进程心跳当作任意租约续期，会让旧 Worker、异常网络会话或者已丧失执行权的请求继续占用任务，破坏 CAS fencing 与外部写操作防重放。

因此本阶段**没有**实现让一个长达 10 分钟以上的不可中断 HTTP 调用自动连续续期，而是强化安全且能真实运行的续租边界。

## 2. 操作边界安全续租

在 `harness_execution_guard.js` 新增 `renewForDispatch`，Agent/Workflow 均复用：

- 使用当前 Tick 持有的服务端生成租约 Token，按`kind + runId + token + tenant owner`绑定到有效租约；
- 在一次 SQLite 写事务内，验证租约未过期、任务仍为 `running` 且归属未变；
- 使用 PocketBase 的 `record.getString("checkpoint")` 解码 JSON 字段（避免 JsonRaw 字节包装对象的兼容问题），检查最新任务运行总截止时间；
- 单次调用安全窗口必须小于租约 TTL 且保留 30 秒余量；当前使用 240 秒有界窗口，默认租约 TTL 为 600 秒；
- 过期、被抢占、跨租户、状态非运行中、JSON 损坏、超出任务总时限，一律**拒绝下一次外部调用**，并在事务失败时回滚租约延长；
- 普通 Worker 进程心跳不进入这条路径，不接受用户提供的任意任务租约续期请求。

Agent 和 Workflow 在新的模型调用、外部写操作审计开始前、每一次工具调用及允许的只读工具重试前，均调用这个绑定租约的校验。防止多次模型/工具调用串在同一次 Tick 中时，续租仅发生在第一步、后续重试越过已过期执行权。

## 3. 故障注入及兼容测试

- `tests/harness-execution-guard.test.mjs` 验证 Token 错误、另一员工、过期租约、旧 Token 抢占失败、被取消状态、无效窗口、超出执行截止时间、回滚以及正常续租。
- `tests/agent-effects.integration.mjs` 新增：只读 GET 调用第一次请求期间，将**临时 SQLite 数据库**中对应执行租约改为已过期，随后断开 HTTP 连接触发原本允许的重试；验证旧 Worker **未发送第二次 GET**。
- 之前的 Agent/Workflow POST 意图日志、审批、未知结果不重放以及进程崩溃安全接管测试保持原样并继续回归。

## 4. 不修改共享依赖的测试工作树运行器

当前 Windows Git 工作树的 `node_modules` 是指向父仓库的 junction，`pnpm install` 正确拒绝在当前工作树覆盖这个外部目录。锁文件声明的 ExcelJS/Playwright 包已在 pnpm 虚拟依赖存储中，但缺少顶层链接，导致普通 E2E 测试无法导入。

新增：

- `ops/worktree-test-loader.mjs`：只读 ESM loader，优先使用正常依赖解析；缺失时只允许 `exceljs` / `playwright` 两个声明的模块，按 `package.json` 声明的受限版本从 `node_modules/.pnpm` 只读导入，不猜版本、不访问网络。
- `ops/test-worktree.mjs`：提供 `probe`、`local`、`e2e`、`chrome` 四个测试模式，以独立测试进程启用解析器，并给 Chrome 验收提供已有配置支持的 Playwright 真实入口文件。
- `tests/worktree-test-runner.test.mjs`：核验测试依赖可解析，且工作树 `node_modules` 的实际指向、`package.json`、`pnpm-lock.yaml` 在测试前后不变。

推荐执行：

```sh
pnpm test:worktree:probe
pnpm test:worktree:local
pnpm test:worktree:e2e
pnpm test:worktree:chrome
```

这是一套**只读测试依赖解析隔离**，不是每个 Git 工作树都拥有自己物理副本的 `node_modules`。若未来要真正独立安装，必须将工作树建立在没有共享 junction 的干净目录、使用项目锁文件与独立依赖存储，并在备份及权限确认后实施；不得默认清理当前共享 junction。

## 5. 尚待实施的连续后台续租（不可冒充已完成）

真正跨单次 HTTP 模型/工具阻塞的租约续期，需要执行令牌绑定、持租约进程主动性验证与可吊销续租能力，并对 TTL 到期、旧 Worker 失效、新 Worker 接管、网络分区、两进程竞争和结果未知的第三方写入进行真实故障注入。

任何续租 API 都不能仅依赖共享 Worker Token 或可伪造的实例名延长任意租约；数据库 Lease Token/CAS 仍是唯一的执行权依据。外部服务的严格 exactly-once 还需业务级幂等契约，不能通过本地续租凭空保证。

## 6. 验证记录

- 租约单元测试（11 项）：PASS。
- Agent 外部写入与审批集成测试：PASS。
- Workflow 并发、外部写入恢复、未知响应防重放测试：PASS。
- 首次真实集成测试暴露 PocketBase JsonRaw 解码问题，已修复，重新运行通过。
- 过期租约期间只读网络重试故障注入：PASS，外部 GET 仅一次。
- 工作树 probe 及 Chromium/PDF/XLSX 本地执行器：PASS，无共享依赖树改动。
- **V24 `pnpm check`：通过**，包含当前全量单元测试、TypeScript、Vite 生产构建与 106 项生产资源隔离检查。曾有一次并发压力下的独立初始化版本检测失败和 Worker 小样本超时；两者在隔离重测均通过，随后全量 `pnpm check` 重新运行退出码为 0。
- **`pnpm test:worktree:e2e`：27/27 通过，0 失败**，使用两个并行执行者的独立临时 PocketBase/SQLite 数据库及本地 Chromium、PDF、XLSX 工具；真实租约竞争、外部写操作不重放等场景均通过。
- **`pnpm test:worktree:chrome`：1/1 通过**，独立员工登录、四个 Agent 设计模块、角色权限、工具连接、人工审批、故障恢复及版本试跑均通过；19 组旅程检查，浏览器控制台错误 0、HTTP 400 响应 0。
- **`pnpm test:worktree:integrity`：通过**；修改文件及 pnpm lock/共享 node_modules 物理路径经过只读验证未被测试运行器改变。
- V24 主要路径的 ESLint、JavaScript 语法与 Git diff 检查另按最终工作区验证输出记录。

生产上线状态依然 **NO-GO**。
