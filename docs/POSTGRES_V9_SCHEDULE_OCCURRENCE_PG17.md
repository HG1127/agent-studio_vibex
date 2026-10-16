# W29 — Legacy schedule occurrences via the unified stage operator

**Scope:** `agent_studio_vibex版本`, independent PostgreSQL 17 **synthetic/staging only**. Production cutover remains **NO-GO**.

This change removes an execution gap for a reviewed legacy `agent_studio_schedule_occurrences` source table. The source data were previously only supported through the standalone W28 archive library, so a nonempty table would stop unified stage preflight as `unmapped_nonempty_tables`.

Now `stage-migration-operator.mjs` explicitly recognizes this source table. When nonempty, it schedules `occurrence_history` **after** all source Agent and Workflow historical run phases; the phase calls `stage-domain-import-cli.ts --domain schedule-occurrences`.

The importer enforces the existing W28 contract, not a new loose parser: a fully SHA-256-verified frozen SQLite snapshot, exhaustive actual source table manifest, separately reviewed one-to-one employee UUID mapping, and `schedule_occurrence_archive_review` in the manifest including row-content SHA-256. The source row must refer to one real source schedule **and** one source Agent/Workflow run with the same old employee owner; unknown run IDs or tenant conflicts reject the batch. The reviewer receipts are distinct from the manifest's source hash.

During `--plan`, neither the CLI nor the operator connects to PostgreSQL. During explicit authorized `--execute`, it uses only fixed `agentstudio_stage`, role `agentstudio_admin`, an external secret file and W28's single transaction. Existing historical owners must be reviewed and provisioned, and old schedule/Agent run configuration must be imported first. Any failed domain returns a nonzero status; the disposable stage may require rollback and must never be promoted.

The immutable W28 archive records source status, retries, last error and former lease timestamps as **evidence only**. It never writes or replays anything into live `agentstudio.jobs`, `agentstudio.runs`, `agentstudio.schedule_occurrences`, `agentstudio.external_effects` or legacy leases. Employee identity stays disabled until separately authorized.

## Evidence and limitations

- `services/pg-api/tests/stage-occurrence-domain-cli.test.mjs` exercises good source and reviewed synthetic row data, stage login fail-closed, missing row review rejection, no leakage, and the actual unified operator's new dispatch.
- Existing `services/pg-api/tests/stage-schedule-occurrence-history-import.test.mjs` validates PostgreSQL SQL transactions using synthetic PGlite and the W28 archive's idempotency, rollback, immutability and RLS.
- Independent `pg17-occurrence-history-isolated` in `.github/workflows/agent-studio-quality.yml` exercises real PostgreSQL 17 on a **fresh synthetic service**. On success it must print exactly `W29_PG17_OCCURRENCE_ARCHIVE_PASS real_tcp=true source_sha_verified=true zero_live_jobs=true synthetic_only=true cutover=NO-GO`.

No real company PocketBase snapshot has been made available or migrated. Still blocking production: reviewed real-source audit receipts, zero-diff reconciliations, system Worker handoff, scheduled task business semantics, Workflow/RAG/ACL parity, IdP account activation review, backup-and-restore rehearsal against approved actual data, and DBA/security/UAT sign-off. A historical archive is **not** a functional scheduler.
