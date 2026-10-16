# W27：执行租约与副作用日志的隔离审计归档

状态：仅合成 SQLite + PGlite 纵向实现。生产切换 **NO-GO**。
本次没有连接宝塔、生产 PocketBase 或公司 Neon，没有重放任何活动。
这是独立离线库，没有接入 API、Worker、统一 stage operator、package scripts 或 CI。
统一 operator 对这两张非空源表的原有阻断仍然保留，不能将本归档视为解除该阻断。

## 文件与边界

- `db/postgres/migrations/pg_v9_017_legacy_execution_fence_archive.sql`
- `services/pg-api/src/stage-execution-fence-import.ts`
- `services/pg-api/tests/stage-execution-fence-import.test.mjs`
- 本文档。

唯一目标表是 `agentstudio.legacy_execution_fence_archive`。两类来源各自保留
原复合键：租约 `(kind, run_id)`，副作用 `(kind, run_id, step_key)`；租约的归档
索引 `step_key` 固定为空，但不会往租约原文增加此字段。所有源字段保存在
`source_record`，不修剪、不改写文本或数字。原始 SQLite TEXT 字节另经 hex 比对，
NUL 截断、无效 UTF-8、BLOB、不安全整数、未知列和 schema 差异均阻断。
JSONB 的对象键顺序不作为原文语义；字段值和原始文本的空白完整保留。
raw row SHA-256 使用已有 `contentHash`（递归排序对象键的 canonical JSON UTF-8），
不是 SQLite 页哈希，也不是 `JSON.stringify` 的偶然列顺序。

`executable=false`、`evidence_status=historical_unverified` 是 SQL 约束。
归档 `started`、`unknown`、`succeeded` 或任意租约时间不会恢复任务、续租、
调用工具或更新新运行时幂等账本。代码不写入 `jobs/runs/external_effects/run_leases`，
也没有队列连接。成功结果中的 `side_effects_created=0` 指新运行时副作用数。

## 输入及独立审核契约

`prepareExecutionFenceImport(snapshot, manifest, mapping, sourceReview, trustedReviewSha256)`
读取四个不同的文件（也拒绝硬链接别名），返回仅在当前进程有效且不可修改的计划。
库不提供生成真实审核文件、自动批准、读取活动库或连接数据库的命令。
调用方应将输入只读挂载到隔离环境，并经独立渠道固定审核文件的 SHA-256；
**不能在真实操作中仿照测试对任意输入即时计算并信任审批摘要**。

1. 冻结 SQLite backup 必须无 `-wal/-shm/-journal`，通过 `quick_check`。
   拒绝仓库 `pocketbase/pb_data` 及其 realpath；其他位置仍必须由操作方核验
   为经授权的离线备份。准备过程前后重新计算所有四个文件的字节摘要。
2. 完整 manifest 格式为 `agent-studio-sqlite-snapshot-v1`，含 `sha256`、
   `bytes`、`tables: {实际用户表名: 精确行数}`。inventory 必须与
   `sqlite_master` 全部实际用户表完全相等，不能只列本次四张表。
3. identity map 使用现有 `studio-approved-identity-map-v2`，同一 `source_sha256`，
   每条记录有 `old_id/new_studio_user_id/verified_by/approved_at`。
   源 `studio_users` 的所有 ID 必须完整且一对一映射，UUID 不得碰撞。
4. 独立 source review **不是 manifest 内嵌字段**。最外层结构如下；所有
   `<...>` 都是说明占位符，不是可直接执行的批准文件：

```json
{
  "format": "studio-execution-fence-source-review-v1",
  "source_sha256": "<冻结 SQLite 文件 SHA-256>",
  "identity_mapping_sha256": "<完整 mapping 文件 SHA-256>",
  "manifest_sha256": "<完整 manifest 文件 SHA-256>",
  "credentials_absent": true,
  "inert_opaque_text": true,
  "reviewed_by": "<独立内容审核人>",
  "reviewed_at": "2026-10-16T00:00:00Z",
  "tables": {
    "agent_runs": {"<见下文>": "<逐表逐行审核>"},
    "workflow_runs": {"<见下文>": "<逐表逐行审核>"},
    "agent_studio_run_leases": {"<见下文>": "<逐表逐行审核>"},
    "agent_studio_side_effects": {"<见下文>": "<逐表逐行审核>"}
  }
}
```

