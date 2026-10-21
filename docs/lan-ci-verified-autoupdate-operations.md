# 内网 Ubuntu / 宝塔：CI 验证的长期自动更新

本手册由已登录宝塔的运维人员在终端执行。仓库模板不代表生产上线授权；真实员工 UAT、网络隔离、权限、备份恢复演练及长时间 Worker 验证仍须完成。不要向聊天、工单或 Git 粘贴密钥。以下命令不由开发代理连接服务器执行。

## 行为和边界

每 15 分钟现有 systemd timer 调用安装在 `/usr/local/libexec/agentstudio-lan` 的 root 控制器 `pull-update.py --auto`。它向固定 GitHub API 验证当前 main 的完整 40 位小写 SHA，以及同仓库、同 SHA、push/main 的 `agent-studio-quality.yml` 最新运行 completed/success；PR、手动运行、旧成功、失败重跑、超时、API 不可访问都不能上线。构建后再次验证 main 和 CI。该 workflow 已移除 push 路径过滤，使每个 main SHA 都有完整检查；必须审查并保护 workflow 和 main 的写入权限，成功 CI 本身不是对恶意代码的安全证明。

GitHub API 专用 opener 明确使用 `ProxyHandler({})`，禁止重定向，保留系统证书校验。它不改变全局代理配置，不影响其他请求，也不输出 URL、token 或 HTTP 错误正文。公开仓库可以匿名调用；若确有速率限制，可由 root 单独安装最小只读 GitHub token 到 `/etc/agentstudio-lan/github-readonly-token`，0600，禁止写进命令历史或仓库。

`/etc/agentstudio-lan/enable-lan-autoupdate` 必须是普通文件、非软链接、root:root、精确 0600，内容只能是：

| 内容 | 自动权限 |
| --- | --- |
| 文件不存在 | 禁用，输出 LAN_AUTO_DISABLED |
| AUTO_FRONTEND_ONLY | 保留前端自动上线，backend/worker 改动阻断 |
| AUTO_CI_VERIFIED_RUNTIME | 允许通过安全检查的前端、Hooks、Worker 一起更新 |
| 其他内容、错误属主/组/权限 | 拒绝执行 |

自动源码比较以当前安装 SHA 为基线，对新增、修改、删除都生效。`deploy/`、`.github/`、`ops/`、`db/`、PG API、PB migrations、依赖清单/锁文件、隐藏文件、schema/migration、认证/密钥/凭据/网关/执行权相关路径及未知顶层路径必须人工审查。Hooks 新增 DDL、applySteps 或 onBootstrap 也阻断。允许范围为普通 `src/`、`public/`、Worker、Hooks、docs、tests；敏感规则优先。此策略有意保守，不能把重命名/混淆危险操作当成绕过审查的方法。仓库写入者必须可信并经过代码审查。

自动拉取永远不安装或修改 root 控制器、systemd、TLS、密钥；不运行 PostgreSQL 迁移，不切换 PG 生产链路。即便手工 `--reviewed-runtime`，PB migration 签名变化也会拒绝；迁移必须走独立人工备份、映射和 GO/NO-GO 流程。

## 一次性审计和备份

先在独立环境运行测试并审查确定的完整 SHA。把经过审查的源码目录放在 root 管理的本机目录，下面 `AUDITED` 必须替换为实际位置；不要把运行中员工数据复制到仓库。进入 root shell后：

```bash
set -euo pipefail
umask 077
AUDITED=/root/agentstudio-reviewed-source
CTL=/usr/local/libexec/agentstudio-lan
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
SAVE=/var/backups/agentstudio-lan/operator-$STAMP
test "$(id -u)" = 0
git -C "$AUDITED" status --short
git -C "$AUDITED" rev-parse HEAD
# 人工核对上面的 SHA、干净状态和审计记录，检查三个 Python 文件及 workflow diff。
systemctl disable --now agentstudio-lan-update.timer
if systemctl is-active --quiet agentstudio-lan-update.service; then
  echo '更新仍在运行；等待正常退出后重新开始，不能在 activation 期间强停。'
  exit 1
fi
systemctl stop agentstudio-lan-update.service
install -d -o root -g root -m 0700 "$SAVE"
cp -a "$CTL" "$SAVE/controllers"
cp -a /etc/systemd/system/agentstudio-lan-{update.service,update.timer,pocketbase.service,worker.service} "$SAVE/"
cp -a /etc/agentstudio-lan "$SAVE/config"
cp -a /www/server/panel/vhost/nginx/192.168.1.133_8090.conf "$SAVE/"
readlink /srv/agent-studio-lan/current > "$SAVE/current.txt"
sha256sum "$CTL"/*.py > "$SAVE/old-controller.sha256"
systemctl cat agentstudio-lan-{update.service,pocketbase.service,worker.service} > "$SAVE/effective-units.txt"
```

