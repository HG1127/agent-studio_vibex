# Agent Studio — PocketBase → PostgreSQL 数据迁移门槛与剩余工程量

**正式生产切换：NO-GO。** 所有步骤必须先在隔离开发或全新 staging 数据库验证；不得修改公司宝塔正式数据库、原 PocketBase 运行数据及当前生产 Worker。本文件是基于目前源码的工程现状，不是已完成生产数据迁移的声明。

## 当前状况

| 领域 | 已实现并有测试 | 尚缺失或未核验 |
| --- | --- | --- |
| PG17 | PG Schema/RLS/pgvector、V8.2 SQL 增量、嵌入 PostgreSQL 引擎测试 | 真正 PG17 Docker/TCP 并发 CI 没有实际执行 |
| Agent | 原子任务领取、租约、准备、审批、模型文本调用、结果持久化、未知外部调用不重放 | 完整 Agent 工具/成本预算/异常审批复核运营 |
| Workflow | 创建/更新安全节点和连线骨架 | 与旧 Workflow 执行语义、真实运行引擎不一致 |
| 知识库 | 私有元数据、受限文档导入、关键词搜索 | 旧知识库向量、Embedding、模型连接及共享 ACL 迁移 |
| 身份/团队 | PG 经签名 OIDC + owner-only RLS | 正式员工登录/Provisioning、团队 RBAC、PB 文本 ID 到 PG UUID 映射 |
| 历史和基础数据 | SQLite 一致性备份与只读盘点、经批准的员工身份映射审查、首批严格兼容 Agent 配置的 stage-only 事务导入和旧 ID crosswalk（合成测试通过） | 尚未对真实数据导入；其余业务域 ETL、增量同步和正式切换回退演练未完成 |

旧 PocketBase 文本 ID 与 PG UUID 不同；旧 Agent 配置和 Workflow Graph 可能包含新 API 白名单之外的参数；旧向量可能不匹配目前的样板 1536 维。这些都是**不允许直接复制数据库或静默丢弃字段**的原因。

## 本轮新增迁移前置能力

- ops/pg-migration-readiness.mjs：仅分析由备份工具生成并经 SHA-256 校验的冻结 SQLite snapshot，不触碰运行中的 pb_data。核查 SQLite 完整性、原始备份 manifest 记录数、每个表的行数及分域映射阻断。识别账户、配置、运行历史、知识库、定时任务、协作、模型/工具凭证和不认识的表。报告不包含旧用户 ID、提示词、密钥或原始文件路径。不会连接或写入 PostgreSQL；ready_for_production_cutover 永远为 false。
- ops/pg-identity-map-audit.mjs：针对同一份备份 SHA-256 固定的、人工审批的 studio-approved-identity-map-v2 用户映射文件，检查每个员工是否有唯一目标 UUID，以及旧业务表出现的 owner/member ID 是否全部有来源。不能自动猜测同一用户，不能复用不同快照的映射，也不会声称 OIDC 用户已经真实建立。
- tests/pg-migration-readiness.test.mjs、tests/pg-identity-map-audit.test.mjs：使用纯合成 SQLite 数据验证上述安全行为，纳入根目录 pnpm test。

## 只在授权隔离环境中运行

必须先由运维批准并生成一致性 WAL 安全快照，不应手工复制正在写入的 data.db。命令模板中的所有尖括号参数都需要替换为本地安全路径：

    pnpm db:backup backup --source SNAPSHOT_APPROVED_SOURCE --output SNAPSHOT_DESTINATION
    pnpm db:backup verify --backup SNAPSHOT_DESTINATION
    pnpm db:pg-readiness --snapshot SNAPSHOT_DESTINATION --manifest SNAPSHOT_DESTINATION.manifest.json

可加 --strict 使存在数据但尚未经批准映射的业务表返回非零退出码；可加 --output REPORT_PATH 创建权限受限且不能覆盖旧文件的去标识化报告。

