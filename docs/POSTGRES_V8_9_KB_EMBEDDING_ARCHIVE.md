# V8.9 W16 — 旧 embedding 设置与队列冻结归档

状态：**synthetic-only / DBA-only / stage-only / archive-only；生产切换 NO-GO**。

本次仅创建以下四个文件，不修改现有 importer、schema、package、CI、前端或 Git：

- `db/postgres/migrations/pg_v8_013_legacy_kb_embedding_state.sql`
- `services/pg-api/src/stage-kb-embedding-state-import.ts`
- `services/pg-api/tests/stage-kb-embedding-state-import.test.mjs`
- 本文。

工作分支只读核对为 `migration/postgres-v8-6-staging-20261015`。工作区另有其他改动，本任务没有编辑或回退它们。没有 commit、push、部署、连接宝塔或真实数据库，没有读取真实 PocketBase 文件。

## 数据与引用

依据 `knowledge_schema.js` 的原始定义，settings 的真实主键是 `rh_user_id`；queue 的真实主键是 `(rh_user_id,base_id)`。归档的 `legacy_row_id` 分别编码为 JSON 数组 `[原owner]` 和 `[原owner,原base]`，不伪造源行 ID。

SQLite reader 使用 `readOnly:true`、`query_only=ON`、`trusted_schema=OFF`，从离线快照读取：

| 源表 | 唯一允许的原始字段 |
| --- | --- |
| `agent_studio_kb_embedding_settings` | `rh_user_id,connection_id,model_name,updated_ms` |
| `agent_studio_kb_embedding_queue` | `rh_user_id,base_id,attempts,next_attempt_ms,lease_until_ms,last_error,updated_ms` |

两表缺失、增列（包括 generated/hidden 列）、缺列、缺 owner、无批准映射、重复真实主键、非整数/负数/超过 JS 安全整数范围都 fail-closed。不会过滤坏行后部分成功。所有字符串保留空白、换行、中文、emoji；用原始 BLOB 字节与 UTF-8 字节比对，拒绝 Node SQLite 可能截断的 NUL 文本或不能无损表示的编码。字符串存在 URL、常见 credential 标记或 NUL 时拒绝整批，不做静默脱敏替换。这里不声称通用文本检测器能够识别所有不带标记的秘密。

settings 的 connection_id 必须确实引用同一个旧 owner 的 `model_connections`。只投影该表的 `id,rh_user_id`，从不读取 api_key、URL 或配置列，也不创建可用连接。model_name 和 connection_id 原值仅进入归档 TEXT，不解析、不解析引用为运行时连接。

queue 的 base_id 必须在同一 SQLite 快照的 `agent_studio_kb_bases` 中存在且属于同一个旧 owner。base 只投影 `id,rh_user_id`，存入独立的 `legacy_kb_embedding_base_refs`；它们不是 runtime knowledge_bases，不引入 name/description 或目标 UUID，不改变原 W2/W6 crosswalk。

这个独立引用层是必要的：现有 W2/W6 reader 仍拒绝非空 embedding settings/queue，不能先让它们绕过门禁以构造 W16 前置条件。W16 不依赖这种绕过，也不承诺统一迁移器已经支持这两表。本任务文件所有权禁止修改统一 importer；未来集成必须显式调用 W16，并保留 W2/W6 的阻断或另行批准组合迁移。

## 快照与批准身份映射

输入是三个互不相同的常规文件 `snapshot,manifest,mapping`。拒绝符号链接/非规范路径、仓库真实 `pocketbase/pb_data` 内文件及 WAL/SHM/journal sidecar。最大 snapshot 512 MB、metadata 各 5 MB；base/settings/queue 各最多 100000 行。读取结束再次核对源 SHA、manifest/mapping 原文和 sidecar，源文件没有写入。

manifest 格式与既有导入器一致：`agent-studio-sqlite-snapshot-v1`，包含整个 SQLite 文件的 SHA256、字节数以及全部非 `sqlite_*` 表的准确行数。遗漏、附加不存在的表或行数不符均拒绝。只对其他源表读取行数，不归档其正文；W16 不是完整业务快照迁移。

