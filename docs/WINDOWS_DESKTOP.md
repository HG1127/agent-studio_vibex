# Agent Studio Windows 桌面预览版

桌面版沿用正式网页版的全部生产路由、React 组件和员工身份验证。首个版本以主分支 `98ee9287fd224ffe2f61de6750d436b71c12f810` 为基线，增加 Electron 外壳、本机网关和集成连接管理入口；另修复一处 Linux 测试对符号链接的清理方式。PostgreSQL 实验页面不进入生产包。

## 使用

1. 将 `AgentStudio-Desktop-0.1.0-preview.1-win-x64.exe` 保存到自己的程序目录，双击运行。首次解包需要一些时间和可写临时目录。仅支持 Windows x64。
2. 首次界面填写现有公司工作台的 HTTPS 地址，默认 `https://192.168.1.133:8443`，点击“保存并打开工作台”。使用现有员工账号登录；浏览器和桌面版分别保存登录会话。
3. 助手、工作流、任务计划、模型连接、工具、Skill、知识库、协作、审批、排程及管理员功能使用同一套网页代码和服务器数据。菜单“Agent Studio → 本机电脑与权限”打开内置本机连接管理器，按工作台提示导入配对文件并批准明确的目录、网站和程序范围。程序不会自动新增设备授权。
4. 关闭工作台窗口会保留托盘和已连接设备；使用菜单或托盘“退出并停止本机连接”完整退出。不要只关闭窗口后直接替换正在运行的 EXE。

这是连接服务器的完整桌面客户端。服务器、Worker、模型服务及网络必须正常；不会将公司数据库、账号密码、模型 Key 或生产配置复制到 EXE。内置 Node 运行时，无须另装 Node.js。浏览器自动化仍需要本机 Google Chrome；可选桌面 MCP/软件适配器按原有连接配置安装。本机权限范围和逐项审批规则保持有效。

HTTPS 必须使用操作系统信任的证书。连接失败时检查服务器地址、VPN/局域网、证书与服务状态。端口冲突可在设置中勾选“重建本机入口”，会清除桌面登录会话。此预览包尚未代码签名，不提供绕过 Windows 或浏览器安全提示的操作。

## 更新和数据

普通 Git 合并不会直接更新已分发 EXE。由维护者选择已验证的提交、运行桌面构建和验收、发布新版本文件。用户完整退出旧版后替换 EXE；用户配置和桌面会话保存在 `%APPDATA%/agent-studio-desktop`，设备凭据仍保存在原有的 `%USERPROFILE%/.agent-studio`，不在可执行文件内。服务器更新按现有独立部署流程进行，桌面内置前端须与服务器 API 兼容。首版未接入自动更新服务。

## 可复现构建

在干净的目标源码工作区安装根项目依赖及桌面独立依赖（锁定文件均保留）：

```powershell
pnpm install --frozen-lockfile
pnpm --dir desktop install --frozen-lockfile --ignore-scripts
node desktop/node_modules/electron/install.js
pnpm check
pnpm test:e2e:parallel
node --test desktop/tests/gateway.test.cjs
node desktop/build.mjs
```

建议将 TEMP、TMP、TMPDIR、ELECTRON_CACHE、ELECTRON_BUILDER_CACHE 指向项目磁盘的专用目录。低内存环境可使用 `pnpm test:e2e:parallel --workers=1`；不要与高压缩构建同时运行大型浏览器测试。`desktop/build.mjs` 验证生产资源隔离，构建官方校验过的 Node 本机组件，并生成 `.tmp/desktop-output/AgentStudio-Desktop-<version>-win-x64.exe`。不下载或携带员工数据。

可使用 `node desktop/tests/packaged-smoke.mjs <exe绝对路径>` 验证实际包：创建全新隔离 PocketBase、正常员工 JWT、去掉开发 Node PATH 后启动程序，检查伪造身份拒绝、生产 API 和独立本机管理器鉴权。用例不会连接生产数据库。测试报告不含凭据，临时配置不进入发布包。

## 运行边界

工作台渲染器启用 sandbox、contextIsolation 和 webSecurity，关闭 Node integration；原网页没有原生执行 IPC。仅设置窗口具有两个受限的设置 IPC。文件和程序操作统一经现有连接器，保留白名单、审批与审计。网关仅监听回环地址，验证 Host/Origin，转发正常员工 Authorization，禁止上游重定向及实验 PostgreSQL API。外链打开系统浏览器前询问；下载使用保存对话框，不自动运行。
