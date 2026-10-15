# Agent Studio V7.8：公司内部正式启用预检与身份边界

## 当前判定

NO-GO。已有本地业务集成、员工分享与 SQLite 迁移测试，但 VibeX 正式发布、真实员工身份网关、真实模型、Worker 常驻、网络出口和生产备份尚未验证。这个新 CLI 只提供安全配置检查与人工验收证据登记，绝不会自动发布或启动浏览器。

## P0：原始 PocketBase 不能暴露给员工或公网

业务 API 从 X-Rh-User-Id 获取员工身份。原始 PocketBase 未经过网关验证时，客户端可以构造同名 Header。新增 tests/gateway-boundary.integration.mjs 使用临时数据库验证了未经登录、仅填入伪造用户 ID 即返回 200 的行为。因此必须有可信 VibeX/SSO 入口，实际校验令牌，丢弃客户端原有的大小写/下划线等身份 Header 变体，注入真实经认证员工 ID，同时在网络层保证原始 PocketBase 对普通员工不可达。

无法仅凭 AGENT_STUDIO_INTERNAL_SHARE_USERS 白名单、开发模式或 HTTP Header 本身解决此项风险。

## 1. 不访问网络的配置预检

运行：

    node ops/internal-readiness.mjs --json

工具只从当前进程环境变量读取必要设置，不读取 .env、不连接数据库、不打印密钥、不发送请求、不打开浏览器。

检查：
- 生产匿名禁用；严格密钥模式；服务端 AES Key 长度为 32 字节；
- Worker 已启用，高熵 Token 不与 AES Key 相同；
- Worker 内部地址必须是 loopback HTTP；远程 Worker 仅 HTTPS；
- 禁止不安全远程 HTTP，禁用 PocketBase 首次安装弹窗；
- 员工内部共享白名单至少两个获授权真实 RH ID，无 local-anon 或重复；
- 与现有 VibeX App ID 匹配；
- 其余真实网关、持续 Worker、数据备份、出口管控、真实员工和已发布源码必须通过独立证据。

返回状态：
- NO_GO_CONFIG：发现不安全配置，退出码 1；
- NO_GO_UNVERIFIED：尚缺真实环境验证证据，退出码 1；
- READY_FOR_OPERATOR_SIGNOFF：格式有效且操作者声明证据均齐全，但仍须负责人审核；它绝不自动表示生产已发布。

参数错误退出码 2。每项检查仅输出状态，不输出密钥内容。

## 2. 只读身份网关验证

仅在批准的真实网关地址已确定后，明确执行：

    node ops/verify-gateway.mjs --origin https://approved-internal-gateway.example

程序只发送两次 GET 请求到 api/agent_specs?perPage=1：
1. 未携带任何身份信息，必须返回 401 或 403。
2. 未登录但携带随机伪造 X-Rh-User-Id，必须返回 401 或 403。

任何 200、302、404、5xx 或连接失败，均不能视作安全成功。测试不发送 Cookie/Token，不调用管理员路由，不启动浏览器，不修改数据。远程必须 HTTPS；仅隔离本地测试可加 --allow-loopback 允许回环 HTTP。

通过这两次请求，仍不能单独证明真实员工登录、全部入口覆盖、内网隔离或独立 Worker 安全；还需网络与用户验收。

## 3. 数据备份与审核凭据

已存在 ops/sqlite-backup.mjs 支持 SQLite 在线安全备份、SHA-256、integrity_check、行数校验和创建到新文件的恢复演练。

    node ops/sqlite-backup.mjs backup --source /controlled/data.db --output /secure/backup/date.db
    node ops/sqlite-backup.mjs verify --backup /secure/backup/date.db
    node ops/sqlite-backup.mjs restore-new --backup /secure/backup/date.db --output /isolated-restore/data.db

以上只能由授权运维在受控环境执行。本轮没有读取、备份或修改任何正式数据。

可以复制 deploy/internal-release-evidence.example.json 作为内部证据模版，填写审核人、日期和每项实际检验的证据，不得包含 Token、密码、生产用户资料或敏感数据库信息。模板默认每项为 false。

    node ops/internal-readiness.mjs --evidence /secure/release-evidence.json --backup /secure/backup/date.db --json

注意：CLI 只对审核文件的格式与新鲜度做检查，不能验证审核人确实执行过平台/网络/员工测试。

## 4. 推荐公司内部部署拓扑

    员工浏览器
      -> 公司身份网关 / 已验证 VibeX 网关（认证并覆盖身份头）
      -> 仅回环或可信私网开放的 PocketBase + SQLite
      <-> 持有独立 Token 的常驻 Node Worker

PocketBase 不能公网直连，SSO 网关不能接受客户端伪造身份。Worker Token 严格隔离，后台允许回环明文但远程需 HTTPS。模型/外部工具 HTTP 请求必须配套 DNS 解析、重定向、内网元数据地址的出口拦截及服务端权限校验。

现有 VibeX Source 需分别导入 app/ 和 pb_hooks/ 相对路径 ZIP，验证没有 PATH_FORBIDDEN/INVALID_PATH/跳过，且发布后的快照与测试版本一致。

## 5. 自动化验收

- pnpm test:readiness：离线配置、证据、备份、模拟安全/不安全网关测试。
- pnpm test:gateway-boundary：临时 PocketBase 验证原始 API 的身份伪造风险能够被工具准确检出。
- pnpm test:e2e：原有全套 Headless PocketBase 测试和新边界测试。
- pnpm check：单元测试和 TypeScript + Vite 生产打包。

不允许因为上述测试通过而对公司全员开放；真实身份、网络、Worker、备份与员工体验仍属于必须完成的 Go/No-Go 门槛。

## 6. 下一步

详见 docs/INTERNAL_GO_LIVE_CHECKLIST.md。由具备部署权限的人员提供正式环境地址、网关验证、独立备份和 Worker 运行的真实证据，完成员工试用后才能批准使用。项目继续保留 PocketBase + SQLite，不新增商业化 SaaS 的复杂计费和公开功能。
