# Agent Studio V28｜复用已连接的 MiniMax / OpenAI / Claude / Gemini 模型

日期：2026-10-23  
分支：`feat/harness-design-workspace-20261021`  
上线状态：**开发分支已实现，未提交、推送或部署。真实付费 MiniMax 未自动运行。**

## 一、为什么用户已经连接但 V28 仍提示“未连接”

模型连接页已经将员工自己的 MiniMax 凭据保存在 `model_connections` 中，且可成功查询模型列表；截图显示连接正常、延迟 381ms、9 个模型。

旧 V28 工具 `ops/agent-v28-real-planning-benchmark.mjs` 是 Runner 进程的独立 CLI，只读取 `AGENT_STUDIO_V28_MODEL_API_KEY` 等环境变量，**不会自动读取网页的 PocketBase 模型连接**。因此它错误地把“Runner 没有独立配置凭据”解释成“工作台没有真实模型”。这是两个配置面的断裂，而不是用户没有连接成功。

## 二、改造方式

在现有「工具与连接 → 模型连接」页加入「V28 · 真实模型复杂 Agent 盲测」卡片：

- 从当前账号已启用、已保存模型列表的连接中选一个（例如 MiniMax）；不重复录入 API Key。
- 模型下拉框使用该连接实际保存的模型 ID，连接和模型必须精确绑定。
- 明确告知真实调用计费，需要用户主动勾选确认后，才能运行 2 个合成任务的 smoke。
- 完整 10×3 次调用额外要求第二个计费确认，逐一运行，不自动启动外部工具。
- 任何实际响应没有完整 Token 计量，停止后续调用；网络错误、未确认成功也停止，不默默重试以免重复计费。
- 页面显示机械结构化指标、任务编号、角色数、能力召回、耗时与报告的 Token 数；**不声称事实真实性或商业交付质量已经验证**。
- 网页侧不持有或读取明文密钥；通过现有服务端 `/api/llm/chat` 代理使用当前员工的模型连接。
- 仍只发送此前定义的 10 个合成任务，不访问用户私有知识库，不启动 Agent 工具、写操作或真实邮件。

Server 调用额外限定 `page=agent_v28_blind`：必须显式选取连接+模型、严格匹配当前连接列出的模型、限定两条文本 message、合法 request ID、256–9500 max_tokens；OpenAI 兼容接口严格**一次**模型请求，不进行 reasoning length 后的自动放大重试。返回服务商的非负整数输入/输出 Token 计量，不返回密钥。相同 request_id 使用员工归属的 job 记录去重；客户端永不自动再次发起同一收费请求。

## 三、验证范围

- `tests/model-provider.integration.mjs`：真正运行隔离 PocketBase，通过本地假的 OpenAI 兼容/Anthropic/Gemini 请求服务验证旧连接复用、owner 归属拒绝、无效请求不触发 provider、正确 model 和 max_tokens、返回用量计数、缓存请求不重复付费。
- `tests/design-workspace.chrome.mjs`：使用本地独立员工账户的模型连接测试 UI，未确认时按钮禁用；明确同意后最多发出一次本地 fixture 请求，因 fixture 没有 Token 计量，批次停止。**不向 MiniMax 实际计费**。
- `src/lib/agentV28Tasks.ts` 与 `tests/fixtures/agent-v28-unseen-tasks.mjs` 共享同一 10 题任务列表，避免 UI 与 CLI 对不同试题进行成绩比较。
- `pnpm check`：**PASS**，全量单元测试、TypeScript、Vite 生产构建和 **109 项生产资源隔离**均通过。
- `pnpm test:worktree:chrome`：**1/1 PASS，共 26 项完整用户旅程**，包括使用本人已保存的模型连接、必须先勾选计费确认、模型请求只发送至隔离 local fixture 1 次，缺失 Token 用量后立即停止；Console errors 0，HTTP 400 0。没有对 MiniMax 发生计费。
- `pnpm test:worktree:e2e`：**27/27 PASS，0 失败**，包含修改后的 `model-provider.integration.mjs`，实际隔离 PocketBase 模型代理验证 OpenAI 兼容（MiniMax 所用类型）/Anthropic/Gemini 三协议的 owner 隔离、恶意参数拒绝、Token 计量、重用 request_id 无额外调用；和全部旧 Agent/Workflow、知识库、本地 MCP 回归。

**重要**：从截图看 MiniMax 连接已经正常；这仅验证连接可达、可获取模型列表，不等于模型已经生成合格方案。以上 PASS 也只是隔离本地 mock provider 下的工程功能验收，并未衡量真实 MiniMax 对 10×3 陌生任务的成功率。

## 四、未完成事项

1. 修改只在独立开发分支，用户截图所在系统只有部署此变更后才会看到 V28 入口。
2. 目前没有在 ChatGPT/Runner 中访问用户登录浏览器的授权会话，因此没有对截图中的真实 MiniMax 发起真实模型付费请求；不能报告 MiniMax 的规划成功率。
3. 现有 HTTP 模型代理把规划回复缓存在当前员工的 `llm_jobs` 记录中，场景只使用合成数据；如果未来评测敏感文件，应设计专用的最小数据留存策略。
4. 完整 30 次评测要求浏览器标签页保持打开；当前结果仅在页面内存中，不是可断点恢复的后台任务。
5. 目前 Token 统计属于模型回报值，没有服务商价格表，不输出推测的美元费用。
6. 用户已有 MiniMax 凭据，不应再次要求复制 API Key 到聊天、共享日志或 Runner 环境变量；保留原 CLI 作为可选独立环境测试方法，不冒充它已经自动共享连接。
