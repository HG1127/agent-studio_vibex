# Agent Studio VibeX 安全与运行说明

此文件记录源码实际已经实现的安全措施，以及部署时必须由运行环境保障的部分。

## 服务端身份与归属

业务 Hook 根据 VibeX 网关注入的 `X-Rh-User-Id` 确定用户。客户端不应有机会自行伪造此 Header：生产环境必须保证 PocketBase 仅通过可信网关访问，不能直接暴露到公网。Hook 已补充按 `rh_user_id` 的记录过滤和操作前归属检查；通用数据库写路由不再对访问者开放。对外发布的集成接口以 Token 另行授权。

`AGENT_STUDIO_ALLOW_ANON=true` **仅适合隔离的单人本地开发**，因为匿名用户共享 `local-anon`。生产环境不要设置此变量；未提供经认证的身份时返回 401。

## 机密信息存储

已增加向后兼容的密钥封装：

- 当 `AGENT_STUDIO_SECRET_KEY` 是**恰好 32 字节的服务端随机密钥（建议 32 位 ASCII）**，新写入的模型 API Key、外部工具 Header、插件连接 Secret 将通过 PocketBase `$security.encrypt` 使用 AES-256-GCM 保护，以 `gcm1:` 为版本前缀。
- 设置 `AGENT_STUDIO_STRICT_SECRETS=true` 可拒绝未配置密钥时的新 Secret 写入。生产环境必须开启这个选项。
- 旧版字符码 +3 的可逆混淆记录仅为向后兼容保留读取能力，**并未自动完成安全迁移**。生产发布前应重新保存或轮换旧连接密钥；不能把旧混淆记录当作加密数据。
- 服务端密钥不要写入源码、前端环境变量或上传的 ZIP。必须由部署系统 Secret Manager 注入。密钥丢失意味着此前加密的 Secret 无法恢复；轮换需要专门的迁移步骤。

新建 API 调用 Token 使用 PocketBase 密码学安全随机生成器，数据库只存 `sha256:` 摘要；旧版 API Token 仍可使用，并需逐步轮换。网页 Embed Token 仍需由管理端读取原值以生成嵌入代码，因此仍有不同的密钥生命周期与进一步安全重构需求。

## 出站网络限制

Agent、工作流和工具中心的 `web_fetch` 当前会在发起 HTTP 请求之前拦截明显的本地网络目标：裸 IP、IPv6、localhost 以及内部域名等。但**这只是防御性过滤，不是完整 SSRF 解决方案**。生产环境仍必须通过专用出站代理或防火墙：

1. 在 DNS 解析后和每次重定向后重复校验目标 IP；
2. 阻断私有地址、回环、链路本地、云元数据与保留地址；
3. 为任意 HTTP、模型 Provider 和 MCP 插件请求设置允许列表、时限及流量上限。

## 运行可靠性

当前 Agent 与工作流支持通过浏览器 Tick 执行，也已新增可选的独立 Node.js 后台 Worker（详见 [后台部署指南](BACKGROUND_WORKER.md)）。**仅上传源码不会自动启动 Worker**，必须由运维环境作为独立进程启动并守护，才能在关闭浏览器后继续推进。Agent/Workflow Tick 已接入 SQLite 原子租约（10 分钟有效期）和外部写操作的持久化副作用审计；并发领取、故障恢复后复用已确认结果、结果不明时阻断自动重放都已通过真实 PocketBase 测试。**但尚未实现完整的续租与严格 fencing，第三方系统若没有自身幂等机制仍无法保证 exactly-once。**生产建议先部署单 Worker、副作用操作启用人工审批，并持续观察队列状态。

## 验证方法

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm lint
pnpm build
pnpm test:e2e  # 需要真实 PocketBase，可串行执行完整集成测试
```

`pnpm test` 包含跨用户记录访问和接口权限的回归断言。另应在具备真实运行环境时执行 PocketBase API 测试、多用户 E2E、插件网络测试以及安全压力测试。构建或静态测试通过不等于生产就绪。
