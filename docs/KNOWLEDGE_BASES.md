# 知识库使用与验收指南

当前 Agent Studio **独立 PocketBase + SQLite 版本** 已实现持久化知识库，供 Agent、工作流及定时任务调用。除原有关键词检索外，现已增加可选的真实 Embedding、后台增量向量索引及自动混合检索。具体配置、数据保密要求和真实边界请见 [语义知识库与 RAG 指南](KNOWLEDGE_SEMANTIC_RAG.md)。

## 已实现

- 登录账号可创建、编辑、删除知识库（上限 50 个）；每库最多 80 份文档。
- 浏览器抽取 TXT、Markdown、CSV、TSV、JSON、HTML、带文字层 PDF 和 DOCX。
- 抽取文字经服务端持久化并分段：每段最多 950 字符，约 120 字符重叠；每份最多 160000 字符。
- 检索页面可测试关键词与中文双字匹配，查看原文片段、文件名和片段号。
- 员工可选用已有 OpenAI-compatible Embedding 模型连接，后台自动分批建立向量，页面展示索引进度、失败重试与重建功能。
- 支持自动、关键词、语义和融合（RRF）检索；自动模式在未配置或服务异常时退回关键词，严格语义模式不会伪造结果。
- Agent 方案可勾选一个或多个本人知识库；执行器实际运行 knowledge_search 并将带出处的片段提供给模型。
- 工作流工具节点可选择 knowledge_search 与指定资料库，并将带来源片段传给下游节点。
- 工作流 Agent 角色使用关联助手方案时，可引用该助手绑定的知识库。
- 独立 Worker 可以在定时运行时完成上述检索，浏览器关闭不阻断已部署的后台任务。

## 文件支持与真实边界

| 输入格式 | 客户端处理 | 文件限制 |
| --- | --- | --- |
| TXT、MD、CSV、TSV、JSON、HTML | 纯文本/DOMParser | 不超过 600 KB |
| PDF | PDF.js 抽取可复制文本并附页码 | 不超过 12 MB、100 页 |
| DOCX | Mammoth 抽取正文段落 | 不超过 8 MB |

服务端只保存提取后的文本、文件名和分段索引，不保存原始二进制。PDF 扫描图片没有文字层时需要 OCR（尚未实现）；DOCX 复杂表格与 PDF 版面结构可能丢失；不支持传统 .doc 和加密文件。所有格式抽取后字符数不能超过 160000。

## 使用操作

先在「能力与连接 → 知识库」创建资料库，导入文件或粘贴文本，输入检索词核对原文及出处。
语义检索：先在「模型连接」保存真实 Embedding 模型的 OpenAI 兼容连接；在知识库页选择该连接与模型名称。既有文档会排队建立向量，新文档导入后自动加入队列，后台 Worker 必须保持运行。搜索默认“自动”，可以强制选择关键词、混合或纯语义模式。模型会收到文本片段，请先完成内部数据授权审批。

Agent：回到「工作台 → 助手方案」，在「关联知识库」勾选资料库，保存，使用关联方案运行。若未绑定库，兼容旧版方案文本匹配。

工作流：新建工具节点，选 knowledge_search，勾选知识库。JSON 入参示例：

    {"query":"{{input}}"}

可传给下游模型节点生成回答，也可直接连到结束节点查看真实来源。

定时任务：选取上述工作流或 Agent 配置时区和执行周期。自动执行要求 PocketBase、持久运行的独立 Worker 与必要模型连接都部署在线。

## 后端路由

- GET /api/knowledge-bases
- POST /api/knowledge-bases/manage
- GET /api/knowledge-bases/documents?base_id=...
- POST /api/knowledge-bases/documents
- POST /api/knowledge-bases/search
- GET/POST /api/knowledge-bases/semantic/settings
- GET /api/knowledge-bases/semantic/status?base_id=...
- POST /api/knowledge-bases/semantic/index
- POST /api/knowledge-bases/semantic/rebuild
- POST /api/internal/knowledge/index-next（仅后台 Worker Token）

PocketBase Hook 保留原有三个 SQLite 知识表：agent_studio_kb_bases、agent_studio_kb_documents、agent_studio_kb_chunks；新增员工级向量模型设置、向量片段和后台索引队列表（agent_studio_kb_embedding_settings / agent_studio_kb_vectors / agent_studio_kb_embedding_queue）。
V7 使用自定义版本日志 agent_studio_schema_migrations 记录 4 个知识域非破坏性迁移版本（最新 knowledge_0004_embedding_index），补充查询索引与删除清理触发器；文档导入、配额判断与多段索引写入均在单个数据库事务完成。它不是 PocketBase 官方 pb_migrations。共享检索服务位于 pocketbase/pb_hooks/modules/knowledge_search.js，REST、Agent 和 Workflow 使用同一检索接口。

所有数据操作、Agent 工具与工作流都必须通过独立 PocketBase 令牌验证员工身份并复核知识库归属，浏览器自填身份 Header 不能视为认证。生产必须保护 PocketBase 原始端口；Embedding 目标采用服务器授权域名清单。上传资料属于待核实数据，不能成为系统指令。

## 自动验收

- pnpm test:knowledge：临时 PocketBase，真实数据库 CRUD、索引、租户隔离；模拟模型完成 Agent 检索与引用，工作流端到端执行。
- pnpm test:semantic：使用真实隔离 PocketBase+SQLite 和本地模拟 Embedding，验证语义改写、混合检索、Agent/Workflow 接入、错误降级、Worker 与多租户隔离。
- pnpm test:migrations：从 V6 既有数据启动，验证可升级、重复启动不重演迁移、关联资料自动清理。
- pnpm test:schedules：真实后台 Worker 触发定时知识库工作流，结果带文件名与片段引用。
- pnpm build：TypeScript + Vite 构建。
- pnpm test:e2e：全量后台集成回归。

当前模型调用测试使用本地模拟 Provider，并非真实付费模型质量评测；浏览器文件解析路径还需要线上 UI 验收。生产需要配置真实模型/网关/长期运行 Worker 并发布新版本。

## 后续建设事项

目前已新增基于真实 Embedding 的向量和混合检索，但 **尚不是 pgvector / ANN 大规模向量数据库，也没有交叉编码器精排、正式召回率评测、PDF OCR、文档页码深链接、跨员工共享、企业数据同步及 Worker 严格 fencing**。关键词每库最多扫描较新的 1600 个候选片段，语义模式每库最多扫描较新的 700 个向量候选；API 返回覆盖状态提醒，超过候选上限不能保证历史资料完整召回。真实模型与企业环境仍须单独上线验收。
