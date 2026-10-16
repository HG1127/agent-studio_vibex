# W27 — structured Workflow history on real PostgreSQL 17

Status: **NO-GO; real PG17 acceptance pending the main thread's CI run.**
Only synthetic, inert archive evidence is in scope. This does not authorize
production import, identity activation, Workflow execution, Operator bypass,
deployment or cutover. PocketBase/SQLite + the dedicated Node Worker remain the
runtime. No BaoTa, company Neon, real company database or production PB is used.

## Owned files and prerequisites

W27 adds only:

- `services/pg-api/tests/pg17-workflow-structured-history.integration.mjs`
- this document.

The standalone test copies W23's accepted PG17 setup/security scaffolding from
`pg17-workflow-history.integration.mjs` and extends it for W26 structured JSON.
It uses the existing, unmodified `prepareWorkflowHistoryImport`,
`importLegacyWorkflowHistoryToStage` and `contentHash`. SQL, importer, other
tests, packages, CI YAML and UI remain outside this change. No Git staging,
commit or push is performed. Existing unrelated workspace edits are untouched.

Read alongside [the archive contract](POSTGRES_V9_WORKFLOW_HISTORY_ARCHIVE.md).
W26's 15/15 PGlite tests are prior evidence, not a W27 real TCP result.

## Main-thread CI contract

Schedule a **separate GitHub-hosted `ubuntu-latest` job**, with Node 24 (local
checks used 24.14.1), existing PG API dependencies installed, and a fresh
`pgvector/pgvector:pg17` Service publishing `5432:5432`. Its initial database
must be `agentstudio_stage`, initialized with superuser `agentstudio_admin`.
Use an ephemeral Service without persistent volumes or production secrets.
Wait for service health before running the script.

The coordinator must provide the same newly generated password to the Service
(`POSTGRES_PASSWORD`) and test (`AGENT_STUDIO_PG17_ADMIN_PASSWORD`). Its exact
format is `synthetic-agentstudio-pg17-ci-<GITHUB_RUN_ID>-<64 lowercase hex>`;
generate the suffix with cryptographic randomness (32 bytes, at least 12
distinct hex characters). Never print it; mask it in CI. Password provisioning
and matrix scheduling belong to the main thread; this change adds no workflow.

All these gates are mandatory before SQLite/importer/PG imports, SQLite file
access, synthetic file creation or any database socket:

| Variable / property | Required value |
| --- | --- |
| Actual process platform | `linux` |
| `GITHUB_ACTIONS` | `true` |
| `RUNNER_ENVIRONMENT` | `github-hosted` |
| `RUNNER_OS` | `Linux` |
| `GITHUB_RUN_ID` | 1–32 decimal digits, no whitespace |
| `RUNNER_TEMP` | Canonical absolute, existing writable real directory |
| `AGENT_STUDIO_PG17_TEST_ENABLED` | `true` (inherited W23 global gate) |
| `AGENT_STUDIO_PG17_W27_STRUCTURED_HISTORY_TEST_ENABLED` | `true` |
| `AGENT_STUDIO_PG17_EPHEMERAL_ISOLATED` | `true` |
| `AGENT_STUDIO_PG17_HOST` | `127.0.0.1` |
| `AGENT_STUDIO_PG17_PORT` | `5432` |
| `AGENT_STUDIO_PG17_DATABASE` | `agentstudio_stage` |
| `AGENT_STUDIO_PG17_ADMIN_USER` | `agentstudio_admin` |
| `AGENT_STUDIO_PG17_ADMIN_PASSWORD` | Synthetic run-bound format above |

`RUNNER_TEMP` must resolve to itself, have no symlink alias, trailing slash,
dot segments, backslash or control characters, and be outside the checkout
(neither its parent nor child). The runner checks are fail-closed configuration
requirements; environment strings alone are not independent infrastructure
attestation. The coordinator must actually supply a disposable hosted runner
and Service. Do not set these flags locally to simulate permission.

From the repository root, the CI acceptance command is:

```sh
node --experimental-strip-types --test services/pg-api/tests/pg17-workflow-structured-history.integration.mjs
```

Use the entire standalone file. Do not use a test-name filter for acceptance:
that could omit the TCP test. Do not run another schema-initializing test on the
same Service, including W23. A rerun requires a fresh Service. The script refuses
an existing `agentstudio` schema, user relations, extra non-system schemas, or
preexisting API/worker/W27 test roles. It checks the real TCP server's version
is 17, database, superuser session/login, server port and non-null server address.
The client and network guard always target `127.0.0.1:5432`; Docker's server-side
address may be the container address. No guard is adapted for PGlite.

## Acceptance assertions

1. Apply `001_stage_schema.sql`, `pg_v8_011_legacy_user_provision.sql` and
   `pg_v9_014_legacy_workflow_history.sql` without SQL guard rewrites. As in W23,
   omit only psql backslash command lines when executing through `pg`. Verify
   the `vector` extension exists. The base schema supplies `pg_v8_005`.
