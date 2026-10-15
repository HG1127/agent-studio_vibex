# V8.9 W17 — PG17 embedding settings / queue 冻结归档验收

状态：**synthetic-only / DBA-only / stage-only / archive-only；cutover=NO-GO**。

本轮只新建本文件与 `services/pg-api/tests/pg17-kb-embedding-archive.integration.mjs`。
已阅读根目录 AGENTS.md、CLAUDE.md、W16 的
`docs/POSTGRES_V8_9_KB_EMBEDDING_ARCHIVE.md`、原始 importer、v8_013 SQL
以及 `pg17-kb-content-stage.integration.mjs` 的隔离规范。通过 `.git/HEAD`
只读核对分支为 `migration/postgres-v8-6-staging-20261015`；本机 PATH 无 git，未运行 Git 操作。
不修改现有文件、package、CI、SQL、Git 配置或 workflow 画布。

## 测试入口和连接前门禁

入口是独立 node:test 进程，不从其他集成测试 import。默认拒绝，不能静默 skip 后声称验收成功。
真实测试仅接受下列全部条件；纯环境校验与 RUNNER_TEMP 实路径校验先于动态导入
pg、node:sqlite、W16 importer，以及任何 PG TCP、fixture 写入。

| 项目 | 必须值 |
| --- | --- |
| process.platform / RUNNER_OS | linux / Linux |
| GITHUB_ACTIONS | true |
| RUNNER_ENVIRONMENT | github-hosted（拒绝 self-hosted） |
| GITHUB_RUN_ID | 1–32 位十进制数字，无空白 |
| AGENT_STUDIO_PG17_TEST_ENABLED | true |
| AGENT_STUDIO_PG17_W17_EMBEDDING_ARCHIVE_TEST_ENABLED | true，独立 W17 marker |
| AGENT_STUDIO_PG17_EPHEMERAL_ISOLATED | true |
| AGENT_STUDIO_PG17_HOST / PORT | 127.0.0.1 / 5432，无 DNS、Unix socket、替代端口 |
| AGENT_STUDIO_PG17_DATABASE | agentstudio_stage |
| AGENT_STUDIO_PG17_ADMIN_USER | agentstudio_admin |
| AGENT_STUDIO_PG17_ADMIN_PASSWORD | synthetic-agentstudio-pg17-ci-${GITHUB_RUN_ID}- 后接随机 32 字节小写 hex，64 字符中至少 12 种字符 |
| RUNNER_TEMP | 已存在、可写可遍历、规范绝对实路径目录；拒绝符号链接、非目录、根目录、项目内目录及项目祖先目录 |

这些环境条件是防误用门禁，不能证明远端资源的来源。主线程仍须保证新建独立
GitHub-hosted 临时容器，没有真实数据卷、真实凭据或其他作业共享数据库。
Pool 显式固定 host/port/database/user/password、ssl=false、options=''；不读取连接 URL。
进程网络守卫只允许 127.0.0.1:5432 的 TCP，阻断外部 TCP、DNS、UDP、HTTP(S)、HTTP2、
TLS、fetch 和子进程；守卫保留到关闭连接和清理完成。它是本测试的误用防线，不是恶意代码沙箱。

连库后再次核对真实 PG17（170000–179999）、stage 库、session/current role 均为
superuser agentstudio_admin、TCP 服务端口 5432。服务端地址可能是 GitHub 容器地址，
客户端地址由 Pool 和 socket 守卫固定。拒绝任何现有非系统关系、非 public 用户 schema、
agentstudio schema 或预先存在的 API/Worker/W17 测试登录角色。之后原样执行
`db/postgres/001_stage_schema.sql` 与 `db/postgres/migrations/pg_v8_013_legacy_kb_embedding_state.sql`，
只剥离 psql 元命令，不替换版本/库名/权限守卫；验证 vector 扩展存在。
不运行 W2/W6，不绕过它们对非空 embedding state 的拒绝。

## 合成数据与真实 PG17 断言（待 CI 实测）

- 在 RUNNER_TEMP 自己 mkdtemp 的 0700 目录创建 SQLite；studio_users 两人、bases 两个、
  model_connections 两个，分别归属 A/B。仅 settings 一行与 queue 一行，均为 A 的历史状态。
  model 名、last_error 含空白、中文、emoji、换行和惰性 SQL/HTML 字符；没有调用模型。
- 完整枚举所有非 sqlite_* 表与行数，manifest 绑定整个文件的 SHA256 与大小；
  studio-approved-identity-map-v2 同源映射覆盖两人，包含 reviewer/UTC approval。
  PG 预配两个随机 UUID disabled users，不创建可用连接、业务知识库、运行时 embedding queue 或 job。
- fixture 文件冻结为 0400；reader 前后及测试结束比较原始文件哈希、大小、mtime、权限、
  实路径与 sidecar 缺失。合成秘密哨兵放在源 password/api_key/base_url，验证不进入 batch。
- 实际调用 `loadKbEmbeddingStateSnapshot` 与 `importKbEmbeddingStateArchive`；
  两 owner 的 base refs、批准映射、inventory/hash、源表/复合键/owner/base、原文 JSON TEXT、
  每行 SHA256 均核对。三个 historical_* 字段验证为 TEXT 与精确十进制字符串。
  另生成同源完整 manifest 的坏快照，分别把 A 的 base/connection 指向 B，reader 必须整批拒绝。
