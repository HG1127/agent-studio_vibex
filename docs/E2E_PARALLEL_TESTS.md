# Agent Studio 双路并行端到端验收

日期：2026-10-15。此运行器面向 `agent_studio_vibex版本` 独立开发副本，不会连接正式公司数据库、发布 VibeX App 或替代正式上线 UAT。

## 目标

原本 `pnpm test:e2e` 依次运行每一项集成测试。现增加 `pnpm test:e2e:parallel`：

- 从 `package.json` 中的**原始串行 `test:e2e` 脚本**自动提取每个 Node 测试文件，确保未来新增的测试与原基线保持一致，不手工复制清单。
- 默认 **2 路并行**，最大可显式设置为 3 路，避免开发机 PocketBase 与临时 SQLite 高并发耗尽内存。
- 每个测试文件使用独立的临时子目录（位于源码目录的同一磁盘分区的项目上级目录），覆盖 `TEMP` / `TMP` / `TMPDIR`，避免 Windows 系统盘临时空间不足与测试间同库碰撞。
- 严格使用 `process.execPath` 执行明确允许的 `tests/*.mjs`，**不使用 Shell / eval / 动态外部命令**。原脚本中的命令超出允许格式、缺失测试、重复文件或出现相对路径越界时立即失败。
- 子任务完成时输出 `PASS/FAIL` 与耗时；失败时输出经基础脱敏的有限末尾日志并停止分配新任务，已经启动的其他任务会结束后再汇总。
- 完成后仅清理本次创建的唯一临时目录，不触碰旧数据库、`pb_data`、正式部署路径或其他项目目录。
- 不改动串行 `test:e2e`，如遇机器负载、端口占用或需排除并发因素，可回退到它。

## 操作

```sh
pnpm test:e2e:parallel                  # 默认 2 路
pnpm test:e2e:parallel --workers=1      # 串行执行，但用隔离的单项临时目录
pnpm test:e2e:parallel --workers=3      # 仅在确有资源余量时使用
pnpm test:e2e:parallel --list           # 只列出当前基础集成测试清单
pnpm test:e2e:parallel --only=knowledge-team
pnpm test:e2e                          # 原始串行基线，保持不变
pnpm check                             # 单元 + TypeScript + 生产构建
```

运行器不会强行杀死其他已有测试服务，若开发机上已有占用静态测试端口的进程，请先由该进程所有者结束它。当前已审计主要测试端口：7133、7138、7244–7248、7281–7282、7291–7292、7301、7351–7352、7361–7362、7391–7392、7401、7411、7427；目前这些默认端口未发现重叠，仍不能保证外部服务没有占用。

## 生产边界

`test:e2e:parallel` 只是**本地隔离测试的提速**，不提供正式 PostgreSQL 17 真实部署验收、不运行真实外部写操作，也不证明公司宝塔服务器的备份/回滚、HTTPS 安全边界和 24 小时 Worker 稳定性。正式上线 Go/No-Go 清单仍以 `docs/INTERNAL_GO_LIVE_CHECKLIST.md` 为准。
