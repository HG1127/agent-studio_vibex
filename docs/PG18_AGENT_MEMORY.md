# 原生 Agent 记忆迁移状态

更新：2026-10-27。当前已验收运行时代码为 `82d97fe`。现有PocketBase继续运行；正式迁移仍为 **NO-GO**。

## 当前已实现

| 协议 | 行为 | 范围与限制 |
| --- | --- | --- |
| 049 / 050 本人指令 | 本人保存、查看、二次忘记；明确“记住”指令与任务、作业及来源回执原子入库 | 私有快照、图与效果摘要绑定选中记忆。Worker及私有派发复核原始来源；撤销后屏蔽派生成果。旧任务固定指纹保留。 |
| 可选051 来源经验 / 教训 | 本人已结束任务预览、明确保存、原回执核对、来源失效后隐藏及物理忘记 | 核对当前角色、知识、人工回复、原记忆、终态VM及实际工具；经验500字符、工具300字符。成功经验与失败教训分开，没有额外模型调用。 |
| 可选052 本次自动保存 | 提交独立Agent任务时明确选择；同一核验租约和本人事务写回；员工页面支持历史状态、停止及原请求恢复 | 默认未选。原授权绑定任务、角色版本、指令/图摘要和Native治理版本。API/Worker各自默认关闭；不授予额外提炼、模型优化或派生提示输入权限。 |
| 可选053 无终态VM失败来源 | 有效租约Worker对真实失败写只读历史元数据，允许沿原052授权或本人新明确请求保存教训 | API不能制造或修改凭据。仅证明失败，来源无正向模型/工具声明。已开始/未知外部效果仍暂停；准备阶段异常不能生成已知失败或重发证明。 |
| 可选054 独立员工反馈 | 本人成功、失败及取消任务的反馈、修正、明确负反馈教训、单条忘记及整任务反馈删除 | 员工陈述不作为引擎成功/工具证明。新提交与教训存储独立默认关闭；来源失效或教训故障保留反馈。原请求只读恢复不能复活已删除正文。 |

052为每份原授权确定唯一记忆编号。重复终态、原提交恢复及保存回执重放不能复活已物理忘记的正文。授权、停止及结果仅保留不可修改元数据；正文保存在可物理删除的051表。结果中的“曾保存”是历史事实，当前正文及来源有效性以来源记忆列表为准。

## 员工操作与恢复

多轮表单提供默认未选的“任务结束后保存本次经验或教训”。提交丢失回复后保留原角色、指令、轮数、方案审核与保存选择，恢复使用同一请求；关闭新的自动保存授权不改变已冻结的选择。

“本次自动保存”显示待完成、已停止、曾保存、来源不可用、后台关闭、保存失败或结果未确认。停止须二次确认，仅停止新的自动保存；任务继续原有逐步审批。已有内容须在“任务经验与教训”另行忘记。

停止丢失回复时冻结原任务、授权摘要和请求编号。导航或能力503隐藏状态但保留原请求；恢复后可只读核对或重发同一停止请求。新授权关闭仍允许本人停止与原回执核对。退出、Cookie失效或员工切换销毁该员工页面会话，没有浏览器持久化。

真实早期失败同样可在来源任务中预览教训、核对当前内容并物理忘记。此路径不调用模型或工具。主要页面为 `PgNativeAutonomousAgentPanel.tsx`、`PgNativeAgentOutcomeMemoryPanel.tsx` 与 `PgNativeAgentDerivedMemoryPanel.tsx`；SDK拒绝浏览器提供所有者、私有正文、治理版本或费用授权。

“任务反馈”默认不勾选保存教训，反馈与负反馈教训分别明确选择。修正反馈后旧教训隐藏；忘记一条教训保留反馈；删除此任务反馈会物理删除全部反馈正文及反馈教训版本。历史回执仅保留摘要、编号及结果。教训存储或最终审计失败不回滚已提交的反馈，也不重新调用模型。

SDK核对原始意图、UTF8分帧陈述摘要、版本及当前教训内容。结果未知时只在本员工内存保留原文和原选择，快照不暴露私有待确认文字。关闭新提交仍允许本人原请求确认、重交同一原请求及隐私删除；注销或Cookie失效清除内存意图。主要新增页面为 `PgNativeAgentFeedbackPanel.tsx`。

## 服务器边界

