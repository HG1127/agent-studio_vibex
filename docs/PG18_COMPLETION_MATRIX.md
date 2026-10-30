# PostgreSQL 迁移前完成清单

## 2026-10-30 用户明确修正的交付策略（优先于下方历史记录）

用户目标：**保留现有界面，只更换底层数据库与后端。**

- 最终员工入口以现有 `src/main.tsx -> src/App.tsx` 为基准，复用当前页面、路由、导航、布局、组件与交互。允许为新后端修改认证、API 客户端、业务 Hook、数据格式及状态/错误映射；不把界面重做列为迁移目标。
- 已实现的 PostgreSQL API、权限、Worker、知识检索和执行安全继续复用。`pg18-app -> PgNativePilotPage` 及相关面板保留为隔离验证/参考工具，不作为原员工界面的默认替代品，也不据此认定原页面迁移验收完成。
- 下一阶段先逐页列出“原页面/实际操作 → 当前请求契约 → PG 接口/适配 → 缺口 → 原页面验收证据”，从登录及一个原有核心业务闭环接通，再按原菜单补齐；已实现的后端能力不重复开发。
- 下方 Native 界面与隔离测试记录属于已有资产和历史证据，不能直接等同于本次目标已交付。后续进度按原页面真实闭环报告，不以新增面板或测试数量代替。
- 保留既有工作及其他会话修改；不扩展无关新能力。正式切换仍需真实员工 UAT、权限、长期 Worker、备份恢复及回滚签收。本澄清不授权部署、切库、收费调用或 Git 上传。


## 原员工页面适配准备（2026-10-30，原页面验收待执行）

当前页面对照表为 [PG18_ORIGINAL_UI_API_MAP.json](PG18_ORIGINAL_UI_API_MAP.json)，覆盖原有20页、30组操作；页面数量不是验收完成量。最终入口继续使用原 `index.html -> main.tsx -> App.tsx`。首页、目录、草稿、登录及账户菜单已有PG适配源码；未适配的旧后端请求会被明确拒绝并计入浏览器验收失败。

本地允许范围内的纯回归745项全部通过；本批模型owner/Native协议26项及当前针对性104项检查通过。新首页适配的前端TypeScript6、API TypeScript5及两种各101资源实际构建通过，普通构建PG资源匹配为0。没有运行本地SQL、浏览器、业务Worker或完整`pnpm check`。源码/纯回归/构建不能替代真实原页验收。

已合流原团队共享页的业务Hook，保留原JSX、导航、布局和PB分支；写入及确认固定发送发起时员工ID，服务端先验证实际Cookie和owner，再在任何台账写入前比较。焦点恢复会先验证Cookie，即使旧读取或写回仍未返回也隔离旧账号。独立原页host/E2E复用fresh F08，包含创建、兑换、撤销、真实写后断线与原回执恢复、换账号迟到响应；Native代理保持8秒，全部PB/网络/身份及收费调用零门禁保留，安全成功截图仅写合成CI私有artifact。原页故事仍待执行。

原个人总览`/internal-overview`保留布局、筛选及刷新，新增本人八项真实计数、待办与近期Agent/Workflow运行读取；以实际Cookie和事务内owner核对预期员工，迟到响应不得进入新账号。历史标题未落库时明确显示未记录，不把当前资源名冒充历史标题；原main Worker健康状态缺少等价来源，明确显示未知。这些语义缺口仍未关闭。独立host/E2E源码已合流，保持原AdminGate，通过真实员工管理API授予合成Bob管理员身份后，分别核对两人本人数据、完成的真实迟到响应、实际依赖撤销503/恢复及Cookie Bob/expected Alice409。每个matrix leg使用独立fresh PG18，保留8秒Native与全部零门禁；固定两张安全PNG仅在全故事、业务行快照及清理检查通过后保存。16项纯策略通过，真实原页验收仍待执行。

