# V8.9 — PostgreSQL 17 隔离试迁移的备份恢复演练

> **生产数据库切换状态：NO-GO。** 本工具只在 GitHub-hosted Linux Runner 创建的独立合成 PostgreSQL 17 服务上执行。它不是对公司真实 PocketBase 或宝塔 PostgreSQL 的备份恢复操作。

## 用途

先由 W12 端到端试迁移测试在全新 `pgvector/pgvector:pg17` 服务中导入一名**合成员工**和一条**合成 Agent**，强制保持员工禁用、无任务、无模型连接及无外部副作用。随后本工具：

1. 在发起任何 Docker/PG 请求前核实 GitHub-hosted Runner、真实 PostgreSQL 17 合成口令、明确试验开关、回环数据库和安全 RUNNER_TEMP。
2. 只识别该 Runner 上唯一的 `pgvector/pgvector:pg17` 服务容器。用同主版本 `pg_dump -Fc` 将现有隔离 **agentstudio_stage** 备份为仅 Runner 可读的临时 archive；不会触碰现存 PocketBase 数据库。
3. 在同一个一次性测试 PostgreSQL 服务内，仅使用 `createdb` 新建 `agentstudio_stage_restore_w14`；如果同名目标已存在则严格拒绝，**不 DROP、不覆盖任何数据库**。
4. 将归档通过 `pg_restore --single-transaction --exit-on-error --no-owner` 恢复到该**新数据库**，逐表核对记录数及每张表所有行的稳定 MD5，验证强制 RLS 表数和 vector 扩展。确认原 stage 源库在全程没有改变。
5. 关闭程序前只删除本次创建、位于 RUNNER_TEMP 的 archive，恢复后的合成数据库留给 GitHub 在 Job 结束时随 Service 一起销毁，不执行手工清库。

## 安全与验收

- 独立文件：`ops/pg17-stage-restore-ci.mjs`，没有公共 HTTP/Worker 入口。
- 本地可执行的 3 项测试：`node --test tests/pg17-stage-restore-ci.test.mjs`，只验证非 GitHub 环境拒绝及脚本静态防误用；**不会启动 Docker**。
- 已在 `.github/workflows/agent-studio-quality.yml` 的 `pg17-stage-operator-isolated` 任务中作为 W12 成功后的附加步骤。该任务与其他 PG17 测试分别使用完全独立的 service。
- 真实 GitHub 验收要求同时满足 Job `success` 与日志中的固定标识：
  `W14_PG17_RESTORE_PASS isolated=true all_tables_hashed=true new_database_only=true cutover=NO-GO`。
- 失败必须阻断该 Job，不得自动重试到公司服务器、添加 `--clean`、直接恢复到源数据库或打印归档的实际内容。

**本阶段不解决的关键依赖**：企业实际 SQLite 冻结备份、生产账号 IdP 真实性/访问权限、所有业务域字段对账、旧 Workflow/RAG/共享权限等功能对等、真实生产 PostgreSQL 的恢复点目标（RPO）和恢复时间目标（RTO）、生产回滚窗口及运维授权。只有真实授权的数据和隔离试运行全部过关后，才能对正式切换做 GO/NO-GO 决策。
