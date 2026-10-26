# Agent Studio — Task-first Run Workspace V1

Feature branch: feat/agent-run-task-workspace-20261026. Presentation only; no direct Worker, database, payment or production deployment modifications.

## User workflow

1. Select a saved Agent from the compact selector. Enter task, resolve resource blockers, start execution.
2. Keep current run status, stage progress, approvals and required human input in the central panel.
3. Select recent runs in a persistent left task rail; switching only reads saved results, no re-execution.
4. Tabs expose results/feedback, execution trace, quality checks and memory without a long vertical page.
5. Open models/tools/budget through right-side resources panel. On 2xl it remains visible and scrolls independently; smaller screens use an on-demand drawer and mobile uses a collapsible task list.

## Safety and compatibility

- All previous runtime, approval, result, trace and settings React components remain reused.
- Recent-run list is filtered locally and does not claim to search historical records beyond the already loaded owner-scoped window.
- Pending approval stays accessible independent of current tab.
- Live runs cannot start another run; new-task actions never fire a model or tool call.
- Settings are mounted while hidden so toggling a drawer cannot erase editable run configuration.
- Existing URL-based task history and checkpoint recovery remain in use.
- Clicking '发起新任务' on a terminal historical task clears the old run context, URL run parameter, and task instruction while preserving the selected Agent. It performs **no** create-run/model/tool request. It is disabled while a run is live or a new run is being created.
- Rapid historical task switches are guarded by a monotonically increasing selection generation; stale record/event reads and stale foreground poll results cannot replace the most recently selected task.
- When another run is live, historical switching does not itself cancel the background Worker; users must return to the appropriate task to handle approvals. Do not claim the view switch pauses a server task.
- Budget shown as steps used is not equivalent to actual completion percentage or monetary cost.

## Acceptance

- npm unit/TypeScript build via pnpm check.
- Real isolated Chrome login flow at 1440px: task rail left, center execution, on-demand settings right; 390px layout with collapsed tasks and Escape-close drawer.
- Real isolated Chrome approval, human input, results tabs, task-switch-no-reexecution, new-draft-without-creating-run, and five-role browser/PDF/sheet/email workflow checks.
- Rebased against main 8fc098d, preserving newly added owner-scoped local-computer and Office features; local-computer UI test now opens the on-demand settings drawer before verifying the existing connected-device and missing-device states.
- 29/29 real isolated PocketBase, Worker and local-computer integration tests via pnpm test:worktree:e2e (including file/Office/browser and explicit local execution approval).

## Validation notes

- The first 29-case E2E run exposed one test that still expected the old always-visible resources panel. Nine local computer/Office workflow phases succeeded and the last UI visibility assertion failed. The UI-specific test was adapted to open and close the new panel; focused local-computer E2E then passed 1/1 and full isolated regression passed 29/29.
- After rebasing onto main 8fc098d, the full real Chrome design-workspace run completed 1/1 PASS (temporary SQLite, independent employee login, no real paid model). Browser console errors 0 and HTTP 400 responses 0. It verified task-first desktop layout, mobile drawer, new-task action, run history navigation, user approval, clarification, unchanged Skill/role grants and 5-role browser/PDF/spreadsheet/email workflows.
- Unknown or unverified device status never grants additional permissions. The user still authorizes external/local side effects.
- The final integrated pnpm check passed unit tests, TypeScript, Vite production build and 114 production bundle isolation assertions. Tests were not used to mutate the live PocketBase database or LAN Worker.

## Not claimed

Global searchable history, SSE/push updates, actual MiniMax paid quality UAT, or LAN production deployment; these require separate decisions and verification.