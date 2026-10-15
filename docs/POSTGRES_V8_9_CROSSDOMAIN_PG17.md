# V8.9 / W13 — synthetic 多域 PostgreSQL 17 隔离 trial

生产状态始终 **NO-GO**。本交付是独立可执行测试，真实 PG17 路径尚待主线程接入 GitHub-hosted Linux CI 验证。本地仅执行语法检查和 W13 fail-closed tests；没有连接 PG、企业 PocketBase、Neon 或宝塔，没有运行 Worker。

本轮文件所有权仅限本文件与 `services/pg-api/tests/pg17-crossdomain-stage.integration.mjs`。沿用并只读引用 W12 `pg17-stage-operator.integration.mjs`、原 operator、各域导入器与 SQL。没有修改 src、SQL、CI、package 或 W12，没有 commit/push。

## 执行前提与门禁

主线程需要分配**全新、一次性、独立 job 的 PG17 service**，安装 pgvector 扩展文件，Node >=24，预先安装仓库依赖。不要和 W12 或其它测试共用已初始化的数据库/角色；不要并行操作该 service。测试拒绝已有 agentstudio schema、任意用户 relation、额外非系统 schema，以及已存在的 API/Worker/W13 登录角色。测试不会 DROP、恢复或自动清空数据库。

PG/SQLite 动态导入、写入临时文件和连接 PG 前，必须同时满足：

| 环境变量 | 必需值 |
| --- | --- |
| `GITHUB_ACTIONS` | `true` |
| `RUNNER_ENVIRONMENT` / `RUNNER_OS` | `github-hosted` / `Linux`，进程平台也必须是 linux |
| `GITHUB_RUN_ID` | 1–32 位纯数字，无空白 |
| `RUNNER_TEMP` | 存在、规范绝对路径、realpath 一致，不能与仓库重叠或为根目录 |
| `AGENT_STUDIO_PG17_TEST_ENABLED` | `true` |
| `AGENT_STUDIO_PG17_CROSSDOMAIN_TEST_ENABLED` | `true`（W13 专用） |
| `AGENT_STUDIO_PG17_EPHEMERAL_ISOLATED` | `true` |
| `AGENT_STUDIO_PG17_HOST` / `AGENT_STUDIO_PG17_PORT` | `127.0.0.1` / `5432`，显式配置 |
| `AGENT_STUDIO_PG17_DATABASE` / `AGENT_STUDIO_PG17_ADMIN_USER` | `agentstudio_stage` / `agentstudio_admin` |
| `AGENT_STUDIO_PG17_ADMIN_PASSWORD` | `synthetic-agentstudio-pg17-ci-${GITHUB_RUN_ID}-` + 随机 32 bytes 的 64 位小写 hex；至少 12 种字符 |

service 的管理员密码必须与上述测试密码相同，且角色必须是 superuser。密码由该次 CI 合成并遮罩，不打印、不写入仓库、不使用公司凭据。连接后还会验证数据库、session/current role、superuser、17xxxx 版本和 TCP 端口，随后才允许初始化。

仅对这个空 service 顺序应用原 `001_stage_schema.sql`（已有 v8_005）及原 migration 006、007、**008**、009、010、011、012；没有重写 SQL 或伪造版本。初始化后的 `schema_migrations` 全行哈希必须在导入、执行阻断、W9、重放、异源拒绝后保持一致。

## 合成证据与受限 operator

从零创建的 SQLite source 只有五张实际用户表：`studio_users`、`agent_specs`、`workflows`、`agent_studio_kb_bases`、`agent_studio_schedules`，每表一行。KB 是空库的元数据，没有文档、chunk、vector 或 ACL；Agent 不声明 KB 依赖。唯一 schedule 依赖 Agent。所有 owner 均映射到同一个新 UUID。

源文件位于 `RUNNER_TEMP/w13-pg17-synthetic-${GITHUB_RUN_ID}-<random>/`。完整 manifest 清点全部实际用户表和行数，绑定 SQLite bytes/SHA256。独立 synthetic mapping、reviewed IdP map、source approval 均绑定同一 SHA；不读取既有 PB 数据，不导出源密码作为凭据。目录 0700，五份证据冻结为 0400；每次调用前后复核哈希、size、mtime、realpath、权限和无 WAL/SHM/journal。

父进程保留 `GITHUB_ACTIONS=true`。只有通过门禁后，针对自建 synthetic 临时目录创建的受限 operator child 使用 `GITHUB_ACTIONS=false`，这是对原 operator 禁止真实业务快照进入 GitHub CI 的窄范围测试适配。原 operator 不变；另有离线测试确认它在真实 CI 环境标记下仍先拒绝再读源。

