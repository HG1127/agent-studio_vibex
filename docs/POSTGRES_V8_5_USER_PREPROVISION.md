# Agent Studio V8.5 — PostgreSQL 员工身份预配（默认全部禁用）

**状态：staging-only / 生产 NO-GO。** 此模块只是为后续旧 PocketBase 数据保持归属关系建立员工 UUID。**既不迁移原密码，也不启用员工登录，更不构成真实 OIDC 认证已验收。**

## 数据流程

- `services/pg-api/src/stage-user-import.ts` 从冻结的 SQLite 快照读取 `studio_users.id`，核验 SHA-256 和 manifest 行数；同时核对经人工审核的旧 ID → PG UUID 映射及**独立审核**的 OIDC issuer/subject 列表。缺任何一个旧员工、重复 UUID、重复 OIDC subject、快照不一致均拒绝。
- 员工不会自动配发访问凭证：写入 PostgreSQL `agentstudio.users` 时 `status='disabled'` 且 `display_name=''`。仅管理员才能通过另一个有审核记录的正式身份预配流程逐个确认真实 IdP 身份及激活；本模块不会自行激活。
- `db/postgres/migrations/pg_v8_011_legacy_user_provision.sql` 创建管理员专用旧 UID→PG UUID、源哈希和两份审核文件哈希的 crosswalk。普通 API/Worker 禁读，强制 RLS 且不开放任何身份数据。
- `provisionDisabledStageUsers` 先核验精确数据库名 `agentstudio_stage`、PG17、DBA 会话、无正在执行的队列任务以及没有未跟踪员工。每个账号与映射在同一事务内写入、回读核对；失败整批 ROLLBACK，相同文件重跑幂等，其他快照/审核文件冲突阻断。
- `services/pg-api/src/stage-user-import-cli.ts` 默认采用明确 `--plan` 模式，**不连接数据库**；`--execute` 仅允许设置 `AGENT_STUDIO_PG_STAGE_USER_IMPORT_ENABLED=true`，且只接受隔离 stage PG host/database/admin、外部密码文件。结果仅报告人数和禁用状态，不打印员工 ID、OIDC subject、历史密码哈希或审核文件内容。
- `deploy/postgres-staging/stage-user-import.compose.yaml` 是显式 profile 的一次性导入容器，不开公网端口；四份输入文件均从源码仓库以外的受控目录只读挂载，数据库口令通过 stage Docker Secret。

## 供经批准的 staging 环境准备审核材料

一致性备份必须由 SQLite backup API 创建并经过 hash 验证，不能复制在写入中的 WAL 文件。第一个文件格式为项目已有的 `studio-approved-identity-map-v2`，由公司安全负责人确认旧 ID 与新的 UUID 一一对应。

第二个文件为 `studio-reviewed-oidc-provision-v1`，每条仅包含：
`old_id`、`new_studio_user_id`、`external_issuer`（HTTPS OIDC issuer）、`external_subject`、`reviewed_by`、`reviewed_at`（UTC ISO8601）。顶层还需要 `source_sha256` 且和备份 manifest 完全一致。**文件名、正文和任何包含员工标识的内容均不得上传公开 GitHub、VibeX ZIP、聊天或 CI 日志。**

运行本地离线计划：

```bash
node --experimental-strip-types services/pg-api/src/stage-user-import-cli.ts --plan --snapshot SNAPSHOT.sqlite --manifest SNAPSHOT.manifest.json --mapping REVIEWED_ID_MAP.json --oidc REVIEWED_OIDC.json
```

输出不会包含员工 ID 或个人资料。真正执行前须由 DBA 在新建 PG17 stage 上核对空库状态、备份并明确授权，只有增加 `--execute` 与专用环境开关才会尝试创建禁用用户。本模块不包含登录激活工具，也不具备独立验证 IDP 声明的能力；`reviewed_by` 仅代表输入审核记录，**不等于核实过真实 IdP 的签名证明**。

## 已实现的验证及仍存门槛

`services/pg-api/tests/stage-user-import.test.mjs` 和 `services/pg-api/tests/stage-user-import-cli.test.mjs` 使用合成身份、PGlite PostgreSQL 与离线 SQLite 测试账号禁用、重复运行、拒绝篡改和全事务回滚。源密码哈希不会进入迁移计划或报告。**未在公司真实账号和真正 PostgreSQL 17 TCP 环境执行。**

在完成正式 OIDC 安全验证、管理员单独批准账号启用、业务归属和 RLS 对账前，所有新员工保持禁用。其他模块需要已激活的合法员工才能导入执行或协作数据，因此此阶段不解除生产 NO-GO。
