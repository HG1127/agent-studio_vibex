# Agent Studio V28｜复杂 Agent 能力负责人核验与盲测诊断修复（2026-10-23）

## 范围与生产边界

分支 `feat/harness-design-workspace-20261021`，临时隔离测试，未提交、推送、部署，未切换 PostgreSQL。本次仅处理复杂 Agent 规划盲测评分误判与诊断可读性，不改变真实工具授权。

## 已复现的错误

原来 `evaluateBlindAgentPlan` 检查必需能力 kind+access，却不检查 `capability_requirements[].role_ids`。实测三角色方案将 PDF 分配给不存在的角色，知识库能力无负责人，仍返回 mechanicallyPassed=true、requiredRecall=1 和空诊断。

## 本轮修改

1. `src/lib/agentDesignEvaluation.ts`：每个必需能力必须有至少一个存在的负责人，且不能引用未知角色；缺失时产生 invalid_capability_role_owner 诊断，标记 requiredRoleOwnershipValid=false，禁止机械通过。
2. `src/lib/agentBlindDiagnostics.ts`：对缺失能力、角色分工、越权写入、审批缺失和虚构工具等结构错误提供中文说明；未知错误代码不原样回显模型内容。
3. `src/components/model-connections/ModelBlindBenchmarkPanel.tsx`：每项显示角色分工状态，展示最多三条清晰诊断；不改变计费确认、模型权限和 Token 限额。
4. `tests/agent-v28-real-blind.test.mjs`：增加无负责人、错误角色 ID、中文诊断和未知错误回退的回归断言。

## 验证证据

- `node --test tests/agent-v28-real-blind.test.mjs`：5/5 PASS。
- `pnpm check`：单元、TypeScript、Vite 构建和 109 份资源隔离检查全部 PASS，退出码 0。
- 本地 `http://127.0.0.1:8180/model-connections` 已经在真实 Chrome + 临时员工登录中操作“先试测 2 个任务”。请求命中测试 PocketBase 代理，HTTP 200；本地 fixture 故意不报告 Token 用量，界面只发起一轮请求就停止；浏览器控制台 0 错误，网络 0 项 4xx/5xx。
- 该隔离预览只用不计费本地 fixture 和临时数据库，不等于真实 MiniMax 的规划准确率。

- `pnpm test:worktree:e2e`：隔离 PocketBase/SQLite + Worker 实测 **27/27 PASS，0 失败**，包含模型代理、角色交接、工具调用与员工数据隔离。

- `pnpm test:worktree:chrome`：真实 Chrome + 临时员工登录的设计工作台验收 **1/1 PASS**，覆盖复杂五角色创建→明确工具映射→4 次审批→本地浏览器/PDF/Excel 执行→证据门槛，以及 V28 已连接模型选择、付费确认、无用量自动停止。Console errors 0、HTTP 400 响应 0。模型仍为 fixture（非真实 MiniMax）。

## 未完成的关键验收

需要在用户已认证的工作台，使用该员工自己连接的 MiniMax（或其他授权模型），明确确认付费后运行 2 题真实 smoke，再决定 10×3 完整盲测和人工盲审。Runner CLI 未单独配置 Key 不能推断网页 MiniMax 未连接。不能读取其他员工密钥或用本地 fixture 充当真实模型成绩。

生产继续 NO-GO。本次修改仅保存在开发工作区，没有提交、推送、合并或部署。
