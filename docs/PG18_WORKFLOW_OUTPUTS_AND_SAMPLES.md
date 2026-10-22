# Native Workflow historical outputs and sample reuse

This local increment continues from `1c2212037ebc7da2b6c7d64668e29c3aab96f1e9`. PocketBase remains the current runtime, all execution grants retain their independent opt-ins, and production cutover remains **NO-GO**. Reading an output or using it in a local preview does not start a Worker, Tool or model request.

## Owner-only business-output projection

Two Native Cookie-authenticated GET routes expose explicit, bounded output DTOs:

- `/api/v2/workflow-v2-runs/{id}/outputs`: current outer-Workflow node states and their committed outputs, at most 40 nodes.
- `/api/v2/workflow-v2-runs/{id}/output-history?after=...&limit=...`: committed outer-node outputs in step-key order, default 25 and maximum 50 per page.

The repository selects an owner-scoped Workflow run under the verified actor and replays its sealed canonical checkpoint without advancing it. It does not read arbitrary `run_steps.metadata` for output text. Each response explicitly constructs node IDs/titles/types, status and stored business text; graph configuration, model bindings, prompts, credentials, debug samples and Agent child journals stay excluded. Agent nodes expose only their final outer-node answer, including while internal Model/Tool rounds are in progress. Existing generic step metadata remains unchanged and sanitized.

Loop context is reconstructed as an ordered path of bounded loop IDs/rounds. Repeated Model/Tool nodes have separate step records for each committed round. The current-state view reflects the replayed current round; earlier rounds remain in the paged history. Each output is limited to the existing persisted 4000-character interpreter result, which is also what downstream nodes used; this endpoint does not claim to recover a discarded full provider response.

Historical reads continue after execution admission is revoked or a saved configuration advances to a new revision. They use the original owned run snapshot rather than requiring current Model/Agent readiness. No SQL migration, secret grant or public mutation path was added. The existing Workflow history list now accepts a validated owner `workflow_id` filter so a busy employee's other Workflows cannot crowd this Workflow's recent sample list out of the window.

## Read consistency and employee lifetime

Both views include a SHA-256 `output_version` over the sanitized outer-node states and output history. The client validates the closed DTO schema, expected run/Workflow identity, node metadata, limits and cursor ordering. It refuses to combine pages from different output versions and asks for a fresh read. It never substitutes arbitrary checkpoint or step JSON as a fallback.

The memory-only reader coalesces repeated reads, fences hidden/obsolete responses and clears output and history on disposal or Native 401. It makes no request merely because a panel is mounted. Output viewers are available independently of configuration/execution writes. Text is escaped and bounded; no model reply becomes HTML.

## Explicit preview sample selection

The canvas can select a recent owned run of the same Workflow and explicitly read its outputs. A separate unchecked control in the node sandbox opts into those historical samples. Consent binds the source run/version, task/output content and current node/reference configuration; changing the source or node configuration cancels that selection.

Samples match stable node IDs and compatible types within the same Workflow. A changed revision or renamed node is disclosed. Skipped/incomplete results and type-changed nodes are not reused. Single-model test records contribute only the original target Model result, excluding their virtual Start/End nodes. Manual output fields override individual historical values, while loop item/index remain explicit manual simulation inputs. Historical data never modifies the saved graph or bypasses the existing separately approved model test flow.

## Evidence and remaining work

Focused checks exercise same-origin GET contracts, actor scope, limits/schema/cursors, coalescing, visibility/disposal/401, changed-progress page rejection, scope/type/revision matching, single-node-test boundaries and static escaped rendering with historical sampling disabled by default. Native Cookie/RLS/embedded-SQL tests drive a two-round Model/Tool loop plus a multi-round Agent through approvals with synthetic final effects. They verify every loop round, private planning text held in the actual in-flight Agent state, poisoned raw step metadata excluded from responses, cross-employee denial, old-revision readability and unchanged queue/effect counts during reads.

Hosted-only browser source prepares actual result viewing, loop-history inspection, explicit historical reuse in the End-node preview, reset on a node switch and no extra model generation. It also plants private Agent-planning markers that must not appear in the page. Actual PG18 CI source prepares restricted-login output reads, pagination, owner denial and single-model-test output scope. These later CI extensions are source only and have not executed for this increment. The existing browser CI guard continues to refuse this Windows host, root, non-hosted environments and inherited PostgreSQL credentials; no local browser or screenshot is claimed.

Final local verification on 2026-10-23:

- Main worktree: `pnpm check` **392/392**, frontend types/build and **90-asset** production isolation passed. API types and the independent **5-JS-asset** PG-only build passed. PocketBase E2E passed **23/23**, two workers, **150.0 seconds**.
- Independent candidate `codex/pg18-workflow-output-samples-20261023`, based on `1c2212037ebc7da2b6c7d64668e29c3aab96f1e9`: `pnpm check` **292/292**, **95-asset** production isolation, API types, PG-only build and **36/36** Native client/isolation contracts passed. Its canonical PocketBase E2E passed **19/19**, two workers, **75.5 seconds**. Both full suites include the **9** focused output-reader, sample-matching, static-render and Native Cookie/RLS/embedded-SQL checks.
- This increment contains **26 allowlisted source/test/documentation files** and remains **unuploaded**. Earlier local branch refs are preserved. The main-worktree read-only migration gate still measures **263 frontend files, 38 PocketBase dependencies, 10 blocked gates, cutover=false**.

The React best-practices review retained explicit user-driven reads, stable session refs, cleanup/read fences, derived sample consent, memoized graph dependencies, bounded escaped text and accessible controls inside the lazy Workflow views. No dependency or database migration was added.

Remaining requirements include actual hosted browser/PG18 execution for the later candidates, full custom/MCP Tool coverage, shared/semantic knowledge, schedules/collaboration, target-host HTTPS/roles/credentials, employee UAT, long-running Workers, backup/restore and rollback sign-off. Disposable old data removes record import requirements, not runtime parity or operational acceptance.
