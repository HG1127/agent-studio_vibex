# F11/F12 原业务基线与 Native 候选覆盖表（v4）

本表复核本地可读取的已接受 main 对象
`5a31a1d6bf073cc2cc110340847cbf05346813ab` 中的 Integrate 页面、八个业务组件、
`useIntegrate.ts` 与 `integrate_api.pb.js`，共十一份文件。它不是对当前远端 HEAD
或推送结果的新声明。逐文件 Git-LF SHA256 和原始行号见同目录
`PG18_F11_F12_068_BASELINE_PROVENANCE.json`。

下面“真实测试源码”指已编写的隔离 PG18/原执行链/浏览器步骤。A 没有执行这些步骤。
A 当前证据为 54 项纯测试通过（0 失败、0 跳过）与实际 TypeScript 5.9.3 语法解析；
完整编译、真实 SQL、Worker、浏览器和安装/恢复结果由 Root 提供。

| 原业务基线 | Native 实现与边界 | 真实测试源码 | 当前证据与差异 |
| --- | --- | --- | --- |
| 员工进入集成页面、会话过期重新登录 | Root Page 的 `agentCallers` 分组导航；原 Native Cookie/Origin/CSRF 和前后两次身份检查 | Browser：`Owner_login_and_budget`、末尾退出；Flow：Native 停用/再启用 | HTTP 纯测试验证精确 Native401、未知鉴权错误不泄露、第二次身份失效后不输出数据。公开调用拒绝员工 Cookie/JWT。 |
| 选择已发布 Agent | workspace 仅列原发布快照；创建/轮换绑定 spec、version、version SHA、head revision | Flow：`current draft changes...`、`a new publish...`；Browser：真实已发布选项创建凭证 | 草稿不替换发布版本；新发布不自动延续旧凭证授权。 |
| API 名称、创建和一次明文 | 随机独立 `acs_api_...`；SQL 只存域分离 SHA256 和末八位；Owner 只在新 ACK 展示一次 | Flow：`Owner key ACK...`、`lost create ACK...`；Browser：`Owner_API_key...`、Owner 丢 ACK | 纯测试拒绝重放返回明文、错误代次；离开页面/可用性丢失/员工会话变化清空并隔离迟到响应。 |
| API 重发 | 受预期 revision、预算 epoch、发布快照和明确费用同意约束的 generation 轮换 | Flow：`key reissue...`；Browser：`actual_Owner_rotation_once_display...` | 原代次立即失效；一次展示后不提供明文找回。 |
| API 吊销 | Owner 范围、预期 revision 和独立撤销确认；每次 admission/Worker/Broker 重查 | Flow：跨 Owner 拒绝和 revoke；Browser：`actual_Owner_revoke...` | 已开始的外部效果可能完成；不会宣称撤销能抹除已发生费用或结果。 |
| 网页嵌入凭证和一行代码 | 独立 `acs_embed_...`；只在新密钥显示期间提供片段，parent closure 持钥并移除 DOM key 属性 | Browser：真实外部网站加载 widget、移除属性和 iframe 无 key | 原来的可反复读取 embed token/带 token URL 不保留；改为一次明文及显式轮换。 |
| 标题、四主题色、左右位置 | Owner 创建与外观编辑表单；配置修改不更换 generation | Browser：`Owner_embed_appearance_static_preview_and_actual_position` | 检查静态预览、真实 iframe 标题和 parent 的 left 位置；无 Worker tick 或模型调用。 |
| 嵌入启停 | 允许显式停用；再次启用必须重新签发并核对资源/来源/费用 | Browser：禁用后实际 renderer 返回 404/409，provider 次数不变 | 不沿用旧系统直接恢复可能已经过期的同一授权。 |
| Owner 嵌入预览 | 静态数据预览；私有测试另用同一凭证限制和原执行链 | Browser：修改预览不执行，之后私有测试另行确认 | 预览不持有 secret、不提交调用、不冒用公开 Origin。 |
| 外部网页消息交互 | exact Origin + exact frame window + 每实例 channel；renderer CSP `frame-ancestors` 为精确白名单 | Browser：真实同 Origin sibling frame 用正确 channel 伪造 run 被拒；真实正确 frame 用错误 channel 被拒；未列入白名单的 Owner Vite Origin 被 CSP 阻止 | 消息探针只观察真实浏览器消息；没有 mock API、伪造 DB 权限或为事件注入成功响应。 |
| 外部 API 创建运行 | 独立 Bearer、准确 Origin、closed choice/原 UUID/显式单次费用同意；原同-client Agent admission | Flow：public entry 拒绝 Cookie/JWT/Owner override；Browser：实际产品 Public SDK | 不接收任意 Owner、模型、工具连接或知识资源 ID 作为公开授权。 |
| 公开轮询 | 精简 invocation 状态，输出前重新检查原快照和模型/工具/知识 ACL | Flow 与 Browser：tick 前 poll 不执行；真实 Worker 后 poll 返回实际合成答案 | 与旧页面“每次 poll 推进一步”不同：执行只由原独立 Worker 推进。公开响应不返回原 Owner Run/事件/检查点。 |
| Owner 在线试调 | 原 Native Cookie + credential id/generation，明确测试同意；不找回 raw key | Flow：`private Owner test...`；Browser：`actual_Owner_private_test...` | 实际原 run/job、Worker/mTLS/Broker，私有 poll；非 Owner 和公开调用方不能读取该记录。 |
| 运行档案展开和原任务链接 | Owner-only 输入/结果、原 UUID、代次、Origin、原 version/SHA、状态/未决标记和历时；跳转 Root 原自主任务面板 | Browser：`actual_Owner_source_filters_examples_and_original_task_navigation` 捕获原 run GET | 历时包含排队和等待，未冒称 provider 延迟。细节保留在原 Owner 任务视图。 |
| 来源筛选和发布版本筛选 | 已加载历史按 API/embed/Owner 测试筛选，使用历史行 immutable version id 过滤 | Browser：三种来源各匹配真实一行；Presentation 纯测试：同一 key 重新绑定后旧 version 过滤仍准确 | 缺少凭证类型时明确显示未知来源，不能猜测。 |
| 累计/成功/失败/运行中/未知概览 | 使用原 Owner RPC 的完整累计统计；额外展示已加载样本的今日 UTC、来源和成功率 | Browser：真实三条记录；纯测试：样本不冒充 999 条全部累计，UTC 跨日准确 | 全历史来源/今日计数未加入冻结协议；样本范围在页面明示，不能据此声称全部历史来源占比。 |
| 每 5 秒留档刷新与手动刷新 | 页面 active/available/visible 时仅 history GET；不重载费用表单；未知操作或 busy 时暂停；手动刷新仍可核对 workspace | Browser：`visible_Owner_history_refresh_is_readonly`；纯测试：无 write、无 workspace 重载、pending 停止、离开后 abort/隔离迟到结果 | 刷新不 tick、claim、重试执行。 |
| cURL 与 JavaScript 示例及复制 | 准确 HTTPS 公共路由、独立 Bearer、实际浏览器 Origin、保存原 choice/UUID、单次 submit/confirm/poll | Browser：实际说明切换，无 raw key；纯测试验证 URL、cookie-free 选项和无自动提交/循环 | 示例不塞入真实明文、不写本地存储、不在 query 中传 key。完整严格 SDK 保留独立 bounded EOF/duplicate JSON/receipt 检查。 |
| 每凭证 6/min、200/day 与费用边界 | 更低可配置 key 限额；Owner 跨 key/generation 的 UTC run/model/tool/concurrency 预算；每个实际步骤单独保留 | Flow：错误租约/模型上限/工具拒绝；Database：真实并发只成功一次 | 当前公开额度拒绝为 409。旧 429 与 `retry_after_s` 未保留，等待有证据的合同决定；本轮不改变 SQL068/响应协议。 |
| 网络不明后确认原请求 | Owner create/rotate 元数据原 UUID 确认；public SDK 原完整 choice 确认；new writes/runs 关闭仍可读 | Flow：失 ACK 只回元数据；Browser：真实 response.destroy 后 Owner/public 原确认，无第二次 public POST | 不自动提交新 UUID、不重新发 key、不清除未知后自动 replay。 |
| 外部执行结果未知 | 原 started/unknown ledger、Owner 全局 latch、当前 lease/source/gen/预算再检查 | Flow：`unknown actual Broker outcome...` | 不以换 key、换 UUID、换 generation 绕过；不自动退款或重放。 |
| 原 Owner 模型与工具执行 | 原 leased Worker → mTLS client/handler → lease identity → 原私有 Broker → 原 Owner 秘钥解密；实际 calculate 工具 | Flow：实际答案、错误租约无写入、模型额度停止第二次模型调用、不允许工具无 reservation | 合成答案仅在真实 Broker 检查后产生；无外部真实 provider。A 没有运行该链。 |
| 内部发布副本和可审计性 | 同事务私有 sealed source；Native 普通 Agent CRUD 隐藏；即使删 marker 也检查来源；deferred receipt/immutable evidence/原审计链 | Flow：隐藏 copy；Database：31 类真实 catalog 修改/恢复、同 client rollback、真实时间 expiry、immutable DML | 仅已编写验证源；最终审计安装和原链 059/060、067 共存由 Root 执行。 |
| 独立 CI 和默认关闭 | 自己命名的 F11/F12 hosted disposable5432 gate；availability/write/admission/execution 分离；普通主机在任何 fs/pool/socket 前拒绝 | Guard 纯测试；独立 flow/database/browser workflow | 不借 F01/F27 目的标签、不授权部署。全部真实 CI 结果仍待 Root 执行。 |

