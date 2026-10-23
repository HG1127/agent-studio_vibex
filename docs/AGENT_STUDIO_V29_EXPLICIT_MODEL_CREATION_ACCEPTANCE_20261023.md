# Agent Studio V29｜复杂 Agent 创建的真实模型绑定与验收记录

日期：2026-10-23
分支：`feat/harness-design-workspace-20261021`
结论：开发分支已改造、未提交推送部署，真实 MiniMax 生成质量仍未实测，生产 NO-GO。

## 要解决的问题

原创建页预设了 `gemini-3.1-flash-lite-preview`，但后端 `/api/llm/chat` 允许在指定模型不存在时改用账号默认连接的首个模型。因此在存在 MiniMax 与隔离 fixture 等多个连接时，无法仅凭页面显示‘已连接’证明谁真正生成了复杂 Agent。

## 实施内容

1. `src/lib/agentDesignModelSelection.ts`：从当前员工已启用的 `model_connections` 生成可选择的 `(connection_id, model_id)` 列表；多个模型时要求明确选择；无权/被禁用/已删除模型不进入计划；不读取 API Key。
2. `src/components/home/AgentDesignModelPicker.tsx`：在 Agent 创建工作区显示模型选择、连接刷新、失效提示；快速创建和五步向导均复用。
3. `src/pages/Home/useHome.ts`：创建和修订使用用户选定的模型及连接，设置 `strict_model:true`；若服务器声称使用了不同模型则拒绝采用方案；最近一次模型用于本地页面展示，不冒充可独立审计的永久谱系。
4. `src/lib/llm.ts`：在请求中携带连接及严格绑定；失效模型 4xx 立即失败而不是十分钟轮询；严格绑定不进入历史模型路由，也不会因为旧路由缓存使用其他连接。
5. `tests/agent-v28-real-blind.test.mjs`、`tests/connection-refresh.test.mjs`：覆盖多模型明确选择、旧模型撤权、严格路由、防止收费请求重试、工作台切换状态隔离。
6. `tests/model-provider.integration.mjs`：隔离 PocketBase 实测三个协议的当前账号模型绑定，并验证无权账号无法访问、无效模型在调用提供商前拒绝。
7. `tests/design-workspace.chrome.mjs`：加入浏览器捕获的 `page=home` 请求审查，要求同时匹配 `connection_id`、模型 ID 与 `strict_model:true`。

## 当前可核验结果

- Agent 创建／状态隔离／模型绑定专项回归 31/31 PASS。
- `node tests/model-provider.integration.mjs`：三协议真实 PocketBase + 本地假提供商通过。无真实第三方计费。
- `pnpm check`：全部单元测试、TypeScript、Vite build、109 项产物隔离检查通过。
- 27 个隔离 PocketBase/SQLite Worker E2E：27/27 PASS。该结果在本轮严格路由前端最后一次改动之前获取；后端无新增写入能力。
- 最终 `pnpm test:worktree:chrome`：**1/1 PASS、0失败**；真实 Chrome 页面 + 独立临时员工登录 + PocketBase/SQLite，包含两个同时启用的模型连接，未选择模型时禁止生成且对模型发出 **0 次请求**，明确选择后 `/api/llm/chat` 使用准确的 `connection_id`、模型 ID 和 `strict_model:true`。随后完成五角色方案、明确工具连接、审批及本地 MCP 工具调用的完整流程，Console errors 0、HTTP 400 响应 0。模型为本地 fixture，非 MiniMax。
- 此次验证包含 2/3/5/8 角色变体、多阶段运行证据与交付前门槛，证明工程路径具备可执行性，不等同于真实模型的未知任务泛化。

## 不可误报的剩余限制

- 无法从 WebCodex 隔离浏览器自动继承用户日常 Chrome 对内网 Agent Studio 的员工登录态；用户已保存的 MiniMax 连接可见，不等于这一轮已授权发起付费模型调用。
- 真实 MiniMax 付费规划、本轮新生成方案的服务器记录 ID、真实商业任务来源真实性以及真实外部工具权限均未取得；不得将本地 deterministic fixture 的五角色 PASS 换算成这些业务能力的真实成功率。
- 页面最后使用模型的显示信息不等于服务端可信生成谱系；生产验收需关联用户会话、请求 ID、服务端 `llm_jobs`、保存的 Agent ID、运行快照与人工验收记录。
- 不提交 API Key、员工密码、PocketBase pb_data 或第三方业务数据；不得因试验而向外部发送邮件或部署生产。

## 下一次可执行验收

在用户内网已登录工作台上，先验证 V29 的模型选择器（必须实际部署经审批版本才能看到）；从当前员工 MiniMax 的具体模型生成一个全新 5 角色合成任务，人工审查工具连接/最小授权并保存；在受控测试工具上试跑，检查角色交接与审批事件，再运行 V28 已有两题 smoke 和 10×3 盲测，真实费用应由用户明确确认。若内网仍运行旧版本，不能宣称这套新 UI 已可直接使用。
