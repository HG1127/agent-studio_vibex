# 2026-10-26 通用办公流程真实模型验收

本次完成“表格汇总 → 文档报告 → 网页录入”的通用办公适配。使用用户已有的 MiniMax-M3.1-Flash 连接，通过已绑定电脑和逐次人工审批执行；实际运行结束状态为 succeeded（界面“已完成”）。不使用模拟模型代替本次真实模型验证。

## 真实结果

- 运行：`zc5wevcu1x0bo3i`；本人助手：`og718jp104c219z`（部门业务汇总报告）；员工 Daniel。
- 真实运行版本：`e0ff8d6d1d47e8434c078e064c505610727d6c84`，包括已合并的 Skill 功能；部署器已确认备份及健康检查通过。
- 5 条合成台账，按部门汇总：销售 2 条 / 1300.00，运营 2 条 / 750.00，研发 1 条 / 450.00，合计 2500.00。
- 输出：授权 work 根目录下 `office-model-report-001/summary.xlsx`、`report.docx`、`summary.json`，原始 `office-ledger.csv` 保留。
- 源 SHA256：`c4afc9b83b203c9d85e3a89c8c42be79178768fe79b21231787cba80e285f30e`；独立读取源文件、XLSX、DOCX XML、JSON 验证一致。
- 授权网页：`http://127.0.0.1:18763/office`。模型先读取结构、填四个字段并回读，另发提交操作。实际单号 `OFFICE-20261026-001`，服务端回执 `accepted: true`、`submissions: 1`、记录数 5、合计 2500.00。
- 本机 Word 以只读方式打开实际模型生成的 DOCX，导出 1 页 PDF；人工查看页面图片，中文、表格、金额及摘要没有截断。
- 运行共使用 12 / 18 步，页面核算模型调用 13 次、工具 9 次、审批 9 次。阶段方案也经过确认。

模型曾在第 7 步误用不存在的顶层 `browser.browser_click`。引擎在产生效果前拒绝；模型随后通过 `local_computer` 重新观察表单并正确提交。此错误保留在执行记录，不计为成功调用，也没有重复提交。提交后只读核对文件列表和清单，最终正常结束。

## 验证和边界

在与提交版本对应的隔离源码副本中运行 `pnpm check` 和 `pnpm test:e2e:parallel --workers=1`。回归包含真实隔离 PocketBase、员工权限、设备绑定和取消、MCP 浏览器、办公文件回读、单次表单回执，以及创建本人办公助手后预填任务和设备、无需自动执行的 React 流程。最终检查：380 / 380 单元测试通过（365 主测试 + 15 本地/多模态测试），TypeScript、Vite 构建与 113 个生产资源隔离检查通过；29 / 29 E2E 通过，300.3 秒。电脑连接提示新增了选择与取消选择的真实 React 回归检查。日志：`.tmp/local-office-ui-check-final.log`、`.tmp/local-office-ui-e2e-final.log`。

真实模型只处理 `.tmp/real-computer-acceptance/work` 中的样例和本机 18763 端口测试网页；桌面控制在本轮关闭。未读取公司台账、写入公司系统或扩大配对范围。验收后停止本地执行器和临时网页服务；已有可撤销设备凭据仅保存在本机忽略目录中。

这项验收通过的是通用台账、标准 DOCX/XLSX 与普通网页表单。带登录、自动保存、上传或复杂自定义控件的具体 ERP 仍须按其页面和员工 UAT 验证；本次不构成公司生产全面 GO。

使用入口和配置见 [办公流程使用说明](LOCAL_OFFICE_WORKFLOW.md)。原文件、浏览器、固定程序、原生桌面能力的验收见 [本机能力验收](LOCAL_COMPUTER_REAL_ACCEPTANCE_20261026.md)。

## 本机证据

证据保存在项目忽略目录 `.tmp/real-computer-acceptance/office-business/`：`model-final-result.json`、`model-completed.png`、`receipt.json`、`independent-verification.json`、`model-report.pdf`、`model-report-page-1.png`。凭据、数据库、测试产物均不纳入 Git。

## 发布与收尾

用户明确批准后，连接提示修复部署为 `b808ce0207d986f92248561c2588c71b2a7b64fd`。沿用服务器原部署器，先校验脚本 SHA256、持锁、断言原运行版本为 e0ff8d6，再执行备份和部署；终端确认 `LAN_DEPLOY_OK b808ce0207d986f92248561c2588c71b2a7b64fd data_backup=yes`，配置与服务健康检查通过。最小发布包 SHA256：`88fcc079efa0f77dcda2038d32632b85ea884ac9beb1e24fd6b436fe7c342c22`。保留已合并的 Skill 功能，没有推送 GitHub。

部署后重新载入原结果页并选择原已绑定电脑，确认提示为“本机已连接”，没有误报“1 项待连接”；原运行仍为已完成，回执、记录数和金额与部署前一致。未重跑任务或再次提交表单。补充证据：`postdeploy-ui-verification.json` 和 `deployment-b808ce0.png`。部署后 Tabbit 页面截图两次超时，因此以结构化 UI 核对和宝塔部署成功截图留证；部署前模型完成截图已保存。

浏览器桥接在重载和个别交互时返回过可恢复的 `IndexSizeError` 警告；目标控件及结果核对成功。本轮隔离 React E2E 没有页面脚本错误。报告保留观察到的诊断，不宣称任意浏览器环境均无告警。
