# Agent Studio 本地电脑执行器

这项功能在当前 PocketBase/SQLite 路径上增加员工设备绑定和本地任务队列，不切换 PostgreSQL，不调用原 VibeX 应用。

## 能力与边界

- 工具中心的「我的电脑」提供配对、在线状态、撤销、单次操作审批和结果查看。
- Agent 运行页可以为本次任务选择一台自己的电脑。每次 `local_computer` 调用都进入现有审批流程；等待本机结果期间不重复调用模型。
- 文件工具：列目录、读取 UTF-8 文本、新建文本文件。只允许配置的根目录；拒绝路径穿越、符号链接、硬链接文件、Windows ADS、常见凭据路径和覆盖已有文件。
- 浏览器：实际使用 Microsoft Playwright MCP，独立浏览器会话，支持导航、读取页面结构、填写、点击、下拉选择和快捷键。操作后回传实际页面结构。不会复用员工日常浏览器的登录资料。
- 软件：`apps.launch` 只启动本机配置的可执行文件及固定参数。它不代表已经验证该软件内部的业务操作。
- 额外 MCP：本地管理员可以配置绝对可执行文件路径及工具白名单，用来接入专用软件或 Windows 桌面工具。不会根据模型输出下载或启动任意 MCP。

现在支持 MCP 的文字与截图观察。浏览器可显式启用截图；Windows 桌面通过可选的 Windows-MCP 0.8.8 接入。截图会发送给本次任务所选的模型，因此必须选择支持图片输入的模型。已适配 OpenAI 兼容 Chat Completions、Anthropic Messages、Gemini generateContent 三种协议；不支持图片的模型报错时不会自动降级为盲操作。Word/Excel/ERP 等具体业务流程仍需各自验收。

## 在自己的电脑上启动

要求：Node.js 24、项目配置的 pnpm、已安装 Microsoft Edge（默认浏览器）。先在项目根目录使用锁文件安装依赖：

```powershell
pnpm install --frozen-lockfile
```

1. 更新代码后启动或重启开发环境的 PocketBase 后端，使新增 hook 初始化设备与任务表。创建专门的工作目录，例如 `D:\AgentStudioWork`。不要将整个系统盘、公司共享盘或项目根目录当作工作目录。
2. 将 `local-executor/config.example.json` 复制为 `local-executor/computer.local.json`。
3. 修改 `roots` 中的目录和 `browser.allowedOrigins` 中允许使用的网站。来源必须包含协议和端口（如有），不带末尾 `/`。需要的 API/CDN 来源也应明确添加。
4. `server` 填后端地址：同机开发可填 `http://127.0.0.1:7000`；通过项目现有反向代理访问时填 `https://你的内部域名/__pb`。远程连接必须使用 HTTPS，执行器不跟随服务器重定向。
5. 登录 Agent Studio → 工具中心 → 我的电脑 → 绑定一台电脑 → 生成配对码。
6. 在项目根目录运行配对命令，按提示粘贴配对码（五分钟内有效、只能使用一次）：

```powershell
pnpm local:pair local-executor/computer.local.json
pnpm local:run local-executor/computer.local.json
```

执行器必须在要操作的那台电脑上运行。无需对员工电脑开放入站端口；它主动轮询服务器。保持终端运行，`Ctrl+C` 停止。刷新工具中心后设备应显示「在线」。

配对凭据默认保存为配置文件同目录下的 `.local-device-credentials.json`，已加入 Git 忽略。它不需要员工密码或服务器 Worker 密钥。Windows 上应将该目录放在当前员工私有账户目录，按公司要求配置 NTFS 权限；`mode: 0600` 本身不能代替 Windows ACL。重新配对前先在界面撤销旧设备，并由本人处理旧凭据文件。

## 第一次验收

工具中心展开「测试一次本地操作」，选择在线电脑及工具，输入参数并勾选本次批准：

```json
{"root":"work","path":"."}
```

上面适用于 `files.list`。新建文件使用 `files.write`：

```json
{"root":"work","path":"hello.txt","text":"Agent Studio 本地执行成功"}
```

读取文件使用 `files.read`：

```json
{"root":"work","path":"hello.txt"}
```

浏览器导航使用 `browser.browser_navigate`，URL 必须属于配置中允许的来源：

```json
{"url":"https://example.com"}
```

