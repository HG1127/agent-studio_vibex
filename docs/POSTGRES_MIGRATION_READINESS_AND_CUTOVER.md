# Agent Studio — PocketBase → PostgreSQL 迁移就绪与切换门槛（2026-11-04）

2026-11-03 当前交付口径：保留最新已验收的原员工页面与交互，替换底层
数据库和后端；旧数据均为可丢弃测试数据，无需历史导入。原员工管理与
个人账号页已完成源码连接及定向纯测，验证边界见
[原员工账号适配记录](PG18_ORIGINAL_STAFF_ADAPTATION.md)。原 Agent 页的逐步费用范围确认、过期确认拒绝和响应生命周期已完成源码适配，见
[运行确认适配记录](PG18_ORIGINAL_RUN_CONFIRMATION_ADAPTATION.md)。角色/Skill、
桌面执行器、最新页面依赖及验收条件的集成与真实端到端验证继续推进。
目标环境、长期 Worker、备份恢复和真实员工 UAT 尚未签收，正式切换仍为
NO-GO。以下旧阶段的历史导入要求仅在另行要求保留旧数据时适用。

当前已上传提交 `961a531` 的 22 条流程已取得 14 条通过、6 条失败，2 条完整质量流程仍在运行；两套质量任务目前各 50/51 通过，主检查尚未结算，不能报告全绿。F01 为 20/21：原运行详情排队故事真实通过；原 Agent 排队页已进入浏览器，一次真实取消提交后因丢回包，等待原终态 GET 恢复超时。Role 已通过旧查询语法错误，现严格拒绝于策略引用函数集合，十七个业务故事仍未进入。quality089 与 Staff084 已进入后续拒绝点，具体检查项仍待有界诊断，不能由前置错误消失推断通过。

本轮修复让 Role 目录查询按实际 pg_proc OID 判断依赖存在，避免同一函数分别出现在 USING／WITH CHECK 时重复计数；不同 OID 的同名重载仍保持可见，严格审计器和所有权限条件不变，49 项闭合回归通过。Reader 仅增加五阶段有界耗时观察，不缓存检查结果或授予权限；新增 13 项标准 Node 回归沿既有 CI 入口注册。布局／即时观察相关组件 219 项通过，类型修正后 13 项复测通过；实际 API 编译及旧059／060冻结源码复核通过。完整 V2 claim 及切片未在本地执行或导入，未运行本地 SQL、Worker、Native、API 监听或浏览器。

本次严格069两路均未通过。Legacy 八类实际启动均完成，但预热在 record_selection_before 报 writer_closed；Reader 多次耗时约4.4–4.8秒。Final14 为 full069_worker_live_native_io：Native8,620ms，runtime 分支完成33,150ms；Reader 在 snapshot 阶段5,015ms超原期限14ms，81次guard共3,911ms。telemetry实际控制28项通过，writer先通过21项后在短锁竞争结果失败。原全部时限、八类Worker、全14LOGIN串行pool1、即时来源／权限／OID／所有者与清理检查均保留，新增耗时记录尚待下一轮真实CI。

交付仍以最新验收原员工页面为准。c6237d68／preview.14 是已审阅源码保留基线，本迁移分支并非其Git后代，不能凭版本号声称完整发布已合入。后端剩余合同修复、原ToolHub／设备动作连接、同页真实端到端验收、目标环境与网络、备份恢复、长期Worker及员工签收分别跟踪；独立工作台与纯测试均不代替员工验收，正式切换仍为NO-GO。以下保留此前证据。

此前提交 `e7ad397` 的 22 条隔离流程全部结束，14 条通过、8 条失败。两条质量流程各 49/51；主单测均完成 5,431 项，5,427 项通过、4 项失败，无跳过或取消。此前十五项主单测失败已消除，本次仅余两个 Native 子进程旧来源 pin 断言及两个旧排队页面选择器源码断言；本地均已修复，仍待新提交复验。F01 为 19/21，两条排队故事本次被上述源码预检阻断，未进入新的真实浏览器验收。

Role/Skill A/B 已通过前次 CASE 安装错误，但在 prepareOriginalRoleUiPool 的目录查询第 3,075 字符处报 FROM／42601。修复仅删除一个多余右括号，严格审计器不变，45 项目录与否定回归通过；加上原 SQL 前检查和 CASE 源回归，既有工作流前检查 67 项通过。quality089 两路取得相同真实差集：基础库 394 个函数，旧源码推导只计 389 个，缺少五个原 SQL 重命名保留函数。现按声明顺序推导 CREATE／DROP／RENAME 的完整影响，基础 394／组合 426，整库 OID／精确集合拒绝不变，无忽略清单，无 SQL／权限变更；146 项源码终态检查及 API 编译通过。

Native CI 子进程只更新已审阅认证文件的一处来源 pin，原九个源文件及一个共享依赖门禁和篡改拒绝均保留，3 项闭合 VM／源码检查通过。排队故事源码契约只更换实际 drawer／history-link 选择器，保留原后端、所有者、五个负向读取与零异常门禁，并加强原取消 POST 恰好一次、真实终态 GET 及精确 href 的检查；23 项闭合测试通过。完整 V2 claim 及任何切片仍未在本地执行或导入。

