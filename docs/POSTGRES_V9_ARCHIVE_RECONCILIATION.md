# V9 W21 — SQLite 源逐行归档对账

状态：synthetic-only / isolated staging / admin-only；生产 **NO-GO**。
当前运行时仍是 PocketBase/SQLite + 既有 Node Worker。本实现不证明运行时
RAG、向量检索、ACL 或模型队列等价性，也不激活历史 embedding queue。
W20 的既有 PG17 CI 记录不构成本次 W21 的真实 PG17 验收证据。

## 范围与调用

仅修改 `services/pg-api/src/stage-reconciliation.ts`、其
`tests/stage-reconciliation.test.mjs`，并新增本文档。无 CI、package、SQL、
Operator、Workflow UI 或其他源码修改；不部署、不访问公司数据库、不 commit/push。

继续使用已有 `reconcileStage(input, explicitlyApprovedStageAdminPool)`。
没有新增连接配置、环境凭据读取、CLI、HTTP 或 Worker 入口。
离线文件审批及冻结检查在连接前执行；pool 只获得一个连接，在唯一的
`BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY` 内完成所有目标读取，
最终 `ROLLBACK` 并释放连接。保留既有清理失败的固定错误报告。
目标守卫仍要求数据库 `agentstudio_stage`、PG17 (170000–179999)、
session/current role 均为 superuser `agentstudio_admin`、事务 readonly=on，
并要求 queued/leased jobs 为零。目标 SQL 只有 SELECT 和事务边界，
没有 INSERT/UPDATE/DELETE、LOCK、SET、导入参与者调用或 COMMIT。

## 源证据与完整性

- 沿用 W9 的源文件 SHA256、manifest 字节数/逐表计数、审批、一对一身份映射、
  sidecar、`pb_data` 路径、SQLite quick_check 和读前/读后文件 hash 检查。
  新增所有非 SQLite 内部表必须出现在 manifest 的检查，不能遗漏未列出的表。
- 复用 W16 `loadKbEmbeddingStateSnapshot`、W6 `loadKbContentSnapshot`。
  有 embedding 源关系时，必须先得到 W16 reader 签发的 batch 才能读组合 W6。
  无 embedding 源关系时仍支持普通 W6 reader。只准备只读证据，绝不调用 importer。
- 这些 reader 检查精确白名单/hidden/generated 列、源字符串原始 BLOB 与 UTF-8
  往返字节、NUL/非法 UTF-8、安全整数、原始 row key、owner/base/document/chunk/
  connection 关系、向量维度及 document chunk 数量；不另写宽松解析器。
  未知 `agent_studio_kb_*` 关系使归档 reader 证据不可用，不会默默忽略。
- 用户仅投影身份字段，model_connections 仅投影 id/owner；不读取或复制密码、
  API key、URL/模型连接配置。W16 沿用其危险文本拒绝规则，不以脱敏修改代替保真。

## 单一 PostgreSQL 快照中的核验

W6 三个源域各自对应 document/chunk/vector archive；W16 settings/queue 两个
源域独立报告，共享 embedding snapshot/base refs 的错误会阻断两个域。

1. 每个归档 snapshot 表必须唯一且同 source SHA；规范批准 mapping 全文、其
   UTF-8 SHA256、reader inventory SHA256 必须完全一致。W6 三项 header count
   也必须与源逐行 batch 一致。归档全表读取，不过滤掉无关 snapshot 来掩盖额外行。
2. W6 核对完整 W2 base crosswalk、base owner、target base、源 metadata hash，
   每个 owner 必须唯一存在于目标 users；base 映射必须完整、唯一且同源。
   W16 核对完整 base refs 的原 owner、新 owner、base、source SHA 和唯一性。
3. 每个源 row key 必须恰好对应一个归档行；全表行数、唯一 key 数、legacy ID、
   owner、source SHA、base/document/target base 引用逐项核对。vector legacy ID
   仍是源 chunk_id；W16 row ID 仍是源主键 JSON 数组，且逐字比较。
4. `raw_payload` 必须与严格 reader 输出的 lexical JSON **全文相等**；同时重新计算
   UTF-8 bytes SHA256，比较源 hash、目标 hash、目标 bytes hash。JSON 值等价但
   空白/键顺序改变仍失败；仅重算被改文本的 hash 不能绕过检查。
5. 文档归档失败向 chunks/vectors 传播，chunk 归档失败向 vectors 传播，防止
   子域在父归档缺失/篡改时独立声称完整。行索引用 Map，避免归档逐行匹配的平方扫描。

