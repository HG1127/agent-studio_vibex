# Agent Studio VibeX V7.3｜模型连接、执行追踪与共享工具

V7.3 在原有 V7.2 工程上迭代，不新建演示项目。继续保留 VibeX 身份、计费、应用 ID、React/TypeScript/Vite、PocketBase + SQLite、独立 Worker 和现有业务 API。自动测试使用本地 PocketBase 和模拟 Provider，不打开管理后台页面，不触碰线上数据。

## 1. 已完成：模型连接 Repository

新增 pocketbase/pb_hooks/modules/model_connections.js。Agent 和 Workflow 共用以下能力：
- 先做 owner 归属与 enabled 校验，再读取服务器持有的凭证；
- 原有前十个最近启用模型的默认选择规则不变；
- AES-GCM 新凭证和旧版只读解码格式均可兼容；
- OpenAI-compatible、Anthropic、Gemini Provider 和 API 基址统一规范化；
- 禁止把明文 API Key 发送给客户端或放进执行追踪。

模型 HTTP 发送、模型错误重试、平台计费和审批仍由现有执行引擎负责。这不是完整独立模型网关。

## 2. 已完成：模型执行追踪 Model Span

新增 pocketbase/pb_hooks/modules/execution_trace.js 以及 execution_traces.pb.js。迁移 execution_0003_trace_spans 创建 agent_studio_execution_spans 表和租户/运行时间索引（保留此前已有的七项数据库迁移）。

模型调用产生元数据记录：trace_id（当前等于 run_id）、run_kind、step_ref、operation、status、error_code、duration_ms、created_ms。代码不保存提示词、回答、API Key、请求 URL、Header 或 Tool 参数。写入追踪失败不会中断用户任务。

查询接口：
    GET /api/execution-traces?kind=agent&run_id=<RUN_ID>
    GET /api/execution-traces?kind=workflow&run_id=<RUN_ID>

服务端先验证 run 属于当前账号，再返回最多 100 条模型调用元数据；越权返回 404。前端新增 RunTraceCard，集成到 Agent 运行详情、Workflow 画布运行侧栏和定时任务结果弹窗中，可按步骤查看调用成功、失败、耗时和错误码。

追踪目前只覆盖模型调用，不是完整工具/审批/网络调用链。历史旧运行没有 Span 时显示无记录，不虚构历史数据。

## 3. 已完成：工具执行层第一块共享模块

新增 pocketbase/pb_hooks/modules/tool_calculator.js。Agent 与 Workflow 统一使用纯函数 evaluate 实现算术表达式。支持四则运算、取模、括号与一元正负号；拒绝非算术表达式及除数为零。没有使用 eval、Function 或网络请求。各执行引擎保留自身工具审计与失败文案。

## 4. 自动化验收

- pnpm test：模型连接所有权、密钥处理、计算器安全、trace 只记录允许字段、时区和既有安全检查。
- pnpm test:model-provider：真实 PocketBase + 本地模拟 OpenAI、Anthropic、Gemini 模型，在 Agent/Workflow 两条链路执行并验证 trace 数据隔离。
- pnpm test:tool-executor：真实 PocketBase 中 Agent 与 Workflow 的 calculator 工具执行。
- pnpm test:migrations：从存量 SQLite 升级并检查迁移幂等、历史数据保留和新 trace 表。
- pnpm test:e2e：全流程集成回归。
- pnpm build：TypeScript 与 Vite 生产构建。

不宣称线上登录网关、真实付费模型、生产 Worker 或其他外部系统已经验收。部分旧版 React Effect ESLint 规则问题仍待独立整改，构建通过不等于全仓 lint 清零。

## 5. 下一步边界

仍未实现：ModelConnection 的所有管理 API 全部服务化、统一的完整 ToolExecutor 与工具审批执行状态、工具级 trace 树、trace 数据过期和体量控制、p50/p95 持续统计、严格 Worker fencing/租约续期、向量/混合检索、PostgreSQL 实际迁移。

下一轮 V7.4 可围绕工具注册/授权/幂等审计、统一 correlation ID、trace 数据生命周期和性能测量落地。SQLite 先继续保留，迁移应基于真实规模和负载证据。

## 6. VibeX Source 回传

先备份当前 SQLite 数据与线上/预览版本源码。VibeX Source 选择 app/ 和 pb_hooks/，分别导入对应的累计 ZIP 并选择 Extract。ZIP 内不能额外套 app/ 或 pb_hooks/。新后端 modules/model_connections.js、modules/execution_trace.js、modules/tool_calculator.js 及 execution_traces.pb.js 必须完整写入后，才能认为源码导入成功。预览环境验证后，再单独执行正式发布。不要将完整源码包直接上传到 VibeX Source。
