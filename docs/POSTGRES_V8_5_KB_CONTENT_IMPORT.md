# V8.5 W6 — Knowledge Document / Chunk / Vector 冻结归档

状态：**stage-only / archive-only / 生产 NO-GO**。本模块不代表完整 KB 或 RAG 迁移，也不解除 W2 的内容阻断。

## 交付和依赖

仅新增以下文件，不修改 bootstrap、verify、package、CI、W1–W5 或 PG17 测试：

- `services/pg-api/src/stage-kb-content-import-source.ts`：离线 SQLite / manifest / 已批准身份映射读取器。
- `services/pg-api/src/stage-kb-content-import.ts`：参数化 SQL 事务导入、重跑、逐行对账。
- `services/pg-api/tests/stage-kb-content-import.test.mjs`：合成 SQLite + PGlite 测试。
- `db/postgres/migrations/pg_v8_010_legacy_kb_content.sql`：独立归档 schema、外键、权限及不可变触发器。
- 本文档。

必须已有 `pg_v8_007` / `legacy_knowledge_base_imports`。每个内容 base 必须存在**相同 snapshot SHA、相同 owner** 的 W2 crosswalk，并关联真实 `knowledge_bases`。另核对 W2 payload hash 与目标名称、描述、毫秒时间。缺失或漂移时零写入。

**当前 W2 只导入空 base，含 document/chunk/vector/ACL/queue/settings 的 base 仍被其 fail-closed gate 阻断。** W6 不补造 base、不自行插入 W2 crosswalk、不调用 W2 写入函数。故当前真实含内容快照依然无法完成端到端迁移；需集成负责人另行审查 W2 内容依赖协议。测试中的 W2 行仅是明确标注的未来状态合成夹具，不能当成解除生产阻断的操作步骤。

## 源表逐字段及目标

依据 `pocketbase/pb_hooks/modules/knowledge_schema.js`，模型引用另核对 `model_connections.js`、`knowledge_embedding.js`。

| SQLite 表 / source data ID | 所有原始字段 | PG 归档目标 |
| --- | --- | --- |
| `agent_studio_kb_documents` / `id` | `id, base_id, rh_user_id, filename, size_chars, chunk_count, created_ms` | `agentstudio.legacy_kb_document_archive` |
| `agent_studio_kb_chunks` / `id` | `id, base_id, document_id, rh_user_id, chunk_index, text_content` | `agentstudio.legacy_kb_chunk_archive` |
| `agent_studio_kb_vectors` / **`chunk_id`**，没有独立 vector ID | `chunk_id, rh_user_id, base_id, document_id, connection_id, model_name, dimensions, vector_json, indexed_ms` | `agentstudio.legacy_kb_vector_archive` |

每条源记录按固定字段顺序编码为 `raw_payload` **text**，其 UTF-8 SHA-256 存在 `payload_sha256`。向量的 `vector_json` 仍是原来的字符串，保留数组空白、指数写法、小数写法和负零；不会用解析后的数组覆盖原字符串。document 的 `created_ms`、vector 的 `indexed_ms` 保持源整数；chunk 没有源时间，不虚构时间。JavaScript 无法无损表达的整数、NUL 文本、未知/缺失列、错误类型会阻断，不截断或强制转换。

归档行另外存 `source_snapshot_sha256, legacy_id, legacy_base_id, owner_user_id, target_base_id`；chunk/vector 另存 `legacy_document_id`。`legacy_id` 就是源 ID；vector 使用源 `chunk_id`。目标内容 ID 是归档表中的 legacy text 主键，不伪造运行时 document/chunk UUID。`owner_user_id` 是审核映射得到的 PG UUID，`target_base_id` 只取 W2 crosswalk。

`legacy_kb_content_snapshots` 保存唯一源快照 SHA、已批准映射的安全字段及其 SHA、三个表的行数和有序 inventory SHA。映射仅保留 `old_id, new_studio_user_id, verified_by, approved_at` 及 schema/snapshot 绑定；不复制任意附加字段。inventory 对每行的 kind / ID / base / document / owner / 原始载荷 hash 作有序聚合。

其他源表的处理边界：

