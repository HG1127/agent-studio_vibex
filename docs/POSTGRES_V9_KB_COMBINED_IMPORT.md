# V9 W18 — 同源 W2 + W6 + W16 原子归档导入

状态：**synthetic-only / DBA-only / stage-only；生产 NO-GO**。尚无真实 PG17 TCP 验收证据。PocketBase/SQLite 与现有 Worker 仍为当前运行时。

## 入口及权限边界

新增 `services/pg-api/src/stage-kb-combined-import.ts`，仅提供显式离线 reader 与 pool 注入：

```ts
const batch = loadKbCombinedSnapshot({snapshot, manifest, mapping})
const report = await importKbCombinedAtomic(approvedStagePool, batch)
```

没有 CLI、环境连接串读取、自动连接、HTTP、模型请求或 Worker 启动。pool 必须由经批准的隔离 DBA 集成提供。本次没有接入 stage-operator、package 或 CI，也没有部署、commit 或 push。

reader 先调用 W16 reader 验证完整 manifest、SQLite 文件 SHA256、离线常规文件和 sidecar、完整一对一审核 UUID mapping、settings/queue 精确字段及所有 owner/base/connection 引用。W16 原有 WeakSet 中的深度冻结 batch 同时作为凭据。W6 仅在该对象确由 reader 签发且 SHA256 一致时跳过 embedding settings/queue 两个关系的非空阻断；读取后再比较规范批准映射全文。不同 SHA、修改 mapping、普通对象、JSON 复制或布尔标志均不能授权。

W6 的 ACL/access_events 阻断保留；组合路径额外拒绝未知 `agent_studio_kb_*` 关系，严格白名单字段通过 `table_xinfo` 检查 hidden/generated 列。字符串与 SQLite 原始 BLOB 比对，拒绝 NUL 截断或无法无损表示的 UTF-8。base 元数据、document/chunk/vector 的 owner、引用、计数及向量合法性检查继续执行。模型连接仅投影 id/owner，不读取凭据。

组合 batch 只有冻结的 snapshot 字段，内容保存在模块私有 WeakMap；复制 batch 无法导入。所有 base（包括空 base）被标为关联域且记入 W2 阻断表，去掉标志也不能作为普通 W2 元数据导入。普通 `loadKbContentSnapshot(options)` 仍拒绝非空 settings/queue；普通 W2/W6 atomic 入口额外拒绝由 W16 凭据签发的 content batch，必须使用组合入口。

## 唯一事务与幂等

组合入口只获取一个连接，唯一 `BEGIN`，按 W2、W6、W16 顺序调用三个参与者，全部安全回读通过后唯一 `COMMIT`。任何 SQL、目标守卫、审核身份、完整性或回读失败均执行同一连接的 `ROLLBACK`。ROLLBACK 失败单独报告 `kb_combined_rollback_failed`，不声称回滚成功；连接最终释放。对外错误使用固定代码，不泄露 SQL diagnostics 或源正文。

W2 的原始 `importMetadataInTransaction` 保持 private；新增凭 verified content batch 才能调用的事务参与者。W16 提取 `archiveKbEmbeddingStateInTransaction`，不 BEGIN/COMMIT/release；原 `importKbEmbeddingStateArchive` wrapper 保持自动 BEGIN/COMMIT/ROLLBACK 行为。W6 直接复用已有 `archiveKbContentInTransaction`。

目标必须是 `agentstudio_stage`、PG17（170000–179999）、session/current role 均为 superuser `agentstudio_admin`。事务锁住 jobs/users、W2 crosswalk/runtime bases、W6 及 W16 全部归档表；沿用确定锁顺序与本地超时，各参与者继续检查 schema 和 queued/leased jobs=0。缺少预配 UUID owner 时拒绝，不创建用户。

开始写入前，三个域必须同时无导入审计，或同时已有审计；预先仅导入 W2/W6/W16 的部分状态拒绝，须独立审核处理。各域在锁内检查同一个 source SHA、批准 mapping、payload/inventory hash 与完整回读。相同源与审批重放三域 imported 均为 0；不同源或同源审批变化拒绝并保持原状态。不会把一个域的重复识别当作跳过另一个域的依据。

SQL/schema 无修改。metadata 继续私有 owner RLS；冻结归档保留 FORCE RLS、无 API/Worker policy/权限以及 SQL 不可变触发器。历史 queue 仅是 `legacy_kb_embedding_state_archive` 中的惰性 JSON TEXT 和 historical_* TEXT；不创建活动任务、队列消费者、租约、运行时文档/块或调度。

