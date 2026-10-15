# Agent Studio V8.2 — PostgreSQL Model Worker / UI 独立迁移试验

**上线：NO-GO。** 此文件是 V8.2 增量记录，原 PocketBase/SQLite、独立账号、老 Worker 和宝塔正式数据库均不变。没有将开发分支部署为正式员工服务。

## 新增执行链路

1. 带签名 OIDC/JWT 和 owner-only RLS 的 Agent run 入队；准备 Worker 使用 FOR UPDATE SKIP LOCKED 和租约 fencing，完成时创建审批记录，运行进入 awaiting_approval。
2. POST /api/v2/runs/:id/model-approval：本人批准、拒绝或重复提交；锁定行并复核 Agent spec revision。批准后一次性入队 model 任务，拒绝则 cancelled。
3. PostgreSQL AgentModelWorker 只领取已审批的 model run_tick。先验证当前租约、员工和审批，再写入 external_effects(started) 并 COMMIT；只有随后才发出网络模型请求。
4. 成功后事务化提交 result_text、运行步骤、审计事件和 job succeeded。外部请求结果不明、超时或崩溃则标记 unknown/paused，禁止自动重放和重复可能已计费的请求。
5. 模型适配器只允许固定 OpenAI 文本端点、Secret 文件、指定 model ID、45 秒超时与最大 1024 输出 token。不执行工具、Workflow、浏览器或插件。

## 前端隔离工作台

- src/lib/pgPilotApi.ts：仅发往同源 /__pg/api/v2，禁外部路径和重定向；OIDC Access Token 只存在 React 内存，不复用 PocketBase Token。
- src/pages/PgPilot/PgPilotPage.tsx：提供 Agent 配置、运行记录、审批、结果、Workflow 存储骨架、知识库文档及关键词检索。
- src/App.tsx：仅 Vite DEV 且 VITE_AGENT_STUDIO_PG_PILOT_UI_ENABLED=true 时注册 /pg-pilot。
- vibex-local/vite.local.config.ts：新 /__pg 仅代理 127.0.0.1:7402，现有 /__pb 代理保持不变。
- Workflow 仍然只是安全存储骨架；知识库仍为关键词检索，不能声称 Workflow Worker 或语义 RAG 已迁移。

### 本地体验路径

1. 只在开发机设置 VITE_AGENT_STUDIO_PG_PILOT_UI_ENABLED=true；切勿将密钥放在 VITE 环境变量。
2. 使用 pnpm exec vite --config vibex-local/vite.local.config.ts --host 127.0.0.1 --port 8000 单独启动前端，打开 http://127.0.0.1:8000/pg-pilot（无需同时启动 PocketBase）。
3. 只有完成独立隔离 PG stage 数据库、API、经批准的 OIDC Issuer/JWKS、预配员工身份后，才能用短期有效的测试 Access Token 登录。API 设置 AGENT_STUDIO_INTERNAL_APP_ORIGIN=http://127.0.0.1:8000。
4. 本实验版本没有正式的 SSO 员工登录流程，不是现有员工的无缝迁移。

## 增量迁移和隔离部署

- 全新 staging 库：db/postgres/001_stage_schema.sql 内含 result_text 与 RLS。已有受控的旧 agentstudio_stage 库先备份、审核，再单独执行 db/postgres/migrations/pg_v8_004_model_execution.sql（含错误库名拒绝、幂等约束）。
- deploy/postgres-staging/compose.yaml 不自动启动模型 Worker，PostgreSQL 不暴露 5432；API 仅回环 127.0.0.1:7402。
- 模型 Worker 只在额外加载 deploy/postgres-staging/model-worker.compose.yaml 且选择 model-worker profile 时启用。模型 Secret 位于源码外的独立文件，不使用 PG 管理员/API/Worker 密钥；模型 Worker 没有公网监听端口。
- 模型 Worker 要访问外部模型端点，overlay 才额外接入 api_egress 网络，不要在公司宝塔服务器直接启动本 staging 配置。

## 离线回归验证

    pnpm test:pg-pilot
    pnpm --dir services/pg-api run check
    pnpm --dir services/pg-api run test:prepare
    pnpm --dir services/pg-api run test:model-execution
    pnpm --dir services/pg-api run test:model-upgrade
    pnpm --dir services/pg-api run test
    pnpm test:postgres-staging
    pnpm check

这些是静态契约、合成身份、mock 模型和真实 PostgreSQL SQL 的 PGlite 引擎测试，不会调用真实模型或连接生产数据库。

## PostgreSQL 17 真实 TCP 并发 CI（代码已准备，执行状态尚未验证）

- 已创建 services/pg-api/tests/pg17-tcp.integration.mjs，独立于 PGlite，使用 node-postgres 的真实连接池、合成签名 JWT、两个用户和至少两个 Worker，测试并发 SKIP LOCKED、审批、RLS、结果和两类崩溃恢复；模型回复仅为 mock，不调用真实模型。
- .github/workflows/agent-studio-quality.yml 新增 pg17-tcp-isolated job；由 GitHub 托管 CI runner 新建全新 pgvector/pgvector:pg17 服务容器，只将测试端口映射到 127.0.0.1。
- 验收脚本在建立连接前要求 GITHUB_ACTIONS=true、开启 AGENT_STUDIO_PG17_TEST_ENABLED、严格的 127.0.0.1/agentstudio_stage/agentstudio_admin 和与当前 GITHUB_RUN_ID 匹配的合成口令；连接后先检查数据库为 PostgreSQL 17 且不存在 agentstudio.runs，避免误改旧库。
- 先从源码生成旧版 V8.1 stage schema，再实测 pg_v8_004_model_execution.sql 重复迁移；通过真实非超级用户登录验证最小权限。绝不会连接宝塔、公司 PocketBase、正式 OIDC 或真正的模型服务。
- 测试仅在**包含该 Workflow 的 Git 仓库完成提交/推送、GitHub Actions 启动该 job 后**才能得到真正 PostgreSQL 17 PASS/FAIL。当前 VibeX 下载目录不是 Git 仓库，本轮没有推送，也没有启动此 CI job；代码就绪与真机验收通过必须严格区分。
- 离线护栏检查：node --test tests/pg17-ci-contract.test.mjs，断言不在允许的 CI 环境时 PG17 程序直接拒绝执行，且配置固定到隔离环境。

## PostgreSQL 17 真机阶段必须再验

1. 隔离 PostgreSQL 17 + pgvector 实例部署、schema 和增量迁移回放，独立 API/Worker 非超级用户角色真实连接/RLS 权限验收。
2. 两个员工、多 API 数据库连接和多个 Worker 并发领取，确认 SKIP LOCKED、lease fencing、崩溃恢复、迟到 ack、外部已发起请求不重放。
3. 测试 OIDC 发行方接入、拒绝未预配/停用账号、前端 API 全链路、密钥旋转和网络隔离、备份恢复及监控。
4. 严格限制真实模型调用前的预算/速率、配置审批、费用核算、人工核对流程，并补完整工具/Workflow/Embedding/RBAC/正式数据迁移方案。

本轮开发机 docker info 报告 Docker Engine 不可用；没有宣称 PostgreSQL 17 TCP/多连接实测成功。正式发布维持 NO-GO。
