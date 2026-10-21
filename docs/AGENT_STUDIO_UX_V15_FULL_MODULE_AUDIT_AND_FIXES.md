# Agent Studio V15｜全模块用户体验审计与高优先级修复

> 审计对象：原项目 `agent_studio_vibex版本`。遵循「用户任务完成率 > 页面装饰」，所有 UX 结论明确区分**代码审阅**、**浏览器路由/移动布局检查**、**真实浏览器业务操作**和**后端集成测试**。单独的 PostgreSQL staging 迁移尚未切换，本轮不变更它，也不进行生产部署。

## 1. 人员角色与端到端目标

员工：创建/复用 Agent → 资源工具连接 → 编辑方案与保存草稿 → 试跑/审批 → 验收与迭代 → 发布/集成或安排任务 → 追溯历史。管理员：员工和分享权限 → 委托审批 → 任务健康诊断。

UI/UX 验收项：①明确下一步；②无不必要页面往返；③禁用操作说明原因；④异步、空数据和权限错误可处理；⑤活动任务和草稿不因跳转丢失；⑥任何“已连接、已通过、已保存”的状态须由服务器确认；⑦恢复、分享、审批、发布、撤权可追踪；⑧移动端至少不横向溢出，复杂画布单独 UAT；⑨键盘聚焦和操作语义正确；⑩已批准的业务配置不可被其他页面的旧副本覆盖。

## 2. P0/P1 修复台账

