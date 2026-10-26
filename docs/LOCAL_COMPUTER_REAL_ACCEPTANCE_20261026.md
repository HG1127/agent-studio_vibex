# 2026-10-26 本机能力真实环境验收

## 结论与适用范围

限定测试场景的功能验收全部通过：用户已有的 MiniMax-M3.1-Flash 连接完成真实截图识别、网页输入/点击、文件新建/回读、固定程序启动，以及原生 Windows 桌面截图定位、输入、点击和结果核验。

这些结果来自分项、逐次审批的测试，不是一次无人介入完成全部步骤。浏览器成功后，模型重复检查目录，本轮由操作者停止，再用明确的三步专项指令完成文件和程序验收。原生桌面最后使用明确的顺序指令通过，历史失败和重复截图记录保留。未验证 Word、Excel、ERP 等业务软件；公司生产 UAT、长期运行及其他业务流程仍为 NO-GO。

## 环境与已部署版本

- 独立 Agent Studio：`https://192.168.1.133:8443`，Daniel 员工身份；PocketBase/SQLite + 原 Node Worker。
- 服务器运行版本：`eb103fe6ea0bb54a0ba2fad0c3278e5ca869eddf`。通过已有部署器持锁部署，断言原版本并备份数据；终端确认 `LAN_DEPLOY_OK ... data_backup=yes`。
- 用户明确确认配对设备“本机真实模型验收-20261026”；设备凭据仅留在本机忽略目录，不进入源码。
- 本机访问范围：`.tmp/real-computer-acceptance/work`、`http://127.0.0.1:18763`、预配置 `acceptance_app`。逐次审批保留；HTTPS 使用 Windows 已有信任，不关闭证书验证。
- 当前本机执行器额外修复工具清单中的禁止参数，并返回带目录标识的文件列表；源码提交 `541c937e423dd1b95fc5ad8e8632687b3a0a6234`。这属于本地执行器代码更新，服务器仍为上面的版本。

## 实际结果

| 场景 | 结果 | 可复查证据 |
| --- | --- | --- |
| 真实图片识别 | MiniMax 从仅绘制在 canvas 的截图识别出 `45383`，未从 DOM 或脚本读取答案 | 运行 `caw7002zhmfrl7n` 第 3–5 步 |
| 网页操作 | 模型填写输入框并点击 Verify；页面显示 `VERIFIED: correct code` | `.tmp/real-computer-acceptance/browser-result.json`：`correct:true`、`submitted:45383` |
| 文件新建与回读 | MiniMax 通过逐次审批创建并读取 `work/visual-result.txt`，内容一致 | 成功运行 `l1gi8k4gmjeddvk`；实际文件 `.tmp/real-computer-acceptance/work/visual-result.txt` |
| 固定程序启动 | MiniMax 调用 `apps.launch`，预配置程序实际写出启动标记 | `.tmp/real-computer-acceptance/application-result.json`：`launched:true` |
| 原生桌面 | 真正的 Windows-MCP 截图、输入、点击、后续截图；专用 WinForms 窗口产生 `Desktop MCP verified` | `.tmp/local-release-schema-desktop-integration.log`，12/12；`realDesktop:true` |
| 真实模型原生桌面 | MiniMax 根据实际截图定位，输入 `Native MiniMax verified`，点击 Verify input，识别自动返回截图中的成功文本 | 成功运行 `87kotjo03uhw5vw`；`.tmp/real-computer-acceptance/desktop-fast/desktop-result.txt` 与截图一致 |

桌面技术测试的模型响应是确定性测试服务，不能将它解释成 MiniMax 的原生桌面视觉决策。真实 MiniMax 图片理解的证据来自浏览器场景及独立的成功运行 `87kotjo03uhw5vw`。

## 修复与保留的失败记录

1. 选定在线本地设备后，运行预检正确识别浏览器/文件/程序能力；不删除方案能力要求，不扩大角色工具权限。设备列表自动刷新在线状态。
2. 第一次真实截图调用包含上游 MCP 暴露的 `filename`，与执行器拒绝自定义输出路径的策略冲突，运行 `r82htaw70wiry4f` 正确失败停止。现已从工具输入清单移除此参数，并保留执行期拒绝，增加明确错误说明。
3. 文件列表现在包含 `root`、`path`、`entries`、`truncated`，以减少上下文歧义；不得把截断列表当成文件不存在的完整证据。
4. 浏览器成功后的目录循环保留在 `caw7002zhmfrl7n`，状态为 cancelled，不能宣称该整次运行成功。文件/程序专项 `l1gi8k4gmjeddvk` 为 succeeded，实际 3 次工具调用、3 次工具审批。

