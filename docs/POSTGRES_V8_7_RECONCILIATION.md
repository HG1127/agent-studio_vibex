# W9 — 迁移后的只读阶段对账器（最小关键域交付）

生产与切换状态保持 **NO-GO**。本模块只完成 `agent_specs` 配置域的源记录 → crosswalk → 目标记录逐行校验和与数量对账。其他域显式输出 `unsupported` 或 `failed`，不能将数量相同、归档存在或单个域成功解释为迁移完成。

## 独立入口与输入

对账库入口为 `services/pg-api/src/stage-reconciliation.ts` 的 `reconcileStage(input, pool)`（函数本身没有 CLI、HTTP、Worker 或凭证/连接池构造）。新增 `services/pg-api/src/stage-reconciliation-cli.ts` 作为**独立、显式启用**的受限离线入口，默认 `--plan` 不连接数据库。`--execute` 仅连接 `agentstudio_stage`，设置 PostgreSQL 连接默认只读、在真实 PG17 内执行只读事务，不挂接业务 HTTP/API Worker。

`input` 包含三个离线文件名 `snapshot`、`manifest`、`mapping`，以及 `approval: {source_sha256, approved_by, approved_at}`。文件名只用于内部读取，不进入结果。approval 是操作员提供的已有审批证据，并非身份认证、自动审批或密码学签名验证；调用方须从可信审批流程提供它。本模块不能证明审批人真实身份，也不会签发或激活员工身份。

- SQLite：只读打开冻结备份，拒绝解析后的任意 `pb_data` 目录及 WAL/SHM/journal sidecar；执行 `quick_check`。绝不读取正式 PocketBase/BaoTa。
- manifest：沿用 `agent-studio-sqlite-snapshot-v1`，要求 `sha256`、`bytes` 和 `tables`。以流式 SHA256 核验整个 SQLite 文件，对 manifest 列出的每个表核验数量，域表存在却未列入 manifest 时拒绝。
- mapping：沿用 `studio-approved-identity-map-v2`，必须绑定同一 `source_sha256`，每条包含 `old_id`、`new_studio_user_id`、`verified_by`、UTC `approved_at`；完整覆盖源员工 ID，拒绝源/目标身份重复。员工表只读 `id`，不读取密码哈希。
- manifest/mapping 各限 5 MB；各域源表最多 100000 行。对账前后重新计算三个文件哈希并检查 sidecar，任何变更均作整批失败处理。文件批准应由离线权限和冻结流程保障；这不是抗恶意主机的文件锁或可信执行环境。

SQLite 校验失败发生在 PG 连接获取之前。不会根据旧 UID 猜测员工身份。未实现域只检查表结构和数量，不读取源文档、运行内容或模型配置。

## 独立执行命令与安全输出

`--plan` 仅核验经授权的离线快照、SHA256 manifest、审核后的 UUID 映射与**额外审批文件**，输出每个源域的记录数，绝不向 PostgreSQL 建立连接：

```bash
pnpm --dir services/pg-api run stage-reconciliation:plan --snapshot SNAPSHOT.sqlite --manifest SNAPSHOT.sqlite.manifest.json --mapping REVIEWED_MAPPING.json --approval REVIEWED_APPROVAL.json
```

审批文件含同一 `source_sha256`、`approved_by`、UTC `approved_at`，必须由安全负责人在仓库之外保存。该工具只能核验文件结构，不能自动证明真实审批人的身份。

`--execute` 必须另行设置 `AGENT_STUDIO_PG_STAGE_RECONCILIATION_ENABLED=true` 且由受限部署方提供固定的 PG17 staging 主机、数据库、管理员账号及独立密码文件。独立 Compose overlay 为 `deploy/postgres-staging/stage-reconciliation.compose.yaml`，显式 profile `stage-reconciliation`、四份只读文件挂载、私有 Docker 网络、不发布端口。只在运维审批、隔离备份与只读执行权限确认之后使用，**不得在公司宝塔生产服务器运行**。

CLI 返回 `plan_only / source_inventory_only`（未执行目标对账）、`execute_read_only / not_ready_for_cutover`（存在失败或未实现域；退出码 2）或硬失败。不能因为文件通过离线盘点而把业务切换为 GO。即使某个严格子域成功，完整迁移仍然 NO-GO。