| 优先级 | 问题 | UX 修复 | 实证与剩余限制 |
|---|---|---|---|
| P0 | 两个浏览器标签同时批准草案/工具，可能重复接受决策 | `agent_engine.pb.js` 的用户回复和工具审批均采用 owner-scoped SQL 条件更新+事务，先抢占待处理检查点，再以同一事务写任务状态和审计事件 | 最新 `agent-human-input.integration.mjs` 和 `smithery-connect.integration.mjs` 均 PASS，含并发只允许一个成功、真实 MCP 请求 |
| P0 | “创建 Agent”所需工具是文字标签，不是实际工具 | `agentToolMatcher` 匹配内置工具/已验证连接；第三方授权、搜索词保护和插件市场回跳（V13–14） | 模拟供应商真实 MCP/HTTP 测试通过；真实 OAuth/真实企业插件需用户员工账号 UAT |
| P0 | 模型在交付草案后要求确认，用户无入口 | 结构化 `ask_user`、服务端 `awaiting_input`、人工批准/退回、断线恢复与同任务续跑（V13） | PocketBase + Chrome 中真实审批行为测试通过 |
| P0 | 运行结果评分、反馈、方案版本编辑分离 | 成果 → 评估 → 用户反馈 → 差异稿 → 明确批准应用；按运行对应 Agent 校验版本（V13） | Chrome+后端流程已覆盖 |
| P0 | 质量断言可能覆盖其他页面刚修改的方案 | PATCH 增加 `expected_updated` 服务器 CAS；未保存且本地版本已失效则警告，必须确认加载最新 | 本轮源码/单元审阅；需要并发员工 Chrome 专项 |
| P0 | 发布验收的待确认/审批被误显示为失败且轮询停止 | `VersionRelease` 保留待输入/待审批 live 状态、原任务处理入口、验收运行链接及页面恢复；暂停不虚构通过/失败 | V15 代码修复；浏览器专项验证见验收记录 |
| P0 | 改动过 Agent 后，旧版成功运行可认证新方案 | 前端 `matchesAgentSpecSnapshot` 和服务端 `spec_versions_api` 按运行快照稳定比较；旧版验收只能标记为未测试 | 隔离 PocketBase/SQLite 后端集成覆盖新旧快照 |
| P0 | 发布模板时原版后端直接公开完整 AgentSpec，可能携带内部知识库ID/私有工具配置 | `template_market_api.pb.js` 在公开列表、发布、复制三处执行字段白名单，仅可分享文本及内置工具，清空私人 KB/质量样本/写权限；公开文案需人工确认 | `tests/template-market-security.integration.mjs` 真实隔离 PB/跨员工测试 PASS |
| P0 | 普通成功试跑可被误标为正式验收 | 发布后端除匹配 run/spec 版本快照，还核对 `run.config.source === "acceptance_test"`；旧版或普通运行不能标记通过 | `tests/agent-human-input.integration.mjs` 新版集成测试 PASS |
| P0 | 模板发布确认后另一标签修改方案，可能发布未经审核的新文本 | 发布携带 `expected_updated` 并由服务器校验；无版本凭据拒绝，冲突返回 409、刷新后必须重新审核 | `tests/template-market-security.integration.mjs` 包含 428/409 场景，PASS |
| P1 | 发布验收卡显示“等待确认”，保存版本卡却说“验收测试未通过” | 保存版本卡明确区分等待中、失败/取消、旧配置过期、未测试；待处理阶段不能误写失败 | 此前 Chrome 验证捕捉缺陷，源码已修，重新进行实际浏览器测试 |
| P1 | 复合浏览器测试把登录/动态加载占位符当成完整业务页，造成误判；登录页本身有时长期停在模块加载状态 | 登录页改为入口同步导入，移动巡检等待「全局方案编辑」真实入口出现后再判定可用，增加安全错误诊断 | 独立移动路由 Chrome 19/19 PASS，390px 无横向溢出；Workflow 操作专项 Chrome 1/1 PASS |
| P1 | 从创建 Agent 的资源步骤去模型/HTTP工具/知识库会迷失上下文 | 统一返回原 Agent 条幅；安全 15 位 Agent ID；连接页可新标签保留本地草稿 | Chrome 资源回跳 3 路径通过 |
| P1 | 没有真实模型时运行按钮灰而无说明 | 运行页明确缺模型/缺任务指令/待审批/预算不足原因，直接链接模型连接；正式验收页同规则 | 编译与组件审查；浏览器检查 |
| P1 | 使用市场模板后直接去试跑，模型、知识库、外部连接未接入 | 模板复制后进入 `/agent-create?step=3&spec=...` 资源配置；复制确认文字明确权限不转移 | 独立 Chrome 模板发布→审核→复制→自有资源配置 1/1 PASS，验证后端 clone 记录 |
| P1 | 模板列表 HTTP 失败静默显示空态，用户误认为没有记录 | 模板市场「我的发布」和公开模板候选 Agent 列表区分加载异常/真正为空；错误提供重试；下架/删除增加确认 | 定向静态 UI 测试 PASS，模板真实发布及复制 Chrome PASS，仍需刻意模拟网络错误 UI 分支 |
| P1 | 模板市场公开清单请求失败后仍渲染「没有模板」空态 | 明确记录 `marketLoadError`，阻止把数据不可用呈现为空列表，提供重新加载；用户可区分网络错误与筛选无结果 | 组件测试 PASS；网络错误模拟浏览器专项待做 |
| P1 | 知识库和定时计划的「编辑」难定位 | 自动滚动至编辑表单并焦点对齐，空 Agent / 空模型给出创建入口 | Chrome 隔离数据真实创建并编辑验证 |
| P1 | 内部总览漏掉 Agent `awaiting_input` | 后端按 owner 汇总单独的待回复计数/待办记录（不泄漏用户提示词），前端直达该次 Agent | `internal-overview.integration.mjs` 验证跨员工隔离；浏览器 UAT 验证 |
| P1 | 运行页历史 “共 N 次”可能误解为总历史 | 改为「最近 N 条」；历史详情链接可明确访问 | UI code check |
| P1 | 版本、模板、模型和工具页过多装饰且重要状态不够突出 | 移除无功能的大面积渐变/模糊背景，优先显示连接、状态、错误、CTA；模板 TAB 按钮补 `aria-pressed` | 路由移动端无横向溢出；完整视觉回归待用户预览 |
| P1 | Staff 改管理员/停用账号误触即可执行 | 重要账号权限变更前明确二次确认；补输入可访问名称、布局换行和不可重复刷新的状态 | 源码审查；真实管理员+员工角色 UAT 待办 |
| P1 | 管理待审批/协作提案按钮难区分上下文 | 操作按钮携带任务/提案描述的辅助语义，保留关键的确认弹框和最小权限策略 | 后端 ACL 既有测试；多角色浏览器联动待办 |
| P1 | 已发布 Agent 外部集成及调试诊断视觉噪声 | 改白底正文及信息优先的说明文本；不改变 API Key 权限与调用效果 | 构建/路由；真实外部集成密钥 UAT 待办 |
| P1 | 快捷编辑器随处进入但刷新会丢草稿 | 当前标签页暂存、恢复/舍弃确认、乐观并发防覆盖、活动运行新标签试跑（V14） | Chrome 刷新恢复、旧版冲突、另存副本通过 |

