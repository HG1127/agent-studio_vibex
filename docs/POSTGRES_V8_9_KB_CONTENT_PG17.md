# V8.9 W14 — 非空知识库 PG17 原子导入验收

状态：**synthetic-only / stage-only / archive-only；生产切换 NO-GO**。

本任务仅新增本文和 `services/pg-api/tests/pg17-kb-content-stage.integration.mjs`。不修改产品源码、SQL、package、CI 或部署配置，不访问公司生产数据库、宝塔、现有 PocketBase，不启动 RAG、模型调用、Worker、任务或共享。真实 PG17 验收交由集成负责人接入独立 GitHub CI；本轮只执行本地语法和 fail-closed 测试。

## 依据与实际调用

已阅读 W12 `pg17-stage-operator.integration.mjs`、W13 `pg17-crossdomain-stage.integration.mjs` 及阶段文档，以及 W2/W6 reader、atomic importer 和归档 SQL。入口直接调用原有 `loadKbContentSnapshot` → `importKbSnapshotAtomic`，不使用假 PG、PGlite、替换版本探针、修改 SQL 或手工插入 W2 crosswalk。普通 W2 的非空内容阻断保持原状。

参考文档：

- [W6 原始内容归档](POSTGRES_V8_5_KB_CONTENT_IMPORT.md)
- [W2+W6 原子入口](POSTGRES_V8_6_KB_ATOMIC_CLI.md)
- [W12 操作器试验](POSTGRES_V8_8_STAGE_OPERATOR_PG17_TRIAL.md)
- [W13 跨域 PG17](POSTGRES_V8_9_CROSSDOMAIN_PG17.md)

这里验收的是完整合成 SQLite 文件中声明的全部表和行，不代表完整业务迁移。源文件由测试从零创建，无外部快照参数；不复制、导出或读取任何 PocketBase 数据。

## 事前拒绝和隔离门禁

真实测试不满足门禁即失败，不能 skip 或降级。门禁先于 pg / SQLite / importer 动态导入、文件读写及数据库连接。

| 条件 | 必须值 |
| --- | --- |
| 实际平台、Actions、runner | Linux；`GITHUB_ACTIONS=true`；`RUNNER_ENVIRONMENT=github-hosted`；`RUNNER_OS=Linux` |
| 显式启用 | `AGENT_STUDIO_PG17_TEST_ENABLED=true`、`AGENT_STUDIO_PG17_KB_CONTENT_TEST_ENABLED=true`、`AGENT_STUDIO_PG17_EPHEMERAL_ISOLATED=true` |
| 目标 | `AGENT_STUDIO_PG17_HOST=127.0.0.1`、`AGENT_STUDIO_PG17_PORT=5432`、`AGENT_STUDIO_PG17_DATABASE=agentstudio_stage`、`AGENT_STUDIO_PG17_ADMIN_USER=agentstudio_admin` |
| runId | `GITHUB_RUN_ID` 为 1–32 位十进制数字，无前后空白或换行 |
| 临时 admin 密码 | `synthetic-agentstudio-pg17-ci-<runId>-<64位小写十六进制随机后缀>`；后缀至少 12 种字符；CI 每次用安全随机数生成，禁止输出 |
| 合成目录 | `RUNNER_TEMP` 为规范绝对路径、非根目录、realpath 相同；与仓库互不包含 |

PG 配置固定 ssl=false、options 空、单连接及有限连接/statement timeout，不使用 DATABASE_URL、外部服务名或 source 路径环境变量。真实连接后再次核对数据库、session/current admin superuser、PG17 和 TCP 端口；服务端地址非空。GitHub service 的服务端地址可以是容器地址，客户端网络守卫仍严格只允许 `127.0.0.1:5432`。

任何已有 agentstudio schema、任何用户关系、public 以外用户 schema 或预存 API/Worker/测试登录角色，均在 DDL 之前拒绝。需要**独立 job 的全新 disposable PG17 + pgvector service**，不能复用 W12/W13 已初始化的数据库。只执行未经改写的 `001_stage_schema.sql`、`pg_v8_007_legacy_kb_import.sql`、`pg_v8_010_legacy_kb_content.sql`；不执行 DROP/restore，不清理数据库，service 最终由 GitHub 销毁。

真实路径安装与离线探针相同的网络/进程守卫，只放行该 loopback TCP；拒绝外部 TCP、其他端口、Unix socket、DNS、UDP、HTTP(S)、HTTP2、TLS、fetch 和所有 shell/子进程入口。守卫持续覆盖 importer、连接关闭及临时文件清理。测试不改变父进程 `GITHUB_ACTIONS`，不绕过 operator 的真实业务快照 CI 禁令。该守卫限定本测试所用 Node 接口；CI 仍须无企业 secrets、无企业网络。

## 合成快照和验证矩阵

每个 SQLite 文件包含 2 个合成员工、2 个 private base、2 个文档、4 个分片、4 条三维向量及同 owner 模型连接引用。显式创建空 ACL/access-events/embedding-queue/settings 表，证明没有可激活的旧权限或工作。密码/API key/URL 使用合成保密哨兵，不作为可执行连接迁移。

manifest 记录完整 SQLite 字节 SHA、大小及所有用户表行数；批准身份映射为 `studio-approved-identity-map-v2`，绑定同一源 SHA、一对一随机 owner UUID、审核人和 UTC 时间。目标 users 仅作为本次合成前置条件创建为 disabled，不声称验证 W8 身份预配或员工登录。

