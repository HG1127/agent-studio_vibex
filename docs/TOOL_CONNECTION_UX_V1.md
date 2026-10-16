# Agent Studio｜工具连接 UX 增量（2026-10-16）

## 本次目标

针对用户在 Open-Meteo Forecast 中选 POST、以 `{"city":"杭州"}` 试调却收到 HTTP 400 的情况，降低非技术员工的配置门槛。此改动仅作用于 **agent_studio_vibex 独立版**，未触碰 PostgreSQL 迁移或真实公司数据库。

## 新交互

1. 添加工具默认选择 **GET**，并清楚区分 GET 的 URL 参数和 POST 的请求体；配置区在宽屏上加宽。
2. 提供 **Open-Meteo 天气查询示例**，一次填入用途、GET 接口、latitude / longitude URL 占位符和杭州经纬度测试参数；只填配置，不自动调用接口。
3. 对测试 JSON、字段占位符、超时参数、JSON 请求体替换后的合法性做**本地检查**；不符合要求时禁用试调并给出原因。
4. 对于 Open-Meteo Forecast 错误选 POST，提供“切换为 GET”修复按钮；当输入 city 却缺经纬度时告知需先地理编码。
5. 展示将发送的 **HTTP 方法、域名和查询字段名**，不展示敏感的查询参数值，提示 GET 参数是否被使用。
6. 收到 400/401/403/404/405/429/5xx 等上游错误后，优先给排查思路，原始响应折叠保留。尤其“not valid JSON”不推定唯一根因。
7. 保存/启用、通过本地格式检查、第三方真实请求成功是不同状态。已保存异常连接仍能看到“异常 · 已开启”并进入修复。
8. 保留 POST 逐次显式确认，保留员工归属、密钥遮盖与代理网络调用的既有安全机制；未新增外部付费请求。

## 实证和限制

- `node --experimental-strip-types --test tests/tool-connection-ux.test.mjs`
- `pnpm test:tool-debug`：隔离 PocketBase + 模拟上游，包括合法 GET 经纬度查询及非法 JSON POST 的 400 负例
- `node --test tests/workflow-ui.chrome.mjs`：Chrome 真实 UI 交互、一键示例、POST 错配阻断与修复、响应式回归
- `pnpm build`、`pnpm test:e2e:parallel`

本地检查只是**客户端校验**，不能替代第三方 API 文档核对、真实 OAuth/密钥验收及服务器 ACL。只有城市名时仍需要独立地理编码工具。正式部署、GitHub 推送和 PostgreSQL 切换需另外授权。
