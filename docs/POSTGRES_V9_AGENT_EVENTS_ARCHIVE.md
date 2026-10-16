# W24 — Legacy Agent run_events evidence archive

Status: isolated archive-only module; production remains **NO-GO**. This change adds exactly the 015 SQL migration, offline importer, synthetic PGlite tests and this document. It does not integrate CI, Operator, the unified importer, HTTP routes, frontend, Worker or package scripts. A nonempty `run_events` table is supported by this module; the existing unified importer still requires a separately reviewed integration before it can accept that table.

## Evidence contract

Use one offline frozen SQLite copy, opened read-only; never use a live PocketBase data directory. The importer checks no WAL/SHM/journal exists, SQLite quick_check, exact complete table inventory and counts, file byte length and SHA-256, and rehashes the snapshot, manifest and mapping after preparation. No network connection is created by this library. Only synthetic local files and in-memory PGlite are used in tests.

`run_events` must have exactly these eight ordinary columns: `id, run_id, step_index, seq, event_type, content, created, updated`. Missing, additional and hidden/generated columns fail closed using table_xinfo. TEXT is required except integer-valued NUMERIC/INTEGER/REAL indices and JSON/TEXT content. Indices must be nonnegative safe integers. IDs are 15 ASCII alphanumeric characters. UTF-8 bytes are checked independently against SQLite BLOB hex so NUL truncation and replacement cannot pass as a lossless read.

`content` accepts SQL NULL or original JSON text containing only `{}`, `[]` or `null`, with JSON whitespace (space, tab, CR, LF). Lexical whitespace stays in the string inside `source_record`; SQL NULL and the string `null` remain distinct. Nonempty objects/arrays, model replies, tool calls, scalar JSON, duplicate keys, non-JSON whitespace and opaque data are rejected, even if a reviewer approves them. Nothing is redacted, deleted, skipped or executed. All other event text remains raw audited evidence; the secret-pattern check is an additional rejection rule, never proof of absence.

The existing W8 `prepareHistoryImport` validates every `agent_runs` record and its source owner/spec, including its external `history_archive_review` row digests. W24 additionally checks parent hidden/generated columns and text-byte fidelity. Both preparations must produce the same snapshot, mapping and manifest hashes. Source users receive a complete, one-to-one `studio-approved-identity-map-v2` reviewed mapping. Only source user IDs are read from `studio_users`; credentials are never selected or archived.

The complete manifest uses `format: agent-studio-sqlite-snapshot-v1`, `sha256`, `bytes`, `tables` and the W8 review plus this additional review (placeholders below are descriptive, not real hashes):

```json
{
  "agent_run_events_archive_review": {
    "source_sha256": "<snapshot file SHA-256>",
    "identity_mapping_sha256": "<mapping file SHA-256>",
    "credentials_absent": true,
    "verified_by": "<external reviewer>",
    "approved_at": "2026-10-15T00:00:00Z",
    "tables": {
      "run_events": { "row_sha256": ["<contentHash of each complete raw event row>"] }
    }
  }
}
```

The reviewer must inspect every row externally and affirm `credentials_absent`; hashes must cover every row exactly once. Digests use the existing canonical `contentHash` function (SHA-256 of canonical key-sorted JSON), not ordinary JSON.stringify order. The mapping file and full final manifest are hashed as actual file bytes. Finalize both review blocks before importing W8 parents: changing the manifest to add W24 afterward intentionally makes the parent binding fail. These signatures are review attestations and SHA integrity bindings, not cryptographic signatures or authentication of a reviewer's identity.

## Database boundary and reconciliation

Apply 015 only after W8 012 and reviewed identity provisioning 011 in the isolated stage. Both SQL and import guard require PostgreSQL 17, database `agentstudio_stage`, session login `agentstudio_admin`, and superuser. Do not point it at BaoTa, production PocketBase or company Neon. The caller supplies an already approved dedicated SqlPool; there is no CLI or connector here.

