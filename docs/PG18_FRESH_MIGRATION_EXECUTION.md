# PG18 fresh migration execution record — 2026-10-22

Status: **IN PROGRESS / production NO-GO**. This record tracks the current worktree, not a deployed release.

## Confirmed scope

The user confirmed in this chat that all existing PocketBase data is test data and need not be retained/imported. Prepare a fresh PostgreSQL 18 application with the existing business features. This removes the old-record import and reconciliation requirement. It does not waive employee authentication, owner/team authorization, approval, audit, execution safety, HTTPS UAT, or a recoverable old application. No live database has been cleared and no service has been switched.

## Completed in this run

- Repaired the isolated migration regression baseline for 23 fresh tables, 22 FORCE-RLS tables and 27 policies; the complete legacy staging baseline contains 40 tables / 39 FORCE-RLS tables.
- Replaced obsolete assertions that a model connection table must be absent with assertions that model connections, tool connections and encrypted tool headers remain empty after archive imports. Existing no-job, immutable archive, owner/RLS, transaction rollback and no-replay checks remain.
- Preserved the large dirty migration workspace. Only ten reviewed test files were committed to the separate branch `codex/pg-migration-ci-repair-20261022`, commit `3cc3f660acb70c1642edb9da64946783d7e47c9d`.
- With explicit user permission to upload these ten files to `HG1127/agent-studio_vibex`, pushed the branch and opened draft PR #24: https://github.com/HG1127/agent-studio_vibex/pull/24 . No merge or deployment.
- Full remote quality run **39747830920: success, 39/39 jobs**: https://github.com/HG1127/agent-studio_vibex/actions/runs/39747830920 . Includes real PG17 multi-connection, archive, reconciliation, restore and container checks.
- Explicitly dispatched existing PG18-only ephemeral workflow for the same commit. Run **39748830510: success**: https://github.com/HG1127/agent-studio_vibex/actions/runs/39748830510 . This is real disposable PG18 TCP/mTLS CI, not acceptance of the company host or later local transport changes.
- Initial full local `pnpm check`: **258/258**, TypeScript, Vite and 90-asset production isolation passed. Embedded SQL/Worker-upgrade repair: **2/2**. Isolated branch static schema contract: **18/18**.
- Fixed the parallel PocketBase E2E runner to honor `TMPDIR` / `AGENT_STUDIO_E2E_TEMP_ROOT`, rejecting relative, UNC and `pb_data` roots. This fixes its attempt to create sibling temp directories outside the writable workspace. Runner tests **3/3**; full isolated PocketBase E2E **23/23**, two workers, 167.6 seconds.
- Added a shared bounded private dispatch contract and a one-shot Worker mTLS client. The client checks CA/hostname plus a separately pinned server certificate; it sends only a fenced lease claim and bounded model input to a fixed loopback route. It does not retry, redirect, accept employee identity headers, or expose transport diagnostics.
- Real local loopback TLS test uses disposable certificates and synthetic handler responses only. Correct peer succeeds; incorrect server/Worker pins fail; an ambiguous response is sent once. Transport suite **16/16**; no database or actual provider traffic.
- Added separately approved PG18 Worker transport configuration with exact DynamicUser/LoadCredential paths. It reads only three TLS files, never model credentials. Default fixed-provider mode remains unchanged. Bound-only mode pauses an unbound Agent before creating an external effect; it cannot fall back to a shared model. Runtime/policy tests **7/7**; combined bound Worker and activation regression **15/15**; API TypeScript passed.

