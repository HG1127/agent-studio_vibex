# PocketBase 首次启动自动弹出 Chrome 标签页：根因与修复

## 确认的根因

PocketBase 0.23+（本工程测试 0.40.5）在数据库里尚无明确的系统管理员时，默认安装器会调用操作系统打开浏览器，地址是类似本地 127.0.0.1:PORT/_/#/pbinstall/TOKEN 的首次安装页面。每一个全新的临时测试目录都会再次触发。PocketBase 官方对此有明确说明：

- https://pocketbase.io/docs/
- https://github.com/pocketbase/pocketbase/discussions/7202
- https://pocketbase.io/jsvm/interfaces/core.ServeEvent.html

旧版集成测试多次使用 spawn(pocketbase, ["serve", "--dir="+mkdtemp...])，即便启用了 windowsHide:true，仍不能阻止 PocketBase 内部通过 Windows rundll32 打开 Chrome；windowsHide 仅隐藏自己的控制台窗口。之前仅移除脚本里的浏览器启动命令不足以解决这个问题。

此外，Windows 本地启动脚本启动 PocketBase 时没有显式提供 --dir 和 --hooksDir，PocketBase 默认从 EXE 所在目录而非本项目 pocketbase/ 目录解析数据和 hooks，所以写在项目 pb_hooks 的抑制浏览器代码可能根本没有加载。

## 已实施的三重修复

### 1. 九组集成测试统一 Headless 启动器（最重要）

新增 tests/helpers/headless-pocketbase.mjs：所有九个 *.integration.mjs 的 PocketBase 启动都必须使用 spawnHeadlessPocketBase。

- 严格限制监听 127.0.0.1、显式 --dir、--hooksDir，并拒绝生产目录；
- 仅允许 os.tmpdir() 的直接子目录且目录名以 agentstudio- 开头，防止误改真实数据库；
- 先使用不启动 Web Server 的 PocketBase CLI superuser create 创建一次性随机测试管理员，再启动 PocketBase；
- 只在临时库中生成测试凭据，既不使用真实身份也不输出随机密码；
- 作为第二重保护设置 AGENT_STUDIO_DISABLE_PB_BROWSER_INSTALLER=true；
- DB 迁移测试多次启动同一目录时，发现已安全准备的测试库后直接复用，不反复创建管理员；
- 如果前置准备失败，立即抛错，不会冒险启动会自动打开浏览器的无管理员服务。

### 2. 使用官方 PocketBase JSVM 启动事件直接关闭首次浏览器安装器

新增 pocketbase/pb_hooks/headless_installer.pb.js：

    onServe((e) => {
      if ($os.getenv("AGENT_STUDIO_DISABLE_PB_BROWSER_INSTALLER") === "true") {
        e.installerFunc = null
      }
      e.next()
    })

这是 PocketBase 官方提供的 ServeEvent 接口，用 nil/null 禁用一次性浏览器安装器；只有环境变量显式开启时生效，不影响正常生产首次设置。

### 3. 本地 Windows / Linux / macOS 启动目录固定

三个 vibex-local/start-* 启动器显式设置 AGENT_STUDIO_DISABLE_PB_BROWSER_INSTALLER=true，并显式传递 --dir、--hooksDir、--migrationsDir，避免路径落到 PocketBase 可执行文件自身的目录。

没有自动设置或更改任何真实管理员账号；本地新库首次启动不会自动展示管理员向导。确实需要后台超级管理员时，应由授权运维人员通过 CLI 手动创建；不要把测试随机凭据投入生产。

## 证明与限制

- pnpm test:no-browser：扫描启动脚本和全部集成测试，禁止原始 PocketBase serve 与浏览器自动导航，检查 hook 受 env 控制；
- pnpm test：校验数据目录保护、非法远程监听拒绝及 ServeEvent installerFunc 条件行为；
- pnpm test:integration：在新建临时库执行真实 PocketBase API，检查 stderr/stdout 没有 pbinstall 自动安装 URL；
- pnpm test:e2e：九组业务集成测试的全部 PocketBase 启动都通过同一 Headless 安全入口；
- 不曾打开浏览器或访问 /_/、没有修改已有 PocketBase 数据库。

注意：已有 Chrome 标签页不会因为本修复自动关闭，关闭后下一轮使用新测试代码就不会由 PocketBase 首次安装流程重新弹出。如果依然出现，需要记录触发时的父进程、完整启动命令和项目文件路径，以排查其他项目副本/外部自动化工具。

## 文件部署与更新范围

- 本工程项目目录已在源码层修复；
- VibeX Source 选择 pb_hooks/ 时可导入单独的 headless_installer.pb.js 补丁；
- 本地开发启动脚本在 vibex-local/，不能作为 pb_hooks 或 app/src 的补丁解压；需要更新本地对应脚本；
- 九份 tests/*.integration.mjs、tests/helpers/...、静态单测和 package.json 仅属于开发/测试工程，若在另一份项目副本执行测试也必须同步这些文件；
- 此修复不要求 PocketBase 管理后台登录，不要求修改 VibeX App ID 和 SQLite 技术栈。