确认没有仍在运行的更新进程；等待构建结束时不要同时换控制器。审查 `systemctl cat` 的 drop-in：PocketBase/Worker 必须使用 current 下的路径，`KillMode=control-group`、停止后不留子进程，只有本机这一组服务可以写 pb_data。员工不能直接连接 PB；保留 nginx 登录、匿名拒绝、管理端拒绝和 HTTPS CA 校验。若存在其他写入者、自动拉起机制或外部附件写入者，先停用自动更新并处理。

控制器的 BASE、DATA、ORIGIN、CA_CERT、NGINX_SITE 必须与现有服务器核对；本模板沿用 `192.168.1.133:8443` 和 PB `127.0.0.1:7100`。任何地址修改都需重新审计/hash。

## 权限和原子升级控制器

保留 update unit 的 `UMask=0077`；不要全局放宽 umask。根因是 mkdir 的 0755 参数会被 0077 过滤成 0700，导致 agentstudio-lan 的 systemd 200/CHDIR。新控制器在校验完新解包代码后，显式 chmod 每一级目录 0755、文件 0644，包括 release 根、隐式创建的中间目录；baseline bootstrap 同样修复。代码归 root，运行用户只有读取/进入权限。

```bash
# 非递归更正控制根目录；绝不要 chown -R 整个 BASE 给运行用户或 builder。
chown root:root /srv/agent-studio-lan /srv/agent-studio-lan/{releases,incoming}
chmod 0755 /srv/agent-studio-lan /srv/agent-studio-lan/releases
chmod 0700 /srv/agent-studio-lan/incoming
install -d -o root -g root -m 0700 /var/backups/agentstudio-lan
install -d -o root -g root -m 0755 "$CTL"
# /usr/local/libexec 及其所有父目录必须 root:root、无 group/other 写权限、非软链接。
# BUILDS 和 BUILD_HOME 是隔离 builder 的 0700 私有目录，保持现有设置。
exec 9>/srv/agent-studio-lan/.lan-deploy.lock
flock -n 9
for file in ci-gate.py agentstudio-lan-deploy.py pull-update.py; do
  install -o root -g root -m 0755 "$AUDITED/deploy/lan/$file" "$CTL/.$file.next"
  cmp "$AUDITED/deploy/lan/$file" "$CTL/.$file.next"
  mv -T "$CTL/.$file.next" "$CTL/$file"
done
sha256sum "$CTL"/*.py > "$SAVE/new-controller.sha256"
for file in ci-gate.py agentstudio-lan-deploy.py pull-update.py; do
  cmp "$AUDITED/deploy/lan/$file" "$CTL/$file"
done
install -o root -g root -m 0644 "$AUDITED/deploy/lan/agentstudio-lan-update.service.example" /etc/systemd/system/.agentstudio-lan-update.service.next
mv -T /etc/systemd/system/.agentstudio-lan-update.service.next /etc/systemd/system/agentstudio-lan-update.service
install -o root -g root -m 0644 "$AUDITED/deploy/lan/agentstudio-lan-update.timer.example" /etc/systemd/system/.agentstudio-lan-update.timer.next
mv -T /etc/systemd/system/.agentstudio-lan-update.timer.next /etc/systemd/system/agentstudio-lan-update.timer
systemd-analyze verify /etc/systemd/system/agentstudio-lan-update.{service,timer}
systemctl daemon-reload
flock -u 9
```

每个文件通过同一文件系统 rename 原子替换；timer 已停止、服务已退出并持有部署锁，因此不会执行混合版本。原控制器备份留在 SAVE。不要把 CTL 改成 builder/运行用户可写目录或软链接。update unit 使用 root 是为受控停启服务、备份和切换指针；Git/pnpm/构建一律通过 setpriv 降权为 agentstudio-build、清空环境并启用 no-new-privs。保留 ProtectSystem=strict、限定 ReadWritePaths 和构建专用 HOME。

新 update unit 增加 TimeoutStopSec=5min 和显式 KillMode=control-group；控制器接收 SIGTERM 时进入异常恢复路径，为超时后的旧代码恢复保留时间。不要使用 SIGKILL，也不要缩短这个恢复期限。25 分钟启动预算和空间要求仍须按真实数据量验证；中断/超时后的服务 failed 状态必须人工检查。

若旧 versioned release 已为 0700，仅对审计过的纯代码 release 修复权限；不要对 BASE/pb_data/备份递归 chmod。先检查没有链接、特殊文件或员工数据，确认 root 所有权，然后显式修复该版本：

