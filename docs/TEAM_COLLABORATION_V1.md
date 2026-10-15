# Agent Studio 内部协作 V1：团队知识库与同一个 Agent 的协同修改
> V1 是原始协作基线。后续新增的团队共享语义检索和 Agent 安全版本恢复，请以 [V2 增强说明](TEAM_SEMANTIC_AND_REVISIONS_V2.md) 为准。

日期：2026-10-15。适用于 **agent_studio_vibex版本独立 PocketBase + SQLite 业务链路**。已通过隔离测试，**非生产上线声明**。

## 1. 权限原则

- 系统使用独立 `studio_users` 员工账号，所有业务端点以服务端验证的登录令牌识别员工，不相信调用者伪造的 `X-Rh-User-Id`。
- 所有知识库及 Agent 默认 **私人**；所有者主动通过员工邮箱授权后，成员才看得到。知道随机 ID 本身不代表权限。
- 不开放跨员工密钥、模型连接、外部工具写入能力、任务执行日志或完整运行详情。
- Viewer、Editor、Owner 的范围按模块界定，不将“编辑某份资料”解释为“能执行拥有者的 Agent”。

## 2. 团队知识库

| 角色 | 文档目录、原文检索 | 增删文档 | 知识库名称、整体删除、授权 | Embedding 管理 |
| --- | --- | --- | --- | --- |
| Owner | 是 | 是 | 是 | 用自己的连接 |
| Editor | 是 | 是 | 否 | 否 |
| Viewer | 是 | 否 | 否 | 否 |
| 未授权员工 | 否 | 否 | 否 | 否 |

**实际流程：** 所有者在「知识库」选择自己的知识库，进入「团队知识库授权」，填写员工工作邮箱，选择 Viewer 或 Editor。成员登录后在「我的及团队知识库」能看到该库；检索时后台会再次核对权限。所有者可以即时撤销，随后成员的 REST 查询、Agent 或 Workflow 检索均会失败。

知识库编辑者新增文档后，若所有者已启用 Embedding 后台索引，则可能产生**所有者的向量化费用**；授权界面会说明。共享成员默认仅支持关键词/中文双字检索；V2 在所有者明确开启语义许可并确认双方模型兼容时，允许成员**用自己的 Embedding 连接仅为查询词向量化**，复用所有者已有文档向量，而不使用所有者查询密钥。员工可用自己的模型连接运行 Agent/Workflow 并引用获授权文档片段。

**隐私边界：** 共享文档会被成员读到。成员如通过自己的 AI Provider 处理该资料，文本可能被发送至相应服务商，企业仍须有数据分级与服务商合规策略。当前没有实现扫描件 OCR、统一团队向量模型计费、文档级 ACL 和自动部门分组管理。

后端：
- `modules/knowledge_schema.js` 新增可追踪迁移 `knowledge_0005_employee_sharing`、授权表、授权事件及删除清理触发器；
- `modules/knowledge_acl.js` 统一在每次检索及文档读写时验证所有权和授权；
- `knowledge_access.pb.js` 仅允许 Owner 授权及撤销，记录操作元数据；
- `modules/knowledge_search.js` 按每个库的**真实所有者**读取原文，且先验证全部库权限，混合私有＋共享检索时，未经语义许可或模型不兼容的共享库仍只走关键词；
- `KnowledgeBasesPage.tsx` 与 `KnowledgeSharePanel.tsx` 按角色展示页面入口，服务端仍是最终权限边界。

## 3. 多人协作同一个 Agent

与原「Agent 内部共享」的**复制模板**不同，新「多人 Agent 协作」入口 `/agent-collaboration` 让多人协作同一个 Agent 的**描述与规划字段**。

| 角色 | 查看受限方案 | 提交修订草案 | 审核采纳并更新原 Agent | 运行原 Agent / 取模型密钥 |
| --- | --- | --- | --- | --- |
| Owner | 是 | 通过原 Agent 编辑器 | 是 | 保留原有权限 |
| Editor | 是 | 是 | 否 | 否 |
| Viewer | 是 | 否 | 否 | 否 |

允许提案修改的字段仅限 `goal`、`task_scope`、`deliverables`、`task_plan`、`done_criteria`。编辑者不能通过提案设置模型连接、工具、知识库引用、外部 HTTP、密钥或执行权限。

1. Owner 在协作页面选择自己的 Agent，向已启用的员工账号授予 Viewer/Editor。
2. Editor 根据当前正式版本撰写修订并填写原因，提交为 Pending，不会直接修改原 Agent。
3. Owner 在同一页面查看草案内容、对比正式计划，选择采纳或拒绝。
4. 采纳前服务端计算**完整 Agent 配置版本指纹**。正式配置如已发生任何修改，包括模型、工具或知识库绑定，旧草案不允许覆盖，返回 409 版本冲突。
5. 两位 Editor 并行提交同版本草案时，Owner 采纳第一份后，第二份不能继续采纳，需重新基于新版本提交。每位 Editor 同时最多一条 Pending 提案。
6. Editor 撤权或降级 Viewer 后，其未审核提案立即作废；后端在采纳时还会复核提案作者仍是有效 Editor。
7. 授权、修改、采纳、拒绝和撤权写入 `agent_studio_spec_collab_audit`。员工不会获得原 Agent 运行历史、其他员工的模型连接或任意后台执行能力。

这属于**同一个 Agent 的受控、异步协作编辑**。V2 已增加逐字段差异及 Owner 的安全历史版本恢复；仍不是多人实时同屏编辑、完整配置的 Git 式历史、分支合并、评论通知或多级联合审批。原来的模板复制共享继续保留，互不替代。

后端 `agent_collaboration.pb.js` 和 `modules/agent_collab.js` 使用独立 ACL、草稿表及审计表；前端 `AgentCollaborationPage.tsx` 位于新的一级侧边入口和运行模块页签。

## 4. 安全与上线闸门

自动化复现：
```sh
pnpm test:team-knowledge       # JWT、多员工权限、Agent/Workflow、撤权
pnpm test:agent-collaboration # 并发草案、版本冲突、机密字段隔离、审核与撤权
pnpm test:migrations          # 旧库数据增量迁移和重启幂等
pnpm test:e2e                # 全量原业务回归
pnpm check                   # 单元测试、类型检查、前端构建
```

集成测试使用**临时 PocketBase 与测试模型**，不上传真实员工资料、不执行外部业务写入、不更改生产数据库。正式公司内网仍须审批真实员工/团队数据授权模型、限制公网与 PB 原始 API、真实 LLM 数据合规、共享知识库外部模型费用、备份/恢复、24 小时 Worker 和 UAT。原生产上线状态仍是 **NO-GO**。

## 5. 后续版本

- Team Space/部门归属、部门/项目组动态 ACL、批量授权及离职自动交接；
- 文档级权限及团队向量模型的独立配额、成本归属与审计；
- Agent 编辑分支、逐字段 diff、冲突解决、版本恢复、多人审阅/评论通知；
- 生产 PostgreSQL 17/pgvector 实库验证及 V8 原生 Worker；旧 SQLite 仍为当前独立运行链路。
