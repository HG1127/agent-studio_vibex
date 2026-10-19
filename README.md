# Agent Studio｜独立部署版

面向公司员工、非技术人员的 Agent 创建、运行、调试及集成工作台。当前分支已改为独立 PocketBase 员工账号认证，不再依赖 VibeX/RunningHub SSO；保留 React + TypeScript + Vite、PocketBase + SQLite、独立 Node Worker 及原业务模块。**仅隔离环境通过自动化测试，尚未正式上线。**

**独立安装与迁移说明：**[Agent Studio 独立账号与部署指南](docs/STANDALONE_AUTH_AND_DEPLOYMENT.md)。
**Ubuntu 宝塔内网主动同步（默认关闭）：**[GitHub CI 通过后服务器主动拉取、SQLite 备份和发布回滚指南](docs/LAN_OUTBOUND_CICD_UBUNTU.md)。
**语义知识库指南：**[Embedding、混合检索、Agent RAG 与索引运维](docs/KNOWLEDGE_SEMANTIC_RAG.md)。
**公司负责人工作台：**[跨员工运行统计、单次授权代审批与数据隔离](docs/COMPANY_OVERSIGHT_RBAC.md)。
**团队协作版本：**[团队知识库 ACL、同一 Agent 的提案与版本审核](docs/TEAM_COLLABORATION_V1.md)。
**团队语义与历史恢复 V2：**[共享向量的独立模型查询、授权撤销、Agent 逐字段对比与安全恢复](docs/TEAM_SEMANTIC_AND_REVISIONS_V2.md)。
**加速本地回归：**[双路并行 E2E、临时数据库隔离和串行回退](docs/E2E_PARALLEL_TESTS.md)。

## 主要模块