051独立开关为 `AGENT_STUDIO_PG_AGENT_DERIVED_MEMORY_ENABLED=true` 和 `AGENT_STUDIO_PG_AGENT_DERIVED_MEMORY_APPROVED=APPROVE_DISPOSABLE_PG18_SOURCE_BOUND_MEMORY_ONLY`。

052独立开关为 `AGENT_STUDIO_PG_AGENT_OUTCOME_MEMORY_ENABLED=true` 和 `AGENT_STUDIO_PG_AGENT_OUTCOME_MEMORY_APPROVED=APPROVE_DISPOSABLE_PG18_OWNER_OUTCOME_MEMORY_ONLY`。Native API还需配置写入、独立Agent执行与来源记忆删除范围；Worker独立核对此开关、人工协议及052结构。Workflow Worker不能继承该范围。开关不是实际部署、初始化或付费调用许可。

Native状态/停止接口为 `/api/v2/agent-outcome-memories/<run_id>`、其 `/stop` 和 `/stop-confirm`。身份来自服务器核验的员工Cookie，修改另有Origin/CSRF检查；路径/正文任务错配、额外身份字段、Bearer和任意 `X-Rh-User-Id` 均不能提供授权。

053仅在显式安装后生效。`agent_memory_record_failure_source`为精确审查的窄函数，只有Worker执行权限，API仅能通过FORCE RLS读取本人凭据。函数复核当前作业、租约令牌/版本/持有者/截止时间、本人失败终态、图和角色绑定、Native员工及未知效果。元数据包含失败摘要、错误码、治理版本及Worker摘要；不保存正文、租约令牌或密钥。Worker在同一事务内写回，最终作业确认仍检查租约截止时间。

历史失败可以由停用这一真实原因产生；该凭据不授予新的自动保存许可。052另行核对当前活跃Native治理版本，停用后重新启用也不会恢复旧授权。恢复登录的本人可发起新的明确保存请求，仍须通过当前角色、知识、人工回复和原记忆来源检查。

失败凭据及其审计使用保存点；故障回滚凭据，保留原任务终态。教训存储或其最终审计失败同样保留原任务及已发生效果，不重新调用模型。缺少Worker授权范围时在付费步骤前暂停。

启动审查拒绝部分安装、函数正文或结构漂移、额外权限和表/列授权转授。053的函数正文摘要为 `939cf33a95479324715479a3aee08a2464e68e8ab4d33fb152945e96e021e494`。公开成果及其历史显示、人工方案/回复保持四类凭据遮罩，先遮罩再截取；私有VM及原回执摘要保持。来源失效不能生成新的完成或记忆证明。

054新反馈运营范围为 `AGENT_STUDIO_PG_AGENT_FEEDBACK_ENABLED=true` 和 `AGENT_STUDIO_PG_AGENT_FEEDBACK_APPROVED=APPROVE_DISPOSABLE_PG18_OWNER_FEEDBACK_ONLY`。另选保存教训还需 `AGENT_STUDIO_PG_AGENT_FEEDBACK_LESSONS_ENABLED=true` 和 `AGENT_STUDIO_PG_AGENT_FEEDBACK_LESSONS_APPROVED=APPROVE_DISPOSABLE_PG18_FEEDBACK_LESSON_STORAGE_ONLY`。两者须已有隔离配置写授权、HTTPS监听和非root身份；不继承模型执行、提示词输入、角色优化或额外提炼费用权限。部分054安装、函数/结构漂移及额外授权均拒绝启动。

## 可选055：反馈与本人接受的角色修改

本人可根据当前任务反馈手工修改角色，先预览完整描述与保留的模型、工具及知识配置，再逐次明确接受。服务端绑定当前反馈记录与完整角色版本，在同一事务写入真实045修改前后历史、实际变更字段、不可变关联和必要审计。无变化或仅改名称不能标记为反馈优化；提案批准、发布及执行权限不会随之产生。

历史记录分别显示参考反馈是否仍为原版本、当前角色是否仍为此次接受版本。反馈修正/删除及角色后来变化不会改写历史；原请求核对不会再次修改角色、恢复已删除反馈或创建教训。严格SDK绑定完整候选、摘要及版本转换；冻结原候选只留在当前员工会话内存，关闭新接受、能力503或导航后仍可核对，注销即清除。

