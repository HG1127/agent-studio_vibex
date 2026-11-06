# Agent Studio Preview24 — 桌面更新发布验收

日期：2026-11-04（Asia/Singapore）。范围：桌面安装包、应用内更新与默认更新源；不代表业务后台迁移或 WorkBuddy 研究任务整体收尾。

## 结论

0.1.0-preview.24 已发布到公司默认 stable 更新源。员工电脑按现有服务器配置解析的默认入口已返回新版，原发布公钥验签通过，安装包 HEAD 为 200 且长度匹配。最终包已在两套隔离安装中真实完成 Preview21 → Preview24、Preview23 → Preview24 的应用内升级。员工正式安装 `D:\Agent Studio` 在最后核查时仍是 Preview23；本轮未强制重启或替换该安装。

## 固定发布物

- 文件：`AgentStudio-Setup-0.1.0-preview.24-win-x64.exe`
- 大小：275,958,219 bytes
- SHA-256：`222e31e986901f549ccba62977e8127f257c150299fe1027eb3243d60c596a38`
- 签名清单 SHA-256：`3755391567ba68db3a111fbe9e4e48835a4319916ab1bb7e4207f89cb3caae62`
- 默认入口：`https://192.168.1.133:8443/desktop-updates/stable/latest.json`
- 不可变安装包：`https://192.168.1.133:8443/desktop-updates/0.1.0-preview.24/AgentStudio-Setup-0.1.0-preview.24-win-x64.exe`
- 使用原有 Ed25519 发布密钥及客户端内置公钥；未生成替代密钥，未传送或展示私钥。
- 发布签名不等于 Windows Authenticode 签名。本版 EXE 尚未进行 Authenticode 签名。

## 修复依据

旧更新验收脚本只打开版本中心，未启动真实工作台与本机连接服务。旧版在读取本机状态时因此报错；修改新包并不能改变仍在运行的旧版更新器。

本轮撤回了上一轮的测试模式单实例绕过和更新安全检查绕过。改为从旧安装包实际打开工作台，等待真实内置连接器就绪，再使用版本中心执行检查、下载、重启更新。测试脚本只在独立测试进程中模拟明确的更新确认响应，没有修改被测试旧包或跳过其本机任务检查。

验收脚本增加：安装按钮可用状态检查、阶段日志、有界等待、界面错误即时收集、启动回执验证、配置逐字节比较、按确切安装路径及测试配置核验 PID 的清理；复用安装时使用独立更新目录，不覆盖同版本已发布文件。

## 本轮验证

| 验证项 | 结果 | 原始证据 |
| --- | --- | --- |
| 桌面回归与新增安全门测试 | 56/56，通过；0 失败、0 跳过 | `wc_job__Og2lXG_FCjjTqq-` |
| 最终构建、版本祖先基线、类型与前端构建、生产包隔离 | 通过；9,873 个安装清单文件 | `wc_job_3Z_A9k8jTcMeE7zY` |
| 最终打包版业务 Smoke Test | 通过 | `wc_job_kPDldY6tAy7cQOIJ` |
| 最终桌面发布审计 | PASS；未包含私有配置 | `wc_job_fEby-6OAjT7jR_bv` |
| Preview23 → Preview24 完整升级 | PASS | `wc_job_LZKorDU_CXTiX-VM` |
| Preview21 → Preview24 完整升级 | PASS | `wc_job_pQlYpWbykUWv9Beq` |
| 公司 HTTPS 清单验签及整包下载哈希 | PASS；证书校验启用 | `wc_job_6y3OJ8HJkrKSuYS9` |
| 默认更新源从员工电脑解析及校验 | PASS；当前安装23、可用更新24 | `preview24-employee-default-feed-visible` |

最终 Smoke Test 覆盖：独立员工认证、伪造身份拒绝、内置连接器恢复、单主窗口管理、电脑选择与连接状态、真实文件任务、未授权任务拒绝、界面内授权审批、取消审批后配置不变，以及 sandbox/contextIsolation/nodeIntegration 安全设置。该次 Smoke Test 未运行真实 WorkBuddy 冷启动或研究消息发送；不能据此声称这些业务动作已完成。

两次升级都先拒绝被篡改的清单，然后验证真实下载、旧进程退出、同目录安装（含空格路径）、新版实际界面启动和健康回执。隔离账号标记及完整 `desktop.json` 均逐字节不变。

### Preview23 → Preview24

- 事务：`12338d4e-f07a-486e-a56b-f8ddc6292b5b`
- 新进程健康回执：version=0.1.0-preview.24，pid=4768
- 结果：`.tmp/update acceptance 4xV7FT/acceptance.json`
- 阶段：backup → installing → starting → succeeded

### Preview21 → Preview24

- 事务：`30cb28da-32e4-4fcf-b6dd-88b5be49416e`
- 新进程健康回执：version=0.1.0-preview.24，pid=16996
- 结果：`.tmp/update acceptance wFLcvj/acceptance.json`
- 阶段：backup → installing → starting → succeeded

回滚失败情景由本轮回归测试覆盖；未另行在员工正式安装中故意制造更新失败。

## 发布与可恢复性

先上传不可变版本安装包与验证清单，在服务器检查 SHA-256 和长度，再从员工电脑通过 HTTPS 完整下载复核。默认清单最后在锁内按旧清单哈希做比较后原子替换，避免覆盖并发发布。

- 更新目录：`/www/agent-studio-desktop-updates/`
- 旧 stable 清单版本：Preview21
- 旧清单 SHA-256：`36948bae9f43a3bb99e3db38f8b0c0a8f1013891112c38a3c9b94ba19d003367`
- 旧清单备份：`/www/agent-studio-desktop-updates/.release-backups/stable-36948bae9f43a3bb99e3db38f8b0c0a8f1013891112c38a3c9b94ba19d003367.json`
- 临时文件传输服务已关闭。
- 未更改业务服务、数据库、员工账号、模型连接、正式设备授权；未推送远端 Git。

发布后通过实际员工 `desktop.json` 推导默认 feed，验证 HTTP200、原公钥签名、新版号24以及包长度275958219。未修改该员工配置，未将其切换到临时验证地址。

## 使用与范围限制

员工从应用内“版本更新 → 检查更新 → 下载更新 → 重启更新”操作。重启前保存工作、结束或取消正在执行的本机任务与待处理授权。无须下载源码 ZIP、手动解压、重新选择安装目录或修改更新地址。

WorkBuddy 的研究任务完成、结果完整性及此前对话截断后的结果恢复，需按其独立任务证据判断。本报告仅确认本轮桌面版本发布和升级链路，不用窗口打开或升级通过替代研究结果验收。