单独的身份映射文件（含敏感 ID，必须保存在源代码库、日志和聊天记录之外）需要如下结构：

    {
      "schema_version": "studio-approved-identity-map-v2",
      "source_sha256": "由已验证 manifest 提供的 64 位 SHA256",
      "records": [
        {
          "old_id": "经审核的旧 PB studio_users.id",
          "new_studio_user_id": "经审核的 PG UUID",
          "verified_by": "审核人员身份或角色",
          "approved_at": "2026-10-15T00:00:00Z"
        }
      ]
    }

    pnpm db:pg-identity-audit --snapshot SNAPSHOT_DESTINATION --manifest SNAPSHOT_DESTINATION.manifest.json --mapping REVIEWED_MAPPING_FILE

身份映射工具仅检查结构和覆盖率；不能证明真实员工身份或新 OIDC 账户已正确预配。原系统的密码哈希、模型 API Key、第三方 token、插件凭证均应在新系统重新预配/轮换，不能直接复制。

## 下一步必须顺序推进的关键路径

1. 获得审批后的真实备份并运行盘点，确认表数、行数、关系数和无损字段映射；目前真实源数据规模未知。
2. 在真正 PostgreSQL 17 独立 CI/测试库执行多连接、多 Worker 并发、真实角色、RLS 及崩溃隔离验收。目前仅 CI 代码已准备，不是通过结果。
3. 首批 Agent 配置已具备受限离线 extract → 已批准 ID crosswalk → stage-only 事务型 import → 行级哈希核对（参见 POSTGRES_V8_3_STAGE_AGENT_IMPORT.md），但**尚未在 PG17 或真实业务快照上执行**。继续扩展不兼容 Agent 字段的保真迁移，以及 Workflow/KB/历史事件的功能等价性迁移，不能只迁移骨架就认为完成。
4. 正式员工 OIDC、团队权限、任务审批、知识库索引、调度 Worker、密钥重置与费用限额补齐。保证老系统不会和新系统同时处理同一外部写任务。
5. 再进行备份还原、切换演练、回滚、禁用员工及跨租户验证、业务负责人验收，所有重要记录对账通过才允许 GO。

## 条件性工程量估算（非交付时间承诺）

在熟悉代码的 1–2 位开发人员、授权验证快照、持续可用 PG17 隔离环境和身份服务均到位、业务数据量中小且无严重结构冲突的前提下：

| 工作项 | 大致工程工作量 | 可否现在开始 |
| --- | --- | --- |
| 冻结快照/离线表盘点和身份核对 | 1–3 个工程人日 | 代码就绪，须获授权真实快照 |
| 首批非敏感 Agent 配置 ETL、UUID 映射和对账 | 仍需实测、扩展和修复不兼容记录，约 2–7 个工程人日（初估） | 受限 importer 和合成 SQL 测试已完成；PG17 真机、真实备份、人员映射尚缺 |
| Workflow、知识库/向量、任务历史、定时任务、协作权限及运行功能补齐 | 10–20 个工程人日 | 尚未完成 |
| PG17 真机并发/正式身份/容灾备份与回滚演练 | 5–10 个工程人日 | CI 代码就绪，真机结果未得 |

这些阶段存在依赖和部分并行空间，但**当前不是只差一次数据库连接切换**。作为项目级参考，要求旧系统所有核心功能与数据保持一致的正式迁移，应按多周完整工程项目评估；初次小范围隔离数据导入则可以更早单独验收。取得真实快照报告后，才能把上述范围收敛为可信的更精确计划。

## GO 签收硬条件

源快照可还原；源/目标数据行数、主键映射、外键及关键字段对账通过；所有机密凭证经独立轮换；OIDC 和员工授权/团队 RLS 实测通过；旧运行、外部写入与审批历史可复核，未发生双 Worker 重放；PG17 TCP 和异常恢复测试通过；Workflow、知识库、日程在真实业务中验收；监控、备份、回滚预案、负责人签收俱全。

**项目生产状态继续 NO-GO。**
