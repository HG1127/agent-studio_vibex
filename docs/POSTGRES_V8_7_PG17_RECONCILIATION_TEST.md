# W10 — W9 对账的独立 PostgreSQL 17 TCP 集成验收

状态：**本地语法与 fail-closed 已验证；真实 PG17 尚未执行，生产仍为 NO-GO。**

本轮仅新增 `services/pg-api/tests/pg17-reconciliation.integration.mjs` 与本文档。
不改 workflow、package.json、W9 源码；不 commit/push，不启动本地数据库。
遵循 AGENTS.md、CLAUDE.md 与 `POSTGRES_V8_4_PARALLEL_MIGRATION_CONTRACT.md`。

## 隔离边界

测试仅允许 GitHub 托管 Linux runner 上一次性创建的 `pgvector/pgvector:pg17`
容器，使用真实 TCP `127.0.0.1:5432`、数据库 `agentstudio_stage`、管理员
`agentstudio_admin`。不能与原 `pg17-tcp.integration.mjs` 共用数据库或集群，
不能在既有 stage 上顺序运行；必须单独 job、全新容器、无持久卷、无部署步骤。
不能指向 BaoTa、原 PocketBase、现有 Neon 或任何正式数据库。

在导入 `pg`、创建 Pool、生成 SQLite 文件或发出任何 PG 请求之前，必须全部满足：

- 实际 Node 平台为 `linux`，`GITHUB_ACTIONS=true`、`RUNNER_OS=Linux`、
  `RUNNER_ENVIRONMENT=github-hosted`，`GITHUB_RUN_ID` 为 1–32 位数字。
- `AGENT_STUDIO_PG17_TEST_ENABLED=true`、
  `AGENT_STUDIO_PG17_RECONCILIATION_TEST_ENABLED=true`、
  `AGENT_STUDIO_PG17_EPHEMERAL_ISOLATED=true`。
- `AGENT_STUDIO_PG17_HOST=127.0.0.1`、
  `AGENT_STUDIO_PG17_DATABASE=agentstudio_stage`、
  `AGENT_STUDIO_PG17_ADMIN_USER=agentstudio_admin`；端口省略或严格等于 `5432`。
- `RUNNER_TEMP` 为绝对路径；口令格式严格为
  `synthetic-agentstudio-pg17-ci-<GITHUB_RUN_ID>-<64 lowercase hex>`，
  后缀在本次 GitHub Actions synthetic job 中使用提交 SHA（40 个十六进制字符）加固定 24 个十六进制测试字符构成，严格是 64 位 lowercase hex；此值仅是隔离测试凭据，**不是用于任何业务的生产密码**，测试拒绝明显低多样性后缀。
  不接受旧测试的仅 run ID 确定性口令，不读取任何真实 secret。

驱动参数显式固定 host/port/database/user/password、禁用 SSL、设置连接和语句
超时及 options，避免连接目的地继承环境默认值。测试期间 TCP socket 仅允许
上述回环地址与端口，`fetch` 被禁止。元数据门禁本身不构成生产访问授权；
独立 job 必须保证容器创建与销毁的事实，不能伪造环境变量绕过隔离要求。
Windows 即使补齐上述变量也会拒绝。

首个连接仅检查服务器版本为 17.x、stage 名、管理员身份、TCP 服务地址与端口；
随后确认整个 `agentstudio` schema 不存在且无任何该 schema 的 relation，
并确认应用角色不存在。任一已有对象即拒绝，**没有 DROP / reset / 清空已有 DB 的路径**。

## 真实集成路径与断言

1. 原样执行 `001_stage_schema.sql`（仅去除 psql 元命令行），包含真实 vector
   extension、schema、角色、约束及 RLS；随后执行 v8_006..011 SQL。
   另执行 v8_012，使 W9 的 `agent_runs` 空库存也可明确报告 unsupported，
   而不是因缺表报告 failed；不伪造 ledger 或轻量替身 schema。
2. 在 runner 临时目录生成全新的 SQLite：一位合成员工、一个 Agent，其余
   W9 源域全部建空表。员工密码、Agent 名和 prompt 使用随机合成隐私哨兵。
   关闭 SQLite、确认无 WAL/SHM/journal，再生成字节数、行数与 SHA-256 manifest。
3. 生成绑定 snapshot SHA 的已审核 v2 identity mapping 与 approval，
   在 PG 中以单事务写入 disabled 用户、`active_automatically=false` 的
   identity crosswalk、requires_approval Agent 与 Agent crosswalk。
   mapping 文件哈希和 snapshot 哈希均进入真实 crosswalk；不签发身份、不激活用户。
