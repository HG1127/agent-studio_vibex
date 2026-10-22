# Agent Studio — PocketBase → PostgreSQL 17 迁移就绪与切换门槛（2026-10-16）

**现状：独立 PostgreSQL 17 的合成数据试迁移链路已通过；公司真实数据与正式生产切换仍为 NO-GO。** 绝不能把历史记录已归档、单元测试通过或 Job 绿灯误写成业务功能完成迁移。禁止直接操作公司宝塔、现存 PocketBase、生产 Worker 或已连接的其他公司数据库。

## 已验证的工程基线

| 领域 | 经过测试的能力 | 不可直接声称完成的部分 |
| --- | --- | --- |
| PostgreSQL 17 | 真正 PG17/pgvector TCP、行级安全 RLS、多个 Worker 领取/恢复、原子事务、schema 重放、隔离服务部署 | 公司生产数据与真实业务负载尚未运行 |
| 备份与恢复 | SQLite WAL 一致性快照与完整的物理用户表 inventory/SHA-256；PG17 合成库备份到新建数据库、逐表记录数与指纹恢复校验 | 企业备份保留策略、实际 RPO/RTO、业务写入冻结与恢复窗口 |
| 身份与 Agent | 独立审核的旧文本 ID→PG UUID、OIDC 主体核对文件；员工默认禁用；Agent 配置、任务准备、模型 Worker、审批与审计分链路测试 | 企业真实 IdP 与员工逐个启用、原密钥轮换、工具外部调用与费用策略 |
| Workflow | 配置图严格兼容子集导入、所有者关联；旧 `workflow_runs`/`workflow_events` 及结构化历史经独立审核后 DBA-only 不可执行归档 | **完整 Workflow 引擎、工具/LLM 节点、暂停/恢复、审批与原语义等价** |
| 知识库 | W2+W6+W16：元数据、文档、分片、向量原始 JSON 与 Embedding 设置/历史队列**同一事务**归档；跨员工隔离、失败整体回滚、快照幂等 | 原向量索引与 Embedding 模型兼容、重建、RAG 引用、共享 ACL 真实可用性 |
| 历史与协作 | Agent runs/events、Workflow runs/events、定时与协作历史在隔离 PG 中不可执行保存，含完整来源与 RLS；已核验和未核验状态区分 | 不把旧 running/queued 变为新任务；团队权限和定时任务须重新验收 |
| 只读对账 | 审核同一快照 SHA、身份映射、关键字段、历史 KB 文本/向量逐行哈希；明确 archive_only、failed 与 unsupported | 所有真实业务域的零差异对账尚未完成，部分运行时功能必然仍是 unsupported |