可选070/071提供作者元数据、本人目录分页搜索收藏及真实owner资源数量；072提供严格审计后的共享知识统计。`53fd7f8`的[070/071/072真实复验](https://github.com/HG1127/agent-studio_vibex/actions/runs/41028235290)已通过57个编号场景；其[遥测控制/Writer](https://github.com/HG1127/agent-studio_vibex/actions/runs/41028234927/job/123971512774)通过28+26场景与清理，但此前file_changed未复现，原因仍未定。

最近已上传`1df512a`的[070/071/072复验](https://github.com/HG1127/agent-studio_vibex/actions/runs/41044735632)再次通过；[F08真实流程](https://github.com/HG1127/agent-studio_vibex/actions/runs/41044735607/job/124025955111)15个测试节点通过，含六个Cookie Bob/expected Alice写入及确认拒绝、全量计数未变化；[原PocketBase19项双Worker回归](https://github.com/HG1127/agent-studio_vibex/actions/runs/41045033368/job/124026922004)19/19通过，73.6秒；[质量工作流](https://github.com/HG1127/agent-studio_vibex/actions/runs/41044735586)50作业通过，包含必需`pnpm check`及安全/Worker检查。这些结果只属于该精确提交，不能转用于当前未封存的新源码。

可选073仅为隔离历史监控元数据、本人分页及已读回执。`1df512a`的[真实073 TCP](https://github.com/HG1127/agent-studio_vibex/actions/runs/41044735632/job/124025955883)、原登录及原Home故事在严格约束审计失败，未进入业务步骤。后续修复按PG18 CHECK表达式首次引用次序保留精确conkey，纠正reads_valid_ck的[4,3]预期，SQL与ACL不变；新增反序/遗漏/重复及约束属性篡改拒绝回归，仍须实际复验。来源ACL、实时采集、事件生成和复核/基线属于另行074工作，完整监控验收为0。

完整069已越过旧记录路径语法错误；[1df512a真实短CLI](https://github.com/HG1127/agent-studio_vibex/actions/runs/41044735639/job/124025955499)在8项准备、Review预检、原Control/HBA后拒绝owned_process_changed；[final14](https://github.com/HG1127/agent-studio_vibex/actions/runs/41044735639/job/124025955714)在独立受保护打包阶段拒绝，尚未执行12个真实ACL修改/回滚负例。两个失败均保留，未取得运行资格。该阶段完整ACL比较仍核对OID/owner/grantor/可转授和PUBLIC默认权限，参见[PG18默认权限](https://www.postgresql.org/docs/18/ddl-priv.html)；Reader5秒、Native8秒、Worker30秒加发送5秒、UID128、四空队列及实际后端清理要求不变。

后续源码已统一final14生成端/消费端的11项固定必需文件，遗漏、别名或字节冲突仍拒绝；17项针对性纯回归通过。短CLI失败仅新增原受保护记录的布尔字段和固定entry投影，读取/解析/输出失败仍保留原错误，不输出路径、PID或凭据，也不改变身份谓词。具体失败entry与原因、final14运行及ACL负例仍须真实复验。

尚缺首页自然语言生成/修改的完整原页验收及未保存草稿/多模型/持久关联缺口、普通删除、部分质量/能力及运行页动作、其余原菜单适配、完整监控与Worker同提交运行验证。真实宝塔目标环境、正式安装、备份恢复/回滚、长期运行和员工签收尚未完成。原完整页面验收0、合格24小时0、员工签收0，正式切换 **NO-GO**；旧PocketBase保留可恢复。

`e002475`的真实073已通过结构/约束审计，随后TCP及原Login/Home在合成种子的`sha256`列检查失败。修复后的两个实际种子入口只接受已审计五表及完整列清单，值仍参数化；11项纯策略回归覆盖两个实际构造器的93行计划，SQL/ACL/业务审计不变。原团队共享故事则因host遗漏传入浏览器模式而在旧F08门禁拒绝；现显式传入`browserMode:true`，保留真实job、原guard和全部零门禁，并补实际纯admission前缀的正反调用验证。这两项均仍待真实复验，原页验收0。

完整069的`e002475`已越过受保护打包冲突，完成Executor LOGIN/预检、Review8和Plan9；final14随后在`runtime_open`以依赖错误拒绝，实际ACL负例尚未执行。legacy受限诊断确认未取得warm/last观察，清理后真实遥测后端及Reader为0、四个业务队列为空；停止结果不能区分提前退出与身份比较失败，原因仍待定位，未放宽任何原进程谓词。

另经[PG18 initdb官方源码](https://github.com/postgres/postgres/blob/REL_18_STABLE/src/bin/initdb/initdb.c#L1939)核对，两个模板库的PUBLIC CREATE/TEMPORARY会被撤销；[新库创建实现](https://github.com/postgres/postgres/blob/REL_18_STABLE/src/backend/commands/dbcommands.c#L1395)不复制模板数据库ACL。因此本轮纠正旧比较器的模板预期为完整51行，而不是要求不存在的两个TEMPORARY授权；postgres与业务库原默认权限保留，全部实际行仍参与精确比较/哈希。新增给两个模板额外TEMP的真实拒绝用例（合计13个），必须实际修改、检测并回滚；没有为通过检查修改数据库权限。55项针对性纯目录回归通过，真实同提交运行继续待验。

`9b42e39`批前端/共享及API TypeScript源码没有变化，复用`e002475`前后端类型检查和两种各100资源的实际构建基线；这不是新原页面验收。当前正式切换仍 **NO-GO**。

后续启动诊断源码现已合流：final14仅记录实际抛出对象关联的固定阶段/服务键，保留原错误对象及真实审计顺序；只在原exact CI绑定、UID、argv、Node及批准门禁内输出。legacy仅记录实际私有ChildProcess退出/信号、封闭服务错误枚举和内核身份谓词的布尔分量，在清理前捕获、通过原受保护记录读取后投影。诊断IPC使用独立回调处理异步发送错误，不改变关键IPC或原退出结果。新增阶段观察5项、原路径25项及进程观察20项纯回归通过；API类型检查再次通过，实际进程原因和新同提交复验仍待完成。上述观察不构成运行许可、健康证明、重试权限或迁移通过。

`9b42e39`的[原Login/App故事](https://github.com/HG1127/agent-studio_vibex/actions/runs/41052629732/job/124052190715)、[原Home监控元数据/已读故事](https://github.com/HG1127/agent-studio_vibex/actions/runs/41052629732/job/124052191084)及[073真实TCP](https://github.com/HG1127/agent-studio_vibex/actions/runs/41052629732/job/124052191155)已通过。下载的观察记录和安全截图已核对：真实Alice/Bob身份与管理员差异、登录/退出断线恢复、账号切换均保留；Alice未读14→13且回执0→1，Bob未读3及回执0不变。两故事全部PB/意外API/外部网络/伪身份头/收费调用及清理失败计数均为0；业务运行台账不变。这只验证原认证故事和历史监控收件箱，不是完整Home、实时监控、原20页或员工UAT验收。

同提交[原团队共享故事](https://github.com/HG1127/agent-studio_vibex/actions/runs/41052629622/job/124052190318)已到达真实创建、Bob兑换独立无绑定副本、外owner拒绝、撤销及写后断线；六个Bob Cookie/expected Alice负例保持台账不变。随后测试误要求结果未知时的确认按钮仍在DOM中禁用，实际原页已清除预览并隐藏该按钮。后续仅修正测试为按钮不存在、预览和兑换入口均禁用；保留全量回执/原意图刷新/账号切换及全部零门禁。完整故事仍失败，刷新恢复和迟到响应后续步骤须重跑。

`9b42e39`的[legacy完整运行](https://github.com/HG1127/agent-studio_vibex/actions/runs/41052629596/job/124052190890)确认五个业务Worker在就绪前自行exit1，非清理触发；Native、knowledge、assessment在清理前的全部内核身份谓词通过。根因仍待沿原启动审计定位。其[final14](https://github.com/HG1127/agent-studio_vibex/actions/runs/41052629596/job/124052190548)已越过runtime_open，到runtime_preflight/数据库权限负例前段失败，尚无13负例通过证据。正式切换仍 **NO-GO**。

后续仅为实际权限负例新增固定阶段、既有负例名与五字符SQLSTATE诊断，仍以原抛出对象关联观察并原样重抛；没有输出错误正文、SQL、路径或凭据。既有13个真实修改/回滚负例、8秒预算、精确全量ACL比较、Opaque trust及原CI输出门禁不变。新增3项纯安全回归通过；实际失败原因和完整13负例仍待新同提交运行。

`9b42e39`的[质量工作流](https://github.com/HG1127/agent-studio_vibex/actions/runs/41052629710)为49/50作业通过；根必需检查3631项中3628通过、3项失败，原因均为Native源码包拒绝遗漏的`shared/original-internal-overview-contract.ts`。现仅将该精确契约加入既有明确清单，任意shared路径仍拒绝。用实际源码收集函数完成350个文件的组合入口依赖遍历，未执行模块、生成交付包或启动服务；实际三项打包和完整质量须同提交复验。[同提交原PocketBase19项双Worker](https://github.com/HG1127/agent-studio_vibex/actions/runs/41053973662/job/124056725296)通过。

共享原页在`02597d0`[重跑](https://github.com/HG1127/agent-studio_vibex/actions/runs/41054656457/job/124059025969)越过按钮断言后，未知结果步骤收到意外503，实际回执4而预期5，受控写后断线计数为0；这是新失败，不能算已提交丢ACK。原预期回执5及最终7、意外API零门禁保持不变，根因待继续定位；该故事仍未通过。

后续首页窄适配源码已合流，继续使用原生成/修订控件：F01只读预览后明确确认，未知结果仅查询原请求，按实际Cookie和编辑版本隔离迟到结果；实际完成结果先保存到本人本标签恢复草稿，再标记已应用。模型工具名称只保留为描述建议，须明确选择才成为执行绑定；手动保存继续使用070/071。F01 submit/confirm/control/save增加预期员工并发条件，实际Cookie/withActor仍是身份来源。未保存/脏草稿修订、多模型选择及F01请求到手动保存的持久关联未完成；原Home生成故事仍待独立host/真实浏览器验证。

五个原Worker入口仅增加实际启动阶段和白名单SQLSTATE/Node码诊断，配置、凭据、原审计顺序、退出结果、IPC保护及原预算保留。原同提交启动失败原因仍须下一次实际CI定位。`1b33ff3`的final14再次在runtime_open失败；父进程误把诊断事件名当成主错误且未转发该诊断，本批修正为只选择独立主错误行、单独解析固定形状观察。新增回归验证事件/正文不能覆盖主错误，未知字段/秘密/授权标志及重复观察不予转发；原进程监督和清理保持。

`1b33ff3`的[原个人总览首次故事](https://github.com/HG1127/agent-studio_vibex/actions/runs/41057326210/job/124068033154)已到真实依赖撤销503，随后测试读取已取消的浏览器响应体失败；后续恢复/换账号未执行，未保存成功截图，仍为失败。同提交[原Login、Home历史监控及070/071/072、F01流程](https://github.com/HG1127/agent-studio_vibex/actions/runs/41057326210)其余9作业通过；这些结果不用于新首页适配或完整监控验收。

总览测试现仅对明确预期且实际来自上游的本人503，在4096字节内核对完整固定错误正文，完成后才消耗一次预期失败。原状态、过滤后的头及字节原样转发；错误正文、超量、中断、代理自造503或员工不符仍失败，8秒Native不变。原页面未知状态/恢复、409、账号迟到围栏、全业务行镜像、收费/PB/网络零门禁及成功后才保存图片条件保留；25项纯策略通过，实际故事待复验。

`807c166`的[完整质量工作流](https://github.com/HG1127/agent-studio_vibex/actions/runs/41061079515)50/50通过，根必需检查3718/3718通过；[原PocketBase双Worker回归](https://github.com/HG1127/agent-studio_vibex/actions/runs/41061276891/job/124081354372)19/19通过。[F01真实流程](https://github.com/HG1127/agent-studio_vibex/actions/runs/41061079507/job/124080668689)18个节点通过，含六个实际Cookie Bob/expected Alice写入及确认拒绝。这些同提交证据不能作为本批新候选的验收。

同提交[五个原Worker](https://github.com/HG1127/agent-studio_vibex/actions/runs/41061079622/job/124080669456)均在`worker_import`以`ENOENT`退出，尚未就绪且未收到停止请求。已定位部署清单遗漏原执行模块读取的七个SQL003–009，现补入精确资源清单并在部署封存后核对存在性、属性及SHA256；原438个源码输入和53个安装SQL输入保留。8项离线打包回归复现五个缺失首次读取并验证补齐字节，未执行SQL或导入Worker；真实启动仍待复验。[final14](https://github.com/HG1127/agent-studio_vibex/actions/runs/41061079622/job/124080668966)主错误现正确保留，实际观察为`service_target/plan_workflow_dispatch`，根因尚未确定。后续仅增加目标核对后的独立稳定性阶段及三个闭合错误分类，保留原错误、14池并发、全部审计和预算。

原Home独立浏览器故事源码已接入F01矩阵，要求原页面真实生成、写入后丢回复、刷新查询原意图、070/071手动保存、干净来源修订/CAS及忙碌中真实换账号迟到围栏。19项host策略通过，完整清理后重查全部零门禁；仅成功后保存固定安全图片，观察文件上限1MiB。旧`authoring:null`修订后手动保存另有两个最小产品补丁及15项纯回归，保留描述重复项和全部绑定/审批；普通更新不伪造旧来源，不声称F01到手动保存的服务器关联。该旧记录分支尚未获得真实浏览器验收，多模型与未保存/脏草稿修订仍未完成。

`807c166`[原总览](https://github.com/HG1127/agent-studio_vibex/actions/runs/41061079507/job/124080668405)已越过真实503恢复、实际完整迟到回复及账号切换，随后Node测试请求未信任合成证书而失败。现改为已验证证书的真实浏览器同源fetch，保留实际Cookie和8秒预算，不关闭TLS校验；27项纯策略通过，409、最终业务镜像、零门禁和成功图片须重跑。[原分享](https://github.com/HG1127/agent-studio_vibex/actions/runs/41061079466/job/124080668583)仍在未知结果步骤收到意外POST503，回执4而预期5、受控断线0。新增固定代理来源/Node码与实际业务完成/200销毁计数以定位下一次失败，预期5/最终7及8秒不变；仍未通过。

`aa475fc`的[质量工作流](https://github.com/HG1127/agent-studio_vibex/actions/runs/41066764981)50/50通过，根必需检查3776/3776；[原PB双Worker](https://github.com/HG1127/agent-studio_vibex/actions/runs/41067206593/job/124101637908)19/19通过。[原总览完整故事](https://github.com/HG1127/agent-studio_vibex/actions/runs/41066764791/job/124100071994)首次通过，已核对实际观察和两张安全截图：真实503/恢复、真实Cookie换账号与迟到回复围栏、预期员工409、全业务行镜像及基础台账不变、全部PB/意外请求/外部调用/清理零门禁均通过。这不补齐历史标题、Worker健康或链接目标页，完整原20页和员工UAT仍为0。

同提交[Home生成故事](https://github.com/HG1127/agent-studio_vibex/actions/runs/41066764791/job/124100071423)已完成真实生成与已提交丢回复后的原意图恢复，并通过实际手动创建字段检查，随后测试误要求INSERT有045 edited历史而失败。045冻结触发器只在UPDATE记录前后历史。后续测试改为创建必须有实际本人070创建审计且无编辑历史；修订必须有本人更新审计及对应text bigint revision/描述历史，原最终history+2保留。21项host纯检查通过，整体真实Home仍待重跑。

[legacy完整069](https://github.com/HG1127/agent-studio_vibex/actions/runs/41066764741/job/124100070819)未再观察到先前五个ENOENT退出，其清理前内核身份谓词全真；评审Worker内核不可读，尚无已送达的退出观察，整体仍失败。遥测后端/Reader清理为0且四队列为空。后续仅在原停止等待后增加独立退出数据，保留清理前失败、全部进程谓词及原停止/超时，不将停止结果写成健康。[final14](https://github.com/HG1127/agent-studio_vibex/actions/runs/41066764741/job/124100071352)本次越过runtime_open，随后ACL负例准备再次领取原operator runtime而被一次领取保护拒绝。现复用同一opaque runtime及相同trust中的真实原能力，继续经原load/assert；没有接受caller Pool或改原loader、13负例、权限、8秒预算，真实负例仍待验。

[原分享](https://github.com/HG1127/agent-studio_vibex/actions/runs/41066764971/job/124100072244)的新观察收窄为代理ECONNRESET、尚无上游HTTP状态、业务后回调未完成、实际丢回复未完成，仍是失败。已发现断线注入原先按共享POST路由选择请求，可能消耗稍迟到的只读preview。现仅同一请求实际create完成后才消耗注入，preview原样转发并保留待触发状态；用真实解析回调复现先preview后create的顺序。原回执5/最终7、8秒及所有零门禁保持，实际根因和故事重跑继续待验。

模型连接严格后端源码已合流：实际Cookie/事务内owner后核对可选员工并发条件；原页DELETE闭合revision并在同事务锁定核对；配置创建/更新/启停/删除写本人安全审计，审计失败回滚。Native只根据HTTP实际使用的同一个repository自有协议标记宣传新合同；配置写和provider probe仍独立开关。26项纯检查、API TS5通过；原页面client/host另批准备，未知写入精确回执、保存前probe及大账户分页未实现。本批src/shared前端源码与aa未变，复用其TS6和各101资源实际构建基线，不能据此称原ModelConnections已验收。SQL、权限、旧PB与生产状态未变，正式切换继续NO-GO。

以下为历史准备与隔离组件证据，不能转用于上述新候选。

更新：2026-10-29。现有 PocketBase 仍是当前运行环境，正式切换 **NO-GO**。
旧数据已由使用者确认为测试数据，可以采用全新初始化；这不免除功能对照、
员工验收、备份恢复、运行环境及回滚签收。

本表按员工操作和后台执行语义记录进度。PocketBase 路由数量、SQL 表数量、
历史导入脚本或通过的 CI 项目数量均不能换算成迁移完成百分比。
本表仍须随着逐项源代码核查继续补全，不是“其余项目均已验收”的声明。

## 当前准备状态（2026-10-29）

最新功能源码核对见[可达功能基线](PG18_FEATURE_BASELINE_20261029.json)：覆盖19条业务路由、31组能力。它记录工作树源码与页面操作的对应关系，不代表浏览器执行、功能等价或正式验收。13组已有Native实现，应继续复用和验证；12组仍有具体既有功能缺口；5组D工作树新增能力须核对来源与保留范围，不能仅因尚未提交就删掉或忽略。另1组不属于已确立的活动功能基线。

12组缺口分别是自然语言创建/修改角色、方案转工作流、模板中心、单次内部模板分享、调用钥匙/本人试调用、嵌入与公开授权运行、公共MCP目录详情、独立内置/HTTP工具试调、MCP独立试调及日志、跨任务工具统计/Harness、当前单步骤委托审批、同一Agent任务暂停/恢复。编号、实际旧页面回调、Native对应实现与后续动作均在基线中保留。已实现的付费评审、生成描述接受、公司管理员概览等不再作为“完全未实现”的功能重做；尚未覆盖的来源类型、保留范围和运维验收仍需单独核对。

公司管理员概览的最近整轮组件验收基线为`a19fcc371963caa785948949355e30e386c8db88`，见[PR28](https://github.com/HG1127/agent-studio_vibex/pull/28)：七类隔离检查67作业成功，根1,330项、主浏览器23项、同提交PocketBase19项/双worker、三张最终公司页面图和交付源码核对完成。这证明该组件的隔离结果，不证明其余功能或正式迁移完成。

后续Worker遥测组件在已上传提交`f63c98bcdac34a5113fa8e751265329024755644`通过四类自动隔离检查61作业：[质量50作业/根1,784项](https://github.com/HG1127/agent-studio_vibex/actions/runs/40735145765)、[九作业/284个真实TCP子场景](https://github.com/HG1127/agent-studio_vibex/actions/runs/40735145950)、[原可选059工具](https://github.com/HG1127/agent-studio_vibex/actions/runs/40735145755)及[控制器20个真实场景](https://github.com/HG1127/agent-studio_vibex/actions/runs/40735146039)。控制器覆盖关闭启动、真实管理员身份、签名启用、快照、轮换、租约/容量、停用、实际COMMIT确认丢失后的只读核实和新签名恢复；轮换用例证明轮换后旧快照被拒绝，尚未单独区分epoch变化与自然到期的因果作用。原5秒读取租约和8秒Native读取预算未放宽。

受保护HTTP接口已形成后续本地提交`b8562599370cb8ec51961e439fbb814e64053444`：默认关闭、固定GET、一个共享真实authPool/Facade、管理员配置提示。17项定向纯测试及实际API5.9.3/根6.0.3窄依赖图类型检查通过；该提交在本节记录时尚未上传，新HTTP真正例与实际Worker发送链仍在并行集成，不能计入上面的f63证据。Worker接入须具有真实启动身份、当前发布generation和未知确认后的停止边界，配置提示或ACK不代表Worker已就绪。

后续本地`73d9f489356256211a464bc9955d42a2c9f2c6fc`已接通严格SDK、员工/API作用域会话和管理员页面：相关60项纯测试/静态渲染及实际H双编译器窄图通过；新模块另通过开启未检查索引保护的根编译器检查。到期、隐藏、退出、换账号、权限变化、错误和迟到响应均清除旧展示。新增浏览器故事仅用合成遥测响应检查界面，不能证明真实Worker、H3或数据库权限；独立真实HTTP夹具已扩至28个待运行场景，原20个测试主体未改。迟到清理负例用同一真实池的固定1秒持有和精确自有丢包规则建立可观测窗口，生产超时不变；错过窗口属于夹具未建立，不能归因为生产缺陷。这些后续脚本的托管结果仍待核对。

`ops/pg18-fresh-cutover-gate.mjs`现为只读源码清单：旧PB引用只作为文本线索，14项外部/最终验收条件标为未评估，固定拒绝切换。它不连接数据库、读取现场验收或接受环境变量中的GO声明，也不把所有源码引用消失当成功能完成。最终候选仍须完成完整初始化范围/权限与交付闭包、同提交整体验证、真实目标、员工UAT、至少24小时Worker运行、备份恢复/完整旧入口回滚和明确签收。默认fresh050及原SQL001–061保留；遥测是独立`telemetry_v1`域。

后文按原提交保留历史记录；其中“最新”“当前”“待完成”描述的是相应历史阶段，后续状态以本节及其精确提交证据为准。

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

2026-10-27的历史完整隔离基线为提交`bfe9c0a63763f45339a66972b1ee262ee4db0a57`。

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
| ACTIVE-PARITY-03 · 公司运营总览及本人跨任务待办 | 本人概览/待办及原任务导航在0f7c94a通过五类同提交门禁、真实PG18 9/9、浏览器21/21与PB19；管理员公司聚合处于独立草稿，真实Worker遥测仍未完成。公司视图仅允许当前管理员读取最少统计，不暴露同事prompt/output，不臆造存活状态。 |
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


### 2026-10-28：个人概览、待办与原任务打开验证

CT01/CT02 的当前员工概览、待办和原任务打开入口已落在实际 Native 服务和页面中。统计独立于最近 12 条预览；完整数量、字面量名称筛选、查询绑定微秒游标及真实 Cookie/owner/RLS 隔离通过独立 PG18 验证。现有 Agent、Workflow 和计划任务仅恢复到实际原入口，读取不授予配置写入、执行或额外收费权限。未知请求保留原参数；员工/API 切换销毁私有状态。

验证依据按原提交保留：`e653299` 全部 50 个质量任务成功，包含 1,135 项根测试、根项目 TypeScript 6.0.3、构建及其后的集成检查；7 个真实 PG18 任务成功，个人操作实际 9/9，可信 059 操作工具实际 12/12，原工具生命周期通过；同提交 PocketBase 19/19（两 worker，77.3 秒）。`f9df65e` 的完整浏览器运行 40543774788 四任务成功，主任务 21/21；包含实际概览返回原任务、计划超期首次挂载、员工迟到响应隔离及 Workflow 来源失效，全部既有断言保留。

此前前端定向检查误用了服务端 5.9.3，未发现两处根项目 6.0.3 类型错误；该问题已修复，并以实际根编译器及托管全量构建作为依据。后两轮诊断仅修测试生命周期与故事顺序：先完成延迟响应再注销拦截器；先验证健康原任务，再故意破坏来源并验证拒绝。产品的版本/来源门禁没有放宽。

最终集成要求：相同候选提交的质量、真实 PG18、四组浏览器、原 CLI、可信 059 工具全部成功，并完成同提交 PocketBase 19 项回归、截图及审阅包源字节核对。逐项结果和精确 head 由独立检查点及 GitHub 检查记录确认；此要求不等于正式切换许可。

ACTIVE-PARITY-03 仍包含未完成的管理员聚合和真实 Worker 心跳。部分/先前评价来源、复测凭据及其他已列明的活动 PB 功能继续迁移；独立 PR27 的可选 060 基础正在另线验证，尚未挂入 Native。原 SQL001–059 和默认 fresh050 保持不变。实际目标、员工 UAT、备份恢复、网络/权限及长时间 Worker 验收仍是正式迁移条件。

### 2026-10-28：S1 模型提供字段的 Native 接受候选

未挂载基础7437155已通过质量50/50（根1,135项、类型与构建）、独立真实PG18的18/18组及可信059工具实际12/12。角色执行模型A与评审模型B分别核对；原组合失效及7种独立A失效状态均由真实数据库验证拒绝，整个业务快照不变。历史原请求恢复先于新的配置写入开关，045/055/058/059和默认fresh050原字节保留。PB19在0f7c94a实际19/19、两worker78.2秒，本基础相应输入经比对未变，未冒称重跑。

当前候选将四方法Native接口、独立配置接受开关、严格浏览器DTO、会话、页面和实际原任务保护接通。只应用模型实际提供的1–5项描述，未提供字段沿用，显式空值保持清空语义；provided与changed分别显示，完整15字段原请求包含补丁摘要。原请求不确定、员工/API切换、关闭新写入和正文删除的恢复边界保持独立。读能力仅在完整060审计通过时提供，新的配置写入另需明确同意。完整Node资源和MCP schema校验仍发生在同一Source事务；不把直接SQL元数据校验冒称AJV编译证明。

本地实际API5.9.3与根6.0.3检查及211项限定纯测试/静态渲染通过。新真实Native Cookie/HTTP的7组和22项浏览器完整回归尚待此候选的托管运行，截图尚未验收。诊断阶段先执行这两个隔离工作流，稳定后仍须同提交全量质量、真实PG、浏览器、工具、PB19及更新审阅包核对。060的受控安装/恢复准备、先前评价来源和其余活动功能、员工UAT及运行环境签收仍未完成；整体迁移继续NO-GO。

### 2026-10-28：S1 Native 诊断通过，进入同提交完整回归

真实 PostgreSQL 18 运行 [40611680320](https://github.com/HG1127/agent-studio_vibex/actions/runs/40611680320) 在 `e4f2800` 通过原 18/18 组及新增 Native Cookie/HTTP 7/7 组；61 项纯测试、两个作业各 9 项普通环境拒绝保护及实际 API 编译通过。跨员工预览原先被 Source 错误转换成 409，现只把受保护 058 的精确 P0001/agent_opinion_not_found 转为固定 404；相似错误仍拒绝，真实 Bob 全路径隔离和禁用账户原断言均通过。

浏览器诊断 [40609886750](https://github.com/HG1127/agent-studio_vibex/actions/runs/40609886750) 的精确提交为 `a57d22d`：四任务全部成功，主流程 22/22（7.0 分钟），新增模型提供字段/显式清空、原响应丢失后恢复及员工隔离场景实际执行。产物 12783760708 含桌面预览、移动预览和接受回执三张新 PNG。e4f2800 仅修改上述 Source 错误映射及回归测试；不把前一提交的浏览器证据冒称新提交重跑。

本地审阅包已按 e4f2800 逐字节核对 391 份源码：初始化 86、更新后的实际 Native API 导入闭包 218、原可选 059 工具 87。归档仅本地保存，原 059 工具不代表 060 受控安装/恢复已完成。实际 PocketBase 19/19、两 worker、82.2 秒在 a57d22d 执行；后续改动未涉及 PB 运行输入。

下一候选执行同一提交的六类完整门禁：质量与根 pnpm check、七任务真实 PG18、四任务浏览器、原 CLI、可信 059 工具及 S1 两任务。当前只是诊断结果，最终门禁和实际截图检查按精确 head 单独记录。管理员公司概览正在独立 D 盘草稿并行实现，尚未进入本候选；真实 Worker 遥测、先前评价来源、其他活动功能和员工 UAT/运维签收仍未完成。默认 fresh050、原 SQL001–060 保留，整体迁移及生产切换继续 NO-GO。

### 2026-10-28：S1 Native 验收及独立 CT03 公司统计候选

S1 模型提供字段的 Native 接受在精确提交 `c64c39a74dffc61091fbe1da321b7adf71ed7d26` 完成六类隔离门禁：质量50/50、根1,238项、实际前后端类型及构建、真实PG18七作业、S1基础18组和Native Cookie/HTTP七组、四作业浏览器主场景22项、原CLI实际八组、可信059工具实际12组。同提交PocketBase19/19、双worker92.4秒，391份审阅包源码已逐字节核对，新增桌面/移动预览及接受回执三张截图已实际目视复核。该里程碑保持独立草稿PR27；不等于060受控安装或整体验收完成。

公司管理员概览在独立PR28和工作区继续整合，使用可选061、当前Native管理员和最少列权限，仅返回公司全局数量及独立员工游标页。全局范围包含停用Native账号的实际计数，员工页不代表公司总数；没有真实Worker遥测时明确显示不可用。最新真实接口证据是 `0ecb8ec` 的 [Native Cookie/HTTP作业](https://github.com/HG1127/agent-studio_vibex/actions/runs/40619264896/job/122589021248)，该作业全部通过；同运行SQL作业仍失败，其12组真实权限竞态及205员工/11页正向通过，OID探测类型和列授权恢复的测试修复已单独提交。不得将部分成功写成完整通过。

本次接入严格浏览器DTO、独立公司会话、管理员页面和一个新浏览器故事；根测试入口明确登记三份新增前端纯测试/静态渲染文件。实际根TypeScript6.0.3、API5.9.3及126项限定纯测试/静态渲染和普通主机拒绝保护已通过；真实浏览器23项和同提交全量门禁仍待托管验证。审计另行补强相近用户schema名称的权限筛选，不以旧结果覆盖新候选。详细边界见[公司概览候选说明](PG18_COMPANY_OVERVIEW.md)。

真实Worker心跳、060受控安装/恢复、先前评价来源与其他活动功能、真实员工UAT、网络/权限、备份恢复及长期Worker签收继续未完成。默认fresh050保持，旧SQL001–060原字节保留；未初始化真实目标，正式迁移继续NO-GO。

### 2026-10-28：CT03 公司概览诊断稳定，进入同提交完整回归

精确 `2dd8b7d` 的[真实PG18双作业](https://github.com/HG1127/agent-studio_vibex/actions/runs/40625272974)成功：SQL77/77子场景（含父合计78）、Native Cookie/HTTP9/9组（含父合计10），57项纯检查、原普通主机保护和实际API类型均通过。原61场景、205员工/11页、12组权限快照竞态、41项原漂移与最终060/061 FULL共存保持；新增16场景实际核对相近用户schema及敏感目录的表/列/PUBLIC权限、非默认原始ACL、拒绝503和准确恢复，不读取或修改任何凭据正文。

敏感目录的原始授权和PostgreSQL生效权限分别检查：系统保护可屏蔽非超级用户的表级UPDATE，不将effective=false误当没有授权；原有全部生效权限断言保留。合成schema名称仅允许固定六种，修复先前测试正则误拒数字的问题。`3692fbe` 的73/78失败记录原样保留，不冒称旧运行全部成功；SQL061、两函数源码指纹、旧001–060、默认fresh050和界面协议原字节保留。

独立浏览器诊断 `7d67495` 的[完整四作业](https://github.com/HG1127/agent-studio_vibex/actions/runs/40621730723)全部成功，主23/23、7.2分钟；包含旧22项和新增公司统计故事。新产物12787724396共49张合成PNG，桌面/手机/权限拒绝三张Company图已由父会话实际目视复核，显示205/203/15全局数量、20人独立页、停用员工7/3非零，以及拒绝后的未知数量和清空列表。新审计改动未修改这些页面来源；最终仍需同提交浏览器重跑及产物核对。

本候选仅汇总稳定诊断并进入相同提交的七类完整门禁：质量与根pnpm check、真实PG18七作业、浏览器四作业、原CLI、可信059、S1两作业及Company两作业，另须规范PB19/双worker、同提交截图及交付包源码核对。尚未完成这些最终检查前，不将CT03写为完整验收。Worker纯契约/报告序列和060受控工具在独立范围继续实现，没有纳入本候选或冒称已部署。

真实员工UAT、网络/访问控制、备份恢复、长期Worker签收和其余活动PB功能仍未完成；未初始化真实目标、未合并或部署，整体正式迁移保持NO-GO。
