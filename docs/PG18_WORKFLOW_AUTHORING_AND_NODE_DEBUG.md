# Native Workflow authoring and persistent single-model tests

This local increment continues the migration candidate from `f29514cabc675b4200b75556df7248f0a24ceb87`. The PocketBase application remains the current runtime. Existing Workflow V2 admission, private Model transport and environment opt-ins remain default-disabled. No production service, company record or paid provider was changed.

## Authoring and portability

The Native canvas now supports multi-selection, an in-memory employee clipboard, duplication, deletion, eight alignment/distribution modes and canvas-scoped keyboard shortcuts. Start cannot be copied or deleted. Copies mint new node/edge IDs, preserve the current employee's pinned resource bindings, rename internal references and keep literal text intact. All changes participate in the existing undo/redo history and CAS save/recovery controller. The clipboard disappears on logout/account changes; it is not browser storage or a shared system clipboard.

Workflow descriptions are bounded to 500 characters inside the canonical V2 graph, so they survive save, revision checks and portable transfer without a new SQL column. Model, branch, bounded list-loop and Agent starter graphs load as local drafts with no inherited execution bindings and no automatic save or run.

Portable JSON supports Native v2 and legacy Agent Studio v1 files that meet the canonical 40-node/100-edge and 128-KiB graph limits; the file itself is bounded to 512 KiB. Import regenerates all node/edge IDs and removes Model, Tool, Agent, knowledge-base and unknown credential/owner fields. Model and Agent nodes require explicit rebinding. Imported Tools use an explicit unconfigured marker; the interpreter rejects them before any effect instead of substituting a calculator. Legacy loop `body` ports map to the canonical body port. Topology and field types are checked by the API's pure canonical parser.

Import loads a new local draft and requires explicit discard of an existing unsaved draft. It cannot replace an uncertain write. Late file reads cannot overwrite a changed canvas, a hidden tab or another employee session. Export omits access bindings but preserves prompt/parameter text: the employee reviews the exact current content before downloading because manually written credentials in text cannot be reliably removed. Editing the content invalidates that confirmation. Neither import nor export starts a task.

## Preview and single-model execution

The browser preview and persisted interpreter share the exact pure variable renderer, JSON-string escaping, condition comparisons and bounded loop-list rules. The preview supports explicit upstream output samples, incoming-branch selection and current-loop item/index. Missing samples and ambiguous branch assumptions are visible. It renders Tool JSON, conditions and loop items without invoking any Tool, Agent, model or network endpoint.

Real tests use `POST /api/v2/workflows/{id}/model-node-debug` under the existing independently authorized V2 Workflow execution grant. The request contains only a saved revision, selected node ID, bounded samples and an idempotency key. The server loads the owner's saved graph, selects a Model node and derives a sealed Start → Model → End graph. It records a normal owner Workflow run against the existing Workflow ID; no hidden Workflow or Agent configuration is created. Other source nodes provide manual samples and do not execute.

The resolved prompt is sent literally, preserving embedded `{{...}}` sample text without a second interpolation. An explicit Model `prompt_format=literal` also supports this behavior in saved graphs. Input is bounded to 8000 characters; each provider request has a fixed 512-output-token budget. Tests still require exact step/hash-specific cost consent before the Worker can dispatch.

Before decryption, the private Broker re-derives the graph from the current owner revision and stored samples, verifies the live lease and approval, and durably reserves a second effect. Missing dedicated debug transport never falls back to normal Model or Agent execution. Unknown outcomes pause and cannot be resent. Existing SQL identity functions and restricted roles are reused; this increment adds no identity/secret grants or SQL migration.

The public checkpoint exposes only the selected node ID and a SHA-256 fingerprint of the frozen request context. The client verifies that fingerprint before confirming submission; samples, private graph and replay journal stay excluded from public history. Current pending prompt text remains visible for explicit approval. Submission/decision recovery freezes the original body, node, revision, samples, key and step/hash. The debug panel stays mounted across node and workbench changes and destroys private state on logout/401. The original full-Workflow submit controller cannot mistake a debug response for its own submission.

## Evidence and remaining gates

Local focused tests cover portable format/limits and binding removal, fragment/reference handling, templates and alignment, import/undo recovery, exact preview/replay values, literal prompts, three provider budgets, request fingerprints, default-disabled static controls and escaped text. Native Cookie/CSRF/embedded-SQL plus real temporary private mTLS tests prove one Model dispatch, committed-response-loss recovery, owner boundaries, no hidden configurations, private history, rejection of tampered samples/missing transport and unknown-outcome no-resend. All final model responses are synthetic. Static rendering is not a browser acceptance claim; embedded SQL is not actual PostgreSQL 18 login-level verification.

Hosted-only browser source now prepares actual multi-select/copy/undo, content-bound export confirmation, JSON download/import, rebinding requirements, single-node preview/submission/recovery/approval and screenshots. Actual PostgreSQL 18 CI source prepares the same controller over restricted API/Worker/identity/Broker logins. These extensions have not run for this local increment. The browser CI guard still refuses this Windows host, root, non-hosted environments and inherited PostgreSQL credentials. No local browser or screenshot is claimed.

Final local verification on 2026-10-23:

- Main worktree: `pnpm check` **384/384**, frontend types/build and **90-asset** production isolation passed. API types and the independent **5-JS-asset** PG-only build passed. PocketBase E2E passed **23/23**, two workers, **121.9 seconds**.
- Independent candidate `codex/pg18-workflow-authoring-20261023`, based on `f29514cabc675b4200b75556df7248f0a24ceb87`: `pnpm check` **284/284**, **95-asset** production isolation, API types, PG-only build and **36/36** Native client/isolation contracts passed. Its canonical PocketBase E2E passed **19/19**, two workers, **75.5 seconds**. Both full suites include the **20** focused authoring/editor/debug/static/Native Cookie-SQL-mTLS checks.
- This increment contains **43 allowlisted source/test/documentation files**, preserves earlier local branch refs and remains **unuploaded**. The main-worktree read-only gate measures **259 frontend files, 38 PocketBase dependencies, 10 blocked gates, cutover=false**. Neither an earlier remote CI result nor these local checks prove the later hosted browser or actual PG18 target-host requirements.

The React best-practices review retained derived eligibility/content-bound consent, employee-lifetime refs, keyed form resets, independent metadata reads, cleanup/read fences, explicit labels and escaped text. The heavier authoring and debug views remain inside the lazy Workflow workspace. No runtime dependency was added.

Production remains **NO-GO**. Remaining work includes actual hosted browser/PG18 execution for the later candidates, historical node-output sample reuse, full custom/MCP Tool coverage, shared and semantic knowledge, schedules/collaboration, target-host HTTPS/role/credential checks, employee UAT, long-running Workers, backup/restore and rollback sign-off. Disposable old data removes the import requirement, not functional or operational acceptance.
