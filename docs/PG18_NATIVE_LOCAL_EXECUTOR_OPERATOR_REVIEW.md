# Native Local Executor：独立安装补充步骤（源码审阅，NO-GO）

本文件是安装方案，未 provision LOGIN、生成真实凭据、修改 HBA、安装 unit、启动服务或执行设备副作用。当前生产状态仍为 NO-GO。先完成 Writer26 与 Tool Hub 实际 CI，再评审本补充包。

## 已确认的 ABI 与缺口

当前 `native-server.ts` 固定使用 `agentstudio_local_executor_login`，密码来自同一 Native unit 的第五份私密文件 `local-executor.secret`。SQL067 仅创建 `agentstudio_local_executor NOLOGIN` 权限组，不创建 LOGIN。完整 complete069 安装也不代表已完成 LOGIN、HBA、私密文件或员工 UAT。

原 C 审计要求 LOGIN 为 NOINHERIT、无超级用户/BYPASSRLS/建库/建角色/复制能力、无角色默认配置/有效期限制；只有一个直接成员关系：`agentstudio_local_executor`，其 `ADMIN=false, INHERIT=false, SET=true`。LOGIN 与组均不得取得业务/认证表、列或 `agentstudio_auth` schema 权限。组仅通过原 C 固定 RPC 工作。当前 installed marker RPC 只有在原31函数、ACL、catalog 全部校验后才可调用，不能改为直接 SELECT migration 表。

旧六种 service-login 协议和旧 HBA verifier不接受这个 LOGIN。不得向旧白名单添加 executor、伪造 `pg18_service_login_executor_*` 回执、追加新的 schema_migrations 行，或改冻结050/059/060。新增只读 CLI 的 `--plan` 不读私密文件、不加载 pg、不连接数据库；它不支持 `--apply`。

现有 Native `--preflight` 禁止 UAT 能力；带设备 opt-in 调用它会被原策略拒绝。因此新增独立的 service pre-start 只读检查，在同一个 DynamicUser unit 内校验真实 LoadCredential 文件和 Executor TCP 身份，再直接调用原 C 两个审计函数。它不启动 listener、不 pair、不执行工具，也不构成服务存活、员工验收或部署许可。

## 操作顺序与需要留下的证据

1. 由获授权的运维人员确认隔离 PG18 目标及备份/恢复点，核对 complete069 的 SourceBundle、53 SQL、19步骤和最新 C SQL067/manifest；保留真实 API 与 Executor catalog 审计结果。本文没有目标内网地址、员工资料或秘密。
2. 先区分实际 profile：默认050沿用原 native-auth、首位管理员和六种 service-login 协议；complete069 使用[独立准备入口](PG18_COMPLETE_069_PREPARATION.md)，依次完成 api、native-auth、first-admin 和后继五项真实 LOGIN/catalog 核验，记录新外部 root-only intent/result。不得把旧050激活器、六账号或 postcheck 用于 full069 后过滤 ledger/catalog、补造旧回执或忽略拒绝。完成所选 profile 的全部准备后，再进入本独立 Executor 步骤；不改旧协议。
3. 在原生 superuser 会话中保留只读目标身份（实际数据库/集群标识、主节点、PG18、源 SHA）及原始 `pg_hba_file_rules`、角色/成员/ACL 元数据。不要导出密码 verifier。先用本包独立 `inspectExecutorHba` 审阅原始有序规则，不能调用拒绝该 LOGIN 的旧六登录 verifier后忽略失败。HBA 示例仅允许固定 IPv4 loopback、固定数据库、SCRAM，拒绝该 LOGIN 的所有 socket、其他数据库与远端 IPv4/IPv6；必须在更宽规则之前。
4. 用独立的80位小写十六进制随机密码准备 root vault 第五文件（vault 0700、文件0600、非 symlink、仓库外）。不得把秘密放入 argv、环境变量、SQL文件、版本库、工单或日志。管理员须在内存中确认它不同于已有 Native四份秘密和所有现有 service LOGIN 密码；可用原 `matchesServiceScram` 比较已有 verifier，绝不输出内容。
5. 先核验本包直接复用的原 `executorOperatorTargetGuardSql`（只允许固定隔离服务目标的真实 postgres/PG18主节点及指定 vector），再在同一显式事务中执行审阅后的固定 `disabledExecutorReservationSql`；新 LOGIN 初始为 NOLOGIN、PASSWORD NULL。不使用 IF NOT EXISTS，不接管已有同名角色。只给本库 CONNECT 和上述单一、不可继承组关系，不给任何表/列、auth schema、pg_read_all_*、SET ROLE 到其他组、ADMIN OPTION 或默认角色配置。`executorConnectGrant` 仅接受正式固定数据库或专用 CI 数据库别名，后者仅用于独立 GitHub 合成服务。合成 CI 证明该原目标 guard拒绝其5432测试端点；它在独立 purpose guard后测试固定角色SQL，不伪装正式目标，也不声称原生产 operator 已通过。
6. HBA 的有效首次匹配规则和第五文件已核验后，由人工授权的独立一次性 operator 生成原 `makeNativeScramVerifier` 的15000轮 SCRAM verifier，使用 `executorActivationStatement` 严格校验后，在已绑定目标的显式事务内激活这个固定 LOGIN。不要改旧六登录 CLI。该纯 SQL 生成器不负责连接/授权/提交，当前 CLI 刻意没有 activation/apply 入口。回执放在仓库外 root-only 操作日志，包含 action ID、源 SHA、前后角色元数据和 COMMIT 结果，不含密码/verifier/设备 token。
7. COMMIT 回包不明时保留 unknown，不自动重试 CREATE/ALTER、不换秘密或 action ID。只读确认固定角色的属性、唯一成员、实际密码对应关系和独立 TCP 登录后，再由人工确定后续动作。角色属性看起来正常不能代替实际最小 LOGIN 的原 C 审计。
8. 将审阅后的可选 drop-in 纳入原 Native unit：仅新增第五 LoadCredential 和绝对环境路径、只读 ExecStartPre。保留现有 DynamicUser、NoNewPrivileges、ProtectSystem、ProtectHome、loopback 网络边界以及原四份凭据。root-only vault 文件不直接赋予运行时访问，使用 systemd 正规交付；root:root0440+有效 ACL 仅沿用原 `acceptsNativePg18Credential` 例外，不放宽为任意组可读。不要改 unit 名。
9. 设备变量默认缺省。仅在相应授权后使用 C 现有 `AVAILABLE`、`WRITES_ENABLED`、`APPROVED` 三项与原配置写入/HTTPS审批；现有批准文本明确是 disposable UAT，不能解释为生产 GO。新增预检通过后仍需原 Native 全启动审计、真实员工 owner 隔离、配对/撤销、unknown 恢复及长跑验证。本文不包含 start/enable/reload 或 Worker 启动命令。

