# W25 — Agent run_events 的真实 PostgreSQL 17 独立验证

当前状态：**待主线程接入 CI 后执行真实 PG17；cutover=NO-GO**。本次仅新增本文件与 `services/pg-api/tests/pg17-agent-run-events.integration.mjs`，不修改 W24、迁移、package scripts、CI、Operator、API 或 Worker。本地通过不代表真实 PostgreSQL 验证通过。

## 执行边界

由主线程为 W25 分配单独的 GitHub-hosted Linux job，使用全新、空的 `pgvector/pgvector:pg17` service。不得复用 W23、通用 PG17 或其它测试已安装 schema 的 service；不得挂载任何持久卷、备份、PocketBase 数据、真实公司数据或生产凭据。数据库固定为 `agentstudio_stage`，超级用户固定为 `agentstudio_admin`。测试不启动 Docker、psql、Worker 或任何其它子进程；service 的准备和销毁由 CI 管理。

严禁生产 BaoTa、PB、Neon，以及任何远端数据库、外部 API、模型或工具调用。测试仅使用源码内生成的合成数据，不接收 SQLite、manifest、mapping 或 OIDC 文件路径参数。环境变量只是隔离约定，并非对执行主机身份的密码学证明；不得在生产机器上伪造这些变量来运行测试。

## 必需环境

下列所有值均必需，缺少或不匹配即失败，不会自动 skip 或降级到 PGlite：

| 变量/条件 | 必须满足 |
| --- | --- |
| 实际 Node 平台 | `linux`，Node 24 或更新兼容版本 |
| `GITHUB_ACTIONS` | `true` |
| `RUNNER_ENVIRONMENT` | `github-hosted` |
| `RUNNER_OS` | `Linux` |
| `GITHUB_RUN_ID` | 1–32 位 ASCII 数字，不允许尾随换行/空格 |
| `RUNNER_TEMP` | 规范绝对 POSIX 路径；存在、可写可进入、真实目录、realpath 与原值相同，无符号链接重定向；不位于项目内，也不是项目的祖先 |
| `AGENT_STUDIO_PG17_TEST_ENABLED` | `true`（沿用既有 PG17 总开关） |
| `AGENT_STUDIO_PG17_W25_AGENT_EVENTS_TEST_ENABLED` | `true` |
| `AGENT_STUDIO_PG17_EPHEMERAL_ISOLATED` | `true` |
| `AGENT_STUDIO_PG17_HOST` | `127.0.0.1` |
| `AGENT_STUDIO_PG17_PORT` | 字符串 `5432` |
| `AGENT_STUDIO_PG17_DATABASE` | `agentstudio_stage` |
| `AGENT_STUDIO_PG17_ADMIN_USER` | `agentstudio_admin` |
| `AGENT_STUDIO_PG17_ADMIN_PASSWORD` | `synthetic-agentstudio-pg17-ci-<GITHUB_RUN_ID>-<64 个小写 hex>`，后缀至少含 12 种不同字符 |

主线程 CI wiring 应为每次 run 生成独立随机合成密码，并让 service 登录密码与测试变量一致。不要把密码写入命令输出、step summary、源码、artifact 或失败日志；不得使用真实数据库 secret。W25 不负责 service 的密码引导，不修改现有工作流。仅开放 job 本机 loopback 的 5432，不使用 job container 内的 service hostname。

纯环境门禁先于任何显式文件检查、数据库/SQLite/导入器加载和网络连接。随后仅验证 RUNNER_TEMP 的目录元数据，安装网络保护，加载固定依赖，再安装文件保护并生成合成 fixture。Node 加载本测试与固定源码依赖所必需的代码读取不属于数据源读取。文件保护允许读取四个固定 SQL 文件；应用数据读写仅限本进程创建的 RUNNER_TEMP 合成目录。既有 W8/W24 reader 为拒绝 live source 而检查 `pocketbase/pb_data` 的目录存在性/realpath；该目录内任何文件读取都被禁止。

网络保护仅允许 `127.0.0.1:5432` 的普通 TCP，拒绝 DNS、其它 TCP 端点、Unix socket、UDP、TLS、HTTP(S)、HTTP/2、fetch 和子进程。测试单独运行，保护保持至进程退出。清理仅删除 canonical RUNNER_TEMP 下当前 run 自己登记的 `w25-pg17-synthetic-<runId>-*` 目录，不扫描或删除其它目录。

## 合成来源与安装

每个 fixture 恰好四张 SQLite 表：

| 表 | 普通列与类型 |
| --- | --- |
| `studio_users` | `id TEXT`（两名合成来源用户） |
| `agent_specs` | `id TEXT, rh_user_id TEXT`（一条合成 spec） |
| `agent_runs` | W8 的完整 18 列：`id, rh_user_id, spec_id, spec_name, instruction, status, current_step, max_steps, model, config, spec_snapshot, result, error, checkpoint, evaluation, feedback, created, updated`；两个 step 列为 NUMERIC，其余 TEXT |
| `run_events` | W24 的完整 8 列：`id, run_id, step_index, seq, event_type, content, created, updated`；两个 index/seq 列为 NUMERIC，其余 TEXT |

主 fixture 只有一条 `status=running` 的历史 Agent run 和一条事件，含中文、emoji、换行、tab、长文本和带词法空白的空 JSON 文本。额外独立 fixture 验证 SQL NULL、文本 `null`、`{}`、`[]`，每个仍只有一条 run 和一条 event。真实 PG 的额外事务也逐一写入并回读这些 content 形式，最后 ROLLBACK，最终归档仍为一父一子。

