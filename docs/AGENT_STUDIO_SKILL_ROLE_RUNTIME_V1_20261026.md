# Agent Studio Skill/Role Runtime V1 — 验收与部署边界

开发分支 feat/skill-role-runtime-20261026。仅隔离开发，不推送 main，不部署内网。

## 用户使用路径

1. 工具与连接 > Skills 能力中心。通过 GitHub 公开 SKILL.md URL、文件或粘贴文本导入。
2. 审阅原始内容、来源与安全提示，明确选择“审核并启用”。每次重新导入相同 slug 会生成新版本，不自动审核。
3. Agent 创建 / 编辑的“角色与任务”中，为指定角色绑定至多两个经过批准的 Skill 版本。
4. 保存 Agent。运行启动时后端按本人所有权、批准、活跃状态和 SHA-256 固定所有绑定版本。
5. 每次只在当前角色执行时加载该角色的方法文本，记录不含原始指令的 skill_loaded 事件。工具授权与审批完全独立。

## 安全边界

- 后端根据真实 studio_users e.auth 身份隔离 Skill，拒绝伪造的 X-Rh-User-Id。
- 专用 schema_journal 迁移新增 agent_studio_skills 与 agent_studio_skill_versions，不覆盖原数据库。
- 版本更新不篡改正在运行的快照；停用/撤权阻止新运行启动。
- URL 仅允许公开 GitHub Raw/Blob 的 SKILL.md，不能下载任意站点或执行脚本。
- 外部脚本、references 与 assets 暂不加载；allowed-tools 只是元数据，绝不改变 Harness 授权。
- 所有内容按外部低信任资料处理，并限制长度与数量。

## 验收

- node --test tests/skill-role.integration.mjs：真实临时 PocketBase / SQLite + 本地模型，检验导入、审批、跨角色隔离、快照、版本及不增加工具权限。
- pnpm check：单元、TypeScript、构建与打包检查。
- `pnpm test:worktree:chrome`：真实 Chrome 员工登录，Skill 文本导入、人工审核、未审核 V2 与可绑定 V1 历史浏览、角色编辑及保存、五角色复杂执行与原有人工审批，1/1 通过、控制台错误 0、HTTP 400 0。模型为隔离 fixture，不能当作真实模型质量评分。

## 2026-10-26 最终隔离验收与安全审查

- `pnpm check`：356 项单元测试全部通过，TypeScript 与 Vite 生产构建成功，112 项生产产物隔离检查通过。
- `pnpm test:worktree:e2e`：28/28 项隔离 PocketBase/SQLite/Worker 后端端到端测试通过，含数据库升级、团队数据隔离、知识库、工具授权与执行器。
- `node --test tests/skill-role.integration.mjs`：真实独立员工账号的跨租户访问/审批/停用均被拒绝，伪造员工头无效；角色 Skill 版本、内容哈希、运行快照、使用事件和后续角色隔离完成核验。
- 公开 GitHub 仓库的 `anthropics/skills/skills/pdf/SKILL.md` 已通过实际固定 GitHub API 下载到隔离环境：名称 `pdf`，正文约 8034 字符，仍为未审核草稿，脚本没有执行。
- 数据迁移使用新增的 `agent_skills_0001_registry` 版本记录，累计 15 项，升级及重新启动具幂等性。
- 在代码复核中新增了 AI 修订保护：完整编辑器及快捷编辑器的 AI 修订，只能保留既有角色已经审核的 `skill_refs`，不能自动新增/替换/删掉；预览展示绑定记录；角色中打开 Skills 使用新标签页避免丢失草稿。旧 Agent 无 Skill 字段的兼容性也已修复。角色修订专项测试 45/45 全部通过。
- 使用受控 Worktree 测试启动器，避免在共享 node_modules 上安装、删除或覆写依赖；未清理原未跟踪的 `ops/v28-isolated-preview.mjs`。

- 最新 Chrome 完整复验 **1/1 PASS**，模型调用/工具执行使用临时隔离服务；角色 Skill 管理入口默认在新标签页打开，原有 Agent 草稿仍保留。Console errors 0、HTTP 400 0。
- 最新代码经 ESLint 校验无错误；变更文件安全扫描中没有发现常见 API Key、私钥、GitHub Token 或数据库连接串，`git diff --check` 通过。

**当前发布状态：仅 feature 分支，不等于已经在内网环境对员工开放。下一次发布必须按受控运行时变更审批，备份和空闲检查后进行。**

## 尚未支持

市场联邦搜索、ZIP/可执行脚本、reference 按需加载、团队级审批共享、真实 MiniMax 的盲测效果评估。示例 Skill 不代表马斯克本人提供或认可。
