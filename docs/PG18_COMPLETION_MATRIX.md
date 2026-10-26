# PostgreSQL 迁移前完成清单

更新：2026-10-26。现有 PocketBase 仍是当前运行环境，正式切换 **NO-GO**。
旧数据已由使用者确认为测试数据，可以采用全新初始化；这不免除功能对照、
员工验收、备份恢复、运行环境及回滚签收。

本表按员工操作和后台执行语义记录进度。PocketBase 路由数量、SQL 表数量、
历史导入脚本或通过的 CI 项目数量均不能换算成迁移完成百分比。
本表仍须随着逐项源代码核查继续补全，不是“其余项目均已验收”的声明。

## 已有实现与隔离证据

| 范围 | 已有原生实现 | 证据与实际限制 |
| --- | --- | --- |
| 独立员工身份 | 本地员工登录、Cookie / CSRF、服务端验证员工与所有者、员工开通与目录、独立服务身份 | `services/pg-api/src/native-auth-http.mjs`；真实 PG18 / HTTPS 隔离链路。员工角色、停用、内部模板分享资格和自助改密已有原生治理与隔离验收；实际员工目录、网络和目标服务器尚未签收。 |
| 员工账号治理 | 创建管理员 / 员工、修改角色 / 启用状态 / 内部模板分享资格、本人改密、原请求回执与私有审计 | [账号治理](PG18_NATIVE_EMPLOYEE_GOVERNANCE.md)。047已纳入新库初始化及启动权限 / 回执检查；旧员工创建兼容接口也写同一审计。角色 / 启用状态变化撤销目标旧会话，改密撤销全部本人会话；重新启用不恢复旧会话。模板分享资格不影响私人知识或本人任务，完整模板路径仍见下方待办。 |
| 模型、工具、MCP | 本人连接、探测、配置版本、受限私有 Broker、双向 TLS、MCP 发现与执行、Smithery 管理 | [MCP 执行](PG18_MCP_EXECUTION.md)、[HTTP 工具](PG18_AGENT_HTTP_TOOLS.md)。写操作逐项审批；未知付费结果禁止自动重发。 |
| 团队知识与语义检索 | 所有者 / 编辑者 / 读者权限、文档与索引、独立费用授权、关键词及语义 / 混合查询、Agent / Workflow 原始证据关联 | [知识运行时](PG18_SHARED_KNOWLEDGE_RUNTIME.md)、[语义界面](PG18_KNOWLEDGE_SEMANTIC_UI.md)、[知识工具](PG18_APPROVED_SEMANTIC_TOOLS.md)。撤销、内容变化、读者原始证据与费用回执的检查仍生效。 |
| Workflow | 原生画布、节点与循环、版本验证、持久运行 / 逐步审批、节点测试、节点输出、明确选择的历史样本复用 | [画布](PG18_WORKFLOW_NATIVE_CANVAS.md)、[节点测试](PG18_WORKFLOW_AUTHORING_AND_NODE_DEBUG.md)、[样本来源](PG18_WORKFLOW_SAMPLE_LINEAGE.md)。正式流程 UAT 和长期运行仍待执行。 |
| Agent | 本人角色、模型及工具绑定、多轮运行、运行明细、审批、取消、重启与未知结果隔离 | [自主 Agent](PG18_AUTONOMOUS_AGENT_RUNTIME.md)。1–30 轮和完整 2000 字符任务已通过精确提交的本地、真实 PG18 与浏览器隔离验收。人工澄清 / 方案审核和跨运行记忆的活跃操作仍见下方差距。 |
| 定时任务 | 独立授权、Agent / Workflow 后台运行、独立模型选择、时区重复规则、触发去重、原子入队、失败启动重试、暂停与来源撤销、费用及效果边界 | [定时任务](PG18_NATIVE_SCHEDULE_RUNTIME.md)。默认关闭。旧导入计划仍隔离；独立模型选择、并发保护、历史终态同步与未来生效界面均已通过精确提交的隔离验收。所选连接改版或停用后旧授权失效；未使用的默认连接变化不影响独立选择。 |
| Agent 描述协作 | 所有者授予 / 撤销、读者 / 编辑者安全投影、提案审核、直接编辑历史及安全描述恢复 | [原生协作](PG18_NATIVE_AGENT_COLLABORATION.md)。共享不授予执行权限；完整角色指纹、授权版本、停用员工、回执恢复和事务故障检查已通过真实 PG18 与浏览器验收。恢复保留当前私有绑定并使旧提案失效；不替代完整配置版本与发布。五项描述容量及任务计划传入模型已对齐，工具与各执行路径总预算保持独立。 |
| 完整版本与发布 | 所有者完整快照、单调版本号、发布 / 归档、草稿删除、资源重校验后的完整恢复、专用验收及员工页面 | [完整版本](PG18_NATIVE_AGENT_RELEASES.md)。046已纳入全新初始化及默认关闭时的权限检查。实际 PG18 验证完整中文角色的快照、恢复、专用验收与发布；浏览器验证原请求恢复、模型 B 审批、删除预览清理和退出 / 员工切换隔离。历史测试事实与当前有效性分开；旧知识来源不能生成新的通过证明。 |
| 新库准备 | 真实 SQL 顺序、源文件指纹、初始化回执、六类独立服务登录准备、分阶段只读检查和审查包 | [新库初始化](PG18_FRESH_RUNTIME_INITIALIZATION.md)、[迁移后检查](PG18_RUNTIME_PREPARATION_POSTCHECK.md)。没有在真实目标执行初始化、启用登录或启动服务。 |