- **Agent 设计**：自然语言生成任务目标、范围、步骤、交付物和完成标准，可编辑并保存。
- **执行与 Harness**：Agent 逐步决策、工具调用、检查点、停止条件、重试、人工审批、运行日志与反馈。
- **工作流画布**：开始、模型、工具、Agent、条件、循环、结束七类节点及运行时间线。
- **定时任务**：单次、固定间隔、每天及每周执行；支持时区、夏令时、未来五次运行预览、立即运行、启停与历史审计。
- **知识库与语义 RAG**：按员工隔离管理资料，导入 PDF 文字层、DOCX 等，自动分段与引用；新增真实 Embedding 模型连接、向量索引后台队列、语义/关键词混合检索，并让 Agent、Workflow 与定时任务复用同一知识库。
- **V7 架构治理**：知识检索改为供 REST、Agent、Workflow 复用的 Goja 模块；知识域建立增量数据库版本日志与事务化写入，支持 V6 原数据非破坏性升级。
- **V7.1 架构治理**：定时任务/执行租约/外部写审计也纳入统一 SQLite 迁移日志；模型字节响应和主流 Provider 文本提取复用 Goja 协议模块。
- **V7.2 架构治理**：Agent 与 Workflow 统一模型请求协议构建；按租户监测任务超期及 Worker 心跳；提供仅用于受控主机的 SQLite 在线快照、完整性与恢复验证工具。
- **V7.3 架构治理**：统一模型连接 Repository、按运行追踪模型调用耗时/错误、Agent 与 Workflow 共享安全计算工具，并提供可访问的执行诊断页面。
- **V7.4 架构治理**：统一外部工具写入审批/重试分类；模型与工具元数据级追踪及 P50/P95 摘要；添加可控追踪保留工具；本地启动脚本不再自动打开任何网页。
- **V7.5 安全与体验**：外部工具调试 API 强制按账号核验连接归属；工具中心和工具连接 POST 试跑均须每次明确确认，取消不安全的一键重复写入；工具名称查重按租户隔离。
- **V7.6 公司内部工作台**：新增 /internal-overview 任务总览，展示当前员工待审批、失败运行、超期计划、外部写核验和最近运行；修复 Harness 监控跨员工统计混入问题。本项目以公司内部使用为主，不优先开发商业化 SaaS 功能。
- **V7.7 员工 Agent 共享**：新增 /internal-templates 页面；由已登录公司员工通过一次性分享码复制安全快照，不转移知识库、模型密钥或外部工具权限。独立版本由管理员在“员工与权限”开启 share_enabled，无需设置旧版 RH 员工 ID 白名单。
- **V7.8 内部上线闸门**：新增独立版本的 PocketBase 已验证员工 JWT、全局业务路由保护和伪造 X-Rh-User-Id 拒绝测试。公司部署依然需要保护原始后端、启用 HTTPS 与全量验收；原 VibeX 网关预检仅供历史基线参考。
- **独立版公司审批模块**：新增 /manager，管理员查看公司运行汇总但默认不看员工私人执行内容；员工可明确授权指定管理员处理某个 Agent 待审批步骤，支持撤销、步骤指纹失效、单次审批与独立审计。此为本地验证能力，非正式生产权限方案。
- **团队知识库协作**：在 /knowledge-bases 由 Owner 对同事按邮箱授权 Viewer 或 Editor，服务端检索权限复用于 Agent/Workflow；撤权立即生效，成员不会借用 Owner 的 Embedding 查询余额。编辑成员上传资料可能触发 Owner 既有索引任务，授权时会提示成本。
- **同一 Agent 的受控多人编辑**：新增 /agent-collaboration，Owner 授权 Viewer/Editor，Editor 提交描述和任务计划提案，Owner 审核采纳；完整配置版本冲突防覆盖、撤权取消未审核提案与审计均通过隔离集成测试。模型/工具/知识库绑定和执行权不共享。
- **团队语义与版本恢复 V2**：所有者可独立授权共享语义查询；员工使用自己的兼容 Embedding 模型为查询生成向量，并复用所有者文档索引。多人 Agent 编辑支持逐字段差异、所有者查看安全文本版本与回滚、当前全配置版本匹配，保护模型/工具/知识库绑定。以上仅在隔离开发环境通过验证。
- **Owner 直接编辑版本记录**：普通 Agent 编辑器的配置修改也保存前后两个不含凭据的安全文本快照，并使旧协作草稿失效；Owner 改名不会重复保存规划快照。支持可选完整配置指纹校验，原 API 保持向后兼容。
- **V8 PostgreSQL 隔离验证基线（非正式后端）**：新增 PostgreSQL 17/pgvector 独立 Compose、19 张业务表草案、owner-only RLS、任务租约 SQL 和静态验收脚本。尚未启动 PostgreSQL 或替换原 PocketBase+SQLite。
- **V8 独立后端验证切片（尚未接管业务）**：services/pg-api 已实现 JWT 员工验证和 PostgreSQL 受限账号；Agent、Workflow 安全骨架及知识库元数据的独立 API，新增 TXT/Markdown/PDF/DOCX 小文件文字导入、片段关键词检索及内部 pgvector 相似度 Repository。PGlite 验证 RLS、任务租约、引用和员工隔离。尚未迁移 Agent/Workflow 执行、生产级文件存储/OCR/大文件索引、真实 Embedding 或正式切换 PostgreSQL 17。
- **V8 文档解析进程隔离**：PostgreSQL 试验后端在独立子进程解析 PDF/DOCX，限制超时、并发和 Node 堆内存，并验证异常文件和回收；已修复搜索/导入专用 URL 被 PATCH 误路由的问题。仍需生产级沙箱与服务器实际验收。
- **V8.1 PostgreSQL Agent Prepare Worker（非大模型执行）**：新增员工 Agent 准备运行 API、幂等入队、租约领取/拒绝旧令牌、暂停检查点、失败重试及最后崩溃回收，独立受限 Worker 登录和可选 Compose 服务。已通过 PGlite/JWT/RLS 测试，但**未调用真实 LLM/工具，亦未部署宝塔 PostgreSQL 17**。
- **模型与插件**：OpenAI 兼容 / Anthropic / Gemini 模型连接，外部 HTTP 工具、MCP 插件市场。
- **发布与集成**：配置版本、试运行、发布、API Token 与网页嵌入。

## 代码目录

```text
src/pages/               Agent/工作流/定时任务/知识库等前端页面
src/components/          页面及共用组件
src/lib/                 API / 模型 / 执行客户端
pocketbase/pb_hooks/     PocketBase 业务路由、数据库引导与执行引擎
pocketbase/pb_hooks/modules/  Goja 共享检索/Schema/模型连接与请求/追踪/计算工具
worker/                  独立后台 Worker（需单独部署/运行）
services/pg-api/         V8 独立 PostgreSQL API 试验服务（暂不接入旧前端）
db/postgres/             PostgreSQL 17/pgvector 表结构、权限与任务租约 SQL
deploy/postgres-staging/ 独立 Docker Compose 测试方案，不可直接作为正式部署
tests/                   业务权限回归与 PocketBase 集成测试
docs/                    安全与部署说明
vibex-local/             Windows / Linux / macOS 启动入口
```

## 本地独立启动

要求 Node.js、pnpm 和与当前工程一致的 PocketBase 0.40.5。准备全新的工作目录，**如存在已有数据先做经校验的备份，不得直接初始化覆盖**。

```sh
pnpm install --frozen-lockfile
pnpm standalone:init --dry-run
pnpm standalone:init
pnpm standalone:dev
```