目录 0700、文件 0400；导入前后核对 realpath、非 symlink、大小、mtime、SHA、权限及无 WAL/SHM/journal。加载器仍执行其原有只读 SQLite、完整 manifest、owner 和层级引用校验。所有测试目录均由本次 mkdtemp 创建并立即登记，结束仅删除经过父目录、runId 前缀、realpath 和 symlink 检查的自有目录。

| 验收项 | 真实路径必须通过的断言 |
| --- | --- |
| 原子入口 | 原始 reader 签发进程内 batch；复制的 batch 拒绝；元数据和内容使用原 importer 的同一事务 |
| W2 元数据 | 两个 base 的 owner、name、description、毫秒时间、revision=1、private/team=null，crosswalk 的源 SHA、目标 UUID、旧 ID 和 payload SHA 一致 |
| 原始文档/分片/向量 | 三表分别 2/4/4；raw_payload 与独立合成源对象的 JSON 字符串逐字相同，并做解析后深比较；逐行 SHA、源 SHA、owner/base/document/目标关联一致 |
| 向量 JSON 保真 | 原字符串 `[ 1.000, -0.0, 2e-3 ]`、空白、小数写法、负零、指数写法完整保留；dimensions=3、模型/connection 引用和 indexed_ms 不变；不转换 pgvector |
| 文本保真 | 中文、emoji、换行、tab、引号、反斜杠和尾部空格；filename、chunk_index、size_chars、chunk_count、created_ms 全部比对 |
| 审计 | snapshot/inventory/mapping SHA、批准映射原文及 2/4/4 计数一致；report 无原文、向量、源 ID、owner UUID、凭据或路径 |
| SQL 中途失败 | 在首个 vector INSERT 前，真实事务内已可见 2 个 metadata、2 个 crosswalk、1 个审计、2 个 doc、4 个 chunk；实际执行 `SELECT 1 / 0`，要求 PG SQLSTATE=22012，importer 仅返回 `stage_kb_sql_failed`，trace 为 BEGIN…ROLLBACK、无 COMMIT |
| 整批回滚 | 上述失败后 metadata、crosswalk、审计及三个 archive 全为 0；整个 agentstudio 所有表全行 fingerprint 与失败前一致；随后原始 importer 成功重试 |
| 重复幂等 | 再次只读加载相同快照，metadata imported=0/replayed=2，archive imported=0/replayed=10；整个 agentstudio fingerprint 不变 |
| 异源拒绝 | 另一个从零生成且完整批准的快照 SHA 不同，返回 source_snapshot_conflict；全表 fingerprint 不变 |
| owner RLS | metadata/crosswalk/四个归档表均 ENABLE/FORCE；真实非 superuser、NOBYPASSRLS TCP 登录切 API 角色，anonymous/无关 owner=0，各已映射 owner 只见自己的 1 个 base；跨 owner UPDATE=0、INSERT 拒绝 42501 |
| 归档保密 | API 的每个 actor 均无权读 crosswalk/内容；API 和 Worker 即使设为源 owner，也不能 SELECT/UPDATE/DELETE/TRUNCATE 四个归档表，要求 42501 |
| 不可变及只读 | DBA UPDATE/DELETE/TRUNCATE 四个归档表均被原 trigger 拒绝；真实 REPEATABLE READ READ ONLY 可读归档，写入返回 25006，ROLLBACK 后 fingerprint 不变 |
| 未激活 | runtime knowledge_documents/chunks、jobs/runs/schedules/occurrences/steps/external_effects、teams/memberships 全局行数均为 0；报告 rag_enabled/acl_activated/production_cutover_allowed=false |

真实路径异常仅输出固定 checkpoint，屏蔽 PG 原始 diagnostics、断言 diff、源内容和身份。不能通过上传 SQLite、mapping、原始报错或密码来调试 CI。发生实现/环境不兼容时保留失败与 NO-GO，不放宽 importer 标准。

## 本地结果和 CI 交接

2026-10-15，Windows / Node **24.14.1**，本地只执行：

```sh
node --check services/pg-api/tests/pg17-kb-content-stage.integration.mjs
node --experimental-strip-types --test --test-name-pattern='^fail-closed:' services/pg-api/tests/pg17-kb-content-stage.integration.mjs
```

结果：语法检查 exit=0；**4/4 fail-closed PASS，0 fail**。包括逐一缺失/错误环境门禁、拒绝入口不得连接/写文件/导入 pg 或 SQLite 或 importer、原 operator 的真实 CI 事前拒绝、网络及子进程守卫离线探针。负例启动子进程时安装 socket/文件写入/模块导入陷阱，并要求出现原隔离拒绝而非陷阱错误。没有运行本地真实 PG、PGlite、全项目 check 或 PocketBase E2E，遵守本轮授权范围。

集成负责人另行准备满足上述全部门禁的 GitHub-hosted Linux 新 job/service、现有依赖及支持 strip-types/registerHooks 的 Node（本地验证版本为 24.14.1），再执行：

```sh
node --experimental-strip-types --test services/pg-api/tests/pg17-kb-content-stage.integration.mjs
```

只有真实路径全部断言通过，才允许输出 `W14_PG17_KB_CONTENT_PASS real_tcp=true synthetic_only=true archive_only=true cutover=NO-GO`。本轮**未执行真实 PG17 TCP/SQL 路径**，不能宣称真实 PG17 验收已通过。

仍阻断：真实 CI 运行证据、真实员工 UAT、生产备份/恢复和迁移批准、ACL/历史事件/embedding 设置及队列迁移、文件二进制、向量模型兼容、RAG 功能等价与长期 Worker 验证。三维向量仅作为冻结原文留档；即使此测试最终通过，也不授权任何运行时检索、任务启用、共享或生产切换。
