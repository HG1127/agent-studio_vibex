# Agent Studio V8：PostgreSQL 知识库元数据 API（内部试验版）

## 结论和实际状态

本阶段在独立 Node.js + TypeScript 后端新增**知识库元数据管理**。使用合成员工 A/B、真实本地签名 JWT 和完全隔离的 PGlite PostgreSQL/pgvector 在本地执行 SQL 及 HTTP 业务回归。

这不是原有 PocketBase 知识库的数据迁移，也不是完整 RAG。新增了受控的 TXT/Markdown/PDF/DOCX 小文件文字导入、事务化分块、只读关键词检索，以及仅供受信任服务内部调用的 pgvector 相似度 Repository 方法；尚未接通正式 Embedding 模型、OCR、对象存储。没有启动宝塔的 PostgreSQL 17、没有修改公司数据库、没有上传公司文件或调用真实模型。现有 React/PocketBase 业务仍为唯一实际运行路径。

## 新增 API

| 方法与路径 | 功能与限制 |
| --- | --- |
| GET /api/v2/knowledge-bases | 本人私有知识库列表，最多 50 条 |
| GET /api/v2/knowledge-bases/:uuid | 本人私有知识库详情 |
| POST /api/v2/knowledge-bases | 新建本人私有知识库，仅接受 name、description |
| PATCH /api/v2/knowledge-bases/:uuid | 修改名称与说明，需 expected_revision 乐观锁 |
| GET /api/v2/knowledge-bases/:uuid/documents | 本人已登记文档元数据，**不返回 object_key、内容、Embedding** |
| POST /api/v2/knowledge-bases/:uuid/search | 本人私有库、已索引文档的字面关键词检索，参数 query（2～160 字符）、limit（1～10），返回最多 10 条、每条不超过 360 字符的来源片段与 filename#chunk-N 引用 |
| POST /api/v2/knowledge-bases/:uuid/text-documents | 导入最多 12000 字符的 TXT / Markdown 文字，服务端按 800 字符分块并建立可检索索引 |
| POST /api/v2/knowledge-bases/:uuid/document-files | 导入最多 512 KiB 的 PDF 或 DOCX（二进制 base64 经 JSON 传输，整个请求不超过 760 KiB），服务端提取文字并分块；只适用于可提取文字的文档，扫描件需要 OCR |
PDF/DOCX 解析现已移入独立 Node 子进程：每个实例最多并行 2 个解析进程，单任务最多 12 秒，Node V8 堆预算 256 MiB，并在执行完成/超时后终止。已验证真实文件、失败、超时、并发拒绝和进程清理。**进程隔离不等于操作系统沙箱**，正式使用仍需容器级权限、网络和 CPU/RSS 配额。详见 POSTGRES_V8_DOCUMENT_ISOLATION.md。

这条 API 当前支持受限的纯文本与 PDF/DOCX 文字导入和分块，但不提供原文件下载、OCR、删除、跨员工共享、团队权限、Agent 绑定或正式语义 RAG。原始 PDF/DOCX 二进制文件不会持久化，只保留提取后的限定长度文字与来源信息；请勿将其作为公司正式文档归档服务。关键词检索只是对已索引内容的受控查询，不会访问外部文件或模型。POST 或 PATCH 中的 team_id、visibility、api_key、object_key 等未授权字段会被拒绝。数据库 SELECT 始终限定 owner_user_id 与 visibility='private'。

## 实际数据库结构

已在 V8 的全新 staging 初始化 SQL 中，为 knowledge_bases 增加 revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0)，与 Agent/Workflow 的版本冲突规则保持一致。

**这项改动仅适用于全新空库的 V8 staging 初始化**。Docker entrypoint 不会自动升级已经创建的数据卷。对于已经使用初版 V8 SQL 初始化的环境，必须编写独立增量迁移，先备份并获得授权，不应直接重建数据卷，更不能在公司的既有 11 个数据库上运行。

知识文档表保留文件名、内容哈希、内部 object_key 等字段；面向员工的文档列表只返回允许展示的非敏感元数据，避免存储对象路径和正文泄露。
检索使用参数化 PostgreSQL strpos(lower(...)) 字面匹配，因此 % 和 _ 不作为 SQL 通配符；并对知识库、文档、片段的 owner_user_id 以及文档 status=indexed 进行过滤。返回值不包含对象存储路径、向量或完整文档。它目前没有专用全文索引，大规模资料需补充索引与限流。

## 权限与安全

- 员工身份来自通过签名、Issuer、Audience、过期时间验证的 JWT；不信任用户可自行填写的 X-Rh-User-Id。
- 每次业务查询必须在独立事务内解析实名员工身份并设置临时 actor_id，由 PostgreSQL RLS 做数据库层隔离；业务 SQL 同时显式限定 owner_user_id。
- 账号 A 无法读取、修改或列出 B 的私有知识库，也无法通过 B 的知识库 ID 列出文档。
- 创建、修改均只允许安全的名称和说明字段；每次修改增加版本，旧 expected_revision 返回 HTTP 409。
- 正式团队知识库功能将需要独立的成员目录、授权审批、撤权及文档级权限设计，不能将数据库里的 team visibility 预留字段误认为功能已完成。
- 普通 API 数据库角色仍不得修改员工账号映射，不能通过会话变量替代真正的身份认证。

## 自动化验证

    pnpm --dir services/pg-api run check
    pnpm --dir services/pg-api run test:knowledge
    pnpm --dir services/pg-api run test:document-parser
    pnpm --dir services/pg-api run test:document-worker
    pnpm --dir services/pg-api run test
    pnpm test:postgres-staging

知识库测试现已覆盖 JWT、双员工隔离、版本冲突、跨账号搜索拒绝、特殊字符不会变成通配符、未索引资料过滤、有限长度引用、PGlite 实际 pgvector 相似度查询、拒绝不安全模型/向量输入，以及 RLS 数据库权限。

所有测试都仅启动内存 PGlite + 本机随机回环 HTTP 测试服务，不需要 Chrome、VibeX 预览或 PocketBase 管理页。

## 下一阶段的实际开发工作

1. 已实现进程级解析隔离、超时、并发上限；未实现真正的 OS 沙箱、恶意文件扫描、每用户限流和生命周期管理。正式版本仍需专用隔离容器、对象存储、审计及备份策略。
2. 当前已实现 TXT/Markdown/PDF/DOCX 小文件提取与分块入 PG；下一步要实现 PDF/DOCX 大文件异步队列、解析失败恢复、页码级引用以及经授权的 Embedding 计算。
3. 内部 Repository 已测试 1536 维 pgvector 相似度 SQL，但不对浏览器开放向量接口。下一步需确定真实 Embedding 模型、后端向量生成、调用限额、维度版本、融合排序和来源证据回溯，才能完成真实模型语义检索验收。
4. 在受控 PostgreSQL 17 测试环境跑完真实连接池、多 Worker、RLS 和失败恢复；先做匿名化迁移演练，再申请切换。
5. 与 React 页面及 Agent 执行引擎适配。当前前端仍调用旧 PocketBase API，不能声称已完成整套切换。

**正式使用状态继续保持 NO-GO，直到可信身份、真实 PostgreSQL 17、迁移数据、Worker 和公司员工试用验收通过。**