## 3. 逐模块覆盖矩阵

状态说明：**B**=静态代码及重要操作状态审阅；**M**=390px Chrome 路由、基础渲染与无横向溢出；**J**=至少一个真实 Chrome + 隔离服务业务场景；**I**=项目集成/后端权限测试。这里不是 100% 全操作逐按钮验收。模块未做到 J 时明确留下缺口。

| 模块 | 覆盖层级 | 本轮 UX 发现和改善 | 仍需真实 UAT |
|---|---|---|---|
| 我的工作台 `/` | B/M/J | 自然语言方案可编辑，自动匹配真实工具；保存后可试跑 | 大量 Agent 列表与快速筛选 |
| 创建 Agent `/agent-create` | B/M/J | 需求→审核→工具→试跑→发布；资源回跳；移动阻断说明 | 无障碍真机/真实第三方 OAuth |
| Agent 运行 `/agent-run` | B/M/J/I | disabled reason、审批和试跑续跑、质量条件版本保护、成果反馈优化闭环 | 大量并发长任务和完整员工 UAT |
| 运行历史 `/run-detail` | B/M/J | 人工确认和工具审批可恢复原 run；状态和原始证据 | 海量事件性能/分页 |
| 工作流画布 `/workflow-canvas` | B/M/J/I | 实际 Chrome 画布拖动、节点连线、循环和条件分支、对齐/分布、导入导出、草稿恢复、故障重试、宽屏及触控目标；1/1 PASS | 超大流程性能、真机多指/软键盘 UAT |
| 模板市场 `/template-market` | B/M/J/I | 模板公开字段白名单、发布前文本审核、跨员工发布版本校验、Chrome 发布/复制→资源配置、错误重试与下架确认 | 真实两员工从不同设备发布/领取/撤权、故障 UI 分支 |
| 团队共享 `/internal-templates` | B/M/I | 预览敏感字段、明确确认/一次领取 | 员工之间真实发放/领取 |
| 多人 Agent 协作 `/agent-collaboration` | B/M/I | Viewer/Editor 受限、所有者审核提案；操作可访问名称 | 多角色同时编辑及撤权 UAT |
| 版本发布 `/version-release` | B/M/I + 新 Chrome 验收 | 等待人工确认不误报，旧运行不可认证新方案，回到原验收 | 真实模型长时运行与灰度发布 |
| 外部集成 `/integrate` | B/M/I | API Key、嵌入和日志分区，降低非功能视觉层级 | 实际网页嵌入、第三方 API 调用/撤权 |
| 模型连接 `/model-connections` | B/M/I | 自带密钥、真实试调；统一返回原 Agent CTA | 真实供应商配额/错误和密钥轮换 |
| 知识库 `/knowledge-bases` | B/M/J/I | 上传/索引/检索；新增编辑焦点与资源回跳 | 大型 PDF/OCR、知识产权及多人共享权限 |
| HTTP 工具 `/tool-connections` | B/M/I | 真实调用测试和审批，配置完回原 Agent | 各种 Schema、超时、错误码 |
| 插件市场 `/plugin-market` | B/M/J/I | 发现→OAuth→工具列表→Agent 按工具授权→真实 MCP 调用 | 外部 Smithery 与其它供应商生产接入 |
| 定时任务 `/scheduled-tasks` | B/M/J/I | 真实创建编辑、焦点和时间规则，空资源指导 | 夏令时/重试/多时区和长期任务 UAT |
| 工具诊断 `/tool-hub` | B/M/I | 一线问题：Worker 健康、参数和调用日志，减少装饰 | 真实服务器日志高流量 |
| 公司审批 `/manager` | B/M/I | 公司健康、代审批、撤销和批准场景，操作名称更清晰 | 真正管理员对不同员工的委托审批 |
| 员工权限 `/staff` | B/M/I | 管理员赋权/停用前明确二次确认；键盘/移动标签完善 | SSO/真实离职撤权、管理员授权链 |
| 个人任务总览 `/internal-overview` | B/M/J/I | 新增待我回复并直达具体 Run，提供失败、超期及待审批索引 | 通知、跨设备待办时效 |
| 主导航与全局方案编辑 | B/M/J | 5 个工作空间；全局快捷编辑/草稿恢复/键盘快捷键；移动导航 | 真机键盘、屏幕阅读器和全链路焦点管理 |