- Added the separate `bound-dispatch-server.ts` executable: offline `--plan`, read-only `--preflight`, independently approved `--serve`, fixed loopback mTLS listener, separate API/identity/Broker pools, a verified lease-to-employee adapter and the existing durable no-replay dispatcher. No listener or database access occurs at import/plan time.
- Its startup preflight checks each exact login, all role memberships (including unexpected built-in file/program roles), core FORCE RLS, model/tool secret-column denial, employee-auth schema denial and the lease function's definer/search-path contract. Actual embedded privilege SQL passed positive/negative tests; its TCP server metadata was explicitly synthetic. Real PG18/target-host preflight remains required.
- Added a read-only-only preview unit and an unexecuted NOLOGIN identity-role reservation proposal. They do not activate credentials or deploy a service. Certificate checks validate CA/expiry, localhost and loopback SANs, server EKU and private-key matching; real disposable certificate tests passed.
- Native Run admission now shares the same repository composition in the real server and HTTP fixtures. Bound admission needs configuration writes, Run/approval UAT and the additional generation UAT together. Without these independent grants the old denial remains. Public Native routes never mount the private Broker or a direct provider-generation handler.
- A new synthetic end-to-end test passed: employee Cookie authentication -> owner model binding -> idempotent submission -> prepare Worker -> employee approval -> model Worker -> real loopback mTLS -> database lease identity -> Broker -> synthetic generation -> both durable effect ledgers -> Native result read. Repeating the submission/Worker tick did not generate again, and the shared-provider fallback stayed unused. This uses embedded PostgreSQL and fake model responses; it is not a real PG18 TCP or paid-provider acceptance result.
- Fixed two reproducible verification failures without weakening safeguards. The standalone PocketBase initializer now uses the CLI `--` separator so a strong random password starting with `-` remains a positional argument. Its regression forces that password prefix and verifies real one-time DB creation/no overwrite. The offline migration operator now compares BigInt physical file IDs and nanosecond timestamps; deterministic IDs beyond the Number safe range remain distinct, while real hardlinks still fail closed.
- Latest full local regression checkpoint: `pnpm check` **276/276**, TypeScript, Vite and **90-asset** production isolation passed; private transport **25/25**; Native/Worker bound runtime **55/55**; PocketBase isolated E2E **23/23**, two workers, **143.5 seconds**. Logs remain private under `.tmp/pg-migration-completion/`.
- A subsequent read-only privilege-inspector refactor retains the production wrapper's exact target verification and checks login identity/superuser/BYPASSRLS independently. The new real-PG18 test includes verified local HTTPS Cookie/CSRF, three actual private-service logins, negative privilege checks, owner denial, employee approval, real private mTLS, synthetic generation and durable duplicate prevention. Its ordinary-machine no-socket rejection plus role regression passed **10/10** and API TypeScript passed. Its actual PG18 execution is still pending isolated CI; no server metadata is faked in that test.
- Prepared the separate local candidate branch `codex/pg18-native-runtime-20261022` from `3cc3f66`: **143 source/test/SQL/template/document files**, including accumulated Native backend dependencies but no unrelated main-workbench UI changes. Its own offline dependency install and TypeScript passed; private transport **25/25**, bound runtime **55/55**, ordinary-machine PG18 guard **9/9**, and backward Worker/upgrade/operator contracts **56/56** passed in that worktree. The staged whitespace check passed; the allowlisted files contain no env/DB/private-key/generated-binary entries or matches for the checked common credential formats. Upload of this additional scope requires its own concrete approval. PR #24 remains limited to the original ten test fixes.

These later local Worker/Broker/Native changes have not been uploaded, deployed or accepted on the target host. The production app remains on PocketBase. Do not enable a Worker or clear any database from local test success alone.

## Next acceptance work

1. Review/integrate the new private Broker/Worker code and finish independent identity-login activation/certificate provisioning tooling. Validate its three real logins and startup checks on an approved disposable PG18 instance. Keep it off public Native routes.
2. Expose the approved Native employee execution flow in the PG-only UI. Verify two-user isolation, model revisions, approval revocation, lease expiry, network failure, restart and duplicate-charge prevention against disposable PG18, including the integrated private Broker.
3. Complete full Workflow node semantics, approvals and restart recovery; the present safe Worker is Start/End only.
4. Complete Native document ingestion, embedding/index queue, semantic RAG and team ACL; current keyword lookup is not semantic parity.
5. Implement actual scheduled dispatch with timezone/DST, occurrence deduplication, approval and recovery. Existing drafts remain forcibly disabled.
6. Migrate tool/plugin execution, collaboration/delegated approvals, templates/versioning and integration APIs with owner checks and audits.
7. Replace each actual PocketBase-dependent frontend flow with the PG client; preserve the old app during testing. The separate PG-only candidate has not replaced the full main workbench.
8. Review and integrate the remaining worktree changes; pass full local checks plus real disposable PG18 CI for the integrated release commit, not only the isolated test-repair branch.
9. Prepare a separate company-trusted HTTPS shadow environment, verify actual credentials/roles, run employee UAT, long-running Worker/monitoring, backup/restore and the full old-site rollback drill. Obtain operator GO before any final switch.