child env 从白名单重建，不继承数据库 URL、PG 配置、代理或业务凭据。preload 向所有 operator 后代传播，检查源证据路径与只读权限，只允许白名单原 CLI、相同 preload/密码路径、指定 staging 目标和固定 CLI 工作目录；外层 operator 工作目录是自建 synthetic 目录。父/子网络防线只允许 `127.0.0.1:5432` 的 TCP，拒绝外部 fetch、HTTP(S)、HTTP2、TLS、DNS、UDP、Unix socket 和任意 shell/子进程入口。离线负例不建立任何连接。此防线覆盖测试及原导入器所用的 Node 网络/进程 API；CI 应保持无企业网络、无企业 secrets 的隔离 service。

## 可核验结果

一次顺序导入严格要求 operator phases 为 `identity → agent → workflow → knowledge_empty → schedules → reconciliation`，前五项各 imported/reconciled=1。各域分别提交；不是跨域大事务。任何兼容性错误均使测试失败，不能跳过或放宽导入器标准。

| 检查 | 必须满足的断言 |
| --- | --- |
| Identity | user/crosswalk 各 1；disabled、active_automatically=false；独立 issuer/subject、mapping/IdP SHA 与 owner 一致；身份函数不能登录 disabled user |
| Agent | owner/name、整个 spec JSON、approval、created/updated、private/team=null、原 ID/目标 ID/源 SHA/payload SHA 对应 |
| Workflow | owner/name/graph/timestamps/revision=1、完整 source_record、crosswalk/hash、private；execution_enabled=false |
| 空 KB | owner/name/description/timestamps/revision=1、crosswalk/hash、private；目标 documents/chunks=0 |
| Schedule | 所有原字段逐项通过完整 source_record 深比较；payload/mapping/projection SHA 一致；目标 Agent UUID 与 Agent crosswalk 一致；name/timezone/revision/timestamps 保真 |
| 禁用投影 | 源 enabled=1，目标 enabled=false、next_at=null、workflow_id=null，recurrence 明确 quarantined/execution_supported=false；原执行参数只留管理员归档 |
| 依赖与 trigger | 缺失 Agent 外键拒绝 23503；Workflow run 和 Workflow schedule 均拒绝 legacy_workflow_execution_disabled；启用 schedule 拒绝 immutable；occurrence 创建拒绝 execution_disabled |
| 全局无工作 | runs/jobs/schedule_occurrences/run_steps/external_effects 全表均 0；不仅统计某个 owner |
| RLS | 五域目标/映射表均 ENABLE/FORCE；真实非 superuser TCP 登录测试 anonymous/other=0、owner=1；API 无权读管理员 crosswalk；跨 owner 写入拒绝 |
| W9 | 只允许 SELECT / REPEATABLE READ READ ONLY / ROLLBACK；User/Agent/Workflow/空 KB 各 success、1:1、association_anomalies=0；schedule 必须 unsupported + field_reconciliation_unsupported，不能由数量相等推断业务对等 |
| 重放 | 同一快照前五项 imported=0/replayed=1/reconciled=1；整个 agentstudio 所有表的全行哈希不变 |
| 异源 | 重新从零创建的另一份完整审批快照 SHA 不同；identity 阶段拒绝，operator partial_stage_must_not_switch；全库表哈希不变 |

首次和同源重放均预期 operator **exit=2**、`stage_imported_reconciliation_incomplete`、`production_cutover_allowed=false`。这是测试明确检查的阻断结果；测试进程自身只有所有断言通过才 exit=0 并输出 `W13_PG17_STAGE_OPERATOR_PASS ... cutover=NO-GO`。缺失的源业务域也保留原 W9 阻断；不伪造完整迁移。

W1/W3 明确禁止 schedule 依赖已隔离的 Workflow，即使 schedule disabled 也不允许。W13 使用 Agent 依赖并额外验证 Workflow schedule 的 SQL 拒绝，不改 trigger、不替换目标、不降级这条约束。

## 主线程接 CI 与本地验证

仅在满足上表全部条件的独立 CI service 中运行真实路径：

```sh
node --experimental-strip-types --test services/pg-api/tests/pg17-crossdomain-stage.integration.mjs
```

本地只允许以下两项，无需任何启用变量：

```sh
node --check services/pg-api/tests/pg17-crossdomain-stage.integration.mjs
node --experimental-strip-types --test --test-name-pattern='^fail-closed:' services/pg-api/tests/pg17-crossdomain-stage.integration.mjs
```

本次本地 Node 24.14.1：语法检查通过，四项 fail-closed tests 通过。真实 TCP/SQL/跨域路径尚未在本地或本轮 CI 执行，不能据此宣称 PG17 trial 已通过。没有运行全项目检查、E2E 或 PGlite，遵守本轮本地执行范围。错误输出仅含固定 checkpoint，屏蔽 PG 原始错误、私有行、child stderr、路径和凭据；CI 失败时应按该 checkpoint 在隔离 job 内定位，不能上传源证据或密码。

最终仅清理自己创建且经过父目录、前缀、realpath/symlink 检查的 synthetic 临时目录；service 由 GitHub 销毁。即使真实 W13 测试通过，也只证明此最小 synthetic 子集的隔离导入和阻断行为；不代表真实员工 UAT、Workflow 执行语义、RAG/ACL、调度启用、生产回滚或生产切换获准。
