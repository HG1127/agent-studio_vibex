# Agent Studio V8 — 独立 PostgreSQL API 试验版

## 状态与架构

本项目主要供公司内部使用。V8 新增独立 Node.js + TypeScript + PostgreSQL 后端，目前 Agent 配置、Workflow 安全骨架、知识库元数据三条链路通过隔离测试；但 React + PocketBase/SQLite + Worker 仍是现有业务唯一实际运行路径。公司宝塔 Ubuntu 24 服务器已有约 40 个网站和 11 个数据库，本阶段没有连接它、执行任何部署或复制正式业务数据。

新增目录：
- services/pg-api：Node 24、TypeScript、node-postgres、jose OIDC/JWT 验证、按员工隔离的 Agent 配置 API。
- db/postgres：19 张业务表、pgvector、RLS、任务队列及租约 SQL、staging 受限账号。
- deploy/postgres-staging：独立 Docker Compose、不同的数据库/API Secret、默认关闭的 API pilot profile。
- tests/postgres-api-pilot.test.mjs 及 services/pg-api/tests：模拟 HTTP、真实 JWT 签名、实际 PGlite PostgreSQL 引擎的测试。

API pilot 包含：
- GET /healthz，进程状态（不代表数据库、身份、Worker 全部就绪）。
- GET /api/v2/agent-specs，本人 Agent 列表，最大 50 条。
- GET /api/v2/agent-specs/:uuid，本人 Agent 配置。
- POST /api/v2/agent-specs，创建本人安全白名单 Agent 方案。
- PATCH /api/v2/agent-specs/:uuid，校验 expected_revision 乐观锁。
- GET /api/v2/workflows、GET /api/v2/workflows/:uuid，按登录员工隔离读取工作流配置。
- POST /api/v2/workflows，校验仅含节点、连线、标题、坐标的安全工作流骨架；保留七种节点类型名称但尚不支持运行配置。
- PATCH /api/v2/workflows/:uuid，使用 expected_revision 乐观锁，阻止覆盖其他员工或旧版本。
- GET /api/v2/knowledge-bases、GET /api/v2/knowledge-bases/:uuid，按已验证员工身份获取本人私有知识库元数据。
- POST /api/v2/knowledge-bases、PATCH /api/v2/knowledge-bases/:uuid：私有知识库名称、说明的安全读写和版本冲突控制。
- GET /api/v2/knowledge-bases/:uuid/documents：仅返回本人已登记的文档文件名、MIME、状态与哈希，不公开对象存储引用、正文或向量；不支持上传。
- POST /api/v2/knowledge-bases/:uuid/search：只针对本人已索引的资料片段执行字面关键词检索，返回上限 10 条、每条最多 360 字符的摘录和文件名/chunk 引用。非语义 RAG。
- POST /api/v2/knowledge-bases/:uuid/text-documents：导入小规模 TXT/Markdown 文字，事务化分块保存并提供引用。
- POST /api/v2/knowledge-bases/:uuid/document-files：受限小型 PDF/DOCX 的服务器提取文字、按所属员工分块入库；不存原文件、不提供 OCR。
  该二进制解析现由独立 Node 子进程执行，有超时、并发上限和进程清理；仍非完整容器安全沙箱。见 POSTGRES_V8_DOCUMENT_ISOLATION.md。

现阶段不接受外部工具连接凭据、已有知识库 ID 和任意写操作授权；不自动运行新建 Agent。

## 身份与数据库权限

独立 API 不信任用户自己填写的 X-Rh-User-Id。JWT 必须有经过真实签名校验的 Issuer、Audience、签发时间和过期时间；JWKS 仅允许与 HTTPS 发行方同源。正式部署的真实员工身份体系尚未接入。

数据库 API 用户只允许以 agentstudio_stage_login 登录，必须是非超级用户、不能 BYPASSRLS。连接池中的每次用户查询先 BEGIN，SET LOCAL ROLE agentstudio_api，再映射签名身份至内部用户 ID，设置事务局部 actor_id，业务表使用 owner-only RLS，事务结束后权限不应残留。RLS 会限制跨员工访问，但未来团队级 RBAC 还未实现。

