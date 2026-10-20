# Harness V2 P0｜Shared Run Lifecycle + Bounded Worker Discovery

基线：尚未合并的 PR #7（提交 74c1ad2），依赖 PR #6。此轮在独立分支验证，不修改线上 main、内网服务器或 PostgreSQL 迁移分支。

## 本轮实现

1. **统一运行准入模块**（`modules/harness_run_lifecycle.js`）：Agent 与 Workflow 共用原子租约认领、同一受保护事务内读取最新检查点、设置 claim_until、按 Token 条件释放及一致的执行权丢失分类。模型规划循环与工作流图节点仍独立，尚未统一所有 step executor。
2. **可选任务总时限**（`max_runtime_minutes`）：1～1440 的整数；留空保持存量无额外时限行为。Agent 创建接口配置在 `config.max_runtime_minutes`；Workflow 创建接口配置在顶层。创建时保存 `checkpoint.execution_deadline_ms`，超时后在下一次执行准入或新的模型/工具调用边界拒绝执行，终态标识 `run_runtime_deadline_exceeded`，保留已有检查点、证据和产物。时间包含排队、暂停和审批等待；**不强制中断正在阻塞的外部网络调用**。
3. **有上限的 Worker 分页调度**（`modules/harness_worker_scheduler.js`）：跨 Agent/Workflow 按更新时间筛选可执行任务，每类最多扫描 5 页 × 60 行，避免首 60 条均有活跃租约时误报空队列。内部结果附带扫描数和 `scan_capped`，数据库 CAS 仍是最终认领门禁。
4. **前端配置**：Agent 运行面板增加 30 分钟至 24 小时的可选任务时限，并对计时范围和非强制中断做清晰说明。

## 测试与已知边界

- SQLite 模拟事务测试包括取消、抢占、从最新检查点恢复、保留证据、期限校验。
- Worker 调度单测覆盖超过 60 条已认领任务、跨类型公平排序、300 条扫描上限和不存在集合。
- 真实 PocketBase 端到端测试验证：超时 Agent 不继续调用模型；超时 Workflow 不执行图节点；保留历史输出；存量未设置期限的任务仍正常运行。
- 上线前必须验证 `pnpm check`、19 项独立 SQLite/PocketBase E2E 和 GitHub CI。
- **仍未实现**：连续心跳、真正的任意长阻塞操作中断、完整分布式 exactly-once、端到端产物归档和统一模型/工具 step executor；超大高并发队列仍需要数据库调度游标。
- 生产保持 NO-GO，PR 不直接合并 main；须经运维授权、数据备份、真实员工 UAT 和维护窗口审批。
