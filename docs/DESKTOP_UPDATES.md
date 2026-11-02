# 桌面版本更新

从 preview.10 起，软件菜单和托盘中的“版本更新”提供检查、更新说明、下载进度以及“重启更新”。关闭窗口和托盘退出的原有行为继续保留。默认更新清单为当前公司工作台地址下的 `/desktop-updates/stable/latest.json`，也可在更新窗口更改地址。

preview.9 及更早的客户端没有更新代码，需要先安装一次 preview.10。之后的版本可在软件内完成，用户不必另开浏览器、选择安装目录或手动运行安装包。传输的是完整程序更新包，当前未实现差分下载。

## 员工操作

1. 打开“Agent Studio → 版本更新”，点击检查更新。
2. 阅读说明，点击下载更新。下载完成后会验证发布签名、文件长度和 SHA-256。
3. 保存工作并结束运行中的 Agent 任务，点击重启更新并确认。程序停止本机连接后退出，在原目录后台备份、安装、核验并重启，期间可能需要几分钟，请勿重复启动；个人登录、服务器设置、浏览器缓存及电脑授权不属于被替换的程序清单。
4. 安装或新版启动核验失败时，恢复备份的旧程序并重新打开，显示恢复提示。准备和备份失败且尚未替换程序时，会重新打开原版并提示原因。不自动重新执行之前的 Agent 任务。

升级只替换安装清单内的程序文件，不处理业务数据库、模型配置和授权数据。更新时预留约八倍下载包大小的可用磁盘空间；未完成的下载不会执行。更新窗口仅有受限的原生 IPC，网页、iframe、插件及模型不能调用更新或修改信任公钥。

升级会重启客户端。已选择“保持登录”的配置会保留；临时标签页会话、已过期或已撤销的登录仍需正常验证，不会为了更新而擅自持久保存临时令牌。

## 发布者一次配置

- HTTPS 静态目录：将独立文件夹映射为 `/desktop-updates/`，GET/HEAD 可由员工电脑访问；不存在的文件返回 404，不能回落到 React 的 index.html。可参考 `desktop/update-location.nginx.conf`。不修改现有 API、Worker 或数据库。
- 签名私钥：与 `desktop/update-trust.json` 公钥对应的 Ed25519 私钥由发布者安全保管，并配置为仓库 Secret `DESKTOP_UPDATE_PRIVATE_KEY`。不要提交、放进静态目录、放进 EXE 或在聊天中发送。当前生成的私钥位于本次工作区被 Git 忽略的 `.tmp/update-signing/private.pem`；上线前应备份到公司的密钥保管系统。丢失后不能用另一把新私钥给已安装客户端签发更新。
- 内网发布 Runner：在能写入上述独立静态目录的 Windows 机器安装 GitHub Actions Runner，增加标签 `agent-studio-release`，预装 Chrome。设置仓库 Variables：`DESKTOP_UPDATE_BASE_URL`（例如 `https://192.168.1.133:8443/desktop-updates/`）及 `DESKTOP_UPDATE_PUBLISH_DIR`（发布机可写的目录或专用网络共享）。仅授予该目录写权限。

这些配置不会因合并源码自动生效；本功能开发不等于已经部署公司服务器或配置仓库 Secret / Runner。

## 后续发布

更新 `desktop/package.json` 与 `desktop/build-info.json` 中的相同版本号，编辑 `desktop/RELEASE_NOTES.md`，正常提交功能后推送对应的版本标签，例如 `desktop-v0.1.0-preview.11`。`.github/workflows/desktop-release.yml` 会执行测试、构建安装包，先发布不可变版本文件，再原子替换签名更新清单。普通 Git 合并或不增加版本号的推送不会冒充一次新客户端发布。后端服务更新仍走原服务部署流程。

也可以在发布机手动执行：

```powershell
pnpm desktop:update:publish --installer=".tmp/desktop-output/AgentStudio-Setup-0.1.0-preview.11-win-x64.exe" --base-url="https://192.168.1.133:8443/desktop-updates/" --output="D:\CompanyDesktopUpdates" --key-file="安全位置\private.pem" --notes-file=desktop/RELEASE_NOTES.md
```

发布脚本只接受与软件内置公钥匹配的私钥，同版本内容不可替换，更新频道不能回退。最终文件结构是 `stable/latest.json` 和 `<版本号>/AgentStudio-Setup-<版本号>-win-x64.exe`。稳定清单在最后发布，避免客户端看到尚未复制完整的安装包。

## 验证

`node --test desktop/tests/*.test.cjs` 覆盖签名、伪造清单、版本排序、禁止降级、下载破损/中断、权限隔离、进程启动确认、回滚及个人数据保留。`desktop/tests/updates.windows.mjs <旧安装包> <新安装包>` 在隔离目录用真实 Electron 窗口、HTTP 更新源、静默安装器和新版启动回执完成升级，路径包含空格，不连接生产服务。

此实现沿用项目原有自定义 NSIS 安装器；Electron 内置更新器的平台协议要求见 [Electron 官方文档](https://www.electronjs.org/docs/latest/api/auto-updater/)。发布签名与 Windows Authenticode 代码签名是不同层次；当前 EXE 仍为未进行 Authenticode 签名的预览版。
