# Workflow V2 private model adapter — local candidate

Production remains **NO-GO**. This is an isolated source candidate using synthetic data; it does not authorize deployment, target-host migrations or paid model calls.

## Implemented path

The V2 Worker can optionally install a model-only adapter. It sends an exact private request containing a five-field lease claim, invocation key and input SHA-256. There is no caller prompt, employee identity, model ID, URL or API key in that request. Other node kinds pause before an external-effect record is created.

Proposed migration `pg_v9_025_workflow_model_identity.sql` adds a separate SECURITY DEFINER identity function with a fixed search path. Only the existing isolated identity group can call it. It checks the active employee, live Workflow lease, execution phase, revisions, checkpoint hash, model node, approval hash and committed primary effect. It returns only issuer/subject. API, Worker and credential Broker groups receive no execution grant; the identity group receives no table or credential access.

The private Broker then uses the independently authenticated API pool and owner RLS to replay the stored graph/checkpoint. It verifies the actual current model request, job payload, approved input hash, owner resource revisions and primary `started` record. It commits a second per-node `started` reservation before reading credentials through the separate Broker pool. Unique keys prevent concurrent RPCs, repeated requests and lost-response recovery from issuing a second provider POST. Decryption, transport, timeout or result-commit uncertainty cannot remove this reservation or authorize retry.

Provider rendering accepts the sealed Workflow prompt up to 12,000 characters without squeezing it into the older Agent instruction limit. Provider hosts, public DNS validation, TLS, request/response bounds and no-redirect/no-retry behavior remain enforced. The Broker uses a 25-second deadline, its mTLS client 28 seconds, and the Worker normally 30 seconds. Public Native HTTPS mounts no executor or private route.

The actual transport requires mutually verified TLS, a pinned server certificate and a distinct reviewed Workflow client certificate. The Agent Worker certificate cannot use the V2 route. Cookie, bearer, `X-Rh-User-Id` and forwarded certificate headers are refused. The service remains loopback-only.

## Independent opt-in and credentials

Absent flags keep the adapter disabled. Partial or incorrect flags fail closed:

```text
AGENT_STUDIO_PG_WORKFLOW_V2_MODEL_ENABLED=true
AGENT_STUDIO_PG_WORKFLOW_V2_MODEL_APPROVED=APPROVE_DISPOSABLE_PG18_WORKFLOW_V2_MODEL_ONLY
```

These are additional to the existing Worker activation, V2 runtime and private Broker paid-execution approvals. They grant no public queue admission; Native V2 submission has its own existing gate. Source examples are not approval to set any of these flags on a company host.

The private Broker additionally requires `AGENT_STUDIO_PG_WORKFLOW_V2_CLIENT_FINGERPRINT`, different from the Agent Worker pin. Its read-only preflight checks the new function's definer/search-path/ACL boundary for all three independent logins before serving. Migration 025 must be separately reviewed and applied to a disposable PG18 target before this preflight can pass.

The Workflow Worker reads only these additional protected files under the existing exact unit credential directory `/run/credentials/agentstudio-pg18-workflow.service`:

```text
dispatch-ca.pem
dispatch-workflow.pem
dispatch-workflow.key
```

It needs `AGENT_STUDIO_PG_BOUND_DISPATCH_SERVER_FINGERPRINT`. It never reads model API keys or Broker database credentials. Existing installed unit templates stay on their previous read-only entrypoints; no activation/install command is added.

## Verification scope

`pnpm --dir services/pg-api test:workflow-v2-model` uses encrypted dummy keys, synthetic employees, real embedded SQL/RLS and temporary loopback mTLS. It checks exact prompt reconstruction, approval/owner/hash/revision/expiry fences, function grants and privilege leakage, different client/server pins, forged identity headers, pre-aborted requests, concurrent dispatch, lost responses and unsupported adapters. Audit contains keys/hashes/outcomes, without prompt, key or result bodies. The existing Agent provider and Worker regression also runs.

The real PG18 restricted-login CI source now exercises this same V2 mTLS route with a synthetic final provider function, including success and unknown outcomes. It is **prepared source, not remotely executed evidence**. No provider request has been made by these tests. Whole Workflow parity still requires Tool and Agent adapters, the PG canvas, target-host checks, release-commit CI, employee UAT, long-running Worker tests and backup/restore/rollback verification.

Local checkpoint: model suite **6/6** and related Agent/Worker regression **29/29**. Main worktree `pnpm check` **312/312**, API TypeScript, normal 90-asset isolation and PG-only build passed; PocketBase E2E **23/23**, two workers, **115.9 seconds**. The separate 23-file candidate branch `codex/pg18-workflow-v2-model-20261022`, based on `039c8d9`, passed `pnpm check` **214/214**, API TypeScript, 95-asset isolation, PG-only build, Native auth/session/RLS **91/91**, and its canonical PocketBase E2E **19/19** (**90.8 seconds**, two workers). Its check uses an explicit `POCKETBASE_BIN` pointing to the main project's existing test binary; no binary is copied or committed.

The final read-only main-worktree gate still reports **241 frontend files, 38 PocketBase-dependent files, 10 blocked gates, cutover=false**. This model candidate is local only; earlier UI/configuration/runtime refs and their upload scopes are preserved. A subsequent [Tool candidate](PG18_WORKFLOW_V2_TOOLS.md) adds builtin/HTTP execution and shares the verified dispatch guard; marketplace MCP and Agent execution remain separate work.
