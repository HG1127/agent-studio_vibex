# W22 — legacy Workflow history quarantine

Production remains **NO-GO**. This is an independent offline archive library and
an isolated PG17 schema migration. It is not wired to CI, package scripts, W9,
Stage Operator, API, UI, Worker, BaoTa, production PocketBase or company Neon.
The existing Operator still blocks nonempty uncovered Workflow history tables;
this change alone does not authorize or implement an Operator bypass/cutover.
No commit or push is part of W22.

## Evidence contract

`prepareWorkflowHistoryImport(snapshotPath, manifestPath, mappingPath)` reads a
standalone complete offline SQLite backup with `DatabaseSync(...,{readOnly:true})`.
It refuses the repository's live `pocketbase/pb_data` (including resolved links),
duplicate paths, WAL/SHM/journal sidecars, failed integrity checks, changed input
hashes, and incomplete table inventories/counts. No live SQLite backup is made
by this module. A DBA must supply a frozen backup, not a live database at another
path. File SHA/size and the reviewed files are rechecked before issuing a plan.
Filesystem immutability/ACLs during this process remain a DBA responsibility.

Use the existing `agent-studio-sqlite-snapshot-v1` manifest with SHA256, bytes and
counts for **all non-`sqlite_` physical tables**, including PocketBase internal
tables. Required tables are `studio_users`, `workflows`, `agent_specs`,
`workflow_runs`, `workflow_events`. Other tables are counted, not archived.
Only identity/reference columns are read from users/workflows/specs; credentials,
graphs and model configurations from those tables are never selected.

The `studio-approved-identity-map-v2` file must bind `source_sha256` to this exact
SQLite file. Every source studio user requires a unique `old_id` (15 ASCII
alphanumerics), a unique UUID `new_studio_user_id`, `verified_by` (2–120 trimmed
nonblank characters) and a valid UTC `approved_at`. No identity is guessed from
an email, name, browser header, or source `rh_user_id` alone.

The manifest must additionally carry this approval structure (placeholders below
must be replaced with independently reviewed real digests, never fabricated):

```json
{
  "workflow_history_archive_review": {
    "source_sha256": "<SHA256 of the complete frozen SQLite file>",
    "identity_mapping_sha256": "<SHA256 of the exact approved v2 mapping file>",
    "credentials_absent": true,
    "verified_by": "<accountable reviewer>",
    "approved_at": "2026-10-15T00:00:00Z",
    "tables": {
      "workflow_runs": {"row_sha256": ["<each exact source row hash>"]},
      "workflow_events": {"row_sha256": ["<each exact source row hash>"]}
    }
  }
}
```

Each hash is the existing `contentHash(rawRow)` canonical JSON SHA256, before
parsing or transforming any field. These are row **content** hashes, not hashes
of an arbitrary JSON serialization or SQLite pages. Every row in both tables
requires exactly one matching hash; missing, duplicate or extra receipts block
the entire batch. Review means checking the complete text and absence of secrets,
not just setting a Boolean. Locally supplied review metadata is an attestation,
not a cryptographic signature or independent identity authentication. Protect
and independently approve these files before use. The library does not generate
approvals. Raw records and digests must not be printed or checked into Git.

## Strict supported source slice

Exact columns, no additions, omissions or generated/hidden columns:

| Table | Columns |
| --- | --- |
| workflow_runs | id, rh_user_id, workflow_id, workflow_name, instruction, status, graph_snapshot, checkpoint, result, error, done_nodes, total_nodes, created, updated |
| workflow_events | id, run_id, node_id, seq, event_type, content, created, updated |

Text columns require SQLite declared TEXT; JSON columns allow TEXT or JSON;
counters allow NUMERIC, INTEGER or REAL declarations and nonnegative safe integer
values. Text must roundtrip from SQLite UTF-8 bytes exactly, contain no NUL and
be at most 2,000,000 JS code units per field. ID/reference fields require exact
legacy IDs. Timestamps, status and free text stay as original text; no timestamps,
status, whitespace, node names or results are rewritten. The original SQLite
file SHA additionally binds the physical source representation.

`graph_snapshot`, `checkpoint`, and event `content` support only SQL NULL or JSON
text spelling `null`, empty object or empty array with arbitrary surrounding
whitespace. Their original text is preserved, including whitespace. All scalar
or nonempty structured JSON is rejected, even if reviewed. Complex graph state,
model connections, nested outputs, duplicate keys or embedded secrets cannot be
safely validated by this narrow implementation. Do not replace them with empty
values, redact them or omit rows to pass. Stop and obtain a separately designed,
reviewed extension. A credential-pattern check is an additional rejection layer;
it cannot prove arbitrary text secret-free. No API key/token exception is allowed
in this slice, even if requested in review metadata.

