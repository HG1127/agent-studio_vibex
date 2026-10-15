# V8.6 — 非空知识库原子试迁移命令行入口

**只允许新建的隔离 PostgreSQL 17 `agentstudio_stage`。正式上线始终 NO-GO。** 此工具不会修改旧 PocketBase；不会启用 RAG、共享权限、定时任务或模型调用。

## 这次消除的阻断

原 `stage-knowledge-base-import` 出于防止信息丢失，仅允许空知识库配置；旧有文档、分片或向量时拒绝导入。新 `importKbSnapshotAtomic` 要求 `loadKbContentSnapshot` 从**同一份经 SHA-256 验证的离线 SQLite 快照**签发不可伪造的内存计划，在**单一数据库事务中**完成知识库元数据（W2）及原始文档、分片、向量（W6）的冻结归档。若一处写入失败，两部分均回滚。

## 已交付的执行入口

- `services/pg-api/src/stage-kb-atomic-import-cli.ts`：严格参数解析和已授权身份映射的源数据验证，`--plan` **完全不连接 PostgreSQL**。只输出快照 SHA、涉及内容的知识库数量、文档/分片/向量记录数及明确禁用的运行能力；不输出账号 ID、原文、向量内容、密钥或文件目录。
- `services/pg-api/tests/stage-kb-atomic-import-cli.test.mjs`：纯合成 SQLite 快照，测试离线计划、隐私保护、禁止误连生产库、快照损坏时 fail-closed、空内容切换到 W2 元数据导入器。
- `deploy/postgres-staging/stage-kb-atomic-import.compose.yaml`：额外挂载**仓库以外**的三份经审核只读文件，使用 staging 的 Docker secret，单次执行、只有 `private_db` 内网、没有公网端口，必须手动添加 `--profile stage-kb-atomic-import`。单独 `compose.yaml` 不自动启动本工具。

只有在审批、冻结快照、身份一一映射均完成后，才可在离线环境执行：

```bash
pnpm --dir services/pg-api run stage-kb-atomic:plan --snapshot /approved/backup.sqlite --manifest /approved/backup.sqlite.manifest.json --mapping /approved/identity-map.json
```

该命令不需要 PostgreSQL 连接；路径必须是**经授权的离线快照**，不是仍在运行中的 PocketBase `pb_data`。

在隔离 PG17 环境中进行真实合成数据 / 经授权数据导入，需要运维首先核对目标库为全新独立 `agentstudio_stage`，有 `pg_v8_007`、`pg_v8_010` 迁移及专用 DBA 角色；通过明确的环境开关 `AGENT_STUDIO_PG_STAGE_KB_ATOMIC_ENABLED=true` 后才会允许 `--execute`。不得将可执行开关写入通用服务器 `.env` 或添加到 Web/API 服务。

## 验收与不足

- 导入完成后必须核对 W2 `legacy_knowledge_base_imports`、W6 `legacy_kb_document_archive`、`legacy_kb_chunk_archive`、`legacy_kb_vector_archive` 的相同源哈希、行数和 owner 对应关系。
- 原向量 `vector_json` 保留原始数据，不自动转换为新的固定 `vector(1536)` 或重新生成 Embedding；不能据此声称搜索索引就绪。
- 旧知识库共享 ACL、Embedding 队列、模型连接内容、实际文件二进制、跨库用户历史并未自动启用或完成完整语义迁移；真实 RAG 验收另行进行。
- 用同一快照重试必须幂等；不同快照、缺 owner 映射、内容不一致、源存在 sidecar 或不受支持字段时一律阻断。
- **真正 PostgreSQL 17 TCP / CI 环境目前受 GitHub 账号 Billing 运行器限制；本机 Docker Engine 不可用。** 只能宣称合成 SQLite/PGlite 单元测试通过，不得宣称已经执行过真实业务数据导入。

原系统和宝塔生产数据库继续不动，正式切换 **NO-GO**。