## PG 防误连与只读边界

专用连接首先开启 `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY`；随后只执行固定表名的 SELECT，结束始终 `ROLLBACK`。没有 INSERT、UPDATE、DELETE、DDL、GRANT、导入调用、任务领取或外部模型请求。

连接内独立要求：

- `current_database() = agentstudio_stage`；版本号为 170000–179999。
- `session_user = current_user = agentstudio_admin`，且管理员 superuser 属性为 true。这个现有管理员角色用于读取强制 RLS、无策略的迁移专用 crosswalk；本模块的事务仍必须为只读。API/Worker 角色一律拒绝，不向任何角色新增授权。
- `transaction_read_only = on`。拒绝被降级的事务或切换后的角色。
- jobs 表/status 字段存在，`queued` 和 `leased` 数量均为零。缺失、查询失败或活跃任务均阻断。

模块不配置 host/port，也无法在连接建立前辨别远端主机。调用方必须事先确保连接池指向已批准的隔离本地 stage；不能把一个任意生产连接池交给模块再依赖 SQL guard。数据库名、版本、角色校验不是服务器真实性证明。本次测试使用内存 PGlite，无 TCP 连接。

## 真实表契约与支持范围

已阅读 v8_005–v8_012 migration SQL 和对应导入器；使用以下实际表名、source 分域与真实字段，不假设归档已进入 live 表。各域要求对应 `schema_migrations` 版本及实际字段存在；缺表/字段不通过。协作表分别按 `source_table` 统计，不把六张源表折成一个总数。

| 源域 | PG migration / 目标证据 | 本次对账范围 |
| --- | --- | --- |
| studio_users | v8_011 `legacy_user_imports` | 数量、快照、审批 crosswalk、禁用身份；员工档案/IdP payload 全量校验 **unsupported** |
| agent_specs | v8_005 `legacy_agent_imports` + `agent_specs` | **完整支持当前严格配置子集**；详见下文 |
| workflows | v8_006 `legacy_workflow_imports` | 数量、快照、字段与 `execution_enabled`；graph/source_record/live 投影校验 **unsupported** |
| agent_studio_kb_bases | v8_007 `legacy_knowledge_base_imports` | 数量、快照、字段；元数据/live 与团队权限校验 **unsupported** |
| agent_studio_kb_documents | v8_010 `legacy_kb_document_archive` | 数量、快照、字段；raw_payload 的字节哈希/父关联校验 **unsupported**，归档不等于 RAG |
| agent_studio_kb_chunks | v8_010 `legacy_kb_chunk_archive` | 同上，含 `legacy_document_id` 字段要求；**unsupported** |
| agent_studio_kb_vectors | v8_010 `legacy_kb_vector_archive` | 同上，真实 legacy_id 是 chunk_id；**unsupported** |
| agent_studio_schedules | v8_008 `legacy_schedule_imports` | 数量、快照、字段与执行标记；projection/quarantine/live 调度等价校验 **unsupported** |
| agent_studio_spec_access | v8_009 `legacy_collaboration_imports` | 独立分域数量/快照及禁用标记；**archive only / unsupported** |
| agent_studio_kb_access | 同上 | 同上 |
| agent_studio_spec_proposals | 同上 | 同上 |
| agent_studio_kb_access_events | 同上 | 同上；不能称审计已迁移 |
| agent_studio_spec_collab_audit | 同上 | 同上；不能称审计已迁移 |
| agent_studio_spec_revisions | 同上 | 同上 |
| agent_runs | v8_012 `legacy_run_history` | 数量、快照、字段与 `executable`；source_record/审批/引用/历史证据校验 **unsupported**，不等于 live runs |
| audit | `audit_events` | 只读数量与 owner/actor 存在性；没有源审计完整 crosswalk，始终阻断完整迁移结论 |

未实现域只读取 crosswalk 的结构、关联和安全标记，不读取 `source_record`、`archive` 或 `raw_payload`。它们的字段校验和、投影校验和与跨资源/跨员工关联**没有完成**；即使数量相符也固定带 unsupported 阻断。任何未知/未映射源字段都不能因此获得成功结论。协作权限、知识内容和历史运行的归档均不能授权上线。

Agent 配置域：