`tables` 必须恰好包含上述四表，空表也须审核。每张表的审核包含
`reviewed_by/reviewed_at/credentials_absent=true/inert_opaque_text=true`，
以及 `rows` 数组；每个元素同样包含这四项，再加 `row_sha256`。
四表的每个原始行都必须且只能匹配一条审核，不能缺行、重复或附加 hash。
所有内容审核人的名字必须与 identity map 的所有 `verified_by` 不同。
这项名称检查与可信摘要是技术绑定，不替代企业签名验证、身份核验和审批权限。
可信摘要应从安全负责人掌握的审批系统获得，不能来自 manifest 或源 SQLite。
四份输入及独立签审证据须由操作方在受控审计存储中保留；归档只保存它们的摘要，
不会将审批全文、父运行全文或源用户凭据重复复制到新归档。

审核、mapping 和 manifest 接受保守 JSON 子集：常规 JSON 序列化（可格式化空白），
拒绝重复键、丢精度数字、特殊转义拼写及危险原型键。不接受不确定或无法核验的输入。
每个元数据文件最多 5 MB；四张受审表各最多 5000 行，单批 fence 行总数 1..5000。

## 敏感字段策略

选择“仅明确审核的惰性无密文本”子集，不复制未经审核的凭据，不进行有损遮盖。
`lease_token`、`idempotency_key` 等非数值字段最多 256 UTF-8 字节，
`run_id` 为 15 位旧 ID，`result_text` 最多 8192 UTF-8 字节。
拒绝 NUL、非允许控制字符、坏 Unicode、明显凭据/密钥/JWT/Authorization 标记。
每个受审行必须明确确认 `credentials_absent` 与 `inert_opaque_text`。
正则无法证明任意字符串无秘密：**不能证明的行必须拒绝整个批次**。
真实可用租约凭据不符合“惰性”条件，即便 regex 没命中也不得签审。
本切片不支持加密 envelope、自动替换或省略真实秘密；需要此类数据时仍为 blocked，
应另立经过审核的加密/省略契约，不能先修改冻结备份再伪称无损导入。

库无 stdout/logger，异常只返回固定 `execution_fence_*` 代码，吞掉底层
SQLite、文件系统、连接与 SQL 诊断，不带路径、SQL 参数或原文。调用方也不得打印
计划、审核输入、数据库参数或驱动日志；它们可能包含已审核的敏感业务内容。

## 父运行与 owner 绑定

准备阶段从真实源 `agent_runs/workflow_runs` 读取父行。`kind` 决定父表，
`run_id` 必须匹配唯一实际父行，owner 来自父行的 `rh_user_id`，不是 fence 的
任意字段。父行完整 raw hash 也需要独立审核。不允许孤儿、未知 owner、UUID 混用。

写入前必须已通过现有历史 importer 归档父运行（`pg_v8_012/pg_v9_014`），
且已通过 `pg_v8_011` 建立 reviewed identity crosswalk。父归档的 source snapshot、
mapping、manifest、owner、raw 内容 hash 与本次真实 SQLite 父行逐项相同；
stored JSON 再计算 hash，不能只信任父归档的摘要列。
active 与 disabled owner 均必须匹配 reviewed crosswalk，不走 active-user 捷径。
本保守切片要求审核清单中的所有父行均已有一致归档，包括没有 fence 的父行。
不兼容父历史、未完成的父导入或 manifest 不一致均阻断，不自动补造父行。
SQL INSERT trigger 再次约束父 provenance 与 owner/map，防止关系被绕过。

## staging 写入门槛及不可变性