本次严格069的 Legacy 真实隔离任务通过，不能作为长期 Worker 或员工验收。Final14 预热仍报 full069_worker_live_native_heartbeat_unavailable：Native 7,583ms、runtime 分支完成 26,679ms；Reader 5,038ms 结算，已超原期限 37ms，118 次 guard 共 4,713ms。30 次稳定校验共 15,365ms，其中 Node 5,336ms、最终来源 7,046ms。原 5／8／15／30／45 秒、八类 Worker、Final14 全14 LOGIN 串行 pool1 和每次即时来源／权限／OID／所有者／清理校验均保留，正式切换仍不合格。

设备目录独立草稿在最新源码组合中经修复测试时序后通过 26/26，前端和使用原真实依赖声明的 API 编译均通过；尚未并入交付，也未实际浏览器／Native 验收。Role 验收修订延续的标准 Node 入口已注册 33 项，但真实 SQL 正例仍待作者与验收；普通案例 Role、原 Tool Hub／网页工具及其他文件／权限／应用／Office 动作继续推进。目标环境、备份恢复、长期 Worker 和真实员工 UAT 未签收，保持 NO-GO。以下保留旧提交证据。

此前已上传提交 `589651f` 的 22 条隔离流程全部结束，15 条通过、7 条失败。两条质量流程各为 49/51；主检查均实际跑完 5,424 项，5,409 项通过、15 项失败，无跳过或取消，失败集中于三个旧展示源码断言及十二个缺少精确 Role 查询帧的旧夹具。F01 为 19/21，两条原排队任务故事使用旧选择器，且默认主机未声明质量能力时仍发生可选接口 405；严格零异常断言保留。Role/Skill A/B 已越过来源预检，但可选 SQL 在字符 10,310 处报 42601，尚未进入十七个业务故事。Staff084 四路均被实际整库函数集合不匹配拒绝；quality089 两路仅报告通用失败，根因尚未证实。

本轮已审阅修复上述 SQL 条件括号、实际页面操作路径、缺省 Role 夹具及静态展示边界。质量接口只在真实服务端声明精确协议后读取；声明本身不授予执行或写入权限。078 新增有界对象差集诊断，整库 OID／集合拒绝保持；quality089 仅输出白名单原因。目录／源码、质量诊断、排队页面源码、078 源码终态及工具终态定向检查分别通过 28、17、10、124、7 项；展示与质量边界 13 项、旧身份隐私回归 24 项通过。这些是有重叠的组件运行，不能合计为独立测试总数。实际 API／前端编译及原 main/App 入口隔离构建通过，仍待新提交真实 SQL／原页面 CI。

`589651f` 严格069确已进入真实运行：Legacy 为 `full069_worker_live_path_validation_warmup`，预热与最终采集均未完成；Final14 为 `full069_worker_live_native_io`。Native 分支 8,821ms、Reader 结算 5,029ms、93 次 guard 共 4,460ms；runtime 分支 33,380ms，30 次稳定 guard 共 20,331ms（Node 6,438ms、最终来源 9,989ms）。本次不能沿用历史的前置检查或心跳不可用错误归类；全部原时限、八类 Worker、Final14 全14 LOGIN 串行 pool1 和即时安全校验保留，仍不合格。

原界面五项工具展示及“等待你的回复”文案已按验收基线恢复；网页搜索／网页抓取的 PG 后端执行等价仍是明确缺口。Role 普通案例与验收修订延续、设备文件／权限／应用／Office 动作的独立草稿继续审阅。目标环境、备份恢复、长期 Worker 和真实员工 UAT 未签收，正式切换保持 NO-GO。以下保留旧提交记录。

此前候选 `7328c3b` 的 20 条隔离流程全部结束，12 条通过、8 条失败。两条质量流程各为 48/51 项任务通过：Agent 结果记忆旧 DTO 夹具失败，主检查与源契约检查未完成；主检查在旧仓库 admission 夹具处失败后等待超时。F01 为 6/21，其余多在源码预检受阻。严格 069 的两路本次也在旧描述性配置源码检查前置阶段被拒绝，不能据此报告新的运行时或长期心跳结果；`f0f876d` 的时限失败属于历史运行证据。

本轮修复恢复冻结公共类型文件的原字节，并将所需连接丢弃类型局限在三个模块中，实际生成 JavaScript 不变；补正实际 Git 字节的 Role／home071 嵌套来源 pin，以及旧测试夹具的精确 Role 缺省查询帧、完整运行 DTO 和真实 Worker VM 依赖。原断言、未知 SQL 拒绝、即时来源／权限／OID／所有者核验、清理和全部原时限保留。API 编译及旧 059／060 源码复核通过，完整配置仍为 53 份 SQL、19 步、55 个版本、133 张表；本地闭合纯测试通过不能代替新候选隔离 CI。已观察到的主检查夹具已完成定向修复：概览／模板市场 20 项、设计／工作流账本及 Broker 28 项、prepare／model／schedule／原 safe claim 70 项均在主目录通过，352 个原 claim 断言保留。完整 V2 claim 文件仅作源码与语法检查，绝未在本地执行或导入；本轮仍待完整隔离 CI，尚未宣称全绿。

