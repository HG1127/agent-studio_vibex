# Agent Studio Preview25 — 桌面更新发布验收

日期：2026-11-05（Asia/Singapore）。范围：Windows x64 桌面安装包、应用内更新源、电脑工作区 UI、Agent 任务重试与生命周期前端/后端代码验收。此报告不代表 PocketBase/Worker 业务后端已部署。

## 发布结论

`0.1.0-preview.25` 已发布到公司默认 stable 更新源。远端 HTTPS 清单通过客户端内置 Ed25519 公钥验签；安装包 HEAD 返回 200，完整 HTTPS GET 下载后 SHA-256 与发布清单一致。Preview24 → Preview25 的真实应用内升级在独立测试安装中完成；员工正式安装目录未被本轮升级脚本触碰。

## 发布物

- 安装包：`AgentStudio-Setup-0.1.0-preview.25-win-x64.exe`
- 大小：275,963,600 bytes
- SHA-256：`a89e4bbc16f14dc42660698419b6623348c9d29592c5cb4e842113623f777527`
- 签名清单 SHA-256：`2be6ae345d19a9a5f73770547eb683fb851b3e8a0e4c2f64ae0273adce501fa0`
- 默认入口：`https://192.168.1.133:8443/desktop-updates/stable/latest.json`
- 不可变安装包：`https://192.168.1.133:8443/desktop-updates/0.1.0-preview.25/AgentStudio-Setup-0.1.0-preview.25-win-x64.exe`
- 更新前清单 SHA-256：`3755391567ba68db3a111fbe9e4e48835a4319916ab1bb7e4207f89cb3caae62`
- 更新前清单备份：`/www/agent-studio-desktop-updates/.release-backups/stable-3755391567ba68db3a111fbe9e4e48835a4319916ab1bb7e4207f89cb3caae62.json`
- 安装包未进行 Windows Authenticode 代码签名；发布清单仍使用原有 Ed25519 密钥，未生成或替换客户端公钥。

## 本版纳入内容

### 桌面电脑工作区

- 顶部统一设备控制栏，集中当前电脑选择、连接状态、暂停/恢复、使用电脑及连接管理。
- 桌面主体聚焦文件与浏览器工作区，移除重复设备信息卡、重复连接按钮和重复说明。
- 设备清单、搜索、刷新与撤销管理收纳至默认折叠入口；保留账号归属、状态核验与授权保护。

### Agent 任务

- 失败任务可在原任务上直接重跑，保留任务 ID、失败原因及历史 Attempt。
- 快速模型选择在跨页面恢复后保持正确；重试完成后与真实执行模型同步，不修改已保存的 Agent 方案。
- 删除 Agent 后，关联任务及历史 Attempt 归档为只读记录；客户端页面保留历史查看与导出入口。

## 验收结果

| 验收项 | 结果 |
| --- | --- |
| 版本祖先基线、TypeScript、前端生产构建、安装包生成 | PASS |
| 桌面安装包源码与资源完整性审计 | PASS；9,801 个资源文件，未包含私有配置 |
| 桌面布局打包 Smoke Test | PASS；顶部工具栏、电脑工作区、设备管理折叠入口均存在；默认收起；重复标题/连接按钮/选中设备行均不存在 |
| 连接器真实 Chrome + PocketBase 验收 | PASS；10/10 项 |
| 电脑工作区真实 Chrome + 文件运行时验收 | PASS；12 项，25 个隔离任务，0 次模型调用，未修改用户文件 |
| Agent 原位重试与生命周期集成测试 | PASS |
| Agent 快速模型选择真实 Chrome 回归 | PASS；详情页重试、任务列表重试、模型切换、历史 Attempt、删除 Agent 只读、无重复任务记录 |
| Agent 外部副作用与幂等回归 | PASS |
| 定时任务与计划执行回归 | PASS |
| 应用内更新单元/回滚回归 | PASS；23/23 |
| 桌面控制器回归 | PASS；56/56 |
| Preview24 → Preview25 真实签名更新验收 | PASS；篡改清单拒绝、真实下载校验、旧进程退出、同目录安装、新版健康回执、用户配置逐字节保留 |
| 公司 HTTPS 默认清单验签与安装包 HEAD | PASS；200，证书校验启用，长度 275,963,600 bytes |
| 公司 HTTPS 完整安装包下载 | PASS；275,963,600 bytes，SHA-256 完全匹配，证书校验启用 |
## 限制与未包含项

- 带 `--application-cold-start` 的额外 WorkBuddy 原生应用冷启动 Smoke Test 遇到 `application_user_takeover`（检测到本机键鼠活动）而安全停止；未绕过该保护，也不将其报告为通过。普通打包桌面 Smoke Test 与设备布局断言已通过。
- 本轮发布的是桌面客户端与默认更新源；没有部署 PocketBase/Worker 业务后端。Agent 重试、Agent 删除归档等服务端能力需配套部署当前 `pocketbase/pb_hooks` 后再在业务环境启用。
- 独立连接器下载包在构建工作区生成（版本 `0.1.0-preview.27`），桌面安装包内已包含该连接器。本轮未单独发布网站 `/downloads` 静态资源。
- 未推送远端 Git、未创建发布 tag；本次安装包由 Preview25 工作区构建并已发布到更新源。
- 未强制替换员工正式安装；员工可从桌面托盘菜单「版本更新」检查并安装，安装目录与账号配置按更新事务保留。
