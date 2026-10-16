# V9 W19 — W18 联合 KB 导入的真实 PG17 合成验收

状态：测试实现已新增；**真实 PG17 TCP 尚未执行，验收待主线程独立 CI 接入。生产始终 NO-GO。** 本地语法检查与 4 项 fail-closed 测试通过，不代表真实数据库验收通过。

本任务仅创建本文及 `services/pg-api/tests/pg17-kb-combined.integration.mjs`。沿用当前迁移分支；未修改 Workflow UI、src、SQL、package、CI 或其他文件，未 commit/push。现有 PocketBase/SQLite 和 Node Worker 仍为运行时。本测试不接触宝塔、生产 PocketBase、公司 Neon 或真实员工数据。

## 安全入口

真实测试入口名称以 `PG17 TCP:` 开头。必须同时满足下列环境，且在导入 pg、node:sqlite、任何导入器、读写输入和连接数据库之前验证：

| 项目 | 必须值 |
| --- | --- |
| 平台 / RUNNER_OS | linux / Linux |
| GITHUB_ACTIONS | true |
| RUNNER_ENVIRONMENT | github-hosted |
| GITHUB_RUN_ID | 1–32 位纯数字，无空白 |
| AGENT_STUDIO_PG17_TEST_ENABLED | true |
| AGENT_STUDIO_PG17_W19_KB_COMBINED_TEST_ENABLED | true |
| AGENT_STUDIO_PG17_EPHEMERAL_ISOLATED | true |
| AGENT_STUDIO_PG17_HOST / PORT | 127.0.0.1 / 5432 |
| AGENT_STUDIO_PG17_DATABASE | agentstudio_stage |
| AGENT_STUDIO_PG17_ADMIN_USER | agentstudio_admin |
| AGENT_STUDIO_PG17_ADMIN_PASSWORD | synthetic-agentstudio-pg17-ci- 加本次 runId、连字符、64 位小写十六进制；后缀至少 12 种字符 |
| RUNNER_TEMP | 已存在、可写可遍历、规范绝对路径、非根目录、非符号链接，且与项目目录互不包含 |

拒绝代码固定为 `refuse_non_ephemeral_pg17_kb_combined`。测试不使用 DATABASE_URL、PGHOST 或外部 snapshot 路径。Pool 显式指定地址、数据库、登录、密码、禁用 SSL、清空 options，并限制连接数与超时。连接后真实查询 PG17 版本、数据库名、superuser session/current role、TCP 服务地址及端口；允许服务报告容器端地址，客户端仍固定连接 127.0.0.1:5432。

DDL 前必须不存在 agentstudio schema、用户关系或额外非系统 schema，也不得已存在 API/Worker/W19 登录角色。失败即停止，绝不 DROP、清库、覆盖或恢复已有数据库。仅在空的 GitHub 临时 service 上依次执行现有 001、007、010、013；只去掉 psql 反斜杠指令，不替换 SQL 正文、数据库名、版本或权限守卫。验证 vector 扩展存在，预配两名随机 UUID 的 disabled synthetic users。

与 W14/W17 一样，进程内网络门禁只允许上述本地 TCP；拒绝 DNS、UDP、TLS、HTTP(S)、HTTP2、fetch 及任意子进程。真实入口开始后门禁保持到进程退出。离线探针验证门禁，拒绝入口的子进程额外安装导入、文件写入与 socket 陷阱。

## 合成输入与验收断言

每份输入都由测试在 RUNNER_TEMP 的独立 `w19-pg17-synthetic-<runId>-*` 目录生成。目录 0700，三个输入最终 0400；SQLite DELETE journal，拒绝 WAL/SHM/journal。读取前后校验路径、无符号链接、权限、大小、mtime 及三个文件各自 SHA256。清理仅允许本次记录且校验通过的临时目录，清理失败仅报固定错误。

SQLite 包含两名 studio_users、两个不同 owner 的 KB base（第二个为空）、两个 model_connections、一个非空 document、一个 chunk、一个 vector、一个 embedding settings、一个历史 queue，ACL/access_events 均为空。连接与用户列放置合成凭据哨兵；reader 仅投影连接 id/owner，哨兵不得进入 batch、归档或报告。所有表及精确行数进入完整 manifest，绑定 SQLite SHA256 和字节数；v2 审核 mapping 完整一对一映射两个 owner，含合成审核人、UTC approved_at 和同一 source SHA。

实际调用 `loadKbCombinedSnapshot` 和 `importKbCombinedAtomic`；附加 W6/W16 reader 仅供独立对照。pool adapter 全部转发真实 SQL，绝不伪造身份、版本、COMMIT 或回读：

