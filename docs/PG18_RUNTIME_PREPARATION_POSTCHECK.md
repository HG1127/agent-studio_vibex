# 全新 PG18 运行态的分阶段只读核验

此工具核验数据库准备阶段，不启动服务、不修复数据、不改变角色、不激活账号，
也不输出生产 GO。当前 PocketBase 环境继续运行，正式迁移仍为 **NO-GO**。

完整路径实际安装 29 个 SQL 源文件，生成 31 条来源版本和一条初始化回执。
当前为 53 张表、52 张 FORCE RLS。不能用旧版基础结构的数量作为完整运行态的验收标准。

入口为 `services/pg-api/src/pg18-runtime-postcheck-cli.mjs`。每次必须选择一个阶段：

| stage | 预期数据库状态 | 操作边界 |
| --- | --- | --- |
| initialized | 精确完整来源回执、全部业务/认证表为空、19 个核心角色安全且禁用登录，认证密码尚未设置；无服务启用回执 | 初始化完成后；此阶段不检查 HBA，不能据此启用认证 |
| native-login | 认证登录启用并设置 SCRAM，其余服务登录禁用；全部业务/认证表仍为空，无服务启用回执 | 独立认证启用操作之后，首位管理员创建之前 |
| first-admin | 恰好一位启用的本地管理员、零会话、失败计数为零且无锁定；其余业务表为空、服务仍禁用且无启用回执 | 首位管理员创建后；尚未开始逐个保留和启用服务账号 |
| service-logins | 同样的单管理员/零会话/空业务状态，六个服务账号均已启用，六条操作回执与实际角色完全匹配 | 全部服务账号准备完成后，系统服务启动之前 |

可先分别运行四个离线计划，例如：

```text
node services/pg-api/src/pg18-runtime-postcheck-cli.mjs --plan --stage initialized
```

计划只读取版本化源文件，不需要凭据或依赖安装，不打开数据库连接。
没有默认检查阶段，也没有写入模式。实际只读检查的参数为：

```text
--preflight --stage <上表阶段> --confirm-database agent_studio --expected-source-sha256 <本份计划的摘要>
```

实际检查要求 Linux root、固定回环目标 `127.0.0.1:5333/agent_studio`、实际 postgres
超级用户、PostgreSQL 18、pgvector 0.8.7、非恢复实例及未变更的源摘要。
服务器观测到的连接地址也必须是 IPv4 回环，Unix socket 或不符的转发目标会拒绝。
需显式设置 `AGENT_STUDIO_PG18_RUNTIME_POSTCHECK_ENABLED=true`，以
`AGENT_STUDIO_PG18_RUNTIME_POSTCHECK_ADMIN_PASSWORD_FILE` 指向仓库外 root 所有的
私有密码文件；禁止 DATABASE_URL、PG* 等隐式连接环境项。

连接默认设为只读。采集只在 REPEATABLE READ READ ONLY 事务内进行，成功和失败
均回滚并归还连接；核验器会拒绝普通读写事务或较弱隔离级别。
所有阶段共享精确 SQL 来源回执、表/RLS 清单、角色属性和成员选项、直接对象授权与
现有知识辅助权限检查。只按表数量相等、存在一个管理员或有一条启用回执不足以通过。
版本账本按源定义保持无 RLS，其余 52 张表全部启用并 FORCE RLS；账本意外启用或
强制 RLS 也会被拒绝，避免版本读取被阻断后仍误报准备状态正常。

除 initialized 外，要求认证账号的首条适用 socket/TCP HBA 规则通过现有严格检查。
service-logins 还验证全部六类服务账号。所有阶段均拒绝任何已知运行态角色仍有连接。
输出只有阶段、摘要、计数和检查布尔值，不包含员工身份、会话值、密码或校验器。

账号逐个准备的中间状态可以用[服务账号工具](PG18_SERVICE_LOGIN_PREPARATION.md)
检查；它们不等于上表的阶段边界。员工开始登录、创建内容或服务连接建立之后，
这些准备阶段会按预期不再匹配。运行期健康、员工 UAT、实际已加载网络配置及真实登录、
长时间 Worker、备份恢复与切回签收必须继续单独验收。

## 旧 SQL 检查的适用范围

下列检查保留严格的基础结构用途，文件头已标明范围：

- `ops/baota-pg18-native-readonly-preflight.sql`：001 基础结构、认证结构尚不存在；修正为当前 23 张表/22 张 FORCE RLS。
- `ops/baota-pg18-native-postcheck.sql`：001 加 010，仍只含四条版本；认证登录禁用。
- `ops/baota-pg18-first-admin-postcheck.sql`：同一基础路径下的首位管理员状态。

完整 019–045 路径采用本文四个明确阶段。旧 SQL 不会因为放宽表数量而接受完整路径，
也不能用于跳过完整来源、角色和回执审计。离线计划、阶段核验或合成 CI 成功均不表示
现场验收完成，不构成部署或正式迁移授权。
