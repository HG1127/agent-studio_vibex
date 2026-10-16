# W27 执行围栏归档 CLI：隔离 DBA 操作契约

状态：独立实验迁移分支；生产 **NO-GO**。此 CLI 已实现离线 plan 与受限 execute，
不代表真实 PostgreSQL 17 + 真实源数据验证完成，不授权公司数据导入或生产切换。
PocketBase/SQLite 与现有 Node Worker 仍为当前运行时。

新增入口为 `services/pg-api/src/stage-execution-fence-import-cli.ts`，专项测试为
`services/pg-api/tests/stage-execution-fence-import-cli.test.mjs`。已加入独立的 `test:stage-fence-cli` 测试和 GitHub 迁移矩阵；统一 stage operator 的 `fence_history` 阶段现在仅在非空源且有独立审核文件与可信 SHA-256 时可进入预检，欠缺二者将于连接 PostgreSQL 之前中止。未接入公开 HTTP/API、Worker 或 Workflow UI。
底层契约与审核格式见 [W27 归档说明](POSTGRES_V9_EXECUTION_FENCE_ARCHIVE.md)。
本次不修改 W27 源模块、schema、SQL 或 shared tests。

## 输入与独立审核

唯一接受的参数：`--plan` 或 `--execute`（必须二选一），以及必填
`--snapshot`、`--manifest`、`--mapping`、`--review`、`--review-sha256`。
拒绝未知参数、重复参数、缺值、隐式默认模式及连接字符串参数。
`--review-sha256` 必须为独立安全审核者经可信渠道提供的 64 位 hex，大小写均可；
CLI 只做格式归一化，**不计算、生成或自动信任 review 审批摘要**。
审核文件自身、manifest 或源库中的摘要不能替代独立渠道。

操作方必须先取得授权的、已完成 SQLite backup 的离线冻结副本，将四份输入只读挂载，
阻止并发修改；不得指向生产/活动库、热备份或网络共享。CLI 不制作备份，不修复、
删改、脱敏或热写源文件。拒绝 URI、UNC/device 路径、symlink/junction 路径组件、任何 `pb_data` 路径段及
W27 已检查的 live realpath、文件别名/硬链接、SQLite `-wal/-shm/-journal`。
本地盘符不能证明磁盘的物理来源，映射网络盘/挂载点的排除仍须隔离环境保证。

CLI 直接调用
`prepareExecutionFenceImport(snapshot, manifest, mapping, review, reviewSha256)`，
不复制或放宽 W27 规则。包括：源字节 SHA、完整表 inventory 和计数；全量一对一
owner mapping；四张表每行各一项独立批准；review 对 snapshot/mapping/manifest 的
精确绑定；真实父行和 owner 引用；源 schema、每个字段和值及原始文本字节匹配；
凭据/控制字符/非法 Unicode/数字边界拒绝；准备前后四文件摘要相同。
内容 reviewer 必须与 mapping reviewer 不同。信任摘要与名字校验不能代替企业审批身份核验。
无法证明文本无凭据且已失效惰性的记录必须拒绝整个批次，不得删除该行再导入。

## 离线 plan

在仓库根目录用 Node 24 运行，以下变量必须由隔离操作环境预先设置：

```powershell
node --experimental-strip-types services/pg-api/src/stage-execution-fence-import-cli.ts --plan --snapshot "$snapshot" --manifest "$manifest" --mapping "$mapping" --review "$review" --review-sha256 "$independentlyApprovedReviewSha256"
```

plan 不读取密码文件，不加载 `pg`，不创建 Pool 或连接；不调用 HTTP/API/model。
不会通过已有 PG 环境变量创建连接。不得将 plan 理解为数据库内父归档核验：
离线阶段只验证源父行，真实 staging 父归档一致性在 execute 的 SQL 事务中验证。

成功 stdout 只有一个 JSON 对象，固定白名单：

- `source_sha256`：冻结 SQLite 的字节摘要。
- `counts`：`parents`、`leases`、`side_effect_records` 计数。
- `source_read_only=true`；`executable=false`、`execution_enabled=false`。
- `runtime_jobs_created=0`、`runtime_runs_created=0`、`side_effects_created=0`。
- `production_cutover_allowed=false`。

不输出 raw plan、源记录、run ID、owner ID、审核人、输入路径、审批全文或凭据。
失败无成功 stdout，stderr 只输出固定拒绝代码，exit code 为 1；底层 FS/SQLite/
importer/PG 诊断统一为 `execution_fence_import_refused`，不打印 stack 或 SQL 参数。
Node 本身可能发出不带业务内容的 SQLite experimental warning。

## execute 的额外门槛

仅当隔离 staging 已由 DBA 独立审核并应用 W27 SQL、建立 reviewed identity crosswalk、
导入完全相同 snapshot/mapping/manifest 的 Agent 与 Workflow 父历史且完成备份与审批后，
才具备后续执行条件。本 CLI 不应用迁移、不补造父归档，也不自动解除任何 NO-GO。
本任务没有进行真实 execute。

execute 必须额外指定 `--confirm-stage agentstudio_stage`；plan 不接受此确认参数。
还必须设置以下环境变量：

| 变量 | 唯一允许值/约束 |
| --- | --- |
| `AGENT_STUDIO_PG_STAGE_FENCE_IMPORT_ENABLED` | 字面值 `true` |
| `AGENT_STUDIO_PG_HOST` | `127.0.0.1` 或隔离网络的 `postgres` |
| `AGENT_STUDIO_PG_DATABASE` | `agentstudio_stage` |
| `AGENT_STUDIO_PG_IMPORT_USER` | `agentstudio_admin` |
| `AGENT_STUDIO_PG_IMPORT_PASSWORD_FILE` | 仓库外、非 pb_data、非输入文件别名的私有本地文件 |

