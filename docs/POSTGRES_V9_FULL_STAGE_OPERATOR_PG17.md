# W20 — 统一 stage-migration-operator 真实 PG17 合成验收

状态：**2026-10-15 W20 真实 PostgreSQL 17 GitHub CI 已通过，本地防误连 7/7 通过，生产与切换仍为 NO-GO。** 验收记录：https://github.com/HG1127/agent-studio_vibex/actions/runs/38718001907

该测试在 W19 联合事务验收基础上，独立验证真正的统一 operator 执行路径。代码已推送到 `migration/postgres-v8-6-staging-20261015` 开发分支，原 W20 CI 仅涉及测试脚本和 CI 契约，不修改原始 PocketBase、宝塔、公司 Neon、Workflow UI 或生产 `main`。

## 安全边界与前置门禁

真实入口 `PG17 TCP: W20 unified identity + Agent + combined KB + W9, NO-GO` 首先检查环境，之后才核验真实 RUNNER_TEMP，随后生成合成输入、动态导入 pg/node:sqlite/业务模块和连接数据库。

| 条件 | 必须值 |
| --- | --- |
| process.platform / RUNNER_OS | linux / Linux |
| GITHUB_ACTIONS / RUNNER_ENVIRONMENT | true / github-hosted |
| GITHUB_RUN_ID | 1–32 位数字，不含空白或换行 |
| AGENT_STUDIO_PG17_TEST_ENABLED | true |
| AGENT_STUDIO_PG17_W20_FULL_STAGE_TEST_ENABLED | true |
| AGENT_STUDIO_PG17_EPHEMERAL_ISOLATED | true |
| AGENT_STUDIO_PG17_HOST / PORT | 127.0.0.1 / 5432；PORT 不可缺省 |
| AGENT_STUDIO_PG17_DATABASE / ADMIN_USER | agentstudio_stage / agentstudio_admin |
| AGENT_STUDIO_PG17_ADMIN_PASSWORD | synthetic-agentstudio-pg17-ci-<runId>-<64位小写hex>，hex 至少 12 种字符 |
| RUNNER_TEMP | runner 实际提供的已存在规范绝对目录，可写可遍历、非根、非符号链接，与项目互不包含 |

拒绝代码为 `refuse_non_ephemeral_pg17_full_stage`。环境不合规时，在测试主动文件 I/O、数据库导入或 socket 前拒绝；RUNNER_TEMP 的 realpath/stat/access 是环境通过后的首次文件检查，不可能在不读取文件系统的情况下证明目录真实性。离线拒绝探针把 realpath/stat/lstat/写操作、数据库模块导入及 socket 全部设为陷阱，验证错误环境先被拒绝。路径的真实目录、符号链接、权限和项目包含关系另有注入 I/O 的离线检查。

Pool 显式固定 TCP 地址、数据库、用户、合成密码，ssl=false、options 空、max=1 和超时，不读取 DATABASE_URL/PGHOST。连接后实际查询 PG17 版本（170000–179999）、session/current superuser 身份、数据库名、TCP 服务地址和端口。服务报告容器内地址可接受，客户端始终固定 127.0.0.1:5432。

DDL 之前拒绝已有 agentstudio schema、任何用户关系、额外非系统 schema，以及 API/Worker/W20 登录角色。空 stage DB 条件由真实 SQL 核验，失败绝不 DROP、清空或覆盖。仅执行现有 `001_stage_schema.sql` 与 006–013 迁移，去除 psql 反斜杠指令，不改 SQL 正文或守卫；检查 vector 扩展和 005–013 版本记录。没有手工预配目标员工，身份必须由 operator 第一阶段创建。

网络 guard 在真实数据库访问前安装，贯穿父进程、operator 和所有后代。只允许 127.0.0.1:5432 TCP；拒绝 DNS、UDP、TLS、HTTP(S)、HTTP2、fetch。拒绝 exec/execFile/spawn/fork 等命令能力；唯一 spawnSync 例外为当前 Node 的固定 operator、identity、Agent、combined、W9 五个入口，禁用 shell。此例外用于实际 operator 进程链，不允许运行外部命令或 Worker。

子进程环境重新构造，仅含 PATH/LANG、合成输入所需开关、固定 stage 地址、密码文件路径和测试 guard NODE_OPTIONS。guard 再以键白名单检查所有后代环境。生产凭据、PG*、DATABASE_URL、NODE_PATH、继承的 NODE_OPTIONS 均不传递。密码只来自本次合成密码文件。

operator 原始 `GITHUB_ACTIONS=true` 真实数据 CI 阻断保持不变，并有离线回归。只有由测试生成、冻结并验证过的合成 fixture 调用才设置 child `GITHUB_ACTIONS=false`；父进程始终 true。不能把该例外用于外部输入或实际公司 SQLite。不是抗恶意 runner 的 OS 沙箱或加密 IdP 审批认证。

