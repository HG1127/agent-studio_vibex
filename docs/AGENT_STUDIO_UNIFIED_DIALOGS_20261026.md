# Agent Studio · 统一系统弹窗（2026-10-26）

分支：fix/native-dialogs-unified-20261026。前端 UX 更改，不修改 PocketBase 数据、Worker、凭据或调用工具权限。

## 设计与统一入口

- 所有应用内确认改用 `confirmInStudio(message, options): Promise<boolean>`，输入 `inputInStudio`、提示 `noticeInStudio` 由同一个队列提供。
- 弹窗基于系统 Radix Dialog，遵守现有 Tailwind 主题、字号、边框、圆角及亮暗模式。包含标题、完整换行说明、取消与确认；危险操作有警示色。
- 默认焦点优先放在取消操作；未保存草稿的确认按钮明确显示“放弃修改并离开”，取消按钮显示“继续编辑”。Esc、右上角关闭均视为取消。
- 所有确认通过 Promise 结算，调用者在用户同意前不发起删除、授权、外部工具写入或付费模型调用；弹窗队列防止多个业务确认重叠。
- 如果弹窗宿主尚未挂载或因卸载消失，重要操作默认拒绝；旧弹窗的回答不能误用于下一条请求。

## 改造范围

- Agent 编辑器与快捷编辑、模板切换、版本恢复、工作流导入导出及节点真实模型费用确认。
- 知识库成员授权、向量重建/关闭、知识库与文档删除。
- 员工角色与登录权限、代理审批、协作授权与提案审核。
- 定时任务删除及失败启动重试、插件试调和 Smithery Key 移除、模板上下架等。
- 系统导航：侧边栏与移动端链接、Ctrl+K 功能搜索、SPA 浏览器前进/后退。点击被同步阻止，等待 UI 结果才允许路由跳转；拒绝则保留草稿和当前路由。

## 浏览器所有的特殊情形

`beforeunload` 在刷新、关闭标签页或关闭浏览器时必须继续采用浏览器原生的安全提醒。浏览器不允许定制其文本、按钮和样式；因此不能承诺完全消灭这种由浏览器强制提供的系统提示。此限制不适用于系统内部的 SPA 导航。

## 验收要求与状态

- `tests/studio-dialogs.test.mjs` 验证队列、确认取消、安全默认、输入通知以及 `src` 内没有任何 `window.alert/confirm/prompt` 调用。
- `STUDIO_CHROME_DIALOG_ONLY=1 node --test tests/workflow-ui.chrome.mjs` 已通过：侧边栏、Ctrl+K、Back/Forward、未保存草稿恢复；同文档内没有原生 `confirm`。
- `STUDIO_CHROME_NAV_ONLY=1 node --test tests/workflow-ui.chrome.mjs` 已通过：移动端真实链接导航、历史撤销/确认、草稿恢复及工作流节点不丢失。
- 完整 workflow Chrome、design Chrome、pnpm check 与 PocketBase E2E 应在合并到 main 前全部验证；不可将仅局部通过描述为已在内网上线。