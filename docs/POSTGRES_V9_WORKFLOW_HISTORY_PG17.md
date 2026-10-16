# W23 — PostgreSQL 17 Workflow history archive verification

状态：仅合成 stage 测试；生产 cutover **NO-GO**。本任务不提交、不 push、不部署。

文件所有权仅限本文件和
`services/pg-api/tests/pg17-workflow-history.integration.mjs`。
W22 importer、001/011/014 SQL、CI、共享测试、前端均只读。真实 PG17 运行由主线程接入 CI；本地不连接公司 BaoTa、正式 PocketBase 或现有 Neon。

## 本地验证与证据边界

在项目根目录使用 Node 24：

```sh
node --check services/pg-api/tests/pg17-workflow-history.integration.mjs
node --test --test-name-pattern='^fail-closed:' services/pg-api/tests/pg17-workflow-history.integration.mjs
```

本地已通过语法检查及四项 fail-closed 测试：环境门禁、拒绝入口的无连接/无写入/无数据库导入探针、真实临时目录检查的 mock 分支、网络及任意子进程拦截探针。离线探针不导入 PG、SQLite 或 importer，不建立 socket。

没有本地真实 PG17 成功证据。不得将离线通过、PGlite 结果或仅出现测试名称当作 W23 TCP 通过。本任务按限定范围不运行全项目 `pnpm check` / E2E。

## 主线程 CI 接线契约

为 W23 使用单独 GitHub-hosted Linux job 的全新 `pgvector/pgvector:pg17` service，Node 24；不得与其他 stage 测试共用已初始化 service，也不得在现有库清理后运行。service 仅映射 `127.0.0.1:5432:5432`，数据库 `agentstudio_stage`，超级用户 `agentstudio_admin`。不要预先加载 schema；本测试要求空库并自行加载原始 SQL。

安装依赖可沿用仓库独立 API 安装命令：

```sh
pnpm --dir services/pg-api install --ignore-workspace --frozen-lockfile --ignore-scripts
```

进入真实测试前必须满足下列全部值：

| 环境变量 | 要求 |
| --- | --- |
| `GITHUB_ACTIONS` | `true` |
| `RUNNER_ENVIRONMENT` | `github-hosted` |
| `RUNNER_OS` / 实际平台 | `Linux` / `linux` |
| `GITHUB_RUN_ID` | 1–32 位纯数字，无空白 |
| `RUNNER_TEMP` | runner 提供的真实、规范绝对目录；非根目录、非符号链接、可写可遍历，且与源码目录互不包含 |
| `AGENT_STUDIO_PG17_TEST_ENABLED` | `true` |
| `AGENT_STUDIO_PG17_W23_WORKFLOW_HISTORY_TEST_ENABLED` | `true` |
| `AGENT_STUDIO_PG17_EPHEMERAL_ISOLATED` | `true` |
| `AGENT_STUDIO_PG17_HOST` | `127.0.0.1` |
| `AGENT_STUDIO_PG17_PORT` | `5432` |
| `AGENT_STUDIO_PG17_DATABASE` | `agentstudio_stage` |
| `AGENT_STUDIO_PG17_ADMIN_USER` | `agentstudio_admin` |
| `AGENT_STUDIO_PG17_ADMIN_PASSWORD` | `synthetic-agentstudio-pg17-ci-${runId}-${64hex}` |

密码必须与 service 的 `POSTGRES_PASSWORD` 完全相同。现有 CI 合成格式可沿用
`synthetic-agentstudio-pg17-ci-${{ github.run_id }}-${{ github.sha }}0123456789abcdef01234567`，
其中 40 位 commit SHA 加 24 位固定后缀组成 64 个小写 hex 字符，且至少有 12 种不同字符。不要打印密码或使用真实凭证。测试不会从连接 URL 或任意 `PG*` 环境变量推导目标；主机、端口、库、用户、SSL 和 options 显式固定。

运行独立文件：

```sh
node --experimental-strip-types --test services/pg-api/tests/pg17-workflow-history.integration.mjs
```

环境字符串门禁先于文件系统探测和业务依赖导入；随后验证实际 `RUNNER_TEMP`，再安装网络守卫、导入 PG/SQLite/importer。临时目录真实性验证本身必须读取目录元数据。门禁拒绝不创建任何合成文件或连接数据库。网络守卫只允许 loopback 5432 TCP，拦截 DNS、其他网络、fetch、HTTP(S)、TLS、UDP 及任意子进程；真实测试不启动 worker/provider/operator。