Runs must reference exactly one original workflow with matching `rh_user_id`.
A workflow's nonempty `spec_id` must reference exactly one original Agent spec
with the same owner. Empty `spec_id` means an independent workflow. Events have
no owner column: each `run_id` must exist in this same snapshot's run batch, and
inherits that run's mapped owner and workflow. Orphans and foreign owners abort.
Both tables may be empty; up to 5,000 rows each / 10,000 total are supported.

## PG boundary and transaction

Apply `db/postgres/migrations/pg_v9_014_legacy_workflow_history.sql` only to an
authorized isolated `agentstudio_stage`, PG17, as superuser `agentstudio_admin`.
The migration is transactional and replayable. It creates only
`agentstudio.legacy_workflow_history`, its immutable guard and schema version.
The base stage schema and reviewed `pg_v8_011` identity crosswalk are prerequisites
for import. W22 does not provision or activate users.

Call `importLegacyWorkflowHistoryToStage(pool, plan)` with the exact in-process
plan issued by the reader. Forged, serialized/reconstituted or mutated plans are
rejected. The importer clones the plan before its first await. It repeats the
stage database/login/superuser/version guard, locks archive/identity/runtime
tables, and requires zero jobs, no active runtime runs and no enabled schedules.
Every owner, active or disabled, must match the same-snapshot `legacy_user_imports`
old ID, target UUID, exact mapping SHA, reviewed IdP digest and
`active_automatically=false`. Neither user status nor workflow execution is changed.

One transaction inserts runs before events, verifies every field/hash on readback
and checks total archive cardinality before COMMIT. Any insert, readback, owner,
count or reconciliation failure causes ROLLBACK; errors expose codes only.
Same-source replay preserves archive UUIDs and compares full source JSON plus
provenance. Different SQLite, mapping or manifest SHA is rejected for the whole
archive, even when row IDs/text happen to match. SQL additionally enforces event
parent snapshot/mapping/owner/workflow via a composite self foreign key.

Raw rows are DBA-only, have forced RLS without policies, and revoke all API,
worker and PUBLIC privileges. An accidental SELECT grant still yields zero rows
for ordinary API/worker roles. UPDATE/DELETE/TRUNCATE always raise an immutable
guard error, including for DBA sessions; privileged schema owners/superusers can
still alter schema or disable guards, so this is not protection against a malicious
DBA. Each record fixes `executable=false`, `model_execution_enabled=false` and
`evidence_status='historical_unverified'`. Historical `running` does not become a
runtime run, verified success, queue job, replay request or external-effect ledger.

## Local validation

From `services/pg-api`, run:

```powershell
node --experimental-strip-types --test tests/stage-workflow-history-import.test.mjs
pnpm check
```

The tests use only synthetic SQLite and in-memory PGlite, adapt only the test
database/login/PG17 guards, and first assert the unadapted migration refuses the
test database. They do not validate a real PG17 TCP deployment or real employee
data. Coverage includes one run/one event, historical running, text/JSON string
fidelity, same-source replay, different provenance rejection, orphan and foreign
references, missing reviews/identities, complex JSON/secret rejection, event
insert failure rollback, corrupted readback/count rollback, zero runtime state,
immutable rows and forced RLS after accidental SELECT grants.

Also run repository `pnpm check` and `pnpm test:e2e:parallel` per AGENTS.md. If the
default Windows temp is unavailable, set TEMP/TMP/TMPDIR to a dedicated writable
project-drive directory. Do not remove unrelated files. Results and any environment
limitations must accompany review; synthetic tests never authorize production.

Validation in the 2026-10-15 restricted Windows workspace: the 140 repository
unit tests passed via direct Node dispatch of the unchanged package test script;
root TypeScript build, Vite build and production bundle isolation checks passed.
W22's seven PGlite/synthetic SQLite tests and PG API TypeScript check passed,
including the composite owner foreign key and SQLite embedded-NUL rejection.
The standard pnpm launcher could not fetch its required uncached 10.28.1 version.
The direct parallel E2E runner was attempted but stopped before any test because
its sibling `D:\Downloads\agentstudio-ci-*` temp directory is outside the writable
sandbox (EPERM). Accordingly the full canonical `pnpm check` / parallel E2E run
is **not claimed complete**. No real PG17 W22 run or production import was made.
