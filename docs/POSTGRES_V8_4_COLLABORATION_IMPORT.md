# W5 团队共享与协作权限历史隔离归档

状态：**staging-only，生产 NO-GO，真实共享权限启用数为零**。本模块不是团队 RBAC 迁移完成声明；不注册 HTTP 路由，不启动 Worker，不连接 PocketBase 或任何生产端点。

## 文件与接入

本次仅交付以下四个文件，不修改共享 schema、verify、package scripts、CI 或其他迁移模块：

- `services/pg-api/src/stage-collaboration-import.ts`
- `services/pg-api/tests/stage-collaboration-import.test.mjs`
- `db/postgres/migrations/pg_v8_009_legacy_collaboration_import.sql`
- `docs/POSTGRES_V8_4_COLLABORATION_IMPORT.md`

遵守 AGENTS.md、CLAUDE.md、roundtrip skill 和并行迁移契约；当前仓库为独立 fork，不生成回传原 VibeX 应用的 ZIP，不更改平台标识。

集成负责人需在独立且获准的 `agentstudio_stage` PG17 环境先完成 005、007，再审核和应用 009。本次没有实际运行数据库迁移。009 使用 `BEGIN/COMMIT`、数据库名/版本/超级管理员校验及 baseline 校验；再次执行不会重复版本记录或归档表。初始化 schema 和 package scripts 留给集成负责人，W5 不编辑。

代码只提供两个库入口：

```ts
const plan = prepareCollaborationImport(snapshotPath, manifestPath, approvedMappingPath)
const report = await importLegacyCollaborationsToStage(isolatedAdminPool, plan)
```

这里的 pool 必须由隔离环境提供。本模块没有生产连接配置、密码读取或可执行导入 CLI。不要输出 plan，其中包含私密历史及身份映射；report 仅返回数量和禁用状态，不返回 ID 或正文。

## 已研究的源结构与保真边界

源定义依据 `pocketbase/pb_hooks/agent_collaboration.pb.js`、`pocketbase/pb_hooks/modules/knowledge_schema.js` 和 `pocketbase/pb_hooks/knowledge_access.pb.js`。

| 源表 | 归档内容与行为 |
| --- | --- |
| `agent_studio_spec_access` | spec、owner、member、原 role、创建/更新时间，绝不授予 viewer/editor |
| `agent_studio_kb_access` | base、owner、recipient、role、semantic_allowed、时间，绝不激活语义共享 |
| `agent_studio_spec_proposals` | author/reviewer、base_hash、完整原始 proposed_spec_json 字符串、comment、status、审核时间；不接受、不重放提案 |
| `agent_studio_kb_access_events` | 原 action/role、参与人和事件时间，包括 revoke 和 semantic 历史 |
| `agent_studio_spec_collab_audit` | actor/member、proposal_id、action、发生时间 |
| `agent_studio_spec_revisions` | actor、kind、proposal/source_revision 引用、spec_hash、原始 safe_spec_json 字符串、note、时间 |

对六表执行 `SELECT *`，按严格列清单保留完整 source_record。旧 KB 表尚未添加 `semantic_allowed` 时，保留字段缺失状态，不补造值。其他列缺失、未知列、未知 `agent_studio_spec_*` / `agent_studio_kb_access*` 历史表均阻断，不静默忽略。提案/修订 JSON 保留原始字符串，不解析或规范化；不向新配置写入内容。

每条关系包含已批准映射的 owner 和全部非空 actor/member/author/reviewer/recipient UUID，以及源记录哈希、快照哈希、批准 mapping 文件字节 SHA256、目标资源及 crosswalk payload 哈希。源无显式 ID 的授权采用资源和成员组合的确定性 SHA256 key；有 ID 的历史采用原 ID 的确定性 key，原 ID 同时保留在 source_record。重复 key 阻断。

## 校验与阻断

只接受无 WAL/SHM/journal sidecar 的离线 SQLite 文件；拒绝项目 `pocketbase/pb_data`（含其真实路径），不对任意未知外部路径作“必然离线”的保证。操作者必须提供一致性备份，不能把运行中的数据库改名后提交。

使用 `agent-studio-sqlite-snapshot-v1` manifest，校验文件 bytes、SHA256、quick_check、逐表计数，以及必需的 users、Agent、KB 和六类历史表。读取前后重复验证快照、manifest、mapping 三文件哈希，最多 20,000 条历史。manifest 本身不是数字签名；文件及审核记录的交付来源仍需操作者核验。

身份文件必须是绑定同一 source_sha256 的 `studio-approved-identity-map-v2`：15 位旧用户 ID、合法且唯一的新 UUID、verified_by、approved_at 均需有效；覆盖快照全部 studio_users，禁止猜测或自动创建身份。归档需要的所有身份在 PG 中必须存在且 active。空 reviewer，以及非授权历史中的空 member，可按旧表语义保留为空；其他未映射身份（包括已删除员工）整批阻断，待人工处理。

每条源资源必须存在且 owner 与关系一致。PG 必须有同一快照、同一 owner 的 `legacy_agent_imports` 或 `legacy_knowledge_base_imports`；目标必须 private、无 team_id。重新计算目标关键字段的 canonical payload 哈希并与已有 crosswalk 对账，检测内容/指针篡改。W5 不补造 Agent/KB crosswalk。当前 W2 对含 ACL 的 KB 自动导入仍可能阻断；W5 不绕过该限制，缺少 crosswalk 时依赖待集成负责人处理。

