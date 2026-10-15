# V8.8 — 数据库迁移执行入口与安全切换门槛

**现阶段目标：可执行隔离 PostgreSQL 17 试迁移。正式生产切换：NO-GO。** 不得在公司宝塔正式服务器或现存 PocketBase 数据目录中执行本文命令。项目目前缺少经授权的公司真实 SQLite 冻结快照、真实身份审核与最终业务验收，尚不能宣布正式迁移完成。

## 关键进展

此前备份清单只包含硬编码的部分表。现在 `ops/sqlite-backup.mjs` 自动清点 SQLite 全部实际用户表（包括自定义表和员工/模型连接/知识库向量相关表），产生完整 SHA256 快照清单。清单漏表、行数不一致或非法表名均阻断验证。`ops/pg-migration-readiness.mjs` 和 `ops/pg-identity-map-audit.mjs` 同步要求完整 manifest。**旧版不完整清单不得复用，请在授权隔离环境重新生成备份与对应 manifest。** 源表中的密码、Token、模型 Key 都不会作为合法 PG 凭证迁移。

本轮额外交付：

- `services/pg-api/src/stage-domain-import-cli.ts`：将四个此前只能由代码调用的业务域（Workflow、定时任务、协作审计、Agent 历史运行）统一为 `--plan` / `--execute`。完整 SHA256 manifest + 经审核员工 ID 映射必需；旧 Workflow 和调度仅以**不可执行/禁用**状态导入，历史任务绝不重放，协作权限不生效。
- `services/pg-api/src/stage-migration-operator.mjs` + `ops/pg-stage-operator.mjs`：一条命令先完成所有已支持域的**离线预检**；全部预检无阻断后，才允许在显式授权的独立 `agentstudio_stage` 环境按身份 → Agent → Workflow → 知识库 → 日程 → 协作 → 历史 → 只读对账的顺序进行试迁移。
- `services/pg-api/src/stage-reconciliation-cli.ts` 新增独立审核过的 `--reviewed-idp` 身份映射依据，可以在 W7 实际账号 crosswalk 上进一步核验 issuer/subject；元数据/Workflow 的严格核验范围按 V8.8 扩展，非完整业务的结果仍为 blocked/unsupported。
- `services/pg-api/Dockerfile.operator` 和 `deploy/postgres-staging/stage-operator.compose.yaml`：只从 **services/pg-api** 构建镜像，构建上下文不包含 PocketBase 运行数据。私有 Docker 网络、无公网端口、外部密码文件与五份只读源证据挂载、只读文件系统、单次执行，必须显式启用 profile。
- `deploy/postgres-staging/stage-domain-import.compose.yaml`：必要时可以单域人工复核/重复执行，用同一快照做增量幂等重试。
- 新增模拟备份/角色/跨域预检/容器静态验收；真实 GH PostgreSQL 17 工具测试已存在，但这些新增 CLI/容器自身仍需通过新一轮 CI 完整测试。

## 最快可操作的第一阶段：离线验证

以下路径是占位符，必须由公司运维/安全负责人使用**获授权的数据和审核文件**替换。不要把备份、mapping、IdP subject 文件上传公开 GitHub 或发在聊天中。

1. 在批准的隔离位置用 SQLite backup API 生成一份 WAL 一致性快照，源系统运行文件保持只读，不直接复制热 WAL 文件。
2. 生成并审核与同一 `sha256` 绑定的员工旧 ID→PG UUID 映射、独立 OIDC issuer/subject 审核文件，以及单独的快照审批 JSON（含 `source_sha256`、`approved_by`、UTC `approved_at`）。
3. 先执行完全**不联网、不触碰 PostgreSQL**的预检：

