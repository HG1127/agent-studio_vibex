# BaoTa PostgreSQL 18 Worker readiness (REVIEW ONLY)

Status: source-only migration branch. Neither PostgreSQL Worker nor model provider has been deployed or started on BaoTa. Old 8090 PocketBase and its Worker continue to run. PG production cutover: NO-GO.

## Execution policy

Worker sources: services/pg-api/src/worker-loop.ts, model-worker-loop.ts, worker-activation-guard.ts.

- --plan: offline; no DB, credential reading, HTTP, job ticks, or model calls.
- --preflight: explicit opt-in PG database target and exact non-root systemd private credential directory; validate server identity, least-privilege SQL grants, auth-schema isolation, and Worker role membership. Checks use SELECT, BEGIN READ ONLY, SET LOCAL ROLE and ROLLBACK. NO job processing, model calls, or external effects. This mode also rejects root and arbitrary password paths in PG18.
- --serve: REAL worker runtime. Never execute on BaoTa until separate approval, full isolated UAT and model/tool safety review.
- Missing or unknown mode: fail closed before accessing credentials.

BaoTa PG18 --serve additionally requires a non-root process, exact local target, independent operator approval, and exact systemd CREDENTIALS_DIRECTORY with protected worker.secret, rejecting arbitrary password paths or symlinks. Existing PG17 staging remains separate.

Developer pnpm worker:prepare and worker:model scripts now return offline --plan only. Dedicated :preflight and :serve scripts were added; the latter are not authorized for the live server.

## PREVIEW-ONLY systemd units

- ops/templates/agentstudio-pg18-prepare.service.example
- ops/templates/agentstudio-pg18-model.service.example

These one-shot systemd files execute ONLY --preflight, use DynamicUser/LoadCredential and %d/worker.secret, enforce localhost, and have no [Install] section or restart loop. They are not installed. Their exact intended unit names are part of the credential binding policy.

## Operator acceptance before live execution

1. Upload and validate a new reviewed Native API/Worker bundle; existing v1 server source is preflight-only and lacks these changes.
2. Separately review the trusted HTTPS Native Auth front-end and systemd credential configuration.
3. Test real PostgreSQL 18 worker read-only preflight; confirm non-superuser/role grants and correct database, without starting a job tick.
4. UAT model/tool effects, approvals, scheduling, recovery, idempotency and budgets in an isolated shadow environment, with RLS across two employees.
5. Ensure no old PocketBase task can be replayed in the new PG queue; test rollback and explicitly approve any final switch.

Existing 8090 PocketBase SQLite and web/Nginx backups were verified, but the 8443 certificate/private-key preservation and isolated restore drill remain open. Never change vcaios or stop the old Worker as part of this source-only phase.

Validation: services/pg-api/tests/worker-activation-guard.test.mjs, worker-systemd-preflight-template.test.mjs and worker-role-readonly-preflight.test.mjs. The shared role validator resolves sensitive table OIDs through pg_catalog: textual regclass lookups fail under a noninheriting Worker login without schema USAGE. The embedded PostgreSQL test confirms no private Agent/run instruction access and fails closed on unexpected auth-schema or data privileges. Tests are local and DO NOT prove real BaoTa PostgreSQL Worker connectivity.