自行打开 http://127.0.0.1:8000/login，首次使用服务器生成的初始化密钥创建管理员。账号及共享权限随后在“员工与权限”管理。Windows/Linux/macOS 的旧命名启动入口已改为独立启动委托，不再登录 VibeX。详见 [独立账号与部署指南](docs/STANDALONE_AUTH_AND_DEPLOYMENT.md)。


## 验证命令

```sh
pnpm install --frozen-lockfile
pnpm test                # 运行安全回归测试
pnpm build               # TypeScript 检查与生产打包
pnpm check               # 上述 test + build
pnpm test:e2e:parallel   # 本地双路并行全量 E2E，自动复用原测试清单并隔离临时目录
pnpm test:e2e            # 串行 E2E 基线，遇并发资源冲突时回退
pnpm test:standalone     # 独立员工身份与实际 Vite / PocketBase HTTP 代理
pnpm test:integration    # 真实 PocketBase 接口/隔离/加密验证
pnpm test:worker         # 真实 PocketBase + 后台 Agent/Workflow 全流程验证
pnpm test:model-provider # 真实 PocketBase + 3种模拟模型接口分别在 Agent/Workflow 中调用
pnpm test:tool-executor # 真实 PocketBase：Agent/Workflow 共享安全计算器执行
pnpm test:tool-debug    # 真实 PocketBase：ToolHub/ToolConnections 的账号隔离及 POST 单次确认
pnpm test:internal-overview # 真实 PocketBase：员工任务总览、待办与跨账号权限隔离
pnpm test:internal-templates # 历史兼容模式：Agent 分享快照、散列、只领取一次与权限隔离
pnpm test:no-browser    # 静态检查本地启动脚本禁止自动打开浏览器/管理后台
pnpm test:readiness     # 离线正式使用配置和审阅证据安全单测
pnpm test:gateway-boundary # 临时数据库验证原始 PocketBase 不能直接暴露给员工
pnpm test:postgres-staging # V8 PostgreSQL + pgvector 空库结构/授权/队列及 Compose 源码静态契约测试
pnpm test:postgres-api-mock # V8 新 HTTP API 的员工权限与冲突模拟测试
pnpm --dir services/pg-api install --ignore-workspace --frozen-lockfile --ignore-scripts # V8 独立依赖
pnpm --dir services/pg-api run check # V8 TypeScript 类型检查
pnpm --dir services/pg-api run test:engine # PGlite 实际执行结构/RLS/向量/租约
pnpm --dir services/pg-api run test:workflow # 签名JWT + 实际PGlite Workflow配置读写及账号隔离
pnpm --dir services/pg-api run test:knowledge # 签名JWT + 实际PGlite 知识库元数据读写及文件引用隔离
pnpm --dir services/pg-api run test:document-parser # PDF/DOCX 文字层提取、损坏格式、大小上限及压缩膨胀防护
pnpm --dir services/pg-api run test:document-worker # 独立子进程解析、超时/并发/资源回收
pnpm --dir services/pg-api run test:prepare # 员工 JWT 到 PostgreSQL Agent 准备任务租约及重试
pnpm --dir services/pg-api run test:worker-login # 独立 Worker 登录权限与未知外部写保护
pnpm --dir services/pg-api run test:worker-upgrade # Worker RLS 增量升级及幂等
pnpm --dir services/pg-api run test:role-full # PGlite 非管理员角色与访问隔离
pnpm test:concurrency    # 6路并发、数据库原子租约与崩溃重放保护
pnpm test:agent-effects  # Agent 外部 POST 调用结果确认与阻断
pnpm test:schedules      # 真实 PocketBase：定时工作流、定时 Agent、启停、去重与错误规则隔离
pnpm test:knowledge      # 真实 PocketBase：知识管理、文档索引、Agent/工作流检索及租户隔离
pnpm test:team-knowledge # 团队知识库 ACL、Agent/Workflow 调用和撤权
pnpm test:agent-collaboration # 多人 Agent 草稿、版本冲突、审批及撤权
pnpm test:migrations     # 存量 V6 数据升级、重启幂等与级联清理
pnpm test:e2e            # 串行执行十三组 Headless PocketBase 后端集成测试
pnpm worker              # 启动独立后台 Worker（需服务器配置）
node ops/sqlite-backup.mjs backup --source /path/to/data.db --output /secure/backup/data.db # 受控主机 SQLite 备份，不覆盖已有备份
node ops/trace-retention.mjs --db /safe-copy/data.db --owner example-user --days 90 # 仅预览候选；绝不自动删除
node ops/internal-readiness.mjs --json # 旧 VibeX 基线的离线预检；独立部署须按新指南审核
node ops/verify-gateway.mjs --origin https://approved-internal-gateway.example # 经批准后只读核验独立部署的 HTTPS 网关
pnpm lint                # 项目 ESLint；现有代码仍有待整改的告警/错误
```

