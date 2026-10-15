# Agent Studio VibeX V7.5 — 工具调试权限、真实写入确认与租户一致性

此版本在 V7.4（包括 PocketBase Headless 测试防弹窗修复）源码上直接改进，保留现有 VibeX App ID、RunningHub 登录与计费、React + TypeScript、PocketBase + SQLite、独立 Worker、Agent/Workflow 引擎和已有 API 路由。

**安全约束**：本轮没有打开任何浏览器、没有访问 PocketBase /_/ 管理页面、没有修改线上数据库。集成测试继续通过 tests/helpers/headless-pocketbase.mjs 运行隔离临时 SQLite。

## 1. 已确认的权限漏洞和修复

问题位置：pocketbase/pb_hooks/tool_hub_api.pb.js，POST /api/tool-hub/debug 与 POST /api/llm/tool-hub/debug 共用的外部连接分支。

此前代码仅 findRecordById("tool_connections", connection_id) 后校验 enabled，**没有核验 rh_user_id 是否属于当前登录账号**。如果连接 ID 被其他用户掌握，可能使用该连接发起未经授权的外部请求。

现在在读取工具名称、URL、密钥与 enabled 状态之前，先比对：

    String(conn.get("rh_user_id") || "") === uid

不存在或归属不一致统一返回 HTTP 404 connection_not_found，不公开是否已启用、内部 URL 或凭证。访问其他账号调用记录也继续返回隔离后的列表。

真实 PocketBase 回归测试针对两个 debug URL 分别覆盖 401 未登录、404 非本人、读写请求无外发、本人 GET/POST 正常工作。

## 2. 统一真实外部写入确认

问题：过去在工具中心“真实试跑”、工具连接“保存前测试”及“卡片重试”中，点击一次按钮就可能发送外部 POST；有潜在订单创建、消息发送、数据修改及真实账单风险。

现在以下三条写入口都要求服务端收到真正的 JSON 布尔值 confirm_write:true：
- POST /api/tool-hub/debug
- POST /api/llm/tool-hub/debug
- POST /api/tool-connections/test（已保存连接与未保存表单测试均适用）

凡后端实际配置为 POST，缺少确认或传入字符串 "true" 都返回 HTTP 409 write_confirmation_required，不调用外部 HTTP。服务端读取已保存的真正 method，不依赖客户端声称使用 GET。

前端：
- ToolHub DebugConsole：外部 POST 显示风险声明和复选框；未勾选时执行按钮不可点击；调用后复选框复位，改参数会撤销确认。
- ToolConnections ToolFormCard / ToolCard：POST 测试前确认、参数变化后取消确认；每次调用后自动取消确认。
- POST 卡片一键“重新测试”不会实际重放写请求，而是展开参数输入并提示确认；GET 仍可以直接重新测试。
- GET 是按 HTTP 语义约定的读取操作，不能保证第三方服务实现一定不会产生副作用，因此 UI 保留相应提示。

这项确认仅用于用户主动点击的 ToolHub/ToolConnections 调试。Agent/Workflow 的正式写操作仍由既有 require_approval 设置、外部副作用审计与幂等保护控制；这次没有擅自改变 Agent 的业务审批策略，也不能把单个布尔确认宣称为严格 exactly-once。

## 3. 租户内唯一工具名修复

pocketbase/pb_hooks/tool_connections_api.pb.js 创建和更新查询此前有不带 rh_user_id 的全局工具名称查重。现统一改为基于当前账号的名字检查，允许 A、B 两个账号使用相同工具名，避免信息侧漏和不必要的命名冲突。

## 4. 测试与发布

新增 tests/tool-debug.integration.mjs，使用安全 Headless PocketBase 与本地 mock HTTP 上游，验证：
- 原有两个 ToolHub debug API 未登录/跨账号禁止；
- 无确认的 POST 不会接触上游服务器；
- GET 无需写确认且可真实调用；
- 有效一次性确认仅执行本次 POST；
- ToolConnections 已保存/未保存的 POST 测试均需确认；
- 不同账号可使用相同名称；
- 工具调用日志按登录账号隔离。

验证命令：
    pnpm test
    pnpm test:tool-debug
    pnpm test:e2e
    pnpm build

CI 新增独立 ToolHub/ToolConnections Debug 安全检查。注意本地测试依赖临时随机管理员的隔离数据库，不能代表线上网关和真实第三方服务的全部风险。

VibeX 上传：
- 选择 app/：导入 V7.5 应用 ZIP（包含相关 React 页面/组件与 package.json），选择 Extract；
- 选择 pb_hooks/：导入 V7.5 后端 ZIP（包含 tool_hub_api.pb.js、tool_connections_api.pb.js 及前期共享模块），选择 Extract；
- 严格核对 ZIP 目标相对路径，禁止额外的 project/app 包装目录；
- 完整源码包仅用于备份和版本管理，不能作为一个 ZIP 整体上传到单个 Source 目录。

上线前仍必须核对 VibeX 网关身份注入并禁止公网直接访问未授权 PocketBase API；不发布的话线上使用者仍是旧版本。

## 5. 后续工作（未实现）

- 外部工具级别的权限范围/OAuth scopes、审批凭据与超时租约、工具调用签名和审计策略自动化；
- 完整 SSRF 防护（含 DNS 重绑定、内网/元数据地址阻断、出口网络策略）、请求配额和域名白名单；
- 所有 Agent / Workflow / ToolHub 统一完全服务化的 ToolExecutor；
- 真实生产多 Worker fencing、持续执行监控和全链路耗时告警；
- PostgreSQL/pgvector 迁移、语义检索、工具市场企业级 RBAC 等。

数据库继续使用 SQLite；只有在真实性能数据和业务需求明确后才考虑迁移。
