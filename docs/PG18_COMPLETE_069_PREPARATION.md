# complete069 独立初始化、账号准备与源码交付审阅

本路径面向独立的全新 PG18 实验目标，生产仍为 **NO-GO**。源码包、离线计划和
合成 CI 均不授权目标操作、服务启动或真实公司数据迁移。PocketBase 当前运行态
保持原有职责。目标备份、网络、凭据、员工 UAT、长时间 Worker 和恢复签收仍须分别完成。

## 先区分版本与包的用途

| 路径或包 | 包含什么 | 不能据此执行什么 |
| --- | --- | --- |
| 默认050 runtime-init 审阅包 | 原050结构与原认证、六账号、分阶段 postcheck 协议 | 不能把 full069 ledger 过滤后交给050校验器，也不能伪造旧六账号回执 |
| 原 Native API preflight 包 | Native 源码、裁剪后的业务依赖声明、可选索引/评审/Executor 审阅资产 | 不包含 full069 安装器、新 prepare CLI 或其完整来源闭包；不能当 full069 初始化包 |
| 独立 complete069 源码审阅包 | 当前完整来源闭包、53份 SQL、19个后续步骤、完整安装与 prepare CLI、原 NativeAuth/首位管理员实现、精确解析器与依赖审阅元数据 | 不含 PG 驱动运行树、业务依赖运行树、密码、数据库或已安装服务；不会执行 SQL 或启动服务 |

complete069 的实际映射是133张表、55条来源版本加两条来源回执，共57条 ledger。
这些数量用于识别对应来源快照，不能代替完整权限、函数体、约束、真实 LOGIN 或员工验收。
059/060 来源快照继续分别固定为
`c934562ba2b8fa6c204bf0fa25573d2a63dc45cfdd6be22f30120a914d2d4bcb` 与
`bf8a681699139a57ad4d6743173af247613cec4be2426a2f70dc68b76c77af67`。
默认050、旧六账号枚举、HBA verifier 和旧回执格式保持冻结。

## 固定入口与顺序

安装入口是 `services/pg-api/src/baota-pg18-complete-init.mjs`，显式 profile 为
`complete069`。它只支持完整空库安装、观察和验证；不升级既有050，不接管另一个来源
摘要的既有069，也不启用账号。安装后先确认实际物理集群标识、数据库 OID、完整来源
回执和惰性状态。安装 COMMIT 回应不明时只读确认，不自动再次安装。

独立准备入口是 `services/pg-api/src/pg18-complete-service-cli.mjs`。其固定顺序为：

1. `api`：使用初始化时原 API 秘密，仅从 NOLOGIN 改为 LOGIN；要求匹配原 SCRAM，
   不轮换密码。随后必须通过独立真实 API LOGIN 的完整 catalog 审计。
2. `native-auth`：准备原 `agentstudio_native_login`，使用独立新秘密及已审阅的首条
   适用 HBA 规则。原认证050激活器不能用于此 profile。
3. `first-admin`：新入口复用完整的原 `native-first-admin-cli.mjs:run()`，包括真实
   NativeAuth 连接、私密文件、原互斥初始化锁、仓库与 KDF；不另造员工身份或 bootstrap。
4. `worker`、`identity`、`broker`、`index-worker`、`index-broker`：真实首位管理员存在
   后逐项准备。Worker 继续使用初始化时原 SCRAM；其他固定账号在同一事务内完成
   NOLOGIN 建立、固定组关系与首次启用。每项都重复真实 LOGIN 和完整 API catalog 核验。
5. 独立 Executor 若需启用，再走其单独审阅流程；随后才进入各服务、Worker、员工及长跑验收。

新 prepare 的角色映射见其纯计划。七个 LOGIN 仍是原六种账号加独立 NativeAuth；
`first-admin` 是操作，不是第八种 LOGIN。Executor 不加入原六枚举或新准备工具的账号表。
七个 LOGIN 不代表七类 Worker 均已就绪：assessment 另要求固定的
`agentstudio_review_worker_login`，只允许成员 `agentstudio_review_worker`。
C v1 八项动作不准备这个额外 LOGIN；其独立 operator 对 full069 的兼容性及实际结果
须另行审查，不能借用 stage Worker、扩充原六枚举或补造 ledger 权限来代替。
普通账号仅获得本库直接 CONNECT 和固定不可继承、不可转授权、允许 SET ROLE 的成员关系；
不新增表、列或认证 schema 权限。不能把“直接 CONNECT”解释为已撤销原 PUBLIC TEMP 权限。

实际 prepare 需要 Linux root、Node24、固定隔离目标、当前完整来源 SHA、实际 system
identifier/OID、唯一 operation UUID、root 外部私密输入、完整已验证 PG runtime manifest
和对应显式写入许可。默认及未知参数拒绝。不要把真实秘密写入 argv、说明、源码或记录。
全部动作均不分发凭据、不启动服务。本文不提供目标连接、部署或 start/enable 命令。

## 新操作记录与只读确认

新记录位于仓库外 root:root0700 目录，文件为 root:root0600、单硬链接、非符号链接：

- `<operation_id>.intent.json` 使用 `complete069_service_operation_v1`，先 fsync 再变更。
  它绑定 action、来源 SHA、物理目标和 SCRAM verifier 的摘要，不保存 verifier 原文。
