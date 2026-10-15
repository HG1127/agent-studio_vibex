# Agent Studio V8.0：宝塔 Ubuntu 24 PostgreSQL 隔离验证方案

## 当前状态和边界

本阶段已完成 PostgreSQL 17/pgvector 的结构蓝图、Docker Compose 配置及任务队列 SQL；后续增量已在 PGlite 嵌入式 PostgreSQL 中实际执行数据库结构、RLS、向量查询、租约及受限账号测试，并新增最小 Node.js TypeScript API 试验服务。**仍未启动真实 PostgreSQL 17 Docker 容器、迁移生产数据、连接宝塔服务器或替换 PocketBase。** 现有 V7.8 React + PocketBase/SQLite + Worker 仍承担全部真正运行的业务。详见 POSTGRES_V8_API_PILOT.md。

公司宝塔首页显示 Ubuntu 24、48 核、约 94GB 内存、40 个网站和 11 个数据库。截图不证明 Docker 已安装/运行，也无法评估磁盘 IO、容器冲突、端口或当前备份情况；因此必须隔离验证，不能直接改原服务器。

## 本轮交付清单

| 文件 | 作用 | 现状 |
| --- | --- | --- |
| deploy/postgres-staging/compose.yaml | 独立项目、独立数据卷、pgvector/pgvector:pg17，端口不对外公开，外部秘密文件、健康检查及资源限额 | 只做静态配置验证 |
| db/postgres/001_stage_schema.sql | 初始空库的 19 张表、pgvector、约束、索引、owner-only RLS 和最小权限角色 | 已在嵌入式 PGlite 引擎执行；PostgreSQL 17 Docker 仍未测试 |
| db/postgres/002_claim_job.sql | 单任务 SKIP LOCKED 原子领取、租约版本递增 | 未接入 Worker |
| db/postgres/003_finish_job.sql | 带令牌、版本和租约期限的完成确认 | 未接入 Worker |
| db/postgres/004_retry_job.sql | 有效租约内的受控延迟重试 | 未接入 Worker |
| db/postgres/010_verify_stage.sql | 只读检查扩展、表、RLS、策略与角色 | 尚未运行 PG |
| deploy/postgres-staging/verify-stage.sh | 需要审批标记才能执行的只读验证，不会启动或停止容器 | 未执行 |
| tests/postgres-staging.test.mjs | 无 Docker、无数据库、无浏览器的源码契约检查 | 已执行 |

注意：向量数据类型暂使用 vector(1536)，只是样板维度。正式选定 Embedding 模型后，需要验证真实维度、索引、检索召回和引用一致性。

## 安全设计

1. 独立的 agentstudio-pg-staging Compose 项目名，不覆盖宝塔现有数据库/网站。新增可选的 api-pilot profile，只在显式启用时启动独立 TypeScript API，发布到宿主机回环端口 127.0.0.1:7402；PostgreSQL 本身始终不开放端口。
2. 数据库服务无 ports 映射、无宿主 Docker socket 挂载，仅连接 internal Docker 网络。可选 API 容器同时使用受控内部数据库网络与出站网络，正式网关、外发策略仍须独立验证。
3. Docker 管理卷仅存新 staging 数据，不能当作备份。采用只在运行环境存在的 staging Secret 文件，不将密码打包。
4. restart 禁用，容器 CPU 上限 2 核、内存 4 GB，只作为可丢弃的测试模型；不要用这个 Compose 直接作为正式生产部署。
5. 数据库采用 owner_user_id 和复合外键，先严格限定个人资源；团队共享字段是预留，不能声称已实现团队 RBAC。
6. 模板分享的不可变审核快照有数据库触发器约束；已发分享码不通过外键强制依赖可能被删除的源 Agent。
7. 审计表不允许普通 API 数据库角色 UPDATE/DELETE；Worker 仅允许更新任务队列的有限状态和租约列。
8. PostgreSQL session actor_id 是连接上下文，不是认证。只有可信后端验证员工身份之后，才能在单笔事务中 SET LOCAL actor_id；不允许前端直连数据库。

## 实际测试库验证流程（本轮没有执行）

只有运维明确批准并确认不会影响已有 40 个网站之后，才可在独立新目录、独立 Docker Compose 项目中准备受控密码文件（chmod 0600），且文件不属于项目源码目录。

第一步只验证 Compose 配置：

    AGENT_STUDIO_STAGE_DB_PASSWORD_FILE=/secure/staging-only-password.txt docker compose -f deploy/postgres-staging/compose.yaml config --quiet

第二步，如果运维批准在隔离环境创建新容器/新卷，可以执行：

    AGENT_STUDIO_STAGE_DB_PASSWORD_FILE=/secure/staging-only-password.txt docker compose -f deploy/postgres-staging/compose.yaml up -d postgres

这是会拉取镜像、创建容器和数据卷的命令，本轮没有运行，切勿在宝塔正式服务器上未确认就执行。

第三步，容器和全新 staging DB 确认后，只读验证：

    AGENT_STUDIO_STAGE_VERIFY_ONLY=I_APPROVE_STAGING_VERIFY AGENT_STUDIO_STAGE_DB_PASSWORD_FILE=/secure/staging-only-password.txt bash deploy/postgres-staging/verify-stage.sh

该脚本不会 up、down 或删除 Docker 卷。验证只能说明初始结构检查通过，仍需真实的 RLS、多 Worker 竞争、数据库故障与向量查询 E2E。

PostgreSQL Docker entrypoint 的初始化 SQL 只在全新空数据目录首次初始化时执行；变更文件不等于升级已有 DB。后续必须使用带版本日志的迁移工具，不可直接反复运行 bootstrap 脚本。

## 现有业务迁移路径

第一阶段：导出完整 PocketBase Collections 和 SQLite 自定义表的结构清单，逐字段映射到新 PostgreSQL 设计。PocketBase 旧 ID 和 PostgreSQL UUID 必须使用明确 old_id/new_id 映射表，不能按名称或插入顺序推断关系。

第二阶段：建立独立 Node.js/TypeScript 业务 API、真实员工身份验证及数据库 Repository。保持 React 前端的 API 兼容或明确发布 API v2，而不是把现有 Goja Hooks 原样搬到 PostgreSQL。

第三阶段：将 Agent/Workflow 配置、运行事件、租约、审批和外部副作用审计逐步迁入 PG Worker。旧 Worker 与新 Worker 绝不可对同一真实外部写入任务同时执行。

第四阶段：迁移知识库元数据，源文件使用受控对象存储；选择真实 Embedding Provider 并验证向量检索权限、召回和溯源。

第五阶段：用匿名化或获授权的隔离副本完成迁移演练，检查数据量、外键关系、Checkpoint 兼容、权限隔离和恢复能力。最后才决定停写、切换和回滚窗口。

## 已知未完成

- PostgreSQL 17 Docker 实例尚未启动；初始化 SQL 已在隔离 PGlite 数据库引擎通过部分真实执行测试，但仍未完成 PostgreSQL 17 兼容性、真实多连接并发及服务器环境验收；
- Node.js/TypeScript 独立业务后端已实现受限 Agent 配置 API 首条纵向切片，但尚未替代 PocketBase Hooks 的 Workflow、知识库、Worker 等完整业务；
- 团队级 RBAC、员工登录网关、pgvector 实际嵌入模型与独立 PG Worker 尚未集成；
- 生产数据迁移、负载测试、备份恢复和宝塔正式部署尚未执行。

这是 V8 数据库隔离验证蓝图，不是已经正式启用的新数据库系统。
