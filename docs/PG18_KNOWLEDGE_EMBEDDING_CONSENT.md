# PG18 语义执行授权准备

SQL036 在 SQL035 的索引设置上增加独立员工授权。现有设置、队列和索引状态均不自动成为付费同意；所有旧配置的索引、查询授权默认为关闭。本模块不包含付费传输、索引 Worker 或语义查询执行器。后续 SQL037 的独立确认、索引 Worker/Broker 和分派防重见 [所有者索引执行](PG18_KNOWLEDGE_INDEX_RUNTIME.md)；SQL036 的记录本身仍不会启动计费。

在隔离空库顺序应用至 SQL036，保留已有配置写入、知识共享和索引设置的许可后，才可额外开启授权接口：

```text
AGENT_STUDIO_PG18_EMBEDDING_CONSENT_UAT_ENABLED=true
AGENT_STUDIO_PG18_EMBEDDING_CONSENT_UAT_APPROVED=APPROVE_DISPOSABLE_PG18_EMBEDDING_CONSENT_NO_DISPATCH
```

这是授权记录接口的隔离验收许可，不会注册付费执行器。仅设置准备的旧许可无法开启新接口；非监听、root 或非 HTTPS 上下文仍拒绝启用。

`GET /api/v2/knowledge-embedding/consent` 返回本人当前配置标识、配置版本、授权版本及分别生效的索引/查询选项。员工通过原生 Cookie、CSRF 和 `POST` 显式 grant/revoke。grant 必须同时提交精确配置标识、配置版本、授权版本，以及 `APPROVE_EMBEDDING_PROVIDER_CHARGES_FOR_THIS_PROFILE` 确认值；不能提交员工 ID、密钥或向量。撤销不依赖配置仍然存在。

每次更换连接、连接修订、模型、端点或启停设置，都产生新的配置标识。相同配置的正常保存和维度学习保留标识。更改后再恢复、删除后重建、甚至重新使用相同的数值版本，都无法复用旧授权。连接停用、凭据版本变化或员工失效会使当前授权无效。

请求 ID 与精确请求摘要绑定。响应丢失后只查询 `consent-receipt?request_id=...`，客户端不自动重复写入；主动重放原请求返回原回执，不创建新的授权。回执记录历史结果，当前权限须重新读取 consent，不能把旧回执中的 true 当作当前许可。授权修订和不可变回执在配置删除后保留，撤销也留下审计事件。

新表强制 RLS，API、通用 Worker、Broker、身份解析角色及成员登录不能直接读写。启动预检检查函数所有者、固定搜索路径、公开执行权限、配置标识触发器及回执不可变权限；索引辅助角色获得旧试验向量列读取权也会被拒绝。

后续付费执行必须同时满足独立管理员运行许可、本人有效授权、当前配置和连接修订、当前员工身份，以及持久分派防重记录。索引使用知识库所有者凭据，查询使用当前读者自己的凭据；共享访问还须复核当前 ACL 和语义许可。不能根据本模块已存在授权就自动计费。本轮测试全部使用合成数据。

本文件记录 SQL036 的授权记录边界。后续持久尝试记录、私有 Worker/Broker 和检索见 [SQL037 索引](PG18_KNOWLEDGE_INDEX_RUNTIME.md)及 [SQL038 查询](PG18_KNOWLEDGE_QUERY_RUNTIME.md)，员工操作见[语义设置与查询界面](PG18_KNOWLEDGE_SEMANTIC_UI.md)。Agent/Workflow 语义执行及实际运行环境验收仍待完成，正式迁移保持 NO-GO。
