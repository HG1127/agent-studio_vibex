# W28 — Legacy schedule occurrence history (staging archive only)

**Production remains NO-GO.** This module is a deliberately inert PostgreSQL 17 archive for `agent_studio_schedule_occurrences`. It does not run schedules or move any old occurrence into live `agentstudio.schedule_occurrences`, `jobs`, `runs` or `external_effects`.

## Implemented files

- `db/postgres/migrations/pg_v9_018_legacy_schedule_occurrence_history.sql`: `agentstudio.legacy_schedule_occurrence_history`, stage-only PG17/DBA guards, immutable archive trigger, `REVOKE ALL` and **FORCE RLS with no ordinary-user policies**.
- `services/pg-api/src/stage-schedule-occurrence-history-import.ts`: offline frozen SQLite parser/plan with bound source SHA256, complete manifest and reviewed identity mapping, followed by a single transactional DBA-only importer.
- `services/pg-api/tests/stage-schedule-occurrence-history-import.test.mjs`: fully synthetic SQLite/PGlite coverage for source integrity, owner/run/schedule references, idempotence, rollback, snapshot conflict, immutability and tenant isolation.

The reviewed library is now accessible through the stage-only `services/pg-api/src/stage-domain-import-cli.ts` using `--domain schedule-occurrences`. The unified `stage-migration-operator.mjs` selects an additional `occurrence_history` phase **after** historical Agent and Workflow runs. The entire source manifest, reviewed owner mapping and independent `schedule_occurrence_archive_review` remain mandatory. There is no live API, scheduler or Worker path. Its CLI's offline and fail-closed acceptance is covered by `services/pg-api/tests/stage-occurrence-domain-cli.test.mjs` and a separate GitHub CI matrix entry. Full real-source cutover/UAT remain unvalidated.

## Source compatibility and review

Source table exact columns (additional, missing, hidden or differently typed columns cause refusal):
`id, schedule_id, rh_user_id, scheduled_for_ms, schedule_revision, run_id, status, attempts, locked_until_ms, next_retry_ms, error, created_ms, updated_ms`.

The operator must provide an independently approved, WAL-consistent *frozen* SQLite backup created through SQLite's backup API, matching complete `agent-studio-sqlite-snapshot-v1` manifest and `studio-approved-identity-map-v2` mapping. The manifest must also include an independent `schedule_occurrence_archive_review`, with:

```json
{
  "source_sha256": "<frozen SQLite SHA256>",
  "identity_mapping_sha256": "<approved identity mapping file SHA256>",
  "credentials_absent": true,
  "verified_by": "<reviewer>",
  "approved_at": "2026-10-16T00:00:00Z",
  "tables": {
    "agent_studio_schedule_occurrences": {
      "row_sha256": ["<contentHash for every exact source row>"]
    }
  }
}
```

All placeholders are illustrative, **not authorizations**. The program never generates approvals for business users, and it does not print legacy IDs, source error fields, passwords or reviewed digests.

Each row must have a valid reviewed employee mapping, a source schedule with exactly the same old owner and a source Agent/Workflow run referenced by `run_id` with the same old owner. Orphan run IDs, unsupported status/field schemas and suspicious credential-like error text are deliberately **blocked**. This conservative constraint may reject some old pending occurrence records whose run has not yet been created; those require a separately reviewed archival contract before import, not disabling the safety check.

## Transaction and isolation

The importer requires `agentstudio_stage`, PostgreSQL 17, `agentstudio_admin`, preexisting `pg_v8_008` and `pg_v8_011` identity/schema migrations, approved source identity crosswalk and zero active jobs, runs, schedules or live schedule occurrences.

It inserts only into an immutable archive and verifies stored `source_record` hashes, owner, run/schedule references and disabled `execution_enabled=false`, `lease_reactivated=false`. A database error rolls the **entire batch** back. Retrying the same exact snapshot is idempotent; another source SHA, different mapping or changed existing row is rejected.

The archive preserves original occurrence status, retry times and historical error strictly as **evidence**. It does not create leases, schedule tasks, invoke any model or replay unknown side effects.

## Outstanding formal readiness

The stage operator now includes the source domain and the CI matrix runs its synthetic plan/permission tests. The existing ephemeral PG17 schema-verification job applies `pg_v9_018`, but a **dedicated real PG17 occurrence-import integration test** and a company-approved frozen-source trial have not yet been completed. Independently verify row-specific reviewer receipts and obtain DBA/security approval. All unsupported runtime scheduling semantics, Workflow execution, integration secrets, RBAC and recovery of real data remain production **NO-GO**. All previously unsupported functionality (scheduling semantics, Workflow execution, integration secrets, RBAC, recoverability of real data) remains production **NO-GO**.