## 本增量对冻结三包的修正

v4 仅新增展示 helper/组件/纯测试/本覆盖表，并对自己的 Session/Panel、真实 flow/browser
和 fixture/CI 源作最小增量。Session 新增独立只读历史请求控制器：不覆盖正在进行的
写请求，操作开始、失去可用性、离开和 dispose 时终止；迟到数据不能覆盖新会话。
后台读取不会改变 workspace 或费用表单，也不会清掉原 UUID pending。

浏览器源码覆盖新建后改主题/位置、静态预览、真实 CSP/消息拒绝、私有试调、Owner
丢 ACK、关闭写入后的原确认、轮换旧代次失效、撤销、停用和原任务导航。flow 源另加
真实错误 lease token、原 calculate 工具与模型/工具 quota、Native 员工 disable/regrant。
既不伪造授权池，也不跳过原 Worker/Broker 检查。

SQL068 仍为
`da5977e5b0f4f86f76073b215037383be84c149eaaf348c6764da59f070f15ec`。
没有修改 shared `contracts.ts`、`workflow-graph-v2.ts`、原 059/060、C067、Root F29、
8 lineage 或 9 device 源码。Root 最终共享整合后，仍须重新核对并刷新全部 literal pins；
本包 pins 仅证明冻结 phase1+phase2+phase3+v4 的候选叠加，不能替代 Root 新依赖的审阅。

生产仍为 NO-GO。真实完整编译、三类 genuine jobs、完整安装/恢复、`pnpm check`、
十九项隔离 PB 测试，以及员工 UAT、网络/访问控制/备份/长期 Worker 验证仍由 Root 完成。