归档计划仅能由进程内私有 WeakMap 签发，克隆/伪造计划无效，写前检测内容改动并同步拷贝。所有新写入在同一事务中完成，检查 PG17、数据库名 `agentstudio_stage`、session_user `agentstudio_admin` 和 superuser；锁定归档、资源 crosswalk、资源表及用户表，失败全量回滚。其他快照或 mapping 文件哈希与已有归档冲突则拒绝，不允许混批。写后逐条核对 owner、目标、源/映射哈希、正文哈希和禁用状态；总数必须与全批一致。同一快照/映射完整重跑为 replay，不接受子集覆盖。

## 隔离与待人工复核

`legacy_collaboration_imports` 本身同时是关系归档及迁移 crosswalk，使用 owner 外键和资源+owner 复合外键。它不是 RBAC 授权来源，不写 `teams`、`team_memberships` 或资源 visibility，不创建真实共享。permissions_enabled 在 SQL 中强制为 false，review_status 只能为 pending_manual_review；UPDATE/DELETE/TRUNCATE 由触发器拒绝，包括超级管理员正常 SQL。超级管理员仍可修改 DDL/禁用触发器，不能据此声称抵御恶意 DBA。

归档撤销 PUBLIC/API/Worker 的全部权限，启用并 FORCE RLS，且没有放行 policy。owner 或 member 也不能通过普通 API 查询归档。即便误授 SELECT，RLS 仍返回零行。新 PG 资源沿用 private 和原 owner；仅有旧 member 身份不会获得资源访问。

**每一行都显式列为人工复核**：`legacy_permissions_disabled`、`manual_rbac_review_required`；含 role 的行另标记 archived_role_requires_review，语义 consent 另标记 semantic_consent_not_activated。未知 role/action/status/kind 作为历史原值保存，绝不解释为有效授权。提案和修订的历史引用另标记 historical_links_require_review：已删除的 proposal/revision 引用原样保留，W5 不声称已解析这些历史对象关系。不存在/错误 owner 的资源关系和未映射身份则不允许归档。

本模块不迁移组织/团队定义，不推导团队成员关系，不启用共享、提案审批或历史重放。未来启用权限必须另行设计并审核正式 RBAC，不能修改本归档为 enabled。

## 本地验证报告

全部仅使用合成数据、本地 SQLite 和内存 PGlite；没有读取真实离线快照或真实身份 mapping，没有连接生产或运行 Docker。

Windows 默认 TEMP 指向不可写的系统目录，首轮测试因 `mkdtemp EPERM` 失败；改为项目目录的临时测试文件夹后运行，测试结束删除各自创建的合成文件。

运行命令（PowerShell，显式 Node 路径用于本环境 PATH）：

```powershell
$env:TEMP=$PWD.Path
$env:TMP=$PWD.Path
& 'C:/Program Files/nodejs/node.exe' services/pg-api/node_modules/typescript/bin/tsc -p services/pg-api/tsconfig.json --noEmit
& 'C:/Program Files/nodejs/node.exe' --experimental-strip-types --test --test-reporter=tap services/pg-api/tests/stage-collaboration-import.test.mjs
```

W5 合成测试覆盖：六表原值保真及零授权、完整重跑幂等、第三条写入失败全批回滚、读回篡改回滚、owner/member 缺失/禁用、缺失资源 crosswalk、源 owner 错配、crosswalk payload 篡改/跨 owner、伪造/修改计划、快照/计数/批准 mapping 篡改、sidecar、未知列/历史表、重复 key、错误数据库/角色/版本、API/Worker deny、误授 SELECT 后 RLS、归档不可修改/删除/截断。

2026-10-15 最终结果（Node v24.14.1，PGlite 嵌入 PostgreSQL 18.6）：

| 检查 | 结果 |
| --- | --- |
| PG API TypeScript `tsc -p services/pg-api/tsconfig.json --noEmit` | exit 0，无诊断 |
| 最终 W5 独立测试（含 BLOB 类型异常阻断） | 10/10 通过，0 失败/跳过，35,936.2492 ms |
| W5 + 原 W3 + 原 W1 顺序联合回归 | 27/27 通过，0 失败/跳过，87,148.1436 ms；其中 W3 9 项、W1 8 项 |
| `git diff --check` | exit 0 |
| 真实 PG17 TCP / 多连接验收、真实快照差异对账 | 未执行，NO-GO |

联合回归命令：

```powershell
& 'C:/Program Files/nodejs/node.exe' --experimental-strip-types --test --test-concurrency=1 --test-reporter=tap services/pg-api/tests/stage-collaboration-import.test.mjs services/pg-api/tests/stage-workflow-import.test.mjs services/pg-api/tests/stage-schedule-import.test.mjs
```

联合运行的 W5 部分完成后，补充了源值类型/重复用户校验与通用预检错误脱敏，并再次独立运行最终 W5 10 项和 TypeScript，均通过。未执行整个应用的 pnpm check 或 PocketBase E2E；本次变更没有前端、现有运行流程或 PocketBase hook 修改。并发会话对共享文件的改动未由 W5 修改或撤销。

PGlite 自身数据库名、登录角色及嵌入 PG 版本不满足正式 guard：测试先确认原始 009 被拒绝，再仅替换环境 guard 常量以测试 DDL；导入 pool 只模拟环境身份查询，其余 SQL、事务、外键、权限和 RLS 均由 PGlite 执行。**这不是实际 PG17 TCP 多连接、生产权限或正式数据验收。**