## 输出与兼容性

W21 核验路径在每个源域的原有结果上增加：

```json
{
  "domain": "agent_studio_kb_chunks",
  "source_count": 1,
  "target_count": 1,
  "archive_count": 1,
  "archive_integrity_verified": true,
  "association_anomalies": 0,
  "status": "unsupported",
  "blockers": ["archive_only_live_unsupported"]
}
```

`archive_count=null` 表示不能安全检查该归档，不是零。
源表不存在时 `source_count=null`，绝不推断为源空表。
任何归档 schema、源 reader、snapshot/hash、owner、映射、引用、缺行、多行或唯一性
错误都会令对应域 `failed` / `archive_integrity_verified=false`。
即使五个域全部保真，也永远不会返回归档域 `success`。

固定脱敏错误包括 `archive_schema_missing`、`archive_source_invalid`、
`archive_snapshot_mismatch`、`archive_base_mapping_invalid`、
`archive_count_mismatch`、`archive_duplicate_row`、`archive_row_missing`、
`archive_association_invalid`、`archive_payload_mismatch`、
`archive_parent_invalid`、`archive_unknown_domain`。
报告不包含正文、向量值、ID、owner UUID、文件路径、reviewer、凭据或 SQL diagnostics。

为保留 W9 真实 PG17 旧合成测试契约，存在一个明确的未核验兼容分支：三个 W6
源表都是零行且只有历史测试的 `id` / 可选 `private_payload` 骨架列、没有 embedding
源表、没有未知 KB 关系，且 W6 snapshot/归档表无任何行时，沿用原六字段 inventory
结果及 `unsupported / archive_only_live_unsupported`，不添加 verified 字段。
这不接受真实源字段的宽松解析，也不提供任何归档保真证据；任一归档证据行都会
退出该分支并进入严格失败/核验路径。未出现 W16 源表且未安装 v8_013 时不新增
W16 结果，保留旧 16 域报告；新组合源报告增加两个独立域。
消费端必须只把显式 `archive_integrity_verified === true` 识别为归档保真。

离线 plan 仍是 source inventory，不声称目标验证；当存在 W16 源表时也显示其计数。

## 隔离合成验证

测试只使用自己创建的临时 SQLite 和内存 PGlite，pool mock 仅提供
PG17/stage/admin identity probe；真实 SQL、BEGIN/ROLLBACK 与只读事务实际执行。
PGlite 是 WASM PostgreSQL 环境，**不是 PG17 TCP 验收**。测试 schema 有意不加归档
FK/immutable trigger，以便制造真实 SQL 的 owner/FK/唯一性损坏并验证对账主动发现，
并非依赖约束代替核验。既有生产 schema/守卫没有修改。

覆盖：五域 good bytes、中文/emoji/空白/vector lexical JSON、历史 attempts/lease/next
保留而 jobs 不变；修改正文、hash、owner、legacy ID、父引用、缺失 documents、
额外行/唯一 extra ID、重复 key、异源/重复 header、mapping 冲突、base refs 漂移；
重算 hash 的 JSON 重排；未知字段/关系、非法 UTF-8/NUL、manifest 漏表；普通 W6
无 W16 源时的三域验证；W9 骨架空库存契约和出现证据后退出兼容分支。
保留 W9/W11 的身份、网络陷阱、只读 SQL allowlist、无副作用及清理失败测试。

在项目根目录，以 D 盘现有 `.tmp` 为 TEMP/TMP/TMPDIR：

```powershell
$env:TEMP=Join-Path (Get-Location) '.tmp'
$env:TMP=$env:TEMP
$env:TMPDIR=$env:TEMP
& 'C:\Program Files\nodejs\node.exe' --experimental-strip-types --test services/pg-api/tests/stage-reconciliation.test.mjs services/pg-api/tests/stage-reconciliation-cli.test.mjs
& 'C:\Program Files\nodejs\node.exe' services/pg-api/node_modules/typescript/bin/tsc -p services/pg-api/tsconfig.json --noEmit
```

不执行生成构建产物的根 `pnpm check` 或启动 PocketBase/Worker 的
`pnpm test:e2e:parallel`，遵守本次三个文件所有权及纯隔离归档任务范围。
本次没有连接真实 PG17，也没有复用公司连接串；真实 PG17 W21 验收仍待后续独立执行。

本地结果：上述 reconciliation + CLI 合计 **24/24 PASS，0 fail / 0 skip**；
pg-api 全量 TypeScript noEmit 通过，限定文件 `git diff --check` 通过。
