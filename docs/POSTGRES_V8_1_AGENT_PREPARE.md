# Agent Studio V8.1 — PostgreSQL Agent Prepare Worker

## 功能状态

当前仅为**公司内部 Agent Studio 的 PostgreSQL 独立后端试验**。新增了真实 PostgreSQL SQL 驱动的 Agent 运行准备闭环；**并未执行模型推理、外部 HTTP 工具、工作流节点或定时任务**。成功运行的检查点状态是 paused / awaiting_model_configuration，绝不能显示为 AI 分析已完成。

旧 React/PocketBase/SQLite + 独立本地登录系统依然是现有业务基线，尚未切到新 PostgreSQL。开发未触碰公司的宝塔 Ubuntu 24 正式服务器与其现有网站及数据库。

## 已落地的最短闭环

- 签名 JWT 身份验证之后，POST /api/v2/agent-specs/:uuid/runs 提交 idempotency_key（8–80 位字母数字、下划线或短横线）和可选 instruction（最多 1200 字符）；服务端仅允许访问本人 Agent 配置。
- 在同一个 PostgreSQL 事务里创建 runs(queued) 和 jobs(kind=run_tick, payload.phase=prepare)，记录当时 Agent 配置 revision。相同员工、相同 idempotency_key、相同参数会重用原运行；不同参数或不同 Agent 触发 409。
- GET /api/v2/runs 和 GET /api/v2/runs/:uuid 仅查询本人 Agent 运行状态。签名 JWT/数据库 RLS 对跨员工查询同时限制。
- 独立 AgentPrepareWorker 只领取 phase=prepare 的 run_tick，验证员工状态 active、运行仍 queued、租约过期和 external_effects started/unknown 拦截。不会误拿 schedule_dispatch / knowledge_ingest。
- Claim 用 FOR UPDATE SKIP LOCKED 领取任务、更新 lease_token、lease_version、lease_until 和 attempts。准备阶段再次用带锁的租约验证，然后按认领的真实 owner_user_id 设置数据库事务临时 RLS 身份，只写入合成的 prepare step、元数据审计和 paused 检查点。
- 一次事务内最后校验租约、标记 job succeeded。该 succeeded 仅表示**准备任务成功**，不是 Agent 生成了研究报告或调用过大模型。
- 如果原 Agent 配置自入队后被更改，检查点标记 spec_revision_changed，不使用不匹配版本继续执行。
- Worker 崩溃后，可由其他 Worker 在租约到期时接手，旧 Worker 凭证失效；试运行失败最多按每个 job 的 max_attempts 重试，再标记 failed；最终重试中崩溃导致的过期 lease 也会在单独 sweep 中归档，避免永久占用。
- 外部写操作标记 started / unknown 时禁止 Worker 自动领取或重放。本阶段不真正执行任何外部写操作。

## 权限与隔离

- API 和 Worker 使用不同 PostgreSQL 登录账号及 Docker Secrets。worker_login_password 只能存在于容器运行环境，不包含在 ZIP 中。
- Worker 数据库角色为 NOLOGIN；正式应用另用最低权限 agentstudio_stage_worker。受限角色只有特定 jobs 可更新列，以及人员 active 状态、run status、external effect status 等有限的 SELECT 权限；不能直接读取员工私有 prompt/instruction。
- Worker 只有验证数据库租约之后才切换至 owner-only API 角色，执行当前归属的运行准备数据库写入。Worker 本身是可信服务器端组件，凭据必须只在内部服务可读；SET LOCAL actor_id 不是独立认证机制。
- Docker Compose 增加可选 prepare-worker profile，**默认不会启动**，独立 private_db 网络、不映射公网端口，也不具备外网出口。只在受控隔离测试环境，经审核后启用。
- 原始 PostgreSQL 服务无公开 5432，API 试验容器仅发布宿主机 127.0.0.1:7402。没有访问或更改宝塔 Nginx。

## 新增文件

- services/pg-api/src/run-repository.ts — 员工提交/读取运行及幂等入队。
- services/pg-api/src/agent-worker.ts — 领取、准备、审计、重试、过期/耗尽租约回收。
- services/pg-api/src/worker-loop.ts — 仅在显式启用时启动的独立 Worker CLI。
- db/postgres/005_claim_agent_prepare.sql — 仅领取 prepare 任务，核验 active 员工和未知外部副作用。
- db/postgres/012_stage_worker_login.sql — 一次性创建与 API 分离的低权限 Worker 登录。
- db/postgres/migrations/pg_v8_003_prepare_worker.sql — 旧隔离 staging 库升级 Worker grants/RLS（不会自动升级正式数据库）。
- services/pg-api/tests/agent-prepare-engine.test.mjs — 真实 JWT / PGlite PostgreSQL 的运行提交、隔离、旧租约、重试、暂停、失败及员工停用测试。
- services/pg-api/tests/worker-login.test.mjs — 真实 SQL 最小权限和未知外部写防重放验证。
- services/pg-api/tests/worker-upgrade.test.mjs — PostgreSQL Worker 迁移重复执行/审计权限测试。

## 仅隔离开发环境验收

    pnpm --dir services/pg-api run check
    pnpm --dir services/pg-api run test:prepare
    pnpm --dir services/pg-api run test:worker-login
    pnpm --dir services/pg-api run test:worker-upgrade
    pnpm --dir services/pg-api run test
    pnpm test:postgres-staging
    pnpm check

这些测试不打开浏览器、不访问正式 PocketBase、不使用生产数据、不启动 Docker。PGlite WebAssembly PostgreSQL 可以执行真实 SQL，但无法代替完整 PostgreSQL 17 的 TCP/多进程实测。

## 宝塔 Ubuntu 24 的部署注意事项

目前仅有 deploy/postgres-staging/compose.yaml 的**静态配置校验**，未执行容器拉取或 up。初始化需要相互独立的 postgres_password、api_login_password 和 worker_login_password Secret，且三者绝不能提交源码。

如已有旧版本的 agentstudio_stage 数据卷，Docker entrypoint **不会**自动运行新加入的 012_stage_worker_login.sql。必须先完成备份，在隔离数据库经运维批准执行 pg_v8_003_prepare_worker.sql，随后单独审查并创建受限 Worker 登录；不能覆盖现有数据卷或复用宝塔已有库名。

不建议将 PostgreSQL stage profile 直接面向员工使用。正式上线仍需可信员工 OIDC、验证过的网络隔离、PostgreSQL 17 真实多连接/多 Worker 压测、备份恢复演练及管理员签收。

## 尚未实现

- LLM Provider 的实际调用/费用控制/输出回写和错误分类。
- Agent 的真实模型决策、工具执行、审批流、运行结果和复盘。
- PostgreSQL Workflow Worker、定时任务调度、知识库正式 Embedding、团队 RBAC。
- 现有 PocketBase Collections/SQLite 自定义数据向 PostgreSQL 的完整迁移。
- React 页面接入新 API、宝塔部署、公司员工试用及生产监控。

**当前生产判定仍为 NO-GO。** 本阶段只表明执行准备/租约恢复已具备经隔离测试的代码基础。