| 源表 | W6 行为 |
| --- | --- |
| `agent_studio_kb_bases` | 只读六个元数据字段，用于 owner / W2 payload / PG target 核对；不迁移 base |
| `studio_users` | 只读 `id`，要求所有员工都有一对一、已批准、绑定源快照的 UUID 映射 |
| `model_connections` | **只 SELECT `id,rh_user_id`**，核对 vector connection 引用与 owner；不读取 API key、token、URL 或模型配置，不建立可执行连接 |
| `agent_studio_kb_embedding_settings` | 不导入、不激活 |
| `agent_studio_kb_embedding_queue` | 不导入、不调度、不执行重试 |
| `agent_studio_kb_access`（含后加的 `semantic_allowed`） | 不导入、不授予共享或 semantic 权限 |
| `agent_studio_kb_access_events` | 不导入；需独立保真审计迁移 |

## 输入与阻断

`loadKbContentSnapshot({snapshot,manifest,mapping})` 只读离线 SQLite。拒绝 live `pocketbase/pb_data`（realpath 后比较）、输入路径重合、存在 WAL/SHM/journal sidecar、坏 manifest/hash、缺少必需表或行数、SQLite quick_check 失败。manifest 格式沿用 `agent-studio-sqlite-snapshot-v1`，要求 `sha256, bytes, tables`。必需表为 users、bases、model_connections、documents、chunks、vectors，即使内容为空也必须显式提供表和 count。对 manifest 列出的所有表核对 count，前后复验 SQLite SHA 和两份元数据，读取期间使用只读事务、关闭 trusted_schema。

mapping 格式沿用 `studio-approved-identity-map-v2`，要求 `source_sha256` 与 SQLite 一致；每条映射必须有有效 `verified_by` 和 UTC `approved_at`，且旧 ID / 新 UUID 不重复，不能遗漏或猜测身份。映射文件的审核仍由离线批准流程负责，本模块不签发身份。

每条 document/chunk/vector 都核对 owner→base、chunk→document、vector→chunk/document/base，以及 vector→同 owner 的 source connection。document 的 chunk_count 和 chunk 序号唯一性也必须一致。缺失关系、跨 tenant、维度与数组实际长度不一致、非有限数字向量必阻断。每个内容表上限 100000 行；当前按完整快照在内存中对账，超过限制需另行审查分批协议，不能静默切片导入。

加载器返回冻结的进程内 batch；importer 仅接受该进程内加载器验证过的对象，拒绝 JSON 反序列化、复制或自行构造的 batch。不要打印 batch、raw_payload 或 SQLite 内容。

集成入口（`reviewedStagePool` 是调用方提供的 `contracts.ts` 中 `SqlPool` 接口，不在此处创建网络连接）：

```typescript
import {loadKbContentSnapshot, importKbContentArchive} from './stage-kb-content-import.ts'
const batch = loadKbContentSnapshot({snapshot: offlineBackupPath, manifest: manifestPath, mapping: approvedMapPath})
const report = await importKbContentArchive(reviewedStagePool, batch)
// report 只有计数和 stage/archive/RAG/cutover 标志，不含原文或身份信息。
```

## DBA SQL 与事务边界

DDL 由 DBA 在隔离 stage 显式执行；文件内有自己的事务，不自动部署。它和 importer 都严格要求数据库名 `agentstudio_stage`、版本 PG17、session/current role 都是 `agentstudio_admin`，且该登录必须是 superuser。importer 不创建连接、没有网络 CLI；集成方只能供应另行审查的本地隔离 stage `SqlPool`。本次实现和测试未连接任何 TCP PostgreSQL。

归档四表撤销 PUBLIC / API / Worker 全部权限，开启且 FORCE RLS，没有普通角色 policy。不加入普通 RAG 查询，不向 API/Worker 授权。所有表拒绝 UPDATE / DELETE / TRUNCATE，包括普通 DBA 的这些 SQL 操作；INSERT 触发器检查 DBA 身份，内容表另校验 W2 owner/target。层级复合外键包含 snapshot / base / document / owner / target，阻止跨 tenant 串联。superuser 可有意改 DDL 或禁用触发器，因此该边界不能对抗恶意 DBA。

一次导入在同一个 BEGIN/COMMIT 中：

