# Agent Studio Preview26 — 发布与验收报告

日期：2026-11-05（Asia/Singapore）。平台：Windows x64。版本：`0.1.0-preview.26`。

## 发布结论

<badge>桌面客户端已发布</badge>

Preview26 已构建、通过桌面单元测试和隔离打包 Smoke Test，并通过 Preview25 → Preview26 的真实应用内升级验收。已将签名清单原子发布到公司默认 stable 更新源；HTTPS manifest 与安装包 HEAD 均返回 200，使用公司根 CA 的完整 HTTPS 下载后 SHA-256 与发布清单一致。

## 本版修复

- Agent 原位重跑：重跑 API 路由注册在核心 Agent Engine Hook，保留原任务 ID、幂等请求和历史 Attempt。
- 本机执行超时：执行器窗口最长 105 秒，保留 15 秒回执余量，覆盖本机最长 90 秒审批等待；避免旧 65 秒上限导致任务提前进入 `unknown`。
- 模型设置：移除试跑页面重复模型选择入口，统一从「资源与设置」选择模型；重试沿用选择但不改写已保存 Agent 方案。
- Agent 生命周期：删除 Agent 后关联任务停止并只读归档，历史记录保留。

## 验收结果

| 项目 | 结果 |
|---|---|
| `pnpm check`（全量单测 + TypeScript + Vite 构建） | PASS；123 个单测文件全部完成，修复后的完整检查退出码 0 |
| Agent 生命周期集成 | PASS；原任务 ID、Attempt、预算、幂等、归属和删除归档 |
| 本机执行器集成 | PASS；真实隔离 Chromium、PDF、XLSX 与审批门禁场景 |
| Agent 重跑真实 Chrome 回归 | PASS；详情页/任务列表重试、模型切换、Attempt 历史、删除只读、无重复任务 |
| 桌面 Electron 单元测试 | PASS；56/56 |
| 桌面安装包 Smoke Test | PASS；隔离 PocketBase、员工 JWT、伪造身份拒绝、本机连接器与工作区布局 |
| Preview25 → Preview26 应用内升级 | PASS；篡改清单拒绝、下载校验、备份、安装、新进程健康检查、用户数据保留 |
| 公司 HTTPS manifest / installer HEAD | PASS；均为 200，证书由公司根 CA 验证 |
| 安装包完整 HTTPS 下载 | PASS；275,966,526 bytes；SHA-256 完全匹配 |

## 发布物

- 安装包：`AgentStudio-Setup-0.1.0-preview.26-win-x64.exe`
- stable 更新清单：`https://192.168.1.133:8443/desktop-updates/stable/latest.json`
- 安装包 URL：`https://192.168.1.133:8443/desktop-updates/0.1.0-preview.26/AgentStudio-Setup-0.1.0-preview.26-win-x64.exe`
- 安装包大小：`275,966,526` bytes
- 安装包 SHA-256：`350e273775940337e5dc3130f14b4c967f59014df8c6b2c8f97c572c8cd2ed71`
- stable manifest SHA-256：`089b45a60fc777736591542638a4eece12f4f8a1e5aa912e783480f29caed773`
- 配套后端源码包：`.tmp/desktop-output/AgentStudio-Backend-0.1.0-preview.26-source.zip`
- 后端源码包 SHA-256：`63d09836fe68681bfd5c0982b8ba0300dff1de3ce1ca824a893fd50c889d4e8e`

## 未完成的生产闭环与限制

1. **PocketBase/Worker 尚未部署 Preview26 Hooks。** 当前公司 LAN 服务器 `agentstudio-lan` 的运行目录仍指向旧 release（commit `43acc2f71764d4469d038f07edf7cc2f912370e2`），其中缺少 `modules/agent_run_retry.js`。因此，生产环境的重跑接口 404 不能仅靠桌面 EXE 更新解决；必须把同版本 `pocketbase/pb_hooks` 与 Worker 按公司 LAN 部署规程，经 GitHub main 完整 CI、人工审批、备份和健康检查后部署。
2. 当前改动仍在 `codex/desktop-release` 工作树，尚未推送 GitHub main、未创建正式 Git tag。LAN 部署规程明确禁止从未经过 main CI 的工作树直接替换生产 Hooks。
3. Windows Authenticode 代码签名未配置；应用内更新清单仍由既有 Ed25519 密钥签名并由客户端内置公钥验签。
4. 本轮真实 WorkBuddy 完整研究任务未作为通过项；打包 Smoke Test 中 `nativeFileApplications`、`electronColdStart` 和 `electronObservation` 未执行/未声明通过。

## 员工升级方式

员工可从 Agent Studio 托盘菜单「版本更新」检查 stable 频道并安装 Preview26。不要在任务执行中或存在未处理本机审批时强制退出客户端。
