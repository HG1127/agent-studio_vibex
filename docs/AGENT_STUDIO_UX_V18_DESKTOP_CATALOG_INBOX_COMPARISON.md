# Agent Studio V18｜桌面端 Agent 目录、待办中心及运行版本对比

> 执行范围：独立 `agent_studio_vibex版本` 工作区。本轮 **桌面 Web 优先**，不修改生产数据库或 PostgreSQL staging，不重置、提交、推送或正式部署。隔离测试使用临时 PocketBase/SQLite、测试员工账号、真实 Chrome 及可控模型/MCP 服务。

## 一、解决的两个核心用户问题

**A｜员工找不到 Agent 和待办**：超过 100 个 Agent 后，原列表仅按局部内存搜索；原 REST 默认一页 50 条、`totalItems` 错把当前页条数当成全量。收藏没有持久化、待办只展示最近 20 项，较早待批准任务可能找不到。

**B｜员工看不出 Agent 如何进化**：虽然反馈可生成并写回 Agent 配置、再次试跑可完成，但上次反馈、新版本配置差异、两次独立评分、工具耗时等散布在不同面板；尚无可核验的前后对比。必须区分模型主观评价、规则降级评分和真实执行计数，不能把估算字符数当作供应商实际费用。

## 二、V18 代码实施与真实数据约束

| 模块 | 已实现 | 数据来源、权限和异常处理 |
|---|---|---|
| Agent 搜索 | `AgentCatalog.tsx` 支持名称、目标、方案范围、步骤等服务器筛选；260ms 输入防抖 | `/api/agent_specs?q=...` 按当前员工筛选，SQL LIKE 绑定参数并转义通配符，查询不会提交第三方 |
| Agent 来源筛选 | 自主创建、模板创建、全部来源 | 服务端组合过滤，重新筛选回第一页 |
| 收藏 | 明星图标收藏/取消、仅看收藏、收藏优先排序 | 独立 `agent_spec_favorites` 按 (owner_uid,spec_id) 持久化并去重，不修改 AgentSpec 的 `updated`、不破坏版本 CAS |
| Agent 分页 | 每页 18 项，页码、上下页、真实总数，列表加载/异常/空结果区分 | SQL COUNT 与分页查询，白名单排序，不把本页长度当全量；删除后由服务器确认刷新 |
| 较早 Agent 的直达 | 从目录打开任意 ID 的编辑/试跑，200 条列表之外也能正确定位 | `useHome`、`useAgentRun`、`SavedAgentQuickEditor` 超出最近列表时对指定 ID 做 owner-scoped 单体读取，不误选其他 Agent |
| 待办全量查询 | 新 `/api/agent-runs/pending` 支持状态、Agent 名、页码、每页数量 | SQL owner-scope，结果不含 instruction、checkpoint、工具参数和用户回复；仅允许合法待办状态 |
| 工作台待办 | `AgentPendingInbox.tsx` 可展开完整待办、搜索、筛选和逐页跳转到原审批/确认 | 工作台卡片保持高优先级 5 条；完整列表独立查询，不依赖最近运行 20 条 |
| 桌面工作台排布 | 概览卡片在顶部，“待我处理”与“其他最近运行”双列；详细待办全宽展开，Agent 目录位于其后 | 缩短用户从打开首页到查找 Agent 的纵向滚动距离 |
| 版本对比 | `RunVersionComparisonCard.tsx` 按当前 Agent 加载之前的真实运行及事件 | 服务器仍按员工筛选。每次对比必须相同 spec_id、不同 run_id，不允许虚构运行快照 |
| 方案差异 | 逐项对比 goal、范围、交付物、任务步骤、验收标准、工具/知识库以及审批规则；可展开查看新旧文本 | 来自两个运行对应的 `spec_snapshot`，缺失即显示不可比，不根据模型推断改动 |
| 反馈与评分 | 上一轮真实反馈、两轮独立评分、模型评分或规则降级来源、可视化评分条 | 分数变化仅描述记录差值，评分方法不同则提示不可直接同口径比较；不表示事实准确性保证 |
| 执行指标 | 工具结果次数、模型请求次数、首尾状态事件间的执行时间、估算字符量 | `run_events` 与 `checkpoint.harness_stats`；不包含反馈之后的编辑时间；不把字符估算当作实际 Token 账单或货币费用 |
| 证据回查 | 基准运行与当前运行均有详情链接 | 原始运行 ID、评估和事件可回溯，不回写历史快照 |
| **历史快照可信度修复** | `agent_runs_api.pb.js` 运行详情改为真实读取当次 `agent_runs.spec_snapshot`；旧运行没有快照时显示不可还原，绝不拿当前 AgentSpec 伪造当时版本 | 运行详情和导出报告都明确区分历史快照与仅有的执行参数；单独隔离接口测试通过 |
| **尾页自动纠正** | 在最后一页取消收藏或其它操作使结果总数减少时，Agent 目录/待办管理自动返回有效页 | 原始分页总数和用户选中的状态始终以服务器为准，不把无效页呈现为空内容 |
| **返回工作台自动更新待办** | `AgentPendingInbox` 在页面重新获得焦点/重新可见时节流刷新，不依赖手动清除待办 | 重新读取当前账户数据，无跨员工读取，已处理任务不会继续占据待办 |
| **首页初始请求提速** | `useHome` 的概览请求只读取最近 1 条并获得真实总数，目录按需读取 18 条 | 比从服务器每次拉取 200 条完整 AgentSpec 更轻；URL 明确引用的旧 Agent 仍用单体授权接口读取 |
| **历史运行对比 UI** | 对每个 Agent 最多先加载前 100 条同 Agent 历史记录，逐条加载用户指定旧运行的实际配置/工具事件 | 超出范围的更早历史尚需扩展“加载更多”；当前不宣称无限历史搜索 |


