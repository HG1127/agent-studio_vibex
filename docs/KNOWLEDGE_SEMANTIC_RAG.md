# Agent Studio 独立版｜语义知识库与 Agent RAG

> 2026-10-14 源码落地记录。适用于 **agent_studio_vibex版本 的独立 PocketBase + SQLite 运行链路**，不是 V8 PostgreSQL/pgvector 的上线声明。

## 一、能力及功能边界

知识库保留了创建/编辑/删除、TXT/MD/CSV/HTML/PDF 文字层/DOCX 导入、文档自动分段、文件名及片段编号引用。现补充：

| 功能 | 实现 |
| --- | --- |
| 真实 Embedding | 服务端通过员工授权的 OpenAI-compatible `POST /embeddings` 获取向量，不能用关键词“伪造语义能力” |
| 向量存储 | SQLite 归属隔离的 `agent_studio_kb_vectors`，采用向量 JSON 与维度、模型、片段关联元数据 |
| 自动增量索引 | 上传新文档后写入持久队列，Node Worker 按批次索引，浏览器关闭不影响队列（前提是 Worker 运行） |
| 旧资料补索引 | 首次设置或更换模型，自动重建该员工所有知识库的向量队列 |
| 检索模式 | 自动（默认）/混合/仅语义/仅关键词；混合采用 cosine similarity + Reciprocal Rank Fusion |
| 模型异常 | 自动模式退回关键词并显示状态；强制语义/混合模式返回明确错误，不伪造向量结果 |
| 助手调用 | Agent 已绑定知识库与 `knowledge_search` 工具时通过同一检索服务自动使用语义或混合 |
| 工作流与定时任务 | Workflow 知识检索工具复用统一服务，后台 Worker 按员工权限检索 |
| 引用与权限 | 返回真实原文、文件名和片段编号；每次验证用户对全部知识库的 Owner/Viewer/Editor 授权，未授权员工不可跨租户检索 |

**规模边界：** 当前仍使用 SQLite + Goja，不是 pgvector 专业 ANN 向量索引。单库语义查询最多扫描较新的 700 个向量片段，关键词扫描最多 1600 个文本片段；超限返回覆盖提示。相关性得分为工程排序信号，不代表事实正确性或内容可信度。未实施 cross-encoder 重排、OCR、全文结构解析或正式生产级向量索引大规模压测。**显式授权团队共享**已在 V1 增加；V2 在额外语义授权、兼容模型与已有文档索引齐备后，成员可用自己的模型仅对查询生成向量，不使用所有者的付费查询密钥，详见 [团队语义 V2](TEAM_SEMANTIC_AND_REVISIONS_V2.md)。

## 二、员工操作流程

1. **配置模型连接。** 在「能力与连接 → 模型连接」先创建并启用本人获得授权的 OpenAI 兼容连接，填写 Base URL 和 API Key。与 Chat Completion 模型不同，必须另有真实可用的 Embedding 模型 ID（如供应商提供 `text-embedding-3-small`）。
2. **启用语义。** 进入「知识库 → 语义检索与向量索引」，选择本人连接并填写 Embedding 模型 ID，点击保存。此设置对本人所有知识库生效，绝不能将模型密钥复制给其他员工。
3. **导入或选择旧文档。** TXT/PDF 文字层/DOCX 等先建立可立即查询的关键词片段。若语义配置就绪，资料自动进入持久索引队列，进度可查看已索引/总片段。
4. **检查状态。** 后台 Worker 正常运行时会分批调用模型。必要时点击「立即索引下一批」或「重建此库向量」；重建可能产生模型费用。状态会展示待处理、重试时间及错误代码。
5. **选择检索策略。** 搜索调试默认“自动”：有向量时混合，未配置或服务临时异常时关键词兜底。选择“仅语义”或“混合”则要求对应能力可用，失败不静默降级。
6. **绑定给 Agent/Workflow。** 助手方案里勾选本人知识库或被明确授权的团队知识库并启用 `knowledge_search`。执行时根据查询取回带出处的原文作为模型上下文。工作流配置工具节点 `knowledge_search` 和 `knowledge_base_ids` 亦可使用。两者都通过后端自动策略，而非前端搜索模式设置。
7. **安全引用。** Agent 回复需要附 `[文件名 · 片段N]`，查不到就说明没有可靠片段，不应捏造“引用”。上传文本被视为非受信任证据，不允许作为更高优先级指令执行。

## 三、管理员与运维配置

