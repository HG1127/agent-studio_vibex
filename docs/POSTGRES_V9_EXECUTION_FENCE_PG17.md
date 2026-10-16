# W30 执行围栏归档：真实 PG17 synthetic E2E 契约

状态：测试代码已建立；**未运行真实 PG17 TCP / GitHub job，生产切换 NO-GO**。
本次只新增本文和 `services/pg-api/tests/pg17-execution-fence.integration.mjs`。
未编辑 CI、package、src、Workflow UI 或任何已有文件；没有 Git add/commit/push。
没有连接公司宝塔、PocketBase、Neon 或任何生产服务。

当前运行时仍为 PocketBase/SQLite + Node Worker。历史
`agent_studio_run_leases` / `agent_studio_side_effects` 永远只进入
`agentstudio.legacy_execution_fence_archive`；不恢复 running 运行、不续租、不重放工具，
不转换为 runtime jobs/runs/external_effects/run_leases。

## 依赖与真实执行边界

先阅读 `AGENTS.md`、`CLAUDE.md`、
[W27 归档契约](POSTGRES_V9_EXECUTION_FENCE_ARCHIVE.md) 和
[CLI 操作契约](POSTGRES_V9_EXECUTION_FENCE_OPERATOR.md)。
用户指定的 `db/postgres/migrations/pg_v9_017_legacy_execution_fence.sql`
在本次工作区不存在；实际源码和本测试引用
`db/postgres/migrations/pg_v9_017_legacy_execution_fence_archive.sql`。
没有创造同名替代文件，没有略过真实 SQL。

测试使用 Node 24 的 `node:sqlite`、项目现有 `pg` 依赖、仓库真实 SQL，
以及原样的 Agent/Workflow 父历史和 execution fence importer。
仅移除 SQL 的 psql 客户端指令 `\set ON_ERROR_STOP on`，其余 SQL、版本探针、
身份探针、约束和 checksum 不做改写。没有 PGlite、伪造 query 结果或版本替身。

CLI 保持原有 `GITHUB_ACTIONS=true` 拒绝规则。本测试不会将其改为 false：
本地拒绝测试验证 CLI 在读取输入和 TCP 前返回 `github_actions_forbidden`；
真实 TCP 测试调用相同底层 importer。**这不是 CLI execute 的端到端通过证据**，
也不是统一 operator 或 UI 的通过证据。

## 主线程以后接入的 GitHub job

只允许 GitHub-hosted Linux runner 和这个 job 独占、全新、可销毁的 PG17 服务。
pgvector 的扩展二进制必须可用（例如经过维护者确认的 PG17 pgvector 镜像）；
不要预执行 CREATE EXTENSION，也不要挂载现存数据目录、公司备份或任何真实文件。
Node 必须是 24，安装本项目锁文件规定的依赖。服务不得与 W12 或其他 E2E 共用库。
测试成功或失败后，由 CI 销毁整个临时服务；测试不会 DROP/恢复数据库或 schema。

主线程创建服务时必须使用以下唯一连接目标与一致的合成密码：

| 环境变量 | 强制值 |
| --- | --- |
| `GITHUB_ACTIONS` | `true` |
| `RUNNER_ENVIRONMENT` | `github-hosted` |
| `RUNNER_OS` | `Linux`，同时 Node `process.platform === linux` |
| `GITHUB_RUN_ID` | GitHub 提供的 1..32 位十进制数字 |
| `RUNNER_TEMP` | runner 的规范绝对路径，realpath 必须完全相同 |
| `AGENT_STUDIO_PG17_TEST_ENABLED` | `true` |
| `AGENT_STUDIO_PG17_W30_EXECUTION_FENCE_TEST_ENABLED` | `true` |
| `AGENT_STUDIO_PG17_EPHEMERAL_ISOLATED` | `true` |
| `AGENT_STUDIO_PG17_HOST` | `127.0.0.1` |
| `AGENT_STUDIO_PG17_PORT` | 显式 `5432` |
| `AGENT_STUDIO_PG17_DATABASE` | `agentstudio_stage` |
| `AGENT_STUDIO_PG17_ADMIN_USER` | `agentstudio_admin` |
| `AGENT_STUDIO_PG17_ADMIN_PASSWORD` | `synthetic-agentstudio-pg17-ci-<GITHUB_RUN_ID>-<64位小写随机hex>` |

