# Agent Studio V8：PDF/DOCX 独立解析进程和异常恢复

## 范围与状态

V8 PostgreSQL 试验后端的 POST /api/v2/knowledge-bases/:uuid/document-files 现将 PDF/DOCX 的文字解析放入独立 Node.js 子进程，而非主 HTTP 线程。现有 PocketBase 仍是运行基线。

本能力已在隔离开发环境使用真实合成 PDF/DOCX、签名 JWT 与 PGlite PostgreSQL 进行验收。没有接触公司文件、宝塔服务器、生产数据或外部模型。

## 执行流程

1. 先验证签名 JWT、知识库所有权及本人权限，未授权直接返回 404，不启动解析进程。
2. JSON 请求体限制 760 KiB 内，PDF/DOCX 原文件最多 512 KiB。文件名与 Base64 使用严格白名单。
3. parseDocumentIsolated 使用 child_process.fork 建立独立子进程，仅通过 IPC 传入待解析内容，不继承主服务模型、JWT 或数据库环境变量；子进程不输出原始数据及错误详情到日志。
4. 单子进程 V8 Old Space 上限 256 MiB、执行超时 12 秒、每个 API 实例最多同时运行两个子进程；超过限额 HTTP 429，超时 HTTP 422。
5. 正常完成或解析失败都终止子进程并释放槽位。只有解析成功才开始知识库事务，之后再次核验所有权、内容去重和分块持久化。
6. TXT/Markdown 使用已有有界文本导入；检索仍是关键词片段，不是完整语义 RAG。

## 解析约束

- PDF：检查文件头、限制最多 25 页、提取文本最多 12,000 字符；拒绝损坏、加密及无可提取文字的扫描文件。
- DOCX：检查 ZIP 头及所需 XML 结构，限制 ZIP 条目、声明解压体积和正文长度；Mammoth 仅提取原始文字，不渲染图片、宏或 HTML。
- 子进程返回的 MIME、文件名和文本长度需再核查，异常细节不得泄露。
- PATCH 只能在知识库自身资源路径操作；search/documents/text-documents/document-files 路径不会旁路原有安全校验。

**警告：子进程隔离不等于操作系统安全沙箱。** 子进程仍共享容器的操作系统用户、网络和文件访问权限；Node V8 堆上限也不等于严格的 RSS/CPU 上限。正式服务需要独立低权限容器/解析服务、只读文件系统、禁外网、cgroup 资源限制、恶意文件扫描、审计及按员工限额，不可直接开放公网未知来源上传。

## 自动化测试

    pnpm --dir services/pg-api run check
    pnpm --dir services/pg-api run test:document-parser
    pnpm --dir services/pg-api run test:document-worker
    pnpm --dir services/pg-api run test:knowledge
    pnpm --dir services/pg-api run test

document-worker 检查真实 PDF/DOCX、错误码、超时终止、进程释放和并发上限；knowledge 使用真实签名 JWT 与隔离 PGlite RLS 检查权限、导入、搜索、引用和禁止跨员工写入。所有测试不打开浏览器或管理页。

## 尚未满足的正式上线要求

Ubuntu PostgreSQL 17 真正运行及压测、文件对象存储、精确页级偏移和 PDF/OCR、正式 Embedding 与混合检索、跨员工团队 RBAC、真实 OIDC 及公司员工试用、旧库到新库的数据迁移与 Worker 切换均未完成。

本轮不等于 V8 完整业务上线或已替代 PocketBase。
