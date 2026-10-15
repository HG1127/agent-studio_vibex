# Agent Studio V7.7：内部 Agent 模板安全共享

定位：公司内部员工复用已验证的 Agent 配置，不增加公开模板市场和商业化收费功能。保留 VibeX App ID、RunningHub 身份、PocketBase/SQLite、原有 Agent、工作流和定时任务。

## 功能与保护机制

- 新增“Agent 内部共享”页面，路由为 /internal-templates，侧栏及内部任务总览可进入。
- 原作者选择自己的 Agent，先获取服务端预览，仅显示 goal、task_scope、deliverables、五种内置 tools、task_plan、done_criteria。
- 预览中的自由文本可能含内部机密，原作者必须人工检查、勾选确认；服务器比对预览散列及明确布尔确认，修改后的旧预览不可继续使用。
- 分享码长 48 位，创建时只返回一次；数据库仅存保存域隔离 SHA-256 哈希。七天有效，只能由另一位获授权的员工领取一次，可以撤销。
- 创建邀请时保存经审核且剔除额外字段的不可变快照。即使随后原 Agent 被编辑或删除，领取内容仍为审核时的版本。
- 领取到自己的 Agent 账号，知识库 ID 清空，外部工具连接与模型凭证不继承，强制 require_approval 为 true；不会自动运行。
- 分享记录不会泄露原始分享码和领取者身份。工作台中接收方会看到自己的独立副本。
- 只有获得授权的公司员工才能访问，不提供全局可搜索的共享目录。

## 重要环境前提

AGENT_STUDIO_INTERNAL_SHARE_USERS 必须设置为由公司授权的真实 RH 用户 ID 组成的逗号分隔列表。未配置时返回 503 并拒绝开启共享；未授权返回 403；local-anon 禁止使用。

该员工名单仅提供附加授权限制，不能代替身份认证。必须保证 VibeX/RunningHub 可信网关验证令牌、覆盖客户端伪造 X-Rh-User-Id，且员工不能绕开网关直接访问原始 PocketBase API。

## 数据库变更

- internal_0001_template_invites：创建邀请归属、来源、散列、状态与过期字段；
- internal_0002_template_snapshot：新增不可变 recipient-safe 配置快照字段。

两项均通过现有非破坏性 schema journal 应用。历史没有快照的数据不得领取，应该重新发起审核分享。

## API 与自动验收

- GET /api/internal/templates：本人 Agent 标题与本人邀请状态。
- POST /api/internal/templates，action=preview/create/redeem/revoke：预览、一次性确认分享、领取、撤销。
- pnpm test:internal-templates：真实临时 PocketBase，校验租户所有权、员工白名单、散列确认、过期、撤销、仅领取一次、快照不可变与敏感配置剔除。
- pnpm test:migrations：包含内部两项迁移后的旧数据兼容及重复启动幂等。
- pnpm test：Goja 模板白名单纯函数回归。
- pnpm test:e2e、pnpm build：全流程集成与前端构建。

所有集成测试继续使用无浏览器启动器，不打开 PocketBase 管理页，也不使用生产数据。

## 尚未实现

组织用户目录、团队知识库跨员工授权、公司领导全员看板、审批转交、离职自动撤权等需要后续确认权限规则。自由文本中的所有敏感信息无法仅凭字段白名单自动识别，人工审核仍然不可省略。

**该功能在源码层落地，不等于 VibeX 正式生产部署已经完成。** 参见 INTERNAL_GO_LIVE_CHECKLIST.md。