## Validation environment

This run started with very little Windows C: temporary free space. Keep using a private directory on the project drive:

```powershell
$taskTemp = Join-Path (Get-Location) '.tmp\pg-migration-completion'
New-Item -ItemType Directory -Path $taskTemp -Force | Out-Null
$env:TEMP=$taskTemp
$env:TMP=$taskTemp
$env:TMPDIR=$taskTemp
pnpm check
pnpm test:e2e:parallel
pnpm --dir services/pg-api test:bound-transport
pnpm test:pg18:bound-runtime
```

Never commit `.tmp`, runtime DBs, generated certificates or private credentials. Do not change the production cutover gate from unit/CI success alone.

## Subsequent private Workflow model candidate

The new local model-only adapter sends only lease/key/hash over a separate private mTLS route. A proposed V2-only identity function and the Broker's replay of the sealed database state verify the exact approved owner/node/input. An independently committed per-node dispatch reservation prevents repeated/concurrent provider POSTs. The Worker has independent opt-in, protected Workflow TLS files and no model key access; the Broker requires a distinct client pin and verifies the new function's privilege boundary. Tool/Agent nodes pause before external effects. The real PG18 CI assertions have been updated to exercise this path with a synthetic provider response, but have not run remotely. See [private model scope and operator prerequisites](PG18_WORKFLOW_V2_PRIVATE_MODEL.md). Existing UI/configuration/runtime candidate refs remain unchanged; this later source is not covered by the earlier UI upload question. No production gate is enabled.

## Subsequent private Workflow Tool candidate

Five builtins and owner HTTP connections now have a separate private Tool identity/route and independent enable pair. The Broker replays the sealed request, verifies owner/resource revisions/approval/lease, reserves a non-replayable dispatch and reads only scoped encrypted credentials through its existing separate login. Summary uses an explicit owner model, KB lookup preserves owner-private keyword/context semantics, public web egress pins validated DNS, and custom POSTs cannot redirect/retry or expose reflected saved secrets. Known pre-call errors terminate as failed; external uncertainty stays paused/unknown. Proposed migration 026 adds Tool identity and the deterministic failure effect state. Agent, marketplace MCP, semantic/team knowledge, PG canvas and operational/release verification remain incomplete. [Tool scope and evidence](PG18_WORKFLOW_V2_TOOLS.md) describes the synthetic tests and the prepared-only real PG18 CI assertions. No cutover gate is enabled and no candidate is uploaded by this work.

## Subsequent bounded Workflow Agent candidate

Workflow Agent nodes now freeze the owner role/model/KB scope and execute up to five model rounds through individually approved, persisted Model/Tool child operations. New Workers replay the same requests rather than resending paid effects. Parent/child approvals, current resource revisions, actual lease, child identity and hash are verified by SQL plus Broker replay. Known Tool failures/rejection can inform a separately approved next model; ambiguous effects stop. Role snapshots are retained privately for audit, and child history is bounded and sanitized. Proposed migration 027 and independent Agent Worker/Broker opt-ins remain unactivated source. Standalone autonomous Agent runs, marketplace MCP, PG canvas and all target-host/release/UAT/backup/rollback requirements remain. See [Workflow Agent scope](PG18_WORKFLOW_V2_AGENTS.md). Real PG18 Agent CI assertions are prepared only, not remotely run, and no earlier upload approval is expanded by this local work.
