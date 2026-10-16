# Smithery 插件市场 V2 · 真正可连接的 MCP 市场

## 目标

解决旧版市场检索狭窄、把未验证连接显示为已启用、GitHub 0 工具以及 `invalid_token` 提示不清楚的问题。采用“**搜索 → 详情/权限 → 托管连接 → 官方授权 → 工具发现 → 启用与试调**”流程，面向公司非技术员工的默认入口只暴露必要步骤。技术型用户的 MCP 公共目录、自建远程服务、调试日志折叠进高级区域。

## 技术边界与 API 合约

- **管理/发现 API** 使用官方 `https://api.smithery.ai`；**真正运行 MCP JSON-RPC** 则使用每个连接的 `https://smithery.run/{namespace}/{connectionId}`，两个地址不能混用。后台仍只接受当前已验证员工身份与加密 Key。原有遗留的 `server.smithery.ai/{slug}/mcp?api_key=...` 已停用，不能把 Key 写进 URL。
- 员工 Key 由服务端校验 `GET /servers?pageSize=1`，使用 AES-GCM 加密，前端只能看到尾号。401/403 单独显示“Smithery Key 无效”，连接失败/429/网络暂不可达不会错误地清除 Studio 登录。
- 插件搜索：`GET /servers?q=...&pageSize=24&page=N`，支持服务端分页/简短关键词、分类、已验证标识与响应状态。默认搜索**不会偷偷调用 LLM 翻译模型**；若 Smithery API 自身计费，仍按其实际条款执行，不能声称零成本。已有人工中文缓存能展示则复用。
- 当前 Key 的工作空间：`GET /namespaces`，不允许客户端伪造其他 Namespace 创建连接。
- 托管连接：`PUT /connect/{namespace}/{connectionId}`，`{transport:"http",server:"qualifiedName",name,metadata:{userId}}`。状态 `connected / auth_required / input_required / error` 不造假。授权按钮只能跳转可信的 `https://auth.smithery.ai` 或 `https://smithery.ai`。
- 完成官方 OAuth/输入配置后，按钮显式调用 `GET /connect/{namespace}/{connectionId}` 核对状态，`GET /.tools` 返回至少一个实际工具后才能启用。
- 工具执行仍使用原来的 `market_connections` + 员工 JWT/owner ACL + 既有 Agent/Workflow 执行器。托管 MCP URL 不含任何 API Key；后端从加密 `headers_sec` 恢复授权头。列表接口明确标记 `is_smithery`，并兼容修复早期暂存版本写成 `api.smithery.ai/connect/.../mcp` 的无效调用地址，原有连接 ID 不变。Agent 仅加载**本员工、已启用、探测成功且工具数大于 0**的连接，不能扫描其他员工工具。
- Key 移除/轮换立即停用托管连接，并清除旧授权缓存；完成新 Key 授权检查后更新 AES-GCM 凭据才能恢复。
- 主动「断开」托管连接，会调用 Smithery `DELETE /connect/{namespace}/{connectionId}` 远端撤销，成功后才删除本地连接；远端撤销失败时先停用本地工具并明确提示未完成远端撤销，允许恢复 Key 后重试。直接移除 Key 只保证本地停用，不应虚称已经远端撤销。
- 旧式 URL 如果包含 `api_key` 参数，连接会被隔离、关闭和遮盖/清理遗留查询参数；原有旧接口新建返回 410，引导到新的托管连接。不会偷偷迁移权限。
- 试调仅允许已验证发现的工具；未知工具拒绝。发布者明确只读且非破坏性标记才不需额外确认。否则试调需显式确认可能的写入风险，并且**网络结果未知时不自动重发写操作**；真正的 Agent/Workflow 生产执行仍受既有审批、租约和写操作幂等日志约束。

## UI

- 三列自适应插件卡片、分类快捷搜索、已验证发布者筛选、分页、已添加状态、插件能力详情与连接准备步骤。
- MCP 公共注册表、精选项的多次外网检索和后台调用留档按需加载：仅在打开「高级功能」时发起，并在折叠后暂停留档轮询；优先显示 Smithery 快连市场，避免非技术员工在首屏等待十余个无关外部请求。
- 连接卡片和管理状态使用后端显式返回的 `is_smithery` 标记，而不是通过包含 `/connect/` 的 URL 子串猜测连接来源，避免新的官方网关地址被误当成普通插件。
- 无 Key 直接显示清晰的 Key 获取入口与说明；有 Key 但 `invalid_token` 可以在同一页面更换 Key。连接不需要人工填写 MCP URL。
- `我的连接` 显示“可使用 / 继续授权 / 需要修复 / 旧版需重连 / 已停用”。即使用户看到“已创建”，`0 工具`仍属于待修复。提供验证授权、试调、停用、断开。
- 移动端支持独立全屏详情、遮罩关闭、关键操作不依赖鼠标 hover。
- 官网链接只打开可信 URL；OAuth 始终由用户在 Smithery 完成，不能在 ChatGPT 对话中输入密钥或承诺免授权。

## 测试与验收

```bash
pnpm test:smithery-market
pnpm test:smithery-integration
pnpm build
pnpm test:e2e:parallel
node --test tests/workflow-ui.chrome.mjs
```

测试连接真实的本地 PocketBase / SQLite/JWT 和一个仅监听 127.0.0.1 的模拟 Smithery API/MCP 服务；不使用实际 Smithery 账号，不调用真实 API 或有价 OAuth。验证 Key 校验失败、服务端搜索、Namespace 归属、`auth_required` 安全不启用、授权后的工具发现、密钥不出现在 URL、工具 JSON-RPC 实际走代理、跨员工权限拒绝、未知工具拒绝、潜在写操作确认、Smithery 远端撤销及 Key 移除后本地禁用。浏览器端执行相同的创建/授权/工具发现流程。

## 仍需外部真实验收

需要授权员工**在自己的独立版系统页面**配置 Smithery API Key、选择可用 Namespace，并对 GitHub/Notion 之类真实第三方服务完成官方 OAuth。然后试调只读工具和需要审批的写工具，核对 Smithery 使用条款、员工授权、调用费用及实时服务可用性。没有真实密钥前，不应称已完成付费第三方账户的生产级连接。

生产环境仍为 NO-GO；不要借本轮 UI 改造触发 PostgreSQL 迁移、推送 Git 或部署。
