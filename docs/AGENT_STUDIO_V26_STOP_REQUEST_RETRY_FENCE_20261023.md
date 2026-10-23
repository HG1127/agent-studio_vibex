# Agent Studio V26｜取消/暂停请求与外部工具重试的执行权边界

日期：2026-10-23  
开发分支：`feat/harness-design-workspace-20261021`  
发布状态：**仅独立开发工作区，未提交、推送或部署；生产仍为 NO-GO**

## 1. 问题与真实复现

在 V24/V25 的令牌绑定操作边界续租中，已能拦截过期或被抢占的租约，但仍需处理另一类竞态：**客户端在第一笔只读外部请求发出后发出“取消/暂停”，随后第一次请求返回临时错误，执行器可能仍按既有策略进行下一次应用层重试**。

首次 Workflow TCP 连接断开测试出现 2 次 GET；该现象无法单独证明是应用层发出了第二次请求，因为底层 Go HTTP Transport 有可能透明重试已发送的幂等 GET。为了隔离不同层次的行为，使用确定性屏障，在请求已收到且仍未响应时等待客户端取消 API 返回，并核验数据库 checkpoint 标志确实已持久化，之后才返回应用层可重试的 HTTP 503。这样测试的是应用级重试规则，不会把底层传输重发误判为应用代码的行为。

## 2. 已实施的防护

### 2.1 事务级停止条件

`pocketbase/pb_hooks/modules/harness_execution_guard.js` 的 `renewForDispatch` 在租约令牌、任务 owner/status、执行期限检查的同一个 SQLite 事务内，重新读取最新 checkpoint：

- `cancel_requested=true`：Agent/Workflow 均拒绝开始新一次模型或工具调用；
- `pause_requested=true`：只对实现暂停语义的 Agent 拒绝新调用；
- 非法 checkpoint、超时、跨租户、过期/被抢占 Token、任务终态：继续保持 fail-closed，禁止续活租约。

这不是任务进程心跳 API，也不允许共享 Worker Token 或实例名称代替执行租约。

### 2.2 Agent 协作式停止

如果读请求失败后准备应用级重试时发现停止标志，执行器停止重试、保留用户的取消/暂停请求，不将其错误写成新的普通执行失败：

- 取消时在安全边界完成 `cancelled`；
- 暂停时后续 Tick 应用 `paused`；
- 已经发出的 HTTP 请求可能无法回滚；已有副作用日志保留人工核查要求。

### 2.3 Workflow 协作式取消

Workflow 若在工具应用层重试前收到 `execution_stop_requested`，不再执行第二次 HTTP 请求。使用当前合法租约及 checkpoint 中已持久化的 cancel 标志，在事务内切换到 `cancelled` 并清理待审批字段；若 Token 已失效，旧执行者无权覆盖新状态。

## 3. 覆盖正反两侧的故障注入

- `tests/harness-execution-guard.test.mjs`：12/12 通过。覆盖取消/暂停拒绝续租及事务失败时不延长租约。
- `tests/agent-effects.integration.mjs`：PASS。模拟第一次 GET 进行中取消、暂停或让租约过期，后续应用级请求被阻断；也覆盖外部写入结果不确定禁止重放与人工审批。
- `tests/concurrency.integration.mjs`：PASS。固定屏障确保 HTTP 503 只在取消 API 返回且数据库写入标志后发生；应用层没有进行第二次 GET。另增加无停止请求时 GET 第一次 503、第二次 200 的正向用例，确认只读工具合法重试一次，既安全又没有误伤原有能力。
- `pnpm check`：本轮 V26 源代码冻结后退出码 0，全量单元测试、TypeScript、Vite 生产构建及 106 项打包隔离均通过。
- `pnpm test:worktree:e2e`：**27/27 项隔离 E2E 全部通过，0 失败**，包括 Agent、Workflow 并发与只读重试、Worker 崩溃恢复、外部写操作防重放、知识库、多角色 Agent 与本地 Chromium/PDF/XLSX 执行器。
- `pnpm test:worktree:chrome`：**1/1 通过**，覆盖独立员工登录、四个 Agent 设计模块、MCP 连接、人工审批、五角色调研 Agent、浏览器/PDF/Excel 工具和版本变更后的重新试跑；Chrome 控制台错误 0、HTTP 400 响应 0。测试使用隔离临时 SQLite、确定性模型及本地工具 fixture，不是生产账号验收。
- 主要变更文件的 ESLint、JavaScript 语法及 `git diff --check`：PASS。原 V16–V25 工作区改动和独立分支保持不变，未提交、推送或部署。

## 4. 限制与后续安全要求

- 当 TCP 层已将 GET 交给 Go HTTP 客户端后，底层 Transport 可能自行对可重试、幂等请求进行透明重发；本阶段不能承诺在已经发送的 TCP 请求内部“撤回”所有网络行为。
- 对**非幂等 POST/MCP 写操作**维持持久化意图日志与未知结果阻断，不将重试安全性等同于外部系统全局 exactly-once。
- 仍未实施跨整个同步长请求的持续 lease 心跳式续租；V25 的 240 秒同步模型超时、600 秒任务租约、服务端操作边界 Token 检查保持生效。
- 没有在生产环境运行、没有进行真实多机网络分区、真实商业第三方 API 或生产账号验收；上线状态仍为 **NO-GO**。