2. Generate all source material under a private `RUNNER_TEMP` subdirectory.
   Synthetic SQLite has exactly `studio_users`, `workflows`, `agent_specs`,
   `workflow_runs` (one run) and `workflow_events` (two events). Graph nodes,
   edges and nested parameters, checkpoint historical outputs and both event
   contents are nonempty nested object/array JSON. Lexical evidence includes
   whitespace, escaped Unicode, Chinese/emoji, negative zero, exponent notation,
   an integer beyond JS precision and a JSON number beyond JS finite range.
   These fields remain strings throughout archival storage.
3. Generate a complete SHA256/byte-size/table-count manifest, reviewed V2
   identity map and synthetic IdP evidence. Both archive and separate structured
   approvals bind the exact snapshot/mapping digests and every whole-row hash,
   reviewer and UTC approval. Synthetic attestations are fixture data only.
   Files are frozen to `0400`, directory `0700`, with hashes/sizes/modes and
   absence of SQLite sidecars checked. Create two disabled users and exact
   same-source `legacy_user_imports` bindings; never activate them.
4. Before archive insertion, refuse missing structured review, wrong source or
   mapping digests, missing/stale row approvals, embedded secret-like decoded
   keys/values, duplicate decoded keys (including escaped aliases), unsupported
   scalar JSON, foreign workflow/spec owners, orphan events and mutated plans.
   Compare the entire stage-table fingerprint to prove rejection left no rows.
   Also reject wrong crosswalk snapshot, mapping and target owner bindings.
5. On the second event INSERT attempt, execute actual PostgreSQL `SELECT 1 / 0`
   on the same connected client and transaction. Require SQLSTATE `22012`, two
   completed INSERTs (run + first event), and both rows visible inside that
   transaction before the fault. Require `BEGIN` → `ROLLBACK`, no `COMMIT`, zero
   archive rows afterward and an unchanged full table fingerprint. Then retry
   through the unwrapped real PG pool and require three imported rows.
6. Read back every raw source field, exact lexical JSON string, independent
   SQLite BLOB-projected UTF-8 bytes, whole-row hash, owner/workflow/run IDs and
   provenance digests. Same-source replay must reconcile all three rows and
   preserve the full fingerprint, including archive UUIDs/timestamps. Different
   snapshot, same snapshot with changed manifest, and same snapshot with changed
   reviewed identity map all fail. Real composite parent/owner FK failures must
   return `23503`.
7. Confirm forced RLS with no policies, denied raw reads/writes for API/worker
   roles, zero visible rows even after temporary accidental SELECT grants for
   owner/other/empty actor contexts, and wrong-login importer refusal. DBA
   UPDATE/DELETE/TRUNCATE must fail with the immutable guard. Assert all runtime
   runs, jobs, run steps, approvals, effects, leases, workflows/specs, schedules,
   knowledge/team/audit rows remain empty; optional model/embedding runtime
   tables remain absent. Both users stay disabled, every archive row stays
   non-executable/model-disabled/historical-unverified, and no runtime Worker is
   started. The installed guard denies external networking and child processes.

Only after all assertions and private fixture cleanup succeed does the test
emit this application success marker:

```text
W27_PG17_STRUCTURED_WORKFLOW_HISTORY_PASS real_tcp=true synthetic_only=true archive_only=true cutover=NO-GO
```

The Node test runner also emits fixed test names/status. The test never prints
source fields, raw history, digests, identities or passwords. Real-test failures
are replaced with a fixed error and synthetic checkpoint code, without causes
or original SQL errors. Fixture cleanup validates the exact owned temp paths;
the ephemeral CI Service is discarded by the coordinator, not reset for reuse.
Do not upload SQLite, manifests, mappings, IdP receipts or PG data as artifacts.

## Local evidence and remaining work

Only the following validation is authorized locally for W27:

```sh
node --check services/pg-api/tests/pg17-workflow-structured-history.integration.mjs
node --experimental-strip-types --test --test-name-pattern='^fail-closed:' services/pg-api/tests/pg17-workflow-structured-history.integration.mjs
```

On 2026-10-16 in the restricted Windows workspace, Node 24.14.1 syntax checking
passed and all **4/4 fail-closed tests passed**. These exercise environment
gates, rejection with forbidden socket/write/import probes, canonical temp
validation with mocks, and offline network/child-process denial. They perform
no SQLite file I/O or PG connection. The TCP test was not selected locally.
An initial local path-gate test caught POSIX normalization preserving trailing
slashes; an explicit rejection was added before the passing rerun.

Root `pnpm check`, E2E, PGlite and real PostgreSQL were not run in W27, following
the explicit local-validation restriction. Main-thread CI must still run the
fresh Service acceptance, verify exit status and the exact success marker, and
review any failure. A local green result does not complete real PG17 acceptance.
Until that evidence exists, W27 real PG17 acceptance is incomplete and
**cutover remains NO-GO**; even a successful synthetic run does not authorize
company-data migration or production deployment.
