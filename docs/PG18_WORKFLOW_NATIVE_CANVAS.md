# Native PostgreSQL Workflow canvas and employee review

This is an isolated, default-disabled source candidate for disposable test data. It does not switch the PocketBase application, provision a database, activate a Worker, contact a model provider or authorize a production migration.

## Implemented scope

The Native employee workbench now opens, creates and edits the canonical V2 graph in a separate React Flow canvas. Start, End, Model, Tool, Agent, Condition and Loop nodes use the same pure parser as the API. The editor provides owner resource bindings with pinned revisions, template fields, branch/loop ports, guarded deletion, grouped drag undo/redo and an explicit apply step for node forms. Only inert legacy Start/End graphs can be upgraded automatically; incomplete legacy execution skeletons require a new graph.

New configuration writes carry a stable UUID. The server's owner transaction and advisory lock create one record; exact replay returns it, while another employee's UUID collision cannot overwrite or disclose a record. Updates remain compare-and-swap. After a lost response the editor preserves the exact body and revision; only an exact next server revision can confirm an update. Concurrent edits preserve the local draft for explicit reconciliation. Configuration saves create no runs or jobs.

An independently gated Workflow run screen submits a saved revision, displays owner history, paged progress, loop counts and final results, and offers safe cancellation. Model and Tool operations require step/hash-specific consent; model calls disclose possible cost. Review loads the current owner Workflow and resource metadata, never decrypted credentials, and blocks approval of unavailable or changed bindings. Agent planning review shows task text without private reasoning. Untrusted task, Tool and HTTP text is rendered as escaped text. The server revalidates every resource and approval regardless of UI eligibility.

The shared memory-only request controller preserves uncertain submission/decision/cancel operations across tabs and destroys private state on logout, account change or 401. Exact decision receipts allow confirmation of an old approval outside the bounded history window. Read tickets fence late responses. Existing standalone Agent tests continue to exercise the shared controller. The canvas and Workflow run components load lazily; the ordinary PocketBase build and its authentication remain separate.

## Authorization boundaries

Configuration editing requires the authenticated server's `config_writes_enabled` capability. Full V2 submission and approval additionally require `workflow_v2_submission_enabled` and the existing independent Workflow V2 runtime opt-ins. A browser flag cannot enable either route or an external effect. Saved drafts, previews and metadata reads do not start execution. Unknown or in-flight external outcomes remain paused for reconciliation, with no resend control.

## Verification and remaining work

Focused checks cover canonical graph construction/renaming/ports, grouped undo/redo, frozen creation and CAS recovery, stale resources, exact approval receipts, session expiry, seven static node forms, consent and escaped text. Native Cookie/CSRF/embedded-SQL tests cover committed response loss, owner collisions, one configuration record/no queue side effects, and the complete seven-type run through explicit approvals and synthetic final effects. Static rendering is not browser acceptance; embedded SQL is not actual PostgreSQL 18 role validation.

Hosted Linux-only CI source prepares an actual canvas editing/drag/save/run/approval flow over private mTLS, response-loss recovery across tabs, desktop/mobile screenshots, and grant revocation. The actual PostgreSQL 18 CI source also exercises concurrent idempotent creation and the employee Workflow controller with restricted database roles. Both remain prepared source, not executed evidence for this increment. The browser CI guard still refuses this Windows host, root, non-hosted environments and inherited PostgreSQL credentials. No local browser launch or screenshot is claimed.

Local verification on 2026-10-23:

- Main worktree: `pnpm check` **369/369**, frontend types/build and **90-asset** production isolation; API types and the independent **5-JS-asset** PG-only build passed. PocketBase E2E passed **23/23**, two workers, **146.2 seconds**.
- Independent candidate `codex/pg18-workflow-canvas-20261023`, based on `c8b2875bd99a185133343ddd5b15e8897df211da`: `pnpm check` **269/269**, **95-asset** production isolation, API types, PG-only build and **36/36** Native client/isolation contracts passed. Its canonical PocketBase E2E passed **19/19**, two workers, **75.5 seconds**. Both full suites include the **24** focused graph/editor/review/static-render/Native HTTP checks.
- The candidate contains **34 allowlisted files**, with earlier local branches preserved. This increment remains local and unuploaded. No production settings, paid calls or company records were changed.
- The main-worktree read-only gate measures **253 frontend files, 38 PocketBase dependencies, 10 blocked gates, cutover=false**. Existing remote CI results for earlier commits do not verify this later source.

Production remains NO-GO: actual hosted CI/browser validation, full custom/MCP Tool and legacy debug/import/export parity, shared/semantic knowledge, schedules/collaboration, target-host HTTPS/roles/credentials, employee UAT, long-running Workers, backup/restore and rollback sign-off remain required. Disposable old data removes the import requirement, not these runtime and operational gates.