测试证据（公开仓库，**仅合成数据**）：[W20 统一迁移器及 PG17 全套 CI](https://github.com/HG1127/agent-studio_vibex/actions/runs/38718001907)、[W21 逐行知识库归档对账](https://github.com/HG1127/agent-studio_vibex/actions/runs/38720229239)、[V9 结构化历史及原系统 CI](https://github.com/HG1127/agent-studio_vibex/actions/runs/38832802348)。代码保存在 `migration/postgres-v8-6-staging-20261015` 分支的 [Draft PR #1](https://github.com/HG1127/agent-studio_vibex/pull/1)；**尚未合并 main**。

## 迁移前只读步骤 — 可以继续推进，不需要接触生产 PG

仅运维与安全负责人可在**经批准的隔离机器**上取得 PocketBase 的一致性快照。禁止手动拷贝热写入的 `data.db` 和 WAL，也禁止将 SQLite 备份、个人身份映射、OIDC subjects、密码或模型 Key 上传 GitHub、聊天或通用 CI 工件。

1. 使用 SQLite backup API 生成一份新路径上的冻结备份；执行 `pnpm db:backup verify --backup SNAPSHOT.sqlite`。新的 manifest 必须完整覆盖 sqlite_master 中全部实际用户表，未知非空表一律阻断，不允许随意过滤。
2. 执行 `pnpm db:pg-readiness --snapshot SNAPSHOT.sqlite --manifest SNAPSHOT.sqlite.manifest.json --strict`，取得脱敏的表数、异常类型和业务归属缺口。
3. 基于**相同源 SHA-256**，分别审核旧用户 ID→PG UUID 映射（`studio-approved-identity-map-v2`）、OIDC issuer/subject（`studio-reviewed-oidc-provision-v1`）、历史正文/事件内容的逐行 hash 和独立来源审批。签名真实性、人员实际身份与权限需要安全负责人核验，软件不能自行替代签字。
4. 运行统一的离线预检（**不连接 PostgreSQL**）：

```bash
pnpm db:pg-stage-operator --plan \
  --snapshot SNAPSHOT.sqlite \
  --manifest SNAPSHOT.sqlite.manifest.json \
  --mapping APPROVED_IDENTITY_MAP.json \
  --oidc REVIEWED_OIDC_SUBJECTS.json \
  --approval APPROVED_SOURCE_REVIEW.json
```

只允许来源审核全部通过的配置与历史数据进入试迁移；任何 `preflight_blocked`、未知非空表、身份冲突、原文审核缺失或未映射外键都必须修复后重试。PocketBase 的系统管理表与身份凭证另做独立重建审核，不能默默复制旧密码。

## 隔离 PG17 试迁移 — 当前工程能力具备，**真实数据尚未执行**

- 创建与生产完全隔离、可以销毁的 `agentstudio_stage`，独立授权 DBA，检查 PostgreSQL 17、pgvector、所有版本迁移、force RLS、默认禁用用户与无活跃新旧 Worker。
- 可使用 `deploy/postgres-staging/stage-operator.compose.yaml` 的显式 `stage-operator` profile，仅以只读挂载的方式提供**仓库外**快照、完整 manifest、审批的身份文件及 staging Docker secret。试迁移前应记录快照哈希并另做测试库备份。
- 统一导入顺序：员工身份 → Agent/Workflow 兼容配置 → W2/W6/W16 联合知识库归档 → 调度、协作、旧运行与事件历史 → 只读对账。每一分域单独事务、幂等，**不是整个系统的单个原子事务**；中途失败时隔离 stage 必须恢复/丢弃或使用同一经审核快照严格幂等重试。
- 导入结束后按源文件的 **每张表、每个主键、owner/外键、重要原始字段/内容 hash、审批链、读写权限、不可变归档** 对账。计数一致不等于核对完成；`archive_only_live_unsupported` 不能作为功能验收通过。
- 在完全隔离的合成 PG17 中已演练 `pg_dump`→新建数据库 `pg_restore`→全表指纹一致；实际企业数据的恢复演练和恢复时间应重新测量，禁止将恢复命令指向生产库。

## 生产 GO/NO-GO 的硬性阻断

1. **真实数据证据**：经授权的冻结快照、完整未知表审查、员工身份核验、全表/全行关联及原文无损对账。不合格数据不能通过忽略列、过滤行或复制旧密码解决。
2. **应用功能等价**：Workflow 真正执行/暂停/审批/恢复、Agent 工具安全、知识库重新索引/Embedding/RAG、团队 RBAC、定时任务、审核与跨租户访问，在新运行时针对代表性企业场景完成 UAT；历史归档本身不等于功能迁移。
3. **身份与凭据**：正式 IdP/JWKS 签名、每位员工启用/禁用及归属权限复核；API Key、Token 和外部集成必须独立安全轮换与重新配发。
4. **运行保护**：旧 PocketBase Worker 与新 PG Worker 不能同时认领同一任务；失败或未知外部副作用绝不自动重放；准备冻结写入/停机窗口和监控回退指标。
5. **可恢复性**：操作负责人/安全/DBA 确认备份、恢复、迁移账本、切回旧库的方法、验收时刻、恢复目标 RPO/RTO，并实际演练回滚。
6. **正式签收**：任何关键 `failed`、缺失归属、`unsupported` 或未审核业务域都维持 NO-GO。不得因 GitHub 全绿自动部署、更改 DNS/数据库连接串或关闭旧生产服务。

## 工期口径

可执行的 **隔离合成试迁移** 已完成。距离**真实生产切换**的工作量主要由实际数据内容、凭据/身份/共享权限、运行时功能差异和业务 UAT 决定；目前没有经过批准的真实快照对账数据，无法可信地给出剩余小时数。取得脱敏 inventory 和实际不兼容项清单后，才能按阻断项估算所需工程人日与并行路径。

**最终状态：仅独立 staging 合成试迁移能力通过，生产切换 NO-GO。**

后续模型通道增量：已实现 V2 专用租约身份函数提案、数据库检查点重放、逐节点一次性 Broker 记录，以及独立证书固定的私有 mTLS 适配器。默认关闭，Tool/Agent 在调用前暂停；本地验证只用合成员工和模型响应。真实 PG18 CI、目标主机核验、完整 Workflow 与员工验收仍未完成，完整迁移门禁保持 NO-GO。范围见 [V2 私有模型通道](PG18_WORKFLOW_V2_PRIVATE_MODEL.md)。

后续工具通道增量：五种内置工具与本人 HTTP 连接已接入 V2 专用身份核验、mTLS 和逐节点防重复记录；摘要必须绑定本人模型，HTTP 密钥由独立 Broker 解密，已知参数错误与外部不确定结果分开记录。当前验证只使用合成 SQL 数据及上游响应，完整 Agent、市场 MCP、PG 画布、语义知识库与团队 ACL、正式环境验收仍待完成。详见 [Workflow V2 工具迁移记录](PG18_WORKFLOW_V2_TOOLS.md)，完整门禁仍为 NO-GO。

后续 Workflow Agent 增量：已实现本人方案快照、有界多轮 Model/Tool 状态、逐步员工审批、重启重放与私有子步骤身份核验。真实回环 mTLS 和合成 SQL 已覆盖模型→工具→模型、拒绝/已知失败后的继续、不确定结果停止、Worker 提交故障及知识库范围；新增 Native Cookie/CSRF 子步骤测试。独立 Agent 自主运行、市场 MCP、PG 画布及正式验收仍未完成。详见 [Workflow Agent 节点记录](PG18_WORKFLOW_V2_AGENTS.md)，完整迁移仍为 NO-GO。

2026-10-23 独立 Agent 后端增量：已补本人角色直接入队、多轮 Model/Tool、逐步审批、私有 mTLS 身份及独立历史接口；旧单次运行接口不再读取此类内部检查点。独立专项 10/10、主工作区 345 项检查及 PocketBase 23 项隔离 E2E 通过。员工多轮运行 UI、完整功能等价和正式环境验收仍未完成，门禁维持 10 项阻断、cutover=false。用户已确认旧数据全部为测试数据，可不导入；下文历史快照/逐行对账要求仅在以后另行要求保留数据时适用。详见 [独立 Agent 运行记录](PG18_AUTONOMOUS_AGENT_RUNTIME.md)。

2026-10-23 多轮 Agent 员工界面增量：已接原生本人任务提交、逐步费用/操作确认、进度/结果与安全取消；不确定请求保留原幂等键、步骤哈希和决定，跨页保留、退出/401 时销毁。专项 10/10 包含真实 Cookie/SQL 响应丢失恢复与静态组件转义检查；实际浏览器及真实员工验收尚未执行。最新门禁为 244 个前端文件、38 个 PocketBase 依赖文件、10 项阻断，仍为 NO-GO。详见 [多轮 Agent 员工界面记录](PG18_AUTONOMOUS_AGENT_EMPLOYEE_UI.md)。

2026-10-23 原生 Workflow 画布增量：七类节点、本人资源修订绑定、幂等新建/CAS 保存恢复、撤销重做和独立运行审批界面已接入本地候选。每步费用/操作确认、当前资源核对、安全取消和会话清理继续由服务端校验。浏览器及真实 PG18 的本轮 CI 仅准备源码，尚无执行结果；完整功能等价、员工验收与运维门槛仍未完成。最新只读门禁为 253 个前端文件、38 个 PocketBase 依赖文件、10 项阻断，仍为 NO-GO。详见 [Workflow 画布记录](PG18_WORKFLOW_NATIVE_CANVAS.md)。