## 单一快照与统一链路

输入全部在 RUNNER_TEMP 本次 `w20-pg17-synthetic-<runId>-*` 目录中从零生成，不读取任何 PocketBase 数据目录、宝塔、Neon 或外部备份。目录 0700；snapshot、manifest、mapping、OIDC、approval 五个输入最终 0400；guard 和合成密码文件 0600。SQLite 使用 DELETE journal，检查无 WAL/SHM/journal；输入反复核验真实路径、无符号链接、权限、大小、mtime、SHA256。清理只删除本次记录且验证过的临时目录，不删数据库或其他文件。

同一 SQLite 的 11 表包括：2 个 studio_users、1 个安全 Agent spec、2 个 model_connections、2 个不同 owner 的 KB base（第二个为空）、各 1 个 document/chunk/vector/settings/queue、空 access/access_events。用户与连接中放入合成凭据哨兵。向量词法、Unicode 文本、历史 queue 的 attempts=7、next_attempt_ms=1792030400456、lease_until_ms=1792030499999 均保留。

manifest 包含全部表精确行数、完整 SQLite SHA 和字节数。v2 mapping、已审核 OIDC、source approval 均绑定同一 SHA；两个独立随机 UUID owner、issuer/subject 对应两个源员工。OIDC 的审核字段是合成审批证据，未实际访问 IdP 或证明审核人身份。

实际通过 `stage-migration-operator.mjs --execute --confirm-isolated-stage agentstudio_stage --allow-partial-trial`，要求阶段严格为：

```text
identity → agent → knowledge_combined → reconciliation
exit: 0       0          0                   2
```

首次 identity 创建 2 个 disabled 用户、Agent 导入 1 条、combined metadata/content/embedding 导入 2/3/2。同源第二次对应 replay 为 2、1、2/3/2，imported 全零。operator 脱敏摘要只暴露部分 combined 字段，guard 在其裁剪之前验证真实 CLI 完整回执的六个计数、source SHA 和 source_read_only/archive_only/no-RAG/no-embedding/no-ACL/jobs=0。

每阶段回执 SHA 必须等于实际 `--snapshot` 文件字节哈希；不能只比较声明字符串。operator 报告、身份与 Agent crosswalk、KB metadata crosswalk、W6/W16 快照及归档记录均核对同一源 SHA。

## 真实 PG17 断言

以下断言已在独立的 GitHub-hosted PostgreSQL 17 合成服务上实际执行并通过，见上方验收记录。**这不是公司真实数据或生产功能等价的证明**：

- 在任何导入前，跨 owner queue/base、跨 owner chunk、非空 ACL、Agent 的非空 knowledge_base_ids 都必须使整个 operator preflight 阻断，schema 行内容 fingerprint 不变。最后一项是当前 Agent 的明确 unsupported 功能，正向样本的 Agent 不激活 KB 引用。
- 真实读回两个 disabled OIDC 用户及审核 mapping/IdP SHA、Agent spec/时间/owner/payload SHA；KB metadata 两个 owner、private、空 team_id、毫秒时间和 crosswalk hash 必须逐字段一致。
- 文档、块、向量归档 raw_payload 逐字等于源 JSON，payload SHA、target base、legacy base/document、owner 和 source SHA 全部一致。W6/W16 的 mapping、inventory、base refs 及历史 settings/queue 逐字段重算；historical_* 三列必须为 TEXT。
- 对完整 schema 持久行做 fingerprint。同源 operator 重放不能改变任何记录；不同 SQLite SHA 再经 operator 必须在 identity 阶段拒绝，后续阶段不运行且 fingerprint 不变。这不冒充已单独执行到 combined 的异源冲突，后者由 W19 负责。
- 直接 SQL 尝试跨 owner document、缺失 document 的 chunk、缺失 chunk 的 vector，以及错误 owner 的 queue；要求确切 FK 或 owner/crosswalk trigger 拒绝，每次 fingerprint 不变。
- 七张 W6/W16 表逐一 UPDATE/DELETE/TRUNCATE 均由不可变触发器或 FK 拒绝。九张 KB 表 ENABLE/FORCE RLS，crosswalk/归档无 API/Worker policy。
- 真实独立 NOINHERIT/NOSUPERUSER/NOBYPASSRLS TCP 登录分别 SET ROLE API/Worker。归档 SELECT/INSERT/UPDATE/DELETE/TRUNCATE 都拒绝；临时误授 SELECT 后，无 actor、随机 actor、两个 owner 仍读不到归档，随后撤权。API 仅见自己的 user、Agent 和 KB metadata，另一 owner 的写入被拒绝，disabled identity 不能解析为登录。
- W9 独立适配器只转发真实 SELECT/BEGIN READ ONLY/ROLLBACK，每次 SELECT 验证 transaction_read_only=on，核验完整事务边界与 fingerprint；另在真实 READ ONLY 事务尝试 UPDATE，要求 SQLSTATE 25006。
- jobs/runs、runtime knowledge_documents/chunks、schedules/occurrences、run_steps、external_effects、teams/memberships 全为零；不存在运行时 model_connections/settings/queue 表。源凭据哨兵不能进入归档或 operator 输出。测试不调用模型、不启动 Worker、不消费队列。