4. 独立管理连接负责合成 fixture；另一 TCP Pool 设置
   `default_transaction_read_only=on`，执行 W9 `reconcileStage`。
   真实服务器必须在事务外 UPDATE、READ ONLY 事务内 DELETE 时返回 SQLSTATE
   `25006`；W9 每次 BEGIN 后直接查询数据库，确认 `transaction_read_only=on`
   及 `transaction_isolation=repeatable read`，最终 ROLLBACK 并释放连接。
5. Agent 必须 success、source/target count 均为 1；其余 15 项必须 unsupported。
   studio_users 两端计数为 1，其余库存为 0；audit 的源计数为 null、目标为 0。
   unsupported 不能被解释为功能等价、完整迁移、生产 GO 或所有域成功。
6. 限定结果字段仅为 domain/count/blockers/anomaly/status。所有报告均不得含
   合成员工与 Agent ID、UUID、名字、prompt、密码、snapshot/mapping 路径、
   source/mapping SHA 或连接口令。对账 SQL 轨迹只允许 SELECT、指定只读 BEGIN
   和 ROLLBACK；每次执行前后对所有 `agentstudio` 表完整行内容计算哈希，
   同时比较源文件哈希，捕获意外修改。重复运行报告必须一致。
7. approval 的 source SHA 不匹配、mapping 的 source SHA 不匹配，均在获取
   对账连接前拒绝。真实 target Agent crosswalk 的来源不匹配必须报告
   `mixed_snapshot`，identity crosswalk 的 mapping 哈希不符必须出现关联异常。
   这些是显式负例，之后恢复合成数据，重新验证原成功报告。
8. 分别插入 queued 与 leased 合成 job，W9 必须拒绝并返回 `active_jobs`。
   只移除本测试创建的 job，不执行或重放任何任务，不启动 Worker。
9. 新建随机合成口令的非 superuser、非 bypass RLS API TCP 登录，再切换
   `agentstudio_api`。普通 users SELECT 是正向权限控制；所有真实
   `legacy_*` 表 SELECT 都必须返回 `42501`，包括 identity/Agent crosswalk。

所有源文件只存在于 `RUNNER_TEMP/w10-pg17-synthetic-*`。清理仅删除本次
`mkdtemp` 返回且经过父目录、名称与非 symlink 检查的目录；不读取原快照目录，
不导出报告中的原文数据，不删除或遍历 pb_data，不清理系统/用户文件。
PG fixture 留在一次性容器中，由 job 销毁容器；测试从不删除数据库或 schema。

## 已接入 GitHub Actions 的独立验收任务

`.github/workflows/agent-studio-quality.yml` 已新增 `pg17-reconciliation-isolated`，不与现有 `pg17-tcp-isolated` 复用数据库或容器。该 Job 采用独立 `pgvector/pgvector:pg17` Service，`127.0.0.1:5432` 回环端口、`agentstudio_stage` 库名、GitHub 托管 Linux Runner 和纯合成凭据；未挂载真实数据卷。

此版本按 GitHub 原生 Service 创建顺序，使用 `GITHUB_RUN_ID` + `github.sha` 的**合成测试凭据**，以确保 Service 与测试进程使用完全相同的口令。验收脚本仍强制 `GITHUB_ACTIONS`、`RUNNER_ENVIRONMENT=github-hosted`、`RUNNER_OS=Linux`、`RUNNER_TEMP`、独立试运行开启参数，以及精确的合成口令格式。所有门禁在发起 PostgreSQL 连接前执行。

CI 的正确验收信号是 job `pg17-reconciliation-isolated` 实际完成为 `success`，且日志包含：
`W10_PG17_RECONCILIATION_PASS real_tcp=true readonly=true synthetic_only=true cutover=false`。

这个结果仅证明**合成数据的真实 PostgreSQL17 只读对账路径**，并不表示真实数据已导入，也不证明所有旧业务字段与权限可无损迁移。

## 验证及剩余限制

使用下列本地命令验证语法、非临时环境拒绝、回环目标约束。不要在真实生产数据库上运行。

```bash
node --check services/pg-api/tests/pg17-reconciliation.integration.mjs
node --experimental-strip-types --test --test-name-pattern=^fail-closed services/pg-api/tests/pg17-reconciliation.integration.mjs
pnpm --dir services/pg-api run test:stage-reconciliation
```

本地 fail-closed 测试覆盖无 CI 授权、错误 DB/host、错误密码格式、自托管或 Windows 环境，以及禁止在拒绝时尝试 TCP 连接；真实 PG17 测试必须由独立的 GitHub-hosted Runner 完成。

依然**缺失**公司授权冻结备份、生产员工 IdP 真实性核验、Workflow/知识库/历史等非 Agent 域的字段级全量对账、完整 UAT、备份恢复和回滚演练。因此正式上线为 **NO-GO**。
