# Agent Studio V21｜Worker 崩溃恢复、多实例竞争与健康状态可观测性

日期：2026-10-22  
开发分支：`feat/harness-design-workspace-20261021`  
上线状态：**开发环境验证，尚未提交/推送/部署**

## 1. 本阶段修复的用户问题

原先 Worker 的状态面板把“近 180 秒有心跳”描述为“后台运行中”，容易误导为进程仍然在线。定时任务调度和知识索引即使因网络故障进入独立退避，工作台也缺少明确的子系统状态说明。

此前租约接管测试覆盖模拟 lease 过期与令牌抢占，但尚未把**真正终止 PocketBase 进程、保留同一数据库文件、重启服务、在独立 Worker 中恢复执行**的场景纳入自动回归。

## 2. Worker 进程崩溃恢复与多 Worker 竞争

新增 `tests/worker-crash-recovery.integration.mjs`：

1. 在独立临时 SQLite 数据库中启动真实 PocketBase、模拟模型和外部 HTTP POST 接收端。
2. Agent 发出外部 POST 且接收方已经接受，但尚未返回结果时，强制终止执行该步的 PocketBase 进程。
3. 检查本地数据库：外部副作用日志为 `started`，Agent 仍为 `running`，原 Worker 租约尚未到期。
4. 测试通过**只对临时数据库记录人工推进过期时间**模拟 10 分钟租约到期，不等待真实 10 分钟；重启 PocketBase（使用同一数据目录）及独立 Node Worker。
5. 恢复后，Agent 识别已尝试但结果不明确的外部写入，转入 `write_outcome_unknown` 失败诊断，绝不自动再次发送相同外部 POST；员工专属的待人工核查计数能准确发现该记录。
6. 新建一项任务，让两个真正的 `worker/run.mjs --once` 子进程同时争夺；数据库租约限制同一写操作实际只到达接收端一次，后续调度正常完成任务。

该测试验证的是**租约与外部副作用保护**，不是“所有任务崩溃后自动成功”；需要人工确认的不确定写操作必须保持待核查。

## 3. 后台子系统状态上报

`worker/run.mjs` 在已有 Token 保护的 `/api/internal/worker/step` 请求中携带两项最小健康摘要：

- 定时任务派发：`healthy / retrying / unverified`
- 知识库语义索引：`healthy / retrying / unverified`

两者仅包含状态枚举、连续失败次数和下一次重试毫秒时间戳。不发送原始错误消息、目标 URL、用户数据或密钥。

`background_worker.pb.js` 对现有 `agent_worker_health` 集合进行**幂等的字段补充**，将经过允许值与数值范围核验的数据保存在 `components_json`。原有心跳记录不丢失。未经 Worker Token 认证的调用仍无法写入。

员工可访问的 `/api/worker/status` 提供最近一次有效上报。报告时间失去时效后，返回 `unverified`，不能显示为健康。

## 4. 工作台 UI 与操作建议

工具中心 Worker 状态卡显示“近期有心跳 / 未收到近期心跳”，不再把心跳解释为严格进程在线。同时展示：

- 两个子系统的最后报告状态及有界重试信息；
- 有待领取任务但无近期心跳时的恢复提示；
- 不确定的外部写操作数量，提示先核查目标系统、避免重复执行；
- 可进入运行监控页面继续排障。

运行监控页面同样适配子系统状态，仅向已登录员工显示合法的摘要值。单条心跳不能证明所有 Worker 实例健康，界面明确说明这一限制。

## 5. 安全约束及尚未验证的项目

- 所有生产操作均禁止。使用本地临时数据库和测试口令，不触碰真实员工记录。
- 外部写入无法通过客户端取消自动回滚；严格端到端 exactly-once 仍需要第三方提供业务级幂等契约。
- 本次测试确实杀掉了 PocketBase 进程并重新启动服务，但通过修改隔离测试数据库的租约时间模拟到期；没有实际等待 10 分钟。
- 暂未做生产服务器断网、数据库物理损坏、分布式跨机锁、长期压测或真实 SaaS 第三方账户授权验收。
- 多 Worker 面板目前展示**最近一个有效上报者**的子系统摘要，不是所有实例独立注册和集群健康汇总。

## 6. 本轮验证记录

- `pnpm test:worker-crash`：真实 PocketBase 进程终止、同数据库恢复、租约接管、外部写入人工核查及双 Worker 竞争测试通过。
- `pnpm test:worker`：Worker 执行、脱敏健康状态报告与权限检查通过。
- `node --test tests/worker-loop-resilience.test.mjs`：辅助子系统故障隔离、独立退避与健康报告契约通过。
- `node --test tests/harness-governance.test.mjs`：健康报告正确呈现并对格式异常的数据拒绝解析，9 项测试通过。
- `pnpm check`：单元测试、TypeScript 构建及生产打包资源隔离检查通过。
- `node ops/e2e-parallel.mjs --workers=2`：真实 PocketBase/SQLite 隔离 E2E 从 26 项扩大为 **27/27 全部通过、0 失败**，新增真实进程崩溃与多 Worker 竞争测试。
- 受修改影响的 Worker、React 工作台和测试文件均已通过 ESLint 和 `git diff --check`。
- `pnpm test:design-workspace`：Chrome 独立员工登录与 Agent 四模块设计、工具连接、复杂五角色 Agent、审批、故障注入、版本复验 1/1 通过，浏览器控制台错误 0、HTTP 400 响应 0；使用独立模拟模型和本地工具环境，不是生产 SaaS 授权验收。
