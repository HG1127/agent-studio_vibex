# Agent Studio V25｜同步调用超时边界与执行租约安全（2026-10-23）

分支：`feat/harness-design-workspace-20261021`  
发布状态：仅隔离开发环境；未提交、推送或部署。

## 1. 本阶段判断：不能把同步 Goja HTTP 请求伪装成后台续租

PocketBase Hook 中的 `$http.send` 是同步调用；在当前执行路径里没有经过验证的 JavaScript 定时器能在模型 HTTP 请求阻塞时继续运行。因此本阶段**没有**引入虚假的 `setInterval` 续租，也没有允许普通 Worker Token 延长任意任务的租约。

当前安全设计继续使用：

- 600 秒 CAS 执行租约；
- 每个模型请求、工具调用和允许的只读重试前，由当前执行器以它自己的租约 Token 在数据库事务内续期，并重新验证员工归属、运行状态和总截止时间；
- 失效/被抢占 Token 无法开始下一次外部调用或提交后续检查点；
- 外部 POST/MCP 结果不确定时，持久化副作用意图并禁止自动重放。

## 2. 修复模型请求超时不受控

此前 `callCustomLlmBase` 使用调用参数作为模型超时，缺少统一上限；租约窗口的 `maxCallMs=240000` 与实际 HTTP timeout 之间存在可漂移风险。

现在 `pocketbase/pb_hooks/modules/model_request.js` 提供唯一的 `MAX_TIMEOUT_SECONDS = 240` 和 `normalizeTimeoutSeconds`：

- OpenAI 兼容、Anthropic、Gemini 三种 Provider 共用同一个超时归一化器；
- 极端大值（例如 999999 或 1e100）统一截断为 240 秒；
- 非有限值、零、负数回退为 120 秒；小于 1 秒的正值提升至 1 秒；合法窗口保持不变；
- Agent 在实际发请求前先规范化 timeout；
- Agent 与 Workflow 的 `renewForDispatch.maxCallMs` 现在引用 `model_request.MAX_TIMEOUT_SECONDS * 1000`，避免硬编码窗口与实际请求限制漂移；
- 600 秒租约比 240 秒同步调用保留至少 360 秒时间；guard 自身仍保留“调用窗口 + 30 秒必须小于 TTL”的约束。

## 3. 对齐 Worker 代理与外层 HTTP deadline

另一处之前不匹配的超时是：PocketBase 内部 Worker 路由通过 `$http.send` 调用 Agent/Workflow Tick 的代理超时为 120 秒，而 Provider 请求允许 240 秒。外层代理可能在正常模型调用完成前就中断，导致调用方无法收到结果。

已调整为：

- Provider 实际模型请求：最多 240 秒；
- PocketBase 内部 Worker → Tick 代理：300 秒；
- 独立 Node Worker → PocketBase：默认 315 秒，允许配置范围 5 秒至 330 秒；非法或越界值回退到 315 秒；
- 新增 `worker/config.mjs` 集中维护外层 Worker deadline；
- 定时任务预检仍有单独的 30 秒上限，不受主 Tick timeout 拉长影响。

该调整使内层请求先于代理返回，外层 Worker 有额外等待余量，同时仍远短于 600 秒租约。它不意味着网络分区时能自动续租，也不代表第三方写入具有 exactly-once 保证。

## 4. 新增回归测试

- `tests/model-request.test.mjs`：超时极值、Infinity、NaN、零、负数、低于 1 秒及三种 Provider 共用的 240 秒上限。
- `tests/worker-timeout-contract.test.mjs`：外层 Worker deadline、PocketBase 300 秒代理和 Agent/Workflow 续租窗口使用同一常量契约。
- `tests/harness-execution-guard.test.mjs`：当前执行 Token、过期/被抢占租约、员工归属、终态、运行总截止时间与事务回滚。
- `tests/agent-effects.integration.mjs`：外部 POST 不重放、审批、模型阶段停止以及租约失效时禁止只读 HTTP 重试。
- `tests/concurrency.integration.mjs`：多 Worker 竞争、外部写操作、取消与接管。
- `tests/worker-loop-resilience.test.mjs`：独立进程心跳期间同步 Tick 阻塞，且心跳不会修改执行租约。

## 5. 尚未实现的能力及生产限制

本阶段**不是**“跨单次阻塞调用的连续续租”。若未来要在单次调用持续超过 240 秒时续租，需要另行设计执行 Token 绑定的可撤销租约代理或异步作业协议，并验证租约抢占、取消、旧执行器返回、网络分区及外部写入未知结果等故障场景。不得仅靠共享 Worker Token 或实例名称为任意任务续租。

当前单次同步 Provider 调用有 240 秒硬上限。若某 Provider 确实需要更长时间，应改为可恢复的异步模型任务协议，而不是放宽上限。生产上线仍为 **NO-GO**，直到真实员工环境、进程管理器和网络分区场景通过预生产验收。

## 6. 验证记录

- 租约 guard + model request + Worker timeout contract：19 项通过。
- Agent 副作用/审批集成：PASS。
- Workflow 并发与接管集成：PASS。
- Worker 故障隔离与长 Tick 心跳：2 项通过。
- 全量 `pnpm check`：通过（单元、TypeScript、Vite 生产构建及 106 项资源隔离）。
- `pnpm test:worktree:e2e` 与 `pnpm test:worktree:chrome` 的最终状态按本轮冻结代码后的实际退出结果记录。