## 合成验收

仅使用测试临时目录中的合成 SQLite 和内存 PGlite；没有连接宝塔、生产 PocketBase 或 Neon。TEMP/TMP/TMPDIR 指向项目 `.tmp`，测试只清理自己创建的 mkdtemp 目录。

新增 `services/pg-api/tests/stage-kb-combined-import.test.mjs` 覆盖：

- 2 base（一个空 base）、1 document、1 chunk、1 vector、1 settings、1 queue，完整 SHA/owner 回读、原始毫秒及历史 TEXT；唯一事务与三域重复幂等。
- W16 最后 queue INSERT 前确认已有计数 `[2,2,1,1,1,1,1,2,1]`，执行真实 `SELECT 1/0`。ROLLBACK 后 W2/W6/W16 九张表均为 0，随后重试成功。
- W16 读回污染与 COMMIT 前故障同样全部回滚；ROLLBACK 失败明确报告，测试自行清理故意遗留事务。
- W2 第二个 base 和 W6 chunk INSERT 的真实 SQL 故障同样回滚全部域，拒绝只完成前半批。
- 普通 W2/W6、伪造/复制/不同 SHA token、ACL、跨 owner、未知关系/字段、generated 列、NUL、错误 SHA/manifest/mapping 和 sidecar 拒绝。
- PG17/stage/admin 守卫、实际合成 queued job 阻断、缺目标 owner 和部分域状态拒绝；异源和审批变化不改变持久化 fingerprint。
- owner RLS、API/Worker 归档权限为零；误授 SELECT 后普通 owner 仍看不到归档。正常导入 jobs/runs/schedules/runtime documents/chunks=0；网络 fetch/socket/HTTP(S) 陷阱无触发，无秘密哨兵入库。

本地命令（Node 24.14.1）：

```powershell
$env:TEMP=Join-Path (Get-Location) '.tmp'
$env:TMP=$env:TEMP
$env:TMPDIR=$env:TEMP
& 'C:\Program Files\nodejs\node.exe' --experimental-strip-types --test services/pg-api/tests/stage-kb-combined-import.test.mjs services/pg-api/tests/stage-kb-content-import.test.mjs services/pg-api/tests/stage-knowledge-base-import.test.mjs
& 'C:\Program Files\nodejs\node.exe' --experimental-strip-types --test services/pg-api/tests/stage-kb-embedding-state-import.test.mjs
& 'C:\Program Files\nodejs\node.exe' services/pg-api/node_modules/typescript/bin/tsc -p services/pg-api/tsconfig.json --noEmit
```

PGlite 是 WASM PG18。测试只替换 migration 中的数据库名/版本探针并在注入 pool 中提供合成 PG17 identity；其余事务、SQL 故障、约束、RLS、权限与触发器实际执行。此结果不能替代真实 PG17 DBA 验收。真实 PG17 CI 由后续主线程添加。

本地验收：W18 **7/7**、既有 W2/W6 **13/13**、W2 metadata **4/4**、W16 **9/9**，共 **33 项通过、0 fail、0 skip**。W18 涉及的已跟踪源码 `git diff --check` 通过。

pg-api TypeScript noEmit 前两轮 exit=0；末轮被工作期间新增的范围外文件 `services/pg-api/src/stage-kb-combined-import-cli.ts:48` 阻断（TS2345：`string | undefined` 不能传给 `string` 参数）。该文件不在本任务六文件所有权内，本任务未创建或编辑它，因此最终全量类型检查状态是 **未通过**，须由该文件所有者修复后重跑。

随后使用与 pg-api tsconfig 相同的 compiler options，仅以 `src/stage-kb-combined-import.ts` 为根检查其完整依赖图，exit=0；本次组合入口与 W2/W6/W16 依赖的类型检查通过。这不替代上面的全量检查结果。

本轮不运行 `pnpm check`（写入构建产物）和 `pnpm test:e2e:parallel`（启动 PocketBase/Worker），遵守本次六文件所有权及不启动 Worker 的范围。没有修改 SQL、CI、package、stage-operator、其他测试或 Workflow UI；工作区原有其他改动保留。生产切换、真实数据迁移和 UAT 仍为 **NO-GO**。
