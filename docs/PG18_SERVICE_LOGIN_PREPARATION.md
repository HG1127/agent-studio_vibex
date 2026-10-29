# PG18 服务账号逐项准备与启用审查

> 版本边界：本文保留默认050及其原有准备协议，不适用于 complete069。
> full069 请先阅读[独立初始化与账号准备](PG18_COMPLETE_069_PREPARATION.md)，使用新 prepare
> 入口及外部 root 操作记录；不得过滤 ledger/catalog、追加旧六账号伪回执，或把旧工具拒绝当通过。


当前 PocketBase 环境继续运行，正式迁移仍为 **NO-GO**。本文及工具是源代码准备，
不代表目标主机执行、服务启动或生产切换授权。只适用于全新 PG18 初始化路径。

顺序为：完整空库初始化并校验源回执 → Native Auth 登录及网络规则审查与启用 →
首位本地管理员 → 下列服务账号逐个检查、保留和启用 → 独立的系统服务与员工验收。
[分阶段只读核验](PG18_RUNTIME_PREPARATION_POSTCHECK.md)用于明确的准备边界，
不把部分服务已启用或已开始员工使用的状态误认为首位管理员刚创建完成。
原认证激活器的空库检查只用于认证启用前，不能在服务启用后重新运行或用于轮换密码。

| 服务参数 | 固定登录账号 | 显式切换的权限组 |
| --- | --- | --- |
| api | agentstudio_stage_login | agentstudio_api |
| worker | agentstudio_stage_worker | agentstudio_api、agentstudio_worker |
| identity | agentstudio_bound_dispatch_login | agentstudio_bound_dispatch |
| broker | agentstudio_model_broker_login | agentstudio_model_broker |
| index-worker | agentstudio_knowledge_index_worker_login | agentstudio_knowledge_index_worker |
| index-broker | agentstudio_knowledge_index_broker_login | agentstudio_knowledge_index_broker |

入口为 `services/pg-api/src/pg18-service-login-cli.mjs`，无参数默认拒绝。
以下计划离线读取源文件，不读取凭据、不连接数据库，也不创建系统文件：

```text
node services/pg-api/src/pg18-service-login-cli.mjs --plan --service api
```

计划可以对六个固定服务分别运行。管理员、认证和各服务的凭据都应由独立的
root 所有、私有权限的仓库外文件提供；服务密码为新生成的 80 位小写十六进制值。
禁止在命令行参数、日志、Git、说明文档或审计回执中放置真实密码。

## 单账号操作守卫

三个操作共同需要 `--service <上表参数> --confirm-database agent_studio`。
`--preflight` 只读，`--reserve` 保留禁用账号，`--activate` 只执行首次启用。
后两者还需要 `--expected-source-sha256 <审查后 SQL 快照摘要>`。

执行只接受 Linux root、`127.0.0.1:5333/agent_studio`、PostgreSQL 18、pgvector
0.8.7、实际超级用户 postgres，且不处于恢复模式。
与目标不符的服务器侧连接地址或 Unix socket 同样拒绝。必须移除环境中的 DATABASE_URL
与 PG* 默认连接项，显式设置 `AGENT_STUDIO_PG18_SERVICE_LOGINS_ENABLED=true`，
以 `AGENT_STUDIO_PG18_SERVICE_ADMIN_PASSWORD_FILE` 指向管理员私有文件。
写操作还需与操作严格对应的 `AGENT_STUDIO_PG18_SERVICE_LOGIN_WRITE_APPROVED`：
`APPROVE_PG18_SERVICE_LOGIN_RESERVE_ONLY` 或 `APPROVE_PG18_SERVICE_LOGIN_ACTIVATE_ONLY`。
只有启用时读取 `AGENT_STUDIO_PG18_SERVICE_PASSWORD_FILE`。

预检验证完整来源版本、初始化回执、53 张表及 52 张 FORCE RLS、精确角色关系、
禁止的继承/转授权选项、直接对象权限及知识辅助权限。Native 登录必须已经启用，
至少存在一位启用的本地管理员。目标账号存在连接时拒绝操作。

网络规则必须让认证账号、当前账号和此前已启用账号的首条适用 socket 规则为
精确 reject 或 SCRAM，首条适用 IPv4 回环 TCP 规则为精确 SCRAM。
前置正则、文件引用、组或主机名规则可能匹配时保守拒绝。
PostgreSQL 按首条匹配规则认证；正则、文件引用与非 GSS 规则均需纳入判断。
参见 [PostgreSQL 18 HBA 文档](https://www.postgresql.org/docs/18/auth-pg-hba-conf.html)。
此检查读取 pg_hba_file_rules，不修改或重载网络规则；目标验收还需证明实际已加载
配置与真实认证连接一致。

初始 API/Worker 账号沿用初始化时的禁用角色关系。其余四类保留操作仅建立
NOLOGIN、NOINHERIT 账号与 CONNECT，不提前加入业务权限组。权限组、LOGIN、
SCRAM 和启用回执在同一事务内完成，以兼容现有索引账号权限审计。
写入前在事务锁内重复完整预检，失败全部回滚。

新密码在内存中与其他认证/服务账号的 SCRAM 校验器比较，复用会被拒绝；它也不能
复用管理员文件或明文密码。回执 `pg18_service_login_<服务>_001` 保存固定账号、权限组、
SQL 来源摘要、操作身份及时间，不保存密码或校验器。它是操作审计，不冒充 SQL 迁移。
已有启用回执、手动启用而无回执、权限漂移或回执篡改均拒绝，不能当作轮换或自动修复入口。

## 仍须单独验收

工具不会分发 systemd LoadCredential、TLS 证书或模型密钥，不启动服务，不创建付费
请求，也不启用定时任务。生产前仍需确认目标网络与 HTTPS、凭据投递、各服务自身
启动预检、员工 UAT、长时间 Worker/重启/响应丢失验证、目标备份恢复及切回签收。
合成测试及 CI 仅验证源实现，不能替代这些现场条件。