```bash
RELEASE=$(readlink -f /srv/agent-studio-lan/current)
case "$RELEASE" in /srv/agent-studio-lan/releases/*) ;; *) exit 1 ;; esac
test -d "$RELEASE"
test -z "$(find "$RELEASE" -type l -print -quit)"
test -z "$(find "$RELEASE" ! -type d ! -type f -print -quit)"
find "$RELEASE" -exec chown root:root {} +
find "$RELEASE" -type d -exec chmod 0755 {} +
find "$RELEASE" -type f -exec chmod 0644 {} +
sudo -u agentstudio-lan test -r "$RELEASE/worker/run.mjs"
sudo -u agentstudio-lan test -x "$RELEASE/pocketbase/pb_hooks"
sudo -u agentstudio-lan test ! -w "$RELEASE"
```

nginx/current 和 PB hooks/Worker 路径尚未连接时，先按原 LAN 基线手册完成 `--bootstrap` 及 systemd/nginx 路径切换、备份和健康验收；不要用新版本的 SHA 冒充当前运行版本。

## Nginx 配置检查与 systemd 只读沙盒

自动更新器执行 nginx -t 时会按现有 Nginx 配置打开 /www/server/nginx/logs/error.log 并访问/创建 PID 文件。如果 update unit 保留 ProtectSystem=strict 却没有允许这个实际目录写入，Nginx 检查会返回 EROFS，自动部署必须失败关闭。最小修复是在已审查的 agentstudio-lan-update.service 中仅增加 /www/server/nginx/logs 到 ReadWritePaths；不要放开整个 /www、/run 或关闭 nginx -t。安装更新 unit 后必须 systemctl daemon-reload，再通过 systemctl show/cat 验证生效配置，最后执行只暂存和服务检查。服务失败时保持 timer 禁用直到验收通过。

## 模拟、基线升级与验收

```bash
cd "$AUDITED"
python3 -m unittest discover -s tests -p test_lan_outbound_ci.py -v
node --test tests/lan-outbound-cicd.test.mjs
pnpm check
pnpm test:e2e:parallel
python3 "$CTL/pull-update.py" --check
python3 "$CTL/pull-update.py" --stage
```

`--check` 只查 CI；`--stage` 仅构建归档，不停服、不切换 current，不是完整上线 dry-run。离线 Python 回归用合成 SQLite/模拟服务验证 active/pending/lease、缺表、停服期间改变、迁移、健康失败回滚；Ubuntu CI 在真实 0077 umask 下检查解包权限，Windows 对 POSIX mode 位不作等价断言。

本次升级自身改变 controller 和 workflow，自动策略会阻断从旧基线直接跳过；运维必须审查整个 baseline→目标 SHA 的敏感 diff 后，手动一次性建立新基线。stage 返回的 SHA 必须与 `--check` 的当前 main 完整 SHA、GitHub 完整 CI 成功记录核对。维护窗口内让员工退出，暂停计划任务并等全部任务/审批/租约/embedding 队列结束；用只读检查确认可部署，再执行：

```bash
SHA=替换为已核对的40位小写main提交
# 先只读检查，不向控制台输出公司数据。
python3 - <<'PY'
import importlib.util
p='/usr/local/libexec/agentstudio-lan/agentstudio-lan-deploy.py'
s=importlib.util.spec_from_file_location('lan',p)
m=importlib.util.module_from_spec(s); s.loader.exec_module(m)
m.idle_snapshot()
print('LAN_IDLE_OK')
PY
python3 "$CTL/agentstudio-lan-deploy.py" "$SHA" --reviewed-runtime
```

这是显式人工运行时授权；不会越过 PB migration 签名门禁，也不自动安装新 root 控制器。真实服务重启必须在用户确认的维护窗口执行。验收登录页、已有员工登录、未登录 `/__pb/api/studio/me`=401、`/__pb/_/`=403、TLS CA/IP SAN、Worker 真实合成任务、附件读取和旧数据；检查 current SHA、两个服务正常、备份含 pb_data/storage 和 config，并在隔离机上做恢复演练。

## 启用和日常状态

完成一次性验收后，在 root 终端明确启用运行时模式：

