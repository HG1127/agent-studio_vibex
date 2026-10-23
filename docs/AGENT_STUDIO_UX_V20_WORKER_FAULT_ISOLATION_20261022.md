# Agent Studio V20｜后台 Worker 模块故障隔离与独立退避（2026-10-22）

## 背景和已复现的缺陷

此前独立 Worker 的主循环采用：

`dispatchScheduledTask() → advance() → advanceKnowledgeIndex()`

三者放在同一个 `try/catch` 中。因此，定时任务派发接口短暂返回 HTTP 500 时，当次 Agent/Workflow 任务根本不会执行；知识索引接口返回 500 时，虽已执行过 Agent 一步，随后仍会触发整个循环指数退避，下一步 Agent 的进度受到不相关故障牵连。

这与“长期无人值守，部分功能故障但其他任务照常推进”的目标不符。

## 实际修改

- 在 `worker/run.mjs` 给定时调度与知识库语义索引建立两个独立的失败计数和重试窗口（内存态）；Agent/Workflow 主任务通过 `advance()` 保持原有主路径和核心故障退避。
- 两项可选子服务中，普通 HTTP 5xx / 网络异常不会使主任务停顿，改为记录一次有界错误，并分别从 **5 秒起指数退避，上限 60 秒**。退避期间跳过该子服务，之后再试。恢复成功自动归零计数。
- 子服务明确返回 `failed=true` 也采用有界重试，避免一个持续失败的语义索引队列阻塞 Agent 任务。
- 定时任务和知识索引服务如果返回鉴权失效（401/403，或原有 503 禁用语义），仍按照原有安全契约中止 Worker，**不会**被当作普通可重试错误。
- 关键 Agent/Workflow 执行接口故障依旧进入原有指数退避；不得将用户运行失败悄悄标为成功。

## 新增隔离验证

`tests/worker-loop-resilience.test.mjs` 使用临时本地 HTTP 服务和真正的 `node worker/run.mjs` 子进程验证：

1. 定时任务与知识索引都返回 HTTP 500，单次 Worker 运行仍正常推进一次 Agent 任务并以退出码 0 结束，同时输出两个独立退避日志。
2. 连续运行中两个子服务持续返回 500，主任务能继续多次推进；故障子服务在冷却时间内没有重复请求风暴。
3. 定时任务鉴权返回 401：立即停止，无任何 Agent 或索引请求。
4. 知识索引鉴权返回 401：立即停止，而非进入普通退避。

新测试纳入 `pnpm test` 与 `pnpm test:worker-resilience`，由 `pnpm check` 自动覆盖。

## 本轮最终验证（独立开发环境）

- `node --test tests/worker-loop-resilience.test.mjs`：1/1 通过；其中覆盖 4 个隔离场景，包括双子服务 500、连续退避、定时任务 401 和知识索引 401。
- `pnpm check`：通过（全量单元测试、TypeScript 检查、Vite 生产构建、106 项生产打包隔离检查）。
- `pnpm test:worker`：真实 PocketBase/SQLite + 独立 Node Worker 进程通过，Agent 与 Workflow 不依赖浏览器轮询完成执行。
- `node ops/e2e-parallel.mjs --workers=2`：26/26 通过、0 失败；包含 Worker、Agent 外部写入、并发、知识库、定时调度与本地执行器。
- `pnpm exec eslint worker/run.mjs tests/worker-loop-resilience.test.mjs` 与 `git diff --check`：通过。

以上为开发隔离环境验证。未实际断开生产网络、长期压测生产 Worker 或部署第三方集群。

## 边界与下一步

- 独立失败窗口保存在 Worker 进程内，进程重启后计数归零；没有声称跨重启持久化退避。
- 新方案仍然是单进程串行调度；被允许执行的一次索引调用仍可能在其有界请求时限内占用 Worker 执行窗口，不是多线程并行 Worker。
- 对模型/外部写入只保证此前的租约保护与写操作意图日志；外部系统真正的 exactly-once 必须由第三方明确支持业务幂等。
- 正式生产仍需验证 systemd/Windows 服务自动重启、长时间网络分区、数据库断连、额外 Worker 实例竞争和人工排障告警。

本阶段仅在 `feat/harness-design-workspace-20261021` 独立分支操作，不提交、推送、部署，不修改 PostgreSQL 迁移与生产数据。
