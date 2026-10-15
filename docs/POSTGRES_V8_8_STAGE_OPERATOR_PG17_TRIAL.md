# W12 — 真实 PG17 synthetic stage operator 一次性验收

生产切换状态：**NO-GO**。本交付是独立测试入口和操作说明，没有修改 workflow、operator、package、schema 或共享测试，也没有 push。它不授权真实快照导入或部署。

测试文件：`services/pg-api/tests/pg17-stage-operator.integration.mjs`。先阅读项目 `AGENTS.md`、`CLAUDE.md` 和 [V8.8 operator 说明](POSTGRES_V8_8_STAGE_TRIAL_OPERATOR.md)。本例仅生成合成数据，不执行说明中的真实备份步骤，也不调用 `ops/sqlite-backup.mjs`。

## 强制隔离条件

- 只接受 `process.platform=linux`、`GITHUB_ACTIONS=true`、`RUNNER_ENVIRONMENT=github-hosted`、`RUNNER_OS=Linux` 和 1–32 位纯数字 `GITHUB_RUN_ID`。本机 Windows、自托管 runner、缺少开关、非绝对或非规范 `RUNNER_TEMP` 都失败，不跳过验收。
- 三个开关都必须为 `true`：`AGENT_STUDIO_PG17_TEST_ENABLED`、`AGENT_STUDIO_PG17_STAGE_OPERATOR_TEST_ENABLED`、`AGENT_STUDIO_PG17_EPHEMERAL_ISOLATED`。
- 目标严格固定为 `127.0.0.1:5432 / agentstudio_stage / agentstudio_admin`；端口可省略，省略仍固定 5432。禁止 `localhost`、`postgres`、外部主机及 URL。管理员密码必须是 `synthetic-agentstudio-pg17-ci-<本次 runId>-<64 位小写十六进制>`，且后缀至少包含 12 种字符。该格式是合成服务约定，不是生产认证证明。
- 连上后再次检查实际 PG 版本在 17.x、真实 TCP、数据库、session/current user 和超级管理员身份；拒绝任何已有 `agentstudio` schema、已有用户 relation、自定义 schema 或 pilot/API 角色。**必须独占全新 service**，不能与 W10/TCP 测试串行共用已初始化数据库。
- 通过检查后才应用 `001_stage_schema.sql` 和 `pg_v8_006`–`011` 六个增量迁移，核验 ledger 与 `vector` 扩展。不应用 012；本夹具无历史记录，W9 仍明确报告不完整。
- 不读取 `.env`、生产秘密、公司 PB、宝塔或 Neon；连接参数显式传入，不接受 `DATABASE_URL`。operator 子环境从白名单新建，不继承 `PG*`、`NODE_PATH` 或外部 `NODE_OPTIONS`。父测试及子进程链均有 TCP 目的地限制，子进程禁用外部 fetch。

`RUNNER_TEMP` 必须存在、为规范真实目录、不经过 symlink，且与仓库互不包含。只有其新建的 `w12-pg17-synthetic-*` 子目录会被写入。每个目录权限 0700；冻结 SQLite 和审核 JSON 为 0400；合成密码文件为 0600。递归清理前重新核验目录归属和真实路径。没有 DROP、恢复、生产备份或 Worker 启动；service 由 GitHub 在 job 结束后销毁。

## 已集成 GitHub Actions 的独立隔离测试 Job

集成负责人已将单独的 `pg17-stage-operator-isolated` Job 加入 `.github/workflows/agent-studio-quality.yml`，下列示例展示同一隔离配置。只能使用 GitHub-hosted `ubuntu-latest`，不得改成自托管 runner，不挂载旧 volume、PB 数据或任何生产 secret。不要开启 shell tracing、转储环境、输出密码文件、上传 runner 临时目录或数据库日志。服务密码与测试密码必须逐字一致；下面后缀由 40 位提交 SHA 和 24 位固定合成标记组成。