055须在051–054之后单独审查安装，仍未加入默认050。新接受默认关闭，需要独立 `AGENT_STUDIO_PG_AGENT_OPTIMIZATION_ACCEPT_ENABLED=true` 与 `AGENT_STUDIO_PG_AGENT_OPTIMIZATION_ACCEPT_APPROVED=APPROVE_DISPOSABLE_PG18_FEEDBACK_ROLE_ACCEPTANCE_ONLY`，以及既有隔离配置写授权、非root HTTPS环境。此功能是本人手工接受，不实现或授权额外付费评价/优化草稿。

## 付费评价/优化：已核对的内部来源准备

`AgentReviewSourceRepository`提供内部来源描述和只读输入预览；封闭契约区分评价与角色建议、明确的本人模型连接/版本、输出预算和用途费用确认。评价输入使用当前可核对的原任务与最终交付，检查原角色、知识、人工/记忆来源和观察，拒绝已开始或未知效果；保留实际成功、失败或取消状态，不制造成功证明。

角色建议输入仅包含当前角色描述、工具名称和明确选中的当前员工陈述，不发送旧任务指令、结果、检查点、知识正文或私人连接配置。终态锚点与任务成果协议分别标识；检查点裁剪后仍可使用当前本人陈述，但必须先修复当前角色中失效的资源绑定。反馈修正/删除会使旧选择失效，仅忘记教训不删除员工陈述；治理版本变化会改变准备输入摘要。输入摘要还绑定完整来源/角色版本、所选模型和预算。

已通过10项纯契约/完整投影测试及10项真实SQL域测试，含原有一次合成模型执行产生的完整交付和真实PG18并发/撤销验证。此准备不产生费用回执、任务、外部效果或角色修改。持久费用请求、结果账本、已存评价读取、Worker/Broker调用、公开HTTP、员工费用/草稿页面及生成建议的接受关联仍未实现。没有新SQL版本或模型权限进入默认运行路径。

## 精确提交的隔离证据

`bfe9c0a` 已通过：

- [质量46/46](https://github.com/HG1127/agent-studio_vibex/actions/runs/40424685753)：根 `pnpm check` 727/727、类型/构建及95项生产资源隔离；来源准备域20/20，既有记忆、反馈和角色接受域均通过。
- [真实PostgreSQL18](https://github.com/HG1127/agent-studio_vibex/actions/runs/40424684116)：默认050及显式051–055、Native HTTPS/SDK、私有mTLS及既有来源/租约/撤销回归；新增内部来源读取验证实际身份/版本、不同选择顺序并发、反馈修正/删除、检查点裁剪及治理版本变化后的输入摘要。
- [浏览器4/4，主场景19项](https://github.com/HG1127/agent-studio_vibex/actions/runs/40424684146)：既有员工操作完整回归；37张合成截图中的接受记录页已目视复核。本阶段没有新增评价/优化公开接口或页面。

同一bfe9c0a规范PocketBase19项/双Worker19/19通过，75.7秒，临时目录位于D盘。当前运行路径的离线源码审查包已逐文件核对：初始化86源文件/13计划，API/索引168来源模块、173份复制源码；清单、默认拒绝启动和无凭据检查通过。新增来源准备模块尚未挂载，因此不在该运行入口的交付闭包中；其源码及测试已进入迁移分支。归档不提交或上传。

## 默认初始化与未完成项

默认新库仍为050：34个SQL源、36条来源版本加初始化回执、62张表、61张FORCE RLS、22个核心角色。默认SQL摘要为 `69cbb979c0f8de76f628309a33bbb9363e92edaacb2dfd4f18377b0cdbaef59e`。051–055均为独立审查的可选迁移，尚未进入默认序列；没有初始化真实目标或启动真实服务。

1. 完成额外付费评价/优化草稿及其明确接受。055本人手工角色修改、原子反馈关联、HTTP/SDK与页面已通过隔离验收；仍不授权付费生成或自动改写角色。
2. 为派生记忆输入定义独立版本和有界、无环的原始来源遍历，保留050旧任务及效果指纹。
3. 额外模型提炼、评价或优化须有独立费用授权、私有mTLS效果记录和未知结果不重发，不能继承原任务批准。
4. 分别定义定时、嵌套Workflow及版本验收的保存/使用范围，完成默认序列、映射和最终源码审查包整合。
5. 完成其余活跃功能对照、真实员工UAT、目标网络/访问、备份恢复/回滚及长期Worker签收，才进行GO/NO-GO审核。

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
