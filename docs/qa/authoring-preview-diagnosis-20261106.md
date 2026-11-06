# Agent Studio 需求预览失败诊断与修复 — 2026-11-06

## 用户现象

Preview26 桌面端「设计 Agent」第一步点击「预览要求与能力依赖」后，显示：

> 需求预览未完成，请检查登录和服务连接后重试。

页面本身可打开，模型列表也能加载，但需求预览未完成。

## 根因（已核实）

不是模型调用失败。需求预览发生在调用模型之前，流程为：

1. `POST /api/authoring/requirements`：保存员工原始需求和幂等请求编号。
2. `POST /api/authoring/preview`：读取原始需求，编译能力依赖并返回预览。
3. 员工确认预览后，才允许调用模型生成 Agent 草案。

公司 LAN 的桌面更新源当前稳定版本为 `0.1.0-preview.26`，但业务后端仍指向旧 release：

- 当前目录：`/srv/agent-studio-lan/current`
- 实际目标：`/srv/agent-studio-lan/releases/43acc2f71764d4469d038f07edf7cc2f912370e2`
- PocketBase：`127.0.0.1:7100`
- `/api/health` 返回 HTTP 200，说明 PocketBase 进程可用。
- 旧 release 中缺少以下文件：
  - `pocketbase/pb_hooks/authoring_requirements.pb.js`
  - `pocketbase/pb_hooks/modules/authoring_requirements.js`
  - `pocketbase/pb_hooks/modules/capability_plan.js`
  - `pocketbase/pb_hooks/modules/agent_run_retry.js`
- 在旧 release 的 Hooks 目录中未找到 `/api/authoring/requirements`、`/api/authoring/preview` 的路由实现。

匿名探测请求由全局身份认证中间件拒绝并返回 401，这是预期的未登录保护；本次未使用员工 JWT 伪造已登录请求。结合实际运行目录、Hooks 文件清单和代码路由定义，已确认当前后端版本没有本轮所需的需求预览实现。桌面 EXE 更新不会自动替换 PocketBase Hooks 或 Worker。

## 源码修复

- 新增 `src/lib/authoringErrorText.ts`，按 HTTP 状态与错误码区分：
  - 401：登录状态失效；
  - 403：账号权限不足；
  - 404：服务端缺少原始需求保存/能力预览接口，并明确提示需要更新 PocketBase Hooks；
  - 409/413：幂等冲突或输入长度限制；
  - 5xx：服务端处理错误；
  - Timeout / 网络异常：给出连接和重试建议。
- `useHome.ts` 记录当前失败阶段（原始需求保存或能力预览），避免将所有异常误报为登录问题。
- 若第一步保存已成功、第二步预览返回 404，界面明确告知原始需求已保存。
- 保留原始输入和幂等 request ID；用户再次点击时复用同一需求记录，不重复写入、不提前调用模型。
- 修正 Chrome 测试助手中已过时的账号菜单定位器，避免把测试脚本定位器错误误报为产品失败。

## 验收结果

| 检查 | 结果 |
|---|---|
| 需求错误诊断单测 | PASS，2/2 |
| 隔离 PocketBase/SQLite 需求链、身份权限、幂等与重启测试 | PASS |
| Chrome 模拟缺失预览路由（HTTP 404） | PASS |
| 404 时原始需求已保存提示 | PASS |
| 失败后再次预览复用相同 request ID | PASS |
| 预览成功后展示能力依赖 | PASS |
| 需求预览阶段模型调用次数 | 0 |
| TypeScript + Vite 构建 | PASS |
| 生产试验资源隔离检查 | PASS，119 项 |

## 配套后端包

- 版本：`0.1.0-preview.27`
- 文件：`.tmp/desktop-output/AgentStudio-Backend-0.1.0-preview.27-source.zip`
- 大小：650,795 bytes
- SHA-256：`4e46fca4cd921a88ca5db144a9b25c1b54297d80ddd7827db6a3918ed2d5050c`
- 文件数：135
- 必需 Hooks 均包含；逐文件 SHA-256 全部匹配；未包含数据库、环境文件、私钥或凭据文件。
- `release-manifest.json` 明确标记 `productionDeployed: false`。

## 生产部署边界

本轮没有改动生产服务器、PocketBase、Worker、SQLite、员工账号、密钥或当前 stable 更新清单。

公司 LAN 发布规程要求：

1. 将经过审核的服务端代码合并到 GitHub `main`；
2. 等待该完整 SHA 对应的 Agent Studio quality CI 成功；
3. 运维人工审核后，执行 SQLite 与附件一致性备份及恢复预检；
4. 在维护窗口切换版本化 release，保持 `pb_data`、密钥和迁移目录原位；
5. 重启 PocketBase/Worker 后，使用员工身份验证需求保存、需求预览、Agent 创建与历史数据；
6. 验证失败则回滚代码，不自动恢复或清理业务数据库。

上述生产步骤尚未执行，因此本报告不宣称员工现网已经恢复。Preview26 stable 更新源保持不变。
