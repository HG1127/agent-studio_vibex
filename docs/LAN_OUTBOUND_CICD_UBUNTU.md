# Agent Studio Ubuntu 宝塔 LAN 主动拉取 GitHub CI/CD

> 2026-10-19，Ubuntu 宝塔局域网部署运维说明。自动更新脚本已纳入代码库，但**受控部署控制器须在服务器手动审核更新，自动更新默认关闭**。本文命令不允许修改任何 PostgreSQL 生产数据。

## 1. 固定的现有环境（不准覆盖）

| 项目 | 实际路径或地址 |
|---|---|
| 公司内网 HTTPS | `https://192.168.1.133:8443/login`（可信内部 CA） |
| 宝塔 Nginx | `/www/server/panel/vhost/nginx/192.168.1.133_8090.conf` |
| PocketBase 0.40.5 | `agentstudio-lan-pocketbase.service`、`127.0.0.1:7100` |
| Agent Worker | `agentstudio-lan-worker.service` |
| 现有 GitHub 源码 | `/srv/agent-studio-lan/source` |
| SQLite/附件 | `/var/lib/agentstudio-lan/pb_data` |
| 服务端密钥 | `/etc/agentstudio-lan/studio.env` |
| 现有后台状态 | 管理员创建并可登录；初始化密钥已撤销；PB 和 Worker active |
| PostgreSQL 18 | 另一个独立项目，不参与本更新流程 |

**不要在已有 source 执行 git reset --hard / git pull / standalone:init，也不要清理 pb_data。**

## 2. LAN 自动更新方案

`main` 提交 → GitHub 完整 `Agent Studio quality` CI → Ubuntu 每 15 分钟主动读取 GitHub API → 要求**当下 main 完整 SHA**对应的 push/main/completed/success → 独立普通用户 clone/build → 仅允许的文件包 → 版本化 releases/current → 备份 SQLite 和附件 → 停止 PB/Worker、切换/健康检查 → 失败尝试回退应用。

- 无 GitHub 向 LAN 的 SSH 连接；没有公网域名、GitHub Runner 或外部 22 端口开放。
- 只更新 `dist` 前端的变更可自动激活；PocketBase Hooks / Worker / package.json 变化必须经运维审批，**迁移目录变化一律不自动执行**。
- **纯部署元数据版本（no-op）**：候选与运行版本的全部应用文件和哈希一致时，执行两次运行健康检查并仅原子移动 `current` 版本指针，**不会停止或重启 Nginx/PocketBase/Worker，也不对 SQLite 进行任何写入或备份**。第二次健康检查失败会立即恢复旧指针。只有 `LAN_NOOP_RELEASE_ADVANCED` 才表示成功。旧版控制器没有此分支，必须经过固定提交、SHA-256、Python 检查和运维审核后手动替换该 root-owned 控制器；禁止因 `NO_APPLICATION_RUNTIME_CHANGES` 直接调用旧版 `--auto`。
- GitHub 网络/CI 检查缺失、主分支已移动、构建脚本失败、归档校验失败、证书失效等情况全部拒绝部署。
- root 安装在 `/usr/local/libexec/agentstudio-lan/` 的三个控制器**必须手工审批**，不会随着 GitHub 自动被覆盖。
- 备份目录 `/var/backups/agentstudio-lan` 为 root 独占，包含冻结的 SQLite 快照和原有附件；代码回滚**不意味着数据库回滚**。
- 默认不启用 timer，必须创建 root:root 0600 文件 `/etc/agentstudio-lan/enable-lan-autoupdate`，内容单行 `AUTO_FRONTEND_ONLY` 才启用。

## 3. 现在请先执行只读预检

在宝塔终端执行以下命令，不会变更业务服务：

~~~bash
echo "=== runtime commit ==="
sudo -u agentstudio-lan git -C /srv/agent-studio-lan/source rev-parse HEAD
echo "=== source changes (may include approved pnpm builds) ==="
sudo -u agentstudio-lan git -C /srv/agent-studio-lan/source status --short
echo "=== service state ==="
systemctl is-active agentstudio-lan-pocketbase.service
systemctl is-active agentstudio-lan-worker.service
echo "=== disk ==="
df -h /srv /var/lib/agentstudio-lan
echo "=== public GitHub API reachability ==="
curl --noproxy '*' -fsSI --max-time 10 https://api.github.com
echo "=== trusted server certificate and CA file availability ==="
test -f /etc/agentstudio-lan/tls/server.crt && echo SERVER_CERT_EXISTS
test -f /etc/agentstudio-lan/tls/agentstudio-root-ca.crt && echo CA_PUBLIC_CERT_EXISTS || echo CA_PUBLIC_CERT_NOT_UPLOADED
~~~

CA 公钥文件可以后续上传到 Ubuntu，但 **CA 私钥 agentstudio-root-ca.key 禁止上传**。
**部署目录权限核对（只读）：**

~~~bash
stat -c '%a %U:%G %n' /srv/agent-studio-lan /srv/agent-studio-lan/source /var/lib/agentstudio-lan/pb_data
~~~

此前新建的 `/srv/agent-studio-lan` 顶层目录由应用用户拥有；切换到自动发布前必须由运维**仅非递归更改顶层目录所有权**，避免应用本身能够替换 `current` 软链接。不要动数据库的用户和权限。

## 4. 运维审核通过并合并 main 后的首次安装顺序

