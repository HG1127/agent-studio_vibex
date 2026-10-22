# Agent Studio Vibex｜本地受控执行器试用与真实测试（2026-10-22）

本模块是独立可选的本机 MCP 服务，不是远程接管个人电脑的软件。默认不运行、不访问日常 Chrome 会话、不获取私人文件或已有登录凭证，不可用于未经授权的生产资料。

## 1. 已实现的真实工具

| MCP 工具 | 实际能力 | 结果与边界 |
| --- | --- | --- |
| browser_read_page | Playwright 启动全新隔离 Chromium 页面，读取真正 DOM | 返回标题、来源/最终 URL、正文、状态与阻断计数；只允许配置的本机来源 |
| document_pdf_extract | pdfjs-dist 读取实际 PDF 字节 | 逐页文本、页码、文件 SHA-256；只读 |
| spreadsheet_analyze | ExcelJS 打开真正 XLSX 工作簿 | 指定表格两个数字单元格及差值，来源与 SHA-256；不冒充重新计算公式 |
| spreadsheet_export_report | ExcelJS 写出并重新验证真实 XLSX | 需独立启用写权限，生成工作目录 artifacts 下的新文件，绝不覆盖 |
| browser_registered_action | Playwright 执行预先登记的表单动作 | 需单独启用；模型只能传登记 ID 与指定输入值，不能指定网址/选择器；只能向允许的精确路径 POST |

浏览器读取和登记动作均要求对每个 origin 配置精确的路径白名单。单个任务只允许请求它起始的那个 origin；页面即使尝试访问另一个已登记 origin 的资源，也会被拦截。读取动作只允许 GET/HEAD，阻止 POST、WebSocket、下载与新窗口。登记动作仅对明确列出的写入路径开放**正式点击期间的 HTML 表单导航 POST**；页面脚本通过 fetch/XHR 发出的 POST 即使路径相同，也不能因此取得权限。本阶段不支持任意 JavaScript 驱动的 AJAX 提交。

## 2. 手动启动（Windows PowerShell；项目源码根目录）