所有源文件关闭后才计算 SHA-256，使用 DELETE journal，禁止 WAL/SHM/journal sidecar。文件为 0400、目录为 0700。完整 manifest 包含所有表与计数、snapshot bytes/SHA、W8 `history_archive_review` 的每行 contentHash、W24 `agent_run_events_archive_review` 的每行 contentHash 和 mapping SHA。两段 review 在导入父行前已最终定稿。身份映射使用 `studio-approved-identity-map-v2`，完整、一对一且每行带合成 reviewer 与时间。

独立生成的合成 OIDC evidence 含 runId、issuer、subject、目标 UUID、disabled 状态和逐行 review；目标用户预创建为 disabled。`legacy_user_imports` 绑定实际 snapshot SHA、mapping 文件 SHA、OIDC 文件 SHA、OIDC 逐行 contentHash，保留 `active_automatically=false`。这只是测试夹具中的审核证据，不调用真实 IdP，也不认证或激活任何用户。W24 对 OIDC 哈希仅检查格式和 crosswalk 存在；不能据此宣称真实身份审核已完成。

连接后先检查实际服务版本为 17.x、实际 session/superuser、TCP 地址/端口；要求没有用户表、其它用户 schema、已有 agentstudio schema 或 runtime/test roles。随后按原文安装：

1. `db/postgres/001_stage_schema.sql`（自身已含 011 所需 `pg_v8_005` 标记）。
2. `db/postgres/migrations/pg_v8_011_legacy_user_provision.sql`。
3. `db/postgres/migrations/pg_v8_012_legacy_run_history.sql`。
4. `db/postgres/migrations/pg_v9_015_legacy_agent_run_events.sql`。

仅移除 Node pg 不理解的 psql 反斜杠元命令；保留 SQL、BEGIN/COMMIT、版本/数据库/session 检查和所有约束，不替换实际版本或伪造查询结果。确认 vector extension 存在。若 W24 schema、reader 或 SQL 不兼容，应以固定 checkpoint 失败，由主线程分析修复；不得改迁移、绕过检查或用模拟 PASS 顶替。

## 真实数据库断言

- W8 导入父历史，再由 W24 导入子事件，完整回读原文、UTF-8 字节、canonical contentHash、三个 review hash、owner、父 ID、inert flags。历史 running 字符串不能创建可执行运行。
- 父/子同源 replay 的 imported/replayed/reconciled 报告正确，所有 agentstudio 表的完整行指纹不变；另一 snapshot/review 被拒绝。
- 直接 SQL 分别替换 snapshot、mapping、manifest、owner 和父 run ID，均由完整复合 FK 以 23503 拒绝。`run_source_table` 为 STORED generated column，手工指定其它来源以 428C9 拒绝。
- 缺失父归档、缺失/错误身份 crosswalk、来源 schema 漂移、额外/隐藏列、review 哈希不符、不支持 content、NUL 文本及篡改计划均拒绝，不跳过行。
- 两张归档表均 ENABLE/FORCE RLS、无 policy。独立非超级用户登录切换 API/Worker role，在空、随机、两名 owner actor 下测试无权限 CRUD/TRUNCATE。意外授予 CRUD/TRUNCATE 后仍不可读写：SELECT 零行，INSERT 被 RLS 拒绝，UPDATE/DELETE/TRUNCATE 被 statement immutable trigger 拒绝。最后撤回意外授权。
- DBA 的 UPDATE/DELETE/TRUNCATE 同样被 immutable trigger 拒绝。
- 在真实父 INSERT 完成后注入 `SELECT 1 / 0`，验证 22012、BEGIN→ROLLBACK、没有 COMMIT、父子归档为空、全库行指纹恢复；重试成功导入父行。随后在真实子 INSERT 完成后再注入 22012，验证子批事务回滚，已有父历史与全部其它行不变；重试成功。
- 父与子是既有 importer 的两个独立事务；子失败保留已提交父历史，测试不声称提供跨 importer 的统一事务。
- jobs/runs/steps/approvals/effects/leases/schedules/知识表等 runtime 表始终为空，两名目标用户始终 disabled。只产生 DBA 证据归档，没有运行、排队、模型执行或外部副作用。

失败只输出固定错误码/阶段 checkpoint；不输出原始异常、SQL values、连接配置、密码、SQLite 行、source_record 或原文哈希列表。数据库内容仅在内存中断言/计算指纹。

## 验证命令与结果解释

本地允许的验证（不连接数据库）：

```sh
node --check services/pg-api/tests/pg17-agent-run-events.integration.mjs
node --experimental-strip-types --test --test-name-pattern='^fail-closed:' services/pg-api/tests/pg17-agent-run-events.integration.mjs
```

主线程完成独立 CI wiring 后，在上述隔离 Linux job 中运行全文件，不要只筛选 fail-closed：

```sh
node --experimental-strip-types --test services/pg-api/tests/pg17-agent-run-events.integration.mjs
```

只有真实 TCP 主测试的所有断言和清理均完成后才打印：

```text
W25_PG17_AGENT_EVENTS_PASS real_tcp=true synthetic_only=true archive_only=true cutover=NO-GO
```

CI 必须同时要求命令 exit code 0 与这个精确成功标记；本地 guard 通过、测试被筛掉、缺少变量、连接失败或任意 checkpoint 失败都不能标记 W25 真实 PG17 PASS。

2026-10-15 本地记录：Node v24.14.1，`node --check` 通过，5/5 fail-closed 测试通过；没有运行真实 PG17、PGlite、全项目 check 或 PocketBase E2E（按本次限定仅做语法与 fail-closed 验证）。没有部署、生产数据操作、commit 或 push。真实 CI 结果由主线程后续补充，生产状态保持 **NO-GO**。
