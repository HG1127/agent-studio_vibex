# Agent Studio VibeX 后台 Worker 部署与故障恢复

## 本轮实现范围

运行中的 Agent 和 Workflow 可以由外部 Node.js 进程驱动，不依赖浏览器轮询。服务端 `background_worker.pb.js` 提供：

- `POST /api/internal/worker/step`：鉴权后从运行中的任务中选择一个符合条件的任务，只推进一个 Tick。
- `GET /api/worker/status`：登录用户可查看是否启用、最近心跳、最近执行时间及累计调用尝试次数，不泄露其他用户的任务或密钥。
- 任务通过持久化的 PocketBase `agent_runs` / `workflow_runs` 恢复。已有 `checkpoint.claim_until` 可跳过当前有租约的任务，审批中、暂停及终止状态不会被推进。
- `worker/run.mjs` 定期连接内部接口，串行执行，失败后指数退避，捕获 SIGINT/SIGTERM 并停止。
- `src/components/tool-hub/WorkerStatusPanel.tsx` 在工具中心展示执行器心跳。
- 同一 Worker 还驱动 `scheduled_tasks.pb.js` 计划队列：获取到期规则、调用 Node IANA 时区计算、创建幂等执行实例并继续 Tick。见 [定时任务说明](SCHEDULED_TASKS.md)。

**当前通过真实 PocketBase + 独立进程验证：** 浏览器没有发起 Tick 时，独立 Worker 能完成含开始/结束节点的工作流，也能调用测试用 OpenAI 兼容模型并完成 Agent 任务。

## 生产部署要求

1. 后端 PocketBase 必须在可信内网，仅向 VibeX 网关或反向代理开放业务 API，不能让不可信客户端直接设置 `X-Rh-User-Id`。
2. 后端配置 `AGENT_STUDIO_BACKGROUND_WORKER=true`。
3. 后端配置 `AGENT_STUDIO_WORKER_TOKEN`（至少 32 字符，用安全随机生成器产生），且该密钥只在后台 Worker 和后端服务端配置中出现。
4. 若 PocketBase 不是监听默认端口 7000，后端配置 `AGENT_STUDIO_WORKER_INTERNAL_URL=http://127.0.0.1:<实际端口>`。服务器仅允许访问回环地址。
5. Worker 进程配置相同 `AGENT_STUDIO_WORKER_TOKEN` 和 `AGENT_STUDIO_WORKER_URL`，后者须指向可访问到 PocketBase 后端的地址。
6. 保持模型连接的 BYOK 模式。后台 Worker 不会代表用户从浏览器读取平台付款凭证，模型调用由所属用户的服务端模型连接承担。

启动命令：

```sh
pnpm worker
```

仅推进一次便退出（用于调试）：

```sh
node worker/run.mjs --once
```

本项目不会自动从聊天里启动常驻服务。部署必须用 systemd、容器服务或 Windows 服务管理工具保证进程持续运行和重启。Linux 可以参照 `deploy/agent-studio-worker.service.example`。

## 安全边界