015 creates `agentstudio.legacy_agent_run_events` and a DBA-only unique parent index on `legacy_run_history`. Its composite FK includes source snapshot SHA, identity mapping SHA, manifest SHA, owner UUID, fixed parent source table `agent_runs`, and legacy parent ID. This prevents a valid child from referencing another owner, snapshot, review or missing parent even through direct SQL. Source field keys, child ID/run ID, inert flags and restricted content have database constraints. All three review hash columns and payload hash require lowercase SHA-256 syntax; importer reconciliation checks actual values and recalculated raw payload hashes, not placeholders.

Each event derives its owner from its `run_id` in the same source's validated agent_runs. Before insertion the existing PG W8 parent must match all three review hashes, legacy ID, owner, actual source payload digest, unverified evidence status and `executable=false`. Both active and disabled target users require the exact reviewed legacy_user_imports crosswalk, mapping SHA and snapshot SHA; there is no implicit active-user exception.

The table has ENABLE + FORCE RLS, no policies, and no PUBLIC/API/Worker privileges. Accidental SELECT grants still expose zero rows to runtime roles. Update, delete and truncate triggers reject mutations even for the importer. DBA superusers remain inherently privileged and must not disable the controls. Raw content is never returned through a product route or log. No encryption capability is added: source/review files and database/backup encryption, key custody, retention, reviewer access and evidence transport require separate security/DBA review before handling real data. RLS and SHA do not encrypt evidence.

Imports take exclusive locks, require drained jobs/active runs/enabled schedules, and validate identity provisioning. A full batch is one transaction. Identical replay preserves archive IDs; other snapshot/mapping/manifest batches and conflicting owner/payload readback fail closed. Failed INSERT, readback or count reconciliation rolls back all child writes. W8 parents remain preexisting evidence and are never modified. In-memory issued plans are SHA-bound; forged or mutated plans are rejected. Exceptions expose fixed codes only, with no raw SQL details, paths, owner identifiers, source text or secrets.

Historical parent `status=running` remains a raw historical string. `executable=false`, `model_execution_enabled=false`, `historical_unverified`, zero created jobs/side effects and `production_cutover_allowed=false` apply to every import. No real runs, approvals, leases, tool invocations or schedules are created.

## Local verification and remaining gates

Run directly without editing package scripts:

```powershell
node --experimental-strip-types --test services/pg-api/tests/stage-agent-run-events-import.test.mjs
node services/pg-api/node_modules/typescript/bin/tsc -p services/pg-api/tsconfig.json --noEmit
```

If the OS temp directory is unavailable, set TEMP, TMP and TMPDIR to the existing writable project `.tmp` directory for the command. Tests create dedicated synthetic subdirectories and remove only those directories.

PGlite tests adapt only database/session/version guards in their fixture, including the W8/011 SQL setup; importer guard responses are explicitly simulated. All archive SQL, composite FKs, checks, forced RLS, immutability, division-by-zero SQL failure, transaction rollback and retry execute in PGlite. This is not real TCP PG17 proof. Coverage includes one parent/event, exact raw content/hash/owner readback, all empty content forms, orphan and missing/foreign PG parents, mapping/manifest/source review failures, schema drift/generated fields, active/disabled identity rejection, inert queues, SQL failure after a first child insertion, readback corruption and safe retry.

Real PG17 verification, full CI/Operator/unified-source integration, schema/encryption review, real employee UAT, backups and restore verification, networking/access controls and long-running Worker validation remain future gates. Do not claim production GO or migrate real company data from these local results.

Validation on 2026-10-15: W24 9/9 tests passed; combined W24/W8/W22 local PGlite regression 22/22 passed; PG API TypeScript `--noEmit` passed. `pnpm check` could not start because Corepack has no cached pnpm and registry access is unavailable. PocketBase E2E was not run under the requested local-PGlite-only scope. No real PG17 connection, deployment, commit or push was performed.
