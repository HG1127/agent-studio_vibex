# Agent Studio P0：Skill 导入、团队共享、试跑预检

开发分支：fix/studio-skill-import-and-sharing-20261026。尚未合并主分支、推送、部署或触碰生产数据。

## 修复一：导入规则

支持公开 GitHub 仓库首页、HTTPS .git 克隆链接、SKILL.md 文件页/Raw 地址，以及 tree/main/路径 的文件夹 URL。

仓库根目录导入先读取 GitHub API 的真实默认分支，再读取该分支根目录 SKILL.md；目录 URL 则定位该路径内的 SKILL.md。不允许任意域名、私网 URL、路径穿越、脚本执行或默认启用权限。

文件上传限制改为安全读取上限 64 KiB 和与后端匹配的 16100 字符数校验。中文 UTF-8 文件字节数可能超过 16 KB，但字符长度仍满足文本 Skill 要求。

## 修复二：安全共享完整 Agent 结构

保留最多八个顺序角色、拓扑依赖、阶段输入输出和完成标准；保留规范化能力需求的种类、读写权限意图、归属角色、必需标识，以及确定性文本质量断言。

不复制作者的角色工具授权、Skill ID、专属模型、私有 KB、外部连接 ID、工具候选标识或搜索词。通用内置工具白名单按之前的安全共享合同保留。

导入副本强制 require_approval=true 与 require_plan_review=true，接收人必须重新授权外部能力及 Skill。对循环、缺失依赖或无效角色信息拒绝创建共享快照，不默默丢失复杂结构。

## 修复三：试跑前置技能检查

客户端核对当前选中 Agent 每个角色引用的 Skill 是否仍然存在、处于启用已审核状态、具有绑定版本与相同 SHA-256。核验中不可启动新试跑；失败时显示角色、阻断原因及 Skills 管理入口。

真正启动时后端仍需原有所有权和版本审核复验。已启动任务的冻结快照不受影响。

## 测试及发布边界

使用临时 PocketBase/SQLite、合成团队共享数据、模拟模型、Chrome 浏览器进行核验。保留既有未跟踪文件 ops/v28-isolated-preview.mjs。

## 已执行的验收（2026-10-26）

- 单元测试：Skill 仓库/目录导入及五角色安全共享专项 13/13 通过，新增 Skill 预检专项测试纳入 pnpm check。
- 真实 GitHub 仓库 alchaincyf/steve-jobs-skill：GitHub API 返回 HTTP 200、默认分支 main、根目录 SKILL.md HTTP 200，中文正文长度约 15554 字符。
- 浏览器：Chrome 通过 1/1；约 15553 字符中文 SKILL.md 的 UTF-8 文件超过 16 KB，仍成功通过上传、审核、A/B 启用门禁；无真实模型计费。
- 隔离后端：28/28 PocketBase/Worker/知识库/团队共享/模型/工具/迁移 E2E 通过；五角色跨员工共享经过真实 SQLite 验证。
- TypeScript 与 Vite 生产构建通过，112 个构建资源隔离检查通过；新代码 ESLint 检查通过。
- useAgentRun.ts 还存在 5 个以前就有的 React hooks lint 问题，不作为本轮新逻辑合格性的依据，需要后续独立治理；本轮新增的依赖稳定性警告已修正。

主分支合并及正式内网部署属于独立门槛，必须核对 GitHub CI、维护窗口、空闲租约、数据备份与回滚；不能把隔离验证冒充员工真实生产 UAT 或模型质量提升。
