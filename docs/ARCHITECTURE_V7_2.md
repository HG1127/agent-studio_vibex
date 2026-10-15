# Agent Studio VibeX V7.2｜执行网关、监控与数据库恢复治理

本阶段在 V7.1 的 Modular Monolith 上增量开发。保留 VibeX 账号/计费、PocketBase + SQLite、已有 Worker 和公开业务 API。**未迁移 PostgreSQL；未完成线上部署，也不代表真实付费模型或用户数据已经备份。**

## 1. 新增代码边界

### 模型请求协议（Model Request Port）

新增：pocketbase/pb_hooks/modules/model_request.js。

- buildRequest(provider, options) 根据用户已授权的模型连接、已解密 API Key、目标模型、消息和执行器超时生成 Goja HTTP 请求描述。
- OpenAI-compatible：chat/completions，Authorization Bearer、max_tokens、stream=false。
- Anthropic：messages 路径、system 消息拼接、非 assistant 映射为 user，保留原 4096 输出上限与 anthropic-version。
- Gemini：generateContent 路径、role model 映射、system_instruction、正确 URL 编码的 model 与 key。
- 无传输副作用。真实网络发送、所属用户权限检查、模型连接解密与计费仍在 agent_engine.pb.js / workflow_api.pb.js 既有处理逻辑中。
- 模块返回值包含临时明文凭证，**绝对不能记录到日志、数据库或前端**。

配套旧模块 model_wire.js 仍负责 UTF-8 解码和响应文本提取。未来 ModelGateway 可以替换调用实现，但必须先在测试中保留已确认的 Provider 协议行为。

### 运维监控（Tenant-scoped Monitor）

background_worker.pb.js 的现有 GET /api/worker/status 增加：
- observed_at_ms：本次服务端观察时间；
- last_seen_age_ms：Worker 距最近心跳间隔，暂无记录则为 null；
- queue.scheduled_overdue：当前账号超过计划执行时间 **60 秒** 仍未派发的已启用计划数量；
- queue.oldest_due_age_ms：最早超期计划距离当前时间的时长。

监控界面 src/components/tool-hub/WorkerStatusPanel.tsx 仅在存在超期计划时显示提示。超期代表任务积压的可观察事实，可能由 Worker 离线、执行过慢或配置问题引发，不直接等同于执行失败。不查询或展示其他用户的任务 ID、请求内容、工具凭证。

### SQLite 一致性备份与校验

新增本地运维工具：ops/sqlite-backup.mjs。使用 Node 24 的 node:sqlite 在线备份接口生成 WAL 一致性快照（**不是在文件正在写入时直接 copyFile(data.db)**）。

- backup：显式源数据库和目标目录，目标不得存在；SQLite backup API → integrity_check → SHA-256 → manifest（表行数、尺寸、日期）；
- verify：验证 SHA-256、大小、SQLite integrity_check 及表数量；
- restore-new：验证后只能恢复到 **不存在的新文件**，不覆盖原库；该命令不执行 PocketBase 启停或环境改动。
- snapshot 和 manifest 均为敏感数据，必须由管理员保管、加密和访问控制。工具不实现加密，也不备份原始文件存储、服务器密钥或其他外部服务。

命令示例（均为在**有权限的本地/受控主机**上执行）：

~~~
node ops/sqlite-backup.mjs backup --source "/path/to/pb_data/data.db" --output "/secure/backup/data-20261014.db"
node ops/sqlite-backup.mjs verify --backup "/secure/backup/data-20261014.db"
node ops/sqlite-backup.mjs restore-new --backup "/secure/backup/data-20261014.db" --output "/isolated-recovery/data.db"
~~~

首次恢复必须在隔离环境中人工验证。生产回滚需要额外检查文件存储、环境密钥、业务服务和迁移兼容性；不能仅靠复制数据库覆盖线上文件。

## 2. 自动验收

| 检查 | 文件或命令 | 能证明什么 |
| --- | --- | --- |
| 三模型协议构建 | tests/model-request.test.mjs | URL、消息结构、鉴权 Header 与兼容参数 |
| 模型真实调用路径 | pnpm test:model-provider | 真实 PocketBase，三种本地模拟 Provider × Agent 与 Workflow |
| SQLite 备份恢复 | tests/sqlite-backup.test.mjs | WAL 一致性、原源不变、校验及禁止覆盖 |
| 租户监控 | pnpm test:schedules | 人为模拟超期计划，不泄露给其他账号，恢复后调度正常 |
| 旧业务回归 | pnpm test:e2e | 旧有 Agent/Workflow/Worker/副作用/知识库/迁移功能 |
| 构建、静态检查 | pnpm check | TypeScript + Vite 与安全/时间/模型/备份单测 |

GitHub Actions 中增加模型协议真实路径集成测试；新增 ops 目录和文档改动纳入工作流触发路径。若仍存在旧版 lint 失败，需与新增模块独立验收，不能把 check 通过等同于全仓 lint 清零。

## 3. 平台发布与数据边界

VibeX Source 导入需要将 app ZIP 解压到 app/、pb_hooks ZIP 解压到 pb_hooks/；**不能额外嵌套目录**。完整源码包含 docs、ops、tests、Worker 等工程材料，仅适合独立备份/版本管理，不可直接整体塞入 VibeX Source 编辑器。

发布前：先获取线上真正的数据备份与旧版源代码；查看开发版本的 imports、Goja 模块加载和 Worker 心跳；确保新的 backend Hook 文件成功写入，进行浏览器、登录与实际模型连接验证，然后人工决定是否重新发布。

## 4. 仍未完成的重点

- Agent/Workflow 的整个模型连接授权、密钥管理、超时策略、调用追踪和 ToolExecutor 尚未统一迁入独立服务；
- Worker 多实例完整租约续期、严格 fencing 和第三方写操作 exactly-once 尚未实现；
- PostgreSQL + pgvector/Redis/对象存储仍属可选长期演进路线；
- 当前知识库仍采用关键词检索，存在候选数量上限，未启用 OCR / 语义重排；
- 尚没有用于真实线上 p50/p95 响应时延的持续追踪存储，也没有真实外部付费模型验证；
- SQLite 备份工具仅在本地通过 WAL 测试，不等于远程生产系统自动备份就绪。

V7.3 优先工作：抽取统一 ModelConnectionRepository 和 ToolExecutor 协议；建立 trace_id、run_id、step_id 的结构化调用链与错误码，再根据数据量验证 FTS/向量检索需求。