本轮候选已把原 Role/Skill、设备库存／配对／恢复、运行预算与优化恢复、quality089／Staff084 的已审阅源码合到原员工界面。实际前端与 API 编译无错误，原 `src/main.tsx` 入口的隔离 Vite 构建通过。Role/Skill A/B、设备、运行预算与优化恢复的独立组合纯测试分别为 287、167、217 项，均通过；这些含重叠回归，不合计为独立测试总数。设备路由组合 12 项、编码与保留解析器 42 项也通过。旧运行详情 EOF／取消保护、员工页 PocketBase 回退入口和主分支最新 Worker／operator 检查均保留。

父提交 `f0f876d` 的 19 条隔离流程已全部结束，18 条通过；两套质量检查各 51/51，F01 为 21/21。运行详情工件真实记录五项阶段、五次显式负向读取及一次经 Cookie／源所有者核验的切换 404，最终无异常、清理及所有者核验通过。严格 069 的 Legacy 再次通过；Final14 在预热样本仍失败于 `full069_worker_live_native_heartbeat_unavailable`：Native 8,948ms、runtime 32,387ms；Reader 在 5,042ms 结算时已超原期限 41ms，120 次 guard 共 4,691ms。30 次稳定检查共 19,682ms，其中 Node 6,469ms、最终源码 9,636ms。

本轮编码优化仅替换等价 UTF-8／字符串标量校验，保留全部即时文件、权限、来源和审计检查及原 5／8／15／30／45 秒门槛、八种 Worker 与 Final14 串行 pool1。局部 CPU 与纯测试结果不能证明实际时限已通过。新候选的 SQL、服务、原页面真实运行验收待隔离 CI；本地未运行 SQL、Worker、Native、Electron、浏览器或收费调用。

编译通过仍不代表原功能迁移完成。Role 配置重测、原优化生成／应用／比较、设备文件／权限／应用／Office 动作、其他原入口及完整同页验收继续由原三个并行会话处理。目标环境、备份恢复、长期 Worker 和真实员工 UAT 未签收，正式切换保持 NO-GO。

以下保留此前阶段证据；其中私有候选与失败状态按当时版本理解。

`f6c9dd8` 的 19 条隔离工作流已全部结束，17 条通过。两条质量流程通过，严格 069 的 Legacy 真实任务也通过；Final14 和 F01 原运行详情故事仍失败。Final14 当前主错误是 Native 请求在原 8 秒截止后主动关闭，所处阶段为 `controller_reader_audit`，Native 分支经过 8,684ms；独立 runtime 分支完成用时 31,766ms。该次不能归类为此前的 `sample_budget_exceeded`，也没有达到正式运行验收。

本次运行详情仍完成五项页面阶段并保留五次显式负向读取，但可选切换观察为零，另有一次原 Alice 运行的实际 404 未关联。源码中的身份验证后续任务可以在“私有正文已隐藏”及当前代理请求结算后才发起 GET，二者不能代表旧页面读取已完成。本次改为等待该旧页面真正显示无权查看结果，再关闭切换窗口并独立发起原来的显式越权读取；切换必须精确验证一次原 Cookie／所有者 404，原五次负向读取和最终零异常断言保持。相关定向纯测试 50 项通过，仍须托管原页面复验。

`6f2b973` 的 F01 已真实通过 21/21 项任务，telemetry、旧 PocketBase 19 并行回归、同运行控制及定时 Worker 也已通过。原运行详情工件显示五项阶段均成功、五次显式负向读取保留、最终异常与执行／提供商计数为零、清理及所有者审计通过；这次可选的切换在途 404 数量为零，不能声称已在托管环境观察到该可选正向分支。两条完整质量流程均通过，主单测各 5,393 项全部成功。下文 `4a19edf` 预检与页面测试阻塞已修复，完整迁移验收仍未完成。

本次严格 069 已实际运行，失败类型发生变化：Legacy 的一次实际 reader 在 4,882ms 完成，保留 119ms 余量；整个短验证仍未满足预热条件。Final14 在原 15 秒预算内未完成采样，实际为 26,669ms，其中业务审计 19,961ms，30 次 guard 共 12,891ms；Node 可执行文件检查 4,818ms、最终源码检查 5,677ms。不能继续把本次两路错误写成较早的 reader 不可用，也不能由一次 reader 成功推断长期心跳合格。

