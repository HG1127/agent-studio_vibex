# Harness V2 P0 · 持久化失败诊断与安全恢复指引

基线：待审核 PR #9（commit `22242dc`，依次依赖 PR #6、#7、#8）。
本轮位于独立特性分支：**不修改正式 main、不执行公司 LAN 自动部署、不切换 PostgreSQL、不改变数据表结构。**

## 已实现的共享失败诊断

- 新增 Goja 纯模块 `pocketbase/pb_hooks/modules/harness_failure_triage.js`。
- 失败时生成结构化、固定白名单字段的 `checkpoint.failure_diagnostic`：
  `version`、`kind`、`category`、`code`、`stage`、`step_ref`、`seq`、
  `occurred_at`、`explanation`、`recommended_action`、
  `requires_external_reconciliation`、`auto_retry_allowed=false`。
- 对外部写入结果不明、写意图日志不可用、预算/时限耗尽、权限、工具参数、
  模型连接、网络读取错误、任务循环、执行租约异常等分类。
- **原始提供商错误、请求正文、Token、HTTP 头等不写入诊断字段**；状态只包含固定代码和中文指导。
  未知错误按最保守策略归类为需人工核查。
- Agent 在正常失败、意外 Worker 异常时写入诊断；Workflow 在节点失败、
  意外执行异常时写入；共享运行生命周期在到期阻断时也可写入诊断。
- 成功运行可以清除历史诊断。老版本已失败任务没有诊断时，工作台显示兼容性提示，
  不伪造缺失信息。

## 修复的真实长期运行问题

旧的 Agent 步骤保存逻辑使用一个不完整的对象**覆盖整个 checkpoint**，
导致 `execution_deadline_ms` 等非步骤字段可能在执行几步后消失，从而使
之前配置的任务最大运行时间失效。

本轮调整为：在原本受租约 fencing 保护的数据库事务内加载最新检查点，
对普通步骤快照进行受控合并，保留未被显式更新的长期元数据。
`pending_approval` 等有显式 `null` 的字段仍可被清空。

真实 PocketBase 集成测试验证：启动包含 60 分钟时限的多步骤 Agent，
完成后 `execution_deadline_ms` 仍存在；预算与期限失败仍有可核查的元数据。

## 前端交付

- Agent 运行详情页新增失败诊断卡，列出可信的失败分类、执行阶段及下一步处理建议。
- Workflow 右侧运行信息栏加入相同的诊断卡。
- 对潜在已写入的外部系统请求特别警示：**先检查目标系统，禁止盲目新建任务重放**。
- 不提供自动“恢复”或“一键重试”按钮，因为当前执行系统对写操作仍不能承诺全局 exactly-once。

## 测试要求

- 共享分类器单测：固定输出、白名单敏感信息保护、未知失败 fail-closed、
  外部写入重放禁止、上下文/预算/超时分类。
- 真实 PocketBase Agent：长任务时限持久化、预算失败、到期失败、
  外部写入结果未知时诊断与审计。
- 真实 Workflow：到期失败和外部写入结果不明的诊断。
- `pnpm check`（单元 + TypeScript/Vite/生产包）、19 项真实 PocketBase E2E、
  本轮 React ESLint 与 GitHub 双轮 CI 通过方可进入运维验收。

## 保留的 P0/P1 缺口

- 本轮是**失败诊断与人工恢复指引**，没有自动重启失败任务，也没有扩展危险写操作权限。
- 还需要更完整的任务失败队列、工单式人工核查、成功且可证明幂等时的逐步恢复能力。
- 供应商 Token/美元真实费用统计、隔离执行沙箱、可追溯完整文件产物库、
  DNS/Redirect SSRF 防护及完整 Runner 合并均属于独立下一阶段。
- 事件与最终状态尚非同一个全链路数据库事务，出现极端故障仍需对账。
- 正式合并前需运维备份、员工 UAT、后端维护窗口及明确部署批准；
  Ubuntu 定时器已针对 main 自动检查，**保持 PR 未合并**。
