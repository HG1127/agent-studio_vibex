# 连接器目录选择卡住与工作台状态不同步：诊断、修复及使用说明

日期：2026-10-28（北京时间）

## 结论

本轮针对截图中的 preview.9 修复了两个相互独立的问题，已制作并交付 0.1.0-preview.10：

1. 原生文件夹窗口使用无明确 owner 的模态调用。实测旧窗口约 2.644 秒创建，但没有取得前台焦点；结合旧实现缺少窗口显示保障，这与窗口被浏览器遮挡、页面一直等待的现象一致。一次选择请求最长等待 180 秒，旧页面同时禁用了取消与刷新，放大了“加载很慢”的感受。
2. 工作台原来只读取最终配对、心跳与能力清单，没有接收“本机已导入／正在选择／等待确认”阶段，因此本机导入文件后，工作台仍显示“等待本机导入连接文件并确认授权”。

截图不能证明某一时刻的原生窗口一定被遮挡；本次结论由源代码、真实 Windows 窗口探测、实际 Chrome 和 PocketBase 联调共同支撑。没有把单纯启动进程当成窗口已经可见，也没有把准备阶段当成已配对或在线。

## 已交付内容

- 新启动器：D:\Downloads\AgentStudio-Connector-preview.10\Start-Connector.cmd
- 新压缩包：D:\Downloads\agent-studio-connector-win-x64-preview.10.zip
- 工作台入口：http://127.0.0.1:8180/tool-hub?view=devices
- 工作台启动器：D:\Downloads\Start-AgentStudio-Workbench.cmd
- 工作台下载入口：http://127.0.0.1:8180/downloads/agent-studio-connector-win-x64.zip
- 版本：0.1.0-preview.10
- ZIP 大小：60,773,773 字节
- ZIP SHA-256：6c921b76c82ec47967b8c19b58584259556556f5f238c5ff78590a0308f4231f
- ZIP 实际解压文件数：9,645（包括 integrity.json）
- public、dist、工作台 HTTP 下载和交付 ZIP 的版本与哈希一致。

旧 D:\Downloads\AgentStudio-Connector 仍为 preview.9，本次没有覆盖它，也没有停止用户正在运行的旧连接器。已经运行的 preview.9 不会自动变成 preview.10，需要重新打开新版启动器。

## 修复行为

### 本机选择窗口

文件夹、单文件、连接 JSON 原生窗口共用固定脚本，设置仅属于这次选择的临时 owner，并让该窗口保持在浏览器上方。窗口结束后清理 owner，不把整个程序永久置顶。

程序显示真实等待时长，提供“取消本次选择”，等待期间仍允许读取／刷新状态。取消请求按本次选择的随机 ID 定位；取消被接受后先显示“正在取消”，只有原生子进程真实关闭才结束互斥。选择结果在路径验证后再次检查取消标志、当前草稿及连接文件有效期。取消、过期、旧请求的迟到返回不会写入新草稿。选好目录也只进入待确认状态，必须由本人确认后才配对。

窗口出现速度受 Windows 会话及系统组件影响，本次实测时间不构成所有电脑上的耗时保证。系统焦点规则仍可能使 foreground=false；验证的是实际窗口可见、位于最上层、可正常取消。

### 工作台准备状态

工作台可以显示：

| 本机实际阶段 | 工作台文案 |
| --- | --- |
| 导入有效文件 | 本机已导入连接文件，等待确认范围 |
| 选择目录 | 本机正在选择工作文件夹 |
| 选择文件 | 本机正在选择文件 |
| 选好范围 | 本机已选好范围，等待本人确认 |
| 取消一次选择 | 本机已取消本次选择，等待确认范围 |
| 本人提交确认 | 本机已提交确认，正在核实配对结果 |
| 准备取消／错误 | 对应取消或检查提示 |

工作台约每 2.5 秒读取状态；超过 30 秒未收到新准备状态时显示状态待核实。实际配对、撤销、过期、心跳与能力结果具有更高优先级。

进度端点以现有、未过期、未使用的连接文件鉴权，检查员工有效状态；不新增设备、不消耗配对码、不延长期限、不上报本地目录／文件名／网站权限。接管使用一次读取后的 CAS 前提，旧 attempt 或乱序 sequence 不能抢回最新进度。同一设备续期后的旧 code 不能继续写进度。旧后端不支持进度接口时，连接器仍保留原来的手动确认流程。

## 现在这次 zhouqing 应怎样继续

本轮重启工作台时使用原保留数据库，前后 4 条设备记录的完整内容哈希一致；现有待配对 zhouqing 登记保留。本次没有替用户点击配对或扩大授权。

1. 关闭旧 preview.9 本机管理页及对应 CMD。
2. 双击 D:\Downloads\AgentStudio-Connector-preview.10\Start-Connector.cmd，确认本机页顶部是 0.1.0-preview.10。
3. 刷新工作台，在“工具与连接 → 执行资源中心 → 我的电脑”中找到现有的、待完成配对的 zhouqing。
4. 这次截图中的短期连接文件已经过期。对这一条登记点“继续连接”，重新核对用途和网站，选择“更新此设备的连接文件”。这是续同一条登记，设备 ID 保持不变。
5. 在新版本机窗口导入更新后的 JSON。选文件夹时，应看到等待说明和可用取消按钮；工作台随后显示正在选择目录。
6. 选好后核对文件范围，勾选本人确认，再点“确认连接并启动”。工作台先核实配对，再等待真实心跳与所选能力上线。

