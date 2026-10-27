# PG18 Workflow V2 configuration — 2026-10-22

Status: implemented and verified locally. **Production NO-GO.** Full Workflow execution and the employee canvas migration remain incomplete.

## Versioned storage contract

The existing unversioned graph remains a title-only DAG. An explicit top-level `version: 2` now enables bounded node configuration through the same Native `POST /api/v2/workflows` and `PATCH /api/v2/workflows/{id}` routes. Those writes still need verified employee Cookie authentication, origin/CSRF validation and server configuration permission. No environment flag or production service has been enabled.

Legacy archive import explicitly rejects versioned graphs. Its reviewed title-only, lossless archive boundary has not been expanded to accept resource references or runnable node configuration. Disposable old data still does not need importing for this project's fresh migration.

| Node | Configuration fields, in addition to `title` |
| --- | --- |
| Start | `input_hint` |
| Model | `prompt`, `model_binding: {connection_id, connection_revision, model_id}` |
| Agent | `prompt`, `agent_binding: {spec_id, spec_revision}`, numeric `max_steps` (1–30) |
| Tool | One built-in `tool` or `tool_binding: {connection_id, connection_revision}`, `params_template`; `knowledge_base_ids` only for `knowledge_search` |
| Condition | `ref_title`, `op` (`contains`, `not_contains`, `gt`, `lt`, `eq`), `value` |
| Loop | `mode`, numeric `count`, `list_source`, `delimiter`, `stop_keyword`, numeric `max_iterations` (1–20) |
| End | `output_template` |

Inline authentication fields, provider URL overrides, arbitrary node properties and browser-supplied owner IDs are rejected. Configuration templates are data; they are never evaluated as JavaScript. A draft may omit its Model/Agent binding; this does not make the node executable. A Tool must select exactly one built-in or owner connection reference. Loop count is bounded to 1–1000, with a separate maximum-iteration bound; later execution must enforce both.

The graph is limited to 40 nodes, 100 edges and 128 KiB of serialized UTF-8. Prompt, parameter, list-source and output templates are each limited to 12,000 characters. Node IDs and edge IDs are unique and bounded; titles must be unique so `{{title.output}}` references are unambiguous. Explicit condition title references must exist. No configuration is silently reinterpreted as the old title-only format.

Condition edges use one `sourceHandle: "true"` and one `"false"`. Loop body edges omit `sourceHandle`; the exit uses `"done"`. Structured nested loops are accepted only with a single body entry, returns to the corresponding loop, no body escape into its exit, no terminal inside the body, and no crossed loop bodies. Removing those verified back edges must leave a DAG. Every node must be reachable from the unique Start and able to reach an End. All other cycles are rejected.

## Resource identity, revisions and audit

All graph validation and resource checks occur before the configuration is committed. Within one verified owner/RLS transaction:

- Model references must belong to the employee and match the exact revision, an enabled/tested connection, a listed model and a canonical provider endpoint. Only public metadata is selected; no model credential is read.
- Agent and Tool connection references must belong to the employee and match their exact revisions. A Tool reference is configuration only; status/egress/approval checks are still required before future execution.
- Knowledge references are at most three unique IDs per knowledge-search node. All must be private bases owned by that employee. Team ACL support is still separate unfinished work.
- Resource rows are held with shared locks through the graph write. Updates first lock the owner-visible Workflow and compare `expected_revision`. A foreign Workflow returns no row before resource checks, and stale edits do not overwrite it.
- `workflow.config_create` / `workflow.config_update` audits commit with the graph. Audit metadata contains only revision, graph version and node count, excluding prompts and parameter contents. An audit failure rolls back the configuration and revision.

This is application-level validation over the existing JSONB column; no SQL schema, role grant or company database has been changed. A future executor must revalidate resource revisions and authorization immediately before effects. These configuration checks do not attest execution readiness or employee approval.

## Execution boundary

The existing `workflow_safe_v1` Worker and validation route explicitly reject every V2 graph, including a Start/End graph with an output template. The old UAT panel also disables its controls for versioned graphs. This prevents them from reporting success while ignoring richer configuration. The unversioned Start/End behavior remains available under its existing independent UAT permissions.

The Native client has `createWorkflowGraph` and `updateWorkflowGraph`; existing rename preserves the full stored graph and optimistic revision. The employee canvas/editor still needs a PG data adapter and resource-selection controls. Model/tool/Agent dispatch, variable propagation, condition/loop runtime, approval, durable effects and restart recovery remain required for full Workflow parity.

Subsequent local runtime work now implements deterministic propagation/branches/loops, a separate V2 queue, fixed-request node approval, effect journals and crash recovery under an independent UAT gate; see [V2 runtime evidence](PG18_WORKFLOW_V2_RUNTIME.md). The old routes above still reject V2. The new Worker entrypoint has no production effect adapter installed, and the canvas and full execution parity remain incomplete.

## Verification

`pnpm --dir services/pg-api test:workflow-v2-config` covers real embedded PostgreSQL/RLS and real Native Cookie HTTP with synthetic employees and resource material. No provider, production host or installed PostgreSQL is contacted. Coverage includes nested graph structure and malformed payload rejection, all resource types, owner isolation, optimistic updates, audit privacy, fault-injected rollback and rejection by the old executor with zero queued jobs/runs.

The existing Workflow/import/Worker regression also runs separately:

```powershell
node --experimental-strip-types --test --test-concurrency=1 services/pg-api/tests/workflow-engine.test.mjs services/pg-api/tests/workflow-safe-run.test.mjs services/pg-api/tests/workflow-validation.test.mjs services/pg-api/tests/stage-workflow-import.test.mjs
```

The V2 suite is included in the root default test command and has a separate synthetic CI job in the local quality workflow. The bound-runtime and employee-browser workflows also include this candidate branch, so its eventual upload will request verification for the same release source. That new source has not been uploaded or run remotely. Local checks are not real PG18 TCP, company HTTPS UAT, or production approval.

Local verification checkpoint:

- V2 configuration: **6/6**, including serialization-hook rejection without invoking caller code.
- Main worktree: `pnpm check` **287/287**, TypeScript/build and **90-asset** production isolation; PocketBase E2E **23/23**, two workers, **117.1 seconds**.
- Separate local branch `codex/pg18-workflow-v2-config-20261022`, based on UI commit `2af22c5`: **19 allowlisted source/test/CI/document files**, including the two CI branch filters. Its own final `pnpm check` passed **190/190**, TypeScript/build and **95-asset** isolation; API TypeScript and independent PG-only build passed. Its preserved older PocketBase baseline explains the different default count.
- The candidate's old Workflow/import/Worker regression passed **21/21**, Native authentication/session/RLS **91/91**, and PocketBase E2E **19/19**, two workers, **84.0 seconds**. The archive-version boundary is included in the regression.
- Ordinary-machine PG18 rejection/CI contracts: **9/9**. Extra V2 configuration assertions over real PG18 TCP/HTTPS and restricted logins are prepared in that test, **not yet remotely executed**.

The previously prepared 49-file UI upload candidate remains exactly `2af22c5` on `codex/pg18-employee-run-ui-20261022`; this later Workflow branch has not changed that ref or expanded its pending upload approval.
