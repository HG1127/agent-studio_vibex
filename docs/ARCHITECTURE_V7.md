# Agent Studio VibeX · V7 架构治理记录（第一批）

范围：保留现有 VibeX 生态、React + TypeScript 前端、PocketBase / SQLite、业务路由和独立 Worker。通过可回归验证的增量变更，改善模块职责与数据库可靠性。不代表已经迁移 PostgreSQL 或完成线上发布。

## 设计决策 ADR-001

采用模块化单体架构，而非立即拆微服务。新能力逐步以服务接口暴露，并保留原执行状态、API、用户归属等兼容契约。

本轮已实现：
- pocketbase/pb_hooks/modules/knowledge_search.js：统一知识库检索服务，REST API、Agent 及 Workflow 复用。
- pocketbase/pb_hooks/modules/knowledge_schema.js：知识域版本化 SQL 升级与日志记录。
- 数据库事务：知识库创建配额、文档导入（文档及所有片段）、删除与清理保持原子性。
- 真实 PocketBase 回归：存量 V6 数据升级、重复启动、租户隔离、Agent/Workflow 运行及定时触发。
- 工程 CI：增加模块语法、知识库与版本升级回归检查。

## 架构边界

~~~mermaid
flowchart TB
    UI[React Web 工作台] --> G[VibeX 身份网关]
    G --> PB[PocketBase API Hooks]
    PB --> E[Agent 与 Workflow 引擎]
    PB --> KS[Knowledge Search Service]
    E --> KS
    E --> L[模型与工具适配器]
    W[独立 Node Worker] --> PB
    KS --> DB[(SQLite / PocketBase)]
    E --> DB
    MIG[Knowledge Schema Migration] --> DB
~~~

当前主要代码责任如下：

- src/pages、src/components：应用 UI 和交互状态。
- src/lib：浏览器侧服务客户端、格式与时间计算。
- pocketbase/pb_hooks：路由鉴权、服务编排、运行控制。
- pocketbase/pb_hooks/modules/knowledge_search.js：无模块级可变状态的共享检索服务。契约是 search(app, ownerUid, baseIds, query, limit)，返回 {items,total_matches,retrieval,candidate_limit_reached,scanned_candidates}。
- pocketbase/pb_hooks/modules/knowledge_schema.js：应用自建 SQL 表的分步迁移。
- worker/run.mjs：独立任务推进、到期规则派发、失败退避。

Goja 允许本地 CommonJS require 导入共享模块；不能假定它能执行 Node.js 特有 API。当前使用的是 PocketBase Goja 模块，不是独立 Node 后端服务。

## 数据库版本管理

当前数据库仍为 SQLite。既有 PocketBase Collections 和自建知识表保持原状。V7 仅对知识域引入应用自定义日志表 agent_studio_schema_migrations，不等同于 PocketBase 官方 pb_migrations；其目的在于适配 VibeX 只能稳定回传 pb_hooks 的现有源码流程。

迁移：
1. knowledge_0001_existing_v6：检查并登记 V6 知识表及既有索引，非破坏性。
2. knowledge_0002_additive_indexes：补充基于租户与文档的查询索引。
3. knowledge_0003_cascade_triggers：新增删除知识库与文档时自动清理从属内容的触发器。

每一步在事务内执行，成功后才登记版本。已应用的迁移不可修改，应新增版本。仅为新删除增加清理约束；不自动删除升级之前可能存在的孤立历史数据。后续将定时任务、租约与运行记录纳入统一迁移管理。

## 数据访问与事务

所有持久知识检索均由服务端验证知识库归属。即使 Agent 配置和 Workflow 节点里包含一个知识库 ID，也不能据此读取其他用户的资料。

- 知识库创建：事务内验证配额并写入。
- 文档导入：事务内验证归属与配额，插入文档与全部片段并更新时间。
- 删除：父记录与从属内容在一个事务中清理。
- SQL 写入任一环节失败：整笔事务回滚。知识文档不会留下已发布的一半片段。

模型/工具对外执行的副作用不在该事务边界内，当前 Worker 也还没有长任务严格 fencing，不能宣称所有外部写入 exactly-once。

## 当前边界与未完成部分

- 检索是关键词/中文双字匹配；每库最多读取最近 1600 个候选片段，响应标记 candidate_limit_reached 说明搜索可能未覆盖完整资料。未引入 FTS5、向量、pgvector 或语义重排。
- 大型 agent_engine.pb.js / workflow_api.pb.js 尚未完成全面拆分；本轮先去重最常被重复调用的知识检索逻辑。
- 界面仍有部分大 Hook；后台 Worker 是单进程串行推进。
- 安全依赖可信 VibeX 网关代理并保护用户身份头，生产不能允许公网直连 PocketBase。
- 自动测试使用模拟模型，不等于外部付费模型与线上部署的验收。

## 下一批实施顺序

1. 统一模型路由与工具执行接口，逐步拆分 Agent/Workflow 巨型 Hook；每次搬移都保留原路由并通过端到端测试。
2. 统一 owner-scoped 数据访问，给运行记录、租约、调度自建表逐步加版本化迁移。
3. 建立备份恢复演练、检索覆盖率和 SQL 锁等待观测；扩充运行态指标。
4. 评估 SQLite FTS5 的全文索引和中文切词；然后按真实需求考虑向量/混合检索。
5. PostgreSQL + pgvector 仅作为长期目标：首先建立独立 Repository 合约，做影子校验、数据量与哈希比对、切换和回滚演练，不允许在缺少一致性机制时并行写两个数据源。
6. 规模确实需要时再增加对象存储、任务队列、水平扩展及真正的执行续租/严格 fencing。

## 验证与 VibeX 回传

推荐命令：

    pnpm test
    pnpm test:knowledge
    pnpm test:migrations
    pnpm test:schedules
    pnpm test:e2e
    pnpm build

VibeX Source 选择 pb_hooks/ 时，ZIP 内应该直接是 Hook 文件与 modules/ 子目录；选择 app/ 时，ZIP 内应直接是 package.json 等应用相对路径。不要将 pb_hooks/ 或 app/ 额外套在包内。平台受保护库不可覆盖，任何 PATH_FORBIDDEN / INVALID_PATH 都视为失败。上线前先备份原 SQLite，验证预览，并另行发布正式快照。

PocketBase 官方文档：
- https://pocketbase.io/docs/js-overview/
- https://pocketbase.io/docs/js-migrations/
- https://pocketbase.io/docs/js-database/