- Worker Token 是高权限服务端凭证，不能写入网页 JavaScript、公开仓库、日志或 VibeX ZIP。
- 服务端仅从数据库读取任务归属，调用者不能通过请求体指定 owner 或任意 URL。
- **统一受保护 SQLite 租约**：`execution_leases.pb.js` 创建 `agent_studio_run_leases`；共享 `modules/harness_execution_guard.js` 为 Agent/Workflow 提供原子 CAS 领取、条件续期、事务内核验 lease token + 存活期 + 员工归属、受保护的 checkpoint/status 更新及条件释放。失去租约的旧 Worker 不得覆盖新执行者的持久状态。后台调度只依赖数据库活跃租约，不将可能过期的 `checkpoint.claim_until` 提示当成权威依据。默认最长 10 分钟，模型/外部写操作前可续期。**这是状态提交保护，不是完整分布式 exactly-once**：外部系统必须结合写意图日志、专有幂等协议和人工核验，原始事件仍可能重复。
- **运行时限和队列扫描**：可选 `max_runtime_minutes` 1～1440 分钟，过期后在新步骤/模型或工具调用边界终止并保留检查点（不直接中断进行中的 HTTP）；Agent 和 Workflow 共用 `harness_run_lifecycle.js` 准入机制。后台 Worker 使用有上限的多页扫描查找最早可运行任务，解决首 60 条任务都有活跃租约时的队列误判；上限每类 300 条，超限返回 `scan_capped`。
- **外部写操作审计与安全恢复**：`agent_studio_side_effects` 在 HTTP POST / MCP 调用前写入 `started`；明确成功写入 `succeeded`，结果不确定写入 `unknown`。同一步、同工具、相同入参才能复用成功结果；`unknown` 或尚未确认的 `started` 会阻断重复 POST，并以需要人工核查的错误终止当前任务。读操作可按既有规则重试，未知第三方写操作不会自动重试。
- **不盲目附加 Idempotency-Key**：部分底层 HTTP 传输层可能据此自动重发 POST，即使应用层禁止重试。当前对未知第三方接口不发送该 Header；只有第三方明确实现按业务键幂等时，才能在专属适配器中协商开启。
- **多 Worker 调度**：后台调度扫描有效租约，跳过其他执行者已领取的任务。多个 Worker 的原子领取、租约令牌 fencing 与独立心跳已在隔离环境验证；V23 进一步在租约中记录由服务端 Token 验证的 Worker 进程别名。仍未提供跨进程、长时间阻塞中的专用租约续期代理及跨机器完整故障验证；正式生产建议先保持一份 Worker，并在独立预生产环境压测。
- **工作台可观测性**：工具中心显示当前用户最近各 100 条 Agent/Workflow 的任务状态估算、正在执行的步骤、待审批以及需要人工核查的写操作数量（后者按完整审计表按用户统计），不会暴露其他账户的数据。
- **V21 可靠性验证与子系统报告**：真实进程终止、同数据库重启和租约人工模拟到期验证外部写操作 `started` 不会自动重放；多 Worker 进程竞争时同一外部 POST 只执行一次。Worker 每次请求以限定枚举/计数报告定时任务派发及知识库索引最近状态，服务端校验并保存，UI 区分近期心跳、已过期报告和需要人工核查的外部写操作。该报告仅代表最近一个上报者，不能被解释为实时进程在线或整个集群健康。详见 `AGENT_STUDIO_UX_V21_WORKER_CRASH_RECOVERY_20261022.md`。
- **V22 独立实例与进程心跳**：每个 Node Worker 进程具有随机实例 ID，新增 Token 保护的 `/api/internal/worker/heartbeat`，用于在较长同步 Tick 期间更新独立实例的活动时间；工作台可见最近 12 个实例的受限心跳摘要。员工专属指标还区分租约已过期的接管候选和未知外部写意图。**该心跳不延长任何执行租约**；超长阻塞步骤的合法租约持续续期仍是生产前需要单独验证的能力。详见 `AGENT_STUDIO_UX_V22_MULTI_WORKER_HEARTBEAT_20261022.md`。
- **V23 租约与实例归属**：非破坏性迁移为 CAS 租约增加 `owner_instance`，Worker 进程 ID 与服务端 Token 双重校验后才可随成功领取记录写入；员工工作台限量显示本人有效租约的受限持有者、任务类型、剩余 TTL，不暴露 lease token 或其他员工任务。仍不允许普通进程心跳续租。隔离 E2E 27/27 通过；详见 `AGENT_STUDIO_UX_V23_LEASE_OWNER_ATTRIBUTION_20261023.md`。
- `AGENT_STUDIO_WORKER_INTERNAL_URL` 只接受回环 HTTP 地址以避免任意目标 SSRF。
- 生产上线前仍要验证 VibeX 运行环境是否允许持久 Node Worker、服务端环境变量及回环 HTTP；仅上传源码不会自动启动它。

## 维护与验证

```sh
pnpm test
pnpm test:integration
pnpm test:worker
pnpm build
pnpm test:concurrency
pnpm test:agent-effects
pnpm test:schedules
```

验证结果应包括无授权请求返回 401、工作流和 Agent 独立完成、空队列返回 idle、心跳可读且未经认证无法读取。运行日志为 JSON Lines，包含任务 ID、结果状态和错误码，不应包含任何敏感密钥。

`AGENT_STUDIO_WORKER_INTERVAL_MS` 默认 3000，`AGENT_STUDIO_WORKER_REQUEST_TIMEOUT_MS` 默认 145000，可按网络负载调整。后台状态在约 180 秒没有收到心跳后显示为离线，以容纳单次最长约 120 秒的大模型执行；这代表近期有心跳，不是严格的进程存活探测。