密码后缀须来自 `randomBytes(32)`，至少包含 12 种不同字符；不得使用真实凭据、
GitHub secret 或公司密码。不要打印密码或将其写入日志/构建产物。
服务初始 superuser 必须就是 `agentstudio_admin`，初始数据库就是
`agentstudio_stage`，TCP 映射固定 `127.0.0.1:5432`。由主线程在启动临时服务前
生成上述密码并同时提供给服务和测试，禁止依赖测试替换现有服务器密码。
这些环境标签是 CI 隔离契约和误操作门槛，不是对恶意环境伪装的证明。

拒绝任何已设置的 `PG*` 变量，以及非空 `DATABASE_URL`、`NODE_OPTIONS`、
`NODE_PATH`、通用 `AGENT_STUDIO_PG_HOST/DATABASE/IMPORT_USER/PASSWORD/IMPORT_PASSWORD/IMPORT_PASSWORD_FILE`。
测试不加载 `.env`、不读取生产凭据、不接受快照、路径或 URL 参数。

所有字符串环境条件在纯函数中检查，失败先于测试主体的任何文件系统操作、
SQLite/pg/业务模块动态导入和 TCP。验证 realpath 本身必然需要 FS 元数据访问：
只有纯环境门槛通过后，才逐段 lstat RUNNER_TEMP、拒绝 symlink，再核验 realpath
和目录类型；它不能等于、包含或位于项目根目录。此步骤失败仍不创建文件或连接 TCP。
本地拒绝测试用子进程 FS/TCP 陷阱验证这项顺序。
Node 装载测试源文件自身的系统 I/O 不属于测试主体的输入读取。

第一次连接后、任何 DDL 或合成 fixture 写入前，验证：

- 实际数据库、session/current role 均精确匹配；登录为 superuser；版本 `[170000,180000)`。
- 服务器 `inet_server_addr()` 非空、端口 5432，确实经过 TCP。
- `agentstudio` schema 不存在；所有非系统 schema 均无 relation/function；
  除默认 public 外无自定义 schema，除 plpgsql 外无已安装 extension。
- API/Worker 及本测试专用登录角色均不存在，避免复用旧测试集群。

此后才应用真实 `001_stage_schema.sql`、`pg_v8_011`、`pg_v8_012`、
`pg_v9_014` 和 `pg_v9_017`。任意真实 schema 不完整、不合法、依赖缺失或 SQL
checksum 不匹配，立即失败，不补 UNIQUE/列/表、不伪造 migration receipt，
不修改版本和权限探针。错误只报告固定阶段：
`w30_pg17_fence_trial_failed_redacted phase=real_schema_invalid_or_incomplete`。
该阶段同时涵盖 schema、迁移及扩展验证；不能把它登记为 archive 通过。
如失败，维护者须在另一个获授权任务修复真实源码，本任务不做绕过。

将来 job 在上述环境和全新服务均准备好后，从项目根目录运行：

```sh
node --experimental-strip-types --test services/pg-api/tests/pg17-execution-fence.integration.mjs
```

默认执行没有 skip/模拟成功；门槛不满足必定失败。
只有完整真实 TCP 场景、断言、连接关闭和 fixture 清理全部完成才输出唯一标记：

```text
W30_PG17_FENCE_ARCHIVE_PASS real_tcp=true synthetic_only=true cutover=NO-GO
```

CI 必须同时要求进程 exit=0 和该标记，不能只搜索源码或本地输出。
失败时不打印 PG 参数、原始记录、review 全文、SQL、口令或断言差异；
固定 phase 只用于定位测试阶段。不要上传临时 SQLite、输入或数据库目录。

## 全合成证据与测试断言

只在核验过的 RUNNER_TEMP 下用 mkdtemp 创建 `w30-pg17-synthetic-*` 私有目录。
用应用真实 `runtime_schema.js` execution migrations 建 SQLite 的 fence 表；
另外从零建立 studio_users、Agent/Workflow 父表与父 importer 所需引用表。
没有 backup/copy/read 外部 SQLite 的入口。两名 owner 分别使用随机 UUID；
旧 ID 为硬编码合成 15 字符值，用户名/工作流/工具文本也全部合成。

每份快照建立完整用户表 inventory、精确行数、SQLite bytes/SHA-256、
`studio-approved-identity-map-v2` owner map，以及**真正单独文件**的
`studio-execution-fence-source-review-v1`。review 绑定 snapshot、mapping、
manifest 的文件 SHA，四表（包括空表）及每行 hash 都需精确批准。
所有内容 reviewer 与 identity reviewer 不同。review 的可信摘要在测试内独立持有，
不从 manifest 内取出。另有合成 IdP 证据文件，其 hash 绑定 SQL crosswalk。

