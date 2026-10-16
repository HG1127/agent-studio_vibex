# W8：历史 Agent 单表归档闭环（NO-GO）

分支：`migration/postgres-v8-6-staging-20261015`。本次仅实现 `agent_runs` 的受限安全白名单归档。未连接任何真实 PocketBase、宝塔、Neon 或公司生产数据库；未执行旧模型、工具、任务；未 commit/push。没有生产迁移或真实 PG17 验收结论。

## 实际 schema 调研与范围

本地实际定义来自 `pocketbase/pb_hooks/agent_runs.pb.js`、`workflow_runs.pb.js`、`run_events.pb.js`，不是不存在的 `pb_migrations`。离线快照实际列集合仍须逐次核验，不把 hooks 定义当成真实快照已通过的证据。

| 来源 | 已核对结构与含义 | 本次状态 |
| --- | --- | --- |
| `agent_runs` | id、rh_user_id、spec_id、spec_name、instruction、status、current_step、max_steps、model、config、spec_snapshot、result、error、checkpoint、evaluation、feedback、created、updated | 仅以下安全子集可整表归档 |
| `workflow_runs` | workflow_id/name、graph_snapshot、checkpoint、result/error、done_nodes/total_nodes 等 | 未迁 |
| `run_events` | run_id、step_index、seq、event_type、content、created/updated；owner 需经父 run 推导 | 未迁 |
| `agent_studio_side_effects` | `modules/runtime_schema.js`：kind/run_id/step_key、tool_name、args_hash、idempotency_key、started/succeeded/unknown、result_text、created_ms/updated_ms | 未迁，绝不重放 |
| `agent_studio_run_leases` / `agent_studio_execution_spans` | runtime_schema 中租约、监控轨迹 | 未迁，不复活租约 |
| 旧审批 | `agent_engine.pb.js` 使用 checkpoint.pending_approval / approval_decision 与 approval_pending 事件 | 未转换成 PG approvals |

PG 当前 `001_stage_schema.sql` 的 `runs` 绑定 Agent/Workflow 与 owner，`jobs` 驱动调度，`approvals` 绑定决策身份与 step，`external_effects` 是执行防重账本。旧 succeeded 文本无法证明这些新执行约束，故本次完全不写这些表。

## 可运行接口与最小路径

仅新增以下四个文件，不修改共享 bootstrap/schema、package.json、CI 或 W1–W7：

- `db/postgres/migrations/pg_v8_012_legacy_run_history.sql`
- `services/pg-api/src/stage-history-import.ts`
- `services/pg-api/tests/stage-history-import.test.mjs`
- 本文档。

独立 migration 是由 DBA 在另行授权的隔离 stage 执行的源文件，本次测试只在内存 PGlite 应用。migration 和 importer 均检查数据库 `agentstudio_stage`、PG17、`agentstudio_admin` superuser。没有新增网络连接器、环境默认连接、CLI execute、API 路由或 Worker 注册。

模块导出 `prepareHistoryImport(snapshotPath, manifestPath, mappingPath)` 和 `importLegacyHistoryToStage(sqlPool, plan)`。前者只读冻结 SQLite 并签发进程内 WeakMap 绑定的计划，后者通过现有 SqlPool 接口原子归档；伪造、克隆、修改计划均拒绝。调用方负责提供经批准的隔离 stage 连接，模块不读取数据库密码或自动创建连接。

## 保真与 fail closed

源必须是 `agent-studio-sqlite-snapshot-v1` manifest 校验通过的独立 SQLite，一律拒绝项目 `pocketbase/pb_data`、WAL/SHM/journal；读前后复核三份输入 SHA256，检查 quick_check 和 manifest 所列每张表的行数。强制 manifest 包含 studio_users、agent_specs、agent_runs。读取 users 仅 SELECT id，读取 specs 仅 SELECT id,rh_user_id，不读取认证字段、模型连接或 API key 表。

严格要求上述 agent_runs 18 列全部存在且无多余列，1–5000 行，15 位来源 ID；spec_id 必须存在并与旧 owner 相同。用户身份仅接受绑定源 SHA256 的 `studio-approved-identity-map-v2`：完整 studio_users ID 覆盖、有效 UUID、verified_by、UTC approved_at，无源/目标碰撞。PG owner 必须 active，或具有同快照 W7 disabled identity crosswalk；后者额外核验 legacy ID、target UUID 和 exact mapping SHA256，不激活员工。