后续小候选仅把 operator 的分块拷贝／拼接改为每次独立分配的有界缓冲区；原读取次数、文件偏移、请求长度、EOF 探测、全部即时检查及关闭／错误优先级不变。原父源码和 fixture 已独立核验，108 项纯测试通过。另补充 Native 非就绪预热结果的已有闭合标量诊断，不增加请求，不改变真实登录、reader 审计、登出、原回执或拒绝条件；相关 64 项定向纯测试通过。原 5／8／30／45 秒、15 秒预算、全部八种 Worker 及串行 pool1 保持，实际新候选效果仍待托管验证。

`4a19edf` 的 19 条隔离工作流已全部结束，14 条通过。两条质量流程各有 50/51 项任务通过，主检查均通过；源契约任务各为 2,971/2,972 项测试通过，唯一失败是旧 Broker 测试状态未初始化新增的报告队列。真实 Broker 构造器已有该状态，本次仅修复测试状态，相关六套纯测试已独立通过 208 项。不能把预检失败解释为真实心跳运行结果。

同提交 F01 为 20/21 项任务通过。运行详情故事完成了原页面的各阶段断言，但员工切换时多出一次原在途请求的真实 404，导致最终严格零异常检查失败。本次增加独立、最多一次的切换观察：必须是切换窗口内捕获的同一原 GET，完整原响应为精确的 404 错误，再使用该请求原 Cookie 查询真实 Native 身份，并独立重读源运行所有者。原响应不替换，五次显式负向读取、隐私与零执行断言保持；新增观察及真实主机回调的定向纯测试通过 49 项，仍待新提交托管浏览器验证。此前 `eb04cbb` 的 F01 21/21 项与十二个浏览器控制案例通过，见[固定测试运行时](PG18_ISOLATED_BROWSER_TEST_RUNTIME.md)。

严格 069 仍阻断正式切换。`4a19edf` 的两路严格任务和 telemetry 均被上述单元测试预检阻断，尚未实际验证 FIFO 的运行效果。最近真实运行的 `eb04cbb` Legacy 在 `finish_registry` 经过 5,040ms，130 次 guard 共 4,580ms；Final14 在同阶段经过 5,013ms，93 次 guard 共 4,545ms，两路均返回心跳不可用。FIFO 保持原单次 5 秒请求期限。本次另独立审查并集成两处严格 JSON 扫描优化，仅替换解析器函数，原 UTF-8 校验、全部即时文件读取、权限、角色、OID、所有者、清理、pool1、八种 Worker 及全部时限保持；16 项纯测试验证与原解析器一致。局部解析收益不能代替原 5 秒 reader、15 秒样本与 45 秒心跳门槛的真实 CI 验证。

此前 Role/Skill、员工管理与质量检查的私有组合通过实际 API 编译，角色／版本保留／Skill A/B 只读预览的组合纯测试 218 项通过；此前当前 SDK 与关联角色测试的运行入口／资源纯测试 97 项通过。后续回调增量经过 12 项上下文纯测试及真实前端编译复核，绑定发起时的 controller、生命周期、员工和选择代次、运行与修订；过期回调保留新状态且不调用旧更新函数。实际完整前端仍有 49 项编译错误：设备相关 36 项、原运行页预算／优化恢复字段 13 项，继续由原并行会话完成，尚未进入主分支候选。Skill A/B 预览明确不可执行；完整执行、其他入口与页面动作、原设备选择器仍未闭合。桌面候选通过 124 项纯测，尚不代表真实 Electron 配对或员工验收。目标环境、备份恢复、长期运行和员工签收仍待完成。

