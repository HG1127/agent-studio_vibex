# Agent Studio VibeX V7.6 — 公司内部任务总览

定位：公司内部员工使用的 Agent 开发和执行工作台，不是面向公开市场的多租户 SaaS。本轮保留 VibeX 原平台身份、计费和集成兼容代码，但不以套餐、公开市场、客户获客、复杂多租户为新功能方向。

## 一、本轮已实现

### 内部任务总览（业务侧）

新页面：/internal-overview，侧边栏增加“内部总览”，运行分区页签也可进入。Agent 设计、Workflow 画布、定时任务、知识库、运行详情等旧入口保持不变。

新增服务端路由：GET /api/internal/overview，由 pocketbase/pb_hooks/internal_overview.pb.js 提供，按当前登录账号身份汇总：
- 正在运行的 Agent / Workflow；
- 等待审批的运行；
- 最近 7 天失败的运行；
- 已暂停的运行；
- 已启用与超期 60 秒以上的计划；
- 自己的知识库数量；
- 需要人工核验的外部写入（结果未知或过长时间停留在 started）；
- Worker 配置与心跳状态。

返回 counters（精确归属计数）、action_items（最多 32 条，优先级：待审批 → 外部写核验 → 计划超期 → 近期失败）、recent_runs（最近 Agent/Workflow 样本共最多 16 条）、worker 和 sampling（展示上限信息）。

页面提供状态卡片、待办筛选、最近运行、快捷操作及手动刷新。点击记录前往原有运行详情或相关管理页。不会在概览中自动批准、取消、重新执行、发起外部写入。对于尚未有独立深链历史记录的 Workflow，链接到工作流画布，员工可在那里检查任务。

### 内部运维统计隔离修复

在 pocketbase/pb_hooks/tool_hub_api.pb.js 中修正已有 /api/harness/monitor 的 safeRows 过滤条件：此前使用不带账号条件的 id != ''；现强制 rh_user_id = {:uid}，防止 Harness 聚合把不同员工数据混在一起。这是后台隐私和审计正确性修复，不改变原接口字段结构。

## 二、明确的当前权限边界

当前是“当前员工账号的任务总览”，不是“全公司跨员工统一监控”。任何未授权查询参数 rh_user_id 都不能改变服务器通过受信任网关解析出的当前用户身份。

前端/后端概览不输出任务指令原文、模型完整回答、工具调用参数、HTTP 连接密钥等敏感内容，只提供任务标题、状态、时间和导航入口。复用原 API 与 PocketBase + SQLite，不新建复杂用户/组织数据库。

关键安全依赖：VibeX 身份网关必须真实验证身份并注入 X-Rh-User-Id，禁止员工直接绕过网关访问可伪造此 Header 的原始 PocketBase 服务。

如需团队共享 Agent、知识库、审批转交、跨员工领导视图，必须先明确：员工组织关系、管理员/负责人角色、团队可见范围、允许分享哪些文档、审批者授权范围。本轮未擅自开放所有人的私人数据。

## 三、验证与运行

新增 tests/internal-overview.integration.mjs，通过 tests/helpers/headless-pocketbase.mjs 在临时 SQLite 中启动 PocketBase，完全不会打开浏览器或首次管理员安装页面。

回归覆盖：
- 未登录返回 401；
- 新员工无记录时正常展示空状态；
- A/B 账号同时创建任务后，A 不能通过请求参数查询 B 的数据；
- 等待审批、近期失败、超期计划、外部写核验与知识库计数；
- 待办只包含当前员工的数据；
- 不返回任务指令、工具入参及测试秘密；
- Harness 监控也只能聚合当前员工的 Agent/Workflow 运行。

运行命令：pnpm test:internal-overview、pnpm test:e2e、pnpm test、pnpm build。

## 四、内部产品下一阶段优先级

1. 公司知识资产复用：团队知识库和 Agent 模板共享，先建立权限与分享审计，避免错误公开内部资料。
2. 任务交接与复核：负责人指派、审批人及替补、可见范围、处理时限及操作追溯。
3. 日常运维与稳定性：异常清单、备份恢复演练、运行监控与错误诊断，减少非技术员工的手动工作。
4. 使用体验：中文操作引导、模板引导创建、失败解决建议、内网部署说明。

不优先投入商业化价格体系、对外获客流程、复杂公共应用市场和无业务需求的微服务/数据库替换。当前 PocketBase + SQLite 可继续使用，是否迁移 PostgreSQL 由真实并发/查询成本决定。

## 五、源码回传（不等于线上发布）

VibeX Source 选择 app/：上传应用 ZIP 并选择 Extract，包内应直接是 src/... 和必要 package.json。
VibeX Source 选择 pb_hooks/：上传后端 ZIP 并选择 Extract，包内应直接是 internal_overview.pb.js、tool_hub_api.pb.js 等根相对路径。

本轮不访问浏览器或 PocketBase 管理后台，不操作生产库和外部模型，不直接发布公开版本。上线前需实际验证员工登录、数据范围、菜单入口和 Worker 状态。