```bash
install -o root -g root -m 0600 /dev/null /etc/agentstudio-lan/.enable-lan-autoupdate.next
printf '%s\n' AUTO_CI_VERIFIED_RUNTIME > /etc/agentstudio-lan/.enable-lan-autoupdate.next
mv -T /etc/agentstudio-lan/.enable-lan-autoupdate.next /etc/agentstudio-lan/enable-lan-autoupdate
systemctl start agentstudio-lan-update.service
systemctl status agentstudio-lan-update.service --no-pager
systemctl enable --now agentstudio-lan-update.timer
systemctl list-timers agentstudio-lan-update.timer --all
journalctl -u agentstudio-lan-update.service -n 100 --no-pager
readlink /srv/agent-studio-lan/current
systemctl is-active agentstudio-lan-pocketbase.service agentstudio-lan-worker.service
```

原 timer 当前为 disabled；代码变更不会替用户启用。仅前端模式则把内容改为 AUTO_FRONTEND_ONLY。未来普通功能只需推送 main，等待该 exact SHA 全部 CI success；timer 自动构建，完成备份后同时更新前后端。没有变化时 LAN_UP_TO_DATE；仅 release 元数据变化时检查健康并推进指针，不重启服务/备份数据库。

有应用变化时，控制器先确认空间，再在停服前做只读一致性检查：Agent/Workflow 必须为 succeeded/failed/cancelled，不能有活跃租约、started/unknown 外部写入、待启动计划、到期计划或 embedding 排队；未知状态/缺表/锁错误/损坏都拒绝。停止 Worker、PB 后再查，逻辑数据库指纹必须完全相同，否则恢复旧服务、留失败日志、下个周期再试。只有无变化才制作停止状态的 SQLite backup + 全部附件 + 配置快照，再原子切换 current、启动 PB/Worker，并验证认证和 TLS 健康。pb_data 始终在 release 外。

数据库较大时完整逻辑指纹会增加检查时间；宁可超时阻断，不把未完成的检查当成空闲。计划任务频繁到期或长期 pending/unknown 状态会持续阻断；先通过应用正常完成/人工核对，不能为了上线直接 SQL 清空队列。

## 异常禁用、报警和恢复

```bash
systemctl disable --now agentstudio-lan-update.timer
# 先删除开关，不通过 Git 改动控制器来禁用。
rm -f /etc/agentstudio-lan/enable-lan-autoupdate
systemctl status agentstudio-lan-update.service --no-pager
journalctl -u agentstudio-lan-update.service --since today --no-pager
```

停止 timer 不会取消已经开始的 activation；需要维护时先等该 oneshot 正常退出，避免强行杀死切换/备份过程。`LAN_PULL_BLOCKED`/`LAN_DEPLOY_BLOCKED` 对应非零退出和 systemd failed。为 update unit failed 状态接入现有监控告警；仅 timer 继续触发并不代表上一轮成功。

`LAN_DEPLOY_FAILED_REQUIRES_OPERATOR` 表示上线失败；控制器优先切回旧代码并重启、再次检查健康，成功输出 LAN_CODE_ROLLBACK_OK，失败输出 LAN_RECOVERY_REQUIRES_OPERATOR。保留 SQLite/附件/配置备份，绝不自动恢复数据库，因为新进程可能已经写入真实数据。代码回滚也不能证明业务数据未变化；必须人工审查并决定是否从停止写入后的备份恢复，不能混用旧 SQLite 与新附件。

健康失败的 candidate 留存用于调查，后续同 SHA 会因 candidate_must_be_new 阻断；不要在服务运行时删除 current 指向的版本。确认当前已回到旧 SHA、停止自动更新、保存失败 release/日志后，运维可将未激活 candidate 移到 root 私有隔离目录再重新 stage。忙碌或停服竞态阻断会清理尚未激活 candidate，允许后续周期安全重试。磁盘、schema、敏感路径或 CI 阻断必须先处理原因。

回退控制器也须先停止 timer/等待 oneshot、持同一部署锁，从 SAVE 逐文件原子恢复并核对旧 sha256，再恢复单元并 daemon-reload；保持自动标记不存在，先重新验收。不要自动 restore pb_data，不要移除用户/系统文件腾盘，不要连接生产 PG 来“修复”本流程。

## 本地交付验证记录（2026-10-20）

独立工作树基于 main 810002a。Python 部署回归 32/32、Node LAN 回归 10/10；pnpm check 的单元 167/167，TypeScript 和生产构建通过；pnpm test:e2e:parallel 的真实隔离 PocketBase 测试 19/19，两个 worker，91.4 秒。后续仅修改部署 Python、unit 和手册，重跑部署回归通过。

本机是 Windows，POSIX 权限位由 Ubuntu CI 再验证；没有访问真实服务器或创建远程 CI run。工作树依赖解析借用本机已有依赖，PocketBase 使用已有本地二进制，临时数据在项目盘。最终仍需用户在 Ubuntu 进行上述一次性审计、安装、哈希核验和 UAT，timer 保持由用户手动启用。