## 最新代码验证

- `pnpm check`：351 项主测试 + 10 项图片/结果测试，共 361 项通过；TypeScript、Vite 构建及 110 个生产资源隔离检查通过。
- `pnpm test:e2e:parallel`：27/27 通过，2 workers。
- 开启 `AGENT_STUDIO_DESKTOP_PYTHON` 的本地电脑集成测试：12/12 通过，真实 PocketBase、Edge、Windows-MCP；未连接公司业务数据。
- 测试日志：`.tmp/local-release-final-check.log`、`.tmp/local-release-final-e2e.log`、`.tmp/local-release-schema-desktop-integration.log`。
- 隔离源码目录没有内置 PocketBase 二进制，测试显式使用项目现有 `POCKETBASE_BIN`；首次未设置路径的失败保留为执行过程事实，设置路径后全量通过。

## 使用入口与运行边界

在“诊断与工具调试 → 我的电脑”检查设备；在“Agent 试跑”选择这台电脑与 MiniMax-M3.1-Flash，每次查看参数后批准。浏览器访问范围仍只有本机测试站点；文件写入仅允许新建，重新测试请使用新的文件名。

本机执行器按需启动，不安装开机任务。当前验收进程使用的命令（项目根目录）：

```powershell
node --use-system-ca .tmp/computer-acceptance-release-v1/local-executor/run.mjs run .tmp/real-computer-acceptance/computer.local.json
```

一次只运行一个执行器实例；已在线时无需再启动。Ctrl+C 停止；页面撤销设备可使现有凭据失效。本轮结束时已停止验收执行器并将原生桌面恢复为关闭，避免持续开放桌面。启用其他目录、网站或桌面区域前按 `docs/LOCAL_COMPUTER.md` 明确设置范围并重新验收。

截图证据：`.tmp/real-computer-acceptance/minimax-file-app-pass.png`、`.tmp/real-computer-acceptance/minimax-native-desktop-pass.png`；部署证据：`.tmp/real-computer-acceptance/deployment-v2.png`。均为不提交 Git 的测试产物。

## 原生桌面真实模型尝试与最终通过

MiniMax 两次成功请求专用窗口截图后，从截图提出 `desktop.Type`，坐标 `[460,290]`、文本 `Native MiniMax verified`。浏览器审批往返超出 30 秒，执行器以 `desktop_observation_expired` 拒绝输入；没有点击，测试窗口没有产生 `desktop-result.txt`。没有放宽 30 秒时效或键鼠接管保护。

尝试改用 computer-use 技能缩短审批延迟时，工具先遇到 C 盘空间不足。只清理了本任务专用工作树未跟踪的 dist 构建目录，D 盘保留构建和源码。工具随后因无法可靠确认 Windows 浏览器当前 URL 而安全停止，本轮没有继续界面输入。

随后使用用户已登录 Daniel 的 Tabbit 会话，审批操作耗时缩短到约 1–2 秒。运行 `0w2f7e3gyb3z0zy` 因用户接管保护失败；运行 `iozikg5771awv9m` 重复截图，由操作者取消，没有误记为通过。

最终运行 `87kotjo03uhw5vw` 状态 succeeded。验收指令明确说明成功截图可直接用于下一步、Type/Click 自动返回的截图属于新观察，仅执行器报告过期才重新截图。模型自行依据实际图片计算 Type 坐标 `[211,289]` 和 Click 坐标 `[297,348]`；测试几何坐标未预先写入任务指令。实际 3 次工具调用、3 次工具审批、6 次模型调用、0 次重试。测试程序写出的 `desktop-fast/desktop-result.txt` 精确为 `Native MiniMax verified`，已人工查看保存截图中的 `Verified: Native MiniMax verified`，与服务器成功状态相互印证。

全过程保留 30 秒截图有效期、键鼠接管保护和逐次审批，没有修改产品代码来强行通过。结束时停止本地执行器、关闭专用测试窗口，并恢复 `desktop.enabled=false`；可撤销的配对凭据保留。本次收尾仅更新验收报告，不重复运行已通过且对应源码未变的完整测试。

最新完整检查针对隔离的服务器基线候选目录 `.tmp/computer-acceptance-release-v1`，不等同于包含其他并行改动的整个共享根工作区检查。已完成约定的受限功能验收；扩展到其他应用、站点和生产业务仍须分别配置范围并完成相应 UAT。
