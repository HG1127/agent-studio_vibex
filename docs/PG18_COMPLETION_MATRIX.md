# PostgreSQL 迁移前完成清单

更新：2026-10-27。现有 PocketBase 仍是当前运行环境，正式切换 **NO-GO**。
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

最新完整隔离基线为提交`0631935b931c60645a886351d3fa9e2a071ff0cb`：
[质量43/43](https://github.com/HG1127/agent-studio_vibex/actions/runs/40355825257)、`pnpm check`659项及类型/构建、95项生产资源隔离，
[真实PG18默认050及可选051](https://github.com/HG1127/agent-studio_vibex/actions/runs/40355825301)与[浏览器4/4](https://github.com/HG1127/agent-studio_vibex/actions/runs/40355825144)均通过，主浏览器15项。
默认049/050保留本人原子入队、完整交付、来源撤销与原请求恢复。可选051在4b2a676通过真实PG18来源/回执/删除验证，f9c86c3的本人HTTP/SDK通过51项记忆域；0631935的本人来源记忆页面通过55项域、真实PG18 HTTPS/SDK及浏览器15项；自动写回和派生提示仍未实现。自动经验/教训、负反馈和额外付费提炼仍须完成。

现有独立Agent长中文交付、人工澄清/方案审核与完成证据在`c0a448e`验收；Workflow最终输出20000字符及一次私有调用在`f2e3deb`验收，后续基线均保留相关回归。
规范PocketBase19项/两Worker在921decb再次19/19通过，76.5秒；之后0631935未修改该运行时或回归输入。
默认新库050映射为34个SQL源、36条来源版本加一条初始化回执、62张表、61张FORCE RLS和22个核心角色，完整SQL/实际PG18隔离验收通过；没有真实目标初始化。
源码审查包已按0631935/default050运行时重建：初始化85个源文件/13项离线计划，API/索引153个源文件，清单和默认拒绝执行通过。随后功能与说明继续更新时必须再次核对或重建，生成归档不上传。
上述结果证明精确提交的合成隔离验收，真实员工与目标环境尚未签收。完整候选和后续证据见[迁移草稿PR](https://github.com/HG1127/agent-studio_vibex/pull/26)。

## 尚须补齐或逐项核实的功能

| 范围 | PocketBase 参照 | 剩余工作 |
| --- | --- | --- |
| 委托审批与公司视图 | `src/pages/Manager/ManagerPage.tsx`、`pocketbase/pb_hooks/studio_company.pb.js`、`tests/studio-company.integration.mjs` | 本人明确委托及用途、经理仅看必要元数据、固定待审批操作指纹、一次性决定、撤销 / 来源变化校验、管理员公司汇总。现有本人运行审批不能代替经理委托。`InternalOverviewPage` 使用另一个总览接口，须另行核对。 |
| Agent人工澄清与方案审核 | `src/pages/AgentRun/useAgentRun.ts`、`pocketbase/pb_hooks/agent_engine.pb.js` 的 `ask_user` / `/respond` | [人工回复验收](PG18_AGENT_HUMAN_INPUT.md)。048新库、同一运行等待、1600字符回复、批准/修改、本人Cookie和原回执、角色默认/单次覆盖、定时防重叠、完成证据及分页记录已有c0a448e的17项域、真实PG18和主浏览器12/12隔离证据。模型final不能绕过所需本人方案批准，费用/工具授权仍独立；真实员工UAT待签收。 |
| Agent / Workflow最终交付完整性 | `pocketbase/pb_hooks/agent_engine.pb.js` 的 `finishRun`、`workflow_api.pb.js` 的结束节点 | 独立Agent完整成果已在c0a448e通过长中文SQL/mTLS、版本证据、实际PG18和浏览器检查，旧任务指纹保留。[已验收修复](PG18_WORKFLOW_FINAL_DELIVERY.md)为新任务加入绑定摘要的最终交付协议，结束结果截取至20000，节点4000和付费输入12000保持。完整输出提交f2e3deb已通过质量42/42、根检查623项、95项资源隔离、真实PG18和浏览器4/4（主场景12项）。新增SQL持久结果、旧协议恢复和仅一次私有模型调用均通过；员工UAT仍待签收。 |
| Agent跨运行记忆 | `src/components/agent-run/MemoryPanel.tsx`、`src/pages/AgentRun/useAgentRun.ts`、`pocketbase/pb_hooks/agent_engine.pb.js` | [本人指令及来源经验/教训](PG18_AGENT_MEMORY.md)已在0631935通过根659项、55项记忆域、真实PG18 HTTPS/SDK及浏览器4/4（主场景15项）。可选051支持本人预览、明确保存、来源失效屏蔽、二次忘记与原请求恢复，仍不进入默认050。自动成功/失败写回、负反馈教训、派生提示协议、独立提炼费用和定时/嵌套范围仍须完成。 |
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

来源记忆当前证据见[Agent记忆](PG18_AGENT_MEMORY.md)。0631935整轮合成隔离验收已通过，包含能力503后恢复原请求；051仍不进入默认050。自动写回、负反馈优化、有界派生提示及独立付费提炼仍待完成。实际员工、目标环境、备份恢复/回滚及长期Worker尚未签收，正式迁移继续NO-GO。

049/050/051及可选052的表/列ACL审查已明确拒绝非所有者WITH GRANT OPTION、额外关系权限和额外列授权；空列ACL直接按NULL读取，避免空数组异常。正常RLS和默认初始化SQL不变。权限转授及漂移拒绝已在21a4b4d的合成SQL和真实PG18验证。

可选052自动终态写回后端候选：不可修改的本人任务授权/停止/结果元数据，绑定任务、角色版本、指令/图摘要和Native治理版本；权限停用/重启用不恢复旧授权。记忆编号按原授权确定，复用已核对租约的同一本人事务，失败/停止/来源失效和未知效果不冒充经验；保存及审计故障回滚记忆而保留终态/原私有成果，不重发模型。`remember_outcome`须内部独立授权且具备人工证据，缺省为关闭；API/Worker开关及HTTP/SDK已接线并在21a4b4d通过隔离验收，页面尚未接线。新权限、原请求、存储故障及SQL/私有mTLS已在21a4b4d验收，052不进入默认050，无额外提炼或派生提示授权。

052后续入口候选增加严格的独立自动写回开关：Native API需配置写入、独立Agent执行和可删除来源记忆范围，Worker另行启用且仅允许独立Agent。启动检查052结构。本人状态和隐私停止/原请求确认使用Cookie/Origin/CSRF，不受新授权关闭影响；未接浏览器SDK/页面，HTTP及托管验收已在21a4b4d通过。默认fresh050不变，无新增付费调用。

052浏览器客户端候选补充严格元数据投影、默认缺省保持原请求、显式remember_outcome选项和冻结的原授权恢复；本人停止及只读确认使用同源Cookie，不接收身份、正文或费用授权字段。页面尚待接入，真实052 PG18及本候选托管验收已在21a4b4d完成。

## 可选052当前验收（21a4b4d）

21a4b4d已通过[质量43/43](https://github.com/HG1127/agent-studio_vibex/actions/runs/40371933055)：根`pnpm check`669项、类型/构建和95项生产资源隔离；记忆域71/71，含真实私有mTLS模型效果、成功/失败记忆、治理版本变化、停止、物理忘记及存储/最终审计失败保留原任务结果。首轮HTTP测试将正常的Agent汇总、模型效果、私有派发三条日志误计为一条，已纠正并补充停止/原请求恢复不新增作业或效果的检查。

[真实PostgreSQL18](https://github.com/HG1127/agent-studio_vibex/actions/runs/40371933194)已验证显式安装052、精确结构和授权漂移拒绝、Native HTTPS Cookie/SDK本人授权、私有模型终态写回、另一员工拒绝、停止、原请求恢复及物理忘记。两个合成任务仅各有一次原任务模型调用，没有额外提炼调用。[浏览器4/4及主场景15项](https://github.com/HG1127/agent-studio_vibex/actions/runs/40371933732)全部通过；这些浏览器场景覆盖既有功能和051页面，052新页面尚未接入，不能作为052页面验收。

Native API与独立Agent Worker各自默认关闭自动写回。API新增授权需配置写入、独立Agent执行和来源记忆删除范围，并通过052/人工证据结构检查；Worker须单独启用自动写回且具备人工协议。开关为`AGENT_STUDIO_PG_AGENT_OUTCOME_MEMORY_ENABLED=true`及`AGENT_STUDIO_PG_AGENT_OUTCOME_MEMORY_APPROVED=APPROVE_DISPOSABLE_PG18_OWNER_OUTCOME_MEMORY_ONLY`。开关配置不授予实际部署、初始化或调用付费提供商的权限。本人状态/停止/原回执确认使用Native Cookie/Origin/CSRF；关闭新授权仍允许停止和只读确认。停止不会自动删除先前已保存内容，结果回执记录历史保存，当前内容仍以来源记忆列表为准。

默认全新初始化仍是050，051/052均须另行审查，不进入默认序列。052员工页面、负反馈及优化关联、派生提示协议、定时/嵌套范围和独立付费提炼尚待完成。早期失败若缺少可复核私有终态，不虚构失败教训；额外模型调用不能继承原任务费用批准。

21a4b4d源码审查包已本地重建：初始化86源文件、13离线计划；API/索引157源文件。清单、默认拒绝启动、无凭据检查通过，归档不上传。PB运行时与原19项E2E输入未修改。实际员工UAT、目标网络/访问、备份恢复/回滚和长期Worker签收仍未完成，正式迁移继续NO-GO。

052员工页面候选增加缺省未选的本次自动保存选择、历史保存/失效状态、停止二次确认与原请求恢复；切换导航或能力503保留原停止请求并隐藏状态，退出销毁。复用既有051列表物理忘记。页面/浏览器候选尚待隔离CI，默认初始化仍050。
