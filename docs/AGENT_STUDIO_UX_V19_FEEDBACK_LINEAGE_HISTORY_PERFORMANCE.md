# Agent Studio V19：反馈溯源、超长历史与规模检索

> 范围：独立 Agent Studio VibeX 项目的桌面 Web。2026-10-21。代码修改保留在原项目工作树；未提交、推送或部署，不执行 PostgreSQL 切换。

## 目标与安全口径

本次从 V18 的“显示前后差异”，升级为可核验的“来源运行反馈 → 人工接受优化 → 方案修订 → 新版试跑”关系。没有明确保存关联的版本，不能仅凭时间或评分变化宣称该反馈引起了修改。反馈后来被重新编辑，也必须区别当时的反馈内容与今天显示的内容。

## 已实现

| 功能 | 具体落地 | 边界 |
|---|---|---|
| 反馈溯源记录 | 新增 agent_optimization_lineage 表，记录来源 Run ID、Agent ID、Owner、修改前后 SHA-256、变更字段名、反馈哈希、接受修订 ID 与时间 | 不存原始反馈、密钥、私人知识库或工具调用参数 |
| 修改原子保存 | agent_specs PATCH 传入 optimization_context.source_run_id，服务端验证账号归属、真实反馈、乐观版本锁和实际字段变动 | 无反馈、错误权限、重复旧版修改均拒绝；非反馈编辑不标记为反馈驱动 |
| 新版试跑标识 | 前端接受修改后使用服务端返回的 optimization_lineage_id；启动新 Run 时由引擎检查 Owner、Agent 和当前配置哈希 | 关联不能跨账号或在再次修改方案后继续复用；不会自动启动付费运行 |
| 浏览器刷新后恢复优化关联 | 运行中心从 owner-scoped 服务器读取已确认的反馈版本，验证当前完整 AgentSpec 哈希未变化后显示“恢复已保存的反馈优化试跑”；员工手动点击关联下一次运行，也可以取消关联 | 不能以时间推断来源；无版本匹配不显示可用按钮；正常打开页面不会发起模型调用；若服务器 409 表示版本已变化，清除旧关联并提示重新核验 |
| 反馈是否被改动 | GET 审计记录按 SHA-256 验证来源 Run 的当前反馈是否仍与接受时相同 | 修改后反馈显示警告，不把新文本伪装为旧反馈 |
| 历史运行对比 | 运行结果区域显示审计修订编号与实际变更字段，用户可切换至真正的来源 Run | 无关联证据只展示事实差异，不臆测因果 |
| 运行历史分页 | 新增 owner-scoped 的历史接口，每页 1–50 条，统计真实总数，稳定按 created/id 排序 | 仅返回运行 ID、所属 Agent、状态及时间，不返回提示词、指令或凭据 |
| 超长历史界面 | 每批 25 条，按需“加载更早运行”，或输入 15 位运行 ID 精确比较 | 精确校验员工权限、同 Agent 和先后时间；缺失的旧快照不补造 |
| 1000+ Agent 检索 | 增加 SQLite 员工/时间、员工/名称和员工/来源索引；目录每页仅展示 18 条 | SQL 参数绑定、筛选范围隔离，不把整库方案发送给浏览器 |
| 首次启动索引顺序修复 | 原来独立 onBootstrap 索引钩子可能早于 SQLite 业务表创建，因此在干净数据库中无法真正建立索引。现在把三个目录索引放在 agent_specs 建表后的同一初始化流程，将运行历史索引放在 agent_runs 建表后；删除重复独立初始化钩子 | 独立临时 PocketBase 重新从零建库，使用 sqlite_master 实际核验四个索引存在；不修改生产 PostgreSQL 迁移 |
| 持续回归防护 | package.json 新增 `test:v19-integration`，包含 3 项数据库隔离测试，并接入原有 `test:e2e:parallel` 自动调度，总计 23 项 | 每个用例使用独立临时数据库与员工身份；运行完成删除测试数据，避免污染内网生产实例 |
| 删除 Agent 清理 | 修复删除后收藏清理原本位于 return 后方、从不执行的问题 | 收藏变更不更改 AgentSpec 配置版本 |

## 已通过的隔离测试

- tests/agent-optimization-history.integration.mjs：PASS。无反馈、伪造审计、跨员工读取、旧版本冲突和修改后重复使用审计 ID 均被阻止；检查真实接受修订、反馈更新检测、再次运行配置标识。
- 同一测试使用 172 条运行记录，7 页历史全部无重复、可追踪，不泄漏员工任务指令。
- 最新隔离测试验证四个 SQLite 索引真实存在，再使用 **1,251 个 Agent** 进行五组目录分页、排序、筛选，测得单组请求约 **5–8 毫秒**；每页数据量受控。仅为临时测试机指标，不代表正式内网环境的性能承诺。
- AGENT_STUDIO_UX_HISTORY_ONLY=1 + tests/agent-review.chrome.mjs：Chrome 1/1 PASS，172 条旧运行跨页加载，输入很早的运行 ID 完成对比。
- AGENT_STUDIO_UX_PROVENANCE_ONLY=1 + tests/agent-review.chrome.mjs：**Chrome 1/1 PASS**，包括刷新后从服务器恢复已批准优化版本、员工明确选择／取消下一次运行关联、再次点击运行才启动；界面展示真实来源反馈和接受修订，原反馈后来被修改会显示警告。
- AGENT_STUDIO_UX_FULL_CREATION_ONLY=1 + tests/agent-review.chrome.mjs：Chrome 1/1 PASS，从空白需求创建 Agent，MCP/知识库/计算器真实隔离调用，两次人工审批、两轮交付、反馈优化和第二次评估，后端与界面核对版本关联。
- tests/run-version-comparison.test.mjs + tests/desktop-ux.test.mjs：10/10 PASS。
- pnpm build：PASS（TypeScript、Vite 和 PG pilot 前端资源隔离）。
- **最新完整回归** `pnpm test:e2e:parallel`：**23/23 PASS，0 失败，2 个隔离 Worker，123 秒**。已把 `agent-catalog.integration.mjs`、`agent-run-snapshot.integration.mjs`、`agent-optimization-history.integration.mjs` 正式加入 `test:v19-integration` 和 `test:e2e` 调度清单（原 20 项扩为 23 项），以防后续版本回归。

## 使用者检查步骤

进入桌面工作台，选择 Agent 试跑并反馈，生成优化稿后人工批准写回。点击“再次试跑改进版”，核对模型和指令后启动。新版本完成时展开“前后运行与方案变更对比”，查看来源运行、真实修订 ID、变动字段、评分方式和工具调用证据；必要时按 Run ID 查找更早基准。

**刷新恢复场景**：在保存优化方案后关闭/刷新运行页面，重新进入相同 Agent 的运行中心。如果当前 Agent 未被再次修改，系统会通过服务器完整配置哈希定位可恢复的优化记录。点击「将下一次试跑关联到此版本」后，填写/检查指令，再主动点击运行；也可以先取消关联。若 Agent 版本随后变化，则恢复项不再有效，且后端会拒绝旧审计 ID。

## 限制与下一轮

真实供应商 OAuth、模型成本账单、公司内网多员工并发、1000+ Agent 在实际生产网络中的页面延迟和大型长任务均未由本次测试证明。评分差异不等于已客观提升质量，需要相同任务集和人工验收。PostgreSQL 迁移保持独立 GO/NO-GO，不因此次前端优化而切换。
