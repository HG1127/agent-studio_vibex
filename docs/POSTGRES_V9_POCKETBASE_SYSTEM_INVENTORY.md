# V9.1 — PocketBase 系统表与隐藏业务表的迁移盘点策略

**适用项目：** `agent_studio_vibex版本`，PocketBase SQLite → 隔离 PostgreSQL 17。此文档只说明源表盘点与试迁移准入；**生产切换仍然 NO-GO**。

## 为什么修改

原统一迁移器跳过所有以 `_` 开头的表。PocketBase 确实有内部系统表，但是自定义表也可能使用相同前缀，靠前缀跳过可能出现「备份清单里有、导入时丢失」的风险。

现在所有真实 SQLite 数据表仍必须在完整 SHA-256 manifest 中逐表记录并核对记录数。对于**非空**源表：

| 类型 | 处理 | 准入及退出状态 |
| --- | --- | --- |
| 已明确支持的业务表（员工、Agent、Workflow、知识库、任务、协作、历史归档等） | 交由严格的对应 importer 逐行验证、禁用执行 | 不通过计划或归属核验就阻断 |
| 经过枚举的 PocketBase 平台管理表 | 原记录不写入 PG 业务表，专门报告排除数量、待重建/待审批状态 | 可进行隔离试迁移，**不得因此宣称生产功能已恢复** |
| 任何其他未知的非空表，包括以 `_` 开头的表 | 报告未映射数量；在连接 PostgreSQL 之前停止 | `preflight_blocked`，退出码 2 |

## 明确识别的内部表

- 平台配置或元数据：`_collections`、`_migrations`、`_params`、`_logs`、`_requests`。
- 身份与安全状态：`_superusers`、`_mfas`、`_otps`、`_externalAuths`、`_authOrigins`。

该集合以 PocketBase 的 [初始化迁移实现](https://github.com/pocketbase/pocketbase/blob/master/migrations/1640988000_init.go) 为依据，且不能替代核查目标公司当前安装版本与实际 SQLite schema。其他以 `_` 开头的表**不自动视为平台表**。

源表中可能包含密码哈希、OTP、第三方身份凭证、请求日志等内容，继续保留于获得授权的冻结快照中，**不复制到新 PostgreSQL 用户、模型或任务配置中，也不输出在日志里**。跳过旧系统认证状态不等于已经完成新的员工 OIDC 登录和平台设置。必须安排独立的 IdP 身份核验、账户启用审批、密钥轮换、平台规则重建及必要日志保留政策。

## 脱敏的迁移计划结果

统一 `--plan` 输出：

- `excluded_platform_table_count`、`excluded_platform_row_count`：明确平台表中**非空表**和记录数。
- `excluded_auth_table_count`、`excluded_auth_row_count`：涉及历史认证/安全状态的非空表和记录数。
- `platform_configuration_rebuild_required`、`legacy_auth_reprovision_review_required`：是否需要平台配置和身份重建审核。
- 存在上述内容时，在 `blockers` 中附上 `pocketbase_platform_metadata_rebuild_unverified` 或 `pocketbase_legacy_auth_reprovision_unverified`。
- `unmapped_nonempty_tables`：尚未实现业务导入器或明确分类的非空表数；只要大于零就拒绝后续所有域导入。

以上字段不会展示用户 ID、系统管理员账号、API Key、表内容或原始文件路径。对于非空自定义下划线表也不输出具体敏感记录。

## 本地和 GitHub 验收

```bash
node --test tests/pg-stage-operator.test.mjs
node --check services/pg-api/src/stage-migration-operator.mjs
```

测试使用纯合成 SQLite，覆盖原有完整迁移计划、未知普通表阻断、未知下划线表阻断、明确内部表独立报告、旧超级管理员凭证不得迁入或泄漏。更高层次的真实 PG17 合成数据测试继续通过 [GitHub 迁移分支的 Actions](https://github.com/HG1127/agent-studio_vibex/actions) 验收。

## 正式生产切换依旧必须另行验收

完整源表分类只是输入覆盖的条件，**并不证明**实际源数据、权限或运行时功能可全部搬迁。还需获得真实业务一致性备份与运维授权，完成人员 OIDC 映射、逐域逐行数据对账、旧系统中非空表覆盖检查、运行时 Workflow/RAG/定时任务/协作权限一致性测试、备份恢复与回滚演练、安全和 DBA 审批。不能凭 `preflight_verified` 直接合并 `main` 或切换生产。
