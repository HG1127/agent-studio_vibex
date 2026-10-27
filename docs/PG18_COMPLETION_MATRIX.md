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
| Agent | 本人角色、模型及工具绑定、多轮运行、运行明细、审批、取消、重启与未知结果隔离 | [自主 Agent](PG18_AUTONOMOUS_AGENT_RUNTIME.md)。1–30 轮和完整 2000 字符任务已通过精确提交的本地、真实 PG18 与浏览器隔离验收。048人工澄清/方案审核及049–055记忆/反馈/角色接受已有隔离验收，实际员工和目标环境仍待签收。 |
| 定时任务 | 独立授权、Agent / Workflow 后台运行、独立模型选择、时区重复规则、触发去重、原子入队、失败启动重试、暂停与来源撤销、费用及效果边界 | [定时任务](PG18_NATIVE_SCHEDULE_RUNTIME.md)。默认关闭。旧导入计划仍隔离；独立模型选择、并发保护、历史终态同步与未来生效界面均已通过精确提交的隔离验收。所选连接改版或停用后旧授权失效；未使用的默认连接变化不影响独立选择。 |
| Agent 描述协作 | 所有者授予 / 撤销、读者 / 编辑者安全投影、提案审核、直接编辑历史及安全描述恢复 | [原生协作](PG18_NATIVE_AGENT_COLLABORATION.md)。共享不授予执行权限；完整角色指纹、授权版本、停用员工、回执恢复和事务故障检查已通过真实 PG18 与浏览器验收。恢复保留当前私有绑定并使旧提案失效；不替代完整配置版本与发布。五项描述容量及任务计划传入模型已对齐，工具与各执行路径总预算保持独立。 |
| 完整版本与发布 | 所有者完整快照、单调版本号、发布 / 归档、草稿删除、资源重校验后的完整恢复、专用验收及员工页面 | [完整版本](PG18_NATIVE_AGENT_RELEASES.md)。046已纳入全新初始化及默认关闭时的权限检查。实际 PG18 验证完整中文角色的快照、恢复、专用验收与发布；浏览器验证原请求恢复、模型 B 审批、删除预览清理和退出 / 员工切换隔离。历史测试事实与当前有效性分开；旧知识来源不能生成新的通过证明。 |
| 新库准备 | 真实 SQL 顺序、源文件指纹、初始化回执、六类独立服务登录准备、分阶段只读检查和审查包 | [新库初始化](PG18_FRESH_RUNTIME_INITIALIZATION.md)、[迁移后检查](PG18_RUNTIME_PREPARATION_POSTCHECK.md)。没有在真实目标执行初始化、启用登录或启动服务。 |

最新完整隔离基线为提交`bfe9c0a63763f45339a66972b1ee262ee4db0a57`。

`bfe9c0a` 已通过：

