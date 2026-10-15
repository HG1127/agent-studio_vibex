# Agent Studio 独立运行与账号体系（2026-10-14）

## 状态与原则

这是 `agent_studio_vibex版本` 的**独立部署源码分支**，不再通过 VibeX/RunningHub SSO 登录，也不依赖其应用 ID 或钱包。此前的 VibeX Source 导入/发布文档仅作历史记录，**不要把本独立分支的源码重新覆盖到 VibeX 线上 App**。

- **已通过隔离测试**：首次管理员初始化、员工密码登录与 Token 校验、员工增删改中的创建/停用/角色和共享权限、跨员工隔离、伪造 owner header 拒绝、内部模板分享授权、Vite 代理实际请求链路。
- **待验收**：真实员工数据迁移、内部网络 HTTPS 访问、独立 Worker 长时间运行、真实模型与密钥、真实文件和备份恢复、生产部署及公司员工验收。
- **未迁移数据库引擎**：旧业务仍由 PocketBase 0.40.5 + SQLite + Node Worker 运行；`services/pg-api` 的 PostgreSQL V8 仍是独立试验，不得与旧 Worker 并行执行真实副作用。

## 身份与权限

1. 用户通过 `studio_users` PocketBase Auth Collection 登录。密码由 PocketBase 存储与验证，业务端获得 PB 签发的 Token，不接触第三方 SSO。
2. 后端在所有受保护的自定义 API 请求中验证 Token，将可信身份映射到现有 `rh_user_id` 所有权字段。**字段名称只是兼容旧数据的历史命名，不再代表 RH 账号。**
3. 只有 Admin 能新增员工或调整角色、禁用账户、开放内部模板共享。普通员工只能修改自己的密码和管理自己的 Agent、Workflow、知识库。
4. 内部分享不再读取 `AGENT_STUDIO_INTERNAL_SHARE_USERS` 旧白名单，改为数据库 `active` 和 `share_enabled` 授权；没有权限显示可联系管理员的业务提示，而不是误报配置故障。
5. Worker 使用单独的服务端高熵 Token。计划派发、自动启动和 Tick 除 Token 外还验证运行与计划/人员的关联，客户端单独伪造 `X-Rh-User-Id` 不可被信任。
6. 原始 PocketBase 限制在 127.0.0.1 或可信私网，**切勿将 7000 端口直接暴露给员工浏览器或公网**。线上还需应用网关、HTTPS、请求限流和出站防护。

## 零数据首次安装（仅全新本地工作目录）

准备 Node.js、pnpm，以及**PocketBase 0.40.5** 对应系统的可信官方可执行文件。当前仓库在 Windows 下默认查找 `vibex-local/bin/windows/pocketbase.exe`；也可在 `standalone/bin/windows/pocketbase.exe` 放置同版本文件。Linux/macOS 对应 `bin/linux/pocketbase` 或 `bin/darwin/pocketbase`。这些路径只保留原来的目录兼容，**与平台登录无关**。

```sh
pnpm install --frozen-lockfile
pnpm standalone:init --dry-run     # 只读前置检查，不建数据库
pnpm standalone:init               # 仅在确认当前目录不存在旧库/旧密钥后执行一次
pnpm standalone:dev                # 打开 127.0.0.1:7000 PocketBase、Worker、127.0.0.1:8000 Web
```

自行打开 `http://127.0.0.1:8000/login`。首次进入时输入 `.env.local` 内 `AGENT_STUDIO_BOOTSTRAP_SECRET` 与管理员邮箱、姓名、至少 12 位密码；成功后由管理员进入“员工与权限”创建员工账号。可继续使用旧命名启动入口 `vibex-local/start-*.sh` / `.ps1`，现在它们只委托独立启动程序，不发起 RH 登录。

- `pnpm standalone:init` 只在**空库且没有 `.env.local`** 时允许执行。发现已有数据库或凭据将立即拒绝，绝不会迁移或覆盖。
- 初始化生成 `.env.local`（包含密钥）与 `standalone/operator-credentials.local`（PB 内部维护账号）；切勿提交、发聊天群、复制进 Word 或公开 Web。
- 这是一套**本地开发运行服务**，不是生产级进程守护。关闭当前终端服务将终止。公司内网部署要另行配置常驻进程、可信网关、TLS、备份、权限和监控。
- 在员工账号创建完成后，请撤销或轮换 `AGENT_STUDIO_BOOTSTRAP_SECRET`；之后初始化接口会拒绝再次创建管理员。管理员不得用 PocketBase 系统维护账号作为普通员工账号。
- 不要设置 `AGENT_STUDIO_ALLOW_ANON=true` 或 `AGENT_STUDIO_AUTH_MODE=legacy`；后者仅保留用于隔离历史集成测试。