## 4. 回归测试登记

- Agent 方案审查/任务继续：`tests/agent-human-input.integration.mjs`。
- 人工确认、资源回跳、知识库/定时实际创建编辑、内部总览、发布验收：`tests/agent-review.chrome.mjs`。
- 工作流桌面与移动 UI：`tests/workflow-ui.chrome.mjs`。
- 员工总览数据权限：`tests/internal-overview.integration.mjs`。
- 发布版本与运行快照是否相符：`tests/agent-spec-revision.test.mjs` 及 agent-human-input 集成。
- UI 安全及工具：`tests/agent-human-loop-ux.test.mjs`、`tests/market-tool-selection.test.mjs`、`tests/tool-search-privacy.test.mjs`。
- 模板发布与用户体验：`tests/template-market-security.integration.mjs`（跨账号字段隔离、发布版本 CAS、复制、下架、撤权）PASS；`tests/template-market-uiux.test.mjs`（显式审核、列表错误、复制配置）PASS。
- 全站 E2E：隔离环境下独立运行 `pnpm test:e2e:parallel`，**20/20 PASS**，覆盖知识库、定时任务、Workflow Worker、跨员工 ACL、Smithery 等核心链路。
- V15 最终源码复核：`pnpm build` **PASS**（TypeScript + Vite + PG Pilot 资源隔离共 97 资源）；35 项工具、草稿、审批、模板、隐私和版本定向单元测试 **35/35 PASS**；Agent 澄清及并发批准集成 PASS；Smithery 实际模拟 MCP 权限、并发工具审批与撤权 PASS；目标文件 `git diff --check` PASS（Windows LF/CRLF 转换提示，不属于空白错误）。
- 历史上过度并行时曾出现隔离 SQLite/PB 和 Vite 服务启动超时，不是确定性产品故障；控制并发独立重跑后 E2E **20/20 PASS**，Workflow Chrome **1/1 PASS**。移动路由快速 Chrome **19/19 PASS**，无页面级横向溢出。
- Chrome 发布验收修复后显示 `CHROME_RELEASE_HUMAN_REVIEW_PASS`：人工审批、继续执行、返回验收详情；合并的全长用例因后续移动路由加载时序未全程通过，不能冒称该总用例 1/1 PASS。独立移动路由测试 19/19 PASS；Workflow UI 浏览器专项 1/1 PASS。
- 独立 Chrome 模板发布与复制用户流程 **1/1 PASS**，包括公开前审核、真实后端发布、复制后配置自有 Agent、未继承私人权限；合并型超长浏览器测试此前曾在移动路由因加载时序报错，使用独立专项验收降低误报。

## 5. 上线前尚不能声称完成

**不属于本次实测**：正式第三方 OAuth 和收费模型真实 Key；运营中 7×24 Worker、生产长任务/账单；多供应商 API 限流、配额；公司所有员工的端到端多人协作、真实管理员授权；iOS/Android 触控/输入法和辅助阅读器；复杂超大 Workflow 画布；所有按钮逐一操作并记录用户完成率；独立 PostgreSQL staging 正式切换。

本项目仍有并行未提交修改（特别是 PostgreSQL 迁移），本轮不 Git reset/commit/push，不覆盖生产数据库，不部署。