- [质量46/46](https://github.com/HG1127/agent-studio_vibex/actions/runs/40424685753)：根 `pnpm check` 727/727、类型/构建及95项生产资源隔离；来源准备域20/20，既有记忆、反馈和角色接受域均通过。
- [真实PostgreSQL18](https://github.com/HG1127/agent-studio_vibex/actions/runs/40424684116)：默认050及显式051–055、Native HTTPS/SDK、私有mTLS及既有来源/租约/撤销回归；新增内部来源读取验证实际身份/版本、不同选择顺序并发、反馈修正/删除、检查点裁剪及治理版本变化后的输入摘要。
- [浏览器4/4，主场景19项](https://github.com/HG1127/agent-studio_vibex/actions/runs/40424684146)：既有员工操作完整回归；37张合成截图中的接受记录页已目视复核。本阶段没有新增评价/优化公开接口或页面。

同一bfe9c0a规范PocketBase19项/双Worker19/19通过，75.7秒，临时目录位于D盘。当前运行路径的离线源码审查包已逐文件核对：初始化86源文件/13计划，API/索引168来源模块、173份复制源码；清单、默认拒绝启动和无凭据检查通过。新增来源准备模块尚未挂载，因此不在该运行入口的交付闭包中；其源码及测试已进入迁移分支。归档不提交或上传。

默认新库050仍为34个SQL源、36条来源版本加初始化回执、62张表、61张FORCE RLS和22个核心角色；051–055仍单独审查，未初始化真实目标。完整候选见[迁移草稿PR](https://github.com/HG1127/agent-studio_vibex/pull/26)。

## 尚须补齐或逐项核实的功能

| 范围 | PocketBase 参照 | 剩余工作 |
| --- | --- | --- |
| 委托审批与公司视图 | `src/pages/Manager/ManagerPage.tsx`、`pocketbase/pb_hooks/studio_company.pb.js`、`tests/studio-company.integration.mjs` | 本人明确委托及用途、经理仅看必要元数据、固定待审批操作指纹、一次性决定、撤销 / 来源变化校验、管理员公司汇总。现有本人运行审批不能代替经理委托。`InternalOverviewPage` 使用另一个总览接口，须另行核对。 |
| Agent人工澄清与方案审核 | `src/pages/AgentRun/useAgentRun.ts`、`pocketbase/pb_hooks/agent_engine.pb.js` 的 `ask_user` / `/respond` | [人工回复验收](PG18_AGENT_HUMAN_INPUT.md)。048新库、同一运行等待、1600字符回复、批准/修改、本人Cookie和原回执、角色默认/单次覆盖、定时防重叠、完成证据及分页记录已有c0a448e的17项域、真实PG18和主浏览器12/12隔离证据。模型final不能绕过所需本人方案批准，费用/工具授权仍独立；真实员工UAT待签收。 |
| Agent / Workflow最终交付完整性 | `pocketbase/pb_hooks/agent_engine.pb.js` 的 `finishRun`、`workflow_api.pb.js` 的结束节点 | 独立Agent完整成果已在c0a448e通过长中文SQL/mTLS、版本证据、实际PG18和浏览器检查，旧任务指纹保留。[已验收修复](PG18_WORKFLOW_FINAL_DELIVERY.md)为新任务加入绑定摘要的最终交付协议，结束结果截取至20000，节点4000和付费输入12000保持。完整输出提交f2e3deb已通过质量42/42、根检查623项、95项资源隔离、真实PG18和浏览器4/4（主场景12项）。新增SQL持久结果、旧协议恢复和仅一次私有模型调用均通过；员工UAT仍待签收。 |
| Agent跨运行记忆 | `src/components/agent-run/MemoryPanel.tsx`、`src/pages/AgentRun/useAgentRun.ts`、`pocketbase/pb_hooks/agent_engine.pb.js` | [本人指令、来源经验/教训与反馈](PG18_AGENT_MEMORY.md)已在bfe9c0a通过根727项、记忆域85项、反馈域33项、角色接受域20项、真实PG18与浏览器4/4（主场景19项）。051明确保存、052自动写回/停止、053早期失败、054独立员工反馈和055手工角色接受、来源失效隐藏、物理忘记及原请求恢复均有隔离证据。有界派生提示、独立提炼费用及定时/嵌套范围仍待完成；051–055未进入默认050。 |
| 模板发布与复用 | `pocketbase/pb_hooks/template_market_api.pb.js`、`pocketbase/pb_hooks/internal_templates.pb.js`、`pocketbase/pb_hooks/agent_templates.pb.js` | 逐项核对发布、模板市场、使用、交接及权限。已有画布样本 / 导入导出和基础模板表不能直接作为这些操作的等价证明。 |
| 反馈驱动的优化关联 | `pocketbase/pb_hooks/agent_optimization_lineage.pb.js`、`pocketbase/pb_hooks/agent_specs.pb.js` | 055本人手工角色修改已完成SQL、HTTP、严格SDK与员工页面隔离验收；绑定当前反馈、修改前后完整摘要、实际字段和真实045历史，审计失败原子回滚，删除反馈/后来改角色后仍可核对原请求。新增内部来源准备已通过20项域测试、真实PG18及完整回归，仍未挂载HTTP。持久费用请求/结果账本、Worker/Broker、付费草稿页面及未知结果隔离仍待完成。 |
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

来源记忆、自动保存、真实失败凭据、独立员工反馈与本人接受的角色修改见[Agent记忆](PG18_AGENT_MEMORY.md)。bfe9c0a整轮合成隔离验收已通过，051–055仍不进入默认050。历史回执保留，删除内容不能被原请求复活。

付费评价/优化草稿、有界派生提示、独立付费提炼、定时/嵌套保存范围和上表其余活跃功能仍待完成。实际员工、目标环境、备份恢复/回滚和长期Worker尚未签收，正式迁移继续NO-GO；测试数量不能换算为迁移完成百分比。

可选056内部提交/隐私基础已完整隔离验收，当前运行候选e3623df：用途/模型/输出上限/完整来源输入摘要、私有输入、反馈引用、待处理记录及强制审计同事务提交；原请求与取消/删除收据精确重放。同文本反馈纠正/删除会物理清除引用输入并保留删除标记。严格审计精确处理不可被非超级用户触达的内建维护角色，仍拒绝API/旧Worker额外权限。质量47/47（根732/732、前端类型和构建）、提交/隐私域14/14、来源域20/20、真正PG18并发、员工浏览器4/4（主19/19、37张截图）全部通过。PocketBase19/19在c5c2649执行，随后两个PG专用提交与该19项相关的全部输入经Git范围比较未变。默认fresh050来源摘要仍69cbb979c0f8de76f628309a33bbb9363e92edaacb2dfd4f18377b0cdbaef59e；离线包86/175份复制源码已核对至e3623df。API入口只挂载056审计，没有公开费用HTTP/UI、Worker租约、provider调用、输出发布、历史意见转引或生成建议接受。三个并行会话的057执行草案尚在D工作区，未上传或验收；正式迁移仍NO-GO。

最新057执行候选为`b8bab6b07372b79bb675e6352ee1becf35b3c79e`。两个输出外键使用不同的明确名称，完整审计仍检查目标、列、删除动作与内部RI触发器；恢复PUBLIC权限、改名、改删除动作及禁用RI触发器的篡改均须拒绝。[执行领域35/35](https://github.com/HG1127/agent-studio_vibex/actions/runs/40440556273/job/121979625218)、056提交/擦除14/14及来源20/20通过。[真正PG18两个作业](https://github.com/HG1127/agent-studio_vibex/actions/runs/40440556218)和[员工浏览器4/4、主19/19](https://github.com/HG1127/agent-studio_vibex/actions/runs/40440556300)通过，37张合成截图中的既有反馈接受来源页已复核。专用Worker/mTLS测试实际进行了7次合成provider POST和7次凭据读取，包含收到POST后另一真实API连接取消或擦除、禁止迟到发布及禁止旧proof重发；取消和擦除不代表未调用或退款。PocketBase19项/双Worker在dad772d通过，85.4秒；到b8bab6b仅四个PG专用文件变化，相关PB输入未变。同一提交完整质量48/48通过，根pnpm check为759/759并完成类型/构建；最新全通过的完整隔离基线为b8bab6b。阶段验收不代表正式迁移完成。

独立operator入口与离线审查包进入后续候选：`agent-assessment-service.ts --plan/--help`离线；`--preflight worker|broker`在独立审批后只读检查，`--serve worker|broker`另有明确模式、非root固定目标、专用登录、证书及私钥元数据门。停止后拒绝新dispatch，等待断开连接后仍在执行的handler、跟踪原始TLS连接，并清理自有凭据Buffer和mTLS客户端副本。两个systemd示例默认关闭、只运行preflight；登录SQL示例以ROLLBACK结束，不安装或启用服务。源码收集器的显式`--with-agent-assessment`包含完整静态/动态执行依赖与五项精确operator资产；默认包不收录独立执行入口。解包后plan/help及未授权模式拒绝已有离线验证。入口代码、真实独立登录只读预检、停机行为和当前源码包仍须按后续同一提交CI分别验收；5432/agentstudio_pg18_ci的pool预检不能冒充5333/agent_studio完整非root入口、SIGTERM或长期运行验收。

公开费用HTTP/SDK/员工UI、当前来源保护的结果读取和历史意见引用、生成建议与055本人接受的真实关联、最终完整schema/交付包及其余功能仍未完成。默认fresh050来源摘要保持`69cbb979c0f8de76f628309a33bbb9363e92edaacb2dfd4f18377b0cdbaef59e`，051–057为可选独立审查；PocketBase继续正式运行，未接触真实目标、部署、启用服务或切流。真实员工UAT、网络/权限、备份恢复/回滚及长期Worker未签收，正式迁移继续NO-GO。