## 历史业务数据保护与账号映射

原 RH 账号的数据仍可能保存在 `rh_user_id` 或 `owner_uid` 等列。新 `studio_users.id` **不会自动等于**旧 RH 用户 ID。未经验证直接重写列可能造成数据串号、代理密钥泄露、任务被错误员工执行。

**不要对生产文件运行未审核迁移。** 在获授权的主机先创建快照并校验：

```sh
node ops/sqlite-backup.mjs backup --source /authorized/pb_data/data.db --output /secure/snapshot.db
node ops/sqlite-backup.mjs verify --backup /secure/snapshot.db
pnpm standalone:inventory --db /secure/snapshot.db --output /secure/owner-report.json \
  --mapping-template /secure/manual-owner-map.json
```

盘点程序**只读**快照，输出列级引用数，原始用户 ID 仅在明确要求时写入仅操作者持有的映射草案；程序**没有数据修改或自动合并功能**。由系统负责人逐人核对真实员工身份及授权，然后在隔离恢复副本中实施独立审核的迁移脚本并测试所有 owner 相关外键/审计/分享/任务和 Worker 一致性。完成映射前，旧用户历史业务数据应保留但不能直接授予新账号。

## 模型和其他第三方能力

独立账号 **不等于默认拥有外部模型余额**。实际 AI 调用需要员工在“模型连接”内配置自己获得授权的 OpenAI-compatible/Anthropic/Gemini Provider。原 RH 钱包、充值、SSO 和运行期自动兑换已经从生效的前端登录路径移除；导出代码的历史测试/注释或不再使用的 SDK 可能提到 RH，这不代表仍依赖其登录。

## 公司服务器部署模板（未执行）

`deploy/standalone/` 已提供两份 systemd 服务和一份 Nginx HTTPS 反向代理模板，供拥有运维权限的人员在专用目录内审查后使用：

- `agent-studio-pocketbase.service.example`：独立 PocketBase 0.40.5、`127.0.0.1:7000` 监听、受限系统用户、独立数据目录与服务端配置；
- `agent-studio-worker.service.example`：独立 Node Worker 常驻，复用经审核的服务端环境文件，默认只部署一个 Worker；
- `nginx-agent-studio.conf.example`：公司 HTTPS 域名、静态 `dist`、`/__pb/` 前缀转发、屏蔽 PB 超级管理员页面与员工传入的身份/Worker 头。

这些只是**配置模板，尚未连接或安装到公司服务器**。正式部署需预先核查宝塔当前网站、80/443 监听与反向代理规则、证书、Node/PocketBase 版本、权限、目录、剩余磁盘、数据迁移及数据库恢复。模板中的示例域名/证书路径必须替换，并在新站点上用 `nginx -t` 验证，不要覆盖已有网站。生产环境禁用 Vite 开发服务器；部署经构建的 `dist`，在受控服务端配置 `/etc/agent-studio/studio.env`，不给员工公开 7000 端口。

在管理员授权的情况下，启动/停止、环境变更、建库与发布由公司运维在另一次明确审批后执行。本次改造没有做这些动作。

## 测试和上线闸门

```sh
pnpm check                       # 单测 + TypeScript/Vite 生产构建
pnpm test:standalone             # 全新临时库身份权限 + Vite/PocketBase HTTP 代理
pnpm test:company                # 公司运行汇总、员工显式委托审批、撤销、步骤指纹与审计
pnpm test:e2e                    # 原有 Agent/Workflow/工具/调度/知识库回归
# 仅在获授权部署主机对自备配置文件执行：
# pnpm go-live:preflight --env /approved/studio.env --json
# 人工签收另需 --evidence，输出最多 READY_FOR_OPERATOR_SIGNOFF，永不自动声明已上线。
```

**上线 Go/No-Go 必须逐项签收**：真实员工 A/B 与禁用成员 C 隔离；已授权真实模型执行；后台 Worker 浏览器关闭后 24 小时内正确调度；从备份恢复并演练回滚；网络未暴露原始 PB，非授权访问恒为 401/403；工具写入审批、密钥管理与出口策略；所有旧数据完成授权映射，发布之后用真实工作台检验。任何未签收项目均不得宣称可对公司全员开放。