```yaml
pg17-stage-operator-synthetic:
  runs-on: ubuntu-latest
  timeout-minutes: 15
  permissions:
    contents: read
  services:
    postgres:
      image: pgvector/pgvector:pg17
      env:
        POSTGRES_DB: agentstudio_stage
        POSTGRES_USER: agentstudio_admin
        POSTGRES_PASSWORD: "synthetic-agentstudio-pg17-ci-${{ github.run_id }}-${{ github.sha }}0123456789abcdef01234567"
      ports:
        - "127.0.0.1:5432:5432"
      options: >-
        --health-cmd "pg_isready -U agentstudio_admin -d agentstudio_stage"
        --health-interval 10s --health-timeout 5s --health-retries 12
  steps:
    - uses: actions/checkout@v4
    - uses: pnpm/action-setup@v4
      with:
        version: 11.23.0
    - uses: actions/setup-node@v4
      with:
        node-version: '24'
    - name: Install isolated service dependencies
      run: pnpm --dir services/pg-api install --ignore-workspace --frozen-lockfile --ignore-scripts
    - name: Run W12 once against its own empty PG17 service
      env:
        AGENT_STUDIO_PG17_TEST_ENABLED: "true"
        AGENT_STUDIO_PG17_STAGE_OPERATOR_TEST_ENABLED: "true"
        AGENT_STUDIO_PG17_EPHEMERAL_ISOLATED: "true"
        AGENT_STUDIO_PG17_HOST: "127.0.0.1"
        AGENT_STUDIO_PG17_PORT: "5432"
        AGENT_STUDIO_PG17_DATABASE: "agentstudio_stage"
        AGENT_STUDIO_PG17_ADMIN_USER: "agentstudio_admin"
        AGENT_STUDIO_PG17_ADMIN_PASSWORD: "synthetic-agentstudio-pg17-ci-${{ github.run_id }}-${{ github.sha }}0123456789abcdef01234567"
      run: node --experimental-strip-types --test services/pg-api/tests/pg17-stage-operator.integration.mjs
```

无需手动调用导入 CLI。测试在 `RUNNER_TEMP` 内新建两个完全合成的 SQLite，各自只有 `studio_users=1`、`agent_specs=1`。在所有 SQLite 写句柄关闭、无 WAL/SHM/journal 后，枚举全部用户表与行数，绑定完整文件 SHA256、字节数 manifest，生成 approved-v2 owner UUID map、单独审核人的 OIDC issuer/subject 文件和 source approval。OIDC `.invalid` 域只是合成标识，绝不请求网络；这不代表真实 IdP 人工审核已完成。

测试调用的入口和参数是：

```text
node --experimental-strip-types services/pg-api/src/stage-migration-operator.mjs
  --execute --confirm-isolated-stage agentstudio_stage --allow-partial-trial
  --snapshot <runner-temp synthetic sqlite>
  --manifest <runner-temp complete manifest>
  --mapping <runner-temp approved-v2 map>
  --oidc <runner-temp independent synthetic review>
  --approval <runner-temp synthetic source approval>
```

operator 的真实业务 CI 禁令保持原样。独立入口拒绝测试先证实 `GITHUB_ACTIONS=true` 时 operator 在读取源前拒绝执行；只有隔离门槛全部通过、合成文件已冻结且位置和权限验证完成后，启动 operator 的 **Node child env 临时设 `GITHUB_ACTIONS=false`**。父进程始终为 `true`，不写 `GITHUB_ENV`、shell 环境或项目配置。该子进程会将受限环境传给其迁移 CLI 后代。测试生成的 preload 只允许固定 loopback PG TCP，并只允许 operator 调用现有域 CLI，其他命令和备份入口被拒绝。

## 验收证据与退出码

测试进程最终应退出 **0**，其内部第一次和同源重试 operator 都必须退出 **2**，并严格满足以下条件：