仅允许 `agentstudio_stage`、session/current role 同为 `agentstudio_admin` 的
superuser、PG 版本 `[170000,180000)`。迁移及导入都先检查，再执行归档写入。
迁移依赖三项父版本；必须独立审核 SQL 后由 DBA 在隔离 staging 应用。
此文不授权任何真实环境迁移或部署。

事务对归档、父历史、用户/map、migration ledger 和运行表加 EXCLUSIVE 锁，
设置 lock/statement timeout。要求 jobs 完全为空、无活动 runs、无 enabled schedules；
并发运行写入被锁隔离。所有行、回读核验、全表计数均在同一事务；任一失败整体
ROLLBACK。相同来源及审核原样重试仅计 `replayed`，保留 archive UUID；
不同快照、mapping、manifest、review 或行内容不能覆盖原证据。

SQL 内容校验：迁移转 LF 后，仅将两处 `execution_fence_sql_sha256:<64hex>`
回执的值置为 64 个 `0`，对其余完整 SQL 计算 SHA-256。摘要固定在 TS 常量，
数据库 `schema_migrations.description` 必须精确等于相同回执。
本地 SQL 变更、缺失/冲突数据库回执均拒绝；不是只检查版本号存在。
这不是对恶意 DBA 的密码学防护；superuser 本来就能改 schema、禁用 trigger。
运行时角色无此权限。

归档 REVOKE PUBLIC/API/Worker 全部权限，ENABLE + FORCE RLS 且无策略。
误授 SELECT 时 API/Worker 对任意 owner 仍看到零行。UPDATE/DELETE/TRUNCATE
由 statement trigger 阻断，包括 DBA 常规操作。只有 DBA 可以查看原始审计行；
归档 owner 字段用于核验，不能赋予员工直接读取权限。

## 验证与当前限制

使用 Node 24，在仓库根目录执行：

```powershell
$env:TEMP = Join-Path (Get-Location) '.tmp'
$env:TMP = $env:TEMP
$env:TMPDIR = $env:TEMP
node --experimental-strip-types --test services/pg-api/tests/stage-execution-fence-import.test.mjs
node services/pg-api/node_modules/typescript/bin/tsc -p services/pg-api/tsconfig.json --noEmit
```

测试执行原 `runtime_schema.js` 的 execution migrations，生成一份全合成 SQLite，
调用现有 Agent/Workflow 父历史导入器后，验证各一个 agent/workflow lease/effect，
原文和 provenance 无损、不同 owner 隔离、幂等、来源冲突、父内容/UUID 篡改、
失败注入及回读错误整体回滚、审核缺失/无效秘密/孤儿/数值边界阻断、API/Worker
不可见、不可变 DML 和 SQL 摘要。

PGlite 测试显式改写数据库名/登录/版本探针以构建合成 fixture；导入器探针用
测试 adapter 模拟，并单独测试拒绝分支。**这不是真实 PG17 TCP 测试或新的 CI 成功证据**。
此切片未修改 CI/package/统一 operator，因此尚不能经统一 operator 自动导入，
也没有真实审批、生产凭据加密、公司数据验证或切换授权。

仓库通用回归仍遵循 AGENTS.md 的 `pnpm check` 和 `pnpm test:e2e:parallel`。
这些任务可能涉及同时开发中的其他模块，失败需原样报告，不能擅自修改授权范围外文件。
总的切换门槛继续以 `POSTGRES_MIGRATION_READINESS_AND_CUTOVER.md` 为准。

本地验证记录（2026-10-16）：W27 定向测试 8/8 通过；pg-api TypeScript
检查通过；缓存 pnpm 11 离线运行 `pnpm check` 通过（159 个单测及构建，
production pilot bundle isolation PASS）。`pnpm test:e2e:parallel` 已尝试，
现有 runner 在项目外 `D:\Downloads\agentstudio-ci-*` 创建隔离目录时被
当前文件系统权限以 EPERM 阻断，19 项 E2E 未执行，不能记作通过。
未运行真实 PG17 TCP 或 GitHub CI，没有 commit/push。
