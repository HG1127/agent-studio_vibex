# Agent Studio V8.4 — PostgreSQL 并行交付执行记录

**唯一项目：agent_studio_vibex版本。生产状态：NO-GO。** 此文档为实际写入源码与本地测试事实，不是已进入生产的声明。原 PocketBase、宝塔服务器和正式数据库未被本轮迁移工具修改。

## 可并行的五条工作流

| 工作流 | 当前可核对的成果 | 已验证范围 |
| --- | --- | --- |
| W1 旧 Workflow 配置 | 独立 v8_006 SQL crosswalk、只读源快照、旧图安全子集归档、禁止运行和更新的保护触发器 | 合成 SQLite/PGlite **8项通过** |
| W2 知识库元数据 | 独立 v8_007 SQL crosswalk、离线计划、受控一次性导入入口、源哈希/Owner-RLS/回滚、对子文档/向量/共享数据严格阻断 | 合成 SQLite/PGlite **7项通过** |
| W3 旧定时任务 | 独立 v8_008 SQL、保留原规则的管理员隔离归档、目标默认 disabled、禁止创建 occurrences/运行 | 合成 SQLite/PGlite **至少8项通过** |
| W4 数据库验证/CI | PG17 TCP 多连接验收脚本覆盖 v8_004–011；GitHub Actions 拆成 4 个独立 job、8 个迁移矩阵子任务 | **静态配置及本地 PG 引擎验证通过，真实 PG17 尚未执行** |
| W5 团队共享与协作权限 | v8_009 私有归档，历史关系及审批证据保留，但所有共享权限保持禁用 | 合成 SQLite/PGlite 测试通过；团队 RBAC 未切换 |
| W6 知识库正文/分片/向量 | v8_010 保存原始数组字符串及跨记录关系，管理员专用冻结归档，不激活 RAG | 8 项合成测试通过；W2 对非空知识库的导入仍阻断 |
| W7 员工身份安全预配 | v8_011 仅由已审核备份与 OIDC 映射写入 disabled 账号及 crosswalk，不复制旧密码 | 7 项合成测试通过；正式 OIDC 实证与账号启用未完成 |

上述互不依赖的文件由各自开发流独占。**唯一集成负责人**管理 `db/postgres/001_stage_schema.sql`、`db/postgres/010_verify_stage.sql`、`services/pg-api/package.json`、`.github/workflows/agent-studio-quality.yml`。任务间跨引用必须使用 SHA-256 绑定的旧 ID → UUID crosswalk，不能自行生成新 ID 丢失原有关系。

## 已完成的提效改造

- GitHub Actions CI：原来的串行 PostgreSQL SQL+迁移测试与原 PocketBase 业务测试分离，形成 `quality`、`pg-api-core`、`pg-migration-domains`、`pg17-tcp-isolated` 四个独立 job。分域 job 的 8 个矩阵任务（Agent、Workflow、KB 元数据、日程、协作归档、KB 内容归档、禁用员工预配、跨模块结构测试）互相独立，YAML 解析及 CI 安全契约检查通过。项目已关联 GitHub 并触发 Actions，但**第一轮作业在启动执行步骤前因 GitHub 运行器/账单限额阻断而失败**，没有任何 PG17 真机 PASS。
- 本地快速回归：新增 `pnpm test:pg-fast` → `ops/pg-parallel-tests.mjs`。运行时动态扫描所有 PG 服务测试文件，以 `--test-concurrency=2` 并行执行；禁用继承的执行/导入选项，不触及真实 PG17 或生产系统。近期本地回归曾验证 67 项测试通过；新增 W6/W7 后需以最终全量验收为准（运行耗时随并发、机器负载变化）。
- 并行开发：WebCodex 原生 ACP 自主编程 Agent 可用，但本次实际容量**每次只接纳1个 ACP Run**；已先完成 W1，再复用名额执行 W3，然后派发 W5。其余模块通过同一 WebCodex Run Process + 独立文件编辑同步推进。宿主的 native Job 并发上限 6 不能等同于 ACP Agent 并发上限。
- SQL 合并：共同基础保持原来已测试 20 张表，006–011 为可按序重复执行的增量脚本（v8_010 增加四张知识库归档表）；`deploy/postgres-staging/compose.yaml` 新空库在初始化后按文件名顺序应用；旧数据卷必须经过独立备份/升级，不能反复初始化。已有 PGlite 联合迁移测试通过，保证表数、forced RLS 和跨域最小权限。
- 生产隔离：V8 前端试验页仅开发环境可启用，正式前端构建资源检测继续生效。

## 仍不可通过并行绕过的关键依赖

1. **真实 PostgreSQL 17 真机**：目前本机没有可用 Docker Engine，源目录已经关联 GitHub 远程仓库，但第一轮 GitHub Actions 在作业启动前被运行器计费/额度问题阻断；代码里的 Actions 不代表已通过真实 PG17。
2. **真实授权备份**：尚未读取公司的实际 PocketBase 快照；不知道真实行数、旧字段使用率和不兼容配置的占比，不能确定全部转换耗时。
3. **正式员工登录和身份映射**：真实 OIDC、角色/团队权限和最终 RLS 必须经审核，旧密码哈希及模型/工具 Key 不可机械复制。
4. **原功能对等**：旧 Workflow 可执行节点、知识库文本/向量/共享 ACL、定时任务规则、审批与外部写保护仍需要逐域完整验证。已有“保留在管理员隔离归档”不是业务功能迁移完成。
5. **部署切换及回滚**：必须验证行级对账、权限隔离、真实并发、备份恢复、Worker 不双重消费和费用控制，独立签收才可解除 NO-GO。

## 下一轮集成顺序

W5–W7 的隔离归档/身份预配代码及 CI 矩阵已经就绪，下一阶段应解决 GitHub Actions 运行器阻断、获取经批准的真实离线快照并进行完整迁移差异盘点。之后执行并行本地回归与全量构建，并将确实通过的稳定版本部署到**与公司正式数据库完全隔离的 PostgreSQL 17** 上进行真实源数据试验；不可直接开启宝塔生产切换。
