# Agent Studio V28｜真实模型复杂 Agent 创建盲测

日期：2026-10-23  
分支：`feat/harness-design-workspace-20261021`  
状态：**盲测框架与安全约束已实现；真实外部模型评分未开始，NO-GO**。

## 1. 为什么不再重复固定 fixture 测试

V27 的 2/3/5/8 角色创建、五角色本地真实工具执行、人工审批、证据式发布和 27 项 E2E 全部完成隔离工程验证。但是 Agent Studio 在 Chrome 测试中的“规划模型”仍是一个确定性本地服务器，该结果不能证明真实大模型面对陌生任务会正确拆分角色或发现缺失工具。

V28 要解决的是**模型泛化质量评估**，不是重复验证 MCP 或 PocketBase。

## 2. 已实施内容

1. `src/lib/agentDesignProtocol.ts`：抽出创建页实际使用的设计提示词和解析器。当前允许需求驱动的 2–8 角色、3–12 步，明确角色工具权限初始必须为空、外部写入必须审批；面向六到八阶段的任务适当增加输出令牌预算。不在 benchmark 使用更宽松的“作弊提示词”。
2. `src/lib/agentDesignEvaluation.ts`：对实际模型响应统一计算 JSON 解析成功、角色依赖 DAG、角色数量、必需能力 `kind+access` 召回、无需求写入、模型是否擅自授予角色工具 ID、建议的工具 ID 是否在空目录中凭空编造，以及平台清理后是否仍遵守最小权限。
3. `tests/fixtures/agent-v28-unseen-tasks.mjs`：10 个合成复杂任务，覆盖合规、生产事故、公益账务、软件发布、合同分析、零售库存、品牌公开资料、隐私删除请求、漏洞处理与公开关系图谱。包含需要人工审批的写入任务，也包含禁止写入的纯只读任务。题目及预期标签**不放入发送给模型的提示词**，降低测试污染。
4. `ops/agent-v28-real-planning-benchmark.mjs`：支持 OpenAI-compatible、Gemini、Anthropic 的真实 HTTPS 模型请求。默认 `--check` 只检查环境，**绝不发起收费调用**；`--live --smoke` 为两题各一次，完整 `--live` 为十题各三次，最多 30 次请求、顺序执行、不运行任何外部工具。
5. `tests/agent-v28-real-blind.test.mjs`：验证同一产品解析器、无权限时 fail-closed、伪造工具/额外写入识别、标准分数及10题矩阵；纳入 `pnpm test`。
6. 原始模型回复**默认不保存到报告**，只保存 SHA256 哈希、经白名单过滤的计划元数据、机械分数、Token 计数及耗时。不会发送任何真实客户数据。

## 3. 当前真实环境状态

2026-10-23 在 WebCodex Runner 中检查：

- `OPENAI_API_KEY`、`GEMINI_API_KEY`、`ANTHROPIC_API_KEY` 和 V28 专属凭证均无有效环境配置；
- 当时没有正在运行的本地 PocketBase 服务，也没有可直接复用的已认证员工模型会话；
- `pnpm test:v28:check` 返回 `NO_CONNECTED_REAL_MODEL`、`liveCalls:0`。

因此**实际模型调用数为零，首次有效规划率/工具召回/重复稳定性/费用都为“尚未测量”，绝不能使用固定 fixture 的通过率冒充。**

**2026-10-23 补充（已开发，尚未部署）：**用户的 MiniMax 连接已在 Agent Studio 页面显示正常。V28 现新增「工具与连接 → 模型连接 → V28 真实模型复杂 Agent 盲测」UI，可从当前登录员工已保存的连接与模型列表选用 MiniMax，不需要再输入 API Key。UI 通过现有服务端代理使用员工凭证，明确勾选付费确认后才允许试测；原 CLI 环境变量检查只反映 Runner 自己的凭证配置，不能再解读为网页中无模型。参见 `AGENT_STUDIO_V28_EXISTING_MODEL_CONNECTION_BRIDGE_20261023.md`。

V28 CLI 当前通过独立授权的 HTTPS 模型连接运行，**不自动读取或解密员工保存在 PocketBase 中的其他账户模型密钥**。为了严守账号归属，不能为测试主动检索任意非当前员工的 Key。

## 4. 运行方法与安全门槛

检查（不会花费任何模型费用）：

```powershell
pnpm test:v28:check
```

