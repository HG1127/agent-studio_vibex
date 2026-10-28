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

本人历史意见已在`ad663d427a79c9658ceb3ea9782db4a7c71b27cc`通过本阶段完整隔离验收：[质量49/49、根pnpm check889/889与类型/构建](https://github.com/HG1127/agent-studio_vibex/actions/runs/40463860305)、旧058域23/23、公开HTTP/policy10/10及新history17/17；[真实PG18四作业、意见/历史9/9](https://github.com/HG1127/agent-studio_vibex/actions/runs/40463860207)、[浏览器4/4、主20/20](https://github.com/HG1127/agent-studio_vibex/actions/runs/40463860198)及[完整CLI8/8](https://github.com/HG1127/agent-studio_vibex/actions/runs/40463860256)均通过。真实API角色/RLS的PG18.6查询计划已留存：21条同scope合成行、limit4取5候选、实际5行，单次执行0.224ms仅作合成证据，不宣称生产规模性能。39张截图中来源失效且发现关闭仍保留明确取消/擦除入口已目视复核；微秒分页、跨owner同UUID、当前来源失效后物理擦除和不可变结果保留已验证。实际PB19/19双Worker77.8秒在7b34a3e执行，ad663d4只改两项PG测试，已核对PB全部输入未变，未宣称在ad重复执行。初始化86份和API/索引/assessment202份归档复制源码逐字节对照ad，仅本地保存。三项交叉审查问题（BOM规范字节、列表能力关闭导致原隐私控制消失、未选项擦除状态回退）已修复；一项SQL测试准备顺序已按真实资源校验修正。历史发现只读且正文仍经058，未改变SQL001–058/defaultfresh050/Worker/正式PB。三会话继续实际实现optional059真实feedback-backed生成接受foundation，尚未挂载/验收；bounded priors、prior-only、活跃功能八组及正式UAT/网络/权限/备份恢复/长期Worker/GO仍待完成，整体NO-GO。

可选059下一候选仅增加真实feedback-backed生成优化建议的接受foundation：两张原始数据私有且FORCE-RLS无策略的永久hash/反馈引用表、两个仅API可执行的保护函数、独立精确catalog/prosrc审计、闭合Node/浏览器协议、同一真实Native事务的Source/受保护058正文/角色更新/045与055触发历史/link/witness、原始请求恢复及尚未挂载的确认面板。只接受真实完整五项描述，保留名称、模型、工具、知识和权限全部字段；不伪造反馈或手工来源。原付费choice顺序不变，全部实际反馈另按(run_id,feedback_id)排序选真实055锚点，target与anchor run分开。新quality第50和真正PG18第5作业使用各自独立合成库，不复用旧服务库。当前SQL/并发尚待托管验收；未修改001–058/defaultfresh050、现有HTTP/Native配置/Worker/Broker/provider/proof，未挂载公开API或界面，不能据foundation声称员工接受闭环可用。后续真实HTTP/SDK/界面挂载、配置独立同意/恢复、有界prior及prior-only、其他实际活跃功能和正式UAT/运维GO仍待完成，整体NO-GO。


### 2026-10-27 — generated acceptance foundation accepted at 2aa913f

The optional059 foundation passed all50 quality jobs (951 root units and49 generated-domain tests), all5 genuinePG18 jobs (new generated12/12 plus guard9/9), all4 browser jobs (existing20 cases), the full CLI lifecycle (18 pure+8 actual), and exact-head canonical PocketBase/SQLite19/19 with two workers. Browser artifact12723867219 was visually checked. Offline init/API review bundles were rebuilt and all86/202 copied files compared with this candidate; their receipts are recorded in the local acceptance evidence.

This is foundation acceptance only: the HTTP/SDK/page mounting, browser21 and optional059 privileged operator are the next separately integrated source changes. Partial/edited/prior-only acceptance and other active-feature parity remain open. Default fresh initialization stays050; no real target was initialized or deployed, and production remains NO-GO pending complete feature and operational acceptance.


### 2026-10-27 — Native generated acceptance UI and HTTP accepted at 49cfbd5

All50 quality jobs (991 root units,73 generated-domain cases), all6 genuinePG18 jobs (including5 actual Native Cookie/HTTP cases), all4 browser jobs (21 actual browser cases) and the existing full CLI lifecycle passed. Browser artifact12727901635 was visually checked after actual opinion erasure. Independent consent, lost-response recovery across opinion/tab/scope changes, one accepted role revision, genuine045/055/059 history, no refresh on historical GET and late-response employee isolation were exercised. Refreshed offline init/API bundles matched all86/208 copied source files. PB19 last actually ran at2aa913f; its runtime and canonical E2E inputs were verified unchanged at49cfbd5, not reported as rerun.

This closes the complete-five Native acceptance path only. The separate optional059 operator is still awaiting trusted-artifact and actual install/backup/restore/crash-recovery evidence; partial/edited/prior-only and other active-feature parity remain open. Default fresh stays050, no real target was initialized or deployed, and whole migration/production GO remains incomplete.


### 2026-10-27 — Optional059 trusted operator candidate submitted for isolated verification

The candidate adds a separate review-only source archive, a pg-only installation projected from the unchanged full lock, and a dedicated hosted PG18 profile with two fresh loopback clusters. Authored exercises cover actual backup/independent restore, uncommitted same-client full audits, rollback, runtime-login checks and uncertain-COMMIT recovery. A cross-review finding about backup/restore proof ageing was corrected with entry and pre-DDL freshness checks. These are authored capabilities, not a claim that the genuine operator exercises have passed; exact-head hosted results must be recorded separately.

The previously accepted Native complete-five UI/HTTP path remains based on49cfbd5. Default fresh initialization remains050; SQL001–059 and the original5432 synthetic guard are unchanged. This candidate does not initialize a real target, activate the feature, deploy or approve production migration. Remaining partial/edited/prior-only generated acceptance and other active feature groups still require completion.


### 2026-10-27 — Exact PG18 restore CHECK form and database metadata repair candidate

The preceding2b37d3e passed all50 quality jobs/1022 root units, all6 genuinePG18 jobs, all4 browser jobs/21 cases and the existing full CLI lifecycle. The separate optional059 install/restore exercises failed before installation. Actual job122186005643 showed that pg_dump/restore flattened one associative AND in agent_memory_derived_entries_fact_check; all terms/bounds and the real API session remained identical. The validator now accepts only those two exact observed spellings for that named CHECK. Three pure regressions reject weakened bounds, altered boolean operators, missing terms and changed quoted literals. No migration SQL was edited.

The authored fixture now takes an actual create-capable custom dump and restores through the postgres maintenance database into each independently attested agent_studio database. Port5334 remains a different cluster from the approved5333 target. Source/restored named database owner, ACL, settings, locale and properties are checked in addition to full058, business metadata and global roles before restored:true evidence is issued. This candidate has passed34 focused pure tests, API types and10 ordinary-host negatives; its genuine backup/restore/install/fault results remain pending. Prior2b37d3e archives are historical and need payload revalidation/refresh for the new051 auditor source. Default fresh remains050 and SQL001–059 Git contents are unchanged. No real target, feature activation, deployment or production GO is included.

## 2026-10-27 本轮候选：安装恢复与本人概览/待办

已推送的09a95ca具有独立组件证据：[可选059真实安装与恢复12/12](https://github.com/HG1127/agent-studio_vibex/actions/runs/40521987108)和[本人概览/待办真实PG18测试9/9及完整7个隔离作业](https://github.com/HG1127/agent-studio_vibex/actions/runs/40522007450)全部通过。前者包括真实备份/独立恢复、同连接完整058/059校验、四类真实运行登录、事务回滚、提交回执丢失、同PID恢复及服务端仍运行时的pending；后者包括完整计数、limit+1微秒分页、Unicode顺序、原生Cookie/所有者/停用/权限、无写入摘要和真实锁顺序。安装不等于启用业务功能。

本轮页面候选已接入本人概览、跨Agent/Workflow/计划待办，以及实际原任务的两次来源/资源/版本读取；聚合数据不授予审批或执行权。原请求结果不明时保留参数，主任务、反馈/评审/接受、节点调试和计划控制器共同阻止任务替换；员工/API切换及迟到401保持隔离。StrictMode读取重放与调试控制器遗漏均已修复并交叉复核。集成后的目标类型检查和15个入口200项纯测试通过；浏览器场景仅作者化，本轮完整五类CI、实际浏览器和规范PB19回归尚待执行，不能据此推进整体验收基线。

浏览器验证使用合成PGlite加真实Native HTTP/mTLS，与上面的独立PG18 TCP证据分开。测试fixture仅在显式own开关及完整052/七表校验通过后挂载实际仓库；逾期计划控制仅修改固定合成Alice已有计划的next_at，不启动调度或创建任务。三个本地审阅包已逐字节核对86/211/87份源码，包含实际待办导入闭包；归档不提交或上传。默认初始化仍050，SQL001–059原字节不变。

这只是本轮候选记录。公司管理员汇总、实际Worker心跳、委托审批、partial/edited/prior-only接受及其他活跃功能和真实目标/UAT/运维签收仍未完成，正式迁移继续NO-GO。


### 2026-10-28：个人概览与原任务上下文恢复

已将个人概览/待办接入真实 Native Cookie 服务与 PG 原生页面，并直接打开实际的单次 Agent、多轮 Agent、Workflow、只读 Workflow 或计划入口。完整统计不从最近列表推算，分页绑定原查询和微秒位置；原任务打开再次核对真实资源、当前资源版本及原运行版本，允许只读查看而不扩大写入或执行范围。

原控制器在切换概览时保留未确认请求。debug、配置接受、反馈、计划授权等仍使用原请求与独立确认；迟到的旧员工或旧 API 响应不能恢复到新工作区。React StrictMode 下的实际首次条件挂载、计划超期与 Workflow 原任务打开均在完整 21 项浏览器验证中通过（`f9df65e`，运行 40543774788）；四浏览器任务全成功。概览桌面截图与故障时正确拒绝画面已实际检查；最终候选继续遵守同提交全部门禁。

后端及通用回归的精确历史依据为 `e653299`：50 个质量任务、根 1,135 项、实际根 TS6.0.3/构建、7 个 PG18 任务、个人操作 9/9、可信 059 工具 12/12及同提交 PB19 全通过。两轮浏览器诊断没有修改产品、fixture 或 SQL；修复的是拦截器生命周期与故意破坏来源前后的测试顺序。

060 的实际 provided-fields 接受基础在独立 PR27 验证，保留旧 059 完整五字段协议、045/055 真实历史以及 default050；该基础不代表已挂入 Native/SDK/UI。未完成的活动功能及真实环境签收继续以完成矩阵为准。

### 2026-10-28：模型提供字段的独立配置接受入口候选

S1保留实际优化结果提供的字段集合，并分别核对实际变化。缺省描述沿用完整的当前角色，空文本/空列表保留明确清空语义；名称、模型、工具、知识和权限绑定保持原样。新协议的补丁、候选和055兼容候选摘要分别计算，15字段原请求单独绑定补丁摘要与配置同意，模型费用确认不自动修改角色。

7437155的未挂载060基础真实18组、质量50任务与既有059安装恢复工具已通过。当前后续候选接通Native Cookie/Origin/CSRF、严格SDK、原请求恢复会话与字段比较页面。配置接受、原请求确认和已知回执读取分别处理；回执只记录历史修改，正文删除和资源后来失效不复活私有正文。新鲜接受继续使用同一客户端完整Source资源校验和受保护060写入，返回仅在COMMIT之后可见。

四个公开浏览器辅助函数的getter边界已独立复核关闭；实际编译器和本地限定测试通过。此处接线尚待精确候选的真实Native HTTP、完整浏览器及最终整套回归，不代表正式迁移、真实员工UAT或生产GO。默认新库050及原001–060来源未更改，没有初始化真实目标。

### 2026-10-28：S1 Native 诊断通过，进入同提交完整回归

真实 PostgreSQL 18 运行 [40611680320](https://github.com/HG1127/agent-studio_vibex/actions/runs/40611680320) 在 `e4f2800` 通过原 18/18 组及新增 Native Cookie/HTTP 7/7 组；61 项纯测试、两个作业各 9 项普通环境拒绝保护及实际 API 编译通过。跨员工预览原先被 Source 错误转换成 409，现只把受保护 058 的精确 P0001/agent_opinion_not_found 转为固定 404；相似错误仍拒绝，真实 Bob 全路径隔离和禁用账户原断言均通过。

浏览器诊断 [40609886750](https://github.com/HG1127/agent-studio_vibex/actions/runs/40609886750) 的精确提交为 `a57d22d`：四任务全部成功，主流程 22/22（7.0 分钟），新增模型提供字段/显式清空、原响应丢失后恢复及员工隔离场景实际执行。产物 12783760708 含桌面预览、移动预览和接受回执三张新 PNG。e4f2800 仅修改上述 Source 错误映射及回归测试；不把前一提交的浏览器证据冒称新提交重跑。

本地审阅包已按 e4f2800 逐字节核对 391 份源码：初始化 86、更新后的实际 Native API 导入闭包 218、原可选 059 工具 87。归档仅本地保存，原 059 工具不代表 060 受控安装/恢复已完成。实际 PocketBase 19/19、两 worker、82.2 秒在 a57d22d 执行；后续改动未涉及 PB 运行输入。

下一候选执行同一提交的六类完整门禁：质量与根 pnpm check、七任务真实 PG18、四任务浏览器、原 CLI、可信 059 工具及 S1 两任务。当前只是诊断结果，最终门禁和实际截图检查按精确 head 单独记录。管理员公司概览正在独立 D 盘草稿并行实现，尚未进入本候选；真实 Worker 遥测、先前评价来源、其他活动功能和员工 UAT/运维签收仍未完成。默认 fresh050、原 SQL001–060 保留，整体迁移及生产切换继续 NO-GO。