1. 检查 PG17/DB/role 与 migration markers，设置本地 lock / statement timeout。
2. 锁定 jobs、users、bases、W2 crosswalk 的写入，并串行化归档表写入；如果有 queued/leased job 就拒绝。
3. 核对 W2 snapshot / owner / metadata / target。不同 W2 源快照即拒绝。
4. 首次插入快照审计与 document→chunk→vector；只使用参数化 SQL。已有归档时只允许完全一致的 source/inventory/mapping/count 重跑，不做 UPSERT 覆盖。
5. 读取三个归档表全部行，核对各表 count、每行 SHA、snapshot、owner/target 及总 inventory SHA，全部一致才 COMMIT。

任何失败回滚整批；SQL 错误输出仅安全 code，不返回可能包含原文的 PG diagnostics。若 ROLLBACK 本身失败，返回 `kb_content_rollback_failed`，需人工核对连接/事务状态。相同快照重跑返回 replay 数；不同 snapshot、修改后的审核映射或内容 hash 都拒绝。数据库锁是串行化机制，真实 PG17 多连接并发/超时行为仍需 W4 验证。

已经 COMMIT 的归档不能用 DELETE 清理；恢复或撤销需另行批准的 disposable stage 数据库重建/备份恢复流程。这里没有清库命令，也没有修改或删除源数据的命令。

## 向量与 RAG 明确界限

现有 `knowledge_chunks.embedding` 是 `vector(1536)`。W6 完全不写 `knowledge_documents` / `knowledge_chunks`，不把未知 mime/object_key/源文件 hash 伪造为已完成文档，不转换向量类型，也不把归档向量暴露给普通检索。任意合法旧维度（测试使用 3）仅存归档原文，绝不补零、裁剪或调用模型重算。即使是 1536 维也仅归档；后续 RAG 激活必须另行批准转换、ACL、provider/模型兼容与功能等价性。

## 本地验收

运行 W6：

```powershell
node --experimental-strip-types --test services/pg-api/tests/stage-kb-content-import.test.mjs
```

测试只用合成 SQLite 和内存 PGlite，无模型调用、无 Docker/云资源、无真实业务数据。PGlite 0.5.9 实际是 **PG18.6 WASM**：测试夹具只将 DDL 的 DB 名/版本条件改成其本地值，并适配 importer 的目标探针；DBA 身份检查、权限、RLS、触发器、外键和业务 SQL 真实执行。产品源码仍严格 PG17。**不得把这些结果宣称为真实 PG17 TCP 验收。**

已覆盖：数组原文/原始毫秒/ID 保真、逐行 hash/count、幂等、不同快照和已批准映射变化拒绝、缺失 W2、跨 tenant、W2 元数据漂移、缺关系、坏 schema/vector、manifest/mapping 篡改、sidecar、PG17/DB/admin gate、活动 job 阻断、插入中途失败/读后校验失败整批 rollback、API/Worker 权限、强制 RLS、不可变操作。

2026-10-15 本次本地结果：W6 **8/8**；原项目单测 **84/84**；PG API `tsc -p services/pg-api/tsconfig.json --noEmit`、前端 `tsc -b`、Vite build、production pilot bundle isolation 均通过。

`pnpm check` / `pnpm test:e2e:parallel` 在此会话的 pnpm/Corepack 启动环境失败（默认 shim 试图联网，缓存 pnpm 的脚本 shell 启动也失败），未安装依赖或修改配置。实际单测与构建通过直接 Node 调用原 package script 对应工具完成。直接执行标准 E2E runner 又因项目外 `D:\Downloads\agentstudio-ci-*` 的 mkdtemp 被沙箱 EPERM 阻断；随后**仅在内存中**把 runner 的临时目录 parent 改成项目 `.tmp/w6`，保持 19 项测试清单和两 worker 调度逻辑，完成 **19/19 PASS，90.3 秒**。没有改写 runner 文件。结果不应记录为原始 pnpm 命令直接成功。

真实快照试迁移、W2 内容协议、真实 PG17 TCP 权限/多连接并发、ACL 与 embedding settings/queue 的保真迁移、RAG 转换及正式切换仍是未完成依赖。保持 NO-GO。