**本测试仅对自己从零生成的 synthetic bytes 自签 review，绝不构成真实审批流程。**
真实操作禁止对任意输入即时算 SHA 并自批；真实 review 和可信 SHA 必须来自
独立、经授权的安全审核渠道。本测试的 IdP/crosswalk 是 synthetic SQL scaffold，
不声称测试了真实员工审批、OIDC provisioning 或企业签名身份。

源文件冻结为 0400，目录 0700；文件 inode 不同。测试前后复核 inode、mode、
size、mtime、字节 SHA 和无 WAL/SHM/journal。只清理本次明确登记且 realpath
仍位于 RUNNER_TEMP 的私有目录，绝不清理用户或系统文件。

真实场景验证：

1. 独立 canonical JSON hash 实现与现有 contentHash 一致；错误 trusted SHA、
   缺行 review、错误原始行 hash、身份/内容同 reviewer、错误 manifest 绑定均拒绝。
   修改已准备计划的 owner 被 WeakMap seal 拒绝，不连接 importer 数据库。
2. 两个 reviewed owner 的 crosswalk 精确绑定源和 mapping，一个 disabled、一个 active。
   父历史缺失时 importer 拒绝，数据库全表指纹不变。随后调用**真实现有父 importer**
   写入 SQL 历史表，而不是把历史 running 写入 runtime runs。
3. 父记录仍为 running、executable=false，原始记录 hash 正确；源/owner/provenance
   由 fence importer 再核验。另一合成快照在归档前因 crosswalk 源不匹配拒绝。
   分别临时破坏 disabled/active owner 的合成 crosswalk mapping SHA，均须拒绝；
   临时将合成 crosswalk 绑定另一快照后，该快照仍因已有父历史来源不一致拒绝。
   每次恢复原始 scaffold 后全表指纹必须等于基线，不禁用任何不可变 trigger。
4. 两条 lease 保留 attempts、时间值（含最大安全整数）及惰性 opaque 文本；
   三条 side effect 保留 started/unknown/succeeded、未知工具名、空白、Unicode。
   未知工具名从不解析或执行；本地 schema 不支持的未来列/枚举不能偷偷接受。
5. 第二次 fence INSERT 前在同一真实 PG session 执行 `SELECT 1/0`。
   故障前确认第一条已在事务内存在，观察实际 ROLLBACK；事务后全 schema 行指纹
   与基线相同。不是只抛 JS 错误，也不是 mocked SQL response。
6. 成功后逐条核对 source_record、owner、parent hash、raw hash、四项文件摘要、
   executable=false 和 historical_unverified；源用户合成占位字段不进入归档。
7. same-source 重试 imported=0/replayed=5，含 UUID、时间戳的全表指纹完全不变；
   其他快照整批拒绝。错误 owner、parent hash、snapshot/manifest 的直接 SQL INSERT
   被真实 trigger 拦截；executable/evidence_status 被真实 CHECK 拦截。
8. DBA UPDATE/DELETE/TRUNCATE 也由 immutable trigger 拒绝。检查 ENABLE/FORCE RLS
   和零 policy。两条实际非 superuser、无 BYPASSRLS 的 TCP 登录分别 SET ROLE API/Worker，
   默认 SELECT/INSERT/UPDATE/DELETE/TRUNCATE 均拒绝；临时误授 SELECT 时，无 actor、
   两名 owner、另一 UUID 均读零行，之后撤销授权。
9. 各关键阶段以及结束时 runtime jobs/runs/run_steps/run_leases/external_effects/
   schedules/schedule_occurrences 全为零。错误、幂等、RLS 探针均不修改业务行。
   全程 TCP guard 只接受 127.0.0.1:5432，fetch 被禁用，不启动 Worker 或工具进程。

## 本次离线验证记录

2026-10-16，Windows / Node 24.14.1，仅执行：

```powershell
& 'C:/Program Files/nodejs/node.exe' --check services/pg-api/tests/pg17-execution-fence.integration.mjs
& 'C:/Program Files/nodejs/node.exe' --test '--test-name-pattern=^fail-closed:' services/pg-api/tests/pg17-execution-fence.integration.mjs
```

语法检查通过；本地 fail-closed **3/3 通过**。真实 TCP 测试由 name pattern 排除，
没有运行，没有 PG17 成功标记，没有 GitHub CI 成功证据。
按本任务仅离线验证的要求，未运行 pnpm check、PocketBase E2E 或任何数据库测试。
将来真实 PG17 job 的通过仍不能解除生产 NO-GO。