已确认的隔离基线为提交 `040cd251bc211696cd24c0e5a7303ba9a7924c3b`：
[质量检查](https://github.com/HG1127/agent-studio_vibex/actions/runs/40265942088)、
[真实 PG18](https://github.com/HG1127/agent-studio_vibex/actions/runs/40265942087)、
[员工浏览器](https://github.com/HG1127/agent-studio_vibex/actions/runs/40265942086)均通过。
该提交的质量 CI 为41/41，`pnpm check`通过604项测试、类型 / 构建及95项生产资源隔离检查。
完整浏览器10/10通过（1.6分钟），账号治理独立场景12.2秒通过，协作与完整版本独立场景也通过。
实际 PG18验证账号创建 / 角色撤销 / 停用与重新启用、原请求回执、旧会话不复活及本人改密后重新登录。
最终账号页面截图已核对，敏感输入为空。后端 / 前端类型及48项 SDK / Cookie / CSRF检查本地通过。
PocketBase隔离回归在`ea6723a`通过19/19（两 Worker，79.5秒），之后的候选改动未涉及该运行时或回归输入。
全新初始化现为31个 SQL源、33条来源版本及一条初始化回执，58张表、57张 FORCE RLS、22个核心角色。
040cd25对应的初始化源码审查包包含79个源文件并验证13个离线计划，API / 索引包包含134个源文件；均验证清单、默认拒绝启动及无凭据。后续运行时代码已更新，最终048整合后须重建交付审查包。
这只证明该精确提交的合成隔离验收，不代表真实员工或生产环境通过。
后续候选和最新验证结果集中在[迁移草稿 PR](https://github.com/HG1127/agent-studio_vibex/pull/26)。

人工回复接口与界面基线`d34ed3b`已通过[质量42/42](https://github.com/HG1127/agent-studio_vibex/actions/runs/40283578338)、`pnpm check`616项测试、类型/构建与95项资源检查，以及[真实PG18](https://github.com/HG1127/agent-studio_vibex/actions/runs/40283578339)和[既有浏览器4/4](https://github.com/HG1127/agent-studio_vibex/actions/runs/40283578157)。本地规范PocketBase19项/两Worker在相同运行时输入通过，用时95秒。
完成证据候选`d1c293c`已通过13项人工回复Cookie/SQL/私有mTLS域和[质量42/42](https://github.com/HG1127/agent-studio_vibex/actions/runs/40287283086)、真实PG18及既有浏览器4/4回归；角色默认设置、定时等待防重叠修正仍在验证。048尚未进入默认新库，真实PG18人工回复与浏览器实际操作均未完成验收。

## 尚须补齐或逐项核实的功能

| 范围 | PocketBase 参照 | 剩余工作 |
| --- | --- | --- |
| 委托审批与公司视图 | `src/pages/Manager/ManagerPage.tsx`、`pocketbase/pb_hooks/studio_company.pb.js`、`tests/studio-company.integration.mjs` | 本人明确委托及用途、经理仅看必要元数据、固定待审批操作指纹、一次性决定、撤销 / 来源变化校验、管理员公司汇总。现有本人运行审批不能代替经理委托。`InternalOverviewPage` 使用另一个总览接口，须另行核对。 |
| Agent人工澄清与方案审核 | `src/pages/AgentRun/useAgentRun.ts`、`pocketbase/pb_hooks/agent_engine.pb.js` 的 `ask_user` / `/respond` | [人工回复开发记录](PG18_AGENT_HUMAN_INPUT.md)。已有同一运行等待、1600字符回复、批准/修改、持久续跑、本人Cookie与原回执、界面及完成证据核对。13项SQL/mTLS域通过；还须验证定时等待防重叠、角色默认设置、真实PG18与浏览器交互，整合048新库及最终包。模型final不能绕过所需本人方案批准，费用/工具授权仍独立。 |
| Agent最终交付完整性 | `pocketbase/pb_hooks/agent_engine.pb.js` 的 `finishRun`、原生Agent状态机及Workflow输出 | 已确认旧执行器保留脱敏后的完整成果，当前原生VM最终输出截取4000字符。须在保留旧任务固定指纹、预算与原始证据检查的前提下补齐完整交付及界面/版本验收；不能把草案完整显示视为最终交付等价。 |
| Agent跨运行记忆 | `src/components/agent-run/MemoryPanel.tsx`、`src/pages/AgentRun/useAgentRun.ts`、`pocketbase/pb_hooks/agent_engine.pb.js` | 实际运行页可查看 / 删除本人角色记忆，旧执行器还会注入并在成功后写回。须补齐原生所有者路径、原始来源 / 撤销检查和明确的提炼费用授权；已有知识库或历史导入不能代替运行能力。 |
| 模板发布与复用 | `pocketbase/pb_hooks/template_market_api.pb.js`、`pocketbase/pb_hooks/internal_templates.pb.js`、`pocketbase/pb_hooks/agent_templates.pb.js` | 逐项核对发布、模板市场、使用、交接及权限。已有画布样本 / 导入导出和基础模板表不能直接作为这些操作的等价证明。 |
| 反馈驱动的优化关联 | `pocketbase/pb_hooks/agent_optimization_lineage.pb.js`、`pocketbase/pb_hooks/agent_specs.pb.js` | 核对反馈、优化与目标角色之间的受保护关联，补齐原生活跃操作、权限和审计。 |
| 集成与嵌入调用 | `src/pages/Integrate/useIntegrate.ts`、`pocketbase/pb_hooks/integrate_api.pb.js` | 当前菜单可达，须核对已发布角色、调用钥匙一次展示 / 重发 / 吊销、嵌入配置、调用记录与统计、试调用及公开运行 / 轮询。原生历史表不等于运行能力；新路径继续使用经验证的身份及明确调用授权。 |
| 工具监控与插件市场 | `src/pages/ToolHub/useToolHub.ts`、`pocketbase/pb_hooks/tool_hub_api.pb.js`、`src/pages/PluginMarket/usePluginMarket.ts` | 核对本人运行 / 工具监控、注册表搜索、描述 / 本地化、连接管理与调用记录。已有 MCP / Smithery 执行链路须与这些实际菜单操作逐项对应。 |
| 本机设备操作 | `src/components/agent-run/LocalDeviceSelector.tsx`、`src/pages/AgentRun/useAgentRun.ts`、`tests/local-computer.integration.mjs` | 主工作区有设备选择与本机工具调用入口，须核对配对、所有者、审批、任务结果与撤销等操作的可达性及原生等价路径，不能因候选旧回归清单未列出而忽略。 |
| 完整菜单及运行能力 | 当前员工页面、PocketBase Hook 与 Worker | 持续核对每个实际可达操作；重复页面 / 旧路径只有取得可达性证据后才能标为历史实现，不可默认为可删除。 |

当前 `src/App.tsx` 实际挂载的是 `AgentCollaboration/AgentCollaborationPage.tsx`，
其中所有者版本组件为 `components/agents/AgentVersionHistory.tsx`；另一个
`AgentCollab/AgentCollabPage.tsx` 未在该入口挂载。独立的集合直写 API 已拒绝的路径
也不能算作仍须开放的业务能力。迁移应对照实际页面和授权业务接口，不能机械搬运所有旧路径。

## 正式迁移前的目标验收

1. 完成上述功能对照与对应 API、界面、Worker、权限和恢复测试；每个后续候选重新核对精确提交。
2. 生成最终源文件指纹、初始化映射、配置样例、审查包和分阶段执行记录。
3. 取得具体目标操作授权后，验证目标 PostgreSQL、HTTPS、网络、HBA、六类独立服务登录、文件权限及访问控制。
4. 由实际员工完成角色、知识权限、任务、审批、费用确认与停止 / 撤销 UAT。
5. 完成长时间 Worker 运行、重启 / 断线 / 租约与未知结果检查，演练备份恢复、回滚并签收。
6. 逐项 GO / NO-GO 审核后才决定是否正式切换；草稿 PR、部署模板及本清单本身不授予部署许可。