## full069 之后的运行态边界

独立 Executor LOGIN 加入后，fresh bootstrap catalog 会将这个额外账号拒绝；真实 Native
登录后也可能保留合法 session 行。不能删行或过滤角色来重用 fresh-only 检查。后续就绪
应由各实际 LOGIN 的原最小权限/catalog 检查、同 unit 凭据和真实 Native/Worker 状态共同证明。
准备回执和离线计划不证明服务持续运行。

telemetry 仍是独立数据库、固定8种 kind、16个 slot、18个角色的协议。新增业务 Executor
LOGIN 不增加 telemetry kind/slot，不授予 telemetry CONNECT/schema/函数/表权限，亦不
改变旧六账号记录。后续启用须单独审查同集群两库及真实身份拒绝边界，不能把 bootstrap
或本源码补充包作为 telemetry 启用、长跑或生产签收。

## 两种凭据不能混用

第五份 DB 密码只属于服务器 Native API 的最小 Executor pool。桌面 `local-executor/native-run.mjs` 通过原 HTTPS API 配对，保存设备 token、journal 与 lock；它不获取 SQL LOGIN 密码、数据库地址或管理员身份。配对码一次展示，丢回包按原 pair-confirm/pair-commit；effects unknown 按原 recover/commit-result，不得自动重放。

## 失败与回退

任一目标、源、HBA、私密文件或原 C 审计不符都停止，不补表权限来绕过。需要回退时，先按授权关闭设备入口并处理已有请求；保留 owner/device journal 与 unknown 状态。LOGIN NOLOGIN 不等于已有会话已退出；确需结束连接时，仅处理有明确 PID/start 身份依据的自有连接，不能全局杀会话。不要删除 C schema、权限组、旧六登录回执或公司数据，也不要把 DROP ROLE 当作通用恢复。

本补充包的纯测试与合成 CI 源码不等于实际测试通过，更不等于正式安装完成。

## 可选源码归档

打包器默认不收录独立 Executor 入口；只有显式增加 `--with-local-executor-operator` 才纳入 CLI、只读预检、纯 operator plan、类型声明四个模块，以及本 runbook、审阅 JSON、unit/HBA 两个示例。该选项可以与原 `--with-knowledge-index`、`--with-agent-assessment` 组合；它不启用设备功能或执行 operator。

审阅命令形态为 `node ops/build-pg18-native-api-preflight-bundle.mjs --output-dir <源树之外的绝对目录> --with-local-executor-operator`。生成的 tar.gz 不进入 Git。包内 SHA256SUMS 覆盖四模块、其真实静态/动态依赖和四份固定说明；打包器会解包再核验，并实际执行无依赖离线 plan 与未授权模式拒绝检查。

归档的提取目录是源码审阅目录；unit drop-in 中的最终 runtime 路径需要另行核对，不能直接把示例当安装脚本。第五 DB 凭据从不进入归档，也不交给桌面 `local-executor` 客户端。旧 Native `--preflight` 不能替代独立同 unit 的只读 Executor 预检。源码归档验证不代表实际 systemd/数据库 provisioning 或员工 UAT 已完成。