先准备一个只含授权测试文件的独立目录，再显式配置执行器：

    New-Item -ItemType Directory -Force D:\AgentStudio\isolated-inputs | Out-Null
    $env:AGENT_STUDIO_LOCAL_EXECUTOR_ENABLED = "1"
    $env:AGENT_STUDIO_LOCAL_EXECUTOR_WORKSPACE = "D:\AgentStudio\isolated-inputs"
    $env:AGENT_STUDIO_LOCAL_EXECUTOR_ORIGINS = "http://127.0.0.1:9876"
    $env:AGENT_STUDIO_LOCAL_EXECUTOR_PATHS_JSON = '[{"origin":"http://127.0.0.1:9876","paths":["/issuer","/form","/submit","/result"]}]'
    $env:AGENT_STUDIO_LOCAL_EXECUTOR_PORT = "9183"
    $env:AGENT_STUDIO_LOCAL_EXECUTOR_CHROME_BIN = "C:\Program Files\Google\Chrome\Application\chrome.exe"
    $bytes = New-Object byte[] 32
    [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    $env:AGENT_STUDIO_LOCAL_EXECUTOR_TOKEN = [Convert]::ToBase64String($bytes)
    pnpm local-executor:pilot

其中本机网页 origin 要改为你实际允许的可信测试服务地址，必须是 127.0.0.1 或 localhost 的完整 origin，不能使用通配符或公网域名。Chrome 路径以实际安装位置为准。不要将随机令牌保存到 Git、聊天记录、共享文档或工作日志。终端保持运行时执行器才在线。路径列表是必填的精确白名单，不支持通配符；仅允许实际需要访问的页面和资源路径。

如果要测试预登记的表单动作，还需要单独配置以下内容。请把动作 URL 与写入路径都限制在上面已经授权的 origin/path 范围内：

    $env:AGENT_STUDIO_LOCAL_EXECUTOR_ENABLE_BROWSER_ACTIONS = "1"
    $env:AGENT_STUDIO_LOCAL_EXECUTOR_ACTIONS_JSON = '[{"id":"approved_form","url":"http://127.0.0.1:9876/form","steps":[{"kind":"fill","selector":"#name","arg_key":"name"},{"kind":"click","selector":"#submit"}],"write_paths":["/submit"]}]'

动作 ID、选择器、输入键和可写路径由操作员在启动时登记，Agent 只能传入受限参数，例如 action_id 为 approved_form，arguments 只有 name。**预登记动作只支持页面填入字段与 HTML 表单导航提交**；它不是“任意自动点击网页”或“执行外部脚本”能力。任何动作都应通过 Agent Studio 的人工审批；不得将未经审查的业务提交页面登记为动作。如果浏览器在提交后返回超时/连接中断，外部提交可能已经发生，应人工核查，不得盲目再次发起。

可选的文件导出写权限

    $env:AGENT_STUDIO_LOCAL_EXECUTOR_ENABLE_WRITES = "1"

默认工具目录包含三个只读工具；单独启用后才会出现 spreadsheet_export_report 和/或 browser_registered_action。浏览器动作与文件导出使用独立开关。写入仍须通过 Agent Studio 的角色授权和逐次人工审批；生成文件只放在指定工作目录内的 artifacts/，同名文件不会覆盖。

## 3. 连接 Agent Studio

在 Agent Studio 的“工具与连接 → MCP 插件连接”添加：

- 地址：http://127.0.0.1:9183/mcp（实际地址以执行器启动输出为准）。
- Header 名称：Authorization。
- Header 值：Bearer 加上刚才的独立随机令牌。应填入受控的凭证输入框，不得作为 URL 查询参数。
- 连接成功、发现工具后，回 Agent 方案按任务需要单独选择工具及负责角色，并进行真实试跑与逐次审批。

注意：连接请求从 PocketBase 后端发起。若 PocketBase 位于其他电脑/服务器，“127.0.0.1”指向那台电脑，而不是你正在操作的个人电脑。本阶段只支持同机、回环地址的开发测试，不能通过关闭防火墙、监听 0.0.0.0 等方式绕过。

## 4. 五角色真实任务链

1. 网页研究：browser_read_page，返回发行人测试页面 revenue 120、risk R1、真实 URL。
2. PDF 研究：document_pdf_extract，返回实际测试 PDF 第 1 页的 note 7、liabilities 30。
3. 财务核对：spreadsheet_analyze，实际从 Financials 工作表读取 A2=120 与 B4=30，计算结果 90。
4. 独立审核：无写权限，核验网页、PDF、XLSX 来源及一致性。
5. 审批导出：spreadsheet_export_report，人工批准后生成 reviewed-report.xlsx 并重新打开核对数据。

这五个角色在同一 Agent 运行中依次执行，不代表已具备五个独立 Agent 并行协商。

## 5. 真实性、安全与异常测试

测试脚本：

    pnpm test:local-executor
    pnpm check
    pnpm test:e2e:parallel

- tests/local-executor.integration.mjs：真实 Chromium + PDF + XLSX + 文件写出 + 预登记表单提交；覆盖令牌验证、精确路径/来源隔离、跨 origin 子资源、POST/WebSocket 阻断、页面加载或点击时以 JavaScript 向**同一个获授权写入路径**进行未授权 fetch 的拦截、外部重定向、目录逃逸、符号链接、不能相信缓存公式、文件覆盖拒绝与去敏审计。
- tests/local-executor-agent.integration.mjs：真正的 PocketBase Agent Engine 与员工身份、后端安全存储 MCP 认证头、五角色保存和运行、四次人工审批、四项真实工具调用、事件历史与 Excel 产物重读。
- 所有测试站点、PDF/XLSX、测试员工和模型数据均在独立临时目录/本地服务，未连接真实发行人、真实邮件或生产服务。

写操作出现网络错误且无法确认是否已经执行时，运行引擎应停止自动重放并要求人工核对。执行器本地保存的简易状态/审计只有当前进程内的工具名称与状态，不可替代长期企业审计。

启动默认拒绝：未设置显式 enable、工作目录非绝对路径、未配置足够长的随机令牌、尝试用公网 origin 或绕过文件工作目录。所有浏览器请求遵守精确 allowlist；临时 Chromium 上下文不携带个人 Cookie。PDF/XLSX 被限定在显式沙箱，不随意读取私人目录。

本次测试还没有认证：任意真实互联网网站、复杂登录会话、Office 原生 UI、Excel 动态公式重算、扫描件 OCR、任意大文件解析、长时运行、跨机器证书与设备管理，也不表示已满足生产 GO 标准。