端口固定 5432；不接受任意 host、URL、port、role 或 inline password。
execute 拒绝已设置的所有 `PG*` 环境变量、非空 `DATABASE_URL`、
`AGENT_STUDIO_PG_PASSWORD`、`AGENT_STUDIO_PG_IMPORT_PASSWORD`，防止 ambient 配置覆盖。
不自动加载 `.env`。PG SSL 关闭，只适用于指定隔离本机/容器网络；不得用于公网。
`postgres` 名称的解析和网络隔离由 staging 运维控制，不得映射到外部数据库。

密码文件 32..4096 字节，UTF-8 内容移除最多一个末尾换行后为 32..2048 字符，
拒绝内嵌 CR/LF/NUL 和单字符重复值；POSIX 拒绝 group/other 权限。
Windows 必须由操作方用 NTFS ACL 限定读取权限，Node mode 检查不能替代 ACL 审核。
密码只在成功准备计划之后读取，随后才动态加载 PG 驱动并创建单连接 Pool。
所有 execute 前置拒绝都不创建 PG 连接。

后续经授权的 DBA 命令形态如下（此示例不是执行授权）：

```powershell
node --experimental-strip-types services/pg-api/src/stage-execution-fence-import-cli.ts --execute --snapshot "$snapshot" --manifest "$manifest" --mapping "$mapping" --review "$review" --review-sha256 "$independentlyApprovedReviewSha256" --confirm-stage agentstudio_stage
```

`GITHUB_ACTIONS=true` 时 plan/execute 都直接拒绝。不能在 GitHub Actions 中放入或处理
真实业务备份、review、mapping、凭据；此环境标记检查不能检测刻意隐藏的 CI 环境。

## SQL 保证及重试

执行直接调用未改动的 `importLegacyExecutionFenceToStage`。服务器必须是 PG17，
database 为 `agentstudio_stage`，session/current user 均为 `agentstudio_admin` superuser。
SQL 内容 SHA 与 `pg_v9_017` 回执必须完全一致，DBA-only 归档权限、FORCE RLS、
父 provenance trigger、不可变 UPDATE/DELETE/TRUNCATE trigger 全部保留。

EXCLUSIVE 锁、lock/statement timeout、drained jobs/活动 runs/enabled schedules 检查、
每个源父行（含无 fence 的父行）与现有归档逐字段/owner/raw hash 绑定、全量写入和回读
核验都在 W27 单事务内完成；任一失败 ROLLBACK。同一组来源和 review 原样重试只计
`replayed`，不覆盖 archive UUID；来源/审批冲突拒绝。Pool 在完成/失败后关闭，
driver error 事件不向日志泄漏原文。连接或提交中断后的结果应经 DBA 审计后用同一组
冻结输入重试，不能更改输入冒充新审批。

唯一写入目标仍是 `legacy_execution_fence_archive`，绝不创建 runtime jobs、runs、
external effects、leases 或队列工作。成功 execute JSON 仅在原计数中增加
`imported/replayed/reconciled`。旧 side-effect 记录计数不是新外部副作用数，
`side_effects_created=0` 保留。所有执行及切换标志仍为 false。

## 验证边界

```powershell
node --experimental-strip-types --test services/pg-api/tests/stage-execution-fence-import-cli.test.mjs
node --experimental-strip-types --test services/pg-api/tests/stage-execution-fence-import.test.mjs
node services/pg-api/node_modules/typescript/bin/tsc -p services/pg-api/tsconfig.json --noEmit
pnpm check
pnpm test:e2e:parallel
```

专项 fixture 全合成 SQLite，使用真实 source execution schema 与 canonical row hash，
只在测试 fixture 中产生独立的合成审核文档并固定其真实字节摘要。子进程阻断 PG import、
net/HTTP/DNS/fetch，验证离线 plan、文件摘要不变、审批绑定、伪造/缺行、凭据脱敏、
schema/父引用、execute 确认/开关/host/db/user/ambient 配置与 CI 阻断。
execute 合成测试仅替换 PG 驱动和虚拟外部密码文件，保持真实 W27 importer，验证
事务、回读、重试及错误服务器身份回滚/释放。它不是 PG17 TCP、真实外部密码 ACL、
真实源独立审核或公司业务数据验证；W27 PGlite 测试也不能替代这些门槛。

真实 PG17 + 真实源验证、员工 UAT、网络/ACL、备份恢复、长时 Worker 与切换验证仍未完成。
生产持续 **NO-GO**；没有 commit/push 或生产交互。

本地实测记录（2026-10-16，Node 24.14.1）：最终 CLI 专项 **11/11 通过**，
原 W27 SQLite/PGlite **8/8 通过**，pg-api TypeScript 检查通过。
使用缓存 pnpm 11.23.0、设置项目内 TEMP/TMP/TMPDIR 和离线 Corepack 后，
`pnpm check` 的根单测 **162/162 通过**，`tsc -b` 通过；Vite 阶段发生
`Committing semi space failed / JavaScript heap out of memory`，exit 134，
因此完整 `pnpm check` **未通过**，production bundle verification 未执行。
此前启动尝试遇到缺失 ComSpec、Windows shell 路径格式及 Corepack 联网失败，
仅通过当前进程环境修正，没有修改 package/CI 或安装依赖。
`pnpm test:e2e:parallel` 在项目外 `D:\Downloads\agentstudio-ci-*` 创建目录时
被 EPERM 阻断，**19 项 E2E 未执行**，不能报告为通过。
工作区存在其他并行修改；本任务写入的交付文件仅为本文、CLI 和该 CLI 专项测试。