Agent 运行页选择「本次可操作的电脑」，填写例如：

> 在 work 目录新建 report.txt，写入“测试成功”，再读取并核对内容。

选择已经配置的模型连接，启动任务。逐次批准具体参数，查看时间线和文件结果。设备工具的 JSON schema 会提供给模型；锁定的 Playwright MCP 版本使用 `target` 指定页面元素，不能沿用旧版示例中的 `ref` 参数名。

## 配置软件与其他 MCP

固定程序启动示例（根据本机真实路径修改）：

```json
"apps": {
  "notepad": {
    "command": "C:\\Windows\\System32\\notepad.exe",
    "args": []
  }
}
```

调用 `apps.launch` 的参数是 `{"app":"notepad"}`。模型不能传入命令或启动参数。

额外 STDIO MCP 的配置格式如下；这是格式示例，必须替换成自己已安装并审核的程序和真实工具名称：

```json
"mcpServers": {
  "office": {
    "command": "D:\\ApprovedTools\\office-mcp.exe",
    "args": [],
    "tools": ["read_document"]
  }
}
```

工具会以 `office.read_document` 暴露。额外 MCP 运行在当前操作系统用户权限下，**不自动继承内置文件工具的根目录限制或内置浏览器的来源限制**；应在该 MCP 或专用操作系统账户中单独限制权限。默认不会把执行器令牌或服务器密钥传给子进程。

需要返回截图的额外 MCP 必须在该服务器配置中明确加入 `"images": true`，否则执行器拒绝图片输出。浏览器截图同样需在 `browser` 下设置 `"images": true`，随后使用 `browser.browser_take_screenshot`，参数 `{"type":"png"}`，不允许指定本地输出文件名。

## Windows 桌面截图与操作

默认 `desktop.enabled` 为 `false`。使用独立的 Python 3.14 虚拟环境安装固定版本（命令在项目根目录运行）：

```powershell
py -3.14 -m venv D:\AgentStudioTools\windows-mcp
& D:\AgentStudioTools\windows-mcp\Scripts\python.exe -m pip install -r local-executor/requirements-desktop.txt
```

将本地配置中的 `desktop.python` 设为该 Python 的绝对路径，`enabled` 改为 `true`。`region` 是允许操作和截图的虚拟桌面像素矩形 `[左, 上, 右, 下]`，右/下边界不包含在内，最大宽 1920、高 1080；应只覆盖专用工作区域。重启执行器后可见 `desktop.Screenshot`、`desktop.Snapshot`、`desktop.Click`、`desktop.Type`、`desktop.Scroll`、`desktop.ControlStatus`。该预设在 MCP 服务端和执行器两处过滤工具，不开放 PowerShell、注册表、剪贴板、进程管理、任意应用启动或组合快捷键。遥测被关闭。

先调用 `desktop.Screenshot`，参数 `{}`。它总是截取本地配置的范围，模型不能扩大范围。随后用实际截图对应的虚拟桌面坐标调用工具，例如 `{"loc":[250,300],"text":"测试文字","clear":true}`（Type）或 `{"loc":[250,350]}`（Click）；坐标必须由本次真实观察确定，不能直接照搬示例。禁止 `label` 参数，以免元素编号指向范围外。每次输入操作前须有 30 秒内的成功截图，操作后自动截图返回；审批耗时太长时应重新截图。不要通过缩放后的图片直接猜测屏幕坐标，须按截图中的原始尺寸、区域偏移及比例换算。

Windows-MCP 的用户接管保护保持启用。它发现用户输入或桌面不可用时会阻止操作；执行器报告明确的接管停止原因，不自动重试副作用。截图失败会废弃旧观察，不能继续使用旧截图发起输入。可先用 `desktop.ControlStatus` 查看状态，空闲后重新截图并提交新的审批。

矩形范围只约束坐标及截图，不是应用权限沙箱；其他窗口覆盖该区域时仍可能成为点击目标。请在专用桌面或测试账户中操作，并逐次检查审批。截图读取和任何桌面输入都沿用已有的员工审批流程，操作后截图属于该次批准的观察。手动测试区和运行时间线均可查看结果图片。不会安装开机任务或后台常驻系统服务。

## 执行与审计规则

