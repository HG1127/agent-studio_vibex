# Agent Studio V8.4 — PostgreSQL 并行迁移接口冻结

**当前生产状态 NO-GO。仅在 `agent_studio_vibex版本` 项目本地开发，原 PocketBase 与宝塔正式数据库不可触碰。** 此文档为 WebCodex 多 Agent 的统一集成契约，不是上线授权。

## 并行任务与唯一文件所有权

- **W1 Workflow 配置迁移**：只新增或修改 `services/pg-api/src/stage-workflow-import*.ts`、`services/pg-api/tests/stage-workflow-import*.test.mjs`、`db/postgres/migrations/pg_v8_006_legacy_workflow_import.sql`。对原 Workflow 的 graph、description、source、spec_id、require_approval 等所有不可保真字段显式阻断；必要的交叉引用必须与现有 Agent legacy crosswalk 核验。
- **W2 Knowledge Base 数据迁移**：只新增或修改 `services/pg-api/src/stage-knowledge-base-import*.ts`、`services/pg-api/tests/stage-knowledge-base-import*.test.mjs`、`db/postgres/migrations/pg_v8_007_legacy_kb_import.sql`。先实现 KB base 元数据保真迁移；若含文档/块/向量/ACL 而缺少相应支持，禁止自动标记“已完成知识库迁移”。绝不加载 API key。
- **W3 日程与历史数据迁移**：只新增或修改 `services/pg-api/src/stage-schedule-import*.ts`、`services/pg-api/tests/stage-schedule-import*.test.mjs`、`db/postgres/migrations/pg_v8_008_legacy_schedule_import.sql`。迁移的定时任务必须保持禁用态，不能自动触发旧任务或新任务；依赖不存在的 crosswalk 必须阻断；历史运行不可自动重放。
- **W4 PG17 独立验收 / CI**：仅限 `services/pg-api/tests/pg17-tcp.integration.mjs`、`tests/pg17-ci-contract.test.mjs` 和 `.github/workflows/agent-studio-quality.yml`，核查真实 PG17 SQL、角色、并发和集成路径；不得执行正式部署，不得声称已在真实 PG17 通过。
- **集成负责人**：独占 `db/postgres/001_stage_schema.sql`、`db/postgres/010_verify_stage.sql`、`package.json`、`services/pg-api/package.json`、`docs/POSTGRES_V8_4_PARALLEL_MIGRATION_CONTRACT.md`。仅在分支任务确认后汇总 schema/bootstrap、脚本与测试；不得覆盖另一个会话已更改的业务源码。

## 强制安全与质量契约

1. PocketBase 业务源仅允许读取经 SHA-256 manifest 验证的一致性离线 SQLite 备份。旧 15 字符用户 ID 通过事先审核且绑定快照哈希的 mapping 生成 PG UUID，**不自动猜测/签发用户身份**。
2. 新写入仅允许数据库名 `agentstudio_stage`、版本 PostgreSQL 17；绝不连接或修改现存宝塔 / V7 PocketBase / 生产数据库。模型/工具/插件密码、token、私密文件不得入源码、测试输出、日志或聊天。
3. Legacy ID → PostgreSQL UUID 必须建立迁移专属 crosswalk 表、严格审计对应 source snapshot sha256 和 payload hash；不得用接口新建 UUID 代替完整关联链。对同一源快照重跑需幂等、对不同快照与字段不匹配应拒绝。
4. 每一批写入必须使用一个事务，失败全量 ROLLBACK；写后逐条校验所属用户、目标关键字段、源哈希；跨员工默认禁止访问。不存在的 API 行为不可标记迁移完成。
5. 所有运行、定时任务、外部副作用默认不执行；任何不明外部写结果禁止重放。知识库未正式转换文本与向量前，不得宣布 RAG 已迁移。
6. 子任务 Agent 不得同时编辑共有文件，不得 `git init`、`git push`、Docker Compose up、安装依赖或上线；报告本人更改路径、已执行测试、阻断和事实依据。
7. 最终 **GO 前提**：真实 PG17 TCP 多连接与权限隔离、原系统数据差异对账、正式身份/团队 RBAC、KB/Workflow/调度功能等价性、备份恢复和回滚演练逐项通过。暂维持 NO-GO。

## 集成与验收顺序

先并行完成 W1/W2/W3/W4 的独立模块并单独运行 PGlite/静态测试；之后由集成负责人统一核查 PostgreSQL 版本依赖、合入初始 schema 的新表和 RLS、冻结兼容性契约，执行所有 PG API、原系统、构建、灰度入口和 CI 配置测试。只有完成以上并在独立真实 PG17 环境运行才能开始有批准的真实数据试迁移；正式切换另行审批。
