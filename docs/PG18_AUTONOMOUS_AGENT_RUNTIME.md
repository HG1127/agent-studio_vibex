# PG18 standalone autonomous Agent runtime — 2026-10-23

Status: local, isolated candidate; production **NO-GO**. Existing data is disposable test data, so no old-record import is required. Existing functionality and authorization boundaries remain migration requirements.

## Implemented scope

The Native backend now admits a standalone bounded Agent task directly against its owner's `agent_specs` row and exact revision. It creates a real `kind=agent` run with `workflow_id=NULL`; no hidden Workflow row is created. The server constructs a sealed Start → Agent → End control graph and reuses the verified multi-round controller. The new `agent_native_v2` mode has its own `run_tick` phase, dedupe prefix, claim SQL, checkpoint stages, identity functions and history routes. Old prepare/model Workers and Workflow Workers do not claim it.

Submission freezes the instruction, role revision and one-to-five-round limit. Reusing an idempotency key with another instruction, role, revision or limit returns a conflict. Every decision, Worker tick and private dispatch rechecks the owner, role revision, ready model connection, declared tools and private knowledge scope. The Agent parent and each Model/Tool child require their own hash-bound employee approval. Rejected/known-failed tools become observations for a separately approved next model round. An ambiguous external result or failed result commit pauses the run and is never automatically resent.

The existing shared machine format is retained inside the sealed root checkpoint; root mode, run kind and queue phase are checked separately. The private RPC includes an explicit `agent_native_v2` discriminator and a child-to-parent reference, alongside the fenced job claim and input digest. It carries no owner, prompt, URL or secret. Proposed migration `pg_v9_028_autonomous_agent_identity.sql` follows reviewed 027 and grants only two eight-argument identity functions to the existing NOLOGIN identity group. It adds no table or secret-column privileges.

## Public and private boundaries

- `POST /api/v2/agent-specs/{id}/autonomous-runs`: exact `expected_revision`, `instruction`, `idempotency_key`, `max_steps` body.
- `GET /api/v2/agent-autonomous-runs`, `/{id}`, `/{id}/steps`: bounded owner-scoped history and approval review.
- `POST /api/v2/agent-autonomous-runs/{id}/decision`, `/{id}/cancel`: hash-bound decisions and safe cancellation.
- The real Native Cookie/CSRF handler exposes optional `autonomous_agent_submission_enabled` only under configuration-write and separate autonomous admission grants. History and safe cancellation remain available after admission revocation.
- The old single-model `/api/v2/runs` repository excludes `agent_native_v2` from list, detail, steps and model approval. Private graph snapshots, model planning output and role archives cannot leak through the older checkpoint response.
- Native HTTP never starts a Worker or calls a provider. Client methods are available, but the employee Agent panel still needs an explicit multi-round run mode, review and history integration.

API, Worker and Broker each require their own environment to contain this exact opt-in pair before enabling the new mode:

```text
AGENT_STUDIO_PG_AUTONOMOUS_AGENT_ENABLED=true
AGENT_STUDIO_PG_AUTONOMOUS_AGENT_APPROVED=APPROVE_DISPOSABLE_PG18_AUTONOMOUS_AGENT_ONLY
```

The API additionally requires the existing non-root HTTPS configuration-write UAT grant. The Worker requires explicit `--serve`, the existing isolated Worker trial approval and independently enabled Model/Tool adapters. Its exact credential directory is `/run/credentials/agentstudio-pg18-agent.service`, with only `worker.secret`, `dispatch-ca.pem`, `dispatch-agent.pem`, `dispatch-agent.key`. It cannot substitute another unit's directory or read model keys. The separate CLI supports offline `--plan` and read-only `--preflight`; importing the shared CLI does not start a task loop.

The Broker additionally requires existing paid-generation and Model/Tool grants, all three restricted login preflights, both new identity function ACL checks, and `AGENT_STUDIO_PG_AUTONOMOUS_AGENT_CLIENT_FINGERPRINT`. This third client pin must differ from the single-model and Workflow client pins. The actual TLS peer selects a mode-specific private handler, which rejects a different payload mode before identity resolution or dispatch. No service unit has been installed, changed to `--serve`, or enabled by this work.

## Verification and remaining work

The ten autonomous checks pass: Native Cookie/CSRF/RLS HTTP, strict idempotency, foreign-owner denial, no hidden Workflow, old-queue/history isolation, revocation/cancellation, new Worker per tick over actual temporary loopback mTLS, parent/hash/kind/root identity fences, Model → calculate → Model, failed/rejected Tool continuation, model rejection, role drift, no shared-model fallback, unknown-result pause, result-commit crash/lease expiry, private KB citations, offline CLI and exact credential/pin requirements. Final providers and all data are synthetic; the database is embedded SQL/PGlite, not real PG18 TCP.

Main worktree `pnpm check`: **345/345**, TypeScript/frontend build and **90-asset** production bundle isolation passed. Existing PocketBase E2E: **23/23**, two workers, **112.1 seconds**. Backend types passed. Real PG18 restricted-login HTTPS/mTLS assertions have been extended in CI source for both Workflow and standalone Agents; this later candidate has **not** been uploaded or run in remote CI.

The independent local branch `codex/pg18-autonomous-agent-20261023`, based on `1d156d098f100bdf760c9d2b4f3bb7eb25de896f`, contains **44 allowlisted files**. Its own `pnpm check` **245/245**, API types, **95-asset** production isolation, PG-only build, existing Native auth/session/RLS **91/91**, and canonical PocketBase E2E **19/19** (**88.6 seconds**, two workers) passed. The main worktree's PG-only build also passed. Earlier named candidate refs remain preserved, and no new source was uploaded.

Remaining migration work includes the employee multi-round Agent UI, PG Workflow canvas, marketplace MCP and scoped connection tools, semantic RAG/document ingestion and team ACL, actual schedule execution, collaboration/delegated approvals and remaining product parity, complete release CI, target-host credentials/roles/TLS, employee UAT, long-running Worker validation, backup/restore and verified old-site rollback. No old database was cleared, no production route switched and no paid request performed. The full read-only gate remains **241 frontend files, 38 PocketBase-dependent files, 10 blocked gates, cutover=false**.