本次 structured JSON 字段 `config/spec_snapshot/checkpoint/evaluation/feedback` 只接受 SQLite NULL 或解析为空对象、空数组、JSON null 的原始字符串。非空结构可能包含连接凭据、嵌套引用或执行恢复状态，因此整批拒绝；不丢字段、不截断、不静默脱敏、不跳行。未知 owner、悬空/跨 owner spec、未知列、非法数字、NUL 或超出文本上限同样整批阻断。普通文本完整保留空格、换行及 Unicode；超过 2,000,000 字符拒绝而非截断。

任意文本均可能含无法通过模式可靠识别的凭据。除明显 password/API key/token/Bearer/JWT/private key 特征阻断，还必须由有权审核者确认无凭据，并在 manifest 增加如下审核对象（不得用脚本自动视作批准）：

```json
{
  "history_archive_review": {
    "source_sha256": "<frozen SQLite SHA256>",
    "table": "agent_runs",
    "credentials_absent": true,
    "verified_by": "<authorized reviewer>",
    "approved_at": "2026-10-15T00:00:00Z",
    "row_sha256": ["<contentHash of exact SQLite raw row>"]
  }
}
```

`row_sha256` 必须完整且无重复地覆盖整张 agent_runs；哈希算法使用既有 `contentHash`（递归排序对象键的 SHA256），保留 SQLite JSON 列的原始字符串。snapshot SHA256 绑定源字节，mapping SHA256 绑定实际 v2 文件，manifest SHA256 同时绑定计数与内容审核。审核是受信任离线输入，不是数字签名认证；regex 不是秘密检测完备性保证。缺失审核或未能确认安全时拒绝导入，不落含疑似凭据的档案。

## 归档、对账与执行隔离

`agentstudio.legacy_run_history` 同时作为 crosswalk 和 source JSON archive：稳定 archive UUID、唯一 legacy ID、快照/manifest/mapping/payload SHA256、owner FK、完整 source_record、导入时间。`source_table=agent_runs`、`evidence_status=historical_unverified`、`executable=false` 有数据库 CHECK。原 status=succeeded 只存在 source_record 中，不产生新运行已完成的语义。

一批一个 BEGIN/COMMIT，锁 archive/users，逐行核对 owner 和全部 provenance、重算 source_record payload hash，最终总行数完全一致才提交；任何 SQL/对账失败 ROLLBACK。重跑同一快照/审核/map 返回 replayed 且 UUID 不变；不同快照、mapping 或审核 manifest 与已有 archive 冲突即拒绝。不允许在已有批次上悄悄增补/替换来源。

表撤销 PUBLIC/API/Worker 所有权限，ENABLE + FORCE RLS 且无允许策略；测试验证即使额外 GRANT SELECT，两个运行角色也读不到。UPDATE/DELETE/TRUNCATE trigger 阻断误改，包括常规 DBA SQL；超级用户仍能通过 DDL 绕过，数据库层不能防御恶意 DBA，需按运维权限治理。导入不写 runs、jobs、run_steps、approvals、external_effects、run_leases，不执行 HTTP 或模型。只输出无正文的汇总；SQL/文件错误转换为固定错误码。

## 验证与后续阻断

独立验证命令（依赖已存在，无安装）：

```powershell
$env:TEMP = Join-Path $PWD '.tmp'
$env:TMP = $env:TEMP
$env:TMPDIR = $env:TEMP
node --experimental-strip-types --test services/pg-api/tests/stage-history-import.test.mjs
node services/pg-api/node_modules/typescript/bin/tsc -p services/pg-api/tsconfig.json --noEmit
```

测试只生成合成 SQLite 和内存 PGlite；stage 数据库名/管理员/版本在测试适配器中显式模拟，实际 SQL、事务、RLS、触发器、外键和回滚均由 PGlite 执行。不得将此写成真实 PG17 TCP 权限与并发验证通过。覆盖全文保真、源字节未变、稳定重跑、二行中途崩溃、读回篡改、计数不符全回滚、schema drift、owner/引用、review/map/hash 冲突、secret 阻断、API/Worker 不可读写、不可变约束。

本次结果：W8 独立合成测试 **6/6 通过**，PG API TypeScript `--noEmit` **通过**，`git diff --check` **通过**。当前全局 pnpm check / pnpm test:e2e:parallel 启动受 Corepack 下载 pnpm 的网络 EACCES 阻断，未据此声称全套通过。C: 默认 TEMP 不可写，W8 使用已有项目 `.tmp`。未修改包管理器配置或安装依赖。

完整 Workflow/events/side_effects/approvals 历史、非空 Agent JSON 的安全引用转换，以及真实 PG17 TCP 事务/权限/并发验收尚未完成；本次不是完整 W8 历史迁移，维持 NO-GO。后续扩展必须逐表冻结 schema、安全字段与 owner 引用链，不得因 archive 已存在而开放 API、Worker 或恢复运行。