1. 要求源字段 `id/rh_user_id/name/spec/created/updated`，只允许额外已知 `source/template_key`；未知字段（即使为空）阻断。复用纯函数 `normalizeLegacyAgent`，非空旧 source/template、未知 spec 字段、未支持工具、KB 绑定、时间/规范化损失均阻断。
2. 每条源记录必须恰好匹配一条 `legacy_spec_id` 和一个 `target_spec_id`，crosswalk 与目标 owner 必须等于审核映射目标 UUID，目标必须 `requires_approval=true`。
3. 目标 owner 必须是 disabled 员工，并有 v8_011 同快照、同 mapping 文件 SHA256 的唯一已审核 user crosswalk，`active_automatically=false` 且 reviewed_idp_sha256 合法。active 员工不会被本模块当作自动批准；完整身份/IdP 对账仍 unsupported。
4. 对源规范化 payload、crosswalk 的 `payload_sha256`、从目标字段重建的 payload，逐行比较 SHA256，再比较表级排序哈希集合的 SHA256。不是只比较数量或只信 crosswalk 自报哈希。重建包含 legacy ID、owner、name、spec 和创建/更新时间。
5. 检查源/crosswalk 数量、目标 live 数量、未跟踪目标、重复 target、混合快照和关联异常。孤儿、跨员工引用或错误审批均失败。

## 输出与消费规则

返回 JSON 可序列化的结果数组，每行只包含以下六个字段：

```json
{"domain":"agent_specs","source_count":1,"target_count":1,"blockers":[],"association_anomalies":0,"status":"success"}
```

`source_count` 是 SQLite 源表数；Agent 的 `target_count` 是目标 live 表总数，其余为对应 crosswalk/归档域总数（包括其他快照，随后会报告 mixed_snapshot）。未知数量用 null，绝不把缺表当零。`association_anomalies` 是本次已执行关联检查发现的异常记录数，**0 不代表未实现的关联检查已通过**。

`success` 仅指该域已实现的完整检查；`unsupported` 表示固定未实现范围；结构/数量/快照/关联等检查有异常则 `failed`。前置校验、SQL 失败、输入变化或只读清理失败返回单一 `preflight` 失败行，不能保留先前域成功作为有效结果。一般驱动/文件异常统一为固定错误码，不回传原始异常文本。模块本身不打印日志，结果不含旧 UID、新 UUID、审批人、prompt、文档内容、模型密钥、文件名、原路径或哈希。

调用方只能在**所有必需域 success** 时考虑“该范围对账成功”。本版本固定含未实现域和审计阻断，不能得出全量通过；不能从 Agent 成功推出 API/Worker/团队 RBAC/RAG/调度可用或生产 GO。

## 合成验证

直接运行（无需改 scripts）：

```text
pnpm --dir services/pg-api run test:stage-reconciliation
node --experimental-strip-types --test services/pg-api/tests/stage-reconciliation.test.mjs
node services/pg-api/node_modules/typescript/bin/tsc -p services/pg-api/tsconfig.json --noEmit
```

Windows 默认临时目录不可写时，将进程 TEMP/TMP/TMPDIR 指向项目盘上专用可写临时目录。测试仅创建和清理自身 `w9-synthetic-*` 目录；不删除其他文件。

合成测试覆盖（对账库 7 项，CLI 4 项）：Agent 正常逐行哈希/表级对账；数量不符；混合快照；目标 payload 篡改；跨员工 owner；未审批身份；错误数据库/版本/角色/只读状态；active jobs；缺表、缺字段、未知字段；manifest SHA/数量错误；WAL；缺审批；输入中途变化；驱动错误脱敏；团队权限归档异常；审计与非完整域阻断。PGlite 内存数据由测试单独构造，SQLite 是临时合成库；fixture 外不调用导入器。对账期间拦截 fetch、TCP connect 和 UDP send，断言零外部请求，检查 SQL 仅 SELECT/只读 BEGIN/ROLLBACK，以及目标数据不变。

PGlite 测试对数据库名/版本/角色返回合成 guard，不能证明真实 PG17 TCP、superuser 只读事务或生产隔离。真实 PG17 验证和完整公司数据差异对账均未执行。本任务限定只用合成 SQLite/PGlite，因此没有运行会启动 PocketBase 的项目 E2E；没有触碰 BaoTa、正式 PocketBase 或公司数据。