- 员工身份来自独立 `studio_users` PocketBase 签名令牌；旧字段 `rh_user_id` 仅保留数据库兼容命名，不等于外部平台登录。
- Embedding Provider 的密钥存放在现有 `model_connections` 中，后端按当前员工验证归属与状态，并仅在服务端解密；浏览器不返回向量、密钥及原始 Provider 响应。
- 外部 Embedding URL 需使用 **HTTPS** 且目标主机必须被服务器环境变量 `AGENT_STUDIO_EMBEDDING_ALLOWED_HOSTS` 精确授权（逗号分隔，默认只允许 `api.openai.com`）。这不是对任意员工提供的 URL 代理。
- 仅隔离开发测试可设置 `AGENT_STUDIO_EMBEDDING_ALLOW_LOOPBACK=true`，并明确配置 `AGENT_STUDIO_EMBEDDING_LOOPBACK_PORTS` 端口清单。生产禁止随意开放回环/内网模型服务端口。
- Worker 使用 `AGENT_STUDIO_WORKER_TOKEN`，调用 `POST /api/internal/knowledge/index-next`，每轮最多批量索引几个分段，并在失败时按队列进行退避重试。需部署常驻 Worker 才能在浏览器关闭后继续进行。
- 后台 Worker 与前端的「立即索引」共用数据库索引租约，避免同一批片段被并发调用 Embedding 接口而重复计费。遇到 `embedding_index_busy` 时应等待当前批次结束，不要无限重试。
- 多个知识库同时排队时，Worker 每轮只处理其中一个库的一批片段，因此不能以一次 Worker 调用判断全部完成。每库依据 `indexed_chunks / total_chunks`、队列状态和失败重试时间独立判断。空知识库及已完成的队列会被自动清理，避免反复空轮询。
- **保密要求：** 建立文档向量时会把文档片段文本发送给所有者的 Embedding 服务商；检索时只发送查询文本。Agent/Workflow 最终推理仍可能将检索到的原文片段发送给执行员工批准的 LLM。必须完成资料分级和服务商合规审批。
- 所有配置修改、新索引、向量删除和重建都应先在数据快照测试。知识域迁移 `knowledge_0004_embedding_index` 是**增量非破坏性**迁移，原文与原有检索表保持不变；生产迁移前仍必须先备份并演练。

## 四、技术链路

```text
文件上传/粘贴 → PocketBase 数据归属校验 → 原文分段表 → 关键词检索即刻可用
                                     ↓
                              持久化向量索引队列
                                     ↓
Node Worker → 拥有者的模型连接（密钥服务端解密）→ Embedding API → 向量归属表
                                     ↓
Agent / Workflow / 搜索页面 → 知识库归属验证 → 关键词+Cosine融合 → 原文片段+引用
```

新后端组件：

- `pocketbase/pb_hooks/modules/knowledge_schema.js`：V7 版本日志中的 `knowledge_0004_embedding_index`。
- `pocketbase/pb_hooks/modules/knowledge_embedding.js`：模型接口白名单、向量验证、索引队列、增量及重建。
- `pocketbase/pb_hooks/knowledge_semantic.pb.js`：员工设置与索引 API、服务端 Worker 的有密钥接口。
- `pocketbase/pb_hooks/modules/knowledge_search.js`：词法检索、相似度、融合排序和 Agent 安全引用格式。
- `pocketbase/pb_hooks/knowledge_access.pb.js`、`modules/knowledge_acl.js`：团队 Viewer/Editor 授权及按每个库真实所有者的检索隔离。
- V2 新增 `knowledge_0006_shared_semantic_consent`、`knowledge_shared_semantic.pb.js`：按成员单独许可复用原始文档索引，查询者自行配置同模型服务及密钥，持续核验授权。
- `worker/run.mjs`：接入语义索引调度，继续保留既有 Agent、Workflow 和定时任务调度。
- `src/pages/KnowledgeBases/KnowledgeBasesPage.tsx`：模型设置、进度、立即索引、重建、检索模式与结果诊断。

新增 HTTP 路由（均需通过独立账号认证，最后一条需要服务端 Worker Token）：

```
GET  /api/knowledge-bases/semantic/settings
POST /api/knowledge-bases/semantic/settings
GET  /api/knowledge-bases/semantic/status?base_id=...
POST /api/knowledge-bases/semantic/index
POST /api/knowledge-bases/semantic/rebuild
POST /api/knowledge-bases/search             # mode=auto/semantic/hybrid/lexical
POST /api/internal/knowledge/index-next
```

## 五、验收与下一阶段

```sh
pnpm test:knowledge    # 原关键词、Agent/Workflow 与归属隔离
pnpm test:semantic     # 真实临时 PB+SQLite + 模拟 Embedding + Agent/Workflow
pnpm test:migrations   # 旧版本数据升级与重复迁移安全
pnpm check             # 安全单测 + TS + Vite 生产构建
pnpm test:e2e          # 既有全量链路加语义链路回归
```

验收至少覆盖：不含关键词的语义改写检索；混合融合；模型错误自动降级；员工 A/B 不互查、不复用他人 API Key；Worker Token 授权；浏览器与 Worker 同时索引时不会重复请求；多知识库队列与空库自动清理；删除文档后向量一同清除；切换模型后的索引失效与重建；模型 URL 白名单拒绝未授权地址；Agent 二次模型调用确实收到原始证据；工作流结束节点输出引用。

本阶段集成测试使用本地模拟 Embedding 提供者来**验证协议和功能闭环**，不能证明真实商业模型的召回率、供应商费用、可用性或上线质量。正式启用需审批服务商、真实 API 小样本试运行、语义召回评估、浏览器 UI 验收及公司服务器备份/监控安全验收。
