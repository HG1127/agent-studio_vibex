# 隔离浏览器验证工具固定

2026-11-03：测试依赖固定为 `@playwright/test@1.65.0-alpha-2026-10-28`。该发布提交的浏览器清单包含 Chromium 和 headless shell `157.0.8103.15`、revision `1252`。版本和三个包的完整性记录来自发布者的 npm 元数据，锁文件由 pnpm 仅更新锁文件生成；未安装本地浏览器，未改动 API 包或其锁文件，也未新增依赖发布等待例外。

采用此测试版本的原因是：Playwright 官方问题记录确认旧 Chromium 对 `no-store` 响应使用流式 reader 时，页面到达 EOF 后仍可能报告 `ERR_ABORTED`，导致调试端无法读取原响应正文。上游修复和固定版本的清单可分别查阅[官方问题记录](https://github.com/microsoft/playwright/issues/42742)及[发布提交的浏览器清单](https://github.com/microsoft/playwright/blob/f9a841f968dd9a4e315df2ec2930da1952971667/packages/playwright-core/browsers.json)。这说明存在相关上游缺陷；不能仅凭错误文本判定当前应用的每次失败都由它引起。

新增验证仅在原模型草稿故事的已授权 GitHub 隔离环境执行，普通环境在导入 HTTP／SDK／浏览器前拒绝。默认 headless 和完整 Chromium 各执行六个合成循环回送案例：分块流 EOF、声明长度的流 EOF、原生 JSON 对照、真实长度不足的 FIN、主动 AbortController 取消、reader 中途取消。完成案例必须同时获得页面读取成功、原请求完成事件和可读取的原响应正文；负面案例必须保留真实请求失败及不可读取正文。服务端按页面实际读取进度分段发送两个数据块，不用客户端重试等待规避问题。

该验证不会修改应用 fetch、`cache: no-store`、响应大小限制、身份检查或原员工页面断言；不拦截或伪造响应，也不发送额外业务请求，诊断步骤不携带业务写入或模型提供商探测授权。它是测试工具回归，不是员工 UI、数据库或外部提供商验收。

提交 `eb04cbb2e12ca97a1b26ec3e12c14f4fb2110f3f` 的[真实隔离任务](https://github.com/HG1127/agent-studio_vibex/actions/runs/41544065167/job/125615176649)已执行并通过两种 Chromium 的全部十二个案例，普通 EOF 和原生 JSON 可取得原正文，真实截断、主动取消与 reader 取消均保留失败结果。该任务还通过原模型草稿页面故事；同提交 F01 共 21/21 项任务通过。这些是托管运行证据，不能归因于本地纯测试，也不表示全部迁移门槛通过。

这仍是精确固定的预发布测试依赖。生产应用、Electron 和员工实际浏览器的版本兼容性需要各自验证，不能由本项测试推断。正式切换仍需完整功能、长期 Worker、目标环境、备份恢复和真实员工 UAT 签收。