1. operator 结果为 `stage_imported_reconciliation_incomplete`；identity/agent/reconciliation 的退出码依次为 `0,0,2`；blockers 精确为 `unreconciled_business_domains` 和 `production_cutover_forbidden`。不是仅接受任意退出码 2。
2. `production_cutover_allowed=false`，源 SHA 与冻结字节一致，完整 manifest 校验通过。成功日志显式包含 `cutover=NO-GO`。
3. PG `users=1` 且 `disabled`、空 display name；独立审核 issuer/subject 与 owner UUID 一致；`legacy_user_imports=1`，原 SHA、map/OIDC 文件 SHA、旧 ID 与 target UUID 对账，`active_automatically=false`。
4. `agent_specs=1`、`legacy_agent_imports=1`；owner、Agent 全部 spec 字段、名称、创建/更新时间、requires_approval、payload SHA 与源快照对账。
5. `jobs/runs/schedules/schedule_occurrences/run_steps/external_effects` 均为零。直接调用 W9 只读对账，确认 users/Agent 为 success，其他域仍未完整；所有 SQL 仅允许只读事务、SELECT 和 ROLLBACK。全 schema 数据指纹不变。
6. 相同源再次执行：identity/Agent 都是 `imported=0,replayed=1,reconciled=1`，全部表数据指纹不变。包括导入时间、审计表在内不会新增或更新记录。
7. 第二份独立冻结快照使用同一身份但不同合成字节，连同其完整 manifest 与独立 SHA 绑定审核再次执行；必须在 identity 执行阶段拒绝，结果 `partial_stage_must_not_switch`、identity 退出 1、operator 退出 2，没有后续导入且数据库指纹不变。绝不改写第一份或第二份冻结源来构造负例。
8. 真实非超级用户、无 BYPASSRLS 的专用 TCP login 切换至 `agentstudio_api`：匿名/其他 actor 看不到 user/Agent，owner 可见；禁用身份不能通过 identity resolver 登录；两个 crosswalk 不可读取；跨 owner UPDATE 影响零行，INSERT 被 PostgreSQL 以 `42501` 拒绝。探测后数据不变。
9. 每轮前后重新核验源文件字节 SHA、长度、mtime、只读权限和 sidecar 缺失。子进程原始 stdout/stderr 仅留内存做秘密泄露断言，绝不直接输出；PG 错误与含值的断言统一脱敏。日志只输出测试状态与固定通过标志。

成功标志仅在以上检查全部完成后输出：

```text
W12_PG17_STAGE_OPERATOR_PASS real_tcp=true synthetic_only=true operator_exit=2 cutover=NO-GO
```

没有这个标志和 job 的退出 0，不得宣称真实 PG17 operator 验收通过。失败后不要在同一已初始化 service 中重跑或手动清库；启动全新 job/service。重新运行整个 GitHub job 会创建新 service，不保留旧卷。

## 本地核验记录及未完成事项

2026-10-15，本次独立 WebCodex 在迁移分支 `migration/postgres-v8-6-staging-20261015`、Windows、Node 24.14.1：

```text
node --check services/pg-api/src/stage-migration-operator.mjs
node --check services/pg-api/tests/pg17-stage-operator.integration.mjs
node --experimental-strip-types --test --test-name-pattern=^fail-closed: services/pg-api/tests/pg17-stage-operator.integration.mjs
```

语法检查通过，3 项 fail-closed 测试通过；入口负例不连接数据库、不创建 fixture。另在本机单独运行 `--test-name-pattern=^PG17 TCP:`，按预期以退出 1 和 `refuse_non_ephemeral_pg17_stage_operator` 拒绝，不是跳过或假通过。未提供 GitHub runner，本次**未执行真实 PG17 TCP 验收**，没有运行生产备份，也未连接宝塔/PB/Neon。集成负责人已接入独立的 PG17 stage-operator CI Job，但本段记录的本地防护测试仍不能代替真实 PG17 验收；只以 GitHub Job 最终结论和成功标志为准。

本任务严格只允许修改两个交付文件，因此未运行会生成其他构建或 E2E 产物的 `pnpm check` / `pnpm test:e2e:parallel`；它们仍是后续仓库完整验收要求。生产 GO 仍取决于获授权的真实快照、真实独立身份审核、全域语义对账、员工 UAT、网络/ACL、备份恢复、回滚和长时间 Worker 验证。