这是未来的操作计划，**还不是让你现在执行的写入命令**。

1. 先做 SQLite + 上传附件的一致性备份及恢复演练，保存旧 Nginx 和 systemd 服务配置备份。
2. 创建独立低权限构建用户 `agentstudio-build`；它只拥有独立 HOME `/var/lib/agentstudio-build` 和 `/srv/agent-studio-lan/builds`，不能读取 SQLite 或服务密钥。
3. 将**顶层** `/srv/agent-studio-lan` 改为 `root:root 0755`（仅此目录，**禁止 `chown -R`**）；其下已存在的 `source` 保持 `agentstudio-lan` 原有所有权，SQLite 和密钥也完全不动。创建 `root:root 0755` 的 `releases`、`root:root 0700` 的 `incoming` 和 `/var/backups/agentstudio-lan`；单独创建 `agentstudio-build` 专属的 `builds` 与 `/var/lib/agentstudio-build` 并设为 `0700`。这是强制安全门槛：运行账号不得改写 `current` 或 `releases`。**变更前核实目录内容及现有服务依赖，做好配置备份。**
4. 从已审核的 GitHub commit 安装并设为 root:root 0755：
   - `deploy/lan/ci-gate.py` → `/usr/local/libexec/agentstudio-lan/ci-gate.py`
   - `deploy/lan/pull-update.py` → `/usr/local/libexec/agentstudio-lan/pull-update.py`
   - `deploy/lan/agentstudio-lan-deploy.py` → `/usr/local/libexec/agentstudio-lan/agentstudio-lan-deploy.py`
5. 人工运行 `python3 /usr/local/libexec/agentstudio-lan/pull-update.py --bootstrap`，把**当前正在运行的 source/dist 及 Hooks**登记为 `releases/<旧SHA>` 与 `current` symlink。**此命令不重启服务、不会改数据库**。
6. 仅在数据库备份与验收后，修改三个既有配置，将 `source` 替换为 `current`：
   - Nginx 8090/8443 所在站点：`root /srv/agent-studio-lan/current/dist;`
   - PocketBase unit：WorkingDirectory、`--hooksDir=/srv/agent-studio-lan/current/pocketbase/pb_hooks`；原 `--dir=/var/lib/agentstudio-lan/pb_data` 和持久化 `--migrationsDir=/var/lib/agentstudio-lan/pb_migrations` **保持不变**。
   - Worker unit：WorkingDirectory 与 `ExecStart=/usr/bin/node /srv/agent-studio-lan/current/worker/run.mjs`。
7. 先检查 nginx -t、systemd-analyze verify，再按维护窗口重启 PB 和 Worker、平滑重载 Nginx；检验 HTTPS（**不得 -k**）、管理员重新登录、员工数据、后台任务和备份完整性。
8. 人工安装 `deploy/lan/*.service.example` 与 `*.timer.example` 对应 root-owned systemd 配置。先 `--check`（只读查询 GitHub CI）和 `--stage`（仅下载构建不影响现网），确认后再考虑自动更新。
9. 最后单独批准并创建 `enable-lan-autoupdate` root-owned 0600 文件，启用定时器。出现异常先停 timer、移除启用标记，不删除数据库和历史版本。
### 更新现有 root-owned 控制器（需要独立审批）

服务器在首次安装时部署了一个旧版 `agentstudio-lan-deploy.py`；后续只修复 no-op 流程时，不应将整个 `deploy/lan` 目录直接复制到生产。应先确认该修复已在 GitHub `main` 通过完整 CI，记下 **完整 40 位 SHA** 和 `deploy/lan/agentstudio-lan-deploy.py` 的 SHA-256，下载到 `/root` 临时目录验证哈希、执行 `python3 -m py_compile`，备份已有 `/usr/local/libexec/agentstudio-lan/agentstudio-lan-deploy.py`，确认定时器未启用，再以 `root:root 0755` 原子替换**这一份**已审核的控制器。不调用 `--bootstrap`，不触碰 `current` 或数据库。替换后优先运行 `--check`，并对已暂存的无变化版本做人工无停机演练，成功再考虑启用 timer。

## 5. GitHub 访问权限

当前仓库可通过匿名 git clone。CI 查询使用官方 REST API `/repos/HG1127/agent-studio_vibex/actions/workflows/agent-studio-quality.yml/runs?head_sha=...`，有公网 rate limit。若 GitHub API 限流，可配置**仓库只读**的 fine-grained PAT 于 `/etc/agentstudio-lan/github-readonly-token`，仅 root:root 0600。不得将 token 放在脚本、仓库、URL、日志或聊天中。

**私有仓库还需要 git clone 的独立只读授权**，当前公开仓库部署方案不会把 PAT 塞进 Git URL；私有场景应另行设计凭据助手。

## 6. 本地零服务器验收

~~~bash
python3 -m unittest discover -s tests -p test_lan_outbound_ci.py -v
node --test tests/lan-outbound-cicd.test.mjs
python3 -m py_compile deploy/lan/ci-gate.py deploy/lan/pull-update.py deploy/lan/agentstudio-lan-deploy.py
pnpm check
~~~

验证通过不等于真实服务器已经启用。真正启用前还需 UAT、备份恢复、证书信任、账号跨租户隔离、Worker 24 小时心跳等签收。PostgreSQL 迁移另行审查和切换。