2026-10-23 员工语义设置、独立费用授权、明确索引启动与状态、语义/混合查询界面已接入 SQL035–038。默认免费关键词，付费查询逐次确认；丢包保留原请求并核对回执。界面与验收范围见[员工语义操作](PG18_KNOWLEDGE_SEMANTIC_UI.md)，本轮精确候选的最终结果见[迁移草稿 PR](https://github.com/HG1127/agent-studio_vibex/pull/26)。Agent/Workflow 语义执行、调度协作等功能对齐、真实 UAT、长期 Worker、备份恢复及回滚签收仍待完成，正式切换保持 NO-GO。以下保留此前阶段记录。

2026-10-23 SQL038 已实现读者付费查询、共享语义/混合检索和当前权限回执。读者逐次确认费用，提供商仅接收本人查询文本；已分派请求不自动重放。实现和测试范围见 [查询运行时](PG18_KNOWLEDGE_QUERY_RUNTIME.md)，本轮精确候选的最终验收证据见 [迁移草稿 PR](https://github.com/HG1127/agent-studio_vibex/pull/26)。员工索引/查询界面、Agent/Workflow 语义接入、功能对齐、真实 UAT、长期 Worker、备份恢复和回滚签收仍未完成，正式切换保持 NO-GO。以下为此前阶段记录。

**现状：独立 PostgreSQL 17 的合成数据试迁移链路已通过；公司真实数据与正式生产切换仍为 NO-GO。** 绝不能把历史记录已归档、单元测试通过或 Job 绿灯误写成业务功能完成迁移。禁止直接操作公司宝塔、现存 PocketBase、生产 Worker 或已连接的其他公司数据库。

## 已验证的工程基线

| 领域 | 经过测试的能力 | 不可直接声称完成的部分 |
| --- | --- | --- |
| PostgreSQL 17 | 真正 PG17/pgvector TCP、行级安全 RLS、多个 Worker 领取/恢复、原子事务、schema 重放、隔离服务部署 | 公司生产数据与真实业务负载尚未运行 |
| 备份与恢复 | SQLite WAL 一致性快照与完整的物理用户表 inventory/SHA-256；PG17 合成库备份到新建数据库、逐表记录数与指纹恢复校验 | 企业备份保留策略、实际 RPO/RTO、业务写入冻结与恢复窗口 |
| 身份与 Agent | 独立审核的旧文本 ID→PG UUID、OIDC 主体核对文件；员工默认禁用；Agent 配置、任务准备、模型 Worker、审批与审计分链路测试 | 企业真实 IdP 与员工逐个启用、原密钥轮换、工具外部调用与费用策略 |
| Workflow | 配置图严格兼容子集导入、所有者关联；旧 `workflow_runs`/`workflow_events` 及结构化历史经独立审核后 DBA-only 不可执行归档 | **完整 Workflow 引擎、工具/LLM 节点、暂停/恢复、审批与原语义等价** |
| 知识库 | W2+W6+W16：元数据、文档、分片、向量原始 JSON 与 Embedding 设置/历史队列**同一事务**归档；跨员工隔离、失败整体回滚、快照幂等 | 原向量索引与 Embedding 模型兼容、重建、RAG 引用、共享 ACL 真实可用性 |
| 历史与协作 | Agent runs/events、Workflow runs/events、定时与协作历史在隔离 PG 中不可执行保存，含完整来源与 RLS；已核验和未核验状态区分 | 不把旧 running/queued 变为新任务；团队权限和定时任务须重新验收 |
| 只读对账 | 审核同一快照 SHA、身份映射、关键字段、历史 KB 文本/向量逐行哈希；明确 archive_only、failed 与 unsupported | 所有真实业务域的零差异对账尚未完成，部分运行时功能必然仍是 unsupported |

测试证据（公开仓库，**仅合成数据**）：[W20 统一迁移器及 PG17 全套 CI](https://github.com/HG1127/agent-studio_vibex/actions/runs/38718001907)、[W21 逐行知识库归档对账](https://github.com/HG1127/agent-studio_vibex/actions/runs/38720229239)、[V9 结构化历史及原系统 CI](https://github.com/HG1127/agent-studio_vibex/actions/runs/38832802348)。代码保存在 `migration/postgres-v8-6-staging-20261015` 分支的 [Draft PR #1](https://github.com/HG1127/agent-studio_vibex/pull/1)；**尚未合并 main**。

## 迁移前只读步骤 — 可以继续推进，不需要接触生产 PG

仅运维与安全负责人可在**经批准的隔离机器**上取得 PocketBase 的一致性快照。禁止手动拷贝热写入的 `data.db` 和 WAL，也禁止将 SQLite 备份、个人身份映射、OIDC subjects、密码或模型 Key 上传 GitHub、聊天或通用 CI 工件。

1. 使用 SQLite backup API 生成一份新路径上的冻结备份；执行 `pnpm db:backup verify --backup SNAPSHOT.sqlite`。新的 manifest 必须完整覆盖 sqlite_master 中全部实际用户表，未知非空表一律阻断，不允许随意过滤。
2. 执行 `pnpm db:pg-readiness --snapshot SNAPSHOT.sqlite --manifest SNAPSHOT.sqlite.manifest.json --strict`，取得脱敏的表数、异常类型和业务归属缺口。
3. 基于**相同源 SHA-256**，分别审核旧用户 ID→PG UUID 映射（`studio-approved-identity-map-v2`）、OIDC issuer/subject（`studio-reviewed-oidc-provision-v1`）、历史正文/事件内容的逐行 hash 和独立来源审批。签名真实性、人员实际身份与权限需要安全负责人核验，软件不能自行替代签字。
4. 运行统一的离线预检（**不连接 PostgreSQL**）：

```bash
pnpm db:pg-stage-operator --plan \
  --snapshot SNAPSHOT.sqlite \
  --manifest SNAPSHOT.sqlite.manifest.json \
  --mapping APPROVED_IDENTITY_MAP.json \
  --oidc REVIEWED_OIDC_SUBJECTS.json \
  --approval APPROVED_SOURCE_REVIEW.json
```

只允许来源审核全部通过的配置与历史数据进入试迁移；任何 `preflight_blocked`、未知非空表、身份冲突、原文审核缺失或未映射外键都必须修复后重试。PocketBase 的系统管理表与身份凭证另做独立重建审核，不能默默复制旧密码。

## 隔离 PG17 试迁移 — 当前工程能力具备，**真实数据尚未执行**

- 创建与生产完全隔离、可以销毁的 `agentstudio_stage`，独立授权 DBA，检查 PostgreSQL 17、pgvector、所有版本迁移、force RLS、默认禁用用户与无活跃新旧 Worker。
- 可使用 `deploy/postgres-staging/stage-operator.compose.yaml` 的显式 `stage-operator` profile，仅以只读挂载的方式提供**仓库外**快照、完整 manifest、审批的身份文件及 staging Docker secret。试迁移前应记录快照哈希并另做测试库备份。
- 统一导入顺序：员工身份 → Agent/Workflow 兼容配置 → W2/W6/W16 联合知识库归档 → 调度、协作、旧运行与事件历史 → 只读对账。每一分域单独事务、幂等，**不是整个系统的单个原子事务**；中途失败时隔离 stage 必须恢复/丢弃或使用同一经审核快照严格幂等重试。
- 导入结束后按源文件的 **每张表、每个主键、owner/外键、重要原始字段/内容 hash、审批链、读写权限、不可变归档** 对账。计数一致不等于核对完成；`archive_only_live_unsupported` 不能作为功能验收通过。
- 在完全隔离的合成 PG17 中已演练 `pg_dump`→新建数据库 `pg_restore`→全表指纹一致；实际企业数据的恢复演练和恢复时间应重新测量，禁止将恢复命令指向生产库。

## 生产 GO/NO-GO 的硬性阻断

1. **真实数据证据**：经授权的冻结快照、完整未知表审查、员工身份核验、全表/全行关联及原文无损对账。不合格数据不能通过忽略列、过滤行或复制旧密码解决。
2. **应用功能等价**：Workflow 真正执行/暂停/审批/恢复、Agent 工具安全、知识库重新索引/Embedding/RAG、团队 RBAC、定时任务、审核与跨租户访问，在新运行时针对代表性企业场景完成 UAT；历史归档本身不等于功能迁移。
3. **身份与凭据**：正式 IdP/JWKS 签名、每位员工启用/禁用及归属权限复核；API Key、Token 和外部集成必须独立安全轮换与重新配发。
4. **运行保护**：旧 PocketBase Worker 与新 PG Worker 不能同时认领同一任务；失败或未知外部副作用绝不自动重放；准备冻结写入/停机窗口和监控回退指标。
5. **可恢复性**：操作负责人/安全/DBA 确认备份、恢复、迁移账本、切回旧库的方法、验收时刻、恢复目标 RPO/RTO，并实际演练回滚。
6. **正式签收**：任何关键 `failed`、缺失归属、`unsupported` 或未审核业务域都维持 NO-GO。不得因 GitHub 全绿自动部署、更改 DNS/数据库连接串或关闭旧生产服务。

## 工期口径

可执行的 **隔离合成试迁移** 已完成。距离**真实生产切换**的工作量主要由实际数据内容、凭据/身份/共享权限、运行时功能差异和业务 UAT 决定；目前没有经过批准的真实快照对账数据，无法可信地给出剩余小时数。取得脱敏 inventory 和实际不兼容项清单后，才能按阻断项估算所需工程人日与并行路径。

**最终状态：仅独立 staging 合成试迁移能力通过，生产切换 NO-GO。**

后续模型通道增量：已实现 V2 专用租约身份函数提案、数据库检查点重放、逐节点一次性 Broker 记录，以及独立证书固定的私有 mTLS 适配器。默认关闭，Tool/Agent 在调用前暂停；本地验证只用合成员工和模型响应。真实 PG18 CI、目标主机核验、完整 Workflow 与员工验收仍未完成，完整迁移门禁保持 NO-GO。范围见 [V2 私有模型通道](PG18_WORKFLOW_V2_PRIVATE_MODEL.md)。

后续工具通道增量：五种内置工具与本人 HTTP 连接已接入 V2 专用身份核验、mTLS 和逐节点防重复记录；摘要必须绑定本人模型，HTTP 密钥由独立 Broker 解密，已知参数错误与外部不确定结果分开记录。当前验证只使用合成 SQL 数据及上游响应，完整 Agent、市场 MCP、PG 画布、语义知识库与团队 ACL、正式环境验收仍待完成。详见 [Workflow V2 工具迁移记录](PG18_WORKFLOW_V2_TOOLS.md)，完整门禁仍为 NO-GO。

后续 Workflow Agent 增量：已实现本人方案快照、有界多轮 Model/Tool 状态、逐步员工审批、重启重放与私有子步骤身份核验。真实回环 mTLS 和合成 SQL 已覆盖模型→工具→模型、拒绝/已知失败后的继续、不确定结果停止、Worker 提交故障及知识库范围；新增 Native Cookie/CSRF 子步骤测试。独立 Agent 自主运行、市场 MCP、PG 画布及正式验收仍未完成。详见 [Workflow Agent 节点记录](PG18_WORKFLOW_V2_AGENTS.md)，完整迁移仍为 NO-GO。

2026-10-23 独立 Agent 后端增量：已补本人角色直接入队、多轮 Model/Tool、逐步审批、私有 mTLS 身份及独立历史接口；旧单次运行接口不再读取此类内部检查点。独立专项 10/10、主工作区 345 项检查及 PocketBase 23 项隔离 E2E 通过。员工多轮运行 UI、完整功能等价和正式环境验收仍未完成，门禁维持 10 项阻断、cutover=false。用户已确认旧数据全部为测试数据，可不导入；下文历史快照/逐行对账要求仅在以后另行要求保留数据时适用。详见 [独立 Agent 运行记录](PG18_AUTONOMOUS_AGENT_RUNTIME.md)。

2026-10-23 多轮 Agent 员工界面增量：已接原生本人任务提交、逐步费用/操作确认、进度/结果与安全取消；不确定请求保留原幂等键、步骤哈希和决定，跨页保留、退出/401 时销毁。专项 10/10 包含真实 Cookie/SQL 响应丢失恢复与静态组件转义检查；实际浏览器及真实员工验收尚未执行。最新门禁为 244 个前端文件、38 个 PocketBase 依赖文件、10 项阻断，仍为 NO-GO。详见 [多轮 Agent 员工界面记录](PG18_AUTONOMOUS_AGENT_EMPLOYEE_UI.md)。

2026-10-23 原生 Workflow 画布增量：七类节点、本人资源修订绑定、幂等新建/CAS 保存恢复、撤销重做和独立运行审批界面已接入本地候选。每步费用/操作确认、当前资源核对、安全取消和会话清理继续由服务端校验。浏览器及真实 PG18 的本轮 CI 仅准备源码，尚无执行结果；完整功能等价、员工验收与运维门槛仍未完成。最新只读门禁为 253 个前端文件、38 个 PocketBase 依赖文件、10 项阻断，仍为 NO-GO。详见 [Workflow 画布记录](PG18_WORKFLOW_NATIVE_CANVAS.md)。

2026-10-23 Workflow 作者能力与单模型测试增量：已接会话内片段复制、多选排列、描述/示例、移除访问绑定的 v1/v2 导入导出及共用运行规则的节点预览。真实单模型测试由服务端从本人保存节点与样本构造，通过原有 V2 队列、逐步费用确认和私有 mTLS 执行，固定 512 输出 token；样本指纹、不确定请求恢复和未知结果不重发均保留。浏览器与实际 PG18 的新 CI 只准备源码，尚无本轮执行结果。主工作区只读门禁为 259 个前端文件、38 个 PocketBase 依赖文件、10 项阻断，仍为 NO-GO。详见 [作者能力与节点测试记录](PG18_WORKFLOW_AUTHORING_AND_NODE_DEBUG.md)。

2026-10-23 Workflow 历史输出与样本复用增量：已接本人只读节点结果、循环各轮分页、输出版本一致性检查及画布中明确勾选的历史样本复用；跨工作流、类型变化、未执行结果和单模型测试虚拟节点均不作为样本。接口只重建主工作流业务输出，不返回原始步骤元数据或 Agent 内部规划，也不新增任务或效果记录。浏览器与实际 PG18 的扩展 CI 尚未执行；主工作区只读门禁为 263 个前端文件、38 个 PocketBase 依赖文件、10 项阻断，仍为 NO-GO。详见 [历史输出与样本记录](PG18_WORKFLOW_OUTPUTS_AND_SAMPLES.md)。

2026-10-23 Agent 自定义 HTTP 工具增量：在 b05fcb8 之后接通工作流 Agent 节点及独立多轮 Agent 的自有连接声明、版本冻结、逐步审批和私有 Broker 调用；12 项合成数据专项测试通过。编辑目标、模型和知识库会保留 HTTP 声明，旧单次 Agent 队列拒绝不支持的声明。真实 PG TCP/浏览器新增用例尚未运行；MCP/Smithery、共享/语义知识、调度/协作及运维/UAT 签收仍待完成。候选仅本地，正式切换仍为 NO-GO。

2026-10-23 MCP 连接与发现增量：在 2b29492 之后新增提案迁移 029、Native Cookie 配置接口和员工界面；只读工具发现支持新旧 Streamable HTTP、JSON/SSE、独立授权、加密请求头及所有者隔离。13 项合成数据专项测试通过，详细回归证据见 PG18_MCP_CONNECTIONS_AND_DISCOVERY.md。Agent/Workflow MCP 执行、Smithery 托管流程与其他功能/运维验收仍未完成，新增真实 PG18/浏览器用例尚未运行。候选仅本地，生产切换仍为 NO-GO。

2026-10-23 MCP 执行增量：在 97b0160 之后新增提案迁移 030、三条工作流/Agent MCP 执行路径及员工绑定/审批界面。绑定固定本人连接版本、目录哈希与具体工具；默认关闭独立授权，执行前校验参数并逐步审批，断线或响应不确定时暂停且不重发。17 项合成数据专项测试通过，详见 PG18_MCP_EXECUTION.md。新增托管 PG18/浏览器用例尚未运行，Smithery、其他功能及运维/UAT/恢复回滚签收仍未完成，生产仍为 NO-GO。

2026-10-23 Smithery 托管接入增量：在 a82644d 之后新增提案迁移 031、Native Cookie 接口及员工面板，支持本人加密 Key、目录/工作空间读取、稳定编号连接、授权链接、刷新及远端撤销。密钥轮换/移除使旧 MCP 绑定失效，撤销先停用本地，未知结果由显式读取核对；独立管理授权不包含工具发现或执行。详见 PG18_SMITHERY_MANAGED_CONNECTIONS.md。新增托管 PG18/浏览器及真实供应商 OAuth 验收尚未完成，其他功能、运维/UAT/恢复回滚签收仍待完成，生产仍为 NO-GO。

2026-10-23 凭据边界加固：在 434502a 之后，通用 API/私有派发/Worker 预检会独立于功能开关审计已安装的 MCP、Smithery 表，发现列权限、额外角色与强制 RLS 漂移；修复 MCP 目录重排后的别名冲突，并补齐离线审阅包依赖与实际导入解析。专项及打包验证见 PG18_OPTIONAL_CREDENTIAL_BOUNDARY.md。没有上传或连接真实数据库，完整功能、真实 PG18/UAT、运维及恢复回滚签收仍待完成，生产仍为 NO-GO。

2026-10-23 知识共享权限基础：在 af5561f 后新增提案迁移 032、按员工的查看/编辑权限、独立语义许可、版本冲突保护、审计与重试回执，以及独立认证池中的精确接收人查询。本增量未启用共享 API/界面，文档与向量仍保持私有；共享检索、Agent/Workflow 接入、语义索引和其余功能/UAT/运维签收仍待完成。验证见 PG18_KNOWLEDGE_ACCESS_FOUNDATION.md，正式切换仍为 NO-GO。

2026-10-23 员工共享知识库内容增量：在 63c9c3f 后新增提案迁移 033、独立默认关闭授权、查看/编辑/撤销与恢复、有限关键词检索、TXT/Markdown/CSV/TSV/JSON/HTML 与隔离 PDF/DOCX 入库、按文档哈希删除及断线回执恢复。纯文本容量补到 16 万字符；元数据角色与内容角色分离且不能读取凭据、向量或存储路径。专项与回归见 PG18_SHARED_KNOWLEDGE_EMPLOYEE_UI.md。共享 Agent/Workflow/语义、其余功能及真实 PG18/浏览器/UAT/运维/恢复回滚签收仍未完成，生产仍为 NO-GO。


### Shared knowledge runtime candidate — 2026-10-23

Proposed SQL034 connects current-grant Agent/Workflow binding and bounded keyword evidence. Trusted pool configuration remains default-off; active services require readonly schema preflight, per-step execution approvals and the reader's own model. A fresh grant check after credential loading prevents new paid execution on revoke. Employee binding forms expose removable unavailable refs; Unicode snippets use codepoint bounds. Eight dedicated synthetic SQL/mTLS/UI checks passed. Main pnpm check passed 484/484 and isolated PocketBase E2E 23/23. The candidate passed frontend/API types, ordinary and PG-only builds, PocketBase E2E 19/19, Worker package checks 9/9 and Python checks 22/22; its native API review has 67 verified source files. Its full local unit process failed on an MCP file process exit and an old archive subprocess result; independent reruns passed 5/5 and 1/1. The exact uploaded head must pass full hosted quality, PG18 TCP and browser checks before acceptance; inspect that head’s CI rather than treating isolated reruns as a full-suite pass. See PG18_SHARED_KNOWLEDGE_RUNTIME.md. Semantic/search dimension parity, scheduling/collaboration and operational/UAT/restore/rollback signoff remain open; production cutover stays NO-GO.


### Native embedding settings state — 2026-10-23

The Unicode wire follow-up at 8b0e6f9 passed exact-head hosted quality (390), PG18 TCP and employee browser (4/4), with main full check 492/PocketBase 23 and candidate 390/19. New SQL035 and native Cookie APIs prepare owner profile settings, exact CAS/receipts, variable 2..3072-dimensional storage and incremental queues. Six new SQL/HTTP checks plus shared runtime/config/Worker regression passed 29/29; Worker review packages passed 9/9 and Python checks 22/22 locally. The final candidate passed full local check 396/396, PocketBase E2E 19/19, frontend/API types and ordinary/PG-only builds, Worker package checks 9/9 and Python 22/22; its API source review has 71 files with verified manifest, offline plan and default refusal. The earlier main check was intentionally interrupted to repair lock order and is retained separately; fresh main and exact uploaded-head hosted verification must be read before acceptance. The real PG18 suite includes a required handshake that configure/import wait on the same owner lock and validates the resulting queue epoch; its hosted result remains pending. It does not implement paid embedding dispatch, an index Worker, semantic/hybrid querying or employee semantic UI yet. See PG18_KNOWLEDGE_EMBEDDING_STATE.md; full semantic/runtime integration, remaining parity and operational/UAT/restore/rollback signoff remain open. Production cutover stays NO-GO.