```bash
pnpm db:backup backup --source APPROVED_SOURCE_DB --output NEW_OFFLINE_SNAPSHOT.sqlite
pnpm db:backup verify --backup NEW_OFFLINE_SNAPSHOT.sqlite
pnpm db:pg-readiness --snapshot NEW_OFFLINE_SNAPSHOT.sqlite --manifest NEW_OFFLINE_SNAPSHOT.sqlite.manifest.json
pnpm db:pg-identity-audit --snapshot NEW_OFFLINE_SNAPSHOT.sqlite --manifest NEW_OFFLINE_SNAPSHOT.sqlite.manifest.json --mapping APPROVED_MAPPING.json

pnpm db:pg-stage-operator --plan \
  --snapshot NEW_OFFLINE_SNAPSHOT.sqlite \
  --manifest NEW_OFFLINE_SNAPSHOT.sqlite.manifest.json \
  --mapping APPROVED_MAPPING.json \
  --oidc INDEPENDENT_REVIEWED_OIDC.json \
  --approval APPROVED_SOURCE_REVIEW.json
```

`preflight_verified` 只表示已支持的源数据映射符合**隔离试迁移**前提。命令不会连接 PG、不会启用模型或删除任何文件，报告只包含 SHA、表数、域数及错误类别，不包含真实个人 ID、原文和密钥。若出现 `preflight_blocked` 或 `backup_manifest_incomplete`，必须先完善代码/映射，不能加参数跳过校验。未知非空业务表、模型连接以及未迁移的其他域会在报告中保留阻断说明。

## 隔离 PostgreSQL 17 试迁移（需正式运维授权）

- 运维创建**可丢弃、与公司正式服务器及数据完全隔离**的 PostgreSQL 17 `agentstudio_stage`，并确认 001 基础表及 v8_006–012 跨域增量迁移、专用管理员权限已正确安装。不可使用现有 Neon 公司项目或宝塔生产库代替。
- 将隔离试验库在导入前做一次备份，记录恢复方法。所有五份源证据必须以只读方式从仓库外的受控目录挂载；只为迁移容器授权读取，不得将其加入 Docker build context 或 Git。
- 由运维配置 `AGENT_STUDIO_STAGE_OPERATOR_SNAPSHOT_FILE`、`AGENT_STUDIO_STAGE_OPERATOR_MANIFEST_FILE`、`AGENT_STUDIO_STAGE_OPERATOR_MAPPING_FILE`、`AGENT_STUDIO_STAGE_OPERATOR_OIDC_FILE`、`AGENT_STUDIO_STAGE_OPERATOR_APPROVAL_FILE` 及**现有** staging Docker secret 文件；显式叠加 Compose 的 `stage-operator.compose.yaml` 并启用 `stage-operator` profile。该服务只执行一次受限导入，不运行任何生产 Worker。
- 每个域在 SQL 中严格验证 PG17、数据库名、管理员角色、原源快照哈希、员工归属、既有 jobs 的执行状态，并在域内部完成原子事务、幂等及字段/哈希对账。运行记录和共享权限只能归档；知识库原文/向量仅冻结，不直接替换 Embedding 或开放 RAG。

**非常重要：** 该一键操作不是跨域的一个大事务。各域分别提交；如果中途失败，隔离 stage 可能是**部分迁移**。工具会明确返回 `partial_stage_must_not_switch`（非零退出码）；可以在严格相同的 SHA256 审核快照上解决问题后幂等重试，或由 DBA 恢复/丢弃此**独立**测试库。绝不自动清空、覆盖生产数据库。即使所有已支持域导入成功，W9 仍可能报告部分历史、RAG、Workflow 等尚无完整字段或业务语义对账，因此仍应保留 `NO-GO`。

## 正式切换前仍需完成

- 公司授权的真实快照 + 所有业务表/记录 ID/关联及敏感字段差异盘点（目前没有真实数据输入，无法确认无损率）。
- Workflow 真正执行语义、知识库文档检索/Embedding/共享 ACL、日程启动、团队权限、历史审批、模型及工具连接的功能等价验收；仅归档不能算完成迁移。
- 正式 IdP 签名及员工禁用/启用规则、密钥轮换、成本配额和审计。
- 在 PostgreSQL 17 **独立部署**完成真实数据导入、逐行/逐字段对账、UAT、备份还原和切换失败回滚演练；安排明确冻结写入与恢复窗口，负责人与安全/运维签收。
- 新旧 Worker 不得同时处理相同外部写任务，不能重放未知外部副作用。
- 经上述验收且完全消除 `unsupported`/核心 `failed` 状态之后，才有条件讨论生产 GO。

**本版本交付的是实际可执行的受控隔离试迁移入口，不是生产迁移已经完成。**