mapping 为 `studio-approved-identity-map-v2`，绑定同一个 `source_sha256`。每个 studio_users 必须有一条一对一映射：`old_id,new_studio_user_id,verified_by,approved_at`。UUID 格式、审核人和 UTC 时间必填。保存按旧 ID 排序、字段投影后的规范批准映射全文及其 SHA256。所有目标 UUID 必须已经存在于 PG users，缺一即拒绝；不预配用户。归档中的 owner 来自批准映射，绝不使用任意请求头身份。

`raw_payload` 是固定源字段顺序生成的原始字段 JSON **TEXT**，不是原 SQLite 页的逐字备份。数值保持安全整数精确值，字符串原值保留；每行保存 SHA256、源 SHA、source_table、真实复合键、旧 owner、新 owner UUID。整个 bases/rows 清单有独立 inventory SHA，读回逐项重算校验。

## PG17 与不可执行性

SQL 迁移和导入器都要求 `current_database()=agentstudio_stage`、PG17（170000–179999）、session/current role 均为 superuser `agentstudio_admin`。迁移要求 `pg_v8_005`；导入要求 `pg_v8_005` 与 `pg_v8_013`。数据库名称门禁不能替代部署隔离，集成人仍须提供独立的 staging 实例。

迁移和导入器都在锁定 jobs 后要求 queued/leased 数量为 0。导入事务锁定 users 与三个归档表，防止前置校验到写入之间发生并发改变。SQL 目标只有：

- `legacy_kb_embedding_snapshots`：单一源审计、inventory/mapping 哈希、批准映射。
- `legacy_kb_embedding_base_refs`：旧 base/owner 与批准 UUID 的同源引用。
- `legacy_kb_embedding_state_archive`：两张源表的冻结原文与行哈希。

三表均 ENABLE + FORCE RLS，没有普通角色 policy，撤销 PUBLIC/API/Worker 全部权限。owner 自己也无法读取。即使将来误授 SELECT，API owner 和其他 owner 仍看到 0 行。触发器拒绝非 DBA INSERT，以及所有 UPDATE/DELETE/TRUNCATE；这是正常 DBA/API/Worker 权限模型下的不可变性，不声称能防止 superuser 主动移除保护。

SQL 层独立检查 source table、mapping SHA/source/字段、批准 owner UUID、raw SHA、原始字段白名单/类型、真实主键及 owner/base 复合 FK。settings 的源 connection 归属由签发 batch 的离线 reader 校验，不会在 PG 中建立可调用连接。

queue 的 `attempts,next_attempt_ms,lease_until_ms` 保留在 `raw_payload` 文本中，并生成 `historical_attempts,historical_next_attempt_ms,historical_lease_until_ms` 三个 **TEXT** 列。没有到 timestamp、租约对象、runtime job 的转换，没有调度索引、消费入口或激活状态。last_error 中的 SQL/HTML/脚本字符作为绑定参数保存，没有 eval、shell、动态代码执行或浏览器展示。

模块只提供两个入口：`loadKbEmbeddingStateSnapshot({snapshot,manifest,mapping})` 和 `importKbEmbeddingStateArchive(approvedStagePool,batch)`。没有 CLI/自动连接/环境 URL 读取/模型 SDK/Worker 启动；直接执行脚本（包括 `--apply`）固定返回 `kb_embedding_archive_no_cli_execution`，exit=1。pool 由未来经过批准的 DBA 集成显式提供。

reader 用进程内 WeakSet 签发深度冻结的 batch；普通对象、JSON 复制或附加标志不能导入。一次 BEGIN 中插入审计、base refs、settings 和 queue，再读回核验全清单，最后 COMMIT。相同 SHA/映射/清单重跑返回 imported=0；异源、批准映射变更或读回差异拒绝。任何 SQL/核对失败均 ROLLBACK，错误仅返回固定代码，不输出原 SQL diagnostics、源文本或连接参数。