- 用代理 pool 将 SQL 委托给真实 PG17。在 queue INSERT 前读取同一事务计数，
  必须已经写入 audit=1、base refs=2、settings=1；随后真正执行 `SELECT 1 / 0`，
  捕获 SQLSTATE 22012。要求 BEGIN → ROLLBACK、没有 COMMIT、三归档表归零、
  所有 agentstudio 表内容 fingerprint 恢复，再使用原 verified batch 重试成功。
  不是 JS 模拟 SQL 错误，也不替换 PG 身份查询。
- 同一快照重新 load 后 replay imported=0/replayed=2，数据库 fingerprint 不变；
  另一个随机合成快照拒绝 source_or_payload_conflict，克隆伪造 batch 拒绝，内容不变。
- 三表 ENABLE+FORCE RLS、无普通 policy；独立 NOSUPERUSER/NOBYPASSRLS/NOINHERIT 登录切换
  API 和 Worker，空 actor、未知 actor、两个 owner 均不能 SELECT/INSERT/UPDATE/DELETE/TRUNCATE。
  临时误授 SELECT 后，各 actor 对三表仍可见 0 行，finally 撤销授权。
- DBA UPDATE/DELETE/TRUNCATE 必须拒绝；单表 TRUNCATE 可由 PG FK 防线先拒绝，
  对三表一起 TRUNCATE 则必须触发 immutable_embedding_archive。
  最终 audit 与归档 fingerprint 不变，jobs/runs/知识库/文档/chunks/schedules 等运行表为 0，
  runtime model_connections 与 embedding queue 表不存在。

只打印固定验证状态、测试名与脱敏 checkpoint，不输出源文本、凭据、路径、UUID 或业务 ID；
PG diagnostics 与 assertion diff 在真实路径被统一捕获。仅全部断言和清理成功后打印：

```text
W17_PG17_EMBEDDING_ARCHIVE_PASS real_tcp=true synthetic_only=true archive_only=true cutover=NO-GO
```

清理仅递归删除本进程登记、已核对实路径及前缀的合成 mkdtemp 目录；关闭两个 pool。
不 DROP/restore 数据库或 schema；由 GitHub 销毁整个独立临时服务。

## 主线程接入 CI 的契约（本轮没有执行或修改 CI）

为 W17 建立独立的 Linux GitHub-hosted job，使用 Node 24（需支持 node:sqlite、
--experimental-strip-types、module.registerHooks），安装仓库锁定依赖。
使用 `pgvector/pgvector:pg17` 的独立临时服务，主线程可进一步固定镜像 digest。
容器必须只绑定 `127.0.0.1:5432:5432`，不加载任何项目 SQL init 文件或真实数据卷，
不复用其他 PG17 测试 job 的服务。官方镜像初始化环境为：

```text
POSTGRES_DB=agentstudio_stage
POSTGRES_USER=agentstudio_admin
POSTGRES_PASSWORD=<本 job 随机的、符合上述 runId 格式的密码>
```

密码须在创建服务之前以 CSPRNG 生成（例如 Node randomBytes(32).toString('hex')），
禁止 shell trace 或打印。若使用 job services 的初始化阶段无法引用前一步动态密码，
可由主线程在 job step 中先生成并 mask 密码，再创建独立临时容器；不要改为常量密码。
服务 readiness 完成后把上述连接门禁变量注入单独的测试进程，执行：

```sh
node --experimental-strip-types --test services/pg-api/tests/pg17-kb-embedding-archive.integration.mjs
```

CI 应同时要求 exit=0 和完整固定 W17 PASS 行，不接受只跑 `^fail-closed:` 的结果作为真实
PG17 验收。不要将合成 SQLite、manifest/mapping、日志原始数据库诊断或容器数据卷上传为 artifact。
不添加真实 snapshot 参数或读取公司 PocketBase 目录。该步骤完全是归档测试，不是生产迁移。

## 本轮本地证据与缺口

2026-10-15 Windows / Node 24.14.1。本机仅运行下列两条命令，没有 pg/SQLite/importer
动态导入、数据库连接、模型请求或真实公司数据读取：

```powershell
& 'C:\Program Files\nodejs\node.exe' --check services/pg-api/tests/pg17-kb-embedding-archive.integration.mjs
& 'C:\Program Files\nodejs\node.exe' --experimental-strip-types --test --test-name-pattern='^fail-closed:' services/pg-api/tests/pg17-kb-embedding-archive.integration.mjs
```

语法检查 exit=0；本地 fail-closed **4/4 PASS、0 fail、0 skip**。覆盖逐项缺失/非法环境值、
平台、密码/runId、路径门禁、子进程入口拒绝以及网络/写入/敏感模块导入陷阱。
子进程强制模拟 Linux 平台并给定其他有效门禁，确认单独禁用 W17 marker、非法 host/password、
不存在的 RUNNER_TEMP 都在任何敏感导入、写入或 socket 前拒绝，且没有 W17 PG17 PASS。
路径分支使用只读 mock 验证，不创建本地临时目录。

**尚无真实 PG17 PASS 证据**：上述真实 SQL、事务、权限/RLS、重试与重放断言均待主线程接入
独立 CI 后实测。没有运行 pnpm check / pnpm test:e2e:parallel，因为本轮明确只允许语法和
不接库 fail-closed 测试；没有以 PGlite 或伪造 PG 身份替代真实验收。
即使 W17 后续 PASS，真实数据归档审批、备份、迁移编排、员工 UAT 和生产切换仍未获本轮授权；
**NO-GO 保持**。
