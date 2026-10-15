# 定时任务（Scheduled Tasks）｜VibeX

## 已实现的功能

通过「运行与执行 → 定时任务」创建 Agent 或工作流计划，支持创建、编辑、暂停、恢复、删除、立即运行、按账户查询执行历史与失败记录。任务由独立 Node Worker 驱动，关闭浏览器不会停止已部署的 Worker。

**频率**：单次、固定间隔（15 分钟至 7 天）、每天、每周。使用 IANA 时区；春季夏令时跳过不存在的当地时刻，秋季重复时刻只执行一次。复杂 Cron/节假日日历/事件触发目前未实现。

**错过触发**：离线恢复后跳过大部分过期周期，仅调度当前到期的一次，再更新为未来时间，以免积压大批付费模型调用。

**可靠性**：每个计划时段有唯一 occurrence 与确定性 run ID，重复调度不会生成第二次任务。启动失败最多 4 次尝试，退避后可重试。上一时段仍在运行、等待审批或暂停时，新时段跳过。历史含实际运行状态、失败和跳过原因。
**人工补救**：仅对 `failed_start`（后台启动失败且运行实例根本未创建）的历史记录提供「重试启动」，确认后重新入队；操作必须由计划所属用户授权，且会检查既有 run ID 防止重复。已启动但 Agent/工作流内部执行失败的任务不会自动复用原时段，应根据副作用日志人工检查后再创建新计划。

**权限与安全**：计划与历史按用户隔离；内部调度接口必须具备服务端 Worker Token。定时 Agent 继承方案中明确选用的内置工具，使用所属用户已启用的模型连接，强制开启第三方写操作审批。定时工作流同样强制启用外部写操作审批。

## 部署要求

必须同时回传新版 App 源码包（含 `src/lib/scheduleTime.js` 和 `src/pages/ScheduledTasks/`）及新版 PocketBase Hook。后台 Worker 所在服务器需配置：

```text
AGENT_STUDIO_BACKGROUND_WORKER=true
AGENT_STUDIO_WORKER_TOKEN=<至少32字符的随机服务端密钥>
AGENT_STUDIO_WORKER_INTERNAL_URL=http://127.0.0.1:7000
AGENT_STUDIO_WORKER_URL=http://127.0.0.1:7000
```

启动：`pnpm worker`，并用 systemd／Windows 服务／容器守护。请勿在网页、公开仓库或 ZIP 中存储密钥。注意 Worker 部署包也必须有 `src/lib/scheduleTime.js`，否则无法计算时区。

## 验收

```sh
pnpm test
pnpm test:schedules
pnpm build
pnpm test:e2e
```

`test:schedules` 使用真实 PocketBase、独立 Worker 和本地模拟模型，验证单次自动执行、周期与立即执行、编辑、启停删除、历史、租户隔离、去重、Token、错误时区隔离和 Agent／Workflow 调用。

## 限制与下一阶段
新增定时知识库报告真实集成验收：Worker 到点启动绑定知识库的工作流，检索原文并保留来源片段。前端编辑时可以按设定时区预览未来最多五次执行时间。


不保证秒级触发精度，Worker 离线期间无法自动执行。没有邮件/IM 通知、复杂 Cron、节假日规则、真正的条件触发、结果自动投递。现有数据库原子租约仍缺少长任务续租和严格 fencing，外部系统也不能一概保证 exactly-once。生产先采用单 Worker、强制人工审批、最小权限和实际运行监控。

上传 VibeX Source 后需刷新预览，并另行发布公开版本；本地测试通过不等于线上运行已完成。
