# Agent Studio VibeX · V7.1 第二轮架构治理

保留 VibeX 身份和计费集成、React + TypeScript 前端、PocketBase SQLite、现有 API 与独立 Worker。**未切换 PostgreSQL，未自动部署生产环境。**

## 已实施：三个持久化领域统一迁移日志

- pocketbase/pb_hooks/modules/schema_journal.js：统一、逐步、事务化的 SQLite migration journal。迁移成功后登记 ID 和说明；发现相同 ID 的说明被更改则拒绝静默重用。
- pocketbase/pb_hooks/modules/knowledge_schema.js：仍使用已经落地的三条知识域迁移，ID 和说明保持 V7 原版不变。
- pocketbase/pb_hooks/modules/runtime_schema.js：定时计划、触发记录、执行租约与工具副作用审计的非破坏性升级；新增租户查询索引。
- pocketbase/pb_hooks/scheduled_tasks.pb.js：原 API、执行 Worker 路由不变；启动使用 applyScheduleMigrations。
- pocketbase/pb_hooks/execution_leases.pb.js：原 CAS lease、side-effect journal 语义不变；启动使用 applyExecutionMigrations。

| 领域 | 迁移数 | 对存量数据的影响 |
| --- | ---: | --- |
| knowledge | 3 | 原有版本与数据保留 |
| execution | 2 | 登记老 lease / side-effects 结构，添加索引 |
| schedule | 2 | 登记老 schedule / occurrence 结构，添加索引 |

所有表仍在同一个 SQLite 中，也仍保留 PocketBase Collections。此机制是应用自定义版本表 agent_studio_schema_migrations，不是 PocketBase 内置 pb_migrations。

## 已实施：模型协议输出复用

新增 pocketbase/pb_hooks/modules/model_wire.js：

- 正确从 PocketBase HTTP 字节响应中解码包含中文和 Unicode 字符的 UTF-8 文本；
- 统一提取 OpenAI-compatible、Anthropic、Gemini 的文本响应；
- Agent 主运行 Tick、评估、方案优化及 Workflow Tick 共用解码；两个执行器共用 Provider 输出提取。

仅抽取纯响应协议：身份权限、连接授权、密钥解密、计费、调用参数、工具写入审批和实际发送请求仍由原执行器处理。此步并不代表整个模型网关已经服务化。

## 本轮验证

- tests/model-wire.test.mjs：纯 CommonJS 模块的 UTF-8/Unicode 和三家模型响应格式。
- tests/schema-migrations.integration.mjs：V6 等价 SQLite 存量升级、模拟已有 V7 三条知识迁移日志的升级、原计划/执行记录/租约/未知副作用保存，以及多次启动迁移幂等与跨租户过滤。
- tests/schedules.integration.mjs：真实定时 Agent/Workflow、独立 Worker、Token 鉴权、执行去重。
- tests/concurrency.integration.mjs 和 tests/agent-effects.integration.mjs：租约并发与副作用结果不明时阻断重放。
- pnpm test、pnpm test:e2e、pnpm build；CI 通过 pnpm check 覆盖新协议测试与已有迁移端到端检查。

## VibeX 回传

VibeX Source 选择 pb_hooks/ 后，ZIP 内根目录必须直接包含修改的 .pb.js 文件以及 modules/ 子目录。应用源代码增量包选择 app/。不要额外嵌套 app/app 或 pb_hooks/pb_hooks。使用前备份 SQLite 和旧版源码；VibeX 公开发布需要手动操作，源码导入不等于已经发布。

## 仍未实施的架构工作

大型 Agent/Workflow 的请求构建、工具调用以及 checkpoint 状态处理仍未完整拆分；没有多 Worker 严格 fencing、长期任务续租或外部写入 exactly-once 保证；知识库仍为关键词匹配，未加入向量/FTS5/重排；未做生产负载压测及真实付费模型/线上身份网关验收。

建议 V7.2：继续抽取模型请求协议和工具统一执行接口，补齐运行监控和备份恢复，再根据负载决定 PostgreSQL + pgvector 的实际迁移时机。

参考原架构约定：docs/ARCHITECTURE_V7.md