- `<operation_id>.result.json` 使用 `complete069_service_result_v1`，通过匹配 intent
  绑定上下文。它记录真实 COMMIT、LOGIN、API catalog、管理员与 ledger 未改的证据。
- prepare 的 stdout 为 `complete069_service_preparation_v1`。必须检查 `verified` 及
  各项证据，不能仅以存在 JSON 或退出码为通过依据。
- `--inspect-operation` 返回 `complete069_service_observation_v1`，使用相同来源、
  物理目标和 UUID，只读确认当前状态。退出0也可能带 false；它始终保留
  `prior_commit_acknowledged:false`，不能把当前观察冒充过去 COMMIT 的签收。

COMMIT 不明时保留 unknown，不重放 CREATE/ALTER，不换秘密或 UUID 自动重试。
记录不写入 `schema_migrations`，不冒充 `pg18_service_login_<kind>_001`；旧工具对
full069 的拒绝不能被改名为成功。记录本身不是签名能力，也不是服务存活或长跑证据。

fresh bootstrap 的管理员检查要求零 session；真实登录/注销后仍有撤销的 session 行。
fresh catalog 也会拒绝后来独立准备的 Executor LOGIN。因此服务开始使用或加入 Executor
后，需组合独立的真实只读 LOGIN/角色/catalog/Native 就绪检查，不能删 session、过滤角色，
或继续套用 fresh-only 检查器。长测 BEGIN/SAMPLE/END 必须使用独立审阅协议和真实时序。

## 三种依赖范围不能混为一谈

| 范围 | 包含与验证 | 明确边界 |
| --- | --- | --- |
| 源码审阅包 | 精确 TypeScript5.9.3 解析器四文件、源闭包、SQL、原 package/lock 和摘要 | 解析器仅用于 AST 与离线 plan；没有完整 tsc CLI，也没有 PG 驱动或业务依赖运行树 |
| migration/prepare 与只读 Native auth-smoke PG runtime | 原完整来源 capability、锁定的14包 PG 图、精确解析器与外部 runtime manifest | 它不是完整业务依赖清单；额外 node_modules 会被其精确 inventory 拒绝 |
| 正式业务运行树 | 对启用功能单独审阅原 package/lock、全部所需依赖、只读源码、系统凭据及真实入口 | 文档解析等还需要原 jszip/mammoth/pdfjs 等依赖；不能从14包 auth-smoke 推断完整业务、Worker 或文档解析已验收 |

不要在 operator 受信目录安装全部业务/开发依赖后过滤 inventory 来强行通过。
业务运行树应独立建立受信依赖与文件来源证据；相同源码仍需匹配最终审阅来源 SHA。
原 Native preflight 包会生成裁剪后的 package 声明且不携带原 lock，它不是 operator
capability 所要求的锁定运行树，不能将其依赖安装说明用于 full069 prepare 目录。

complete069 manifest 描述安装/准备合同的来源闭包，不自动覆盖各业务入口通过 `new URL`
引用的子进程、Worker 可执行文件、unit、模板或资源。完整业务交付还应显式核对例如
`document-parser.worker.mjs` 等实际运行资产。这个独立源码包不冒充所有业务运行包的超集。

原 `native-server.ts --serve` 的合成 smoke 使用非 root、固定 LoadCredential 路径、
真实 API/Auth 连接与真实合成首位管理员 HTTPS Cookie/注销。它只证明该实际链路；
不会启动其余五个 Worker/Broker，也不把退出后的 smoke 子进程当持续运行服务。
文档解析、商业模型、真实员工、连续运行和恢复行为需各自的实际验收。

## 独立 Executor 与 telemetry 后续边界

先保存八项 bootstrap 操作及实际证据，再按
[独立 Executor 审阅说明](PG18_NATIVE_LOCAL_EXECUTOR_OPERATOR_REVIEW.md)处理固定 LOGIN、
第五份服务端 DB 文件、HBA、同 unit 只读预检和单独授权。该材料须另行交付，complete069
bootstrap 包不冒充 Executor provisioning 包。服务端 DB 秘密和桌面配对 token 不能互换。

telemetry 使用独立 `agent_studio_telemetry` 数据库和其固定角色/凭据/控制协议。
原8种 kind、16个 slot、18个 telemetry 角色不因新业务 LOGIN 扩容。bootstrap 不创建、
授权或签收 telemetry；业务账号不能因此取得 telemetry CONNECT、schema、函数或表权限。
后续启用必须单独核对同集群两库、各实际身份和完整拒绝边界，不改旧六协议或伪造旧通过。

## 独立源码归档入口

源包生成器是 `ops/build-pg18-complete069-review-bundle.mjs`。它要求显式
`--profile complete069 --expected-source-sha256 <审阅后的完整来源摘要> --output-dir <源树外新目录>`，
仅收集、归档、解包复核文本源文件。它不连接数据库、不安装依赖、不执行任何应用 CLI
或 SQL、不启动 listener。生成的 tar.gz 不进入 Git。

接收者先通过独立可信渠道核对外层归档 SHA，再核对内层 REVIEW_MANIFEST.json 和所有
文件摘要。完整来源 manifest 的 `source_sha256`、整个源码归档 SHA 与 runtime manifest
SHA 是不同对象，不能互相替代。源码变化须由 Root 重新封存，并在最终组合来源上重做
fresh 与真实 LOGIN/Native 验证，不能沿用旧回执。旧059/060包仍保持原有范围和字节。
