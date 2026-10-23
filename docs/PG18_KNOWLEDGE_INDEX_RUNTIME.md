# PG18 所有者语义索引执行

SQL037 和独立索引 Worker/Broker 实现原生付费索引的执行链路。员工 API 只保存本人明确启动确认、读取状态和回执；原始向量、片段和密钥不会返回 Worker 或员工接口。查询向量、语义/混合检索、员工索引设置界面以及 Agent/Workflow 的语义接入仍未完成，正式切换为 NO-GO。

## 实际启动边界

在已审阅的隔离 SQL032–037 和独立角色基础上，额外运行许可为：

```text
AGENT_STUDIO_PG18_KNOWLEDGE_INDEX_UAT_ENABLED=true
AGENT_STUDIO_PG18_KNOWLEDGE_INDEX_UAT_APPROVED=APPROVE_DISPOSABLE_PG18_OWNER_EMBEDDING_INDEX_UAT
```

原生 API 仍须已有配置写入、知识共享、索引设置、授权记录的独立许可，并在非 root、监听 HTTPS 的上下文启动。旧 SQL035 设置和 SQL036 授权均不会自动产生提供商请求。员工还须经 Cookie/CSRF 提交 `index-authorize`，绑定精确配置标识、配置修订和授权修订，并明确确认 `START_OWNER_EMBEDDING_INDEX_AND_ACCEPT_PROVIDER_CHARGES`。该确认覆盖本人配置下待索引和之后增量导入的本人知识内容。仅 GET、预览和预检不会计费。

`index-receipt?request_id=...` 核对已提交确认，不自动重发写入。回执是历史结果；配置或授权变化后重放旧确认不会恢复执行权限。`bases/<id>/index-status` 只供所有者查看索引、活动尝试和历史不明结果计数。

## 执行与计费防重

Worker 使用 `agentstudio_knowledge_index_worker`，只领取最多 12 个片段的任务，得到任务标识、Worker 标识和随机租约令牌。Broker 使用另一独立角色读取数据库封存的内容及配置，再通过原有凭据 Broker 登录加载该所有者的密钥。两种新角色和索引 SQL 辅助角色均不能直接读取密钥封装或认证表；Worker/Broker 不能直接读取向量或尝试表。

所有修改先获取所有者事务锁（6635），再获取配置及任务行锁。不会持有事务等待 HTTP。Broker 在解密或网络请求之前提交 `dispatched` 记录，核对当前身份、配置和授权后执行一次请求；响应后再核对内容哈希、身份、配置和租约，再原子写入当前向量。

尚未分派的过期准备任务可换令牌重新领取。已分派任务超时、失联、响应异常或状态变化进入 unknown，既不自动重发，也不因重启、配置删除、重建排队或旧回执重放而消失。尝试记录只保存标识、内容哈希和必要元数据；不保存片段、密钥或向量。当前“重建排队”不能解除已有计费防重记录；若已有成功向量被清理或结果不明，必须由员工重新明确授权并确认启动，不能由后台自动增加费用。未来界面须说明这次确认可能重新执行全部本人待索引内容。

## 提供商与向量

保留本人指定的 OpenAI 兼容模型和管理员认可的自定义 HTTPS 端点，以及明确允许端口的 localhost/127.0.0.1 HTTP。公网 DNS 的全部结果必须通过公共地址检查，实际连接固定到已核对地址，并验证原主机 TLS；本机端点不通过 DNS。禁止重定向、代理、压缩响应和自动重试，不修改生成模型现有的官方端点限制。

每次最多 12 个输入，单段最多 1600 个 UTF-16 单元、请求不超过 64 KiB，提供商超时 18 秒、响应不超过 1.5 MiB。响应索引必须完整且唯一，向量为有限、非零的 2–3072 维并统一归一化；不发送隐式 dimensions 参数，不强制降为 1536 维。同一配置已学习的维度发生变化时拒绝发布。原始向量仅存入私有 SQL 表。

## 独立服务与只读交付

`knowledge-index-service.ts` 默认和 `--plan` 只返回离线计划。`--preflight worker` / `--preflight broker` 在严格 Linux 非 root、固定 PG18 目标、专用 NOINHERIT 登录和 systemd 凭据目录下读取目录与权限元数据；不打开监听、不领取任务、不解密员工密钥或调用提供商。Broker 还核对独立的凭据 Broker 登录、加密主密钥及服务证书，Worker 核对客户端证书。启动权限预检在功能关闭时也审计已经安装的新角色。

实际 `--serve worker` / `--serve broker` 需要上述独立运行批准。Broker 仅监听 `127.0.0.1:7455`，强制双向 TLS 和精确证书指纹；私有请求只接受租约字段，拒绝 Cookie、身份头及任意 URL/内容覆盖。Worker 停机取消本次私有请求，不自动重发；Broker 的外部请求和关闭过程有界。

两个 `.service.example` 均为只读 preflight、仅允许回环网络，没有运行批准或 `[Install]`。它们不授权安装、启用或生产部署。登录角色、凭据、网络白名单和长期服务配置仍须独立审阅与验收。

本地审查包可用 `node ops/build-pg18-native-api-preflight-bundle.mjs --output-dir <源树之外的绝对目录> --with-knowledge-index` 构建。它包含 Native API、索引服务依赖闭包及两个只读模板，验证清单和隔离离线计划；不包含数据库、凭据、依赖二进制或自动 SQL 初始化，不上传生成的归档。

本轮仅使用合成 SQL、真实私有 mTLS、本机合成 Embeddings 服务和内存提供商验证。完整回归及精确候选 CI 的最终结果以迁移验收记录为准。