当已在 **WebCodex Runner 本机环境**安全配置自己的模型连接后，设置：

```powershell
$env:AGENT_STUDIO_V28_PROVIDER = "openai"   # 或 gemini / anthropic
$env:AGENT_STUDIO_V28_MODEL = "<你已授权的模型 ID>"
# 通过本机受保护的凭证机制设置 AGENT_STUDIO_V28_MODEL_API_KEY；
# 不要把真实 Key 粘贴到聊天、Git、截图、测试日志或仓库。
$env:AGENT_STUDIO_V28_CONFIRM_LIVE = "YES"
pnpm test:v28:smoke    # 两个陌生任务 × 一次
pnpm test:v28:live     # 10 个陌生任务 × 三次
```

可以使用 `AGENT_STUDIO_V28_MAX_TOTAL_TOKENS` 调整**已报告 Token 的软停止限额**，默认 180000；模型提供商没返回可靠 Token 计量时默认主动停止，除非设置 `AGENT_STUDIO_V28_ALLOW_UNMETERED=YES`。这是停止后续请求的阈值，**不是美元计费硬上限**，单次回复仍可能超过剩余预算。脚本不估算没有价表依据的美元成本。

只有已启用真实模型、具备本人权限时才运行；`--check` 不会调用模型或修改凭证。测试不会执行邮件、CRM、部署或任何写操作。额外自定义 Base URL 必须为 HTTPS 且需要明确 opt-in。

测试日志保存在 Runner 操作系统的临时目录 `agentstudio-v28-blind-*/results.json`，不写入 Git 工作区；不会向用户或 OpenAI 回传 API Key。

## 5. 报告中的分数定义

| 指标 | 口径 |
|---|---|
| JSON 解析成功率 | 使用产品真实解析器能否得到结构化 JSON |
| 角色依赖有效率 | 角色字段完整，依赖存在、无环，按正确顺序排序 |
| 角色数量合理率 | 与预先冻结的任务角色范围匹配 |
| 必需工具种类召回 | 按预期的 `kind + access` 条目计算召回 |
| 写入权限遵守率 | 禁止写时不建议写，必须写时声明审批 |
| 越权模型提案 | 模型 `roles[].tools` 是否在创建阶段擅自带入权限 |
| 虚构工具建议数 | 空工具目录下编造 `suggested_tool_ids` 的次数 |
| 权限清理后安全性 | 实际产品的授权准备逻辑是否清除擅自赋权 |
| Token / 耗时 | 仅使用真实请求返回的计量信息，缺失则标记不可得 |
| 业务质量与真实性 | **必须人工盲审，默认 pending，不能通过 JSON 分数推断** |

机械分数高不等于完成商业验证；还需人工盲评角色是否冗余、依赖是否有业务逻辑、证据是否可核验以及模型输出是否能实际执行。进行真实模型测试后，应当将 30 次独立重复的统计与三位评审的分歧分开呈现。

## 6. 当前验收及下一步

- 盲测任务、产品同源提示词与解析器、安全预检专项：**已通过**。其中缺少凭证的 `--live` 模式会 fail-closed，不发送网络请求；生成的模型规划不会得到角色工具授权。
- `pnpm test:v28:check`：**NO_CONNECTED_REAL_MODEL / 0 paid calls**。即使仅配置了环境变量，检查程序也只称“凭证配置未验证”，不会把它误写成真实连接成功。
- `pnpm check`：**PASS**，全量单元、TypeScript、Vite 生产构建及 106 项资源隔离检查通过。
- `pnpm test:worktree:chrome`：**1/1 PASS，25 组真实工作台旅程通过**，包含 2/3/5/8 角色方案创建及五角色本地工具实际执行；浏览器控制台错误 0、HTTP 400 响应 0。
- `pnpm test:worktree:e2e`：**27/27 PASS、0 项失败**，实际 PocketBase/SQLite 隔离执行、Worker 恢复与多角色审计通过。
- 真实模型 10×3 得分：**尚未开始，不得填写得分**；Token 消耗及美元费用均未产生真实测量值。

**关键差别**：Chrome 与 27 项 E2E 使用的是确定性本地模型 fixture；上述 PASS 仅表示改动不破坏已有复杂 Agent 的工程链路，不能算作 V28 的真实大模型盲测成绩。

上线结论：**开发工程链路已验证，真实模型泛化仍未测试。生产 NO-GO。**
