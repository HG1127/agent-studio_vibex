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

最新完整隔离基线更新为`14969f639ce6cf60971239540cb061e1e1a45677`：[质量48/48、根pnpm check 783/783及类型/构建](https://github.com/HG1127/agent-studio_vibex/actions/runs/40443039932)、扩展执行/服务域57/57、[真正PG18三个作业](https://github.com/HG1127/agent-studio_vibex/actions/runs/40443039863)和[浏览器4/4、主19/19](https://github.com/HG1127/agent-studio_vibex/actions/runs/40443039829)全部通过。独立角色只读pool inspector5/5通过，四项operator修复独立源码复核与30纯测试通过。同一提交规范PocketBase19/19、双Worker、79.8秒；37张浏览器截图已提取并目视复核既有接受来源页。当前初始化86份、API/索引/assessment192份复制源码已逐文件核对，默认关闭和解包离线探针通过，归档只保留本地。该轮验收仍不包含完整非root CLI/实际SIGTERM或长期运行；下一轮三个会话分别实现无出网容器的guard、bootstrap和实际子进程用例。正式迁移仍NO-GO。

完整非root CLI的下一候选新增独立GitHub测试容器：PG18和Node子进程共享容器loopback，network=none、无发布端口或宿主绑定，/run及/var/lib/postgresql均为tmpfs。主进程实际核对新CID、镜像、nonce/labels、网络/存储及系统标识后，在容器内写只读root证明；test-only guard与首次只读SQL再次验证身份/新库指纹。源码、SQL、依赖根和Dockerfile均核对规范路径，拒绝链接逃逸。实际用例包含空队列与两pending请求的worker/broker CLI preflight、真实Broker监听/端口冲突/未完成TLS握手停机、空闲与在途Worker及重复SIGTERM。原有5432 guard、fresh050/可选SQL及产品目标不变；重复信号处理仅补充持续监听至排空结束。当前只有纯测试、语法和类型检查证据，完整容器/子进程仍待该候选的托管CI；不得将计划、只读pool inspector或先前class级mTLS测试算作已经完成的完整CLI/长期Worker验收。正式迁移仍NO-GO。

最新完整隔离基线为`b493038aec25c8400c1cf6378b1e4ad764d0ce00`：[质量48/48、根pnpm check 803/803及类型/构建](https://github.com/HG1127/agent-studio_vibex/actions/runs/40449542495)、assessment域69/69、[真实PG18三个作业](https://github.com/HG1127/agent-studio_vibex/actions/runs/40449542456)、[浏览器4/4与主场景19/19](https://github.com/HG1127/agent-studio_vibex/actions/runs/40449542487)和[完整非root CLI 8/8](https://github.com/HG1127/agent-studio_vibex/actions/runs/40449542465)全部通过。CLI另有18项纯门检查，实际network=none容器内4653份源码/依赖经过manifest核对；空队列/pending预检、Broker监听/冲突/待TLS与Worker空闲/在途RPC重复SIGTERM均有实际进程证据。同提交规范PocketBase19/19、双Worker、82.3秒通过；37张合成截图的接受来源页已目视复核。初始化86份、API/索引/assessment192份复制源码的新本地归档已逐文件核对。该阶段不包含长期Worker或真实Broker/provider在途CLI排空；公开费用流程、历史意见依赖、生成建议接受及其他迁移缺口仍须继续，正式迁移仍NO-GO。

可选058候选新增两个仅API可调用的owner结果读取函数及独立精确审计，不增加表、角色、provider effect或默认初始化步骤。读取使用同一已验证Native事务，依次持有epoch、源540/resource锁和最终正文SHARE锁，重建当前来源并核对原始输入/结果摘要，COMMIT后才交付结果；失败、unknown、cancel和erase状态保持原义。新增11项纯合同、5组SQL与7组仓库用例，以及真实PG18七子场景，覆盖跨owner同UUID、零分/完整容量、正文擦除、源540删除、epoch双方顺序和只读无业务DML。Native启动仅增加可选审计，公开费用HTTP/SDK/UI尚未挂载，历史意见依赖仍拒绝。当前仅纯测试/语法/类型与独立源码复核通过，058的SQL与多连接并发待该候选托管CI，不计为验收完成；正式迁移仍NO-GO。

可选058已在`28d39703909f1031ad53ed52bc68b59ae6c4cd3d`完成该阶段全套隔离验收：[质量49/49、根pnpm check 814/814与类型/构建](https://github.com/HG1127/agent-studio_vibex/actions/runs/40451577462)、新结果读取域23/23、[真实PG18四个作业及并发8/8](https://github.com/HG1127/agent-studio_vibex/actions/runs/40451577322)、[浏览器4/4主19/19](https://github.com/HG1127/agent-studio_vibex/actions/runs/40451577408)和[完整CLI8/8](https://github.com/HG1127/agent-studio_vibex/actions/runs/40451577393)全部通过。实际pg_blocking_pids证明读取与erase/反馈540删除/epoch变更的双方顺序；同UUID跨owner、零分/完整容量和无读取业务DML通过。37张当前合成截图中的接受来源页已目视复核；初始化86份和API/索引/assessment194份复制源码的新本地归档逐字节匹配。PB19真实执行仍为b493038的双Worker82.3秒，058的PB运行输入及根package非test字段已比对不变，没有声称在058重跑。默认fresh050不变，公开费用HTTP/SDK/UI是下一轮待验收草案，历史意见依赖与生成055接受、其他功能及正式部署验收仍未完成；迁移保持NO-GO。

公开评审下一候选接入真实Native Cookie HTTP的source/安全preview/submit/confirm/control/control-confirm/current七入口，三仓库仅在完整058审计通过时挂载。新提交有独立且默认关闭的隔离UAT许可；关闭时原请求恢复、读取与隐私控制仍可用，不复用Worker执行开关。浏览器SDK/controller严格核对闭合协议和WebCrypto摘要，保留一次冻结的原提交与控制，超时/未知只核对，不自动新建或重发。新员工面板选择独立本人模型及反馈、安全预览后由本人明确确认可能费用，零分直接展示，优化建议只读。新增36项纯HTTP/policy/SDK/session测试已在各会话通过；父新增浏览器故事使用真实Cookie/SQL仓库和protected057 claim/context/reserve/finish合成完成，覆盖原请求丢响应、禁新提交后的读与擦除、独立模型、结果、反馈级联擦除及跨员工隔离。该浏览器控制不宣称同故事运行真实Worker或provider；那些路径由独立PG18/mTLS及完整CLI验证。当前公开端到端仍待候选隔离CI，不能从单测推定完成；历史意见依赖/发现历史列表、生成055来源接受及其他迁移和正式运维验收继续保留。默认fresh050、SQL001–058与生产流程未改，正式迁移NO-GO。

公开评审已在`c1269da42f9947cccc38b58fabd6f27acd94aa25`完成本阶段全套隔离验收：[质量49/49、根pnpm check850/850及类型/构建](https://github.com/HG1127/agent-studio_vibex/actions/runs/40454976566)、结果读取SQL/仓库23/23和HTTP/policy10/10、[真正PG18四作业及并发8/8](https://github.com/HG1127/agent-studio_vibex/actions/runs/40454976576)、[浏览器4/4主20/20](https://github.com/HG1127/agent-studio_vibex/actions/runs/40454976596)和[完整CLI8/8](https://github.com/HG1127/agent-studio_vibex/actions/runs/40454976607)全部通过。同提交实际PocketBase19/19、双Worker78.5秒；38张合成截图中新增独立模型及零分评审界面已目视复核。初始化86份、API/索引/assessment200份复制源码的新本地归档逐字节核对，归档未上传。新故事真实经过Cookie/HTTP/SQL仓库/SDK/controller/界面，结果由protected057合成完成，不把该故事说成真实Worker/provider过程；它们仍由单独真正PG18/mTLS与完整CLI验收。已修复模型/输出变化取消后缺替代来源读取，以及浏览器confirm等待与异常子进程清理。新提交默认关闭，SQL001–058和默认fresh050不变；历史结果发现、prior依赖与生成055接受、其余活跃功能及正式UAT/运维验收尚待完成，整体迁移NO-GO。

本轮按实际Standalone入口重新核对功能范围：PB入口`src/main.tsx -> App.tsx`及菜单/可达组件/hook/handler，对照独立PG入口`pg18-app/main.tsx -> PgNativePilotPage`。源级报告核对88处证据锚点、51份源码摘要，静态闭包324份源码；不把不可达旧VibeX导出页或RunningHub费用弹窗当作迁移要求。报告记录时Native已验收基线为c1269da；随后5份Native源码进入未验收history草案，不能把该草案算作已通过。该对照是范围证据，不替代运行/UAT验收。

| 活跃功能缺口组 | 当前需完成的范围 |
|---|---|
| ACTIVE-PARITY-01 · 生成意见的受保护接受、来源关联和再次试跑闭环 | 缺少本人当前受保护生成结果到055候选接受及复测关联；历史评估输入仍拒绝。PB隐式聚合旧评估应改为有界明确选择与可撤回来源，不能照搬。 |
| ACTIVE-PARITY-02 · 运行步骤的显式委托审批 | 无可达Native委托授予/撤销/到期、管理员委托队列及run/step/输入指纹绑定决定。Admin身份或浏览器owner_id不能替代原owner明确授权。 |
| ACTIVE-PARITY-03 · 公司运营总览及本人跨任务待办 | 缺公司运行/待审批/失败/过期计划聚合及本人跨Agent/Workflow/计划的安全待办。不能以总览为由暴露同事prompt/output；不重复账号管理、不臆造组织架构。 |
| ACTIVE-PARITY-04 · 模板中心与内部一次性分享 | 缺目录/本人发布/撤回/副本安装及审核后生成/兑换/撤销邀请。安装须清洁快照并重绑本人的模型/工具/知识，不能继承发布者凭证。 |
| ACTIVE-PARITY-05 · 发布后集成：embed、外部调用密钥、试调及统计 | 缺外部主体/发行密钥的安全边界、轮换撤销、发布版本绑定、embed配置脚本、真实试调与按来源调用日志/统计。不能直接公开Cookie员工路由。 |
| ACTIVE-PARITY-06 · 本地设备配对、受限任务与办公助手 | 缺Native owner设备配对/撤销/心跳目录、批准的本地claim/result/cancel和Agent/office绑定。不是任意本机shell，也不能沿用PB token当Native授权。 |
| ACTIVE-PARITY-07 · 独立工具调试、调用总览与Worker/Harness监控 | 缺按工具能力明确授权的独立试调、按工具筛选的调用日志/聚合统计和Worker心跳/Harness屏。监控读取不能成为启动Worker或绕过owner审批的执行通道。 |
| ACTIVE-PARITY-08 · MCP公共注册表浏览、推荐和说明层 | 仅缺官方公共MCP registry查询/推荐/详情及中文说明流程。独立试调/日志共性归07。模型翻译若保留须本人模型和明确费用确认，不复活旧RunningHub访客代付界面。 |

纠正旧待办：计划任务的授权/暂停/立即运行/原occurrence重试及历史、结构化嵌套loop、Agent版本验收/保存/发布/完整恢复，以及基础员工治理与协作提案已有Native实现，继续保留回归，不重复开发。未发现活跃PB独立子Workflow节点或部门组织图的证据，不因类比追加功能。新历史发现是当前Native持久化请求流程的真实缺口：须在刷新/登录后恢复评估，并在来源失效时保留精确隐私控制；该功能正在独立实现。上述8组与最终完整schema/交付映射、真实员工UAT、网络/权限、备份恢复/回滚、长期Worker及GO仍未完成。正式迁移NO-GO。

历史意见下一候选增加Native本人任务/用途范围的只读metadata发现和微秒keyset分页；独立history能力只管理发现，不授权正文、新付费请求或模型执行。重新加载后明确选择原UUID，经058核对正文；当前模型或来源失效时保留已知不可变hash，仍由本人明确取消或擦除，临时关闭列表能力不能撤销原056隐私控制。每个已接受历史项的cancel/erase观察保持单调，非法半页不得污染已知状态，注销/401/换任务严格隔离。无新SQL、角色、授权或索引，SQL001–058与defaultfresh050不变；LIMIT只限制响应候选数，真实性能仍须隔离PG查询计划证据。新增真实PG18微秒分页/owner碰撞/来源失效擦除证明及浏览器重新加载发现/正文拒绝后删除证明已编写，本候选尚待托管隔离CI。生成建议进入055、prior依赖/派生隐私及实际PB活跃功能缺口继续推进，迁移整体未完成、生产NO-GO。