operator 各域事务独立提交，整条链路不是全局原子事务。发生 execute 故障时 stage 可能部分导入，应保持 NO-GO；测试不通过恢复或放松源校验掩盖失败。W20 不重复 W19 的 combined 内部 SQL 故障注入验收。

## W9 的精确能力边界

identity、Agent 配置与 KB metadata 应成功对账，source/target 分别为 2、1、2，association_anomalies=0。非空 document/chunk/vector 即使数量和归档正确，也必须是 `unsupported`，blocker 为 `archive_only_live_unsupported`。audit 域必须非 success。其他未提供源表的业务域保持 source_table_missing/unsupported/failed，不能把空数量等同于完全验证。

W9 当前没有 embedding settings/queue 对账域；测试明确断言这些域未被输出。W20 对它们做独立归档内容回读，不将其描述为 W9 的完整业务验证。Agent 当前拒绝非空 knowledge_base_ids；正向链路只证明共用 owner/身份和快照，不能证明运行时 Agent→KB RAG 绑定、真实队列恢复、共享 ACL、凭据迁移或生产功能等价。

因此 operator 必须 exit=2、result=`stage_imported_reconciliation_incomplete`，blockers 为 `unreconciled_business_domains` 和 `production_cutover_forbidden`。这属于预期的合成 stage 链路完成，生产始终 NO-GO。

## 本地结果与独立 job 执行方法

本轮 Windows Node 24 本地命令：

```powershell
& 'C:\Program Files\nodejs\node.exe' --check services/pg-api/tests/pg17-combined-stage-operator.integration.mjs
& 'C:\Program Files\nodejs\node.exe' --experimental-strip-types --test '--test-name-pattern=^fail-closed:' services/pg-api/tests/pg17-combined-stage-operator.integration.mjs
```

语法 exit=0；离线 **7/7 pass，0 fail、0 skip**。包括所有环境字段缺失/错误、runId/口令边界、真实目录核验、拒绝入口的 I/O/import/socket 陷阱、网络/命令拒绝、后代环境无生产 secret、回执 SHA/惰性标志/计数拒绝，以及原 operator 真实 CI 阻断。回执探针仅模拟 guard 输入，不模拟 PG17 查询或报告真机通过。

另直接运行 `--test-name-pattern=^PG17 TCP:` 在本机实际 exit=1，拒绝代码如上；绝不能本地伪造 GitHub 平台通过门禁。当前范围不运行 `pnpm check`（生成构建产物）或 `pnpm test:e2e:parallel`（启动 PocketBase/Worker），遵守两文件所有权与本任务不触碰 PB/Worker 的限制。

后续在**独立全新 GitHub-hosted Linux job** 使用 `pgvector/pgvector:pg17` service，DB/user 为上述固定值，密码为本次 runId 绑定的合成密码，只映射 `127.0.0.1:5432:5432`。不可复用 W19 或其他测试已初始化的 DB，不挂正式卷，不恢复备份。Node 24 和现有 pg-api 锁文件依赖即可，不需要改 package。表中所有开关都须显式设置，GITHUB_*/RUNNER_* 使用实际 runner 环境。

```sh
node --experimental-strip-types --test services/pg-api/tests/pg17-combined-stage-operator.integration.mjs
```

完整文件必须是 **7 项离线 + 1 项真实 TCP**、进程 exit=0，并在全部断言及清理成功后出现唯一标识：

```text
W20_PG17_FULL_STAGE_PASS real_tcp=true synthetic_only=true cutover=NO-GO
```

只跑离线、跳过 TCP、单独打印标识或进程非零都不构成 W20 验收通过。本轮 GitHub Actions #38718001907 的完整 W20 Job 已成功并产生 `W20_PG17_FULL_STAGE_PASS real_tcp=true synthetic_only=true cutover=NO-GO`。错误仅输出固定脱敏代码及检查点，不泄露 SQL diagnostics、源路径、UUID、原文或密码；不得上传合成 SQLite、密码、审批文件、SQL trace 或环境全集。