staging PostgreSQL 的初始化文件 db/postgres/011_stage_api_login.sql 从独立 Docker Secret 文件读取随机 API 密码。数据库管理员密码与应用账号密码必须不同，不得打包到源码。数据库初始化只在空 staging 卷首次执行；已有数据库升级必须使用单独迁移流程。

## 已经实际验证的内容

- PGlite 嵌入式 PostgreSQL 加载 19 张表和 pgvector；20 条 RLS 策略、18 张强制 RLS 业务表。
- 两个合成员工 Agent 的插入、更新、版本冲突和数据隔离；pgvector 向量距离查询。
- 使用实际 SQL 进行任务领取、租约版本校验、防过期确认。
- 使用本地生成的真实 RSA 签名测试 JWT、错误 Issuer、Audience、密钥和过期时间。
- 非管理员 staging 登录角色、SET ROLE、真实 PostgreSQL RLS 拒绝跨员工插入（轻量及完整数据库结构两类 PGlite 测试）。
- Node.js HTTP 路由拒绝未登录、伪造头和跨员工资源，并验证连接释放。
- 知识库现在新增关键词短片段检索和仅限服务端内部调用的 pgvector 相似度 SQL；PGlite 已验证跨员工阻断、文档状态过滤及不返回对象存储路径、向量和完整文档。真实 Embedding 供应商尚未接通。

PGlite 是隔离 PostgreSQL WebAssembly 引擎，不能替代正式 Linux PostgreSQL 17、真实 TCP 多连接、多 Worker、高可用及备份恢复验收。以上均未连接公司宝塔正式服务器。

## 命令行无浏览器验收

先在隔离开发环境安装服务依赖：

    pnpm --dir services/pg-api install --ignore-workspace --frozen-lockfile --ignore-scripts

运行：

    pnpm --dir services/pg-api run check
    pnpm test:postgres-staging
    pnpm test:postgres-api-mock
    pnpm --dir services/pg-api run test:auth
    pnpm --dir services/pg-api run test:engine
    pnpm --dir services/pg-api run test:workflow
    pnpm --dir services/pg-api run test:knowledge
    pnpm --dir services/pg-api run test:document-parser
    pnpm --dir services/pg-api run test:document-worker
    pnpm --dir services/pg-api run test:role
    pnpm --dir services/pg-api run test:role-full

全部测试使用本地生成的合成数据，不打开浏览器、PocketBase 管理页或公司真实数据库。HTTP 测试仅在开发机回环端口启动临时测试服务。持续集成采用独立安装和串行测试，避免多个 PostgreSQL WASM 测试进程竞争内存。

## 宝塔隔离环境的部署边界

deploy/postgres-staging/compose.yaml 将 PostgreSQL 放在独立 internal Docker 网络中，数据库本身不映射任何宿主机端口。可选 API profile 仅映射宿主机 127.0.0.1:7402；不是公网可直接使用的服务。真正的公司员工访问还需身份网关和反向代理的权限配置。

必须先由运维审核 Ubuntu 24 服务器现有 Docker、网站、数据盘、网络、备份和 55 条安全提示的具体内容。任何 Compose up、镜像拉取、建库、开放 API 或迁移生产数据都属于有状态操作，本阶段没有执行。

## 尚未实现和上线阻断

独立后端已有 Agent、Workflow 安全骨架、知识库元数据及已索引短片段的关键词检索 API，但**没有工作流模型/工具执行逻辑**，也没有生产级大文件存储和隔离解析、Embedding 生成、完整语义 RAG、Agent 知识库绑定；实际 Agent Worker、审批、定时任务与团队权限均未迁移。内部 pgvector 查询方法目前只供可信服务器代码调用，尚未连接实际 Embedding 模型。未完成真实 PostgreSQL 17 引擎验收、真实 OIDC 登录、PocketBase 迁移映射、备份恢复、并发压测和公司员工验收。

不能将这些测试的成功等同于 PostgreSQL 已经接管 Agent Studio。既有 V7.8 PocketBase 基线必须保持，严禁两个 Worker 同时处理同一真实外部写任务。正式使用状态仍为 NO-GO。