- 成功与重放均验证唯一连接、唯一 BEGIN/COMMIT；首次 metadata/content/embedding imported 为 **2/3/2**，重放 imported 为 0/0/0、replayed 为 2/3/2。首次九表计数依次为 `[2,2,1,1,1,1,1,2,2]`。
- 故障注入在 W16 queue INSERT 之前。同一事务先验证九表 `[2,2,1,1,1,1,1,2,1]`，证明 W2/W6、W16 snapshot/base refs/settings 已真实写入；随后真实执行 `SELECT 1/0`，要求 SQLSTATE 22012、唯一 BEGIN/ROLLBACK、无 COMMIT、连接释放。回滚后九表全零，全 schema 行内容 fingerprint 等于导入前；同一已验证 batch 重试成功。
- 对照源 metadata 的名字、描述、毫秒时间、owner、private visibility、空 team_id 及 crosswalk payload hash。document/chunk/vector 的 raw_payload 必须逐字等于源字段顺序的 JSON.stringify，payload SHA、source SHA、外键和 owner 一致；vector_json 保留 `[ 1.000, -0.0, 2e-3 ]` 的原始词法。
- W6/W16 审计的 source、inventory、mapping SHA 及审核 mapping 全文一致；重算 content 与 embedding inventory。settings/queue 原始 JSON 逐字比对，历史 attempts/next_attempt/lease 为 `7`、`1792030400456`、`1792030499999` 的 TEXT，三个 historical_* 列真实类型均为 TEXT。
- 相同源幂等及其他 SHA 源阻断，失败前后完整 fingerprint 不变。普通 W6 reader 拒绝非空 settings/queue，普通 W2/W6 atomic 无法使用组合内容凭据；去掉 related-data 标记也不能走普通 W2；复制组合 token 无效。
- 非空 ACL/access_events、跨 owner 的 queue/base、chunk 或 connection、未知 KB 关系、缺失/无效/重复 owner mapping、空审核人都拒绝，目标 fingerprint 不变。
- 九表 ENABLE/FORCE RLS；所有 crosswalk/归档无 API/Worker policy。通过真实非 superuser、无 BYPASSRLS、NOINHERIT 登录分别 SET ROLE 为 API/Worker，验证归档 SELECT/INSERT/UPDATE/DELETE/TRUNCATE 全拒绝。即使临时误授 SELECT，空 actor、随机 actor、两个 owner 都看不到归档，最后撤销授予。
- API metadata RLS 每名 owner 只见自己的一个 base；另一 owner 不能更新或插入前一 owner 的 base。归档 UPDATE/DELETE/TRUNCATE 还必须触发数据库不可变或 FK 防线。
- jobs/runs、runtime knowledge_documents/chunks、schedules/occurrences、run_steps、external_effects、teams/memberships 均为零；没有 runtime model_connections/settings/queue 表。没有调用模型、启动 Worker、消费队列或激活共享 ACL。

应用仅在所有断言和清理成功后输出：

```text
W19_PG17_KB_COMBINED_PASS real_tcp=true synthetic_only=true archive_only=true cutover=NO-GO
```

异常只输出固定脱敏代码与固定 checkpoint，不传播 SQL diagnostics、源路径、原文、UUID 或密钥。node:test 仍输出正常测试名称、状态与计数；内部离线 guard 探针输出由父测试捕获，不作为 PG17 成功证据。

## 本地验证及主线程 CI 接入

本地仅执行以下两项，不启动数据库，不伪造 GH 环境执行真实入口：

```powershell
& 'C:\Program Files\nodejs\node.exe' --check services/pg-api/tests/pg17-kb-combined.integration.mjs
& 'C:\Program Files\nodejs\node.exe' --experimental-strip-types --test '--test-name-pattern=^fail-closed:' services/pg-api/tests/pg17-kb-combined.integration.mjs
```

结果：语法 exit=0；fail-closed **4/4 pass，0 fail、0 skip**。按本任务限制未运行 pnpm check、PocketBase E2E、W18 PGlite 或任何真实 PG17 测试。

主线程应在单独 GitHub-hosted Linux job 创建全新 `pgvector/pgvector:pg17` service，POSTGRES_DB=agentstudio_stage、POSTGRES_USER=agentstudio_admin、POSTGRES_PASSWORD 与上述合成测试密码一致，只映射 `127.0.0.1:5432:5432`。不要复用 W14/W17/其他测试已初始化的 service；不要挂载生产卷或恢复真实备份。使用 Node 24（支持 node:sqlite、registerHooks、strip-types），安装现有 pg-api lockfile 依赖，无须添加 package scripts。

service 与测试步骤可沿用当前 CI 的合成密码表达式 `synthetic-agentstudio-pg17-ci-${{ github.run_id }}-${{ github.sha }}0123456789abcdef01234567`（40+24=64 位 hex），或由主线程安排同样满足门禁的本次随机密码。勿打印密码、环境全集、SQLite、manifest、mapping、SQL trace 或 fingerprint 内容，勿上传 fixture 工件。RUNNER_TEMP/GITHUB_* 使用 runner 提供的实际值，不能通过手工伪造绕过托管 runner 限制。

在独立 job 的测试步骤设置表中所有 AGENT_STUDIO_* 值，再运行完整文件：

```sh
node --experimental-strip-types --test services/pg-api/tests/pg17-kb-combined.integration.mjs
```

完整验收应包含 4 个离线测试和 1 个真实 TCP 测试，必须进程 exit=0 且出现唯一成功 marker；只有本地 4/4、跳过 TCP、单独 marker 或非零退出均不能算真实 PG17 验收通过。连接、DDL、SQL 或断言不兼容时本测试不可作为已通过凭证，须修复并重跑独立 job。

本任务不修改或触发 CI。真实 PG17 证据仍待主线程提供；即使后续 CI 通过，也仅证明隔离合成归档路径，**不授权真实公司数据迁移、生产切换或部署，生产 NO-GO。**
