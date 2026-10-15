# Agent Studio V8.4 — PostgreSQL 并行交付执行记录

**唯一项目：agent_studio_vibex版本。生产状态：NO-GO。** 此文档为实际写入源码与本地测试事实，不是已进入生产的声明。原 PocketBase、宝塔服务器和正式数据库未被本轮迁移工具修改。

## 可并行的五条工作流

| 工作流 | 当前可核对的成果 | 已验证范围 |
| --- | --- | --- |
| W1 旧 Workflow 配置 | 独立 v8_006 SQL crosswalk、只读源快照、旧图安全子集归档、禁止运行和更新的保护触发器 | 合成 SQLite/PGlite **8项通过** |
| W2 知识库元数据 | 独立 v8_007 SQL crosswalk、离线计划、受控一次性导入入口、源哈希/Owner-RLS/回滚、对子文档/向量/共享数据严格阻断 | 合成 SQLite/PGlite **7项通过** |
| W3 旧定时任务 | 独立 v8_008 SQL、保留原规则的管理员隔离归档、目标默认 disabled、禁止创建 occurrences/运行 | 合成 SQLite/PGlite **至少8项通过** |
| W4 数据库验证/CI | 合成 PG17 TCP 多连接验收脚本纳入 v8_004–008；GitHub Actions 分 4 个独立 job，其中 5 个迁移矩阵子任务 | **静态配置通过，真实 PG17 尚未执行** |
| W5 团队共享与协作权限 | 单独 WebCodex Codex 开发 Agent 负责新文件和 v8_009，禁止其他 Agent 同时编辑这些文件 | 当前处于开发执行中，不计入已通过 |

上述互不依赖的文件由各自开发流独占。**唯一集成负责人**管理 `db/postgres/001_stage_schema.sql`、`db/postgres/010_verify_stage.sql`、`services/pg-api/package.json`、`.github/workflows/agent-studio-quality.yml`。任务间跨引用必须使用 SHA-256 绑定的旧 ID → UUID crosswalk，不能自行生成新 ID 丢失原有关系。

## 已完成的提效改造

- GitHub Actions CI：原来的串行 PostgreSQL SQL+迁移测试与原 PocketBase 业务测试分离，形成 `quality`、`pg-api-core`、`pg-migration-domains`、`pg17-tcp-isolated` 四个独立 job。分域 job 的 5 个矩阵任务 `test:stage-agent-import`、`test:stage-workflow-import`、`test:stage-kb-import`、`test:stage-schedule-import`、`test:stage-parallel-migrations` 互相独立，不因其他矩阵子任务失败而立即终止排队任务。YAML 解析及 CI 安全契约检查通过，但尚未推送/实际触发 Actions。
- 本地快速回归：新增 `pnpm test:pg-fast` → `ops/pg-parallel-tests.mjs`。运行时动态扫描所有 PG 服务测试文件，以 `--test-concurrency=2` 并行执行；禁用继承的执行/导入选项，不触及真实 PG17 或生产系统。**最新本地执行 57项通过、0失败，约84秒**（可能随机器负载变化）。
- 并行开发：WebCodex 原生 ACP 自主编程 Agent 可用，但本次实际容量**每次只接纳1个 ACP Run**；已先完成 W1，再复用名额执行 W3，然后派发 W5。其余模块通过同一 WebCodex Run Process + 独立文件编辑同步推进。宿主的 native Job 并发上限 6 不能等同于 ACP Agent 并发上限。
- SQL 合并：共同基础保持原来已测试 20 张表，006/007/008 为可按序重复执行的增量脚本；`deploy/postgres-staging/compose.yaml` 新空库在初始化后按文件名顺序应用；旧数据卷必须经过独立备份/升级，不能反复初始化。已有 PGlite 联合迁移测试通过，保证表数、forced RLS 和跨域最小权限。
- 生产隔离：V8 前端试验页仅开发环境可启用，正式前端构建资源检测继续生效。

## 仍不可通过并行绕过的关键依赖

1. **真实 PostgreSQL 17 真机**：目前本机没有可用 Docker Engine，源目录也不是 Git 仓库；代码里的 Actions 并不代表已经运行通过。
2. **真实授权备份**：尚未读取公司的实际 PocketBase 快照；不知道真实行数、旧字段使用率和不兼容配置的占比，不能确定全部转换耗时。
3. **正式员工登录和身份映射**：真实 OIDC、角色/团队权限和最终 RLS 必须经审核，旧密码哈希及模型/工具 Key 不可机械复制。
4. **原功能对等**：旧 Workflow 可执行节点、知识库文本/向量/共享 ACL、定时任务规则、审批与外部写保护仍需要逐域完整验证。已有“保留在管理员隔离归档”不是业务功能迁移完成。
5. **部署切换及回滚**：必须验证行级对账、权限隔离、真实并发、备份恢复、Worker 不双重消费和费用控制，独立签收才可解除 NO-GO。

## 下一轮集成顺序

先完成 W5 的隔离协作归档和测试，再由集成负责人加入 009 增量脚本/表数验收/CI 矩阵。之后执行并行本地回归与全量构建，并将确实通过的稳定版本部署到**与公司正式数据库完全隔离的 PostgreSQL 17** 上进行真实源数据试验；不可直接开启宝塔生产切换。