连接后再次检查真实 PG17 版本、数据库、session/current role、超级用户及 TCP server 地址/端口；拒绝已有 agentstudio schema、业务对象、额外 schema 或目标 API/worker/test login role。测试不 DROP/重建数据库或 schema；service 生命周期由 GitHub 回收。

## 数据与断言

1. 不改写 SQL，顺序加载 `001_stage_schema.sql`、`pg_v8_011_legacy_user_provision.sql`、`pg_v9_014_legacy_workflow_history.sql`，仅去除 psql 元命令行。001 自带 011 所需 `pg_v8_005` 基线，不伪造迁移版本或服务器查询。
2. SQLite 包含且 manifest 完整列出 `studio_users` 两人、owner 一致的 `workflows` / `agent_specs`、一条 `workflow_runs(status=running)` 和一条关联事件。legacy IDs 派生自 runId；UUID、文本和 IdP 都由测试合成。
3. 冻结 snapshot、approved UUID mapping、完整 manifest、逐行 `contentHash` review、独立合成 IdP review。目录权限 0700，文件 0400，记录文件 SHA/长度并复核，无 WAL/SHM/journal。PG 的 disabled/active 两名用户与 011 crosswalk 绑定 source/mapping/IdP/identity-row SHA；导入不会激活用户。
4. graph/checkpoint/content 只用原 reader 支持的空对象、空数组及 null 文本，带原始空白。中文、emoji、换行、制表符、长 result 在 SQL JSONB 内作为字符串逐字段核对 UTF-8 bytes；核对完整 source_record 和 canonical SHA。外层 JSONB 键顺序不属于源 SQLite 文本字节保真承诺；不将复杂历史结构重新编码或视为已审核。
5. 拒绝错误源 SHA、不完整 manifest、错误逐行 review、跨 owner workflow/spec、孤立 event-run、复杂或 scalar 历史 JSON。拒绝发行后被修改的 plan；真实 PG 拒绝错误 source/mapping/owner crosswalk。不同冻结来源不能替换已有归档；SQL 自引用复合 FK 拒绝跨 owner 或错误 run 的 event。
6. 首条 run INSERT 在真实事务中成功后，事件 INSERT 前在同一连接执行真实 `SELECT 1 / 0`，确认 SQLSTATE `22012`，importer 以脱敏 `workflow_history_sql_failed` 拒绝。检查 BEGIN → ROLLBACK、没有 COMMIT、零归档行及完整 schema 表内容 fingerprint 恢复。之后重新从相同冻结文件 prepare，成功导入并对账；再次同源重放 imported=0 / replayed=2，归档 UUID/时间及所有表 fingerprint 不变。该 resume 是整批已核验重试，不是执行历史 workflow。
7. 独立 NOSUPERUSER / NOBYPASSRLS / NOINHERIT 登录验证 importer 错误 role 拒绝；切换 API 与 worker，空 actor、随机 actor、两名 owner 均无 CRUD/TRUNCATE 权限。确认 FORCE RLS 且没有 policy；临时误授 SELECT 仍返回零行，随后撤销授权。超级用户 UPDATE/DELETE/TRUNCATE 也必须命中 immutable trigger。
8. `runs/jobs/run_steps/approvals/run_leases/schedules/external_effects` 等运行与业务表保持零行，model connection/embedding queue 表不存在。历史 `running` 仅存于不可执行归档，用户状态保持 disabled/active；无新 run、job、queue、模型调用或外部副作用。

所有真实测试错误只返回固定 checkpoint；不输出原始源值、SQL diagnostics、UUID、路径、密码或断言 diff。清理仅限经父目录、前缀、realpath、非符号链接复核的本次合成目录。

成功必须同时满足进程退出码 0 和固定输出：

```text
W23_PG17_WORKFLOW_HISTORY_PASS real_tcp=true synthetic_only=true archive_only=true cutover=NO-GO
```

## 兼容性与失败处理

静态阅读未发现需要改写 SQL 的 importer/schema 不兼容；真实 PG17 尚待主线程 CI 验证。如在 schema、首次插入、对账、RLS 或 immutable checkpoint 失败，保留脱敏 checkpoint 并在本文件记录实际不兼容，由源码所有者修复。不得替换原 importer、伪造查询结果、放松 JSON/owner/SHA/RLS 门禁或跳过失败断言来取得 PASS。任何 W23 成功仍不授权生产迁移或 cutover。
