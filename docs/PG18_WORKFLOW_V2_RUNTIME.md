# PG18 Workflow V2 runtime — local isolated candidate

**Production NO-GO.** A PostgreSQL queue and deterministic V2 interpreter now exist. Subsequent local [private model](PG18_WORKFLOW_V2_PRIVATE_MODEL.md) and [Tool](PG18_WORKFLOW_V2_TOOLS.md) adapters add exact lease/node checks and mTLS transport. Agent execution, marketplace plugins, the employee canvas and production verification remain incomplete. No company database, service or paid provider has been used.

## Implemented execution path

1. Native Cookie/CSRF authentication resolves the verified employee. An independently approved V2 submit request checks the owner Workflow, exact revision and owner resource bindings. One transaction stores an immutable graph snapshot, instruction, replay checkpoint, idempotency key, queue item and audit.
2. `workflow_tick/workflow_native_v2` has its own claim SQL. Old Start/End and Agent Workers cannot take those jobs. Token, version, owner and unexpired lease are rechecked before every commit; progress resets consecutive-failure attempts while the fencing version remains monotonic.
3. Start, End, conditions, variable propagation and bounded nested loops execute in the deterministic machine. Restoring a checkpoint replays committed transitions, without repeating any external operation. A dead branch cannot run or prematurely skip a live join. Loop rounds receive fresh invocation keys and innermost item/index context.
4. Model, Tool and Agent nodes prepare a fixed request. Graph hash, invocation key, rendered input and exact node configuration contribute to its SHA-256. The API only queues work and records decisions; it never invokes the effect adapter.
5. The owner reviews the current request and approves/rejects that exact key/hash. Repeated identical decisions replay; a different decision or changed input conflicts. Approval rechecks current graph/resource revisions. Rejection persists an auditable skipped node and continues without an effect. Explicit cancellation stops unstarted work, even after submission permission is revoked; in-flight/unknown operations return a conflict rather than a false cancellation.
6. A separately installed Worker adapter must execute approved effects. A committed `started` ledger precedes the single adapter call. Successful results, machine progress and job acknowledgement commit with fencing. An uncertain response becomes `unknown` and pauses the run. A crash/failure after sending cannot cause an automatic resend; expired ambiguous leases are reconciled to paused/unknown. Known succeeded ledger results can restore progress without another call.

The original runtime checkpoint installed no adapter. Subsequent private candidates optionally install Model and Tool adapters under independent explicit approval pairs and protected Workflow TLS credentials; default mode still reports `effect_executor_installed:false`. Agent nodes continue to pause with `workflow_v2_effect_executor_unavailable`. Separate V2 identity functions and private routes verify each node kind; the Agent-only route is unchanged. No shared model fallback exists in this Worker.

## Deterministic semantics and bounds

- Templates support `{{input}}`, `{{title.output}}`, `{{loop.item}}` and `{{loop.index}}`; missing values are empty with recorded names. Expansion is bounded to 12,000 characters. Latest node outputs are bounded to 4,000 characters and are cleared on a new loop round.
- Conditions preserve the current contains/not-contains/numeric/text comparison rules. Both branch signals are resolved before a join. Every loop return in a round resolves before the next round, and structured nested loops retain independent frames.
- Count/list loops support line, comma and JSON-array sources, empty-list exit and stop keywords. The configured maximum is at most 20 iterations; default maximum is 10. The global limit is 200 node executions. The third identical Model/Tool/Agent input fails before another paid operation; rejected operations do not consume that paid-input allowance.
- Graphs, instructions, checkpoint cursor, effect keys/hashes and primitive result records are validated on replay. Unknown/future result keys, changed snapshots, duplicate results and conflicting result bodies cannot advance the machine. Prototype-shaped IDs are literal map keys.
- Private snapshots and replay journals stay in PostgreSQL. History uses bounded previews. Detail and paginated steps expose an allowlist with branch/round metadata; raw intermediate bodies are excluded. The current pending request is returned to its owner for explicit review. Audit contains keys/hashes/revisions/status, not prompts or result text.

## Native API and opt-in

New endpoints:

| Method | Endpoint | Purpose |
| --- | --- | --- |
| POST | `/api/v2/workflows/{id}/native-runs` | Submit `{expected_revision, instruction, idempotency_key}` |
| GET | `/api/v2/workflow-v2-runs` | Owner history summaries |
| GET | `/api/v2/workflow-v2-runs/{id}` | Owner run, steps and current request |
| GET | `/api/v2/workflow-v2-runs/{id}/steps` | Bounded `after` / `limit` pagination |
| POST | `/api/v2/workflow-v2-runs/{id}/decision` | `{decision, step_key, input_sha256}` only |
| POST | `/api/v2/workflow-v2-runs/{id}/cancel` | Stop unstarted work |

Admission/decision requires the existing isolated configuration acknowledgement plus both:

```text
AGENT_STUDIO_PG18_WORKFLOW_V2_UAT_ENABLED=true
AGENT_STUDIO_PG18_WORKFLOW_V2_UAT_APPROVED=APPROVE_DISPOSABLE_PG18_WORKFLOW_V2_EXECUTION_ONLY
```

It also requires a non-root, reviewed HTTPS serving mode. Start/End UAT flags do not grant V2 access. Read/history and safe cancellation remain owner-authenticated when admission is off. `workflow_v2_submission_enabled:true` advertises queue admission only; an absent field means disabled. It never attests Worker readiness or installed adapters.

The new `workflow-v2-worker-loop.ts` has explicit `--plan`, read-only `--preflight`, and separately gated `--serve`. Serving requires the usual PG18 Worker activation/credential/role checks and:

```text
AGENT_STUDIO_PG_WORKFLOW_V2_WORKER_ENABLED=true
AGENT_STUDIO_PG_WORKFLOW_V2_WORKER_APPROVED=APPROVE_ISOLATED_PG_WORKFLOW_V2_RUNTIME_ONLY
```

The current systemd units are unchanged. The entrypoint accepts only the reviewed PG18 target and existing exact Workflow `LoadCredential` path; it does not read model keys. Merely adding these source examples is not activation approval.

## Verification and remaining work

`pnpm --dir services/pg-api test:workflow-v2-runtime` runs machine, real embedded SQL/RLS, Native Cookie/CSRF and Worker entrypoint tests. It covers joins, nested-loop replay, fixed requests, stale checkpoints, >30 progress leases, concurrent same-lease invocation, stale-token rejection, transaction rollback, owner isolation, repeated decisions, rejection, cancellation, timeout, response loss and failed result commit.

The local quality workflow has a separate synthetic runtime job. The real PG18 bound-runtime CI source also contains new V2 restricted-login queue/HTTPS/approval/unknown-outcome assertions with a local synthetic adapter. Those assertions are **prepared, not remotely executed**. The separate Agent mTLS result does not prove V2 Broker integration.

Local verification checkpoint:

- Runtime suite **18/18**: machine 8, embedded SQL 7, Native HTTP/policy 2, Worker entrypoint 1.
- Main worktree `pnpm check` **305/305**, API/frontend TypeScript, normal build and **90-asset** isolation, plus independent PG-only build. Current PocketBase E2E **23/23**, two workers, **117.4 seconds**.
- Separate local branch `codex/pg18-workflow-v2-runtime-20261022`, based on configuration commit `17c940e`: **26 allowlisted source/test/CI/document files**. Its own `pnpm check` **208/208**, API TypeScript, **95-asset** isolation and PG-only build passed. Its preserved earlier PocketBase baseline explains the different count.
- Candidate Native auth/session/RLS **91/91**; candidate PocketBase E2E **19/19**, two workers, **82.7 seconds**.

All these tests use synthetic data. No new source has been pushed. The older UI upload candidate remains `2af22c5` on its named branch; this later runtime work does not expand that pending approval. Configuration candidate `17c940e` also remains unchanged.

The subsequent private candidates address Model and current builtin/HTTP Tool dispatch in local synthetic tests; they still require remote PG18 and target-host verification. Required work remains: Agent and marketplace MCP execution with scoped credentials, approvals and durable effects; PG canvas and full-node user acceptance; genuine PG18/HTTPS release-commit CI; target-host role/certificate/credential verification, long-running Worker/recovery tests, employee UAT, backup/restore and old-site rollback. The full Workflow migration gate stays false.
