# Complete069 独立 Executor 账号准备

当前为源代码准备方案，生产保持 NO-GO。此入口不会部署、启动 Executor、配对设备或执行本地操作。

固定顺序为完整空库安装、原八项 C 准备与观察、独立 Review Worker、独立 Executor，然后 Review Dispatch/Design 与 Plan Workflow 的独立准备。全部业务账号、源代码、运行时和服务配置最终固定后，才进入 Telemetry/Root Controller 和长期运行验证。不能在新增账号后重跑旧 C 或旧 Review 的新建准备目录，也不能把旧六账号回执改名为新协议。

离线查看：

```sh
node services/pg-api/src/pg18-complete-executor-cli.mjs --plan
```

新的准备入口仅接受 PostgreSQL18、pgvector0.8.7、本机5333、数据库 agent_studio、postgres 操作者，以及实际系统标识、数据库 OID 和当前只读部署源摘要。必须先独立核实目标、网络和备份；源审查包不能授权目标写入。

新账号固定为 `agentstudio_local_executor_login`，连接上限3，初始 NOLOGIN/无密码，仅加入既有 `agentstudio_local_executor`，ADMIN/INHERIT 均关闭、SET 开启。新权限只有本库 CONNECT；保留原 C auditor、原 HTTPS/configuration/设备 opt-in 和原服务凭据路径。旧 operator/preflight CLI 仍保持原用途。

Root 必须提供彼此独立且位于源目录外的管理员、API、Review Worker 和 Executor 私密凭据文件。新的环境变量是 `AGENT_STUDIO_COMPLETE_EXECUTOR_ENABLED=true`、`AGENT_STUDIO_COMPLETE_EXECUTOR_WRITE_APPROVED=PREPARE_COMPLETE069_FIXED_EXECUTOR_ONLY`、`AGENT_STUDIO_COMPLETE_EXECUTOR_PASSWORD_FILE` 和 `AGENT_STUDIO_COMPLETE_EXECUTOR_JOURNAL_DIR`。另需旧 Review 凭据和日志目录、原运行时清单及原锁文件摘要。所有实际写入仍须适用的人为授权。

`--prepare` 和 `--inspect-operation` 使用同一固定参数顺序：`--profile complete069 --confirm-database agent_studio --expected-source-sha256 … --expected-system-identifier … --expected-database-oid … --review-operation-id … --operation-id …`。两个操作 ID 必须不同。准备先核对 Review 原 intent 与实际独立 LOGIN/API auditor，再检查全部非系统全局账号、完整旧角色/成员/ACL、57条 ledger 和133张表。仅自己的一个新增账号从前后旧目录摘要比较中排除，它自身接受更严格的独立检查。

日志位于源目录外的 Root0700目录，以0600、O_EXCL、NOFOLLOW和 fsync 写入独立 intent/result；intent 绑定 Review 操作及摘要、源、物理目标、旧目录、ledger、表镜像和新 SCRAM 摘要，不保存密码。COMMIT不确定或输出丢失后只观察该操作，不重放或接管既有账号。观察不会把先前 COMMIT 声称为已确认；后续新增账号后，应使用后续阶段的完整严格目录，而不是此阶段的旧目录摘要。

隔离 CI 使用全新合成数据库，实际调用本准备器、原 C auditor和原非 root `native-local-executor-service-preflight-cli.mjs --service-preflight`。它同时核对拒绝越权表授权、未知全局角色、错误目标/源、密码复用、较早 trust HBA、公开日志目录和重复准备，确认 ledger及133张表不变。通过预检不代表设备可用、服务已启动、员工 UAT或长期运行合格。
