# Agent Studio LAN Git-only HTTPS 代理：自动部署修复与一次性运维指南

## 已核实的问题

2026-10-21 Ubuntu 宝塔服务器：agentstudio-build 使用隔离的 env -i 直接 git ls-remote/clone GitHub 会超时；通过机器现有的 HTTPS 代理且固定 HTTP/1.1，git ls-remote 返回成功并匹配主分支 SHA。GitHub API 直连正常，仍须验证官方 TLS 和严格的 push/main 成功 CI。

这个补丁仅修改部署控制器 deploy/lan/pull-update.py。它增加可选的 root 管理配置文件 /etc/agentstudio-lan/git-https-proxy。Git Clone 和 Git Fetch 使用该代理与 HTTP/1.1；pnpm、node、PocketBase 和 Worker 不继承代理。没有配置文件仍保留直连行为；有文件但内容或权限不安全时拒绝 Git 操作，而不是自动忽略错误。

配置文件必须是非链接普通文件，root:root，精确 0600，且只能存在于不可被其他用户修改的 root 管理目录。只允许带有效显式端口的 http/https/socks5/socks5h 代理地址；禁止账号、密码、URL path、query、fragment 和控制字符。不要在日志、CI、Git、工单或聊天中记录实际代理 URL。

## 安装顺序：仅由宝塔 root 运维操作

1. 确认 main 完整 40 位 SHA 的最新 Agent Studio quality push/main CI 状态为 completed/success，记下新版本源文件 SHA256。生产当前版本预期仍是 810002a，当前根部署控制器来自 6018e8f，自动部署 timer 尚未启用。先核查实际值，如有变化暂停操作。
2. 从固定 GitHub SHA 下载 deploy/lan/pull-update.py 到 root 专用临时目录。可使用已经验证的 api.github.com Contents API，先移除 GitHub 返回 Base64 中的换行，再严格解码。确认 path、大小和事先通过代码审查取得的文件 SHA256，禁止直接覆盖根控制器。
3. 从 root 宝塔终端已存在的系统代理读取 Python urllib.request.getproxies().get("https")。校验 scheme、host、port，确认不包含 username/password/path/query/fragment。将 URL 写入 /etc/agentstudio-lan/git-https-proxy，使用 root:root 0600、禁止符号链接及硬链接。不要把内容 echo 到终端，必要时使用 root Python 脚本从环境变量写入。代理值只作为本地配置文件使用，永不提交到 Git。
4. 备份当前 /usr/local/libexec/agentstudio-lan/pull-update.py 及其 SHA256 到 /var/backups/agentstudio-lan 下新的 0700 root 目录。确保 agentstudio-lan-update.timer 停止并被禁用，且 agentstudio-lan-update.service 没有正在运行的实例；获得 /srv/agent-studio-lan/.lan-deploy.lock。以 install -o root -g root -m 0755 将核验脚本写入同目录临时文件，cmp 后 mv -T 原子替换。再次校验 SHA256 及 python3 -m py_compile。ci-gate.py、agentstudio-lan-deploy.py、nginx、PB、Worker、SQLite 和附件均不改动。
5. 使用新控制器中的 git_https_proxy()（不要打印其返回值）确认本地配置可读取；调用 subprocess_checked(["/usr/bin/git","ls-remote",REPOSITORY_URL,"refs/heads/main"],as_builder=True,timeout=50) 验证低权限构建账号的 Git 连接，结果 SHA 与 GitHub main 一致。控制器函数会设置 Git HTTP/1.1，仅 Git 子进程接收 HTTPS_PROXY 与 https_proxy；模型与 pnpm 均不可收到该地址。
6. 用 python3 /usr/local/libexec/agentstudio-lan/pull-update.py --check 核实 HTTPS CI 检查仍直连成功，随后执行 --stage 进行只暂存测试。应依次出现 LAN_STAGE_OK:git_clone、git_head、pnpm_install、frontend_build、release_pack 和 LAN_RELEASE_STAGED。检查 tar.gz 与 .sha256 一致，确认当前 /srv/agent-studio-lan/current 尚未改变且 PocketBase/Worker active。如失败，保持 timer 关闭，不重复部署、不删除生产文件。
7. 首次基线升级仍需手工审核。main 包含过部署控制器、CI 和其他敏感文件变化，自动安全策略不会从旧基线盲目放行。根据 docs/lan-ci-verified-autoupdate-operations.md 检查 SHA、数据库迁移签名、数据备份、运行任务空闲及外部写入状态后，执行一次固定 SHA 的受控 --reviewed-runtime 发布，完成登录、Agent、Workflow、Worker、HTTPS、附件和回滚验收。不要将 PostgreSQL 迁移混入此次发布。
8. 仅在首次人工切换完成、定时器 sandbox 联调及恢复演练通过后，由 root 创建内容仅 AUTO_CI_VERIFIED_RUNTIME 的 /etc/agentstudio-lan/enable-lan-autoupdate（root:root 0600）；运行一次 agentstudio-lan-update.service 检查 LAN_UP_TO_DATE，最后 systemctl enable --now agentstudio-lan-update.timer，每 15 分钟自动检查。部署控制器依旧拒绝数据库迁移、敏感认证文件、root 控制器或 CI 改动、CI 失败、运行繁忙、写入结果不明等高风险变更。
9. 接入 systemd failure 告警，定期检查 journalctl -u agentstudio-lan-update.service。出现持续错误或 LAN_DEPLOY_FAILED_REQUIRES_OPERATOR，先暂停 timer 并核查备份、服务和版本；不能直接重放带不明外部副作用的任务，也不自动恢复业务数据。

## 最小测试清单

- 模拟 root 私有文件权限、路径安全、无认证代理、格式错误、缺失文件的 fail-closed Python 单元测试。
- 验证 Git Clone/Fetch 独占 HTTPS_PROXY 与 Git HTTP/1.1，npm/Node/常规进程不携带代理。
- 原有 LAN 控制器单测、主项目类型检查、构建及 19 项隔离 PocketBase E2E。
- 真实 Ubuntu 上的 Git-only 代理烟测和 --stage 验证；然后完成一次人工基线发布与 UAT，再启用定时器。
