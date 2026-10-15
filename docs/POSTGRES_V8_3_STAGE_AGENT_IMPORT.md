# Agent Studio V8.3 — 第一批 Agent 配置事务迁移（隔离 PostgreSQL）

> **生产状态 NO-GO。** 本阶段第一次实现 PocketBase 离线快照 → PostgreSQL agent_specs 的受限数据导入代码，但尚未在真实 PostgreSQL 17 或真实客户数据上执行。只支持严格验证可无损映射的一小部分 Agent 配置，绝不是所有数据和功能已经迁移。

## 已实现

- services/pg-api/src/stage-agent-import-cli.ts：独立一次性进程，无 HTTP 路由。读取离线 SQLite 快照、SHA-256 manifest、经人工批准且绑定该 SHA 的 v2 员工 ID→PG UUID 映射。默认 --plan 时**完全不连接 PG**； --execute 必须额外开启环境授权。对不兼容记录仅输出**错误类别与数量**，不输出账号 ID、Prompt、密钥或文档文本。
- services/pg-api/src/stage-agent-import.ts：严格复核原 Agent 的完整 JSON。仅在以下条件下可导入：保留全部 goal/task_scope/deliverables/task_plan/done_criteria/tools/knowledge_base_ids/require_approval 字段；知识库关联必须为空；审批必须显式为 true；工具在 V8 allowlist 中；字符串、数组和时间戳无须隐式修改；source 和 template_key 均为空。新增字段、带知识库引用、老版审批关闭、被修剪的字符串、未知工具、无效时间戳一律阻断，不截断、不静默更换。
- db/postgres/001_stage_schema.sql 新增仅迁移管理员可见的 legacy_agent_imports crosswalk 表；db/postgres/migrations/pg_v8_005_legacy_agent_import.sql 用于已经存在的隔离 stage，设有数据库名检查及幂等迁移。生产 API 和 Worker **没有访问该 crosswalk 的权限**。
- 在一个数据库事务内：检查数据库确切名称、版本 PG17、admin 登录、迁移版本和无活跃任务；检查员工 UUID 必须已经在 stage PG users 中预配，不自动建立身份；拒绝已有的未追踪 Agent；插入每条安全 Agent spec 和映射行；回读所有字段、时间戳及 SHA-256 对账后才 COMMIT。任意一行出错会全部回滚。相同原始快照重复执行只复核而不重复创建；不同快照和篡改后的配置被拒绝。
- deploy/postgres-staging/stage-agent-import.compose.yaml：需要单独启用的 isolated Docker Compose overlay，额外挂载源码**外部**的快照、manifest、身份映射文件作为只读卷，并通过既有 staging postgres_password Docker Secret 访问仅内网的 PG 服务，进程不暴露端口、不接入外网。
- tests/stage-agent-import.test.mjs、tests/stage-agent-import-cli.test.mjs：PGlite PostgreSQL SQL + mock 角色守卫和纯合成 SQLite 数据，覆盖迁移、重复执行、回滚、跨用户隔离、非兼容字段、备份篡改、未知数据库及敏感信息不输出。

## 操作与权限边界

以下操作仅适用于经批准的**一次性隔离测试环境**，且需要 DBA 预先备份、应用最新 SQL、人工预配与经批准 ID map 匹配的 PG users；不能把旧 PocketBase token、密码哈希或模型 Key 直接复制过去。

本地只做 **Plan**，不连接 PostgreSQL：

    node --experimental-strip-types services/pg-api/src/stage-agent-import-cli.ts --plan --snapshot SNAPSHOT.sqlite --manifest SNAPSHOT.sqlite.manifest.json --mapping APPROVED_IDENTITY_MAP.json

报告中的 compatible_records=1 只表示有 1 条可转换记录；不代表数据库已写入。若存在不兼容记录，返回码 2，所有记录禁止整批执行。

真正导入仅推荐使用受控隔离环境，且在 stage 使用 pg_v8_005 或包含该表的全新 001 schema。在 Compose 项目上下文中准备以下**外部文件**：

- AGENT_STUDIO_STAGE_IMPORT_SNAPSHOT_FILE — 只读 SQLite 一致性备份
- AGENT_STUDIO_STAGE_IMPORT_MANIFEST_FILE — 与快照对应的 SHA-256 manifest
- AGENT_STUDIO_STAGE_IMPORT_MAPPING_FILE — 由人工审核通过的 v2 用户映射
- 既有 AGENT_STUDIO_STAGE_DB_PASSWORD_FILE — 受控隔离数据库 Secret

在部署审核之后额外加载 base Compose 与 stage-agent-import.compose.yaml，明确启用 stage-agent-import profile，仅执行一次性导入容器；不要在宝塔正式服务器运行、不要顺带启动 model_worker 或 prepare_worker。Docker bind-mounted 文件须允许容器内非 root 账户读取；源文件不要放入 Docker 镜像、Git 仓库、VibeX ZIP 或聊天附件。

⚠ PG 内已经存在的历史配置未纳入 crosswalk 时会拒绝导入。该导入器没有迁移模型凭证、知识库文档、向量、Workflow、定时任务、运行历史、团队权限或旧员工登录。正式执行前需要已经进行完整的身份核验和授权。

## 本地验收

    pnpm --dir services/pg-api run check
    pnpm --dir services/pg-api run test:stage-agent-import
    pnpm --dir services/pg-api run test
    pnpm check

测试不连接公司服务器、旧系统运行库或任何外部模型端点。真正 PostgreSQL 17 TCP 多连接和合成数据迁移仍需要独立 CI job 或经运维审核的隔离 PG17 环境执行；因此只凭这里的 PGlite 通过不能宣布数据库迁移完成。

## 后续关键路径

1. 在完全独立的 PG17 上运行真实 stage-agent-import overlay，验证最小权限、元数据、并发和真实日志。
2. 从经授权的 PocketBase 一致性快照分析 incompatible_records 原因分布，为 agent_specs 的 source、template_key、引用知识库和旧审批语义设计明确保真映射；禁止默认忽略。
3. 扩展对 Workflow/KB/用户/团队/定时任务/运行历史的保真迁移及旧 ID crosswalk；恢复关联和执行语义。
4. 完成 OIDC 正式员工身份、费用/配额、数据对账、备份还原、并行期防重放和生产回滚演练，批准后才允许正式切换。

**此阶段是受限第一批数据迁移引擎通过合成测试，不是已执行的真实数据迁移。生产 NO-GO。**