集成测试要求本机有 PocketBase 可执行文件。Windows 默认路径：`vibex-local/bin/windows/pocketbase.exe`，其他平台请通过 `POCKETBASE_BIN` 环境变量指定。测试使用临时数据库，运行后尝试删除。

## 必须了解的安全设置

生产环境必须验证 PocketBase 员工 Token，并将原始 PocketBase 限制为仅内部可信网络可访问；不允许开启共享匿名身份。配置 32 字符的服务端 `AGENT_STUDIO_SECRET_KEY` 并启用 `AGENT_STUDIO_STRICT_SECRETS=true`，模型与工具密钥须按企业保密要求保存。新账号和旧 `rh_user_id` 的映射必须先进行人工授权核验，不得自动重用历史账号数据。内部共享授权已改为员工数据库的 `share_enabled`，不依赖 VibeX 旧白名单。后端内网部署、备份和 Worker 验收要求见 [独立部署指南](docs/STANDALONE_AUTH_AND_DEPLOYMENT.md)。

定时任务的配置、时区及部署见 [定时任务使用和验收指南](docs/SCHEDULED_TASKS.md)。
知识库的能力、导入约束和测试见 [知识库使用与验收指南](docs/KNOWLEDGE_BASES.md)。
V7 架构边界、迁移规则和 PostgreSQL 演进路线见 [V7 架构治理记录](docs/ARCHITECTURE_V7.md)。
[V7.1 增量架构治理与回归说明](docs/ARCHITECTURE_V7_1.md)
[V7.2 模型网关、任务监控与数据库备份验收说明](docs/ARCHITECTURE_V7_2.md)
[V7.3 模型连接、运行追踪与共享工具说明](docs/ARCHITECTURE_V7_3.md)
[V7.4 工具安全分类、追踪保留、禁止弹出管理页及回归说明](docs/ARCHITECTURE_V7_4.md)
[V7.5 跨租户工具权限及外部 POST 调试确认修复说明](docs/ARCHITECTURE_V7_5.md)
[V7.6 内部工作台、异常总览及员工数据范围说明](docs/ARCHITECTURE_V7_6_INTERNAL.md)
[V7.7 内部 Agent 模板共享、员工授权及实施说明](docs/ARCHITECTURE_V7_7_SHARING.md)
[公司内部正式启用 Go/No-Go 验收清单](docs/INTERNAL_GO_LIVE_CHECKLIST.md)
[V7.8 正式启用预检、可信身份网关及运维验收](docs/INTERNAL_DEPLOYMENT_PREFLIGHT.md)
[V8 宝塔 Ubuntu 24 PostgreSQL 隔离测试架构与迁移实施边界](docs/POSTGRES_V8_STAGING.md)
[V8 独立 PostgreSQL API 试验版、真实 SQL 引擎测试与未完成范围](docs/POSTGRES_V8_API_PILOT.md)
[V8 知识库元数据 PostgreSQL API 与权限回归](docs/POSTGRES_V8_KNOWLEDGE_METADATA.md)
[V8 PDF/DOCX 独立解析进程与安全验收](docs/POSTGRES_V8_DOCUMENT_ISOLATION.md)
[V8.1 PostgreSQL Agent 准备 Worker、租约和失败恢复说明](docs/POSTGRES_V8_1_AGENT_PREPARE.md)

## 已知局限

当前 Agent 默认由浏览器轮询推进；已新增可选的独立后台 Worker，需通过服务端环境变量启用并作为长期运行的进程部署，才能在关闭浏览器后继续执行。工作台的「调试监控」页面可查看 Worker 心跳。Tick 已增加 SQLite 原子租约和外部写操作审计，支持多 Worker 争抢同一任务时避免并发执行；但还未实现完整租约续期/严格 fencing，生产仍建议以一个 Worker 副本起步。已完成可选 Embedding + SQLite 向量及混合检索，但不是 pgvector/ANN 大规模索引，PDF 扫描件仍没有 OCR；抓取工具的 URL 检查仅提供部分 SSRF 防护，生产需配套网络出口控制。模型调用相关自动化集成测试目前使用本地模拟模型，而非真实付费 Provider。详细部署见 [后台 Worker 指南](docs/BACKGROUND_WORKER.md)。

历史工程导出信息保留在 `vibex-local/export-manifest.json`，仅作源头溯源。此独立分支**不要回传覆盖** VibeX 上的原 App；如需迁移到公司服务器，应按独立部署指南进行新环境、账户与数据的隔离验收。