如果工作台网址之后打不开，先双击 D:\Downloads\Start-AgentStudio-Workbench.cmd，保留工作台启动窗口，再进入上面的页面。连接器 CMD 同样需要保持运行；当前预览没有安装系统服务或开机自启。

## 日常流程：新电脑、待配对登记、恢复旧连接

| 场景 | 应走的流程 | 是否重新配对 |
| --- | --- | --- |
| 第一次接入新电脑 | 工作台选择用途／网站并下载 JSON → 新版连接器导入 → 选择范围 → 本人确认 → 工作台验证在线 | 是 |
| 已有待完成配对登记 | 在原设备行点继续连接；过期就更新这一条登记的文件 → 本机导入并完成确认 | 完成原登记，不新增同名行 |
| 已保存、已配对连接离线 | 打开新版连接器 → 我的已保存连接 → 按名称和服务器选中 → 恢复连接 → 核对原授权 → 确认 → 工作台刷新 | 否 |
| 原连接显示 HTTP 401／原绑定未通过验证 | 核对原服务器及原绑定数据库；新窗口或目录选择修复不能恢复服务端已经缺失的身份 | 不应反复新建或自动配对 |
| 修改网站或文件范围 | 对已连接设备进入授权管理，核对后保存生效 | 否 |

本机保存列表中 8180、8186、8188 等地址对应不同保存连接，不是安装包版本号，不能据此把连接删掉。

## 旧版本清理清单

本轮只检查了相关连接器文件，没有执行删除。

| 已核验位置 | 当前内容 | 建议 |
| --- | --- | --- |
| D:\Downloads\AgentStudio-Connector-preview.10 | 新版程序 | 保留并作为日常入口 |
| D:\Downloads\agent-studio-connector-win-x64-preview.10.zip | 新版安装压缩包 | 保留作备份；已解压并验证后，压缩包本身也可按需要清理 |
| D:\Downloads\AgentStudio-Connector | preview.9 旧程序，9,643 个文件均在原包清单内，无额外文件 | 新版确认可用、旧进程关闭后可以删除旧程序目录 |
| D:\Downloads\Start-AgentStudio-Workbench.cmd | 本地工作台启动入口 | 保留 |
| %USERPROFILE%\.agent-studio | 已保存的设备绑定、私有凭证及配置 | 保留，删除旧程序不需要清它 |
| %LOCALAPPDATA%\AgentStudioPreview | 当前工作台的保留数据库与设置 | 保留 |
| agent_studio_vibex版本 及当前工作树 | 当前工作台代码所在父目录 | 保留，不能当作旧便携包删除 |

此前提到的 preview.9 ZIP 在本轮下载目录清单中已不存在；没有再对它采取操作。当前仍打开的 preview.9 进程需要关闭后再移除其程序目录。

## 验证证据

| 验证 | 结果 |
| --- | --- |
| pnpm check | 515 + 15 = 530 项测试通过；TypeScript 与生产构建通过 |
| pnpm test:e2e:parallel | 29/29 通过，181.9 秒 |
| 目录取消、过期、旧返回、reporter、状态优先级专项 | 10/10 通过，已纳入 pnpm check |
| 真实 PocketBase + Chrome + 工作台组件 | 5 组通过 |
| 原有本机连接器 Chrome 回归 | 9 组通过，包括真实子进程 HTTP 401 保留、恢复与授权草稿 |
| 精确 ZIP 在开发 PATH 移除后的独立验收 | 通过；自带 Node、真实 Chrome／文件／Office／401 子进程 |
| 实际源码 Windows 文件夹窗口 | 2.765 秒（窗口取消）、2.680 秒（程序取消）可见，topMost=true，无残留 |
| 实际源码 Windows 文件窗口 | 3.057 秒可见，取消无残留 |
| 已交付包 Windows 文件夹窗口 | 3.539 秒（窗口取消）、3.048 秒（程序取消）可见，topMost=true，无残留 |
| 已交付包 Windows 文件窗口 | 3.310 秒可见，取消无残留 |
| 数据保护 | 原 4 条设备内容哈希完全相同，待配对 zhouqing 保留，未执行用户配对 |
| 下载一致性 | public／dist／HTTP／交付 ZIP 一致 |

Windows 实测只打开并取消本次测试创建的窗口，没有选择或授权用户的目录。Chrome 业务联调用可控制返回时间的选择器适配器验证竞态，原生窗口另用实际代码和交付包独立验证；两类证据分别记录。

## 复现及维护入口

- tests/connector-picker.test.mjs
- tests/connector-picker.integration.mjs
- tests/connector-picker.windows.ps1
- tests/helpers/native-picker-driver.mjs
- .tmp/picker-progress/integration-result.json
- .tmp/picker-progress/native-source-result.json
- .tmp/picker-progress/native-package-result.json
- .tmp/picker-progress/retained-db-after.json
- .tmp/picker-progress/delivery.json
- .tmp/picker-progress/download-parity.json
- .tmp/picker-progress/final-validation.json
- .tmp/picker-progress/final-sources.json

本轮只更新本地工作树和本地预览／便携交付文件，没有提交或推送 Git，也没有部署生产服务。