## 本地合成验收

2026-10-15，Windows，Node **24.14.1**。本机 PATH 未含 Node，命令使用 `C:\Program Files\nodejs\node.exe`；TEMP/TMP/TMPDIR 指向已有项目 `.tmp`。测试只创建并清理自己 mkdtemp 的合成 SQLite，PGlite 使用内存数据库，没有外部数据库连接。

```powershell
$env:TEMP=Join-Path (Get-Location) '.tmp'
$env:TMP=$env:TEMP
$env:TMPDIR=$env:TEMP
& 'C:\Program Files\nodejs\node.exe' --experimental-strip-types --test services/pg-api/tests/stage-kb-embedding-state-import.test.mjs
& 'C:\Program Files\nodejs\node.exe' services/pg-api/node_modules/typescript/bin/tsc -p services/pg-api/tsconfig.json --noEmit
& 'C:\Program Files\nodejs\node.exe' --experimental-strip-types --test services/pg-api/tests/stage-kb-content-import.test.mjs
```

专项结果：**9/9 PASS，0 fail、0 skip**；pg-api TypeScript 全量 noEmit 检查 exit=0。既有 W2/W6 `stage-kb-content-import.test.mjs` 回归 **13/13 PASS，0 fail、0 skip**，包括非空 embedding state 仍被原 reader 拒绝，未放宽统一链路门禁。

| 专项 | 实测断言 |
| --- | --- |
| settings + queue | 至少各 1 行，真实键/owner/source/raw/hash 保真，原模型名称尾空格、中文、emoji、错误文本和毫秒整数保持一致 |
| 无激活 | 正常导入后 jobs/runs/knowledge_bases/documents/chunks/schedules 为 0；网络 fetch/socket/HTTP(S) 陷阱无触发；连接秘密哨兵不进入 batch |
| 源拒绝 | 缺 base/connection/owner、跨 owner、未知/隐藏列、错误类型、安全整数溢出、NUL、URL/credential 标记 |
| 快照拒绝 | SHA、完整 manifest/计数、批准映射/缺 owner/UUID、重复映射、三种 sidecar |
| 原子性 | settings 已在事务内插入后 queue 前执行真实 SQL 除零，三归档表全部回滚；读回污染、COMMIT 前故障也回滚；之后可重试 |
| 重放 | 同源幂等，异源/同源审批变更拒绝，持久化 fingerprint 不变 |
| 目标守卫 | 非 stage/admin/superuser/PG17、schema 不符、active jobs、PG 未预配 owner、伪造 batch 拒绝 |
| 权限 | 三表 FORCE RLS；DBA UPDATE/DELETE/TRUNCATE 拒绝；API/Worker 即使设置 owner 仍无权限；误授 SELECT 后所有普通 owner 可见 0 |
| SQL 与脚本 | SQL 直接拒绝错误 hash/table/key/额外字段/跨 owner/base；payload SQL/HTML 脚本保持惰性；模块直接执行拒绝 |
| 迁移门禁 | 原样生产 SQL 在 PGlite 非 PG17/stage 环境真实失败；仅测试适配版本/库名后，真实合成 queued job 阻断 DDL |

PGlite 本身是 WASM PG18。**仅测试**把 migration 的 PG17/库名探针替换为 PGlite 实际值，pool 的 server identity 查询返回合成 PG17；其余 SQL、事务、约束、权限、RLS、触发器真实执行。原始 SQL 和导入器 PG17 守卫不放宽。这些结果不是 PG17 TCP 验收证据。

本轮未运行 `pnpm check` 和 `pnpm test:e2e:parallel`：前者包含生成 dist/构建产物，后者启动 PocketBase/Worker 并在项目外创建隔离目录；本任务限定四文件所有权与本地 PGlite/SQLite 专项范围。没有修改 package/CI 来接入新测试。真实 PG17 DBA 路径、审批后的真实快照操作、统一导入编排及生产迁移仍需独立授权和验收；**NO-GO 保持**。
