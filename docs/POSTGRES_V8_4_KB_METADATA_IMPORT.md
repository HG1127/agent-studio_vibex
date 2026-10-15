# Agent Studio V8.4 W2 — PostgreSQL 知识库基础数据迁移

**仅供隔离 staging 测试，生产状态 NO-GO。未执行真实公司数据迁移。**

## 已实现的受限能力

- `services/pg-api/src/stage-knowledge-base-import.ts`：将原 PocketBase `agent_studio_kb_bases` 中的旧文本 ID、所属员工 ID、名称、描述和毫秒级时间戳按**严格保真规则**转换至 PostgreSQL `agentstudio.knowledge_bases`。仅允许**没有任何文档、分片、Embedding、向量、授权共享、相关索引队列**的知识库。
- `services/pg-api/src/stage-knowledge-base-import-cli.ts`：`--plan` 仅读取经 SHA-256 manifest 验证、完整性检查通过的 SQLite 离线备份和已审阅的 `studio-approved-identity-map-v2` 映射；不能访问生产 PocketBase，也不连接 PostgreSQL。报告仅包含可迁移数、阻断类型与数量，不输出正文/密钥/员工ID。
- `db/postgres/migrations/pg_v8_007_legacy_kb_import.sql`：阶段专用旧 KB ID→PG UUID 交叉映射。采用 PostgreSQL RLS 强制隔离并禁止应用 API、Worker 访问。确保增量 SQL 按规定进入只用于隔离 `agentstudio_stage` 的迁移轨道。
- 迁移执行前校验数据库名 `agentstudio_stage`、管理员账号、PostgreSQL 17、无队列执行任务、没有未追踪的知识库、目标用户 UUID 已预配。整个批次在一次事务内写入并逐条做 SHA-256 对账。出现任何冲突或单行写入失败则全部回滚；同一快照可重复安全复核，跨快照复用拒绝。
- `deploy/postgres-staging/stage-knowledge-base-import.compose.yaml`：需要**额外指定 profile 才会存在**的一次性导入容器，仅 `private_db` 内部网络、只读快照、密钥通过独立文件挂载、没有公网端口。

## 测试边界

`pnpm --dir services/pg-api run test:stage-kb-import` 涵盖 PGlite PostgreSQL SQL 引擎 + 合成 SQLite 快照：成功导入/重放、RLS 不越权、故障整批回滚、验证快照 SHA、缺失员工映射、正文/向量/共享权限阻断与无凭据日志。Compose 已经过 `docker compose config --quiet` 静态语法校验，但**未启动 Docker Engine，更没有实测 PG17 TCP 连接**。

## 使用阶段

1. 先取得运维批准的、通过 `ops/sqlite-backup.mjs` 创建的一致性备份以及审核后的身份映射。严禁导入仍在运行的 `pb_data`。
2. 离线查看可迁移量：`node --experimental-strip-types services/pg-api/src/stage-knowledge-base-import-cli.ts --plan --snapshot SNAPSHOT --manifest SNAPSHOT.manifest.json --mapping APPROVED_MAPPING`。
3. 如果报告存在 blocked_bases，**整批不得执行**，先实现相关数据迁移。特别是旧系统 RAG 向量、文档文本和共享权限均未由本模块处理。
4. 仅在公司批准的**独立 PG17 stage**、审阅迁移 SQL 后才可启用 Compose overlay 进行一次性导入，生产部署/切换另行批准。

本模块不包含知识库文件、文档分片、向量索引、团队共享或模型连接的完整迁移，也不能视为原知识库助手的检索功能已经切换至 PostgreSQL。