## 三、验收证据

**隔离 PocketBase Agent Catalog：`tests/agent-catalog.integration.mjs` — PASS**

- 创建 124 个本人 Agent，并创建另一员工的私有 Agent。
- 第 1/2 页真实 SQL 分页各 20 项且不重复、全量为 124 而非 20、名称和目标检索以及来源筛选真实返回；`%` 通配符不会扩展检索。
- 收藏 3 项、仅看收藏分两页、取消后数量更新、删除后自动清理；其他员工不可更改本人收藏。
- 收藏前后 `updated` 不改变，版本乐观并发保护不受影响。

**隔离 PocketBase 待办：`tests/internal-overview.integration.mjs` — PASS**

- 模拟老任务被大量新运行挤出最近历史，但仍可通过待办服务端查询和分页找回。
- 16 项待办分 4 页；待审批和待回复精确分组，名称检索与跨员工 401/权限限制通过，结果无内部指令或审批详情泄漏。

**真实桌面 Chrome：Agent 目录与待办 — PASS**

- `AGENT_STUDIO_UX_CATALOG_ONLY=1 node --test tests/agent-review.chrome.mjs`：**Chrome 1/1 PASS**。111 个员工 Agent、每页 18 项、跨页无重复、按目标搜索结果 2 条、收藏跨刷新持久化、27 条待办分 3 页、13 条待审批；还验证了取消最后一页收藏后自动回退页码、在其他位置处理审批后重新获得焦点更新待办，以及列表缩成一页时分页按钮正确消失。

**真实桌面 Chrome：运行版本对比**

- `AGENT_STUDIO_UX_FULL_CREATION_ONLY=1 node --test tests/agent-review.chrome.mjs`：**Chrome 1/1 PASS**。两轮需求落地 Agent 均完成 MCP 工具审批、需求人工确认、成果、评分和反馈优化；面板显示真实字段差异、前一轮反馈、评分方法、工具调用和费用不可用说明；导航至原始两条运行的详情页展开“配置快照”，证实旧目标和新目标对应各自不可变的运行快照。

**指标单元测试：`tests/run-version-comparison.test.mjs` — 4/4 PASS**

- 测试记录同 Agent 的两次快照字段差异、LLM 与规则评分的不同口径、工具事件数和可核验耗时；缺失快照/数据、跨 Agent 比较时不造假。

**构建与兼容性**

- `pnpm build`：**PASS**（TypeScript、Vite、PG pilot 生产资源隔离）。
- `pnpm test:e2e:parallel`：**20/20 PASS，0 失败，2 Worker，耗时 107.2 秒**，覆盖全部现有 PocketBase、Worker、Smithery、知识库、调度、身份与协作主链路。

### 追加安全与一致性回归（后续迭代）

- `tests/agent-run-snapshot.integration.mjs`：**PASS**。创建旧 Agent 与旧 Run，修改 Agent 名称/目标/工具，再读取旧 Run 的详情仍是原方案，新 Run 为新方案；模拟历史快照为空时只返回 null；其它员工 GET 404、未登录 GET 401。
- `tests/agent-review.chrome.mjs`：**两组独立 Chrome 路径均 PASS**：①收藏尾页、待办处理后焦点刷新/尾页纠正；②两轮 Agent 执行、历史详情展示旧/新目标保持一致。
- 单元测算 `tests/run-version-comparison.test.mjs`：**4/4 PASS**，包含异评分模式提示、没有真实账单不推断成本、无快照时不编造改动。
- 定向 `node --experimental-strip-types --test tests/run-version-comparison.test.mjs tests/desktop-ux.test.mjs`：**10/10 PASS**。另有 `tests/agent-catalog.integration.mjs`、`tests/agent-run-snapshot.integration.mjs` 独立执行通过；这两项新测试尚未加入既有的 20 项 CI 并行清单，不能在 20/20 中重复计数。

## 四、上线之前仍需满足的条件

1. 当前仅在原项目工作区保存 V18 修改，**尚未提交、推送或内网正式部署**。
2. 内网真实员工试用：1000+ Agent 性能、多人真实账户下的收藏/筛选、撤权/中断、任务超时以及审计日志。
3. 真实 API 费用需连接供应商使用量/结算数据后才能展示，不能根据本地字符数倒推“真实成本节省”。
4. 模型评分属于辅助判断，优化后是否更准确需要人工业务验收、同口径数据及盲测对比。
5. 外部第三方 OAuth/插件真实权限尚需独立验收。
6. PostgreSQL 17 迁移保持独立 GO/NO-GO；不要把 UI 改动当作正式切库许可。