- 服务端通过验证后的 `studio_users` 绑定设备，拒绝伪造 `X-Rh-User-Id`。禁用员工或撤销设备会阻止后续调用。
- 单次配对码和设备令牌在服务器只存哈希；设备令牌不进入 React 页面。
- 两张私有 SQLite 表记录设备与任务：`studio_local_devices`、`studio_local_jobs`。不提供 PocketBase 通用集合读写权限。
- 任务有唯一键、参数哈希、独占领取凭据及截止时间。已领取的任务不会重新投递；未确认结果标为 `unknown`，需要人工核查。
- Agent 操作复用审批和 `tool_invocations`；手动测试的参数、状态、结果记录在本地任务表中。文字最多 12,000 字符，每次最多一张 PNG/JPEG、原始字节不超过 1 MiB，拒绝 SVG、外部图片链接、超限与格式不匹配的图片。图片只存于私有任务结果，按员工身份读取；运行检查点、事件、调用日志只记录文字与任务引用。模型规划时重新核验图片所属员工、运行及设备，只附带最新本地观察；文件、网页、截图内容会发送给所选模型。`image_inputs` 单独统计图片次数，不冒充精确 token 计费。截图随任务历史保留，应纳入公司的数据保留策略。
- 取消会阻止尚未领取的操作，并向执行中的 MCP 调用发出取消请求；已经完成的写入、发送或已经启动的外部程序无法自动撤销。不可将“取消”理解为事务回滚。
- 浏览器采用专用上下文、禁用 Service Worker、拦截请求和跨来源重定向、禁用 WebSocket，不开放任意 JavaScript 执行或文件上传工具。需要 WebSocket 的站点可能不可用。这些应用级控制不能代替操作系统沙箱。
- 服务端新增表已登记到迁移就绪清单：设备凭据必须重新配发，任务历史需要单独迁移和副作用核对，不会自动进入 PostgreSQL 试验系统。

## 自动化测试

```powershell
$env:TEMP = Join-Path (Get-Location) '.tmp'
$env:TMP = $env:TEMP
$env:TMPDIR = $env:TEMP
$env:AGENT_STUDIO_E2E_TEMP_ROOT = $env:TEMP
pnpm test:local-computer
pnpm check
pnpm test:e2e:parallel
```

先确保 `.tmp` 目录存在。`test:local-computer` 会构建前端，启动临时 PocketBase、两个测试网站、真实 Edge 和 Playwright MCP。所有账号、文件和模型响应都是隔离测试数据，不使用真实公司数据库或付费模型。

覆盖：员工与设备隔离、配对重放、审批、真实读写、越界路径和凭据保护、幂等提交、并发领取、伪造结果、浏览器表单输入和点击、跨来源重定向拦截、实际白名单程序启动、Agent 审批执行闭环、网页端登录与结果展示、取消、过期不重放和撤销。

新增覆盖：真实 Playwright 截图从 MCP 到模型请求的逐字节一致性、三种模型图片协议、图片权限隔离、无效图片拒绝、检查点不含图片字节，以及网页截图显示。执行中的任务取消会验证取消信号到达执行器、结果不被完成请求覆盖、任务不重新投递；结果确认响应丢失会验证真实文件仅写入一次。模型响应仍为确定性测试服务，不能把协议通过等同于真实模型视觉能力验收。

可选原生桌面测试（会打开一个可见的专用 WinForms 测试窗口；测试期间请让鼠标键盘保持空闲）：

```powershell
$env:AGENT_STUDIO_DESKTOP_PYTHON = 'D:\AgentStudioTools\windows-mcp\Scripts\python.exe'
pnpm test:local-computer
```

该测试经过临时服务端批准的任务队列，用真实 Windows-MCP 截图、输入、点击，并核对测试窗口实际输出及操作后截图。同时测试无新截图和越界坐标被拒绝，不访问员工业务软件。测试结束关闭临时窗口及 MCP。不设置该变量时只运行文件、浏览器、图片传输与网页验收，报告中的 `realDesktop` 为 `false`。

测试截图写入 `.tmp/local-computer-ui.png`。本地新功能测试需要 Windows Edge；既有 `pnpm check` 与 `pnpm test:e2e:parallel` 不因此增加浏览器依赖。

本功能是开发验收版本。实际员工模型、业务网站、具体软件、长时间运行及公司网络环境仍需 UAT；部署状态继续遵守项目 NO-GO 规则。
